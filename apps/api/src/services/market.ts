import { asc, desc, gte, schema } from "@onyc/db";
import { exitEstimate, liquidityCoverage } from "@onyc/metrics";
import { CONSTANTS } from "@onyc/sources";
import type { z } from "zod";
import type { Range, endpoints } from "@onyc/sdk";
import type { Deps } from "../deps.js";
import {
  isoDate,
  latestCollateral,
  latestTickValue,
  liquidityLayerMeasured,
  rangeStart,
} from "../loaders.js";
import { result, thin, type ServiceResult } from "./common.js";
import { reportedAum } from "./overview.js";

type Out<K extends keyof typeof endpoints> = z.output<(typeof endpoints)[K]["response"]>["data"];

export async function marketService(
  deps: Deps,
  range: Range,
): Promise<ServiceResult<Out<"market">>> {
  const t = schema.liveTicks;
  const from = rangeStart(range, isoDate(deps.now()));
  const since = from === null ? new Date(0) : new Date(`${from}T00:00:00Z`);
  const rows = await deps.handle.db.select().from(t).where(gte(t.ts, since)).orderBy(asc(t.ts));
  const history = thin(rows, 600).map((r) => ({
    t: r.ts.toISOString(),
    premiumBps: r.premiumBps,
    marketPrice: r.marketPrice,
    nav: r.nav,
  }));

  const market = await latestTickValue(deps, "marketPrice");
  const nav = await latestTickValue(deps, "nav");
  const premium = await latestTickValue(deps, "premiumBps");

  const p = schema.marketPoolsSnap;
  const latest = (
    await deps.handle.db.select({ ts: p.ts }).from(p).orderBy(desc(p.ts)).limit(1)
  )[0];
  const pools =
    latest === undefined
      ? []
      : await deps.handle.db
          .select()
          .from(p)
          .where(gte(p.ts, latest.ts))
          .orderBy(desc(p.liquidityUsd));
  const poolRows = pools.filter((x) => x.ts.getTime() === latest?.ts.getTime());

  const aum = (await reportedAum(deps)).value;
  const measured = liquidityLayerMeasured(await latestCollateral(deps));

  return result(
    {
      marketPrice: market?.value ?? null,
      nav: nav?.value ?? null,
      premiumBps: premium?.value ?? null,
      history,
      historySince: rows[0]?.ts.toISOString() ?? null,
      bands: [25, 50, 100],
      pools: poolRows.map((x) => ({
        pool: x.pool,
        name: x.name,
        dex: x.dex,
        priceUsd: x.priceUsd,
        liquidityUsd: x.liquidityUsd,
        volume24h: x.volume24h,
        priceChange24hPct: x.priceChange24hPct,
      })),
      poolsTotals: {
        liquidityUsd: poolRows.reduce((s, x) => s + (x.liquidityUsd ?? 0), 0),
        volume24h: poolRows.reduce((s, x) => s + (x.volume24h ?? 0), 0),
      },
      liquidityCoverage:
        measured !== null && aum !== null ? liquidityCoverage(measured, aum) : null,
      liquidityLayerUsd: measured,
      aumUsd: aum,
      coverageTarget: deps.config.LIQUIDITY_TARGET,
    },
    {
      marketPrice: "market",
      nav: "live",
      premiumBps: "market",
      history: "market",
      historySince: "market",
      bands: "derived",
      pools: "pools",
      poolsTotals: "pools",
      liquidityCoverage: "collateral",
      liquidityLayerUsd: "collateral",
      aumUsd: "live",
      coverageTarget: "derived",
    },
  );
}

const TOKEN_OUT: Record<string, string> = {
  [CONSTANTS.usdcMint]: "USDC",
  [CONSTANTS.usdgMint]: "USDG",
  [CONSTANTS.usdtMint]: "USDT",
};

export async function redemptionsService(
  deps: Deps,
  amount: number | undefined,
): Promise<ServiceResult<Out<"redemptions">>> {
  const { db } = deps.handle;
  const o = schema.redemptionOffersSnap;
  const snaps = await db.select().from(o).orderBy(asc(o.ts));

  // Latest snapshot per offer.
  const latestByOffer = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) latestByOffer.set(s.offer, s);
  const offers = [...latestByOffer.values()].map((s) => ({
    offer: s.offer,
    tokenOutMint: s.tokenOutMint,
    tokenOut: TOKEN_OUT[s.tokenOutMint] ?? s.tokenOutMint.slice(0, 4),
    executed: s.executed,
    requested: s.requested,
    feeBps: s.feeBps,
    propAmmFeeBps: s.propAmmFeeBps,
    vaultTarget: s.vaultTarget,
    disabled: s.disabled,
  }));

  // Redemption flow: total executed across offers after each change, and the delta from the previous point.
  const running = new Map<string, number>();
  let previousTotal: number | null = null;
  const flow: { t: string; executed: number; delta: number }[] = [];
  for (const s of snaps) {
    running.set(s.offer, s.executed);
    const total = [...running.values()].reduce((a, b) => a + b, 0);
    flow.push({
      t: s.ts.toISOString(),
      executed: total,
      delta: previousTotal === null ? 0 : total - previousTotal,
    });
    previousTotal = total;
  }

  const st = schema.redemptionSettingsSnap;
  const settingsRow = (await db.select().from(st).orderBy(desc(st.ts)).limit(1))[0];

  const r = schema.redemptionRequests;
  const logRows = await db.select().from(r).orderBy(desc(r.redemptionTime)).limit(100);
  const total = (await db.select({ n: r.requestPda }).from(r)).length;
  const newest = logRows.map((x) => x.redemptionTime).find((x) => x !== null) ?? null;

  const nav = (await latestTickValue(deps, "nav"))?.value ?? null;
  const market = (await latestTickValue(deps, "marketPrice"))?.value ?? null;
  const biggest = [...offers].sort((a, b) => b.executed - a.executed)[0];
  const estimate =
    amount !== undefined && nav !== null && biggest !== undefined
      ? {
          ...exitEstimate(amount, nav, market, biggest.feeBps, biggest.propAmmFeeBps),
          label: `Estimate using the ${biggest.tokenOut} offer's fees. It ignores queue time, capacity limits and slippage.`,
        }
      : null;

  return result(
    {
      offers,
      settings:
        settingsRow === undefined
          ? null
          : {
              allowPartial: settingsRow.allowPartial,
              coolDownSeconds: settingsRow.coolDown,
              growthRate: settingsRow.growthRate,
              initialCapacity: settingsRow.initialCapacity,
              maxCapacity: settingsRow.maxCapacity,
              maxSharePerRequest: settingsRow.maxSharePerRequest,
              startTime: settingsRow.startTime.toISOString(),
            },
      capacityNote:
        "OnRe's API publishes the capacity parameters but not the capacity curve, and the onre-sol program source checked here does not define it either. Only the parameters are shown; no curve is drawn.",
      flow,
      flowSince: snaps[0]?.ts.toISOString() ?? null,
      log: {
        rows: logRows.map((x) => ({
          requestPda: x.requestPda,
          redeemer: x.redeemer,
          status: x.status,
          amount: x.amount,
          fulfilledAmount: x.fulfilledAmount,
          requestedAt: x.requestedAt?.toISOString() ?? null,
          redemptionTime: x.redemptionTime?.toISOString() ?? null,
          tokenOutMint: x.tokenOutMint,
          submissionTx: x.submissionTx,
          fulfillmentTxs: Array.isArray(x.fulfillmentTxs) ? (x.fulfillmentTxs as string[]) : [],
        })),
        totalRows: total,
        newest: newest?.toISOString() ?? null,
        note: "A partial public log. It does not reconcile with the executed totals on the offers, so its sum is never shown as total redemptions.",
      },
      estimate,
    },
    {
      offers: "redemption",
      settings: "redemption",
      capacityNote: "derived",
      flow: "redemption",
      flowSince: "redemption",
      log: "redemptionLog",
      estimate: "derived",
    },
  );
}
