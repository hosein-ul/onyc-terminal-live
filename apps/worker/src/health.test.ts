import { beforeEach, describe, expect, it } from "vitest";
import { circuitOpen, noteResult, resetBreakers } from "./health.js";
import { loadConfig } from "./config.js";

describe("circuit breaker", () => {
  beforeEach(() => {
    resetBreakers();
  });

  it("stays closed below five transport failures", () => {
    for (let i = 0; i < 4; i += 1) noteResult("s", false, true, 1000);
    expect(circuitOpen("s", 1000)).toBe(false);
  });

  it("opens for a minute after five transport failures, then closes", () => {
    for (let i = 0; i < 5; i += 1) noteResult("s", false, true, 1000);
    expect(circuitOpen("s", 1000)).toBe(true);
    expect(circuitOpen("s", 1000 + 59_999)).toBe(true);
    expect(circuitOpen("s", 1000 + 60_000)).toBe(false);
  });

  it("doubles the pause on a repeat trip, capped at ten minutes", () => {
    for (let trip = 0; trip < 6; trip += 1) {
      for (let i = 0; i < 5; i += 1) noteResult("s", false, true, 0);
    }
    expect(circuitOpen("s", 599_999)).toBe(true);
    expect(circuitOpen("s", 600_000)).toBe(false);
  });

  it("ignores schema and parse failures", () => {
    for (let i = 0; i < 20; i += 1) noteResult("s", false, false, 1000);
    expect(circuitOpen("s", 1000)).toBe(false);
  });

  it("resets on success and is per source", () => {
    for (let i = 0; i < 4; i += 1) noteResult("a", false, true, 1000);
    noteResult("a", true, false, 1000);
    noteResult("a", false, true, 1000);
    expect(circuitOpen("a", 1000)).toBe(false);
    for (let i = 0; i < 5; i += 1) noteResult("b", false, true, 1000);
    expect(circuitOpen("b", 1000)).toBe(true);
    expect(circuitOpen("a", 1000)).toBe(false);
  });
});

describe("loadConfig", () => {
  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("applies defaults and treats empty optional values as unset", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://x", HELIUS_API_KEY: "  " });
    expect(config.HELIUS_API_KEY).toBeUndefined();
    expect(config.DISCOUNT_ALERT_BPS).toBe(50);
    expect(config.SOLVENCY_STALE_HOURS).toBe(24);
    expect(config.LEADERBOARD_PAGE_SIZE).toBe(250);
    expect(config.enabledJobs).toBeNull();
  });

  it("parses the job allow-list", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://x", WORKER_JOBS: "live, sheets" });
    expect([...(config.enabledJobs ?? [])]).toEqual(["live", "sheets"]);
  });

  it("rejects out-of-range values", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://x", LEADERBOARD_PAGE_SIZE: "5" }),
    ).toThrow();
  });
});
