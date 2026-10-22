import type { ChartSpec } from "@onyc/chart-specs";
import {
  formatBps,
  formatCompact,
  formatDate,
  formatNav,
  formatPercent,
  formatUsdCompact,
} from "@onyc/format";
import type { Kpi as KpiData, Meta } from "@onyc/sdk";
import { Chart } from "../charts";
import { signedBps, signedPct, signedUsd } from "../lib/format";
import { Provenance } from "./Provenance";
import { Gloss } from "./Term";

export type KpiKind = "nav" | "usd" | "count" | "apy" | "bps" | "pct";

const VALUE: Record<KpiKind, (v: number | null) => string> = {
  nav: (v) => formatNav(v, 4),
  usd: (v) => formatUsdCompact(v),
  count: (v) => formatCompact(v),
  apy: (v) => formatPercent(v, 2),
  bps: (v) => formatBps(v),
  pct: (v) => formatPercent(v, 1),
};

/** An absolute change is in the value's own unit; ratios move in percentage points. */
const ABSOLUTE: Record<KpiKind, (v: number | null) => string> = {
  nav: (v) => (v === null ? "—" : `${v >= 0 ? "+" : "−"}${formatNav(Math.abs(v), 4)}`),
  usd: signedUsd,
  count: (v) => (v === null ? "—" : `${v >= 0 ? "+" : "−"}${formatCompact(Math.abs(v))}`),
  apy: (v) => (v === null ? "—" : `${signedPct(v)} pts`.replace("% pts", " pts")),
  bps: signedBps,
  pct: (v) => (v === null ? "—" : `${signedPct(v, 1)}`.replace("%", " pts")),
};

interface Props {
  label: string;
  kind: KpiKind;
  kpi: KpiData;
  meta: Meta | undefined;
  spark: ChartSpec | null;
  /** Unit shown after the value, for example "USDC". */
  suffix?: string;
  /** Premium and discount are neither good nor bad; show their change in the neutral tone. */
  neutralChange?: boolean;
}

/** One headline number: value, change over the period, a sparkline and its source and age. */
export function KpiCard({ label, kind, kpi, meta, spark, suffix, neutralChange = false }: Props) {
  const change = kpi.change;
  // With less history than the period the API reports no honest change; say since when it has data instead.
  const showChange = change !== null && kpi.historySince === null;
  const tone =
    neutralChange || change === null || change === 0 ? "neutral" : change > 0 ? "good" : "bad";
  const text =
    change === null
      ? ""
      : kpi.changeMode === "relative"
        ? signedPct(change, 2)
        : ABSOLUTE[kind](change);
  const valueText = VALUE[kind](kpi.value);
  // A sparkline with only a few points says nothing; hide it until a week of history exists.
  const hasHistory = kpi.sparkline.filter((v) => v !== null).length >= 7;
  return (
    <article className="kpi">
      <div className="kpi-label">
        <Gloss text={label} />
      </div>
      <div className="kpi-value">
        {valueText.startsWith("−") ? (
          <>
            <span className="sign">−</span>
            {valueText.slice(1)}
          </>
        ) : (
          valueText
        )}
        {suffix !== undefined && kpi.value !== null && (
          <span className="kpi-suffix"> {suffix}</span>
        )}
      </div>
      {showChange && (
        <div className="kpi-change">
          <span className={`pill pill-${tone}`}>{text}</span>
          <span className="kpi-period">over {kpi.period}</span>
        </div>
      )}
      {spark !== null && spark.empty === undefined && hasHistory && (
        <div className="kpi-spark">
          <Chart spec={spark} height={64} />
        </div>
      )}
      {kpi.historySince !== null && (
        <div className="kpi-note">Collecting history since {formatDate(kpi.historySince)}</div>
      )}
      <Provenance meta={meta} />
    </article>
  );
}
