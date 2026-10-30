import { test } from "node:test";
import assert from "node:assert/strict";
import { BuildModelRequest, buildModel } from "../src/act-builder.js";
import { analyseModel, checkModel } from "../src/act.js";

const input: BuildModelRequest = {
  domain: "physical", components: [
    { id: "pump", name: "Pump", role: "tool" }, { id: "water", name: "Water", role: "product" },
    { id: "case", name: "Case", role: "mediator" },
  ], interactions: [
    { subject: "pump", action: "move", object: "water", carrier: { id: "flow", layer: "material", dimension: "L/s" }, polarity: "useful" },
    { subject: "pump", action: "heat", object: "case", carrier: { id: "heat", layer: "energy", dimension: "W" }, polarity: "harmful" },
  ], flows: [{ id: "f", carrier: "flow", path: ["pump", "water"] }],
};
const clone = () => structuredClone(input);

test("builds a typed model with declared flows, lints and scoped completeness", () => {
  const r = buildModel(BuildModelRequest.parse(input));
  assert.equal(r.ok, true); if (!r.ok) return;
  assert.equal(checkModel(r.model).ok, true);
  assert.equal(analyseModel(r.model).ok, true);
  assert.deepEqual(r.model.flows, input.flows);
  assert.equal(r.model.wires.find((w) => w.verb === "heat")?.polarity, "harmful");
  assert.ok(r.model.boxes.every((b) => b.behavior === undefined));
  assert.deepEqual(r.completeness.missingPairs, [["case", "water"]]);
  assert.deepEqual(r.completeness.products, [{ id: "water", reached: true }]);
});

test("IDs and ordering survive permutation and component renaming", () => {
  const a = buildModel(clone()), bInput = clone();
  bInput.components.reverse(); bInput.interactions.reverse(); bInput.components[0].name = "Renamed";
  const b = buildModel(bInput); assert.ok(a.ok && b.ok);
  assert.deepEqual(a.model.wires, b.model.wires);
  assert.deepEqual(a.model.boxes.map(({ id, inputs, outputs }) => ({ id, inputs, outputs })), b.model.boxes.map(({ id, inputs, outputs }) => ({ id, inputs, outputs })));
});

test("rejects unknown endpoints, conflicting descriptors, and duplicate interactions at input paths", () => {
  const x = clone(); x.interactions[0].object = "absent";
  const a = buildModel(x); assert.equal(a.ok, false); if (a.ok) return;
  assert.equal(a.issues[0].path, "$.interactions[0].object");
  const y = clone(); y.interactions[1].carrier.id = "flow";
  const b = buildModel(y); assert.equal(b.ok, false); if (b.ok) return;
  assert.equal(b.issues[0].path, "$.interactions[1].carrier");
  const z = clone(); z.interactions.push({ ...z.interactions[0], polarity: "harmful" });
  const c = buildModel(z); assert.equal(c.ok, false); if (c.ok) return;
  assert.equal(c.issues[0].path, "$.interactions[2]");
});

test("rejects invalid flows and carrier levels using input paths", () => {
  const x = clone(); x.flows![0].path[1] = "missing";
  const a = buildModel(x); assert.equal(a.ok, false); if (a.ok) return;
  assert.equal(a.issues[0].path, "$.flows[0].path[1]");
  const y = clone(); y.interactions[0].carrier.levels = [{ value: "high", from: 1 }];
  const b = buildModel(y); assert.equal(b.ok, false); if (b.ok) return;
  assert.ok(b.issues.every((i) => i.path.startsWith("$.interactions[0].carrier")));
});

test("arbitrary ids and prototype keys cannot collide or pollute prototypes", () => {
  const x = clone(); x.components = ["__proto__", "constructor", "a,b", "a", "\ud800", "�"].map((id) => ({ id, name: id, role: "tool" }));
  x.interactions = x.components.slice(1).map((c) => ({ subject: "__proto__", action: c.id, object: c.id, carrier: { id: c.id, layer: "information", dimension: "x" }, polarity: "useful" }));
  x.flows = undefined;
  const r = buildModel(BuildModelRequest.parse(x)); assert.ok(r.ok);
  assert.equal(new Set(r.model.wires.map((w) => w.id)).size, x.interactions.length);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.ok(checkModel(r.model).ok);
});

test("bounds missing pairs and reports isolation and unfulfilled products", () => {
  const x = clone(); x.components = Array.from({ length: 30 }, (_, n) => ({ id: String(n).padStart(2, "0"), name: String(n), role: n === 0 ? "product" : "tool" })); x.interactions = []; x.flows = undefined;
  const r = buildModel(x); assert.ok(r.ok);
  assert.equal(r.completeness.missingPairCount, 435); assert.equal(r.completeness.missingPairs.length, 100);
  assert.equal(r.completeness.missingPairsTruncated, true); assert.equal(r.completeness.isolatedComponents.length, 30);
  assert.deepEqual(r.completeness.products, [{ id: "00", reached: false }]);
});

test("equivalent carrier defaults and value-set order yield the same full model", () => {
  const x = clone();
  x.flows = undefined;
  x.interactions[0].carrier = { id: "flow", layer: "material", dimension: "L/s", values: ["high", "low"], quantity: "intensive", levels: [{ value: "low", from: 0 }, { value: "high", from: 10 }] };
  x.interactions.push({ subject: "case", action: "contain", object: "water", polarity: "useful", carrier: { id: "flow", layer: "material", dimension: "L/s", values: ["low", "high"], levels: [{ value: "low", from: 0 }, { value: "high", from: 10 }] } });
  const y = structuredClone(x); y.interactions.reverse(); y.components.reverse();
  const a = buildModel(x), b = buildModel(y); assert.ok(a.ok && b.ok);
  assert.deepEqual(a.model, b.model);
  assert.deepEqual(a.model.carriers.find((c) => c.id === "flow")?.values, ["high", "low"]);
  assert.equal(a.model.carriers.find((c) => c.id === "flow")?.quantity, undefined);
  const z = structuredClone(x); z.interactions[2].carrier.quantity = "extensive";
  const conflict = buildModel(z); assert.equal(conflict.ok, false);
});


test("builder preserves declared loss metadata and rejects contradictory descriptors", () => {
  for (const loss of [false, true]) {
    const x = clone();
    x.interactions[1].carrier.loss = loss;
    x.interactions[1].polarity = "excessive";
    const result = buildModel(BuildModelRequest.parse(x));
    assert.ok(result.ok);
    assert.equal(result.model.carriers.find(c => c.id === "heat")?.loss, loss);
    assert.equal(result.warnings.some(w => w.code === "defect-on-loss-carrier"), loss);
    x.interactions.push({ ...x.interactions[1], action: "warm", carrier: { ...x.interactions[1].carrier, loss: !loss } });
    const conflict = buildModel(x);
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.issues[0].code, "carrier-mismatch");
  }
});
