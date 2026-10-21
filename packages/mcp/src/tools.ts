import { endpoints, type EndpointName } from "@onyc/sdk";
import { z } from "zod";

/** MCP tool name for each read endpoint. One tool per endpoint, named after what it returns. */
export const TOOL_NAMES = {
  overview: "get_overview",
  nav: "get_nav",
  navVectors: "get_nav_vectors",
  flows: "get_flows",
  market: "get_market",
  redemptions: "get_redemptions",
  reinsuranceLayers: "get_reinsurance_layers",
  reinsuranceSummary: "get_reinsurance_summary",
  yieldComposition: "get_yield_composition",
  capitalStack: "get_capital_stack",
  capitalDistribution: "get_capital_distribution",
  capitalReconciliation: "get_capital_reconciliation",
  defiOpportunities: "get_defi_opportunities",
  pointsGrowth: "get_points_growth",
  leaderboard: "get_leaderboard",
  concentration: "get_points_concentration",
  wallet: "get_wallet",
  solvency: "get_solvency",
  risk: "get_risk",
  healthSources: "get_source_health",
  events: "get_events",
} as const satisfies Record<EndpointName, string>;

export interface ToolDef {
  name: string;
  endpoint: EndpointName;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Parses and splits the arguments the model sent into the path and query parts the client wants. */
  parse: (args: unknown) => { params: Record<string, unknown>; query: Record<string, unknown> };
}

const NOTE =
  "Read-only. The result is `{ data, meta }`; `meta` gives the source, fetch time and staleness of each field, so quote the source and check `stale` before relying on a number.";

export function buildTools(): ToolDef[] {
  return (Object.keys(TOOL_NAMES) as EndpointName[]).map((endpoint) => {
    const def = endpoints[endpoint];
    const merged = z.object({ ...def.params.shape, ...def.query.shape });
    const schema = z.toJSONSchema(merged, { target: "draft-7", io: "input" }) as Record<
      string,
      unknown
    >;
    delete schema["$schema"];
    return {
      name: TOOL_NAMES[endpoint],
      endpoint,
      description: `${def.summary}. ${NOTE}`,
      inputSchema: { ...schema, additionalProperties: false },
      parse: (args) => {
        const input = merged.parse(args ?? {}) as Record<string, unknown>;
        const pick = (shape: Record<string, unknown>): Record<string, unknown> =>
          Object.fromEntries(
            Object.keys(shape).flatMap((k) => (input[k] === undefined ? [] : [[k, input[k]]])),
          );
        return { params: pick(def.params.shape), query: pick(def.query.shape) };
      },
    };
  });
}
