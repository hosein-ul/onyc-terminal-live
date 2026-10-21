import { endpoints } from "@onyc/sdk";
import { Validator } from "@seriousme/openapi-schema-validator";
import { describe, expect, it } from "vitest";
import { TtlCache } from "./cache.js";
import { DATASETS, metaFor, type HealthRow } from "./meta.js";
import { buildOpenApi } from "./openapi.js";
import { RateLimiter } from "./ratelimit.js";

describe("TtlCache", () => {
  it("expires entries and refreshes recency", () => {
    let now = 0;
    const cache = new TtlCache<number>(2, () => now);
    cache.set("a", 1, 100);
    cache.set("b", 2, 100);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3, 100); // evicts b, the least recently used
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    now = 101;
    expect(cache.get("a")).toBeUndefined();
  });

  it("runs one load for concurrent requests of the same key", async () => {
    const cache = new TtlCache<number>();
    let loads = 0;
    const load = async (): Promise<number> => {
      loads += 1;
      await Promise.resolve();
      return 7;
    };
    const [a, b] = await Promise.all([
      cache.getOrLoad("k", 1000, load),
      cache.getOrLoad("k", 1000, load),
    ]);
    expect(loads).toBe(1);
    expect([a.value, b.value]).toEqual([7, 7]);
    expect((await cache.getOrLoad("k", 1000, load)).hit).toBe(true);
  });

  it("does not cache failures", async () => {
    const cache = new TtlCache<number>();
    await expect(
      cache.getOrLoad("k", 1000, () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect((await cache.getOrLoad("k", 1000, () => Promise.resolve(1))).hit).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("allows the budget, then refuses with a retry time, then refills", () => {
    let now = 0;
    const limiter = new RateLimiter(60, () => now);
    for (let i = 0; i < 60; i += 1) expect(limiter.check("ip").allowed).toBe(true);
    const refused = limiter.check("ip");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThanOrEqual(1);
    now = 2000; // two seconds at one token a second
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("counts clients separately", () => {
    const limiter = new RateLimiter(1);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });
});

describe("metaFor", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const row = (lastOkAt: Date | null): HealthRow => ({
    source: "onre-core",
    endpoint: "GET /data/live-nav",
    status: "ok",
    lastOkAt,
    lastErrorAt: null,
    lastError: null,
    consecutiveFailures: 0,
    lastLatencyMs: 10,
  });

  it("is fresh inside the dataset's window and stale outside it", () => {
    expect(metaFor([row(new Date("2026-10-21T11:58:00Z"))], "live", now)).toMatchObject({
      source: DATASETS.live.label,
      fetchedAt: "2026-10-21T11:58:00.000Z",
      stale: false,
    });
    expect(metaFor([row(new Date("2026-10-21T11:50:00Z"))], "live", now).stale).toBe(true);
  });

  it("is stale with a null time when the source was never fetched", () => {
    expect(metaFor([], "live", now)).toMatchObject({ fetchedAt: null, stale: true });
  });

  it("uses the oldest success when a dataset has several endpoints", () => {
    const health: HealthRow[] = [
      {
        ...row(new Date("2026-10-21T11:59:00Z")),
        source: "onre-rewards",
        endpoint: "GET /analytics/capital/distribution",
      },
      {
        ...row(new Date("2026-10-21T08:00:00Z")),
        source: "onre-rewards",
        endpoint: "GET /analytics/capital/reconciliation",
      },
    ];
    expect(metaFor(health, "capital", now).fetchedAt).toBe("2026-10-21T08:00:00.000Z");
  });

  it("computed data is never stale", () => {
    expect(metaFor([], "derived", now).stale).toBe(false);
  });
});

describe("OpenAPI document", () => {
  const doc = buildOpenApi("https://api.example.test");

  it("is a valid OpenAPI 3.1 document", async () => {
    const result = await new Validator().validate(doc as never);
    expect(result.valid).toBe(true);
  });

  it("documents every endpoint plus the stream, with its parameters", () => {
    const paths = doc["paths"] as Record<
      string,
      { get: { parameters?: { name: string; in: string }[] } }
    >;
    for (const def of Object.values(endpoints)) expect(paths[def.path]).toBeDefined();
    expect(paths["/v1/stream"]).toBeDefined();
    const wallet = paths["/v1/wallet/{address}"]?.get.parameters ?? [];
    expect(wallet).toContainEqual(expect.objectContaining({ name: "address", in: "path" }));
    const board = (paths["/v1/points/leaderboard"]?.get.parameters ?? []).map((p) => p.name).sort();
    expect(board).toEqual(["page", "q", "size"]);
  });
});
