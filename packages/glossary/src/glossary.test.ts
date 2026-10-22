import { describe, expect, it } from "vitest";
import { splitByTerms, TERM_BY_ID, TERMS } from "./index.js";

const REQUIRED = [
  "nav",
  "apy",
  "aum",
  "circulating-supply",
  "premium-discount",
  "bps",
  "liquidity-layer",
  "collateral-ratio",
  "proof-of-solvency",
  "bound-capital",
  "offered-capital",
  "available-capital",
  "reinsurance-layer",
  "ilw",
  "quota-share",
  "per-occurrence",
  "aggregate",
  "expected-loss",
  "expected-yield",
  "renewal",
  "looping",
  "ltv-liquidation",
  "pt",
  "yt",
  "sr-ronyc",
  "jr-ronyc",
  "points-multiplier",
  "rank-change",
  "price-vector",
  "down-tick",
  "redemption-fee",
  "propamm",
];

describe("glossary data", () => {
  it("has every term the product brief asks for", () => {
    for (const id of REQUIRED) expect(TERM_BY_ID.has(id), id).toBe(true);
  });

  it("has unique ids and no empty fields", () => {
    expect(new Set(TERMS.map((t) => t.id)).size).toBe(TERMS.length);
    for (const t of TERMS) {
      expect(t.short.trim().length, t.id).toBeGreaterThan(20);
      expect(t.why.trim().length, t.id).toBeGreaterThan(10);
    }
  });

  it("keeps every definition to one sentence", () => {
    for (const t of TERMS) {
      // A full stop followed by a capital letter would mean a second sentence.
      expect(/\.\s+[A-Z]/.test(t.short), `${t.id} short`).toBe(false);
      expect(/\.\s+[A-Z]/.test(t.why), `${t.id} why`).toBe(false);
    }
  });

  it("explains where a non-OnRe definition comes from", () => {
    for (const t of TERMS) {
      if (t.basis === "industry" && t.id !== "bps" && t.id !== "ltv-liquidation") {
        expect(t.note, t.id).toBeDefined();
      }
      if (t.basis === "method") expect(t.note ?? "", t.id).not.toBe("");
    }
  });
});

describe("splitByTerms", () => {
  it("finds a term inside a label", () => {
    expect(splitByTerms("Market premium / discount")).toEqual([
      { text: "Market " },
      { text: "premium / discount", termId: "premium-discount" },
    ]);
  });

  it("prefers the longest spelling", () => {
    const parts = splitByTerms("Liquidity layer coverage");
    expect(parts).toEqual([{ text: "Liquidity layer coverage", termId: "liquidity-layer" }]);
  });

  it("matches short terms only in their own case", () => {
    expect(splitByTerms("PT-srONyc").some((p) => p.termId === "pt")).toBe(true);
    expect(splitByTerms("apt choice").some((p) => p.termId === "pt")).toBe(false);
    expect(splitByTerms("pt").some((p) => p.termId === "pt")).toBe(false);
  });

  it("marks only the first use when given a seen set", () => {
    const seen = new Set<string>();
    const a = splitByTerms("NAV per ONyc", seen);
    const b = splitByTerms("NAV and yield", seen);
    expect(a.some((p) => p.termId === "nav")).toBe(true);
    expect(b.some((p) => p.termId === "nav")).toBe(false);
  });

  it("returns plain text untouched", () => {
    expect(splitByTerms("Nothing technical here")).toEqual([{ text: "Nothing technical here" }]);
  });
});
