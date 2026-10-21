import { and, desc, schema, sql } from "@onyc/db";
import { formatBps, formatRelativeAge } from "@onyc/format";
import type { Job } from "../context.js";
import { emitEvent } from "../events.js";

/** A live tick older than this is not used for peg alerts. */
const FRESH_TICK_MS = 10 * 60_000;

/**
 * Every 60 s: evaluate the built-in alert conditions and write `events`. Per-user rules and delivery are the
 * Phase 6 bot's job; this only records that a condition is true, at most once per hour per condition.
 */
export const evaluatorJob: Job = {
  name: "alert-evaluator",
  schedule: "30 * * * * *",
  startDelayMs: 45_000,
  async run(ctx) {
    const { db } = ctx.handle;
    const now = ctx.now();
    const hour = now.toISOString().slice(0, 13);

    const ticks = schema.liveTicks;
    const tick = (await db.select().from(ticks).orderBy(desc(ticks.ts)).limit(1))[0];
    if (
      tick !== undefined &&
      tick.premiumBps !== null &&
      now.getTime() - tick.ts.getTime() <= FRESH_TICK_MS
    ) {
      const threshold = ctx.config.DISCOUNT_ALERT_BPS;
      if (tick.premiumBps <= -threshold) {
        await emitEvent(ctx, {
          kind: "discount_breach",
          severity: "alert",
          title: `ONyc trades at a ${formatBps(tick.premiumBps)} discount to NAV`,
          body: `Market ${tick.marketPrice} vs NAV ${tick.nav}. Threshold ${threshold} bps.`,
          data: {
            premiumBps: tick.premiumBps,
            marketPrice: tick.marketPrice,
            nav: tick.nav,
            threshold,
          },
          dedupKey: `discount_breach:${hour}`,
        });
      } else if (tick.premiumBps >= threshold) {
        await emitEvent(ctx, {
          kind: "premium_breach",
          severity: "watch",
          title: `ONyc trades at a ${formatBps(tick.premiumBps)} premium to NAV`,
          body: `Market ${tick.marketPrice} vs NAV ${tick.nav}. Threshold ${threshold} bps.`,
          data: {
            premiumBps: tick.premiumBps,
            marketPrice: tick.marketPrice,
            nav: tick.nav,
            threshold,
          },
          dedupKey: `premium_breach:${hour}`,
        });
      }
    }

    const solvency = schema.solvencySnap;
    const latest = (await db.select().from(solvency).orderBy(desc(solvency.ts)).limit(1))[0];
    if (latest !== undefined) {
      const ageHours = (now.getTime() - latest.retrievedAt.getTime()) / 3_600_000;
      if (ageHours > ctx.config.SOLVENCY_STALE_HOURS) {
        await emitEvent(ctx, {
          kind: "solvency_stale",
          severity: "watch",
          title: `Proof of solvency is stale: retrieved ${formatRelativeAge(latest.retrievedAt, now)}`,
          body: `Accountable's last retrieval was ${latest.retrievedAt.toISOString()}. Threshold ${ctx.config.SOLVENCY_STALE_HOURS} h.`,
          data: { retrievedAt: latest.retrievedAt, ageHours },
          dedupKey: `solvency_stale:${latest.retrievedAt.toISOString()}`,
        });
      }
    }
  },
};

/** Daily 03:00 UTC: drop short-lived raw data. Sheets and solvency snapshots are kept for good. */
export const retentionJob: Job = {
  name: "retention",
  schedule: "0 0 3 * * *",
  runOnStart: false,
  async run(ctx) {
    const { db } = ctx.handle;
    const cutoff = new Date(ctx.now().getTime() - 30 * 86_400_000);
    const raw = schema.rawSnapshots;
    const deletedRaw = await db
      .delete(raw)
      .where(
        and(
          sql`${raw.source} not in ('onre-sheets', 'accountable')`,
          sql`${raw.lastSeenAt} < ${cutoff}`,
        ),
      )
      .returning({ id: raw.id });
    const top = schema.leaderboardTopSnap;
    const deletedTop = await db
      .delete(top)
      .where(sql`${top.ts} < ${cutoff}`)
      .returning({ ts: top.ts });
    ctx.log.info(
      { rawSnapshots: deletedRaw.length, leaderboardTop: deletedTop.length },
      "retention done",
    );
  },
};
