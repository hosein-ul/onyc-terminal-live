import { csvRecords } from "../parse/csv.js";
import { parseIsoDate, parseOptionalNumber, parseOptionalPercent } from "../parse/numbers.js";

/** One row of the published NAV mirror. It lags the core API by about a day. */
export interface NavSheetRow {
  /** ISO date. */
  date: string;
  nav: number;
  aum: number | null;
  /** Fraction: "11.02%" -> 0.1102. */
  apy: number | null;
  circulatingSupply: number | null;
  /** The sheet's `changed` flag ("yes" when the row was revised). */
  changed: boolean;
}

const REQUIRED = ["nav_date", "nav", "aum", "apy", "circulating_supply", "changed"] as const;

export function parseNavSheet(csv: string): NavSheetRow[] {
  const { headers, records } = csvRecords(csv);
  const missing = REQUIRED.filter((name) => !headers.includes(name));
  if (missing.length > 0) throw new Error(`NAV sheet is missing columns: ${missing.join(", ")}`);

  return records.map((row, index): NavSheetRow => {
    try {
      const nav = parseOptionalNumber(row["nav"]);
      if (nav === null) throw new Error("empty nav");
      return {
        date: parseIsoDate(row["nav_date"] ?? ""),
        nav,
        aum: parseOptionalNumber(row["aum"]),
        apy: parseOptionalPercent(row["apy"]),
        circulatingSupply: parseOptionalNumber(row["circulating_supply"]),
        changed: (row["changed"] ?? "").trim().toLowerCase() === "yes",
      };
    } catch (error) {
      throw new Error(
        `NAV sheet row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  });
}
