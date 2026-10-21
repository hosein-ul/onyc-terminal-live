import { csvRecords } from "../parse/csv.js";
import { parseOptionalNumber } from "../parse/numbers.js";

export type AssetKind = "token" | "tranche" | "principal-token";

export interface OpportunityAsset {
  symbol: string;
  kind: AssetKind;
}

export interface DefiOpportunity {
  /** Stable identity: classification | protocol | strategy | assets (the sheet has no id column). */
  key: string;
  classification: string;
  protocol: string;
  strategy: string;
  activity: string;
  assets: OpportunityAsset[];
  /** Fraction. Null when the sheet leaves it empty (liquidity-provision rows). */
  apy: number | null;
  tvlUsd: number | null;
  /** The points multiplier shown in the app ("6" = 6x). Not interpreted. */
  pointsMultiplier: number | null;
  link: string;
  isNew: boolean;
  comingSoon: boolean;
  featured: boolean;
  logoUrl: string;
}

export interface OpportunitiesSheet {
  opportunities: DefiOpportunity[];
  /** Rows with an empty classification are subtotals and are dropped; this counts them. */
  droppedSubtotalRows: number;
}

/** srONyc / jrONyc are Exponent's senior and junior tranches; PT-* are principal tokens (0x points). */
export function assetKind(symbol: string): AssetKind {
  if (/^pt-/i.test(symbol)) return "principal-token";
  if (/^(sr|jr)onyc$/i.test(symbol)) return "tranche";
  return "token";
}

const REQUIRED = [
  "classification",
  "protocol",
  "strategy",
  "activity",
  "asset1_symbol",
  "asset2_symbol",
  "asset3_symbol",
  "apy",
  "tvl",
  "reward",
  "link",
  "is_new",
  "coming_soon",
  "featured",
  "logo_url",
] as const;

function flag(value: string | undefined): boolean {
  return (value ?? "").trim().toUpperCase() === "TRUE";
}

export function parseOpportunitiesSheet(csv: string): OpportunitiesSheet {
  const { headers, records } = csvRecords(csv);
  const missing = REQUIRED.filter((name) => !headers.includes(name));
  if (missing.length > 0) {
    throw new Error(`opportunities sheet is missing columns: ${missing.join(", ")}`);
  }

  let droppedSubtotalRows = 0;
  const counts = new Map<string, number>();
  const opportunities: DefiOpportunity[] = [];

  records.forEach((row, index) => {
    const classification = (row["classification"] ?? "").trim();
    if (classification === "") {
      droppedSubtotalRows += 1;
      return;
    }
    try {
      const assets = (["asset1_symbol", "asset2_symbol", "asset3_symbol"] as const)
        .map((column) => (row[column] ?? "").trim())
        .filter((symbol) => symbol !== "")
        .map((symbol) => ({ symbol, kind: assetKind(symbol) }));
      const protocol = (row["protocol"] ?? "").trim();
      const strategy = (row["strategy"] ?? "").trim();
      const baseKey = [
        classification,
        protocol,
        strategy,
        assets.map((a) => a.symbol).join("+"),
      ].join("|");
      const seen = counts.get(baseKey) ?? 0;
      counts.set(baseKey, seen + 1);
      opportunities.push({
        key: seen === 0 ? baseKey : `${baseKey}#${seen + 1}`,
        classification,
        protocol,
        strategy,
        activity: (row["activity"] ?? "").trim(),
        assets,
        apy: parseOptionalNumber(row["apy"]),
        tvlUsd: parseOptionalNumber(row["tvl"]),
        pointsMultiplier: parseOptionalNumber(row["reward"]),
        link: (row["link"] ?? "").trim(),
        isNew: flag(row["is_new"]),
        comingSoon: flag(row["coming_soon"]),
        featured: flag(row["featured"]),
        logoUrl: (row["logo_url"] ?? "").trim(),
      });
    } catch (error) {
      throw new Error(
        `opportunities sheet row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  });

  return { opportunities, droppedSubtotalRows };
}
