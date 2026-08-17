#!/usr/bin/env node
/**
 * MCP handshake smoke test against a built server.
 *
 *   node scripts/smoke-mcp.mjs [path-to-server.js]   (default: dist/server.js)
 *
 * Spawns the server over stdio as a real MCP client, performs the initialize
 * handshake, lists tools, and asserts fail-closed + canonical lookups. Used in
 * CI after build and in the release workflow before npm publish.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const target = process.argv[2] ?? "dist/server.js";

const transport = new StdioClientTransport({ command: process.execPath, args: [target] });
const client = new Client({ name: "triz-smoke", version: "0.0.0" });

function fail(msg) { console.error(`FAIL: ${msg}`); process.exit(1); }

await client.connect(transport);
console.log(`connected to ${target}`);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
console.log(`tools (${names.length}): ${names.join(", ")}`);
for (const required of ["triz_parameter", "triz_principle", "triz_matrix", "triz_resolve", "triz_tool_catalog", "triz_route", "triz_evals"]) {
  if (!names.includes(required)) fail(`missing tool ${required}`);
}

const json = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return JSON.parse(r.content[0].text);
};

const cell = await json("triz_matrix", { improving: 9, worsening: 14 });
console.log(`triz_matrix 9-14 -> [${cell.principles}]`);
if (!cell.covered || cell.principles.join(",") !== "8,3,26,14") fail("canonical cell 9-14 wrong");

const blank = await json("triz_matrix", { improving: 10, worsening: 16 });
console.log(`triz_matrix 10-16 covered=${blank.covered}`);
if (blank.covered !== false || !blank.hint) fail("blank cell did not fail closed");

const route = await json("triz_route", { stage: "analysis", signals: ["bottleneck"] });
console.log(`triz_route analysis/bottleneck -> ${route.tools.length} tools`);
if (!route.tools.every((t) => t.stages.includes("analysis"))) fail("router returned non-analysis tools");

await client.close();
console.log("SMOKE OK");
