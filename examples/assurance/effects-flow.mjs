#!/usr/bin/env node
/** Runnable catalogue → typed generators → declared finite relations → Lean certificates example. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import "../../src/data.ts";
import { toolSpecs } from "../../src/tools.ts";

const specs = Object.fromEntries(toolSpecs().map(s => [s.name, s]));
const call = async (name, args) => JSON.parse((await specs[name].handler(args)).content[0].text);
const chain = [66, 74, 64]; // photovoltaic voltage → ohmic current → Joule heat flow
const structural = await call("triz_effect_setup", { chain, domain: "physical", certificate: true });
assert.equal(structural.verdict, "inserted");
assert.equal(structural.certificate.format, "lean");
assert.ok(structural.model.boxes.every(b => !b.behavior && !b.feasibility));
const unknown = await call("triz_behavior", { model: structural.model, scope: "whole" });
assert.equal(unknown.decided, false);

// Explicit synthetic abstraction, not measured photovoltaic/electrical/thermal performance.
const values = ["off", "on"];
const rows = values.map(v => ({ in: { in: v }, out: { out: v } }));
const configured = await call("triz_effect_setup", {
  chain, domain: "physical", certificate: true,
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
const compared = await call("triz_behavior", { model: configured.model, compare_to: baseline, scope: "whole", certificate: true });
assert.equal(compared.verdict, "preserved");
assert.equal(compared.certificate.format, "lean");

const dirIndex = process.argv.indexOf("--cert-dir");
if (dirIndex >= 0) {
  assert.ok(process.argv[dirIndex + 1], "--cert-dir needs a directory");
  const dir = path.resolve(process.argv[dirIndex + 1]);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "EffectsTyping.lean"), configured.certificate.content);
  fs.writeFileSync(path.join(dir, "EffectsBehavior.lean"), compared.certificate.content);
}
console.log(JSON.stringify({
  chain, quantities: structural.setup.parameter_ids,
  wiring: structural.verdict, behavior_without_rows: unknown.decided,
  declared_finite_behavior: compared.verdict,
  certificates: [configured.certificate.certifies, compared.certificate.certifies],
  unmet_conditions: configured.unmetConditions,
  scope: "Synthetic off/on rows demonstrate compositional semantics. No quantitative performance, resource feasibility or physical sufficiency is inferred.",
}, null, 2));
