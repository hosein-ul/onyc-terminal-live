/** Shown when a value is missing or not finite. Never replaced by a guess. */
export const NOT_AVAILABLE = "—";

const MINUS = "−";

export type MaybeNumber = number | null | undefined;

export interface SignOption {
  /** Prefix positive values with "+". Default false. */
  sign?: boolean;
}

function isUsable(value: MaybeNumber): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Round half away from zero at `dp` decimals without binary-float surprises (1.005 -> 1.01). */
function roundTo(value: number, dp: number): number {
  const abs = Math.abs(value);
  const text = String(abs);
  let rounded: number;
  if (text.includes("e")) {
    rounded = Number(abs.toFixed(dp));
  } else {
    const shifted = Math.round(Number(`${text}e${dp}`));
    const back = `${shifted}e-${dp}`;
    rounded = Number.isFinite(Number(back)) ? Number(back) : abs;
  }
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

function group(abs: number, dp: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
    useGrouping: true,
  }).format(abs);
}

function signOf(rounded: number, showPlus: boolean): string {
  if (rounded < 0) return MINUS;
  if (rounded > 0 && showPlus) return "+";
  return "";
}

function fixed(value: number, dp: number, showPlus = false): string {
  const rounded = roundTo(value, dp);
  return `${signOf(rounded, showPlus)}${group(Math.abs(rounded), dp)}`;
}

const COMPACT_UNITS = [
  { limit: 1e12, suffix: "T" },
  { limit: 1e9, suffix: "B" },
  { limit: 1e6, suffix: "M" },
  { limit: 1e3, suffix: "K" },
] as const;

/** Compact number without a currency symbol: 244273973.5 -> "244.3M". */
export function formatCompact(value: MaybeNumber, dp = 1): string {
  if (!isUsable(value)) return NOT_AVAILABLE;
  const abs = Math.abs(value);
  const index = COMPACT_UNITS.findIndex((candidate) => abs >= candidate.limit);
  if (index === -1) return fixed(value, Number.isInteger(roundTo(abs, 2)) ? 0 : 2);

  const own = COMPACT_UNITS[index];
  if (own === undefined) return NOT_AVAILABLE;
  // Rounding can reach 1000 of a unit (999,950 -> 1000.0K); promote to the next unit.
  const higher = index > 0 ? COMPACT_UNITS[index - 1] : undefined;
  const promote = higher !== undefined && roundTo(abs / own.limit, dp) >= 1000;
  const unit = promote ? higher : own;
  const scaled = roundTo(abs / unit.limit, dp);
  return `${value < 0 ? MINUS : ""}${group(scaled, dp)}${unit.suffix}`;
}

/** USD, compact: 282827379.73 -> "$282.8M". Under 1,000 it shows whole dollars or cents. */
export function formatUsdCompact(value: MaybeNumber, dp = 1): string {
  if (!isUsable(value)) return NOT_AVAILABLE;
  const body = formatCompact(Math.abs(value), dp);
  const negative = value < 0 && body !== "0";
  return `${negative ? MINUS : ""}$${body}`;
}

/** USD, full: 282827379.7358692 -> "$282,827,379.74". */
export function formatUsd(value: MaybeNumber, dp = 2): string {
  if (!isUsable(value)) return NOT_AVAILABLE;
  const rounded = roundTo(value, dp);
  return `${rounded < 0 ? MINUS : ""}$${group(Math.abs(rounded), dp)}`;
}

/** Token or plain number with grouping: 244273973.51 -> "244,273,973.51". */
export function formatNumber(value: MaybeNumber, dp = 2): string {
  if (!isUsable(value)) return NOT_AVAILABLE;
  return fixed(value, dp);
}

/** NAV per ONyc. Four to six decimals; the default is six. */
export function formatNav(value: MaybeNumber, dp: 4 | 5 | 6 = 6): string {
  if (!isUsable(value)) return NOT_AVAILABLE;
  return fixed(value, dp);
}

/** Basis points, integer: -16.4 -> "−16 bps". */
export function formatBps(value: MaybeNumber, options: SignOption = {}): string {
  if (!isUsable(value)) return NOT_AVAILABLE;
  return `${fixed(value, 0, options.sign === true)} bps`;
}

/** A fraction as a percentage: 0.1102 -> "11.02%". */
export function formatPercent(fraction: MaybeNumber, dp = 2, options: SignOption = {}): string {
  if (!isUsable(fraction)) return NOT_AVAILABLE;
  return formatPercentPoints(fraction * 100, dp, options);
}

/**
 * A value that is already in percent units: 3.5057 -> "3.51%".
 * OnRe's `misc.sUSDeAPY` arrives in these units, not as a fraction.
 */
export function formatPercentPoints(points: MaybeNumber, dp = 2, options: SignOption = {}): string {
  if (!isUsable(points)) return NOT_AVAILABLE;
  return `${fixed(points, dp, options.sign === true)}%`;
}

/** Parts per million, used for the daily NAV increment: 288.4 -> "288 ppm". */
export function formatPpm(value: MaybeNumber, options: SignOption = {}): string {
  if (!isUsable(value)) return NOT_AVAILABLE;
  return `${fixed(value, 0, options.sign === true)} ppm`;
}
