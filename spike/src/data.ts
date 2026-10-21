export interface NavData {
  series: { date: string; nav: number }[];
  events: { date: string; ppm: number; reason: string }[];
  fetchedAt: string | null;
  source: string;
}
export interface CapitalData {
  keys: string[];
  rows: ({ date: string } & Record<string, number | string>)[];
  fetchedAt: string | null;
  source: string;
}

interface Meta { source: string; fetchedAt: string | null }

export async function loadNav(): Promise<NavData> {
  const j = (await (await fetch("/v1/nav?range=all")).json()) as {
    data: { series: { date: string; nav: number }[]; events: NavData["events"] };
    meta: Record<string, Meta>;
  };
  const m = j.meta["series"];
  return { series: j.data.series, events: j.data.events, fetchedAt: m?.fetchedAt ?? null, source: m?.source ?? "" };
}

export async function loadCapital(): Promise<CapitalData> {
  const j = (await (await fetch("/v1/capital/distribution")).json()) as {
    data: {
      distribution: { protocol: string; capitalUsd: number }[];
      history: { date: string; protocol: string; aumUsd: number }[];
    };
    meta: Record<string, Meta>;
  };
  const keys = [...j.data.distribution].sort((a, b) => b.capitalUsd - a.capitalUsd).map((d) => d.protocol);
  const byDate = new Map<string, { date: string } & Record<string, number | string>>();
  for (const h of j.data.history) {
    const row = byDate.get(h.date) ?? { date: h.date };
    row[h.protocol] = h.aumUsd;
    byDate.set(h.date, row);
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of rows) for (const k of keys) r[k] ??= 0;
  const m = Object.values(j.meta)[0];
  return { keys, rows, fetchedAt: m?.fetchedAt ?? null, source: m?.source ?? "" };
}
