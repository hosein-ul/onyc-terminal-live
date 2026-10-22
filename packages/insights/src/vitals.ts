import {
  formatBps,
  formatNav,
  formatNumber,
  formatPercent,
  formatRelativeAge,
  formatUsdCompact,
} from "@onyc/format";
import type { EndpointResponse, Kpi, Meta } from "@onyc/sdk";

type Overview = EndpointResponse<"overview">;
type Nav = EndpointResponse<"nav">;
type Flows = EndpointResponse<"flows">;
type Risk = EndpointResponse<"risk">;
type Solvency = EndpointResponse<"solvency">;
type Redemptions = EndpointResponse<"redemptions">;

export type Tone = "good" | "watch" | "bad" | "neutral";

export interface Vital {
  id: "nav" | "apy" | "aum" | "premium" | "solvency" | "exit";
  label: string;
  termId: string;
  /** The big number as text. */
  value: string;
  unitNote: string | null;
  /** One line under the number. */
  detail: string;
  tone: Tone;
  /** The KPI behind a sparkline, for the sparkline builder; null when there is not enough history to draw one. */
  kpi: Kpi | null;
  sparkUnit: "nav" | "usd" | "bps" | "pct";
  /** "Collecting since 22 Oct 2026" when a number has less history than its period. */
  collecting: string | null;
  source: string;
  fetchedAt: string | null;
}

export interface VitalsInput {
  overview: Overview | undefined;
  nav: Nav | undefined;
  flows: Flows | undefined;
  risk: Risk | undefined;
  solvency: Solvency | undefined;
  redemptions: Redemptions | undefined;
}

const SPARK_MIN = 7;

const metaOf = (m: Record<string, Meta> | undefined, key: string): Meta | undefined => m?.[key];

function sparkOf(kpi: Kpi | undefined): Kpi | null {
  if (kpi === undefined) return null;
  return kpi.sparkline.filter((v) => v !== null).length >= SPARK_MIN ? kpi : null;
}

const toneOf = (state: string | undefined): Tone =>
  state === "alert" ? "bad" : state === "watch" ? "watch" : state === "ok" ? "good" : "neutral";

/** The 30-day NAV return: annualised, as a fraction, from NAV history. */
export function realisedApy30d(nav: Nav | undefined): number | null {
  return nav?.data.returns.find((r) => r.window === "30d")?.annualized ?? null;
}

/** Days with a NAV fall in the 30 days before `now`. null while NAV history is not loaded. */
export function navDownticks30d(nav: Nav | undefined, now: Date = new Date()): number | null {
  if (nav === undefined) return null;
  const from = now.getTime() - 30 * 86_400_000;
  return nav.data.events.filter(
    (e) => e.reason === "downtick" && new Date(e.date).getTime() >= from,
  ).length;
}

const collectingOf = (k: { historySince: string | null } | undefined): string | null =>
  k?.historySince ?? null;

/** The six vitals. Missing inputs give "—" and a neutral tone; nothing is estimated. */
export function buildVitals(i: VitalsInput): Vital[] {
  const o = i.overview?.data;
  const signal = (id: string) => i.risk?.data.signals.find((s) => s.id === id);
  const realised = realisedApy30d(i.nav);
  const reported = o?.apy.reported ?? o?.apy.value ?? null;
  const netFlow = i.flows?.data.totals.netFlowUsd ?? null;
  const aum = o?.aum.value ?? null;
  const flowShare = netFlow !== null && aum !== null && aum > 0 ? netFlow / aum : null;
  const fee = i.redemptions?.data.offers.find((x) => !x.disabled)?.feeBps ?? null;
  const stack = o?.capital.stack ?? null;
  const solv = i.solvency?.data;
  const ageH = solv?.ageHours ?? null;
  const cov = o?.liquidityCoverage.value ?? null;

  const navChange = o?.nav.change ?? null;
  const gap = reported !== null && realised !== null ? realised - reported : null;
  const sol = solv?.retrievedAt ?? null;

  return [
    {
      id: "nav",
      label: "NAV",
      termId: "nav",
      value: formatNav(o?.nav.value, 4),
      unitNote: "USDC per ONyc",
      detail:
        navChange === null
          ? "30-day change not available"
          : `${formatPercent(navChange, 2, { sign: true })} in 30 days`,
      tone: "neutral",
      kpi: sparkOf(o?.nav),
      sparkUnit: "nav",
      collecting: collectingOf(o?.nav),
      source: metaOf(i.overview?.meta, "nav")?.source ?? "OnRe core API",
      fetchedAt: metaOf(i.overview?.meta, "nav")?.fetchedAt ?? null,
    },
    {
      id: "apy",
      label: "APY",
      termId: "apy",
      value: formatPercent(reported, 2),
      unitNote: "reported by OnRe",
      detail:
        realised === null
          ? "30-day realised APY not available"
          : `${formatPercent(realised, 2)} realised over 30 days${gap !== null && Math.abs(gap) >= 0.01 ? ` (${formatPercent(gap, 1, { sign: true })} vs reported)` : ""}`,
      tone: gap !== null && Math.abs(gap) >= 0.015 ? "watch" : "neutral",
      kpi: null,
      sparkUnit: "pct",
      collecting: null,
      source: "OnRe core API (live APY) and NAV history",
      fetchedAt: metaOf(i.overview?.meta, "apy")?.fetchedAt ?? null,
    },
    {
      id: "aum",
      label: "AUM",
      termId: "aum",
      value: formatUsdCompact(aum),
      unitNote: null,
      detail:
        netFlow === null
          ? "30-day net flow not available"
          : `${netFlow < 0 ? "−" : "+"}${formatUsdCompact(Math.abs(netFlow))} net flow in 30 days`,
      tone:
        flowShare === null
          ? "neutral"
          : flowShare <= -0.1
            ? "bad"
            : flowShare <= -0.03
              ? "watch"
              : "good",
      kpi: sparkOf(o?.aum),
      sparkUnit: "usd",
      collecting: collectingOf(o?.aum),
      source: metaOf(i.overview?.meta, "aum")?.source ?? "OnRe core API",
      fetchedAt: metaOf(i.overview?.meta, "aum")?.fetchedAt ?? null,
    },
    {
      id: "premium",
      label: "Market vs NAV",
      termId: "premium-discount",
      value: formatBps(o?.premiumBps.value, { sign: true }),
      unitNote:
        o?.premiumBps.value === undefined || o.premiumBps.value === null
          ? null
          : o.premiumBps.value < 0
            ? "discount"
            : "premium",
      detail: "Jupiter price against OnRe NAV",
      tone: toneOf(signal("discount")?.state),
      kpi: sparkOf(o?.premiumBps),
      sparkUnit: "bps",
      collecting: collectingOf(o?.premiumBps),
      source: metaOf(i.overview?.meta, "premiumBps")?.source ?? "Jupiter price API",
      fetchedAt: metaOf(i.overview?.meta, "premiumBps")?.fetchedAt ?? null,
    },
    {
      id: "solvency",
      label: "Solvency",
      termId: "proof-of-solvency",
      value: formatPercent(solv?.collateralization, 1),
      unitNote: "assets vs tokens",
      detail:
        ageH === null
          ? "report age not available"
          : `report is ${sol === null ? `${formatNumber(ageH, 0)} h` : formatRelativeAge(sol).replace(" ago", "")} old`,
      tone: toneOf(
        signal("solvency_age")?.state === "ok"
          ? signal("collateralization")?.state
          : signal("solvency_age")?.state,
      ),
      kpi: null,
      sparkUnit: "pct",
      collecting: null,
      source: "Accountable proof of solvency",
      fetchedAt: sol,
    },
    {
      id: "exit",
      label: "Exit capacity",
      termId: "liquidity-layer",
      value: formatUsdCompact(stack?.measuredLiquidityLayerUsd ?? null),
      unitNote:
        cov === null ? "liquid collateral" : `liquid collateral, ${formatPercent(cov, 1)} of AUM`,
      detail: `${fee === null ? "redemption fee not available" : `${formatBps(fee)} redemption fee`} · policy layer ${formatUsdCompact(stack?.liquidityLayerUsd ?? null)} (${formatPercent(stack?.liquidityTarget ?? null, 0)} of AUM)`,
      tone: toneOf(signal("liquidity_coverage")?.state),
      kpi: null,
      sparkUnit: "pct",
      collecting: null,
      source: "OnRe collateral sheet and redemption offers",
      fetchedAt: metaOf(i.overview?.meta, "liquidityCoverage")?.fetchedAt ?? null,
    },
  ];
}
