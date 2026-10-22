import { collateralSankeySpec, type ChartSpec } from "@onyc/chart-specs";
import { formatDate, formatPercent, formatUsdCompact } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useOverview, useYieldComposition } from "@onyc/sdk/react";
import { useEffect, useState, type ReactNode } from "react";
import { Panel } from "../charts";
import { Embedded } from "../lib/embedded";
import { signedPct } from "../lib/format";
import { Card, Notice, PageHeader, Skeleton } from "../ui/kit";
import { Provenance } from "../ui/Provenance";
import { ChainPage, OnchainActivity } from "./Chain";
import { ActivityPage } from "./Activity";
import { CapitalDefiPage } from "./CapitalDefi";
import { DevelopersPage } from "./Developers";
import { HealthPage } from "./Health";
import { NavYieldPage } from "./NavYield";
import { PegLiquidityPage } from "./PegLiquidity";
import { PointsPage } from "./Points";
import { ReinsurancePage } from "./Reinsurance";
import { RiskPage } from "./Risk";

interface Part {
  id: string;
  label: string;
  node: ReactNode;
}

/** A page made of several older pages, each kept whole under its own anchor, with a bar to jump between them. */
function Combined({ title, lede, parts }: { title: string; lede: string; parts: Part[] }) {
  const [active, setActive] = useState(parts[0]?.id ?? "");
  const ids = parts.map((p) => p.id).join(",");
  useEffect(() => {
    const els = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null);
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit !== undefined) setActive(hit.target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ids]);
  const go = (id: string): void => {
    const el = document.getElementById(id);
    if (el === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };
  return (
    <>
      <PageHeader title={title} />
      <p className="lede page-lede">{lede}</p>
      <div className="sectionbar">
        <nav aria-label="Sections of this page" className="sectionbar-links">
          {parts.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              aria-current={active === p.id ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go(p.id);
              }}
            >
              {p.label}
            </a>
          ))}
        </nav>
      </div>
      {parts.map((p) => (
        <section key={p.id} id={p.id} className="part">
          <Embedded>{p.node}</Embedded>
        </section>
      ))}
    </>
  );
}

export function YieldPointsPage() {
  return (
    <Combined
      title="Yield & Points"
      lede="Where ONyc's return comes from, where to put it to work, and what points it earns."
      parts={[
        { id: "nav", label: "NAV & yield", node: <NavYieldPage /> },
        { id: "capital", label: "Capital & DeFi", node: <CapitalDefiPage /> },
        { id: "points", label: "Points", node: <PointsPage /> },
      ]}
    />
  );
}

const sankeyBuild = (d: EndpointResponse<"yieldComposition">): ChartSpec => collateralSankeySpec(d);

/** The seven AUM sources and the collateral flow, moved here from the Overview. */
function SourcesDetail() {
  const overview = useOverview();
  const yieldQ = useYieldComposition();
  const o = overview.data;
  const spread = o?.data.sourceCheck.spread ?? null;
  return (
    <>
      <Card
        title="Data check"
        subtitle={
          spread === null
            ? "Sources that report ONyc's size"
            : `${o?.data.sourceCheck.sources.length ?? 0} sources report a ${formatPercent(Math.abs(spread), 1)} spread on size`
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
                  {s.asOf !== null && <span className="tone-neutral"> · {formatDate(s.asOf)}</span>}
                </b>
              </div>
            ))}
          </div>
        )}
        {spread !== null && Math.abs(spread) > 0.02 && (
          <Notice tone="watch">
            A spread of {signedPct(spread, 1)} between sources is normal when they measure different
            things; the checks below explain each one.
          </Notice>
        )}
        {o !== undefined && <Provenance meta={o.meta["sourceCheck"]} />}
      </Card>
      <div className="grid">
        <Panel
          q={yieldQ}
          build={sankeyBuild}
          title="Where the collateral sits"
          span={12}
          height={380}
        />
      </div>
    </>
  );
}

export function RiskReinsurancePage() {
  return (
    <Combined
      title="Risk & Reinsurance"
      lede="Independent risk signals, how exits work, the insurance book behind the yield, and whether the data agrees."
      parts={[
        { id: "risk", label: "Risk signals", node: <RiskPage /> },
        { id: "market", label: "Peg & exits", node: <PegLiquidityPage /> },
        { id: "chain", label: "On chain", node: <ChainPage /> },
        { id: "reinsurance", label: "Reinsurance book", node: <ReinsurancePage /> },
        {
          id: "sources",
          label: "Data health",
          node: (
            <>
              <SourcesDetail />
              <HealthPage />
            </>
          ),
        },
      ]}
    />
  );
}

export function AlertsApiPage() {
  return (
    <Combined
      title="Alerts & API"
      lede="What changed, how to get alerts in Telegram, and how to read the data yourself."
      parts={[
        { id: "onchain", label: "On-chain activity", node: <OnchainActivity /> },
        { id: "activity", label: "Activity & alerts", node: <ActivityPage /> },
        { id: "developers", label: "API & MCP", node: <DevelopersPage /> },
      ]}
    />
  );
}
