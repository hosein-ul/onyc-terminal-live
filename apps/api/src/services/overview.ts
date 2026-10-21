import { desc, schema } from "@onyc/db";
import {
  aumAttribution,
  capitalStack,
  liquidityCoverage,
  sourceSpread,
  stepEvents,
  type SupplyPoint,
} from "@onyc/metrics";
import type { z } from "zod";
import type { endpoints } from "@onyc/sdk";
import type { Deps } from "../deps.js";
import {
  addDays,
  dailyLast,
  isoDate,
  latestCollateral,
  latestDistribution,
  latestSettings,
  latestSolvency,
  latestTick,
  latestTickValue,
  liquidityLayerMeasured,
  loadLayers,
  loadNav,
  recentEvents,
} from "../loaders.js";
import { buildKpi, num, result, type ServiceResult } from "./common.js";
import { loadVectors } from "./nav.js";

type Out<K extends keyof typeof endpoints> = z.output<(typeof endpoints)[K]["response"]>["data"];

/** Reported AUM: the live TVL tick, falling back to the latest daily NAV row. */
export async function reportedAum(
  deps: Deps,
): Promise<{ value: number | null; asOf: string | null }> {
  const tvl = await latestTickValue(deps, "tvl");
  if (tvl !== null && deps.now().getTime() - tvl.ts.getTime() < 3_600_000) {
    return { value: tvl.value, asOf: tvl.ts.toISOString() };
  }
  const nav = (await loadNav(deps, addDays(isoDate(deps.now()), -7)))
    .filter((r) => r.aum !== null)
    .at(-1);
  return nav?.aum == null
    ? { value: tvl?.value ?? null, asOf: tvl?.ts.toISOString() ?? null }
    : { value: nav.aum, asOf: nav.date };
}

/** Capital stack: bound (Bound layers), liquidity layer (policy share of AUM), available (the rest). */
export async function buildStack(deps: Deps): Promise<Out<"overview">["capital"]["stack"]> {
  const layers = await loadLayers(deps);
  const aum = (await reportedAum(deps)).value;
  if (aum === null || layers.length === 0) return null;
  const bound = layers
    .filter((l) => l.status.toLowerCase() === "bound")
    .reduce((s, l) => s + l.capital, 0);
  const offered = layers
    .filter((l) => l.status.toLowerCase() === "offered")
    .reduce((s, l) => s + l.capital, 0);
  const target = deps.config.LIQUIDITY_TARGET;
  const stack = capitalStack({
    boundUsd: bound,
    offeredUsd: offered,
    liquidityLayerUsd: aum * target,
    aumUsd: aum,
  });
  const measured = liquidityLayerMeasured(await latestCollateral(deps));
  return {
    ...stack,
    measuredLiquidityLayerUsd: measured,
    liquidityTarget: target,
    basis: {
      bound: "Sum of Bound layers in the reinsurance sheet",
      offered: "Sum of Offered layers in the reinsurance sheet",
      available: "AUM minus bound, offered and the liquidity layer",
      liquidityLayer: `${(target * 100).toFixed(0)}% of AUM, the policy share shown on the official Transparency page (not a measured balance)`,
      aum: "Live TVL from the OnRe core API",
    },
  };
}

/** AUM per source, with the spread between them (DATA_SOURCES conflict 1). */
export async function aumSources(deps: Deps): Promise<Out<"overview">["sourceCheck"]> {
  const tick = await latestTick(deps);
  const lastNav = (await loadNav(deps, addDays(isoDate(deps.now()), -7))).at(-1) ?? null;
  const collateral = await latestCollateral(deps);
  const solvency = await latestSolvency(deps);
  const settings = await latestSettings(deps);
  const llama = (
    await deps.handle.db
      .select()
      .from(schema.llamaTvlDaily)
      .orderBy(desc(schema.llamaTvlDaily.date))
      .limit(1)
  )[0];
  const sheetNav = (
    await deps.handle.db
      .select()
      .from(schema.navSheetDaily)
      .orderBy(desc(schema.navSheetDaily.date))
      .limit(1)
  )[0];
  const sources = [
    {
      id: "core-live",
      label: "OnRe live TVL",
      aumUsd: num((await latestTickValue(deps, "tvl"))?.value),
      asOf: tick?.ts.toISOString() ?? null,
    },
    {
      id: "core-nav",
      label: "OnRe daily NAV (AUM)",
      aumUsd: lastNav?.aum ?? null,
      asOf: lastNav?.date ?? null,
    },
    {
      id: "core-settings",
      label: "OnRe settings (TVL value)",
      aumUsd: settings?.tvlValue ?? null,
      asOf: settings?.ts.toISOString() ?? null,
    },
    {
      id: "sheet-nav",
      label: "OnRe NAV sheet",
      aumUsd: sheetNav?.aum ?? null,
      asOf: sheetNav?.date ?? null,
    },
    {
      id: "collateral-sheet",
      label: "Collateral sheet (AUM row)",
      aumUsd: collateral?.aumUsd ?? null,
      asOf: collateral?.sheetSnapshotDate ?? null,
    },
    {
      id: "defillama",
      label: "DefiLlama TVL",
      aumUsd: llama?.tvl ?? null,
      asOf: llama?.date ?? null,
    },
    {
      id: "accountable",
      label: "Accountable total supply",
      aumUsd: solvency?.supplyUsd ?? null,
      asOf: solvency?.retrievedAt.toISOString() ?? null,
    },
  ];
  const values = sources.map((s) => s.aumUsd).filter((v): v is number => v !== null);

  return { sources, spread: values.length >= 2 ? sourceSpread(values) : null };
}

export async function overviewService(deps: Deps): Promise<ServiceResult<Out<"overview">>> {
  const today = isoDate(deps.now());
  const navRows = await loadNav(deps, addDays(today, -400));
  const lastNav = navRows.at(-1) ?? null;
  const last30 = navRows.slice(-31);

  const series = (pick: (r: (typeof navRows)[number]) => number | null) =>
    last30.map((r) => ({ date: r.date, value: pick(r) }));

  const navNow = num((await latestTickValue(deps, "nav"))?.value) ?? lastNav?.nav ?? null;
  const apyNow = num((await latestTickValue(deps, "apy"))?.value);
  const aum = await reportedAum(deps);
  const supplyNow = lastNav?.circulatingSupply ?? null;

  const premiumSeries = await dailyLast(deps, "live_ticks", "premium_bps", 30);
  const premiumNow = num((await latestTickValue(deps, "premiumBps"))?.value);
  const solvencySeries = await dailyLast(deps, "solvency_snap", "collateralization", 30);
  const solvency = await latestSolvency(deps);

  // Coverage history: measured liquidity-layer rows over the AUM stored with each collateral snapshot.
  const collateral = await latestCollateral(deps);
  const measured = liquidityLayerMeasured(collateral);
  const coverageNow =
    measured !== null && aum.value !== null ? liquidityCoverage(measured, aum.value) : null;
  const coverageRows = await deps.handle.sql.unsafe<{ date: string; value: number | null }[]>(
    `select to_char(d,'YYYY-MM-DD') as date, v as value from (
       select distinct on (date_trunc('day', h.ts)) date_trunc('day', h.ts) as d,
         (select coalesce(sum(a.amount_usd),0) from collateral_assets_snap a where a.ts = h.ts and a.liquidity_layer) / nullif(h.aum_usd,0) as v
       from collateral_snapshots h where h.ts >= $1::timestamptz order by date_trunc('day', h.ts), h.ts desc) x order by d`,
    [new Date(deps.now().getTime() - 30 * 86_400_000).toISOString()],
  );
  const coverageSeries = coverageRows.map((r) => ({
    date: r.date,
    value: r.value === null ? null : Number(r.value),
  }));

  // Hero chart: one year of NAV with markers for vectors and down-ticks.
  const heroFrom = addDays(today, -365);
  const hero = navRows.filter((r) => r.date >= heroFrom);
  const vectors = await loadVectors(deps);
  const vectorDates = [...new Set(vectors.map((v) => isoDate(v.startTime)))];
  const steps = stepEvents(
    navRows.map((r) => ({ date: r.date, nav: r.nav })),
    vectorDates,
  ).filter((e) => e.date >= heroFrom);
  const navEvents = steps.map((e) => ({
    date: e.date,
    kind: e.reason,
    label:
      e.reason === "downtick"
        ? `Down-tick (${Math.round(e.ppm)} ppm)`
        : e.reason === "new_vector"
          ? "New price vector"
          : `Unusual step (${Math.round(e.ppm)} ppm)`,
  }));

  // What changed since yesterday: AUM attribution for the latest two days that have supply and AUM.
  const supplyPoints: SupplyPoint[] = navRows
    .filter((r) => r.circulatingSupply !== null)
    .map((r) => ({ date: r.date, nav: r.nav, supply: r.circulatingSupply ?? 0, aum: r.aum }));
  const attribution =
    supplyPoints.length >= 2
      ? aumAttribution(
          supplyPoints[supplyPoints.length - 2] as SupplyPoint,
          supplyPoints[supplyPoints.length - 1] as SupplyPoint,
        )
      : null;
  const events = await recentEvents(deps, { limit: 8, sinceMs: 7 * 86_400_000 });

  const dist = await latestDistribution(deps);
  const stack = await buildStack(deps);

  const sourceCheck = await aumSources(deps);

  return result(
    {
      nav: buildKpi(
        navNow,
        series((r) => r.nav),
        "fraction",
      ),
      apy: {
        ...buildKpi(
          apyNow,
          series((r) => r.apyReported),
          "absolute",
        ),
        reported: [...navRows].reverse().find((r) => r.apyReported !== null)?.apyReported ?? null,
      },
      aum: buildKpi(
        aum.value,
        series((r) => r.aum),
        "fraction",
      ),
      circulatingSupply: buildKpi(
        supplyNow,
        series((r) => r.circulatingSupply),
        "fraction",
      ),
      premiumBps: buildKpi(premiumNow, premiumSeries, "absolute"),
      collateralRatio: buildKpi(solvency?.collateralization ?? null, solvencySeries, "absolute"),
      liquidityCoverage: buildKpi(coverageNow, coverageSeries, "absolute"),
      navSeries: hero.map((r) => ({ date: r.date, nav: r.nav })),
      navEvents,
      whatChanged: { attribution, events },
      capital: {
        stack,
        distribution: dist.rows.map((r) => ({
          protocol: r.protocol,
          capitalUsd: r.capitalUsd,
          share: r.share,
        })),
        asOfDate: dist.asOfDate,
      },
      sourceCheck,
    },
    {
      nav: "live",
      apy: "live",
      aum: "live",
      circulatingSupply: "navHistory",
      premiumBps: "market",
      collateralRatio: "solvency",
      liquidityCoverage: "collateral",
      navSeries: "navHistory",
      navEvents: "navHistory",
      whatChanged: "navHistory",
      capital: "capital",
      sourceCheck: "derived",
    },
  );
}
