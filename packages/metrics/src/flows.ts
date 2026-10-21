export interface SupplyPoint {
  date: string;
  nav: number;
  supply: number;
  aum: number | null;
}

export interface AumAttribution {
  date: string;
  /** supply_{t-1} x (nav_t - nav_{t-1}) */
  navEffect: number;
  /** (supply_t - supply_{t-1}) x nav_t */
  flowEffect: number;
  /** Observed change in AUM. */
  deltaAum: number;
  /** deltaAum minus both effects; shown when it is not about zero. */
  residual: number;
}

/** netFlowUsd = delta supply x nav */
export function netFlowUsd(supplyPrev: number, supply: number, nav: number): number {
  return (supply - supplyPrev) * nav;
}

/** aumAttribution for one day. The two effects sum exactly to supply_t x nav_t - supply_{t-1} x nav_{t-1}. */
export function aumAttribution(prev: SupplyPoint, cur: SupplyPoint): AumAttribution | null {
  if (prev.aum === null || cur.aum === null) return null;
  const navEffect = prev.supply * (cur.nav - prev.nav);
  const flowEffect = netFlowUsd(prev.supply, cur.supply, cur.nav);
  const deltaAum = cur.aum - prev.aum;
  return {
    date: cur.date,
    navEffect,
    flowEffect,
    deltaAum,
    residual: deltaAum - navEffect - flowEffect,
  };
}

/** Attribution for every consecutive pair that has supply and AUM (input is sorted ascending). */
export function aumAttributionSeries(points: readonly SupplyPoint[]): AumAttribution[] {
  const out: AumAttribution[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev === undefined || cur === undefined) continue;
    const a = aumAttribution(prev, cur);
    if (a !== null) out.push(a);
  }
  return out;
}
