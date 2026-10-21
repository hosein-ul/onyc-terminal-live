import { z } from "zod";
import {
  aprToFraction,
  basePriceToNumber,
  looseNumber,
  looseNumberOrNull,
  parseUsDate,
} from "../parse/numbers.js";

/** `/data/live-nav`, `/data/live-apy` and `/data/live-tvl` return a bare JSON number. */
export const liveNumberSchema = z.number().finite();

const usDate = z.string().transform((text, ctx) => {
  try {
    return parseUsDate(text);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : String(error),
    });
    return z.NEVER;
  }
});

export interface NavHistoryRow {
  /** ISO date (the API writes MM/DD/YYYY). */
  date: string;
  nav: number;
  /** Null on the earliest rows. */
  aum: number | null;
  circulatingSupply: number | null;
  fundName: string;
  fundId: number;
}

/** `/data/nav`: daily, newest first. Numbers are strings; dates are MM/DD/YYYY. */
export const navHistorySchema = z
  .looseObject({
    data: z.array(
      z.looseObject({
        net_asset_value_date: usDate,
        net_asset_value: looseNumber,
        assets_under_management: looseNumberOrNull,
        fund_name: z.string(),
        fund_id: z.number(),
        circulating_supply: looseNumberOrNull,
      }),
    ),
  })
  .transform((body): NavHistoryRow[] =>
    body.data.map((row) => ({
      date: row.net_asset_value_date,
      nav: row.net_asset_value,
      aum: row.assets_under_management,
      circulatingSupply: row.circulating_supply,
      fundName: row.fund_name,
      fundId: row.fund_id,
    })),
  );

const tokenInfoSchema = z.looseObject({
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int(),
  /** Whole tokens, as OnRe reports them. Compare with `circulating_supply` in `/data/nav`. */
  supply: z.number(),
  tokenProgram: z.string(),
  mintAuthority: z.string().nullish(),
  image: z.string().nullish(),
});

export const settingsSchema = z.looseObject({
  primaryToken: z.string(),
  primaryAsset: z.string(),
  misc: z.looseObject({
    onycApy: looseNumber,
    /** Percent units (3.5057 = 3.5057%), not a fraction. */
    sUSDeAPY: looseNumber,
    tvlValue: looseNumber,
  }),
  tokens: z.record(z.string(), tokenInfoSchema),
});
export type OnreSettings = z.infer<typeof settingsSchema>;

export const priceVectorSchema = z.looseObject({
  startTime: z.number().int(),
  baseTime: z.number().int(),
  /** Price times 1e9. */
  basePrice: z.number().int(),
  /** Rate times 1e6. */
  apr: z.number().int(),
  priceFixDuration: z.number().int(),
  state: z.string(),
});
export type RawPriceVector = z.infer<typeof priceVectorSchema>;

export const offerSchema = z.looseObject({
  address: z.string(),
  tokenInMint: z.string(),
  tokenOutMint: z.string(),
  activeNow: z.boolean(),
  allowPermissionless: z.boolean(),
  apy: z.number(),
  currentPriceFixDuration: z.number(),
  disabled: z.boolean(),
  feeBasisPoints: z.number(),
  feeBasisPointsPermissionless: z.number(),
  needsApproval: z.boolean(),
  onchain: z.boolean(),
  price: z.number(),
  validFrom: z.string(),
  vectors: z.array(priceVectorSchema),
});
export const offersSchema = z.array(offerSchema);
export type MintOffer = z.infer<typeof offerSchema>;

export interface DecodedPriceVector {
  startTime: Date;
  baseTime: Date;
  basePrice: number;
  apr: number;
  priceFixDurationSeconds: number;
  state: string;
}

/** Fixed-point decoding only. Which vector is active, and how the program rounds, is a Phase 2 question. */
export function decodePriceVector(vector: RawPriceVector): DecodedPriceVector {
  return {
    startTime: new Date(vector.startTime * 1000),
    baseTime: new Date(vector.baseTime * 1000),
    basePrice: basePriceToNumber(vector.basePrice),
    apr: aprToFraction(vector.apr),
    priceFixDurationSeconds: vector.priceFixDuration,
    state: vector.state,
  };
}

export const redemptionOfferSchema = z.looseObject({
  offerAddress: z.string(),
  redemptionOfferAddress: z.string(),
  tokenInMint: z.string(),
  tokenOutMint: z.string(),
  disabled: z.boolean(),
  /** ONyc, whole tokens. */
  executedRedemptions: z.number(),
  requestedRedemptions: z.number(),
  feeBasisPoints: z.number(),
  feeBasisPointsPropAmmSell: z.number(),
  vaultTarget: z.number(),
});
export const redemptionOffersSchema = z.array(redemptionOfferSchema);
export type RedemptionOffer = z.infer<typeof redemptionOfferSchema>;

export const redemptionSettingsSchema = z.looseObject({
  allowPartialRedemptions: z.boolean(),
  coolDown: z.number(),
  growthRate: z.number(),
  initialCapacity: z.number(),
  maxCapacity: z.number(),
  maxSharePerRequest: z.number(),
  startTime: z.string(),
});
export type RedemptionSettings = z.infer<typeof redemptionSettingsSchema>;

/**
 * Only the empty shape ({eta:null, cooldown:null}) has been observed. The shape for a wallet with a real
 * pending request is unknown, so the values stay `unknown` until a fixture exists.
 */
export const redemptionEtaSchema = z.looseObject({
  eta: z.unknown(),
  cooldown: z.unknown(),
});

export const redemptionRequestSchema = z.looseObject({
  id: z.string(),
  redeemer: z.string(),
  redemptionOfferPda: z.string(),
  redemptionRequestPda: z.string(),
  requestStatus: z.string(),
  /** Null on older rows. */
  requestedAt: z.string().nullish(),
  redemptionTime: z.string().nullish(),
  tokenInMint: z.string(),
  tokenOutMint: z.string(),
  amount: z.number(),
  /** 0 on many EXECUTED rows, so not reliable on its own. */
  fulfilledAmount: z.number(),
  submissionTx: z.string().nullish(),
  fulfillmentTxs: z.array(z.string()),
});
export type RedemptionRequest = z.infer<typeof redemptionRequestSchema>;

export const redemptionRequestsPageSchema = z.looseObject({
  content: z.array(redemptionRequestSchema),
  page: z.looseObject({
    size: z.number(),
    number: z.number(),
    totalElements: z.number(),
    totalPages: z.number(),
  }),
});
export type RedemptionRequestsPage = z.infer<typeof redemptionRequestsPageSchema>;
