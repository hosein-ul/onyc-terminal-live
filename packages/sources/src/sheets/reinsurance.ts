import { csvRecords } from "../parse/csv.js";
import { parseMonthYear, parsePercentString, parseSpacedNumber } from "../parse/numbers.js";

export interface ReinsuranceLayer {
  /** As in the sheet: "9000002". */
  layerId: string;
  /** As the official UI shows it ("0002"). Derived from the sheet's 9000000 offset; see DATA_SOURCES §7. */
  uiLayerNumber: string;
  /** "Bound", "Offered", ... exactly as written. */
  status: string;
  /** First day of the inception month, ISO. The sheet is month-granular. */
  inception: string;
  inceptionLabel: string;
  /** First day of the renewal month, ISO. */
  renewal: string;
  renewalLabel: string;
  perils: string;
  structure: string;
  capitalDeployed: number;
  netPremium: number;
  expectedLoss: number;
  /** Fraction: 4.60% -> 0.046. */
  expectedYield: number;
}

const REQUIRED = [
  "Layer Number",
  "UW Status",
  "Inception",
  "Renewal",
  "Major Perils",
  "Structure",
  "OnRe Capital Deployed",
  "Net Premium to OnRe",
  "OnRe Expected Loss",
  "On Re Expected Annualised Yield",
] as const;

const LAYER_ID_OFFSET = 9_000_000;

/** 9000002 -> "0002". Not contiguous: the sheet has no 9000029 or 9000030. */
export function uiLayerNumber(layerId: string): string {
  const n = Number(layerId);
  if (!Number.isInteger(n) || n < LAYER_ID_OFFSET) return layerId;
  return String(n - LAYER_ID_OFFSET).padStart(4, "0");
}

export function parseReinsuranceSheet(csv: string): ReinsuranceLayer[] {
  const { headers, records } = csvRecords(csv);
  const missing = REQUIRED.filter((name) => !headers.includes(name));
  if (missing.length > 0) {
    throw new Error(`reinsurance sheet is missing columns: ${missing.join(", ")}`);
  }

  const layers = records.map((row, index): ReinsuranceLayer => {
    const cell = (name: (typeof REQUIRED)[number]): string => (row[name] ?? "").trim();
    try {
      const layerId = cell("Layer Number");
      if (layerId === "") throw new Error("empty layer number");
      return {
        layerId,
        uiLayerNumber: uiLayerNumber(layerId),
        status: cell("UW Status"),
        inception: parseMonthYear(cell("Inception")),
        inceptionLabel: cell("Inception"),
        renewal: parseMonthYear(cell("Renewal")),
        renewalLabel: cell("Renewal"),
        perils: cell("Major Perils"),
        structure: cell("Structure"),
        capitalDeployed: parseSpacedNumber(cell("OnRe Capital Deployed")),
        netPremium: parseSpacedNumber(cell("Net Premium to OnRe")),
        expectedLoss: parseSpacedNumber(cell("OnRe Expected Loss")),
        expectedYield: parsePercentString(cell("On Re Expected Annualised Yield")),
      };
    } catch (error) {
      throw new Error(
        `reinsurance sheet row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  });

  const seen = new Set<string>();
  for (const layer of layers) {
    if (seen.has(layer.layerId)) throw new Error(`duplicate layer number ${layer.layerId}`);
    seen.add(layer.layerId);
  }
  return layers;
}
