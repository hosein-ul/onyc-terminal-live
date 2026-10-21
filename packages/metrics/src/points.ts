/** Points sorted descending, negatives and non-finite values dropped. */
function descending(values: readonly number[]): number[] {
  return values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => b - a);
}

export interface LorenzPoint {
  /** Cumulative share of wallets, poorest first (0..1). */
  population: number;
  /** Cumulative share of points held by that population (0..1). */
  points: number;
}

/**
 * Lorenz curve of totals. `maxPoints` thins the curve for transport (the endpoints are always kept); the Gini is
 * always computed from every value.
 */
export function lorenz(totals: readonly number[], maxPoints = 200): LorenzPoint[] {
  const asc = descending(totals).reverse();
  const n = asc.length;
  const sum = asc.reduce((s, v) => s + v, 0);
  if (n === 0 || sum === 0)
    return [
      { population: 0, points: 0 },
      { population: 1, points: 1 },
    ];
  const step = Math.max(1, Math.floor(n / maxPoints));
  const out: LorenzPoint[] = [{ population: 0, points: 0 }];
  let cumulative = 0;
  asc.forEach((v, i) => {
    cumulative += v;
    if ((i + 1) % step === 0 || i === n - 1)
      out.push({ population: (i + 1) / n, points: cumulative / sum });
  });
  return out;
}

/** Gini coefficient: 0 is perfect equality, 1 is one holder with everything. */
export function gini(totals: readonly number[]): number {
  const asc = descending(totals).reverse();
  const n = asc.length;
  const sum = asc.reduce((s, v) => s + v, 0);
  if (n === 0 || sum === 0) return 0;
  let weighted = 0;
  asc.forEach((v, i) => {
    weighted += (i + 1) * v;
  });
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

/** Share of all points held by the top `n` wallets. */
export function topNShare(totals: readonly number[], n: number): number {
  const desc = descending(totals);
  const sum = desc.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  return desc.slice(0, n).reduce((s, v) => s + v, 0) / sum;
}

/** Wallets at or above each threshold. */
export function walletsAbove(
  totals: readonly number[],
  thresholds: readonly number[],
): { threshold: number; wallets: number }[] {
  return thresholds.map((threshold) => ({
    threshold,
    wallets: totals.filter((t) => t >= threshold).length,
  }));
}

export interface RankMovement {
  address: string;
  rank: number;
  previousRank: number | null;
  /** previousRank - rank: positive means the wallet moved up. */
  change: number | null;
}

/** Our own rank movement between two snapshots of (address, rank). */
export function rankMovement(
  current: readonly { address: string; rank: number }[],
  previous: readonly { address: string; rank: number }[],
): RankMovement[] {
  const prev = new Map(previous.map((p) => [p.address, p.rank]));
  return current.map((c) => {
    const p = prev.get(c.address) ?? null;
    return {
      address: c.address,
      rank: c.rank,
      previousRank: p,
      change: p === null ? null : p - c.rank,
    };
  });
}

/** Rank percentile: 1 is the top wallet, 0 the last (rank 1 of N gives 1; rank N gives 0). */
export function rankPercentile(rank: number, totalUsers: number): number {
  if (totalUsers <= 1) return 1;
  return 1 - (rank - 1) / (totalUsers - 1);
}
