export type RiskState = "ok" | "watch" | "alert" | "unavailable";

/** Our own thresholds (settings, not data). Each signal shows its threshold next to its value. */
export interface RiskThresholds {
  discountBps: { watch: number; alert: number };
  /** Coverage below `watch` (the 15% target) or `alert` is flagged. */
  liquidityCoverage: { watch: number; alert: number };
  collateralization: { watch: number; alert: number };
  solvencyAgeHours: { watch: number; alert: number };
  topProtocolShare: { watch: number; alert: number };
  loopingShare: { watch: number; alert: number };
  topPerilShare: { watch: number; alert: number };
  /** Negative: supply falling by more than this fraction over 30 days. */
  supplyChange30d: { watch: number; alert: number };
  sourceSpread: { watch: number; alert: number };
  navAnomalies30d: { watch: number; alert: number };
  aumDerivedDivergence: { watch: number; alert: number };
  pastRenewalLayers: { watch: number; alert: number };
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  discountBps: { watch: 25, alert: 50 },
  liquidityCoverage: { watch: 0.15, alert: 0.1 },
  collateralization: { watch: 1.0, alert: 0.99 },
  solvencyAgeHours: { watch: 24, alert: 72 },
  topProtocolShare: { watch: 0.5, alert: 0.7 },
  loopingShare: { watch: 0.5, alert: 0.75 },
  topPerilShare: { watch: 0.4, alert: 0.6 },
  supplyChange30d: { watch: -0.1, alert: -0.25 },
  sourceSpread: { watch: 0.02, alert: 0.05 },
  navAnomalies30d: { watch: 1, alert: 3 },
  aumDerivedDivergence: { watch: 0.01, alert: 0.05 },
  pastRenewalLayers: { watch: 1, alert: 5 },
};

/** "high": worse as the value rises. "low": worse as it falls. */
export function grade(
  value: number | null,
  limits: { watch: number; alert: number },
  worse: "high" | "low",
): RiskState {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  if (worse === "high")
    return value >= limits.alert ? "alert" : value >= limits.watch ? "watch" : "ok";
  return value <= limits.alert ? "alert" : value < limits.watch ? "watch" : "ok";
}

export interface RiskInput {
  /** Negative is a discount. */
  premiumBps: number | null;
  liquidityCoverage: number | null;
  collateralization: number | null;
  solvencyAgeHours: number | null;
  topProtocol: { name: string; share: number } | null;
  loopingShare: number | null;
  topPeril: { name: string; share: number } | null;
  supplyChange30d: number | null;
  sourceSpread: number | null;
  navAnomalies30d: number | null;
  aumDerivedDivergence: number | null;
  pastRenewal: { count: number; capital: number } | null;
}

export interface RiskSignal {
  id: string;
  label: string;
  state: RiskState;
  value: number | null;
  unit: "bps" | "fraction" | "ratio" | "hours" | "count";
  /** The `watch` and `alert` limits used, and which direction is worse. */
  threshold: { watch: number; alert: number; worse: "high" | "low" };
  note?: string;
}

/**
 * Independent signals. There is deliberately no blended score: every state comes from one value and one
 * threshold shown beside it.
 */
export function buildRiskSignals(
  input: RiskInput,
  t: RiskThresholds = DEFAULT_RISK_THRESHOLDS,
): RiskSignal[] {
  const make = (
    id: string,
    label: string,
    value: number | null,
    unit: RiskSignal["unit"],
    limits: { watch: number; alert: number },
    worse: "high" | "low",
    note?: string,
  ): RiskSignal => ({
    id,
    label,
    state: grade(value, limits, worse),
    value,
    unit,
    threshold: { ...limits, worse },
    ...(note === undefined ? {} : { note }),
  });
  // A discount is a negative premium; compare its size.
  const discount = input.premiumBps === null ? null : Math.max(0, -input.premiumBps);
  return [
    make(
      "discount",
      "Market discount vs NAV",
      discount,
      "bps",
      t.discountBps,
      "high",
      "Size of the discount; a premium reads 0.",
    ),
    make(
      "liquidity_coverage",
      "Liquidity layer coverage",
      input.liquidityCoverage,
      "fraction",
      t.liquidityCoverage,
      "low",
      "Target 15% of AUM.",
    ),
    make(
      "collateralization",
      "Collateralization (Accountable)",
      input.collateralization,
      "ratio",
      t.collateralization,
      "low",
    ),
    make(
      "solvency_age",
      "Solvency data age",
      input.solvencyAgeHours,
      "hours",
      t.solvencyAgeHours,
      "high",
    ),
    make(
      "top_protocol",
      "Top protocol share of capital",
      input.topProtocol?.share ?? null,
      "fraction",
      t.topProtocolShare,
      "high",
      input.topProtocol?.name,
    ),
    make(
      "looping_share",
      "Looping share of capital",
      input.loopingShare,
      "fraction",
      t.loopingShare,
      "high",
      "Kamino + Loopscale.",
    ),
    make(
      "peril_concentration",
      "Top peril family share of bound capital",
      input.topPeril?.share ?? null,
      "fraction",
      t.topPerilShare,
      "high",
      input.topPeril?.name,
    ),
    make(
      "supply_trend",
      "30-day change in circulating supply",
      input.supplyChange30d,
      "fraction",
      t.supplyChange30d,
      "low",
    ),
    make(
      "data_divergence",
      "Spread between AUM sources",
      input.sourceSpread,
      "fraction",
      t.sourceSpread,
      "high",
    ),
    make(
      "nav_anomalies",
      "NAV anomalies in the last 30 days",
      input.navAnomalies30d,
      "count",
      t.navAnomalies30d,
      "high",
    ),
    make(
      "aum_derived",
      "AUM derived from bound capital vs reported",
      input.aumDerivedDivergence,
      "fraction",
      t.aumDerivedDivergence,
      "high",
    ),
    make(
      "past_renewal",
      "Bound layers past their renewal month",
      input.pastRenewal?.count ?? null,
      "count",
      t.pastRenewalLayers,
      "high",
    ),
  ];
}
