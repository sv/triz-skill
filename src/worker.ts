/**
 * TRIZ MCP — hosted entry (Cloudflare Worker, stateless streamable HTTP).
 *
 * Uses the Agents SDK stateless handler (agents/mcp/server) over MCP SDK v2:
 * one fresh server per request, no sessions, no storage, fully read-only.
 * The knowledge base is bundled as JSON imports (no filesystem on Workers)
 * and installed into the pure core via useProvider. The fs-backed graph tools
 * (triz_graph / triz_purpose) are intentionally not registered here.
 *
 * Deploy: npx wrangler deploy   (wrangler.jsonc at repo root)
 * Endpoint: https://triz-mcp.<account-subdomain>.workers.dev/mcp
 */

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { toolSpecs, bindV2 } from "./tools.js";
import { useProvider, type DataFile } from "./core.js";
import parametersJson from "../skills/triz-innovation/data/parameters.json" with { type: "json" };
import principlesJson from "../skills/triz-innovation/data/principles.json" with { type: "json" };
import matrixJson from "../skills/triz-innovation/data/matrix.json" with { type: "json" };
import evalsJson from "../skills/triz-innovation/data/evals.json" with { type: "json" };
import toolRouterJson from "../skills/triz-innovation/data/tool-router.json" with { type: "json" };
import effectsJson from "../skills/triz-innovation/data/effects.json" with { type: "json" };
import pkg from "../package.json" with { type: "json" };

const bundled: Record<DataFile, unknown> = {
  "parameters.json": parametersJson,
  "principles.json": principlesJson,
  "matrix.json": matrixJson,
  "evals.json": evalsJson,
  "tool-router.json": toolRouterJson,
  "effects.json": effectsJson,
};
useProvider((file) => bundled[file]);

function createServer() {
  const server = new McpServer({ name: "triz-mcp", version: pkg.version });
  bindV2(server, toolSpecs());
  return server;
}

const handler = createMcpHandler(createServer);

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization, last-event-id",
  "access-control-expose-headers": "mcp-session-id",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/health") {
      return withCors(
        new Response(JSON.stringify({ ok: true, server: "triz-mcp", version: pkg.version, transport: "streamable-http" }) + "\n", {
          headers: { "content-type": "application/json" },
        }),
      );
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not Found. MCP endpoint: /mcp (POST), health: /health\n", {
        status: 404,
        headers: { "content-type": "text/plain", ...CORS },
      });
    }

    const response = await handler(request as any, env as any, ctx as any);
    return withCors(response as Response);
  },
} satisfies {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response>;
};
