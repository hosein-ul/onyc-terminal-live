import { describe, expect, it } from "vitest";
import {
  NOT_AVAILABLE,
  shortAddress,
  signedBps,
  signedNav,
  signedPct,
  signedUsd,
  utcStamp,
} from "./format";

describe("signed formatters", () => {
  it("prefix a plus or a true minus and never print a sign for zero", () => {
    expect(signedUsd(1_200_000)).toBe("+$1.2M");
    expect(signedUsd(-400_000)).toBe("−$400.0K");
    expect(signedUsd(0)).toBe("$0");
    expect(signedNav(0.00834)).toBe("+0.0083");
    expect(signedNav(-0.5)).toBe("−0.5000");
    expect(signedBps(-16.4)).toBe("−16 bps");
    expect(signedPct(0.0595)).toBe("+5.95%");
    expect(signedPct(-0.0673, 1)).toBe("−6.7%");
  });

  it("show a dash, never a number, when the value is missing", () => {
    expect(signedUsd(null)).toBe(NOT_AVAILABLE);
    expect(signedUsd(Number.NaN)).toBe(NOT_AVAILABLE);
    expect(signedNav(undefined)).toBe(NOT_AVAILABLE);
    expect(signedBps(null)).toBe(NOT_AVAILABLE);
    expect(signedPct(null)).toBe(NOT_AVAILABLE);
  });
});

describe("utcStamp", () => {
  it("prints the day and the UTC time", () => {
    expect(utcStamp("2026-10-21T15:28:03.815Z")).toBe("21 Oct 2026, 15:28 UTC");
  });
  it("is a dash for missing or invalid input", () => {
    expect(utcStamp(null)).toBe(NOT_AVAILABLE);
    expect(utcStamp("not a date")).toBe(NOT_AVAILABLE);
  });
});

describe("shortAddress", () => {
  it("keeps the first and last four characters of a long address", () => {
    expect(shortAddress("DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh")).toBe("DTjN…Snvh");
  });
  it("leaves a short string alone", () => {
    expect(shortAddress("abc")).toBe("abc");
  });
});
