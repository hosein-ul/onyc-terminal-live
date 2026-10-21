import { readFileSync } from "node:fs";
import { parseReinsuranceSheet } from "@onyc/sources";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RISK_THRESHOLDS,
  LOOPING_PROTOCOLS,
  annualize,
  aumAttribution,
  aumAttributionSeries,
  aumDivergence,
  blendedCollateralApy,
  bookExpectedYield,
  bookTotals,
  buildRiskSignals,
  capitalByPerilFamily,
  capitalByStructure,
  capitalStack,
  dailyIncrementPpm,
  dailyIncrements,
  exitEstimate,
  findActiveVector,
  forwardPath,
  gini,
  grade,
  isPastRenewal,
  liquidityCoverage,
  loopingShare,
  lorenz,
  mad,
  median,
  monthsToRenewal,
  navReturn,
  netFlowUsd,
  pastRenewal,
  perilFamily,
  perilTags,
  premiumBps,
  premiumToEL,
  rankMovement,
  rankPercentile,
  rateOnCapital,
  renewalCalendar,
  scheduledNav,
  smoothness,
  sourceSpread,
  stepEvents,
  stepPriceRaw,
  structureFamily,
  topNShare,
  trancheSpread,
  vectorPriceRaw,
  walletsAbove,
  windowReturns,
  type Layer,
  type PriceVector,
} from "./index.js";

// The three vectors served by /offers on 2026-10-21 (core_offers.json).
const VECTORS: PriceVector[] = [
  {
    startTime: 1787856994,
    baseTime: 1787788800,
    basePrice: 1139068660,
    apr: 109239,
    priceFixDuration: 86400,
  },
  {
    startTime: 1787846691,
    baseTime: 1787788800,
    basePrice: 1138330223,
    apr: 109239,
    priceFixDuration: 86400,
  },
  {
    startTime: 1789776000,
    baseTime: 1789776000,
    basePrice: 1146935367,
    apr: 104555,
    priceFixDuration: 86400,
  },
];
const newest = VECTORS[2] as PriceVector;
const at = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

describe("price vector (ported from onre-sol offer_utils.rs)", () => {
  it("reproduces the live NAV 1.157827091 on 2026-10-21 with the newest vector", () => {
    expect(scheduledNav(VECTORS, at("2026-10-21T15:43:00Z"))).toBe(1.157827091);
  });
  it("picks the vector with the latest start time that has started", () => {
    expect(findActiveVector(VECTORS, at("2026-10-21T00:00:00Z"))?.basePrice).toBe(1146935367);
    expect(findActiveVector(VECTORS, at("2026-09-01T00:00:00Z"))?.basePrice).toBe(1139068660);
    expect(findActiveVector(VECTORS, at("2026-08-01T00:00:00Z"))).toBeNull();
    expect(scheduledNav(VECTORS, at("2026-08-01T00:00:00Z"))).toBeNull();
  });
  it("is fixed within a day and steps at 00:00 UTC", () => {
    expect(stepPriceRaw(newest, at("2026-10-21T00:00:00Z"))).toBe(
      stepPriceRaw(newest, at("2026-10-21T23:59:59Z")),
    );
    expect(stepPriceRaw(newest, at("2026-10-22T00:00:00Z"))).toBeGreaterThan(
      stepPriceRaw(newest, at("2026-10-21T23:59:59Z")),
    );
  });
  it("snaps to the end of the current window: the base time already carries one day of growth", () => {
    expect(stepPriceRaw(newest, newest.baseTime)).toBe(
      vectorPriceRaw(104555n, 1146935367n, 86400n),
    );
    expect(stepPriceRaw(newest, newest.baseTime)).toBeGreaterThan(BigInt(newest.basePrice));
  });
  it("compounds daily and returns the base price for zero apr or zero elapsed time", () => {
    expect(vectorPriceRaw(0n, 1_000_000_000n, 86400n * 10n)).toBe(1_000_000_000n);
    expect(vectorPriceRaw(100000n, 1_000_000_000n, 0n)).toBe(1_000_000_000n);
    const compounded = Number(vectorPriceRaw(100000n, 1_000_000_000n, 86400n * 365n)) / 1e9;
    expect(compounded).toBeCloseTo((1 + 0.1 / 365) ** 365, 8);
  });
  it("interpolates linearly inside a day", () => {
    const day = Number(vectorPriceRaw(100000n, 1_000_000_000n, 86400n));
    const next = Number(vectorPriceRaw(100000n, 1_000_000_000n, 86400n * 2n));
    const half = Number(vectorPriceRaw(100000n, 1_000_000_000n, 86400n + 43200n));
    expect(Math.abs(half - (day + next) / 2)).toBeLessThanOrEqual(1);
  });
  it("rejects a time before the base time", () => {
    expect(() => stepPriceRaw(newest, at("2026-09-01T00:00:00Z"))).toThrow();
  });
  it("builds a forward path that rises every day", () => {
    const path = forwardPath(VECTORS, at("2026-10-21T15:00:00Z"), 30);
    expect(path).toHaveLength(30);
    expect(path[0]?.time).toBe(at("2026-10-22T00:00:00Z"));
    for (let i = 1; i < path.length; i += 1) {
      expect(path[i]?.nav ?? 0).toBeGreaterThan(path[i - 1]?.nav ?? 0);
    }
  });
});

describe("NAV returns", () => {
  it("navReturn and annualize", () => {
    expect(navReturn(1, 1.1)).toBeCloseTo(0.1, 12);
    expect(annualize(0.1, 365)).toBeCloseTo(0.1, 12);
    expect(annualize(0.01, 30)).toBeCloseTo(1.01 ** (365 / 30) - 1, 12);
    expect(() => annualize(0.1, 0)).toThrow();
  });
  it("dailyIncrementPpm uses the NAV ratio", () => {
    expect(dailyIncrementPpm(1.157495524, 1.157827091)).toBeCloseTo(286.45, 1);
  });
  const pts = [
    { date: "2026-10-01", nav: 1.1 },
    { date: "2026-10-02", nav: 1.1002 },
    { date: "2026-10-03", nav: 1.1004 },
    { date: "2026-10-05", nav: 1.1008 },
  ];
  it("spreads a gap over its calendar days", () => {
    const inc = dailyIncrements(pts);
    expect(inc[2]?.gapDays).toBe(2);
    expect(inc[2]?.ppmPerDay).toBeCloseTo((inc[2]?.ppm ?? 0) / 2, 9);
  });
  it("accepts unsorted input", () => {
    expect(dailyIncrements([...pts].reverse())).toHaveLength(3);
  });
  it("window returns cover 7d, 30d, 90d, ytd and inception", () => {
    const series = Array.from({ length: 400 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 8, 1) + i * 86400000).toISOString().slice(0, 10),
      nav: 1 + i * 0.0003,
    }));
    const r = windowReturns(series);
    expect(r.map((x) => x.window)).toEqual(["7d", "30d", "90d", "ytd", "inception"]);
    const w7 = r.find((x) => x.window === "7d");
    expect(w7?.days).toBe(7);
    expect(w7?.return).toBeCloseTo(navReturn(1 + 392 * 0.0003, 1 + 399 * 0.0003), 12);
    expect(windowReturns([])).toEqual([]);
  });
});

describe("step events and smoothness", () => {
  const base = Array.from({ length: 40 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    nav: 1 + i * 0.0003,
  }));
  it("finds nothing in a perfectly smooth series", () => {
    expect(stepEvents(base)).toEqual([]);
  });
  it("flags a down-tick", () => {
    const pts = base.map((p, i) => (i === 20 ? { ...p, nav: p.nav - 0.002 } : p));
    const events = stepEvents(pts);
    expect(events.some((e) => e.date === base[20]?.date && e.reason === "downtick")).toBe(true);
  });
  it("flags an outlier step above 5 x MAD", () => {
    const pts = base.map((p, i) => (i >= 25 ? { ...p, nav: p.nav + 0.01 } : p));
    expect(stepEvents(pts).find((e) => e.date === base[25]?.date)?.reason).toBe("outlier");
  });
  it("reports a persistent step once, not once per day", () => {
    // Slope jumps from 300 ppm a day to 800 ppm a day on day 25 and stays there.
    let nav = 1;
    const pts = base.map((p, i) => {
      nav *= 1 + (i < 25 ? 300e-6 : 800e-6);
      return { date: p.date, nav };
    });
    const outliers = stepEvents(pts).filter((e) => e.reason === "outlier");
    expect(outliers).toHaveLength(1);
    expect(outliers[0]?.date).toBe(base[25]?.date);
  });
  it("flags the day a new vector starts", () => {
    expect(stepEvents(base, [base[10]?.date ?? ""])[0]).toMatchObject({
      date: base[10]?.date,
      reason: "new_vector",
    });
  });
  it("median and mad", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
    expect(median([])).toBeNaN();
  });
  it("smoothness: zero drawdown on a rising series, negative on a fall", () => {
    expect(smoothness(base)).toMatchObject({ maxDrawdown: 0, negativeDays: 0, observations: 39 });
    const dip = base.map((p, i) => (i === 20 ? { ...p, nav: p.nav - 0.002 } : p));
    const s = smoothness(dip);
    expect(s.negativeDays).toBe(1);
    expect(s.maxDrawdown).toBeLessThan(0);
    expect(s.stdevPpm).toBeGreaterThan(0);
  });
});

describe("AUM attribution", () => {
  const prev = { date: "d0", nav: 1.1, supply: 1000, aum: 1100 };
  const cur = { date: "d1", nav: 1.2, supply: 1100, aum: 1320 };
  it("splits the change into NAV effect and flow effect that sum exactly", () => {
    const a = aumAttribution(prev, cur);
    expect(a?.navEffect).toBeCloseTo(100, 9);
    expect(a?.flowEffect).toBeCloseTo(120, 9);
    expect(a?.deltaAum).toBe(220);
    expect(a?.residual).toBeCloseTo(0, 9);
  });
  it("shows a residual when reported AUM disagrees", () => {
    expect(aumAttribution(prev, { ...cur, aum: 1330 })?.residual).toBeCloseTo(10, 9);
  });
  it("skips days without AUM, and netFlowUsd matches", () => {
    expect(aumAttribution({ ...prev, aum: null }, cur)).toBeNull();
    expect(
      aumAttributionSeries([prev, cur, { date: "d2", nav: 1.2, supply: 1100, aum: null }]),
    ).toHaveLength(1);
    expect(netFlowUsd(1000, 1100, 1.2)).toBeCloseTo(120, 9);
  });
});

describe("market", () => {
  it("premiumBps matches the 2026-10-21 check: 1.15598 vs 1.15783 is about -16 bps", () => {
    expect(premiumBps(1.15598, 1.157827091)).toBeCloseTo(-15.96, 1);
  });
  it("liquidity coverage and spread", () => {
    expect(liquidityCoverage(42424107, 282827380)).toBeCloseTo(0.15, 6);
    expect(sourceSpread([282.8, 292.0, 294.2])).toBeCloseTo((294.2 - 282.8) / 282.8, 12);
    expect(sourceSpread([5])).toBe(0);
    expect(aumDivergence(179673794, 282829656)).toBeCloseTo(0.3647, 3);
  });
  it("exit estimate", () => {
    const e = exitEstimate(1000, 1.157827, 1.156, 25, 30);
    expect(e.navValueUsd).toBeCloseTo(1157.827, 6);
    expect(e.requestFeeUsd).toBeCloseTo(2.8945675, 6);
    expect(e.propAmmFeeUsd).toBeCloseTo(3.473481, 6);
    expect(e.marketValueUsd).toBeCloseTo(1156, 6);
    expect(exitEstimate(1, 1, null, 25, 30).marketValueUsd).toBeNull();
  });
});

describe("capital", () => {
  it("2026-10-21 stack sums to AUM: 152,722,725 + 87,680,548 + 42,424,107 = 282,827,380", () => {
    const s = capitalStack({
      boundUsd: 152722725,
      offeredUsd: 0,
      availableUsd: 87680548,
      liquidityLayerUsd: 42424107,
      aumUsd: 282827380,
    });
    expect(s.sumUsd).toBe(282827380);
    expect(s.difference).toBe(0);
    expect(s.sumsToAum).toBe(true);
  });
  it("derives available when not supplied, and detects a mismatch", () => {
    expect(
      capitalStack({ boundUsd: 100, offeredUsd: 0, liquidityLayerUsd: 15, aumUsd: 200 })
        .availableUsd,
    ).toBe(85);
    const bad = capitalStack({
      boundUsd: 100,
      offeredUsd: 0,
      availableUsd: 50,
      liquidityLayerUsd: 15,
      aumUsd: 200,
    });
    expect(bad.sumsToAum).toBe(false);
  });
  it("looping share counts Kamino and Loopscale", () => {
    expect(LOOPING_PROTOCOLS).toEqual(["kamino", "loopscale"]);
    const d = [
      { protocol: "kamino", capitalUsd: 547, share: 0.547 },
      { protocol: "loopscale", capitalUsd: 229, share: 0.229 },
      { protocol: "orca", capitalUsd: 39, share: 0.039 },
    ];
    expect(loopingShare(d, 1000)).toBeCloseTo(0.776, 9);
    expect(loopingShare(d, 0)).toBe(0);
  });
  it("blended collateral APY ignores rows with no APY", () => {
    expect(
      blendedCollateralApy([
        { asset: "a", amountUsd: 100, apy: 0.04 },
        { asset: "b", amountUsd: 100, apy: 0.06 },
        { asset: "c", amountUsd: 900, apy: null },
      ]),
    ).toBeCloseTo(0.05, 12);
    expect(blendedCollateralApy([])).toBeNull();
  });
  it("tranche spread", () => {
    expect(trancheSpread(0.0752, 0.1744)).toBeCloseTo(0.0992, 6);
    expect(trancheSpread(null, 0.1)).toBeNull();
  });
});

describe("points concentration", () => {
  it("gini: equality is 0, one holder of four is 0.75", () => {
    expect(gini([5, 5, 5, 5])).toBeCloseTo(0, 12);
    expect(gini([0, 0, 0, 100])).toBeCloseTo(0.75, 12);
    expect(gini([])).toBe(0);
  });
  it("lorenz runs from (0,0) to (1,1) and lies under the equality line", () => {
    const l = lorenz([1, 2, 3, 4, 10]);
    expect(l[0]).toEqual({ population: 0, points: 0 });
    expect(l.at(-1)).toEqual({ population: 1, points: 1 });
    expect(l.every((p) => p.points <= p.population + 1e-12)).toBe(true);
  });
  it("thins the curve but keeps the endpoints", () => {
    const l = lorenz(
      Array.from({ length: 5000 }, (_, i) => i + 1),
      100,
    );
    expect(l.length).toBeLessThan(150);
    expect(l.at(-1)?.population).toBe(1);
  });
  it("top-N share and thresholds", () => {
    expect(topNShare([50, 30, 10, 10], 2)).toBeCloseTo(0.8, 12);
    expect(topNShare([], 3)).toBe(0);
    expect(walletsAbove([1, 5, 10, 20], [5, 15])).toEqual([
      { threshold: 5, wallets: 3 },
      { threshold: 15, wallets: 1 },
    ]);
  });
  it("rank movement and percentile", () => {
    const m = rankMovement(
      [
        { address: "a", rank: 1 },
        { address: "b", rank: 5 },
      ],
      [{ address: "a", rank: 3 }],
    );
    expect(m).toEqual([
      { address: "a", rank: 1, previousRank: 3, change: 2 },
      { address: "b", rank: 5, previousRank: null, change: null },
    ]);
    expect(rankPercentile(1, 100)).toBe(1);
    expect(rankPercentile(100, 100)).toBe(0);
  });
});

describe("reinsurance (2026-10-21 fixture)", () => {
  const sheet = readFileSync(
    new URL("../../sources/fixtures/sheet_reinsurance.csv", import.meta.url),
    "utf8",
  );
  const layers: Layer[] = parseReinsuranceSheet(sheet).map((l) => ({
    layerId: l.layerId,
    status: l.status,
    inception: l.inception,
    renewal: l.renewal,
    perils: l.perils,
    structure: l.structure,
    capital: l.capitalDeployed,
    premium: l.netPremium,
    expectedLoss: l.expectedLoss,
    expectedYield: l.expectedYield,
  }));
  it("every peril text and structure maps to a family (no Other)", () => {
    for (const l of layers) {
      expect(perilFamily(l.perils), l.perils).not.toBe("Other");
      expect(structureFamily(l.structure), l.structure).not.toBe("Other");
    }
  });
  it("maps specific rules before general ones", () => {
    expect(perilFamily("Worldwide ex US All Natural Perils")).toBe("Worldwide");
    expect(perilFamily("North America All Natural Perils & New Zealand Earthquake")).toBe(
      "North America",
    );
    expect(perilFamily("United States All Natural Perils ex Earthquake")).toBe("US");
    expect(perilFamily("Something new")).toBe("Other");
    expect(structureFamily("2nd Event Per Occ")).toBe("Per occurrence");
    expect(structureFamily("3rd Event Aggregate")).toBe("Aggregate");
  });
  it("peril tags", () => {
    expect(
      perilTags("United States Named Windstorm, Earthquake and Severe Convective Storm"),
    ).toEqual(["wind", "earthquake", "convective storm"]);
    expect(perilTags("United States All Natural Perils ex Earthquake")).toEqual([
      "all natural perils",
    ]);
    expect(perilTags("Contingency")).toEqual(["contingency"]);
  });
  it("capital by family adds up to the book and shares to 1", () => {
    const total = layers.reduce((s, l) => s + l.capital, 0);
    expect(total).toBe(152722725);
    for (const groups of [capitalByPerilFamily(layers), capitalByStructure(layers)]) {
      expect(groups.reduce((s, g) => s + g.capital, 0)).toBe(total);
      expect(groups.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1, 12);
      expect(groups.reduce((s, g) => s + g.layers, 0)).toBe(30);
    }
  });
  it("layer 9000002 derived fields", () => {
    const l = layers.find((x) => x.layerId === "9000002") as Layer;
    expect(premiumToEL(l)).toBeCloseTo(747698 / 308052, 9);
    expect(rateOnCapital(l)).toBeCloseTo(747698 / 5864302, 9);
  });
  it("book expected yield is capital weighted", () => {
    expect(
      bookExpectedYield([
        { capital: 100, expectedYield: 0.1 },
        { capital: 300, expectedYield: 0.2 },
      ]),
    ).toBeCloseTo(0.175, 12);
    expect(bookExpectedYield([])).toBeNull();
    const t = bookTotals(layers, 282829656);
    expect(t.layers).toBe(30);
    expect(t.capitalOverAum).toBeCloseTo(152722725 / 282829656, 9);
  });
  it("months to renewal and the layer 0002 conflict (renewal Jul-2026, still Bound)", () => {
    expect(monthsToRenewal("2026-11-01", "2026-10-21")).toBe(1);
    expect(monthsToRenewal("2026-10-01", "2026-10-21")).toBe(0);
    expect(monthsToRenewal("2026-07-01", "2026-10-21")).toBe(-3);
    const l = layers.find((x) => x.layerId === "9000002") as Layer;
    expect(isPastRenewal(l, "2026-10-21")).toBe(true);
    expect(isPastRenewal({ ...l, status: "Expired" }, "2026-10-21")).toBe(false);
    const p = pastRenewal(layers, "2026-10-21");
    expect(p.layerIds).toContain("9000002");
    expect(p.capital).toBeGreaterThanOrEqual(5864302);
  });
  it("renewal calendar is ascending by month and sums to the book", () => {
    const cal = renewalCalendar(layers);
    expect(cal.map((c) => c.key)).toEqual([...cal.map((c) => c.key)].sort());
    expect(cal.reduce((s, c) => s + c.capital, 0)).toBe(152722725);
  });
});

describe("risk signals", () => {
  it("grades high-is-worse and low-is-worse values", () => {
    const l = { watch: 25, alert: 50 };
    expect(grade(10, l, "high")).toBe("ok");
    expect(grade(25, l, "high")).toBe("watch");
    expect(grade(50, l, "high")).toBe("alert");
    expect(grade(null, l, "high")).toBe("unavailable");
    const c = { watch: 0.15, alert: 0.1 };
    expect(grade(0.15, c, "low")).toBe("ok");
    expect(grade(0.12, c, "low")).toBe("watch");
    expect(grade(0.1, c, "low")).toBe("alert");
  });
  it("builds twelve independent signals with thresholds and no blended score", () => {
    const signals = buildRiskSignals({
      premiumBps: -16,
      liquidityCoverage: 0.15,
      collateralization: 1.001993,
      solvencyAgeHours: 144,
      topProtocol: { name: "kamino", share: 0.547 },
      loopingShare: 0.776,
      topPeril: { name: "US", share: 0.3 },
      supplyChange30d: 0.01,
      sourceSpread: 0.032,
      navAnomalies30d: 0,
      aumDerivedDivergence: 0.36,
      pastRenewal: { count: 1, capital: 5864302 },
    });
    expect(signals).toHaveLength(12);
    const by = Object.fromEntries(signals.map((s) => [s.id, s.state]));
    expect(by).toMatchObject({
      discount: "ok",
      liquidity_coverage: "ok",
      collateralization: "ok",
      solvency_age: "alert",
      top_protocol: "watch",
      looping_share: "alert",
      peril_concentration: "ok",
      supply_trend: "ok",
      data_divergence: "watch",
      nav_anomalies: "ok",
      aum_derived: "alert",
      past_renewal: "watch",
    });
    expect(signals.find((s) => s.id === "top_protocol")?.note).toBe("kamino");
    expect(DEFAULT_RISK_THRESHOLDS.discountBps.alert).toBe(50);
  });
  it("marks missing inputs unavailable and a premium as no discount", () => {
    const signals = buildRiskSignals({
      premiumBps: 40,
      liquidityCoverage: null,
      collateralization: null,
      solvencyAgeHours: null,
      topProtocol: null,
      loopingShare: null,
      topPeril: null,
      supplyChange30d: null,
      sourceSpread: null,
      navAnomalies30d: null,
      aumDerivedDivergence: null,
      pastRenewal: null,
    });
    expect(signals.find((s) => s.id === "discount")).toMatchObject({ state: "ok", value: 0 });
    expect(signals.filter((s) => s.state === "unavailable")).toHaveLength(11);
  });
});
