import { endpoints, streamTickSchema } from "@onyc/sdk";
import { z } from "zod";

type Json = Record<string, unknown>;

function jsonSchema(schema: z.ZodType, io: "input" | "output"): Json {
  const out = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io,
    unrepresentable: "any",
  }) as Json;
  delete out["$schema"];
  return out;
}

const errorSchema = z.object({ error: z.string(), issues: z.array(z.unknown()).optional() });

function parameters(def: (typeof endpoints)[keyof typeof endpoints]): Json[] {
  const out: Json[] = [];
  const pathParams = jsonSchema(def.params, "input");
  for (const [name, schema] of Object.entries(
    (pathParams["properties"] ?? {}) as Record<string, Json>,
  )) {
    out.push({ name, in: "path", required: true, schema });
  }
  const query = jsonSchema(def.query, "input");
  const required = new Set((query["required"] ?? []) as string[]);
  for (const [name, schema] of Object.entries(
    (query["properties"] ?? {}) as Record<string, Json>,
  )) {
    out.push({ name, in: "query", required: required.has(name), schema });
  }
  return out;
}

const errorResponse = (description: string): Json => ({
  description,
  content: { "application/json": { schema: jsonSchema(errorSchema, "output") } },
});

/** The OpenAPI 3.1 document, generated from the same zod contract the routes validate against. */
export function buildOpenApi(publicUrl: string): Json {
  const paths: Record<string, Json> = {};
  for (const [name, def] of Object.entries(endpoints)) {
    paths[def.path] = {
      get: {
        operationId: name,
        summary: def.summary,
        tags: [def.tag],
        parameters: parameters(def),
        responses: {
          "200": {
            description: `${def.summary}. Every figure is described in \`meta\` by field: source, fetchedAt and stale.`,
            headers: {
              "Cache-Control": { schema: { type: "string" } },
              "X-Cache": { schema: { type: "string", enum: ["HIT", "MISS"] } },
            },
            content: { "application/json": { schema: jsonSchema(def.response, "output") } },
          },
          "400": errorResponse("Invalid parameters"),
          "429": errorResponse("Rate limit exceeded; see Retry-After"),
          "502": errorResponse("An upstream OnRe API needed for this request failed"),
          "500": errorResponse("Internal error"),
        },
      },
    };
  }
  paths["/v1/stream"] = {
    get: {
      operationId: "stream",
      summary: "Server-sent events: live ticks and new events",
      tags: ["Activity"],
      responses: {
        "200": {
          description:
            "A text/event-stream. Event `tick` carries a live tick (NAV, APY, TVL, market price, premium); event `event` carries a new row from the activity feed.",
          content: {
            "text/event-stream": { schema: { type: "string" } },
          },
          "x-tick-schema": jsonSchema(streamTickSchema, "output"),
        },
      },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "ONyc Terminal API",
      version: "1.0.0",
      description:
        "Unofficial, community-built, read-only analytics for OnRe's ONyc. Not affiliated with OnRe. Not investment advice. Every response is `{ data, meta }`; `meta` says where each field came from, when it was fetched and whether it is stale.",
    },
    servers: [{ url: publicUrl }],
    tags: [...new Set(Object.values(endpoints).map((e) => e.tag))].map((name) => ({ name })),
    paths,
  };
}
