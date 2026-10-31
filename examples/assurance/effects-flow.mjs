#!/usr/bin/env node
/** Runnable catalogue → typed generators → declared finite relations example. */
import assert from "node:assert/strict";
import "../../src/data.ts";
import { toolSpecs } from "../../src/tools.ts";

const specs = Object.fromEntries(toolSpecs().map(s => [s.name, s]));
const call = async (name, args) => JSON.parse((await specs[name].handler(args)).content[0].text);
const chain = [66, 74, 64]; // photovoltaic voltage → ohmic current → Joule heat flow
const structural = await call("triz_effect_setup", { chain, domain: "physical" });
assert.equal(structural.verdict, "inserted");
assert.ok(structural.model.boxes.every(b => !b.behavior && !b.feasibility));
const unknown = await call("triz_behavior", { model: structural.model, scope: "whole" });
assert.equal(unknown.decided, false);

// Explicit synthetic abstraction, not measured photovoltaic/electrical/thermal performance.
const values = ["off", "on"];
const rows = values.map(v => ({ in: { in: v }, out: { out: v } }));
const configured = await call("triz_effect_setup", {
  chain, domain: "physical",
  bindings: Object.fromEntries(structural.setup.parameter_ids.map(id => [id, { values }])),
  boundary: { source_values: ["on"], accepted_values: ["on"] },
  declarations: chain.map(() => ({ behavior: rows })),
});
assert.equal(configured.verdict, "inserted");
const baseline = structuredClone(configured.model);
baseline.boxes = baseline.boxes.slice(0, 2);
baseline.boxes.push({ id: "reference", name: "Declared abstract reference", role: "tool",
  inputs: [{ id: "in", carrier: "physical:light" }], outputs: [{ id: "out", carrier: "physical:heat-flow" }], behavior: rows });
baseline.wires = [
  { id: "start", from: { box: "resource", port: "out" }, to: { box: "reference", port: "in" }, carrier: "physical:light", polarity: "useful" },
  { id: "finish", from: { box: "reference", port: "out" }, to: { box: "required", port: "in" }, carrier: "physical:heat-flow", polarity: "useful" },
];
const compared = await call("triz_behavior", { model: configured.model, compare_to: baseline, scope: "whole" });
assert.equal(compared.verdict, "preserved");

// A same-type mechanism remains a generator; request a nonempty optical chain.
const optical = await call("triz_effect_chains", {
  resources: [{ quantity: "light" }], output: { quantity: "light" }, min_length: 1, k: 1,
});
assert.equal(optical.verdict, "chains");
assert.ok(optical.chains.every(c => c.effects.length === 1));
assert.ok(optical.chains.some(c => c.effects[0].id === 17));

// Explicit synthetic excitation memory, then TIR guidance and photovoltaic conversion.
// One synchronous tick is an abstract step, not a measured phosphor lifetime.
const delayed = await call("triz_effect_setup", {
  chain: [16, 17, 66], domain: "physical",
  bindings: { "physical:light": { values }, "physical:voltage": { values: ["low", "high"] } },
  boundary: { source_values: ["on"], accepted_values: ["low", "high"] },
  declarations: [
    { state: ["dark", "charged"], initial: ["dark"], transition: [
      { state: "dark", in: { in: "on" }, next: "charged", out: { out: "off" } },
      { state: "charged", in: { in: "on" }, next: "charged", out: { out: "on" } },
    ] },
    { behavior: rows },
    { behavior: [{ in: { in: "off" }, out: { out: "low" } }, { in: { in: "on" }, out: { out: "high" } }] },
  ],
});
assert.equal(delayed.verdict, "inserted");
const dynamics = await call("triz_dynamics", {
  model: delayed.model, unsafe: [{ box: delayed.effects[0].box, state: ["charged"] }], horizon: 2,
});
assert.equal(dynamics.escalation.verdict, "reachable");
assert.equal(dynamics.escalation.time, 1);

console.log(JSON.stringify({
  chain, quantities: structural.setup.parameter_ids,
  wiring: structural.verdict, behavior_without_rows: unknown.decided,
  declared_finite_behavior: compared.verdict,
  nonempty_optical_generators: optical.chains.map(c => c.effects[0].id),
  declared_memory: { chain: [16, 17, 66], target: "charged", reachable_at_tick: dynamics.escalation.time },
  unmet_conditions: configured.unmetConditions,
  scope: "Synthetic off/on rows demonstrate compositional semantics. No quantitative performance, resource feasibility or physical sufficiency is inferred.",
}, null, 2));
