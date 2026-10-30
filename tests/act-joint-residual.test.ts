import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FunctionModel } from "../src/act.js";
import { weakestSpec, compareBehavior } from "../src/act-behavior.js";
import { applyTrim, interpose } from "../src/act-rewrite.js";
import { toolSpecs } from "../src/tools.js";

const baseline = () => FunctionModel.parse(JSON.parse(fs.readFileSync(new URL("../examples/function-models/bearing-heat-behavior.json", import.meta.url), "utf8")));
const box = (m: FunctionModel, id: string) => m.boxes.find((b) => b.id === id)!;
function fixture() {
  const m = baseline(); delete box(m, "housing").behavior;
  const trimmed = applyTrim(m, { trim: ["bearing"] }); assert.ok(trimmed.ok);
  const via = interpose(trimmed.model, { wire: "w-support", mediator: { id: "sleeve", name: "Sleeve" } }); assert.ok(via.ok);
  delete box(via.model, "motor").behavior;
  return via.model;
}
const ids = ["motor", "housing", "sleeve"];

test("three-hole joint residual agrees with singleton comparisons and preserves feedback wiring", () => {
  const m = fixture(), target = baseline();
  const result = weakestSpec(m, target, { jointBoxes: ids });
  assert.ok(result.ok && "joint" in result && result.verdict === "spec", JSON.stringify(result));
  const encoded = new Set(result.joint.residual.map((r) => JSON.stringify(r)));
  let safe = 0;
  for (const h of ["supported", "unsupported"]) for (const input of ["supported", "unsupported"]) for (const output of ["supported", "unsupported"]) {
    const rows = { motor: { in: {}, out: { "shaft-out": "rated" } }, housing: { in: {}, out: { bore: h } }, sleeve: { in: { in: input }, out: { out: output } } };
    const candidate = structuredClone(m);
    for (const id of ids) box(candidate, id).behavior = [rows[id as keyof typeof rows]];
    const cmp = compareBehavior(target, candidate);
    assert.ok(cmp.ok, JSON.stringify(cmp));
    // Empty singleton composites are safe. Otherwise only concept-only outputs violate containment.
    const isSafe = cmp.verdict === "preserved" || cmp.verdict === "undecided" || (cmp.verdict === "changed" && cmp.reason === "counterexample" && cmp.direction === "baseline-contains-concept");
    if (isSafe) safe++;
    assert.equal(encoded.has(JSON.stringify(rows)), isSafe, JSON.stringify(rows));
  }
  assert.equal(result.joint.residualCount, safe);
  // Mismatched housing/sleeve inputs violate an internal wire, so these tuples
  // cannot generate a steady state and remain in the residual regardless of output.
  const inert = { motor: { in: {}, out: { "shaft-out": "rated" } }, housing: { in: {}, out: { bore: "supported" } }, sleeve: { in: { in: "unsupported" }, out: { out: "unsupported" } } };
  assert.ok(encoded.has(JSON.stringify(inert)));
  assert.equal(result.joint.independentSafe, false);
  assert.equal(result.joint.factorizes, false);
  assert.ok(result.joint.counterexample);
});

test("joint residual respects mapped product endpoints", () => {
  const target = baseline(), m = fixture();
  box(m, "shaft").id = "replacement";
  for (const w of m.wires) {
    if (w.from.box === "shaft") w.from.box = "replacement";
    if (w.to.box === "shaft") w.to.box = "replacement";
  }
  const mapped = weakestSpec(m, target, { jointBoxes: ids, boxMap: { replacement: "shaft" } });
  const ordinary = weakestSpec(fixture(), target, { jointBoxes: ids });
  assert.ok(mapped.ok && "joint" in mapped && ordinary.ok && "joint" in ordinary);
  assert.deepEqual(mapped.joint.rows, ordinary.joint.rows);
  assert.equal(mapped.verdict, ordinary.verdict);
});

test("selection, producibility, and caps fail closed", async () => {
  const m = fixture(), target = baseline();
  for (const selected of [["motor", "housing"], [...ids, "motor"], [...ids, "ghost"], []]) {
    const r = weakestSpec(m, target, { jointBoxes: selected }); assert.equal(r.ok, false);
  }
  box(m, "housing").producible = [{ in: {}, out: { bore: "unsupported" } }];
  box(m, "sleeve").producible = [{ in: { in: "unsupported" }, out: { out: "unsupported" } }];
  const r = weakestSpec(m, target, { jointBoxes: ids });
  assert.ok(r.ok && "joint" in r && r.verdict === "impossible" && r.reason === "infeasible", JSON.stringify(r));
  assert.ok(r.joint.rows.every((row) => row.housing.out.bore === "unsupported"));
  const cap = weakestSpec(m, target, { jointBoxes: ids, maxStates: 2 });
  assert.ok(cap.ok && cap.verdict === "undecided" && cap.reason === "state-cap");
  const spec = toolSpecs().find((s) => s.name === "triz_behavior")!;
  const call = async (args: unknown) => JSON.parse((await spec.handler(args)).content[0].text);
  assert.equal((await call({ model: m, compare_to: target, joint_boxes: ids })).ok, false);
  assert.equal((await call({ model: m, compare_to: target, joint_boxes: ids, weakest_spec: true, row_costs: [] })).ok, false);
});

test("whole scope includes disconnected holes and handles partial and empty targets", () => {
  const target: FunctionModel = {
    domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "f", name: "Function", role: "tool", inputs: [{ id: "x", carrier: "bit" }], outputs: [{ id: "y", carrier: "bit" }], behavior: [{ in: { x: "0" }, out: { y: "0" } }] },
      { id: "p", name: "Product", role: "product", inputs: [{ id: "in", carrier: "bit" }], behavior: ["0", "1"].map((x) => ({ in: { in: x }, out: {} })) },
      ...["a", "b", "c"].map((id) => ({ id, name: id, role: "tool" as const, outputs: [{ id: "y", carrier: "bit" }], behavior: [{ in: {}, out: { y: "0" } }] })),
    ],
    wires: [{ id: "d", from: { box: "f", port: "y" }, to: { box: "p", port: "in" }, carrier: "bit", polarity: "useful" }],
  };
  const concept = structuredClone(target);
  for (const id of ["a", "b", "c"]) delete box(concept, id).behavior;
  const result = weakestSpec(concept, target, { scope: "whole", jointBoxes: ["a", "b", "c"] });
  assert.ok(result.ok && "joint" in result && result.verdict === "spec");
  assert.equal(result.joint.rowCount, 8);
  assert.equal(result.joint.independentSafe, true);
  assert.equal(result.joint.factorizes, true);
  assert.equal(weakestSpec(concept, target, { jointBoxes: ["a", "b", "c"] }).ok, false);
  target.boxes.push({ id: "loop", name: "Negation", role: "tool", inputs: [{ id: "x", carrier: "bit" }], outputs: [{ id: "y", carrier: "bit" }], behavior: [{ in: { x: "0" }, out: { y: "1" } }, { in: { x: "1" }, out: { y: "0" } }] });
  target.wires.push({ id: "loopback", from: { box: "loop", port: "y" }, to: { box: "loop", port: "x" }, carrier: "bit", polarity: "useful" });
  const empty = weakestSpec(concept, target, { scope: "whole", jointBoxes: ["a", "b", "c"] });
  assert.ok(empty.ok && empty.verdict === "undecided" && empty.reason === "no-steady-state");
});

test("joint_boxes flows through trim and invalid mode combinations are rejected", async () => {
  const m = baseline();
  delete box(m, "housing").behavior;
  m.boxes.push({ id: "spare", name: "Spare drive", role: "tool", outputs: [{ id: "shaft-out", carrier: "torque" }] });
  const spec = toolSpecs().find((s) => s.name === "triz_behavior")!;
  const call = async (args: unknown) => JSON.parse((await spec.handler(args)).content[0].text);
  const args = { model: m, trim: ["motor", "bearing"], absorb: { "w-drive": { box: "spare", port: "shaft-out" }, "w-support": { box: "housing", port: "bore" } }, weakest_spec: true, joint_boxes: ["spare", "housing"] };
  const r = await call(args);
  assert.ok(r.ok && r.verdict === "spec" && r.joint, JSON.stringify(r));
  assert.deepEqual(new Set(r.joint.boxes), new Set(["spare", "housing"]));
  assert.equal((await call({ ...args, weakest_spec: false })).ok, false);
  assert.equal((await call({ model: m, weakest_spec: true, joint_boxes: ["spare"] })).ok, false);
  assert.equal((await call({ ...args, row_costs: [] })).ok, false);
  assert.equal((await call({ ...args, max_cost_search: 2 })).ok, false);
});

test("joint output truncation never truncates the decision, and full_relation returns all rows", async () => {
  const target: FunctionModel = {
    domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "f", name: "Function", role: "tool", outputs: [{ id: "y", carrier: "bit" }], behavior: [{ in: {}, out: { y: "0" } }] },
      { id: "p", name: "Product", role: "product", inputs: [{ id: "in", carrier: "bit" }], behavior: [{ in: { in: "0" }, out: {} }] },
      { id: "wide", name: "Wide", role: "tool", outputs: Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, carrier: "bit" })), behavior: [{ in: {}, out: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`b${i}`, "0"])) }] },
    ],
    wires: [{ id: "d", from: { box: "f", port: "y" }, to: { box: "p", port: "in" }, carrier: "bit", polarity: "useful" }],
  };
  const concept = structuredClone(target); delete box(concept, "wide").behavior;
  const spec = toolSpecs().find((s) => s.name === "triz_behavior")!;
  const call = async (full_relation: boolean) => JSON.parse((await spec.handler({ model: concept, compare_to: target, weakest_spec: true, scope: "whole", joint_boxes: ["wide"], full_relation })).content[0].text);
  const partial = await call(false), full = await call(true);
  assert.equal(partial.verdict, "spec");
  assert.equal(full.verdict, partial.verdict);
  assert.equal(partial.joint.residual.length, 200); assert.equal(partial.joint.residualCount, 256); assert.equal(partial.joint.residualTruncated, true);
  assert.equal(partial.joint.rows.length, 200); assert.equal(partial.joint.rowCount, 256); assert.equal(partial.joint.rowsTruncated, true);
  assert.equal(partial.joint.projections.wide.length, 200); assert.equal(partial.joint.projectionCounts.wide, 256); assert.equal(partial.joint.projectionsTruncated.wide, true);
  assert.equal(full.joint.residual.length, 256); assert.equal(full.joint.residualTruncated, false);
  assert.equal(full.joint.rows.length, 256); assert.equal(full.joint.rowsTruncated, false);
  assert.equal(full.joint.projections.wide.length, 256); assert.equal(full.joint.projectionsTruncated.wide, false);
  assert.deepEqual(partial.joint.coverage, full.joint.coverage);
  assert.equal(partial.joint.independentSafe, full.joint.independentSafe);
  assert.equal(partial.joint.factorizes, full.joint.factorizes);
});
