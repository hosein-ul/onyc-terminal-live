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
  formatBps,
  formatCompact,
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
  useRedemptions,
} from "@onyc/sdk/react";
import { useMemo } from "react";
import { Chart, ChartFrame, Panel } from "../charts";
import { signedPct } from "../lib/format";
import { useRange } from "../lib/useRange";
import { Notice, PageHeader, Pill, Skeleton } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

type Overview = EndpointResponse<"overview">;

const flowsBuild = (d: EndpointResponse<"flows">): ChartSpec => waterfallSpec(d);
const stackBuild = (d: EndpointResponse<"capitalStack">): ChartSpec | null =>
  capitalStackBarSpec(d);
const protocolBuild = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  protocolBarsSpec(d);
const supplySpark = (o: Overview): ChartSpec =>
  sparklineSpec(
    "spark-supply",
    "Circulating supply",
    o.data.circulatingSupply,
    "count",
    provenanceFrom(o.meta, "circulatingSupply"),
  );

const SEVERITY = { info: "neutral", watch: "watch", alert: "bad" } as const;

/** The Pastel overview: a sentence, then three columns of blocks, each coloured by its topic. */
export function OverviewPage() {
  const overview = useOverview();
  const [range, setRange] = useRange("all");
  const navQ = useNav({ query: { range } });
  const flowsQ = useFlows({ query: { range: "1m" } });
  const stackQ = useCapitalStack();
  const distQ = useCapitalDistribution();
  const redemptionsQ = useRedemptions();

  const o = overview.data;
  const navHero = useMemo(() => (navQ.data === undefined ? null : navSpec(navQ.data)), [navQ.data]);
  const sinceLaunch = navQ.data?.data.returns.find((w) => w.window === "inception")?.return ?? null;
  const events = (o?.data.whatChanged.events ?? []).filter((e) => !e.kind.startsWith("source_"));
  const spread = o?.data.sourceCheck.spread ?? null;
  const offers = redemptionsQ.data?.data.offers ?? [];
  const cheapestRequest = offers.length === 0 ? null : Math.min(...offers.map((x) => x.feeBps));
  const cheapestAmm = offers.length === 0 ? null : Math.min(...offers.map((x) => x.propAmmFeeBps));

  const title =
    o === undefined || o.data.nav.value === null || o.data.apy.value === null
      ? "ONyc at a glance"
      : `ONyc is worth ${formatNav(o.data.nav.value, 4)} USDC and earns ${formatPercent(o.data.apy.value, 2)} a year${sinceLaunch === null ? "" : `, up ${formatPercent(sinceLaunch, 1)} since launch`}`;

  return (
    <>
      <PageHeader eyebrow="Overview" title={title} />

      {overview.isError && (
        <Notice tone="bad" title="The overview could not be loaded">
          {overview.error instanceof Error ? overview.error.message : "The API did not answer."}{" "}
          Nothing below is invented while it is down.
        </Notice>
      )}

      <div className="masonry">
        <div className="col">
          <section className="block block-sky" aria-label="NAV per ONyc">
            <div className="label">NAV per ONyc</div>
            <div className="big-xl">
              {o === undefined ? (
                <Skeleton height={60} width={240} />
              ) : (
                formatNav(o.data.nav.value, 4)
              )}
            </div>
            <ChartFrame
              spec={navHero}
              status={navQ.isError ? "error" : navQ.isLoading ? "loading" : "ready"}
              loadingTitle="NAV per ONyc"
              error="NAV history could not be loaded."
              range={range}
              onRange={setRange}
              height={190}
              plain
              hideTitle
            >
              {navHero !== null && <Chart spec={navHero} height={190} />}
            </ChartFrame>
            {sinceLaunch !== null && (
              <div className="note">{signedPct(sinceLaunch, 2)} since launch</div>
            )}
          </section>

          <section className="block block-neutral">
            <h2>Peg and liquidity</h2>
            {o === undefined ? (
              <Skeleton height={60} />
            ) : (
              <>
                <div className="big">{formatBps(o.data.premiumBps.value)}</div>
                <div className="note">market price against NAV</div>
                <div className="note">
                  Liquidity layer {formatPercent(o.data.liquidityCoverage.value, 1)} of AUM, target
                  15%
                </div>
                <Provenance meta={o.meta["premiumBps"]} />
              </>
            )}
          </section>
        </div>

        <div className="col">
          <div className="duo">
            <section className="block block-mint">
              <div className="label">Live APY</div>
              <div className="big">
                {o === undefined ? "…" : formatPercent(o.data.apy.value, 2)}
              </div>
              {o !== undefined && <Provenance meta={o.meta["apy"]} />}
            </section>
            <section className="block block-rose">
              <div className="label">AUM</div>
              <div className="big">
                {o === undefined ? "…" : formatUsdCompact(o.data.aum.value)}
              </div>
              {o !== undefined && <Provenance meta={o.meta["aum"]} />}
            </section>
          </div>

          <div data-topic="rose">
            <Panel q={stackQ} build={stackBuild} title="Capital stack" height={190} />
          </div>
          <div data-topic="rose">
            <Panel q={distQ} build={protocolBuild} title="Capital by protocol" height={260} />
          </div>

          <section className="block block-butter">
            <h2>Costs</h2>
            <div className="note">
              Redemption by request: from{" "}
              {cheapestRequest === null ? "—" : formatBps(cheapestRequest)}
            </div>
            <div className="note">
              Redemption through PropAMM: from {cheapestAmm === null ? "—" : formatBps(cheapestAmm)}
            </div>
            <Provenance meta={redemptionsQ.data?.meta["offers"]} />
          </section>
        </div>

        <div className="col">
          <section className="block block-neutral">
            <h2>Circulating supply</h2>
            {o === undefined ? (
              <Skeleton height={80} />
            ) : (
              <>
                <div className="big">
                  {formatCompact(o.data.circulatingSupply.value)}{" "}
                  <span className="label">ONyc</span>
                </div>
                {o.data.circulatingSupply.change !== null &&
                  o.data.circulatingSupply.historySince === null && (
                    <div className="note">
                      <Pill tone={o.data.circulatingSupply.change < 0 ? "bad" : "good"}>
                        {signedPct(o.data.circulatingSupply.change, 2)}
                      </Pill>{" "}
                      over {o.data.circulatingSupply.period}
                    </div>
                  )}
                <Chart spec={supplySpark(o)} height={64} />
                <Provenance meta={o.meta["circulatingSupply"]} />
              </>
            )}
          </section>

          <Panel q={flowsQ} build={flowsBuild} title="What moved AUM this month" height={260} />

          <section className="block block-neutral">
            <h2>New since yesterday</h2>
            {events.length === 0 ? (
              <p className="note">
                Nothing new: no re-pricing, down-tick or layer change was detected.
              </p>
            ) : (
              <ul className="feed">
                {events.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <Pill tone={SEVERITY[e.severity]}>{e.severity}</Pill>
                    <div>
                      <strong>{e.title}</strong>
                      <div>
                        {formatRelativeAge(e.ts)} · {formatDate(e.ts)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="block block-neutral">
            <h2>Data check</h2>
            <div className="note">
              {o === undefined
                ? "…"
                : `${o.data.sourceCheck.sources.length} sources${spread === null ? "" : `, ${formatPercent(spread, 1)} apart`}`}
            </div>
            {o !== undefined && (
              <div className="rows">
                {o.data.sourceCheck.sources.map((s) => (
                  <div key={s.id}>
                    <span>{s.label}</span>
                    <b>{formatUsdCompact(s.aumUsd)}</b>
                  </div>
                ))}
              </div>
            )}
            {o !== undefined && <Provenance meta={o.meta["sourceCheck"]} />}
          </section>
        </div>
      </div>
    </>
  );
}
