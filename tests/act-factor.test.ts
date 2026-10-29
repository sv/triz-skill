/**
 * The finest factorisation of a box's declared relation over its ports (finestFactorisation):
 * checked against a brute force over every partition of small boxes, on known answers, under
 * relabelling, at the cap, and where segment, take_out, and triz_behavior report it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel } from "../src/act.js";
import { finestFactorisation, segment, splitBehavior, takeOut } from "../src/act-rewrite.js";
import { externalBehavior, factorisationsOf } from "../src/act-behavior.js";
import { rng, int, shuffle, type Rng } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));

type Box = FunctionModel["boxes"][number];
const port = (id: string) => ({ id, carrier: "c" });
const rowsBox = (inputs: string[], outputs: string[], rows: string[][]): Box => ({
  id: "r", name: "R", role: "tool", inputs: inputs.map(port), outputs: outputs.map(port),
  behavior: rows.map((t) => ({ in: Object.fromEntries(inputs.map((p, i) => [p, t[i]])), out: Object.fromEntries(outputs.map((p, i) => [p, t[inputs.length + i]])) })),
});
/** A one-box model, so segment and take_out can run on the box. */
const single = (b: Box, values: string[]): FunctionModel => ({ domain: "physical", carriers: [{ id: "c", layer: "information", dimension: "bit", values }], boxes: [b], wires: [] }) as FunctionModel;
const tuples = (n: number, values: string[]) => Array.from({ length: n }).reduce<string[][]>((acc) => acc.flatMap((t) => values.map((v) => [...t, v])), [[]]);
/** A partition as sorted blocks of sorted ids, for comparing two partitions. */
const canonical = (blocks: string[][]) => blocks.map((b) => [...b].sort()).sort((a, b) => (a.join() < b.join() ? -1 : 1));
const decided = (b: Box, opts = {}) => {
  const f = finestFactorisation(b, opts);
  assert.ok(f.decided, f.decided ? "" : f.note);
  return f.parts;
};

/** Every partition of 0…n-1, from restricted growth strings. */
function partitions(n: number): number[][][] {
  const out: number[][][] = [];
  const grow = (labels: number[], top: number) => {
    if (labels.length === n) {
      out.push(Array.from({ length: top }, (_, j) => labels.flatMap((l, i) => (l === j ? [i] : []))));
      return;
    }
    for (let l = 0; l <= top; l++) grow([...labels, l], Math.max(top, l + 1));
  };
  grow([], 0);
  return out;
}

/** Whether `rows` equals the product of its block projections, the product enumerated tuple by tuple. */
function factorsBrute(rows: string[][], blocks: number[][], n: number) {
  const member = new Set(rows.map((t) => t.join()));
  const proj = (g: number[]) => [...new Set(rows.map((t) => JSON.stringify(g.map((i) => t[i]))))].map((x) => JSON.parse(x) as string[]);
  const product = blocks.reduce<Array<Array<string | undefined>>>((acc, g) => acc.flatMap((t) => proj(g).map((p) => {
    const u = [...t];
    g.forEach((i, j) => { u[i] = p[j]; });
    return u;
  })), [Array.from({ length: n }, () => undefined)]);
  const distinct = new Set(product.map((t) => t.join()));
  return distinct.size === member.size && [...distinct].every((t) => member.has(t));
}

const refines = (p: number[][], q: number[][]) => p.every((b) => q.some((c) => b.every((i) => c.includes(i))));

/** A random relation: a sample of all tuples, or a product of samples over a random partition, possibly with one row changed. */
function randomRelation(r: Rng, n: number, values: string[]): string[][] {
  const all = tuples(n, values);
  const sample = (from: string[][]) => {
    const s = from.filter(() => r() < 0.4);
    return s.length || r() < 0.2 ? s : [from[int(r, 0, from.length - 1)]];
  };
  const kind = int(r, 0, 2);
  if (kind === 0) return sample(all);
  const labels = Array.from({ length: n }, () => int(r, 0, n - 1));
  const blocks = [...new Set(labels)].map((l) => labels.flatMap((x, i) => (x === l ? [i] : [])));
  let rows: string[][] = [Array.from({ length: n }, () => "")];
  for (const g of blocks) {
    const part = sample(tuples(g.length, values));
    rows = rows.flatMap((t) => part.map((p) => t.map((v, i) => (g.includes(i) ? p[g.indexOf(i)] : v))));
  }
  if (kind === 2 && rows.length > 1) rows = r() < 0.5 ? rows.slice(1) : [...rows, all[int(r, 0, all.length - 1)]];
  return rows;
}

test("property: the finest factorisation is the unique factoring partition that refines every other, by brute force over all partitions", () => {
  const r = rng(20261029);
  let nontrivial = 0, oneBlock = 0;
  for (let trial = 0; trial < 250; trial++) {
    const n = int(r, 1, 5);
    const values = ["0", "1", "2"].slice(0, int(r, 2, n <= 3 ? 3 : 2));
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const inputs = int(r, 0, n);
    const rows = randomRelation(r, n, values);
    const box = rowsBox(ids.slice(0, inputs), ids.slice(inputs), rows);
    const all = partitions(n);
    const factoring = all.filter((p) => factorsBrute(rows, p, n));
    const finest = factoring.filter((p) => factoring.every((q) => refines(p, q)));
    assert.equal(finest.length, 1, `trial ${trial}: exactly one factoring partition refines all the others`);
    const named = finest[0].map((b) => b.map((i) => ids[i]));
    assert.deepEqual(canonical(decided(box)), canonical(named), `trial ${trial}`);
    // A given partition splits iff the finest one refines it (IsFinest.factors_iff), as segment's count decides.
    for (const p of all) {
      const parts = p.map((b, j) => ({ id: `q${j}`, ports: b.map((i) => ids[i]) }));
      assert.equal(splitBehavior(box, parts).independent, refines(finest[0], p), `trial ${trial}, partition ${JSON.stringify(p)}`);
    }
    if (finest[0].length > 1 && finest[0].length < n) nontrivial++;
    if (finest[0].length === 1 && n > 1) oneBlock++;
  }
  assert.ok(nontrivial >= 30 && oneBlock >= 30, `${nontrivial} strictly between, ${oneBlock} one block: every outcome is exercised`);
});

test("known answers: parity is one block, two equalities two blocks even when interleaved, a full product and the empty relation single ports", () => {
  const parity = rowsBox(["a", "b"], ["c"], tuples(2, ["0", "1"]).map(([a, b]) => [a, b, a === b ? "0" : "1"]));
  assert.deepEqual(decided(parity), [["a", "b", "c"]]);
  // Ports in the order a, c, b, d: every port is coupled to all the others, yet {a, b} and {c, d} split.
  const twoEq = rowsBox(["a", "c"], ["b", "d"], tuples(4, ["0", "1"]).filter(([a, c, b, d]) => a === b && c === d));
  assert.deepEqual(decided(twoEq), [["a", "b"], ["c", "d"]]);
  for (const p of ["a", "b", "c", "d"]) {
    assert.equal(splitBehavior(twoEq, [{ id: "x", ports: [p] }, { id: "y", ports: ["a", "b", "c", "d"].filter((q) => q !== p) }]).independent, false, `'${p}' is coupled to the rest`);
  }
  assert.deepEqual(decided(rowsBox(["a"], ["b", "c"], tuples(3, ["0", "1", "2"]))), [["a"], ["b"], ["c"]]);
  assert.deepEqual(decided(rowsBox(["a"], ["b", "c"], [])), [["a"], ["b"], ["c"]], "the empty relation factors over every partition");
  assert.deepEqual(decided(rowsBox(["a"], ["b", "c"], [["0", "1", "0"]])), [["a"], ["b"], ["c"]], "one row is a product of points");
  assert.deepEqual(decided(rowsBox([], ["b", "c"], [["0", "0"], ["1", "1"], ["1", "1"]])), [["b", "c"]], "repeated rows count once");
  assert.deepEqual(decided(rowsBox(["a"], [], [["0"]])), [["a"]]);
  assert.deepEqual(decided(rowsBox([], [], [[]])), [], "no ports, no blocks");
});

test("relabelling values or reordering ports leaves the partition unchanged", () => {
  const r = rng(7);
  for (let trial = 0; trial < 60; trial++) {
    const n = int(r, 2, 5);
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const rows = randomRelation(r, n, ["0", "1"]);
    const inputs = int(r, 0, n);
    const base = canonical(decided(rowsBox(ids.slice(0, inputs), ids.slice(inputs), rows)));
    const renamed = rows.map((t) => t.map((v, i) => (i % 2 ? (v === "0" ? "z" : "a") : `v${v}`)));
    assert.deepEqual(canonical(decided(rowsBox(ids.slice(0, inputs), ids.slice(inputs), renamed))), base, `trial ${trial}: values renamed`);
    const order = shuffle(r, ids.map((_, i) => i));
    const permuted = rows.map((t) => order.map((i) => t[i]));
    const k = int(r, 0, n);
    const ports = order.map((i) => ids[i]);
    assert.deepEqual(canonical(decided(rowsBox(ports.slice(0, k), ports.slice(k), permuted))), base, `trial ${trial}: ports reordered`);
  }
});

test("past the cap the suggestion is undecided", () => {
  const box = rowsBox(["a", "b"], ["c", "d"], tuples(4, ["0", "1"]).filter(([a, , c]) => a === c));
  const capped = finestFactorisation(box, { maxSteps: 10 });
  assert.equal(capped.decided, false);
  assert.ok(!capped.decided && capped.reason === "step-cap" && capped.cap === 10);
  assert.match(capped.decided ? "" : capped.note, /more than 10 cell reads/);
  assert.deepEqual(decided(box), [["a", "c"], ["b"], ["d"]]);
  // The cap counts cell reads: adding port x reads every distinct row on the x + 1 ports so far,
  // once for the whole projection and twice per block so far. Here the blocks before each port
  // are none, {a}, {a} {b}, and {b} {a, c}; with 8 distinct rows that is 8 · (1 + 2·3 + 3·5 + 4·5).
  const reads = 8 * (1 + 2 * 3 + 3 * 5 + 4 * 5);
  assert.equal(finestFactorisation(box, { maxSteps: reads - 1 }).decided, false);
  assert.ok(finestFactorisation(box, { maxSteps: reads }).decided, "the cap bounds the cells read");
});

test("segment reports the suggested partition: the blocks the given parts cut, and the parts that split further", () => {
  const bearing = example("bearing-heat-behavior");
  const seg = (parts: string[][]) => {
    const r = segment(bearing, { box: "bearing", parts: parts.map((ports, i) => ({ id: `part-${i}`, ports })) });
    assert.ok(r.ok);
    return r;
  };
  const coupled = seg([["preload-in", "race"], ["friction"]]);
  assert.equal(coupled.behaviourallyIndependent, false);
  assert.deepEqual(coupled.behavior?.finest, {
    decided: true, parts: [["preload-in", "friction"], ["race"]], basis: ["IsFinest.addPort", "factors_split_iff", "IsFinest.factors_iff"],
    cut: [["preload-in", "friction"]], splitsFurther: [],
    note: "The parts cut the suggested blocks ['preload-in', 'friction']; a split holds iff each part is a union of suggested blocks. Segment into ['preload-in', 'friction'], ['race'], or unions of them, and each part keeps its projection.",
  });
  const finest = seg([["preload-in", "friction"], ["race"]]);
  assert.ok(finest.behaviourallyIndependent);
  assert.deepEqual([finest.behavior?.finest?.decided && finest.behavior.finest.cut, finest.behavior?.finest?.decided && finest.behavior.finest.splitsFurther], [[], []]);
  assert.match(finest.behavior?.finest?.decided ? finest.behavior.finest.note : "", /^The parts are the finest split/);
  // The shaft's suggestion is finer than a two-part split that holds.
  const shaft = segment(bearing, { box: "shaft", parts: [{ id: "load", ports: ["drive", "support"] }, { id: "thermal", ports: ["heat-in", "expansion"] }] });
  assert.ok(shaft.ok && shaft.behaviourallyIndependent && shaft.behavior?.finest?.decided);
  assert.deepEqual([shaft.behavior.finest.parts, shaft.behavior.finest.cut, shaft.behavior.finest.splitsFurther], [[["drive"], ["support"], ["heat-in", "expansion"]], [], ["load"]]);
  assert.match(shaft.behavior.finest.note, /'load' could split further/);
  // take_out runs segment, so it reports the same suggestion.
  const out = takeOut(bearing, { box: "bearing", ports: ["friction"], part: { id: "rolling" } });
  assert.ok(out.ok);
  assert.deepEqual(out.behavior?.finest?.decided && out.behavior.finest.parts, [["preload-in", "friction"], ["race"]]);
  const plain = segment(example("bearing-heat"), { box: "bearing", parts: [{ id: "a", ports: ["preload-in"] }, { id: "b", ports: ["race", "friction"] }] });
  assert.ok(plain.ok && !("behavior" in plain), "a box without behaviour gets no suggestion");
});

test("property: segment's split holds exactly when it cuts no suggested block", () => {
  const r = rng(99);
  for (let trial = 0; trial < 120; trial++) {
    const n = int(r, 2, 5);
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const rows = randomRelation(r, n, ["0", "1"]);
    const inputs = int(r, 0, n);
    const all = partitions(n).filter((p) => p.length >= 2);
    const p = all[int(r, 0, all.length - 1)];
    const res = segment(single(rowsBox(ids.slice(0, inputs), ids.slice(inputs), rows), ["0", "1"]),
      { box: "r", parts: p.map((b, j) => ({ id: `q${j}`, ports: b.map((i) => ids[i]) })) });
    assert.ok(res.ok, `trial ${trial}`);
    const s = res.behavior?.finest;
    assert.ok(s?.decided, `trial ${trial}`);
    assert.equal(res.behaviourallyIndependent, s.cut.length === 0, `trial ${trial}`);
    if (!res.behaviourallyIndependent) assert.ok(s.cut.every((b) => b.length >= 2), `trial ${trial}: a cut block has ports in two parts`);
  }
});

test("triz_behavior lists the composed boxes whose relation splits into several groups of ports", () => {
  const r = externalBehavior(example("bearing-heat-behavior"));
  assert.ok(r.ok && r.decided);
  // motor has one port, so it is not listed.
  assert.deepEqual(r.composed, ["motor", "shaft", "bearing"]);
  assert.deepEqual(r.factorisations?.map((f) => [f.box, f.decided && f.parts]), [
    ["shaft", [["drive"], ["support"], ["heat-in", "expansion"]]],
    ["bearing", [["preload-in", "friction"], ["race"]]],
  ]);
  for (const f of r.factorisations ?? []) {
    assert.ok(f.decided);
    assert.deepEqual(f.basis, ["IsFinest.addPort", "factors_split_iff", "IsFinest.factors_iff"]);
    assert.match(f.note, /triz_transform segment into these groups/);
  }
});

test("the triz_behavior hint is capped per box, in box order: a box past its cap is listed undecided", () => {
  const boxes = example("bearing-heat-behavior").boxes.filter((b) => b.behavior);
  const hints = factorisationsOf(boxes, { maxSteps: 40 });
  assert.deepEqual(hints.map((h) => [h.box, h.decided]), boxes.flatMap((b) => {
    const f = finestFactorisation(b, { maxSteps: 40 });
    return !f.decided ? [[b.id, false]] : f.parts.length > 1 ? [[b.id, true]] : [];
  }));
  assert.ok(hints.some((h) => !h.decided && h.reason === "step-cap"), "some box passes the small cap");
  assert.ok(hints.every((h) => h.decided || /more than 40 cell reads/.test(h.note)));
});
