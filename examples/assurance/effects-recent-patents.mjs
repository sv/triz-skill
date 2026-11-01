#!/usr/bin/env node
/** Recent disclosures expose missing clauses, repeated interfaces and modeling limits. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as data from "../../src/data.ts";
import { compileKnowledge, typedKnowledgeEffects } from "../../src/knowledge.ts";
import { effectChains } from "../../src/act-effects.ts";
import { setupEffectModel } from "../../src/knowledge-setup.ts";
import { externalBehavior } from "../../src/act-behavior.ts";
import { boundedDynamics, checkRun } from "../../src/act-dynamics.ts";
import { rational, ONE, sub, cmp, show } from "../../src/act-rational.ts";
import { speculativeSampling } from "./speculative-sampling.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/recent-patent-cases.json", import.meta.url), "utf8"));
const knowledge = data.knowledge();
// Compare arrow availability using current engine and exact vocabulary on both sides.
// New quantity names can be queried in the old library, but supply no implicit arrows.
const baselinePacks = structuredClone(knowledge.packs);
for (const p of baselinePacks) {
  p.effects = p.effects.filter(e => typeof e.id !== "number" || e.id <= fixture.baseline.last_effect_id);
  for (const e of p.effects) delete e.model_assessment; // Assessments postdate the baseline and can link new clauses.
}
const before = compileKnowledge(baselinePacks);
const libraries = [before, knowledge].map(k => typedKnowledgeEffects(k.effects));
const find = id => knowledge.effects.find(e => e.id === id);
const discover = (chain, library) => {
  const result = effectChains({ resources: [find(chain[0]).input], output: find(chain.at(-1)).output,
    k: chain.length, min_length: chain.length, limit: 100 }, library);
  assert.ok(result.ok && result.verdict !== "undecided", JSON.stringify(result));
  return result.chains.some(c => JSON.stringify(c.effects.map(e => e.id)) === JSON.stringify(chain));
};
let beforeFound = 0, afterFound = 0, rejected = 0;
const cases = fixture.cases.map(c => {
  assert.ok(c.published_on >= fixture.publication_window[0] && c.published_on <= fixture.publication_window[1]);
  assert.ok(c.priority_on <= c.published_on);
  const clauses = c.clauses.map(({ chain, before_found }) => {
    const found = libraries.map(library => discover(chain, library));
    assert.deepEqual(found, [before_found, true], `${c.id}: ${chain}`);
    beforeFound += +found[0]; afterFound += +found[1];
    const after = setupEffectModel({ chain, domain: "physical" }, knowledge);
    assert.ok(after.ok, JSON.stringify(after));
    if (before_found) {
      const old = setupEffectModel({ chain, domain: "physical" }, before);
      assert.ok(old.ok);
      assert.deepEqual(old.model, after.model);
      assert.deepEqual(old.unmetConditions, after.unmetConditions);
    } else assert.equal(setupEffectModel({ chain, domain: "physical" }, before).ok, false);
    const behavior = externalBehavior(after.model, { scope: "whole" });
    assert.ok(behavior.ok && !behavior.decided);
    return { chain, found_before: found[0], found_after: found[1], hypotheses: after.unmetConditions };
  });
  for (const chain of c.reject_paths) {
    assert.equal(setupEffectModel({ chain, domain: "physical" }, knowledge).ok, false, `${c.id}: invalid ${chain}`);
    assert.equal(discover(chain, libraries[1]), false);
    rejected++;
  }
  return { ...c, clauses };
});
assert.equal(beforeFound, 4); assert.equal(afterFound, 9); assert.equal(rejected, 7);

// Equal selected interfaces can share declarations; that is not physical equivalence.
const groups = new Map();
for (const e of knowledge.effects) {
  const key = JSON.stringify([e.kind, e.field, e.input_parameter, e.output_parameter]);
  groups.set(key, [...(groups.get(key) ?? []), e]);
}
const repeated = [...groups.values()].filter(es => es.length > 1);
const unshared = repeated.filter(es => es.some(e => e.definition.form !== "specialization") ||
  new Set(es.map(e => `${e.definition.family}:${e.definition.signature}`)).size !== 1).map(es => es.map(e => e.id));
assert.deepEqual(unshared, []);
assert.equal(knowledge.counts.independent_contracts, fixture.baseline.independent_interfaces + 4 - 3 - knowledge.counts.configurations);

// Conditional composition examples, not assertions that a whole patent implements these paths.
const newCompositions = [[7, 75], [76, 1], [77, 1]].map(chain => {
  assert.equal(discover(chain, libraries[1]), true);
  assert.equal(discover(chain, libraries[0]), false);
  const setup = setupEffectModel({ chain, domain: "physical" }, knowledge);
  assert.ok(setup.ok, JSON.stringify(setup));
  return { chain, hypotheses: setup.unmetConditions };
});

// A temporary programmed-conductance model keeps memory explicit; it does not rename Ohm's law.
const memoryPacks = structuredClone(knowledge.packs);
memoryPacks.find(p => p.id === "physical").effects.push({
  id: "physical:programmed-conductance-example", name: "Synthetic programmed-conductance example", kind: "mechanism",
  category: "finite-example", function: "Read a declared stored conductance and update it under a declared pulse",
  statement: "A synthetic finite state abstraction; no device calibration or patent performance is reproduced.", hints: [],
  input_parameter: "physical:voltage", output_parameter: "physical:current", input: find(74).input, output: find(74).output,
  field: "electric", conditions: ["explicit synthetic low/high conductance and pulse rule; not measured device data"],
  source: "https://patents.google.com/patent/US20250348727A1/en ; repository-authored finite abstraction only", typed_from: "source",
});
const memoryKnowledge = compileKnowledge(memoryPacks);
const programmed = setupEffectModel({ chain: ["physical:programmed-conductance-example"], domain: "physical",
  bindings: { "physical:voltage": { values: ["1", "2"] }, "physical:current": { values: ["1", "2", "4"] } },
  boundary: { source_values: ["1", "2"], accepted_values: ["1", "2", "4"] },
  declarations: [{ state: ["low", "high"], initial: ["low"], transition: [
    { state: "low", in: { in: "1" }, next: "low", out: { out: "1" } },
    { state: "low", in: { in: "2" }, next: "high", out: { out: "2" } },
    { state: "high", in: { in: "1" }, next: "high", out: { out: "2" } },
    { state: "high", in: { in: "2" }, next: "high", out: { out: "4" } },
  ] }],
}, memoryKnowledge);
assert.ok(programmed.ok, JSON.stringify(programmed));
const resource = programmed.model.boxes.find(b => b.id === "resource");
delete resource.behavior;
Object.assign(resource, { state: ["read-before", "write", "read-after"], initial: ["read-before"], transition: [
  { state: "read-before", in: {}, next: "write", out: { out: "1" } },
  { state: "write", in: {}, next: "read-after", out: { out: "2" } },
  { state: "read-after", in: {}, next: "read-after", out: { out: "1" } },
] });
const memoryBox = programmed.effects[0].box;
const spec = { horizon: 3, unsafe: [{ box: memoryBox, state: ["high"] }, { box: memoryBox, port: "in", values: ["1"] }, { box: memoryBox, port: "out", values: ["2"] }] };
const dynamic = boundedDynamics(programmed.model, spec);
assert.ok(dynamic.ok && dynamic.escalation.verdict === "reachable", JSON.stringify(dynamic));
assert.equal(dynamic.escalation.time, 2);
assert.deepEqual(checkRun(programmed.model, spec, dynamic.escalation.trace), { ok: true, errors: [] });
const fixed = structuredClone(programmed.model);
const fixedBox = fixed.boxes.find(b => b.id === memoryBox);
delete fixedBox.state; delete fixedBox.initial; delete fixedBox.transition;
fixedBox.behavior = [{ in: { in: "1" }, out: { out: "1" } }, { in: { in: "2" }, out: { out: "2" } }];
const fixedSpec = { horizon: 3, unsafe: spec.unsafe.slice(1) };
const fixedResult = boundedDynamics(fixed, fixedSpec);
assert.ok(fixedResult.ok && fixedResult.escalation.verdict === "unreachable", JSON.stringify(fixedResult));
assert.equal(data.knowledge().effects.length, 78, "temporary finite examples never become installed primitives");

// Selected gate metric: 1 - total variation for a binary alphabet. The patent does not prescribe it.
let probabilisticCases = 0, enabled = 0, disabled = 0;
for (let p = 0; p <= 4; p++) for (let q = 0; q <= 4; q++) {
  const target = [rational(`${p}/4`), rational(`${4-p}/4`)];
  const draft = [rational(`${q}/4`), rational(`${4-q}/4`)];
  const distance = cmp(target[0], draft[0]) >= 0 ? sub(target[0], draft[0]) : sub(draft[0], target[0]);
  const on = cmp(sub(ONE, distance), rational("3/4")) >= 0;
  const output = on ? speculativeSampling(target, draft).output : target;
  assert.deepEqual(output.map(show), target.map(show));
  if (on) enabled++; else disabled++;
  probabilisticCases++;
}
assert.ok(enabled > 0 && disabled > 0);

console.log(JSON.stringify({ scope: fixture.scope, window: fixture.publication_window, baseline: fixture.baseline,
  cases, selected_clauses: { before: beforeFound, after: afterFound, rejected_serial_substitutions: rejected },
  additional_conditional_compositions: newCompositions,
  reduction: { old_interfaces: fixture.baseline.independent_interfaces, added_clauses: 4, repeated_declarations_removed: 3, named_compositions_removed_from_generators: knowledge.counts.configurations,
    current_interfaces: knowledge.counts.independent_contracts, named_entries: knowledge.effects.length, further_identical_unshared_interfaces: unshared },
  programmed_conductance: { reachable_at_tick: dynamic.escalation.time, fixed_resistance: fixedResult.escalation.verdict,
    scope: "Synthetic read/write/read state counterexample, not an empirical memristor or trained crossbar model." },
  selective_sampling: { finite_binary_cases: probabilisticCases, gate_enabled: enabled, gate_disabled: disabled,
    scope: "Chosen finite gate and exact correction kernel; no arbitrary probability theorem, patent-wide equivalence or measured inference speedup." },
}, null, 2));
