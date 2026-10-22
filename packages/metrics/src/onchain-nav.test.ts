import { readFileSync } from "node:fs";
import { decodeMarketStats, decodeOffer } from "@onyc/sources";
import { describe, expect, it } from "vitest";
import { scheduledNav, stepPriceRaw } from "./vector.js";

const fixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../sources/fixtures/onchain/${name}.json`, import.meta.url), "utf8"),
  ) as T;
const bytes = (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, "base64"));

describe("NAV on chain", () => {
  it("the price-vector formula in @onyc/metrics reproduces the NAV stored by the program, to the last digit", () => {
    const stats = decodeMarketStats(bytes(fixture<{ data: string }>("market-stats").data));
    const offer = fixture<{ pubkey: string; data: string }[]>("offers").find(
      (o) => o.pubkey === "E88zkA9Pxb1i8EfSHrEW5ZUe6hiQbo8DHWQ3WhDFw7p6",
    );
    const vectors = decodeOffer(bytes(offer?.data ?? "")).vectors.map((v) => ({
      startTime: Number(v.startTime),
      baseTime: Number(v.baseTime),
      basePrice: Number(v.basePrice),
      apr: Number(v.apr),
      priceFixDuration: Number(v.priceFixDuration),
    }));
    const at = Number(stats.lastUpdatedAt);
    // MarketStats.nav is the program's own price at the moment it was refreshed (market_stats.rs, recompute_market_stats).
    expect(scheduledNav(vectors, at)).toBe(Number(stats.nav) / 1e9);
    const active = vectors
      .filter((v) => v.startTime <= at)
      .sort((a, b) => b.startTime - a.startTime)[0];
    expect(active).toBeDefined();
    if (active !== undefined) expect(stepPriceRaw(active, at)).toBe(stats.nav);
  });
});
