import { z } from "zod";
import { looseNumber } from "../parse/numbers.js";

const assetValue = z.looseObject({ value: z.number(), tag: z.string() });

/**
 * `onre.accountable.capital:8443/dashboard`. Timestamps are epoch milliseconds, sometimes as strings.
 * The ZK proof blobs under `attestations` are ignored here (they remain in the raw snapshot).
 */
export const accountableDashboardSchema = z.looseObject({
  res: z.literal("ok"),
  data: z.looseObject({
    collateralization: z.number(),
    net: z.number(),
    /** Retrieval time, epoch ms. Staleness of this value is itself a signal. */
    ts: looseNumber,
    attestations: z.looseObject({
      merkle_root: z.looseObject({
        rootHash: z.string(),
        signature: z.string(),
        ts: looseNumber,
      }),
      snapshot: z.looseObject({ ts: looseNumber }),
    }),
    reserves: z.looseObject({
      total_reserves: z.looseObject({ value: z.number() }),
      total_supply: z.looseObject({ value: z.number() }),
      /** venue -> asset -> value. */
      reserves_split: z.record(z.string(), z.record(z.string(), assetValue)),
      supply_split: z.record(z.string(), z.record(z.string(), assetValue)),
      timeline: z.array(
        z.looseObject({
          ts: looseNumber,
          date: z.string(),
          supply: z.number(),
          reserves: z.number(),
        }),
      ),
    }),
    dataSources: z.record(
      z.string(),
      z.looseObject({
        pctOfReserves: z.number(),
        frequency: z.string(),
        lastUpdated: looseNumber,
        status: z.string(),
      }),
    ),
  }),
});
export type AccountableDashboard = z.infer<typeof accountableDashboardSchema>;

export interface SolvencyView {
  collateralization: number;
  reservesUsd: number;
  supplyUsd: number;
  /** When Accountable last retrieved its data. */
  retrievedAt: Date;
  merkleRoot: string;
  merkleRootAt: Date;
  /** venue -> asset -> USD. */
  venues: Record<string, Record<string, { usd: number; tag: string }>>;
}

export function toSolvencyView(dashboard: AccountableDashboard): SolvencyView {
  const { data } = dashboard;
  const venues: SolvencyView["venues"] = {};
  for (const [venue, assets] of Object.entries(data.reserves.reserves_split)) {
    venues[venue] = {};
    for (const [asset, entry] of Object.entries(assets)) {
      const bucket = venues[venue];
      if (bucket !== undefined) bucket[asset] = { usd: entry.value, tag: entry.tag };
    }
  }
  return {
    collateralization: data.collateralization,
    reservesUsd: data.reserves.total_reserves.value,
    supplyUsd: data.reserves.total_supply.value,
    retrievedAt: new Date(data.ts),
    merkleRoot: data.attestations.merkle_root.rootHash,
    merkleRootAt: new Date(data.attestations.merkle_root.ts),
    venues,
  };
}
