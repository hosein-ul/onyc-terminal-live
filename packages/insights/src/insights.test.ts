import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EndpointResponse } from "@onyc/sdk";
import {
  buildHeadline,
  buildPointsPulse,
  buildSafetyBoard,
  estimatePointsPerUsdPerDay,
  pickStrategies,
  riskKind,
  sectionOrder,
  SECTIONS,
  type HeadlineInput,
  type Persona,
} from "./index.js";

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")) as T;

const risk = fixture<EndpointResponse<"risk">>("risk");
const opps = fixture<EndpointResponse<"defiOpportunities">>("opportunities");
const concentration = fixture<EndpointResponse<"concentration">>("concentration");
const growth = fixture<EndpointResponse<"pointsGrowth">>("growth");

const calm: HeadlineInput = {
  navDownticks30d: 0,
  navReturn30d: 0.0086,
  netFlow30dUsd: -1_000_000,
  aumUsd: 283_000_000,
  premiumBps: -5,
  solvencyAgeHours: 10,
  topProtocol: { name: "Kamino", share: 0.3 },
};

describe("buildHeadline", () => {
  it("names the outflow behind a rising NAV", () => {
    const h = buildHeadline({ ...calm, netFlow30dUsd: -21_595_174 });
    expect(h.text).toBe("NAV keeps rising with no down-ticks, but $21.6M left in 30 days");
    expect(h.concern).toBe("outflow");
    expect(h.tone).toBe("watch");
  });

  it("says nothing else is flagged when nothing is", () => {
    const h = buildHeadline(calm);
    expect(h.text).toBe("NAV keeps rising with no down-ticks, and nothing else is flagged");
    expect(h.tone).toBe("good");
  });

  it("puts a NAV fall first and marks the tone bad", () => {
    const h = buildHeadline({ ...calm, navDownticks30d: 2 });
    expect(h.text).toBe("NAV fell on 2 days in the last 30");
    expect(h.tone).toBe("bad");
  });

  it("falls back to the next concern in order", () => {
    expect(buildHeadline({ ...calm, premiumBps: -40 }).text).toContain("40 bps below NAV");
    expect(buildHeadline({ ...calm, solvencyAgeHours: 175 }).text).toContain("7 days old");
    expect(buildHeadline({ ...calm, topProtocol: { name: "Kamino", share: 0.55 } }).text).toContain(
      "55% of capital sits in Kamino",
    );
  });

  it("does not invent a sentence without data", () => {
    const h = buildHeadline({
      navDownticks30d: null,
      navReturn30d: null,
      netFlow30dUsd: null,
      aumUsd: null,
      premiumBps: null,
      solvencyAgeHours: null,
      topProtocol: null,
    });
    expect(h.text).toBe("ONyc at a glance");
  });
});

describe("buildSafetyBoard", () => {
  it("returns the six lights with value, limit and source", () => {
    const lights = buildSafetyBoard(risk);
    expect(lights.map((l) => l.id)).toEqual([
      "discount",
      "liquidity_coverage",
      "solvency_age",
      "top_protocol",
      "nav_anomalies",
      "data_divergence",
    ]);
    const solvency = lights.find((l) => l.id === "solvency_age");
    expect(solvency?.state).toBe("alert");
    expect(solvency?.value).toBe("7.3 days");
    expect(solvency?.threshold).toBe("watch from 24 h, alert from 3.0 days");
    for (const l of lights) expect(l.source.length).toBeGreaterThan(0);
  });

  it("marks lights unavailable instead of guessing", () => {
    const lights = buildSafetyBoard(undefined);
    expect(lights.every((l) => l.state === "unavailable" && l.value === "—")).toBe(true);
  });
});

describe("pickStrategies", () => {
  const all = opps.data.opportunities;

  it("returns at most five, sorted by APY for the yield chip", () => {
    const picks = pickStrategies(all, "yield");
    expect(picks.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i - 1]?.apy ?? 0).toBeGreaterThanOrEqual(picks[i]?.apy ?? 0);
    }
  });

  it("sorts by multiplier for the points chip", () => {
    const picks = pickStrategies(all, "points");
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i - 1]?.pointsMultiplier ?? 0).toBeGreaterThanOrEqual(
        picks[i]?.pointsMultiplier ?? 0,
      );
    }
  });

  it("keeps leverage, yield bets, pools and first-loss shares out of the conservative chip", () => {
    const picks = pickStrategies(all, "conservative");
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(["lending", "fixed-rate", "protected", "vault"]).toContain(p.kind);
    }
  });

  it("skips venues under the TVL floor and coming-soon rows", () => {
    const tiny = all.map((o) => ({ ...o, tvl: 10 }));
    expect(pickStrategies(tiny, "yield")).toEqual([]);
    const soon = all.map((o) => ({ ...o, comingSoon: true }));
    expect(pickStrategies(soon, "yield")).toEqual([]);
  });

  it("classifies the tranches and principal tokens", () => {
    const jr = all.find((o) => o.key.includes("jrONyc"));
    const sr = all.find((o) => o.key.includes("srONyc") && o.classification === "Risk Tranching");
    if (jr !== undefined) expect(riskKind(jr)).toBe("first-loss");
    if (sr !== undefined) expect(riskKind(sr)).toBe("protected");
    const pt = all.find((o) => o.key.includes("PT-ONyc"));
    if (pt !== undefined) expect(riskKind(pt)).toBe("fixed-rate");
  });
});

describe("points estimates", () => {
  it("applies OnRe's formula: multiplier times one point per ONyc per day, per dollar", () => {
    expect(estimatePointsPerUsdPerDay(6, 1.2)).toBeCloseTo(5, 6);
    expect(estimatePointsPerUsdPerDay(1, 1)).toBe(1);
  });

  it("is null without a multiplier or a usable NAV", () => {
    expect(estimatePointsPerUsdPerDay(null, 1.1)).toBeNull();
    expect(estimatePointsPerUsdPerDay(5, null)).toBeNull();
    expect(estimatePointsPerUsdPerDay(5, 0)).toBeNull();
  });

  it("shows the global multiplier exactly as reported and the daily emission", () => {
    const pulse = buildPointsPulse(growth.data, concentration.data, 1.158);
    expect(pulse.globalMultiplier?.value).toBe(0.0001);
    expect(pulse.dailyEmission?.value).toBeGreaterThan(0);
    expect(pulse.venues[0]?.multiplier ?? 0).toBeGreaterThanOrEqual(
      pulse.venues[1]?.multiplier ?? 0,
    );
    expect(pulse.formula).toContain("NAV");
  });
});

describe("personas", () => {
  const personas: Persona[] = ["default", "holder", "hunter", "analyst"];
  it("always lists every section exactly once and starts with the headline", () => {
    for (const p of personas) {
      const order = sectionOrder(p);
      expect([...order].sort()).toEqual(SECTIONS.map((s) => s.id).sort());
      expect(order[0]).toBe("now");
    }
  });
  it("puts safety first for holders and best places first for hunters", () => {
    expect(sectionOrder("holder")[1]).toBe("safety");
    expect(sectionOrder("hunter")[1]).toBe("best");
  });
});
