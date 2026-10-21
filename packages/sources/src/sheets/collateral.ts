import { parseCsv } from "../parse/csv.js";
import { parseDmyDate, parseOptionalNumber, percentToFraction } from "../parse/numbers.js";

export interface CollateralAsset {
  asset: string;
  amountUsd: number;
  /** Fraction of the sheet total: 55.68 -> 0.5568. */
  allocation: number | null;
  /** Fraction: the sheet's 3.656 means 3.656% -> 0.03656. */
  apy: number | null;
  liquidityLayer: boolean;
  /** The "Proof of Assets" cells (up to three), de-duplicated. */
  proofs: string[];
}

export interface CollateralSheet {
  /** ISO date of the sheet's `Snapshot date` cell (written DD/MM/YYYY in the sheet). */
  snapshotDate: string;
  /** Other label/value pairs from the side columns ("On-chain refreshed", "Statement date", ...). */
  metadata: Record<string, string>;
  assets: CollateralAsset[];
  /** The sheet's own "Total" row. */
  totalUsd: number | null;
  /** The sheet's own "AUM" row. It differs from Total; both are kept. */
  aumUsd: number | null;
}

function stripQuotes(text: string): string {
  return text
    .trim()
    .replace(/^"+|"+$/g, "")
    .trim();
}

function pct(value: number | null): number | null {
  return value === null ? null : percentToFraction(value);
}

export function parseCollateralSheet(csv: string): CollateralSheet {
  const rows = parseCsv(csv);
  const header = rows[0];
  if (header === undefined) throw new Error("collateral sheet is empty");
  const col = (name: string): number => header.findIndex((h) => h.trim() === name);

  const columns = {
    asset: col("Asset"),
    amount: col("Amount (USD)"),
    allocation: col("Allocation"),
    apy: col("APY"),
    liquidity: col("Liquidity Layer"),
    proof: col("Proof of Assets"),
    snapshot: col("Snapshot date"),
  };
  for (const [name, index] of Object.entries(columns)) {
    if (index === -1) throw new Error(`collateral sheet is missing the "${name}" column`);
  }

  const metadata: Record<string, string> = {};
  const assets: CollateralAsset[] = [];
  let totalUsd: number | null = null;
  let aumUsd: number | null = null;

  const snapshotRaw = (header[columns.snapshot + 1] ?? "").trim();
  if (snapshotRaw === "") throw new Error("collateral sheet has no snapshot date value");
  const snapshotDate = parseDmyDate(snapshotRaw);

  rows.slice(1).forEach((cells, index) => {
    const label = (cells[columns.snapshot] ?? "").trim();
    if (label !== "") metadata[label] = (cells[columns.snapshot + 1] ?? "").trim();

    const name = (cells[columns.asset] ?? "").trim();
    if (name === "") return;
    try {
      const amount = parseOptionalNumber(cells[columns.amount]);
      if (name === "Total") {
        totalUsd = amount;
        return;
      }
      if (name === "AUM") {
        aumUsd = amount;
        return;
      }
      if (amount === null) throw new Error(`empty amount for ${name}`);
      const proofs = [
        ...new Set(
          [columns.proof, columns.proof + 1, columns.proof + 2].map((i) =>
            stripQuotes(cells[i] ?? ""),
          ),
        ),
      ].filter((proof) => proof !== "");
      assets.push({
        asset: name,
        amountUsd: amount,
        allocation: pct(parseOptionalNumber(cells[columns.allocation])),
        apy: pct(parseOptionalNumber(cells[columns.apy])),
        liquidityLayer: (cells[columns.liquidity] ?? "").trim().toUpperCase() === "Y",
        proofs,
      });
    } catch (error) {
      throw new Error(
        `collateral sheet row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  });

  return { snapshotDate, metadata, assets, totalUsd, aumUsd };
}
