import { Named } from "../ui/Badge";
import {
  capitalStackBarSpec,
  capitalStackedSpec,
  opportunitiesScatterSpec,
  opportunityMultiplesSpec,
  protocolBarsSpec,
  type ChartSpec,
} from "@onyc/chart-specs";
import { formatPercent, formatUsdCompact } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import {
  useCapitalDistribution,
  useCapitalReconciliation,
  useCapitalStack,
  useDefiOpportunities,
} from "@onyc/sdk/react";
import { Panel } from "../charts";
import { DataTable, type Column } from "../ui/DataTable";
import { Card, ExternalLink, Notice, PageHeader, Pill, Stat } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

type Opp = EndpointResponse<"defiOpportunities">["data"]["opportunities"][number];

const stackBuild = (d: EndpointResponse<"capitalStack">): ChartSpec | null =>
  capitalStackBarSpec(d);
const stackedAbs = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  capitalStackedSpec(d, "absolute");
const stackedPct = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  capitalStackedSpec(d, "percent");
const protocolBuild = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  protocolBarsSpec(d);
const scatterBuild = (d: EndpointResponse<"defiOpportunities">): ChartSpec =>
  opportunitiesScatterSpec(d);
const multiplesBuild = (d: EndpointResponse<"defiOpportunities">): ChartSpec =>
  opportunityMultiplesSpec(d);

const columns: Column<Opp>[] = [
  {
    key: "protocol",
    header: "Protocol",
    sort: (o) => o.protocol,
    cell: (o) => (
      <Named name={o.protocol}>
        <strong>{o.protocol}</strong>
      </Named>
    ),
  },
  { key: "strategy", header: "Strategy", sort: (o) => o.strategy, cell: (o) => o.strategy },
  {
    key: "class",
    header: "Type",
    wide: true,
    sort: (o) => o.classification,
    cell: (o) => <Pill tone="neutral">{o.classification}</Pill>,
  },
  {
    key: "assets",
    header: "Assets",
    wide: true,
    cell: (o) => o.assets.map((a) => a.symbol).join(", "),
  },
  {
    key: "apy",
    header: "APY",
    align: "right",
    sort: (o) => o.apy,
    cell: (o) => formatPercent(o.apy, 2),
  },
  {
    key: "tvl",
    header: "TVL",
    align: "right",
    sort: (o) => o.tvl,
    cell: (o) => formatUsdCompact(o.tvl),
  },
  {
    key: "mult",
    header: "Points",
    align: "right",
    wide: true,
    sort: (o) => o.pointsMultiplier,
    cell: (o) => (o.pointsMultiplier === null ? "—" : `${o.pointsMultiplier}×`),
  },
  {
    key: "flags",
    header: "",
    cell: (o) => (
      <span>
        {o.isNew && <Pill tone="accent">New</Pill>} {o.comingSoon && <Pill tone="watch">Soon</Pill>}
      </span>
    ),
  },
  {
    key: "link",
    header: "Open",
    cell: (o) => (o.link === "" ? "—" : <ExternalLink href={o.link}>Go</ExternalLink>),
  },
];

export function CapitalDefiPage() {
  const stackQ = useCapitalStack();
  const distQ = useCapitalDistribution();
  const reconQ = useCapitalReconciliation();
  const oppsQ = useDefiOpportunities();

  const d = distQ.data?.data;
  const rec = reconQ.data?.data;
  const o = oppsQ.data?.data;
  const looping = d?.loopingShare ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Capital & DeFi Map"
        title="Where ONyc's capital sits"
        right={
          looping !== null ? (
            <Pill tone="watch">Looping {formatPercent(looping, 0)} of capital</Pill>
          ) : undefined
        }
      />

      <div className="grid">
        <Panel q={stackQ} build={stackBuild} title="Capital stack" span={7} height={220} />
        <Panel q={distQ} build={protocolBuild} title="By protocol today" span={5} height={280} />
      </div>

      <Panel q={distQ} build={stackedAbs} title="Capital by protocol over time" height={340} />
      <Panel q={distQ} build={stackedPct} title="Share of capital by protocol" height={340} />

      <div className="split-wide">
        <Card
          title="Do the numbers reconcile"
          subtitle="Circulating ONyc against what can be placed"
        >
          {rec === undefined ? (
            <p className="tone-neutral">Loading…</p>
          ) : (
            <>
              <div className="rows">
                <div>
                  <span>Circulating ONyc</span>
                  <b>{formatUsdCompact(rec.circulatingUsd)}</b>
                </div>
                <div>
                  <span>Known custody</span>
                  <b>{formatUsdCompact(rec.knownCustodyUsd)}</b>
                </div>
                <div>
                  <span>Attributed to protocols</span>
                  <b>{formatUsdCompact(rec.attributedUsd)}</b>
                </div>
                <div>
                  <span>Unexplained</span>
                  <b
                    className={
                      rec.unexplainedShare !== null && Math.abs(rec.unexplainedShare) > 0.02
                        ? "tone-watch"
                        : ""
                    }
                  >
                    {formatUsdCompact(rec.unexplainedUsd)}
                    {rec.unexplainedShare !== null &&
                      ` · ${formatPercent(rec.unexplainedShare, 1)}`}
                  </b>
                </div>
              </div>
              <Notice tone="info">{rec.residualNote}</Notice>
              <Provenance meta={reconQ.data?.meta["unexplainedUsd"]} />
            </>
          )}
        </Card>
        <Card
          title="If a lending market broke"
          subtitle="Share of ONyc capital in looping strategies"
        >
          {looping === null ? (
            <p className="tone-neutral">Loading…</p>
          ) : (
            <>
              <div className="stat-value">{formatPercent(looping, 1)}</div>
              <div
                className="meter spaced-block"
                role="img"
                aria-label={`${formatPercent(looping, 1)} of capital is in looping strategies`}
              >
                <span style={{ width: `${Math.min(100, looping * 100)}%` }} />
              </div>
              <p className="tone-neutral small">
                Kamino and Loopscale lend against ONyc and let holders loop it. If either market
                failed, this share is the part of the capital that would be affected first.
              </p>
              <Provenance meta={distQ.data?.meta["loopingShare"]} />
            </>
          )}
        </Card>
      </div>

      <Card title="Opportunities" subtitle="Everywhere OnRe lists a way to use ONyc">
        {o === undefined ? (
          <p className="tone-neutral">Loading…</p>
        ) : (
          <>
            <DataTable
              caption="DeFi opportunities for ONyc"
              columns={columns}
              rows={o.opportunities}
              rowKey={(x) => x.key}
              initialSort={{ key: "tvl", dir: "desc" }}
              search={{
                placeholder: "Search protocol, strategy or asset",
                match: (x, q) =>
                  `${x.protocol} ${x.strategy} ${x.classification} ${x.assets.map((a) => a.symbol).join(" ")}`
                    .toLowerCase()
                    .includes(q),
              }}
              pageSize={12}
            />
            <Provenance meta={oppsQ.data?.meta["opportunities"]} />
          </>
        )}
      </Card>

      <div className="grid">
        <Panel q={oppsQ} build={scatterBuild} title="APY against TVL" span={7} height={380} />
        <div className="span-5">
          <Card title="Senior and junior" subtitle="Exponent's two ONyc tranches">
            {o === undefined ? (
              <p className="tone-neutral">Loading…</p>
            ) : o.tranching.senior === null || o.tranching.junior === null ? (
              <p className="tone-neutral">
                The opportunities sheet does not list both tranches right now.
              </p>
            ) : (
              <>
                <div className="stats">
                  <Stat
                    label="Senior APY"
                    value={formatPercent(o.tranching.senior.apy, 2)}
                    note={`TVL ${formatUsdCompact(o.tranching.senior.tvl)}`}
                  />
                  <Stat
                    label="Junior APY"
                    value={formatPercent(o.tranching.junior.apy, 2)}
                    note={`TVL ${formatUsdCompact(o.tranching.junior.tvl)}`}
                  />
                  <Stat
                    label="Spread"
                    value={formatPercent(o.tranching.spread, 2)}
                    note="junior minus senior"
                  />
                </div>
                {o.tranching.principalTokens.length > 0 && (
                  <p className="tone-neutral small spaced-block">
                    {o.tranching.principalTokens.length} principal-token rows are listed separately
                    in the table above.
                  </p>
                )}
                <Provenance meta={oppsQ.data?.meta["tranching"]} />
              </>
            )}
          </Card>
        </div>
      </div>

      <Panel q={oppsQ} build={multiplesBuild} title="APY history per opportunity" height={120} />
    </>
  );
}
