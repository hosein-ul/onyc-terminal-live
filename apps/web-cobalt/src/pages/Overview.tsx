import {
  capitalStackBarSpec,
  navSpec,
  protocolBarsSpec,
  provenanceFrom,
  sparklineSpec,
  waterfallSpec,
  type ChartSpec,
} from "@onyc/chart-specs";
import {
  formatDate,
  formatNav,
  formatPercent,
  formatRelativeAge,
  formatUsdCompact,
} from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import {
  useCapitalDistribution,
  useCapitalStack,
  useFlows,
  useNav,
  useOverview,
} from "@onyc/sdk/react";
import { useMemo } from "react";
import { Chart, ChartFrame, Panel } from "../charts";
import { useRange } from "../lib/useRange";
import { Card, Notice, PageHeader, Pill, Skeleton } from "../ui/kit";
import { KpiCard } from "../ui/Kpi";
import { Provenance } from "../ui/Provenance";
import { signedPct } from "../lib/format";

type Overview = EndpointResponse<"overview">;

const sparkOf =
  (
    title: string,
    key:
      "nav" | "aum" | "circulatingSupply" | "premiumBps" | "collateralRatio" | "liquidityCoverage",
    unit: "nav" | "usd" | "bps" | "pct",
  ) =>
  (o: Overview): ChartSpec =>
    sparklineSpec(`spark-${key}`, title, o.data[key], unit, provenanceFrom(o.meta, key));

const sparks = {
  aum: sparkOf("AUM", "aum", "usd"),
  supply: sparkOf("Circulating supply", "circulatingSupply", "usd"),
  premium: sparkOf("Premium", "premiumBps", "bps"),
  collateral: sparkOf("Collateral ratio", "collateralRatio", "pct"),
  coverage: sparkOf("Liquidity coverage", "liquidityCoverage", "pct"),
};

const flowsBuild = (d: EndpointResponse<"flows">): ChartSpec => waterfallSpec(d);
const stackBuild = (d: EndpointResponse<"capitalStack">): ChartSpec | null =>
  capitalStackBarSpec(d);
const protocolBuild = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  protocolBarsSpec(d);

const SEVERITY = { info: "neutral", watch: "watch", alert: "bad" } as const;

export function OverviewPage() {
  const overview = useOverview();
  const [range, setRange] = useRange("all");
  const navQ = useNav({ query: { range } });
  const flowsQ = useFlows({ query: { range: "1m" } });
  const stackQ = useCapitalStack();
  const distQ = useCapitalDistribution();

  const o = overview.data;
  const navHero = useMemo(() => (navQ.data === undefined ? null : navSpec(navQ.data)), [navQ.data]);

  // Return since launch comes from the NAV endpoint, which measures it from the first NAV on record.
  const sinceLaunch = navQ.data?.data.returns.find((w) => w.window === "inception")?.return ?? null;
  // Source outages belong on Data Health; the morning view lists changes to ONyc itself.
  const events = (o?.data.whatChanged.events ?? []).filter((e) => !e.kind.startsWith("source_"));
  const sheetSpread = o?.data.sourceCheck.spread ?? null;
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={
          sinceLaunch === null
            ? "ONyc at a glance"
            : `ONyc is up ${formatPercent(sinceLaunch, 1)} since launch`
        }
      />

      {overview.isError && (
        <Notice tone="bad" title="The overview could not be loaded">
          {overview.error instanceof Error ? overview.error.message : "The API did not answer."}{" "}
          Nothing below is invented while it is down.
        </Notice>
      )}

      <div className="hero-row">
        <section aria-label="NAV per ONyc">
          <div className="hero-label">NAV per ONyc{o === undefined ? "" : ` · ${today}`}</div>
          <div className="hero-number">
            {o === undefined ? (
              <Skeleton height={120} width={420} />
            ) : (
              formatNav(o.data.nav.value, 4)
            )}
          </div>
        </section>
        <div className="capsules">
          {o !== undefined && (
            <>
              <div className="capsule capsule-fill">
                <span>Live APY</span>
                <span>{formatPercent(o.data.apy.value, 2)}</span>
              </div>
              <div className="capsule">
                <span>AUM</span>
                <span>{formatUsdCompact(o.data.aum.value)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid">
        <div className="span-8">
          <ChartFrame
            spec={navHero}
            status={navQ.isError ? "error" : navQ.isLoading ? "loading" : "ready"}
            loadingTitle="Growth since launch"
            error="NAV history could not be loaded."
            range={range}
            onRange={setRange}
            height={300}
          >
            {navHero !== null && <Chart spec={navHero} height={300} />}
          </ChartFrame>
        </div>
        <div className="span-4 stack">
          {o === undefined ? (
            <Card>
              <Skeleton height={140} />
            </Card>
          ) : (
            <>
              <KpiCard
                inverse
                label="Circulating supply"
                kind="count"
                kpi={o.data.circulatingSupply}
                meta={o.meta["circulatingSupply"]}
                spark={sparks.supply(o)}
                suffix="ONyc"
              />
              <KpiCard
                label="Assets under management"
                kind="usd"
                kpi={o.data.aum}
                meta={o.meta["aum"]}
                spark={sparks.aum(o)}
              />
            </>
          )}
        </div>
      </div>

      <div className="kpis">
        {o === undefined ? (
          <Card>
            <Skeleton height={120} />
          </Card>
        ) : (
          <>
            <KpiCard
              label="Market premium / discount"
              kind="bps"
              kpi={o.data.premiumBps}
              meta={o.meta["premiumBps"]}
              spark={sparks.premium(o)}
              neutralChange
            />
            <KpiCard
              label="Collateral ratio"
              kind="pct"
              kpi={o.data.collateralRatio}
              meta={o.meta["collateralRatio"]}
              spark={sparks.collateral(o)}
            />
            <KpiCard
              label="Liquidity layer coverage"
              kind="pct"
              kpi={o.data.liquidityCoverage}
              meta={o.meta["liquidityCoverage"]}
              spark={sparks.coverage(o)}
            />
          </>
        )}
      </div>

      <div className="grid">
        <Panel
          q={flowsQ}
          build={flowsBuild}
          title="What moved AUM this month"
          span={5}
          height={280}
        />
        <div className="span-7 stack">
          <Card title="New since yesterday" subtitle="From the event feed">
            {o === undefined ? (
              <Skeleton height={120} />
            ) : events.length === 0 ? (
              <p className="tone-neutral">
                Nothing new: no re-pricing, down-tick or layer change was detected.
              </p>
            ) : (
              <ul className="feed">
                {events.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    <Pill tone={SEVERITY[e.severity]}>{e.severity}</Pill>
                    <div>
                      <strong>{e.title}</strong>
                      <div className="tone-neutral">
                        {formatRelativeAge(e.ts)} · {formatDate(e.ts)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {o !== undefined && <Provenance meta={o.meta["whatChanged"]} />}
          </Card>
          <Card
            title="Data check"
            subtitle={
              sheetSpread === null
                ? "Sources that report ONyc's size"
                : `${o?.data.sourceCheck.sources.length ?? 0} sources report a ${formatPercent(sheetSpread, 1)} spread on size`
            }
            className="source-check"
          >
            {o === undefined ? (
              <Skeleton height={100} />
            ) : (
              <div className="rows">
                {o.data.sourceCheck.sources.map((s) => (
                  <div key={s.id}>
                    <span>{s.label}</span>
                    <b>
                      {formatUsdCompact(s.aumUsd)}
                      {s.asOf !== null && (
                        <span className="tone-neutral"> · {formatDate(s.asOf)}</span>
                      )}
                    </b>
                  </div>
                ))}
              </div>
            )}
            {sheetSpread !== null && Math.abs(sheetSpread) > 0.02 && (
              <Notice tone="watch">
                A spread of {signedPct(sheetSpread, 1)} between sources is normal for sources that
                measure different things; the Data Health page explains each one.
              </Notice>
            )}
            {o !== undefined && <Provenance meta={o.meta["sourceCheck"]} />}
          </Card>
        </div>
      </div>

      <div className="grid">
        <Panel q={stackQ} build={stackBuild} title="Capital stack" span={7} height={190} />
        <Panel q={distQ} build={protocolBuild} title="Capital by protocol" span={5} height={280} />
      </div>
    </>
  );
}
