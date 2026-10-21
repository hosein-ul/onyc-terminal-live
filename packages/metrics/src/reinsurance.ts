export interface Layer {
  layerId: string;
  status: string;
  /** ISO date, first of the month. */
  inception: string;
  /** ISO date, first of the month. */
  renewal: string;
  perils: string;
  structure: string;
  capital: number;
  premium: number;
  expectedLoss: number;
  /** Fraction. */
  expectedYield: number;
}

/** layer.premiumToEL = netPremium / expectedLoss */
export function premiumToEL(layer: Pick<Layer, "premium" | "expectedLoss">): number | null {
  return layer.expectedLoss > 0 ? layer.premium / layer.expectedLoss : null;
}

/** layer.rateOnCapital = netPremium / capitalDeployed */
export function rateOnCapital(layer: Pick<Layer, "premium" | "capital">): number | null {
  return layer.capital > 0 ? layer.premium / layer.capital : null;
}

/** Expected loss as a fraction of capital: the x axis of the risk/return scatter. */
export function expectedLossRatio(layer: Pick<Layer, "expectedLoss" | "capital">): number | null {
  return layer.capital > 0 ? layer.expectedLoss / layer.capital : null;
}

/** bookExpectedYield = sum(capital x expectedYield) / sum(capital) */
export function bookExpectedYield(
  layers: readonly Pick<Layer, "capital" | "expectedYield">[],
): number | null {
  const capital = layers.reduce((s, l) => s + l.capital, 0);
  if (capital === 0) return null;
  return layers.reduce((s, l) => s + l.capital * l.expectedYield, 0) / capital;
}

/** Whole months from `asOf` to the renewal month (negative once the renewal month has passed). */
export function monthsToRenewal(renewalIso: string, asOfIso: string): number {
  const r = new Date(`${renewalIso}T00:00:00Z`);
  const a = new Date(`${asOfIso}T00:00:00Z`);
  return (r.getUTCFullYear() - a.getUTCFullYear()) * 12 + (r.getUTCMonth() - a.getUTCMonth());
}

/**
 * A layer is "past renewal" when it is still Bound but its renewal month is before the current month.
 * The renewal month itself is not yet past. See DATA_SOURCES conflict 8.
 */
export function isPastRenewal(layer: Pick<Layer, "status" | "renewal">, asOfIso: string): boolean {
  return layer.status.toLowerCase() === "bound" && monthsToRenewal(layer.renewal, asOfIso) < 0;
}

export function pastRenewal(
  layers: readonly Layer[],
  asOfIso: string,
): { count: number; capital: number; layerIds: string[] } {
  const hits = layers.filter((l) => isPastRenewal(l, asOfIso));
  return {
    count: hits.length,
    capital: hits.reduce((s, l) => s + l.capital, 0),
    layerIds: hits.map((l) => l.layerId),
  };
}

export type PerilFamily =
  | "US"
  | "Japan"
  | "Australia"
  | "North America"
  | "Worldwide"
  | "Multi-region"
  | "Contingency"
  | "Other";

/**
 * Explicit mapping from the sheet's free-text perils to a region family. First match wins, so the more
 * specific rules come first ("Worldwide ex US" must not become US). Unmapped text is "Other" and a test asserts
 * every layer in the saved fixture maps to something else.
 */
export const PERIL_FAMILY_RULES: readonly { match: RegExp; family: PerilFamily }[] = [
  { match: /^contingency/i, family: "Contingency" },
  { match: /^worldwide/i, family: "Worldwide" },
  { match: /^multi region/i, family: "Multi-region" },
  { match: /^north america/i, family: "North America" },
  { match: /^japan/i, family: "Japan" },
  { match: /^australia/i, family: "Australia" },
  { match: /^united states/i, family: "US" },
];

export function perilFamily(perils: string): PerilFamily {
  return PERIL_FAMILY_RULES.find((rule) => rule.match.test(perils.trim()))?.family ?? "Other";
}

export type PerilTag =
  "wind" | "earthquake" | "convective storm" | "all natural perils" | "contingency";

/** Peril tags present in the text. "All Natural Perils" is its own tag; "ex Earthquake" does not add earthquake. */
export function perilTags(perils: string): PerilTag[] {
  const text = perils.toLowerCase();
  const tags: PerilTag[] = [];
  if (text.includes("contingency")) tags.push("contingency");
  if (text.includes("all natural perils")) tags.push("all natural perils");
  if (/windstorm|hurricane/.test(text)) tags.push("wind");
  if (/earthquake/.test(text) && !/ex earthquake/.test(text)) tags.push("earthquake");
  if (text.includes("severe convective storm")) tags.push("convective storm");
  return tags;
}

export type StructureFamily = "ILW" | "Per occurrence" | "Aggregate" | "Quota share" | "Other";

export function structureFamily(structure: string): StructureFamily {
  const s = structure.trim().toLowerCase();
  if (s === "ilw") return "ILW";
  if (/event per occ$/.test(s)) return "Per occurrence";
  if (/event aggregate$/.test(s)) return "Aggregate";
  if (s === "quota share") return "Quota share";
  return "Other";
}

export interface Share {
  key: string;
  capital: number;
  share: number;
  layers: number;
}

function groupCapital(layers: readonly Layer[], keyOf: (l: Layer) => string): Share[] {
  const total = layers.reduce((s, l) => s + l.capital, 0);
  const map = new Map<string, { capital: number; layers: number }>();
  for (const l of layers) {
    const k = keyOf(l);
    const cur = map.get(k) ?? { capital: 0, layers: 0 };
    map.set(k, { capital: cur.capital + l.capital, layers: cur.layers + 1 });
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      capital: v.capital,
      layers: v.layers,
      share: total === 0 ? 0 : v.capital / total,
    }))
    .sort((a, b) => b.capital - a.capital);
}

export const capitalByPerilFamily = (layers: readonly Layer[]): Share[] =>
  groupCapital(layers, (l) => perilFamily(l.perils));
export const capitalByStructure = (layers: readonly Layer[]): Share[] =>
  groupCapital(layers, (l) => structureFamily(l.structure));

/** Capital rolling off per renewal month (key is "YYYY-MM"), ascending by month. */
export function renewalCalendar(layers: readonly Layer[]): Share[] {
  return groupCapital(layers, (l) => l.renewal.slice(0, 7)).sort((a, b) =>
    a.key < b.key ? -1 : 1,
  );
}

export interface BookTotals {
  layers: number;
  capital: number;
  premium: number;
  expectedLoss: number;
  expectedYield: number | null;
  premiumToEL: number | null;
  /** Capital bound over AUM, when AUM is given. */
  capitalOverAum: number | null;
}

export function bookTotals(layers: readonly Layer[], aumUsd: number | null): BookTotals {
  const capital = layers.reduce((s, l) => s + l.capital, 0);
  const premium = layers.reduce((s, l) => s + l.premium, 0);
  const expectedLoss = layers.reduce((s, l) => s + l.expectedLoss, 0);
  return {
    layers: layers.length,
    capital,
    premium,
    expectedLoss,
    expectedYield: bookExpectedYield(layers),
    premiumToEL: expectedLoss > 0 ? premium / expectedLoss : null,
    capitalOverAum: aumUsd !== null && aumUsd > 0 ? capital / aumUsd : null,
  };
}
