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
for (const required of ["triz_parameter", "triz_principle", "triz_matrix", "triz_resolve", "triz_tool_catalog", "triz_effects", "triz_route", "triz_evals", "triz_function_model", "triz_trim", "triz_separate", "triz_export", "triz_transform", "triz_nine_windows", "triz_behavior"]) {
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

const multi = await json("triz_matrix_multi", { improving: [9, 14], worsening: [14, 26] });
console.log(`triz_matrix_multi [9,14]x[14,26] -> top: ${multi.aggregated.slice(0, 2).map((a) => a.principle + "(x" + a.cell_count + ")").join(", ")} of ${multi.covered_cells}/${multi.total_cells} cells`);
if (multi.covered_cells !== 3 || multi.total_cells !== 4) fail("multi lookup cell accounting wrong");
const multiBlank = await json("triz_matrix_multi", { improving: [10, 16], worsening: [16, 10] });
if (multiBlank.covered !== false) fail("all-blank multi lookup did not fail closed");

const route = await json("triz_route", { stage: "analysis", signals: ["bottleneck"] });
console.log(`triz_route analysis/bottleneck -> ${route.tools.length} tools`);
if (!route.tools.every((t) => t.stages.includes("analysis"))) fail("router returned non-analysis tools");

const eff = await json("triz_effects", { query: "convert temperature difference into voltage" });
console.log(`triz_effects temperature->voltage -> ${eff.effects.slice(0, 3).map((e) => e.name).join(", ")}`);
if (!eff.effects.slice(0, 5).some((e) => e.name === "Seebeck effect")) fail("effects search missed Seebeck effect");

const model = {
  domain: "physical",
  carriers: [{ id: "load", layer: "energy", dimension: "N" }, { id: "heat", layer: "energy", dimension: "W" }],
  boxes: [
    { id: "bearing", name: "Bearing", role: "mediator", outputs: [{ id: "race", carrier: "load" }, { id: "rub", carrier: "heat" }] },
    { id: "housing", name: "Housing", role: "mediator", outputs: [{ id: "bore", carrier: "load" }] },
    { id: "shaft", name: "Shaft", role: "product", inputs: [{ id: "seat", carrier: "load" }, { id: "warm", carrier: "heat" }] },
  ],
  wires: [
    { id: "w-support", from: { box: "bearing", port: "race" }, to: { box: "shaft", port: "seat" }, carrier: "load", polarity: "useful" },
    { id: "w-heat", from: { box: "bearing", port: "rub" }, to: { box: "shaft", port: "warm" }, carrier: "heat", polarity: "harmful" },
  ],
};
const trim = await json("triz_trim", { model, trim: ["bearing"] });
console.log(`triz_trim bearing -> ${trim.verdict} via ${trim.functions?.[0]?.absorbers.map((a) => a.box)}`);
if (trim.verdict !== "typed-feasible" || trim.functions[0].absorbers[0].box !== "housing") fail("trim screen wrong");
const mistyped = await json("triz_function_model", { model: { ...model, wires: [{ ...model.wires[0], carrier: "heat" }] } });
if (mistyped.ok !== false) fail("mistyped wire did not fail closed");

const compared = await json("triz_function_model", { model, compare_to: model });
console.log(`triz_function_model compare_to self -> isomorphic=${compared.comparison?.isomorphism?.isomorphic}, basis=${compared.comparison?.isomorphism?.basis}`);
if (compared.comparison?.isomorphism?.isomorphic !== true) fail("compare_to isomorphism missing");
if (names.includes("triz_isomorphic")) fail("triz_isomorphic should be folded into triz_function_model");

const dot = await json("triz_export", { model, format: "dot" });
console.log(`triz_export dot -> ${dot.content?.split("\n").length} lines`);
if (!dot.ok || !dot.content.startsWith("digraph function_model {")) fail("DOT export wrong");
const hyper = await json("triz_export", { model, format: "hypergraph" });
console.log(`triz_export hypergraph -> ${hyper.content?.vertices.length} vertices, ${hyper.content?.hyperedges.length} hyperedges`);
if (!hyper.ok || hyper.content.vertices.length !== 5 || hyper.content.hyperedges.length !== 5) fail("hypergraph export wrong");
const badExport = await json("triz_export", { model: { ...model, wires: [{ ...model.wires[0], carrier: "heat" }] }, format: "dot" });
if (badExport.ok !== false) fail("mistyped export did not fail closed");

const trimmed = await json("triz_transform", { model, transformation: { op: "trim", trim: ["bearing"] } });
console.log(`triz_transform trim bearing -> ${trimmed.model?.boxes.map((b) => b.id)}`);
if (!trimmed.ok || trimmed.chosen[0].box !== "housing") fail("applied trim wrong");
const merged = await json("triz_transform", { model, transformation: { op: "merge", boxes: ["bearing", "shaft"], into: { id: "rotor", name: "Rotor", role: "product" } } });
console.log(`triz_transform merge bearing+shaft -> hidden harms ${merged.hiddenHarms}`);
if (!merged.ok || merged.hiddenHarms.join() !== "w-heat") fail("merge wrong");
const dangling = await json("triz_transform", { model, transformation: { op: "rewrite", delete: { boxes: ["bearing"] } } });
if (dangling.ok !== false) fail("dangling rewrite did not fail closed");

const grid = await json("triz_nine_windows", { present: model, subsystem: ["bearing", "shaft"], transitions: { present_to_future: [{ op: "trim", trim: ["bearing"] }] } });
const step = grid.transitions?.[0];
console.log(`triz_nine_windows present_to_future trim -> future ${step?.snapshot}, boundary added [${step?.subsystem?.boundary?.added}]`);
if (!grid.ok || step.snapshot !== "derived" || grid.windows[2].status !== "ok" || step.subsystem.boundary.added.join() !== "w-support") fail("9-windows transition wrong");
const unreached = await json("triz_nine_windows", { present: model, future: model, subsystem: ["shaft"], transitions: { present_to_future: [{ op: "trim", trim: ["bearing"] }] } });
if (unreached.ok !== false) fail("unreachable future snapshot did not fail closed");

const behaving = {
  ...model,
  carriers: [{ ...model.carriers[0], values: ["held", "loose"] }, { ...model.carriers[1], values: ["low", "high"] }],
  boxes: [
    { ...model.boxes[0], behavior: [{ in: {}, out: { race: "held", rub: "low" } }] },
    { ...model.boxes[1], behavior: [{ in: {}, out: { bore: "held" } }] },
    model.boxes[2],
  ],
};
const decided = await json("triz_behavior", { model: behaving, trim: ["bearing"] });
console.log(`triz_behavior trim bearing -> ${decided.verdict}`);
if (decided.verdict !== "preserved") fail("decided trim wrong");
const undecided = await json("triz_behavior", { model, trim: ["bearing"] });
if (undecided.verdict !== "undecided" || undecided.missingBehavior.join() !== "bearing,housing") fail("missing behaviour not reported");

await client.close();
console.log("SMOKE OK");
