import { collateralBulletSpec, reservesTreemapSpec, type ChartSpec } from "@onyc/chart-specs";
import { formatBps, formatNumber, formatPercent } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useRisk, useSolvency } from "@onyc/sdk/react";
import { Panel } from "../charts";
import { Card, ExternalLink, Notice, PageHeader, Pill, type Tone } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

type Signal = EndpointResponse<"risk">["data"]["signals"][number];

const treemapBuild = (d: EndpointResponse<"solvency">): ChartSpec => reservesTreemapSpec(d);
const bulletBuild = (d: EndpointResponse<"solvency">): ChartSpec => collateralBulletSpec(d);

const TONE: Record<Signal["state"], Tone> = {
  ok: "good",
  watch: "watch",
  alert: "bad",
  unavailable: "neutral",
};
const WORD: Record<Signal["state"], string> = {
  ok: "Fine",
  watch: "Watch",
  alert: "Alert",
  unavailable: "No data",
};

function valueText(s: Signal): string {
  if (s.value === null) return "—";
  switch (s.unit) {
    case "bps":
      return formatBps(s.value);
    case "fraction":
      return formatPercent(s.value, 1);
    case "ratio":
      return formatNumber(s.value, 3);
    case "hours":
      return `${formatNumber(s.value, 0)} h`;
    case "count":
      return formatNumber(s.value, 0);
  }
}

function thresholdText(s: Signal): string {
  const fmt = (v: number): string => valueText({ ...s, value: v });
  const word = s.threshold.worse === "high" ? "above" : "below";
  return `Watch ${word} ${fmt(s.threshold.watch)}, alert ${word} ${fmt(s.threshold.alert)}`;
}

function SignalCard({ s }: { s: Signal }) {
  return (
    <article className={`signal signal-${s.state}`}>
      <header>
        <h3>{s.label}</h3>
        <Pill tone={TONE[s.state]}>{WORD[s.state]}</Pill>
      </header>
      <div className="signal-value">{valueText(s)}</div>
      <p className="tone-neutral small">{thresholdText(s)}</p>
      {s.note !== undefined && <p className="small">{s.note}</p>}
      <p className="prov">
        {s.source}
        {s.asOf !== null && ` · as of ${s.asOf.slice(0, 16).replace("T", " ")} UTC`}
      </p>
    </article>
  );
}

export function RiskPage() {
  const riskQ = useRisk();
  const solvQ = useSolvency();
  const r = riskQ.data?.data;
  const alerts = r?.signals.filter((s) => s.state === "alert").length ?? 0;
  const watches = r?.signals.filter((s) => s.state === "watch").length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Risk & Transparency"
        title={
          r === undefined
            ? "Independent risk signals"
            : alerts + watches === 0
              ? "All independent signals read fine"
              : `${alerts} alert${alerts === 1 ? "" : "s"} and ${watches} to watch among ${r.signals.length} signals`
        }
        right={
          r !== undefined ? (
            <Pill tone={alerts > 0 ? "bad" : watches > 0 ? "watch" : "good"}>
              {r.signals.length} checks
            </Pill>
          ) : undefined
        }
      />

      <Notice tone="info">
        {r?.note ??
          "Each signal is computed on its own from public data. There is deliberately no single risk score."}
      </Notice>

      {r === undefined ? (
        <Card>
          <p className="tone-neutral">Loading signals…</p>
        </Card>
      ) : (
        <div className="signals">
          {r.signals.map((s) => (
            <SignalCard key={s.id} s={s} />
          ))}
        </div>
      )}
      {riskQ.data !== undefined && <Provenance meta={riskQ.data.meta["signals"]} />}

      <div className="grid">
        <Panel q={solvQ} build={bulletBuild} title="Collateralisation" span={5} height={100} />
        <Panel q={solvQ} build={treemapBuild} title="Reserves by venue" span={7} height={320} />
      </div>

      {solvQ.data !== undefined && solvQ.data.data.merkleRoot !== null && (
        <Card title="Proof of reserves" subtitle="Published by Accountable">
          <div className="rows">
            <div>
              <span>Merkle root</span>
              <b className="mono wrap">{solvQ.data.data.merkleRoot}</b>
            </div>
            <div>
              <span>Reserves</span>
              <b>{formatNumber(solvQ.data.data.reservesUsd, 0)} USD</b>
            </div>
            <div>
              <span>Token supply</span>
              <b>{formatNumber(solvQ.data.data.supplyUsd, 0)} USD</b>
            </div>
          </div>
        </Card>
      )}

      {r !== undefined && r.links.length > 0 && (
        <Card title="Read the sources" subtitle="Reports, registers and the program itself">
          <ul className="links">
            {r.links.map((l) => (
              <li key={l.url}>
                <ExternalLink href={l.url}>{l.label}</ExternalLink>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
