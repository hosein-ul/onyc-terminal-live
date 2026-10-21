import { describe, expect, it } from "vitest";
import { addToTotals, flattenBreakdown } from "./venues.js";

describe("flattenBreakdown", () => {
  it("flattens nested venues into dotted leaf paths", () => {
    const flat = flattenBreakdown({
      wallet: 5,
      kamino: { onyc: 10, usdg: 2 },
      exponent: { markets: { "SEP-2026": { yt: 1, lp: 2 } }, tranching: { senior: 3, junior: 4 } },
    });
    expect(Object.fromEntries(flat)).toEqual({
      wallet: 5,
      "kamino.onyc": 10,
      "kamino.usdg": 2,
      "exponent.markets.SEP-2026.yt": 1,
      "exponent.markets.SEP-2026.lp": 2,
      "exponent.tranching.senior": 3,
      "exponent.tranching.junior": 4,
    });
  });

  it("ignores strings, nulls and arrays", () => {
    expect(flattenBreakdown({ a: "x", b: null, c: [1, 2], d: 7 }).size).toBe(1);
  });
});

describe("addToTotals", () => {
  it("accumulates across wallets", () => {
    const totals = new Map<string, number>();
    addToTotals(totals, { wallet: 1, kamino: { onyc: 2 } });
    addToTotals(totals, { wallet: 3, kamino: { onyc: 4 } });
    expect(Object.fromEntries(totals)).toEqual({ wallet: 4, "kamino.onyc": 6 });
  });
});
