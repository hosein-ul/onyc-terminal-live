import { navSpec } from "@onyc/chart-specs";
import { formatNav } from "@onyc/format";
import { sectionOrder, SECTIONS, type SectionId } from "@onyc/insights";
import { useOverviewModel, usePersona } from "@onyc/insights/react";
import { useNav } from "@onyc/sdk/react";
import { useMemo, type ReactNode } from "react";
import { Chart, ChartFrame } from "../charts";
import { useRange } from "../lib/useRange";
import { Notice, Skeleton } from "../ui/kit";
import { TermHint } from "../ui/Term";
import {
  BestPlaces,
  Capital,
  Changes,
  Flows,
  Headline,
  PointsPulse,
  SafetyBoard,
  SectionNav,
  Vitals,
} from "./OverviewSections";

/** The Overview is one long page; the sticky bar jumps between its sections and the persona switch reorders them. */
export function OverviewPage() {
  const m = useOverviewModel();
  const [persona, setPersona] = usePersona();
  const [range, setRange] = useRange("all");
  const order = sectionOrder(persona);

  const o = m.q.overview.data;
  // The hero chart has its own range selector, so it loads its own history.
  const heroQ = useNav({ query: { range } });
  const hero = useMemo(() => (heroQ.data === undefined ? null : navSpec(heroQ.data)), [heroQ.data]);

  const blocks: Record<SectionId, ReactNode> = {
    now: (
      <>
        <Headline m={m} />
        <Vitals m={m} />
      </>
    ),
    safety: (
      <div className="grid">
        <div className="span-7">
          <section className="hero" aria-label="NAV per ONyc">
            <div className="hero-label">
              NAV per ONyc <TermHint id="nav" />
            </div>
            <div className="hero-number">
              {o === undefined ? (
                <Skeleton height={56} width={260} />
              ) : (
                formatNav(o.data.nav.value, 4)
              )}
              {o !== undefined && <span className="hero-unit"> USDC</span>}
            </div>
            <ChartFrame
              spec={hero}
              status={heroQ.isError ? "error" : heroQ.isLoading ? "loading" : "ready"}
              loadingTitle="NAV per ONyc"
              error="NAV history could not be loaded."
              range={range}
              onRange={setRange}
              height={260}
              plain
              hideTitle
            >
              {hero !== null && <Chart spec={hero} height={260} />}
            </ChartFrame>
          </section>
        </div>
        <div className="span-5">
          <SafetyBoard m={m} />
        </div>
      </div>
    ),
    best: <BestPlaces m={m} />,
    points: <PointsPulse pulse={m.pulse} m={m} />,
    flows: <Flows m={m} />,
    changes: <Changes m={m} />,
    capital: <Capital m={m} />,
  };

  return (
    <>
      <SectionNav order={order} persona={persona} onPersona={setPersona} />
      {m.q.overview.isError && (
        <Notice tone="bad" title="The overview could not be loaded">
          {m.q.overview.error instanceof Error
            ? m.q.overview.error.message
            : "The API did not answer."}{" "}
          Nothing below is invented while it is down.
        </Notice>
      )}
      {order.map((id) => (
        <section key={id} id={id} className={`ov-section ov-${id}`} aria-labelledby={`${id}-title`}>
          {id !== "now" && (
            <h2 id={`${id}-title`} className="ov-title">
              {SECTIONS.find((s) => s.id === id)?.label}
            </h2>
          )}
          {blocks[id]}
        </section>
      ))}
    </>
  );
}
