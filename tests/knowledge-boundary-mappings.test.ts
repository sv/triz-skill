import { test } from "node:test";
import assert from "node:assert/strict";
import { knowledge } from "../src/data.js";
import { compileKnowledge } from "../src/knowledge.js";
import { setupEffectModel } from "../src/knowledge-setup.js";
import { knowledgeModelCatalogue } from "../src/knowledge-models.js";
import { searchComponents } from "../src/act-component-search.js";
import type { FunctionModel } from "../src/act.js";

const k = knowledge(), p = (s: string) => `physical:${s}`;
const physical = () => structuredClone(k.packs.find(p => p.id === "physical")!);
test("boundary refinements require sourced, directed, dimension/layer-preserving declarations and exact model-output sources", () => {
  const edits = [
    (m: any) => { m.id = "other:wrong"; },
    (m: any) => { m.input_parameter = p("missing"); },
    (m: any) => { m.output_parameter = p("voltage"); },
    (m: any) => { m.output_parameter = m.input_parameter; },
    (m: any) => { m.relation = "same-units"; },
    (m: any) => { m.rationale = " "; },
    (m: any) => { m.provenance.citation = ""; },
  ];
  for (const edit of edits) { const pack = physical(); edit(pack.boundary_mappings[0]); assert.throws(() => compileKnowledge([pack])); }
  const duplicate = physical(); duplicate.boundary_mappings.push(duplicate.boundary_mappings[0]);
  assert.throws(() => compileKnowledge([duplicate]), /Duplicate boundary mapping/);
  const changedLayer = physical(); changedLayer.parameters.find(p => p.id === "physical:current")!.layer = "information";
  assert.throws(() => compileKnowledge([changedLayer]), /carrier layer/);
  const wrongOutput = physical(), config = wrongOutput.effects.find(e => e.id === 35)!;
  assert.equal(config.kind, "configuration");
  if (config.kind === "configuration") config.configuration.outputs[0].mapping = p("particle-force-observation");
  assert.throws(() => compileKnowledge([wrongOutput]), /wrong source parameter/);
  const internal = physical(), wind = internal.effects.find(e => e.id === 33)!;
  if (wind.kind === "configuration") (wind.configuration.wires[0] as any).mapping = p("dc-current-observation");
  assert.throws(() => compileKnowledge([internal]), /Unrecognized key/);
  assert.deepEqual(compileKnowledge([...k.packs].reverse()).effects.find(e => e.id === 35), k.effects.find(e => e.id === 35));
});

test("three more named views expand with context and explicit observations, without new quantities or duplicate old implementations", () => {
  assert.equal(k.boundary_mappings.length, 2);
  assert.equal(k.models.length, 19); assert.equal(k.parameters.length, 91);
  assert.equal(k.counts.independent_contracts, 66); assert.equal(k.counts.configurations, 4);
  for (const [id, components, context] of [[20, 1, 1], [35, 3, 2], [59, 2, 1]]) {
    const e = k.effects.find(e => e.id === id)!;
    assert.equal(e.definition.form, "configuration");
    const setup = setupEffectModel({ chain: [id], domain: "physical" }, k);
    assert.ok(setup.ok, JSON.stringify(setup));
    assert.equal(setup.model.boxes.length, components + 2);
    assert.ok("context_inputs" in setup.setup); assert.equal(setup.setup.context_inputs?.length, context);
    const sources = "boundary_mappings" in setup.setup ? setup.setup.boundary_mappings : [];
    assert.equal(sources?.length, id === 20 ? 0 : 1);
    assert.ok(setup.model.boxes.every(b => !b.behavior && !b.transition), "typing-only setup infers no physical implementation");
    assert.equal("input" in physical().effects.find(e => e.id === id)!, false);
  }
  const all = knowledgeModelCatalogue({ source: "knowledge" }, k);
  assert.ok(all.ok);
  assert.ok(!all.catalogue.entries.some(e => e.id === p("dc-current-observation")), "observations are selected explicitly, not global aliases");
});

test("finite observations require identical explicit encodings; reversing one is impossible in the declared library", () => {
  const id = p("particle-force-observation");
  const mismatched = knowledgeModelCatalogue({ source: "knowledge", mappings: [id], bindings: {
    [p("particle-electric-force")]: { values: ["positive"] }, [p("force")]: { values: ["1N"] },
  } }, k);
  assert.equal(mismatched.ok, false);
  for (const extra of [{ layer: "information" as const }, { quantity: "extensive" as const }, { levels: [{ value: "1N", from: 0 }] }]) {
    assert.equal(knowledgeModelCatalogue({ source: "knowledge", mappings: [id], bindings: {
      [p("particle-electric-force")]: { values: ["1N"] }, [p("force")]: { values: ["1N"], ...extra },
    } }, k).ok, false, "observing a value must not change its layer, thresholds or resource semantics");
  }
  const incomplete = setupEffectModel({ chain: [35], domain: "physical", bindings: { [p("current")]: { values: ["1A"] } } }, k);
  assert.equal(incomplete.ok, false, "encoding of the refined current is not guessed");
  const catalogue = knowledgeModelCatalogue({ source: "knowledge", effects: [59], bindings: {
    [p("particle-electric-force")]: { values: ["-1N", "0", "1N"] }, [p("force")]: { values: ["-1N", "0", "1N"] },
  } }, k);
  assert.ok(catalogue.ok);
  const projection = catalogue.catalogue.entries.find(e => e.id === id)!;
  assert.ok("component" in projection);
  if ("component" in projection) assert.deepEqual(projection.component.behavior, ["-1N", "0", "1N"].map(v => ({ in: { in: v }, out: { out: v } })));
  const model: FunctionModel = { domain: "physical", carriers: catalogue.catalogue.carriers!, boxes: [
    { id: "source", name: "Force resource", role: "environment", outputs: [{ id: "out", carrier: p("force") }] },
    { id: "target", name: "Qualified particle force", role: "product", inputs: [{ id: "in", carrier: p("particle-electric-force") }] },
  ], wires: [] };
  const result = searchComponents({ model, resources: [{ box: "source", port: "out" }], targets: [{ box: "target", port: "in" }],
    catalogues: [{ catalogue: { ...catalogue.catalogue, entries: [projection] } }], max_components: 1 });
  assert.ok(result.ok && result.verdict === "impossible-in-library");
  assert.equal(knowledgeModelCatalogue({ source: "knowledge", mappings: [p("missing")] }, k).ok, false);
});
