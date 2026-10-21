/** premiumBps = (marketPrice / nav - 1) x 1e4 (negative is a discount). */
export function premiumBps(marketPrice: number, nav: number): number {
  return (marketPrice / nav - 1) * 1e4;
}

/** liquidityCoverage = liquidityLayerUsd / aumUsd */
export function liquidityCoverage(liquidityLayerUsd: number, aumUsd: number): number {
  return liquidityLayerUsd / aumUsd;
}

/** sourceSpread = (max - min) / min across AUM sources. */
export function sourceSpread(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (max - min) / min;
}

/** Relative gap between derived and reported AUM: |derived - reported| / reported. */
export function aumDivergence(derived: number, reported: number): number {
  return Math.abs(derived - reported) / reported;
}

export interface ExitEstimate {
  onyc: number;
  navValueUsd: number;
  marketValueUsd: number | null;
  requestFeeUsd: number;
  requestNetUsd: number;
  propAmmFeeUsd: number;
  propAmmNetUsd: number;
}

/** Exit cost for redeeming `onyc` tokens. An estimate: it ignores the queue, capacity and slippage. */
export function exitEstimate(
  onyc: number,
  nav: number,
  marketPrice: number | null,
  requestFeeBps: number,
  propAmmFeeBps: number,
): ExitEstimate {
  const navValueUsd = onyc * nav;
  const requestFeeUsd = (navValueUsd * requestFeeBps) / 1e4;
  const propAmmFeeUsd = (navValueUsd * propAmmFeeBps) / 1e4;
  return {
    onyc,
    navValueUsd,
    marketValueUsd: marketPrice === null ? null : onyc * marketPrice,
    requestFeeUsd,
    requestNetUsd: navValueUsd - requestFeeUsd,
    propAmmFeeUsd,
    propAmmNetUsd: navValueUsd - propAmmFeeUsd,
  };
}
