import {
  formatDate,
  formatDateTime,
  formatBps,
  formatCompact,
  formatNav,
  formatNumber,
  formatPercent,
  formatPpm,
  formatUsdCompact,
  NOT_AVAILABLE,
} from "@onyc/format";
import type { Unit } from "./types.js";

/** One place that turns a number and a unit into text, so every chart prints the same figure the same way. */
export function formatValue(value: number | null | undefined, unit: Unit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  switch (unit) {
    case "usd":
      return formatUsdCompact(value);
    case "pct":
      return formatPercent(value);
    case "bps":
      return formatBps(value);
    case "nav":
      return formatNav(value, 4);
    case "ppm":
      return formatPpm(value);
    case "points":
    case "count":
      return formatCompact(value);
    case "ratio":
      return formatNumber(value, 2);
    case "text":
      return String(value);
  }
}

const hasTime = (x: string): boolean => /T\d{2}:\d{2}/.test(x);

/**
 * Axis tick text for a list of x values: "14:30" when everything falls within three days (intraday data such as the
 * market history), otherwise the date. Relative labels such as "day -3" pass through unchanged.
 */
export function axisFormatter(xs: string[]): (x: string) => string {
  const times = xs.filter(hasTime).map((x) => Date.parse(x));
  const intraday =
    times.length === xs.length &&
    times.length > 1 &&
    Math.max(...times) - Math.min(...times) < 3 * 86_400_000;
  return (x) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(x)) return x;
    if (intraday) return `${new Date(x).toISOString().slice(11, 16)} UTC`;
    return formatDate(x);
  };
}

/** Tooltip heading: date, plus the time when the value carries one. */
export const tooltipHeading = (x: string): string =>
  hasTime(x) ? formatDateTime(x) : formatDate(x);
