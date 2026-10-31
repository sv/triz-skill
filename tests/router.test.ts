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

test("every hosted tool is routed or explicitly exempt from method routing", () => {
  const routed = new Set(triz.toolCatalog().flatMap(t => t.mcp_tools ?? []));
  // Infrastructure and specialist checks are invoked from the model workflow,
  // rather than presented as an implementation of a named TRIZ method.
  const exempt = new Set([
    "triz_tool_catalog", "triz_route", "triz_build_model", "triz_expand_hierarchy", "triz_export", "triz_behavior", "triz_dynamics", "triz_feasibility", "triz_abstraction", "triz_evals",
    "triz_subsystem_contract", "triz_adequacy", "triz_isomorphism", "triz_behavior_refinement", "triz_subsystem_summary", "triz_implementations", "triz_absorber_assignments", "triz_synthesize",
    "triz_global_separation", "triz_queue", "triz_conservation", "triz_rule_set", "triz_rewrite_pair", "triz_trim_rewrite",
  ]);
  for (const tool of toolSpecs()) assert.ok(routed.has(tool.name) || exempt.has(tool.name), `${tool.name} is undiscoverable and has no explicit exemption`);
  for (const tool of ["triz_lifecycle","triz_bond_graph","triz_effect_chains"]) assert.ok(routed.has(tool));
});

test("router → tool mapping is pinned", () => {
  const mapped = Object.fromEntries(triz.toolCatalog().filter((t) => t.mcp_tools).map((t) => [t.source_code, t.mcp_tools]));
  assert.deepEqual(mapped, {
    EDB: ["triz_knowledge", "triz_effects", "triz_effect_chains", "triz_effect_setup", "triz_effect_insert", "triz_component_search", "triz_component_catalogue"],
    PRINCIPLES: ["triz_principle"],
    SEPARATION: ["triz_separate"],
    SO: ["triz_nine_windows"],
    TC: ["triz_parameter", "triz_matrix", "triz_matrix_multi", "triz_resolve"],
    FA_PRODUCT: ["triz_function_model", "triz_lifecycle", "triz_bond_graph"],
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
