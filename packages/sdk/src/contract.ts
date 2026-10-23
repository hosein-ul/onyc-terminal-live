import { z } from "zod";
import {
  capitalStackResponseSchema,
  chainActivitySchema,
  chainFlowsSchema,
  chainTxSchema,
  chainHoldersSchema,
  chainStateSchema,
  concentrationSchema,
  distributionSchema,
  envelope,
  eventsSchema,
  flowsSchema,
  healthSchema,
  layersSchema,
  leaderboardSchema,
  marketSchema,
  navSchema,
  opportunitiesSchema,
  overviewSchema,
  pointsGrowthSchema,
  rangeSchema,
  reconciliationSchema,
  redemptionsSchema,
  reinsuranceSummarySchema,
  riskSchema,
  solvencySchema,
  vectorsSchema,
  walletSchema,
  yieldSchema,
} from "./schemas.js";

const solanaAddress = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "not a base58 Solana address");

const range = z.object({ range: rangeSchema.default("3m") });
const none = z.object({});

export interface EndpointDef {
  path: string;
  summary: string;
  tag: string;
  params: z.ZodObject;
  query: z.ZodObject;
  response: z.ZodType;
  /** Server-side cache lifetime in seconds. */
  ttl: number;
}

const def = <E extends EndpointDef>(e: E): E => e;

/** Every read endpoint. Paths use OpenAPI `{param}` syntax. */
export const endpoints = {
  overview: def({
    path: "/v1/overview",
    summary: "KPI bundle for the home screen",
    tag: "Overview",
    params: none,
    query: none,
    response: envelope(overviewSchema),
    ttl: 15,
  }),
  nav: def({
    path: "/v1/nav",
    summary: "Daily NAV, AUM, supply and derived returns",
    tag: "NAV",
    params: none,
    query: range,
    response: envelope(navSchema),
    ttl: 60,
  }),
  navVectors: def({
    path: "/v1/nav/vectors",
    summary: "Decoded price schedule and forward NAV path",
    tag: "NAV",
    params: none,
    query: none,
    response: envelope(vectorsSchema),
    ttl: 60,
  }),
  flows: def({
    path: "/v1/flows",
    summary: "Supply change and AUM attribution (price versus flow)",
    tag: "NAV",
    params: none,
    query: range,
    response: envelope(flowsSchema),
    ttl: 60,
  }),
  market: def({
    path: "/v1/market",
    summary: "Market price, premium or discount history, pools and liquidity",
    tag: "Market",
    params: none,
    query: z.object({ range: rangeSchema.default("1w") }),
    response: envelope(marketSchema),
    ttl: 30,
  }),
  redemptions: def({
    path: "/v1/redemptions",
    summary: "Redemption offers, fees, executed series, capacity settings and the public log",
    tag: "Market",
    params: none,
    query: z.object({ amount: z.coerce.number().positive().max(1e12).optional() }),
    response: envelope(redemptionsSchema),
    ttl: 30,
  }),
  reinsuranceLayers: def({
    path: "/v1/reinsurance/layers",
    summary: "The reinsurance book with derived fields",
    tag: "Reinsurance",
    params: none,
    query: none,
    response: envelope(layersSchema),
    ttl: 120,
  }),
  reinsuranceSummary: def({
    path: "/v1/reinsurance/summary",
    summary: "Concentration by peril family and structure, renewal calendar, history",
    tag: "Reinsurance",
    params: none,
    query: none,
    response: envelope(reinsuranceSummarySchema),
    ttl: 120,
  }),
  yieldComposition: def({
    path: "/v1/yield/composition",
    summary: "Collateral assets and reinsurance, with a blended APY check",
    tag: "Yield",
    params: none,
    query: none,
    response: envelope(yieldSchema),
    ttl: 120,
  }),
  capitalStack: def({
    path: "/v1/capital/stack",
    summary: "Bound, offered, available and liquidity layer capital against AUM",
    tag: "Capital",
    params: none,
    query: none,
    response: envelope(capitalStackResponseSchema),
    ttl: 60,
  }),
  capitalDistribution: def({
    path: "/v1/capital/distribution",
    summary: "Capital by protocol, now and over time",
    tag: "Capital",
    params: none,
    query: z.object({ range: rangeSchema.default("3m") }),
    response: envelope(distributionSchema),
    ttl: 300,
  }),
  capitalReconciliation: def({
    path: "/v1/capital/reconciliation",
    summary: "Circulating supply versus custody, attributed and unexplained capital",
    tag: "Capital",
    params: none,
    query: none,
    response: envelope(reconciliationSchema),
    ttl: 300,
  }),
  defiOpportunities: def({
    path: "/v1/defi/opportunities",
    summary: "Current DeFi opportunities with history per opportunity",
    tag: "Capital",
    params: none,
    query: z.object({ history: z.enum(["0", "1"]).default("0") }),
    response: envelope(opportunitiesSchema),
    ttl: 120,
  }),
  pointsGrowth: def({
    path: "/v1/points/growth",
    summary: "Points issued over time",
    tag: "Points",
    params: none,
    query: none,
    response: envelope(pointsGrowthSchema),
    ttl: 300,
  }),
  leaderboard: def({
    path: "/v1/points/leaderboard",
    summary: "Leaderboard page from the latest daily crawl",
    tag: "Points",
    params: none,
    query: z.object({
      page: z.coerce.number().int().min(0).max(100_000).default(0),
      size: z.coerce.number().int().min(1).max(200).default(50),
      q: z.string().trim().max(64).optional(),
    }),
    response: envelope(leaderboardSchema),
    ttl: 60,
  }),
  concentration: def({
    path: "/v1/points/concentration",
    summary: "Lorenz curve, Gini, top-N shares and venue mix",
    tag: "Points",
    params: none,
    query: none,
    response: envelope(concentrationSchema),
    ttl: 300,
  }),
  wallet: def({
    path: "/v1/wallet/{address}",
    summary: "Points, rank, breakdown, referrals and balance for one wallet",
    tag: "Wallet",
    params: z.object({ address: solanaAddress }),
    query: none,
    response: envelope(walletSchema),
    ttl: 60,
  }),
  solvency: def({
    path: "/v1/solvency",
    summary: "Proof of solvency and reserves by venue",
    tag: "Risk",
    params: none,
    query: none,
    response: envelope(solvencySchema),
    ttl: 60,
  }),
  risk: def({
    path: "/v1/risk",
    summary: "Independent risk signals, each with its value, threshold and source",
    tag: "Risk",
    params: none,
    query: none,
    response: envelope(riskSchema),
    ttl: 60,
  }),
  healthSources: def({
    path: "/v1/health/sources",
    summary: "Source health and cross-source conflicts",
    tag: "Health",
    params: none,
    query: none,
    response: envelope(healthSchema),
    ttl: 15,
  }),
  events: def({
    path: "/v1/events",
    summary: "Activity feed",
    tag: "Activity",
    params: none,
    query: z.object({
      kind: z.string().trim().max(64).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    response: envelope(eventsSchema),
    ttl: 15,
  }),
  chainState: def({
    path: "/v1/chain/state",
    summary:
      "What the OnRe program says on chain, next to the API: supply, NAV, offers, redemptions, custody",
    tag: "On-chain",
    params: none,
    query: none,
    response: envelope(chainStateSchema),
    ttl: 30,
  }),
  chainActivity: def({
    path: "/v1/chain/activity",
    summary:
      "Program transactions classified from instruction data: mints, redemptions, price vectors, configuration",
    tag: "On-chain",
    params: none,
    query: z.object({
      kind: z.string().trim().max(240).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    response: envelope(chainActivitySchema),
    ttl: 15,
  }),
  chainTx: def({
    path: "/v1/chain/tx/{signature}",
    summary:
      "One transaction read from Solana: who moved which tokens, and which programs were called",
    tag: "On-chain",
    params: z.object({ signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,100}$/) }),
    query: none,
    response: envelope(chainTxSchema),
    ttl: 300,
  }),
  chainFlows: def({
    path: "/v1/chain/flows",
    summary: "Daily ONyc minted and burned, from transactions",
    tag: "On-chain",
    params: none,
    query: range,
    response: envelope(chainFlowsSchema),
    ttl: 60,
  }),
  chainHolders: def({
    path: "/v1/chain/holders",
    summary:
      "Top holders of ONyc with labels, concentration and a cross-check against capital by protocol",
    tag: "On-chain",
    params: none,
    query: none,
    response: envelope(chainHoldersSchema),
    ttl: 300,
  }),
} satisfies Record<string, EndpointDef>;

export type EndpointName = keyof typeof endpoints;
export type EndpointQuery<K extends EndpointName> = z.input<(typeof endpoints)[K]["query"]>;
export type EndpointParams<K extends EndpointName> = z.input<(typeof endpoints)[K]["params"]>;
export type EndpointResponse<K extends EndpointName> = z.output<(typeof endpoints)[K]["response"]>;
