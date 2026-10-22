import {
  coverageBulletSpec,
  marketSpec,
  premiumBarsSpec,
  redemptionFlowSpec,
  type ChartSpec,
} from "@onyc/chart-specs";
import {
  formatBps,
  formatDateTime,
  formatNav,
  formatNumber,
  formatPercent,
  formatUsd,
  formatUsdCompact,
} from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useMarket, useRedemptions } from "@onyc/sdk/react";
import { useEffect, useMemo, useState } from "react";
import { Chart, ChartFrame, Panel } from "../charts";
import { shortAddress } from "../lib/format";
import { useRange } from "../lib/useRange";
import { DataTable, type Column } from "../ui/DataTable";
import { Card, ExternalLink, Notice, PageHeader, Pill, Stat } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

type Pool = EndpointResponse<"market">["data"]["pools"][number];
type Offer = EndpointResponse<"redemptions">["data"]["offers"][number];
type LogRow = EndpointResponse<"redemptions">["data"]["log"]["rows"][number];

const coverageBuild = (d: EndpointResponse<"market">): ChartSpec => coverageBulletSpec(d);
const flowBuild = (d: EndpointResponse<"redemptions">): ChartSpec => redemptionFlowSpec(d);

const poolColumns: Column<Pool>[] = [
  { key: "name", header: "Pool", sort: (p) => p.name, cell: (p) => <strong>{p.name}</strong> },
  { key: "dex", header: "DEX", wide: true, sort: (p) => p.dex, cell: (p) => p.dex },
  {
    key: "price",
    header: "Price",
    align: "right",
    sort: (p) => p.priceUsd,
    cell: (p) => formatNav(p.priceUsd, 4),
  },
  {
    key: "liq",
    header: "Liquidity",
    align: "right",
    sort: (p) => p.liquidityUsd,
    cell: (p) => formatUsdCompact(p.liquidityUsd),
  },
  {
    key: "vol",
    header: "24h volume",
    align: "right",
    wide: true,
    sort: (p) => p.volume24h,
    cell: (p) => formatUsdCompact(p.volume24h),
  },
  {
    key: "chg",
    header: "24h change",
    align: "right",
    wide: true,
    sort: (p) => p.priceChange24hPct,
    cell: (p) => (p.priceChange24hPct === null ? "—" : `${formatNumber(p.priceChange24hPct, 2)}%`),
  },
];

const offerColumns: Column<Offer>[] = [
  { key: "out", header: "Pays out", cell: (o) => <strong>{o.tokenOut}</strong> },
  {
    key: "exec",
    header: "Executed",
    align: "right",
    sort: (o) => o.executed,
    cell: (o) => formatNumber(o.executed, 0),
  },
  {
    key: "req",
    header: "Requested",
    align: "right",
    wide: true,
    sort: (o) => o.requested,
    cell: (o) => formatNumber(o.requested, 0),
  },
  { key: "fee", header: "Request fee", align: "right", cell: (o) => formatBps(o.feeBps) },
  { key: "amm", header: "PropAMM fee", align: "right", cell: (o) => formatBps(o.propAmmFeeBps) },
  {
    key: "state",
    header: "State",
    wide: true,
    cell: (o) => (o.disabled ? <Pill tone="bad">Disabled</Pill> : <Pill tone="good">Open</Pill>),
  },
];

const logColumns: Column<LogRow>[] = [
  {
    key: "time",
    header: "Requested",
    sort: (r) => r.requestedAt,
    cell: (r) => (r.requestedAt === null ? "—" : formatDateTime(r.requestedAt)),
  },
  {
    key: "who",
    header: "Wallet",
    cell: (r) => (
      <ExternalLink href={`https://solscan.io/account/${r.redeemer}`}>
        {shortAddress(r.redeemer)}
      </ExternalLink>
    ),
  },
  {
    key: "amount",
    header: "ONyc",
    align: "right",
    sort: (r) => r.amount,
    cell: (r) => formatNumber(r.amount, 0),
  },
  {
    key: "filled",
    header: "Fulfilled",
    align: "right",
    wide: true,
    sort: (r) => r.fulfilledAmount,
    cell: (r) => formatNumber(r.fulfilledAmount, 0),
  },
  {
    key: "status",
    header: "Status",
    cell: (r) => (
      <Pill tone={r.status === "EXECUTED" ? "good" : "neutral"}>{r.status.toLowerCase()}</Pill>
    ),
  },
  {
    key: "tx",
    header: "Transactions",
    wide: true,
    cell: (r) =>
      r.submissionTx === null ? (
        "—"
      ) : (
        <span>
          <ExternalLink href={`https://solscan.io/tx/${r.submissionTx}`}>request</ExternalLink>
          {r.fulfillmentTxs.map((t, i) => (
            <span key={t}>
              {" "}
              <ExternalLink href={`https://solscan.io/tx/${t}`}>{`fill ${i + 1}`}</ExternalLink>
            </span>
          ))}
        </span>
      ),
  },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function ExitEstimator() {
  const [text, setText] = useState("10000");
  const amount = useDebounced(Number(text), 400);
  const valid = Number.isFinite(amount) && amount > 0 && amount <= 1e9;
  const q = useRedemptions({ query: valid ? { amount } : {}, enabled: valid });
  const est = q.data?.data.estimate ?? null;
  return (
    <Card title="Cost of leaving" subtitle="What redeeming a given amount would cost today">
      <label className="field">
        ONyc to redeem
        <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {!valid ? (
        <Notice tone="watch">Enter an amount above zero.</Notice>
      ) : est === null ? (
        <p className="tone-neutral">Working it out…</p>
      ) : (
        <>
          <div className="stats calc-out">
            <Stat label="Worth at NAV" value={formatUsd(est.navValueUsd, 0)} />
            <Stat
              label="Worth at market"
              value={est.marketValueUsd === null ? "—" : formatUsd(est.marketValueUsd, 0)}
            />
            <Stat
              label="Via request"
              value={formatUsd(est.requestNetUsd, 0)}
              note={`fee ${formatUsd(est.requestFeeUsd, 2)}`}
            />
            <Stat
              label="Via PropAMM"
              value={formatUsd(est.propAmmNetUsd, 0)}
              note={`fee ${formatUsd(est.propAmmFeeUsd, 2)}`}
            />
          </div>
          <p className="tone-neutral small">{est.label}</p>
          <Provenance meta={q.data?.meta["estimate"]} />
        </>
      )}
    </Card>
  );
}

export function PegLiquidityPage() {
  const [range, setRange] = useRange("1w");
  const marketQ = useMarket({ query: { range } });
  const redemptionsQ = useRedemptions();
  const m = marketQ.data?.data;
  const r = redemptionsQ.data?.data;

  const priceSpec = useMemo(
    () => (marketQ.data === undefined ? null : marketSpec(marketQ.data)),
    [marketQ.data],
  );
  const premiumSpec = useMemo(
    () => (marketQ.data === undefined ? null : premiumBarsSpec(marketQ.data)),
    [marketQ.data],
  );

  return (
    <>
      <PageHeader
        eyebrow="Peg & Liquidity"
        title="How close ONyc trades to its price"
        right={
          m !== undefined && m.liquidityCoverage !== null ? (
            <Pill tone="accent">
              Liquid collateral {formatPercent(m.liquidityCoverage, 1)} of AUM
            </Pill>
          ) : undefined
        }
      />

      <div className="grid">
        <div className="span-6">
          <ChartFrame
            spec={priceSpec}
            status={marketQ.isError ? "error" : marketQ.isLoading ? "loading" : "ready"}
            loadingTitle="Market price vs NAV"
            error="Market data could not be loaded."
            range={range}
            onRange={setRange}
            height={300}
          >
            {priceSpec !== null && <Chart spec={priceSpec} height={300} />}
          </ChartFrame>
        </div>
        <div className="span-6">
          <ChartFrame
            spec={premiumSpec}
            status={marketQ.isError ? "error" : marketQ.isLoading ? "loading" : "ready"}
            loadingTitle="Premium / discount"
            error="Market data could not be loaded."
            height={300}
          >
            {premiumSpec !== null && <Chart spec={premiumSpec} height={300} />}
          </ChartFrame>
        </div>
      </div>

      <div className="split-wide">
        <Card title="Where ONyc trades" subtitle="Pools reported by GeckoTerminal">
          {m === undefined ? (
            <p className="tone-neutral">Loading…</p>
          ) : (
            <>
              <DataTable
                caption="DEX pools for ONyc"
                columns={poolColumns}
                rows={m.pools}
                rowKey={(p) => p.pool}
                initialSort={{ key: "liq", dir: "desc" }}
              />
              <div className="stats stats-top">
                <Stat
                  label="Liquidity in these pools"
                  value={formatUsdCompact(m.poolsTotals.liquidityUsd)}
                />
                <Stat label="24h volume" value={formatUsdCompact(m.poolsTotals.volume24h)} />
              </div>
              <Provenance meta={marketQ.data?.meta["pools"]} />
            </>
          )}
        </Card>
        <Panel
          q={marketQ}
          build={coverageBuild}
          title="Liquid collateral vs 15% target"
          height={110}
        />
      </div>

      <h2 className="section-title">Redemptions</h2>

      <div className="split-wide">
        <Card title="Offers" subtitle="What OnRe pays out in, and what it costs">
          {r === undefined ? (
            <p className="tone-neutral">Loading…</p>
          ) : (
            <>
              <DataTable
                caption="Redemption offers"
                columns={offerColumns}
                rows={r.offers}
                rowKey={(o) => o.offer}
              />
              <Provenance meta={redemptionsQ.data?.meta["offers"]} />
            </>
          )}
        </Card>
        <Card title="Capacity limits" subtitle="Published by OnRe">
          {r?.settings == null ? (
            <p className="tone-neutral">
              {r === undefined ? "Loading…" : "Settings are not available right now."}
            </p>
          ) : (
            <>
              <div className="rows">
                <div>
                  <span>Starting capacity</span>
                  <b>{formatUsdCompact(r.settings.initialCapacity)}</b>
                </div>
                <div>
                  <span>Maximum capacity</span>
                  <b>{formatUsdCompact(r.settings.maxCapacity)}</b>
                </div>
                <div>
                  <span>Largest share per request</span>
                  <b>{formatPercent(r.settings.maxSharePerRequest, 1)}</b>
                </div>
                <div>
                  <span>Cooldown</span>
                  <b>{Math.round(r.settings.coolDownSeconds / 3600)} h</b>
                </div>
                <div>
                  <span>Partial fills</span>
                  <b>{r.settings.allowPartial ? "Allowed" : "Not allowed"}</b>
                </div>
              </div>
              <Notice tone="info">{r.capacityNote}</Notice>
              <Provenance meta={redemptionsQ.data?.meta["settings"]} />
            </>
          )}
        </Card>
      </div>

      <div className="split-wide">
        <Panel q={redemptionsQ} build={flowBuild} title="Redemption flow" height={240} />
        <ExitEstimator />
      </div>

      <Card title="Recent redemption requests" subtitle="OnRe's public log">
        {r === undefined ? (
          <p className="tone-neutral">Loading…</p>
        ) : (
          <>
            <Notice tone="watch">{r.log.note}</Notice>
            <div className="spaced-block">
              <DataTable
                caption="Public redemption log"
                columns={logColumns}
                rows={r.log.rows}
                rowKey={(x) => x.requestPda}
                initialSort={{ key: "time", dir: "desc" }}
                pageSize={10}
              />
            </div>
            <p className="tone-neutral small">
              {r.log.rows.length} of {r.log.totalRows} rows loaded; the newest entry is from{" "}
              {r.log.newest === null ? "an unknown date" : formatDateTime(r.log.newest)}.
            </p>
            <Provenance meta={redemptionsQ.data?.meta["log"]} />
          </>
        )}
      </Card>
    </>
  );
}
