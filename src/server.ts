#!/usr/bin/env -S npx tsx
/**
 * TRIZ MCP — deterministic, read-only TRIZ knowledge and routing (stdio).
 *
 * Exposes the deterministic TRIZ knowledge core so an agent (or the
 * triz-innovation skill) can only cite principles it has *looked up*, not ones it
 * recalled from memory (the AutoTRIZ faithfulness anchor). Pure read-only compute.
 * Data lives in skills/triz-innovation/data/.
 *
 * Register in .mcp.json:
 *   "triz": { "type": "stdio", "command": "npx", "args": ["tsx", "src/server.ts"] }
 * Published package: npx -y triz-mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import "./data.js"; // installs the fs-backed provider (side effect)
import { toolSpecs, bindV1 } from "./tools.js";
import * as graph from "./graph.js";
import { loadElk } from "./elk.js";
import { version } from "./version.js";

const server = new McpServer({ name: "triz-mcp", version });
bindV1(server, toolSpecs({ graph, layout: loadElk }));

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("[triz-mcp] stdio server started.");
}

main().catch((err) => {
  console.error("[triz-mcp] Fatal:", err);
  process.exit(1);
});
