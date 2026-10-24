/**
 * Builders: API response -> chart spec. Pure functions, no library and no colour. Every builder takes the whole
 * `{ data, meta }` envelope so the spec carries the provenance of exactly the fields it draws.
 */
import {
  formatBps,
  formatCompact,
  formatDate,
  formatNav,
  formatPercent,
  formatUsdCompact,
} from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { provenanceFrom } from "./provenance.js";
import type {
  Annotation,
  BarsSpec,
  BulletSpec,
  CalendarSpec,
  GanttSpec,
  LorenzSpec,
  MultiplesSpec,
  SankeySpec,
  ScatterSpec,
  StackBarSpec,
  StackedSpec,
  TimeSeriesSpec,
  TreemapSpec,
  WaterfallSpec,
} from "./types.js";

const titleCase = (s: string): string => (s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1));
const shortAddress = (a: string): string => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
const pct = (from: number, to: number): number => (from === 0 ? 0 : to / from - 1);

// ---------------------------------------------------------------------------------------------
// NAV and market
// ---------------------------------------------------------------------------------------------

export function navSpec(
  res: EndpointResponse<"nav">,
  options: { log?: boolean } = {},
): TimeSeriesSpec {
  const { series, events } = res.data;
  // Only dates inside the drawn range are worth a note.
  const missingDates = res.data.missingDates.filter(
    (d) => series.length > 0 && d >= (series[0]?.date ?? ""),
  );
  const points = series.map((r) => ({ x: r.date, y: r.nav }));
  const first = series[0];
  const last = series[series.length - 1];
  const annotations: Annotation[] = [];
  for (const e of events) {
    const at = series.find((r) => r.date === e.date);
    const tone = e.reason === "downtick" ? "bad" : e.reason === "new_vector" ? "accent" : "neutral";
    const what =
      e.reason === "downtick"
        ? "Down-tick"
        : e.reason === "new_vector"
          ? "New price vector"
          : "Outlier step";
    annotations.push({
      kind: "event",
      x: e.date,
      y: at?.nav ?? null,
      label: `${what} ${Math.round(e.ppm).toLocaleString("en-US")} ppm · ${formatDate(e.date)}`,
      tone,
    });
  }
  if (last !== undefined) {
    annotations.push({ kind: "end", x: last.date, y: last.nav, label: formatNav(last.nav, 4) });
  }
  const downticks = events.filter((e) => e.reason === "downtick").length;
  return {
    kind: "timeseries",
    id: "nav",
    title: "NAV per ONyc",
    subtitle: res.data.range === "all" ? "Since launch" : `Range ${res.data.range}`,
    provenance: provenanceFrom(res.meta, "series"),
    summary:
      first !== undefined && last !== undefined
        ? `NAV per ONyc went from ${formatNav(first.nav, 4)} on ${formatDate(first.date)} to ${formatNav(last.nav, 4)} on ${formatDate(last.date)}, ${formatPercent(pct(first.nav, last.nav), 2, { sign: true })}, with ${downticks} down-tick${downticks === 1 ? "" : "s"}.`
        : "No NAV data.",
    ...(missingDates.length > 0
      ? {
          note: `${missingDates.length} date${missingDates.length === 1 ? "" : "s"} missing from the source: ${missingDates.slice(0, 3).join(", ")}`,
        }
      : {}),
    ...(points.length === 0 ? { empty: "No NAV history has been collected yet." } : {}),
    variant: "area",
    unit: "nav",
    series: [{ key: "nav", label: "NAV", points, role: "primary" }],
    annotations,
    smooth: false,
    zeroBased: false,
    // NAV started above 1 and has not been under it; the axis starts at 1 so it does not suggest a fall below par.
    ...(points.length > 0 && points.every((p) => p.y !== null && p.y >= 1) ? { floor: 1 } : {}),
    ...(options.log === true ? { logScale: true } : {}),
  };
}

export function marketSpec(res: EndpointResponse<"market">): TimeSeriesSpec {
  const h = res.data.history;
  const last = h[h.length - 1];
  return {
    kind: "timeseries",
    id: "market-vs-nav",
    title: "Market price vs NAV",
    subtitle: "Shaded by premium or discount",
    provenance: provenanceFrom(res.meta, "history"),
    summary:
      last !== undefined
        ? `Market price ${formatNav(last.marketPrice, 4)} against NAV ${formatNav(last.nav, 4)}, a premium of ${formatBps(last.premiumBps, { sign: true })}.`
        : "No market history.",
    ...(res.data.historySince !== null
      ? { note: `Collecting since ${formatDate(res.data.historySince)}` }
      : {}),
    ...(h.length < 2 ? { empty: "Market history starts when the worker starts collecting." } : {}),
    variant: "line",
    unit: "nav",
    series: [
      {
        key: "market",
        label: "Market price",
        role: "primary",
        points: h.map((p) => ({ x: p.t, y: p.marketPrice })),
      },
      { key: "nav", label: "NAV", role: "reference", points: h.map((p) => ({ x: p.t, y: p.nav })) },
    ],
    annotations: [],
    spread: { a: "market", b: "nav" },
    smooth: false,
    zeroBased: false,
  };
}

export function premiumBarsSpec(res: EndpointResponse<"market">): BarsSpec {
  const h = res.data.history.filter((p) => p.premiumBps !== null);
  const bands = res.data.bands.flatMap((b) => [
    { y: b, label: `+${b} bps` },
    { y: -b, label: `−${b} bps` },
  ]);
  const last = h[h.length - 1];
  return {
    kind: "bars",
    id: "premium-bps",
    title: "Premium / discount",
    subtitle: "Market price against NAV, in basis points",
    provenance: provenanceFrom(res.meta, "history", "bands"),
    summary:
      last !== undefined
        ? `Latest premium ${formatBps(last.premiumBps, { sign: true })} over ${h.length} observations.`
        : "No premium history.",
    ...(res.data.historySince !== null
      ? { note: `Collecting since ${formatDate(res.data.historySince)}` }
      : {}),
    ...(h.length === 0 ? { empty: "No premium history has been collected yet." } : {}),
    unit: "bps",
    orientation: "vertical",
    diverging: true,
    bars: h.map((p) => ({
      label: p.t,
      value: p.premiumBps,
      tone: (p.premiumBps ?? 0) >= 0 ? "good" : "bad",
    })),
    thresholds: bands,
  };
}

export function sparklineSpec(
  id: string,
  title: string,
  kpi: EndpointResponse<"overview">["data"]["nav"],
  unit: TimeSeriesSpec["unit"],
  provenance: TimeSeriesSpec["provenance"],
): TimeSeriesSpec {
  const values = kpi.sparkline;
  const n = values.length;
  return {
    kind: "timeseries",
    id,
    title,
    provenance,
    summary:
      n > 0
        ? `${title} over the last ${n} days, latest ${kpi.value === null ? "not available" : String(kpi.value)}.`
        : `${title}: no history yet.`,
    ...(kpi.historySince !== null
      ? { note: `Collecting since ${formatDate(kpi.historySince)}` }
      : {}),
    ...(n < 2 ? { empty: "Not enough history yet." } : {}),
    variant: "line",
    unit,
    // The overview sparkline has no dates, only the last N days; offsets keep the table honest about that.
    series: [
      {
        key: id,
        label: title,
        role: "primary",
        points: values.map((y, i) => ({ x: `day ${i - (n - 1)}`, y })),
      },
    ],
    annotations: [],
    smooth: false,
    zeroBased: false,
    compact: true,
  };
}

export function waterfallSpec(res: EndpointResponse<"flows">): WaterfallSpec {
  const t = res.data.totals;
  const total = t.navEffect + t.flowEffect + t.residual;
  return {
    kind: "waterfall",
    id: "aum-change",
    title: "What moved AUM",
    subtitle: `Over ${res.data.range}, AUM ${total >= 0 ? "rose" : "fell"} by ${formatUsdCompact(Math.abs(total))}: NAV ${t.navEffect >= 0 ? "added" : "removed"} ${formatUsdCompact(Math.abs(t.navEffect))} and net flows ${t.flowEffect >= 0 ? "added" : "removed"} ${formatUsdCompact(Math.abs(t.flowEffect))}.`,
    provenance: provenanceFrom(res.meta, "totals"),
    summary: `AUM changed by ${formatUsdCompact(total)}: ${formatUsdCompact(t.navEffect)} from NAV, ${formatUsdCompact(t.flowEffect)} from net flows, ${formatUsdCompact(t.residual)} unexplained.`,
    unit: "usd",
    steps: [
      { label: "NAV effect", value: t.navEffect, type: "delta" },
      { label: "Flow effect", value: t.flowEffect, type: "delta" },
      { label: "Residual", value: t.residual, type: "delta" },
      { label: "Change in AUM", value: total, type: "total" },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Capital
// ---------------------------------------------------------------------------------------------

export function capitalStackedSpec(
  res: EndpointResponse<"capitalDistribution">,
  mode: StackedSpec["mode"] = "absolute",
): StackedSpec {
  const order = [...res.data.distribution]
    .sort((a, b) => b.capitalUsd - a.capitalUsd)
    .map((d) => d.protocol);
  const byDate = new Map<string, Record<string, number>>();
  for (const h of res.data.history) {
    const row = byDate.get(h.date) ?? {};
    row[h.protocol] = h.aumUsd;
    byDate.set(h.date, row);
  }
  const rows = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([x, values]) => ({ x, values }));
  const top = res.data.topProtocol;
  const from = rows[0]?.x;
  return {
    kind: "stacked",
    id: mode === "absolute" ? "capital-by-protocol" : "capital-share-by-protocol",
    title: mode === "absolute" ? "Where the capital sits" : "Share of capital by protocol",
    subtitle: "Capital attributed to each protocol, daily",
    provenance: provenanceFrom(res.meta, "distribution", "history"),
    summary:
      top !== null
        ? `${titleCase(top.protocol)} holds the largest share, ${formatPercent(top.share, 1)} of ${formatUsdCompact(res.data.totalAumUsd)} across ${order.length} protocols.`
        : "No capital distribution.",
    ...(from !== undefined ? { note: `History from ${formatDate(from)}` } : {}),
    ...(rows.length < 2 ? { empty: "Capital history has not been collected yet." } : {}),
    unit: mode === "absolute" ? "usd" : "pct",
    mode,
    keys: order.map((key) => ({ key, label: titleCase(key) })),
    rows,
  };
}

export function capitalStackBarSpec(res: EndpointResponse<"capitalStack">): StackBarSpec | null {
  const s = res.data.stack;
  if (s === null) return null;
  const parts = [
    { key: "bound", label: "Bound", value: s.boundUsd, basis: s.basis.bound },
    ...(s.offeredUsd > 0
      ? [{ key: "offered", label: "Offered", value: s.offeredUsd, basis: s.basis.offered }]
      : []),
    { key: "available", label: "Available", value: s.availableUsd, basis: s.basis.available },
    {
      key: "liquidity",
      label: "Liquidity layer (15% of AUM)",
      value: s.liquidityLayerUsd,
      basis: s.basis.liquidityLayer,
    },
  ];
  const sum = parts.reduce((a, p) => a + p.value, 0);
  return {
    kind: "stackbar",
    id: "capital-stack",
    title: "Capital stack",
    subtitle: "Bound, available and liquidity layer add up to AUM",
    provenance: provenanceFrom(res.meta, "stack"),
    summary: `${parts.map((p) => `${p.label} ${formatUsdCompact(p.value)}`).join(", ")}; total ${formatUsdCompact(s.aumUsd)}.`,
    note: "The liquidity layer here is the 15% policy share of AUM. The measured balance of liquid collateral is a different figure.",
    unit: "usd",
    parts,
    total: { label: "AUM", value: s.aumUsd },
    sumCheck: {
      sum,
      total: s.aumUsd,
      difference: sum - s.aumUsd,
      ok: Math.abs(sum - s.aumUsd) < 1,
    },
  };
}

export function capitalTreemapSpec(res: EndpointResponse<"capitalDistribution">): TreemapSpec {
  return {
    kind: "treemap",
    id: "capital-treemap",
    title: "Capital by protocol",
    provenance: provenanceFrom(res.meta, "distribution"),
    summary: `Capital across ${res.data.distribution.length} protocols, total ${formatUsdCompact(res.data.totalAumUsd)}.`,
    unit: "usd",
    root: res.data.distribution.map((d) => ({ name: titleCase(d.protocol), value: d.capitalUsd })),
  };
}

export function reservesTreemapSpec(res: EndpointResponse<"solvency">): TreemapSpec {
  return {
    kind: "treemap",
    id: "reserves-treemap",
    title: "Reserves by venue and asset",
    subtitle: "Accountable proof of reserves",
    provenance: provenanceFrom(res.meta, "venues"),
    summary: `Reserves of ${formatUsdCompact(res.data.reservesUsd)} across ${res.data.venues.length} venues.`,
    unit: "usd",
    root: res.data.venues.map((v) => ({
      name: v.venue,
      children: v.assets.map((a) => ({ name: a.asset, value: a.usd, tag: a.tag })),
    })),
  };
}

export function collateralSankeySpec(res: EndpointResponse<"yieldComposition">): SankeySpec {
  const all = res.data.collateral.assets.filter((a) => a.amountUsd > 0);
  const grandTotal = all.reduce((a, x) => a + x.amountUsd, 0);
  // Rows under 1% of the sheet would be unreadable slivers; they are grouped per flag, and still listed in the table.
  const big = all.filter((a) => a.amountUsd >= grandTotal * 0.01);
  const group = (flag: boolean): typeof big => {
    const small = all.filter((a) => a.liquidityLayer === flag && a.amountUsd < grandTotal * 0.01);
    return small.length === 0
      ? []
      : [
          {
            asset: `Smaller rows (${small.length})`,
            amountUsd: small.reduce((a, x) => a + x.amountUsd, 0),
            allocation: null,
            apy: null,
            liquidityLayer: flag,
            proofs: [],
          },
        ];
  };
  const assets = [...big, ...group(true), ...group(false)];
  const liquid = assets.filter((a) => a.liquidityLayer);
  const other = assets.filter((a) => !a.liquidityLayer);
  const sum = (xs: typeof assets): number => xs.reduce((a, x) => a + x.amountUsd, 0);
  const nodes = [
    { id: "total", label: "Collateral sheet" },
    { id: "liquid", label: "Liquid collateral rows" },
    { id: "other", label: "Other rows" },
    ...assets.map((a) => ({ id: `a:${a.asset}`, label: a.asset })),
  ];
  const links = [
    ...(liquid.length > 0 ? [{ source: "total", target: "liquid", value: sum(liquid) }] : []),
    ...(other.length > 0 ? [{ source: "total", target: "other", value: sum(other) }] : []),
    ...liquid.map((a) => ({ source: "liquid", target: `a:${a.asset}`, value: a.amountUsd })),
    ...other.map((a) => ({ source: "other", target: `a:${a.asset}`, value: a.amountUsd })),
  ];
  return {
    kind: "sankey",
    id: "collateral-flow",
    title: "Collateral by asset",
    subtitle: "Rows of the collateral sheet, split by liquidity-layer flag",
    provenance: provenanceFrom(res.meta, "collateral"),
    summary: `${assets.length} collateral rows totalling ${formatUsdCompact(sum(assets))}, of which ${formatUsdCompact(sum(liquid))} flagged as liquid collateral.`,
    note: "The sheet total can differ from AUM; see the source conflicts.",
    unit: "usd",
    nodes,
    links,
  };
}

// ---------------------------------------------------------------------------------------------
// Reinsurance
// ---------------------------------------------------------------------------------------------

export function layersGanttSpec(
  res: EndpointResponse<"reinsuranceLayers">,
  now: Date = new Date(),
): GanttSpec {
  const layers = [...res.data.layers].sort((a, b) => a.inception.localeCompare(b.inception));
  return {
    kind: "gantt",
    id: "layers-timeline",
    title: "Layers from inception to renewal",
    subtitle: "Coloured by structure; the line marks today",
    provenance: provenanceFrom(res.meta, "layers"),
    summary: `${layers.length} reinsurance layers; ${layers.filter((l) => l.pastRenewal).length} past their renewal date.`,
    today: now.toISOString().slice(0, 10),
    rows: layers.map((l) => ({
      id: l.layerId,
      label: `${l.uiLayerNumber} · ${l.perilFamily}`,
      start: l.inception,
      end: l.renewal,
      group: l.structureFamily,
      capital: l.capital,
      status: l.status,
    })),
  };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2 : (s[mid] ?? 0);
};

export function layersBubbleSpec(res: EndpointResponse<"reinsuranceLayers">): ScatterSpec {
  const usable = res.data.layers.filter((l) => l.expectedLossRatio !== null);
  const points = usable.map((l) => ({
    id: l.layerId,
    label: `${l.uiLayerNumber} · ${l.perilFamily} · ${l.structureFamily}`,
    x: l.expectedLossRatio ?? 0,
    y: l.expectedYield,
    size: l.capital,
    group: l.perilFamily,
  }));
  return {
    kind: "scatter",
    id: "layers-yield-vs-loss",
    title: "Expected yield against expected loss ratio",
    subtitle: "Bubble area is capital",
    provenance: provenanceFrom(res.meta, "layers"),
    summary: `${points.length} layers plotted; median expected loss ratio ${points.length > 0 ? formatPercent(median(points.map((p) => p.x)), 1) : "not available"}.`,
    ...(usable.length < res.data.layers.length
      ? {
          note: `${res.data.layers.length - usable.length} layers without an expected loss ratio are not drawn.`,
        }
      : {}),
    ...(points.length === 0 ? { empty: "No layer has an expected loss ratio." } : {}),
    xUnit: "pct",
    yUnit: "pct",
    xLabel: "Expected loss ratio",
    yLabel: "Expected yield",
    sizeLabel: "Capital (USD)",
    xLog: false,
    points,
    guides:
      points.length > 0
        ? [
            { axis: "x", value: median(points.map((p) => p.x)), label: "median loss ratio" },
            { axis: "y", value: median(points.map((p) => p.y)), label: "median yield" },
          ]
        : [],
  };
}

export function renewalBarsSpec(res: EndpointResponse<"reinsuranceSummary">): BarsSpec {
  const rows = [...res.data.renewalCalendar].sort((a, b) => a.key.localeCompare(b.key));
  return {
    kind: "bars",
    id: "renewal-calendar",
    title: "Capital rolling off by renewal month",
    provenance: provenanceFrom(res.meta, "renewalCalendar"),
    summary: `Capital by renewal month; the largest is ${rows.length > 0 ? rows.reduce((a, b) => (b.capital > a.capital ? b : a)).key : "not available"}.`,
    unit: "usd",
    orientation: "vertical",
    diverging: false,
    bars: rows.map((r) => ({ label: r.key, value: r.capital })),
    thresholds: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Points and DeFi
// ---------------------------------------------------------------------------------------------

export function navCalendarSpec(res: EndpointResponse<"nav">): CalendarSpec {
  return {
    kind: "calendar",
    id: "nav-increment-calendar",
    title: "Daily NAV increment",
    subtitle: "Parts per million per day; negative days stand out",
    provenance: provenanceFrom(res.meta, "series"),
    summary: `Daily NAV increment over ${res.data.series.length} days; ${res.data.smoothness.negativeDays} negative days.`,
    unit: "ppm",
    valueLabel: "NAV increment (ppm)",
    days: res.data.series.map((r) => ({ date: r.date, value: r.incrementPpm })),
  };
}

export function pointsCalendarSpec(res: EndpointResponse<"pointsGrowth">): CalendarSpec {
  const s = res.data.series;
  return {
    kind: "calendar",
    id: "points-emission-calendar",
    title: "Daily points emission",
    provenance: provenanceFrom(res.meta, "series"),
    summary: `Points emitted per day over ${s.length} days.`,
    ...(s.length < 2 ? { empty: "Points history has not been collected yet." } : {}),
    unit: "points",
    valueLabel: "Points per day",
    days: s.map((r) => ({ date: r.date, value: r.dailyTotal })),
  };
}

export function lorenzSpec(res: EndpointResponse<"concentration">): LorenzSpec {
  const d = res.data;
  const pts = [{ x: 0, y: 0 }, ...d.lorenz.map((p) => ({ x: p.population, y: p.points }))];
  return {
    kind: "lorenz",
    id: "points-lorenz",
    title: "How concentrated points are",
    subtitle: "Cumulative share of points held by the bottom share of wallets",
    provenance: provenanceFrom(res.meta, "lorenz", "gini"),
    summary: `Gini coefficient ${d.gini === null ? "not available" : d.gini.toFixed(3)} across ${formatCompact(d.wallets)} wallets.`,
    ...(d.snapshotDate !== null ? { note: `Snapshot of ${formatDate(d.snapshotDate)}` } : {}),
    points: pts,
    gini: d.gini,
    wallets: d.wallets,
  };
}

export function leaderboardBarsSpec(res: EndpointResponse<"leaderboard">, top = 10): BarsSpec {
  const rows = res.data.rows.slice(0, top);
  return {
    kind: "bars",
    id: "leaderboard-top",
    title: `Top ${rows.length} wallets by points`,
    provenance: provenanceFrom(res.meta, "rows"),
    summary: `The top wallet holds ${rows[0] !== undefined ? formatCompact(rows[0].totalPoints) : "—"} points.`,
    ...(res.data.snapshotDate !== null
      ? { note: `Snapshot of ${formatDate(res.data.snapshotDate)}` }
      : {}),
    unit: "points",
    orientation: "horizontal",
    diverging: false,
    bars: rows.map((r) => ({
      label: `#${r.rank} ${shortAddress(r.address)}`,
      value: r.totalPoints,
    })),
    thresholds: [],
  };
}

export function venueMixBarsSpec(res: EndpointResponse<"concentration">): BarsSpec {
  const rows = [...res.data.venueMix].sort((a, b) => b.points - a.points).slice(0, 10);
  return {
    kind: "bars",
    id: "venue-mix",
    title: "Points by venue",
    provenance: provenanceFrom(res.meta, "venueMix"),
    summary: `Points earned across ${res.data.venueMix.length} venues; the largest is ${rows[0]?.venue ?? "not available"}.`,
    unit: "points",
    orientation: "horizontal",
    diverging: false,
    bars: rows.map((r) => ({ label: r.venue, value: r.points })),
    thresholds: [],
  };
}

export function opportunitiesScatterSpec(res: EndpointResponse<"defiOpportunities">): ScatterSpec {
  const usable = res.data.opportunities.filter(
    (o) => o.apy !== null && o.tvl !== null && o.tvl > 0,
  );
  return {
    kind: "scatter",
    id: "defi-apy-vs-tvl",
    title: "DeFi opportunities: APY against TVL",
    subtitle: "TVL on a log axis",
    provenance: provenanceFrom(res.meta, "opportunities"),
    summary: `${usable.length} of ${res.data.opportunities.length} opportunities have both an APY and a TVL.`,
    ...(usable.length < res.data.opportunities.length
      ? {
          note: `${res.data.opportunities.length - usable.length} without a published APY or TVL are not drawn.`,
        }
      : {}),
    ...(usable.length === 0 ? { empty: "No opportunity has both an APY and a TVL." } : {}),
    xUnit: "usd",
    yUnit: "pct",
    xLabel: "TVL",
    yLabel: "APY",
    xLog: true,
    points: usable.map((o) => ({
      id: o.key,
      label: `${titleCase(o.protocol)} · ${o.strategy}`,
      x: o.tvl ?? 0,
      y: o.apy ?? 0,
      group: o.classification,
    })),
    guides: [],
  };
}

export function opportunityMultiplesSpec(
  res: EndpointResponse<"defiOpportunities">,
  top = 6,
): MultiplesSpec {
  const withHistory = res.data.opportunities
    .filter((o) => o.history.filter((h) => h.apy !== null).length >= 2)
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, top);
  return {
    kind: "multiples",
    id: "opportunity-apy-history",
    title: "APY history per opportunity",
    provenance: provenanceFrom(res.meta, "opportunities"),
    summary: `APY history for ${withHistory.length} opportunities.`,
    ...(withHistory.length === 0
      ? {
          empty:
            "APY history for opportunities is collected from the first worker run; there are not yet two points.",
        }
      : {}),
    sharedY: false,
    items: withHistory.map((o) => ({
      kind: "timeseries",
      id: `apy-${o.key}`,
      title: `${titleCase(o.protocol)} · ${o.strategy}`,
      provenance: provenanceFrom(res.meta, "opportunities"),
      summary: `APY history of ${o.protocol} ${o.strategy}.`,
      variant: "line",
      unit: "pct",
      series: [
        {
          key: "apy",
          label: "APY",
          role: "primary",
          points: o.history.map((h) => ({ x: h.t, y: h.apy })),
        },
      ],
      annotations: [],
      smooth: false,
      zeroBased: false,
      compact: true,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Ratios
// ---------------------------------------------------------------------------------------------

export function coverageBulletSpec(res: EndpointResponse<"market">): BulletSpec {
  const v = res.data.liquidityCoverage;
  const target = res.data.coverageTarget;
  return {
    kind: "bullet",
    id: "liquidity-coverage",
    title: "Liquid collateral vs 15% target",
    subtitle: "Measured balance of collateral flagged as liquid, against AUM",
    provenance: provenanceFrom(res.meta, "liquidityCoverage", "liquidityLayerUsd", "aumUsd"),
    summary:
      v === null
        ? "Liquid collateral share is not available."
        : `Liquid collateral ${formatPercent(v, 1)} of AUM against a ${formatPercent(target, 0)} target.`,
    unit: "pct",
    value: v,
    target: { value: target, label: `${formatPercent(target, 0)} target` },
    max: Math.max(0.3, Math.ceil(((v ?? 0) * 1.15) / 0.05) * 0.05),
    valueLabel: v === null ? "—" : formatPercent(v, 1),
  };
}

export function collateralBulletSpec(res: EndpointResponse<"solvency">): BulletSpec {
  const v = res.data.collateralization;
  return {
    kind: "bullet",
    id: "collateral-ratio",
    title: "Collateralisation",
    subtitle: "Proof-of-reserves reserves against token supply",
    provenance: provenanceFrom(res.meta, "collateralization"),
    summary:
      v === null
        ? "Collateralisation is not available."
        : `Reserves cover supply ${formatPercent(v, 2)}; the proof is ${res.data.ageHours === null ? "of unknown age" : `${Math.round(res.data.ageHours)} hours old`}.`,
    unit: "pct",
    value: v,
    target: { value: 1, label: "100% fully backed" },
    max: Math.max(1.2, Math.ceil(((v ?? 0) * 1.05) / 0.05) * 0.05),
    valueLabel: v === null ? "—" : formatPercent(v, 2),
  };
}

/** Daily net ONyc flow in dollars from program transactions (mints minus burns, valued at that day's NAV). */
export function chainFlowsSpec(res: EndpointResponse<"chainFlows">): BarsSpec {
  const days = res.data.series.filter((s) => s.netUsd !== null);
  const net = res.data.totals.netUsd;
  return {
    kind: "bars",
    id: "chain-flows",
    title: "Net supply change from transactions",
    subtitle: "ONyc minted minus burned each day, at NAV",
    provenance: provenanceFrom(res.meta, "series"),
    summary:
      net === null
        ? "No on-chain flow has been recorded yet."
        : `Net ${formatUsdCompact(net)} over ${days.length} days: ${formatCompact(res.data.totals.minted)} ONyc minted and ${formatCompact(res.data.totals.burned)} burned.`,
    ...(res.data.since !== null ? { note: `Collecting since ${formatDate(res.data.since)}` } : {}),
    ...(days.length === 0 ? { empty: "No program transactions have been recorded yet." } : {}),
    unit: "usd",
    orientation: "vertical",
    diverging: true,
    bars: days.map((s) => ({
      label: s.date,
      value: s.netUsd,
      tone: (s.netUsd ?? 0) >= 0 ? "good" : "bad",
    })),
    thresholds: [],
  };
}
