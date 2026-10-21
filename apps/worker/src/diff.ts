/** Pure diffing of published-sheet snapshots. The worker turns these changes into `events`. */

export interface LayerRow {
  layerId: string;
  status: string;
  inception: string;
  renewal: string;
  perils: string;
  structure: string;
  capital: number;
  premium: number;
  expectedLoss: number;
  expectedYield: number;
}

export type LayerChange =
  | { kind: "layer_new"; layer: LayerRow }
  | { kind: "layer_removed"; layer: LayerRow }
  | { kind: "layer_status_change"; layerId: string; from: string; to: string }
  | { kind: "layer_capital_change"; layerId: string; from: number; to: number }
  | { kind: "layer_terms_change"; layerId: string; fields: string[] };

const TERM_FIELDS = [
  "inception",
  "renewal",
  "perils",
  "structure",
  "premium",
  "expectedLoss",
  "expectedYield",
] as const;

export function diffLayers(prev: readonly LayerRow[], next: readonly LayerRow[]): LayerChange[] {
  const before = new Map(prev.map((l) => [l.layerId, l]));
  const after = new Map(next.map((l) => [l.layerId, l]));
  const changes: LayerChange[] = [];

  for (const layer of next) {
    const old = before.get(layer.layerId);
    if (old === undefined) {
      changes.push({ kind: "layer_new", layer });
      continue;
    }
    if (old.status !== layer.status) {
      changes.push({
        kind: "layer_status_change",
        layerId: layer.layerId,
        from: old.status,
        to: layer.status,
      });
    }
    if (old.capital !== layer.capital) {
      changes.push({
        kind: "layer_capital_change",
        layerId: layer.layerId,
        from: old.capital,
        to: layer.capital,
      });
    }
    const fields = TERM_FIELDS.filter((field) => old[field] !== layer[field]);
    if (fields.length > 0)
      changes.push({ kind: "layer_terms_change", layerId: layer.layerId, fields });
  }
  for (const layer of prev) {
    if (!after.has(layer.layerId)) changes.push({ kind: "layer_removed", layer });
  }
  return changes;
}

export interface OpportunityRow {
  key: string;
  classification: string;
  protocol: string;
  strategy: string;
  apy: number | null;
  pointsMultiplier: number | null;
  comingSoon: boolean;
}

export type OpportunityChange =
  | { kind: "opportunity_added"; row: OpportunityRow }
  | { kind: "opportunity_removed"; row: OpportunityRow }
  | { kind: "opportunity_apy_change"; row: OpportunityRow; from: number | null; to: number | null }
  | {
      kind: "opportunity_multiplier_change";
      row: OpportunityRow;
      from: number | null;
      to: number | null;
    }
  | { kind: "opportunity_launched"; row: OpportunityRow };

/**
 * TVL changes continuously and is not diffed. An APY change counts when it moves by at least `apyMinDelta`
 * (a fraction, so 0.005 is 50 bps), or appears or disappears.
 */
export function diffOpportunities(
  prev: readonly OpportunityRow[],
  next: readonly OpportunityRow[],
  apyMinDelta: number,
): OpportunityChange[] {
  const before = new Map(prev.map((o) => [o.key, o]));
  const after = new Map(next.map((o) => [o.key, o]));
  const changes: OpportunityChange[] = [];

  for (const row of next) {
    const old = before.get(row.key);
    if (old === undefined) {
      changes.push({ kind: "opportunity_added", row });
      continue;
    }
    const apyMoved =
      old.apy === null || row.apy === null
        ? old.apy !== row.apy
        : Math.abs(row.apy - old.apy) >= apyMinDelta;
    if (apyMoved) changes.push({ kind: "opportunity_apy_change", row, from: old.apy, to: row.apy });
    if (old.pointsMultiplier !== row.pointsMultiplier) {
      changes.push({
        kind: "opportunity_multiplier_change",
        row,
        from: old.pointsMultiplier,
        to: row.pointsMultiplier,
      });
    }
    if (old.comingSoon && !row.comingSoon) changes.push({ kind: "opportunity_launched", row });
  }
  for (const row of prev) {
    if (!after.has(row.key)) changes.push({ kind: "opportunity_removed", row });
  }
  return changes;
}

export interface CollateralAssetRow {
  asset: string;
  amountUsd: number;
}

export type CollateralChange =
  | { kind: "collateral_asset_added"; asset: string }
  | { kind: "collateral_asset_removed"; asset: string }
  | { kind: "collateral_snapshot_updated"; from: string; to: string };

export function diffCollateral(
  prev: { snapshotDate: string; assets: readonly CollateralAssetRow[] },
  next: { snapshotDate: string; assets: readonly CollateralAssetRow[] },
): CollateralChange[] {
  const before = new Set(prev.assets.map((a) => a.asset));
  const after = new Set(next.assets.map((a) => a.asset));
  const changes: CollateralChange[] = [];
  if (prev.snapshotDate !== next.snapshotDate) {
    changes.push({
      kind: "collateral_snapshot_updated",
      from: prev.snapshotDate,
      to: next.snapshotDate,
    });
  }
  for (const asset of after)
    if (!before.has(asset)) changes.push({ kind: "collateral_asset_added", asset });
  for (const asset of before)
    if (!after.has(asset)) changes.push({ kind: "collateral_asset_removed", asset });
  return changes;
}
