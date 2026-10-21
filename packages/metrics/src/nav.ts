export interface NavPoint {
  /** ISO date. */
  date: string;
  nav: number;
}

/** navReturn(t0, t1) = nav1 / nav0 - 1 */
export function navReturn(nav0: number, nav1: number): number {
  return nav1 / nav0 - 1;
}

/** (1 + r)^(365 / days) - 1 */
export function annualize(returnFraction: number, days: number): number {
  if (days <= 0) throw new Error("days must be positive");
  return (1 + returnFraction) ** (365 / days) - 1;
}

/** dailyIncrementPpm = (nav_t / nav_{t-1} - 1) * 1e6 */
export function dailyIncrementPpm(navPrev: number, nav: number): number {
  return (nav / navPrev - 1) * 1e6;
}

const DAY_MS = 86_400_000;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS,
  );
}

function sortAscending(points: readonly NavPoint[]): NavPoint[] {
  return [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface DailyIncrement {
  date: string;
  /** Calendar days since the previous point (greater than 1 when a day is missing). */
  gapDays: number;
  ppm: number;
  /** Increment per calendar day, so a gap does not look like a spike. */
  ppmPerDay: number;
}

export function dailyIncrements(points: readonly NavPoint[]): DailyIncrement[] {
  const sorted = sortAscending(points);
  const out: DailyIncrement[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev === undefined || cur === undefined) continue;
    const gapDays = Math.max(1, daysBetween(prev.date, cur.date));
    const ppm = dailyIncrementPpm(prev.nav, cur.nav);
    out.push({ date: cur.date, gapDays, ppm, ppmPerDay: ppm / gapDays });
  }
  return out;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const lo = s[mid - 1];
  const hi = s[mid];
  if (hi === undefined) return Number.NaN;
  return s.length % 2 === 1 ? hi : ((lo ?? hi) + hi) / 2;
}

/** Median absolute deviation (unscaled). */
export function mad(values: readonly number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export interface StepEvent {
  date: string;
  ppm: number;
  reason: "downtick" | "outlier" | "new_vector";
}

/**
 * stepEvent: a day whose increment deviates from the trailing 30-day median by more than 5 x MAD, or on which a
 * new price vector starts (`vectorDates`, ISO dates). A down-tick (increment < 0) is always reported.
 * When the trailing MAD is 0 any change at all would qualify, so a floor of 1 ppm is used.
 */
export function stepEvents(
  points: readonly NavPoint[],
  vectorDates: readonly string[] = [],
  window = 30,
): StepEvent[] {
  const increments = dailyIncrements(points);
  const vectors = new Set(vectorDates);
  const events: StepEvent[] = [];
  let previousWasOutlier = false;
  increments.forEach((inc, i) => {
    const wasOutlier = previousWasOutlier;
    previousWasOutlier = false;
    if (inc.ppm < 0) {
      events.push({ date: inc.date, ppm: inc.ppm, reason: "downtick" });
      return;
    }
    if (vectors.has(inc.date)) {
      events.push({ date: inc.date, ppm: inc.ppm, reason: "new_vector" });
      return;
    }
    const trailing = increments.slice(Math.max(0, i - window), i).map((x) => x.ppmPerDay);
    if (trailing.length < 5) return;
    const spread = Math.max(mad(trailing), 1);
    if (Math.abs(inc.ppmPerDay - median(trailing)) > 5 * spread) {
      previousWasOutlier = true;
      // A step that persists is one event, not one per day until the trailing window catches up.
      const prev = increments[i - 1];
      const persists =
        wasOutlier && prev !== undefined && Math.abs(inc.ppmPerDay - prev.ppmPerDay) <= 5;
      if (!persists) events.push({ date: inc.date, ppm: inc.ppm, reason: "outlier" });
    }
  });
  return events;
}

export interface Smoothness {
  /** Standard deviation (sample) of the per-calendar-day increment, in ppm. */
  stdevPpm: number;
  /** Largest peak-to-trough fall of NAV, as a negative fraction (0 when NAV never fell). */
  maxDrawdown: number;
  negativeDays: number;
  observations: number;
}

export function smoothness(points: readonly NavPoint[]): Smoothness {
  const sorted = sortAscending(points);
  const incs = dailyIncrements(sorted);
  const xs = incs.map((i) => i.ppmPerDay);
  const mean = xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const variance =
    xs.length > 1 ? xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1) : 0;
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;
  for (const p of sorted) {
    peak = Math.max(peak, p.nav);
    maxDrawdown = Math.min(maxDrawdown, p.nav / peak - 1);
  }
  return {
    stdevPpm: Math.sqrt(variance),
    maxDrawdown,
    negativeDays: incs.filter((i) => i.ppm < 0).length,
    observations: incs.length,
  };
}

export type ReturnWindow = "7d" | "30d" | "90d" | "ytd" | "inception";

export interface WindowReturn {
  window: ReturnWindow;
  from: string;
  to: string;
  days: number;
  /** Total return over the window. */
  return: number;
  /** Compounded annualisation of the NAV-implied return. */
  annualized: number;
}

/** The latest point at or before `date`, or null. */
function atOrBefore(sorted: readonly NavPoint[], date: string): NavPoint | null {
  let found: NavPoint | null = null;
  for (const p of sorted) {
    if (p.date <= date) found = p;
    else break;
  }
  return found;
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

/** Return table: 7d, 30d, 90d, YTD and since inception, using the newest point as the end. */
export function windowReturns(points: readonly NavPoint[]): WindowReturn[] {
  const sorted = sortAscending(points);
  const last = sorted.at(-1);
  const first = sorted[0];
  if (last === undefined || first === undefined) return [];
  const starts: [ReturnWindow, NavPoint | null][] = [
    ["7d", atOrBefore(sorted, shiftDays(last.date, 7))],
    ["30d", atOrBefore(sorted, shiftDays(last.date, 30))],
    ["90d", atOrBefore(sorted, shiftDays(last.date, 90))],
    ["ytd", atOrBefore(sorted, `${Number(last.date.slice(0, 4)) - 1}-12-31`)],
    ["inception", first],
  ];
  const out: WindowReturn[] = [];
  for (const [window, start] of starts) {
    if (start === null || start.date === last.date) continue;
    const days = daysBetween(start.date, last.date);
    const r = navReturn(start.nav, last.nav);
    out.push({
      window,
      from: start.date,
      to: last.date,
      days,
      return: r,
      annualized: annualize(r, days),
    });
  }
  return out;
}
