/**
 * Contract tests against the real upstreams. Opt-in: `pnpm test:live`.
 * They assert shapes and invariants (never today's numbers), so they fail when an upstream changes its contract.
 * Requests are sequential and light. Set LIVE_SLOW=1 to include the 11 MB DefiLlama yields payload and
 * HELIUS_API_KEY to include the Helius check.
 */
import { describe, expect, it } from "vitest";
import {
  CONSTANTS,
  accountable,
  defiLlama,
  geckoTerminal,
  helius,
  jupiter,
  onreCore,
  onreRewards,
  onreSheets,
} from "../src/index.js";

const WALLET = "DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh";
const slow = process.env["LIVE_SLOW"] === "1";
const heliusKey = process.env["HELIUS_API_KEY"];

describe("OnRe core API", () => {
  it("live NAV, APY, TVL", async () => {
    const [nav, apy, tvl] = [
      (await onreCore.liveNav()).data,
      (await onreCore.liveApy()).data,
      (await onreCore.liveTvl()).data,
    ];
    expect(nav).toBeGreaterThan(1);
    expect(nav).toBeLessThan(2);
    expect(apy).toBeGreaterThan(0);
    expect(apy).toBeLessThan(1);
    expect(tvl).toBeGreaterThan(1e6);
  });

  it("NAV history reaches back to 2025-05-28 with newest first", async () => {
    const { data } = await onreCore.navHistory();
    expect(data.length).toBeGreaterThan(500);
    expect(data.at(-1)?.date).toBe("2025-05-28");
    expect((data[0]?.date ?? "") > (data.at(-1)?.date ?? "")).toBe(true);
  });

  it("settings point at the known ONyc and USDC mints", async () => {
    const { data } = await onreCore.settings();
    expect(data.primaryToken).toBe(CONSTANTS.onycMint);
    expect(data.primaryAsset).toBe(CONSTANTS.usdcMint);
    expect(data.tokens[CONSTANTS.onycMint]?.symbol).toBe("ONyc");
  });

  it("mint offers are the known two and their price matches live NAV", async () => {
    const { data } = await onreCore.offers();
    const nav = (await onreCore.liveNav()).data;
    expect(data.map((o) => o.address).sort()).toEqual(
      [CONSTANTS.mintOffers.usdc, CONSTANTS.mintOffers.usdg].sort(),
    );
    for (const offer of data) {
      expect(Math.abs(offer.price - nav)).toBeLessThan(1e-3);
      expect(offer.vectors.length).toBeGreaterThan(0);
    }
  });

  it("redemption offers, settings and request log", async () => {
    expect((await onreCore.redemptionOffers()).data.length).toBeGreaterThan(0);
    const settings = (await onreCore.redemptionSettings()).data;
    expect(settings.maxCapacity).toBeGreaterThanOrEqual(settings.initialCapacity);
    const log = (await onreCore.redemptionRequests(0, 100)).data;
    expect(log.page.totalElements).toBeGreaterThanOrEqual(0);
  });

  it("redemption eta accepts a wallet with no request", async () => {
    const { data } = await onreCore.redemptionEta(WALLET, 1);
    expect(data).toHaveProperty("eta");
  });
});

describe("OnRe rewards API", () => {
  it("analytics endpoints", async () => {
    const aum = (await onreRewards.aumGrowth()).data;
    expect(aum.series.length).toBeGreaterThan(1000);
    const dist = (await onreRewards.capitalDistribution()).data;
    const sum = dist.distribution.reduce((s, d) => s + d.capitalUsd, 0);
    expect(Math.abs(sum - dist.totalAumUsd)).toBeLessThan(1);
    const recon = (await onreRewards.capitalReconciliation()).data;
    expect(recon.unexplainedOnycUsd).toBeGreaterThan(0);
    expect((await onreRewards.pointsGrowth()).data.series.length).toBeGreaterThan(0);
  });

  it("leaderboard page and wallet endpoints", async () => {
    const { data } = await onreRewards.leaderboard(0, 50);
    expect(data.leaderboard.totalElements).toBeGreaterThan(1000);
    expect(data.leaderboard.content).toHaveLength(50);
    expect(data.leaderboard.content[0]?.rank).toBe(1);
    expect((await onreRewards.walletPoints(WALLET)).data.address).toBe(WALLET);
    expect((await onreRewards.referralStats(WALLET)).data.walletAddress).toBe(WALLET);
    expect((await onreRewards.referralEligibility(WALLET)).data).toHaveProperty("isEligible");
    expect((await onreRewards.referralStatus(WALLET)).data).toHaveProperty("isReferred");
    const none = await onreRewards.referralCode("11111111111111111111111111111111");
    expect(none.data).toBeNull();
  });
});

describe("Published sheets", () => {
  it("reinsurance layers parse and have positive capital", async () => {
    const { data } = await onreSheets.reinsurance();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((l) => l.capitalDeployed > 0)).toBe(true);
  });
  it("opportunities parse without subtotal rows", async () => {
    const { data } = await onreSheets.opportunities();
    expect(data.opportunities.length).toBeGreaterThan(0);
    expect(data.opportunities.every((o) => o.classification !== "")).toBe(true);
  });
  it("NAV mirror and collateral parse", async () => {
    expect((await onreSheets.nav()).data.length).toBeGreaterThan(400);
    expect((await onreSheets.collateral()).data.assets.length).toBeGreaterThan(0);
  });
});

describe("Solvency and market data", () => {
  it("Accountable dashboard", async () => {
    const { data } = await accountable.dashboard();
    expect(data.collateralization).toBeGreaterThan(0.9);
    expect(data.collateralization).toBeLessThan(1.2);
    expect(data.retrievedAt.getTime()).toBeGreaterThan(Date.UTC(2025, 0, 1));
  });
  it("Jupiter price is within 5% of NAV", async () => {
    const price = (await jupiter.price()).data[CONSTANTS.onycMint]?.usdPrice ?? 0;
    const nav = (await onreCore.liveNav()).data;
    expect(Math.abs(price / nav - 1)).toBeLessThan(0.05);
  });
  it("GeckoTerminal lists pools", async () => {
    expect((await geckoTerminal.tokenPools()).data.data.length).toBeGreaterThan(0);
  });
  it("DefiLlama TVL history", async () => {
    expect((await defiLlama.protocol()).data.tvl.length).toBeGreaterThan(100);
  });
  it.skipIf(!slow)(
    "DefiLlama yields include ONyc pools",
    async () => {
      expect((await defiLlama.onycYieldPools()).data.length).toBeGreaterThan(0);
    },
    240_000,
  );
  it.skipIf(heliusKey === undefined)("Helius chain snapshot", async () => {
    const { data } = await helius.chainSnapshot(heliusKey ?? "", CONSTANTS.onycMint);
    expect(data.supply).toBeGreaterThan(0);
  });
});
