#!/usr/bin/env node
/** Catalogue ablation and patent-inspired finite-model experiments; no measured device data. */
import assert from "node:assert/strict";
import { speculativeSampling } from "./speculative-sampling.mjs";
import fs from "node:fs";
import * as data from "../../src/data.ts";
import { effectChains } from "../../src/act-effects.ts";
import { setupEffectModel } from "../../src/knowledge-setup.ts";
import { compileKnowledge } from "../../src/knowledge.ts";
import { checkModel } from "../../src/act.ts";
import { externalBehavior, compareBehavior } from "../../src/act-behavior.ts";
import { boundedDynamics, checkRun } from "../../src/act-dynamics.ts";
import { instantiateCatalogues } from "../../src/act-component-catalogue.ts";
import { rational, Z, ONE, add, sub, mul, div, cmp, sum, show } from "../../src/act-rational.ts";

const snapshot = JSON.parse(fs.readFileSync(new URL("./fixtures/effects-before-pr53.json", import.meta.url), "utf8"));
const current = data.typedEffects();
const libraries = [snapshot.effects, current.filter(e => snapshot.first_pr_typed_ids.includes(e.id)), current];
assert.deepEqual(libraries.map(es => es.length), [6, 37, 78]);
const port = quantity => {
  const p = data.knowledge().parameters.find(p => p.quantity === quantity);
  assert.ok(p, quantity);
  return { quantity, ...(p.si === undefined ? {} : { si: p.si }) };
};
// Deliberately selected cases, including a retained control and an invalid power/energy bridge.
// Identical current search, bounds, resource types and output constraints for each library.
const cases = [
  ["Thermocouple control", "temperature difference", "voltage", 1],
  ["Light to heating power", "light", "heat flow", 3],
  ["Reaction to displacement", "reaction extent", "dimension change", 3],
  ["Superelastic response", "mechanical stress", "strain", 1],
  ["Ultrasonic detachment", "acoustic pressure amplitude", "released mass", 2],
  ["Nonempty force transformation", "force", "force", 1],
  ["Reject power as accumulated energy", "heat flow", "temperature change", 2],
];
const discovery = cases.map(([name, input, output, k]) => ({ name, input, output, k,
  results: libraries.map(library => {
    const r = effectChains({ resources: [port(input)], output: { quantity: output }, k, min_length: 1, limit: 100 }, library);
    assert.ok(r.ok && r.verdict !== "undecided", JSON.stringify(r));
    return { verdict: r.verdict, count: r.count, sample: r.chains[0]?.effects.map(e => e.id) ?? [] };
  }),
}));
assert.deepEqual(discovery.map(c => c.results.map(r => r.verdict === "chains")), [
  [true, true, true], [false, true, true], [false, false, true],
  [false, false, true], [false, false, true], [false, false, true], [false, false, false],
]);

const chain = [66, 74, 64];
const bare = setupEffectModel({ chain, domain: "physical" }, data.knowledge());
assert.ok(bare.ok);
const withoutRows = externalBehavior(bare.model, { scope: "whole" });
assert.ok(withoutRows.ok && !withoutRows.decided);
const values = ["off", "on"];
const finiteArgs = { domain: "physical",
  bindings: Object.fromEntries(bare.setup.parameter_ids.map(id => [id, { values }])),
  boundary: { source_values: values, accepted_values: values },
  declarations: chain.map(() => ({ behavior: values.map(v => ({ in: { in: v }, out: { out: v } })) })),
};
const finite = setupEffectModel({ ...finiteArgs, chain }, data.knowledge());
assert.ok(finite.ok);
const withRows = externalBehavior(finite.model, { scope: "whole", fullRelation: true });
assert.ok(withRows.ok && withRows.decided);
assert.equal(withRows.inputValuations, 1); // Environment supplies either value; there is no unwired source input.

// A new serial mechanism is a recipe in an expert pack, not another opaque generator.
const recipePacks = structuredClone(data.knowledge().packs);
recipePacks.find(p => p.id === "physical").effects.push({
  id: "physical:photovoltaic-heater", name: "Photovoltaic heater recipe", kind: "composite", category: "synthetic-example",
  function: "Compose light-to-voltage, current and heat-transfer-rate clauses", statement: "A declared integration recipe, not measured device performance",
  hints: [], steps: chain, conditions: ["declared optical/electrical/load integration"],
  source: "examples/assurance/effects-comparison.mjs: repository-authored serial recipe",
});
const recipeKnowledge = compileKnowledge(recipePacks);
const recipeSetup = setupEffectModel({ ...finiteArgs, chain: ["physical:photovoltaic-heater"] }, recipeKnowledge);
assert.ok(recipeSetup.ok);
assert.deepEqual(recipeSetup.model, finite.model);
assert.deepEqual(recipeSetup.setup.expanded_effect_ids, chain);
assert.ok(recipeSetup.unmetConditions.includes("declared optical/electrical/load integration"));
assert.deepEqual(data.knowledge().counts, { direct: 56, signatures: 14, specializations: 22, composites: 0, independent_contracts: 70, searchable: 78 });

const wire = (id, from, fp, to, tp, carrier) => ({ id, from: { box: from, port: fp }, to: { box: to, port: tp }, carrier, polarity: "useful" });
const accept = (id, carrier, values) => ({ id, name: id, role: "product", inputs: [{ id: "in", carrier }], behavior: values.map(v => ({ in: { in: v }, out: {} })) });
const source = citation => ({ citation: citation + " ; repository-authored finite abstraction, not patent performance data", license: "MIT" });
const instantiate = (model, catalogue, bindings) => {
  const r = instantiateCatalogues(model, [], [{ catalogue, bindings }], () => true);
  assert.ok(r.ok && "entries" in r, JSON.stringify(r));
  return r.entries.map(e => structuredClone(e.component));
};

// Patent-inspired two-threshold memory. Numeric levels and rows are synthetic declarations.
const signals = ["low", "band-low", "band-high", "high"];
const decisions = ["off", "on"];
const thresholdCatalogue = {
  format: "triz-component-catalogue-v1", id: "experimental-thresholds", parameters: ["S", "D"],
  entries: [
    { id: "single", source: source("https://patents.google.com/patent/EP0041363A1/en"), component: {
      id: "single", name: "Single-threshold abstraction", role: "tool", inputs: [{ id: "in", carrier: "S" }], outputs: [{ id: "out", carrier: "D" }],
      behavior: signals.map(x => ({ in: { in: x }, out: { out: ["band-high", "high"].includes(x) ? "on" : "off" } })),
    } },
    { id: "hysteretic", source: source("https://patents.google.com/patent/EP0041363A1/en"), component: {
      id: "hysteretic", name: "Two-threshold memory abstraction", role: "tool", inputs: [{ id: "in", carrier: "S" }], outputs: [{ id: "out", carrier: "D" }],
      state: decisions, initial: ["off"], transition: decisions.flatMap(s => signals.map(x => {
        const next = x === "low" ? "off" : x === "high" ? "on" : s;
        return { state: s, in: { in: x }, next, out: { out: next } };
      })),
    } },
  ],
};
const thresholdBase = { domain: "software", carriers: [
  { id: "signal", layer: "information", dimension: "declared ordered input", values: signals },
  { id: "decision", layer: "information", dimension: "declared decision", values: decisions },
], boxes: [], wires: [] };
const thresholdBoxes = instantiate(thresholdBase, thresholdCatalogue, { S: "signal", D: "decision" });
const thresholdModel = box => ({ ...structuredClone(thresholdBase), boxes: [box, accept("product", "decision", decisions)], wires: [wire("result", box.id, "out", "product", "in", "decision")] });
const sequence = ["low", "band-high", "band-low", "band-high", "band-low", "high", "band-high", "band-low", "band-high", "band-low", "low"];
const thresholdRuns = thresholdBoxes.map(box => {
  const model = thresholdModel(box);
  const spec = { horizon: sequence.length - 1, inputs: sequence.map(v => [{ box: box.id, port: "in", values: [v] }]), separation: [
    { id: "assert", where: [{ box: "product", port: "in", values: ["on"] }], window: { from: 5, to: 5 } },
    { id: "release", where: [{ box: "product", port: "in", values: ["off"] }], window: { from: 10, to: 10 } },
  ] };
  const r = boundedDynamics(model, spec);
  assert.ok(r.ok && r.decided && r.separation?.verdict === "realizable", JSON.stringify(r));
  assert.ok(checkRun(model, spec, r.separation.trace).ok);
  const index = r.variables.findIndex(v => v.box === box.id && v.port === "out");
  const output = r.separation.trace.map(step => step.values[index]);
  return { output, switches: output.slice(1).filter((v, i) => v !== output[i]).length };
});
assert.deepEqual(thresholdRuns.map(r => r.switches), [8, 2]);
// An independently certifiable invariant with an unscheduled input restricted to the deadband.
const deadband = thresholdModel(thresholdBoxes[1]);
deadband.boxes.push({ id: "noise", name: "Declared deadband-only input", role: "environment", outputs: [{ id: "out", carrier: "signal" }],
  behavior: ["band-low", "band-high"].map(v => ({ in: {}, out: { out: v } })) });
deadband.wires.push(wire("noise", "noise", "out", thresholdBoxes[1].id, "in", "signal"));
const invariantSpec = { unsafe: [{ box: thresholdBoxes[1].id, state: ["on"] }], horizon: 3 };
const invariant = boundedDynamics(deadband, invariantSpec);
assert.ok(invariant.ok && invariant.decided && invariant.escalation?.verdict === "unreachable");
const initiallyOn = structuredClone(deadband);
initiallyOn.boxes[0].initial = ["on"];
const initialCounterexample = boundedDynamics(initiallyOn, invariantSpec);
assert.ok(initialCounterexample.ok && initialCounterexample.decided && initialCounterexample.escalation?.verdict === "reachable");

// Redundancy + majority: two messages, every transmitted single-bit fault, no probabilities.
const bits = ["0", "1"];
const triples = Array.from({ length: 8 }, (_, i) => i.toString(2).padStart(3, "0").split(""));
const vote = a => a.filter(b => b === "1").length >= 2 ? "1" : "0";
const flips = a => [-1, 0, 1, 2].map(j => a.map((b, i) => i === j ? String(1 - Number(b)) : b));
const bitBase = { domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "binary symbol", values: bits }], boxes: [], wires: [] };
const redundancyCatalogue = { format: "triz-component-catalogue-v1", id: "experimental-redundancy", parameters: ["T"], entries: [
  { id: "encode", source: source("https://patents.google.com/patent/US2552629A/en"), component: {
    id: "encoder", name: "Three-bit repetition encoder", role: "tool", inputs: [{ id: "in", carrier: "T" }], outputs: ["a", "b", "c"].map(id => ({ id, carrier: "T" })),
    behavior: bits.map(v => ({ in: { in: v }, out: { a: v, b: v, c: v } })),
  } },
  { id: "decode", source: source("https://patents.google.com/patent/EP4576465A1/en"), component: {
    id: "decoder", name: "Majority decoder", role: "tool", inputs: ["a", "b", "c"].map(id => ({ id, carrier: "T" })), outputs: [{ id: "out", carrier: "T" }],
    behavior: triples.map(a => ({ in: Object.fromEntries(["a", "b", "c"].map((p, i) => [p, a[i]])), out: { out: vote(a) } })),
  } },
] };
const [encoder, decoder] = instantiate(bitBase, redundancyCatalogue, { T: "bit" });
const channel = { id: "noise", name: "Declared at-most-one-bit corruption", role: "environment",
  inputs: ["a", "b", "c"].map(id => ({ id, carrier: "bit" })), outputs: ["a", "b", "c"].map(id => ({ id: `${id}-out`, carrier: "bit" })),
  behavior: triples.flatMap(a => flips(a).map(b => ({ in: Object.fromEntries(["a", "b", "c"].map((p, i) => [p, a[i]])), out: Object.fromEntries(["a", "b", "c"].map((p, i) => [`${p}-out`, b[i]])) }))),
};
const coded = { ...structuredClone(bitBase), boxes: [encoder, channel, decoder, accept("product", "bit", bits)], wires: [
  ...["a", "b", "c"].flatMap(p => [wire(`encode-${p}`, encoder.id, p, "noise", p, "bit"), wire(`decode-${p}`, "noise", `${p}-out`, decoder.id, p, "bit")]),
  wire("result", decoder.id, "out", "product", "in", "bit"),
] };
const reference = { ...structuredClone(bitBase), boxes: [
  { id: encoder.id, name: "Identity requirement", role: "tool", inputs: [{ id: "in", carrier: "bit" }], outputs: [{ id: "out", carrier: "bit" }], behavior: bits.map(v => ({ in: { in: v }, out: { out: v } })) },
  accept("product", "bit", bits),
], wires: [wire("result", encoder.id, "out", "product", "in", "bit")] };
const uncoded = structuredClone(reference);
uncoded.boxes[0].name = "Uncoded noisy channel";
uncoded.boxes[0].behavior = bits.flatMap(a => bits.map(b => ({ in: { in: a }, out: { out: b } })));
const beforeCoding = compareBehavior(reference, uncoded, { scope: "whole" });
const afterCoding = compareBehavior(reference, coded, { scope: "whole" });
assert.ok(beforeCoding.ok && beforeCoding.verdict === "changed", JSON.stringify(beforeCoding));
assert.ok(afterCoding.ok && afterCoding.verdict === "preserved", JSON.stringify(afterCoding));
assert.ok(bits.every(b => flips([b, b, b]).every(t => vote(t) === b)));
const twoFaults = structuredClone(coded);
twoFaults.boxes[1].behavior.push(...triples.flatMap(a => [[0, 1], [0, 2], [1, 2]].map(pair => ({
  in: Object.fromEntries(["a", "b", "c"].map((p, i) => [p, a[i]])),
  out: Object.fromEntries(["a", "b", "c"].map((p, i) => [`${p}-out`, pair.includes(i) ? String(1 - Number(a[i])) : a[i]])),
}))));
const faultCounterexample = compareBehavior(reference, twoFaults, { scope: "whole" });
assert.ok(faultCounterexample.ok && faultCounterexample.verdict === "changed", "two faults exceed the stated guarantee");
const uncodedCorrected = bits.filter(b => String(1 - Number(b)) === b).length;
const codedCorrected = bits.flatMap(b => flips([b, b, b]).slice(1).map(t => vote(t) === b)).filter(Boolean).length;

// Recent construction: one speculative-sampling step (Leviathan et al., ICML 2023).
// Exact finite probabilities, not an LLM benchmark or a Lean proof about arbitrary distributions.

let probabilityCases = 0;
for (let p = 0; p <= 4; p++) for (let q = 0; q <= 4; q++) {
  const target = [rational(`${p}/4`), rational(`${4 - p}/4`)];
  const draft = [rational(`${q}/4`), rational(`${4 - q}/4`)];
  assert.deepEqual(speculativeSampling(target, draft).output.map(show), target.map(show));
  probabilityCases++;
}
const target = [rational("3/4"), rational("1/4")], draft = [rational("1/4"), rational("3/4")];
const speculative = speculativeSampling(target, draft);
const naiveFallback = target.map((p, i) => add(speculative.accepted[i], mul(speculative.rejected, p)));
assert.deepEqual(speculative.output.map(show), ["3/4", "1/4"]);
assert.deepEqual(naiveFallback.map(show), ["5/8", "3/8"]);
assert.notDeepEqual(naiveFallback.map(show), target.map(show));
// Equal nonzero support would hide this bias in an unweighted relation.
assert.ok([...target, ...naiveFallback].every(p => cmp(p, Z) > 0));

for (const model of [bare.model, finite.model, deadband, coded, reference, uncoded]) assert.ok(checkModel(model).ok);
console.log(JSON.stringify({
  method: "Selected finite examples; fixed current engine, catalogue sizes 6/37/78; no measured device data, no general benchmark accuracy or runtime claim.",
  snapshots: { before: snapshot.source_commit, first_pr: snapshot.first_pr_commit },
  discovery,
  separation: { independent_interfaces_before: 74, independent_interfaces_after: data.knowledge().counts.independent_contracts,
    installed_named_effects: data.knowledge().counts.searchable, specializations: data.knowledge().counts.specializations,
    families: data.knowledge().families.length, example_recipe: recipeSetup.setup.effect_ids, expanded_steps: recipeSetup.setup.expanded_effect_ids,
    same_model_as_explicit_steps: true },
  setup: { chain, registered_quantities: bare.model.carriers.length, generated_boxes: bare.model.boxes.length, generated_wires: bare.model.wires.length,
    behavior_without_rows: withoutRows.decided, behavior_with_explicit_rows: withRows.decided, unmet_conditions: bare.unmetConditions.length },
  hysteresis: { sequence, before: thresholdRuns[0], after: thresholdRuns[1], deadband_invariant: invariant.escalation.verdict,
    deadband_initially_on: initialCounterexample.escalation.verdict },
  redundancy: { before: beforeCoding.verdict, after: afterCoding.verdict, single_bit_faults_corrected: { uncoded: `${uncodedCorrected}/2`, coded: `${codedCorrected}/6` },
    with_two_faults: faultCounterexample.verdict, transmitted_bits_per_message: { before: 1, after: 3 },
    boundary: "The model permits at most one bit flip per three-bit block; correlated two-bit faults can defeat it. No fault probabilities or actual reliability gains are inferred." },
  speculative_sampling: { target: target.map(show), unverified_draft: draft.map(show), corrected: speculative.output.map(show),
    naive_target_fallback: naiveFallback.map(show), rejection_probability: show(speculative.rejected), exact_grid_cases: probabilityCases,
    scope: "Exact rational enumeration of a two-token one-step sampler. No GPU speedup or arbitrary-distribution theorem is established; existing unweighted relations cannot certify distribution equality." },
}, null, 2));
