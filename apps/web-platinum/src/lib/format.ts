import { formatBps, formatNav, formatPercent, formatUsdCompact, NOT_AVAILABLE } from "@onyc/format";

export { NOT_AVAILABLE };

/** "+$1.2M" / "−$0.4M": an absolute USD change with its sign. */
export function signedUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatUsdCompact(Math.abs(value))}`;
}

export function signedNav(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatNav(Math.abs(value), 4)}`;
}

export const signedBps = (v: number | null | undefined): string => formatBps(v, { sign: true });
export const signedPct = (v: number | null | undefined, dp = 2): string =>
  formatPercent(v, dp, { sign: true });

/** Oldest-first ISO list to a short "21 Oct 2026, 15:28 UTC". */
export function utcStamp(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) return NOT_AVAILABLE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NOT_AVAILABLE;
  const day = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${day}, ${d.toISOString().slice(11, 16)} UTC`;
}

export const shortAddress = (a: string): string =>
  a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
