/**
 * ONyc NAV price vectors, ported from the onre-sol program (github.com/onre-finance/onre-sol, commit
 * c0490831f438074562ebf51e437ca5f8e027596b), file programs/onreapp/src/instructions/offer/offer_utils.rs:
 *   - find_active_vector_at       (line 246): the vector with the latest start_time <= now
 *   - calculate_step_price_at     (line 378): price is fixed per `price_fix_duration` window and snaps to the
 *                                              END of the current window: effective = (floor(elapsed/dur)+1)*dur
 *   - calculate_vector_price      (line 277): DAILY COMPOUNDING, not simple interest:
 *       daily_factor = 1 + apr/(1e6*365)   (rounded, 18-digit fixed point)
 *       price = base * daily_factor^(elapsed/86400), plus linear interpolation inside a day
 *   - pow_fixed / mul_div_round_u128 (utils/math_utils.rs): round-half-up fixed point
 * Checked on 2026-10-21: the newest vector reproduces `/data/live-nav` (1.157827091) exactly.
 * BigInt is used so the result is bit-exact with the on-chain u64 price (scale 1e9).
 */

const INT_SCALE = 10n ** 18n;
const APR_SCALE = 1_000_000n;
const SECONDS_IN_DAY = 86_400n;

export interface PriceVector {
  /** Unix seconds. */
  startTime: number;
  /** Unix seconds. */
  baseTime: number;
  /** Price times 1e9, as served by the API. */
  basePrice: number;
  /** Rate times 1e6, as served by the API. */
  apr: number;
  priceFixDuration: number;
}

function mulDivRound(a: bigint, b: bigint, denom: bigint): bigint {
  return (a * b + denom / 2n) / denom;
}

function powFixed(base: bigint, exp: bigint): bigint {
  let acc = INT_SCALE;
  let b = base;
  let e = exp;
  while (e > 0n) {
    if ((e & 1n) === 1n) acc = mulDivRound(acc, b, INT_SCALE);
    e >>= 1n;
    if (e > 0n) b = mulDivRound(b, b, INT_SCALE);
  }
  return acc;
}

/** calculate_vector_price: price (scale 1e9, as bigint) after `elapsedSeconds` of growth. */
export function vectorPriceRaw(apr: bigint, basePrice: bigint, elapsedSeconds: bigint): bigint {
  if (apr === 0n || elapsedSeconds === 0n) return basePrice;
  const dailyIncrement = (INT_SCALE * apr + (APR_SCALE * 365n) / 2n) / (APR_SCALE * 365n);
  const dailyFactor = INT_SCALE + dailyIncrement;
  const fullDays = elapsedSeconds / SECONDS_IN_DAY;
  const remaining = elapsedSeconds % SECONDS_IN_DAY;
  const fullDayPrice = mulDivRound(basePrice, powFixed(dailyFactor, fullDays), INT_SCALE);
  if (remaining === 0n) return fullDayPrice;
  const nextDayPrice = mulDivRound(fullDayPrice, dailyFactor, INT_SCALE);
  return fullDayPrice + mulDivRound(nextDayPrice - fullDayPrice, remaining, SECONDS_IN_DAY);
}

/** calculate_step_price_at. Throws if `time` is before the vector's base time (NoActiveVector). */
export function stepPriceRaw(vector: PriceVector, time: number): bigint {
  if (vector.baseTime > time) throw new Error("time is before the vector's base time");
  const duration = BigInt(vector.priceFixDuration);
  const elapsed = BigInt(time - vector.baseTime);
  const stepEnd = (elapsed / duration + 1n) * duration;
  return vectorPriceRaw(BigInt(vector.apr), BigInt(vector.basePrice), stepEnd);
}

/** find_active_vector_at: latest startTime <= time, ignoring empty (startTime 0) vectors. */
export function findActiveVector(
  vectors: readonly PriceVector[],
  time: number,
): PriceVector | null {
  let best: PriceVector | null = null;
  for (const v of vectors) {
    if (v.startTime === 0 || v.startTime > time) continue;
    if (best === null || v.startTime > best.startTime) best = v;
  }
  return best;
}

/** NAV in USD at `time` (unix seconds), or null when no vector is active yet. */
export function scheduledNav(vectors: readonly PriceVector[], time: number): number | null {
  const active = findActiveVector(vectors, time);
  if (active === null) return null;
  return Number(stepPriceRaw(active, time)) / 1e9;
}

export interface ForwardPoint {
  /** Unix seconds at the start of the day (UTC). */
  time: number;
  nav: number;
}

/**
 * Scheduled NAV for each of the next `days` days at 00:00 UTC, assuming no new vector is added.
 * Indicative only: OnRe can add a vector at any time.
 */
export function forwardPath(
  vectors: readonly PriceVector[],
  fromTime: number,
  days: number,
): ForwardPoint[] {
  const startOfDay = Math.floor(fromTime / 86_400) * 86_400;
  const points: ForwardPoint[] = [];
  for (let i = 1; i <= days; i += 1) {
    const time = startOfDay + i * 86_400;
    const nav = scheduledNav(vectors, time);
    if (nav !== null) points.push({ time, nav });
  }
  return points;
}

/** The vector's own growth for one more day, as a fraction: APR compounded daily. */
export function vectorApy(apr: number): number {
  return (1 + apr / 1e6 / 365) ** 365 - 1;
}
