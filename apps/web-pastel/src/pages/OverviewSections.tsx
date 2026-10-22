import {
  capitalStackBarSpec,
  protocolBarsSpec,
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
  PERSONAS,
  RISK_KIND_LABEL,
  RISK_KIND_NOTE,
  SECTIONS,
  estimatePointsPerUsdPerDay,
  type Light,
  type Persona,
  type PointsPulse,
  type SectionId,
  type Strategy,
  type StrategyFilter,
  type Vital,
} from "@onyc/insights";
import type { OverviewModel } from "@onyc/insights/react";
import type { EndpointResponse, Meta } from "@onyc/sdk";
import { useWallet } from "@onyc/sdk/react";
import { ArrowUpRight, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Chart, Panel } from "../charts";
import { shortAddress } from "../lib/format";
import { Card, EmptyState, ExternalLink, Notice, Pill, Segmented, Skeleton } from "../ui/kit";
import { Provenance } from "../ui/Provenance";
import { Gloss, TermHint, TermNote } from "../ui/Term";

const SEVERITY = { info: "neutral", watch: "watch", alert: "bad" } as const;
const TONE = { good: "good", watch: "watch", bad: "bad", neutral: "neutral" } as const;
const LIGHT_WORD = { ok: "OK", watch: "Watch", alert: "Alert", unavailable: "No data" } as const;
const LIGHT_TONE = { ok: "good", watch: "watch", alert: "bad", unavailable: "neutral" } as const;

const flowsBuild = (d: EndpointResponse<"flows">): ChartSpec => waterfallSpec(d);
const stackBuild = (d: EndpointResponse<"capitalStack">): ChartSpec | null =>
  capitalStackBarSpec(d);
const protocolBuild = (d: EndpointResponse<"capitalDistribution">): ChartSpec =>
  protocolBarsSpec(d);

// ---------------------------------------------------------------------------------------------
// Sticky section nav and persona switch
// ---------------------------------------------------------------------------------------------

export function SectionNav({
  order,
  persona,
  onPersona,
}: {
  order: SectionId[];
  persona: Persona;
  onPersona: (p: Persona) => void;
}) {
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
      <div className="sectionbar-persona">
        <span id="persona-label">View as</span>
        <Segmented
          label="View as"
          value={persona}
          onChange={onPersona}
          options={PERSONAS.map((p) => ({ value: p.id, label: p.label }))}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Now: headline and vitals
// ---------------------------------------------------------------------------------------------

/** Numbers in the sentence (amounts, percentages, counts) sit in coloured pills, as everywhere in this app. */
const TOPICS = ["sky", "mint", "rose", "lilac", "butter"];
function NumPills({ text }: { text: string }) {
  const money = /^\$\d[\d.,]*[KMBT]?$/;
  const count = /^\d[\d.,]*%?$/;
  const parts = text.split(/(\$\d[\d.,]*[KMBT]?|\d[\d.,]*%?)/g);
  let n = 0;
  return (
    <>
      {parts.map((p, i) =>
        money.test(p) || count.test(p) ? (
          <span key={i} className="num-pill" data-topic={TOPICS[n++ % TOPICS.length]}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function Headline({ m }: { m: OverviewModel }) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const spread = m.q.overview.data?.data.sourceCheck.spread ?? null;
  const h = m.headline;
  return (
    <div className="headline">
      <div className="eyebrow">{today}</div>
      {h === null ? (
        <Skeleton height={44} width="70%" />
      ) : (
        <h1 className={`headline-text tone-head-${h.tone}`}>
          <NumPills text={h.text} />
        </h1>
      )}
      <div className="headline-meta">
        {spread !== null && (
          <Link className="badge-link" to="/risk#sources">
            Sources differ by {formatPercent(Math.abs(spread), 1)} · see Risk &amp; Reinsurance
          </Link>
        )}
        <span className="tone-neutral">
          Written from the live numbers below; nothing here is a forecast or advice.
        </span>
      </div>
    </div>
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
          <Chart spec={spark} height={44} />
        </div>
      ) : v.collecting !== null ? (
        <div className="kpi-note">Collecting history since {formatDate(v.collecting)}</div>
      ) : null}
      <Provenance meta={meta} />
    </article>
  );
}

export function Vitals({ m }: { m: OverviewModel }) {
  return (
    <section className="vitals" aria-label="Six numbers that matter">
      {m.q.overview.data === undefined
        ? SECTION_PLACEHOLDERS.map((k) => (
            <Card key={k}>
              <Skeleton height={110} />
            </Card>
          ))
        : m.vitals.map((v) => <VitalCard key={v.id} v={v} />)}
    </section>
  );
}

const SECTION_PLACEHOLDERS = ["a", "b", "c", "d", "e", "f"];

// ---------------------------------------------------------------------------------------------
// Safety board
// ---------------------------------------------------------------------------------------------

function SafetyRow({ l }: { l: Light }) {
  const asOf = l.asOf === null ? "" : ` · ${formatRelativeAge(l.asOf)}`;
  return (
    <li className={`light light-${LIGHT_TONE[l.state]}`}>
      <span className="light-dot" aria-hidden="true" />
      <div className="light-body">
        <div className="light-head">
          <span className="light-label">
            {l.label}
            {l.termId !== null && <TermHint id={l.termId} />}
          </span>
          <span className="light-value">
            {l.value} <span className="light-word">{LIGHT_WORD[l.state]}</span>
          </span>
        </div>
        <div className="light-sub">
          {l.threshold}
          {l.note !== null && l.id === "top_protocol" ? ` · ${l.note}` : ""}
        </div>
        <div className="light-src">
          {l.source}
          {asOf}
        </div>
      </div>
    </li>
  );
}

export function SafetyBoard({ m }: { m: OverviewModel }) {
  return (
    <Card
      title="Safety board"
      subtitle="Six checks, each with its own limit. Limits are this tool's settings, not OnRe's."
      className="safety"
    >
      {m.q.risk.isError ? (
        <Notice tone="bad" title="The risk signals could not be loaded">
          Nothing is shown as safe while they are missing.
        </Notice>
      ) : (
        <ul className="lights">
          {m.safety.map((l) => (
            <SafetyRow key={l.id} l={l} />
          ))}
        </ul>
      )}
      <p className="card-foot">
        <Link to="/risk">All twelve signals and the reasoning on Risk &amp; Reinsurance</Link>
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Best places for ONyc now
// ---------------------------------------------------------------------------------------------

const FILTERS: { value: StrategyFilter; label: string }[] = [
  { value: "yield", label: "Yield" },
  { value: "points", label: "Points" },
  { value: "conservative", label: "Conservative" },
];

function StrategyRow({ s, i, nav }: { s: Strategy; i: number; nav: number | null }) {
  const pts = estimatePointsPerUsdPerDay(s.pointsMultiplier, nav);
  return (
    <li className="place">
      <span className="place-rank">{i + 1}</span>
      <div className="place-main">
        <div className="place-name">
          <strong>{s.protocol}</strong> · {s.strategy}
          {s.isNew && <Pill tone="accent">new</Pill>}
        </div>
        <div className="place-sub">
          {s.assets} ·{" "}
          <span title={RISK_KIND_NOTE[s.kind]} className="place-kind">
            {RISK_KIND_LABEL[s.kind]}
          </span>
        </div>
      </div>
      <div className="place-nums">
        <div>
          <b>{formatPercent(s.apy, 1)}</b>
          <small>APY</small>
        </div>
        <div>
          <b>{formatUsdCompact(s.tvl)}</b>
          <small>TVL</small>
        </div>
        <div>
          <b>{s.pointsMultiplier === null ? "—" : `${s.pointsMultiplier}x`}</b>
          <small>points{pts === null ? "" : ` · ≈${formatNumber(pts, 1)}/$ a day`}</small>
        </div>
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
  const [filter, setFilter] = useState<StrategyFilter>("yield");
  const opp = m.q.opportunities.data;
  const nav = m.q.overview.data?.data.nav.value ?? null;
  const picks = useMemo(
    () => (opp === undefined ? [] : pickStrategies(opp.data.opportunities, filter)),
    [opp, filter],
  );
  return (
    <Card
      title="Best places for ONyc now"
      subtitle="Five venues from OnRe's own list of where ONyc can be used"
      actions={<Segmented label="Sort by" value={filter} onChange={setFilter} options={FILTERS} />}
      className="best"
    >
      <p className="rule">
        {FILTER_RULE[filter]} Venues under {formatUsdCompact(MIN_TVL_USD)} of TVL or marked coming
        soon are left out. Risk labels are this tool's reading, not OnRe's rating.
      </p>
      {opp === undefined ? (
        <Skeleton height={220} />
      ) : picks.length === 0 ? (
        <EmptyState title="No venue matches">
          The list has nothing that fits this filter.
        </EmptyState>
      ) : (
        <ol className="places">
          {picks.map((s, i) => (
            <StrategyRow key={s.key} s={s} i={i} nav={nav} />
          ))}
        </ol>
      )}
      <Provenance meta={m.q.opportunities.data?.meta["opportunities"]} />
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Points pulse and wallet lookup
// ---------------------------------------------------------------------------------------------

const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function WalletBox() {
  const [text, setText] = useState("");
  const [address, setAddress] = useState<string | undefined>(undefined);
  const wallet = useWallet(address);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const t = text.trim();
    setAddress(SOLANA.test(t) ? t : undefined);
  };
  const bad = text.trim() !== "" && !SOLANA.test(text.trim());
  const w = wallet.data?.data;
  return (
    <div className="walletbox">
      <h3>Look up a wallet</h3>
      <form onSubmit={submit} className="walletbox-form">
        <label className="field">
          <span>Solana address</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste an address"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={bad}
          />
        </label>
        <button type="submit" className="btn" disabled={!SOLANA.test(text.trim())}>
          <Search size={16} aria-hidden="true" /> Look up
        </button>
      </form>
      {bad && <p className="tone-bad">That is not a Solana address.</p>}
      {wallet.isLoading && address !== undefined && <Skeleton height={60} />}
      {wallet.isError && <p className="tone-bad">The lookup failed; try again.</p>}
      {w !== undefined && !w.found && (
        <p className="tone-neutral">No points recorded for this wallet.</p>
      )}
      {w !== undefined && w.found && (
        <dl className="walletbox-result">
          <div>
            <dt>Rank</dt>
            <dd>
              {w.rank === null ? "—" : `#${formatNumber(w.rank, 0)}`}
              {w.totalUsers !== null && <small> of {formatCompact(w.totalUsers)}</small>}
            </dd>
          </div>
          <div>
            <dt>
              Rank change <TermHint id="rank-change" />
            </dt>
            <dd>
              {w.rankChangePerOnre === null
                ? "—"
                : `${w.rankChangePerOnre > 0 ? "+" : w.rankChangePerOnre < 0 ? "−" : ""}${Math.abs(w.rankChangePerOnre)}`}
              <small> per OnRe</small>
            </dd>
          </div>
          <div>
            <dt>Points</dt>
            <dd>{formatCompact(w.points)}</dd>
          </div>
        </dl>
      )}
      {address !== undefined && (
        <p className="card-foot">
          <Link to={`/wallet/${address}`}>
            Full breakdown on Wallet <ArrowUpRight size={14} aria-hidden="true" />
          </Link>{" "}
          · {shortAddress(address)}
        </p>
      )}
    </div>
  );
}

export function PointsPulse({ pulse, m }: { pulse: PointsPulse; m: OverviewModel }) {
  const g = pulse.globalMultiplier;
  return (
    <Card
      title="Points pulse"
      subtitle="What points are worth right now, and where they come from"
      className="pulse"
    >
      <TermNote id="points-multiplier" />
      <div className="pulse-grid">
        <div>
          <div className="pulse-stats">
            <div>
              <span className="stat-label">Points handed out per day</span>
              <b className="pulse-big">
                {pulse.dailyEmission === null ? "—" : formatCompact(pulse.dailyEmission.value)}
              </b>
              <small className="tone-neutral">
                {pulse.dailyEmission === null
                  ? ""
                  : `on ${formatDate(pulse.dailyEmission.date)}, all wallets`}
              </small>
            </div>
            <div>
              <span className="stat-label">
                Global multiplier
                <TermHint id="points-multiplier" />
              </span>
              <b className="pulse-big">{g === null ? "—" : String(g.value)}</b>
              <small className="tone-neutral">
                {g === null
                  ? ""
                  : `since ${formatDate(g.since)}, as reported. OnRe does not explain it.`}
              </small>
            </div>
          </div>
          <h3>Estimated points per $1 a day, by venue</h3>
          <table className="mini">
            <thead>
              <tr>
                <th>Venue</th>
                <th className="num">Multiplier</th>
                <th className="num">Our estimate</th>
              </tr>
            </thead>
            <tbody>
              {pulse.venues.map((v) => (
                <tr key={`${v.protocol}-${v.strategy}`}>
                  <td>
                    {v.protocol} · {v.strategy}
                  </td>
                  <td className="num">{v.multiplier}x</td>
                  <td className="num">
                    {v.perUsd === null ? "—" : `≈ ${formatNumber(v.perUsd, 2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rule">
            Our estimate, not OnRe's figure. Formula: {pulse.formula}. OnRe's docs give the
            multipliers and the base rate; your own personal multiplier is not visible and is not
            included.
          </p>
          <Provenance meta={m.q.concentration.data?.meta["multipliers"]} />
        </div>
        <WalletBox />
      </div>
    </Card>
  );
}

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
  );
}

export function Capital({ m }: { m: OverviewModel }) {
  return (
    <>
      <div className="grid">
        <Panel
          q={m.q.capitalStack}
          build={stackBuild}
          title="Capital stack"
          span={12}
          height={150}
        />
      </div>
      <div className="grid">
        <Panel
          q={m.q.capitalDistribution}
          build={protocolBuild}
          title="Capital by protocol"
          span={12}
          height={300}
        />
      </div>
    </>
  );
}
