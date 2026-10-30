import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cheapestCover } from "../src/act-graded.js";
import { weakestSpec } from "../src/act-behavior.js";
import { FunctionModel } from "../src/act.js";

test("finite cover agrees with exhaustive subsets on varied overlapping incidence matrices", () => {
  let seed = 131;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
  for (let trial = 0; trial < 250; trial++) {
    const n = random() % 7, pairs = random() % 5;
    const rows = Array.from({ length: n }, (_, row) => ({ row, cost: random() % 8, covers: Array.from({length: pairs}, (_, i) => i).filter(() => (random() & 8) !== 0) }));
    let best = Infinity;
    for (let mask = 0; mask < 2 ** n; mask++) {
      const chosen = rows.filter((_, i) => mask & (2 ** i));
      if (Array.from({length: pairs}, (_, i) => chosen.some(r => r.covers.includes(i))).every(Boolean)) best = Math.min(best, chosen.reduce((s, r) => s + r.cost, 0));
    }
    const got = cheapestCover(pairs, rows);
    if (best === Infinity) assert.equal(got.status, "uncoverable");
    else { assert.equal(got.status, "optimal"); if (got.status === "optimal") assert.equal(got.cost, best); }
  }
});

test("cap and overflow never assert an optimum", () => {
  assert.equal(cheapestCover(1, [{row: 1, cost: 1, covers: [0]}], 1).status, "undecided");
  assert.deepEqual(cheapestCover(2, [{row: 1, cost: Number.MAX_SAFE_INTEGER, covers: [0]}, {row: 2, cost: 1, covers: [1]}]).status, "undecided");
  assert.equal(cheapestCover(0, []).status, "optimal");
});

test("weakest spec prices the missing housing row, validates costs, and preserves the default", () => {
  const baseline = FunctionModel.parse(JSON.parse(fs.readFileSync(new URL("../examples/function-models/bearing-heat-behavior.json", import.meta.url), "utf8")));
  const concept = structuredClone(baseline);
  concept.boxes = concept.boxes.filter(b => b.id !== "bearing");
  concept.wires = concept.wires.filter(w => w.from.box !== "bearing" && w.to.box !== "bearing").concat({ id: "w-support", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful", verb: "support" });
  const housing = concept.boxes.find(b => b.id === "housing")!;
  delete housing.behavior;
  housing.producible = [{ in: {}, out: { bore: "unsupported" } }];
  const row = { in: {}, out: { bore: "supported" } };
  const before = weakestSpec(concept, baseline);
  assert.ok(before.ok && before.verdict === "impossible" && before.reason === "infeasible");
  assert.ok(!("cheapestExtension" in before));
  const result = weakestSpec(concept, baseline, { rowCosts: [{ row, cost: 7 }] });
  assert.ok(result.ok && "cheapestExtension" in result);
  assert.deepEqual(result.cheapestExtension, { status: "optimal", cost: 7, rows: [row], searched: 3 });
  const capped = weakestSpec(concept, baseline, { rowCosts: [{ row, cost: 7 }], maxCostSearch: 1 });
  assert.ok(capped.ok && "cheapestExtension" in capped);
  assert.deepEqual(capped.cheapestExtension, { status: "undecided", reason: "search-cap", searched: 1 });
  assert.equal(weakestSpec(concept, baseline, {rowCosts: []}).ok, false);
  assert.equal(weakestSpec(concept, baseline, {rowCosts: [{row, cost: 1}, {row, cost: 2}]}).ok, false);
});

test("deep capped cover search does not exhaust the JavaScript stack", () => {
  const rows = Array.from({length: 15_000}, (_, row) => ({row, cost: 1, covers: [0]}));
  const result = cheapestCover(1, rows, 12_000);
  assert.equal(result.status, "undecided");
  if (result.status === "undecided") assert.equal(result.reason, "search-cap");
});

test("a composed hierarchy is never treated as a free behavior hole", () => {
  const c = { id: "c", layer: "information" as const, dimension: "bit", values: ["0", "1"] };
  const port = (id: string) => ({ id, carrier: "c" });
  const model: FunctionModel = { domain: "software", carriers: [c], boxes: [
    { id: "h", name: "H", role: "tool", inputs: [port("x")], outputs: [port("y")], inner: {
      model: { domain: "software", carriers: [structuredClone(c)], boxes: [{ id: "a", name: "A", role: "tool", inputs: [port("i")], outputs: [port("o")], behavior: [{ in: {i: "0"}, out: {o: "0"} }] }], wires: [] },
      inputs: [{ outer: "x", inner: { box: "a", port: "i" } }], outputs: [{ outer: "y", inner: { box: "a", port: "o" } }],
    } },
    { id: "p", name: "P", role: "product", inputs: [port("d")] },
  ], wires: [{ id: "w", from: { box: "h", port: "y" }, to: { box: "p", port: "d" }, carrier: "c", polarity: "useful" }] };
  const baseline = structuredClone(model); delete baseline.boxes[0].inner;
  baseline.boxes[0].behavior = [{ in: {x: "0"}, out: {y: "0"} }];
  const result = weakestSpec(model, baseline);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some(i => i.code === "hierarchy-substitution"));
});

test("full relation exposes all extension candidates, and costs cannot omit unlisted rows", () => {
  const baseline = FunctionModel.parse(JSON.parse(fs.readFileSync(new URL("../examples/function-models/bearing-heat-behavior.json", import.meta.url), "utf8")));
  const concept = structuredClone(baseline);
  concept.boxes = concept.boxes.filter(b => b.id !== "bearing");
  concept.wires = concept.wires.filter(w => w.from.box !== "bearing" && w.to.box !== "bearing").concat({ id: "w-support", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful", verb: "support" });
  const values = Array.from({length: 52}, (_, i) => `fit${i}`);
  concept.carriers.push({ id: "fit", layer: "material", dimension: "bore fit", values });
  const housing = concept.boxes.find(b => b.id === "housing")!;
  delete housing.behavior;
  housing.inputs = [{ id: "fit", carrier: "fit" }];
  housing.producible = [{ in: { fit: values[0] }, out: { bore: "unsupported" } }];
  const first = weakestSpec(concept, baseline);
  assert.ok(first.ok && first.verdict === "impossible" && first.reason === "infeasible" && "extensionCandidates" in first && first.extensionCandidates);
  assert.equal(first.extensionCandidates.rowCount, 52);
  assert.equal(first.extensionCandidates.rows.length, 50);
  assert.equal(first.extensionCandidates.truncated, true);
  const full = weakestSpec(concept, baseline, {fullRelation: true});
  assert.ok(full.ok && "extensionCandidates" in full && full.extensionCandidates);
  assert.equal(full.extensionCandidates.rows.length, 52);
  assert.equal(full.extensionCandidates.truncated, false);
  assert.deepEqual(full.extensionCandidates.rows, values.map(fit => ({in: {fit}, out: {bore: "supported"}})));
  const costs = full.extensionCandidates.rows.map(row => ({row, cost: 1}));
  const missing = weakestSpec(concept, baseline, {rowCosts: costs.slice(0, 50)});
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.issues[0].hint, /full_relation.*extensionCandidates/);
  const priced = weakestSpec(concept, baseline, {rowCosts: costs, maxCostSearch: 100});
  assert.ok(priced.ok && "cheapestExtension" in priced);
  assert.deepEqual(priced.cheapestExtension, {status: "undecided", reason: "search-cap", searched: 100});
});

/** The bearing trimmed, its support taken over by the housing, whose behaviour is to specify. */
function housingConcept() {
  const baseline = FunctionModel.parse(JSON.parse(fs.readFileSync(new URL("../examples/function-models/bearing-heat-behavior.json", import.meta.url), "utf8")));
  const concept = structuredClone(baseline);
  concept.boxes = concept.boxes.filter(b => b.id !== "bearing");
  concept.wires = concept.wires.filter(w => w.from.box !== "bearing" && w.to.box !== "bearing").concat({ id: "w-support", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful", verb: "support" });
  const housing = concept.boxes.find(b => b.id === "housing")!;
  delete housing.behavior;
  housing.producible = [{ in: {}, out: { bore: "unsupported" } }];
  return { baseline, concept };
}
/** The housing feeds the shaft through a pad that never supports: no housing row gives the target. */
function padded() {
  const { baseline, concept } = housingConcept();
  concept.boxes.push({ id: "pad", name: "Pad", role: "mediator", inputs: [{ id: "in", carrier: "radial-load" }], outputs: [{ id: "out", carrier: "radial-load" }],
    behavior: ["supported", "unsupported"].map(v => ({ in: { in: v }, out: { out: "unsupported" } })) });
  concept.wires = concept.wires.filter(w => w.id !== "w-support").concat(
    { id: "w-bore", from: { box: "housing", port: "bore" }, to: { box: "pad", port: "in" }, carrier: "radial-load", polarity: "useful" },
    { id: "w-support", from: { box: "pad", port: "out" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful" });
  return { baseline, concept };
}
const supported = { in: {}, out: { bore: "supported" } };
const refusedCosts = (r: ReturnType<typeof weakestSpec>, path: string, message?: RegExp) => {
  assert.equal(r.ok, false, JSON.stringify(r));
  if (r.ok) return;
  assert.deepEqual(r.issues.map(i => [i.code, i.path]), [["invalid-row-costs", path]]);
  if (message) assert.match(r.issues[0].message, message);
};

test("a residual that does not cover the target answers row costs with not-applicable, checking their shape only", () => {
  const { baseline, concept } = padded();
  const plain = weakestSpec(concept, baseline);
  assert.ok(plain.ok && plain.verdict === "impossible" && plain.reason === "not-covered" && !("extensionCandidates" in plain && plain.extensionCandidates));
  // No row is relevant here, so a well-formed cost for any row of the box is answered, not refused.
  for (const row of [supported, { in: {}, out: { bore: "unsupported" } }]) {
    const r = weakestSpec(concept, baseline, { rowCosts: [{ row, cost: 7 }] });
    assert.ok(r.ok && r.verdict === "impossible" && r.reason === "not-covered", JSON.stringify(r));
    assert.ok("cheapestExtension" in r);
    assert.deepEqual(r.cheapestExtension, { status: "not-applicable", reason: "target-not-covered-by-residual" });
  }
  assert.ok(weakestSpec(concept, baseline, { rowCosts: [] }).ok);
  // The shape is still checked: an unknown port, an undeclared value, a repeat, a bad cost or cap.
  refusedCosts(weakestSpec(concept, baseline, { rowCosts: [{ row: { in: {}, out: { hole: "supported" } }, cost: 1 }] }), "$.row_costs[0]");
  refusedCosts(weakestSpec(concept, baseline, { rowCosts: [{ row: { in: {}, out: { bore: "loose" } }, cost: 1 }] }), "$.row_costs[0]");
  refusedCosts(weakestSpec(concept, baseline, { rowCosts: [{ row: supported, cost: 1 }, { row: supported, cost: 2 }] }), "$.row_costs[1]");
  refusedCosts(weakestSpec(concept, baseline, { rowCosts: [{ row: supported, cost: -1 }] }), "$.row_costs[0]");
  refusedCosts(weakestSpec(concept, baseline, { rowCosts: [{ row: supported, cost: 1 }], maxCostSearch: 0 }), "$.max_cost_search");
  // Where the residual covers, a row outside extensionCandidates is still refused.
  const { baseline: b, concept: c } = housingConcept();
  refusedCosts(weakestSpec(c, b, { rowCosts: [{ row: supported, cost: 1 }, { row: { in: {}, out: { bore: "unsupported" } }, cost: 1 }] }), "$.row_costs[1]", /extensionCandidates/);
});

test("row costs are refused, never dropped, wherever no one-box residual is computed", () => {
  const costs = { rowCosts: [{ row: supported, cost: 7 }] };
  // Missing baseline behaviour: undecided without costs.
  const { baseline, concept } = housingConcept();
  const bare = structuredClone(baseline); delete bare.boxes.find(b => b.id === "motor")!.behavior;
  const missing = weakestSpec(concept, bare);
  assert.ok(missing.ok && missing.verdict === "undecided" && missing.reason === "missing-behavior");
  refusedCosts(weakestSpec(concept, bare, costs), "$.row_costs", /missing-behavior/);
  // Three boxes to specify: undecided without costs.
  const three = padded().concept;
  for (const id of ["pad", "motor"]) delete three.boxes.find(b => b.id === id)!.behavior;
  const several = weakestSpec(three, baseline);
  assert.ok(several.ok && several.verdict === "undecided" && several.reason === "several-holes");
  refusedCosts(weakestSpec(three, baseline, costs), "$.row_costs", /several-holes/);
  // Two boxes to specify: the pair path, which already refused them.
  const two = structuredClone(concept); delete two.boxes.find(b => b.id === "motor")!.behavior;
  refusedCosts(weakestSpec(two, baseline, costs), "$.row_costs", /single unknown box/);
  // A lost deliverable: impossible without costs.
  const cut = structuredClone(concept); cut.wires = cut.wires.filter(w => w.id !== "w-support");
  const lost = weakestSpec(cut, baseline);
  assert.ok(lost.ok && lost.verdict === "impossible" && lost.reason === "lost-deliverables");
  refusedCosts(weakestSpec(cut, baseline, costs), "$.row_costs", /lost-deliverables/);
});
