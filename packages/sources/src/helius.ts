import { z } from "zod";
import { SOURCE } from "./clients.js";
import { SourceError } from "./errors.js";
import { httpGet, validate, type FetchOptions, type SourceResult } from "./http.js";

/**
 * UNVERIFIED AGAINST THE LIVE SERVICE: no Helius key was available when this was written. The two methods and
 * response shapes below are the standard Solana JSON-RPC ones; the schema is applied to every response, so a
 * mismatch degrades the source instead of storing garbage. Re-check with `pnpm test:live` once a key exists.
 */

const supplySchema = z.looseObject({
  result: z.looseObject({
    value: z.looseObject({ amount: z.string(), decimals: z.number().int() }),
  }),
});

const largestSchema = z.looseObject({
  result: z.looseObject({
    value: z.array(
      z.looseObject({ address: z.string(), amount: z.string(), decimals: z.number().int() }),
    ),
  }),
});

export interface ChainSnapshot {
  /** Whole tokens. */
  supply: number;
  /** The largest token accounts (an RPC call returns up to 20). Not de-duplicated by owner. */
  topAccounts: { address: string; amount: number }[];
}

export const HELIUS_RPC = "https://mainnet.helius-rpc.com/";

async function rpc<T>(
  apiKey: string,
  method: string,
  params: unknown[],
  schema: z.ZodType<T>,
  options: FetchOptions,
): Promise<{ data: T; raw: string; response: Awaited<ReturnType<typeof httpGet>> }> {
  const url = `${HELIUS_RPC}?api-key=${encodeURIComponent(apiKey)}`;
  const response = await httpGet(SOURCE.helius, url, {
    ...options,
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    headers: { "content-type": "application/json" },
    displayUrl: `${HELIUS_RPC}?api-key=REDACTED`,
  });
  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch (error) {
    throw new SourceError("parse", SOURCE.helius, HELIUS_RPC, `${method}: body is not valid JSON`, {
      cause: error,
    });
  }
  return { data: validate(SOURCE.helius, HELIUS_RPC, schema, json), raw: response.text, response };
}

export const helius = {
  chainSnapshot: async (
    apiKey: string,
    mint: string,
    options: FetchOptions = {},
  ): Promise<SourceResult<ChainSnapshot>> => {
    const supply = await rpc(apiKey, "getTokenSupply", [mint], supplySchema, options);
    const largest = await rpc(apiKey, "getTokenLargestAccounts", [mint], largestSchema, options);
    const scale = 10 ** supply.data.result.value.decimals;
    const toTokens = (amount: string, decimals: number): number => Number(amount) / 10 ** decimals;
    return {
      data: {
        supply: Number(supply.data.result.value.amount) / scale,
        topAccounts: largest.data.result.value.map((a) => ({
          address: a.address,
          amount: toTokens(a.amount, a.decimals),
        })),
      },
      raw: JSON.stringify({ supply: supply.raw, largest: largest.raw }),
      url: HELIUS_RPC,
      status: largest.response.status,
      fetchedAt: largest.response.fetchedAt,
      latencyMs: supply.response.latencyMs + largest.response.latencyMs,
    };
  },
};
