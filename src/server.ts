#!/usr/bin/env -S npx tsx
/**
 * TRIZ MCP — deterministic, read-only TRIZ knowledge and routing.
 *
 * Exposes the deterministic TRIZ knowledge core so an agent (or the
 * triz-innovation skill) can only cite principles it has *looked up*, not ones it
 * recalled from memory (the AutoTRIZ faithfulness anchor). Pure read-only compute.
 * Data lives in skills/triz-innovation/data/.
 *
 * Register in .mcp.json:
 *   "triz": { "type": "stdio", "command": "npx", "args": ["tsx", "src/server.ts"] }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as triz from "./data.js";
import * as graph from "./graph.js";
import { version } from "./version.js";

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

const server = new McpServer({ name: "triz-mcp", version });

// deterministic tool: server.tool(name, desc, zodShape, handler)
server.tool(
  "triz_parameter",
  "Get a canonical TRIZ engineering parameter (1-39). Omit id to list all 39.",
  { id: z.number().int().min(1).max(39).optional().describe("Parameter number 1-39; omit to list all") },
  async ({ id }: { id?: number }) => text(id == null ? triz.parameters() : triz.getParameter(id) ?? { error: `no parameter ${id}` }),
);

server.tool(
  "triz_principle",
  "Get a canonical TRIZ inventive principle (1-40). Omit id to list all 40. Look up principle numbers instead of recalling them from memory.",
  { id: z.number().int().min(1).max(40).optional().describe("Principle number 1-40; omit to list all") },
  async ({ id }: { id?: number }) => text(id == null ? triz.principles() : triz.getPrinciple(id) ?? { error: `no principle ${id}` }),
);

server.tool(
  "triz_matrix",
  "Look up the canonical contradiction matrix for an improving and worsening engineering parameter. Blank and diagonal cells fail closed; never guess a recommendation.",
  {
    improving: z.number().int().min(1).max(39).describe("Parameter to improve (1-39)"),
    worsening: z.number().int().min(1).max(39).describe("Parameter that worsens (1-39)"),
  },
  async ({ improving, worsening }: { improving: number; worsening: number }) => text(triz.matrixLookup(improving, worsening)),
);

server.tool(
  "triz_resolve",
  "Look up a contradiction-matrix cell and expand its recommended principles and both engineering parameters. Fails closed on blank cells.",
  {
    improving: z.number().int().min(1).max(39).describe("Parameter to improve (1-39)"),
    worsening: z.number().int().min(1).max(39).describe("Parameter that worsens (1-39)"),
  },
  async ({ improving, worsening }: { improving: number; worsening: number }) => text(triz.resolve(improving, worsening)),
);

server.tool(
  "triz_tool_catalog",
  "List the domain-neutral TRIZ tool catalog, optionally restricted to problem analysis, task modeling, or solution synthesis.",
  { stage: z.enum(["analysis", "modeling", "synthesis"]).optional().describe("Optional workflow stage") },
  async ({ stage }: { stage?: triz.ToolStage }) => text(triz.toolCatalog(stage)),
);

server.tool(
  "triz_route",
  "Route a problem stage and optional observable signals to candidate TRIZ tools. Routing is deterministic and returns only tools registered for that stage.",
  {
    stage: z.enum(["analysis", "modeling", "synthesis"]).describe("Current workflow stage"),
    signals: z.array(z.string()).optional().describe("Problem signals such as bottleneck, stakeholder conflict, or harmful interaction"),
  },
  async ({ stage, signals }: { stage: triz.ToolStage; signals?: string[] }) => text(triz.routeTools(stage, signals)),
);

server.tool(
  "triz_evals",
  "Return the domain-neutral TRIZ lookup regressions and cross-domain reasoning cases.",
  {},
  async () => text(triz.evals()),
);

server.tool(
  "triz_graph",
  "Optional project extension: analyse an OTSM Network of Problems (contradiction graph) and its verifier-backed purpose gates. Requires a project graph via TRIZ_GRAPH; not part of the neutral skill core.",
  {},
  async () => text(graph.analyse()),
);

server.tool(
  "triz_purpose",
  "Optional project extension: inspect the invariant and purpose gate for one contradiction node of the project graph.",
  { id: z.string().describe("Node id as used in the project graph, e.g. S1") },
  async ({ id }: { id: string }) => {
    const node = graph.loadGraph().nodes.find((n) => n.id === id);
    if (!node) return text({ error: `no node ${id}` });
    return text({ id, purpose: node.purpose, refs: node.refs, gate: graph.purposeGate(node, graph.loadRegistryById()) });
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("[triz-mcp] stdio server started.");
}

main().catch((err) => {
  console.error("[triz-mcp] Fatal:", err);
  process.exit(1);
});
