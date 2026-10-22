import {
  layersBubbleSpec,
  layersGanttSpec,
  perilBarsSpec,
  renewalBarsSpec,
  structureBarsSpec,
  type ChartSpec,
} from "@onyc/chart-specs";
import { formatDate, formatNumber, formatPercent, formatUsdCompact } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useReinsuranceLayers, useReinsuranceSummary } from "@onyc/sdk/react";
import { Panel } from "../charts";
import { DataTable, type Column } from "../ui/DataTable";
import { Card, Notice, PageHeader, Pill, Stat } from "../ui/kit";
import { ExposureMap } from "../ui/ExposureMap";
import { PerilIcons } from "../ui/Peril";
import { Provenance } from "../ui/Provenance";

type Layer = EndpointResponse<"reinsuranceLayers">["data"]["layers"][number];

const ganttBuild = (d: EndpointResponse<"reinsuranceLayers">): ChartSpec => layersGanttSpec(d);
const bubbleBuild = (d: EndpointResponse<"reinsuranceLayers">): ChartSpec => layersBubbleSpec(d);
const perilBuild = (d: EndpointResponse<"reinsuranceSummary">): ChartSpec => perilBarsSpec(d);
const structureBuild = (d: EndpointResponse<"reinsuranceSummary">): ChartSpec =>
  structureBarsSpec(d);
const renewalBuild = (d: EndpointResponse<"reinsuranceSummary">): ChartSpec => renewalBarsSpec(d);

const statusTone = (s: string): "good" | "accent" | "neutral" | "watch" =>
  s === "Bound"
    ? "good"
    : s === "Offered"
      ? "accent"
      : s.toLowerCase().includes("expire")
        ? "watch"
        : "neutral";

const columns: Column<Layer>[] = [
  {
    key: "no",
    header: "Layer",
    sort: (l) => l.uiLayerNumber,
    cell: (l) => <strong>{l.uiLayerNumber}</strong>,
  },
  {
    key: "peril",
    header: "Perils",
    sort: (l) => l.perilFamily,
    cell: (l) => (
      <span className="peril-cell" title={l.perils}>
        <PerilIcons text={l.perils} />
        {l.perilFamily}
      </span>
    ),
  },
  {
    key: "structure",
    header: "Structure",
    wide: true,
    sort: (l) => l.structureFamily,
    cell: (l) => l.structureFamily,
  },
  {
    key: "status",
    header: "Status",
    sort: (l) => l.status,
    cell: (l) => <Pill tone={statusTone(l.status)}>{l.status}</Pill>,
  },
  {
    key: "incep",
    header: "Inception",
    wide: true,
    sort: (l) => l.inception,
    cell: (l) => formatDate(l.inception),
  },
  {
    key: "renew",
    header: "Renewal",
    sort: (l) => l.renewal,
    cell: (l) =>
      l.pastRenewal ? (
        <span className="tone-watch">{formatDate(l.renewal)} · past</span>
      ) : (
        formatDate(l.renewal)
      ),
  },
  {
    key: "capital",
    header: "Capital",
    align: "right",
    sort: (l) => l.capital,
    cell: (l) => formatUsdCompact(l.capital, 2),
  },
  {
    key: "premium",
    header: "Net premium",
    align: "right",
    wide: true,
    sort: (l) => l.premium,
    cell: (l) => formatUsdCompact(l.premium, 2),
  },
  {
    key: "el",
    header: "Expected loss",
    align: "right",
    wide: true,
    sort: (l) => l.expectedLoss,
    cell: (l) => formatUsdCompact(l.expectedLoss, 2),
  },
  {
    key: "yield",
    header: "Exp. yield",
    align: "right",
    sort: (l) => l.expectedYield,
    cell: (l) => formatPercent(l.expectedYield, 1),
  },
  {
    key: "pel",
    header: "Premium / EL",
    align: "right",
    wide: true,
    sort: (l) => l.premiumToEL,
    cell: (l) => (l.premiumToEL === null ? "—" : `${formatNumber(l.premiumToEL, 2)}×`),
  },
  {
    key: "rate",
    header: "Rate on capital",
    align: "right",
    wide: true,
    sort: (l) => l.rateOnCapital,
    cell: (l) => formatPercent(l.rateOnCapital, 1),
  },
  {
    key: "months",
    header: "Months left",
    align: "right",
    wide: true,
    sort: (l) => l.monthsToRenewal,
    cell: (l) => formatNumber(l.monthsToRenewal, 1),
  },
];

export function ReinsurancePage() {
  const layersQ = useReinsuranceLayers();
  const summaryQ = useReinsuranceSummary();
  const layers = layersQ.data?.data.layers;
  const s = summaryQ.data?.data;

  const topPeril = s?.byPeril.reduce((a, b) => (b.capital > a.capital ? b : a));

  return (
    <>
      <PageHeader
        eyebrow="Reinsurance Book"
        title={
          s === undefined
            ? "What the reinsurance book holds"
            : `${s.totals.layers} layers hold ${formatUsdCompact(s.totals.capital)} of bound capital`
        }
        right={
          topPeril !== undefined && s !== undefined ? (
            <Pill tone="accent">
              {topPeril.key}: {formatPercent(topPeril.capital / s.totals.capital, 0)} of the book
            </Pill>
          ) : undefined
        }
      />

      <Card title="Book totals" subtitle="Sums across every layer in OnRe's reinsurance sheet">
        {s === undefined ? (
          <p className="tone-neutral">Loading…</p>
        ) : (
          <>
            <div className="stats">
              <Stat
                label="Capital bound"
                value={formatUsdCompact(s.totals.capital)}
                note={
                  s.totals.capitalOverAum === null
                    ? undefined
                    : `${formatPercent(s.totals.capitalOverAum, 1)} of AUM`
                }
              />
              <Stat label="Net premium" value={formatUsdCompact(s.totals.premium)} />
              <Stat label="Expected loss" value={formatUsdCompact(s.totals.expectedLoss)} />
              <Stat
                label="Expected yield"
                value={formatPercent(s.totals.expectedYield, 2)}
                note="weighted by capital"
              />
              <Stat
                label="Premium / expected loss"
                value={
                  s.totals.premiumToEL === null ? "—" : `${formatNumber(s.totals.premiumToEL, 2)}×`
                }
              />
            </div>
            <Provenance meta={summaryQ.data?.meta["totals"]} />
          </>
        )}
      </Card>

      {s !== undefined && s.pastRenewal.count > 0 && (
        <Notice
          tone="watch"
          title={`${s.pastRenewal.count} bound layers are past their renewal month`}
        >
          They hold {formatUsdCompact(s.pastRenewal.capital)}. The sheet may not have been updated
          after the layer renewed, so this is a question for the data, not proof that the cover
          lapsed.
        </Notice>
      )}

      <Card title="Every layer" subtitle="Sort any column; search by peril, structure or status">
        {layers === undefined ? (
          <p className="tone-neutral">Loading…</p>
        ) : (
          <>
            <DataTable
              caption="Reinsurance layers"
              columns={columns}
              rows={layers}
              rowKey={(l) => l.layerId}
              initialSort={{ key: "capital", dir: "desc" }}
              search={{
                placeholder: "Search perils, structure or status",
                match: (l, q) =>
                  `${l.perils} ${l.perilFamily} ${l.structure} ${l.structureFamily} ${l.status} ${l.uiLayerNumber}`
                    .toLowerCase()
                    .includes(q),
              }}
              pageSize={15}
              expanded={(l) => (
                <div className="stats">
                  <Stat label="Perils" value={<span className="small">{l.perils}</span>} />
                  <Stat label="Structure" value={<span className="small">{l.structure}</span>} />
                  <Stat label="First seen" value={formatDate(l.firstSeen)} note="by this tool" />
                </div>
              )}
            />
            <Provenance meta={layersQ.data?.meta["layers"]} />
          </>
        )}
      </Card>

      <Card
        title="Where the book is exposed"
        subtitle="Countries named in OnRe's layers, shaded by their share of bound capital"
      >
        {layers === undefined ? (
          <p className="tone-neutral">Loading…</p>
        ) : (
          <ExposureMap layers={layers} />
        )}
        <Provenance meta={layersQ.data?.meta["layers"]} />
      </Card>

      <Panel q={layersQ} build={ganttBuild} title="Exposure timeline" height={620} />

      <div className="grid">
        <Panel q={summaryQ} build={perilBuild} title="By peril family" span={6} />
        <Panel q={summaryQ} build={structureBuild} title="By structure" span={6} />
      </div>

      <div className="grid">
        <Panel q={layersQ} build={bubbleBuild} title="Risk and return" span={7} height={360} />
        <Panel q={summaryQ} build={renewalBuild} title="Renewal calendar" span={5} height={360} />
      </div>

      <Card
        title="History of the book"
        subtitle="When each layer first appeared and how its status changed"
      >
        {s === undefined ? (
          <p className="tone-neutral">Loading…</p>
        ) : (
          <>
            <Notice tone="info">{s.historyNote}</Notice>
            <ul className="feed spaced-block">
              {s.history
                .filter((h) => h.changes.length > 0)
                .slice(0, 12)
                .map((h) => (
                  <li key={h.layerId}>
                    <Pill tone="neutral">{h.uiLayerNumber}</Pill>
                    <div>
                      <strong>First seen {formatDate(h.firstSeen)}</strong>
                      <div className="tone-neutral">
                        {h.changes
                          .map(
                            (c) =>
                              `${formatDate(c.ts)}: ${c.status}, ${formatUsdCompact(c.capital)}`,
                          )
                          .join(" · ")}
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
            <Provenance meta={summaryQ.data?.meta["history"]} />
          </>
        )}
      </Card>
    </>
  );
}
