import type { z } from "zod";
import { SourceError } from "./errors.js";
import {
  getJson,
  getText,
  httpGet,
  validate,
  type FetchOptions,
  type SourceResult,
} from "./http.js";
import { csvRecords } from "./parse/csv.js";
import {
  accountableDashboardSchema,
  toSolvencyView,
  type SolvencyView,
} from "./schemas/accountable.js";
import {
  liveNumberSchema,
  navHistorySchema,
  offersSchema,
  redemptionEtaSchema,
  redemptionOffersSchema,
  redemptionRequestsPageSchema,
  redemptionSettingsSchema,
  settingsSchema,
} from "./schemas/core.js";
import {
  filterOnycPools,
  geckoPoolsSchema,
  jupiterPriceSchema,
  llamaProtocolSchema,
  llamaYieldsSchema,
  type LlamaPool,
} from "./schemas/market.js";
import {
  aumGrowthSchema,
  capitalDistributionSchema,
  capitalReconciliationSchema,
  leaderboardPageSchema,
  pointsGrowthSchema,
  referralCodeSchema,
  referralEligibilitySchema,
  referralStatsSchema,
  referralStatusSchema,
  walletPointsSchema,
} from "./schemas/rewards.js";
import { parseCollateralSheet } from "./sheets/collateral.js";
import { parseNavSheet } from "./sheets/nav.js";
import { parseOpportunitiesSheet } from "./sheets/opportunities.js";
import { parseReinsuranceSheet } from "./sheets/reinsurance.js";

export const SOURCE = {
  core: "onre-core",
  rewards: "onre-rewards",
  sheets: "onre-sheets",
  accountable: "accountable",
  jupiter: "jupiter",
  gecko: "geckoterminal",
  llama: "defillama",
  helius: "helius",
} as const;
export type SourceId = (typeof SOURCE)[keyof typeof SOURCE];

/** Verified constants, DATA_SOURCES §6. */
export const CONSTANTS = {
  onycMint: "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5",
  onreProgram: "onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe",
  usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  usdgMint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
  usdtMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  mintOffers: {
    usdg: "8w1BAUUn6RbAtU3BuCUNXzHR7cxNyNga9pJLQYgpXJU",
    usdc: "E88zkA9Pxb1i8EfSHrEW5ZUe6hiQbo8DHWQ3WhDFw7p6",
  },
} as const;

export const BASE_URL = {
  core: "https://core.api.onre.finance",
  rewards: "https://rewards.api.onre.finance/api/v1",
  sheets:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT-bLCCxKNCB2GHgFV5Jo6_fbv4t3CT60dwPMbUDfwhHglt5GBoLp47jp1wcCOY8Ob1ZgjA6KXNczdq/pub",
  accountable: "https://onre.accountable.capital:8443",
  jupiter: "https://lite-api.jup.ag",
  gecko: "https://api.geckoterminal.com/api/v2",
  llamaApi: "https://api.llama.fi",
  llamaYields: "https://yields.llama.fi",
} as const;

export const SHEET_GID = {
  opportunities: "1418034083",
  nav: "362705568",
  collateral: "1591707661",
  reinsurance: "297157125",
} as const;

export interface ClientOptions extends FetchOptions {
  /** Override the host, for tests. */
  baseUrl?: string;
}

const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function assertWallet(source: string, address: string): void {
  if (!WALLET.test(address)) {
    throw new SourceError("parse", source, address, "not a valid base58 wallet address");
  }
}

function base(options: ClientOptions, fallback: string): string {
  return options.baseUrl ?? fallback;
}

// ---------------------------------------------------------------------------------------------
// OnRe core API
// ---------------------------------------------------------------------------------------------

export const onreCore = {
  liveNav: (o: ClientOptions = {}) =>
    getJson(SOURCE.core, `${base(o, BASE_URL.core)}/data/live-nav`, liveNumberSchema, o),
  liveApy: (o: ClientOptions = {}) =>
    getJson(SOURCE.core, `${base(o, BASE_URL.core)}/data/live-apy`, liveNumberSchema, o),
  liveTvl: (o: ClientOptions = {}) =>
    getJson(SOURCE.core, `${base(o, BASE_URL.core)}/data/live-tvl`, liveNumberSchema, o),
  navHistory: (o: ClientOptions = {}) =>
    getJson(SOURCE.core, `${base(o, BASE_URL.core)}/data/nav`, navHistorySchema, {
      timeoutMs: 60_000,
      ...o,
    }),
  settings: (o: ClientOptions = {}) =>
    getJson(SOURCE.core, `${base(o, BASE_URL.core)}/settings`, settingsSchema, o),
  offers: (o: ClientOptions = {}) =>
    getJson(SOURCE.core, `${base(o, BASE_URL.core)}/offers`, offersSchema, o),
  redemptionOffers: (o: ClientOptions = {}) =>
    getJson(SOURCE.core, `${base(o, BASE_URL.core)}/redemption/offers`, redemptionOffersSchema, o),
  redemptionSettings: (o: ClientOptions = {}) =>
    getJson(
      SOURCE.core,
      `${base(o, BASE_URL.core)}/redemption/settings`,
      redemptionSettingsSchema,
      o,
    ),
  redemptionEta: (publicKey: string, amount: number, o: ClientOptions = {}) => {
    assertWallet(SOURCE.core, publicKey);
    return getJson(
      SOURCE.core,
      `${base(o, BASE_URL.core)}/redemption/eta?publicKey=${publicKey}&amount=${encodeURIComponent(String(amount))}`,
      redemptionEtaSchema,
      o,
    );
  },
  /** A partial log (50 rows on 2026-10-21). It does not reconcile with `executedRedemptions`. */
  redemptionRequests: (page = 0, size = 100, o: ClientOptions = {}) =>
    getJson(
      SOURCE.core,
      `${base(o, BASE_URL.core)}/redemption/requests?page=${page}&size=${size}`,
      redemptionRequestsPageSchema,
      o,
    ),
};

// ---------------------------------------------------------------------------------------------
// OnRe rewards API
// ---------------------------------------------------------------------------------------------

export const onreRewards = {
  aumGrowth: (o: ClientOptions = {}) =>
    getJson(SOURCE.rewards, `${base(o, BASE_URL.rewards)}/analytics/aum/growth`, aumGrowthSchema, {
      timeoutMs: 60_000,
      ...o,
    }),
  capitalDistribution: (o: ClientOptions = {}) =>
    getJson(
      SOURCE.rewards,
      `${base(o, BASE_URL.rewards)}/analytics/capital/distribution`,
      capitalDistributionSchema,
      { timeoutMs: 60_000, ...o },
    ),
  capitalReconciliation: (o: ClientOptions = {}) =>
    getJson(
      SOURCE.rewards,
      `${base(o, BASE_URL.rewards)}/analytics/capital/reconciliation`,
      capitalReconciliationSchema,
      { timeoutMs: 60_000, ...o },
    ),
  pointsGrowth: (o: ClientOptions = {}) =>
    getJson(
      SOURCE.rewards,
      `${base(o, BASE_URL.rewards)}/analytics/points/growth`,
      pointsGrowthSchema,
      { timeoutMs: 60_000, ...o },
    ),
  /** Crawl with size 100–250 and 1–2 requests in flight; size 500 took about 20 s per page once. */
  leaderboard: (page: number, size: number, o: ClientOptions = {}) =>
    getJson(
      SOURCE.rewards,
      `${base(o, BASE_URL.rewards)}/points/leaderboard?page=${page}&size=${size}`,
      leaderboardPageSchema,
      { timeoutMs: 90_000, ...o },
    ),
  walletPoints: (address: string, o: ClientOptions = {}) => {
    assertWallet(SOURCE.rewards, address);
    return getJson(
      SOURCE.rewards,
      `${base(o, BASE_URL.rewards)}/points/${address}`,
      walletPointsSchema,
      o,
    );
  },
  referralStats: (address: string, o: ClientOptions = {}) => {
    assertWallet(SOURCE.rewards, address);
    return getJson(
      SOURCE.rewards,
      `${base(o, BASE_URL.rewards)}/referrals/stats/${address}`,
      referralStatsSchema,
      o,
    );
  },
  referralEligibility: (address: string, o: ClientOptions = {}) => {
    assertWallet(SOURCE.rewards, address);
    return getJson(
      SOURCE.rewards,
      `${base(o, BASE_URL.rewards)}/referrals/eligibility/${address}`,
      referralEligibilitySchema,
      o,
    );
  },
  referralStatus: (address: string, o: ClientOptions = {}) => {
    assertWallet(SOURCE.rewards, address);
    return getJson(
      SOURCE.rewards,
      `${base(o, BASE_URL.rewards)}/referrals/status/${address}`,
      referralStatusSchema,
      o,
    );
  },
  /** 404 means the wallet has no code. That is data, not an error: `data` is null. */
  referralCode: async (
    address: string,
    o: ClientOptions = {},
  ): Promise<SourceResult<z.infer<typeof referralCodeSchema> | null>> => {
    assertWallet(SOURCE.rewards, address);
    const url = `${base(o, BASE_URL.rewards)}/referrals/code/${address}`;
    const response = await httpGet(SOURCE.rewards, url, { ...o, acceptStatuses: [404] });
    if (response.status === 404) {
      return {
        data: null,
        raw: response.text,
        url,
        status: 404,
        fetchedAt: response.fetchedAt,
        latencyMs: response.latencyMs,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(response.text);
    } catch (error) {
      throw new SourceError("parse", SOURCE.rewards, url, "body is not valid JSON", {
        cause: error,
      });
    }
    return {
      data: validate(SOURCE.rewards, url, referralCodeSchema, json),
      raw: response.text,
      url,
      status: response.status,
      fetchedAt: response.fetchedAt,
      latencyMs: response.latencyMs,
    };
  },
};

// ---------------------------------------------------------------------------------------------
// Published Google Sheets
// ---------------------------------------------------------------------------------------------

function sheetUrl(o: ClientOptions, gid: string): string {
  return `${base(o, BASE_URL.sheets)}?output=csv&single=true&gid=${gid}`;
}

export const onreSheets = {
  opportunities: (o: ClientOptions = {}) =>
    getText(SOURCE.sheets, sheetUrl(o, SHEET_GID.opportunities), parseOpportunitiesSheet, o),
  nav: (o: ClientOptions = {}) =>
    getText(SOURCE.sheets, sheetUrl(o, SHEET_GID.nav), parseNavSheet, o),
  collateral: (o: ClientOptions = {}) =>
    getText(SOURCE.sheets, sheetUrl(o, SHEET_GID.collateral), parseCollateralSheet, o),
  reinsurance: (o: ClientOptions = {}) =>
    getText(SOURCE.sheets, sheetUrl(o, SHEET_GID.reinsurance), parseReinsuranceSheet, o),
};

/** Re-exported so tests and the worker can sanity-check headers without a network call. */
export { csvRecords };

// ---------------------------------------------------------------------------------------------
// Proof of solvency
// ---------------------------------------------------------------------------------------------

export const accountable = {
  dashboard: async (o: ClientOptions = {}): Promise<SourceResult<SolvencyView>> => {
    const result = await getJson(
      SOURCE.accountable,
      `${base(o, BASE_URL.accountable)}/dashboard`,
      accountableDashboardSchema,
      o,
    );
    return { ...result, data: toSolvencyView(result.data) };
  },
};

// ---------------------------------------------------------------------------------------------
// Market and third-party data
// ---------------------------------------------------------------------------------------------

export const jupiter = {
  price: (mint: string = CONSTANTS.onycMint, o: ClientOptions = {}) =>
    getJson(
      SOURCE.jupiter,
      `${base(o, BASE_URL.jupiter)}/price/v3?ids=${encodeURIComponent(mint)}`,
      jupiterPriceSchema,
      o,
    ),
};

export const geckoTerminal = {
  /** First page only (20 pools on 2026-10-21). The public limit is about 30 requests a minute. */
  tokenPools: (mint: string = CONSTANTS.onycMint, o: ClientOptions = {}) =>
    getJson(
      SOURCE.gecko,
      `${base(o, BASE_URL.gecko)}/networks/solana/tokens/${encodeURIComponent(mint)}/pools`,
      geckoPoolsSchema,
      o,
    ),
};

export const defiLlama = {
  protocol: async (o: ClientOptions = {}) => {
    const result = await getJson(
      SOURCE.llama,
      `${base(o, BASE_URL.llamaApi)}/protocol/onre`,
      llamaProtocolSchema,
      { timeoutMs: 60_000, ...o },
    );
    // The payload is 145 KB of which only the TVL series is used; do not store the rest.
    const trimmed = {
      name: result.data.name,
      tvl: result.data.tvl,
      currentChainTvls: result.data.currentChainTvls,
    };
    return { ...result, raw: JSON.stringify(trimmed) };
  },
  /** The upstream payload is about 11 MB and takes about 45 s, so it is trimmed to ONyc pools here. */
  onycYieldPools: async (o: ClientOptions = {}): Promise<SourceResult<LlamaPool[]>> => {
    const result = await getJson(
      SOURCE.llama,
      `${base(o, BASE_URL.llamaYields)}/pools`,
      llamaYieldsSchema,
      { timeoutMs: 180_000, retries: 1, ...o },
    );
    const pools = filterOnycPools(result.data.data);
    return {
      ...result,
      data: pools,
      raw: JSON.stringify({ status: result.data.status, data: pools }),
    };
  },
};
