import { describe, expect, it } from "vitest";
import { isDue } from "./scheduler.js";

const at = (s: string): Date => new Date(`2026-10-25T${s}Z`);

describe("isDue", () => {
  it("is due when the schedule fired after the last run", () => {
    // every hour at minute 12, second 0
    expect(isDue("0 12 * * * *", at("09:00:00"), at("09:20:00"))).toBe(true);
  });

  it("is not due when the schedule has not fired since the last run", () => {
    expect(isDue("0 12 * * * *", at("09:13:00"), at("09:40:00"))).toBe(false);
  });

  it("a long gap fires once, not once per missed tick", () => {
    expect(isDue("0 * * * * *", at("01:00:00"), at("09:00:00"))).toBe(true);
  });

  it("a moment exactly at the schedule counts", () => {
    expect(isDue("0 30 * * * *", at("09:00:00"), at("09:30:00"))).toBe(true);
  });
});
