#!/usr/bin/env node
/** Source-backed catalogue checks; finite calculations do not validate an entire device. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as data from "../../src/data.ts";
import { compileKnowledge, typedKnowledgeEffects } from "../../src/knowledge.ts";
import { setupEffectModel } from "../../src/knowledge-setup.ts";
import { effectChains } from "../../src/act-effects.ts";
import { externalBehavior, compareBehavior } from "../../src/act-behavior.ts";
import { rational, mul, cmp, show } from "../../src/act-rational.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/product-patent-cases.json", import.meta.url), "utf8"));
const knowledge = data.knowledge();
const baselinePacks = structuredClone(knowledge.packs);
for (const pack of baselinePacks) {
  pack.effects = pack.effects.filter(e => typeof e.id !== "number" || e.id <= 74);
  for (const e of pack.effects) delete e.model_assessment; // Later audit links are not historical dependencies.
}
for (const { id, kind } of fixture.classification_baseline.role_overrides)
  baselinePacks.flatMap(p => p.effects).find(e => e.id === id).kind = kind;
const before = compileKnowledge(baselinePacks);
const libraries = [before, knowledge].map(k => typedKnowledgeEffects(k.effects));
const find = (k, id) => {
  const e = k.effects.find(e => e.id === id);
  assert.ok(e?.input && e.output, `Missing typed case ${id}`);
  return e;
};
const discovery = (chain, library) => {
  const first = find(knowledge, chain[0]), last = find(knowledge, chain.at(-1));
  const result = effectChains({ resources: [first.input], output: last.output,
    k: chain.length, min_length: chain.length, limit: 100 }, library);
  assert.ok(result.ok && result.verdict !== "undecided", JSON.stringify(result));
  return result.chains.some(c => JSON.stringify(c.effects.map(e => e.id)) === JSON.stringify(chain));
};
const results = fixture.cases.map(c => {
  const paths = c.paths.map(chain => {
    assert.deepEqual(libraries.map(library => discovery(chain, library)), [true, true], `${c.id}: ${chain}`);
    assert.equal(discovery(chain, []), false, "Field classifications alone cannot supply a response contract");
    const setups = [before, knowledge].map(k => setupEffectModel({ chain, domain: "physical" }, k));
    assert.ok(setups.every(s => s.ok), JSON.stringify(setups));
    assert.deepEqual(setups[0].model, setups[1].model);
    assert.deepEqual(setups[0].unmetConditions, setups[1].unmetConditions);
    const behavior = externalBehavior(setups[1].model, { scope: "whole" });
    assert.ok(behavior.ok && !behavior.decided, "Descriptions cannot invent product behavior");
    return { chain, before: "found", after: "found", same_model: true, behavior: "undecided without declarations",
      hypotheses: setups[1].unmetConditions.length };
  });
  for (const chain of c.reject_paths) for (const k of [before, knowledge]) {
    assert.equal(setupEffectModel({ chain, domain: "physical" }, k).ok, false, `Invalid serial composition ${chain}`);
    assert.equal(discovery(chain, typedKnowledgeEffects(k.effects)), false);
  }
  for (const chain of c.paths) for (const id of chain) {
    const e = find(knowledge, id);
    const match = data.effects(undefined, undefined, { field: e.field, kind: e.kind }).effects;
    assert.ok(match.some(entry => entry.id === id), `Classification lost ${id}`);
  }
  return { id: c.id, sources: c.sources, paths, rejected_paths: c.reject_paths,
    assumptions: c.assumptions, not_covered: c.not_covered };
});

// Keep the named mechanism: its simultaneous forces cannot be replaced by [59, 71].
assert.equal(find(knowledge, 72).kind, "mechanism");
assert.deepEqual(find(knowledge, 72).related_effects.filter(r => r.relation === "uses").map(r => r.id), [59, 71]);

// A small finite interpretation derived from actual product coefficients, using exact rationals.
const spec = fixture.voice_coil_calculation;
const currents = spec.selected_currents_A;
const voltage = currents.map(i => show(mul(rational(i), rational(spec.resistance_ohm_at_20_C))));
const force = currents.map(i => show(mul(rational(i), rational(spec.force_constant_N_per_A))));
const heating = currents.map(i => show(mul(mul(rational(i), rational(i)), rational(spec.resistance_ohm_at_20_C))));
const exact = values => values.map(v => show(rational(v)));
assert.deepEqual(voltage, exact(spec.expected_voltage_V));
assert.deepEqual(force, exact(spec.expected_force_N));
assert.deepEqual(heating, exact(spec.expected_Joule_heat_W));
for (const f of force) assert.ok(cmp(rational(f.replace(/^-/, "")), rational(spec.continuous_force_N)) < 0);
const rows = (inputs, outputs) => inputs.map((v, i) => ({ in: { in: v }, out: { out: outputs[i] } }));
const bindings = { "physical:voltage": { values: voltage }, "physical:current": { values: currents },
  "physical:force": { values: force } };
const args = { chain: [74, 65], domain: "physical", bindings,
  boundary: { source_values: voltage, accepted_values: force },
  declarations: [{ behavior: rows(voltage, currents) }, { behavior: rows(currents, force) }] };
const setup = setupEffectModel(args, knowledge);
assert.ok(setup.ok, JSON.stringify(setup));
const source = setup.model.boxes.find(b => b.id === "resource");
source.inputs = [{ id: "in", carrier: "physical:voltage" }];
source.behavior = rows(voltage, voltage); // An exposed voltage input preserves input/output correlation.
const wire = (id, from, to, carrier) => ({ id, from: { box: from, port: "out" }, to: { box: to, port: "in" }, carrier, polarity: "useful" });
const reference = { ...setup.model,
  boxes: [source, setup.model.boxes.find(b => b.id === "required"), {
    id: "reference", name: "Selected DC force contract", role: "tool",
    inputs: [{ id: "in", carrier: "physical:voltage" }], outputs: [{ id: "out", carrier: "physical:force" }],
    behavior: rows(voltage, force),
  }],
  wires: [wire("voltage", "resource", "reference", "physical:voltage"), wire("force", "reference", "required", "physical:force")],
};
const composed = externalBehavior(setup.model, { scope: "whole", fullRelation: true });
assert.ok(composed.ok && composed.decided, JSON.stringify(composed));
for (const [i, v] of voltage.entries())
  assert.deepEqual(composed.relation.find(r => r.input[0] === v)?.outputs, [[force[i]]]);
const comparison = compareBehavior(reference, setup.model, { scope: "whole" });
assert.ok(comparison.ok && comparison.verdict === "preserved", JSON.stringify(comparison));

console.log(JSON.stringify({
  scope: fixture.scope, classification_baseline: fixture.classification_baseline,
  roles: { before: before.taxonomy.roles, after: knowledge.taxonomy.roles },
  legacy_named_entries_preserved: before.effects.length,
  current_named_entries: knowledge.effects.length,
  current_independent_interfaces: knowledge.counts.independent_contracts,
  cases: results,
  voice_coil: { current_A: currents, voltage_V: voltage, force_N: force, Joule_heat_W: heating,
    finite_composition: comparison.verdict, scope: spec.scope },
}, null, 2));
