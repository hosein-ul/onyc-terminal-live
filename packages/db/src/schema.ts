import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const day = (name: string) => date(name, { mode: "string" });
const num = (name: string) => doublePrecision(name);

// ---------------------------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------------------------

/** Every fetch worth keeping. Identical consecutive payloads are folded into one row (`seen_count`). */
export const rawSnapshots = pgTable(
  "raw_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    endpoint: text("endpoint").notNull(),
    fetchedAt: ts("fetched_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull(),
    seenCount: integer("seen_count").notNull().default(1),
    status: integer("status").notNull(),
    /** JSON bodies. */
    payload: jsonb("payload"),
    /** CSV bodies. */
    payloadText: text("payload_text"),
    hash: text("hash").notNull(),
  },
  (t) => [index("raw_snapshots_source_endpoint_idx").on(t.source, t.endpoint, t.fetchedAt)],
);

/** One row per source endpoint, so a single failing endpoint degrades its source without hiding the rest. */
export const sourceHealth = pgTable(
  "source_health",
  {
    source: text("source").notNull(),
    endpoint: text("endpoint").notNull(),
    /** ok | degraded | down | not_configured */
    status: text("status").notNull(),
    lastOkAt: ts("last_ok_at"),
    lastErrorAt: ts("last_error_at"),
    lastError: text("last_error"),
    lastErrorKind: text("last_error_kind"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastLatencyMs: integer("last_latency_ms"),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.endpoint] })],
);

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: ts("ts").notNull(),
    kind: text("kind").notNull(),
    /** info | watch | alert */
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    data: jsonb("data"),
    /** Makes emitting an event idempotent: the same fact is recorded once. */
    dedupKey: text("dedup_key"),
  },
  (t) => [
    uniqueIndex("events_dedup_key_idx").on(t.dedupKey),
    index("events_kind_ts_idx").on(t.kind, t.ts),
    index("events_ts_idx").on(t.ts),
  ],
);

export const alertRules = pgTable("alert_rules", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  /** telegram | webhook */
  channel: text("channel").notNull(),
  /** Telegram chat id or webhook URL. */
  target: text("target").notNull(),
  kind: text("kind").notNull(),
  params: jsonb("params")
    .notNull()
    .default(sql`'{}'::jsonb`),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ruleId: bigint("rule_id", { mode: "number" }).references(() => alertRules.id, {
      onDelete: "cascade",
    }),
    eventId: bigint("event_id", { mode: "number" }).references(() => events.id, {
      onDelete: "cascade",
    }),
    status: text("status").notNull(),
    error: text("error"),
    sentAt: ts("sent_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alert_deliveries_rule_event_idx").on(t.ruleId, t.eventId)],
);

// ---------------------------------------------------------------------------------------------
// OnRe core
// ---------------------------------------------------------------------------------------------

/** 60 s ticks. Each value is null when its own source failed that minute. */
export const liveTicks = pgTable("live_ticks", {
  ts: ts("ts").primaryKey(),
  nav: num("nav"),
  apy: num("apy"),
  tvl: num("tvl"),
  marketPrice: num("market_price"),
  premiumBps: num("premium_bps"),
});

/** From `/data/nav`; the sheet is kept separately in `nav_sheet_daily` as a cross-check. */
export const navDaily = pgTable("nav_daily", {
  date: day("date").primaryKey(),
  nav: num("nav").notNull(),
  aum: num("aum"),
  circulatingSupply: num("circulating_supply"),
  /** Reported APY on that date, from the sheet where it has one. */
  apyReported: num("apy_reported"),
  fetchedAt: ts("fetched_at").notNull(),
});

export const navSheetDaily = pgTable("nav_sheet_daily", {
  date: day("date").primaryKey(),
  nav: num("nav").notNull(),
  aum: num("aum"),
  apy: num("apy"),
  circulatingSupply: num("circulating_supply"),
  changed: boolean("changed").notNull().default(false),
  fetchedAt: ts("fetched_at").notNull(),
});

/** Raw fixed-point vector fields as the API serves them (price x1e9, apr x1e6). */
export const priceVectors = pgTable(
  "price_vectors",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    offer: text("offer").notNull(),
    startTime: ts("start_time").notNull(),
    baseTime: ts("base_time").notNull(),
    basePrice: bigint("base_price", { mode: "number" }).notNull(),
    apr: integer("apr").notNull(),
    priceFixDuration: integer("price_fix_duration").notNull(),
    state: text("state").notNull(),
    firstSeen: ts("first_seen").notNull(),
  },
  (t) => [
    uniqueIndex("price_vectors_identity_idx").on(
      t.offer,
      t.startTime,
      t.baseTime,
      t.basePrice,
      t.apr,
    ),
  ],
);

export const mintOffers = pgTable("mint_offers", {
  address: text("address").primaryKey(),
  tokenInMint: text("token_in_mint").notNull(),
  tokenOutMint: text("token_out_mint").notNull(),
  price: num("price").notNull(),
  apy: num("apy").notNull(),
  activeNow: boolean("active_now").notNull(),
  allowPermissionless: boolean("allow_permissionless").notNull(),
  feeBasisPoints: num("fee_basis_points").notNull(),
  disabled: boolean("disabled").notNull(),
  validFrom: ts("valid_from"),
  firstSeen: ts("first_seen").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

/** Written when a value changes, so deltas of `executed` give the redemption flow. */
export const redemptionOffersSnap = pgTable(
  "redemption_offers_snap",
  {
    ts: ts("ts").notNull(),
    offer: text("offer").notNull(),
    redemptionOffer: text("redemption_offer").notNull(),
    tokenOutMint: text("token_out_mint").notNull(),
    executed: num("executed").notNull(),
    requested: num("requested").notNull(),
    feeBps: num("fee_bps").notNull(),
    propAmmFeeBps: num("prop_amm_fee_bps").notNull(),
    vaultTarget: num("vault_target").notNull(),
    disabled: boolean("disabled").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ts, t.offer] })],
);

export const redemptionSettingsSnap = pgTable("redemption_settings_snap", {
  ts: ts("ts").primaryKey(),
  allowPartial: boolean("allow_partial").notNull(),
  coolDown: integer("cool_down").notNull(),
  growthRate: num("growth_rate").notNull(),
  initialCapacity: num("initial_capacity").notNull(),
  maxCapacity: num("max_capacity").notNull(),
  maxSharePerRequest: num("max_share_per_request").notNull(),
  startTime: ts("start_time").notNull(),
});

/** The public redemption log. Partial: it does not reconcile with `executed` on the offers. */
export const redemptionRequests = pgTable(
  "redemption_requests",
  {
    /** The request PDA is the real key: the log's own `id` is a per-offer counter and repeats. */
    requestPda: text("request_pda").primaryKey(),
    requestNumber: text("request_number").notNull(),
    redeemer: text("redeemer").notNull(),
    offerPda: text("offer_pda").notNull(),
    status: text("status").notNull(),
    requestedAt: ts("requested_at"),
    redemptionTime: ts("redemption_time"),
    amount: num("amount").notNull(),
    fulfilledAmount: num("fulfilled_amount").notNull(),
    tokenInMint: text("token_in_mint").notNull(),
    tokenOutMint: text("token_out_mint").notNull(),
    submissionTx: text("submission_tx"),
    fulfillmentTxs: jsonb("fulfillment_txs").notNull(),
    firstSeen: ts("first_seen").notNull(),
    lastSeen: ts("last_seen").notNull(),
  },
  (t) => [index("redemption_requests_time_idx").on(t.redemptionTime)],
);

/** `/settings`: token supplies and the sUSDe benchmark (percent units). Written on change. */
export const settingsSnap = pgTable("settings_snap", {
  ts: ts("ts").primaryKey(),
  onycApy: num("onyc_apy").notNull(),
  susdeApyPct: num("susde_apy_pct").notNull(),
  tvlValue: num("tvl_value").notNull(),
  onycSupply: num("onyc_supply"),
  tokenSupplies: jsonb("token_supplies").notNull(),
});

// ---------------------------------------------------------------------------------------------
// OnRe rewards
// ---------------------------------------------------------------------------------------------

export const protocolAumDaily = pgTable(
  "protocol_aum_daily",
  {
    date: day("date").notNull(),
    protocol: text("protocol").notNull(),
    aumUsd: num("aum_usd").notNull(),
    deltaUsd: num("delta_usd"),
    deltaPct: num("delta_pct"),
  },
  (t) => [primaryKey({ columns: [t.date, t.protocol] })],
);

export const capitalDistributionSnap = pgTable(
  "capital_distribution_snap",
  {
    asOfDate: day("as_of_date").notNull(),
    protocol: text("protocol").notNull(),
    capitalUsd: num("capital_usd").notNull(),
    /** Fraction (0.547 = 54.7%). */
    share: num("share").notNull(),
    totalAumUsd: num("total_aum_usd").notNull(),
    fetchedAt: ts("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.asOfDate, t.protocol] })],
);

export const reconciliationSnap = pgTable("reconciliation_snap", {
  asOfDate: day("as_of_date").primaryKey(),
  navUsd: num("nav_usd").notNull(),
  circulatingOnyc: num("circulating_onyc").notNull(),
  circulatingUsd: num("circulating_usd").notNull(),
  knownCustodyUsd: num("known_custody_usd").notNull(),
  adjustedWalletUsd: num("adjusted_wallet_usd").notNull(),
  attributedProtocolUsd: num("attributed_protocol_usd").notNull(),
  unexplainedUsd: num("unexplained_usd").notNull(),
  entries: jsonb("entries").notNull(),
  fetchedAt: ts("fetched_at").notNull(),
});

export const pointsGrowthDaily = pgTable("points_growth_daily", {
  date: day("date").primaryKey(),
  base: num("base").notNull(),
  referral: num("referral").notNull(),
  total: num("total").notNull(),
  dailyBase: num("daily_base").notNull(),
  dailyReferral: num("daily_referral").notNull(),
  dailyTotal: num("daily_total").notNull(),
});

/**
 * Daily leaderboard. Every wallet gets rank and total points; the full venue breakdown is kept only for the
 * top N (see worker config) to bound storage. Venue totals for everyone live in `leaderboard_venue_daily`.
 */
export const leaderboardSnap = pgTable(
  "leaderboard_snap",
  {
    date: day("date").notNull(),
    address: text("address").notNull(),
    rank: integer("rank").notNull(),
    totalPoints: num("total_points").notNull(),
    rankChange: integer("rank_change"),
    globalMultiplier: num("global_multiplier"),
    breakdown: jsonb("breakdown"),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.address] }),
    index("leaderboard_snap_date_rank_idx").on(t.date, t.rank),
    index("leaderboard_snap_address_idx").on(t.address, t.date),
  ],
);

/** Hourly top-500 refresh. Short retention: the daily crawl is the durable record. */
export const leaderboardTopSnap = pgTable(
  "leaderboard_top_snap",
  {
    ts: ts("ts").notNull(),
    rank: integer("rank").notNull(),
    address: text("address").notNull(),
    totalPoints: num("total_points").notNull(),
    rankChange: integer("rank_change"),
  },
  (t) => [primaryKey({ columns: [t.ts, t.rank] })],
);

/** Points per venue summed over every wallet in the crawl. */
export const leaderboardVenueDaily = pgTable(
  "leaderboard_venue_daily",
  {
    date: day("date").notNull(),
    venue: text("venue").notNull(),
    points: num("points").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.venue] })],
);

export const leaderboardCrawls = pgTable("leaderboard_crawls", {
  date: day("date").primaryKey(),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  status: text("status").notNull(),
  totalElements: integer("total_elements"),
  walletsStored: integer("wallets_stored").notNull().default(0),
  pageSize: integer("page_size").notNull(),
  error: text("error"),
});

export const walletPointsCache = pgTable("wallet_points_cache", {
  address: text("address").primaryKey(),
  fetchedAt: ts("fetched_at").notNull(),
  payload: jsonb("payload").notNull(),
});

// ---------------------------------------------------------------------------------------------
// Published sheets
// ---------------------------------------------------------------------------------------------

export const reinsuranceLayers = pgTable("reinsurance_layers", {
  layerId: text("layer_id").primaryKey(),
  uiLayerNumber: text("ui_layer_number").notNull(),
  status: text("status").notNull(),
  inception: day("inception").notNull(),
  renewal: day("renewal").notNull(),
  perils: text("perils").notNull(),
  structure: text("structure").notNull(),
  capital: num("capital").notNull(),
  premium: num("premium").notNull(),
  expectedLoss: num("expected_loss").notNull(),
  expectedYield: num("expected_yield").notNull(),
  firstSeen: ts("first_seen").notNull(),
  lastSeen: ts("last_seen").notNull(),
});

/** One row each time a layer's content changes (and when it first appears). */
export const reinsuranceLayersHistory = pgTable(
  "reinsurance_layers_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    layerId: text("layer_id").notNull(),
    ts: ts("ts").notNull(),
    status: text("status").notNull(),
    inception: day("inception").notNull(),
    renewal: day("renewal").notNull(),
    perils: text("perils").notNull(),
    structure: text("structure").notNull(),
    capital: num("capital").notNull(),
    premium: num("premium").notNull(),
    expectedLoss: num("expected_loss").notNull(),
    expectedYield: num("expected_yield").notNull(),
  },
  (t) => [index("reinsurance_history_layer_idx").on(t.layerId, t.ts)],
);

/** Header of a collateral sheet snapshot. Written when the sheet content changes. */
export const collateralSnapshots = pgTable("collateral_snapshots", {
  ts: ts("ts").primaryKey(),
  sheetSnapshotDate: day("sheet_snapshot_date").notNull(),
  totalUsd: num("total_usd"),
  /** The sheet's own AUM row. It differs from the Total row. */
  aumUsd: num("aum_usd"),
  metadata: jsonb("metadata").notNull(),
});

export const collateralAssetsSnap = pgTable(
  "collateral_assets_snap",
  {
    ts: ts("ts").notNull(),
    rowIndex: integer("row_index").notNull(),
    asset: text("asset").notNull(),
    amountUsd: num("amount_usd").notNull(),
    allocation: num("allocation"),
    apy: num("apy"),
    liquidityLayer: boolean("liquidity_layer").notNull(),
    proofs: jsonb("proofs").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ts, t.rowIndex] })],
);

export const defiOpportunitiesSnap = pgTable(
  "defi_opportunities_snap",
  {
    ts: ts("ts").notNull(),
    oppKey: text("opp_key").notNull(),
    classification: text("classification").notNull(),
    protocol: text("protocol").notNull(),
    strategy: text("strategy").notNull(),
    activity: text("activity").notNull(),
    assets: jsonb("assets").notNull(),
    apy: num("apy"),
    tvl: num("tvl"),
    reward: num("reward"),
    link: text("link").notNull(),
    flags: jsonb("flags").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ts, t.oppKey] }), index("defi_opp_key_idx").on(t.oppKey, t.ts)],
);

// ---------------------------------------------------------------------------------------------
// Solvency, market, third parties
// ---------------------------------------------------------------------------------------------

export const solvencySnap = pgTable("solvency_snap", {
  ts: ts("ts").primaryKey(),
  collateralization: num("collateralization").notNull(),
  reservesUsd: num("reserves_usd").notNull(),
  supplyUsd: num("supply_usd").notNull(),
  /** When Accountable retrieved its data; may lag `ts` by days. */
  retrievedAt: ts("retrieved_at").notNull(),
  merkleRoot: text("merkle_root").notNull(),
  venues: jsonb("venues").notNull(),
});

export const marketPoolsSnap = pgTable(
  "market_pools_snap",
  {
    ts: ts("ts").notNull(),
    pool: text("pool").notNull(),
    name: text("name").notNull(),
    dex: text("dex").notNull(),
    priceUsd: num("price_usd"),
    liquidityUsd: num("liquidity_usd"),
    volume24h: num("volume_24h"),
    priceChange24hPct: num("price_change_24h_pct"),
  },
  (t) => [primaryKey({ columns: [t.ts, t.pool] })],
);

export const llamaTvlDaily = pgTable("llama_tvl_daily", {
  date: day("date").primaryKey(),
  tvl: num("tvl").notNull(),
});

export const llamaPoolsSnap = pgTable(
  "llama_pools_snap",
  {
    ts: ts("ts").notNull(),
    pool: text("pool").notNull(),
    project: text("project").notNull(),
    chain: text("chain").notNull(),
    symbol: text("symbol").notNull(),
    apy: num("apy"),
    apyBase: num("apy_base"),
    tvl: num("tvl").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ts, t.pool] })],
);

/** Helius chain snapshot. Empty until HELIUS_API_KEY is configured. */
export const chainSnap = pgTable("chain_snap", {
  ts: ts("ts").primaryKey(),
  supply: num("supply"),
  holders: integer("holders"),
  topHolders: jsonb("top_holders"),
  custodyBalances: jsonb("custody_balances"),
});
