import { NOT_AVAILABLE } from "./number.js";

/** Anything the API or a sheet parser may hand over: a Date, an ISO string or epoch milliseconds. */
export type DateInput = Date | string | number | null | undefined;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Convert to a valid Date, or null. Strings must be ISO-8601; parsing MM/DD/YYYY is the sources' job. */
export function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined) return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC calendar date: "2026-10-21". */
export function formatDateIso(input: DateInput): string {
  const date = toDate(input);
  if (date === null) return NOT_AVAILABLE;
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`;
}

/** UTC calendar date for people: "21 Oct 2026". */
export function formatDate(input: DateInput): string {
  const date = toDate(input);
  if (date === null) return NOT_AVAILABLE;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

/** Month and year, as used for reinsurance inception and renewal: "Jul 2026". */
export function formatMonthYear(input: DateInput): string {
  const date = toDate(input);
  if (date === null) return NOT_AVAILABLE;
  return `${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

/** UTC timestamp to the minute: "2026-10-21 14:03 UTC". */
export function formatDateTime(input: DateInput): string {
  const date = toDate(input);
  if (date === null) return NOT_AVAILABLE;
  return `${formatDateIso(date)} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
}
