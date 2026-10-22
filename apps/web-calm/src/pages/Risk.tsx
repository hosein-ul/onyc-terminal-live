import { collateralBulletSpec, reservesTreemapSpec, type ChartSpec } from "@onyc/chart-specs";
import { formatBps, formatNumber, formatPercent } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useRisk, useSolvency } from "@onyc/sdk/react";
import { Panel } from "../charts";
import { Card, ExternalLink, Notice, PageHeader, Pill } from "../ui/kit";
import { Provenance } from "../ui/Provenance";
import { Named, logoUrl } from "../ui/Badge";
import { StatusIcon, type StatusState } from "../ui/Status";

type Signal = EndpointResponse<"risk">["data"]["signals"][number];

const treemapBuild = (d: EndpointResponse<"solvency">): ChartSpec => reservesTreemapSpec(d);
const bulletBuild = (d: EndpointResponse<"solvency">): ChartSpec => collateralBulletSpec(d);

const TONE: Record<Signal["state"], StatusState> = {
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

const STATE_ORDER: Signal["state"][] = ["alert", "watch", "ok", "unavailable"];

/** Where the value sits between the watch and alert limits, as three zones on one track. */
function Gauge({ s }: { s: Signal }) {
  if (s.value === null) return <div className="gauge gauge-empty">No reading</div>;
  const { watch, alert, worse } = s.threshold;
  const pts = [s.value, watch, alert];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const pad = (max - min || Math.abs(max) || 1) * 0.35;
  let lo = min - pad;
  const hi = max + pad;
  if (min >= 0 && lo < 0) lo = 0;
  const at = (v: number): number => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const w = at(watch);
  const a = at(alert);
  const stops =
    worse === "high"
      ? `var(--good-zone) 0 ${w}%, var(--watch-zone) ${w}% ${a}%, var(--bad-zone) ${a}% 100%`
      : `var(--bad-zone) 0 ${a}%, var(--watch-zone) ${a}% ${w}%, var(--good-zone) ${w}% 100%`;
  return (
    <div className="gauge">
      <div className="gauge-track" style={{ background: `linear-gradient(90deg, ${stops})` }}>
        <span className="gauge-mark" style={{ left: `${at(s.value)}%` }} />
      </div>
      <div className="gauge-ticks">
        <span style={{ left: `${w}%` }}>{valueText({ ...s, value: watch })}</span>
        <span style={{ left: `${a}%` }}>{valueText({ ...s, value: alert })}</span>
      </div>
    </div>
  );
}

function SignalRow({ s }: { s: Signal }) {
  return (
    <li className={`sig sig-${s.state}`}>
      <div className="sig-name">
        <StatusIcon state={TONE[s.state]} />
        <div>
          <h3>{s.label}</h3>
          <p className="prov">
            {s.source}
            {s.asOf !== null && ` · ${s.asOf.slice(0, 16).replace("T", " ")} UTC`}
          </p>
        </div>
      </div>
      <div className="sig-value">
        <b>{valueText(s)}</b>
        <span className={`sig-word tone-${TONE[s.state]}`}>{WORD[s.state]}</span>
      </div>
      <Gauge s={s} />
      {s.note !== undefined && (
        <p className="sig-note">
          {s.note
            .split(/( \+ )/)
            .map((part, i) =>
              logoUrl(part, "protocol") !== null ? (
                <Named key={i} name={part} size={18} />
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
        </p>
      )}
    </li>
  );
}

function RiskLedger({ signals }: { signals: Signal[] }) {
  const count = (st: Signal["state"]): number => signals.filter((s) => s.state === st).length;
  const sorted = STATE_ORDER.flatMap((st) => signals.filter((s) => s.state === st));
  return (
    <Card as="article" className="ledger">
      <div className="ledger-summary" role="group" aria-label="Checks by state">
        {(
          [
            ["bad", "alert", "Alert"],
            ["watch", "watch", "Watch"],
            ["good", "ok", "Fine"],
            ["neutral", "unavailable", "No data"],
          ] as const
        )
          .filter(([, st]) => count(st) > 0)
          .map(([tone, st, word]) => (
            <div key={st} className={`ledger-count tone-${tone}`}>
              <StatusIcon state={tone} size={18} />
              <b>{count(st)}</b> {word}
            </div>
          ))}
        <div
          className="ledger-bar"
          aria-hidden="true"
          style={{
            gridTemplateColumns: STATE_ORDER.map((st) => `${count(st)}fr`).join(" "),
          }}
        >
          {STATE_ORDER.map((st) => (
            <i key={st} className={`bar-${st}`} />
          ))}
        </div>
      </div>
      <ul className="sigs">
        {sorted.map((s) => (
          <SignalRow key={s.id} s={s} />
        ))}
      </ul>
    </Card>
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
        title="Independent risk signals"
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
        <RiskLedger signals={r.signals} />
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
