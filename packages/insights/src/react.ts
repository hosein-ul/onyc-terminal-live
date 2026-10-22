import {
  useCapitalDistribution,
  useCapitalStack,
  useConcentration,
  useDefiOpportunities,
  useFlows,
  useNav,
  useOverview,
  usePointsGrowth,
  useRedemptions,
  useRisk,
  useSolvency,
} from "@onyc/sdk/react";
import { useMemo, useState } from "react";
import { buildHeadline, type Headline } from "./headline.js";
import { loadPersona, savePersona, type Persona } from "./personas.js";
import { buildPointsPulse, type PointsPulse } from "./points.js";
import { buildSafetyBoard, type Light } from "./safety.js";
import { buildVitals, navDownticks30d, type Vital } from "./vitals.js";

export interface OverviewModel {
  headline: Headline | null;
  vitals: Vital[];
  safety: Light[];
  pulse: PointsPulse;
  /** The raw queries, for charts and tables that the apps draw themselves. */
  q: {
    overview: ReturnType<typeof useOverview>;
    nav: ReturnType<typeof useNav>;
    flows: ReturnType<typeof useFlows>;
    risk: ReturnType<typeof useRisk>;
    solvency: ReturnType<typeof useSolvency>;
    redemptions: ReturnType<typeof useRedemptions>;
    opportunities: ReturnType<typeof useDefiOpportunities>;
    growth: ReturnType<typeof usePointsGrowth>;
    concentration: ReturnType<typeof useConcentration>;
    capitalStack: ReturnType<typeof useCapitalStack>;
    capitalDistribution: ReturnType<typeof useCapitalDistribution>;
  };
}

/** Everything the Overview needs, computed once from the API. Apps draw it in their own style. */
export function useOverviewModel(): OverviewModel {
  const overview = useOverview();
  const nav = useNav({ query: { range: "3m" } });
  const flows = useFlows({ query: { range: "1m" } });
  const risk = useRisk();
  const solvency = useSolvency();
  const redemptions = useRedemptions();
  const opportunities = useDefiOpportunities();
  const growth = usePointsGrowth();
  const concentration = useConcentration();
  const capitalStack = useCapitalStack();
  const capitalDistribution = useCapitalDistribution();

  const o = overview.data;
  const model = useMemo(() => {
    const top = o?.data.capital.distribution.slice().sort((a, b) => b.share - a.share)[0] ?? null;
    const headline: Headline | null =
      o === undefined
        ? null
        : buildHeadline({
            navDownticks30d: navDownticks30d(nav.data),
            navReturn30d: nav.data?.data.returns.find((r) => r.window === "30d")?.return ?? null,
            netFlow30dUsd: flows.data?.data.totals.netFlowUsd ?? null,
            aumUsd: o.data.aum.value,
            premiumBps: o.data.premiumBps.value,
            solvencyAgeHours: solvency.data?.data.ageHours ?? null,
            topProtocol: top === null ? null : { name: titleCase(top.protocol), share: top.share },
          });
    return {
      headline,
      vitals: buildVitals({
        overview: o,
        nav: nav.data,
        flows: flows.data,
        risk: risk.data,
        solvency: solvency.data,
        redemptions: redemptions.data,
      }),
      safety: buildSafetyBoard(risk.data),
      pulse: buildPointsPulse(
        growth.data?.data,
        concentration.data?.data,
        o?.data.nav.value ?? null,
      ),
    };
  }, [
    o,
    nav.data,
    flows.data,
    risk.data,
    solvency.data,
    redemptions.data,
    growth.data,
    concentration.data,
  ]);

  return {
    ...model,
    q: {
      overview,
      nav,
      flows,
      risk,
      solvency,
      redemptions,
      opportunities,
      growth,
      concentration,
      capitalStack,
      capitalDistribution,
    },
  };
}

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The persona choice, remembered in the browser. */
export function usePersona(): [Persona, (p: Persona) => void] {
  const [persona, setPersona] = useState<Persona>(() => loadPersona());
  return [
    persona,
    (p) => {
      savePersona(p);
      setPersona(p);
    },
  ];
}
