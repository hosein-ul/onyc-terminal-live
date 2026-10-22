import { and, asc, desc, eq, ilike, inArray, schema, sql } from "@onyc/db";
import { gini, lorenz, rankMovement, rankPercentile, topNShare, walletsAbove } from "@onyc/metrics";
import { CONSTANTS, onreRewards } from "@onyc/sources";
import type { z } from "zod";
import type { endpoints } from "@onyc/sdk";
import { apiRpc } from "./chain.js";
import { TtlCache } from "../cache.js";
import type { Deps } from "../deps.js";
import { addDays, latestLeaderboardDate, latestTickValue } from "../loaders.js";
import { result, type ServiceResult } from "./common.js";

type Out<K extends keyof typeof endpoints> = z.output<(typeof endpoints)[K]["response"]>["data"];

/** Leaf paths of a nested points breakdown: `kamino.onyc`, `exponent.markets.SEP-2026.yt`. Numbers only. */
export function flatten(
  value: unknown,
  prefix = "",
  out: Record<string, number> = {},
): Record<string, number> {
  if (typeof value === "number" && Number.isFinite(value)) {
    out[prefix] = value;
  } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix === "" ? key : `${prefix}.${key}`, out);
    }
  }
  return out;
}

export async function pointsGrowthService(deps: Deps): Promise<ServiceResult<Out<"pointsGrowth">>> {
  const t = schema.pointsGrowthDaily;
  const rows = await deps.handle.db.select().from(t).orderBy(asc(t.date));
  const multiplier = await liveGlobalMultiplier(deps);
  return result(
    {
      series: rows.map((r) => ({ ...r })),
      activeMultiplier: multiplier,
    },
    { series: "pointsGrowth", activeMultiplier: "leaderboard" },
  );
}

const multiplierCache = new TtlCache<Out<"pointsGrowth">["activeMultiplier"]>(4);

/** The active global multiplier as OnRe reports it. Shown as-is: OnRe does not explain it. */
export async function liveGlobalMultiplier(
  deps: Deps,
): Promise<Out<"pointsGrowth">["activeMultiplier"]> {
  const { value } = await multiplierCache.getOrLoad("global", 300_000, async () => {
    try {
      const page = await onreRewards.leaderboard(0, 10, deps.fetchOptions);
      const m = page.data.leaderboard.content
        .flatMap((e) => e.activeMultipliers ?? [])
        .find((x) => x.sourceType === "GLOBAL" && x.effectiveToDate === null);
      return m === undefined
        ? null
        : {
            value: m.multiplier,
            since: m.effectiveFromDate,
            note: "Reported by OnRe on leaderboard rows. OnRe does not explain what it applies to.",
          };
    } catch (error) {
      deps.log.warn(
        { err: error instanceof Error ? error.message : String(error) },
        "could not read the global points multiplier",
      );
      return null;
    }
  });
  return value;
}

export async function leaderboardService(
  deps: Deps,
  q: { page: number; size: number; q?: string | undefined },
): Promise<ServiceResult<Out<"leaderboard">>> {
  const date = await latestLeaderboardDate(deps);
  const empty = { page: q.page, size: q.size, totalRows: 0, snapshotDate: date, rows: [] };
  if (date === null)
    return result(empty, {
      page: "leaderboard",
      size: "leaderboard",
      totalRows: "leaderboard",
      snapshotDate: "leaderboard",
      rows: "leaderboard",
    });

  const t = schema.leaderboardSnap;
  const search =
    q.q === undefined || q.q === ""
      ? undefined
      : ilike(t.address, `%${q.q.replace(/[%_\\]/g, "")}%`);
  const where = search === undefined ? eq(t.date, date) : and(eq(t.date, date), search);
  const { db } = deps.handle;
  const total =
    (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(t)
        .where(where)
    )[0]?.n ?? 0;
  const rows = await db
    .select()
    .from(t)
    .where(where)
    .orderBy(asc(t.rank))
    .limit(q.size)
    .offset(q.page * q.size);

  // Our own movement from daily snapshots: rank on that date minus rank now (positive is up).
  const addresses = rows.map((r) => r.address);
  const movementFor = async (days: number): Promise<Map<string, number | null>> => {
    if (addresses.length === 0) return new Map();
    const prev = await db
      .select({ address: t.address, rank: t.rank })
      .from(t)
      .where(and(eq(t.date, addDays(date, -days)), inArray(t.address, addresses)));
    return new Map(
      rankMovement(
        rows.map((r) => ({ address: r.address, rank: r.rank })),
        prev,
      ).map((m) => [m.address, m.change]),
    );
  };
  const [m1, m7, m30] = await Promise.all([movementFor(1), movementFor(7), movementFor(30)]);

  return result(
    {
      page: q.page,
      size: q.size,
      totalRows: total,
      snapshotDate: date,
      rows: rows.map((r) => ({
        rank: r.rank,
        address: r.address,
        totalPoints: r.totalPoints,
        rankChangePerOnre: r.rankChange,
        movement1d: m1.get(r.address) ?? null,
        movement7d: m7.get(r.address) ?? null,
        movement30d: m30.get(r.address) ?? null,
        breakdown: r.breakdown === null ? null : flatten(r.breakdown),
      })),
    },
    {
      page: "leaderboard",
      size: "leaderboard",
      totalRows: "leaderboard",
      snapshotDate: "leaderboard",
      rows: "leaderboard",
    },
  );
}

export async function concentrationService(
  deps: Deps,
): Promise<ServiceResult<Out<"concentration">>> {
  const date = await latestLeaderboardDate(deps);
  const { db } = deps.handle;
  const t = schema.leaderboardSnap;
  const totals =
    date === null
      ? []
      : (await db.select({ p: t.totalPoints }).from(t).where(eq(t.date, date))).map((r) => r.p);

  const v = schema.leaderboardVenueDaily;
  const venueRows = date === null ? [] : await db.select().from(v).where(eq(v.date, date));
  const venueSum = venueRows.reduce((s, r) => s + r.points, 0);

  const o = schema.defiOpportunitiesSnap;
  const latest = (await db.select({ ts: o.ts }).from(o).orderBy(desc(o.ts)).limit(1))[0];
  const opps = latest === undefined ? [] : await db.select().from(o).where(eq(o.ts, latest.ts));
  const multipliers = new Map<
    string,
    { protocol: string; strategy: string; pointsMultiplier: number }
  >();
  for (const r of opps) {
    if (r.reward === null) continue;
    multipliers.set(`${r.protocol}|${r.strategy}`, {
      protocol: r.protocol,
      strategy: r.strategy,
      pointsMultiplier: r.reward,
    });
  }

  return result(
    {
      snapshotDate: date,
      wallets: totals.length,
      gini: totals.length === 0 ? null : gini(totals),
      topShares: [10, 100, 1000].map((top) => ({ top, share: topNShare(totals, top) })),
      thresholds: walletsAbove(totals, [1e6, 1e7, 1e8, 1e9, 1e10]),
      lorenz: lorenz(totals, 200),
      venueMix: venueRows
        .filter((r) => r.points > 0)
        .map((r) => ({
          venue: r.venue,
          points: r.points,
          share: venueSum === 0 ? 0 : r.points / venueSum,
        }))
        .sort((a, b) => b.points - a.points),
      multipliers: [...multipliers.values()].sort(
        (a, b) => b.pointsMultiplier - a.pointsMultiplier,
      ),
      globalMultiplier: await liveGlobalMultiplier(deps),
      multiplierNote:
        "The global multiplier on leaderboard rows and the 6x or 8x boosts in the DeFi sheet are both shown as OnRe publishes them. How they relate is not explained by OnRe: not reconciled.",
    },
    {
      snapshotDate: "leaderboard",
      wallets: "leaderboard",
      gini: "leaderboard",
      topShares: "leaderboard",
      thresholds: "leaderboard",
      lorenz: "leaderboard",
      venueMix: "leaderboard",
      multipliers: "opportunities",
      globalMultiplier: "leaderboard",
      multiplierNote: "derived",
    },
  );
}

const walletCache = new TtlCache<Out<"wallet">>(500);

export async function walletService(
  deps: Deps,
  address: string,
): Promise<ServiceResult<Out<"wallet">>> {
  const ttl = deps.config.WALLET_CACHE_SECONDS * 1000;
  const { value } = await walletCache.getOrLoad(address, ttl, async () => {
    const o = deps.fetchOptions;
    const [points, stats, eligibility, code] = await Promise.all([
      onreRewards.walletPoints(address, o),
      onreRewards.referralStats(address, o),
      onreRewards.referralEligibility(address, o),
      onreRewards.referralCode(address, o),
    ]);
    const crawl = (
      await deps.handle.db
        .select()
        .from(schema.leaderboardCrawls)
        .where(eq(schema.leaderboardCrawls.status, "complete"))
        .orderBy(desc(schema.leaderboardCrawls.date))
        .limit(1)
    )[0];
    const totalUsers = crawl?.totalElements ?? eligibility.data.totalUsers;
    const p = points.data;
    const flat = flatten(p.pointsBreakdown);
    const venueTotals = new Map<string, number>();
    for (const [path, v] of Object.entries(flat)) {
      const venue = path.split(".")[0] ?? path;
      venueTotals.set(venue, (venueTotals.get(venue) ?? 0) + v);
    }
    const found = p.totalPoints > 0;
    return {
      address,
      found,
      points: p.totalPoints,
      rank: p.rank,
      totalUsers,
      percentile: totalUsers === null ? null : rankPercentile(p.rank, totalUsers),
      rankChangePerOnre: p.rankChange,
      breakdown: flat,
      venueTotals: [...venueTotals.entries()]
        .map(([venue, points]) => ({ venue, points }))
        .filter((x) => x.points > 0)
        .sort((a, b) => b.points - a.points),
      referrals: {
        code: code.data?.code ?? stats.data.referralCode,
        totalReferrals: stats.data.totalReferrals,
        activeReferrals: stats.data.activeReferrals,
        pendingReferrals: stats.data.pendingReferrals,
        totalReferralBonus: stats.data.totalReferralBonus,
        eligible: eligibility.data.isEligible,
      },
      onchain: await onchainBalance(deps, address),
    };
  });
  return result(value, {
    address: "derived",
    found: "leaderboard",
    points: "leaderboard",
    rank: "leaderboard",
    totalUsers: "leaderboard",
    percentile: "leaderboard",
    rankChangePerOnre: "leaderboard",
    breakdown: "leaderboard",
    venueTotals: "leaderboard",
    referrals: "leaderboard",
    onchain: "derived",
  });
}

/** ONyc held by the wallet, read from Solana. Falls back to "unavailable" with the reason when the RPC does not answer. */
async function onchainBalance(deps: Deps, address: string): Promise<Out<"wallet">["onchain"]> {
  try {
    const raw = await apiRpc(deps).getTokenBalanceByOwner(address, CONSTANTS.onycMint);
    const onyc = Number(raw) / 1e9;
    const nav = (await latestTickValue(deps, "nav"))?.value ?? null;
    return {
      status: "ok" as const,
      onycBalance: onyc,
      valueUsd: nav === null ? null : onyc * nav,
      note: "ONyc across all of the wallet's token accounts, read from Solana now and valued at NAV. srONyc and jrONyc balances are not included: their mints are not published in a source this tool trusts yet.",
    };
  } catch (error) {
    return {
      status: "unavailable" as const,
      onycBalance: null,
      valueUsd: null,
      note: `The Solana RPC did not answer (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"}). Points and rank are unaffected.`,
    };
  }
}
