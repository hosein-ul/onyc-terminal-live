import { Named } from "../ui/Badge";
import {
  lorenzSpec,
  pointsCalendarSpec,
  pointsEmissionSpec,
  pointsTotalSpec,
  venueMixBarsSpec,
  type ChartSpec,
} from "@onyc/chart-specs";
import { formatCompact, formatPercent } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useConcentration, useLeaderboard, usePointsGrowth } from "@onyc/sdk/react";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../charts";
import { shortAddress } from "../lib/format";
import { DataTable, type Column } from "../ui/DataTable";
import { Card, Notice, PageHeader, Pill, Stat } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

type Row = EndpointResponse<"leaderboard">["data"]["rows"][number];

const totalBuild = (d: EndpointResponse<"pointsGrowth">): ChartSpec => pointsTotalSpec(d);
const emissionBuild = (d: EndpointResponse<"pointsGrowth">): ChartSpec => pointsEmissionSpec(d);
const calendarBuild = (d: EndpointResponse<"pointsGrowth">): ChartSpec => pointsCalendarSpec(d);
const lorenzBuild = (d: EndpointResponse<"concentration">): ChartSpec => lorenzSpec(d);
const venueBuild = (d: EndpointResponse<"concentration">): ChartSpec => venueMixBarsSpec(d);

function move(v: number | null): string {
  if (v === null) return "—";
  return v === 0 ? "0" : `${v > 0 ? "▲" : "▼"} ${Math.abs(v)}`;
}

const columns: Column<Row>[] = [
  { key: "rank", header: "#", align: "right", cell: (r) => r.rank },
  {
    key: "who",
    header: "Wallet",
    cell: (r) => (
      <Link to={`/wallet/${r.address}`} className="mono">
        {shortAddress(r.address)}
      </Link>
    ),
  },
  { key: "points", header: "Points", align: "right", cell: (r) => formatCompact(r.totalPoints) },
  {
    key: "onre",
    header: "Rank change per OnRe",
    align: "right",
    wide: true,
    cell: (r) => move(r.rankChangePerOnre),
  },
  { key: "d1", header: "1d", align: "right", wide: true, cell: (r) => move(r.movement1d) },
  { key: "d7", header: "7d", align: "right", wide: true, cell: (r) => move(r.movement7d) },
  { key: "d30", header: "30d", align: "right", wide: true, cell: (r) => move(r.movement30d) },
];

function Leaderboard() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const size = 25;
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(text.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(id);
  }, [text]);
  const board = useLeaderboard({ query: { page, size, ...(q !== "" ? { q } : {}) } });
  const d = board.data?.data;
  const pages = d === undefined ? 0 : Math.max(1, Math.ceil(d.totalRows / size));

  return (
    <Card
      title="Leaderboard"
      subtitle={d?.snapshotDate ? `From the crawl of ${d.snapshotDate}` : "Latest daily crawl"}
    >
      <label className="dt-search">
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <input
          type="search"
          value={text}
          placeholder="Find a wallet address"
          aria-label="Find a wallet address"
          onChange={(e) => setText(e.target.value)}
        />
        <span className="dt-count">
          {d === undefined ? "…" : `${d.totalRows.toLocaleString("en-US")} wallets`}
        </span>
      </label>
      {board.isError ? (
        <Notice tone="bad">The leaderboard could not be loaded.</Notice>
      ) : d === undefined ? (
        <p className="tone-neutral">Loading…</p>
      ) : (
        <>
          <DataTable
            caption="Points leaderboard"
            columns={columns}
            rows={d.rows}
            rowKey={(r) => r.address}
            empty="No wallet matches that search."
            expanded={(r) =>
              r.breakdown === null ? (
                <span className="tone-neutral">
                  No breakdown by venue is available for this wallet.
                </span>
              ) : (
                <div className="stats">
                  {Object.entries(r.breakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([venue, pts]) => (
                      <Stat key={venue} label={venue} value={formatCompact(pts)} />
                    ))}
                </div>
              )
            }
          />
          <div className="pager">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className="tone-neutral">
              Page {page + 1} of {pages}
            </span>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
          <p className="tone-neutral small">
            "Rank change per OnRe" is OnRe's own field; its comparison window is not documented. The
            1d, 7d and 30d columns are computed here from daily snapshots and fill in as history
            builds up.
          </p>
          <Provenance meta={board.data?.meta["rows"]} />
        </>
      )}
    </Card>
  );
}

export function PointsPage() {
  const growthQ = usePointsGrowth();
  const concQ = useConcentration();
  const c = concQ.data?.data;
  const multiplier = growthQ.data?.data.activeMultiplier ?? null;
  const top10 = c?.topShares.find((t) => t.top === 10);

  return (
    <>
      <PageHeader
        eyebrow="Points & Leaderboard"
        title={
          c === undefined || top10 === undefined
            ? "Who earns ONyc points"
            : `${formatCompact(c.wallets)} wallets earn points, and the top 10 hold ${formatPercent(top10.share, 0)} of them`
        }
        right={
          multiplier !== null ? (
            <Pill tone="accent">Global multiplier {multiplier.value}×</Pill>
          ) : undefined
        }
      />

      {multiplier !== null && (
        <Notice
          tone="info"
          title={`Active global multiplier: ${multiplier.value}× since ${multiplier.since.slice(0, 10)}`}
        >
          {multiplier.note}
        </Notice>
      )}

      <div className="grid">
        <Panel q={growthQ} build={totalBuild} title="Total points issued" span={5} height={300} />
        <Panel
          q={growthQ}
          build={emissionBuild}
          title="Points issued per day"
          span={7}
          height={300}
        />
      </div>
      <Panel q={growthQ} build={calendarBuild} title="Daily points emission" height={200} />

      <Leaderboard />

      <div className="grid">
        <Panel
          q={concQ}
          build={lorenzBuild}
          title="How concentrated points are"
          span={6}
          height={360}
        />
        <div className="span-6">
          <Card title="Who holds the points" subtitle="Share of all points">
            {c === undefined ? (
              <p className="tone-neutral">Loading…</p>
            ) : (
              <>
                <div className="stats">
                  <Stat
                    label="Gini coefficient"
                    value={c.gini === null ? "—" : c.gini.toFixed(3)}
                    note="0 equal, 1 one holder"
                  />
                  {c.topShares.map((t) => (
                    <Stat
                      key={t.top}
                      label={`Top ${t.top.toLocaleString("en-US")}`}
                      value={formatPercent(t.share, 1)}
                    />
                  ))}
                </div>
                <div className="rows spaced">
                  {c.thresholds.map((t) => (
                    <div key={t.threshold}>
                      <span>Wallets above {formatCompact(t.threshold)} points</span>
                      <b>{t.wallets.toLocaleString("en-US")}</b>
                    </div>
                  ))}
                </div>
                <Provenance meta={concQ.data?.meta["gini"]} />
              </>
            )}
          </Card>
        </div>
      </div>

      <div className="grid">
        <Panel q={concQ} build={venueBuild} title="Where points are earned" span={6} />
        <div className="span-6">
          <Card title="Multipliers" subtitle="From OnRe's opportunities sheet">
            {c === undefined ? (
              <p className="tone-neutral">Loading…</p>
            ) : (
              <>
                <DataTable
                  caption="Points multipliers by strategy"
                  columns={[
                    {
                      key: "p",
                      header: "Protocol",
                      sort: (m) => m.protocol,
                      cell: (m: (typeof c.multipliers)[number]) => (
                        <Named name={m.protocol}>
                          <strong>{m.protocol}</strong>
                        </Named>
                      ),
                    },
                    {
                      key: "s",
                      header: "Strategy",
                      cell: (m: (typeof c.multipliers)[number]) => m.strategy,
                    },
                    {
                      key: "m",
                      header: "Multiplier",
                      align: "right",
                      sort: (m) => m.pointsMultiplier,
                      cell: (m: (typeof c.multipliers)[number]) => `${m.pointsMultiplier}×`,
                    },
                  ]}
                  rows={c.multipliers}
                  rowKey={(m) => `${m.protocol}-${m.strategy}`}
                  initialSort={{ key: "m", dir: "desc" }}
                  pageSize={8}
                />
                <p className="tone-neutral small">{c.multiplierNote}</p>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
