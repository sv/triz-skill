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
import fs from "node:fs";
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
for (const required of ["triz_parameter", "triz_principle", "triz_matrix", "triz_resolve", "triz_tool_catalog", "triz_effects", "triz_route", "triz_evals", "triz_function_model", "triz_trim", "triz_separate", "triz_export", "triz_transform", "triz_nine_windows", "triz_rule_apply", "triz_behavior", "triz_weakness", "triz_feasibility", "triz_dynamics", "triz_abstraction", "triz_flow", "triz_build_model", "triz_expand_hierarchy", "triz_subsystem_contract", "triz_import_source", "triz_review_import"]) {
  if (!names.includes(required)) fail(`missing tool ${required}`);
}

const json = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return JSON.parse(r.content[0].text);
};

// Source import stays a draft through the actual stdio schema/handler boundary.
const imported = await json("triz_import_source", { format: "bom-csv", source: {
  id: "synthetic.csv", text: "id,name,parent_id\nroot,Assembly,\npart,Component,root\n",
} });
if (!imported.ok || imported.model.provenance?.status !== "draft") fail("local import did not retain draft provenance");
const unreviewed = await json("triz_function_model", { model: imported.model });
if (unreviewed.ok !== false || !unreviewed.issues.some(i => i.code === "draft-model")) fail("bare imported model bypassed draft guard");
const reviewed = await json("triz_review_import", { model: imported.model,
  decisions: imported.model.provenance.pending.map(p => ({ id: p.id, decision: "confirm", note: "Synthetic smoke fixture" })),
});
if (!reviewed.ok || reviewed.model.provenance.status !== "reviewed" || reviewed.model.provenance.hierarchy?.length !== 1) fail("review lost source containment");
const confirmed = await json("triz_function_model", { model: reviewed.model });
if (!confirmed.ok) fail("reviewed synthetic import cannot be analysed");
console.log("local import -> embedded draft guard -> reviewed source containment passed");
// Exercise joint_boxes through the published stdio schema and handler.
const jointIds = ["a", "b", "c"];
const jointBaseline = {
  domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }],
  boxes: [...jointIds.map(id => ({ id, name: id, role: "tool", outputs: [{ id: "o", carrier: "bit" }],
    behavior: [{ in: {}, out: { o: "0" } }] })),
    { id: "p", name: "Product", role: "product", inputs: jointIds.map(id => ({ id, carrier: "bit" })) }],
  wires: jointIds.map(id => ({ id: `w-${id}`, from: { box: id, port: "o" }, to: { box: "p", port: id }, carrier: "bit", polarity: "useful" })),
};
const jointConcept = structuredClone(jointBaseline);
for (const b of jointConcept.boxes) if (jointIds.includes(b.id)) delete b.behavior;
const jointSpec = await json("triz_behavior", { model: jointConcept, compare_to: jointBaseline,
  weakest_spec: true, joint_boxes: jointIds, full_relation: true });
if (!jointSpec.ok || jointSpec.verdict !== "spec" || jointSpec.joint?.rowCount !== 1 || jointSpec.joint.boxes.length !== 3) fail("joint residual did not cross MCP correctly");
console.log("triz_behavior joint_boxes -> 3-hole coupled residual passed");

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
if (!Array.isArray(trim.warnings)) fail("triz_trim reports no warnings channel");
const mistyped = await json("triz_function_model", { model: { ...model, wires: [{ ...model.wires[0], carrier: "heat" }] } });
if (mistyped.ok !== false) fail("mistyped wire did not fail closed");
console.log(`triz_function_model mistyped -> ${mistyped.issues?.[0]?.code} at ${mistyped.issues?.[0]?.path}`);
if (mistyped.issues?.[0]?.code !== "carrier-mismatch" || mistyped.issues[0].path !== "$.model.wires[0].carrier" || !mistyped.issues[0].hint) fail("structured issue missing");

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
const svg = await json("triz_export", { model, format: "svg" });
console.log(`triz_export svg -> ${svg.ok ? `${svg.content.length} bytes` : svg.issues?.[0]?.code}`);
if (!svg.ok || !svg.content.startsWith("<svg ")) fail("SVG export wrong (elkjs is an optional dependency: is it installed?)");
const badExport = await json("triz_export", { model: { ...model, wires: [{ ...model.wires[0], carrier: "heat" }] }, format: "dot" });
if (badExport.ok !== false) fail("mistyped export did not fail closed");
const cert = await json("triz_export", { model, format: "lean" });
console.log(`triz_export lean -> ${cert.certifies?.map((c) => c.theorem.split(".").at(-1)).join(", ")}`);
if (!cert.ok || !cert.content.startsWith("import CategoricalTriz\n") || cert.certifies[0]?.theorem !== "TrizCertificate.typed") fail("lean certificate wrong");

const trimmed = await json("triz_transform", { model, transformation: { op: "trim", trim: ["bearing"] } });
console.log(`triz_transform trim bearing -> ${trimmed.model?.boxes.map((b) => b.id)}`);
if (!trimmed.ok || trimmed.chosen[0].box !== "housing") fail("applied trim wrong");
const merged = await json("triz_transform", { model, transformation: { op: "merge", boxes: ["bearing", "shaft"], into: { id: "rotor", name: "Rotor", role: "product" } } });
console.log(`triz_transform merge bearing+shaft -> hidden harms ${merged.hiddenHarms}`);
if (!merged.ok || merged.hiddenHarms.join() !== "w-heat") fail("merge wrong");
const dangling = await json("triz_transform", { model, transformation: { op: "rewrite", delete: { boxes: ["bearing"] } } });
if (dangling.ok !== false) fail("dangling rewrite did not fail closed");

const listed = await json("triz_rule_apply", { model, rule_id: "mono-bi", at: { wires: { f: "w-support" } } });
console.log(`triz_rule_apply mono-bi at w-support -> ${listed.matches?.length} match`);
if (!listed.ok || listed.matches.length !== 1 || !listed.matches[0].applicable) fail("rule match listing wrong");
const bi = await json("triz_rule_apply", { model, rule_id: "mono-bi", match: listed.matches[0].match });
console.log(`triz_rule_apply mono-bi -> ${bi.model?.boxes.map((b) => b.id)}`);
if (!bi.ok || !bi.model.boxes.some((b) => b.id === "bearing-2")) fail("rule application wrong");
const fed = await json("triz_rule_apply", { model, rule_id: "feedback", match: listed.matches[0].match });
if (fed.ok !== false) fail("unbound right-side carrier did not fail closed");
// Through the SDK's own validation: a listing entry passed as match is refused with a hint at its path.
const entry = await client.callTool({ name: "triz_rule_apply", arguments: { model, rule_id: "mono-bi", match: listed.matches[0] } });
console.log(`triz_rule_apply listing entry as match -> ${entry.content[0].text.split("\n").find((l) => l.includes("hint")) ?? "no hint"}`);
if (!entry.isError || !entry.content[0].text.includes("pass matches[i].match")) fail("listing entry as match got no hint");

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
const support = behaving.wires.find((w) => w.from.box === "bearing" && w.from.port === "race");
const sleeved = await json("triz_transform", { model: behaving, transformation: { op: "interpose", wire: support.id, mediator: { id: "sleeve", name: "Sleeve", behavior: "identity" } } });
if (!sleeved.ok || sleeved.behavior?.identity !== true) fail("identity mediator not built");
const mediated = await json("triz_behavior", { model: sleeved.model, compare_to: behaving });
console.log(`triz_behavior compare_to (identity mediator) -> ${mediated.verdict}`);
if (mediated.verdict !== "preserved") fail("identity mediator should preserve the relation");

const open = { ...behaving, boxes: [behaving.boxes[0], model.boxes[1], model.boxes[2]] };
const spec = await json("triz_behavior", { model: open, trim: ["bearing"], weakest_spec: true });
console.log(`triz_behavior weakest_spec housing -> ${spec.verdict} [${spec.spec?.map((r) => r.out.bore)}]`);
if (spec.verdict !== "spec" || spec.spec.map((r) => r.out.bore).join() !== "held") fail("weakest spec wrong");
const holding = (bore) => ({ ...behaving, boxes: [model.boxes[0], { ...model.boxes[1], behavior: [{ in: {}, out: { bore } }] }, model.boxes[2]], wires: [{ ...model.wires[0], from: { box: "housing", port: "bore" } }] });
const ranked = await json("triz_weakness", { concepts: [{ id: "held", model: holding("held") }, { id: "loose", model: holding("loose") }], acceptable: [{ box: "shaft", port: "seat", values: ["held"] }] });
console.log(`triz_weakness held vs loose -> ${ranked.pairs?.[0]?.order}, weakest [${ranked.weakest}]`);
if (ranked.pairs?.[0]?.order !== "first-weaker" || ranked.weakest.join() !== "held") fail("weakness ranking wrong");
const specCapped = await json("triz_behavior", { model: open, trim: ["bearing"], weakest_spec: true, max_states: 1 });
if (specCapped.verdict !== "undecided" || specCapped.reason !== "state-cap") fail("spec cap did not read undecided");
const feasible = {
  ...model,
  boxes: [
    { ...model.boxes[0], feasibility: [{ provides: { race: 3000 } }] },
    { ...model.boxes[1], feasibility: [{ provides: { bore: 400 } }, { provides: { bore: 3000 }, cost: { usd_unit: 22 } }] },
    { ...model.boxes[2], feasibility: [{ requires: { seat: 2500 } }] },
  ],
  budget: { usd_unit: 30 },
};
const absorbed = await json("triz_feasibility", { model: feasible, trim: ["bearing"] });
console.log(`triz_feasibility trim bearing -> ${absorbed.verdict}, housing adds ${JSON.stringify(absorbed.absorbers?.[0]?.added)}`);
if (absorbed.verdict !== "feasible" || absorbed.absorbers[0].added.usd_unit !== 22) fail("feasibility of the trim wrong");
const over = await json("triz_feasibility", { model: { ...feasible, budget: { usd_unit: 20 } }, trim: ["bearing"] });
if (over.verdict !== "infeasible" || over.binding.join() !== "usd_unit") fail("over-budget trim not infeasible");
const heater = {
  domain: "physical",
  carriers: [{ id: "power", layer: "energy", dimension: "W", values: ["off", "on"] }],
  boxes: [{ id: "heater", name: "Heater", role: "tool", inputs: [{ id: "power", carrier: "power" }], state: ["cold", "hot"], initial: ["cold"],
    transition: [
      { state: "cold", in: { power: "off" }, next: "cold", out: {} }, { state: "cold", in: { power: "on" }, next: "hot", out: {} },
      { state: "hot", in: { power: "off" }, next: "cold", out: {} }, { state: "hot", in: { power: "on" }, next: "hot", out: {} },
    ] }],
  wires: [],
};
const escalates = await json("triz_dynamics", { model: heater, unsafe: [{ box: "heater", state: ["hot"] }] });
console.log(`triz_dynamics heater -> ${escalates.escalation?.verdict} at t=${escalates.escalation?.time}`);
if (escalates.escalation?.verdict !== "reachable" || escalates.escalation.trace.length !== 2) fail("escalation wrong");
// The heater can cool again from hot: the closed component meets the unsafe set and recovers.
if (escalates.loops?.classes?.join() !== "recurrent") fail("loop classification wrong");
const held = await json("triz_dynamics", { model: heater, inputs: [[{ box: "heater", port: "power", values: ["off"] }], [{ box: "heater", port: "power", values: ["off"] }]], safe: [{ box: "heater", state: ["cold"] }] });
if (held.invariance?.verdict !== "invariant-within-horizon") fail("invariance under an input sequence wrong");
const capped = await json("triz_dynamics", { model: heater, unsafe: [{ box: "heater", state: ["hot"] }], max_states: 1 });
if (capped.ok !== false) fail("state cap did not fail closed");
const levelled = { ...feasible, carriers: feasible.carriers.map((c) => (c.id === "load" ? { ...c, values: ["loose", "held"], levels: [{ value: "loose", from: 0 }, { value: "held", from: 2500 }] } : c)) };
const linked = await json("triz_abstraction", { detailed: feasible, coarse: { ...levelled, boxes: holding("held").boxes, wires: model.wires }, map: { boxes: Object.fromEntries(model.boxes.map((b) => [b.id, b.id])) } });
console.log(`triz_abstraction identity map -> ${linked.verdict}, levels consistent ${linked.levels?.consistent}`);
if (linked.verdict !== "abstraction" || linked.levels?.consistent !== false) fail("abstraction or levels check wrong");
const unmapped = await json("triz_abstraction", { detailed: model, coarse: model, map: { boxes: { ghost: "bearing" } } });
if (unmapped.ok !== false) fail("malformed abstraction map did not fail closed");
const line = {
  domain: "physical",
  carriers: [{ id: "water", layer: "material", dimension: "m³/h" }, { id: "head", layer: "energy", dimension: "kPa" }],
  boxes: [
    { id: "pump", name: "Pump", role: "tool", outputs: [{ id: "out", carrier: "head" }] },
    { id: "valve-a", name: "Valve A", role: "tool", outputs: [{ id: "drop", carrier: "head" }] },
    { id: "valve-b", name: "Valve B", role: "tool", outputs: [{ id: "drop", carrier: "head" }] },
    { id: "water", name: "Water", role: "product", inputs: [{ id: "head", carrier: "head" }] },
  ],
  wires: [
    { id: "w-pump", from: { box: "pump", port: "out" }, to: { box: "water", port: "head" }, carrier: "head", polarity: "useful" },
    { id: "w-a", from: { box: "valve-a", port: "drop" }, to: { box: "water", port: "head" }, carrier: "head", polarity: "harmful" },
    { id: "w-b", from: { box: "valve-b", port: "drop" }, to: { box: "water", port: "head" }, carrier: "head", polarity: "useful" },
  ],
  flows: [{ id: "line", carrier: "water", medium: "water", path: ["pump", "valve-a", "valve-b"] }],
};
const flowed = await json("triz_flow", { model: line });
console.log(`triz_flow line -> bottlenecks [${flowed.flows?.[0]?.bottlenecks.map((b) => b.box)}]`);
if (flowed.flows?.[0]?.bottlenecks.map((b) => b.box).join() !== "valve-a") fail("flow bottleneck wrong");
const series = await json("triz_transform", { model: line, transformation: { op: "merge", boxes: ["valve-a", "valve-b"], into: { id: "valves", name: "Valves" } } });
if (!series.ok || series.flows?.paths?.line?.join() !== "pump,valves") fail("merge along a flow failed");
const lagging = await json("triz_rule_apply", { model, rule_id: "uneven-development" });
console.log(`triz_rule_apply uneven-development -> ${lagging.verdict}`);
if (!lagging.ok) fail("uneven-development detector failed");

const assuranceExamples = JSON.parse(fs.readFileSync(new URL("../examples/assurance/requests.json", import.meta.url), "utf8"));
for (const example of assuranceExamples) {
  if (!names.includes(example.tool)) fail(`missing assurance tool ${example.tool}`);
  const result = await json(example.tool, example.args);
  if (result.ok === false) fail(`${example.tool}: ${JSON.stringify(result)}`);
  for (const [key, expected] of Object.entries(example.expect)) if (result[key] !== expected) fail(`${example.tool}.${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(result[key])}`);
}
console.log(`finite assurance examples: ${assuranceExamples.length} passed through MCP stdio`);

await client.close();
console.log("SMOKE OK");
