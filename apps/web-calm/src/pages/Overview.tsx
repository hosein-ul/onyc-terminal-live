import { navSpec } from "@onyc/chart-specs";
import { SECTIONS, type SectionId } from "@onyc/insights";
import { useOverviewModel } from "@onyc/insights/react";
import { useNav } from "@onyc/sdk/react";
import { useMemo, type ReactNode } from "react";
import { Chart, ChartFrame } from "../charts";
import { useRange } from "../lib/useRange";
import { Notice } from "../ui/kit";
import {
  ActivitySection,
  BestPlaces,
  Capital,
  Changes,
  Flows,
  Headline,
  NavHero,
  PointsSection,
  SafetyGlance,
  SectionNav,
  Vitals,
} from "./OverviewSections";

/** The Overview is one long page; the sticky bar jumps between its sections. */
export function OverviewPage() {
  const m = useOverviewModel();
  const [range, setRange] = useRange("all");
  const order = SECTIONS.map((s) => s.id);

  // The hero chart has its own range selector, so it loads its own history.
  const heroQ = useNav({ query: { range } });
  const hero = useMemo(() => (heroQ.data === undefined ? null : navSpec(heroQ.data)), [heroQ.data]);

  const blocks: Record<SectionId, ReactNode> = {
    now: (
      <div className="now">
        <Headline m={m} />
        <div className="bento">
          <div className="tile-nav">
            <NavHero m={m}>
              <ChartFrame
                spec={hero}
                status={heroQ.isError ? "error" : heroQ.isLoading ? "loading" : "ready"}
                loadingTitle="NAV per ONyc"
                error="NAV history could not be loaded."
                range={range}
                onRange={setRange}
                height={300}
                plain
                hideTitle
              >
                {hero !== null && <Chart spec={hero} height={300} />}
              </ChartFrame>
            </NavHero>
          </div>
          <div className="tile-safety">
            <SafetyGlance m={m} />
          </div>
        </div>
        <Vitals m={m} />
      </div>
    ),
    capital: <Capital m={m} />,
    best: <BestPlaces m={m} />,
    points: <PointsSection pulse={m.pulse} m={m} />,
    activity: <ActivitySection />,
    flows: <Flows m={m} />,
    changes: <Changes m={m} />,
  };

  return (
    <>
      <SectionNav order={order} />
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
