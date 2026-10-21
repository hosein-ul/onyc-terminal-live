import { schema } from "@onyc/db";
import type { Ctx } from "./context.js";

export type Severity = "info" | "watch" | "alert";

export interface NewEvent {
  kind: string;
  severity: Severity;
  title: string;
  body?: string;
  data?: unknown;
  /** Same key, same fact: emitted once. */
  dedupKey: string;
  /** Defaults to now. Historical facts (for example an old price vector) carry their own time. */
  ts?: Date;
}

/** Insert an event unless its dedup key exists. Returns true when a new row was written. */
export async function emitEvent(ctx: Ctx, event: NewEvent): Promise<boolean> {
  const rows = await ctx.handle.db
    .insert(schema.events)
    .values({
      ts: event.ts ?? ctx.now(),
      kind: event.kind,
      severity: event.severity,
      title: event.title,
      body: event.body ?? "",
      data: event.data ?? null,
      dedupKey: event.dedupKey,
    })
    .onConflictDoNothing({ target: schema.events.dedupKey })
    .returning({ id: schema.events.id });
  if (rows.length > 0) {
    ctx.log.info({ kind: event.kind, title: event.title }, "event");
  }
  return rows.length > 0;
}
