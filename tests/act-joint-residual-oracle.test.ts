/** Independent complete-port enumeration checks the joint solver on real feedback wiring. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { type FunctionModel } from "../src/act.js";
import { weakestSpec } from "../src/act-behavior.js";

const ids = ["a", "b", "c"];
const bits = ["0", "1"];
type BehaviorRow = NonNullable<FunctionModel["boxes"][number]["behavior"]>[number];
type JointRow = Record<string, BehaviorRow>;
const rowKey = (row: JointRow) => ids.map(id => row[id].in.i + row[id].out.o).join("");
const portKey = (box: string, side: string, port: string) => JSON.stringify([box, side, port]);
const copy = bits.map(v => ({ in: { i: v }, out: { o: v } }));
const negate = bits.map((v, i) => ({ in: { i: v }, out: { o: bits[1 - i] } }));

function ring(rows: BehaviorRow[][]): FunctionModel {
  return {
    domain: "software",
    carriers: [{ id: "bit", layer: "information", dimension: "bit", values: bits }],
    boxes: [
      ...ids.map((id, i) => ({ id, name: id, role: "tool" as const,
        inputs: [{ id: "i", carrier: "bit" }], outputs: [{ id: "o", carrier: "bit" }], behavior: rows[i] })),
      { id: "p", name: "Product", role: "product", inputs: [{ id: "i", carrier: "bit" }],
        behavior: bits.map(v => ({ in: { i: v }, out: {} })) },
    ],
    wires: [...ids.map((id, i) => ({ id: `loop-${id}`, from: { box: id, port: "o" },
      to: { box: ids[(i + 1) % ids.length], port: "i" }, carrier: "bit", polarity: "useful" as const })),
      { id: "deliver", from: { box: "a", port: "o" }, to: { box: "p", port: "i" }, carrier: "bit", polarity: "useful" }],
  };
}

/** No evaluator, port unification, propagation, or residual implementation is shared. */
function outputs(model: FunctionModel, chosen?: JointRow): Set<string> {
  const ports = model.boxes.flatMap(b => [
    ...(b.inputs ?? []).map(p => portKey(b.id, "in", p.id)),
    ...(b.outputs ?? []).map(p => portKey(b.id, "out", p.id)),
  ]);
  const answer = new Set<string>();
  for (let mask = 0; mask < 2 ** ports.length; mask++) {
    const values = new Map(ports.map((p, i) => [p, bits[Math.floor(mask / 2 ** i) % 2]]));
    const read = (b: string, side: string, p: string) => values.get(portKey(b, side, p));
    if (model.wires.some(w => read(w.from.box, "out", w.from.port) !== read(w.to.box, "in", w.to.port))) continue;
    if (!model.boxes.every(b => {
      const rows = chosen && Object.hasOwn(chosen, b.id) ? [chosen[b.id]] : b.behavior;
      return rows === undefined || rows.some(r =>
        (b.inputs ?? []).every(p => r.in[p.id] === read(b.id, "in", p.id)) &&
        (b.outputs ?? []).every(p => r.out[p.id] === read(b.id, "out", p.id)));
    })) continue;
    answer.add(read("p", "in", "i")!);
  }
  return answer;
}

function candidates(): JointRow[] {
  return Array.from({ length: 64 }, (_, n) => Object.fromEntries(ids.map((id, i) => [id, {
    in: { i: bits[Math.floor(n / 2 ** (2 * i)) % 2] },
    out: { o: bits[Math.floor(n / 2 ** (2 * i + 1)) % 2] },
  }])));
}

const patterns = [
  [[{ in: { i: "0" }, out: { o: "0" } }], copy, copy],
  [[{ in: { i: "1" }, out: { o: "1" } }], copy, copy],
  [copy, copy, copy], [negate, negate, copy], [negate, copy, copy],
  [[{ in: { i: "0" }, out: { o: "1" } }], negate, copy],
];

test("joint residual, coverage and coupling match exhaustive whole-port feedback semantics", () => {
  for (const rows of patterns) for (const bounded of [false, true]) {
    const target = ring(rows);
    const concept = structuredClone(target);
    for (const b of concept.boxes.filter(b => ids.includes(b.id))) delete b.behavior;
    if (bounded) concept.boxes[0].producible = [copy[0], negate[1]];
    const goal = outputs(target);
    const r = weakestSpec(concept, target, { jointBoxes: ids, scope: "whole", fullRelation: true });
    assert.ok(r.ok);
    if (!goal.size) {
      assert.ok(r.verdict === "undecided" && r.reason === "no-steady-state");
      continue;
    }
    assert.ok("joint" in r);
    const all = candidates();
    const delivered = new Map(all.map(row => [rowKey(row), outputs(concept, row)]));
    const safe = all.filter(row => [...delivered.get(rowKey(row))!].every(value => goal.has(value)));
    const feasible = safe.filter(row => concept.boxes.every(b => !b.producible ||
      b.producible.some(p => JSON.stringify(p) === JSON.stringify(row[b.id]))));
    assert.deepEqual(new Set(r.joint.residual.map(rowKey)), new Set(safe.map(rowKey)));
    assert.deepEqual(new Set(r.joint.rows.map(rowKey)), new Set(feasible.map(rowKey)));
    const union = new Set(feasible.flatMap(row => [...delivered.get(rowKey(row))!]));
    const covers = [...goal].every(value => union.has(value));
    assert.equal(r.verdict, covers ? "spec" : "impossible");
    assert.equal(r.preserves, covers);
    const projections = ids.map(id => new Set(feasible.map(row => JSON.stringify(row[id]))));
    const independent = all.filter(row => ids.every((id, i) => projections[i].has(JSON.stringify(row[id]))));
    const independentSafe = independent.every(row => [...delivered.get(rowKey(row))!].every(value => goal.has(value)));
    assert.equal(r.joint.independentSafe, independentSafe);
    assert.equal(r.joint.factorizes, independent.length === feasible.length);
    if (!independentSafe) {
      assert.ok(r.joint.counterexample);
      const witness = r.joint.counterexample.rows;
      assert.ok(ids.every((id, i) => projections[i].has(JSON.stringify(witness[id]))));
      assert.ok([...outputs(concept, witness)].some(value => !goal.has(value)));
    }
  }
});
