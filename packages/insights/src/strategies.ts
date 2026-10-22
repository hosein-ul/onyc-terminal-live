import type { EndpointResponse } from "@onyc/sdk";

type Opportunity = EndpointResponse<"defiOpportunities">["data"]["opportunities"][number];

export type StrategyFilter = "yield" | "points" | "conservative";

/** How the money is exposed, in plain words. This is this tool's reading of OnRe's own classification column. */
export type RiskKind =
  | "leveraged"
  | "lending"
  | "fixed-rate"
  | "pool"
  | "yield-bet"
  | "vault"
  | "protected"
  | "first-loss"
  | "other";

export const RISK_KIND_LABEL: Record<RiskKind, string> = {
  leveraged: "Leveraged loop",
  lending: "Lending",
  "fixed-rate": "Fixed rate",
  pool: "Trading pool",
  "yield-bet": "Yield bet",
  vault: "Managed vault",
  protected: "Protected share",
  "first-loss": "First-loss share",
  other: "Other",
};

export const RISK_KIND_NOTE: Record<RiskKind, string> = {
  leveraged: "Borrowed money magnifies gains and losses; a price drop can force a sale.",
  lending: "You lend ONyc and earn interest; the risk is the borrower side and the app's code.",
  "fixed-rate": "You lock in a fixed return until a set date.",
  pool: "You supply ONyc and another asset to a trading pool; the mix of the two changes as people trade.",
  "yield-bet": "You hold only the yield, which can pay a lot or nothing.",
  vault: "A manager moves your money between strategies.",
  protected: "You are paid back after the first-loss share has absorbed losses.",
  "first-loss": "You absorb losses before anyone else, and are paid more for it.",
  other: "See the venue.",
};

export function riskKind(o: Opportunity): RiskKind {
  const c = o.classification.toLowerCase();
  const key = o.key.toLowerCase();
  if (c.includes("loop")) return "leveraged";
  if (c.includes("tranch")) return key.includes("jronyc") ? "first-loss" : "protected";
  if (c.includes("lending")) return key.includes("pt-") ? "fixed-rate" : "lending";
  if (c.includes("liquidity")) return "pool";
  if (c.includes("yield")) return key.includes("pt-") ? "fixed-rate" : "yield-bet";
  if (c.includes("vault")) return "vault";
  return "other";
}

/** Kinds that count as conservative: no borrowing against the position and no first-loss tranche. */
const CONSERVATIVE: ReadonlySet<RiskKind> = new Set([
  "lending",
  "fixed-rate",
  "protected",
  "vault",
]);

/** Smaller venues are left out because a few thousand dollars of TVL cannot take a real position. */
export const MIN_TVL_USD = 100_000;

export interface Strategy {
  key: string;
  protocol: string;
  strategy: string;
  assets: string;
  apy: number | null;
  tvl: number | null;
  pointsMultiplier: number | null;
  kind: RiskKind;
  link: string;
  isNew: boolean;
}

export const FILTER_RULE: Record<StrategyFilter, string> = {
  yield: "Highest APY first.",
  points: "Highest points multiplier first, then APY.",
  conservative:
    "Lending, fixed-rate, protected-share and managed-vault venues only, highest APY first. No leverage, no first-loss share.",
};

/** The top places for ONyc now, for one filter. Venues marked coming soon, without an APY or under the TVL floor are skipped. */
export function pickStrategies(opps: Opportunity[], filter: StrategyFilter, n = 5): Strategy[] {
  const rows = opps
    .filter((o) => !o.comingSoon && o.apy !== null && (o.tvl ?? 0) >= MIN_TVL_USD)
    .map((o): Strategy => ({
      key: o.key,
      protocol: o.protocol,
      strategy: o.strategy,
      assets: o.assets.map((a) => a.symbol).join(" + "),
      apy: o.apy,
      tvl: o.tvl,
      pointsMultiplier: o.pointsMultiplier,
      kind: riskKind(o),
      link: o.link,
      isNew: o.isNew,
    }))
    .filter((s) => filter !== "conservative" || CONSERVATIVE.has(s.kind));
  const apy = (s: Strategy): number => s.apy ?? 0;
  const pts = (s: Strategy): number => s.pointsMultiplier ?? 0;
  rows.sort((a, b) => (filter === "points" ? pts(b) - pts(a) || apy(b) - apy(a) : apy(b) - apy(a)));
  return rows.slice(0, n);
}
