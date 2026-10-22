import type { EndpointResponse } from "@onyc/sdk";

type Concentration = EndpointResponse<"concentration">["data"];
type Growth = EndpointResponse<"pointsGrowth">["data"];

/**
 * OnRe's points programme page gives the formula: points = ONyc balance x days x 1 point per ONyc per day x a venue
 * multiplier (x a personal multiplier we cannot see). One ONyc is worth NAV dollars, so one dollar earns 1 / NAV ONyc.
 * The result is this tool's estimate, not an OnRe figure.
 */
export const POINTS_FORMULA =
  "points per $1 per day = venue multiplier x 1 point per ONyc per day / NAV";

export function estimatePointsPerUsdPerDay(
  multiplier: number | null,
  nav: number | null,
): number | null {
  if (multiplier === null || nav === null || !(nav > 0)) return null;
  return multiplier / nav;
}

export interface VenueEstimate {
  protocol: string;
  strategy: string;
  multiplier: number;
  /** Estimated points per $1 per day. */
  perUsd: number | null;
}

export interface PointsPulse {
  /** Points handed out on the latest day in the history, in total (base and referral). */
  dailyEmission: { value: number; date: string } | null;
  /** The global multiplier exactly as OnRe reports it. */
  globalMultiplier: { value: number; since: string; note: string } | null;
  venues: VenueEstimate[];
  formula: string;
}

export function buildPointsPulse(
  growth: Growth | undefined,
  concentration: Concentration | undefined,
  nav: number | null,
  top = 6,
): PointsPulse {
  const last = growth?.series[growth.series.length - 1];
  const venues = (concentration?.multipliers ?? [])
    .map((m): VenueEstimate => ({
      protocol: m.protocol,
      strategy: m.strategy,
      multiplier: m.pointsMultiplier,
      perUsd: estimatePointsPerUsdPerDay(m.pointsMultiplier, nav),
    }))
    .sort((a, b) => b.multiplier - a.multiplier)
    .slice(0, top);
  return {
    dailyEmission: last === undefined ? null : { value: last.dailyTotal, date: last.date },
    globalMultiplier: growth?.activeMultiplier ?? concentration?.globalMultiplier ?? null,
    venues,
    formula: POINTS_FORMULA,
  };
}
