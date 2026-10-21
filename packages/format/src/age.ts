import { toDate, type DateInput } from "./date.js";
import { NOT_AVAILABLE } from "./number.js";

/** Whole seconds between `from` and `now`, or null if `from` is not a valid date. Never negative. */
export function ageSeconds(from: DateInput, now: DateInput = new Date()): number | null {
  const start = toDate(from);
  const end = toDate(now);
  if (start === null || end === null) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

/** Relative age as shown next to every number: "42 s ago", "5 min ago", "3 h ago", "6 d ago". */
export function formatRelativeAge(from: DateInput, now: DateInput = new Date()): string {
  const seconds = ageSeconds(from, now);
  if (seconds === null) return NOT_AVAILABLE;
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** The mandatory chart footer: "Source: OnRe core API · updated 42 s ago". */
export function formatSourceFooter(
  source: string,
  fetchedAt: DateInput,
  now: DateInput = new Date(),
): string {
  const age =
    toDate(fetchedAt) === null
      ? "update time unknown"
      : `updated ${formatRelativeAge(fetchedAt, now)}`;
  return `Source: ${source} · ${age}`;
}
