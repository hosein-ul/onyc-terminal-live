import { formatBps, formatNumber, formatPercent } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";

type Risk = EndpointResponse<"risk">;
type Signal = Risk["data"]["signals"][number];

export type LightState = "ok" | "watch" | "alert" | "unavailable";

export interface Light {
  id: string;
  label: string;
  /** Glossary term id for the "?" next to the label. */
  termId: string | null;
  state: LightState;
  /** The value as text, for example "12 bps". */
  value: string;
  /** The limit as text, for example "watch from 25 bps, alert from 50 bps". */
  threshold: string;
  source: string;
  asOf: string | null;
  note: string | null;
}

/** The six lights on the Overview, in order. The other signals stay on the Risk page. */
export const SAFETY_IDS = [
  { id: "discount", label: "Market discount", termId: "premium-discount" },
  { id: "liquidity_coverage", label: "Liquid collateral vs 15% target", termId: "liquidity-layer" },
  { id: "solvency_age", label: "Solvency report age", termId: "proof-of-solvency" },
  { id: "top_protocol", label: "Biggest protocol share", termId: null },
  { id: "nav_anomalies", label: "NAV down-ticks and jumps", termId: "down-tick" },
  { id: "data_divergence", label: "Sources disagree on AUM", termId: "aum" },
] as const;

function show(value: number, unit: Signal["unit"]): string {
  switch (unit) {
    case "bps":
      return formatBps(value);
    case "fraction":
      return formatPercent(value, 1);
    case "ratio":
      return formatPercent(value, 2);
    case "hours":
      return value >= 48 ? `${formatNumber(value / 24, 1)} days` : `${formatNumber(value, 0)} h`;
    case "count":
      return formatNumber(value, 0);
  }
}

function limits(s: Signal): string {
  const dir = s.threshold.worse === "high" ? "from" : "below";
  const w = show(s.threshold.watch, s.unit);
  const a = show(s.threshold.alert, s.unit);
  return `watch ${dir} ${w}, alert ${dir} ${a}`;
}

/** The six safety lights from the risk endpoint. A light for a signal the API did not send reads "unavailable". */
export function buildSafetyBoard(risk: Risk | undefined): Light[] {
  return SAFETY_IDS.map(({ id, label, termId }) => {
    const s = risk?.data.signals.find((x) => x.id === id);
    if (s === undefined) {
      return {
        id,
        label,
        termId,
        state: "unavailable",
        value: "—",
        threshold: "",
        source: "OnRe and market data",
        asOf: null,
        note: null,
      };
    }
    return {
      id,
      label,
      termId,
      state: s.state,
      value: s.value === null ? "—" : show(s.value, s.unit),
      threshold: limits(s),
      source: s.source,
      asOf: s.asOf,
      note: s.note ?? null,
    };
  });
}
