/**
 * Builders for the page-specific charts of Phase 4: forward NAV, points emission, redemption flow and the ranked
 * capital bars. Same rules as builders.ts: pure functions over the whole `{ data, meta }` response.
 */
import { formatCompact, formatDate, formatNav, formatUsdCompact } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { provenanceFrom } from "./provenance.js";
import type { BarsSpec, StackedSpec, TimeSeriesSpec } from "./types.js";

const titleCase = (s: string): string =>
  s.length === 0 ? s : (s[0] ?? "").toUpperCase() + s.slice(1);

/** The last `historyDays` of NAV history joined to the scheduled forward path of the decoded price vector. */
export function forwardNavSpec(
  nav: EndpointResponse<"nav">,
  vectors: EndpointResponse<"navVectors">,
  horizon: "d30" | "d90" = "d90",
  historyDays = 60,
): TimeSeriesSpec {
  const hist = nav.data.series.slice(-historyDays);
  const forward = vectors.data.forward[horizon];
  const last = hist[hist.length - 1];
  const end = forward[forward.length - 1];
  return {
    kind: "timeseries",
    id: "nav-forward",
    title: "NAV so far and as scheduled",
    subtitle: vectors.data.forward.label,
    provenance: provenanceFrom({ ...nav.meta, ...vectors.meta }, "series", "forward"),
    summary:
      last !== undefined && end !== undefined
        ? `NAV is ${formatNav(last.nav, 4)} today and would reach ${formatNav(end.nav, 4)} in ${forward.length} days if the active price vector runs unchanged.`
        : "No forward path.",
    note: "Scheduled, not guaranteed: OnRe can add a price vector at any time.",
    ...(forward.length === 0 ? { empty: "The decoded price vector has no forward path." } : {}),
    variant: "line",
    unit: "nav",
    series: [
      {
        key: "history",
        label: "NAV so far",
        role: "primary",
        points: hist.map((r) => ({ x: r.date, y: r.nav })),
      },
      {
        key: "scheduled",
        label: "Scheduled",
        role: "reference",
        // Starts at today's value so the two lines join.
        points: [
          ...(last !== undefined ? [{ x: last.date, y: last.nav }] : []),
          ...forward.map((p) => ({ x: p.date, y: p.nav })),
        ],
      },
    ],
    annotations: [],
    smooth: false,
    zeroBased: false,
  };
}

export function pointsEmissionSpec(res: EndpointResponse<"pointsGrowth">): StackedSpec {
  const s = res.data.series;
  const last = s[s.length - 1];
  return {
    kind: "stacked",
    id: "points-emission",
    title: "Points issued per day",
    subtitle: "Base points and referral bonus",
    provenance: provenanceFrom(res.meta, "series"),
    summary: `Daily points over ${s.length} days; the latest day issued ${last === undefined ? "none" : formatCompact(last.dailyTotal)}.`,
    ...(s.length < 2 ? { empty: "Points history has not been collected yet." } : {}),
    unit: "points",
    mode: "absolute",
    keys: [
      { key: "base", label: "Base" },
      { key: "referral", label: "Referral" },
    ],
    rows: s.map((r) => ({ x: r.date, values: { base: r.dailyBase, referral: r.dailyReferral } })),
  };
}

export function pointsTotalSpec(res: EndpointResponse<"pointsGrowth">): TimeSeriesSpec {
  const s = res.data.series;
  const last = s[s.length - 1];
  return {
    kind: "timeseries",
    id: "points-total",
    title: "Total points issued",
    provenance: provenanceFrom(res.meta, "series"),
    summary:
      last !== undefined
        ? `${formatCompact(last.total)} points issued by ${formatDate(last.date)}.`
        : "No points data.",
    ...(s.length < 2 ? { empty: "Points history has not been collected yet." } : {}),
    variant: "area",
    unit: "points",
    series: [
      {
        key: "total",
        label: "Total points",
        role: "primary",
        points: s.map((r) => ({ x: r.date, y: r.total })),
      },
    ],
    annotations:
      last !== undefined
        ? [{ kind: "end", x: last.date, y: last.total, label: formatCompact(last.total) }]
        : [],
    smooth: false,
    zeroBased: true,
  };
}

export function redemptionFlowSpec(res: EndpointResponse<"redemptions">): BarsSpec {
  const flow = res.data.flow.filter((f) => f.delta > 0);
  return {
    kind: "bars",
    id: "redemption-flow",
    title: "Redemptions executed between snapshots",
    provenance: provenanceFrom(res.meta, "flow"),
    summary: `${flow.length} snapshot intervals with redemptions.`,
    ...(res.data.flowSince !== null
      ? { note: `Collecting since ${formatDate(res.data.flowSince)}` }
      : {}),
    ...(flow.length < 2
      ? {
          empty: "Redemption flow is built from changes between snapshots; two or more are needed.",
        }
      : {}),
    unit: "count",
    orientation: "vertical",
    diverging: false,
    bars: flow.map((f) => ({ label: f.t, value: f.delta })),
    thresholds: [],
  };
}

export function collateralBarsSpec(res: EndpointResponse<"yieldComposition">): BarsSpec {
  const rows = res.data.collateral.assets
    .filter((a) => a.amountUsd > 0)
    .sort((a, b) => b.amountUsd - a.amountUsd);
  return {
    kind: "bars",
    id: "collateral-assets",
    title: "Collateral assets",
    provenance: provenanceFrom(res.meta, "collateral"),
    summary: `${rows.length} collateral rows; the largest is ${rows[0]?.asset ?? "not available"}.`,
    unit: "usd",
    orientation: "horizontal",
    diverging: false,
    bars: rows.map((r) => ({ label: r.asset, value: r.amountUsd })),
    thresholds: [],
  };
}

function shareBars(
  id: string,
  title: string,
  rows: { key: string; capital: number }[],
  provenance: TimeSeriesSpec["provenance"],
): BarsSpec {
  const sorted = [...rows].sort((a, b) => b.capital - a.capital);
  const top = sorted[0];
  return {
    kind: "bars",
    id,
    title,
    provenance,
    summary: `${title}: the largest is ${top?.key ?? "not available"} with ${formatUsdCompact(top?.capital ?? null)}.`,
    unit: "usd",
    orientation: "horizontal",
    diverging: false,
    bars: sorted.map((r) => ({ label: r.key, value: r.capital })),
    thresholds: [],
  };
}

export const perilBarsSpec = (res: EndpointResponse<"reinsuranceSummary">): BarsSpec =>
  shareBars(
    "capital-by-peril",
    "Bound capital by peril family",
    res.data.byPeril,
    provenanceFrom(res.meta, "byPeril"),
  );

export const structureBarsSpec = (res: EndpointResponse<"reinsuranceSummary">): BarsSpec =>
  shareBars(
    "capital-by-structure",
    "Bound capital by structure",
    res.data.byStructure,
    provenanceFrom(res.meta, "byStructure"),
  );

export const protocolBarsSpec = (res: EndpointResponse<"capitalDistribution">): BarsSpec =>
  shareBars(
    "capital-by-protocol-now",
    "Capital by protocol today",
    res.data.distribution.map((d) => ({ key: titleCase(d.protocol), capital: d.capitalUsd })),
    provenanceFrom(res.meta, "distribution"),
  );
