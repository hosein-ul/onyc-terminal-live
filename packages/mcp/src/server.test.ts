import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiError, createClient, endpoints } from "@onyc/sdk";
import { describe, expect, it } from "vitest";
import { createServer, type ApiClient } from "./server.js";
import { buildTools, TOOL_NAMES } from "./tools.js";

// A real /v1/overview response saved from the running API (the chart-specs fixtures).
const overview = readFileSync(
  new URL("../../chart-specs/fixtures/overview.json", import.meta.url),
  "utf8",
);

/** An SDK client over a fake fetch, so the real URL building and response validation run. */
function fakeApi(handler: (url: URL) => Response): { client: ApiClient; urls: string[] } {
  const urls: string[] = [];
  const client = createClient({
    baseUrl: "https://api.example.test",
    fetch: (input) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      urls.push(url.pathname + url.search);
      return Promise.resolve(handler(url));
    },
  });
  return { client, urls };
}

async function connect(client: ApiClient): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(client).connect(serverSide);
  const mcp = new Client({ name: "test", version: "0" });
  await mcp.connect(clientSide);
  return mcp;
}

const textOf = (res: unknown): string => {
  const first = (res as { content: { type: string; text: string }[] }).content[0];
  return first?.text ?? "";
};

describe("tool definitions", () => {
  const tools = buildTools();

  it("has one tool per read endpoint, with unique snake_case names", () => {
    expect(tools).toHaveLength(Object.keys(endpoints).length);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const t of tools) expect(t.name).toMatch(/^get_[a-z_]+$/);
    expect(Object.values(TOOL_NAMES)).toContain("get_overview");
  });

  it("describes every tool as read-only with its source note, and gives it an object input schema", () => {
    for (const t of tools) {
      expect(t.description, t.name).toContain("Read-only");
      expect(t.description, t.name).toContain("meta");
      expect(t.inputSchema["type"], t.name).toBe("object");
      expect(t.inputSchema["additionalProperties"], t.name).toBe(false);
    }
  });

  it("exposes path and query parameters in the schema", () => {
    const wallet = tools.find((t) => t.name === "get_wallet");
    expect(Object.keys(wallet?.inputSchema["properties"] ?? {})).toEqual(["address"]);
    expect(wallet?.inputSchema["required"]).toEqual(["address"]);
    const nav = tools.find((t) => t.name === "get_nav");
    expect(JSON.stringify(nav?.inputSchema["properties"])).toContain("1y");
    const board = tools.find((t) => t.name === "get_leaderboard");
    expect(Object.keys(board?.inputSchema["properties"] ?? {}).sort()).toEqual([
      "page",
      "q",
      "size",
    ]);
  });

  it("splits arguments into path and query parts, with defaults applied", () => {
    const nav = tools.find((t) => t.name === "get_nav");
    expect(nav?.parse({})).toEqual({ params: {}, query: { range: "3m" } });
    const wallet = tools.find((t) => t.name === "get_wallet");
    expect(wallet?.parse({ address: "DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh" })).toEqual({
      params: { address: "DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh" },
      query: {},
    });
  });
});

describe("MCP server over a real client", () => {
  it("lists the tools and answers get_overview with the API's own data and its sources", async () => {
    const { client, urls } = fakeApi(() => new Response(overview));
    const mcp = await connect(client);

    const listed = await mcp.listTools();
    expect(listed.tools).toHaveLength(21);
    expect(listed.tools.map((t) => t.name)).toContain("get_overview");

    const result = await mcp.callTool({ name: "get_overview", arguments: {} });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(textOf(result)) as {
      data: { nav: { value: number } };
      meta: Record<string, { source: string }>;
    };
    expect(body.data.nav.value).toBeGreaterThan(1);
    expect(body.meta["nav"]?.source.length).toBeGreaterThan(0);
    expect(urls).toEqual(["/v1/overview"]);
  });

  it("passes arguments through as the query string", async () => {
    const nav = readFileSync(
      new URL("../../chart-specs/fixtures/nav.json", import.meta.url),
      "utf8",
    );
    const { client, urls } = fakeApi(() => new Response(nav));
    const mcp = await connect(client);
    const result = await mcp.callTool({ name: "get_nav", arguments: { range: "all" } });
    expect(result.isError).toBeFalsy();
    expect(urls).toEqual(["/v1/nav?range=all"]);
  });

  it("returns a sentence, not a crash, for bad arguments, unknown tools and API errors", async () => {
    const { client, urls } = fakeApi(
      () => new Response(JSON.stringify({ error: "rate limit exceeded" }), { status: 429 }),
    );
    const mcp = await connect(client);

    const badRange = await mcp.callTool({ name: "get_nav", arguments: { range: "forever" } });
    expect(badRange.isError).toBe(true);
    expect(textOf(badRange)).toContain("Invalid arguments for get_nav");

    const badAddress = await mcp.callTool({
      name: "get_wallet",
      arguments: { address: "../etc/passwd" },
    });
    expect(badAddress.isError).toBe(true);
    expect(urls).toEqual([]); // nothing reached the API

    const unknown = await mcp.callTool({ name: "send_funds", arguments: {} });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain("Unknown tool");

    const limited = await mcp.callTool({ name: "get_overview", arguments: {} });
    expect(limited.isError).toBe(true);
    expect(textOf(limited)).toContain("429");
  });

  it("offers no tool that can write", async () => {
    const { client } = fakeApi(() => new Response("{}"));
    const mcp = await connect(client);
    for (const t of (await mcp.listTools()).tools) expect(t.name).toMatch(/^get_/);
    expect(ApiError).toBeDefined();
  });
});
