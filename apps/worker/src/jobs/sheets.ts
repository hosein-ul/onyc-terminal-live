import { desc, eq, schema, sql } from "@onyc/db";
import { formatPercent, formatUsdCompact } from "@onyc/format";
import {
  SOURCE,
  onreSheets,
  type CollateralSheet,
  type DefiOpportunity,
  type ReinsuranceLayer,
} from "@onyc/sources";
import type { Ctx, Job } from "../context.js";
import {
  diffCollateral,
  diffLayers,
  diffOpportunities,
  type LayerRow,
  type OpportunityRow,
} from "../diff.js";
import { emitEvent } from "../events.js";
import { track } from "../health.js";
import { chunked, saveRaw } from "../snapshots.js";

const ENDPOINT = {
  reinsurance: "sheet reinsurance (gid 297157125)",
  opportunities: "sheet opportunities (gid 1418034083)",
  nav: "sheet nav (gid 362705568)",
  collateral: "sheet collateral (gid 1591707661)",
} as const;

const PAUSE_MS = 1_000;
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function toLayerRow(layer: ReinsuranceLayer): LayerRow {
  return {
    layerId: layer.layerId,
    status: layer.status,
    inception: layer.inception,
    renewal: layer.renewal,
    perils: layer.perils,
    structure: layer.structure,
    capital: layer.capitalDeployed,
    premium: layer.netPremium,
    expectedLoss: layer.expectedLoss,
    expectedYield: layer.expectedYield,
  };
}

async function syncReinsurance(ctx: Ctx): Promise<void> {
  const result = await track(ctx, SOURCE.sheets, ENDPOINT.reinsurance, () =>
    onreSheets.reinsurance(ctx.fetchOptions),
  );
  if (result === null) return;
  const saved = await saveRaw(ctx, SOURCE.sheets, ENDPOINT.reinsurance, result, "text");
  const { db } = ctx.handle;
  const t = schema.reinsuranceLayers;
  const now = result.fetchedAt;

  const parsed = result.data.map(toLayerRow);
  const existingRows = await db.select().from(t);
  const existing: LayerRow[] = existingRows.map((r) => ({
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
  const bootstrap = existing.length === 0;
  const changes = saved.changed || bootstrap ? diffLayers(existing, parsed) : [];

  const ui = new Map(result.data.map((l) => [l.layerId, l.uiLayerNumber]));
  const label = (id: string): string => `layer ${ui.get(id) ?? id}`;
  const observed = saved.hash.slice(0, 12);

  if (!bootstrap) {
    for (const change of changes) {
      switch (change.kind) {
        case "layer_new":
          await emitEvent(ctx, {
            kind: "layer_new",
            severity: "info",
            title: `New reinsurance ${label(change.layer.layerId)}: ${change.layer.status}`,
            body: `${change.layer.perils}, ${change.layer.structure}, ${formatUsdCompact(change.layer.capital, 2)} deployed.`,
            data: change.layer,
            dedupKey: `layer_new:${change.layer.layerId}`,
          });
          break;
        case "layer_status_change":
          await emitEvent(ctx, {
            kind: "layer_status_change",
            severity: "watch",
            title: `${label(change.layerId)} status ${change.from} -> ${change.to}`,
            data: change,
            dedupKey: `layer_status:${change.layerId}:${change.from}>${change.to}:${observed}`,
          });
          break;
        case "layer_capital_change":
          await emitEvent(ctx, {
            kind: "layer_capital_change",
            severity: "watch",
            title: `${label(change.layerId)} capital ${formatUsdCompact(change.from, 2)} -> ${formatUsdCompact(change.to, 2)}`,
            data: change,
            dedupKey: `layer_capital:${change.layerId}:${change.to}:${observed}`,
          });
          break;
        case "layer_terms_change":
          await emitEvent(ctx, {
            kind: "layer_terms_change",
            severity: "info",
            title: `${label(change.layerId)} terms changed: ${change.fields.join(", ")}`,
            data: change,
            dedupKey: `layer_terms:${change.layerId}:${observed}`,
          });
          break;
        case "layer_removed": {
          const last = existingRows.find((r) => r.layerId === change.layer.layerId)?.lastSeen;
          await emitEvent(ctx, {
            kind: "layer_removed",
            severity: "watch",
            title: `Layer ${change.layer.layerId} no longer in the sheet`,
            data: change.layer,
            dedupKey: `layer_removed:${change.layer.layerId}:${last?.toISOString() ?? "unknown"}`,
          });
          break;
        }
      }
    }
  }

  const rows = result.data.map((layer) => ({
    ...toLayerRow(layer),
    uiLayerNumber: layer.uiLayerNumber,
    capital: layer.capitalDeployed,
    firstSeen: now,
    lastSeen: now,
  }));
  await chunked(rows, 100, (chunk) =>
    db
      .insert(t)
      .values(chunk)
      .onConflictDoUpdate({
        target: t.layerId,
        set: {
          uiLayerNumber: sql`excluded.ui_layer_number`,
          status: sql`excluded.status`,
          inception: sql`excluded.inception`,
          renewal: sql`excluded.renewal`,
          perils: sql`excluded.perils`,
          structure: sql`excluded.structure`,
          capital: sql`excluded.capital`,
          premium: sql`excluded.premium`,
          expectedLoss: sql`excluded.expected_loss`,
          expectedYield: sql`excluded.expected_yield`,
          lastSeen: sql`excluded.last_seen`,
        },
      }),
  );

  const touched = new Set<string>();
  for (const change of changes) {
    touched.add(
      change.kind === "layer_new" || change.kind === "layer_removed"
        ? change.layer.layerId
        : change.layerId,
    );
  }
  const historyRows = parsed
    .filter((l) => bootstrap || touched.has(l.layerId))
    .map((l) => ({ ...l, ts: now }));
  await chunked(historyRows, 100, (chunk) =>
    db.insert(schema.reinsuranceLayersHistory).values(chunk),
  );
}

function toOppRow(o: DefiOpportunity): OpportunityRow {
  return {
    key: o.key,
    classification: o.classification,
    protocol: o.protocol,
    strategy: o.strategy,
    apy: o.apy,
    pointsMultiplier: o.pointsMultiplier,
    comingSoon: o.comingSoon,
  };
}

async function syncOpportunities(ctx: Ctx): Promise<void> {
  const result = await track(ctx, SOURCE.sheets, ENDPOINT.opportunities, () =>
    onreSheets.opportunities(ctx.fetchOptions),
  );
  if (result === null) return;
  const saved = await saveRaw(ctx, SOURCE.sheets, ENDPOINT.opportunities, result, "text");
  if (!saved.changed) return;

  const { db } = ctx.handle;
  const t = schema.defiOpportunitiesSnap;
  const latestTs = (await db.select({ ts: t.ts }).from(t).orderBy(desc(t.ts)).limit(1))[0]?.ts;
  const previous =
    latestTs === undefined
      ? []
      : (await db.select().from(t).where(eq(t.ts, latestTs))).map((r): OpportunityRow => ({
          key: r.oppKey,
          classification: r.classification,
          protocol: r.protocol,
          strategy: r.strategy,
          apy: r.apy,
          pointsMultiplier: r.reward,
          comingSoon: (r.flags as { comingSoon?: boolean }).comingSoon === true,
        }));

  const next = result.data.opportunities;
  const observed = saved.hash.slice(0, 12);
  if (previous.length > 0) {
    const changes = diffOpportunities(
      previous,
      next.map(toOppRow),
      ctx.config.OPPORTUNITY_APY_EVENT_MIN_DELTA,
    );
    for (const change of changes) {
      const name = `${change.row.protocol} ${change.row.strategy}`;
      switch (change.kind) {
        case "opportunity_added":
          await emitEvent(ctx, {
            kind: "opportunity_added",
            severity: "info",
            title: `New DeFi opportunity: ${name} (${change.row.key})`,
            data: change.row,
            dedupKey: `opp_added:${change.row.key}:${observed}`,
          });
          break;
        case "opportunity_removed":
          await emitEvent(ctx, {
            kind: "opportunity_removed",
            severity: "info",
            title: `DeFi opportunity removed: ${name} (${change.row.key})`,
            data: change.row,
            dedupKey: `opp_removed:${change.row.key}:${observed}`,
          });
          break;
        case "opportunity_apy_change":
          await emitEvent(ctx, {
            kind: "opportunity_apy_change",
            severity: "info",
            title: `${name} APY ${formatPercent(change.from)} -> ${formatPercent(change.to)}`,
            data: { key: change.row.key, from: change.from, to: change.to },
            dedupKey: `opp_apy:${change.row.key}:${observed}`,
          });
          break;
        case "opportunity_multiplier_change":
          await emitEvent(ctx, {
            kind: "opportunity_multiplier_change",
            severity: "info",
            title: `${name} points multiplier ${change.from ?? "none"} -> ${change.to ?? "none"}`,
            data: { key: change.row.key, from: change.from, to: change.to },
            dedupKey: `opp_mult:${change.row.key}:${observed}`,
          });
          break;
        case "opportunity_launched":
          await emitEvent(ctx, {
            kind: "opportunity_launched",
            severity: "info",
            title: `${name} is no longer coming soon`,
            data: change.row,
            dedupKey: `opp_launched:${change.row.key}:${observed}`,
          });
          break;
      }
    }
  }

  const rows = next.map((o) => ({
    ts: result.fetchedAt,
    oppKey: o.key,
    classification: o.classification,
    protocol: o.protocol,
    strategy: o.strategy,
    activity: o.activity,
    assets: o.assets,
    apy: o.apy,
    tvl: o.tvlUsd,
    reward: o.pointsMultiplier,
    link: o.link,
    flags: { isNew: o.isNew, comingSoon: o.comingSoon, featured: o.featured },
  }));
  await chunked(rows, 200, (chunk) => db.insert(t).values(chunk).onConflictDoNothing());
}

async function syncNavSheet(ctx: Ctx): Promise<void> {
  const result = await track(ctx, SOURCE.sheets, ENDPOINT.nav, () =>
    onreSheets.nav(ctx.fetchOptions),
  );
  if (result === null) return;
  const saved = await saveRaw(ctx, SOURCE.sheets, ENDPOINT.nav, result, "text");
  if (!saved.changed) return;
  const rows = result.data.map((r) => ({ ...r, fetchedAt: result.fetchedAt }));
  const t = schema.navSheetDaily;
  await chunked(rows, 500, (chunk) =>
    ctx.handle.db
      .insert(t)
      .values(chunk)
      .onConflictDoUpdate({
        target: t.date,
        set: {
          nav: sql`excluded.nav`,
          aum: sql`excluded.aum`,
          apy: sql`excluded.apy`,
          circulatingSupply: sql`excluded.circulating_supply`,
          changed: sql`excluded.changed`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      }),
  );
}

async function syncCollateral(ctx: Ctx): Promise<void> {
  const result = await track(ctx, SOURCE.sheets, ENDPOINT.collateral, () =>
    onreSheets.collateral(ctx.fetchOptions),
  );
  if (result === null) return;
  const saved = await saveRaw(ctx, SOURCE.sheets, ENDPOINT.collateral, result, "text");
  if (!saved.changed) return;

  const { db } = ctx.handle;
  const head = schema.collateralSnapshots;
  const rowsT = schema.collateralAssetsSnap;
  const sheet: CollateralSheet = result.data;

  const prevHead = (await db.select().from(head).orderBy(desc(head.ts)).limit(1))[0];
  if (prevHead !== undefined) {
    const prevAssets = await db.select().from(rowsT).where(eq(rowsT.ts, prevHead.ts));
    const changes = diffCollateral(
      {
        snapshotDate: prevHead.sheetSnapshotDate,
        assets: prevAssets.map((a) => ({ asset: a.asset, amountUsd: a.amountUsd })),
      },
      { snapshotDate: sheet.snapshotDate, assets: sheet.assets },
    );
    const observed = saved.hash.slice(0, 12);
    for (const change of changes) {
      const title =
        change.kind === "collateral_snapshot_updated"
          ? `Collateral sheet snapshot ${change.from} -> ${change.to}`
          : change.kind === "collateral_asset_added"
            ? `Collateral asset added: ${change.asset}`
            : `Collateral asset removed: ${change.asset}`;
      await emitEvent(ctx, {
        kind: change.kind,
        severity: "info",
        title,
        data: change,
        dedupKey: `${change.kind}:${observed}:${"asset" in change ? change.asset : change.to}`,
      });
    }
  }

  await db.insert(head).values({
    ts: result.fetchedAt,
    sheetSnapshotDate: sheet.snapshotDate,
    totalUsd: sheet.totalUsd,
    aumUsd: sheet.aumUsd,
    metadata: sheet.metadata,
  });
  await db.insert(rowsT).values(
    sheet.assets.map((a, index) => ({
      ts: result.fetchedAt,
      rowIndex: index,
      asset: a.asset,
      amountUsd: a.amountUsd,
      allocation: a.allocation,
      apy: a.apy,
      liquidityLayer: a.liquidityLayer,
      proofs: a.proofs,
    })),
  );
}

/** Every 30 minutes: the four published sheets, one after another. */
export const sheetsJob: Job = {
  name: "sheets",
  schedule: "0 3,33 * * * *",
  startDelayMs: 2_000,
  async run(ctx) {
    await syncNavSheet(ctx);
    await sleep(PAUSE_MS);
    await syncReinsurance(ctx);
    await sleep(PAUSE_MS);
    await syncOpportunities(ctx);
    await sleep(PAUSE_MS);
    await syncCollateral(ctx);
  },
};
