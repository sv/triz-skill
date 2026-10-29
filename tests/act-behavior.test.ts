/**
 * Declared behaviour: typing of carrier values and behaviour rows (fail closed), the external
 * relation under the relational trace (identity loop, empty trace, several steady states,
 * fan-in, downstream boxes), and the decided trim: preserved, changed with a counterexample and
 * a direction, a lost deliverable, undecided, and the state cap.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel } from "../src/act.js";
import { externalBehavior, trimPreservesBehavior, deliverablePorts, MAX_STATES } from "../src/act-behavior.js";
import { segment, interpose } from "../src/act-rewrite.js";
import { findIsomorphism } from "../src/act-iso.js";
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
  assert.deepEqual(r.baseline.relation[0].outputs, r.trimmed.relation[0].outputs);
  assert.equal(r.baseline.relation[0].steadyStateCount, 2);
  assert.deepEqual(r.trimmed.composed, ["motor", "housing"]);
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
    baseline: [["rated", "supported"]], trimmed: [["rated", "unsupported"]],
    onlyBaseline: [["rated", "supported"]], onlyTrimmed: [["rated", "unsupported"]],
  });
  assert.equal(r.direction, "incomparable");
  assert.deepEqual([r.differingInputs, r.inputValuations], [1, 2]);
  assert.deepEqual(r.inputsOnlyIn, { baseline: [], trimmed: [{ box: "housing", port: "fit", carrier: "fit" }] });
});

test("decided trim: strict containment is changed, with its direction", () => {
  const loose = bearing();
  box(loose, "housing").behavior = [{ in: {}, out: { bore: "supported" } }, { in: {}, out: { bore: "unsupported" } }];
  const wider = trimPreservesBehavior(loose, { trim: ["bearing"] });
  assert.ok(wider.ok && wider.verdict === "changed" && wider.reason === "counterexample");
  assert.equal(wider.direction, "trimmed-contains-baseline");
  assert.deepEqual(wider.counterexample.onlyTrimmed, [["rated", "unsupported"]]);

  const worn = bearing();
  box(worn, "bearing").behavior!.push({ in: { "preload-in": "high" }, out: { race: "unsupported", friction: "high" } });
  const narrower = trimPreservesBehavior(worn, { trim: ["bearing"] });
  assert.ok(narrower.ok && narrower.verdict === "changed" && narrower.reason === "counterexample");
  assert.equal(narrower.direction, "baseline-contains-trimmed");
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
  assert.deepEqual([u.missingBehavior, u.missingIn], [["shaft"], { baseline: ["shaft"], trimmed: [] }]);
  const e = externalBehavior(noShaft);
  assert.deepEqual(e.ok && !e.decided && e.missingBehavior, ["shaft"]);

  const noHousing = bearing();
  delete box(noHousing, "housing").behavior;
  const v = trimPreservesBehavior(noHousing, { trim: ["bearing"] });
  assert.ok(v.ok && v.verdict === "undecided" && v.reason === "missing-behavior");
  assert.deepEqual(v.missingIn, { baseline: [], trimmed: ["housing"] });
  const before = externalBehavior(noHousing);
  assert.ok(before.ok && before.decided, "the housing is downstream until the trim");

  assert.match(errors(trimPreservesBehavior(bearing(), { trim: ["bearing", "housing"] })), /no typed absorber: the trim is blocked/);
  const noProduct = bearing();
  box(noProduct, "shaft").role = "mediator";
  assert.match(errors(externalBehavior(noProduct)), /no deliverables/);
  assert.deepEqual(deliverablePorts(noProduct), []);
});

test("constructions do not invent behaviour: new boxes from segment and interpose declare none", () => {
  const seg = segment(bearing(), { box: "bearing", parts: [{ id: "races", ports: ["preload-in", "race"] }, { id: "rolling", ports: ["friction"] }] });
  assert.ok(seg.ok);
  const r = externalBehavior(seg.model);
  assert.deepEqual(r.ok && !r.decided && r.missingBehavior, ["races", "rolling"]);
  const via = interpose(bearing(), { wire: "w-support", mediator: { id: "sleeve", name: "Sleeve" } });
  assert.ok(via.ok);
  const s = externalBehavior(via.model);
  assert.deepEqual(s.ok && !s.decided && s.missingBehavior, ["sleeve"]);
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
  assert.deepEqual([r.noSteadyState, r.inputValuations, r.emptyInBoth], [{ baseline: 1, trimmed: 1 }, 1, 1]);
  assert.match(r.note, /Neither model has a steady state at any of the 1 compared input valuations/);
  assert.deepEqual([r.baseline.noSteadyState, r.trimmed.noSteadyState], [[[]], [[]]]);

  const clean = trimPreservesBehavior(bearing(), { trim: ["bearing"] });
  assert.ok(clean.ok && clean.verdict === "preserved");
  assert.deepEqual([clean.noSteadyState, clean.emptyInBoth], [{ baseline: 0, trimmed: 0 }, 0]);
  assert.doesNotMatch(clean.note, /no steady state/);
});

test("decided trim: steady states in one model only is changed, with the empty side named", () => {
  // Trimming the negation loop: its delivered value now comes from the origin, which has a steady state.
  const m = loopWithProxy();
  box(m, "origin").outputs!.push({ id: "bit", carrier: "c" });
  box(m, "origin").behavior = [{ in: {}, out: { o: "served", bit: "0" } }];
  const r = trimPreservesBehavior(m, { trim: ["loop"], absorb: { "w-out": { box: "origin", port: "bit" } } });
  assert.ok(r.ok && r.verdict === "changed" && r.reason === "counterexample");
  assert.equal(r.direction, "trimmed-contains-baseline");
  assert.deepEqual([r.counterexample.baseline, r.counterexample.trimmed], [[], [["0", "served"]]]);
  assert.match(r.note, /The baseline has no steady state at this input/);
});

test("decided trim: inputs empty in both models agree, are counted, and do not decide the verdict alone", () => {
  const r = trimPreservesBehavior(loopWithProxy(true), { trim: ["proxy"] });
  assert.ok(r.ok && r.verdict === "preserved");
  assert.deepEqual(r.inputs.map((q) => `${q.box}.${q.port}`), ["loop.mode"]);
  assert.deepEqual([r.noSteadyState, r.inputValuations, r.emptyInBoth], [{ baseline: 1, trimmed: 1 }, 2, 1]);
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
    triz_rule_apply: { model: bad, rule_id: "mono-bi" },
  };
  const takesModel = toolSpecs().filter((s) => ["model", "present"].some((k) => k in s.shape));
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
