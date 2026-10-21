import { describe, expect, it } from "vitest";
import { fixtureText } from "../fixture.testutil.js";
import { parseCollateralSheet } from "./collateral.js";
import { parseNavSheet } from "./nav.js";
import { assetKind, parseOpportunitiesSheet } from "./opportunities.js";
import { parseReinsuranceSheet, uiLayerNumber } from "./reinsurance.js";

describe("reinsurance sheet (2026-10-21 fixture)", () => {
  const layers = parseReinsuranceSheet(fixtureText("sheet_reinsurance.csv"));

  it("has 30 layers and skips ids 9000029 and 9000030", () => {
    expect(layers).toHaveLength(30);
    const ids = layers.map((l) => l.layerId);
    expect(ids).toContain("9000028");
    expect(ids).toContain("9000031");
    expect(ids).not.toContain("9000029");
    expect(ids).not.toContain("9000030");
  });

  it("reads space-separated thousands and percentages", () => {
    const first = layers[0];
    expect(first).toMatchObject({
      layerId: "9000000",
      status: "Bound",
      inception: "2025-11-01",
      renewal: "2026-11-01",
      structure: "ILW",
      capitalDeployed: 1101563,
      netPremium: 148438,
      expectedLoss: 129849,
      expectedYield: 0.046,
    });
    const quotaShare = layers.find((l) => l.layerId === "9000024");
    expect(quotaShare?.capitalDeployed).toBe(10701295);
  });

  it("keeps commas inside quoted peril names", () => {
    const layer = layers.find((l) => l.layerId === "9000026");
    expect(layer?.perils).toBe(
      "United States Named Windstorm, Earthquake and Severe Convective Storm",
    );
  });

  it("matches the Transparency page: bound capital is $152,722,725", () => {
    const bound = layers.filter((l) => l.status === "Bound");
    expect(bound.reduce((sum, l) => sum + l.capitalDeployed, 0)).toBe(152722725);
  });

  it("maps sheet ids to the official UI numbering", () => {
    expect(uiLayerNumber("9000002")).toBe("0002");
    expect(uiLayerNumber("9000031")).toBe("0031");
    expect(layers.find((l) => l.layerId === "9000002")).toMatchObject({
      uiLayerNumber: "0002",
      perils: "Contingency",
      renewal: "2026-07-01",
    });
  });

  it("fails loudly when a column disappears", () => {
    const broken = fixtureText("sheet_reinsurance.csv").replace("Structure", "Structur");
    expect(() => parseReinsuranceSheet(broken)).toThrow(/missing columns: Structure/);
  });

  it("fails loudly on an unparseable number", () => {
    const broken = fixtureText("sheet_reinsurance.csv").replace("1 101 563", "lots");
    expect(() => parseReinsuranceSheet(broken)).toThrow(/row 2/);
  });
});

describe("opportunities sheet (2026-10-21 fixture)", () => {
  const sheet = parseOpportunitiesSheet(fixtureText("sheet_opportunities.csv"));

  it("drops the subtotal rows and says how many", () => {
    expect(sheet.droppedSubtotalRows).toBe(2);
    expect(sheet.opportunities).toHaveLength(28);
    expect(sheet.opportunities.every((o) => o.classification !== "")).toBe(true);
  });

  it("gives every row a unique key", () => {
    const keys = new Set(sheet.opportunities.map((o) => o.key));
    expect(keys.size).toBe(sheet.opportunities.length);
  });

  it("parses a looping row", () => {
    const row = sheet.opportunities[0];
    expect(row).toMatchObject({
      key: "Looping|Kamino|Multiply Markets|ONyc+USDG",
      protocol: "Kamino",
      apy: 0.2080042056,
      tvlUsd: 25140871.71,
      pointsMultiplier: 6,
      isNew: false,
      featured: false,
    });
  });

  it("keeps an empty APY as null rather than zero", () => {
    const lp = sheet.opportunities.find(
      (o) => o.strategy === "Raydium Pool" && o.protocol === "Kamino",
    );
    expect(lp?.apy).toBeNull();
    expect(lp?.tvlUsd).toBe(3390000);
  });

  it("keeps tranche and principal-token assets as their own kinds", () => {
    const tranches = sheet.opportunities.filter((o) => o.classification === "Risk Tranching");
    expect(tranches.map((o) => o.assets[0]?.symbol).sort()).toEqual(["jrONyc", "srONyc"]);
    expect(tranches.every((o) => o.assets[0]?.kind === "tranche")).toBe(true);
    const pt = sheet.opportunities.find((o) =>
      o.assets.some((a) => a.symbol === "PT-ONyc-10SEP26"),
    );
    expect(pt?.assets[0]?.kind).toBe("principal-token");
    expect(pt?.pointsMultiplier).toBe(0);
    expect(assetKind("ONyc")).toBe("token");
  });

  it("flags new and featured rows", () => {
    expect(sheet.opportunities.some((o) => o.isNew)).toBe(true);
    expect(sheet.opportunities.some((o) => o.featured)).toBe(true);
  });
});

describe("NAV mirror sheet (2026-10-21 fixture)", () => {
  const rows = parseNavSheet(fixtureText("sheet_nav.csv"));

  it("has 510 rows, newest first, lagging the API by a day", () => {
    expect(rows).toHaveLength(510);
    expect(rows[0]).toMatchObject({
      date: "2026-10-20",
      nav: 1.157495524,
      aum: 282467518,
      apy: 0.1102,
      circulatingSupply: 244033356.7,
      changed: false,
    });
  });

  it("keeps blanks as null on the earliest rows", () => {
    const last = rows.at(-1);
    expect(last).toMatchObject({ date: "2025-05-28", nav: 1.008972645, aum: null, changed: true });
    expect(last?.circulatingSupply).toBeNull();
  });
});

describe("collateral sheet (2026-10-21 fixture)", () => {
  const sheet = parseCollateralSheet(fixtureText("sheet_collateral.csv"));

  it("reads the snapshot date from the header row as DD/MM/YYYY", () => {
    expect(sheet.snapshotDate).toBe("2026-10-20");
    expect(sheet.metadata["Statement date"]).toBe("20/10/2026");
  });

  it("parses 13 assets whose amounts add up to the sheet's Total row", () => {
    expect(sheet.assets).toHaveLength(13);
    const sum = sheet.assets.reduce((s, a) => s + a.amountUsd, 0);
    expect(sum).toBeCloseTo(289827019.67, 2);
    expect(sheet.totalUsd).toBe(289827019.67);
  });

  it("keeps the AUM row separate: it differs from Total", () => {
    expect(sheet.aumUsd).toBe(283623613.83);
    expect(sheet.aumUsd).not.toBe(sheet.totalUsd);
  });

  it("converts percent units to fractions and reads the liquidity-layer flag", () => {
    const tbills = sheet.assets[0];
    expect(tbills).toMatchObject({
      asset: "Short-Term US T-Bills",
      apy: 0.03656,
      liquidityLayer: false,
    });
    expect(tbills?.allocation).toBeCloseTo(0.5568126182, 9);
    expect(tbills?.proofs).toEqual(["T-Bills Collateral"]);
    expect(sheet.assets.filter((a) => a.liquidityLayer).map((a) => a.asset)).toEqual(["USDG"]);
  });

  it("fails loudly when the snapshot date is missing", () => {
    const broken = fixtureText("sheet_collateral.csv").replace(
      "Snapshot date,20/10/2026",
      "Snapshot date,",
    );
    expect(() => parseCollateralSheet(broken)).toThrow(/snapshot date/);
  });
});
