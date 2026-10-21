import { eq, schema, sql } from "@onyc/db";
import { SOURCE, onreRewards } from "@onyc/sources";
import type { Ctx, Job } from "../context.js";
import { track } from "../health.js";
import { chunked, floorToMinute, saveRaw, utcDate } from "../snapshots.js";
import { addToTotals } from "../venues.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Every 6 hours: daily AUM per protocol since 2025-06-04 (about 2,900 rows). */
export const rewardsAumJob: Job = {
  name: "rewards-aum",
  schedule: "0 10 */6 * * *",
  startDelayMs: 5_000,
  async run(ctx) {
    const result = await track(ctx, SOURCE.rewards, "GET /analytics/aum/growth", () =>
      onreRewards.aumGrowth(ctx.fetchOptions),
    );
    if (result === null) return;
    const saved = await saveRaw(ctx, SOURCE.rewards, "GET /analytics/aum/growth", result, "json");
    if (!saved.changed) return;
    const rows = result.data.series.map((row) => ({
      date: row.date,
      protocol: row.protocol,
      aumUsd: row.aumUsd,
      deltaUsd: row.deltaUsd,
      deltaPct: row.deltaPct,
    }));
    await chunked(rows, 1000, (chunk) =>
      ctx.handle.db
        .insert(schema.protocolAumDaily)
        .values(chunk)
        .onConflictDoUpdate({
          target: [schema.protocolAumDaily.date, schema.protocolAumDaily.protocol],
          set: {
            aumUsd: sql`excluded.aum_usd`,
            deltaUsd: sql`excluded.delta_usd`,
            deltaPct: sql`excluded.delta_pct`,
          },
        }),
    );
  },
};

/** Hourly: capital distribution and the reconciliation of circulating supply. */
export const rewardsCapitalJob: Job = {
  name: "rewards-capital",
  schedule: "0 12 * * * *",
  startDelayMs: 10_000,
  async run(ctx) {
    const { db } = ctx.handle;
    const distribution = await track(
      ctx,
      SOURCE.rewards,
      "GET /analytics/capital/distribution",
      () => onreRewards.capitalDistribution(ctx.fetchOptions),
    );
    if (distribution !== null) {
      await saveRaw(
        ctx,
        SOURCE.rewards,
        "GET /analytics/capital/distribution",
        distribution,
        "json",
      );
      const d = distribution.data;
      const rows = d.distribution.map((row) => ({
        asOfDate: row.snapshotDate,
        protocol: row.protocol,
        capitalUsd: row.capitalUsd,
        share: row.sharePct,
        totalAumUsd: d.totalAumUsd,
        fetchedAt: distribution.fetchedAt,
      }));
      await chunked(rows, 100, (chunk) =>
        db
          .insert(schema.capitalDistributionSnap)
          .values(chunk)
          .onConflictDoUpdate({
            target: [
              schema.capitalDistributionSnap.asOfDate,
              schema.capitalDistributionSnap.protocol,
            ],
            set: {
              capitalUsd: sql`excluded.capital_usd`,
              share: sql`excluded.share`,
              totalAumUsd: sql`excluded.total_aum_usd`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          }),
      );
    }

    const recon = await track(ctx, SOURCE.rewards, "GET /analytics/capital/reconciliation", () =>
      onreRewards.capitalReconciliation(ctx.fetchOptions),
    );
    if (recon !== null) {
      await saveRaw(ctx, SOURCE.rewards, "GET /analytics/capital/reconciliation", recon, "json");
      const r = recon.data;
      const values = {
        asOfDate: r.asOfDate,
        navUsd: r.navUsd,
        // The Raw fields are ONyc x 1e9 and above 2^53, so the figure is approximate.
        circulatingOnyc: r.circulatingOnycRaw / 1e9,
        circulatingUsd: r.circulatingOnycUsd,
        knownCustodyUsd: r.knownCustodyUsd,
        adjustedWalletUsd: r.adjustedWalletUsd,
        attributedProtocolUsd: r.attributedProtocolUsd,
        unexplainedUsd: r.unexplainedOnycUsd,
        entries: r.entries,
        fetchedAt: recon.fetchedAt,
      };
      await db
        .insert(schema.reconciliationSnap)
        .values(values)
        .onConflictDoUpdate({ target: schema.reconciliationSnap.asOfDate, set: values });
    }
  },
};

/** Every 6 hours: the 31-day points series, merged into a growing daily history. */
export const rewardsPointsJob: Job = {
  name: "rewards-points",
  schedule: "0 15 */6 * * *",
  startDelayMs: 15_000,
  async run(ctx) {
    const result = await track(ctx, SOURCE.rewards, "GET /analytics/points/growth", () =>
      onreRewards.pointsGrowth(ctx.fetchOptions),
    );
    if (result === null) return;
    await saveRaw(ctx, SOURCE.rewards, "GET /analytics/points/growth", result, "json");
    const rows = result.data.series.map((row) => ({
      date: row.date,
      base: row.basePointsIssued,
      referral: row.referralBonusIssued,
      total: row.totalPointsIssued,
      dailyBase: row.dailyBaseGrowth,
      dailyReferral: row.dailyReferralGrowth,
      dailyTotal: row.dailyTotalGrowth,
    }));
    await chunked(rows, 100, (chunk) =>
      ctx.handle.db
        .insert(schema.pointsGrowthDaily)
        .values(chunk)
        .onConflictDoUpdate({
          target: schema.pointsGrowthDaily.date,
          set: {
            base: sql`excluded.base`,
            referral: sql`excluded.referral`,
            total: sql`excluded.total`,
            dailyBase: sql`excluded.daily_base`,
            dailyReferral: sql`excluded.daily_referral`,
            dailyTotal: sql`excluded.daily_total`,
          },
        }),
    );
  },
};

export interface CrawlOutcome {
  status: "complete" | "failed" | "skipped";
  pages: number;
  wallets: number;
  totalElements: number | null;
}

/**
 * The daily full crawl. Sequential (one request in flight), with a pause between pages that doubles when
 * the API is slow. Safe to re-run: rows are upserted by (date, address), and a day that already
 * completed is skipped unless `force`.
 */
export async function crawlLeaderboard(ctx: Ctx, force = false): Promise<CrawlOutcome> {
  const { db } = ctx.handle;
  const { config } = ctx;
  const date = utcDate(ctx.now());
  const crawls = schema.leaderboardCrawls;

  const existing = (await db.select().from(crawls).where(eq(crawls.date, date)).limit(1))[0];
  if (existing?.status === "complete" && !force) {
    ctx.log.info({ date }, "leaderboard crawl already complete for today");
    return {
      status: "skipped",
      pages: 0,
      wallets: existing.walletsStored,
      totalElements: existing.totalElements,
    };
  }

  const size = config.LEADERBOARD_PAGE_SIZE;
  await db
    .insert(crawls)
    .values({ date, startedAt: ctx.now(), status: "running", pageSize: size })
    .onConflictDoUpdate({
      target: crawls.date,
      set: {
        startedAt: ctx.now(),
        finishedAt: null,
        status: "running",
        pageSize: size,
        error: null,
      },
    });

  const totals = new Map<string, number>();
  let delay = config.LEADERBOARD_PAGE_DELAY_MS;
  let page = 0;
  let totalPages = 1;
  let totalElements: number | null = null;
  let stored = 0;

  while (page < totalPages) {
    const current = page;
    const result = await track(ctx, SOURCE.rewards, "GET /points/leaderboard", () =>
      onreRewards.leaderboard(current, size, ctx.fetchOptions),
    );
    if (result === null) {
      await db
        .update(crawls)
        .set({
          status: "failed",
          finishedAt: ctx.now(),
          walletsStored: stored,
          error: `page ${current} failed`,
        })
        .where(eq(crawls.date, date));
      return { status: "failed", pages: page, wallets: stored, totalElements };
    }

    const board = result.data.leaderboard;
    totalPages = board.totalPages;
    totalElements = board.totalElements;

    const rows = board.content.map((entry) => ({
      date,
      address: entry.address,
      rank: entry.rank,
      totalPoints: entry.totalPoints,
      rankChange: entry.rankChange === null ? null : Math.trunc(entry.rankChange),
      globalMultiplier:
        entry.activeMultipliers?.find(
          (m) => m.sourceType === "GLOBAL" && m.effectiveToDate === null,
        )?.multiplier ?? null,
      breakdown: entry.rank <= config.LEADERBOARD_BREAKDOWN_TOP ? entry.pointsBreakdown : null,
    }));
    for (const entry of board.content) addToTotals(totals, entry.pointsBreakdown);

    await chunked(rows, 500, (chunk) =>
      db
        .insert(schema.leaderboardSnap)
        .values(chunk)
        .onConflictDoUpdate({
          target: [schema.leaderboardSnap.date, schema.leaderboardSnap.address],
          set: {
            rank: sql`excluded.rank`,
            totalPoints: sql`excluded.total_points`,
            rankChange: sql`excluded.rank_change`,
            globalMultiplier: sql`excluded.global_multiplier`,
            breakdown: sql`excluded.breakdown`,
          },
        }),
    );
    stored += rows.length;

    delay =
      result.latencyMs > 8_000
        ? Math.min(delay * 2, 10_000)
        : Math.max(config.LEADERBOARD_PAGE_DELAY_MS, Math.floor(delay / 2));
    page += 1;
    if (page < totalPages && delay > 0) await sleep(delay);
  }

  const venueRows = [...totals.entries()].map(([venue, points]) => ({ date, venue, points }));
  await chunked(venueRows, 200, (chunk) =>
    db
      .insert(schema.leaderboardVenueDaily)
      .values(chunk)
      .onConflictDoUpdate({
        target: [schema.leaderboardVenueDaily.date, schema.leaderboardVenueDaily.venue],
        set: { points: sql`excluded.points` },
      }),
  );

  await db
    .update(crawls)
    .set({ status: "complete", finishedAt: ctx.now(), walletsStored: stored, totalElements })
    .where(eq(crawls.date, date));

  if (
    totalElements !== null &&
    Math.abs(stored - totalElements) > Math.max(5, totalElements * 0.01)
  ) {
    ctx.log.warn(
      { stored, totalElements },
      "leaderboard crawl stored a different count than the API reported",
    );
  }
  ctx.log.info({ date, pages: page, wallets: stored, totalElements }, "leaderboard crawl complete");
  return { status: "complete", pages: page, wallets: stored, totalElements };
}

/** Daily at 00:30 UTC, with retries later in the day (a completed day is skipped). */
export const leaderboardCrawlJob: Job = {
  name: "leaderboard-crawl",
  schedule: "0 30 0,6,12,18 * * *",
  startDelayMs: 90_000,
  async run(ctx) {
    await crawlLeaderboard(ctx);
  },
};

/** Hourly: refresh the top 500 (two pages of 250). Short retention. */
export const leaderboardTopJob: Job = {
  name: "leaderboard-top",
  schedule: "0 20 * * * *",
  startDelayMs: 20_000,
  async run(ctx) {
    const ts = floorToMinute(ctx.now());
    const rows: {
      ts: Date;
      rank: number;
      address: string;
      totalPoints: number;
      rankChange: number | null;
    }[] = [];
    for (let page = 0; page < 2; page += 1) {
      const current = page;
      const result = await track(ctx, SOURCE.rewards, "GET /points/leaderboard (top)", () =>
        onreRewards.leaderboard(current, 250, ctx.fetchOptions),
      );
      if (result === null) return;
      for (const entry of result.data.leaderboard.content) {
        rows.push({
          ts,
          rank: entry.rank,
          address: entry.address,
          totalPoints: entry.totalPoints,
          rankChange: entry.rankChange === null ? null : Math.trunc(entry.rankChange),
        });
      }
      if (page === 0) await sleep(ctx.config.LEADERBOARD_PAGE_DELAY_MS);
    }
    await chunked(rows, 500, (chunk) =>
      ctx.handle.db.insert(schema.leaderboardTopSnap).values(chunk).onConflictDoNothing(),
    );
  },
};
