import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { knowledge } from "../src/data.js";
import { compileKnowledge, typedKnowledgeEffects } from "../src/knowledge.js";
import { setupEffectModel } from "../src/knowledge-setup.js";
import { knowledgeModelCatalogue } from "../src/knowledge-models.js";
import { insertEffectChain } from "../src/act-effect-insert.js";
import { rewrite } from "../src/act-rewrite.js";
import { effectChains } from "../src/act-effects.js";
import { toolSpecs } from "../src/tools.js";

const k = knowledge();
const configPack = () => structuredClone(k.packs.find(p => p.id === "physical")!) as any;
test("named compositions reject missing ports/models, type casts, duplicate supplies and unused nodes", () => {
  const edits = [
    (c: any) => { c.nodes[0].model = "physical:missing"; },
    (c: any) => { c.nodes.push(c.nodes[0]); },
    (c: any) => { c.inputs[1].id = c.inputs[0].id; },
    (c: any) => { c.inputs[0].primary = false; },
    (c: any) => { c.outputs[0].from.port = "missing"; },
    (c: any) => { c.inputs.splice(1, 1); },
    (c: any) => { c.wires.push(c.wires[0]); },
    (c: any) => { c.wires[0].to.port = "field"; },
    (c: any) => { c.nodes.push({ id: "unused", model: "physical:gas-flow-response" }); c.inputs.push({ id: "unused", targets: [{ node: "unused", port: "force" }] }); },
  ];
  for (const edit of edits) { const pack = configPack(); edit(pack.effects.find((e: any) => e.id === 33).configuration); assert.throws(() => compileKnowledge([pack])); }
  const wrongMeaning = configPack();
  wrongMeaning.models.find((m: any) => m.id === "physical:corona-ionization").outputs[0].parameter = "physical:current"; // Same SI as ion current.
  assert.throws(() => compileKnowledge([wrongMeaning]), /changes quantity parameter/);
  const reverse = compileKnowledge([...k.packs].reverse());
  assert.deepEqual(reverse.effects.find(e => e.id === 33), k.effects.find(e => e.id === 33));
});

test("lookup retains a conditional summary but setup expands it; opaque insertion cannot restore the removed generator", async () => {
  const e = k.effects.find(e => e.id === 33)!;
  assert.equal(e.definition.form, "configuration");
  assert.deepEqual([e.input_parameter, e.output_parameter], ["physical:voltage", "physical:fluid-velocity"]);
  const typed = typedKnowledgeEffects(k.effects).find(e => e.id === 33)!;
  const chains = effectChains({ resources: [typed.input], output: typed.output, k: 1 }, typedKnowledgeEffects(k.effects));
  assert.ok(chains.ok && chains.chains.some(c => c.effects[0]?.id === 33 && c.requiresExpansion));
  const setup = setupEffectModel({ chain: [33], domain: "physical" }, k);
  assert.ok(setup.ok, JSON.stringify(setup));
  assert.equal(setup.model.boxes.length, 5);
  assert.equal(setup.model.boxes.filter(b => b.role === "tool").length, 3);
  assert.equal(setup.model.boxes.find(b => b.id === "resource")!.outputs!.length, 3);
  assert.equal(setup.model.boxes.find(b => b.id === "resource")!.behavior, undefined);
  const { realization, realization_conditions, ...withoutMarker } = typed;
  assert.equal(insertEffectChain({ model: { ...setup.model, boxes: setup.model.boxes.slice(0, 2), wires: [] },
    from: { box: "resource", port: "out" }, to: { box: "required", port: "in" }, chain: [withoutMarker] }, [typed]).ok, false);
  const base = { ...setup.model, boxes: setup.model.boxes.slice(0, 2), wires: [] };
  const replay = rewrite(base, setup.rewrite);
  assert.ok(replay.ok); assert.deepEqual(replay.model, setup.model);
  const invalid = [
    { declarations: [{ behavior: [{ in: { in: "1" }, out: { out: "1" } }] }] },
    { node_declarations: { "0/missing": {} } },
    { context_values: { "0/field": ["drift"] } },
  ];
  for (const options of invalid) assert.equal(setupEffectModel({ chain: [33], domain: "physical", ...options }, k).ok, false);
  assert.equal(setupEffectModel({ chain: [74], domain: "physical", node_declarations: { "0/flow": {} } }, k).ok, false);
  const tool = toolSpecs().find(t => t.name === "triz_effect_setup")!;
  const result: any = await tool.handler({ chain: [33], domain: "physical", certificate: true });
  assert.equal(JSON.parse(result.content[0].text).certificate.format, "lean");
  const catalogue = knowledgeModelCatalogue({ source: "knowledge", effects: [33] }, k);
  assert.ok(catalogue.ok && "named_configurations" in catalogue);
  assert.equal(catalogue.catalogue.entries.length, 3);
  assert.equal(catalogue.named_configurations?.length, 1);
  assert.ok(catalogue.catalogue.entries.every(c => c.id.startsWith("physical:")));
  assert.equal(knowledgeModelCatalogue({ source: "knowledge", effects: [33], models: ["physical:corona-ionization"] }, k).ok, false);
  assert.equal(knowledgeModelCatalogue({ source: "knowledge", effects: [18] }, k).ok, false);
});

test("a serial recipe containing a named configuration retains integration hypotheses and expands all components", () => {
  const pack = configPack();
  pack.effects.push({ id: "physical:wind-pressure", kind: "composite", name: "Wind pressure", category: "synthetic", function: "Selected conditional composition",
    statement: "Not an empirical device", hints: [], steps: [33, 24], conditions: ["explicit duct integration"], source: "synthetic regression" });
  const combined = compileKnowledge([pack]);
  const setup = setupEffectModel({ chain: ["physical:wind-pressure"], domain: "physical" }, combined);
  assert.ok(setup.ok, JSON.stringify(setup));
  assert.equal(setup.model.boxes.length, 6);
  assert.ok(setup.unmetConditions.includes("explicit duct integration"));
  assert.ok(setup.setup.sources.some(e => e.id === "physical:wind-pressure"));
});

test("hierarchy lowering preserves shared primary pins, output aliases, hidden outputs and fresh observation ids", () => {
  const pack = configPack(), wind = pack.effects.find((e: any) => e.id === 33).configuration;
  wind.outputs.push({ id: "alias", from: { ...wind.outputs[0].from } }, { id: "internal-force", from: { node: "momentum", port: "force" } });
  pack.models.find((m: any) => m.id === "physical:gas-flow-response").outputs.push({ id: "diagnostic", parameter: "physical:fluid-velocity" });
  const force = pack.effects.find((e: any) => e.id === 59).configuration;
  const old = force.nodes[0].id; force.nodes[0].id = "observe-0";
  for (const p of force.inputs) for (const t of p.targets) if (t.node === old) t.node = "observe-0";
  for (const p of force.outputs) if (p.from.node === old) p.from.node = "observe-0";
  const registry = compileKnowledge([pack]);
  for (const id of [33, 35, 59]) {
    const setup = setupEffectModel({ chain: [id], domain: "physical" }, registry);
    assert.ok(setup.ok, JSON.stringify(setup));
    assert.ok(setup.model.boxes.every(b => !b.inner && !b.behavior));
    const replay = rewrite({ ...setup.model, boxes: setup.model.boxes.slice(0, 2), wires: [] }, setup.rewrite);
    assert.ok(replay.ok); assert.deepEqual(replay.model, setup.model);
    if (id === 35) assert.equal(setup.model.wires.filter(w => w.from.box === "resource" && w.from.port === "out").length, 2);
    if (id === 33) assert.equal(setup.model.boxes.find(b => b.id === "effect-0/flow")!.outputs!.length, 2);
    if (id === 59) assert.notEqual(setup.setup.model_sources![0].node, setup.setup.boundary_mappings![0].box);
  }
});

test("a software configuration instantiates one stateful template twice under one type environment", () => {
  const signal = "software:signal", memory = "software:memory", model = "software:delay", effect = "software:double-delay";
  const source = { citation: "Synthetic cross-domain regression", license: "MIT" };
  const registry = compileKnowledge([{
    format: "triz-knowledge-pack-v1", id: "software", domain: "software", title: "Synthetic delay model",
    source, review: { status: "draft", note: "Synthetic, not an empirical claim" }, limitations: ["Finite fixture only"],
    parameters: [signal, memory].map(id => ({ id, name: id, quantity: id, description: "Synthetic bit meaning", layer: "information" })),
    models: [{ id: model, name: "Delay", description: "Remember one prior input", parents: [effect],
      inputs: [{ id: "in", parameter: signal }], outputs: [{ id: "out", parameter: signal }], state_parameter: memory,
      conditions: ["Discrete synchronous steps"], provenance: source, limitations: ["Two-state fixture"] }],
    effects: [{ id: effect, kind: "configuration", role: "response", name: "Two delays", category: "synthetic",
      function: "Delay twice", statement: "Compose two independently initialized instances", hints: [],
      field: "information", conditions: [], source: source.citation, typed_from: "source",
      configuration: { nodes: [{ id: "first", model }, { id: "second", model }],
        wires: [{ from: { node: "first", port: "out" }, to: { node: "second", port: "in" } }],
        inputs: [{ id: "input", targets: [{ node: "first", port: "in" }], primary: true }],
        outputs: [{ id: "output", from: { node: "second", port: "out" }, primary: true }] } }],
  }]);
  const bindings = { [signal]: { values: ["0", "1"] } };
  const implementation = (initial: string) => ({ state: ["0", "1"], initial: [initial],
    transition: ["0", "1"].flatMap(state => ["0", "1"].map(input => ({ state, in: { in: input }, next: input, out: { out: state } }))) });
  const first = implementation("0"), second = implementation("1");
  const catalogue = knowledgeModelCatalogue({ source: "knowledge", models: [model], bindings, declarations: { [model]: first } }, registry);
  const options = { chain: [effect], domain: "software" as const, bindings,
    node_declarations: { "0/first": first, "0/second": second } };
  const setup = setupEffectModel(options, registry);
  assert.ok(catalogue.ok && setup.ok, JSON.stringify({ catalogue, setup }));
  assert.deepEqual(setup.model.carriers, catalogue.catalogue.carriers);
  const component = catalogue.catalogue.entries[0];
  assert.ok("component" in component);
  assert.deepEqual(setup.model.boxes.find(b => b.id === "effect-0/first"), { ...component.component, id: "effect-0/first" });
  assert.deepEqual(setup.model.boxes.find(b => b.id === "effect-0/second")!.initial, ["1"]);
  const repeated = setupEffectModel({ ...options, chain: [effect, effect], node_declarations: {
    ...options.node_declarations, "1/first": second, "1/second": first,
  } }, registry);
  assert.ok(repeated.ok, JSON.stringify(repeated));
  assert.deepEqual(repeated.model.boxes.filter(b => b.role === "tool").map(b => [b.id, b.initial]), [
    ["effect-0/first", ["0"]], ["effect-0/second", ["1"]], ["effect-1/first", ["1"]], ["effect-1/second", ["0"]],
  ]);
  const invalid = setupEffectModel({ ...options, node_declarations: { ...options.node_declarations,
    "0/second": { behavior: [{ in: { in: "0" }, out: { out: "0" } }] } } }, registry);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.issues[0].path, "$.node_declarations.0/second");
});

test("reduction preserves every ranked lookup and all eight patent candidate topologies, with finite behavior and rejection controls", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "examples/assurance/effects-reduction.mjs"], { encoding: "utf8", timeout: 30000 });
  const r = JSON.parse(output);
  assert.deepEqual(r.independent_unary_interfaces, { before: 70, previous: 69, after: 66 });
  assert.deepEqual(r.converted_ids, [20, 33, 35, 59]);
  assert.ok(r.ranked_text_queries > 300); assert.equal(r.typed_chain_queries, 78);
  assert.equal(r.finite_boundary_behavior, "preserved");
  assert.equal(r.patent_comparison.cases.length, 8);
  assert.ok(r.patent_comparison.cases.every((c: any) => c.fully_expressed_topologies_preserved && c.before_candidates === c.after_candidates + c.removed_opaque_shortcuts));
  assert.equal(r.certificate_count, 9);
  assert.equal(r.boundary_validation.patent_cases.length, 3);
  assert.ok(r.boundary_validation.finite_relations.every((r: any) => r.verdict === "preserved"));
});
