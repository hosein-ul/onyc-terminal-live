import { describe, expect, it } from "vitest";
import { csvRecords, parseCsv } from "./csv.js";
import {
  aprToFraction,
  basePriceToNumber,
  looseNumber,
  parseDmyDate,
  parseIsoDate,
  parseMonthYear,
  parseOptionalNumber,
  parsePercentString,
  parseSpacedNumber,
  parseUsDate,
} from "./numbers.js";

describe("parseSpacedNumber", () => {
  it("reads space-separated thousands from the reinsurance sheet", () => {
    expect(parseSpacedNumber("1 101 563")).toBe(1101563);
    expect(parseSpacedNumber("148 438")).toBe(148438);
    expect(parseSpacedNumber("25 208 819")).toBe(25208819);
  });
  it("also accepts non-breaking and narrow spaces", () => {
    expect(parseSpacedNumber("1 101 563")).toBe(1101563);
    expect(parseSpacedNumber("1 101")).toBe(1101);
  });
  it("accepts plain and decimal numbers", () => {
    expect(parseSpacedNumber("0.5391")).toBe(0.5391);
    expect(parseSpacedNumber("-12")).toBe(-12);
  });
  it("rejects garbage instead of guessing", () => {
    expect(() => parseSpacedNumber("n/a")).toThrow();
    expect(() => parseSpacedNumber("")).toThrow();
  });
});

describe("parseOptionalNumber", () => {
  it("treats empty cells as missing, not zero", () => {
    expect(parseOptionalNumber("")).toBeNull();
    expect(parseOptionalNumber("  ")).toBeNull();
    expect(parseOptionalNumber(undefined)).toBeNull();
    expect(parseOptionalNumber("0")).toBe(0);
  });
});

describe("parsePercentString", () => {
  it("returns a fraction without float noise", () => {
    expect(parsePercentString("11.02%")).toBe(0.1102);
    expect(parsePercentString("4.60%")).toBe(0.046);
    expect(parsePercentString("24.39%")).toBe(0.2439);
  });
  it("rejects values without a percent sign", () => {
    expect(() => parsePercentString("11.02")).toThrow();
  });
});

describe("dates", () => {
  it("parses MM/DD/YYYY from /data/nav", () => {
    expect(parseUsDate("10/21/2026")).toBe("2026-10-21");
    expect(parseUsDate("05/28/2025")).toBe("2025-05-28");
  });
  it("parses DD/MM/YYYY from the collateral sheet", () => {
    expect(parseDmyDate("20/10/2026")).toBe("2026-10-20");
  });
  it("tells the two orders apart", () => {
    expect(parseUsDate("03/04/2026")).toBe("2026-03-04");
    expect(parseDmyDate("03/04/2026")).toBe("2026-04-03");
  });
  it("rejects impossible dates", () => {
    expect(() => parseUsDate("13/01/2026")).toThrow();
    expect(() => parseDmyDate("31/02/2026")).toThrow();
    expect(() => parseIsoDate("2026-13-01")).toThrow();
  });
  it("parses month-granular reinsurance dates", () => {
    expect(parseMonthYear("Nov-2025")).toBe("2025-11-01");
    expect(parseMonthYear("Jul-2026")).toBe("2026-07-01");
    expect(() => parseMonthYear("Foo-2026")).toThrow();
  });
});

describe("fixed-point price vector fields", () => {
  it("decodes basePrice (x1e9) and apr (x1e6)", () => {
    expect(basePriceToNumber(1139068660)).toBeCloseTo(1.13906866, 12);
    expect(aprToFraction(109239)).toBeCloseTo(0.109239, 12);
    expect(aprToFraction(104555)).toBeCloseTo(0.104555, 12);
  });
});

describe("looseNumber", () => {
  it("accepts numbers and decimal strings, rejects the rest", () => {
    expect(looseNumber.parse("1.157827091000000000")).toBe(1.157827091);
    expect(looseNumber.parse(3)).toBe(3);
    expect(looseNumber.safeParse("abc").success).toBe(false);
    expect(looseNumber.safeParse("").success).toBe(false);
    expect(looseNumber.safeParse(null).success).toBe(false);
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and CRLF", () => {
    const rows = parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", 'say "hi"'],
    ]);
  });
  it("keeps embedded newlines inside quotes", () => {
    expect(parseCsv('a,b\n"line1\nline2",2')).toEqual([
      ["a", "b"],
      ["line1\nline2", "2"],
    ]);
  });
  it("fails loudly on an unterminated quote", () => {
    expect(() => parseCsv('a,"b')).toThrow();
  });
  it("builds records and skips blank headers and blank lines", () => {
    const { headers, records } = csvRecords("x,,y\n1,2,3\n,,\n4,5,6\n");
    expect(headers).toEqual(["x", "", "y"]);
    expect(records).toEqual([
      { x: "1", y: "3" },
      { x: "4", y: "6" },
    ]);
  });
});
