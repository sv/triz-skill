import { test } from "node:test";
import assert from "node:assert/strict";
import type { FunctionModel } from "../src/act.js";
import { compareBehavior, externalBehavior, operationalAdequacy, plan, weakestSpec, weaknessRanking } from "../src/act-behavior.js";

function identity(): FunctionModel {
  return {
    domain: "software",
    carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "f", name: "Function", role: "tool", inputs: [{ id: "x", carrier: "bit" }], outputs: [{ id: "y", carrier: "bit" }],
        behavior: ["0", "1"].map((x) => ({ in: { x }, out: { y: x } })) },
      { id: "p", name: "Product", role: "product", inputs: [{ id: "in", carrier: "bit" }],
        behavior: ["0", "1"].map((x) => ({ in: { in: x }, out: {} })) },
    ],
    wires: [{ id: "deliver", from: { box: "f", port: "y" }, to: { box: "p", port: "in" }, carrier: "bit", polarity: "useful" }],
  };
}
const acceptable = [{ carrier: "bit", values: ["0", "1"] }];

function withNegationLoop(): FunctionModel {
  const m = identity();
  m.boxes.push({ id: "loop", name: "Total negation", role: "tool", inputs: [{ id: "x", carrier: "bit" }], outputs: [{ id: "y", carrier: "bit" }],
    behavior: [{ in: { x: "0" }, out: { y: "1" } }, { in: { x: "1" }, out: { y: "0" } }] });
  m.wires.push({ id: "loopback", from: { box: "loop", port: "y" }, to: { box: "loop", port: "x" }, carrier: "bit", polarity: "useful" });
  return m;
}

test("whole scope composes a disconnected total negation cycle; total downstream boxes are insufficient", () => {
  const m = withNegationLoop();
  const upstream = externalBehavior(m);
  assert.ok(upstream.ok && upstream.decided);
  assert.equal(upstream.scope, "upstream");
  assert.deepEqual(upstream.partialDownstream, []);
  assert.deepEqual(upstream.relation.map((r) => r.outputs), [[["0"]], [["1"]]]);
  assert.match(upstream.assumption, /cycles \(even cycles of total boxes\)/);
  const whole = externalBehavior(m, { scope: "whole" });
  assert.ok(whole.ok && whole.decided);
  assert.equal(whole.scope, "whole");
  assert.deepEqual(whole.composed, ["f", "p", "loop"]);
  assert.deepEqual(whole.downstream, []);
  assert.deepEqual(whole.relation.map((r) => r.outputs), [[], []]);
  assert.match(whole.assumption, /Every box relation and every wire/);
  assert.doesNotMatch(whole.assumption, /assumed/);
  const changed = compareBehavior(identity(), m, { scope: "whole" });
  assert.ok(changed.ok && changed.verdict === "changed" && changed.reason === "counterexample");
  assert.equal(changed.direction, "baseline-contains-concept");
  assert.equal(changed.baseline.scope, "whole");
  assert.equal(changed.concept.scope, "whole");
});

test("whole scope catches inconsistent downstream fan-in, even when each participating box is total", () => {
  const m = identity();
  for (const x of ["0", "1"]) m.boxes.push({ id: `c${x}`, name: `Constant ${x}`, role: "tool", outputs: [{ id: "y", carrier: "bit" }], behavior: [{ in: {}, out: { y: x } }] });
  m.boxes.push({ id: "sink", name: "Total sink", role: "environment", inputs: [{ id: "x", carrier: "bit" }], behavior: ["0", "1"].map((x) => ({ in: { x }, out: {} })) });
  for (const x of ["0", "1"]) m.wires.push({ id: `feed${x}`, from: { box: `c${x}`, port: "y" }, to: { box: "sink", port: "x" }, carrier: "bit", polarity: "useful" });
  const local = externalBehavior(m);
  assert.ok(local.ok && local.decided);
  assert.deepEqual(local.partialDownstream, []);
  const full = externalBehavior(m, { scope: "whole" });
  assert.ok(full.ok && full.decided);
  assert.deepEqual(full.noSteadyState, [["0"], ["1"]]);
});

test("whole scope requires product and downstream behavior instead of silently making them total", () => {
  const m = identity();
  delete m.boxes[1].behavior;
  const local = externalBehavior(m);
  assert.ok(local.ok && local.decided);
  const full = externalBehavior(m, { scope: "whole" });
  assert.ok(full.ok && !full.decided);
  assert.deepEqual(full.missingBehavior, ["p"]);
  assert.equal(full.scope, "whole");
  assert.deepEqual(plan(m, [{ box: "p", port: "in" }], { scope: "whole" }).composed.map((b) => b.id), ["f", "p"]);
  const check = operationalAdequacy(m, acceptable, { scope: "whole" });
  assert.ok(check.ok && check.verdict === "undecided");
});

test("whole one-hole residual includes constraints of a downstream unknown box", () => {
  const baseline = identity();
  baseline.boxes.push({ id: "sink", name: "Partial sink", role: "environment", inputs: [{ id: "x", carrier: "bit" }], behavior: [{ in: { x: "0" }, out: {} }] });
  baseline.wires.push({ id: "dispose", from: { box: "f", port: "y" }, to: { box: "sink", port: "x" }, carrier: "bit", polarity: "useful" });
  const concept = structuredClone(baseline);
  delete concept.boxes[2].behavior;
  const local = weakestSpec(concept, baseline);
  assert.ok(!local.ok);
  const spec = weakestSpec(concept, baseline, { scope: "whole" });
  assert.ok(spec.ok && spec.verdict === "spec" && "box" in spec, "one box to specify, not a pair");
  assert.equal(spec.scope, "whole");
  assert.equal(spec.box, "sink");
  assert.deepEqual(spec.spec, [{ in: { x: "0" }, out: {} }]);
  assert.equal(spec.specRows, 1);
  concept.boxes[2].behavior = spec.spec;
  const compared = compareBehavior(baseline, concept, { scope: "whole" });
  assert.ok(compared.ok && compared.verdict === "preserved");
});

test("relation equality does not establish nonblocking adequacy at a dead required input", () => {
  const m = identity();
  m.boxes[0].behavior = m.boxes[0].behavior!.slice(0, 1);
  const equality = compareBehavior(m, structuredClone(m), { scope: "whole" });
  assert.ok(equality.ok && equality.verdict === "preserved");
  assert.equal(equality.emptyInBoth, 1);
  const adequate = operationalAdequacy(m, acceptable, { scope: "whole" });
  assert.ok(adequate.ok && adequate.verdict === "inadequate");
  assert.equal(adequate.nonblocking, false);
  assert.equal(adequate.allOutputsAcceptable, true);
  assert.deepEqual(adequate.blockedInputs, [[{ box: "f", port: "x", value: "1" }]]);
  const restricted = operationalAdequacy(m, acceptable, { scope: "whole", requiredInputs: [[{ box: "f", port: "x", value: "0" }]] });
  assert.ok(restricted.ok && restricted.verdict === "adequate");
  assert.equal(restricted.requiredSituationCount, 1);
  assert.equal(restricted.checkedAllBoundaryInputs, false);
});

test("adequacy rejects good-and-bad nondeterministic outputs at the same input", () => {
  const m = identity();
  m.boxes[0].behavior!.push({ in: { x: "0" }, out: { y: "1" } });
  const r = operationalAdequacy(m, [{ carrier: "bit", values: ["0"] }], { scope: "whole", requiredInputs: [[{ box: "f", port: "x", value: "0" }]] });
  assert.ok(r.ok && r.verdict === "inadequate");
  assert.equal(r.nonblocking, true);
  assert.equal(r.allOutputsAcceptable, false);
  assert.deepEqual(r.unacceptableOutputs, [{ input: [{ box: "f", port: "x", value: "0" }], outputs: [["1"]] }]);
});

test("adequacy validates complete required inputs and whole scope caps fail closed", () => {
  const invalid = operationalAdequacy(identity(), acceptable, { requiredInputs: [[]] });
  assert.ok(!invalid.ok);
  assert.equal(invalid.issues[0].code, "required-input-malformed");
  const cap = operationalAdequacy(identity(), acceptable, { scope: "whole", maxStates: 1 });
  assert.ok(cap.ok && cap.verdict === "undecided" && cap.reason === "state-cap");
  assert.equal(cap.scope, "whole");
  const ranking = weaknessRanking([{ id: "live", model: identity() }, { id: "loop", model: withNegationLoop() }], acceptable, { scope: "whole" });
  assert.ok(ranking.ok && ranking.verdict === "ranked");
  assert.deepEqual(ranking.weakest, ["live"]);
  assert.deepEqual(ranking.concepts.map((c) => c.admitted), [2, 0]);
  const bothEmpty = compareBehavior(withNegationLoop(), withNegationLoop(), { scope: "whole" });
  assert.ok(bothEmpty.ok && bothEmpty.verdict === "undecided" && bothEmpty.reason === "no-steady-state");
});

test("fullRelation returns exact finite relation data beyond the human summary limit", () => {
  const m = identity();
  const values = Array.from({ length: 60 }, (_, i) => String(i));
  m.carriers.push({ id: "operating", layer: "information", dimension: "condition", values });
  m.boxes[0].inputs = [{ id: "x", carrier: "operating" }];
  m.boxes[0].behavior = [{ in: { x: "0" }, out: { y: "0" } }];
  const summarized = externalBehavior(m, { scope: "whole" });
  const full = externalBehavior(m, { scope: "whole", fullRelation: true });
  assert.ok(summarized.ok && summarized.decided && full.ok && full.decided);
  assert.equal(summarized.relation.length, 50);
  assert.equal(summarized.relationTruncated, true);
  assert.equal(summarized.noSteadyState.length, 50);
  assert.equal(full.relation.length, 60);
  assert.equal(full.relationTruncated, false);
  assert.equal(full.noSteadyState.length, 59);
});

test("a total negation loop downstream of a deliverable also blocks the whole composite", () => {
  const m = withNegationLoop();
  const loop = m.boxes[2];
  loop.inputs!.push({ id: "drive", carrier: "bit" });
  loop.behavior = ["0", "1"].flatMap((drive) => ["0", "1"].map((x) => ({ in: { x, drive }, out: { y: x === "0" ? "1" : "0" } })));
  m.wires.push({ id: "downstream", from: { box: "f", port: "y" }, to: { box: "loop", port: "drive" }, carrier: "bit", polarity: "useful" });
  const upstream = externalBehavior(m);
  const whole = externalBehavior(m, { scope: "whole" });
  assert.ok(upstream.ok && upstream.decided && whole.ok && whole.decided);
  assert.deepEqual(upstream.partialDownstream, []);
  assert.equal(upstream.noSteadyState.length, 0);
  assert.equal(whole.noSteadyState.length, 2);
});
