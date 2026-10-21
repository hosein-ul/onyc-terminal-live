import { asc, eq, gt, schema, type Database } from "@onyc/db";
import type { Logger } from "pino";
import { formatAlert } from "./format.js";
import { matches, type EventRow, type RuleRow } from "./rules.js";

export interface Sender {
  /** Null when no Telegram token is configured; those deliveries are recorded as skipped. */
  telegram: ((chatId: string, text: string) => Promise<void>) | null;
  webhook: (url: string, payload: unknown) => Promise<void>;
}

export interface DeliverResult {
  sent: number;
  failed: number;
  skipped: number;
}

/** Newer events than this are considered; the delivery table makes each (rule, event) pair fire at most once. */
const LOOKBACK_MS = 24 * 3_600_000;
const MAX_EVENTS = 500;

const shortError = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).slice(0, 300);

/**
 * Send every event that a rule matches and that has not been sent to that rule yet. A rule only sees events from after it was
 * created, so a new subscriber does not receive yesterday's history. The (rule, event) row is written before sending and
 * has a unique index, so two bot processes or a restart cannot send the same alert twice.
 */
export async function deliverPending(
  db: Database,
  sender: Sender,
  options: { now: Date; log: Logger; webUrl?: string | undefined },
): Promise<DeliverResult> {
  const result: DeliverResult = { sent: 0, failed: 0, skipped: 0 };
  const rules: RuleRow[] = await db
    .select()
    .from(schema.alertRules)
    .where(eq(schema.alertRules.enabled, true));
  if (rules.length === 0) return result;
  const since = new Date(options.now.getTime() - LOOKBACK_MS);
  const events: EventRow[] = await db
    .select()
    .from(schema.events)
    .where(gt(schema.events.ts, since))
    .orderBy(asc(schema.events.id))
    .limit(MAX_EVENTS);

  for (const event of events) {
    for (const rule of rules) {
      if (event.ts < rule.createdAt || !matches(rule, event)) continue;
      const claimed = await db
        .insert(schema.alertDeliveries)
        .values({ ruleId: rule.id, eventId: event.id, status: "pending" })
        .onConflictDoNothing()
        .returning({ id: schema.alertDeliveries.id });
      const deliveryId = claimed[0]?.id;
      if (deliveryId === undefined) continue; // already handled

      let status = "sent";
      let error: string | null = null;
      try {
        if (rule.channel === "telegram") {
          if (sender.telegram === null) {
            status = "skipped";
            error = "Telegram is not configured";
          } else {
            await sender.telegram(rule.target, formatAlert(event, options.webUrl));
          }
        } else if (rule.channel === "webhook") {
          await sender.webhook(rule.target, {
            event: {
              id: event.id,
              ts: event.ts.toISOString(),
              kind: event.kind,
              severity: event.severity,
              title: event.title,
              body: event.body,
              data: event.data,
            },
            rule: { id: rule.id, kind: rule.kind, params: rule.params },
          });
        } else {
          status = "skipped";
          error = `Unknown channel ${rule.channel}`;
        }
      } catch (e) {
        status = "failed";
        error = shortError(e);
        options.log.warn({ ruleId: rule.id, eventId: event.id, error }, "alert delivery failed");
      }
      await db
        .update(schema.alertDeliveries)
        .set({ status, error })
        .where(eq(schema.alertDeliveries.id, deliveryId));
      if (status === "sent") result.sent += 1;
      else if (status === "failed") result.failed += 1;
      else result.skipped += 1;
    }
  }
  return result;
}
