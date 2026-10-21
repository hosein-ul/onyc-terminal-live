import { readFileSync } from "node:fs";

/** Raw text of a saved live response under `packages/sources/fixtures/`. */
export function fixtureText(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

export function fixtureJson(name: string): unknown {
  return JSON.parse(fixtureText(name)) as unknown;
}

export interface FakeResponse {
  status?: number;
  body: string;
  headers?: Record<string, string>;
}

/** A `fetch` that answers from a route table keyed by a URL substring. Records every URL it was asked for. */
export function fakeFetch(routes: Record<string, FakeResponse | (() => FakeResponse)>): {
  fetchImpl: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const key = Object.keys(routes).find((candidate) => url.includes(candidate));
    if (key === undefined) return Promise.reject(new Error(`no fake route for ${url}`));
    const route = routes[key];
    const response = typeof route === "function" ? route() : route;
    if (response === undefined) return Promise.reject(new Error(`no fake route for ${url}`));
    return Promise.resolve(
      new Response(response.body, {
        status: response.status ?? 200,
        headers: response.headers ?? {},
      }),
    );
  };
  return { fetchImpl, calls };
}
