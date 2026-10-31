#!/usr/bin/env node
/** Remove an opaque implementation only after preserving retrieval and complete bounded patent topologies. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as data from "../../src/data.ts";
import { typedKnowledgeEffects } from "../../src/knowledge.ts";
import { effectChains } from "../../src/act-effects.ts";
import { setupEffectModel } from "../../src/knowledge-setup.ts";
import { compareBehavior } from "../../src/act-behavior.ts";
import { modelCertificate, behaviorCertificate } from "../../src/act-cert.ts";
import { validateReduction } from "./effects-configurations.mjs";
import { reductionBaseline } from "./reduction-baseline.mjs";
import { validateBoundaryModels } from "./effects-boundaries.mjs";
import { summarizeSubsystem } from "../../src/act-refinement.ts";

export function validateNamedReduction() {
  const current = data.knowledge(), baseline = reductionBaseline(current);
  const before = baseline.knowledge, old = before.packs;
  const queries = [...new Set(before.effects.flatMap(e => [e.name, e.function, ...e.hints]))];
  const lookup = packs => {
    const files = { "knowledge.json": { format: "triz-knowledge-manifest-v1", packs: ["knowledge/universal.json", "effects.json"] },
      "knowledge/universal.json": packs.find(p => p.id === "universal"), "effects.json": packs.find(p => p.id === "physical") };
    data.useProvider(file => files[file]);
    return queries.map(q => data.effects(q).effects.map(e => e.id));
  };
  const previous = lookup(old), next = lookup(current.packs);
  assert.deepEqual(next, previous, "ranked text discovery must remain identical for every name, function and hint");
  const signatures = before.effects.filter(e => e.input && e.output).map(e => ({ resources: [e.input], output: e.output, min_length: 1, k: 2, limit: 1000, max_steps: 1_000_000 }));
  const libraries = [before, current].map(k => typedKnowledgeEffects(k.effects));
  for (const query of signatures) {
    const results = libraries.map(lib => effectChains(query, lib));
    assert.ok(results.every(r => r.ok && r.verdict !== "undecided" && !r.truncated));
    assert.deepEqual(results[0].chains.map(c => c.effects.map(e => e.id)), results[1].chains.map(c => c.effects.map(e => e.id)));
  }
  // Chosen calibration with fixed normal pressure and drift field. The rows are not patent measurements.
  const p = s => `physical:${s}`;
  const values = ids => Object.fromEntries(ids.map(([id, values]) => [p(id), { values }]));
  const rows = (input, output, context = {}) => ["0", "1"].map(v => ({ in: { [input]: v, ...context }, out: { [output]: v } }));
  const options = { chain: [33], domain: "physical", bindings: values([["voltage", ["0", "1"]], ["ion-current", ["0", "1"]],
    ["gas-body-force", ["0", "1"]], ["fluid-velocity", ["0", "1"]], ["gas-pressure", ["normal"]], ["electric-field", ["drift"]]]),
    boundary: { source_values: ["0", "1"], accepted_values: ["0", "1"] }, context_values: { "0/pressure": ["normal"], "0/field": ["drift"] },
    node_declarations: { "0/ionize": { behavior: rows("voltage", "ions", { pressure: "normal" }) },
      "0/momentum": { behavior: rows("ions", "force", { field: "drift" }) }, "0/flow": { behavior: rows("force", "flow") } } };
  const expanded = setupEffectModel(options, current);
  assert.ok(expanded.ok, JSON.stringify(expanded));
  assert.equal(expanded.model.boxes.length, 5, "three real components plus two boundary boxes");
  const model = expanded.model;
  const resource = model.boxes.find(b => b.id === "resource");
  resource.inputs = [{ id: "voltage", carrier: p("voltage") }];
  resource.behavior = ["0", "1"].map(v => ({ in: { voltage: v }, out: { out: v, "context-0-pressure": "normal", "context-0-field": "drift" } }));
  const reference = structuredClone(model);
  reference.boxes = reference.boxes.filter(b => ["resource", "required"].includes(b.id));
  reference.boxes.push({ id: "legacy", name: before.effects.find(e => e.id === 33).name, role: "tool", inputs: [{ id: "in", carrier: p("voltage") }], outputs: [{ id: "out", carrier: p("fluid-velocity") }], behavior: rows("in", "out") });
  const wire = (id, from, to, carrier) => ({ id, from, to, carrier, polarity: "useful" });
  reference.wires = [wire("start", { box: "resource", port: "out" }, { box: "legacy", port: "in" }, p("voltage")),
    wire("finish", { box: "legacy", port: "out" }, { box: "required", port: "in" }, p("fluid-velocity"))];
  const compared = compareBehavior(reference, model, { scope: "whole" });
  assert.ok(compared.ok && compared.verdict === "preserved", JSON.stringify(compared));
  const compactRequest = { model, boxes: expanded.setup.model_sources.filter(s => ["physical:ion-neutral-force", "physical:gas-flow-response"].includes(s.model)).map(s => s.node) };
  const compact = summarizeSubsystem(compactRequest), finite = summarizeSubsystem(compactRequest, { symbolic: false });
  assert.ok(compact.ok && compact.method === "symbolic" && compact.symbolicCertificate && finite.ok && finite.verdict === "summarized", JSON.stringify({ compact, finite }));
  assert.deepEqual(compact.relation.map(r => JSON.stringify([r.in, r.out])).sort(), finite.relation.map(r => JSON.stringify([r.in, r.out])).sort());
  assert.deepEqual(compact.box.inputs.map(p => p.carrier), [p("ion-current"), p("electric-field")], "drift context stays on the joint boundary");
  const broken = structuredClone(model);
  broken.boxes.find(b => b.id === expanded.setup.model_sources.find(s => s.model === p("gas-flow-response")).node).behavior[1].out.flow = "0";
  const mismatch = compareBehavior(reference, broken, { scope: "whole" });
  assert.ok(mismatch.ok && mismatch.verdict !== "preserved", "a broken force-to-flow calibration must change the relation");
  const missing = structuredClone(options); delete missing.context_values["0/field"];
  assert.equal(setupEffectModel(missing, current).ok, false);
  const certificates = { IonicWindConfiguration: modelCertificate(model), IonicWindBoundaryBehavior: behaviorCertificate(reference, model, { scope: "whole" }) };
  for (const c of Object.values(certificates)) assert.ok(c.ok, JSON.stringify(c));
  const topology = validateReduction();
  const boundaries = validateBoundaryModels(current);
  const symbolicCertificates = [compact.symbolicCertificate, ...boundaries.symbolicCertificates];
  assert.equal(symbolicCertificates.length, 2, "ionic momentum/flow and the qualified particle-force observation supply fixed total serial maps");
  Object.assign(certificates, boundaries.certificates);
  return { report: { independent_unary_interfaces: { before: 70, previous: 69, after: 66 }, named_effects: current.effects.length, model_templates: current.models.length, boundary_mapping_count: current.boundary_mappings.length,
    implementation_declarations: { previous: 69 + 18, after: 66 + 19 },
    converted_ids: [20, 33, 35, 59], removed_discovery_names: [], ranked_text_queries: queries.length, typed_chain_queries: signatures.length,
    finite_boundary_behavior: compared.verdict, invalid_calibration_rejected: true, missing_context_rejected: true,
    patent_comparison: topology, boundary_validation: boundaries.report, certificate_count: Object.keys(certificates).length,
    symbolic_summaries: [{ name: "IonicWindMomentumFlow", method: compact.method, components_before: compactRequest.boxes.length, components_after: 1 }, ...boundaries.summaries],
    scope: "Selected conditional boundary behavior at explicitly declared finite points; not continuous physics or measured patent performance." }, certificates, symbolicCertificates };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { report, certificates } = validateNamedReduction();
  const i = process.argv.indexOf("--cert-dir");
  if (i >= 0) {
    assert.ok(process.argv[i + 1]); fs.mkdirSync(process.argv[i + 1], { recursive: true });
    for (const [name, c] of Object.entries(certificates)) fs.writeFileSync(path.join(process.argv[i + 1], `${name}.lean`), c.content);
  }
  console.log(JSON.stringify(report, null, 2));
}
