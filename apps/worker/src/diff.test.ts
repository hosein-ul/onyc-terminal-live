import { describe, expect, it } from "vitest";
import {
  diffCollateral,
  diffLayers,
  diffOpportunities,
  type LayerRow,
  type OpportunityRow,
} from "./diff.js";

const layer = (overrides: Partial<LayerRow> = {}): LayerRow => ({
  layerId: "9000002",
  status: "Bound",
  inception: "2025-06-01",
  renewal: "2026-07-01",
  perils: "Contingency",
  structure: "1st Event Per Occ",
  capital: 5864302,
  premium: 747698,
  expectedLoss: 308052,
  expectedYield: 0.0994,
  ...overrides,
});

describe("diffLayers", () => {
  it("reports nothing when nothing changed", () => {
    expect(diffLayers([layer()], [layer()])).toEqual([]);
  });

  it("detects a new layer", () => {
    const added = layer({ layerId: "9000032" });
    expect(diffLayers([layer()], [layer(), added])).toEqual([{ kind: "layer_new", layer: added }]);
  });

  it("detects a removed layer", () => {
    expect(diffLayers([layer()], [])).toEqual([{ kind: "layer_removed", layer: layer() }]);
  });

  it("detects a status change", () => {
    expect(diffLayers([layer()], [layer({ status: "Expired" })])).toEqual([
      { kind: "layer_status_change", layerId: "9000002", from: "Bound", to: "Expired" },
    ]);
  });

  it("detects a capital change", () => {
    expect(diffLayers([layer()], [layer({ capital: 6000000 })])).toEqual([
      { kind: "layer_capital_change", layerId: "9000002", from: 5864302, to: 6000000 },
    ]);
  });

  it("lists the changed term fields", () => {
    const changes = diffLayers([layer()], [layer({ renewal: "2027-07-01", expectedYield: 0.1 })]);
    expect(changes).toEqual([
      { kind: "layer_terms_change", layerId: "9000002", fields: ["renewal", "expectedYield"] },
    ]);
  });
});

const opp = (overrides: Partial<OpportunityRow> = {}): OpportunityRow => ({
  key: "Looping|Kamino|Multiply Markets|ONyc+USDG",
  classification: "Looping",
  protocol: "Kamino",
  strategy: "Multiply Markets",
  apy: 0.208,
  pointsMultiplier: 6,
  comingSoon: false,
  ...overrides,
});

describe("diffOpportunities", () => {
  it("ignores APY moves under the threshold", () => {
    expect(diffOpportunities([opp()], [opp({ apy: 0.2101 })], 0.005)).toEqual([]);
  });

  it("reports APY moves at or over the threshold", () => {
    const next = opp({ apy: 0.2181 });
    expect(diffOpportunities([opp()], [next], 0.005)).toEqual([
      { kind: "opportunity_apy_change", row: next, from: 0.208, to: 0.2181 },
    ]);
  });

  it("reports an APY that appears or disappears", () => {
    const gone = opp({ apy: null });
    expect(diffOpportunities([opp()], [gone], 0.005)).toEqual([
      { kind: "opportunity_apy_change", row: gone, from: 0.208, to: null },
    ]);
  });

  it("reports added, removed, multiplier changes and launches", () => {
    const other = opp({ key: "Yield Trading|RateX|Lending Pool|ONyc" });
    expect(diffOpportunities([opp()], [opp(), other], 0.005)).toEqual([
      { kind: "opportunity_added", row: other },
    ]);
    expect(diffOpportunities([opp(), other], [opp()], 0.005)).toEqual([
      { kind: "opportunity_removed", row: other },
    ]);
    const boosted = opp({ pointsMultiplier: 8 });
    expect(diffOpportunities([opp()], [boosted], 0.005)).toEqual([
      { kind: "opportunity_multiplier_change", row: boosted, from: 6, to: 8 },
    ]);
    const live = opp({ comingSoon: false });
    expect(diffOpportunities([opp({ comingSoon: true })], [live], 0.005)).toEqual([
      { kind: "opportunity_launched", row: live },
    ]);
  });
});

describe("diffCollateral", () => {
  const base = { snapshotDate: "2026-10-20", assets: [{ asset: "USDG", amountUsd: 1 }] };

  it("detects a refreshed snapshot date and asset changes", () => {
    const next = { snapshotDate: "2026-10-21", assets: [{ asset: "USDC", amountUsd: 2 }] };
    expect(diffCollateral(base, next)).toEqual([
      { kind: "collateral_snapshot_updated", from: "2026-10-20", to: "2026-10-21" },
      { kind: "collateral_asset_added", asset: "USDC" },
      { kind: "collateral_asset_removed", asset: "USDG" },
    ]);
  });

  it("ignores amount changes", () => {
    expect(diffCollateral(base, { ...base, assets: [{ asset: "USDG", amountUsd: 99 }] })).toEqual(
      [],
    );
  });
});
