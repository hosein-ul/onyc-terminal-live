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
import { useMemo } from "react";
import { buildPointsPulse, type PointsPulse } from "./points.js";
import { buildSafetyBoard, type Light } from "./safety.js";
import { buildVitals, type Vital } from "./vitals.js";

export interface OverviewModel {
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
    return {
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
