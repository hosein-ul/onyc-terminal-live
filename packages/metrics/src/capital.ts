export interface CapitalStack {
  boundUsd: number;
  offeredUsd: number;
  availableUsd: number;
  liquidityLayerUsd: number;
  /** bound + offered + available + liquidity layer. */
  sumUsd: number;
  /** The AUM it is compared with. */
  aumUsd: number;
  /** sum - aum. About 0 when the stack is consistent. */
  difference: number;
  /** |difference| / aum is within `tolerance`. */
  sumsToAum: boolean;
}

/**
 * Capital stack. Bound capital is the sum of Bound reinsurance layers; the liquidity layer is the collateral
 * sheet's rows flagged as such. Available is whatever remains of AUM, so the sum check is by construction unless
 * `availableUsd` is supplied independently. Offered is 0 when no layer has an offered status.
 */
export function capitalStack(
  input: {
    boundUsd: number;
    offeredUsd: number;
    liquidityLayerUsd: number;
    aumUsd: number;
    availableUsd?: number;
  },
  tolerance = 0.0005,
): CapitalStack {
  const availableUsd =
    input.availableUsd ??
    input.aumUsd - input.boundUsd - input.offeredUsd - input.liquidityLayerUsd;
  const sumUsd = input.boundUsd + input.offeredUsd + availableUsd + input.liquidityLayerUsd;
  const difference = sumUsd - input.aumUsd;
  return {
    boundUsd: input.boundUsd,
    offeredUsd: input.offeredUsd,
    availableUsd,
    liquidityLayerUsd: input.liquidityLayerUsd,
    sumUsd,
    aumUsd: input.aumUsd,
    difference,
    sumsToAum: Math.abs(difference) / input.aumUsd <= tolerance,
  };
}

export interface ProtocolShare {
  protocol: string;
  capitalUsd: number;
  share: number;
}

export function topProtocolShare(distribution: readonly ProtocolShare[]): ProtocolShare | null {
  let top: ProtocolShare | null = null;
  for (const d of distribution) if (top === null || d.capitalUsd > top.capitalUsd) top = d;
  return top;
}

/** Protocols whose ONyc is looped (a lending-market break hits them). */
export const LOOPING_PROTOCOLS: readonly string[] = ["kamino", "loopscale"];

/** Share of ONyc capital in Kamino and Loopscale. */
export function loopingShare(distribution: readonly ProtocolShare[], totalUsd: number): number {
  if (totalUsd <= 0) return 0;
  const sum = distribution
    .filter((d) => LOOPING_PROTOCOLS.includes(d.protocol.toLowerCase()))
    .reduce((s, d) => s + d.capitalUsd, 0);
  return sum / totalUsd;
}

export interface CollateralRow {
  asset: string;
  amountUsd: number;
  /** Fraction. */
  apy: number | null;
}

/** Amount-weighted APY of collateral rows that report one. */
export function blendedCollateralApy(rows: readonly CollateralRow[]): number | null {
  const withApy = rows.filter((r) => r.apy !== null);
  const total = withApy.reduce((s, r) => s + r.amountUsd, 0);
  if (total === 0) return null;
  return withApy.reduce((s, r) => s + r.amountUsd * (r.apy ?? 0), 0) / total;
}

/**
 * Blend of reinsurance and collateral yield weighted by their capital. Used to compare against the reported APY;
 * it is a check, not the reported number (OnRe's fee structure is not modelled here).
 */
export function blendedApy(
  parts: readonly { amountUsd: number; apy: number | null }[],
): number | null {
  const usable = parts.filter((p) => p.apy !== null && p.amountUsd > 0);
  const total = usable.reduce((s, p) => s + p.amountUsd, 0);
  if (total === 0) return null;
  return usable.reduce((s, p) => s + p.amountUsd * (p.apy ?? 0), 0) / total;
}

export interface Reconciliation {
  circulatingUsd: number;
  knownCustodyUsd: number;
  attributedUsd: number;
  unexplainedUsd: number;
  /** unexplained / circulating. */
  unexplainedShare: number;
}

export function reconciliationView(r: {
  circulatingUsd: number;
  knownCustodyUsd: number;
  attributedProtocolUsd: number;
  unexplainedUsd: number;
}): Reconciliation {
  return {
    circulatingUsd: r.circulatingUsd,
    knownCustodyUsd: r.knownCustodyUsd,
    attributedUsd: r.attributedProtocolUsd,
    unexplainedUsd: r.unexplainedUsd,
    unexplainedShare: r.circulatingUsd > 0 ? r.unexplainedUsd / r.circulatingUsd : 0,
  };
}

/** Senior/junior tranche spread: junior APY minus senior APY (fractions). */
export function trancheSpread(seniorApy: number | null, juniorApy: number | null): number | null {
  return seniorApy === null || juniorApy === null ? null : juniorApy - seniorApy;
}
