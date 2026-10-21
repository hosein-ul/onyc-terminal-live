import { describe, expect, it } from "vitest";
import { ApiError, createClient } from "./client.js";
import { endpoints } from "./contract.js";

const eventsBody = {
  data: {
    events: [
      {
        id: 1,
        ts: "2026-10-21T00:00:00.000Z",
        kind: "nav_downtick",
        severity: "alert",
        title: "t",
        body: "",
        data: null,
      },
    ],
  },
  meta: {
    events: {
      source: "Computed from stored data",
      fetchedAt: "2026-10-21T00:00:00.000Z",
      stale: false,
    },
  },
};

function fakeFetch(status: number, body: unknown): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const impl: typeof fetch = (input) => {
    urls.push(input instanceof URL ? input.href : typeof input === "string" ? input : input.url);
    return Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
    );
  };
  return { fetch: impl, urls };
}

describe("createClient", () => {
  it("builds the URL from path params and query, and returns validated data", async () => {
    const f = fakeFetch(200, eventsBody);
    const client = createClient({ baseUrl: "https://api.example.test/", fetch: f.fetch });
    const res = await client.call("events", { query: { kind: "nav_downtick", limit: 5 } });
    expect(f.urls[0]).toBe("https://api.example.test/v1/events?kind=nav_downtick&limit=5");
    expect(res.data.events[0]?.kind).toBe("nav_downtick");
  });

  it("fills {address} and encodes it", async () => {
    const f = fakeFetch(500, "x");
    const client = createClient({ baseUrl: "https://api.example.test", fetch: f.fetch });
    await client.call("wallet", { params: { address: "a b" } }).catch(() => undefined);
    expect(f.urls[0]).toBe("https://api.example.test/v1/wallet/a%20b");
  });

  it("skips empty query values", async () => {
    const f = fakeFetch(200, eventsBody);
    const client = createClient({ baseUrl: "https://api.example.test", fetch: f.fetch });
    await client.call("events", { query: { kind: "" } });
    expect(f.urls[0]).toBe("https://api.example.test/v1/events");
  });

  it("throws ApiError with the status for non-2xx responses", async () => {
    const client = createClient({
      baseUrl: "https://api.example.test",
      fetch: fakeFetch(429, { error: "rate limit exceeded" }).fetch,
    });
    const error = await client.call("events").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429 });
  });

  it("fails loudly when the response no longer matches the contract", async () => {
    const client = createClient({
      baseUrl: "https://api.example.test",
      fetch: fakeFetch(200, { data: { events: [{ id: "x" }] }, meta: {} }).fetch,
    });
    await expect(client.call("events")).rejects.toMatchObject({ status: 502 });
  });

  it("can skip validation", async () => {
    const client = createClient({
      baseUrl: "https://api.example.test",
      validate: false,
      fetch: fakeFetch(200, { anything: true }).fetch,
    });
    expect(await client.call("events")).toEqual({ anything: true });
  });
});

describe("contract", () => {
  it("applies query defaults and rejects bad values", () => {
    expect(endpoints.nav.query.parse({})).toEqual({ range: "3m" });
    expect(endpoints.market.query.parse({})).toEqual({ range: "1w" });
    expect(endpoints.leaderboard.query.parse({})).toMatchObject({ page: 0, size: 50 });
    expect(endpoints.leaderboard.query.safeParse({ size: "500" }).success).toBe(false);
    expect(endpoints.redemptions.query.safeParse({ amount: "-1" }).success).toBe(false);
  });

  it("accepts only base58 wallet addresses", () => {
    expect(
      endpoints.wallet.params.safeParse({ address: "DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh" })
        .success,
    ).toBe(true);
    expect(endpoints.wallet.params.safeParse({ address: "0OIl" }).success).toBe(false);
    expect(endpoints.wallet.params.safeParse({ address: "../etc/passwd" }).success).toBe(false);
  });

  it("every endpoint has a path, a ttl and an envelope response", () => {
    for (const def of Object.values(endpoints)) {
      expect(def.path.startsWith("/v1/")).toBe(true);
      expect(def.ttl).toBeGreaterThan(0);
      expect(def.response.safeParse({ nope: true }).success).toBe(false);
    }
  });
});
