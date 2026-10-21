/**
 * Test support: run the real worker jobs against the saved fixtures to fill a database. The API integration
 * tests use this so they exercise real rows, not hand-written ones. Exported as `@onyc/worker/testing`.
 */
import { readFileSync } from "node:fs";
import type { DbHandle } from "@onyc/db";
import pino from "pino";
import { loadConfig } from "../config.js";
import type { Ctx } from "../context.js";
import { resetBreakers } from "../health.js";
import { liveJob, navHistoryJob, offersJob, redemptionJob, settingsJob } from "../jobs/core.js";
import { geckoJob, llamaJob, solvencyJob } from "../jobs/market.js";
import {
  crawlLeaderboard,
  rewardsAumJob,
  rewardsCapitalJob,
  rewardsPointsJob,
} from "../jobs/rewards.js";
import { sheetsJob } from "../jobs/sheets.js";
import { evaluatorJob } from "../jobs/system.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`../../../../packages/sources/fixtures/${name}`, import.meta.url), "utf8");

/** A fetch that answers every upstream from the saved fixtures. */
export function fixtureFetch(): typeof fetch {
  // Substring routes, most specific first.
  const leaderboard = JSON.parse(fixture("rewards_leaderboard_page0_size250.json")) as {
    leaderboard: { totalPages: number; totalElements: number; last: boolean };
  };
  leaderboard.leaderboard.totalPages = 1;
  leaderboard.leaderboard.totalElements = 250;
  leaderboard.leaderboard.last = true;

  const routes: [string, () => Response][] = [
    ["/redemption/offers", () => new Response(fixture("core_redemption_offers.json"))],
    ["/redemption/settings", () => new Response(fixture("core_redemption_settings.json"))],
    ["/redemption/requests", () => new Response(fixture("core_redemption_requests.json"))],
    ["/data/live-nav", () => new Response(fixture("core_data_live-nav.json"))],
    ["/data/live-apy", () => new Response(fixture("core_data_live-apy.json"))],
    ["/data/live-tvl", () => new Response(fixture("core_data_live-tvl.json"))],
    ["/data/nav", () => new Response(fixture("core_data_nav.json"))],
    ["/settings", () => new Response(fixture("core_settings.json"))],
    ["/offers", () => new Response(fixture("core_offers.json"))],
    ["/analytics/aum/growth", () => new Response(fixture("rewards_aum_growth.json"))],
    [
      "/analytics/capital/distribution",
      () => new Response(fixture("rewards_capital_distribution.json")),
    ],
    [
      "/analytics/capital/reconciliation",
      () => new Response(fixture("rewards_capital_reconciliation.json")),
    ],
    ["/analytics/points/growth", () => new Response(fixture("rewards_points_growth.json"))],
    ["/points/leaderboard", () => new Response(JSON.stringify(leaderboard))],
    [
      "/points/DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh",
      () => new Response(fixture("rewards_points_wallet_active.json")),
    ],
    ["/referrals/stats", () => new Response(fixture("rewards_referrals_stats.json"))],
    ["/referrals/eligibility", () => new Response(fixture("rewards_referrals_eligibility.json"))],
    ["/referrals/code", () => new Response(fixture("rewards_referrals_code.json"))],
    ["gid=1418034083", () => new Response(fixture("sheet_opportunities.csv"))],
    ["gid=362705568", () => new Response(fixture("sheet_nav.csv"))],
    ["gid=1591707661", () => new Response(fixture("sheet_collateral.csv"))],
    ["gid=297157125", () => new Response(fixture("sheet_reinsurance.csv"))],
    ["/dashboard", () => new Response(fixture("accountable_dashboard.json"))],
    ["/price/v3", () => new Response(fixture("jupiter_price_v3.json"))],
    ["/tokens/", () => new Response(fixture("geckoterminal_pools.json"))],
    ["/protocol/onre", () => new Response(fixture("defillama_protocol_onre.json"))],
    ["yields.llama.fi/pools", () => new Response(fixture("defillama_yields_onyc.json"))],
  ];

  return (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find(([key]) => url.includes(key));
    if (route === undefined) return Promise.reject(new Error(`no fixture route for ${url}`));
    return Promise.resolve(route[1]());
  };
}

/** Fill `handle`'s database by running the worker jobs once against the fixtures, with the clock at `now`. */
export async function seedFromFixtures(
  handle: DbHandle,
  databaseUrl: string,
  now: Date,
): Promise<void> {
  resetBreakers();
  const ctx: Ctx = {
    handle,
    log: pino({ level: "silent" }),
    config: loadConfig({ DATABASE_URL: databaseUrl }),
    now: () => now,
    fetchOptions: { fetchImpl: fixtureFetch(), retries: 0 },
  };
  // The NAV sheet first, so nav_daily can pick up the reported APY.
  for (const job of [
    sheetsJob,
    liveJob,
    navHistoryJob,
    offersJob,
    redemptionJob,
    settingsJob,
    rewardsAumJob,
    rewardsCapitalJob,
    rewardsPointsJob,
    solvencyJob,
    geckoJob,
    llamaJob,
  ]) {
    await job.run(ctx);
  }
  await crawlLeaderboard(ctx, true);
  await evaluatorJob.run(ctx);
}
