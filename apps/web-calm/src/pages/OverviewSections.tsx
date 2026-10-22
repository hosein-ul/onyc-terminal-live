import { Named } from "../ui/Badge";
import {
  capitalStackedSpec,
  collateralBarsSpec,
  sparklineSpec,
  waterfallSpec,
  type ChartSpec,
} from "@onyc/chart-specs";
import {
  formatCompact,
  formatDate,
  formatNumber,
  formatPercent,
  formatRelativeAge,
  formatUsdCompact,
} from "@onyc/format";
import {
  FILTER_RULE,
  MIN_TVL_USD,
  pickStrategies,
  SECTIONS,
  estimatePointsPerUsdPerDay,
  type PointsPulse,
  type SectionId,
  type Strategy,
  type Vital,
} from "@onyc/insights";
import type { OverviewModel } from "@onyc/insights/react";
import type { EndpointResponse, Meta } from "@onyc/sdk";
import { useChainActivity, useLeaderboard, useYieldComposition } from "@onyc/sdk/react";
import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Chart, Panel } from "../charts";
import { shortAddress } from "../lib/format";
import { Card, EmptyState, ExternalLink, Notice, Pill, Skeleton } from "../ui/kit";
import { Provenance } from "../ui/Provenance";
import { ChainFeed, KIND_LABEL, solscanTx } from "../ui/ChainFeed";
import { StatusIcon } from "../ui/Status";
import { WalletLink } from "../lib/wallet";
import { Gloss, TermHint, TermNote } from "../ui/Term";

const SEVERITY = { info: "neutral", watch: "watch", alert: "bad" } as const;
const TONE = { good: "good", watch: "watch", bad: "bad", neutral: "neutral" } as const;
const LIGHT_WORD = { ok: "OK", watch: "Watch", alert: "Alert", unavailable: "No data" } as const;
const LIGHT_TONE = { ok: "good", watch: "watch", alert: "bad", unavailable: "neutral" } as const;

const flowsBuild = (d: EndpointResponse<"flows">): ChartSpec => waterfallSpec(d);

// ---------------------------------------------------------------------------------------------
// Sticky section nav and persona switch
// ---------------------------------------------------------------------------------------------

export function SectionNav({ order }: { order: SectionId[] }) {
  const [active, setActive] = useState<SectionId>("now");

  useEffect(() => {
    const els = order
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null);
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit !== undefined) setActive(hit.target.id as SectionId);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [order]);

  const go = (id: SectionId): void => {
    const el = document.getElementById(id);
    if (el === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="sectionbar">
      <nav aria-label="Sections of this page" className="sectionbar-links">
        {order.map((id) => {
          const s = SECTIONS.find((x) => x.id === id);
          if (s === undefined) return null;
          return (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go(id);
              }}
            >
              {s.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Now: headline and vitals
// ---------------------------------------------------------------------------------------------

export function Headline({ m }: { m: OverviewModel }) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const spread = m.q.overview.data?.data.sourceCheck.spread ?? null;
  return (
    <div className="headline">
      <div className="eyebrow">{today}</div>
      <h1 className="headline-text">Overview</h1>
      {spread !== null && (
        <div className="headline-meta">
          <Link className="badge-link" to="/health">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
            Sources differ by {formatPercent(Math.abs(spread), 1)} · see Data Health
          </Link>
        </div>
      )}
    </div>
  );
}

/** The NAV figure and its chart: the first thing on the page. */
export function NavHero({ m, children }: { m: OverviewModel; children: ReactNode }) {
  const v = m.vitals.find((x) => x.id === "nav");
  const delta = v?.detail.match(/^[+−-][\d.,]+%/)?.[0] ?? null;
  return (
    <div className="navhero">
      <div className="navhero-top">
        <div className="navhero-label">
          NAV per ONyc <TermHint id="nav" />
        </div>
        {v === undefined ? (
          <Skeleton height={56} width={260} />
        ) : (
          <>
            <span className="navhero-number">{v.value}</span>
            <span className="navhero-unit">USDC</span>
            {delta !== null && (
              <span className="navhero-delta">
                {delta} <span className="tone-neutral">in 30 days</span>
              </span>
            )}
          </>
        )}
      </div>
      {children}
    </div>
  );
}

/** Six lights in one short list, next to the chart. The twelve checks with their limits are on the Risk Signals page. */
export function SafetyGlance({ m }: { m: OverviewModel }) {
  const ok = m.safety.filter((l) => l.state === "ok").length;
  return (
    <aside className="glance" aria-label="Safety at a glance">
      <div className="glance-head">
        <h2>Safety</h2>
        <Link to="/risk">All twelve checks</Link>
      </div>
      {m.q.risk.isError ? (
        <p className="glance-count">The risk signals could not be loaded.</p>
      ) : (
        <>
          <p className="glance-count">
            <b>
              {ok} of {m.safety.length}
            </b>{" "}
            checks inside their limit
          </p>
          <ul>
            {m.safety.map((l) => (
              <li key={l.id} className={`light light-${LIGHT_TONE[l.state]}`}>
                <StatusIcon state={LIGHT_TONE[l.state]} />
                <span>{l.label}</span>
                <span className="light-value">
                  {l.value} <span className="light-word">{LIGHT_WORD[l.state]}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function VitalCard({ v }: { v: Vital }) {
  const meta: Meta = { source: v.source, fetchedAt: v.fetchedAt, stale: false };
  const spark = useMemo(
    () =>
      v.kpi === null
        ? null
        : sparklineSpec(`vital-${v.id}`, v.label, v.kpi, v.sparkUnit, {
            source: v.source,
            fetchedAt: v.fetchedAt,
            stale: false,
          }),
    [v],
  );
  const neg = v.value.startsWith("−");
  return (
    <article className={`vital vital-${TONE[v.tone]}`} data-vital={v.id}>
      <div className="vital-label">
        <StatusIcon state={TONE[v.tone]} />
        {v.label}
        <TermHint id={v.termId} />
      </div>
      <div className="vital-value">
        {neg ? (
          <>
            <span className="sign">−</span>
            {v.value.slice(1)}
          </>
        ) : (
          v.value
        )}
      </div>
      {v.unitNote !== null && <div className="vital-unit">{v.unitNote}</div>}
      <div className="vital-detail">{v.detail}</div>
      {spark !== null && spark.empty === undefined ? (
        <div className="vital-spark">
          <Chart spec={spark} height={36} />
        </div>
      ) : v.collecting !== null ? (
        <div className="kpi-note">Collecting history since {formatDate(v.collecting)}</div>
      ) : null}
      <Provenance meta={meta} />
    </article>
  );
}

/** The newest program transactions as a tile of the bento, linking to the Activity page. */
function LiveTile() {
  const q = useChainActivity({ query: { limit: 4 } });
  const events = q.data?.data.events ?? [];
  return (
    <article className="vital live-tile">
      <h3>
        <span>
          <span className="live-dot" aria-hidden="true" />
          Live on chain
        </span>
        <Link to="/activity">All transactions</Link>
      </h3>
      {q.isLoading ? (
        <Skeleton height={120} />
      ) : events.length === 0 ? (
        <p className="tone-neutral">No program transactions recorded yet.</p>
      ) : (
        <ul className="live-list">
          {events.map((e) => (
            <li key={`${e.signature}-${e.kind}`}>
              <a href={solscanTx(e.signature)} target="_blank" rel="noopener noreferrer">
                {KIND_LABEL[e.kind]}
                {e.onyc !== null && e.onyc > 0
                  ? ` · ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(e.onyc)} ONyc`
                  : ""}
              </a>
              <small>{formatRelativeAge(e.ts)}</small>
            </li>
          ))}
        </ul>
      )}
      <Provenance meta={q.data?.meta["events"]} />
    </article>
  );
}

export function Vitals({ m }: { m: OverviewModel }) {
  return (
    <section className="vitals" aria-label="More numbers that matter">
      {m.q.overview.data === undefined
        ? SECTION_PLACEHOLDERS.map((k) => (
            <div key={k} className="vital">
              <Skeleton height={110} />
            </div>
          ))
        : m.vitals.filter((v) => v.id !== "nav").map((v) => <VitalCard key={v.id} v={v} />)}
      {m.q.overview.data !== undefined && <LiveTile />}
    </section>
  );
}

const SECTION_PLACEHOLDERS = ["a", "b", "c", "d", "e"];

// ---------------------------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------------------------

export function Flows({ m }: { m: OverviewModel }) {
  const red = m.q.redemptions.data;
  const rows = red?.data.log.rows.slice(0, 5) ?? [];
  return (
    <div className="grid">
      <Panel
        q={m.q.flows}
        build={flowsBuild}
        title="What moved AUM this month"
        span={6}
        height={280}
      />
      <div className="span-6">
        <Card title="Recent redemptions" subtitle="The newest rows of OnRe's public log">
          <TermNote id="redemption-fee" />
          {red === undefined ? (
            <Skeleton height={160} />
          ) : rows.length === 0 ? (
            <EmptyState title="No redemptions in the log" />
          ) : (
            <table className="mini">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Wallet</th>
                  <th className="num">ONyc</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.requestPda}>
                    <td>{r.requestedAt === null ? "—" : formatDate(r.requestedAt)}</td>
                    <td>{shortAddress(r.redeemer)}</td>
                    <td className="num">{formatCompact(r.amount)}</td>
                    <td>{r.status.toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {red !== undefined && <p className="rule">{red.data.log.note}</p>}
          {red !== undefined && <Provenance meta={red.meta["log"]} />}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Changes and capital
// ---------------------------------------------------------------------------------------------

export function Changes({ m }: { m: OverviewModel }) {
  const o = m.q.overview.data;
  // Source outages belong on Data Health; this feed lists changes to ONyc itself.
  const events = (o?.data.whatChanged.events ?? []).filter((e) => !e.kind.startsWith("source_"));
  return (
    <>
      <Card title="What changed since yesterday" subtitle="From the event feed">
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
                  <strong>
                    <Gloss text={e.title} />
                  </strong>
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
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Capital: who holds it, where it sits, what backs it
// ---------------------------------------------------------------------------------------------

const stackedAbs = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  capitalStackedSpec(d, "absolute");
const stackedPct = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  capitalStackedSpec(d, "percent");
const collateralBuild = (d: EndpointResponse<"yieldComposition">): ChartSpec =>
  collateralBarsSpec(d);

/** Capital by protocol today as a ranked list with each logo, so the name and the number sit together. */
function ProtocolShares({ m }: { m: OverviewModel }) {
  const d = m.q.capitalDistribution.data;
  const rows = [...(d?.data.distribution ?? [])].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  const top = rows[0]?.share ?? 0;
  return (
    <Card
      title="Capital by protocol"
      subtitle={
        d?.data.totalAumUsd == null ? "Today" : `${formatUsdCompact(d.data.totalAumUsd)} in total`
      }
      className="protocols"
    >
      {d === undefined ? (
        <Skeleton height={220} />
      ) : (
        <ul className="pshare">
          {rows.map((r) => (
            <li key={r.protocol}>
              <Named name={r.protocol} size={26}>
                <span className="pshare-name">{r.protocol}</span>
              </Named>
              <span className="pshare-bar" aria-hidden="true">
                <i
                  style={{ width: `${top > 0 ? Math.max(2, ((r.share ?? 0) / top) * 100) : 0}%` }}
                />
              </span>
              <b>{formatPercent(r.share, 1)}</b>
              <small>{formatUsdCompact(r.capitalUsd)}</small>
            </li>
          ))}
        </ul>
      )}
      <Provenance meta={m.q.capitalDistribution.data?.meta["distribution"]} />
    </Card>
  );
}

export function Capital({ m }: { m: OverviewModel }) {
  const yieldQ = useYieldComposition();
  return (
    <div className="grid">
      <div className="span-5">
        <ProtocolShares m={m} />
      </div>
      <Panel
        q={m.q.capitalDistribution}
        build={stackedPct}
        title="Share of capital by protocol"
        span={7}
        height={300}
      />
      <Panel
        q={m.q.capitalDistribution}
        build={stackedAbs}
        title="Where the capital sits"
        span={6}
        height={300}
      />
      <Panel q={yieldQ} build={collateralBuild} title="Collateral by asset" span={6} height={300} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Best places: the highest yield, the most points, and how points work
// ---------------------------------------------------------------------------------------------

function PlaceRow({
  s,
  i,
  by,
  nav,
}: {
  s: Strategy;
  i: number;
  by: "yield" | "points";
  nav: number | null;
}) {
  const pts = estimatePointsPerUsdPerDay(s.pointsMultiplier, nav);
  return (
    <li className="pl">
      <span className="place-rank">{String(i + 1).padStart(2, "0")}</span>
      <div className="pl-main">
        <Named name={s.protocol} size={24}>
          <strong>{s.protocol}</strong>
        </Named>
        <span className="place-sub">
          {s.strategy} · {s.assets}
        </span>
      </div>
      <div className="pl-num">
        <b>
          {by === "yield"
            ? formatPercent(s.apy, 1)
            : s.pointsMultiplier === null
              ? "—"
              : `${s.pointsMultiplier}x`}
        </b>
        <small>
          {by === "yield"
            ? `${formatUsdCompact(s.tvl)} TVL`
            : `${formatPercent(s.apy, 1)} APY${pts === null ? "" : ` · ≈${formatNumber(pts, 1)} pts/$ a day`}`}
        </small>
      </div>
      {s.link !== "" && (
        <ExternalLink href={s.link}>
          <span className="sr-only">
            Open {s.protocol} {s.strategy}
          </span>
        </ExternalLink>
      )}
    </li>
  );
}

export function BestPlaces({ m }: { m: OverviewModel }) {
  const opp = m.q.opportunities.data;
  const nav = m.q.overview.data?.data.nav.value ?? null;
  const yieldPicks = useMemo(
    () => (opp === undefined ? [] : pickStrategies(opp.data.opportunities, "yield")),
    [opp],
  );
  const pointPicks = useMemo(
    () => (opp === undefined ? [] : pickStrategies(opp.data.opportunities, "points")),
    [opp],
  );
  const pulse = m.pulse;
  const g = pulse.globalMultiplier;
  return (
    <div className="grid">
      <div className="span-6">
        <Card
          title="Highest yield"
          subtitle={`${FILTER_RULE.yield} Venues under ${formatUsdCompact(MIN_TVL_USD)} of TVL are left out.`}
        >
          {opp === undefined ? (
            <Skeleton height={260} />
          ) : (
            <ol className="places">
              {yieldPicks.map((s, i) => (
                <PlaceRow key={s.key} s={s} i={i} by="yield" nav={nav} />
              ))}
            </ol>
          )}
          <Provenance meta={opp?.meta["opportunities"]} />
        </Card>
      </div>
      <div className="span-6">
        <Card title="Most points" subtitle="Highest points multiplier first, then APY.">
          {opp === undefined ? (
            <Skeleton height={260} />
          ) : (
            <ol className="places">
              {pointPicks.map((s, i) => (
                <PlaceRow key={s.key} s={s} i={i} by="points" nav={nav} />
              ))}
            </ol>
          )}
          <Provenance meta={opp?.meta["opportunities"]} />
        </Card>
      </div>
      <div className="span-12">
        <Card title="How points work" className="howpoints">
          <div className="howpoints-grid">
            <div>
              <p className="formula">
                points = ONyc balance × days held × 1 point per ONyc a day × venue multiplier
              </p>
              <p className="tone-neutral">
                That is OnRe's formula. Where you hold ONyc sets the multiplier, so the same balance
                earns more in some venues than in others. The estimate per $1 a day is this tool's
                arithmetic: multiplier divided by NAV.
              </p>
            </div>
            <dl className="howpoints-stats">
              <div>
                <dt>
                  Handed out per day <TermHint id="points-multiplier" />
                </dt>
                <dd>
                  {pulse.dailyEmission === null ? "—" : formatCompact(pulse.dailyEmission.value)}
                </dd>
              </div>
              <div>
                <dt>Global multiplier</dt>
                <dd>{g === null ? "—" : String(g.value)}</dd>
              </div>
            </dl>
          </div>
          <Provenance meta={m.q.concentration.data?.meta["multipliers"]} />
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Points: estimates by venue and the leaderboard
// ---------------------------------------------------------------------------------------------

function LeaderboardTop() {
  const q = useLeaderboard({ query: { page: 0, size: 10 } });
  const d = q.data?.data;
  return (
    <Card
      title="Leaderboard"
      subtitle={
        d?.snapshotDate
          ? `Top 10 of ${formatCompact(d.totalRows)} wallets · crawl of ${d.snapshotDate}`
          : "Latest daily crawl"
      }
      actions={<Link to="/points">Full leaderboard</Link>}
    >
      {q.isError ? (
        <Notice tone="bad">The leaderboard could not be loaded.</Notice>
      ) : d === undefined ? (
        <Skeleton height={260} />
      ) : (
        <table className="mini lb">
          <thead>
            <tr>
              <th>#</th>
              <th>Wallet</th>
              <th className="num">Points</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.address}>
                <td>{r.rank}</td>
                <td>
                  <WalletLink address={r.address} />
                </td>
                <td className="num">{formatCompact(r.totalPoints)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Provenance meta={q.data?.meta["rows"]} />
    </Card>
  );
}

export function PointsSection({ pulse, m }: { pulse: PointsPulse; m: OverviewModel }) {
  return (
    <div className="grid">
      <div className="span-5">
        <Card
          title="Points per $1 a day, by venue"
          subtitle="Our estimate from OnRe's multipliers, not OnRe's figure"
        >
          <table className="mini">
            <thead>
              <tr>
                <th>Venue</th>
                <th className="num">Multiplier</th>
                <th className="num">Estimate</th>
              </tr>
            </thead>
            <tbody>
              {pulse.venues.map((v) => (
                <tr key={`${v.protocol}-${v.strategy}`}>
                  <td>
                    <Named name={v.protocol} size={18} /> · {v.strategy}
                  </td>
                  <td className="num">{v.multiplier}x</td>
                  <td className="num">
                    {v.perUsd === null ? "—" : `≈ ${formatNumber(v.perUsd, 2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Provenance meta={m.q.concentration.data?.meta["multipliers"]} />
        </Card>
      </div>
      <div className="span-7">
        <LeaderboardTop />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Activity: the newest transactions, with their addresses
// ---------------------------------------------------------------------------------------------

export function ActivitySection() {
  return (
    <Card
      title="Live on chain"
      subtitle="The newest transactions of the OnRe program, from Solana"
      actions={<Link to="/activity">All transactions</Link>}
    >
      <ChainFeed limit={8} />
    </Card>
  );
}
