import { latestSnap } from "./chain.js";
import { desc, eq, schema } from "@onyc/db";
import {
  aumDivergence,
  buildRiskSignals,
  capitalByPerilFamily,
  liquidityCoverage,
  loopingShare,
  pastRenewal,
  stepEvents,
  topProtocolShare,
  type Layer,
  type RiskInput,
} from "@onyc/metrics";
import type { z } from "zod";
import type { endpoints } from "@onyc/sdk";
import type { Deps } from "../deps.js";
import { loadHealth } from "../meta.js";
import {
  addDays,
  isoDate,
  latestCollateral,
  latestDistribution,
  latestRecon,
  latestSolvency,
  latestTick,
  latestTickValue,
  liquidityLayerMeasured,
  loadLayers,
  loadNav,
  recentEvents,
} from "../loaders.js";
import { result, type ServiceResult } from "./common.js";
import { aumSources, reportedAum } from "./overview.js";

type Out<K extends keyof typeof endpoints> = z.output<(typeof endpoints)[K]["response"]>["data"];

export async function solvencyService(deps: Deps): Promise<ServiceResult<Out<"solvency">>> {
  const s = await latestSolvency(deps);
  const venues =
    s === null
      ? []
      : Object.entries(
          s.venues as Record<string, Record<string, { usd: number; tag: string }>>,
        ).map(([venue, assets]) => ({
          venue,
          totalUsd: Object.values(assets).reduce((sum, a) => sum + a.usd, 0),
          assets: Object.entries(assets)
            .map(([asset, a]) => ({ asset, usd: a.usd, tag: a.tag }))
            .sort((x, y) => y.usd - x.usd),
        }));
  return result(
    {
      collateralization: s?.collateralization ?? null,
      reservesUsd: s?.reservesUsd ?? null,
      supplyUsd: s?.supplyUsd ?? null,
      retrievedAt: s?.retrievedAt.toISOString() ?? null,
      ageHours: s === null ? null : (deps.now().getTime() - s.retrievedAt.getTime()) / 3_600_000,
      merkleRoot: s?.merkleRoot ?? null,
      venues: venues.sort((a, b) => b.totalUsd - a.totalUsd),
    },
    {
      collateralization: "solvency",
      reservesUsd: "solvency",
      supplyUsd: "solvency",
      retrievedAt: "solvency",
      ageHours: "derived",
      merkleRoot: "solvency",
      venues: "solvency",
    },
  );
}

export async function riskService(deps: Deps): Promise<ServiceResult<Out<"risk">>> {
  const now = deps.now();
  const today = isoDate(now);
  const layerRows = await loadLayers(deps);
  const layers: Layer[] = layerRows.map((r) => ({
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
  }));
  const bound = layers.filter((l) => l.status.toLowerCase() === "bound");
  const boundCapital = bound.reduce((s, l) => s + l.capital, 0);
  const aum = (await reportedAum(deps)).value;
  const solvency = await latestSolvency(deps);
  const dist = await latestDistribution(deps);
  const protocolRows = dist.rows.map((r) => ({
    protocol: r.protocol,
    capitalUsd: r.capitalUsd,
    share: r.share,
  }));
  const top = topProtocolShare(protocolRows);
  const topPeril = capitalByPerilFamily(bound)[0];
  const measured = liquidityLayerMeasured(await latestCollateral(deps));
  const sources = await aumSources(deps);

  const navRows = await loadNav(deps, addDays(today, -60));
  const lastSupply = [...navRows].reverse().find((r) => r.circulatingSupply !== null);
  const monthAgoDate = lastSupply === undefined ? null : addDays(lastSupply.date, -30);
  const monthAgo =
    monthAgoDate === null
      ? undefined
      : navRows.find((r) => r.date >= monthAgoDate && r.circulatingSupply !== null);
  const supplyChange =
    lastSupply?.circulatingSupply != null &&
    monthAgo?.circulatingSupply != null &&
    monthAgo.circulatingSupply > 0
      ? lastSupply.circulatingSupply / monthAgo.circulatingSupply - 1
      : null;

  const since = addDays(today, -30);
  const anomalies = stepEvents(
    navRows.map((r) => ({ date: r.date, nav: r.nav })),
    [],
  ).filter((e) => e.date >= since && e.reason !== "new_vector");

  // Conflict 7: derive AUM from bound capital the way the official Transparency page appears to.
  const derivedAum = boundCapital / (1 - deps.config.LIQUIDITY_TARGET);
  const premium = (await latestTickValue(deps, "premiumBps"))?.value ?? null;

  const input: RiskInput = {
    premiumBps: premium,
    liquidityCoverage: measured !== null && aum !== null ? liquidityCoverage(measured, aum) : null,
    collateralization: solvency?.collateralization ?? null,
    solvencyAgeHours:
      solvency === null ? null : (now.getTime() - solvency.retrievedAt.getTime()) / 3_600_000,
    topProtocol: top === null ? null : { name: top.protocol, share: top.share },
    loopingShare: dist.totalAumUsd === null ? null : loopingShare(protocolRows, dist.totalAumUsd),
    topPeril: topPeril === undefined ? null : { name: topPeril.key, share: topPeril.share },
    supplyChange30d: supplyChange,
    sourceSpread: sources.spread,
    navAnomalies30d: navRows.length === 0 ? null : anomalies.length,
    aumDerivedDivergence:
      aum === null || boundCapital === 0 ? null : aumDivergence(derivedAum, aum),
    pastRenewal: layers.length === 0 ? null : pastRenewal(layers, today),
  };

  const tick = await latestTick(deps);
  const src: Record<string, { source: string; asOf: string | null }> = {
    discount: { source: "Jupiter price vs OnRe NAV", asOf: tick?.ts.toISOString() ?? null },
    liquidity_coverage: {
      source: "OnRe collateral sheet / live TVL",
      asOf: (await latestCollateral(deps))?.ts.toISOString() ?? null,
    },
    collateralization: { source: "Accountable", asOf: solvency?.retrievedAt.toISOString() ?? null },
    solvency_age: { source: "Accountable", asOf: solvency?.retrievedAt.toISOString() ?? null },
    top_protocol: { source: "OnRe rewards API (capital distribution)", asOf: dist.asOfDate },
    looping_share: { source: "OnRe rewards API (capital distribution)", asOf: dist.asOfDate },
    peril_concentration: {
      source: "OnRe reinsurance sheet",
      asOf: layerRows[0]?.lastSeen.toISOString() ?? null,
    },
    supply_trend: { source: "OnRe core API (/data/nav)", asOf: lastSupply?.date ?? null },
    data_divergence: {
      source: "Seven AUM sources, see /v1/overview",
      asOf: tick?.ts.toISOString() ?? null,
    },
    nav_anomalies: { source: "OnRe core API (/data/nav)", asOf: navRows.at(-1)?.date ?? null },
    aum_derived: {
      source: "Bound capital divided by (1 - liquidity share) vs live TVL",
      asOf: tick?.ts.toISOString() ?? null,
    },
    past_renewal: {
      source: "OnRe reinsurance sheet",
      asOf: layerRows[0]?.lastSeen.toISOString() ?? null,
    },
  };

  const signals = buildRiskSignals(input).map((s) => ({
    ...s,
    source: src[s.id]?.source ?? "",
    asOf: src[s.id]?.asOf ?? null,
  }));

  return result(
    {
      signals,
      note: "Each signal has its own value and threshold. There is no blended risk score. Thresholds are this tool's settings, not OnRe's.",
      links: [
        {
          label: "Allez risk assessment",
          url: "https://allez.xyz/reports/onre/ONyc_Asset_Risk_Assessment_260731.pdf",
        },
        {
          label: "Independent attestations",
          url: "https://docs.onre.finance/legal/security-and-verification/independent-attestations",
        },
        {
          label: "Independent audits",
          url: "https://docs.onre.finance/legal/security-and-verification/independent-audits",
        },
        {
          label: "OnRe program on Solscan",
          url: "https://solscan.io/account/onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe",
        },
      ],
    },
    { signals: "derived", note: "derived", links: "derived" },
  );
}

/** The conflicts from DATA_SOURCES §7 and §8. "computed" ones come from stored data; "observed" ones are dated notes. */
export async function conflictsService(deps: Deps) {
  const now = deps.now();
  const { db } = deps.handle;
  const sources = await aumSources(deps);
  const aums = sources.sources.filter((s) => s.aumUsd !== null);
  const settings = (
    await db.select().from(schema.settingsSnap).orderBy(desc(schema.settingsSnap.ts)).limit(1)
  )[0];
  const nav = (await loadNav(deps, addDays(isoDate(now), -7))).at(-1);
  const solvency = await latestSolvency(deps);
  const dist = await latestDistribution(deps);
  const recon = await latestRecon(deps);
  const layers = await loadLayers(deps);
  const asLayers: Layer[] = layers.map((r) => ({
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
  }));
  const aum = (await reportedAum(deps)).value;
  const collateral = await latestCollateral(deps);
  const redemption = await db
    .select()
    .from(schema.redemptionOffersSnap)
    .orderBy(desc(schema.redemptionOffersSnap.ts))
    .limit(4);
  const o = schema.defiOpportunitiesSnap;
  const latestOpp = (await db.select({ ts: o.ts }).from(o).orderBy(desc(o.ts)).limit(1))[0];
  const oppBoosts =
    latestOpp === undefined
      ? 0
      : (await db.select({ r: o.reward }).from(o).where(eq(o.ts, latestOpp.ts))).filter(
          (x) => x.r !== null && x.r > 0,
        ).length;
  const gm =
    (
      await db
        .select({ m: schema.leaderboardSnap.globalMultiplier })
        .from(schema.leaderboardSnap)
        .orderBy(desc(schema.leaderboardSnap.date))
        .limit(1)
    )[0]?.m ?? null;

  const uiNumbers = layers
    .map((l) => Number(l.uiLayerNumber))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = uiNumbers[0] ?? 0; i < (uiNumbers.at(-1) ?? 0); i += 1)
    if (!uiNumbers.includes(i)) gaps.push(i);

  const supplyDiff =
    settings?.onycSupply != null && nav?.circulatingSupply != null
      ? settings.onycSupply - nav.circulatingSupply
      : null;
  const orca = dist.rows.find((d) => d.protocol.toLowerCase() === "orca");
  const derived =
    asLayers.filter((l) => l.status.toLowerCase() === "bound").reduce((s, l) => s + l.capital, 0) /
    (1 - deps.config.LIQUIDITY_TARGET);
  const past = pastRenewal(asLayers, isoDate(now));
  const solvencyAge =
    solvency === null ? null : (now.getTime() - solvency.retrievedAt.getTime()) / 3_600_000;
  const requestFees = [...new Set(redemption.map((r) => r.feeBps))];
  const propFees = [...new Set(redemption.map((r) => r.propAmmFeeBps))];
  const spread = sources.spread;

  type Conflict = Out<"healthSources">["conflicts"][number];
  const list: Conflict[] = [
    {
      id: 1,
      title: "AUM differs across sources",
      kind: "computed",
      state: spread === null ? "unavailable" : spread > 0.01 ? "conflict" : "consistent",
      detail: `${aums.length} sources, spread ${spread === null ? "n/a" : (spread * 100).toFixed(2) + "%"}. Definitions differ (supply, custody, TVL), so a gap is expected but should be visible.`,
      values: Object.fromEntries(aums.map((s) => [s.label, s.aumUsd])),
      observedAt: null,
    },
    {
      id: 2,
      title: "ONyc supply: /settings vs /data/nav",
      kind: "computed",
      state:
        supplyDiff === null ? "unavailable" : Math.abs(supplyDiff) > 1 ? "conflict" : "consistent",
      detail:
        "OnRe's settings report a token supply that differs from the circulating supply in the NAV series. Different definitions or a stale cache; neither is chosen silently.",
      values: {
        settingsSupply: settings?.onycSupply ?? null,
        navCirculatingSupply: nav?.circulatingSupply ?? null,
        difference: supplyDiff,
      },
      observedAt: null,
    },
    {
      id: 3,
      title: "Redemption fee: API vs DefiLlama listing vs docs",
      kind: "observed",
      state: "note",
      detail:
        "DefiLlama's listing says 0.25% and OnRe's docs say 0.30% or more (observed 2026-10-21). The API values below are current.",
      values: {
        requestFeeBps: requestFees.join(", ") || null,
        propAmmSellFeeBps: propFees.join(", ") || null,
      },
      observedAt: "2026-10-21",
    },
    {
      id: 4,
      title: "The 'orca' bucket equals the unexplained residual",
      kind: "computed",
      state:
        recon === null || orca === undefined
          ? "unavailable"
          : Math.abs(recon.unexplainedUsd - orca.capitalUsd) < 1
            ? "conflict"
            : "consistent",
      detail:
        "In the reconciliation, the unexplained ONyc equals the orca figure in the capital distribution, so that bucket looks like a residual rather than a measured balance.",
      values: { unexplainedUsd: recon?.unexplainedUsd ?? null, orcaUsd: orca?.capitalUsd ?? null },
      observedAt: null,
    },
    {
      id: 5,
      title: "Layer numbering: sheet vs official UI",
      kind: "observed",
      state: "note",
      detail:
        "The sheet uses 9000000-style ids and the official UI shows 0000-style numbers. The UI number shown here is derived by subtracting 9,000,000 (verified against layer 0002).",
      values: {
        example:
          layers[0] === undefined ? null : `${layers[0].layerId} -> ${layers[0].uiLayerNumber}`,
      },
      observedAt: "2026-10-21",
    },
    {
      id: 6,
      title: "Accountable retrieval lag",
      kind: "computed",
      state:
        solvencyAge === null
          ? "unavailable"
          : solvencyAge > deps.config.SOLVENCY_STALE_HOURS
            ? "conflict"
            : "consistent",
      detail:
        "Accountable's own retrieval time can lag the date it is read. Staleness is itself a signal.",
      values: {
        retrievedAt: solvency?.retrievedAt.toISOString() ?? null,
        ageHours: solvencyAge,
        thresholdHours: deps.config.SOLVENCY_STALE_HOURS,
      },
      observedAt: null,
    },
    {
      id: 7,
      title: "Official Transparency page vs official APIs",
      kind: "computed",
      state:
        aum === null || derived === 0
          ? "unavailable"
          : Math.abs(derived - aum) / aum > 0.01
            ? "conflict"
            : "consistent",
      detail:
        "On 2026-10-21 the Transparency page showed an AUM of $179,673,794, which equals bound capital divided by 0.85, while the APIs reported about $282.8M. This tool never scrapes the page; the row below recomputes the same derivation from stored data and compares it with the reported AUM.",
      values: { derivedFromBound: derived, reportedAum: aum, observedPageAum: 179673794 },
      observedAt: "2026-10-21",
    },
    {
      id: 8,
      title: "Bound layers past their renewal month",
      kind: "computed",
      state: layers.length === 0 ? "unavailable" : past.count > 0 ? "conflict" : "consistent",
      detail:
        "A layer whose renewal month has passed but whose status is still Bound: the date passed and the status was not updated.",
      values: { layers: past.layerIds.join(", "), count: past.count, capitalUsd: past.capital },
      observedAt: null,
    },
    {
      id: 9,
      title: "Layer ids are not contiguous",
      kind: "computed",
      state: layers.length === 0 ? "unavailable" : gaps.length > 0 ? "note" : "consistent",
      detail:
        "The sheet skips some layer numbers, so the count of layers is not the highest number plus one.",
      values: {
        layers: layers.length,
        missingUiNumbers: gaps.map((g) => String(g).padStart(4, "0")).join(", "),
      },
      observedAt: null,
    },
    {
      id: 10,
      title: "Global points multiplier vs the DeFi sheet boosts",
      kind: "computed",
      state: gm === null && oppBoosts === 0 ? "unavailable" : "note",
      detail:
        "OnRe reports a global multiplier on leaderboard rows and 'Nx points' boosts in the DeFi sheet and does not explain how they relate. Both are shown as published: not reconciled.",
      values: { globalMultiplier: gm, opportunitiesWithBoost: oppBoosts },
      observedAt: null,
    },
    {
      id: 11,
      title: "Collateral sheet: Total vs AUM row",
      kind: "computed",
      state:
        collateral?.totalUsd == null || collateral.aumUsd == null
          ? "unavailable"
          : Math.abs(collateral.totalUsd - collateral.aumUsd) / collateral.aumUsd > 0.001
            ? "conflict"
            : "consistent",
      detail:
        "The collateral sheet's own Total row differs from its AUM row on the same date. Both are kept.",
      values: {
        totalUsd: collateral?.totalUsd ?? null,
        aumRowUsd: collateral?.aumUsd ?? null,
        snapshotDate: collateral?.sheetSnapshotDate ?? null,
      },
      observedAt: null,
    },
  ];

  // On-chain cross-checks, from the worker's chain snapshots (none when the chain jobs have not run yet).
  const chainStats = await latestSnap<{
    nav: number;
    apy: number;
    tvlUsd: number;
    updatedAt: string;
  }>(deps, "market_stats");
  const chainSupply = await latestSnap<{
    totalSupply: number;
    circulatingSupply: number;
    excludedHeld: number;
    impliedAumUsd: number;
  }>(deps, "supply");
  const liveNav = (await latestTickValue(deps, "nav"))?.value ?? null;
  if (chainStats !== null) {
    const diff = liveNav === null ? null : chainStats.data.nav - liveNav;
    list.push({
      id: 12,
      title: "NAV: program account vs API",
      kind: "computed",
      state: diff === null ? "unavailable" : Math.abs(diff) > 1e-6 ? "conflict" : "consistent",
      detail:
        "MarketStats, the NAV the OnRe program itself stores on chain, against /data/live-nav. The program refreshes it only when someone calls refresh_market_stats, so a gap of one day's step is a timing difference, not an error.",
      values: { onchainNav: chainStats.data.nav, apiNav: liveNav, difference: diff },
      observedAt: chainStats.data.updatedAt,
    });
  }
  if (chainSupply !== null) {
    list.push({
      id: 13,
      title: "ONyc supply: on-chain mint vs circulating supply",
      kind: "computed",
      state: "note",
      detail:
        "The mint's total supply is larger than the circulating supply the program reports because the program subtracts the ONyc held by an excluded account (the boss wallet). This explains conflict 2 as a difference of definition: both numbers are right.",
      values: {
        totalSupply: chainSupply.data.totalSupply,
        circulatingSupply: chainSupply.data.circulatingSupply,
        excludedHeld: chainSupply.data.excludedHeld,
      },
      observedAt: chainSupply.ts.toISOString(),
    });
    const apiAum = (await latestTickValue(deps, "tvl"))?.value ?? null;
    const impliedCirculating = chainSupply.data.circulatingSupply * (chainStats?.data.nav ?? 0);
    const gap =
      apiAum === null || impliedCirculating === 0
        ? null
        : (apiAum - impliedCirculating) / impliedCirculating;
    list.push({
      id: 14,
      title: "AUM: API vs on-chain circulating supply times NAV",
      kind: "computed",
      state:
        gap === null
          ? "unavailable"
          : Math.abs(gap) > deps.config.CHAIN_AUM_GAP_ALERT
            ? "conflict"
            : "consistent",
      detail:
        "The API's AUM is live TVL from OnRe, which is built as circulating supply times NAV. The chain gives the same product from the mint and the program's own NAV, so the two should agree; a gap means a feed is wrong or late, and an alert fires above the configured threshold.",
      values: {
        impliedCirculatingUsd: impliedCirculating,
        impliedTotalUsd: chainSupply.data.impliedAumUsd,
        apiAumUsd: apiAum,
        gap,
        threshold: deps.config.CHAIN_AUM_GAP_ALERT,
      },
      observedAt: chainSupply.ts.toISOString(),
    });
  }
  return list;
}

export async function healthService(deps: Deps): Promise<ServiceResult<Out<"healthSources">>> {
  const health = await loadHealth(deps);
  const conflicts = await conflictsService(deps);
  return result(
    {
      sources: health
        .map((h) => ({
          source: h.source,
          endpoint: h.endpoint,
          status: h.status as "ok" | "degraded" | "down" | "not_configured",
          lastOkAt: h.lastOkAt?.toISOString() ?? null,
          lastErrorAt: h.lastErrorAt?.toISOString() ?? null,
          lastError: h.lastError,
          consecutiveFailures: h.consecutiveFailures,
          lastLatencyMs: h.lastLatencyMs,
        }))
        .sort((a, b) => (a.source + a.endpoint).localeCompare(b.source + b.endpoint)),
      conflicts,
    },
    { sources: "derived", conflicts: "derived" },
  );
}

export async function eventsService(
  deps: Deps,
  q: { kind?: string | undefined; limit: number },
): Promise<ServiceResult<Out<"events">>> {
  const events = await recentEvents(deps, {
    limit: q.limit,
    ...(q.kind === undefined ? {} : { kind: q.kind }),
  });
  return result({ events }, { events: "derived" });
}
