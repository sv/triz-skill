import { test } from "node:test";
import assert from "node:assert/strict";
import { checkModel, idealityProfile, type FunctionModel } from "../src/act.js";
import { substitute } from "../src/act-hierarchy.js";
import { externalBehavior } from "../src/act-behavior.js";
import { boundedDynamics } from "../src/act-dynamics.js";
import { feasibility } from "../src/act-feasibility.js";

const carrier = { id: "c", layer: "information" as const, dimension: "bit", values: ["0", "1"], loss: false };
const innerCarrier = { ...carrier, quantity: "intensive" as const, values: ["1", "0"] };
const innerBox = { id: "a.#/", name: "A", role: "tool" as const, outputs: [{ id: "o", carrier: "c" }],
  behavior: [{ in: {}, out: { o: "0" } }, { in: {}, out: { o: "1" } }],
  cost: { usd: 4, hours: 2 }, feasibility: [{ provides: { o: 2 }, cost: { usd: 3 } }] };

function fixture(): FunctionModel {
  return { domain: "software", carriers: [structuredClone(carrier)], budget: { usd: 8, hours: 2 }, weights: { usd: 2, hours: 1, harmful: 1 }, boxes: [
    { id: "h/ø", name: "H", role: "tool", outputs: [{ id: "outer", carrier: "c" }], inner: {
      model: { domain: "software", carriers: [structuredClone(innerCarrier)], boxes: [structuredClone(innerBox), { id: "z", name: "Z", role: "mediator" }], wires: [],
        flows: [{ id: "f", carrier: "c", path: ["a.#/", "z"], medium: "z", name: "inner" }] },
      inputs: [], outputs: [{ outer: "outer", inner: { box: "a.#/", port: "o" } }] } },
    { id: "p", name: "Product", role: "product", inputs: [{ id: "in", carrier: "c" }], feasibility: [{ requires: { in: 2 } }] },
    { id: "e1", name: "E1", role: "environment" }, { id: "e2", name: "E2", role: "environment" },
    { id: "h/ø/a.#/", name: "Collision", role: "environment" },
  ], wires: [{ id: "w", from: { box: "h/ø", port: "outer" }, to: { box: "p", port: "in" }, carrier: "c", polarity: "useful" }],
    flows: [{ id: "h/ø/f", carrier: "c", path: ["e1", "e2"], medium: "e1", name: "parent" }] };
}

/** Independently stated flattened model, including concrete fresh names and declarations. */
function oracle(): FunctionModel {
  return { domain: "software", carriers: [structuredClone(carrier)], budget: { usd: 8, hours: 2 }, weights: { usd: 2, hours: 1, harmful: 1 }, boxes: [
    { id: "p", name: "Product", role: "product", inputs: [{ id: "in", carrier: "c" }], feasibility: [{ requires: { in: 2 } }] },
    { id: "e1", name: "E1", role: "environment" }, { id: "e2", name: "E2", role: "environment" },
    { id: "h/ø/a.#/", name: "Collision", role: "environment" },
    { id: "h/ø/a.#/#2", name: "A", role: "tool", outputs: [{ id: "o", carrier: "c" }], behavior: [{ in: {}, out: { o: "0" } }, { in: {}, out: { o: "1" } }], cost: { usd: 4, hours: 2 }, feasibility: [{ provides: { o: 2 }, cost: { usd: 3 } }] },
    { id: "h/ø/z", name: "Z", role: "mediator" },
  ], wires: [{ id: "w", from: { box: "h/ø/a.#/#2", port: "o" }, to: { box: "p", port: "in" }, carrier: "c", polarity: "useful" }],
    flows: [{ id: "h/ø/f", carrier: "c", path: ["e1", "e2"], medium: "e1", name: "parent" },
      { id: "h/ø/f#2", carrier: "c", path: ["h/ø/a.#/#2", "h/ø/z"], medium: "h/ø/z", name: "inner" }] };
}

test("expansion preserves resource declarations, metadata, behavior, flow and arbitrary id maps", () => {
  const m = fixture(); assert.equal(checkModel(m).ok, true);
  const result = substitute(m, "h/ø"); assert.ok(result.ok); if (!result.ok) return;
  const expected = oracle(); assert.deepEqual(result.model, expected);
  assert.deepEqual(result.boxNames, { "a.#/": "h/ø/a.#/#2", z: "h/ø/z" });
  assert.deepEqual(result.flowNames, { f: "h/ø/f#2" });
  assert.deepEqual(result.model.budget, { usd: 8, hours: 2 });
  assert.deepEqual(externalBehavior(result.model), externalBehavior(expected));
  const actualF = feasibility(result.model), expectedF = feasibility(expected);
  assert.deepEqual(actualF, expectedF); assert.ok(actualF.ok && actualF.verdict === "feasible");
  if (actualF.ok && "minimal" in actualF) assert.deepEqual(actualF.minimal[0].resources, { hours: 2, usd: 7 });
  assert.deepEqual(idealityProfile(result.model), idealityProfile(expected));
  assert.deepEqual(idealityProfile(result.model).costs, { hours: 2, usd: 4 });
});

test("expansion preserves state, initial states, transitions and dynamics", () => {
  const m = fixture(); const inner = m.boxes[0].inner.model.boxes[0];
  delete inner.behavior;
  inner.state = ["cold", "hot"]; inner.initial = ["cold"];
  inner.transition = [{ state: "cold", in: {}, next: "hot", out: { o: "0" } }, { state: "hot", in: {}, next: "hot", out: { o: "1" } }];
  const expected = oracle(); const flat = expected.boxes.find(b => b.id === "h/ø/a.#/#2")!;
  delete flat.behavior; flat.state = ["cold", "hot"]; flat.initial = ["cold"];
  flat.transition = [{ state: "cold", in: {}, next: "hot", out: { o: "0" } }, { state: "hot", in: {}, next: "hot", out: { o: "1" } }];
  const result = substitute(m, "h/ø"); assert.ok(result.ok); if (!result.ok) return;
  assert.deepEqual(result.model, expected);
  const options = { horizon: 3, unsafe: [{ box: "h/ø/a.#/#2", state: ["hot"] }] };
  const actual = boundedDynamics(result.model, options), manual = boundedDynamics(expected, options);
  assert.deepEqual(actual, manual); assert.ok(actual.ok && actual.decided);
});

test("parent flows through a box or using it as medium fail with the flow named", () => {
  for (const flow of [
    { id: "crossing", carrier: "c", path: ["e1", "h/ø", "e2"] },
    { id: "medium", carrier: "c", path: ["e1", "e2"], medium: "h/ø" },
  ]) {
    const m = fixture(); m.flows!.push(flow);
    const result = substitute(m, "h/ø"); assert.equal(result.ok, false);
    if (!result.ok) { assert.match(result.errors.join(" "), new RegExp(flow.id)); assert.match(result.issues[0].hint, /inner route/); }
  }
});

test("shared carrier defaults and value order normalize, but loss and resource semantics do not disappear", () => {
  const m = fixture(); assert.equal(substitute(m, "h/ø").ok, true);
  for (const change of [
    (x: FunctionModel) => { x.boxes[0].inner.model.carriers[0].loss = true; },
    (x: FunctionModel) => { delete x.boxes[0].inner.model.carriers[0].loss; },
    (x: FunctionModel) => { x.boxes[0].inner.model.carriers[0].quantity = "extensive"; },
    (x: FunctionModel) => { x.boxes[0].inner.model.budget = {}; },
    (x: FunctionModel) => { x.boxes[0].inner.model.weights = {}; },
  ]) { const changed = structuredClone(m); change(changed); assert.equal(substitute(changed, "h/ø").ok, false); }
});

test("nested expansion preserves metadata on each step", () => {
  const m = fixture();
  const innerModel = m.boxes[0].inner.model;
  delete innerModel.flows;
  innerModel.boxes[0] = { id: "a.#/", name: "Nested", role: "tool", outputs: [{ id: "o", carrier: "c" }], inner: {
    model: { domain: "software", carriers: [structuredClone(innerCarrier)], boxes: [{ ...structuredClone(innerBox), id: "leaf" }], wires: [] },
    inputs: [], outputs: [{ outer: "o", inner: { box: "leaf", port: "o" } }],
  } };
  const first = substitute(m, "h/ø"); assert.ok(first.ok); if (!first.ok) return;
  assert.equal(first.model.boxes.find(b => b.id === "h/ø/a.#/#2")?.inner !== undefined, true);
  const second = substitute(first.model, first.boxNames["a.#/"]); assert.ok(second.ok); if (!second.ok) return;
  assert.deepEqual(second.boxNames, { leaf: "h/ø/a.#/#2/leaf" });
  const expected = oracle(); expected.flows!.pop();
  const leafIndex = expected.boxes.findIndex(b => b.id === "h/ø/a.#/#2");
  const [leaf] = expected.boxes.splice(leafIndex, 1); leaf.id = "h/ø/a.#/#2/leaf"; expected.boxes.push(leaf);
  expected.wires[0].from.box = "h/ø/a.#/#2/leaf";
  assert.deepEqual(second.model, expected);
  assert.deepEqual(feasibility(second.model), feasibility(expected));
  assert.deepEqual(externalBehavior(second.model), externalBehavior(expected));
});

test("inner wires are renamed and copied with all metadata", () => {
  const m = fixture(); const nested = m.boxes[0].inner.model;
  nested.boxes[0].outputs = [{ id: "o", carrier: "c" }];
  nested.boxes[1] = { id: "z", name: "Z", role: "mediator", inputs: [{ id: "i", carrier: "c" }], outputs: [{ id: "o", carrier: "c" }],
    behavior: [{ in: { i: "0" }, out: { o: "0" } }, { in: { i: "1" }, out: { o: "1" } }] };
  nested.wires = [{ id: "w", from: { box: "a.#/", port: "o" }, to: { box: "z", port: "i" }, carrier: "c", polarity: "excessive", verb: "transmit" }];
  m.boxes[0].inner.outputs[0].inner = { box: "z", port: "o" };
  m.wires.push({ id: "h/ø/w", from: { box: "e1", port: "x" }, to: { box: "e2", port: "x" }, carrier: "c", polarity: "useful" });
  m.boxes.find(b => b.id === "e1")!.outputs = [{ id: "x", carrier: "c" }];
  m.boxes.find(b => b.id === "e2")!.inputs = [{ id: "x", carrier: "c" }];
  const result = substitute(m, "h/ø"); assert.ok(result.ok); if (!result.ok) return;
  assert.deepEqual(result.wireNames, { w: "h/ø/w#2" });
  assert.deepEqual(result.model.wires.find(w => w.id === "h/ø/w#2"), { id: "h/ø/w#2", from: { box: "h/ø/a.#/#2", port: "o" }, to: { box: "h/ø/z", port: "i" }, carrier: "c", polarity: "excessive", verb: "transmit" });
  assert.equal(checkModel(result.model).ok, true);
});

test("unsupported product and inner model policies fail closed", () => {
  for (const change of [
    (x: FunctionModel) => { x.boxes[0].role = "product"; },
    (x: FunctionModel) => { x.boxes[0].inner.model.boxes[1].role = "product"; },
    (x: FunctionModel) => { x.boxes[0].inner.model.domain = "physical"; },
    (x: FunctionModel) => { x.boxes[0].inner.model.contradictions = [{ id: "c", parameter: "p", demands: [{ id: "a", values: ["v"] }, { id: "b", values: ["v"] }] }]; },
  ]) { const m = fixture(); change(m); assert.equal(substitute(m, "h/ø").ok, false); }
});

test("extensive resource mode, introduced loss carriers and budget limits are retained", () => {
  const m = fixture();
  m.carriers[0].quantity = "extensive";
  m.boxes[0].inner.model.carriers[0].quantity = "extensive";
  m.boxes[0].inner.model.carriers.push({ id: "loss/new", layer: "energy", dimension: "W", loss: true, quantity: "extensive" });
  m.boxes[0].inner.model.flows.push({ id: "loss", carrier: "loss/new", path: ["a.#/", "z"] });
  m.budget = { usd: 6, hours: 2 };
  const r = substitute(m, "h/ø"); assert.ok(r.ok); if (!r.ok) return;
  assert.equal(r.model.carriers[0].quantity, "extensive");
  assert.deepEqual(r.model.carriers.find(c => c.id === "loss/new"), { id: "loss/new", layer: "energy", dimension: "W", loss: true, quantity: "extensive" });
  assert.deepEqual(r.model.flows!.find(f => f.id === "h/ø/loss"), { id: "h/ø/loss", carrier: "loss/new", path: ["h/ø/a.#/#2", "h/ø/z"] });
  const f = feasibility(r.model); assert.ok(f.ok && f.verdict === "infeasible");
  assert.deepEqual(r.model.budget, { usd: 6, hours: 2 });
});
