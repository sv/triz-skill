/**
 * Router entries name the MCP tools that carry out their method. Every named tool must exist,
 * and the mapping is pinned so widening it is a deliberate, reviewed change. Unmapped on purpose:
 *  - process functional analysis and process trimming (#29, #31): MATRIZ trims processes with
 *    five rule sets keyed by function rank, while the kernel implements only the device rules
 *    A/B/C;
 *  - function-cost analysis (#34): the kernel neither ranks functions nor allocates cost to them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as triz from "../src/data.js";
import { toolSpecs } from "../src/tools.js";

test("every mcp_tools name is a registered tool", () => {
  const names = new Set(toolSpecs().map((s) => s.name));
  const named = triz.toolCatalog().flatMap((t) => t.mcp_tools ?? []);
  assert.ok(named.length > 0);
  for (const n of named) assert.ok(names.has(n), `router names unknown tool '${n}'`);
});

test("router → tool mapping is pinned", () => {
  const mapped = Object.fromEntries(triz.toolCatalog().filter((t) => t.mcp_tools).map((t) => [t.source_code, t.mcp_tools]));
  assert.deepEqual(mapped, {
    EDB: ["triz_effects", "triz_effect_chains", "triz_effect_insert", "triz_component_search"],
    PRINCIPLES: ["triz_principle"],
    SEPARATION: ["triz_separate"],
    SO: ["triz_nine_windows"],
    TC: ["triz_parameter", "triz_matrix", "triz_matrix_multi", "triz_resolve"],
    FA_PRODUCT: ["triz_function_model"],
    TRIM_PRODUCT: ["triz_trim", "triz_transform"],
    PC: ["triz_separate"],
    TESE: ["triz_rule_apply"],
    FLOW: ["triz_flow"],
    MPV: ["triz_function_model", "triz_weakness"],
  });
  for (const code of ["FA_PROCESS", "TRIM_PROCESS", "FCA"]) {
    assert.equal(triz.toolCatalog().find((t) => t.source_code === code)!.mcp_tools, undefined, code);
  }
});

test("triz_route and triz_tool_catalog return mcp_tools", async () => {
  const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
  const routed = JSON.parse((await specs.triz_route.handler({ stage: "synthesis", signals: ["physical contradiction"] })).content[0].text);
  assert.deepEqual(routed.tools.find((t: triz.TrizTool) => t.source_code === "SEPARATION").mcp_tools, ["triz_separate"]);
  const catalog = JSON.parse((await specs.triz_tool_catalog.handler({ stage: "modeling" })).content[0].text);
  assert.deepEqual(catalog.find((t: triz.TrizTool) => t.source_code === "TRIM_PRODUCT").mcp_tools, ["triz_trim", "triz_transform"]);
  const discovered=JSON.parse((await specs.triz_route.handler({stage:"synthesis",signals:["desired properties"]})).content[0].text);
  assert.ok(discovered.tools.some((t:triz.TrizTool)=>t.mcp_tools?.includes("triz_component_search")));
});
