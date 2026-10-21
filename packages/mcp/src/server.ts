import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ApiError, type Client } from "@onyc/sdk";
import { ZodError } from "zod";
import { buildTools } from "./tools.js";

/** Only the part of the SDK client the tools use, so a test can pass a fake. */
export type ApiClient = Pick<Client, "call">;

const text = (value: unknown, isError = false) => ({
  content: [
    { type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value) },
  ],
  ...(isError ? { isError: true } : {}),
});

/**
 * A read-only MCP server over the /v1 API: one tool per read endpoint. It cannot write anything, sign anything or move anything,
 * because the API it wraps has no such routes. Errors come back as tool results with `isError`, in a sentence, never as a crash.
 */
export function createServer(
  client: ApiClient,
  info: { name: string; version: string } = { name: "onyc-terminal", version: "0.1.0" },
): Server {
  const tools = buildTools();
  const byName = new Map(tools.map((t) => [t.name, t]));
  const server = new Server(info, {
    capabilities: { tools: {} },
    instructions:
      "ONyc Terminal is an unofficial, community-built, read-only analytics API for OnRe's ONyc. Tools return live data with its source and age. Not affiliated with OnRe; not investment advice.",
  });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object" },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (tool === undefined)
      return text(
        `Unknown tool "${request.params.name}". Call tools/list to see the available tools.`,
        true,
      );
    try {
      const { params, query } = tool.parse(request.params.arguments);
      const result = await client.call(tool.endpoint, { params, query } as never);
      return text(result);
    } catch (e) {
      if (e instanceof ZodError) {
        return text(
          `Invalid arguments for ${tool.name}: ${e.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`,
          true,
        );
      }
      if (e instanceof ApiError)
        return text(`The API answered ${e.status} for ${tool.name}: ${e.message}`, true);
      return text(`${tool.name} failed: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  });

  return server;
}
