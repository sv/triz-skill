/**
 * The weakest box specification (residual in Rel) and the weakness ranking. The spec is checked
 * against every relation the unknown box could declare (brute force over subsets): a relation
 * gives the target iff it is contained in the spec and the spec covers the target. The empty
 * relation stays inside every target and is never read as preserving; two unknown boxes, a lost
 * deliverable, and the cap fail closed. The ranking orders concepts by inclusion of the
 * situations they admit and reports incomparable pairs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel } from "../src/act.js";
import { fromHypergraph, toHypergraph } from "../src/act-export.js";
import { externalBehavior, trimPreservesBehavior, weakestSpec, weakestTrimSpec, weaknessRanking } from "../src/act-behavior.js";
import { segment } from "../src/act-rewrite.js";
import { toolSpecs } from "../src/tools.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const bearing = () => example("bearing-heat-behavior");
const box = (m: FunctionModel, id: string) => m.boxes.find((b) => b.id === id)!;
const errors = (r: { ok: boolean; errors?: string[] }) => (r.ok ? "" : r.errors!.join("; "));
type Row = { in: Record<string, string>; out: Record<string, string> };
const subsets = <T>(xs: T[]) => xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);
const same = (a: Row, b: Row) => JSON.stringify(a) === JSON.stringify(b);

/** The bearing with the housing as the box to specify: its behaviour is removed. */
function openHousing(edit?: (m: FunctionModel) => void) {
  const m = bearing();
  delete box(m, "housing").behavior;
  edit?.(m);
  return m;
}

/**
 * Brute force over every non-empty relation R the box could declare, with `gives(R)` deciding
 * C[R] = T on a code path independent of the spec. Checks what theory/ proves: C[R] = T implies
 * R ⊆ W (le_residual_iff), and some R gives T iff W covers T, so iff the verdict is `spec`
 * (covers_iff_exists_eq). The empty relation cannot be declared; its composite is empty
 * (map_empty), so it never gives a non-empty target.
 */
function bruteForce(r: ReturnType<typeof weakestSpec>, candidates: Row[], gives: (R: Row[]) => boolean) {
  assert.ok(r.ok && (r.verdict === "spec" || r.verdict === "impossible") && r.reason !== "lost-deliverables");
  assert.equal(r.candidateRows, candidates.length);
  const achieving = subsets(candidates).filter((R) => R.length && gives(R));
  for (const R of achieving) assert.ok(R.every((row) => r.spec.some((w) => same(w, row))), `C[R] = T but R ⊄ W: ${JSON.stringify(R)}`);
  assert.equal(achieving.length > 0, r.verdict === "spec");
  if (r.verdict === "spec") assert.ok(achieving.some((R) => R.length === r.specRows), "W itself gives the target");
  return achieving;
}
/** The decided trim says whether declaring R for the box gives the untrimmed model's relation. */
const byTrim = (model: FunctionModel, trim: string[], hole: string, absorb?: Record<string, { box: string; port: string }>) => (R: Row[]) => {
  const m = structuredClone(model);
  box(m, hole).behavior = R;
  const v = trimPreservesBehavior(m, { trim, absorb });
  assert.ok(v.ok && v.verdict !== "undecided");
  return v.verdict === "preserved";
};

test("the bearing's absorber spec: the housing must support the shaft, and that is all it must do", () => {
  const r = weakestTrimSpec(openHousing(), { trim: ["bearing"] });
  assert.ok(r.ok && r.verdict === "spec");
  assert.equal(r.preserves, true);
  assert.deepEqual(r.chosen, [{ wire: "w-support", box: "housing", port: "bore", rule: "C", defaulted: true }]);
  assert.equal(r.box, "housing");
  assert.deepEqual(r.spec, [{ in: {}, out: { bore: "supported" } }]);
  assert.deepEqual([r.specRows, r.candidateRows, r.unusedRows], [1, 2, 0]);
  assert.deepEqual(r.excluded, [{ row: { in: {}, out: { bore: "unsupported" } }, input: [], delivers: ["rated", "unsupported"], target: [["rated", "supported"]] }]);
  assert.deepEqual(r.basis, ["le_residual_iff", "covers_iff_exists_eq"]);
  assert.match(r.note, /weakest specification for 'housing' \(residual in Rel\)/);
  assert.doesNotMatch(JSON.stringify(r), /abduct/i);
  const achieving = bruteForce(r, [{ in: {}, out: { bore: "supported" } }, { in: {}, out: { bore: "unsupported" } }], byTrim(openHousing(), ["bearing"], "housing"));
  assert.deepEqual(achieving, [r.spec]);

  // The same question as a comparison: the trimmed concept against the baseline (compare_to).
  const trimmed = trimPreservesBehavior(bearing(), { trim: ["bearing"] });
  assert.ok(trimmed.ok);
  const concept = structuredClone(openHousing());
  concept.boxes = concept.boxes.filter((b) => b.id !== "bearing");
  concept.wires = concept.wires.filter((w) => w.from.box !== "bearing" && w.to.box !== "bearing")
    .concat({ id: "w-support", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful", verb: "support" });
  const c = weakestSpec(concept, bearing());
  assert.ok(c.ok && c.verdict === "spec");
  assert.deepEqual(c.spec, r.spec);
});

test("the weakest spec commits to nothing the target does not need: a housing that reads its fit may ignore it", () => {
  const withFit = () => openHousing((m) => {
    m.carriers.push({ id: "fit", layer: "material", dimension: "bore fit", values: ["press", "loose"] });
    box(m, "housing").inputs = [{ id: "fit", carrier: "fit" }];
  });
  const r = weakestTrimSpec(withFit(), { trim: ["bearing"] });
  assert.ok(r.ok && r.verdict === "spec");
  assert.deepEqual(r.spec, [{ in: { fit: "press" }, out: { bore: "supported" } }, { in: { fit: "loose" }, out: { bore: "supported" } }]);
  assert.deepEqual(r.inputs, [{ box: "housing", port: "fit", carrier: "fit" }]);
  assert.deepEqual(r.blockedInputs, []);
  const rows = ["press", "loose"].flatMap((fit) => ["supported", "unsupported"].map((bore) => ({ in: { fit }, out: { bore } })));
  bruteForce(r, rows, byTrim(withFit(), ["bearing"], "housing"));
});

test("rows no steady state presents stay in the spec: the segmented shaft's thermal part, left unspecified", () => {
  const seg = segment(bearing(), { box: "shaft", parts: [{ id: "journal", ports: ["drive", "support"] }, { id: "body", ports: ["heat-in", "expansion"] }] });
  assert.ok(seg.ok);
  // Segment projects the shaft's relation onto its parts; remove the body's to leave it to specify.
  delete box(seg.model, "body").behavior;
  const unmapped = weakestSpec(seg.model, bearing());
  assert.ok(unmapped.ok && unmapped.verdict === "impossible" && unmapped.reason === "lost-deliverables");
  assert.deepEqual(unmapped.lostDeliverables.map((d) => `${d.box}.${d.port}`), ["shaft.drive", "shaft.support"]);

  const r = weakestSpec(seg.model, bearing(), { boxMap: seg.boxMap });
  assert.ok(r.ok && r.verdict === "spec");
  assert.equal(r.box, "body");
  assert.deepEqual([r.specRows, r.candidateRows, r.unusedRows], [4, 4, 2]);
  assert.match(r.note, /2 row\(s\) of the spec occur in no steady state/);
  // Both models have no boundary inputs, so comparing their single relation rows decides C[R] = T.
  const target = externalBehavior(bearing());
  assert.ok(target.ok && target.decided);
  const rows = ["low", "high"].flatMap((heat) => ["nominal", "high"].map((expansion) => ({ in: { "heat-in": heat }, out: { expansion } })));
  const achieving = bruteForce(r, rows, (R) => {
    const m = structuredClone(seg.model);
    box(m, "body").behavior = R;
    const e = externalBehavior(m);
    assert.ok(e.ok && e.decided);
    return JSON.stringify(e.relation[0].outputs) === JSON.stringify(target.relation[0].outputs);
  });
  // The spec is the weakest relation that gives the target, not the only one: dropping unused rows also does.
  assert.ok(achieving.some((R) => R.length < r.specRows));
  assert.match(errors(weakestSpec(seg.model, bearing(), { boxMap: { ghost: "shaft" } })), /box_map: 'ghost' is not a box of the concept model/);
});

/**
 * A source delivers (a, a) or (b, b) to the product's two ports. The trim re-attaches the first
 * function to the box to specify and the second to a box that always gives a.
 */
function correlated(): FunctionModel {
  const source = (id: string, rows: Row[] | undefined) => ({ id, name: id, role: "mediator" as const, outputs: [{ id: "o", carrier: "c" }], ...(rows ? { behavior: rows } : {}) });
  return {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "symbol", values: ["a", "b"] }],
    boxes: [
      { id: "s", name: "Source", role: "tool", outputs: [{ id: "p", carrier: "c" }, { id: "q", carrier: "c" }],
        behavior: [{ in: {}, out: { p: "a", q: "a" } }, { in: {}, out: { p: "b", q: "b" } }] },
      source("m", undefined), source("f", [{ in: {}, out: { o: "a" } }]),
      { id: "user", name: "User", role: "product", inputs: [{ id: "p", carrier: "c" }, { id: "q", carrier: "c" }] },
    ],
    wires: [
      { id: "w-p", from: { box: "s", port: "p" }, to: { box: "user", port: "p" }, carrier: "c", polarity: "useful" },
      { id: "w-q", from: { box: "s", port: "q" }, to: { box: "user", port: "q" }, carrier: "c", polarity: "useful" },
    ],
  };
}
const correlatedAbsorb = { "w-p": { box: "m", port: "o" }, "w-q": { box: "f", port: "o" } };

test("impossible: the spec stays inside the target but cannot cover it, so no behaviour of the box gives it", () => {
  const r = weakestTrimSpec(correlated(), { trim: ["s"], absorb: correlatedAbsorb });
  assert.ok(r.ok && r.verdict === "impossible" && r.reason === "not-covered");
  assert.deepEqual(bruteForce(r, [{ in: {}, out: { o: "a" } }, { in: {}, out: { o: "b" } }], byTrim(correlated(), ["s"], "m", correlatedAbsorb)), []);
  assert.equal(r.preserves, false);
  assert.deepEqual(r.spec, [{ in: {}, out: { o: "a" } }]);
  assert.deepEqual(r.uncovered, { input: [], target: [["a", "a"], ["b", "b"]], delivered: [["a", "a"]], missing: [["b", "b"]] });
  assert.deepEqual(r.basis, ["not_covers_iff"]);
  assert.match(r.note, /No behaviour of 'm' gives the target relation/);
});

test("the empty-spec trap: when every row breaks the target, the empty relation stays inside it, and the verdict is impossible", () => {
  // The bearing supports the shaft only when lubricated; the housing cannot see the lubrication.
  const lubricated = () => openHousing((m) => {
    m.carriers.push({ id: "lube", layer: "material", dimension: "film", values: ["ok", "dry"] });
    const b = box(m, "bearing");
    b.inputs!.push({ id: "lube", carrier: "lube" });
    b.behavior = ["nominal", "high"].flatMap((p) => [
      { in: { "preload-in": p, lube: "ok" }, out: { race: "supported", friction: p === "high" ? "high" : "low" } },
      { in: { "preload-in": p, lube: "dry" }, out: { race: "unsupported", friction: "high" } },
    ]);
  });
  const before = externalBehavior(lubricated());
  assert.ok(before.ok && before.decided);
  assert.deepEqual(before.relation.map((row) => [row.input, row.outputs]), [[["ok"], [["rated", "supported"]]], [["dry"], [["rated", "unsupported"]]]]);

  const r = weakestTrimSpec(lubricated(), { trim: ["bearing"] });
  assert.ok(r.ok && r.verdict === "impossible" && r.reason === "not-covered");
  assert.notEqual(r.verdict as string, "spec");
  assert.equal(r.preserves, false);
  // Safety alone holds for the empty spec: no row is kept, so its composite is empty and inside the target.
  assert.deepEqual([r.spec, r.specRows, r.excluded.length], [[], 0, 2]);
  assert.deepEqual(r.uncovered, { input: [{ box: "bearing", port: "lube", value: "ok" }], target: [["rated", "supported"]], delivered: [], missing: [["rated", "supported"]] });
  assert.equal(r.uncoveredInputs, 2);
  assert.deepEqual(r.basis, ["not_covers_iff", "map_empty"]);
  // Independently: no non-empty relation the housing could declare gives the target.
  assert.deepEqual(bruteForce(r, [{ in: {}, out: { bore: "supported" } }, { in: {}, out: { bore: "unsupported" } }], byTrim(lubricated(), ["bearing"], "housing")), []);
  assert.match(r.note, /The spec is empty/);
  assert.match(r.note, /never read as preserving/);
});

test("fail closed: two unknown boxes, a lost deliverable, no box to specify, an empty target, and bare carriers", () => {
  const two = correlated();
  delete box(two, "f").behavior;
  const r = weakestTrimSpec(two, { trim: ["s"], absorb: correlatedAbsorb });
  assert.ok(r.ok && r.verdict === "undecided" && r.reason === "several-holes");
  assert.deepEqual(r.missingBehavior, ["m", "f"]);
  assert.match(r.note, /decided for one unknown box only/);
  // A box the baseline needs is missing behaviour in the baseline: that is reported first.
  const motor = weakestTrimSpec(openHousing((m) => { delete box(m, "motor").behavior; }), { trim: ["bearing"] });
  assert.ok(motor.ok && motor.verdict === "undecided" && motor.reason === "missing-behavior");
  assert.deepEqual([motor.missingBehavior, motor.missingIn], [["motor"], "baseline"]);

  const lost = weakestTrimSpec(bearing(), { trim: ["shaft"] });
  assert.ok(lost.ok && lost.verdict === "impossible" && lost.reason === "lost-deliverables");
  assert.deepEqual(lost.lostDeliverables.map((d) => `${d.box}.${d.port}`), ["shaft.drive", "shaft.support"]);

  assert.match(errors(weakestTrimSpec(bearing(), { trim: ["bearing"] })), /there is no box to specify/);

  const noBaseline = bearing();
  delete box(noBaseline, "shaft").behavior;
  const u = weakestSpec(openHousing(), noBaseline);
  assert.ok(u.ok && u.verdict === "undecided" && u.reason === "missing-behavior");
  assert.deepEqual(u.missingBehavior, ["shaft"]);

  // A baseline with no steady state anywhere: every relation stays inside the empty target.
  const negation = correlated();
  negation.boxes.push({ id: "loop", name: "Loop", role: "mediator", inputs: [{ id: "x", carrier: "c" }], outputs: [{ id: "y", carrier: "c" }],
    behavior: [{ in: { x: "a" }, out: { y: "b" } }, { in: { x: "b" }, out: { y: "a" } }] });
  box(negation, "s").inputs = [{ id: "x", carrier: "c" }];
  box(negation, "s").behavior = ["a", "b"].map((x) => ({ in: { x }, out: { p: x, q: x } }));
  negation.wires.push({ id: "w-x", from: { box: "loop", port: "y" }, to: { box: "loop", port: "x" }, carrier: "c", polarity: "useful" },
    { id: "w-s", from: { box: "loop", port: "y" }, to: { box: "s", port: "x" }, carrier: "c", polarity: "useful" });
  const empty = weakestTrimSpec(negation, { trim: ["s"], absorb: correlatedAbsorb });
  assert.ok(empty.ok && empty.verdict === "undecided" && empty.reason === "no-steady-state");

  const bare = openHousing((m) => {
    m.carriers.push({ id: "fit", layer: "material", dimension: "bore fit" });
    box(m, "housing").inputs = [{ id: "fit", carrier: "fit" }];
  });
  assert.match(errors(weakestTrimSpec(bare, { trim: ["bearing"] })), /box 'housing' is the box to specify, but carrier 'fit' of port 'fit' declares no values/);
});

const SUPPORTED: Row = { in: {}, out: { bore: "supported" } };
const UNSUPPORTED: Row = { in: {}, out: { bore: "unsupported" } };
/** The housing reads its fit; `producible` says which (fit, bore) rows it can physically produce. */
const fitRow = (fit: string, bore: string): Row => ({ in: { fit }, out: { bore } });
const fitted = (producible?: Row[]) => openHousing((m) => {
  m.carriers.push({ id: "fit", layer: "material", dimension: "bore fit", values: ["press", "loose"] });
  box(m, "housing").inputs = [{ id: "fit", carrier: "fit" }];
  if (producible) box(m, "housing").producible = producible;
});
/** The decided trim with R declared for the housing, its producible rows removed (a box declares one or the other). */
const housingGives = (model: FunctionModel) => (R: Row[]) => {
  const m = structuredClone(model);
  delete box(m, "housing").producible;
  return byTrim(m, ["bearing"], "housing")(R);
};

/**
 * Brute force within the producible rows F: a relation R ⊆ F gives the target iff it is contained
 * in the spec W ∩ F and the verdict is `spec` (covers_feasible_iff). When the verdict is
 * `infeasible`, every relation over all candidate rows that gives the target holds, for each
 * entry of requiredInfeasible, one of its rows (required_row_of_eq), none of them producible.
 */
function bruteForceWithin(r: ReturnType<typeof weakestSpec>, F: Row[], all: Row[], gives: (R: Row[]) => boolean) {
  assert.ok(r.ok && (r.verdict === "spec" || r.verdict === "impossible") && r.reason !== "lost-deliverables");
  const achieving = subsets(F).filter((R) => R.length && gives(R));
  for (const R of achieving) assert.ok(R.every((row) => r.spec.some((w) => same(w, row))), `C[R] = T but R ⊄ W ∩ F: ${JSON.stringify(R)}`);
  assert.equal(achieving.length > 0, r.verdict === "spec");
  if (r.verdict === "impossible" && r.reason === "infeasible") {
    for (const R of subsets(all).filter((R) => R.length && gives(R))) {
      for (const need of r.requiredInfeasible) assert.ok(need.rows.some((w) => R.some((row) => same(w, row))), `C[R] = T without a required row: ${JSON.stringify(R)}`);
    }
    for (const need of r.requiredInfeasible) for (const w of need.rows) assert.ok(!F.some((row) => same(w, row)), "a required row is producible");
  }
  return achieving;
}

test("producible rows: the spec is the residual cut down to them, and a target they cannot reach is the residual contradiction", () => {
  // Everything producible: the same spec as without producible.
  const both = weakestTrimSpec(openHousing((m) => { box(m, "housing").producible = [SUPPORTED, UNSUPPORTED]; }), { trim: ["bearing"] });
  assert.ok(both.ok && both.verdict === "spec");
  assert.deepEqual(both.spec, [SUPPORTED]);
  assert.deepEqual(both.producible, { declared: 2, residualRows: 1, infeasibleRows: 0, infeasible: [] });
  assert.deepEqual(both.basis, ["le_residual_iff", "covers_feasible_iff"]);
  assert.match(both.note, /weakest producible specification for 'housing'/);

  // The housing can only leave the shaft unsupported: the residual covers the target, its producible part is empty.
  const loose = openHousing((m) => { box(m, "housing").producible = [UNSUPPORTED]; });
  const r = weakestTrimSpec(loose, { trim: ["bearing"] });
  assert.ok(r.ok && r.verdict === "impossible" && r.reason === "infeasible");
  assert.equal(r.preserves, false);
  assert.deepEqual([r.spec, r.specRows], [[], 0]);
  assert.deepEqual(r.producible, { declared: 1, residualRows: 1, infeasibleRows: 1, infeasible: [SUPPORTED] });
  assert.deepEqual(r.requiredInfeasible, [{ input: [], outputs: ["rated", "supported"], rows: [SUPPORTED] }]);
  assert.equal(r.requiredInfeasibleRows, 1);
  assert.deepEqual(r.uncovered, { input: [], target: [["rated", "supported"]], delivered: [], missing: [["rated", "supported"]] });
  assert.deepEqual(r.basis, ["not_covers_feasible_iff", "required_row_of_eq", "map_empty"]);
  assert.match(r.note, /residual contradiction/);
  // `excluded` keeps its meaning: rows whose composite leaves the target, producible or not.
  assert.deepEqual(r.excluded.map((x) => x.row), [UNSUPPORTED]);
  bruteForceWithin(r, [UNSUPPORTED], [SUPPORTED, UNSUPPORTED], housingGives(loose));
});

test("producible rows: partly producible, the required row is named per input; all producible needed rows give the spec", () => {
  const all = ["press", "loose"].flatMap((fit) => ["supported", "unsupported"].map((bore) => fitRow(fit, bore)));
  // A loose fit cannot be made to support the shaft.
  const F = [fitRow("press", "supported"), fitRow("loose", "unsupported")];
  const r = weakestTrimSpec(fitted(F), { trim: ["bearing"] });
  assert.ok(r.ok && r.verdict === "impossible" && r.reason === "infeasible");
  assert.deepEqual(r.spec, [fitRow("press", "supported")]);
  assert.deepEqual(r.producible, { declared: 2, residualRows: 2, infeasibleRows: 1, infeasible: [fitRow("loose", "supported")] });
  assert.deepEqual(r.requiredInfeasible, [{ input: [{ box: "housing", port: "fit", value: "loose" }], outputs: ["rated", "supported"], rows: [fitRow("loose", "supported")] }]);
  assert.equal(r.uncoveredInputs, 1);
  bruteForceWithin(r, F, all, housingGives(fitted(F)));

  // Both supporting rows producible, and a useless one too: the spec, and nothing infeasible.
  const G = [fitRow("press", "supported"), fitRow("loose", "supported"), fitRow("loose", "unsupported")];
  const ok = weakestTrimSpec(fitted(G), { trim: ["bearing"] });
  assert.ok(ok.ok && ok.verdict === "spec");
  assert.deepEqual(ok.spec, [fitRow("press", "supported"), fitRow("loose", "supported")]);
  assert.deepEqual([ok.producible?.infeasibleRows, ok.producible?.residualRows], [0, 2]);
  assert.equal(bruteForceWithin(ok, G, all, housingGives(fitted(G))).length, 1);
  // The same verdict as without producible, since F contains the residual.
  const plain = weakestTrimSpec(fitted(), { trim: ["bearing"] });
  assert.ok(plain.ok && plain.verdict === "spec");
  assert.deepEqual(plain.spec, ok.spec);
  assert.equal("producible" in plain, false);
});

test("producible rows: rows the target does not need may be unproducible; a residual that cannot cover stays not-covered", () => {
  // The segmented shaft's body: its residual has 4 rows, and either of two steady states through the heat loop gives the target.
  const seg = segment(bearing(), { box: "shaft", parts: [{ id: "journal", ports: ["drive", "support"] }, { id: "body", ports: ["heat-in", "expansion"] }] });
  assert.ok(seg.ok);
  delete box(seg.model, "body").behavior;
  const body = (heat: string, expansion: string): Row => ({ in: { "heat-in": heat }, out: { expansion } });
  const all = [body("low", "nominal"), body("high", "nominal"), body("low", "high"), body("high", "high")];
  const withProducible = (F: Row[]) => { const m = structuredClone(seg.model); box(m, "body").producible = F; return m; };
  const target = externalBehavior(bearing());
  assert.ok(target.ok && target.decided);
  const gives = (R: Row[]) => {
    const m = structuredClone(seg.model);
    box(m, "body").behavior = R;
    const e = externalBehavior(m);
    assert.ok(e.ok && e.decided);
    return JSON.stringify(e.relation[0].outputs) === JSON.stringify(target.relation[0].outputs);
  };
  // Only the cool steady state is producible: the spec is that row; three residual rows are left out.
  const cool = weakestSpec(withProducible([all[0]]), bearing(), { boxMap: seg.boxMap });
  assert.ok(cool.ok && cool.verdict === "spec");
  assert.deepEqual(cool.spec, [all[0]]);
  assert.deepEqual([cool.specRows, cool.producible?.residualRows, cool.producible?.infeasibleRows], [1, 4, 3]);
  assert.match(cool.note, /3 row\(s\) of the residual are not producible/);
  bruteForceWithin(cool, [all[0]], all, gives);
  // Only a row no steady state uses is producible: the target needs one of the two loop rows, and both are listed.
  const neither = weakestSpec(withProducible([all[1]]), bearing(), { boxMap: seg.boxMap });
  assert.ok(neither.ok && neither.verdict === "impossible" && neither.reason === "infeasible");
  assert.equal(neither.requiredInfeasible.length, 1);
  assert.deepEqual(neither.requiredInfeasible[0].rows, [all[0], all[3]]);
  assert.equal(neither.requiredInfeasibleRows, 2);
  assert.deepEqual(neither.basis, ["not_covers_feasible_iff", "required_row_of_eq"]);
  bruteForceWithin(neither, [all[1]], all, gives);

  // A residual that cannot cover the target: not-covered whatever is producible, with the residual's witness.
  const c = correlated();
  box(c, "m").producible = [{ in: {}, out: { o: "b" } }];
  const nc = weakestTrimSpec(c, { trim: ["s"], absorb: correlatedAbsorb });
  assert.ok(nc.ok && nc.verdict === "impossible" && nc.reason === "not-covered");
  assert.deepEqual(nc.uncovered, { input: [], target: [["a", "a"], ["b", "b"]], delivered: [["a", "a"]], missing: [["b", "b"]] });
  assert.deepEqual(nc.producible, { declared: 1, residualRows: 1, infeasibleRows: 1, infeasible: [{ in: {}, out: { o: "a" } }] });
  assert.deepEqual(nc.basis, ["not_covers_iff"]);
  assert.match(nc.note, /contained in the residual \(before producible\)/);
});

test("producible rows are typed like behaviour rows, exclude behaviour, survive export, and block port changes", async () => {
  const typing = (edit: (m: FunctionModel) => void) => { const m = fitted([fitRow("press", "supported")]); edit(m); return checkModel(m).errors.join("; "); };
  assert.equal(typing(() => {}), "");
  assert.match(typing((m) => { box(m, "housing").producible![0].out.bore = "wobbly"; }), /box 'housing' producible row 0: value 'wobbly' of port 'bore' is not declared by carrier 'radial-load'/);
  assert.match(typing((m) => { box(m, "housing").producible![0].in = {}; }), /box 'housing' producible row 0: input port 'fit' has no value/);
  assert.match(typing((m) => { box(m, "housing").behavior = [fitRow("press", "supported")]; }), /box 'housing' declares producible with behavior/);
  const m = fitted([fitRow("press", "supported")]);
  const back = fromHypergraph(toHypergraph(m));
  assert.ok(back.ok);
  assert.deepEqual(box(back.model, "housing").producible, [fitRow("press", "supported")]);
  // A reverse that would add a port to the housing is refused with its reason, as for behaviour.
  const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
  const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);
  // After the trim, the housing performs w-support; reversing it would give the housing an input port.
  const trimmed = await call("triz_transform", { model: m, transformation: { op: "trim", trim: ["bearing"] } });
  assert.ok(trimmed.ok);
  const rev = await call("triz_transform", { model: trimmed.model, transformation: { op: "reverse", wire: "w-support", ports: { from: "push", to: "pushed" } } });
  assert.equal(rev.ok, false);
  assert.match(rev.errors.join(), /box 'housing' declares producible: a new port needs a value in every row/);
  // The tool passes it through: the concept's hole declares its producible rows on the box.
  const viaTool = await call("triz_behavior", { model: openHousing((x) => { box(x, "housing").producible = [UNSUPPORTED]; }), trim: ["bearing"], weakest_spec: true });
  assert.deepEqual([viaTool.verdict, viaTool.reason, viaTool.requiredInfeasibleRows], ["impossible", "infeasible", 1]);
});

test("the spec's cap: candidate rows are checked before the search, and the search is bounded (undecided, state-cap)", () => {
  const wide = openHousing((m) => {
    m.carriers.push({ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] });
    box(m, "housing").inputs = Array.from({ length: 17 }, (_, i) => ({ id: `i${i}`, carrier: "bit" }));
  });
  const rows = weakestTrimSpec(wide, { trim: ["bearing"] });
  assert.ok(rows.ok && rows.verdict === "undecided" && rows.reason === "state-cap");
  assert.match(rows.errors.join(), /box 'housing' has 262144 candidate rows; the cap is 100000/);
  const search = weakestTrimSpec(openHousing(), { trim: ["bearing"], maxStates: 3 });
  assert.ok(search.ok && search.verdict === "undecided" && search.reason === "state-cap");
  assert.match(search.errors.join(), /^baseline: the steady-state search passed 3 states/);
  assert.equal(weakestTrimSpec(openHousing(), { trim: ["bearing"], maxStates: 8 }).ok, true);
  // A failed trim is not a cap: it stays ok:false.
  assert.match(errors(weakestTrimSpec(openHousing(), { trim: ["ghost"] })), /ghost/);
});

/**
 * One support concept: a box `support` reading the lubrication and the temperature (the
 * situations) and supporting the shaft where `ok` says so. Every concept uses the same box and port
 * ids, so they read the same situations.
 */
function concept(name: string, ok: (lube: string, temp: string) => boolean | "none"): FunctionModel {
  const rows = ["oiled", "dry"].flatMap((lube) => ["normal", "hot"].flatMap((temp) => {
    const v = ok(lube, temp);
    return v === "none" ? [] : [{ in: { lube, temp }, out: { race: v ? "supported" : "unsupported" } }];
  }));
  return {
    domain: "physical",
    carriers: [
      { id: "torque", layer: "energy", dimension: "N·m", values: ["rated"] },
      { id: "radial-load", layer: "energy", dimension: "N radial support", values: ["supported", "unsupported"] },
      { id: "lube", layer: "material", dimension: "lubricant film", values: ["oiled", "dry"] },
      { id: "temp", layer: "energy", dimension: "K ambient", values: ["normal", "hot"] },
    ],
    boxes: [
      { id: "motor", name: "Drive motor", role: "tool", outputs: [{ id: "shaft-out", carrier: "torque" }], behavior: [{ in: {}, out: { "shaft-out": "rated" } }] },
      { id: "support", name, role: "mediator", inputs: [{ id: "lube", carrier: "lube" }, { id: "temp", carrier: "temp" }], outputs: [{ id: "race", carrier: "radial-load" }], behavior: rows },
      { id: "shaft", name: "Shaft", role: "product", inputs: [{ id: "drive", carrier: "torque" }, { id: "support", carrier: "radial-load" }] },
    ],
    wires: [
      { id: "w-drive", from: { box: "motor", port: "shaft-out" }, to: { box: "shaft", port: "drive" }, carrier: "torque", polarity: "useful" },
      { id: "w-support", from: { box: "support", port: "race" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful" },
    ],
  };
}
const acceptable = [{ box: "shaft", port: "drive", values: ["rated"] }, { box: "shaft", port: "support", values: ["supported"] }];
const ball = concept("Ball bearing", (lube) => lube === "oiled");
const bushing = concept("Polymer bushing", (_, temp) => temp === "normal");
const tight = concept("Tight-fit bearing", (lube, temp) => lube === "oiled" && temp === "normal");

test("weakness ranking: inclusion first, incomparable pairs with a witness each way, counts second", () => {
  const r = weaknessRanking([{ id: "ball", model: ball }, { id: "bushing", model: bushing }, { id: "tight", model: tight }], acceptable);
  assert.ok(r.ok && r.verdict === "ranked");
  assert.deepEqual(r.situations.map((q) => `${q.box}.${q.port}`), ["support.lube", "support.temp"]);
  assert.equal(r.situationCount, 4);
  assert.deepEqual(r.readByOne, []);
  assert.ok(r.concepts.every((c) => c.reads.join() === "support.lube,support.temp"));
  assert.doesNotMatch(r.note, /read by one concept only/);
  assert.deepEqual(r.concepts.map((c) => [c.id, c.admitted, c.admittedSituations]), [
    ["ball", 2, [["oiled", "normal"], ["oiled", "hot"]]],
    ["bushing", 2, [["oiled", "normal"], ["dry", "normal"]]],
    ["tight", 1, [["oiled", "normal"]]],
  ]);
  assert.deepEqual(r.pairs, [
    { concepts: ["ball", "bushing"], order: "incomparable", onlyFirst: [{ box: "support", port: "lube", value: "oiled" }, { box: "support", port: "temp", value: "hot" }],
      onlySecond: [{ box: "support", port: "lube", value: "dry" }, { box: "support", port: "temp", value: "normal" }], basis: ["admits_incomparable"] },
    { concepts: ["ball", "tight"], order: "first-weaker", onlyFirst: [{ box: "support", port: "lube", value: "oiled" }, { box: "support", port: "temp", value: "hot" }], basis: ["card_lt_of_strictly_weaker"] },
    { concepts: ["bushing", "tight"], order: "first-weaker", onlyFirst: [{ box: "support", port: "lube", value: "dry" }, { box: "support", port: "temp", value: "normal" }], basis: ["card_lt_of_strictly_weaker"] },
  ]);
  assert.deepEqual([r.weakest, r.maximal], [[], ["ball", "bushing"]]);
  // Equal counts for the incomparable pair: the count cannot rank them.
  assert.deepEqual(r.byCount, [{ id: "ball", admitted: 2 }, { id: "bushing", admitted: 2 }, { id: "tight", admitted: 1 }]);
  assert.match(r.note, /incomparable/);
  assert.match(r.note, /weakness\.md's step 1/);
  assert.match(r.note, /byCount depends on how finely the carriers' values are declared/);
  assert.deepEqual(r.concepts[2].firstRejected, { situation: [{ box: "support", port: "lube", value: "dry" }, { box: "support", port: "temp", value: "normal" }], reason: "unacceptable-output", output: ["rated", "unsupported"] });

  const magnetic = concept("Magnetic bearing", () => true);
  const all = weaknessRanking([{ id: "ball", model: ball }, { id: "magnetic", model: magnetic }], acceptable);
  assert.ok(all.ok && all.verdict === "ranked");
  assert.deepEqual([all.weakest, all.maximal, all.pairs[0].order], [["magnetic"], ["magnetic"], "second-weaker"]);
  const twins = weaknessRanking([{ id: "ball", model: ball }, { id: "again", model: ball }], acceptable);
  assert.ok(twins.ok && twins.verdict === "ranked");
  assert.deepEqual([twins.weakest, twins.maximal, twins.pairs[0].order, "basis" in twins.pairs[0]], [["ball", "again"], ["ball", "again"], "equal", false]);
});

test("weakness ranking: a condition read under different box ids is two situations, and is flagged", () => {
  // The bushing reads the same lubrication and temperature, but on a box named 'bushing'.
  const renamed = structuredClone(bushing);
  box(renamed, "support").id = "bushing";
  renamed.wires.find((w) => w.id === "w-support")!.from.box = "bushing";
  const r = weaknessRanking([{ id: "ball", model: ball }, { id: "bushing", model: renamed }], acceptable);
  assert.ok(r.ok && r.verdict === "ranked");
  assert.equal(r.situationCount, 16, "four independent inputs, not two shared ones");
  assert.deepEqual(r.readByOne, [
    { input: "support.lube", concept: "ball" }, { input: "support.temp", concept: "ball" },
    { input: "bushing.lube", concept: "bushing" }, { input: "bushing.temp", concept: "bushing" },
  ]);
  assert.match(r.note, /4 situation input\(s\) are read by one concept only/);
  assert.match(r.note, /give both the same box and port id/);
});

test("weakness ranking: a situation without a steady state is not admitted, so an empty concept is not weak by vacuity", () => {
  const seized = concept("Seized bearing", (lube, temp) => (lube === "dry" && temp === "hot" ? false : "none"));
  const partial = concept("Oil-only bearing", (lube) => (lube === "oiled" ? true : "none"));
  const r = weaknessRanking([{ id: "seized", model: seized }, { id: "partial", model: partial }, { id: "ball", model: ball }], acceptable);
  assert.ok(r.ok && r.verdict === "ranked");
  assert.deepEqual(r.concepts.map((c) => [c.id, c.admitted, c.rejected]), [
    ["seized", 0, { noSteadyState: 3, unacceptable: 1 }],
    ["partial", 2, { noSteadyState: 2, unacceptable: 0 }],
    ["ball", 2, { noSteadyState: 0, unacceptable: 2 }],
  ]);
  assert.equal(r.concepts[0].firstRejected!.reason, "no-steady-state");
  assert.deepEqual(r.pairs.map((p) => p.order), ["second-weaker", "second-weaker", "equal"]);
});

test("weakness ranking fails closed: different deliverables, a missing or undeclared acceptable value, different situations", () => {
  const one = (m: FunctionModel) => [{ id: "a", model: ball }, { id: "b", model: m }];
  const dropped = structuredClone(bushing);
  dropped.wires = dropped.wires.filter((w) => w.id !== "w-drive");
  assert.match(errors(weaknessRanking(one(dropped), acceptable)), /concept 'b' does not deliver 'shaft.drive'.*one that drops a deliverable has fewer outputs to be acceptable/);
  assert.match(errors(weaknessRanking(one(bushing), acceptable.slice(1))), /acceptable: no values for deliverable 'shaft.drive'/);
  assert.match(errors(weaknessRanking(one(bushing), [...acceptable.slice(0, 1), { box: "shaft", port: "support", values: ["held"] }])), /value 'held' of 'shaft.support' is not declared by carrier 'radial-load' in concept 'a'/);
  assert.match(errors(weaknessRanking(one(bushing), [...acceptable, { box: "motor", port: "x", values: ["rated"] }])), /'motor.x' is not a deliverable/);
  assert.match(errors(weaknessRanking(one(bushing), [...acceptable, acceptable[0]])), /listed twice/);
  assert.match(errors(weaknessRanking([{ id: "a", model: ball }, { id: "a", model: bushing }], acceptable)), /duplicate concept id 'a'/);
  const finer = structuredClone(bushing);
  finer.carriers.find((c) => c.id === "temp")!.values = ["normal", "hot", "arctic"];
  assert.match(errors(weaknessRanking(one(finer), acceptable)), /input 'support.temp' is read by concept 'a' as carrier 'temp' \[normal, hot\] and by concept 'b' as carrier 'temp' \[normal, hot, arctic\]/);

  const unknown = structuredClone(bushing);
  delete box(unknown, "support").behavior;
  const u = weaknessRanking(one(unknown), acceptable);
  assert.ok(u.ok && u.verdict === "undecided" && u.reason === "missing-behavior");
  assert.deepEqual(u.missingBehavior, { b: ["support"] });
  const cap = weaknessRanking(one(bushing), acceptable, { maxStates: 3 });
  assert.ok(cap.ok && cap.verdict === "undecided" && cap.reason === "state-cap");
  assert.match(cap.errors.join(), /^concept 'a': the boundary inputs have 4 valuations; the cap is 3/);
  const search = weaknessRanking(one(bushing), acceptable, { maxStates: 5 });
  assert.ok(search.ok && search.verdict === "undecided" && search.reason === "state-cap");
  assert.match(search.errors.join(), /^concept 'a': the steady-state search passed 5 states/);
});

test("triz_behavior weakest_spec and triz_weakness answer over the shared tool spec and fail closed", async () => {
  const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
  const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);
  const viaTrim = await call("triz_behavior", { model: openHousing(), trim: ["bearing"], weakest_spec: true });
  assert.deepEqual([viaTrim.verdict, viaTrim.spec], ["spec", [{ in: {}, out: { bore: "supported" } }]]);
  const seg = segment(bearing(), { box: "shaft", parts: [{ id: "journal", ports: ["drive", "support"] }, { id: "body", ports: ["heat-in", "expansion"] }] });
  assert.ok(seg.ok);
  // Segment projects the shaft's relation onto its parts; remove the body's to leave it to specify.
  delete box(seg.model, "body").behavior;
  assert.equal((await call("triz_behavior", { model: seg.model, compare_to: bearing(), box_map: seg.boxMap, weakest_spec: true })).verdict, "spec");
  for (const [args, message] of [
    [{ model: bearing(), weakest_spec: true }, /weakest_spec needs compare_to/],
    [{ model: bearing(), compare_to: bearing(), trim: ["bearing"], weakest_spec: true }, /trim and compare_to are exclusive/],
    [{ model: bearing(), box_map: { shaft: "shaft" } }, /box_map needs compare_to/],
    [{ model: bearing(), absorb: { "w-support": { box: "housing", port: "bore" } }, weakest_spec: true }, /absorb needs trim/],
  ] as const) assert.match((await call("triz_behavior", args)).errors.join(), message);
  const ranked = await call("triz_weakness", { concepts: [{ id: "ball", model: ball }, { id: "bushing", model: bushing }], acceptable });
  assert.equal(ranked.pairs[0].order, "incomparable");
  assert.equal(specs.triz_weakness.shape.concepts.safeParse([{ id: "ball", model: ball }]).success, false);
  assert.equal(specs.triz_weakness.shape.acceptable.safeParse([]).success, false);
});
