import { collateralSankeySpec, type ChartSpec } from "@onyc/chart-specs";
import { formatDate, formatPercent, formatUsdCompact } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useOverview, useYieldComposition } from "@onyc/sdk/react";
import { Panel } from "../charts";
import { signedPct } from "../lib/format";
import { Card, Notice, Skeleton } from "../ui/kit";
import { Provenance } from "../ui/Provenance";
import { HealthPage } from "./Health";

const sankeyBuild = (d: EndpointResponse<"yieldComposition">): ChartSpec => collateralSankeySpec(d);

/** The AUM sources side by side and the collateral flow. */
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

export function DataHealthPage() {
  return (
    <>
      <SourcesDetail />
      <HealthPage />
    </>
  );
}
