/**
 * Declared behaviour: typing of carrier values and behaviour rows (fail closed), the external
 * relation under the relational trace (identity loop, empty trace, several steady states,
 * fan-in, downstream boxes), the decided trim (preserved, changed with a counterexample and a
 * direction, a lost deliverable, undecided, the state cap), comparing any concept with a
 * baseline (interposed mediators, segments through a box map, rejected maps), and whether a
 * segmented box's relation splits over its parts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel } from "../src/act.js";
import { externalBehavior, trimPreservesBehavior, compareBehavior, deliverablePorts, MAX_STATES } from "../src/act-behavior.js";
import { segment, interpose, takeOut, splitBehavior } from "../src/act-rewrite.js";
import { findIsomorphism } from "../src/act-iso.js";
import { cheapCopy } from "../src/act-principles.js";
import { toolSpecs } from "../src/tools.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const bearing = () => example("bearing-heat-behavior");
const box = (m: FunctionModel, id: string) => m.boxes.find((b) => b.id === id)!;
const errors = (r: { ok: boolean; errors?: string[] }) => (r.ok ? "" : r.errors!.join("; "));

/** One box whose output y feeds back into its input x; z = x is delivered to a product. */
function loop(rows: Array<[x: string, y: string]>): FunctionModel {
  return {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "loop", name: "Loop", role: "tool", inputs: [{ id: "x", carrier: "c" }], outputs: [{ id: "y", carrier: "c" }, { id: "z", carrier: "c" }],
        behavior: rows.map(([x, y]) => ({ in: { x }, out: { y, z: x } })) },
      { id: "user", name: "User", role: "product", inputs: [{ id: "p", carrier: "c" }] },
    ],
    wires: [
      { id: "w-loop", from: { box: "loop", port: "y" }, to: { box: "loop", port: "x" }, carrier: "c", polarity: "useful" },
      { id: "w-out", from: { box: "loop", port: "z" }, to: { box: "user", port: "p" }, carrier: "c", polarity: "useful" },
    ],
  };
}

test("behaviour typing fails closed: undeclared values, unknown or missing ports, carriers without values", () => {
  const broken = (edit: (m: FunctionModel) => void) => { const m = bearing(); edit(m); return checkModel(m).errors.join("; "); };
  assert.deepEqual(checkModel(bearing()), { ok: true, errors: [] });
  assert.match(broken((m) => { box(m, "shaft").behavior![0].in["heat-in"] = "warm"; }), /box 'shaft' behavior row 0: value 'warm' of port 'heat-in' is not declared by carrier 'heat'/);
  assert.match(broken((m) => { box(m, "shaft").behavior![0].in.ghost = "low"; }), /behavior row 0: no input port 'ghost'/);
  assert.match(broken((m) => { box(m, "shaft").behavior![1].in.expansion = "high"; }), /behavior row 1: no input port 'expansion'/);
  assert.match(broken((m) => { delete box(m, "shaft").behavior![2].in.drive; }), /behavior row 2: input port 'drive' has no value/);
  assert.match(broken((m) => { box(m, "bearing").behavior![0].out = { race: "supported" }; }), /behavior row 0: output port 'friction' has no value/);
  assert.match(broken((m) => { delete m.carriers.find((c) => c.id === "heat")!.values; }), /box 'bearing' declares behavior, but carrier 'heat' of port 'friction' declares no values/);
  assert.match(broken((m) => { m.carriers[0].values = ["rated", "rated"]; }), /carrier 'torque': duplicate value 'rated'/);
  assert.throws(() => FunctionModel.parse({ ...bearing(), boxes: [{ ...box(bearing(), "motor"), behavior: [] }] }));
});

test("relational trace: an identity self-loop admits every value, an empty trace is reported, not collapsed", () => {
  const model = loop([["0", "0"], ["1", "1"]]);
  const identity = externalBehavior(model);
  assert.ok(identity.ok && identity.decided);
  assert.deepEqual(identity.relation, [{ input: [], outputs: [["0"], ["1"]], steadyStateCount: 2, steadyStates: [["0", "0"], ["1", "1"]] }]);
  // Kleene iteration of the loop's value set from no value stays empty: a least fixpoint would deliver nothing.
  const rows = box(model, "loop").behavior!;
  let reached = new Set<string>();
  for (let i = 0; i < 4; i++) reached = new Set(rows.filter((r) => reached.has(r.in.x)).map((r) => r.out.y));
  assert.equal(reached.size, 0);

  const negation = externalBehavior(loop([["0", "1"], ["1", "0"]]));
  assert.ok(negation.ok && negation.decided);
  assert.deepEqual(negation.relation, [{ input: [], outputs: [], steadyStateCount: 0, steadyStates: [] }]);
  assert.deepEqual(negation.noSteadyState, [[]]);
});

test("the bearing's heat loop has two steady states; both support the shaft, and both are listed", () => {
  const r = externalBehavior(bearing());
  assert.ok(r.ok && r.decided);
  assert.deepEqual(r.deliverables.map((d) => `${d.box}.${d.port}`), ["shaft.drive", "shaft.support"]);
  assert.deepEqual(r.inputs, []);
  assert.deepEqual(r.variables.map((v) => `${v.box}.${v.port}`), ["motor.shaft-out", "bearing.race", "bearing.friction", "shaft.expansion"]);
  assert.deepEqual(r.relation, [{
    input: [], outputs: [["rated", "supported"]], steadyStateCount: 2,
    steadyStates: [["rated", "supported", "low", "nominal"], ["rated", "supported", "high", "high"]],
  }]);
  assert.equal(r.severalSteadyStates, 1);
  assert.deepEqual(r.basis, ["Relation.comp_assoc"]);
  assert.deepEqual([r.composed, r.downstream], [["motor", "shaft", "bearing"], ["housing", "air"]]);
});

test("only upstream boxes compose: a partial downstream relation is listed, not applied", () => {
  const m = bearing();
  m.wires.push({ id: "w-sink", from: { box: "bearing", port: "friction" }, to: { box: "air", port: "sink" }, carrier: "heat", polarity: "useful", verb: "dissipate" });
  box(m, "air").behavior = [{ in: { sink: "low" }, out: {} }];
  const r = externalBehavior(m);
  assert.ok(r.ok && r.decided);
  assert.deepEqual(r.partialDownstream, ["air"]);
  assert.equal(r.relation[0].steadyStateCount, 2, "the high-heat steady state survives: air is downstream of every deliverable");
  assert.match(r.assumption, /assumed to accept whatever it receives/);
  box(m, "air").behavior!.push({ in: { sink: "high" }, out: {} });
  const total = externalBehavior(m);
  assert.deepEqual(total.ok && total.decided && total.partialDownstream, []);
});

test("a port fed by several wires needs them to agree", () => {
  const m: FunctionModel = {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "a", name: "A", role: "tool", outputs: [{ id: "o", carrier: "c" }], behavior: [{ in: {}, out: { o: "1" } }] },
      { id: "b", name: "B", role: "tool", outputs: [{ id: "o", carrier: "c" }], behavior: [{ in: {}, out: { o: "0" } }, { in: {}, out: { o: "1" } }] },
      { id: "p", name: "P", role: "product", inputs: [{ id: "in", carrier: "c" }] },
    ],
    wires: [
      { id: "wa", from: { box: "a", port: "o" }, to: { box: "p", port: "in" }, carrier: "c", polarity: "useful" },
      { id: "wb", from: { box: "b", port: "o" }, to: { box: "p", port: "in" }, carrier: "c", polarity: "useful" },
    ],
  };
  const r = externalBehavior(m);
  assert.deepEqual(r.ok && r.decided && r.relation[0].outputs, [["1"]]);
});

test("decided trim: removing the bearing and letting the housing support the shaft preserves the relation", () => {
  const r = trimPreservesBehavior(bearing(), { trim: ["bearing"] });
  assert.ok(r.ok);
  assert.equal(r.verdict, "preserved");
  assert.ok(r.verdict === "preserved");
  assert.deepEqual(r.chosen, [{ wire: "w-support", box: "housing", port: "bore", rule: "C", defaulted: true }]);
  assert.deepEqual(r.baseline.relation[0].outputs, r.concept.relation[0].outputs);
  assert.equal(r.baseline.relation[0].steadyStateCount, 2);
  assert.deepEqual(r.concept.composed, ["motor", "housing"]);
});

test("decided trim: a counterexample names the input where the outputs differ", () => {
  const m = bearing();
  m.carriers.push({ id: "fit", layer: "material", dimension: "bore fit", values: ["press", "loose"] });
  const housing = box(m, "housing");
  housing.inputs = [{ id: "fit", carrier: "fit" }];
  housing.behavior = [{ in: { fit: "press" }, out: { bore: "supported" } }, { in: { fit: "loose" }, out: { bore: "unsupported" } }];
  const r = trimPreservesBehavior(m, { trim: ["bearing"] });
  assert.ok(r.ok && r.verdict === "changed" && r.reason === "counterexample");
  assert.deepEqual(r.counterexample, {
    input: [{ box: "housing", port: "fit", value: "loose" }],
    baseline: [["rated", "supported"]], concept: [["rated", "unsupported"]],
    onlyBaseline: [["rated", "supported"]], onlyConcept: [["rated", "unsupported"]],
  });
  assert.equal(r.direction, "incomparable");
  assert.deepEqual([r.differingInputs, r.inputValuations], [1, 2]);
  assert.deepEqual(r.inputsOnlyIn, { baseline: [], concept: [{ box: "housing", port: "fit", carrier: "fit" }] });
});

test("decided trim: strict containment is changed, with its direction", () => {
  const loose = bearing();
  box(loose, "housing").behavior = [{ in: {}, out: { bore: "supported" } }, { in: {}, out: { bore: "unsupported" } }];
  const wider = trimPreservesBehavior(loose, { trim: ["bearing"] });
  assert.ok(wider.ok && wider.verdict === "changed" && wider.reason === "counterexample");
  assert.equal(wider.direction, "concept-contains-baseline");
  assert.deepEqual(wider.counterexample.onlyConcept, [["rated", "unsupported"]]);

  const worn = bearing();
  box(worn, "bearing").behavior!.push({ in: { "preload-in": "high" }, out: { race: "unsupported", friction: "high" } });
  const narrower = trimPreservesBehavior(worn, { trim: ["bearing"] });
  assert.ok(narrower.ok && narrower.verdict === "changed" && narrower.reason === "counterexample");
  assert.equal(narrower.direction, "baseline-contains-concept");
  assert.deepEqual(narrower.counterexample.onlyBaseline, [["rated", "unsupported"]]);
});

test("decided trim: a lost deliverable is changed without behaviour; missing behaviour is undecided", () => {
  const lost = trimPreservesBehavior(example("bearing-heat"), { trim: ["shaft"] });
  assert.ok(lost.ok && lost.verdict === "changed" && lost.reason === "lost-deliverables");
  assert.deepEqual(lost.lostDeliverables.map((d) => `${d.box}.${d.port}`), ["shaft.drive", "shaft.support"]);

  const noShaft = bearing();
  delete box(noShaft, "shaft").behavior;
  const u = trimPreservesBehavior(noShaft, { trim: ["bearing"] });
  assert.ok(u.ok && u.verdict === "undecided" && u.reason === "missing-behavior");
  assert.deepEqual([u.missingBehavior, u.missingIn], [["shaft"], { baseline: ["shaft"], concept: [] }]);
  const e = externalBehavior(noShaft);
  assert.deepEqual(e.ok && !e.decided && e.missingBehavior, ["shaft"]);

  const noHousing = bearing();
  delete box(noHousing, "housing").behavior;
  const v = trimPreservesBehavior(noHousing, { trim: ["bearing"] });
  assert.ok(v.ok && v.verdict === "undecided" && v.reason === "missing-behavior");
  assert.deepEqual(v.missingIn, { baseline: [], concept: ["housing"] });
  const before = externalBehavior(noHousing);
  assert.ok(before.ok && before.decided, "the housing is downstream until the trim");

  assert.match(errors(trimPreservesBehavior(bearing(), { trim: ["bearing", "housing"] })), /no typed absorber: the trim is blocked/);
  const noProduct = bearing();
  box(noProduct, "shaft").role = "mediator";
  assert.match(errors(externalBehavior(noProduct)), /no deliverables/);
  assert.deepEqual(deliverablePorts(noProduct), []);
});

test("constructions do not invent behaviour: coupled parts and an undeclared mediator declare none", () => {
  const seg = segment(bearing(), { box: "bearing", parts: [{ id: "races", ports: ["preload-in", "race"] }, { id: "rolling", ports: ["friction"] }] });
  assert.ok(seg.ok);
  assert.deepEqual([seg.behaviourallyIndependent, seg.behavior?.coupled], [false, ["races", "rolling"]]);
  assert.ok(seg.model.boxes.every((b) => !["races", "rolling"].includes(b.id) || !b.behavior));
  const r = externalBehavior(seg.model);
  assert.deepEqual(r.ok && !r.decided && r.missingBehavior, ["races", "rolling"]);
  const via = interpose(bearing(), { wire: "w-support", mediator: { id: "sleeve", name: "Sleeve" } });
  assert.ok(via.ok);
  assert.equal(via.behavior, undefined);
  const s = externalBehavior(via.model);
  assert.deepEqual(s.ok && !s.decided && s.missingBehavior, ["sleeve"]);
  const plain = segment(example("bearing-heat"), { box: "bearing", parts: [{ id: "races", ports: ["preload-in", "race"] }, { id: "rolling", ports: ["friction"] }] });
  assert.ok(plain.ok && !("behaviourallyIndependent" in plain), "a box without behaviour reports no behavioural split");
});

const sleeve = (behavior?: "identity" | Array<{ in: Record<string, string>; out: Record<string, string> }>) => {
  const via = interpose(bearing(), { wire: "w-support", mediator: { id: "sleeve", name: "Sleeve", ...(behavior ? { behavior } : {}) } });
  assert.ok(via.ok, errors(via));
  return via;
};

test("compare a concept: an identity mediator preserves the relation, a lossy one changes it", () => {
  const id = sleeve("identity");
  assert.deepEqual(box(id.model, "sleeve").behavior, [{ in: { in: "supported" }, out: { out: "supported" } }, { in: { in: "unsupported" }, out: { out: "unsupported" } }]);
  assert.equal(id.behavior?.identity, true);
  const kept = compareBehavior(bearing(), id.model);
  assert.ok(kept.ok && kept.verdict === "preserved");
  assert.deepEqual([kept.concept.composed, kept.gainedDeliverables], [["motor", "shaft", "bearing", "sleeve"], []]);

  const lossy = sleeve([{ in: { in: "supported" }, out: { out: "unsupported" } }, { in: { in: "unsupported" }, out: { out: "unsupported" } }]);
  assert.equal(lossy.behavior?.identity, false);
  const r = compareBehavior(bearing(), lossy.model);
  assert.ok(r.ok && r.verdict === "changed" && r.reason === "counterexample");
  assert.deepEqual([r.direction, r.counterexample], ["incomparable", {
    input: [], baseline: [["rated", "supported"]], concept: [["rated", "unsupported"]],
    onlyBaseline: [["rated", "supported"]], onlyConcept: [["rated", "unsupported"]],
  }]);

  const undeclared = compareBehavior(bearing(), sleeve().model);
  assert.ok(undeclared.ok && undeclared.verdict === "undecided" && undeclared.reason === "missing-behavior");
  assert.deepEqual(undeclared.missingIn, { baseline: [], concept: ["sleeve"] });

  const noValues = bearing();
  delete noValues.carriers.find((c) => c.id === "radial-load")!.values;
  for (const b of noValues.boxes) delete b.behavior;
  assert.match(errors(interpose(noValues, { wire: "w-support", mediator: { id: "sleeve", name: "Sleeve", behavior: "identity" } })), /^mediator behavior 'identity' needs carrier 'radial-load' to declare values$/);
  assert.match(errors(interpose(bearing(), { wire: "w-support", mediator: { id: "sleeve", name: "Sleeve", behavior: [{ in: { x: "supported" }, out: { out: "supported" } }] } })), /result: box 'sleeve' behavior row 0: no input port 'x'/);
});

test("compare a concept: deliverables only the concept has are listed, not compared", () => {
  const via = interpose(bearing(), { wire: "w-heat", mediator: { id: "fin", name: "Fin", behavior: "identity" }, polarity: { out: "useful" } });
  assert.ok(via.ok);
  const r = compareBehavior(bearing(), via.model);
  assert.ok(r.ok && r.verdict === "preserved");
  assert.deepEqual(r.gainedDeliverables, [{ box: "shaft", port: "heat-in", carrier: "heat" }]);
});

/** A source whose outputs copy two unwired inputs, x = a and y = b, delivered to a product. */
function copier(): FunctionModel {
  return {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "src", name: "Source", role: "tool",
        inputs: [{ id: "a", carrier: "c" }, { id: "b", carrier: "c" }], outputs: [{ id: "x", carrier: "c" }, { id: "y", carrier: "c" }],
        behavior: ["0", "1"].flatMap((a) => ["0", "1"].map((b) => ({ in: { a, b }, out: { x: a, y: b } }))) },
      { id: "p", name: "P", role: "product", inputs: [{ id: "px", carrier: "c" }, { id: "py", carrier: "c" }] },
    ],
    wires: [
      { id: "wx", from: { box: "src", port: "x" }, to: { box: "p", port: "px" }, carrier: "c", polarity: "useful" },
      { id: "wy", from: { box: "src", port: "y" }, to: { box: "p", port: "py" }, carrier: "c", polarity: "useful" },
    ],
  };
}

test("segment, then compare through box_map: deliverables and boundary inputs map back to the baseline box", () => {
  const shaft = segment(bearing(), { box: "shaft", parts: [{ id: "shaft-load", ports: ["drive", "support"] }, { id: "shaft-thermal", ports: ["heat-in", "expansion"] }] });
  assert.ok(shaft.ok && shaft.behaviourallyIndependent && shaft.deliverableKeysChanged);
  assert.deepEqual(box(shaft.model, "shaft-load").behavior, [{ in: { drive: "rated", support: "supported" }, out: {} }, { in: { drive: "rated", support: "unsupported" }, out: {} }]);
  const mapped = compareBehavior(bearing(), shaft.model, { boxMap: shaft.boxMap });
  assert.ok(mapped.ok && mapped.verdict === "preserved");
  assert.deepEqual(mapped.boxMap, { "shaft-load": "shaft", "shaft-thermal": "shaft" });
  const unmapped = compareBehavior(bearing(), shaft.model);
  assert.ok(unmapped.ok && unmapped.verdict === "changed" && unmapped.reason === "lost-deliverables");
  assert.deepEqual(unmapped.lostDeliverables.map((d) => `${d.box}.${d.port}`), ["shaft.drive", "shaft.support"]);

  const src = segment(copier(), { box: "src", parts: [{ id: "s1", ports: ["a", "x"] }, { id: "s2", ports: ["b", "y"] }] });
  assert.ok(src.ok && src.behaviourallyIndependent);
  const r = compareBehavior(copier(), src.model, { boxMap: src.boxMap });
  assert.ok(r.ok && r.verdict === "preserved");
  assert.deepEqual([r.inputs.map((q) => `${q.box}.${q.port}`), r.inputsOnlyIn, r.inputValuations], [["src.a", "src.b"], { baseline: [], concept: [] }, 4]);
  assert.deepEqual(r.concept.inputs.map((q) => `${q.box}.${q.port}`), ["s1.a", "s2.b"], "the concept is evaluated in its own ids");
  const apart = compareBehavior(copier(), src.model);
  assert.ok(apart.ok && apart.verdict === "changed" && apart.reason === "counterexample", "without the map the parts' inputs are new ports, ranging apart from the baseline's");
  assert.deepEqual(apart.inputsOnlyIn.concept.map((q) => `${q.box}.${q.port}`), ["s1.a", "s2.b"]);
});

test("a cheap copy of a product under a new id keeps its behaviour and compares through its boxMap", () => {
  const m = bearing();
  box(m, "shaft").cost = { usd_unit: 30 };
  const copy = cheapCopy(m, { box: "shaft", copy: { id: "hollow-shaft", cost: { usd_unit: 20 } } });
  assert.ok(copy.ok, errors(copy));
  assert.deepEqual(box(copy.model, "hollow-shaft").behavior, box(m, "shaft").behavior);
  const r = compareBehavior(m, copy.model, { boxMap: copy.boxMap });
  assert.ok(r.ok && r.verdict === "preserved");
  const unmapped = compareBehavior(m, copy.model);
  assert.ok(unmapped.ok && unmapped.verdict === "changed" && unmapped.reason === "lost-deliverables");
});

test("a mismatched, ambiguous, or unknown box_map is rejected, and so are inputs whose values differ", () => {
  const src = segment(copier(), { box: "src", parts: [{ id: "s1", ports: ["a", "x"] }, { id: "s2", ports: ["b", "y"] }] });
  assert.ok(src.ok);
  assert.match(errors(compareBehavior(copier(), src.model, { boxMap: { s1: "p", s2: "src" } })), /box_map: 's1' maps to 'p', which has no input port 'a' of carrier 'c'/);
  assert.match(errors(compareBehavior(copier(), src.model, { boxMap: { ghost: "src" } })), /box_map: 'ghost' is not a box of the concept model/);
  assert.match(errors(compareBehavior(copier(), src.model, { boxMap: { s1: "ghost" } })), /box_map: 'ghost' is not a box of the baseline/);
  const twice = structuredClone(src.model);
  twice.boxes.push({ id: "s3", name: "S3", role: "tool", inputs: [{ id: "a", carrier: "c" }], behavior: [{ in: { a: "0" }, out: {} }, { in: { a: "1" }, out: {} }] });
  assert.match(errors(compareBehavior(copier(), twice, { boxMap: { ...src.boxMap, s3: "src" } })), /box_map: input port 'a' of 's1' and of 's3' both map to 'src.a': ambiguous/);

  const spare = bearing();
  spare.boxes.push({ id: "spare", name: "Spare", role: "environment", inputs: [{ id: "drive", carrier: "torque" }] });
  assert.match(errors(compareBehavior(bearing(), spare, { boxMap: { spare: "shaft" } })), /input port 'drive' of 'shaft' and of 'spare' both map to 'shaft.drive': ambiguous/);

  const wider = copier();
  wider.carriers[0].values = ["0", "1", "2"];
  assert.match(errors(compareBehavior(copier(), wider)), /input port 'src.a' reads carrier 'c' \[0, 1\] in the baseline and 'c' \[0, 1, 2\] in the concept/);
  assert.match(errors(compareBehavior({ ...copier(), wires: [] }, copier())), /^no deliverables/);
  const illTyped = { ...copier(), wires: [copier().wires[0], { ...copier().wires[1], carrier: "ghost" }] };
  assert.match(errors(compareBehavior(copier(), illTyped)), /^concept: wire 'wy'/);
  assert.match(errors(compareBehavior(illTyped, copier())), /^baseline: wire 'wy'/);
});

test("triz_behavior compare_to: the model is the concept; trim and compare_to exclude each other; box_map needs compare_to", async () => {
  const spec = toolSpecs().find((s) => s.name === "triz_behavior")!;
  const call = async (args: unknown) => JSON.parse((await spec.handler(args)).content[0].text);
  assert.equal((await call({ model: sleeve("identity").model, compare_to: bearing() })).verdict, "preserved");
  const shaft = segment(bearing(), { box: "shaft", parts: [{ id: "shaft-load", ports: ["drive", "support"] }, { id: "shaft-thermal", ports: ["heat-in", "expansion"] }] });
  assert.ok(shaft.ok);
  assert.equal((await call({ model: shaft.model, compare_to: bearing(), box_map: shaft.boxMap })).verdict, "preserved");
  assert.match((await call({ model: bearing(), compare_to: bearing(), trim: ["bearing"] })).errors.join(), /trim and compare_to are exclusive/);
  assert.match((await call({ model: bearing(), box_map: { shaft: "shaft" } })).errors.join(), /box_map needs compare_to/);
  const transform = toolSpecs().find((s) => s.name === "triz_transform")!;
  assert.equal(transform.shape.transformation.safeParse({ op: "interpose", wire: "w", mediator: { id: "m", name: "M", behavior: "identity" } }).success, true);
  assert.equal(transform.shape.transformation.safeParse({ op: "interpose", wire: "w", mediator: { id: "m", name: "M", behavior: "inverse" } }).success, false);
});

test("segment splits behaviour only when the relation is the product of its projections onto the parts", () => {
  const split = segment(bearing(), { box: "bearing", parts: [{ id: "load", ports: ["preload-in", "friction"] }, { id: "race", ports: ["race"] }] });
  assert.ok(split.ok && split.behaviourallyIndependent);
  assert.deepEqual(split.behavior?.coupled, []);
  assert.deepEqual(box(split.model, "load").behavior, [{ in: { "preload-in": "high" }, out: { friction: "high" } }, { in: { "preload-in": "nominal" }, out: { friction: "low" } }], "projected rows in value order");
  assert.deepEqual(box(split.model, "race").behavior, [{ in: {}, out: { race: "supported" } }]);
  const r = compareBehavior(bearing(), split.model);
  assert.ok(r.ok && r.verdict === "preserved");

  // take_out goes through segment, so it splits behaviour the same way.
  const out = takeOut(bearing(), { box: "bearing", ports: ["preload-in", "friction"], part: { id: "load" } });
  assert.ok(out.ok && out.behaviourallyIndependent);
  assert.ok(compareBehavior(bearing(), out.model, { boxMap: out.boxMap }).ok);
  const coupled = takeOut(bearing(), { box: "bearing", ports: ["friction"], part: { id: "rolling" } });
  assert.ok(coupled.ok && coupled.behaviourallyIndependent === false);
  assert.deepEqual(coupled.behavior?.coupled, ["bearing", "rolling"]);
});

test("a coupled split names the first witness pair: two rows whose mix is not a row", () => {
  const seg = segment(bearing(), { box: "bearing", parts: [{ id: "races", ports: ["preload-in", "race"] }, { id: "rolling", ports: ["friction"] }] });
  assert.ok(seg.ok && seg.behaviourallyIndependent === false);
  // Rows in value order: (high, supported, high) before (nominal, supported, low).
  const hot = { races: { "preload-in": "high", race: "supported" }, rolling: { friction: "high" } };
  const cool = { races: { "preload-in": "nominal", race: "supported" }, rolling: { friction: "low" } };
  assert.deepEqual(seg.behavior?.witnesses, [
    { part: "races", rows: [hot, cool], absent: { races: hot.races, rolling: cool.rolling } },
    { part: "rolling", rows: [hot, cool], absent: { races: cool.races, rolling: hot.rolling } },
  ]);
  assert.deepEqual(seg.behavior?.basis, ["eq_projections_prod_iff_rectangle", "eq_projections_prod_iff"]);

  const split = segment(bearing(), { box: "bearing", parts: [{ id: "load", ports: ["preload-in", "friction"] }, { id: "race", ports: ["race"] }] });
  assert.ok(split.ok && split.behaviourallyIndependent);
  assert.deepEqual([split.behavior?.witnesses, split.behavior?.basis], [[], ["eq_projections_prod_iff_rectangle"]]);

  // Equality on two values: the pair Witnesses.lean checks for `sameBit`.
  const m: FunctionModel = {
    domain: "software",
    carriers: [{ id: "b", layer: "information", dimension: "bit", values: ["false", "true"] }],
    boxes: [{ id: "same", name: "Same", role: "tool", inputs: [{ id: "a", carrier: "b" }], outputs: [{ id: "b", carrier: "b" }],
      behavior: [{ in: { a: "true" }, out: { b: "true" } }, { in: { a: "false" }, out: { b: "false" } }] }],
    wires: [],
  };
  const eq = segment(m, { box: "same", parts: [{ id: "p", ports: ["a"] }, { id: "q", ports: ["b"] }] });
  assert.ok(eq.ok);
  assert.deepEqual(eq.behavior?.witnesses?.[0], {
    part: "p", rows: [{ p: { a: "false" }, q: { b: "false" } }, { p: { a: "true" }, q: { b: "true" } }], absent: { p: { a: "false" }, q: { b: "true" } },
  });
});

const bits = (id: string) => ({ id, carrier: "c" });
const rowsBox = (inputs: string[], outputs: string[], rows: string[][]): FunctionModel["boxes"][number] => ({
  id: "r", name: "R", role: "tool", inputs: inputs.map(bits), outputs: outputs.map(bits),
  behavior: rows.map((t) => ({ in: Object.fromEntries(inputs.map((p, i) => [p, t[i]])), out: Object.fromEntries(outputs.map((p, i) => [p, t[inputs.length + i]])) })),
});

test("the split is decided on distinct rows: equality with repeated rows is not a product", () => {
  const eq = rowsBox(["a"], ["b"], [["0", "0"], ["1", "1"], ["1", "1"], ["0", "0"]]);
  assert.equal(eq.behavior!.length, 2 * 2, "four raw rows, as many as the product of two two-value projections");
  const r = splitBehavior(eq, [{ id: "p", ports: ["a"] }, { id: "q", ports: ["b"] }]);
  assert.deepEqual([r.independent, r.coupled, r.rows], [false, ["p", "q"], undefined]);
  assert.deepEqual(r.witnesses[0], { part: "p", rows: [{ p: { a: "0" }, q: { b: "0" } }, { p: { a: "1" }, q: { b: "1" } }], absent: { p: { a: "0" }, q: { b: "1" } } });
});

test("each part is tested against all the others: parity is independent pairwise, yet every part is coupled", () => {
  const parity = rowsBox(["a", "b"], ["c"], ["0", "1"].flatMap((a) => ["0", "1"].map((b) => [a, b, a === b ? "0" : "1"])));
  const r = splitBehavior(parity, [{ id: "pa", ports: ["a"] }, { id: "pb", ports: ["b"] }, { id: "pc", ports: ["c"] }]);
  assert.deepEqual([r.independent, r.coupled, r.basis], [false, ["pa", "pb", "pc"], ["eq_projections_prod_iff_rectangle", "eq_projections_pi_iff"]]);
  // Part c against {a, b}: rows (0,0,0) and (0,1,1) mix into c 0 from the first, a 0 and b 1 from the second: not a row.
  assert.deepEqual(r.witnesses[2], {
    part: "pc",
    rows: [{ pa: { a: "0" }, pb: { b: "0" }, pc: { c: "0" } }, { pa: { a: "0" }, pb: { b: "1" }, pc: { c: "1" } }],
    absent: { pa: { a: "0" }, pb: { b: "1" }, pc: { c: "0" } },
  });
  // Renaming values (0 → z, 1 → a) reverses their order: coupling is unchanged, the witness follows the tie-break.
  const renamed = { ...parity, behavior: parity.behavior!.map((row) => ({
    in: Object.fromEntries(Object.entries(row.in).map(([k, v]) => [k, v === "0" ? "z" : "a"])),
    out: Object.fromEntries(Object.entries(row.out).map(([k, v]) => [k, v === "0" ? "z" : "a"])),
  })) };
  const back = splitBehavior(renamed, [{ id: "pa", ports: ["a"] }, { id: "pb", ports: ["b"] }, { id: "pc", ports: ["c"] }]);
  assert.deepEqual([back.independent, back.coupled], [r.independent, r.coupled]);
  assert.deepEqual(back.witnesses[2].rows[0], { pa: { a: "a" }, pb: { b: "a" }, pc: { c: "z" } }, "the first row is now (1,1,0), renamed");
  const pairs = [["a", "b"], ["a", "c"], ["b", "c"]].map(([x, y]) => splitBehavior({ ...parity, behavior: parity.behavior!.map((row) => ({
    in: Object.fromEntries(Object.entries(row.in).filter(([k]) => k === x || k === y)), out: Object.fromEntries(Object.entries(row.out).filter(([k]) => k === x || k === y)),
  })), inputs: parity.inputs!.filter((p) => p.id === x || p.id === y), outputs: parity.outputs!.filter((p) => p.id === x || p.id === y) }, [{ id: x, ports: [x] }, { id: y, ports: [y] }]).independent);
  assert.deepEqual(pairs, [true, true, true], "a pairwise check would call parity independent");
});

test("property: the counting decision agrees with checking every tuple of the product of the projections", () => {
  let seed = 7;
  const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const ports = ["p0", "p1", "p2", "p3"];
  let products = 0;
  for (let trial = 0; trial < 300; trial++) {
    const values = ["0", "1", "2"].slice(0, 2 + rand(2));
    const all = ports.reduce<string[][]>((acc) => acc.flatMap((t) => values.map((v) => [...t, v])), [[]]);
    const k = 2 + rand(2);
    const owner = ports.map((_, i) => (i < k ? i : rand(k)));
    const parts = Array.from({ length: k }, (_, j) => ({ id: `q${j}`, ports: ports.filter((_, i) => owner[i] === j) }));
    const idx = parts.map((p) => p.ports.map((q) => ports.indexOf(q)));
    const proj = (rows: string[][], g: number[]) => [...new Set(rows.map((t) => JSON.stringify(g.map((i) => t[i]))))].map((x) => JSON.parse(x) as string[]);
    /** Every tuple of π(groups[0]) × π(groups[1]) × …, by membership in no relation: enumerated. */
    const productOf = (rows: string[][], groups: number[][]) => groups
      .reduce<Array<Map<number, string>>>((acc, g) => acc.flatMap((m) => proj(rows, g).map((t) => new Map([...m, ...g.map((i, j) => [i, t[j]] as const)]))), [new Map()])
      .map((m) => ports.map((_, i) => m.get(i)!));
    const sample = all.filter(() => rand(3) === 0);
    if (!sample.length) sample.push(all[0]);
    // Odd trials keep the random relation; even ones take the product of its projections, a product by construction.
    const rows = trial % 2 ? sample : productOf(sample, idx);
    const member = new Set(rows.map((t) => t.join()));
    const isProduct = (groups: number[][]) => productOf(rows, groups).every((t) => member.has(t.join()));
    const r = splitBehavior(rowsBox(ports.slice(0, 2), ports.slice(2), rows), parts);
    assert.equal(r.independent, isProduct(idx), `trial ${trial}`);
    assert.deepEqual(r.coupled, parts.filter((_, j) => !isProduct([idx[j], idx.flatMap((g, i) => (i === j ? [] : g))])).map((p) => p.id), `trial ${trial}`);
    // Each witness is the first pair, in lexicographic row order, whose mix is not a row.
    const sortedRows = [...rows].sort((a, b) => { const i = a.findIndex((x, j) => x !== b[j]); return i < 0 ? 0 : a[i] < b[i] ? -1 : 1; });
    const flat = (v: Record<string, Record<string, string>>) => ports.map((q) => Object.values(v).find((x) => Object.hasOwn(x, q))![q]);
    for (const w of r.witnesses) {
      const g = idx[parts.findIndex((p) => p.id === w.part)];
      const mix = (x: string[], y: string[]) => x.map((v, i) => (g.includes(i) ? v : y[i]));
      const first = sortedRows.flatMap((x) => sortedRows.map((y) => [x, y])).find(([x, y]) => !member.has(mix(x, y).join()))!;
      assert.deepEqual([w.rows.map(flat), flat(w.absent)], [first, mix(first[0], first[1])], `trial ${trial}`);
    }
    if (!(trial % 2)) assert.ok(r.independent, `trial ${trial}: a product of projections splits`);
    if (r.independent) {
      products++;
      // Each part's rows are its projection, and recomposing them gives the relation back.
      const back = parts.reduce<string[][]>((acc, part) => acc.flatMap((t) => r.rows!.get(part.id)!
        .map((row) => t.map((x, i) => (part.ports.includes(ports[i]) ? row.in[ports[i]] ?? row.out[ports[i]] : x)))), [ports.map(() => "")]);
      assert.deepEqual(new Set(back.map((t) => t.join())), member, `trial ${trial}`);
    }
  }
  assert.ok(products >= 150 && products < 300, `${products} products: both outcomes are exercised`);
});

/**
 * The negation loop delivering to user.p, plus a proxy (trimmable, with an origin as absorber)
 * delivering to user.q. With `mode`, the loop also reads an unwired mode input: 'id' feeds its
 * value back unchanged (two steady states), 'neg' negates it (none).
 */
function loopWithProxy(mode = false): FunctionModel {
  const m = loop([["0", "1"], ["1", "0"]]);
  m.carriers.push({ id: "d", layer: "information", dimension: "request", values: ["served"] });
  box(m, "user").inputs!.push({ id: "q", carrier: "d" });
  m.boxes.push(
    { id: "proxy", name: "Proxy", role: "mediator", outputs: [{ id: "o", carrier: "d" }], behavior: [{ in: {}, out: { o: "served" } }] },
    { id: "origin", name: "Origin", role: "mediator", outputs: [{ id: "o", carrier: "d" }], behavior: [{ in: {}, out: { o: "served" } }] },
  );
  m.wires.push({ id: "w-serve", from: { box: "proxy", port: "o" }, to: { box: "user", port: "q" }, carrier: "d", polarity: "useful" });
  if (mode) {
    m.carriers.push({ id: "m", layer: "information", dimension: "mode", values: ["id", "neg"] });
    const l = box(m, "loop");
    l.inputs!.push({ id: "mode", carrier: "m" });
    l.behavior = ["0", "1"].flatMap((x) => [
      { in: { x, mode: "id" }, out: { y: x, z: x } },
      { in: { x, mode: "neg" }, out: { y: x === "0" ? "1" : "0", z: x } },
    ]);
  }
  return m;
}

test("decided trim: when neither relation has a steady state, the verdict is undecided, not preserved", () => {
  const r = trimPreservesBehavior(loopWithProxy(), { trim: ["proxy"] });
  assert.ok(r.ok && r.verdict === "undecided" && r.reason === "no-steady-state");
  assert.deepEqual([r.noSteadyState, r.inputValuations, r.emptyInBoth], [{ baseline: 1, concept: 1 }, 1, 1]);
  assert.match(r.note, /Neither model has a steady state at any of the 1 compared input valuations/);
  assert.deepEqual([r.baseline.noSteadyState, r.concept.noSteadyState], [[[]], [[]]]);

  const clean = trimPreservesBehavior(bearing(), { trim: ["bearing"] });
  assert.ok(clean.ok && clean.verdict === "preserved");
  assert.deepEqual([clean.noSteadyState, clean.emptyInBoth], [{ baseline: 0, concept: 0 }, 0]);
  assert.doesNotMatch(clean.note, /no steady state/);
});

test("decided trim: steady states in one model only is changed, with the empty side named", () => {
  // Trimming the negation loop: its delivered value now comes from the origin, which has a steady state.
  const m = loopWithProxy();
  box(m, "origin").outputs!.push({ id: "bit", carrier: "c" });
  box(m, "origin").behavior = [{ in: {}, out: { o: "served", bit: "0" } }];
  const r = trimPreservesBehavior(m, { trim: ["loop"], absorb: { "w-out": { box: "origin", port: "bit" } } });
  assert.ok(r.ok && r.verdict === "changed" && r.reason === "counterexample");
  assert.equal(r.direction, "concept-contains-baseline");
  assert.deepEqual([r.counterexample.baseline, r.counterexample.concept], [[], [["0", "served"]]]);
  assert.match(r.note, /The baseline has no steady state at this input/);
});

test("decided trim: inputs empty in both models agree, are counted, and do not decide the verdict alone", () => {
  const r = trimPreservesBehavior(loopWithProxy(true), { trim: ["proxy"] });
  assert.ok(r.ok && r.verdict === "preserved");
  assert.deepEqual(r.inputs.map((q) => `${q.box}.${q.port}`), ["loop.mode"]);
  assert.deepEqual([r.noSteadyState, r.inputValuations, r.emptyInBoth], [{ baseline: 1, concept: 1 }, 2, 1]);
  assert.deepEqual(r.baseline.relation.map((row) => [row.input, row.outputs]), [[["id"], [["0", "served"], ["1", "served"]]], [["neg"], []]]);
  assert.match(r.note, /1 of the 2 compared have none in either model and agree only in that/);
});

test("ill-typed behaviour fails closed in every tool that takes a model", async () => {
  const bad = bearing();
  box(bad, "motor").behavior![0].out["shaft-out"] = "stalled";
  const args: Record<string, unknown> = {
    triz_function_model: { model: bad },
    triz_trim: { model: bad, trim: ["bearing"] },
    triz_export: { model: bad, format: "hypergraph" },
    triz_transform: { model: bad, transformation: { op: "trim", trim: ["bearing"] } },
    triz_nine_windows: { present: bad, subsystem: ["bearing"] },
    triz_behavior: { model: bad },
    triz_dynamics: { model: bad },
    triz_rule_apply: { model: bad, rule_id: "mono-bi" },
    triz_weakness: { concepts: [{ id: "bad", model: bad }, { id: "good", model: bearing() }], acceptable: [{ box: "shaft", port: "drive", values: ["rated"] }] },
    triz_feasibility: { model: bad },
  };
  const takesModel = toolSpecs().filter((s) => ["model", "present", "concepts"].some((k) => k in s.shape));
  assert.deepEqual(takesModel.map((s) => s.name).sort(), Object.keys(args).sort());
  for (const s of takesModel) {
    const out = JSON.parse((await s.handler(args[s.name])).content[0].text);
    assert.equal(out.ok, false, s.name);
    // triz_nine_windows fails closed per window.
    const errors = out.errors ?? out.windows.find((w: { time: string }) => w.time === "present").errors;
    assert.match(errors.join(), /value 'stalled' of port 'shaft-out' is not declared by carrier 'torque'/, s.name);
  }
});

test("isomorphism ignores declared behaviour, so isomorphic models can get different behaviour verdicts", () => {
  const pool = example("connection-pool");
  assert.ok(findIsomorphism(bearing(), pool).ok);
  const b = trimPreservesBehavior(bearing(), { trim: ["bearing"] });
  assert.ok(b.ok && b.verdict === "preserved");
  const r = trimPreservesBehavior(pool, { trim: ["pool"] });
  assert.ok(r.ok && r.verdict === "undecided");
});

test("the state cap fails closed: boundary valuations are checked before the search, and the search is bounded", () => {
  const wide: FunctionModel = {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "gate", name: "Gate", role: "tool",
        inputs: Array.from({ length: 17 }, (_, i) => ({ id: `i${i}`, carrier: "c" })), outputs: [{ id: "o", carrier: "c" }],
        behavior: [{ in: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`i${i}`, "0"])), out: { o: "0" } }] },
      { id: "p", name: "P", role: "product", inputs: [{ id: "in", carrier: "c" }] },
    ],
    wires: [{ id: "w", from: { box: "gate", port: "o" }, to: { box: "p", port: "in" }, carrier: "c", polarity: "useful" }],
  };
  assert.ok(2 ** 17 > MAX_STATES);
  assert.match(errors(externalBehavior(wide)), /the boundary inputs have 131072 valuations; the cap is 100000/);
  assert.match(errors(externalBehavior(bearing(), { maxStates: 3 })), /the steady-state search passed 3 states/);
  assert.match(errors(trimPreservesBehavior(bearing(), { trim: ["bearing"], maxStates: 3 })), /^baseline: the steady-state search passed 3 states/);
  const ok = externalBehavior(bearing(), { maxStates: 8 });
  assert.ok(ok.ok && ok.decided && ok.statesExplored === 8);
});

test("triz_behavior answers over the shared tool spec and fails closed", async () => {
  const spec = toolSpecs().find((s) => s.name === "triz_behavior")!;
  const call = async (args: unknown) => JSON.parse((await spec.handler(args)).content[0].text);
  assert.equal((await call({ model: bearing(), trim: ["bearing"] })).verdict, "preserved");
  assert.equal((await call({ model: bearing() })).relation[0].steadyStateCount, 2);
  assert.match((await call({ model: bearing(), absorb: { "w-support": { box: "housing", port: "bore" } } })).errors.join(), /absorb needs trim/);
  const bad = bearing();
  box(bad, "motor").behavior![0].out["shaft-out"] = "stalled";
  assert.equal((await call({ model: bad, trim: ["bearing"] })).ok, false);
  assert.equal(spec.shape.max_states.safeParse(MAX_STATES + 1).success, false);
});

/**
 * Why trimming is not stated as a Kan extension of what remains: with the same box trimmed, the
 * decided verdict changes with the absorber, which a statement about the remaining boxes cannot see.
 */
test("the decided trim depends on the absorber, not only on the trimmed boxes", () => {
  const source = (id: string, value: string) => ({ id, name: id, role: "mediator" as const, outputs: [{ id: "o", carrier: "c" }], behavior: [{ in: {}, out: { o: value } }] });
  const m: FunctionModel = {
    domain: "physical",
    carriers: [{ id: "c", layer: "energy", dimension: "W", values: ["a", "b"] }],
    boxes: [
      source("trimmed", "a"), source("same", "a"), source("other", "b"),
      { id: "product", name: "Product", role: "product", inputs: [{ id: "in", carrier: "c" }], behavior: [{ in: { in: "a" }, out: {} }, { in: { in: "b" }, out: {} }] },
    ],
    wires: [{ id: "w", from: { box: "trimmed", port: "o" }, to: { box: "product", port: "in" }, carrier: "c", polarity: "useful" }],
  };
  assert.ok(checkModel(m).ok);
  const keep = trimPreservesBehavior(m, { trim: ["trimmed"], absorb: { w: { box: "same", port: "o" } } });
  const lose = trimPreservesBehavior(m, { trim: ["trimmed"], absorb: { w: { box: "other", port: "o" } } });
  assert.ok(keep.ok && lose.ok);
  assert.equal(keep.verdict, "preserved");
  assert.equal(lose.verdict, "changed");
  assert.ok(lose.verdict === "changed" && lose.reason === "counterexample");
  assert.deepEqual(lose.counterexample.onlyBaseline, [["a"]]);
});
