import { asc, desc, schema } from "@onyc/db";
import {
  aumAttributionSeries,
  dailyIncrements,
  findActiveVector,
  forwardPath,
  netFlowUsd,
  scheduledNav,
  smoothness,
  stepEvents,
  vectorApy,
  windowReturns,
  type PriceVector,
} from "@onyc/metrics";
import type { z } from "zod";
import type { Range, endpoints } from "@onyc/sdk";
import type { Deps } from "../deps.js";
import {
  addDays,
  isoDate,
  latestCollateral,
  latestSettings,
  latestTick,
  loadNav,
  rangeStart,
  type NavRow,
} from "../loaders.js";
import { num, result, type ServiceResult } from "./common.js";

type Out<K extends keyof typeof endpoints> = z.output<(typeof endpoints)[K]["response"]>["data"];

export async function loadVectors(deps: Deps) {
  const t = schema.priceVectors;
  const rows = await deps.handle.db.select().from(t).orderBy(asc(t.startTime), asc(t.id));
  // Both mint offers carry the same vectors; keep one of each.
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = `${r.startTime.getTime()}:${r.baseTime.getTime()}:${r.basePrice}:${r.apr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique;
}

function toPriceVector(r: Awaited<ReturnType<typeof loadVectors>>[number]): PriceVector {
  return {
    startTime: Math.floor(r.startTime.getTime() / 1000),
    baseTime: Math.floor(r.baseTime.getTime() / 1000),
    basePrice: r.basePrice,
    apr: r.apr,
    priceFixDuration: r.priceFixDuration,
  };
}

export async function navService(deps: Deps, range: Range): Promise<ServiceResult<Out<"nav">>> {
  const all = await loadNav(deps);
  const today = isoDate(deps.now());
  const from = rangeStart(range, today);
  const points = all.map((r) => ({ date: r.date, nav: r.nav }));
  const incs = new Map(dailyIncrements(points).map((i) => [i.date, i.ppm]));

  const vectors = await loadVectors(deps);
  const vectorDates = [...new Set(vectors.map((v) => isoDate(v.startTime)))];
  const events = stepEvents(points, vectorDates).filter((e) => from === null || e.date >= from);

  const window = from === null ? all : all.filter((r) => r.date >= from);
  const present = new Set(all.map((r) => r.date));
  const missingDates: string[] = [];
  const first = all[0]?.date;
  const last = all.at(-1)?.date;
  if (first !== undefined && last !== undefined) {
    for (let d = first; d < last; d = addDays(d, 1)) if (!present.has(d)) missingDates.push(d);
  }

  const settings = await latestSettings(deps);
  const collateral = await latestCollateral(deps);
  const tbill = collateral?.assets.find((a) => /t-bills?/i.test(a.asset) && a.apy !== null) ?? null;
  const tick = await latestTick(deps);
  const sheetApy = [...all].reverse().find((r) => r.apyReported !== null)?.apyReported ?? null;

  return result(
    {
      range,
      series: window.map((r) => ({
        date: r.date,
        nav: r.nav,
        aum: r.aum,
        circulatingSupply: r.circulatingSupply,
        apyReported: r.apyReported,
        incrementPpm: incs.get(r.date) ?? null,
      })),
      events,
      returns: windowReturns(points),
      smoothness: smoothness(window.map((r) => ({ date: r.date, nav: r.nav }))),
      missingDates,
      benchmarks: {
        // settings.misc.sUSDeAPY is in percent units, so it is divided by 100 here.
        susdeApy: settings === null ? null : settings.susdeApyPct / 100,
        tbillApy: tbill?.apy ?? null,
        tbillSource: tbill === null ? null : `Collateral sheet: ${tbill.asset}`,
        reportedApy: num(tick?.apy) ?? sheetApy,
      },
    },
    {
      range: "derived",
      series: "navHistory",
      events: "navHistory",
      returns: "navHistory",
      smoothness: "navHistory",
      missingDates: "navHistory",
      benchmarks: "settings",
    },
  );
}

export async function vectorsService(deps: Deps): Promise<ServiceResult<Out<"navVectors">>> {
  const rows = await loadVectors(deps);
  const pv = rows.map(toPriceVector);
  const nowSec = Math.floor(deps.now().getTime() / 1000);
  const active = findActiveVector(pv, nowSec);
  const scheduledNavNow = scheduledNav(pv, nowSec);

  const offer = (
    await deps.handle.db
      .select()
      .from(schema.mintOffers)
      .orderBy(desc(schema.mintOffers.updatedAt))
      .limit(1)
  )[0];
  const liveNav = offer?.price ?? (await latestTick(deps))?.nav ?? null;

  const toDate = (t: number): string => isoDate(new Date(t * 1000));
  const d30 = forwardPath(pv, nowSec, 30).map((p) => ({ date: toDate(p.time), nav: p.nav }));
  const d90 = forwardPath(pv, nowSec, 90).map((p) => ({ date: toDate(p.time), nav: p.nav }));
  const nextMidnight = (Math.floor(nowSec / 86400) + 1) * 86400;

  return result(
    {
      scheduledNavNow,
      liveNav,
      difference: scheduledNavNow !== null && liveNav !== null ? scheduledNavNow - liveNav : null,
      vectors: rows.map((r, i) => ({
        startTime: r.startTime.toISOString(),
        baseTime: r.baseTime.toISOString(),
        basePrice: r.basePrice / 1e9,
        apr: r.apr / 1e6,
        apy: vectorApy(r.apr),
        priceFixDurationSeconds: r.priceFixDuration,
        state: r.state,
        active:
          active !== null &&
          pv[i]?.startTime === active.startTime &&
          pv[i]?.basePrice === active.basePrice,
        firstSeen: r.firstSeen.toISOString(),
      })),
      nextRepricing: {
        at: new Date(nextMidnight * 1000).toISOString(),
        note: "The price steps once a day at 00:00 UTC. OnRe can add a new vector at any time, which changes the schedule.",
      },
      forward: { label: "Scheduled, not guaranteed", d30, d90 },
      formula: {
        source:
          "onre-sol programs/onreapp/src/instructions/offer/offer_utils.rs (commit c0490831): find_active_vector_at L246, calculate_vector_price L277, calculate_step_price_at L378",
        description:
          "The active vector is the one with the latest start time that has begun. Price = base price x (1 + apr/365)^days with daily compounding and linear interpolation inside a day, evaluated at the END of the current price-fix window (one day).",
      },
    },
    {
      scheduledNavNow: "offers",
      liveNav: "offers",
      difference: "derived",
      vectors: "offers",
      forward: "offers",
      nextRepricing: "derived",
      formula: "derived",
    },
  );
}

export async function flowsService(deps: Deps, range: Range): Promise<ServiceResult<Out<"flows">>> {
  const all = await loadNav(deps);
  const from = rangeStart(range, isoDate(deps.now()));
  const usable = all
    .filter((r): r is NavRow & { circulatingSupply: number } => r.circulatingSupply !== null)
    .map((r) => ({ date: r.date, nav: r.nav, supply: r.circulatingSupply, aum: r.aum }));
  const byDate = new Map(usable.map((p) => [p.date, p]));
  const attribution = aumAttributionSeries(usable).filter((a) => from === null || a.date >= from);
  const series = attribution.map((a) => {
    const cur = byDate.get(a.date);
    const idx = usable.findIndex((p) => p.date === a.date);
    const prev = usable[idx - 1];
    return {
      ...a,
      netFlowUsd:
        cur !== undefined && prev !== undefined ? netFlowUsd(prev.supply, cur.supply, cur.nav) : 0,
      nav: cur?.nav ?? 0,
      supply: cur?.supply ?? 0,
    };
  });
  const sum = (f: (s: (typeof series)[number]) => number): number =>
    series.reduce((acc, s) => acc + f(s), 0);
  return result(
    {
      range,
      series,
      totals: {
        navEffect: sum((s) => s.navEffect),
        flowEffect: sum((s) => s.flowEffect),
        residual: sum((s) => s.residual),
        netFlowUsd: sum((s) => s.netFlowUsd),
      },
    },
    { range: "derived", series: "navHistory", totals: "navHistory" },
  );
}
