import {
  capitalStackBarSpec,
  collateralSankeySpec,
  collateralBulletSpec,
  coverageBulletSpec,
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
  useMarket,
  useSolvency,
  useFlows,
  useNav,
  useOverview,
  useYieldComposition,
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
const collateralRing = (d: EndpointResponse<"solvency">): ChartSpec => collateralBulletSpec(d);
const coverageRing = (d: EndpointResponse<"market">): ChartSpec => coverageBulletSpec(d);
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
  const solvQ = useSolvency();
  const marketQ = useMarket();
  const distQ = useCapitalDistribution();
  const yieldQ = useYieldComposition();

  const o = overview.data;
  const navHero = useMemo(() => (navQ.data === undefined ? null : navSpec(navQ.data)), [navQ.data]);

  // Return since launch comes from the NAV endpoint, which measures it from the first NAV on record.
  const sinceLaunch = navQ.data?.data.returns.find((w) => w.window === "inception")?.return ?? null;
  // Source outages belong on Data Health; the morning view lists changes to ONyc itself.
  const events = (o?.data.whatChanged.events ?? []).filter((e) => !e.kind.startsWith("source_"));
  const sheetSpread = o?.data.sourceCheck.spread ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={
          sinceLaunch === null
            ? "ONyc at a glance"
            : `ONyc is up ${formatPercent(sinceLaunch, 1)} since launch`
        }
        right={
          o !== undefined && o.data.apy.value !== null ? (
            <Pill tone="good">Live APY {formatPercent(o.data.apy.value, 2)}</Pill>
          ) : undefined
        }
      />

      {overview.isError && (
        <Notice tone="bad" title="The overview could not be loaded">
          {overview.error instanceof Error ? overview.error.message : "The API did not answer."}{" "}
          Nothing below is invented while it is down.
        </Notice>
      )}

      <div className="grid">
        <div className="span-8">
          <section className="hero" aria-label="NAV per ONyc">
            <div className="hero-label">NAV per ONyc</div>
            <div className="hero-number">
              {o === undefined ? (
                <Skeleton height={56} width={260} />
              ) : (
                formatNav(o.data.nav.value, 4)
              )}
              {o !== undefined && <span className="hero-unit"> USDC</span>}
            </div>
            <ChartFrame
              spec={navHero}
              status={navQ.isError ? "error" : navQ.isLoading ? "loading" : "ready"}
              loadingTitle="NAV per ONyc"
              error="NAV history could not be loaded."
              range={range}
              onRange={setRange}
              height={260}
              plain
              hideTitle
            >
              {navHero !== null && <Chart spec={navHero} height={260} />}
            </ChartFrame>
          </section>
        </div>

        <div className="span-4 stack">
          {o === undefined ? (
            <>
              <Card>
                <Skeleton height={90} />
              </Card>
              <Card>
                <Skeleton height={90} />
              </Card>
              <Card>
                <Skeleton height={90} />
              </Card>
            </>
          ) : (
            <>
              <KpiCard
                label="Assets under management"
                kind="usd"
                kpi={o.data.aum}
                meta={o.meta["aum"]}
                spark={sparks.aum(o)}
              />
              <KpiCard
                label="Circulating supply"
                kind="count"
                kpi={o.data.circulatingSupply}
                meta={o.meta["circulatingSupply"]}
                spark={sparks.supply(o)}
                suffix="ONyc"
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
            <Panel q={solvQ} build={collateralRing} title="Collateral ratio" height={230} />
            <Panel q={marketQ} build={coverageRing} title="Liquidity layer coverage" height={230} />
            <KpiCard
              label="Live APY"
              kind="apy"
              kpi={o.data.apy}
              meta={o.meta["apy"]}
              spark={null}
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
        <Panel
          q={yieldQ}
          build={collateralSankeySpec}
          title="Where the collateral sits"
          span={7}
          height={340}
        />
        <Panel q={distQ} build={protocolBuild} title="Capital by protocol" span={5} height={340} />
      </div>
      <div className="grid">
        <Panel q={stackQ} build={stackBuild} title="Capital stack" span={12} height={150} />
      </div>
    </>
  );
}
