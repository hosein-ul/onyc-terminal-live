import { endpoints, type EndpointName } from "@onyc/sdk";
import { SourceError } from "@onyc/sources";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import type { z } from "zod";
import { TtlCache } from "./cache.js";
import type { Deps } from "./deps.js";
import { buildMeta, loadHealth } from "./meta.js";
import { buildOpenApi } from "./openapi.js";
import { RateLimiter } from "./ratelimit.js";
import {
  capitalStackService,
  distributionService,
  layersService,
  opportunitiesService,
  reconciliationService,
  reinsuranceSummaryService,
  yieldService,
} from "./services/book.js";
import type { ServiceResult } from "./services/common.js";
import {
  chainActivityService,
  chainFlowsService,
  chainHoldersService,
  chainStateService,
} from "./services/chain.js";
import { marketService, redemptionsService } from "./services/market.js";
import { flowsService, navService, vectorsService } from "./services/nav.js";
import { overviewService } from "./services/overview.js";
import {
  concentrationService,
  leaderboardService,
  pointsGrowthService,
  walletService,
} from "./services/points.js";
import { eventsService, healthService, riskService, solvencyService } from "./services/risk.js";
import { StreamHub } from "./stream.js";

type Out<K extends EndpointName, F extends "query" | "params"> = z.output<(typeof endpoints)[K][F]>;
type Handler<K extends EndpointName> = (
  deps: Deps,
  args: { query: Out<K, "query">; params: Out<K, "params"> },
) => Promise<ServiceResult<unknown>>;

const handlers: { [K in EndpointName]: Handler<K> } = {
  overview: (d) => overviewService(d),
  nav: (d, { query }) => navService(d, query.range),
  navVectors: (d) => vectorsService(d),
  flows: (d, { query }) => flowsService(d, query.range),
  market: (d, { query }) => marketService(d, query.range),
  redemptions: (d, { query }) => redemptionsService(d, query.amount),
  reinsuranceLayers: (d) => layersService(d),
  reinsuranceSummary: (d) => reinsuranceSummaryService(d),
  yieldComposition: (d) => yieldService(d),
  capitalStack: (d) => capitalStackService(d),
  capitalDistribution: (d, { query }) => distributionService(d, query.range),
  capitalReconciliation: (d) => reconciliationService(d),
  defiOpportunities: (d, { query }) => opportunitiesService(d, query.history === "1"),
  pointsGrowth: (d) => pointsGrowthService(d),
  leaderboard: (d, { query }) => leaderboardService(d, query),
  concentration: (d) => concentrationService(d),
  wallet: (d, { params }) => walletService(d, params.address),
  solvency: (d) => solvencyService(d),
  risk: (d) => riskService(d),
  healthSources: (d) => healthService(d),
  events: (d, { query }) => eventsService(d, query),
  chainState: (d) => chainStateService(d),
  chainActivity: (d, { query }) => chainActivityService(d, query),
  chainFlows: (d, { query }) => chainFlowsService(d, query.range),
  chainHolders: (d) => chainHoldersService(d),
};

const honoPath = (openApiPath: string): string => openApiPath.replace(/\{(\w+)\}/g, ":$1");

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded !== undefined && forwarded !== ""
    ? forwarded
    : (c.req.header("x-real-ip") ?? "local");
}

export interface AppHandle {
  app: Hono;
  hub: StreamHub;
  cache: TtlCache<string>;
}

export function createApp(deps: Deps, options: { limiter?: RateLimiter } = {}): AppHandle {
  const app = new Hono();
  const cache = new TtlCache<string>(600);
  const limiter = options.limiter ?? new RateLimiter(deps.config.RATE_LIMIT_PER_MINUTE);
  const hub = new StreamHub(deps);

  const origins = deps.config.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: origins.includes("*") ? "*" : origins,
      allowMethods: ["GET", "OPTIONS"],
      exposeHeaders: ["X-Cache", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
    }),
  );

  app.use("/v1/*", async (c, next) => {
    if (c.req.path === "/v1/openapi.json") return next();
    const decision = limiter.check(clientIp(c));
    c.header("X-RateLimit-Limit", String(decision.limit));
    c.header("X-RateLimit-Remaining", String(decision.remaining));
    if (!decision.allowed) {
      c.header("Retry-After", String(decision.retryAfter));
      return c.json({ error: "rate limit exceeded" }, 429);
    }
    await next();
    return undefined;
  });

  app.get("/healthz", async (c) => {
    try {
      await deps.handle.sql`select 1`;
      return c.json({ ok: true });
    } catch (error) {
      deps.log.error(
        { err: error instanceof Error ? error.message : String(error) },
        "health check failed",
      );
      return c.json({ ok: false }, 503);
    }
  });

  const openapi = JSON.stringify(buildOpenApi(deps.config.API_PUBLIC_URL));
  app.get("/v1/openapi.json", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.body(openapi, 200, { "Content-Type": "application/json" });
  });

  for (const [name, def] of Object.entries(endpoints) as [
    EndpointName,
    (typeof endpoints)[EndpointName],
  ][]) {
    app.get(honoPath(def.path), async (c) => {
      const params = def.params.safeParse(c.req.param());
      const query = def.query.safeParse(c.req.query());
      if (!params.success || !query.success) {
        const issues = [
          ...(params.success ? [] : params.error.issues),
          ...(query.success ? [] : query.error.issues),
        ];
        return c.json({ error: "invalid request", issues }, 400);
      }

      const sorted = Object.entries(c.req.query()).sort(([a], [b]) => a.localeCompare(b));
      const key = `${c.req.path}?${new URLSearchParams(sorted).toString()}`;
      const { value, hit } = await cache.getOrLoad(key, def.ttl * 1000, async () => {
        const handler = handlers[name] as Handler<typeof name>;
        const out = await handler(deps, {
          query: query.data,
          params: params.data,
        });
        const health = await loadHealth(deps);
        const body = { data: out.data, meta: buildMeta(health, out.fields, deps.now()) };
        // The response must satisfy the published contract; a drift is a bug and fails loudly.
        return JSON.stringify(def.response.parse(body));
      });
      c.header("Cache-Control", `public, max-age=${def.ttl}`);
      c.header("X-Cache", hit ? "HIT" : "MISS");
      return c.body(value, 200, { "Content-Type": "application/json" });
    });
  }

  app.get("/v1/stream", (c) =>
    streamSSE(c, async (stream) => {
      const first = await hub.latestTick();
      if (first !== null) await stream.writeSSE({ event: "tick", data: JSON.stringify(first) });
      const unsubscribe = hub.subscribe((message) => {
        void stream.writeSSE(
          message.type === "tick"
            ? { event: "tick", data: JSON.stringify(message.tick) }
            : { event: "event", data: JSON.stringify(message.event) },
        );
      });
      stream.onAbort(unsubscribe);
      while (!stream.aborted) {
        await stream.writeSSE({ event: "ping", data: String(Date.now()) });
        await stream.sleep(15_000);
      }
      unsubscribe();
    }),
  );

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((error, c) => {
    if (error instanceof SourceError) {
      deps.log.warn(
        { source: error.source, kind: error.kind, err: error.message },
        "upstream failed",
      );
      return c.json({ error: `upstream ${error.source} failed (${error.kind})` }, 502);
    }
    deps.log.error(
      {
        err: error instanceof Error ? (error.stack ?? error.message) : String(error),
        path: c.req.path,
      },
      "request failed",
    );
    return c.json({ error: "internal error" }, 500);
  });

  return { app, hub, cache };
}
