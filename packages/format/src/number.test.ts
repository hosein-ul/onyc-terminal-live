import { describe, expect, it } from "vitest";
import {
  NOT_AVAILABLE,
  formatBps,
  formatCompact,
  formatNav,
  formatNumber,
  formatPercent,
  formatPercentPoints,
  formatPpm,
  formatUsd,
  formatUsdCompact,
} from "./number.js";

describe("missing values", () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns the marker for %s",
    (v) => {
      expect(formatUsdCompact(v)).toBe(NOT_AVAILABLE);
      expect(formatUsd(v)).toBe(NOT_AVAILABLE);
      expect(formatNav(v)).toBe(NOT_AVAILABLE);
      expect(formatBps(v)).toBe(NOT_AVAILABLE);
      expect(formatPercent(v)).toBe(NOT_AVAILABLE);
      expect(formatPercentPoints(v)).toBe(NOT_AVAILABLE);
      expect(formatPpm(v)).toBe(NOT_AVAILABLE);
      expect(formatNumber(v)).toBe(NOT_AVAILABLE);
      expect(formatCompact(v)).toBe(NOT_AVAILABLE);
    },
  );
});

describe("formatUsdCompact", () => {
  it("formats the 2026-10-21 TVL fixture", () => {
    expect(formatUsdCompact(282827379.7358692)).toBe("$282.8M");
  });
  it("uses K, M, B and T", () => {
    expect(formatUsdCompact(12_345)).toBe("$12.3K");
    expect(formatUsdCompact(5_293_625.68)).toBe("$5.3M");
    expect(formatUsdCompact(2.5e9)).toBe("$2.5B");
    expect(formatUsdCompact(1.2e12)).toBe("$1.2T");
  });
  it("promotes to the next unit when rounding reaches 1000", () => {
    expect(formatUsdCompact(999_950)).toBe("$1.0M");
    expect(formatUsdCompact(999_949)).toBe("$999.9K");
  });
  it("shows small amounts as dollars or cents", () => {
    expect(formatUsdCompact(0)).toBe("$0");
    expect(formatUsdCompact(12.5)).toBe("$12.50");
    expect(formatUsdCompact(999)).toBe("$999");
  });
  it("uses a true minus and never prints negative zero", () => {
    expect(formatUsdCompact(-1_500_000)).toBe("−$1.5M");
    expect(formatUsdCompact(-0.001)).toBe("$0");
  });
  it("honours the decimals argument", () => {
    expect(formatUsdCompact(282827379.7, 2)).toBe("$282.83M");
  });
});

describe("formatCompact", () => {
  it("has no currency symbol", () => {
    expect(formatCompact(244273973.51)).toBe("244.3M");
    expect(formatCompact(-1500)).toBe("−1.5K");
  });
});

describe("formatUsd", () => {
  it("groups and rounds to cents", () => {
    expect(formatUsd(282827379.7358692)).toBe("$282,827,379.74");
    expect(formatUsd(-1234.5)).toBe("−$1,234.50");
  });
  it("rounds half away from zero despite binary floats", () => {
    expect(formatUsd(1.005)).toBe("$1.01");
  });
});

describe("formatNumber", () => {
  it("formats the circulating supply fixture", () => {
    expect(formatNumber(244273973.51)).toBe("244,273,973.51");
    expect(formatNumber(169246816, 0)).toBe("169,246,816");
  });
});

describe("formatNav", () => {
  it("defaults to six decimals", () => {
    expect(formatNav(1.157827091)).toBe("1.157827");
  });
  it("accepts four or five decimals", () => {
    expect(formatNav(1.157827091, 4)).toBe("1.1578");
    expect(formatNav(1.157827091, 5)).toBe("1.15783");
  });
});

describe("formatBps", () => {
  it("rounds to an integer with a true minus", () => {
    expect(formatBps(-16.4)).toBe("−16 bps");
    expect(formatBps(25)).toBe("25 bps");
  });
  it("can force a plus sign", () => {
    expect(formatBps(12, { sign: true })).toBe("+12 bps");
    expect(formatBps(0, { sign: true })).toBe("0 bps");
  });
  it("never prints negative zero", () => {
    expect(formatBps(-0.2)).toBe("0 bps");
  });
});

describe("formatPercent", () => {
  it("formats fractions", () => {
    expect(formatPercent(0.1102)).toBe("11.02%");
    expect(formatPercent(0.5469, 1)).toBe("54.7%");
    expect(formatPercent(-0.0016, 2, { sign: true })).toBe("−0.16%");
    expect(formatPercent(0.0016, 2, { sign: true })).toBe("+0.16%");
  });
});

describe("formatPercentPoints", () => {
  it("formats values already in percent units (settings.misc.sUSDeAPY)", () => {
    expect(formatPercentPoints(3.5057)).toBe("3.51%");
  });
});

describe("formatPpm", () => {
  it("formats daily NAV increments", () => {
    expect(formatPpm(288.4)).toBe("288 ppm");
    expect(formatPpm(-12.6, { sign: true })).toBe("−13 ppm");
  });
});
