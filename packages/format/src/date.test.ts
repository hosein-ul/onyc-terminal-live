import { describe, expect, it } from "vitest";
import { formatDate, formatDateIso, formatDateTime, formatMonthYear, toDate } from "./date.js";
import { NOT_AVAILABLE } from "./number.js";

describe("dates (always UTC)", () => {
  const instant = "2026-10-21T14:03:59Z";

  it("formats ISO dates", () => {
    expect(formatDateIso(instant)).toBe("2026-10-21");
    expect(formatDateIso(new Date(Date.UTC(2025, 4, 28)))).toBe("2025-05-28");
  });
  it("formats people-readable dates", () => {
    expect(formatDate(instant)).toBe("21 Oct 2026");
  });
  it("formats month and year", () => {
    expect(formatMonthYear("2026-07-01T00:00:00Z")).toBe("Jul 2026");
  });
  it("formats timestamps to the minute", () => {
    expect(formatDateTime(instant)).toBe("2026-10-21 14:03 UTC");
  });
  it("does not shift a date near midnight UTC", () => {
    expect(formatDateIso("2026-10-21T23:59:59Z")).toBe("2026-10-21");
    expect(formatDateIso("2026-10-22T00:00:00Z")).toBe("2026-10-22");
  });
  it("accepts epoch milliseconds", () => {
    expect(formatDateIso(Date.UTC(2026, 9, 21))).toBe("2026-10-21");
  });
  it("returns the marker for invalid or missing input", () => {
    for (const bad of [null, undefined, "not a date", Number.NaN]) {
      expect(formatDateIso(bad)).toBe(NOT_AVAILABLE);
      expect(formatDate(bad)).toBe(NOT_AVAILABLE);
      expect(formatMonthYear(bad)).toBe(NOT_AVAILABLE);
      expect(formatDateTime(bad)).toBe(NOT_AVAILABLE);
      expect(toDate(bad)).toBeNull();
    }
  });
});
