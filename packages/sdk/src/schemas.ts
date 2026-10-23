import { z } from "zod";

/**
 * Response contracts for the /v1 API. The API validates every response against these, the OpenAPI document is
 * generated from them, and the client and hooks infer their types from them.
 */

export const metaSchema = z.object({
  /** Human-readable source, for the chart footer: "OnRe core API". */
  source: z.string(),
  /** When the underlying data was fetched; null when it has never been fetched. */
  fetchedAt: z.string().nullable(),
  stale: z.boolean(),
});
export type Meta = z.infer<typeof metaSchema>;

/** `meta` is keyed by the name of the field (or section) of `data` that it describes. */
export const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ data, meta: z.record(z.string(), metaSchema) });

const n = z.number();
const nn = z.number().nullable();
const iso = z.string();

export const rangeSchema = z.enum(["1w", "1m", "3m", "1y", "all"]);
export type Range = z.infer<typeof rangeSchema>;

export const pointSchema = z.object({ t: iso, v: nn });
export type Point = z.infer<typeof pointSchema>;

export const eventSchema = z.object({
  id: n,
  ts: iso,
  kind: z.string(),
  severity: z.enum(["info", "watch", "alert"]),
  title: z.string(),
  body: z.string(),
  data: z.unknown(),
});
export type EventItem = z.infer<typeof eventSchema>;

// ---------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------

export const kpiSchema = z.object({
  value: nn,
  /**
   * Change over `period`. `changeMode` says what it is: "relative" is a fraction of the starting value (0.0595 means
   * +5.95%), "absolute" is the difference in the value's own unit.
   */
  change: nn,
  changeMode: z.enum(["relative", "absolute"]),
  period: z.string(),
  /** Up to 30 daily values, oldest first. Empty when no history exists yet. */
  sparkline: z.array(nn),
  /** "collecting since <date>" when the history is shorter than the period. */
  historySince: iso.nullable(),
});
export type Kpi = z.infer<typeof kpiSchema>;

export const attributionSchema = z.object({
  date: iso,
  navEffect: n,
  flowEffect: n,
  deltaAum: n,
  residual: n,
});

export const capitalStackSchema = z.object({
  boundUsd: n,
  offeredUsd: n,
  availableUsd: n,
  liquidityLayerUsd: n,
  sumUsd: n,
  aumUsd: n,
  difference: n,
  sumsToAum: z.boolean(),
  /** The liquidity layer in the stack is the policy share of AUM; this is the measured balance of flagged collateral. */
  measuredLiquidityLayerUsd: nn,
  liquidityTarget: n,
  /** Where each part comes from. */
  basis: z.object({
    bound: z.string(),
    offered: z.string(),
    available: z.string(),
    liquidityLayer: z.string(),
    aum: z.string(),
  }),
});
export type CapitalStackView = z.infer<typeof capitalStackSchema>;

export const protocolShareSchema = z.object({
  protocol: z.string(),
  capitalUsd: n,
  share: n,
});

export const aumSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  aumUsd: nn,
  asOf: iso.nullable(),
});

export const overviewSchema = z.object({
  nav: kpiSchema,
  apy: kpiSchema.extend({ reported: nn }),
  aum: kpiSchema,
  circulatingSupply: kpiSchema,
  premiumBps: kpiSchema,
  collateralRatio: kpiSchema,
  liquidityCoverage: kpiSchema,
  navSeries: z.array(z.object({ date: iso, nav: n })),
  navEvents: z.array(z.object({ date: iso, kind: z.string(), label: z.string() })),
  whatChanged: z.object({
    attribution: attributionSchema.nullable(),
    events: z.array(eventSchema),
  }),
  capital: z.object({
    stack: capitalStackSchema.nullable(),
    distribution: z.array(protocolShareSchema),
    asOfDate: iso.nullable(),
  }),
  sourceCheck: z.object({ sources: z.array(aumSourceSchema), spread: nn }),
});

// ---------------------------------------------------------------------------------------------
// NAV and yield
// ---------------------------------------------------------------------------------------------

export const navRowSchema = z.object({
  date: iso,
  nav: n,
  aum: nn,
  circulatingSupply: nn,
  apyReported: nn,
  incrementPpm: nn,
});

export const stepEventSchema = z.object({
  date: iso,
  ppm: n,
  reason: z.enum(["downtick", "outlier", "new_vector"]),
});

export const windowReturnSchema = z.object({
  window: z.enum(["7d", "30d", "90d", "ytd", "inception"]),
  from: iso,
  to: iso,
  days: n,
  return: n,
  annualized: n,
});

export const navSchema = z.object({
  range: rangeSchema,
  series: z.array(navRowSchema),
  events: z.array(stepEventSchema),
  returns: z.array(windowReturnSchema),
  smoothness: z.object({
    stdevPpm: n,
    maxDrawdown: n,
    negativeDays: n,
    observations: n,
  }),
  /** Dates that are absent between the first and last NAV date. */
  missingDates: z.array(iso),
  benchmarks: z.object({
    susdeApy: nn,
    tbillApy: nn,
    tbillSource: z.string().nullable(),
    reportedApy: nn,
  }),
});

export const decodedVectorSchema = z.object({
  startTime: iso,
  baseTime: iso,
  basePrice: n,
  apr: n,
  /** The vector's own APR compounded daily. */
  apy: n,
  priceFixDurationSeconds: n,
  state: z.string(),
  active: z.boolean(),
  firstSeen: iso.nullable(),
});

export const vectorsSchema = z.object({
  /** NAV the program would price at now, from the active vector. */
  scheduledNavNow: nn,
  /** NAV served by /offers and /data/live-nav. */
  liveNav: nn,
  /** scheduledNavNow - liveNav; about 0 when the decoded schedule matches. */
  difference: nn,
  vectors: z.array(decodedVectorSchema),
  nextRepricing: z.object({ at: iso, note: z.string() }),
  forward: z.object({
    label: z.string(),
    d30: z.array(z.object({ date: iso, nav: n })),
    d90: z.array(z.object({ date: iso, nav: n })),
  }),
  formula: z.object({ source: z.string(), description: z.string() }),
});

export const flowsSchema = z.object({
  range: rangeSchema,
  series: z.array(attributionSchema.extend({ netFlowUsd: n, nav: n, supply: n })),
  totals: z.object({ navEffect: n, flowEffect: n, residual: n, netFlowUsd: n }),
});

// ---------------------------------------------------------------------------------------------
// Market and redemptions
// ---------------------------------------------------------------------------------------------

export const poolSchema = z.object({
  pool: z.string(),
  name: z.string(),
  dex: z.string(),
  priceUsd: nn,
  liquidityUsd: nn,
  volume24h: nn,
  priceChange24hPct: nn,
});

export const marketSchema = z.object({
  marketPrice: nn,
  nav: nn,
  premiumBps: nn,
  history: z.array(z.object({ t: iso, premiumBps: nn, marketPrice: nn, nav: nn })),
  historySince: iso.nullable(),
  bands: z.array(n),
  pools: z.array(poolSchema),
  poolsTotals: z.object({ liquidityUsd: n, volume24h: n }),
  liquidityCoverage: nn,
  liquidityLayerUsd: nn,
  aumUsd: nn,
  coverageTarget: n,
});

export const redemptionOfferSchema = z.object({
  offer: z.string(),
  tokenOutMint: z.string(),
  tokenOut: z.string(),
  executed: n,
  requested: n,
  feeBps: n,
  propAmmFeeBps: n,
  vaultTarget: n,
  disabled: z.boolean(),
});

export const redemptionsSchema = z.object({
  offers: z.array(redemptionOfferSchema),
  settings: z
    .object({
      allowPartial: z.boolean(),
      coolDownSeconds: n,
      growthRate: n,
      initialCapacity: n,
      maxCapacity: n,
      maxSharePerRequest: n,
      startTime: iso,
    })
    .nullable(),
  capacityNote: z.string(),
  /** Deltas of `executed` between snapshots. Starts when collection starts. */
  flow: z.array(z.object({ t: iso, executed: n, delta: n })),
  flowSince: iso.nullable(),
  log: z.object({
    rows: z.array(
      z.object({
        requestPda: z.string(),
        redeemer: z.string(),
        status: z.string(),
        amount: n,
        fulfilledAmount: n,
        requestedAt: iso.nullable(),
        redemptionTime: iso.nullable(),
        tokenOutMint: z.string(),
        submissionTx: z.string().nullable(),
        fulfillmentTxs: z.array(z.string()),
      }),
    ),
    totalRows: n,
    newest: iso.nullable(),
    note: z.string(),
  }),
  estimate: z
    .object({
      onyc: n,
      navValueUsd: n,
      marketValueUsd: nn,
      requestFeeUsd: n,
      requestNetUsd: n,
      propAmmFeeUsd: n,
      propAmmNetUsd: n,
      label: z.string(),
    })
    .nullable(),
});

// ---------------------------------------------------------------------------------------------
// Reinsurance
// ---------------------------------------------------------------------------------------------

export const layerSchema = z.object({
  layerId: z.string(),
  uiLayerNumber: z.string(),
  status: z.string(),
  inception: iso,
  renewal: iso,
  perils: z.string(),
  perilFamily: z.string(),
  perilTags: z.array(z.string()),
  structure: z.string(),
  structureFamily: z.string(),
  capital: n,
  premium: n,
  expectedLoss: n,
  expectedYield: n,
  premiumToEL: nn,
  rateOnCapital: nn,
  expectedLossRatio: nn,
  monthsToRenewal: n,
  pastRenewal: z.boolean(),
  firstSeen: iso,
});
export const layersSchema = z.object({ asOf: iso, layers: z.array(layerSchema) });

const shareSchema = z.object({ key: z.string(), capital: n, share: n, layers: n });
export const reinsuranceSummarySchema = z.object({
  totals: z.object({
    layers: n,
    capital: n,
    premium: n,
    expectedLoss: n,
    expectedYield: nn,
    premiumToEL: nn,
    capitalOverAum: nn,
  }),
  byPeril: z.array(shareSchema),
  byStructure: z.array(shareSchema),
  renewalCalendar: z.array(shareSchema),
  pastRenewal: z.object({ count: n, capital: n, layerIds: z.array(z.string()) }),
  history: z.array(
    z.object({
      layerId: z.string(),
      uiLayerNumber: z.string(),
      firstSeen: iso,
      changes: z.array(z.object({ ts: iso, status: z.string(), capital: n })),
    }),
  ),
  historyNote: z.string(),
});

export const yieldSchema = z.object({
  reportedApy: nn,
  reinsurance: z.object({ capital: n, expectedYield: nn }),
  collateral: z.object({
    snapshotDate: iso.nullable(),
    totalUsd: nn,
    aumRowUsd: nn,
    blendedApy: nn,
    assets: z.array(
      z.object({
        asset: z.string(),
        amountUsd: n,
        allocation: nn,
        apy: nn,
        liquidityLayer: z.boolean(),
        proofs: z.array(z.string()),
      }),
    ),
  }),
  /** Reinsurance and collateral yield weighted by capital; a check against the reported APY, not a replacement. */
  blendedApy: nn,
  difference: nn,
  note: z.string(),
});

// ---------------------------------------------------------------------------------------------
// Capital and DeFi
// ---------------------------------------------------------------------------------------------

export const capitalStackResponseSchema = z.object({
  stack: capitalStackSchema.nullable(),
  note: z.string(),
});

export const distributionSchema = z.object({
  asOfDate: iso.nullable(),
  totalAumUsd: nn,
  distribution: z.array(protocolShareSchema),
  loopingShare: nn,
  topProtocol: protocolShareSchema.nullable(),
  history: z.array(z.object({ date: iso, protocol: z.string(), aumUsd: n })),
});

export const reconciliationSchema = z.object({
  asOfDate: iso.nullable(),
  circulatingUsd: nn,
  knownCustodyUsd: nn,
  attributedUsd: nn,
  unexplainedUsd: nn,
  unexplainedShare: nn,
  entries: z.array(z.object({ protocol: z.string(), capitalUsd: n })),
  residualNote: z.string(),
});

export const opportunitySchema = z.object({
  key: z.string(),
  classification: z.string(),
  protocol: z.string(),
  strategy: z.string(),
  activity: z.string(),
  assets: z.array(
    z.object({ symbol: z.string(), kind: z.enum(["token", "tranche", "principal-token"]) }),
  ),
  apy: nn,
  tvl: nn,
  pointsMultiplier: nn,
  link: z.string(),
  isNew: z.boolean(),
  comingSoon: z.boolean(),
  featured: z.boolean(),
  history: z.array(z.object({ t: iso, apy: nn, tvl: nn })),
});

export const opportunitiesSchema = z.object({
  asOf: iso.nullable(),
  opportunities: z.array(opportunitySchema),
  tranching: z.object({
    senior: opportunitySchema.nullable(),
    junior: opportunitySchema.nullable(),
    spread: nn,
    principalTokens: z.array(opportunitySchema),
  }),
  loopingShare: nn,
});

// ---------------------------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------------------------

export const pointsGrowthSchema = z.object({
  series: z.array(
    z.object({
      date: iso,
      base: n,
      referral: n,
      total: n,
      dailyBase: n,
      dailyReferral: n,
      dailyTotal: n,
    }),
  ),
  activeMultiplier: z.object({ value: n, since: iso, note: z.string() }).nullable(),
});

export const leaderboardRowSchema = z.object({
  rank: n,
  address: z.string(),
  totalPoints: n,
  /** Per OnRe; the comparison window is undocumented. */
  rankChangePerOnre: nn,
  movement1d: nn,
  movement7d: nn,
  movement30d: nn,
  breakdown: z.record(z.string(), n).nullable(),
});

export const leaderboardSchema = z.object({
  page: n,
  size: n,
  totalRows: n,
  snapshotDate: iso.nullable(),
  rows: z.array(leaderboardRowSchema),
});

export const concentrationSchema = z.object({
  snapshotDate: iso.nullable(),
  wallets: n,
  gini: nn,
  topShares: z.array(z.object({ top: n, share: n })),
  thresholds: z.array(z.object({ threshold: n, wallets: n })),
  lorenz: z.array(z.object({ population: n, points: n })),
  venueMix: z.array(z.object({ venue: z.string(), points: n, share: n })),
  multipliers: z.array(
    z.object({ protocol: z.string(), strategy: z.string(), pointsMultiplier: n }),
  ),
  globalMultiplier: z.object({ value: n, since: iso, note: z.string() }).nullable(),
  multiplierNote: z.string(),
});

export const walletSchema = z.object({
  address: z.string(),
  found: z.boolean(),
  points: nn,
  rank: nn,
  totalUsers: nn,
  percentile: nn,
  rankChangePerOnre: nn,
  breakdown: z.record(z.string(), n).nullable(),
  venueTotals: z.array(z.object({ venue: z.string(), points: n })),
  referrals: z
    .object({
      code: z.string().nullable(),
      totalReferrals: n,
      activeReferrals: n,
      pendingReferrals: n,
      totalReferralBonus: n,
      eligible: z.boolean().nullable(),
    })
    .nullable(),
  onchain: z.object({
    status: z.enum(["ok", "not_configured", "unavailable"]),
    onycBalance: nn,
    valueUsd: nn,
    note: z.string(),
  }),
});

// ---------------------------------------------------------------------------------------------
// Solvency, risk, health, events
// ---------------------------------------------------------------------------------------------

export const solvencySchema = z.object({
  collateralization: nn,
  reservesUsd: nn,
  supplyUsd: nn,
  retrievedAt: iso.nullable(),
  ageHours: nn,
  merkleRoot: z.string().nullable(),
  venues: z.array(
    z.object({
      venue: z.string(),
      totalUsd: n,
      assets: z.array(z.object({ asset: z.string(), usd: n, tag: z.string() })),
    }),
  ),
});

export const riskSignalSchema = z.object({
  id: z.string(),
  label: z.string(),
  state: z.enum(["ok", "watch", "alert", "unavailable"]),
  value: nn,
  unit: z.enum(["bps", "fraction", "ratio", "hours", "count"]),
  threshold: z.object({ watch: n, alert: n, worse: z.enum(["high", "low"]) }),
  note: z.string().optional(),
  source: z.string(),
  asOf: iso.nullable(),
});
export const riskSchema = z.object({
  signals: z.array(riskSignalSchema),
  note: z.string(),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
});

export const sourceHealthRowSchema = z.object({
  source: z.string(),
  endpoint: z.string(),
  status: z.enum(["ok", "degraded", "down", "not_configured"]),
  lastOkAt: iso.nullable(),
  lastErrorAt: iso.nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: n,
  lastLatencyMs: nn,
});

export const conflictSchema = z.object({
  id: n,
  title: z.string(),
  /** computed: derived from our data right now. observed: a dated observation that cannot be recomputed. */
  kind: z.enum(["computed", "observed"]),
  state: z.enum(["conflict", "consistent", "note", "unavailable"]),
  detail: z.string(),
  values: z.record(z.string(), z.union([n, z.string(), z.null()])),
  observedAt: iso.nullable(),
});

export const healthSchema = z.object({
  sources: z.array(sourceHealthRowSchema),
  conflicts: z.array(conflictSchema),
});

export const eventsSchema = z.object({ events: z.array(eventSchema) });

export const streamTickSchema = z.object({
  ts: iso,
  nav: nn,
  apy: nn,
  tvl: nn,
  marketPrice: nn,
  premiumBps: nn,
});

// ---------------------------------------------------------------------------------------------
// On-chain layer
// ---------------------------------------------------------------------------------------------

export const chainStateSchema = z.object({
  /** Which RPC the worker reads from. "public" is rate limited; a Helius key makes it faster. */
  provider: z.object({
    name: z.enum(["helius", "custom", "public", "unknown"]),
    heliusConfigured: z.boolean(),
  }),
  program: z.object({
    id: z.string(),
    mint: z.string(),
    boss: z.string().nullable(),
    isKilled: z.boolean().nullable(),
    worker: z.string().nullable(),
    admins: z.array(z.string()),
    mainOffer: z.string().nullable(),
  }),
  supply: z
    .object({
      total: n,
      circulating: n,
      /** Total minus circulating: the ONyc held by the accounts the program excludes (the boss wallet). */
      excludedHeld: n,
      excludedOwners: z.array(z.string()),
    })
    .nullable(),
  /** The program's own numbers (MarketStats) next to the API's. */
  stats: z
    .object({
      nav: nn,
      apy: nn,
      tvlUsd: nn,
      circulating: nn,
      updatedAt: iso.nullable(),
      apiNav: nn,
      apiApy: nn,
      apiTvl: nn,
      navDifference: nn,
    })
    .nullable(),
  /** Independent solvency: supply times NAV on chain against the AUM sources and the reserves. */
  solvency: z.object({
    /** Total supply on chain times NAV: what all holders, including the boss wallet, are owed at NAV. */
    impliedAumUsd: nn,
    /** Circulating supply times NAV, which is how the live TVL is built. */
    impliedCirculatingUsd: nn,
    apiAumUsd: nn,
    accountableReservesUsd: nn,
    accountableSupplyUsd: nn,
    gapApi: nn,
    gapAccountable: nn,
    threshold: n,
    custodyVisibleUsd: nn,
    note: z.string(),
  }),
  offers: z.array(
    z.object({
      address: z.string(),
      tokenIn: z.string(),
      tokenInSymbol: z.string().nullable(),
      feeBps: n,
      disabled: z.boolean(),
      vectors: z.array(
        z.object({ startTime: n, baseTime: n, basePrice: n, apr: n, priceFixDuration: n }),
      ),
    }),
  ),
  redemptions: z.object({
    offers: z.array(
      z.object({
        address: z.string(),
        tokenOut: z.string(),
        tokenOutSymbol: z.string().nullable(),
        executed: n,
        requested: n,
        feeBps: n,
        propAmmFeeBps: n,
        vaultTargetBps: n,
        disabled: z.boolean(),
      }),
    ),
    openRequests: z.array(
      z.object({ offer: z.string(), redeemer: z.string(), amount: n, fulfilled: n }),
    ),
    requestAccounts: n,
  }),
  vaults: z.array(
    z.object({
      holder: z.string(),
      mint: z.string(),
      symbol: z.string().nullable(),
      amount: n,
      valueUsd: nn,
    }),
  ),
  updatedAt: iso.nullable(),
});

export const chainEventKindSchema = z.enum([
  "mint",
  "redeem_request",
  "redeem_cancelled",
  "redeem_fulfilled",
  "propamm_sell",
  "propamm_buy",
  "price_vector",
  "admin_config",
  "vault_move",
  "market_stats",
  "large_transfer",
  "venue_in",
  "venue_out",
]);

export const chainActivitySchema = z.object({
  events: z.array(
    z.object({
      signature: z.string(),
      kind: chainEventKindSchema,
      instruction: z.string().nullable(),
      ts: iso,
      slot: n,
      signer: z.string().nullable(),
      /** Largest single ONyc balance change, whole tokens. */
      onyc: nn,
      /** Change in ONyc supply: mints positive, burns negative. */
      supplyDelta: nn,
      /** The protocol an ONyc move went into or out of, when the move was recognised as one. */
      venue: z.string().nullable(),
      venueKind: z.string().nullable(),
    }),
  ),
  /** Counts by kind over the whole stored history. */
  counts: z.record(z.string(), n),
  since: iso.nullable(),
  note: z.string(),
});

export const chainTxSchema = z.object({
  /** False when the chain has no such finalized transaction. */
  found: z.boolean(),
  tx: z
    .object({
      signature: z.string(),
      ts: iso.nullable(),
      slot: n,
      ok: z.boolean(),
      /** Network fee in SOL. */
      feeSol: n,
      signer: z.string().nullable(),
      signerLabel: z.string().nullable(),
      /** How the activity feed classified it, when it is in the feed. */
      event: z
        .object({
          kind: chainEventKindSchema,
          instruction: z.string().nullable(),
          venue: z.string().nullable(),
          venueKind: z.string().nullable(),
        })
        .nullable(),
      programs: z.array(
        z.object({
          address: z.string(),
          label: z.string().nullable(),
          /** Instruction names the OnRe program was called with; empty for other programs. */
          instructions: z.array(z.string()),
        }),
      ),
      /** Token balance changes: one row per token account that changed. */
      transfers: z.array(
        z.object({
          mint: z.string(),
          token: z.string().nullable(),
          owner: z.string().nullable(),
          label: z.string().nullable(),
          change: n,
          after: n,
        }),
      ),
    })
    .nullable(),
});

export const chainFlowsSchema = z.object({
  range: rangeSchema,
  /** Daily ONyc minted and burned, from program transactions. */
  series: z.array(
    z.object({
      date: iso,
      minted: n,
      burned: n,
      net: n,
      nav: nn,
      netUsd: nn,
      transactions: n,
    }),
  ),
  totals: z.object({ minted: n, burned: n, net: n, netUsd: nn }),
  /** The API's own net flow for the same days, estimated from supply changes. */
  apiNetFlowUsd: nn,
  since: iso.nullable(),
  note: z.string(),
});

export const chainHolderRowSchema = z.object({
  rank: n,
  owner: z.string(),
  amount: n,
  share: n,
  tokenAccounts: n,
  kind: z.enum(["wallet", "program", "unknown"]),
  protocol: z.string().nullable(),
  label: z.string().nullable(),
  labelledBy: z.enum(["address", "owner-program", "activity"]).nullable(),
});

export const chainHoldersSchema = z.object({
  scanTs: iso.nullable(),
  holders: nn,
  gini: nn,
  top: z.array(z.object({ n, share: n })),
  rows: z.array(chainHolderRowSchema),
  byProtocol: z.array(z.object({ protocol: z.string(), onyc: n, usd: nn })),
  /** ONyc held by labelled accounts against the capital-by-protocol the rewards API reports. */
  crossCheck: z.array(
    z.object({
      protocol: z.string(),
      onchainUsd: n,
      apiUsd: nn,
      differencePct: nn,
    }),
  ),
  whales: z.array(
    z.object({ ts: iso, kind: z.enum(["new", "exited"]), owner: z.string(), before: n, after: n }),
  ),
  note: z.string(),
});
