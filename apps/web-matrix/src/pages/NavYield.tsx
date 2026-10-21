import {
  collateralBarsSpec,
  forwardNavSpec,
  navCalendarSpec,
  navSpec,
  type ChartSpec,
} from "@onyc/chart-specs";
import {
  formatDate,
  formatNav,
  formatNumber,
  formatPercent,
  formatPpm,
  formatUsd,
  formatUsdCompact,
} from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useNav, useNavVectors, useYieldComposition } from "@onyc/sdk/react";
import { useMemo, useState } from "react";
import { Chart, ChartFrame, Panel } from "../charts";
import { signedPct } from "../lib/format";
import { useRange } from "../lib/useRange";
import { DataTable, type Column } from "../ui/DataTable";
import { Card, ExternalLink, Notice, PageHeader, Pill, Segmented, Stat } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

type Returns = EndpointResponse<"nav">["data"]["returns"][number];
type Asset = EndpointResponse<"yieldComposition">["data"]["collateral"]["assets"][number];

const WINDOW_LABEL: Record<Returns["window"], string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
  inception: "Since launch",
};

const calendarBuild = (d: EndpointResponse<"nav">): ChartSpec => navCalendarSpec(d);
const collateralBuild = (d: EndpointResponse<"yieldComposition">): ChartSpec =>
  collateralBarsSpec(d);

const returnColumns: Column<Returns>[] = [
  { key: "window", header: "Window", cell: (r) => WINDOW_LABEL[r.window] },
  { key: "from", header: "From", wide: true, cell: (r) => formatDate(r.from) },
  { key: "days", header: "Days", align: "right", wide: true, cell: (r) => r.days },
  { key: "return", header: "NAV return", align: "right", cell: (r) => signedPct(r.return, 2) },
  {
    key: "annualized",
    header: "Annualised",
    align: "right",
    cell: (r) => formatPercent(r.annualized, 2),
  },
];

const assetColumns: Column<Asset>[] = [
  { key: "asset", header: "Asset", sort: (a) => a.asset, cell: (a) => <strong>{a.asset}</strong> },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    sort: (a) => a.amountUsd,
    cell: (a) => formatUsdCompact(a.amountUsd),
  },
  {
    key: "allocation",
    header: "Share",
    align: "right",
    wide: true,
    sort: (a) => a.allocation,
    cell: (a) => formatPercent(a.allocation, 1),
  },
  {
    key: "apy",
    header: "APY",
    align: "right",
    sort: (a) => a.apy,
    cell: (a) => formatPercent(a.apy, 2),
  },
  {
    key: "layer",
    header: "Liquidity layer",
    wide: true,
    sort: (a) => (a.liquidityLayer ? 1 : 0),
    cell: (a) =>
      a.liquidityLayer ? <Pill tone="accent">Yes</Pill> : <span className="tone-neutral">No</span>,
  },
];

/** NAV projected from today's value at the active vector's APY, compounded daily as the program does. */
function project(
  amountUsd: number,
  nav: number,
  apy: number,
  days: number,
): { onyc: number; value: number } {
  const onyc = amountUsd / nav;
  return { onyc, value: onyc * nav * (1 + apy) ** (days / 365) };
}

function Calculator({ nav, apy, vectorStart }: { nav: number; apy: number; vectorStart: string }) {
  const [amount, setAmount] = useState("10000");
  const [days, setDays] = useState("90");
  const a = Number(amount);
  const d = Number(days);
  const valid = Number.isFinite(a) && a > 0 && Number.isFinite(d) && d > 0 && d <= 3650;
  const out = valid ? project(a, nav, apy, d) : null;
  return (
    <Card
      title="What could it be worth"
      subtitle="A projection from the current price vector, not a promise"
    >
      <div className="field-row">
        <label className="field">
          Amount in USDC
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          Days to hold
          <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      {out === null ? (
        <Notice tone="watch">Enter an amount above zero and between 1 and 3650 days.</Notice>
      ) : (
        <div className="stats calc-out">
          <Stat
            label="ONyc you would hold"
            value={formatNumber(out.onyc, 2)}
            note={`at NAV ${formatNav(nav, 4)}`}
          />
          <Stat
            label={`Value after ${d} days`}
            value={formatUsd(out.value, 0)}
            tone="good"
            note={`${signedPct(out.value / a - 1, 2)} on ${formatUsd(a, 0)}`}
          />
        </div>
      )}
      <p className="tone-neutral small">
        Assumes the vector that started {formatDate(vectorStart)} runs unchanged at{" "}
        {formatPercent(apy, 2)} a year, compounded daily. OnRe can add a new vector at any time, and
        the redemption fee is not deducted. Not investment advice.
      </p>
    </Card>
  );
}

export function NavYieldPage() {
  const [range, setRange] = useRange("1y");
  const [log, setLog] = useState<"linear" | "log">("linear");
  const [horizon, setHorizon] = useState<"d30" | "d90">("d90");
  const navQ = useNav({ query: { range } });
  const navAll = useNav({ query: { range: "all" } });
  const vectorsQ = useNavVectors();
  const yieldQ = useYieldComposition();

  const navSpecMemo = useMemo(
    () => (navQ.data === undefined ? null : navSpec(navQ.data, { log: log === "log" })),
    [navQ.data, log],
  );
  const forwardSpec = useMemo(
    () =>
      navAll.data === undefined || vectorsQ.data === undefined
        ? null
        : forwardNavSpec(navAll.data, vectorsQ.data, horizon),
    [navAll.data, vectorsQ.data, horizon],
  );

  const n = navAll.data?.data;
  const vec = vectorsQ.data?.data;
  const y = yieldQ.data?.data;
  const active = vec?.vectors.find((v) => v.active);
  const thirty = n?.returns.find((r) => r.window === "30d");
  const reported = n?.benchmarks.reportedApy ?? null;

  return (
    <>
      <PageHeader
        eyebrow="NAV & Yield"
        title={
          thirty === undefined
            ? "How ONyc earns and how its price moves"
            : `Over the last 30 days ONyc compounded at ${formatPercent(thirty.annualized, 2)} a year`
        }
        right={
          reported !== null ? (
            <Pill tone="good">Reported APY {formatPercent(reported, 2)}</Pill>
          ) : undefined
        }
      />

      <ChartFrame
        spec={navSpecMemo}
        status={navQ.isError ? "error" : navQ.isLoading ? "loading" : "ready"}
        loadingTitle="NAV per ONyc"
        error="NAV history could not be loaded."
        range={range}
        onRange={setRange}
        height={340}
      >
        {navSpecMemo !== null && (
          <>
            <div className="toolbar">
              <Segmented
                label="Scale"
                value={log}
                onChange={setLog}
                options={[
                  { value: "linear", label: "Linear" },
                  { value: "log", label: "Log" },
                ]}
              />
            </div>
            <Chart spec={navSpecMemo} height={340} />
          </>
        )}
      </ChartFrame>

      <div className="split-wide">
        <ChartFrame
          spec={forwardSpec}
          status={
            navAll.isError || vectorsQ.isError
              ? "error"
              : navAll.isLoading || vectorsQ.isLoading
                ? "loading"
                : "ready"
          }
          loadingTitle="NAV as scheduled"
          error="The price schedule could not be loaded."
          height={300}
        >
          {forwardSpec !== null && (
            <>
              <div className="toolbar">
                <Segmented
                  label="Horizon"
                  value={horizon}
                  onChange={setHorizon}
                  options={[
                    { value: "d30", label: "30 days" },
                    { value: "d90", label: "90 days" },
                  ]}
                />
              </div>
              <Chart spec={forwardSpec} height={300} />
            </>
          )}
        </ChartFrame>

        <Card title="The price vector" subtitle="How OnRe's program sets today's price">
          {vec === undefined || active === undefined ? (
            <p className="tone-neutral">Decoding the price schedule…</p>
          ) : (
            <>
              <div className="rows">
                <div>
                  <span>Active since</span>
                  <b>{formatDate(active.startTime)}</b>
                </div>
                <div>
                  <span>Annual rate (APR)</span>
                  <b>{formatPercent(active.apr, 2)}</b>
                </div>
                <div>
                  <span>Compounded daily (APY)</span>
                  <b>{formatPercent(active.apy, 2)}</b>
                </div>
                <div>
                  <span>Price fixed for</span>
                  <b>{Math.round(active.priceFixDurationSeconds / 3600)} h at a time</b>
                </div>
                <div>
                  <span>Next re-pricing</span>
                  <b>{formatDate(vec.nextRepricing.at)}</b>
                </div>
                <div>
                  <span>Schedule vs live NAV</span>
                  <b>
                    {vec.difference === null
                      ? "—"
                      : `${formatNav(vec.scheduledNavNow, 6)} vs ${formatNav(vec.liveNav, 6)}`}
                  </b>
                </div>
              </div>
              <p className="tone-neutral small">{vec.nextRepricing.note}</p>
              <p className="tone-neutral small">
                {vec.formula.description}{" "}
                <ExternalLink href="https://github.com/onre-finance/onre-sol">
                  Program source
                </ExternalLink>
              </p>
              <Provenance meta={vectorsQ.data?.meta["vectors"]} />
            </>
          )}
        </Card>
      </div>

      <div className="split-wide">
        <Card title="Returns" subtitle="NAV-implied, compounded, against the APY OnRe reports">
          {n === undefined ? (
            <p className="tone-neutral">Loading…</p>
          ) : (
            <>
              <DataTable
                caption="NAV returns by window"
                columns={returnColumns}
                rows={n.returns}
                rowKey={(r) => r.window}
              />
              <p className="tone-neutral small">
                Annualised = (1 + return)^(365 / days) − 1. The reported APY is{" "}
                {formatPercent(reported, 2)};{" "}
                {thirty !== undefined && reported !== null
                  ? `the 30-day NAV-implied figure is ${formatPercent(thirty.annualized, 2)}.`
                  : "it could not be compared yet."}
              </p>
              <Provenance meta={navAll.data?.meta["returns"]} />
            </>
          )}
        </Card>
        <Card
          title="How smooth is the price"
          subtitle="Should be steady; shown even when it is not"
        >
          {n === undefined ? (
            <p className="tone-neutral">Loading…</p>
          ) : (
            <>
              <div className="stats">
                <Stat label="Daily step, st. dev." value={formatPpm(n.smoothness.stdevPpm)} />
                <Stat label="Max drawdown" value={formatPercent(n.smoothness.maxDrawdown, 3)} />
                <Stat
                  label="Down days"
                  value={n.smoothness.negativeDays}
                  tone={n.smoothness.negativeDays > 0 ? "bad" : "good"}
                  note={`of ${n.smoothness.observations} observed`}
                />
              </div>
              <Provenance meta={navAll.data?.meta["smoothness"]} />
            </>
          )}
        </Card>
      </div>

      <Panel q={navAll} build={calendarBuild} title="Daily NAV increment" height={190} />

      <div className="split-wide">
        <Card
          title="Where the yield comes from"
          subtitle="Reinsurance premium and collateral assets"
        >
          {y === undefined ? (
            <p className="tone-neutral">Loading…</p>
          ) : (
            <>
              <div className="stats">
                <Stat label="Reported APY" value={formatPercent(y.reportedApy, 2)} />
                <Stat
                  label="Blended from the books"
                  value={formatPercent(y.blendedApy, 2)}
                  note="weighted by capital"
                />
                <Stat
                  label="Difference"
                  value={y.difference === null ? "—" : signedPct(y.difference, 2)}
                  tone={y.difference !== null && Math.abs(y.difference) > 0.01 ? "watch" : "good"}
                />
              </div>
              <Notice tone="info">{y.note}</Notice>
              <div className="rows spaced">
                <div>
                  <span>Reinsurance capital</span>
                  <b>{formatUsdCompact(y.reinsurance.capital)}</b>
                </div>
                <div>
                  <span>Reinsurance expected yield</span>
                  <b>{formatPercent(y.reinsurance.expectedYield, 2)}</b>
                </div>
                <div>
                  <span>Collateral sheet total</span>
                  <b>{formatUsdCompact(y.collateral.totalUsd)}</b>
                </div>
                <div>
                  <span>Collateral blended APY</span>
                  <b>{formatPercent(y.collateral.blendedApy, 2)}</b>
                </div>
              </div>
              <Provenance meta={yieldQ.data?.meta["reinsurance"]} />
            </>
          )}
        </Card>
        <Panel q={yieldQ} build={collateralBuild} title="Collateral by size" />
      </div>

      <Card
        title="Collateral assets"
        subtitle="Rows of OnRe's collateral sheet, with each asset's own APY"
      >
        {y === undefined ? (
          <p className="tone-neutral">Loading…</p>
        ) : (
          <DataTable
            caption="Collateral assets"
            columns={assetColumns}
            rows={y.collateral.assets}
            rowKey={(a) => a.asset}
            initialSort={{ key: "amount", dir: "desc" }}
          />
        )}
      </Card>

      <div className="split">
        <Card
          title="Against the benchmarks"
          subtitle="Yields reported elsewhere, with their sources"
        >
          {n === undefined ? (
            <p className="tone-neutral">Loading…</p>
          ) : (
            <>
              <div className="rows">
                <div>
                  <span>ONyc reported APY</span>
                  <b>{formatPercent(n.benchmarks.reportedApy, 2)}</b>
                </div>
                <div>
                  <span>sUSDe APY (OnRe settings)</span>
                  <b>{formatPercent(n.benchmarks.susdeApy, 2)}</b>
                </div>
                <div>
                  <span>
                    T-bill rate
                    {n.benchmarks.tbillSource !== null ? ` (${n.benchmarks.tbillSource})` : ""}
                  </span>
                  <b>{formatPercent(n.benchmarks.tbillApy, 2)}</b>
                </div>
              </div>
              <p className="tone-neutral small">
                The sUSDe figure is the one OnRe publishes in its settings, in the unit it gives it.
              </p>
              <Provenance meta={navAll.data?.meta["benchmarks"]} />
            </>
          )}
        </Card>
        {n !== undefined && active !== undefined && n.series.length > 0 && (
          <Calculator
            nav={n.series[n.series.length - 1]?.nav ?? 1}
            apy={active.apy}
            vectorStart={active.startTime}
          />
        )}
      </div>
    </>
  );
}
