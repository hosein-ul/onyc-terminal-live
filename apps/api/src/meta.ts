import { schema } from "@onyc/db";
import type { Meta } from "@onyc/sdk";
import type { Deps } from "./deps.js";

const MIN = 60_000;
const HOUR = 60 * MIN;

interface DatasetDef {
  label: string;
  /** (source, endpoint) pairs from `source_health` whose last success defines "fetched at". */
  refs: readonly (readonly [string, string])[];
  staleAfterMs: number;
}

/** Where each number comes from and how old it may be before it is flagged stale. */
export const DATASETS = {
  live: {
    label: "OnRe core API (live)",
    refs: [["onre-core", "GET /data/live-nav"]],
    staleAfterMs: 5 * MIN,
  },
  market: {
    label: "Jupiter price API",
    refs: [["jupiter", "GET /price/v3"]],
    staleAfterMs: 5 * MIN,
  },
  navHistory: {
    label: "OnRe core API (/data/nav)",
    refs: [["onre-core", "GET /data/nav"]],
    staleAfterMs: 3 * HOUR,
  },
  offers: {
    label: "OnRe core API (/offers)",
    refs: [["onre-core", "GET /offers"]],
    staleAfterMs: 30 * MIN,
  },
  redemption: {
    label: "OnRe core API (/redemption)",
    refs: [["onre-core", "GET /redemption/offers"]],
    staleAfterMs: 30 * MIN,
  },
  redemptionLog: {
    label: "OnRe core API (/redemption/requests)",
    refs: [["onre-core", "GET /redemption/requests"]],
    staleAfterMs: 30 * MIN,
  },
  settings: {
    label: "OnRe core API (/settings)",
    refs: [["onre-core", "GET /settings"]],
    staleAfterMs: 2 * HOUR,
  },
  reinsurance: {
    label: "OnRe published sheet: reinsurance layers",
    refs: [["onre-sheets", "sheet reinsurance (gid 297157125)"]],
    staleAfterMs: 2 * HOUR,
  },
  collateral: {
    label: "OnRe published sheet: collateral",
    refs: [["onre-sheets", "sheet collateral (gid 1591707661)"]],
    staleAfterMs: 2 * HOUR,
  },
  opportunities: {
    label: "OnRe published sheet: DeFi opportunities",
    refs: [["onre-sheets", "sheet opportunities (gid 1418034083)"]],
    staleAfterMs: 2 * HOUR,
  },
  navSheet: {
    label: "OnRe published sheet: NAV mirror",
    refs: [["onre-sheets", "sheet nav (gid 362705568)"]],
    staleAfterMs: 2 * HOUR,
  },
  protocolAum: {
    label: "OnRe rewards API (AUM by protocol)",
    refs: [["onre-rewards", "GET /analytics/aum/growth"]],
    staleAfterMs: 8 * HOUR,
  },
  capital: {
    label: "OnRe rewards API (capital)",
    refs: [
      ["onre-rewards", "GET /analytics/capital/distribution"],
      ["onre-rewards", "GET /analytics/capital/reconciliation"],
    ],
    staleAfterMs: 3 * HOUR,
  },
  pointsGrowth: {
    label: "OnRe rewards API (points growth)",
    refs: [["onre-rewards", "GET /analytics/points/growth"]],
    staleAfterMs: 8 * HOUR,
  },
  leaderboard: {
    label: "OnRe rewards API (leaderboard crawl)",
    refs: [["onre-rewards", "GET /points/leaderboard"]],
    staleAfterMs: 36 * HOUR,
  },
  solvency: {
    label: "Accountable proof of solvency",
    refs: [["accountable", "GET /dashboard"]],
    staleAfterMs: HOUR,
  },
  pools: {
    label: "GeckoTerminal",
    refs: [["geckoterminal", "GET /networks/solana/tokens/{mint}/pools"]],
    staleAfterMs: 30 * MIN,
  },
  llama: {
    label: "DefiLlama",
    refs: [["defillama", "GET /protocol/onre"]],
    staleAfterMs: 3 * HOUR,
  },
  derived: {
    label: "Computed from stored data",
    refs: [],
    staleAfterMs: Number.POSITIVE_INFINITY,
  },
} as const satisfies Record<string, DatasetDef>;

export type DatasetKey = keyof typeof DATASETS;

export interface HealthRow {
  source: string;
  endpoint: string;
  status: string;
  lastOkAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastLatencyMs: number | null;
}

export async function loadHealth(deps: Deps): Promise<HealthRow[]> {
  const rows = await deps.handle.db.select().from(schema.sourceHealth);
  return rows.map((r) => ({
    source: r.source,
    endpoint: r.endpoint,
    status: r.status,
    lastOkAt: r.lastOkAt,
    lastErrorAt: r.lastErrorAt,
    lastError: r.lastError,
    consecutiveFailures: r.consecutiveFailures,
    lastLatencyMs: r.lastLatencyMs,
  }));
}

/**
 * Meta for a dataset: the oldest last-success among its endpoints is "fetched at". With no recorded success
 * it is null and the data counts as stale.
 */
export function metaFor(health: readonly HealthRow[], key: DatasetKey, now: Date): Meta {
  const def: DatasetDef = DATASETS[key];
  if (def.refs.length === 0) {
    return { source: def.label, fetchedAt: now.toISOString(), stale: false };
  }
  let oldest: Date | null = null;
  for (const [source, endpoint] of def.refs) {
    const row = health.find((h) => h.source === source && h.endpoint === endpoint);
    if (row?.lastOkAt == null) return { source: def.label, fetchedAt: null, stale: true };
    if (oldest === null || row.lastOkAt < oldest) oldest = row.lastOkAt;
  }
  const fetchedAt = oldest ?? now;
  return {
    source: def.label,
    fetchedAt: fetchedAt.toISOString(),
    stale: now.getTime() - fetchedAt.getTime() > def.staleAfterMs,
  };
}

/** Builds the `meta` record for a response from a map of response field -> dataset. */
export function buildMeta(
  health: readonly HealthRow[],
  fields: Record<string, DatasetKey>,
  now: Date,
): Record<string, Meta> {
  return Object.fromEntries(
    Object.entries(fields).map(([field, key]) => [field, metaFor(health, key, now)]),
  );
}
