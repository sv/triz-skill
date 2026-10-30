/**
 * triz_build_model's generated ports and ids (src/act-builder.ts): one input port per interaction,
 * so two sources of one carrier into one object never share a port (no fan-in under behaviour,
 * no extensive-fan-in under feasibility); one output port per subject and carrier, which fans out;
 * and readable ids that stay injective when user ids contain the ':' separator or '%'.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BuildModelRequest, buildModel } from "../src/act-builder.js";
import { checkModel, type FunctionModel } from "../src/act.js";
import { externalBehavior } from "../src/act-behavior.js";
import { feasibility } from "../src/act-feasibility.js";

/** Two sources sending one carrier into one object: an interaction table, nothing else declared. */
function twoSources(carrier: BuildModelRequest["interactions"][number]["carrier"]): BuildModelRequest {
  return {
    domain: "physical", components: [
      { id: "pump", name: "Pump", role: "tool" }, { id: "tank", name: "Tank", role: "tool" }, { id: "bed", name: "Bed", role: "product" },
    ], interactions: [
      { subject: "pump", action: "supply", object: "bed", carrier, polarity: "useful" },
      { subject: "tank", action: "supply", object: "bed", carrier, polarity: "useful" },
    ],
  };
}
const fedBy = (m: FunctionModel) => m.boxes.flatMap((b) => (b.inputs ?? []).map((p) => m.wires.filter((w) => w.to.box === b.id && w.to.port === p.id).length));

test("two sources of one carrier into one object get one input port each: no fan-in under behaviour", () => {
  const r = buildModel(twoSources({ id: "water", layer: "material", dimension: "L/min", values: ["low", "high"] }));
  assert.ok(r.ok);
  assert.deepEqual(r.model.boxes.find((b) => b.id === "bed")!.inputs, [
    { id: "in:water:pump:supply", carrier: "water" }, { id: "in:water:tank:supply", carrier: "water" },
  ]);
  assert.deepEqual(fedBy(r.model), [1, 1], "every input port is fed by exactly one function");
  // Sources that disagree: each deliverable carries its own source's value.
  const m = structuredClone(r.model);
  m.boxes.find((b) => b.id === "pump")!.behavior = [{ in: {}, out: { "out:water": "high" } }];
  m.boxes.find((b) => b.id === "tank")!.behavior = [{ in: {}, out: { "out:water": "low" } }];
  const e = externalBehavior(m, { fullRelation: true });
  assert.ok(e.ok && e.decided, JSON.stringify(e));
  assert.deepEqual(e.deliverables.map((d) => d.port), ["in:water:pump:supply", "in:water:tank:supply"]);
  assert.deepEqual(e.relation.map((r) => [r.input, r.outputs]), [[[], [["high", "low"]]]]);
  // On one shared input port both sources must agree, so the same table has no steady state.
  const shared = structuredClone(m);
  shared.boxes.find((b) => b.id === "bed")!.inputs = [{ id: "in", carrier: "water" }];
  for (const w of shared.wires) w.to.port = "in";
  const s = externalBehavior(shared, { fullRelation: true });
  assert.ok(s.ok && s.decided);
  assert.deepEqual(s.noSteadyState, [[]]);
});

test("two sources of one extensive carrier into one object stay feasible: no extensive-fan-in", () => {
  const r = buildModel(twoSources({ id: "water", layer: "material", dimension: "L/min", quantity: "extensive" }));
  assert.ok(r.ok);
  assert.deepEqual(fedBy(r.model), [1, 1]);
  assert.deepEqual(r.warnings.filter((w) => w.code === "extensive-fan-out"), [], "each source's output feeds one function");
  const m: FunctionModel = { ...structuredClone(r.model), budget: { usd: 100 } };
  m.boxes.find((b) => b.id === "pump")!.feasibility = [{ provides: { "out:water": 5 }, cost: { usd: 10 } }];
  m.boxes.find((b) => b.id === "tank")!.feasibility = [{ provides: { "out:water": 5 }, cost: { usd: 5 } }];
  m.boxes.find((b) => b.id === "bed")!.feasibility = [{ requires: { "in:water:pump:supply": 4, "in:water:tank:supply": 4 } }];
  const f = feasibility(m);
  assert.ok(f.ok, JSON.stringify(f));
  assert.equal(f.verdict, "feasible");
  // The same demand on one shared port is the fan-in the builder no longer produces.
  const shared = structuredClone(m);
  const bed = shared.boxes.find((b) => b.id === "bed")!;
  bed.inputs = [{ id: "in", carrier: "water" }];
  bed.feasibility = [{ requires: { in: 8 } }];
  for (const w of shared.wires) w.to.port = "in";
  const refused = feasibility(shared);
  assert.ok(!refused.ok);
  assert.deepEqual(refused.issues.map((i) => i.code), ["extensive-fan-in"]);
});

test("an output port is shared per subject and carrier, and fans out to every object", () => {
  const r = buildModel({
    domain: "physical", components: [
      { id: "pump", name: "Pump", role: "tool" }, { id: "a", name: "Bed A", role: "product" }, { id: "b", name: "Bed B", role: "product" },
    ], interactions: ["a", "b"].map((object) => ({ subject: "pump", action: "supply", object, carrier: { id: "water", layer: "material" as const, dimension: "L/min" }, polarity: "useful" as const })),
  });
  assert.ok(r.ok);
  assert.deepEqual(r.model.boxes.find((b) => b.id === "pump")!.outputs, [{ id: "out:water", carrier: "water" }]);
  assert.deepEqual(r.model.wires.map((w) => [w.id, w.from.port, w.to.port]), [
    ["wire:pump:supply:a:water", "out:water", "in:water:pump:supply"],
    ["wire:pump:supply:b:water", "out:water", "in:water:pump:supply"],
  ]);
});

test("generated ids are readable, stable, and injective even when user ids contain the separator", () => {
  const table = (): BuildModelRequest => ({
    domain: "physical", components: [
      { id: "pump", name: "Pump", role: "tool" }, { id: "water", name: "Water", role: "product" }, { id: "case", name: "Case", role: "mediator" },
    ], interactions: [
      { subject: "pump", action: "move", object: "water", carrier: { id: "flow", layer: "material", dimension: "L/s" }, polarity: "useful" },
      { subject: "pump", action: "heat", object: "case", carrier: { id: "heat", layer: "energy", dimension: "W" }, polarity: "harmful" },
    ],
  });
  const r = buildModel(table());
  assert.ok(r.ok);
  assert.deepEqual(r.model.wires.map((w) => w.id), ["wire:pump:heat:case:heat", "wire:pump:move:water:flow"]);
  assert.deepEqual(r.model.boxes.find((b) => b.id === "pump")!.outputs!.map((p) => p.id), ["out:flow", "out:heat"]);
  assert.deepEqual(r.model.boxes.find((b) => b.id === "water")!.inputs!.map((p) => p.id), ["in:flow:pump:move"]);
  assert.deepEqual(buildModel(table()), r, "the same table gives the same ids");
  // Tuples that plain ':'-joining would merge ('a:b' + 'c' and 'a' + 'b:c'), and ids that look like escapes.
  const ids = ["a", "a:b", "b", "b:c", "c", "%", "%3A", ":", "%25", "a%3Ab"];
  const x: BuildModelRequest = {
    domain: "software", components: ids.map((id) => ({ id, name: id, role: "tool" })),
    interactions: ids.flatMap((s) => ids.flatMap((o) => (s === o ? [] : [
      { subject: s, action: o, object: o, carrier: { id: s, layer: "information", dimension: "x" }, polarity: "useful" as const },
      { subject: s, action: `${s}:${o}`, object: o, carrier: { id: o, layer: "information", dimension: "x" }, polarity: "useful" as const },
    ]))),
  };
  const y = buildModel(x);
  assert.ok(y.ok, JSON.stringify(!y.ok && y.issues.slice(0, 3)));
  assert.ok(checkModel(y.model).ok);
  assert.equal(new Set(y.model.wires.map((w) => w.id)).size, x.interactions.length, "wire ids are distinct");
  for (const b of y.model.boxes) {
    const ports = [...(b.inputs ?? []), ...(b.outputs ?? [])].map((p) => p.id);
    assert.equal(new Set(ports).size, ports.length, `port ids of '${b.id}' are distinct`);
  }
  // Every id decodes back to the tuple it was made from.
  const decode = (id: string) => id.split(":").map((part) => part.replace(/%(25|3A)/g, (_, hex) => (hex === "25" ? "%" : ":")));
  for (const w of y.model.wires) {
    assert.deepEqual(decode(w.id), ["wire", w.from.box, w.verb, w.to.box, w.carrier]);
    assert.deepEqual(decode(w.to.port), ["in", w.carrier, w.from.box, w.verb]);
    assert.deepEqual(decode(w.from.port), ["out", w.carrier]);
  }
});
