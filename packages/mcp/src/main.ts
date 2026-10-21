#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@onyc/sdk";
import { createServer } from "./server.js";

// stdout carries the protocol, so everything we say goes to stderr.
const baseUrl = process.env["API_PUBLIC_URL"] ?? "http://localhost:4000";
const server = createServer(createClient({ baseUrl }));
await server.connect(new StdioServerTransport());
console.error(`onyc-terminal MCP server ready (read-only, API ${baseUrl})`);
