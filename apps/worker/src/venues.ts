/**
 * Flatten OnRe's nested points breakdown into leaf paths, e.g. `kamino.onyc` or
 * `exponent.markets.SEP-2026.yt`. Non-numeric leaves are ignored.
 */
export function flattenBreakdown(breakdown: unknown, prefix = ""): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "number" && Number.isFinite(value)) {
      out.set(path, (out.get(path) ?? 0) + value);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, path === "" ? key : `${path}.${key}`);
      }
    }
  };
  walk(breakdown, prefix);
  return out;
}

/** Add one wallet's leaf values into a running per-venue total. */
export function addToTotals(totals: Map<string, number>, breakdown: unknown): void {
  for (const [path, value] of flattenBreakdown(breakdown)) {
    totals.set(path, (totals.get(path) ?? 0) + value);
  }
}
