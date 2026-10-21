import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SourceError } from "./errors.js";
import { fakeFetch } from "./fixture.testutil.js";
import { USER_AGENT, getJson, httpGet } from "./http.js";

const noSleep = (): Promise<void> => Promise.resolve();

describe("httpGet", () => {
  it("sends the User-Agent", async () => {
    let seen: string | null = null;
    const fetchImpl: typeof fetch = (_input, init) => {
      seen = new Headers(init?.headers).get("user-agent");
      return Promise.resolve(new Response("1"));
    };
    await httpGet("test", "https://example.test/a", { fetchImpl });
    expect(seen).toBe(USER_AGENT);
  });

  it("retries 5xx and then succeeds", async () => {
    let calls = 0;
    const { fetchImpl } = fakeFetch({
      "/a": () => {
        calls += 1;
        return calls < 3 ? { status: 503, body: "busy" } : { body: "ok" };
      },
    });
    const result = await httpGet("test", "https://example.test/a", { fetchImpl, sleep: noSleep });
    expect(result.text).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after the retries and reports the last HTTP status", async () => {
    const { fetchImpl, calls } = fakeFetch({ "/a": { status: 500, body: "no" } });
    const error = await httpGet("test", "https://example.test/a", {
      fetchImpl,
      sleep: noSleep,
      retries: 2,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect(error).toMatchObject({ kind: "http", status: 500, source: "test" });
    expect(calls).toHaveLength(3);
  });

  it("does not retry a 4xx", async () => {
    const { fetchImpl, calls } = fakeFetch({ "/a": { status: 400, body: "bad" } });
    const error = await httpGet("test", "https://example.test/a", {
      fetchImpl,
      sleep: noSleep,
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "http", status: 400 });
    expect(calls).toHaveLength(1);
  });

  it("returns accepted statuses as results", async () => {
    const { fetchImpl } = fakeFetch({ "/a": { status: 404, body: "{}" } });
    const result = await httpGet("test", "https://example.test/a", {
      fetchImpl,
      acceptStatuses: [404],
    });
    expect(result.status).toBe(404);
  });

  it("retries network failures and then reports them", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = () => {
      calls += 1;
      return Promise.reject(new Error("socket hang up"));
    };
    const error = await httpGet("test", "https://example.test/a", {
      fetchImpl,
      sleep: noSleep,
      retries: 1,
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "network" });
    expect(calls).toBe(2);
  });

  it("waits for Retry-After on 429", async () => {
    const waits: number[] = [];
    let calls = 0;
    const { fetchImpl } = fakeFetch({
      "/a": () => {
        calls += 1;
        return calls === 1
          ? { status: 429, body: "slow down", headers: { "retry-after": "3" } }
          : { body: "ok" };
      },
    });
    await httpGet("test", "https://example.test/a", {
      fetchImpl,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    expect(waits).toEqual([3000]);
  });
});

describe("getJson", () => {
  const schema = z.object({ n: z.number() });

  it("returns validated data plus the raw body", async () => {
    const { fetchImpl } = fakeFetch({ "/a": { body: '{"n":1}' } });
    const result = await getJson("test", "https://example.test/a", schema, { fetchImpl });
    expect(result.data).toEqual({ n: 1 });
    expect(result.raw).toBe('{"n":1}');
    expect(result.status).toBe(200);
  });

  it("reports a parse error for non-JSON", async () => {
    const { fetchImpl } = fakeFetch({ "/a": { body: "<html>" } });
    const error = await getJson("test", "https://example.test/a", schema, { fetchImpl }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ kind: "parse" });
  });

  it("reports a schema error that names the field that changed", async () => {
    const { fetchImpl } = fakeFetch({ "/a": { body: '{"n":"one"}' } });
    const error = await getJson("test", "https://example.test/a", schema, { fetchImpl }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ kind: "schema" });
    expect((error as Error).message).toContain("n:");
  });
});
