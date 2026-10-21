import { describe, expect, it } from "vitest";
import { ageSeconds, formatRelativeAge, formatSourceFooter } from "./age.js";
import { NOT_AVAILABLE } from "./number.js";

const now = new Date("2026-10-21T12:00:00Z");
const ago = (seconds: number): Date => new Date(now.getTime() - seconds * 1000);

describe("ageSeconds", () => {
  it("counts whole seconds", () => {
    expect(ageSeconds(ago(42), now)).toBe(42);
  });
  it("never goes negative when the clock is ahead", () => {
    expect(ageSeconds(ago(-30), now)).toBe(0);
  });
  it("is null for invalid input", () => {
    expect(ageSeconds("nope", now)).toBeNull();
    expect(ageSeconds(null, now)).toBeNull();
  });
});

describe("formatRelativeAge", () => {
  it.each([
    [0, "just now"],
    [4, "just now"],
    [42, "42 s ago"],
    [59, "59 s ago"],
    [60, "1 min ago"],
    [300, "5 min ago"],
    [3599, "59 min ago"],
    [3600, "1 h ago"],
    [3 * 3600 + 20, "3 h ago"],
    [86_399, "23 h ago"],
    [86_400, "1 d ago"],
    [6 * 86_400, "6 d ago"],
  ])("%i s -> %s", (seconds, expected) => {
    expect(formatRelativeAge(ago(seconds), now)).toBe(expected);
  });
  it("returns the marker when the time is unknown", () => {
    expect(formatRelativeAge(undefined, now)).toBe(NOT_AVAILABLE);
  });
});

describe("formatSourceFooter", () => {
  it("builds the mandatory chart footer", () => {
    expect(formatSourceFooter("OnRe core API", ago(42), now)).toBe(
      "Source: OnRe core API · updated 42 s ago",
    );
  });
  it("says so when the update time is unknown", () => {
    expect(formatSourceFooter("OnRe core API", null, now)).toBe(
      "Source: OnRe core API · update time unknown",
    );
  });
});
