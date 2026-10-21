import { desc, schema, sql } from "@onyc/db";
import { CONSTANTS, SOURCE, accountable, defiLlama, geckoTerminal, helius } from "@onyc/sources";
import type { Job } from "../context.js";
import { recordNotConfigured, track } from "../health.js";
import { chunked, floorToMinute, saveRaw } from "../snapshots.js";

/** Every 15 minutes. Accountable's own retrieval time can lag by days; the evaluator watches that. */
export const solvencyJob: Job = {
  name: "solvency",
  schedule: "0 1-59/15 * * * *",
  startDelayMs: 3_000,
  async run(ctx) {
    const result = await track(ctx, SOURCE.accountable, "GET /dashboard", () =>
      accountable.dashboard(ctx.fetchOptions),
    );
    if (result === null) return;
    await saveRaw(ctx, SOURCE.accountable, "GET /dashboard", result, "json");
    const s = result.data;

    const t = schema.solvencySnap;
    const latest = (await ctx.handle.db.select().from(t).orderBy(desc(t.ts)).limit(1))[0];
    if (
      latest !== undefined &&
      latest.retrievedAt.getTime() === s.retrievedAt.getTime() &&
      latest.collateralization === s.collateralization &&
      latest.merkleRoot === s.merkleRoot
    ) {
      return;
    }
    await ctx.handle.db.insert(t).values({
      ts: result.fetchedAt,
      collateralization: s.collateralization,
      reservesUsd: s.reservesUsd,
      supplyUsd: s.supplyUsd,
      retrievedAt: s.retrievedAt,
      merkleRoot: s.merkleRoot,
      venues: s.venues,
    });
  },
};

/** Every 5 minutes: DEX pools. No raw payload is kept; the table holds the values. */
export const geckoJob: Job = {
  name: "geckoterminal",
  schedule: "0 4-59/5 * * * *",
  startDelayMs: 4_000,
  async run(ctx) {
    const result = await track(ctx, SOURCE.gecko, "GET /networks/solana/tokens/{mint}/pools", () =>
      geckoTerminal.tokenPools(CONSTANTS.onycMint, ctx.fetchOptions),
    );
    if (result === null) return;
    const ts = floorToMinute(result.fetchedAt);
    const rows = result.data.data.map((pool) => ({
      ts,
      pool: pool.attributes.address,
      name: pool.attributes.name,
      dex: pool.relationships.dex.data.id,
      priceUsd: pool.attributes.base_token_price_usd,
      liquidityUsd: pool.attributes.reserve_in_usd,
      volume24h: pool.attributes.volume_usd.h24,
      priceChange24hPct: pool.attributes.price_change_percentage.h24,
    }));
    await chunked(rows, 100, (chunk) =>
      ctx.handle.db.insert(schema.marketPoolsSnap).values(chunk).onConflictDoNothing(),
    );
  },
};

/** Hourly: DefiLlama's TVL history and the ONyc yield pools (the payload is trimmed at the client). */
export const llamaJob: Job = {
  name: "defillama",
  schedule: "0 25 * * * *",
  startDelayMs: 30_000,
  async run(ctx) {
    const { db } = ctx.handle;
    const protocol = await track(ctx, SOURCE.llama, "GET /protocol/onre", () =>
      defiLlama.protocol(ctx.fetchOptions),
    );
    if (protocol !== null) {
      await saveRaw(ctx, SOURCE.llama, "GET /protocol/onre", protocol, "json");
      const rows = protocol.data.tvl.map((point) => ({
        date: new Date(point.date * 1000).toISOString().slice(0, 10),
        tvl: point.totalLiquidityUSD,
      }));
      // Two points can fall on one UTC date; the later one wins.
      const byDate = new Map(rows.map((r) => [r.date, r]));
      await chunked([...byDate.values()], 500, (chunk) =>
        db
          .insert(schema.llamaTvlDaily)
          .values(chunk)
          .onConflictDoUpdate({
            target: schema.llamaTvlDaily.date,
            set: { tvl: sql`excluded.tvl` },
          }),
      );
    }

    const pools = await track(ctx, SOURCE.llama, "GET yields /pools (ONyc only)", () =>
      defiLlama.onycYieldPools(ctx.fetchOptions),
    );
    if (pools !== null) {
      await saveRaw(ctx, SOURCE.llama, "GET yields /pools (ONyc only)", pools, "json");
      const ts = floorToMinute(pools.fetchedAt);
      await chunked(
        pools.data.map((p) => ({
          ts,
          pool: p.pool,
          project: p.project,
          chain: p.chain,
          symbol: p.symbol,
          apy: p.apy,
          apyBase: p.apyBase,
          tvl: p.tvlUsd,
        })),
        100,
        (chunk) => db.insert(schema.llamaPoolsSnap).values(chunk).onConflictDoNothing(),
      );
    }
  },
};

/** Every 15 minutes. Skipped, and shown as "not configured", without HELIUS_API_KEY. */
export const heliusJob: Job = {
  name: "helius",
  schedule: "0 6-51/15 * * * *",
  startDelayMs: 6_000,
  async run(ctx) {
    const key = ctx.config.HELIUS_API_KEY;
    if (key === undefined) {
      await recordNotConfigured(ctx, SOURCE.helius, "chain snapshot", "HELIUS_API_KEY is not set");
      return;
    }
    const result = await track(ctx, SOURCE.helius, "chain snapshot", () =>
      helius.chainSnapshot(key, CONSTANTS.onycMint, ctx.fetchOptions),
    );
    if (result === null) return;
    await ctx.handle.db
      .insert(schema.chainSnap)
      .values({
        ts: floorToMinute(result.fetchedAt),
        supply: result.data.supply,
        holders: null,
        topHolders: result.data.topAccounts,
        custodyBalances: null,
      })
      .onConflictDoNothing();
  },
};
