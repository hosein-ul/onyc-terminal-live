/**
 * Integration tests: the real routes over a real Postgres filled by the real worker jobs from the saved
 * fixtures. Skipped unless a Postgres is reachable through DATABASE_URL (the repo-root .env works).
 */
import { connect, migrationsFolder, runMigrations, type DbHandle } from "@onyc/db";
import { endpoints, type EndpointName, type EndpointResponse } from "@onyc/sdk";
import { fixtureFetch, seedFromFixtures } from "@onyc/worker/testing";
import pino from "pino";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppHandle } from "./app.js";
import { loadConfig } from "./config.js";
import type { Deps } from "./deps.js";
import { RateLimiter } from "./ratelimit.js";

const baseUrl = process.env["DATABASE_URL"];
const WALLET = "DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh";
const NOW = new Date("2026-10-21T16:00:00Z");

describe.skipIf(baseUrl === undefined)("API over a database seeded from fixtures", () => {
  let handle: DbHandle;
  let admin: postgres.Sql;
  let deps: Deps;
  let api: AppHandle;

  /** Call a route and parse the body with that endpoint's contract, so the assertions are typed. */
  const call = async <K extends EndpointName>(
    name: K,
    path: string = endpoints[name].path,
    app: AppHandle = api,
  ): Promise<{ status: number; headers: Headers; body: EndpointResponse<K> }> => {
    const res = await app.app.request(path);
    const json: unknown = await res.json();
    if (res.status !== 200)
      return { status: res.status, headers: res.headers, body: json as EndpointResponse<K> };
    return {
      status: res.status,
      headers: res.headers,
      body: endpoints[name].response.parse(json) as EndpointResponse<K>,
    };
  };

  beforeAll(async () => {
    const adminUrl = new URL(baseUrl ?? "");
    adminUrl.pathname = "/postgres";
    const testUrl = new URL(baseUrl ?? "");
    testUrl.pathname = "/onyc_test";
    admin = postgres(adminUrl.href, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop database if exists onyc_test with (force)");
    await admin.unsafe(
      "create database onyc_test encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0",
    );
    handle = connect(testUrl.href, { max: 4 });
    await runMigrations(handle.db, migrationsFolder);
    await seedFromFixtures(handle, testUrl.href, NOW);
    deps = {
      handle,
      config: loadConfig({ DATABASE_URL: testUrl.href }),
      log: pino({ level: "silent" }),
      now: () => NOW,
      fetchOptions: { fetchImpl: fixtureFetch(), retries: 0 },
    };
    api = createApp(deps);
  });

  afterAll(async () => {
    await handle.close();
    await admin.unsafe("drop database if exists onyc_test with (force)");
    await admin.end();
  });

  it("serves every endpoint with a valid envelope and meta for every field", async () => {
    for (const [name, def] of Object.entries(endpoints) as [
      EndpointName,
      (typeof endpoints)[EndpointName],
    ][]) {
      const path = def.path.replace("{address}", WALLET);
      const res = await api.app.request(path);
      expect(res.status, path).toBe(200);
      const body = def.response.parse(await res.json()) as {
        data: Record<string, unknown>;
        meta: Record<string, unknown>;
      };
      for (const field of Object.keys(body.data)) {
        expect(body.meta[field], `${name}: meta.${field}`).toBeDefined();
      }
    }
  });

  it("overview: live NAV, the capital stack sums to AUM and bound capital is 152,722,725", async () => {
    const { body } = await call("overview");
    expect(body.data.nav.value).toBe(1.157827091);
    expect(body.data.apy.value).toBe(0.1102);
    expect(body.data.apy.reported).toBe(0.1102);
    const stack = body.data.capital.stack;
    expect(stack?.boundUsd).toBe(152722725);
    expect(stack?.offeredUsd).toBe(0);
    expect(stack?.sumsToAum).toBe(true);
    expect(Math.abs((stack?.sumUsd ?? 0) - (stack?.aumUsd ?? 0))).toBeLessThan(0.01);
    expect(stack?.liquidityLayerUsd).toBeCloseTo((stack?.aumUsd ?? 0) * 0.15, 4);
    expect(stack?.availableUsd).toBeGreaterThan(0);
    expect(body.data.whatChanged.attribution?.date).toBe("2026-10-21");
    expect(Math.abs(body.data.whatChanged.attribution?.residual ?? 1e9)).toBeLessThan(1);
  });

  it("overview: the premium matches the fixtures and meta carries source and freshness", async () => {
    const { body } = await call("overview");
    expect(body.data.premiumBps.value).toBeCloseTo((1.1561854853621216 / 1.157827091 - 1) * 1e4, 4);
    expect(body.meta["nav"]).toMatchObject({ source: "OnRe core API (live)", stale: false });
    expect(body.meta["nav"]?.fetchedAt).toBe(NOW.toISOString());
    expect(body.data.sourceCheck.sources.length).toBeGreaterThanOrEqual(6);
  });

  it("nav: full history, the missing day, the four historical down-ticks and an implied APY of about 11.02%", async () => {
    const { body } = await call("nav", "/v1/nav?range=all");
    expect(body.data.series).toHaveLength(511);
    expect(body.data.missingDates).toEqual(["2025-07-05"]);
    const downticks = body.data.events.filter((e) => e.reason === "downtick").map((e) => e.date);
    expect(downticks).toEqual(["2025-07-06", "2025-07-15", "2025-07-29", "2025-08-01"]);
    const d30 = body.data.returns.find((r) => r.window === "30d");
    expect(d30?.annualized).toBeCloseTo(0.1102, 3);
    expect(body.data.smoothness.negativeDays).toBe(4);
    expect(body.data.benchmarks.susdeApy).toBeCloseTo(0.035057, 5);
  });

  it("nav vectors: the decoded schedule reproduces the live NAV exactly", async () => {
    const { body } = await call("navVectors");
    expect(body.data.scheduledNavNow).toBe(1.157827091);
    expect(body.data.liveNav).toBe(1.157827091);
    expect(body.data.difference).toBe(0);
    expect(body.data.vectors.filter((v) => v.active)).toHaveLength(1);
    expect(body.data.forward.d30).toHaveLength(30);
    expect(body.data.forward.label).toBe("Scheduled, not guaranteed");
  });

  it("reinsurance: 30 layers, layer 0002 is past its renewal, concentrations add up", async () => {
    const layers = (await call("reinsuranceLayers")).body.data.layers;
    expect(layers).toHaveLength(30);
    expect(layers.find((l) => l.uiLayerNumber === "0002")).toMatchObject({
      layerId: "9000002",
      pastRenewal: true,
      perilFamily: "Contingency",
    });
    const summary = (await call("reinsuranceSummary")).body.data;
    expect(summary.totals.capital).toBe(152722725);
    expect(summary.pastRenewal.layerIds).toContain("9000002");
    expect(summary.byPeril.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 9);
  });

  it("capital: Kamino is the top protocol and unexplained equals the orca bucket", async () => {
    const dist = (await call("capitalDistribution")).body.data;
    expect(dist.topProtocol?.protocol).toBe("kamino");
    expect(dist.loopingShare).toBeGreaterThan(0.7);
    const recon = (await call("capitalReconciliation")).body.data;
    expect(recon.unexplainedUsd).toBeCloseTo(10929324.72, 1);
    expect(recon.residualNote).toContain("equals the 'orca' bucket");
  });

  it("defi: tranching shows senior, junior and the spread; principal tokens are separate", async () => {
    const { body } = await call("defiOpportunities", "/v1/defi/opportunities?history=1");
    expect(body.data.opportunities).toHaveLength(28);
    const t = body.data.tranching;
    expect(t.senior?.assets[0]?.symbol).toBe("srONyc");
    expect(t.junior?.assets[0]?.symbol).toBe("jrONyc");
    expect(t.spread).toBeCloseTo(0.1744159495 - 0.07518404795, 8);
    expect(t.principalTokens.length).toBeGreaterThan(0);
  });

  it("points: leaderboard paging, search and our own concentration numbers", async () => {
    const page = (await call("leaderboard", "/v1/points/leaderboard?page=0&size=3")).body.data;
    expect(page.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(page.rows[0]?.breakdown?.["kamino.onyc"]).toBeGreaterThan(0);
    expect(page.rows[0]?.movement1d).toBeNull();
    const search = (await call("leaderboard", `/v1/points/leaderboard?q=${WALLET.slice(3, 12)}`))
      .body.data;
    expect(search.rows[0]?.address).toBe(WALLET);
    const c = (await call("concentration")).body.data;
    expect(c.wallets).toBe(250);
    expect(c.gini).toBeGreaterThan(0);
    expect(c.gini).toBeLessThan(1);
    expect(c.globalMultiplier).toMatchObject({ value: 0.0001, since: "2026-10-03" });
    expect(c.multiplierNote).toContain("not reconciled");
  });

  it("wallet: rank, percentile, breakdown and a balance that degrades to unavailable when the RPC does not answer", async () => {
    const { body } = await call("wallet", `/v1/wallet/${WALLET}`);
    expect(body.data.found).toBe(true);
    expect(body.data.rank).toBe(1);
    expect(body.data.percentile).toBe(1);
    expect(body.data.referrals?.code).toBe("MOOSOLANA");
    // The test fetch only knows the rewards API, so the Solana RPC call fails and the balance says why.
    expect(body.data.onchain.status).toBe("unavailable");
    expect(body.data.onchain.onycBalance).toBeNull();
  });

  it("solvency and risk: Accountable's stale retrieval is flagged, with no blended score", async () => {
    const s = (await call("solvency")).body.data;
    expect(s.collateralization).toBeCloseTo(1.001993, 6);
    expect(s.ageHours).toBeGreaterThan(24);
    const risk = (await call("risk")).body.data;
    expect(risk.signals).toHaveLength(12);
    const by = Object.fromEntries(risk.signals.map((x) => [x.id, x.state]));
    expect(by["solvency_age"]).toBe("alert");
    expect(by["collateralization"]).toBe("ok");
    expect(risk.signals.every((x) => x.source !== "")).toBe(true);
    expect(risk).not.toHaveProperty("score");
  });

  it("health: every DATA_SOURCES conflict is listed and the computed ones evaluate", async () => {
    const { body } = await call("healthSources");
    const conflicts = body.data.conflicts;
    expect(conflicts.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const by = Object.fromEntries(conflicts.map((c) => [c.id, c.state]));
    for (const id of [1, 2, 4, 6, 7, 8, 11]) expect(by[id], `conflict ${id}`).toBe("conflict");
    const c7 = conflicts.find((c) => c.id === 7);
    expect(c7?.values["observedPageAum"]).toBe(179673794);
    expect(Math.abs(Number(c7?.values["derivedFromBound"]) - 179673794)).toBeLessThan(1);
    expect(new Set(conflicts.map((c) => c.kind))).toEqual(new Set(["computed", "observed"]));
    expect(body.data.sources.some((s) => s.source === "onre-core" && s.status === "ok")).toBe(true);
  });

  it("events: the feed carries the NAV down-ticks and re-pricings, filterable by kind", async () => {
    const all = (await call("events", "/v1/events?limit=100")).body.data.events;
    const kinds = new Set(all.map((e) => e.kind));
    expect(kinds.has("nav_downtick")).toBe(true);
    expect(kinds.has("nav_repriced")).toBe(true);
    expect((await call("events", "/v1/events?kind=nav_downtick")).body.data.events).toHaveLength(4);
  });

  it("redemptions and market", async () => {
    const r = (await call("redemptions", "/v1/redemptions?amount=1000")).body.data;
    expect(r.offers).toHaveLength(2);
    expect(r.settings?.maxCapacity).toBe(12000000);
    expect(r.log.rows).toHaveLength(50);
    expect(r.log.note).toContain("never shown as total redemptions");
    expect(r.capacityNote).toContain("not the capacity curve");
    expect(r.estimate?.navValueUsd).toBeCloseTo(1157.827091, 6);
    const m = (await call("market")).body.data;
    expect(m.pools).toHaveLength(20);
    expect(m.bands).toEqual([25, 50, 100]);
    expect(m.liquidityCoverage).toBeGreaterThan(0.15);
  });

  it("rejects bad input with 400 and unknown paths with 404", async () => {
    expect((await api.app.request("/v1/wallet/not-an-address")).status).toBe(400);
    expect((await api.app.request("/v1/points/leaderboard?size=1000")).status).toBe(400);
    expect((await api.app.request("/v1/nav?range=5y")).status).toBe(400);
    expect((await api.app.request("/v1/nope")).status).toBe(404);
  });

  it("caches: a repeated request is a HIT", async () => {
    const first = await api.app.request("/v1/solvency?cachecheck=1");
    const second = await api.app.request("/v1/solvency?cachecheck=1");
    expect(first.headers.get("x-cache")).toBe("MISS");
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(second.headers.get("cache-control")).toContain("max-age=");
  });

  it("rate limits per client with Retry-After", async () => {
    const limited = createApp(deps, { limiter: new RateLimiter(3) });
    const statuses: number[] = [];
    let last: Headers | undefined;
    for (let i = 0; i < 5; i += 1) {
      const res = await limited.app.request("/v1/events", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      });
      statuses.push(res.status);
      last = res.headers;
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(Number(last?.get("retry-after"))).toBeGreaterThanOrEqual(1);
    const other = await limited.app.request("/v1/events", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    expect(other.status).toBe(200);
  });

  it("marks data stale when the clock moves a day past the last fetch", async () => {
    const later = createApp({ ...deps, now: () => new Date(NOW.getTime() + 86_400_000) });
    const { body } = await call("overview", "/v1/overview", later);
    expect(body.meta["nav"]?.stale).toBe(true);
    expect(body.meta["circulatingSupply"]?.stale).toBe(true);
  });

  it("serves the OpenAPI document", async () => {
    const res = await api.app.request("/v1/openapi.json");
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toContain("/v1/stream");
  });

  it("stream hub: a subscriber receives the newest tick and new events", async () => {
    const received: string[] = [];
    const unsubscribe = api.hub.subscribe((m) => received.push(m.type));
    await api.hub.poll(); // the tick, and it records the newest event id
    expect(received).toContain("tick");
    await handle.sql`insert into events (ts, kind, severity, title, body, dedup_key) values (now(), 'test_event', 'info', 'hello', '', 'test-stream-1')`;
    await api.hub.poll();
    expect(received).toContain("event");
    unsubscribe();
    expect(api.hub.listenerCount).toBe(0);
  });
});
