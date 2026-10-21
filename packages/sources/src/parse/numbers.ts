import { z } from "zod";

/** A number that may arrive as a JSON number or as a decimal string ("1.157827091000000000"). */
export const looseNumber = z
  .union([z.number(), z.string().trim().min(1)])
  .transform((value, ctx) => {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: `not a finite number: ${String(value)}` });
      return z.NEVER;
    }
    return n;
  });

/** Same as `looseNumber` but null stays null (early /data/nav rows have no AUM or supply). */
export const looseNumberOrNull = looseNumber.nullable();

// \s also matches non-breaking and narrow no-break spaces.
const SPACE_LIKE = /\s/g;

/** Reinsurance sheet integers use spaces as thousands separators: "1 101 563" -> 1101563. */
export function parseSpacedNumber(text: string): number {
  const cleaned = text.replace(SPACE_LIKE, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`not a number: "${text}"`);
  return Number(cleaned);
}

/** Sheet cells may be empty. Empty means "not provided", never zero. */
export function parseOptionalNumber(text: string | undefined): number | null {
  if (text === undefined || text.trim() === "") return null;
  return parseSpacedNumber(text);
}

/** Percent units to a fraction without float noise: 11.02 -> 0.1102 (not 0.11019999999999999). */
export function percentToFraction(points: number): number {
  return Number((points / 100).toPrecision(12));
}

/** "11.02%" -> 0.1102 (a fraction). */
export function parsePercentString(text: string): number {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/.exec(text);
  if (match?.[1] === undefined) throw new Error(`not a percentage: "${text}"`);
  return percentToFraction(Number(match[1]));
}

export function parseOptionalPercent(text: string | undefined): number | null {
  if (text === undefined || text.trim() === "") return null;
  return parsePercentString(text);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function isoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`not a calendar date: ${year}-${month}-${day}`);
  }
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** The core API's `/data/nav` dates: "10/21/2026" (MM/DD/YYYY) -> "2026-10-21". */
export function parseUsDate(text: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (match === null) throw new Error(`not an MM/DD/YYYY date: "${text}"`);
  return isoDate(Number(match[3]), Number(match[1]), Number(match[2]));
}

/** The collateral sheet's snapshot date: "20/10/2026" (DD/MM/YYYY) -> "2026-10-20". */
export function parseDmyDate(text: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (match === null) throw new Error(`not a DD/MM/YYYY date: "${text}"`);
  return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

/** An ISO calendar date, validated: "2026-10-20". */
export function parseIsoDate(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (match === null) throw new Error(`not a YYYY-MM-DD date: "${text}"`);
  return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Reinsurance inception and renewal are month-granular: "Nov-2025" -> "2025-11-01". */
export function parseMonthYear(text: string): string {
  const match = /^([A-Za-z]{3})-(\d{4})$/.exec(text.trim());
  const month = match?.[1] === undefined ? undefined : MONTHS[match[1].toLowerCase()];
  if (match?.[2] === undefined || month === undefined) {
    throw new Error(`not a Mon-YYYY month: "${text}"`);
  }
  return isoDate(Number(match[2]), month, 1);
}

/** Price-vector `basePrice` is the price times 1e9: 1139068660 -> 1.13906866. */
export function basePriceToNumber(basePrice: number): number {
  return basePrice / 1e9;
}

/** Price-vector `apr` is the rate times 1e6: 109239 -> 0.109239 (10.9239%). */
export function aprToFraction(apr: number): number {
  return apr / 1e6;
}
