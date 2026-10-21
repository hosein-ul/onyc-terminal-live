import { and, asc, desc, eq, gte, schema, sql } from "@onyc/db";
import type { Range } from "@onyc/sdk";
import type { Deps } from "./deps.js";

export type NavRow = typeof schema.navDaily.$inferSelect;
export type TickRow = typeof schema.liveTicks.$inferSelect;
export type LayerDbRow = typeof schema.reinsuranceLayers.$inferSelect;

const DAY = 86_400_000;

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return isoDate(new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY));
}

/** First date of a range ending today, or null for "all". */
export function rangeStart(range: Range, today: string): string | null {
  switch (range) {
    case "1w":
      return addDays(today, -7);
    case "1m":
      return addDays(today, -30);
    case "3m":
      return addDays(today, -90);
    case "1y":
      return addDays(today, -365);
    case "all":
      return null;
  }
}

/** Daily NAV rows, oldest first. */
export async function loadNav(deps: Deps, from: string | null = null): Promise<NavRow[]> {
  const t = schema.navDaily;
  const q = deps.handle.db.select().from(t);
  return from === null ? q.orderBy(asc(t.date)) : q.where(gte(t.date, from)).orderBy(asc(t.date));
}

export async function latestTick(deps: Deps): Promise<TickRow | null> {
  const t = schema.liveTicks;
  return (await deps.handle.db.select().from(t).orderBy(desc(t.ts)).limit(1))[0] ?? null;
}

/** The most recent tick that has a value in `column`; used when the newest tick lost one source. */
export async function latestTickValue(
  deps: Deps,
  column: "nav" | "apy" | "tvl" | "marketPrice" | "premiumBps",
): Promise<{ value: number; ts: Date } | null> {
  const t = schema.liveTicks;
  const col = t[column];
  const row = (
    await deps.handle.db
      .select({ value: col, ts: t.ts })
      .from(t)
      .where(sql`${col} is not null`)
      .orderBy(desc(t.ts))
      .limit(1)
  )[0];
  return row?.value == null ? null : { value: row.value, ts: row.ts };
}

export async function loadLayers(deps: Deps): Promise<LayerDbRow[]> {
  const t = schema.reinsuranceLayers;
  return deps.handle.db.select().from(t).orderBy(asc(t.layerId));
}

export interface CollateralSnapshot {
  ts: Date;
  sheetSnapshotDate: string;
  totalUsd: number | null;
  aumUsd: number | null;
  assets: (typeof schema.collateralAssetsSnap.$inferSelect)[];
}

export async function latestCollateral(deps: Deps): Promise<CollateralSnapshot | null> {
  const h = schema.collateralSnapshots;
  const head = (await deps.handle.db.select().from(h).orderBy(desc(h.ts)).limit(1))[0];
  if (head === undefined) return null;
  const a = schema.collateralAssetsSnap;
  const assets = await deps.handle.db
    .select()
    .from(a)
    .where(eq(a.ts, head.ts))
    .orderBy(asc(a.rowIndex));
  return {
    ts: head.ts,
    sheetSnapshotDate: head.sheetSnapshotDate,
    totalUsd: head.totalUsd,
    aumUsd: head.aumUsd,
    assets,
  };
}

export function liquidityLayerMeasured(c: CollateralSnapshot | null): number | null {
  if (c === null) return null;
  return c.assets.filter((a) => a.liquidityLayer).reduce((s, a) => s + a.amountUsd, 0);
}

export async function latestDistribution(deps: Deps) {
  const t = schema.capitalDistributionSnap;
  const latest = (
    await deps.handle.db.select({ d: t.asOfDate }).from(t).orderBy(desc(t.asOfDate)).limit(1)
  )[0];
  if (latest === undefined)
    return { asOfDate: null, totalAumUsd: null, rows: [] as (typeof t.$inferSelect)[] };
  const rows = await deps.handle.db
    .select()
    .from(t)
    .where(eq(t.asOfDate, latest.d))
    .orderBy(desc(t.capitalUsd));
  return { asOfDate: latest.d, totalAumUsd: rows[0]?.totalAumUsd ?? null, rows };
}

export async function latestRecon(deps: Deps) {
  const t = schema.reconciliationSnap;
  return (await deps.handle.db.select().from(t).orderBy(desc(t.asOfDate)).limit(1))[0] ?? null;
}

export async function latestSolvency(deps: Deps) {
  const t = schema.solvencySnap;
  return (await deps.handle.db.select().from(t).orderBy(desc(t.ts)).limit(1))[0] ?? null;
}

export async function latestSettings(deps: Deps) {
  const t = schema.settingsSnap;
  return (await deps.handle.db.select().from(t).orderBy(desc(t.ts)).limit(1))[0] ?? null;
}

export async function latestLeaderboardDate(deps: Deps): Promise<string | null> {
  const t = schema.leaderboardCrawls;
  const row = (
    await deps.handle.db
      .select({ d: t.date })
      .from(t)
      .where(eq(t.status, "complete"))
      .orderBy(desc(t.date))
      .limit(1)
  )[0];
  return row?.d ?? null;
}

export async function recentEvents(
  deps: Deps,
  opts: { kind?: string; limit: number; sinceMs?: number },
) {
  const t = schema.events;
  const conditions = [
    ...(opts.kind === undefined ? [] : [eq(t.kind, opts.kind)]),
    ...(opts.sinceMs === undefined
      ? []
      : [gte(t.ts, new Date(deps.now().getTime() - opts.sinceMs))]),
  ];
  const q = deps.handle.db.select().from(t);
  const rows = await (conditions.length === 0 ? q : q.where(and(...conditions)))
    .orderBy(desc(t.ts), desc(t.id))
    .limit(opts.limit);
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts.toISOString(),
    kind: r.kind,
    severity: r.severity as "info" | "watch" | "alert",
    title: r.title,
    body: r.body,
    data: r.data ?? null,
  }));
}

/** Days with data, oldest first: the last value of `valueSql` per UTC day over the last `days` days. */
export async function dailyLast(
  deps: Deps,
  table: "live_ticks" | "solvency_snap",
  valueSql: string,
  days: number,
): Promise<{ date: string; value: number | null }[]> {
  const since = new Date(deps.now().getTime() - days * DAY);
  const query = `select to_char(d, 'YYYY-MM-DD') as date, v as value from (
      select distinct on (date_trunc('day', ts at time zone 'UTC')) date_trunc('day', ts at time zone 'UTC') as d, ${valueSql} as v
      from ${table} where ts >= $1::timestamptz order by date_trunc('day', ts at time zone 'UTC'), ts desc) x order by d`;
  const rows = await deps.handle.sql.unsafe<{ date: string; value: number | null }[]>(query, [
    since.toISOString(),
  ]);
  return rows.map((r) => ({ date: r.date, value: r.value === null ? null : Number(r.value) }));
}
