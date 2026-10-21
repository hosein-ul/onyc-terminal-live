import { z } from "zod";
import { looseNumberOrNull } from "../parse/numbers.js";

/** Jupiter `price/v3`: an object keyed by mint. */
export const jupiterPriceSchema = z.record(
  z.string(),
  z.looseObject({
    usdPrice: z.number(),
    liquidity: z.number().nullish(),
    priceChange24h: z.number().nullish(),
    blockId: z.number().nullish(),
    decimals: z.number().nullish(),
    createdAt: z.string().nullish(),
  }),
);
export type JupiterPrices = z.infer<typeof jupiterPriceSchema>;

const idRef = z.looseObject({ data: z.looseObject({ id: z.string() }) });

export const geckoPoolsSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string(),
      attributes: z.looseObject({
        address: z.string(),
        name: z.string(),
        pool_created_at: z.string().nullish(),
        base_token_price_usd: looseNumberOrNull,
        quote_token_price_usd: looseNumberOrNull,
        reserve_in_usd: looseNumberOrNull,
        volume_usd: z.looseObject({ h24: looseNumberOrNull }),
        price_change_percentage: z.looseObject({ h24: looseNumberOrNull }),
      }),
      relationships: z.looseObject({
        dex: idRef,
        base_token: idRef,
        quote_token: idRef,
      }),
    }),
  ),
});
export type GeckoPools = z.infer<typeof geckoPoolsSchema>;

/** `api.llama.fi/protocol/onre`, trimmed to the TVL history (the full payload is 145 KB). */
export const llamaProtocolSchema = z.looseObject({
  name: z.string(),
  tvl: z.array(z.looseObject({ date: z.number().int(), totalLiquidityUSD: z.number() })),
  currentChainTvls: z.record(z.string(), z.number()),
});
export type LlamaProtocol = z.infer<typeof llamaProtocolSchema>;

export const llamaPoolSchema = z.looseObject({
  chain: z.string(),
  project: z.string(),
  symbol: z.string(),
  pool: z.string(),
  tvlUsd: z.number(),
  apy: z.number().nullable(),
  apyBase: z.number().nullable(),
  apyReward: z.number().nullable(),
});
export const llamaYieldsSchema = z.looseObject({
  status: z.string(),
  data: z.array(llamaPoolSchema),
});
export type LlamaPool = z.infer<typeof llamaPoolSchema>;

/** The yields payload is about 11 MB; keep only ONyc pools. */
export function filterOnycPools(pools: readonly LlamaPool[]): LlamaPool[] {
  return pools.filter((pool) => /onyc/i.test(pool.symbol));
}
