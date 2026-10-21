import { describe, expect, it } from "vitest";
import {
  CONSTANTS,
  accountable,
  defiLlama,
  geckoTerminal,
  jupiter,
  onreCore,
  onreRewards,
  onreSheets,
} from "./clients.js";
import { fakeFetch, fixtureText } from "./fixture.testutil.js";
import { decodePriceVector } from "./schemas/core.js";
import { pointsBreakdownSchema } from "./schemas/rewards.js";

const WALLET = "DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh";

function routes(): ReturnType<typeof fakeFetch> {
  return fakeFetch({
    "/redemption/offers": { body: fixtureText("core_redemption_offers.json") },
    "/redemption/settings": { body: fixtureText("core_redemption_settings.json") },
    "/redemption/eta": { body: fixtureText("core_redemption_eta.json") },
    "/redemption/requests": { body: fixtureText("core_redemption_requests.json") },
    "/data/live-nav": { body: fixtureText("core_data_live-nav.json") },
    "/data/live-apy": { body: fixtureText("core_data_live-apy.json") },
    "/data/live-tvl": { body: fixtureText("core_data_live-tvl.json") },
    "/data/nav": { body: fixtureText("core_data_nav.json") },
    "/settings": { body: fixtureText("core_settings.json") },
    "/offers": { body: fixtureText("core_offers.json") },
    "/analytics/aum/growth": { body: fixtureText("rewards_aum_growth.json") },
    "/analytics/capital/distribution": { body: fixtureText("rewards_capital_distribution.json") },
    "/analytics/capital/reconciliation": {
      body: fixtureText("rewards_capital_reconciliation.json"),
    },
    "/analytics/points/growth": { body: fixtureText("rewards_points_growth.json") },
    "/points/leaderboard": { body: fixtureText("rewards_leaderboard_page0_size250.json") },
    [`/points/${WALLET}`]: { body: fixtureText("rewards_points_wallet_active.json") },
    "/referrals/stats": { body: fixtureText("rewards_referrals_stats.json") },
    "/referrals/eligibility": { body: fixtureText("rewards_referrals_eligibility.json") },
    "/referrals/status": { body: fixtureText("rewards_referrals_status.json") },
    "/referrals/code/11111111111111111111111111111111": {
      status: 404,
      body: fixtureText("rewards_referrals_code_404.json"),
    },
    "/referrals/code": { body: fixtureText("rewards_referrals_code.json") },
    "gid=1418034083": { body: fixtureText("sheet_opportunities.csv") },
    "gid=362705568": { body: fixtureText("sheet_nav.csv") },
    "gid=1591707661": { body: fixtureText("sheet_collateral.csv") },
    "gid=297157125": { body: fixtureText("sheet_reinsurance.csv") },
    "/dashboard": { body: fixtureText("accountable_dashboard.json") },
    "/price/v3": { body: fixtureText("jupiter_price_v3.json") },
    "/tokens/": { body: fixtureText("geckoterminal_pools.json") },
    "/protocol/onre": { body: fixtureText("defillama_protocol_onre.json") },
    "/pools": { body: fixtureText("defillama_yields_onyc.json") },
  });
}

describe("OnRe core API (2026-10-21 fixtures)", () => {
  const { fetchImpl } = routes();
  const o = { fetchImpl };

  it("reads the bare live numbers", async () => {
    expect((await onreCore.liveNav(o)).data).toBe(1.157827091);
    expect((await onreCore.liveApy(o)).data).toBe(0.1102);
    expect((await onreCore.liveTvl(o)).data).toBeCloseTo(282829656.4432622, 3);
  });

  it("parses /data/nav: MM/DD/YYYY dates, string numbers, null AUM on early rows", async () => {
    const { data } = await onreCore.navHistory(o);
    expect(data).toHaveLength(511);
    expect(data[0]).toMatchObject({
      date: "2026-10-21",
      nav: 1.157827091,
      fundName: "ONyc",
      fundId: 1,
    });
    expect(data[0]?.aum).toBeCloseTo(282829656.44, 1);
    expect(data.at(-1)).toMatchObject({ date: "2025-05-28", aum: null, circulatingSupply: null });
  });

  it("parses settings, keeping the sUSDe benchmark in percent units", async () => {
    const { data } = await onreCore.settings(o);
    expect(data.primaryToken).toBe(CONSTANTS.onycMint);
    expect(data.primaryAsset).toBe(CONSTANTS.usdcMint);
    expect(data.misc.onycApy).toBe(0.1102);
    expect(data.misc.sUSDeAPY).toBeCloseTo(3.5057, 3);
    expect(data.tokens[CONSTANTS.onycMint]).toMatchObject({
      symbol: "ONyc",
      decimals: 9,
      supply: 169246816,
    });
  });

  it("parses both mint offers and their three price vectors", async () => {
    const { data } = await onreCore.offers(o);
    expect(data.map((offer) => offer.address).sort()).toEqual(
      [CONSTANTS.mintOffers.usdc, CONSTANTS.mintOffers.usdg].sort(),
    );
    const usdc = data.find((offer) => offer.address === CONSTANTS.mintOffers.usdc);
    expect(usdc?.price).toBe(1.157827091);
    expect(usdc?.vectors).toHaveLength(3);
    const newest = decodePriceVector(usdc?.vectors[2] ?? (undefined as never));
    expect(newest.basePrice).toBeCloseTo(1.146935367, 9);
    expect(newest.apr).toBeCloseTo(0.104555, 9);
    expect(newest.baseTime.toISOString()).toBe("2026-09-19T00:00:00.000Z");
    expect(newest.priceFixDurationSeconds).toBe(86400);
  });

  it("parses redemption offers and settings", async () => {
    const offers = (await onreCore.redemptionOffers(o)).data;
    expect(offers).toHaveLength(2);
    expect(offers.every((offer) => offer.feeBasisPoints === 25)).toBe(true);
    const settings = (await onreCore.redemptionSettings(o)).data;
    expect(settings).toMatchObject({
      coolDown: 86400,
      initialCapacity: 3250000,
      maxCapacity: 12000000,
      maxSharePerRequest: 0.185,
      allowPartialRedemptions: true,
    });
  });

  it("parses the redemption log: 50 rows, the page block, nullable fields", async () => {
    const { data } = await onreCore.redemptionRequests(0, 100, o);
    expect(data.content).toHaveLength(50);
    expect(data.page).toMatchObject({ totalElements: 50, totalPages: 1 });
    expect(data.content[0]).toMatchObject({ requestStatus: "EXECUTED", amount: 105000 });
  });

  it("parses the empty eta shape and rejects a malformed wallet before any request", async () => {
    const { data } = await onreCore.redemptionEta(WALLET, 1, o);
    expect(data).toMatchObject({ eta: null, cooldown: null });
    expect(() => onreCore.redemptionEta("../etc", 1, o)).toThrow(/valid base58/);
  });
});

describe("OnRe rewards API (2026-10-21 fixtures)", () => {
  const { fetchImpl } = routes();
  const o = { fetchImpl };

  it("parses protocol AUM history", async () => {
    const { data } = await onreRewards.aumGrowth(o);
    expect(data.series).toHaveLength(2880);
    expect(new Set(data.series.map((row) => row.protocol))).toEqual(
      new Set(["orca", "wallet", "kamino", "exponent", "loopscale", "carrot", "elemental"]),
    );
    expect(data.series[0]).toMatchObject({ date: "2025-06-04", protocol: "orca", deltaUsd: null });
  });

  it("parses capital distribution: seven protocols, shares are fractions", async () => {
    const { data } = await onreRewards.capitalDistribution(o);
    expect(data.distribution).toHaveLength(7);
    const kamino = data.distribution.find((d) => d.protocol === "kamino");
    expect(kamino?.sharePct).toBeGreaterThan(0.5);
    expect(kamino?.sharePct).toBeLessThan(0.6);
    const sum = data.distribution.reduce((s, d) => s + d.capitalUsd, 0);
    expect(sum).toBeCloseTo(data.totalAumUsd, 0);
  });

  it("parses reconciliation, where the unexplained USD equals the orca bucket", async () => {
    const { data } = await onreRewards.capitalReconciliation(o);
    const distribution = (await onreRewards.capitalDistribution(o)).data;
    const orca = distribution.distribution.find((d) => d.protocol === "orca");
    expect(data.unexplainedOnycUsd).toBeCloseTo(orca?.capitalUsd ?? Number.NaN, 2);
    expect(data.entries.some((entry) => entry.protocol === "orca")).toBe(false);
  });

  it("parses the 31-day points growth series", async () => {
    const { data } = await onreRewards.pointsGrowth(o);
    expect(data.series).toHaveLength(31);
  });

  it("parses a leaderboard page with the full venue breakdown and the global multiplier", async () => {
    const { data } = await onreRewards.leaderboard(0, 250, o);
    expect(data.leaderboard.content).toHaveLength(250);
    expect(data.leaderboard.totalElements).toBeGreaterThan(24000);
    const top = data.leaderboard.content[0];
    expect(top).toMatchObject({ rank: 1, rankChange: 0 });
    expect(top?.pointsBreakdown.kamino.onyc).toBeGreaterThan(0);
    expect(top?.activeMultipliers?.[0]).toMatchObject({
      sourceType: "GLOBAL",
      multiplier: 0.0001,
      effectiveFromDate: "2026-10-03",
      effectiveToDate: null,
    });
  });

  it("parses a wallet, and a wallet with no activity", async () => {
    const { data } = await onreRewards.walletPoints(WALLET, o);
    expect(data.rank).toBe(1);
    const inactive = pointsBreakdownSchema.safeParse(
      (
        JSON.parse(fixtureText("rewards_points_wallet_inactive.json")) as {
          pointsBreakdown: unknown;
        }
      ).pointsBreakdown,
    );
    expect(inactive.success).toBe(true);
  });

  it("parses referral endpoints and treats 404 on the code as no code", async () => {
    expect((await onreRewards.referralStats(WALLET, o)).data.totalReferrals).toBe(23);
    expect((await onreRewards.referralEligibility(WALLET, o)).data.isEligible).toBe(true);
    expect((await onreRewards.referralStatus(WALLET, o)).data.isReferred).toBe(false);
    expect((await onreRewards.referralCode(WALLET, o)).data?.code).toBe("MOOSOLANA");
    const none = await onreRewards.referralCode("11111111111111111111111111111111", o);
    expect(none.data).toBeNull();
    expect(none.status).toBe(404);
  });

  it("flags a changed breakdown shape instead of passing it through", () => {
    const broken = { wallet: 1 };
    expect(pointsBreakdownSchema.safeParse(broken).success).toBe(false);
  });
});

describe("published sheets via the client", () => {
  const { fetchImpl, calls } = routes();
  const o = { fetchImpl };

  it("requests the four gids and parses them", async () => {
    expect((await onreSheets.opportunities(o)).data.opportunities).toHaveLength(28);
    expect((await onreSheets.nav(o)).data).toHaveLength(510);
    expect((await onreSheets.collateral(o)).data.assets).toHaveLength(13);
    expect((await onreSheets.reinsurance(o)).data).toHaveLength(30);
    for (const gid of ["1418034083", "362705568", "1591707661", "297157125"]) {
      expect(calls.some((url) => url.includes(`gid=${gid}`) && url.includes("output=csv"))).toBe(
        true,
      );
    }
  });
});

describe("Accountable", () => {
  it("maps the dashboard to a solvency view and keeps the stale retrieval time", async () => {
    const { fetchImpl } = routes();
    const { data } = await accountable.dashboard({ fetchImpl });
    expect(data.collateralization).toBeCloseTo(1.001993, 6);
    expect(data.reservesUsd).toBeCloseTo(292595324.54, 1);
    expect(data.supplyUsd).toBeCloseTo(292013484.35, 1);
    expect(data.retrievedAt.toISOString()).toBe("2026-10-15T05:43:01.026Z");
    expect(Object.keys(data.venues).sort()).toEqual([
      "Bank of New York Mellon",
      "Clarien Bank",
      "Ethereum",
      "Radix ILS",
      "Solana",
    ]);
    expect(data.venues["Solana"]?.["USDG"]).toMatchObject({ tag: "Stablecoin" });
  });
});

describe("market sources", () => {
  const { fetchImpl } = routes();
  const o = { fetchImpl };

  it("reads the Jupiter price keyed by mint", async () => {
    const { data } = await jupiter.price(CONSTANTS.onycMint, o);
    expect(data[CONSTANTS.onycMint]?.usdPrice).toBeCloseTo(1.15618, 4);
  });

  it("reads GeckoTerminal pools with string numbers converted", async () => {
    const { data } = await geckoTerminal.tokenPools(CONSTANTS.onycMint, o);
    expect(data.data).toHaveLength(20);
    const top = data.data[0];
    expect(top?.attributes.name).toBe("ONYC / USDC");
    expect(top?.attributes.reserve_in_usd).toBeCloseTo(3773569.3461, 3);
    expect(top?.attributes.volume_usd.h24).toBeGreaterThan(1e6);
    expect(top?.relationships.dex.data.id).toBe("orca");
  });

  it("reads DefiLlama TVL history and trims the stored payload", async () => {
    const result = await defiLlama.protocol(o);
    expect(result.data.tvl.length).toBeGreaterThan(400);
    expect(Object.keys(JSON.parse(result.raw) as object).sort()).toEqual([
      "currentChainTvls",
      "name",
      "tvl",
    ]);
  });

  it("keeps only ONyc pools from DefiLlama yields", async () => {
    const { data } = await defiLlama.onycYieldPools(o);
    expect(data).toHaveLength(10);
    expect(data.every((pool) => /onyc/i.test(pool.symbol))).toBe(true);
    expect(data.some((pool) => pool.project === "onre")).toBe(true);
  });
});
