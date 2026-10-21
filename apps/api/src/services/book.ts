import { asc, desc, eq, gte, schema } from "@onyc/db";
import {
  blendedApy,
  blendedCollateralApy,
  bookExpectedYield,
  bookTotals,
  capitalByPerilFamily,
  capitalByStructure,
  expectedLossRatio,
  isPastRenewal,
  loopingShare,
  monthsToRenewal,
  pastRenewal,
  perilFamily,
  perilTags,
  premiumToEL,
  rateOnCapital,
  renewalCalendar,
  structureFamily,
  topProtocolShare,
  trancheSpread,
  type Layer,
} from "@onyc/metrics";
import type { z } from "zod";
import type { Range, endpoints } from "@onyc/sdk";
import type { Deps } from "../deps.js";
import {
  isoDate,
  latestCollateral,
  latestDistribution,
  latestRecon,
  latestTickValue,
  loadLayers,
  rangeStart,
  type LayerDbRow,
} from "../loaders.js";
import { result, thin, type ServiceResult } from "./common.js";
import { buildStack, reportedAum } from "./overview.js";

type Out<K extends keyof typeof endpoints> = z.output<(typeof endpoints)[K]["response"]>["data"];

const toLayer = (r: LayerDbRow): Layer => ({
  layerId: r.layerId,
  status: r.status,
  inception: r.inception,
  renewal: r.renewal,
  perils: r.perils,
  structure: r.structure,
  capital: r.capital,
  premium: r.premium,
  expectedLoss: r.expectedLoss,
  expectedYield: r.expectedYield,
});

export async function layersService(deps: Deps): Promise<ServiceResult<Out<"reinsuranceLayers">>> {
  const rows = await loadLayers(deps);
  const asOf = isoDate(deps.now());
  return result(
    {
      asOf,
      layers: rows.map((r) => {
        const l = toLayer(r);
        return {
          layerId: r.layerId,
          uiLayerNumber: r.uiLayerNumber,
          status: r.status,
          inception: r.inception,
          renewal: r.renewal,
          perils: r.perils,
          perilFamily: perilFamily(r.perils),
          perilTags: perilTags(r.perils),
          structure: r.structure,
          structureFamily: structureFamily(r.structure),
          capital: r.capital,
          premium: r.premium,
          expectedLoss: r.expectedLoss,
          expectedYield: r.expectedYield,
          premiumToEL: premiumToEL(l),
          rateOnCapital: rateOnCapital(l),
          expectedLossRatio: expectedLossRatio(l),
          monthsToRenewal: monthsToRenewal(r.renewal, asOf),
          pastRenewal: isPastRenewal(l, asOf),
          firstSeen: r.firstSeen.toISOString(),
        };
      }),
    },
    { asOf: "derived", layers: "reinsurance" },
  );
}

export async function reinsuranceSummaryService(
  deps: Deps,
): Promise<ServiceResult<Out<"reinsuranceSummary">>> {
  const rows = await loadLayers(deps);
  const layers = rows.map(toLayer);
  const bound = layers.filter((l) => l.status.toLowerCase() === "bound");
  const aum = (await reportedAum(deps)).value;
  const asOf = isoDate(deps.now());

  const h = schema.reinsuranceLayersHistory;
  const history = await deps.handle.db.select().from(h).orderBy(asc(h.layerId), asc(h.ts));
  const byLayer = new Map<string, typeof history>();
  for (const row of history) byLayer.set(row.layerId, [...(byLayer.get(row.layerId) ?? []), row]);

  return result(
    {
      totals: bookTotals(bound, aum),
      byPeril: capitalByPerilFamily(bound),
      byStructure: capitalByStructure(bound),
      renewalCalendar: renewalCalendar(bound),
      pastRenewal: pastRenewal(layers, asOf),
      history: rows.map((r) => ({
        layerId: r.layerId,
        uiLayerNumber: r.uiLayerNumber,
        firstSeen: r.firstSeen.toISOString(),
        changes: (byLayer.get(r.layerId) ?? []).map((x) => ({
          ts: x.ts.toISOString(),
          status: x.status,
          capital: x.capital,
        })),
      })),
      historyNote:
        "First seen is when this tool first observed the layer in the published sheet, not the layer's inception date.",
    },
    {
      totals: "reinsurance",
      byPeril: "reinsurance",
      byStructure: "reinsurance",
      renewalCalendar: "reinsurance",
      pastRenewal: "reinsurance",
      history: "reinsurance",
      historyNote: "derived",
    },
  );
}

export async function yieldService(deps: Deps): Promise<ServiceResult<Out<"yieldComposition">>> {
  const rows = await loadLayers(deps);
  const bound = rows.map(toLayer).filter((l) => l.status.toLowerCase() === "bound");
  const boundCapital = bound.reduce((s, l) => s + l.capital, 0);
  const bookYield = bookExpectedYield(bound);
  const collateral = await latestCollateral(deps);
  const collateralApy =
    collateral === null
      ? null
      : blendedCollateralApy(
          collateral.assets.map((a) => ({ asset: a.asset, amountUsd: a.amountUsd, apy: a.apy })),
        );
  const aum = (await reportedAum(deps)).value;
  const reported = (await latestTickValue(deps, "apy"))?.value ?? null;

  // Assumption, stated in the note: bound capital earns the book's expected yield and the rest of AUM earns the
  // collateral blend.
  const blended =
    aum !== null && bookYield !== null && collateralApy !== null && aum > 0
      ? blendedApy([
          { amountUsd: boundCapital, apy: bookYield },
          { amountUsd: Math.max(0, aum - boundCapital), apy: collateralApy },
        ])
      : null;

  return result(
    {
      reportedApy: reported,
      reinsurance: { capital: boundCapital, expectedYield: bookYield },
      collateral: {
        snapshotDate: collateral?.sheetSnapshotDate ?? null,
        totalUsd: collateral?.totalUsd ?? null,
        aumRowUsd: collateral?.aumUsd ?? null,
        blendedApy: collateralApy,
        assets: (collateral?.assets ?? []).map((a) => ({
          asset: a.asset,
          amountUsd: a.amountUsd,
          allocation: a.allocation,
          apy: a.apy,
          liquidityLayer: a.liquidityLayer,
          proofs: Array.isArray(a.proofs) ? (a.proofs as string[]) : [],
        })),
      },
      blendedApy: blended,
      difference: blended !== null && reported !== null ? blended - reported : null,
      note: "A check, not the reported figure: bound capital at the book's expected yield plus the rest of AUM at the collateral blend. Fees, timing and OnRe's own accounting are not modelled, so a gap to the reported APY is expected.",
    },
    {
      reportedApy: "live",
      reinsurance: "reinsurance",
      collateral: "collateral",
      blendedApy: "derived",
      difference: "derived",
      note: "derived",
    },
  );
}

export async function capitalStackService(deps: Deps): Promise<ServiceResult<Out<"capitalStack">>> {
  const stack = await buildStack(deps);
  return result(
    {
      stack,
      note: "The sum check is shown, not assumed: available capital is AUM minus the other three parts, so a mismatch appears only if a part is added independently.",
    },
    { stack: "reinsurance", note: "derived" },
  );
}

export async function distributionService(
  deps: Deps,
  range: Range,
): Promise<ServiceResult<Out<"capitalDistribution">>> {
  const dist = await latestDistribution(deps);
  const rows = dist.rows.map((r) => ({
    protocol: r.protocol,
    capitalUsd: r.capitalUsd,
    share: r.share,
  }));
  const from = rangeStart(range, isoDate(deps.now()));
  const t = schema.protocolAumDaily;
  const q = deps.handle.db.select().from(t);
  const hist = await (from === null ? q : q.where(gte(t.date, from))).orderBy(
    asc(t.date),
    asc(t.protocol),
  );
  return result(
    {
      asOfDate: dist.asOfDate,
      totalAumUsd: dist.totalAumUsd,
      distribution: rows,
      loopingShare: dist.totalAumUsd === null ? null : loopingShare(rows, dist.totalAumUsd),
      topProtocol: topProtocolShare(rows),
      history: hist.map((h) => ({ date: h.date, protocol: h.protocol, aumUsd: h.aumUsd })),
    },
    {
      asOfDate: "capital",
      totalAumUsd: "capital",
      distribution: "capital",
      loopingShare: "capital",
      topProtocol: "capital",
      history: "protocolAum",
    },
  );
}

export async function reconciliationService(
  deps: Deps,
): Promise<ServiceResult<Out<"capitalReconciliation">>> {
  const r = await latestRecon(deps);
  const dist = await latestDistribution(deps);
  const orca = dist.rows.find((d) => d.protocol.toLowerCase() === "orca");
  const equal =
    r !== null && orca !== undefined && Math.abs(r.unexplainedUsd - orca.capitalUsd) < 1;
  const entries = Array.isArray(r?.entries)
    ? (r.entries as { protocol: string; capitalUsd: number }[]).map((e) => ({
        protocol: e.protocol,
        capitalUsd: e.capitalUsd,
      }))
    : [];
  return result(
    {
      asOfDate: r?.asOfDate ?? null,
      circulatingUsd: r?.circulatingUsd ?? null,
      knownCustodyUsd: r?.knownCustodyUsd ?? null,
      attributedUsd: r?.attributedProtocolUsd ?? null,
      unexplainedUsd: r?.unexplainedUsd ?? null,
      unexplainedShare:
        r === null || r.circulatingUsd <= 0 ? null : r.unexplainedUsd / r.circulatingUsd,
      entries,
      residualNote: equal
        ? "The unexplained amount equals the 'orca' bucket in the capital distribution to the dollar. That bucket looks like a residual, not a measured balance."
        : "The unexplained amount does not currently equal the 'orca' bucket in the capital distribution.",
    },
    {
      asOfDate: "capital",
      circulatingUsd: "capital",
      knownCustodyUsd: "capital",
      attributedUsd: "capital",
      unexplainedUsd: "capital",
      unexplainedShare: "capital",
      entries: "capital",
      residualNote: "derived",
    },
  );
}

export async function opportunitiesService(
  deps: Deps,
  withHistory: boolean,
): Promise<ServiceResult<Out<"defiOpportunities">>> {
  const t = schema.defiOpportunitiesSnap;
  const { db } = deps.handle;
  const latest = (await db.select({ ts: t.ts }).from(t).orderBy(desc(t.ts)).limit(1))[0];
  const current = latest === undefined ? [] : await db.select().from(t).where(eq(t.ts, latest.ts));
  const historyByKey = new Map<string, { t: string; apy: number | null; tvl: number | null }[]>();
  if (withHistory) {
    const all = await db
      .select({ key: t.oppKey, ts: t.ts, apy: t.apy, tvl: t.tvl })
      .from(t)
      .orderBy(asc(t.ts));
    for (const r of all) {
      const list = historyByKey.get(r.key) ?? [];
      list.push({ t: r.ts.toISOString(), apy: r.apy, tvl: r.tvl });
      historyByKey.set(r.key, list);
    }
  }
  const opportunities = current.map((r) => {
    const flags = r.flags as { isNew?: boolean; comingSoon?: boolean; featured?: boolean };
    return {
      key: r.oppKey,
      classification: r.classification,
      protocol: r.protocol,
      strategy: r.strategy,
      activity: r.activity,
      assets: r.assets as { symbol: string; kind: "token" | "tranche" | "principal-token" }[],
      apy: r.apy,
      tvl: r.tvl,
      pointsMultiplier: r.reward,
      link: r.link,
      isNew: flags.isNew === true,
      comingSoon: flags.comingSoon === true,
      featured: flags.featured === true,
      history: thin(historyByKey.get(r.oppKey) ?? [], 300),
    };
  });
  const find = (symbol: string) =>
    opportunities.find(
      (o) =>
        o.classification === "Risk Tranching" &&
        o.assets.some((a) => a.symbol.toLowerCase() === symbol),
    ) ?? null;
  const senior = find("sronyc");
  const junior = find("jronyc");
  const dist = await latestDistribution(deps);

  return result(
    {
      asOf: latest?.ts.toISOString() ?? null,
      opportunities,
      tranching: {
        senior,
        junior,
        spread: trancheSpread(senior?.apy ?? null, junior?.apy ?? null),
        principalTokens: opportunities.filter((o) =>
          o.assets.some((a) => a.kind === "principal-token"),
        ),
      },
      loopingShare:
        dist.totalAumUsd === null
          ? null
          : loopingShare(
              dist.rows.map((r) => ({
                protocol: r.protocol,
                capitalUsd: r.capitalUsd,
                share: r.share,
              })),
              dist.totalAumUsd,
            ),
    },
    {
      asOf: "opportunities",
      opportunities: "opportunities",
      tranching: "opportunities",
      loopingShare: "capital",
    },
  );
}
