import { test } from "node:test";
import assert from "node:assert/strict";
import type { FunctionModel } from "../src/act.js";
import { weaknessRanking, type JointPriorRow } from "../src/act-behavior.js";

const acceptable = [{ carrier: "bit", values: ["1"] }];
function concept(values: string[], admitted: (x: string, z?: string) => boolean, joint = false): FunctionModel {
  const situations: Array<Record<string, string>> = values.flatMap((x) => joint ? values.map((z) => ({ x, z })) : [{ x }]);
  return {
    domain: "software",
    carriers: [
      { id: "condition", layer: "information", dimension: "operating condition", values },
      { id: "bit", layer: "information", dimension: "result", values: ["0", "1"] },
    ],
    boxes: [
      { id: "f", name: "Concept", role: "tool", inputs: [{ id: "x", carrier: "condition" }, ...(joint ? [{ id: "z", carrier: "condition" }] : [])], outputs: [{ id: "y", carrier: "bit" }],
        behavior: situations.map((input) => ({ in: input, out: { y: admitted(input.x, input.z) ? "1" : "0" } })) },
      { id: "p", name: "Product", role: "product", inputs: [{ id: "in", carrier: "bit" }], behavior: ["0", "1"].map((x) => ({ in: { in: x }, out: {} })) },
    ],
    wires: [{ id: "out", from: { box: "f", port: "y" }, to: { box: "p", port: "in" }, carrier: "bit", polarity: "useful" }],
  };
}
const weighted = (values: Array<[string, number]>): JointPriorRow[] => values.map(([value, weight]) => ({ input: [{ box: "f", port: "x", value }], weight }));
const two = () => [{ id: "zero", model: concept(["0", "1"], (x) => x === "0") }, { id: "one", model: concept(["0", "1"], (x) => x === "1") }];

test("an explicit joint prior orders incomparable concepts without changing their inclusion order", () => {
  const a = weaknessRanking(two(), acceptable, { scope: "whole", prior: weighted([["0", 8], ["1", 2]]) });
  const b = weaknessRanking(two(), acceptable, { scope: "whole", prior: weighted([["0", 2], ["1", 8]]) });
  assert.ok(a.ok && a.verdict === "ranked" && b.ok && b.verdict === "ranked");
  assert.equal(a.scope, "whole");
  assert.equal(a.pairs[0].order, "incomparable");
  assert.deepEqual(a.pairs[0].basis, ["incomparable_of_witnesses"]);
  assert.deepEqual(a.pairs, b.pairs);
  assert.deepEqual(a.byCount, b.byCount);
  assert.deepEqual(a.byPrior?.map((c) => c.id), ["zero", "one"]);
  assert.deepEqual(b.byPrior?.map((c) => c.id), ["one", "zero"]);
  assert.deepEqual(a.byPrior?.map((c) => c.admittedProbability), [0.8, 0.2]);
  assert.deepEqual(a.prior, { kind: "joint", totalWeight: 10, coveredSituations: 2 });
});

test("a strict inclusion can tie under a prior with zero mass on the extra situations", () => {
  const models = [{ id: "narrow", model: concept(["0", "1"], (x) => x === "0") }, { id: "wide", model: concept(["0", "1"], () => true) }];
  const r = weaknessRanking(models, acceptable, { prior: weighted([["0", 1], ["1", 0]]) });
  assert.ok(r.ok && r.verdict === "ranked");
  assert.deepEqual(r.weakest, ["wide"]);
  assert.equal(r.pairs[0].order, "second-weaker");
  assert.deepEqual(r.byCount, [{ id: "wide", admitted: 2 }, { id: "narrow", admitted: 1 }]);
  assert.deepEqual(r.byPrior?.map((c) => c.admittedProbability), [1, 1]);
});

test("splitting a carrier value preserves its total prior mass while counts change", () => {
  const coarse = weaknessRanking([{ id: "a", model: concept(["normal", "hot"], (x) => x === "normal") }], acceptable,
    { prior: weighted([["normal", 8], ["hot", 2]]) });
  const fine = weaknessRanking([{ id: "a", model: concept(["normal-a", "normal-b", "hot"], (x) => x.startsWith("normal")) }], acceptable,
    { prior: weighted([["normal-a", 3], ["normal-b", 5], ["hot", 2]]) });
  assert.ok(coarse.ok && coarse.verdict === "ranked" && fine.ok && fine.verdict === "ranked");
  assert.equal(coarse.concepts[0].admitted, 1);
  assert.equal(fine.concepts[0].admitted, 2);
  assert.equal(coarse.byPrior?.[0].admittedWeight, fine.byPrior?.[0].admittedWeight);
  assert.equal(coarse.byPrior?.[0].admittedProbability, fine.byPrior?.[0].admittedProbability);
});

test("correlated input weights are consumed jointly, with no independence assumption", () => {
  const models = [{ id: "same", model: concept(["0", "1"], (x, z) => x === z, true) }, { id: "different", model: concept(["0", "1"], (x, z) => x !== z, true) }];
  const prior: JointPriorRow[] = ["0", "1"].flatMap((x) => ["0", "1"].map((z) => ({
    // Deliberately reverse endpoint order: the assignment is keyed by port, not array position.
    input: [{ box: "f", port: "z", value: z }, { box: "f", port: "x", value: x }], weight: x === z ? 45 : 5,
  })));
  const r = weaknessRanking(models, acceptable, { prior });
  assert.ok(r.ok && r.verdict === "ranked");
  assert.deepEqual(r.byCount.map((c) => c.admitted), [2, 2]);
  assert.deepEqual(r.byPrior?.map((c) => c.admittedProbability), [0.9, 0.1]);
});

test("invalid and incomplete joint priors fail closed, including omitted zero mass", () => {
  const good = weighted([["0", 1], ["1", 0]]);
  const broken: JointPriorRow[][] = [
    weighted([["0", -1], ["1", 2]]),
    weighted([["0", Infinity], ["1", 0]]),
    weighted([["0", NaN], ["1", 0]]),
    weighted([["0", 0], ["1", 0]]),
    weighted([["0", Number.MAX_VALUE], ["1", Number.MAX_VALUE]]),
    [good[0]],
    [good[0], good[0]],
    [{ input: [], weight: 1 }, good[1]],
    [{ input: [{ box: "f", port: "unknown", value: "0" }], weight: 1 }, good[1]],
    [{ input: [{ box: "f", port: "x", value: "missing" }], weight: 1 }, good[1]],
    [{ input: [{ box: "f", port: "x", value: "0" }, { box: "f", port: "x", value: "0" }], weight: 1 }, good[1]],
  ];
  for (const prior of broken) {
    const r = weaknessRanking(two(), acceptable, { prior });
    assert.ok(!r.ok, JSON.stringify(prior));
    assert.ok(r.issues.every((i) => i.code === "prior-malformed"));
  }
  const missingMass = weaknessRanking(two(), acceptable, { prior: [good[0]] });
  assert.ok(!missingMass.ok);
  assert.match(missingMass.errors.join("; "), /mass is missing/);
});

test("omitting the prior leaves inclusion and count outputs available without probability claims", () => {
  const r = weaknessRanking(two(), acceptable);
  assert.ok(r.ok && r.verdict === "ranked");
  assert.equal(r.byPrior, undefined);
  assert.equal(r.prior, undefined);
  assert.equal(r.pairs[0].order, "incomparable");
});
