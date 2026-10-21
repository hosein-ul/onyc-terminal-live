import {
  capitalStackBarSpec,
  capitalStackedSpec,
  capitalTreemapSpec,
  collateralBulletSpec,
  collateralSankeySpec,
  coverageBulletSpec,
  layersBubbleSpec,
  layersGanttSpec,
  leaderboardBarsSpec,
  lorenzSpec,
  marketSpec,
  navCalendarSpec,
  navSpec,
  opportunitiesScatterSpec,
  opportunityMultiplesSpec,
  pointsCalendarSpec,
  premiumBarsSpec,
  provenanceFrom,
  renewalBarsSpec,
  reservesTreemapSpec,
  sparklineSpec,
  venueMixBarsSpec,
  waterfallSpec,
  type ChartSpec,
} from "@onyc/chart-specs";
import type { EndpointResponse } from "@onyc/sdk";
import {
  useCapitalDistribution,
  useCapitalStack,
  useConcentration,
  useDefiOpportunities,
  useFlows,
  useLeaderboard,
  useMarket,
  useNav,
  useOverview,
  usePointsGrowth,
  useReinsuranceLayers,
  useReinsuranceSummary,
  useSolvency,
  useYieldComposition,
} from "@onyc/sdk/react";
import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Chart, ChartFrame, RANGES, type RangeKey } from "../charts";

interface QueryLike<D> {
  data: D | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

interface PanelProps<D> {
  q: QueryLike<D>;
  build: (d: D) => ChartSpec | null;
  title: string;
  span?: 4 | 5 | 6 | 7 | 8 | 12;
  height?: number;
  range?: RangeKey;
  onRange?: (r: RangeKey) => void;
}

function Panel<D>({
  q,
  build,
  title,
  span = 12,
  height,
  range,
  onRange,
}: PanelProps<D>): ReactNode {
  const spec = useMemo(() => (q.data === undefined ? null : build(q.data)), [q.data, build]);
  const status = q.isError ? "error" : q.isLoading ? "loading" : "ready";
  return (
    <div className={`span-${span}`}>
      <ChartFrame
        spec={spec}
        status={status}
        loadingTitle={title}
        error={
          q.isError
            ? `${title}: ${q.error instanceof Error ? q.error.message : "request failed"}.`
            : undefined
        }
        {...(height !== undefined ? { height } : {})}
        {...(range !== undefined && onRange !== undefined ? { range, onRange } : {})}
      >
        {spec !== null && <Chart spec={spec} {...(height !== undefined ? { height } : {})} />}
      </ChartFrame>
    </div>
  );
}

// Builders are module-level so their identity is stable between renders.
const navCalm = (d: EndpointResponse<"nav">): ChartSpec => navSpec(d);
const stackedAbs = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  capitalStackedSpec(d, "absolute");
const stackedPct = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  capitalStackedSpec(d, "percent");
const spark = (title: string, key: "nav" | "aum" | "premiumBps" | "collateralRatio") => {
  const unit = key === "nav" ? "nav" : key === "aum" ? "usd" : key === "premiumBps" ? "bps" : "pct";
  return (d: EndpointResponse<"overview">): ChartSpec =>
    sparklineSpec(`spark-${key}`, title, d.data[key], unit, provenanceFrom(d.meta, key));
};
const sparkNav = spark("NAV, last 30 days", "nav");
const sparkAum = spark("AUM, last 30 days", "aum");
const sparkPremium = spark("Premium, last 30 days", "premiumBps");

export function ChartsGallery(): ReactNode {
  const [params, setParams] = useSearchParams();
  const raw = params.get("range");
  const range: RangeKey = (RANGES as readonly string[]).includes(raw ?? "")
    ? (raw as RangeKey)
    : "3m";
  const onRange = (r: RangeKey): void => setParams({ range: r }, { replace: true });

  const nav = useNav({ query: { range } });
  const navAll = useNav({ query: { range: "all" } });
  const market = useMarket();
  const flows = useFlows({ query: { range: "3m" } });
  const stack = useCapitalStack();
  const dist = useCapitalDistribution();
  const solvency = useSolvency();
  const yieldRes = useYieldComposition();
  const layers = useReinsuranceLayers();
  const summary = useReinsuranceSummary();
  const growth = usePointsGrowth();
  const conc = useConcentration();
  const board = useLeaderboard({ query: { page: 0, size: 25 } });
  const opps = useDefiOpportunities();
  const overview = useOverview();

  return (
    <main className="page">
      <h1>Chart gallery</h1>
      <p className="lede">
        Every chart type in the catalogue, drawn from the live API. Use the arrow keys on a focused
        chart to move the crosshair, the table button for the exact data, and the download button
        for PNG and CSV.
      </p>
      <div className="grid">
        <Panel
          q={nav}
          build={navCalm}
          title="NAV per ONyc"
          height={340}
          range={range}
          onRange={onRange}
        />
        <Panel q={overview} build={sparkNav} title="NAV sparkline" span={4} height={110} />
        <Panel q={overview} build={sparkAum} title="AUM sparkline" span={4} height={110} />
        <Panel q={overview} build={sparkPremium} title="Premium sparkline" span={4} height={110} />
        <Panel q={market} build={marketSpec} title="Market price vs NAV" span={6} />
        <Panel q={market} build={premiumBarsSpec} title="Premium / discount" span={6} />
        <Panel q={flows} build={waterfallSpec} title="What moved AUM" span={5} height={300} />
        <Panel q={stack} build={capitalStackBarSpec} title="Capital stack" span={7} height={220} />
        <Panel q={dist} build={stackedAbs} title="Where the capital sits" height={340} />
        <Panel q={dist} build={stackedPct} title="Share of capital by protocol" height={340} />
        <Panel
          q={dist}
          build={capitalTreemapSpec}
          title="Capital by protocol"
          span={6}
          height={300}
        />
        <Panel
          q={solvency}
          build={reservesTreemapSpec}
          title="Reserves by venue and asset"
          span={6}
          height={300}
        />
        <Panel q={yieldRes} build={collateralSankeySpec} title="Collateral by asset" height={380} />
        <Panel
          q={layers}
          build={(d) => layersGanttSpec(d)}
          title="Layers from inception to renewal"
          height={560}
        />
        <Panel
          q={layers}
          build={layersBubbleSpec}
          title="Expected yield against expected loss ratio"
          span={6}
          height={340}
        />
        <Panel
          q={summary}
          build={renewalBarsSpec}
          title="Capital rolling off by renewal month"
          span={6}
        />
        <Panel q={navAll} build={navCalendarSpec} title="Daily NAV increment" height={200} />
        <Panel q={growth} build={pointsCalendarSpec} title="Daily points emission" height={200} />
        <Panel
          q={conc}
          build={lorenzSpec}
          title="How concentrated points are"
          span={6}
          height={340}
        />
        <Panel
          q={board}
          build={(d) => leaderboardBarsSpec(d)}
          title="Top wallets by points"
          span={6}
        />
        <Panel q={conc} build={venueMixBarsSpec} title="Points by venue" span={6} />
        <Panel
          q={opps}
          build={opportunitiesScatterSpec}
          title="DeFi opportunities"
          span={6}
          height={340}
        />
        <Panel
          q={market}
          build={coverageBulletSpec}
          title="Liquidity coverage"
          span={6}
          height={230}
        />
        <Panel
          q={solvency}
          build={collateralBulletSpec}
          title="Collateralisation"
          span={6}
          height={230}
        />
        <Panel
          q={opps}
          build={opportunityMultiplesSpec}
          title="APY history per opportunity"
          height={120}
        />
      </div>
      <p className="disclaimer">
        ONyc Terminal is an unofficial, community-built, read-only analytics tool. It is not
        affiliated with or endorsed by OnRe. Nothing here is financial advice.
      </p>
    </main>
  );
}
