import { test } from "node:test";
import assert from "node:assert/strict";
import { type FunctionModel } from "../src/act.js";
import { synthesizeFinite } from "../src/act-synthesis.js";

const copy = ["0", "1"].map((value) => ({ in: { in: value }, out: { out: value } }));
const independent = ["0", "1"].flatMap((input) => ["0", "1"].map((output) => ({ in: { in: input }, out: { out: output } })));
const resource = (usd: number) => ({ provides: { out: 1 }, requires: { in: 1 }, cost: { usd } });
const target = (): FunctionModel => ({
  domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }],
  boxes: [
    { id: "source", name: "Shared random bit", role: "tool", outputs: [{ id: "out", carrier: "bit" }], behavior: ["0", "1"].map((out) => ({ in: {}, out: { out } })), feasibility: [{ provides: { out: 1 } }] },
    ...["left", "right"].map((id) => ({ id, name: id, role: "tool" as const, inputs: [{ id: "in", carrier: "bit" }], outputs: [{ id: "out", carrier: "bit" }], behavior: copy, feasibility: [resource(1)] })),
    { id: "product", name: "Joint product", role: "product", inputs: [{ id: "a", carrier: "bit" }, { id: "b", carrier: "bit" }], behavior: ["0", "1"].flatMap((a) => ["0", "1"].map((b) => ({ in: { a, b }, out: {} }))), feasibility: [{ requires: { a: 1, b: 1 } }] },
  ], wires: [
    ...["left", "right"].map((id) => ({ id: `source-${id}`, from: { box: "source", port: "out" }, to: { box: id, port: "in" }, carrier: "bit", polarity: "useful" as const })),
    ...["left", "right"].map((id, i) => ({ id: `${id}-product`, from: { box: id, port: "out" }, to: { box: "product", port: ["a", "b"][i] }, carrier: "bit", polarity: "useful" as const })),
  ],
});
const request = () => {
  const m = target();
  for (const b of m.boxes.filter((b) => ["left", "right"].includes(b.id))) { delete b.behavior; delete b.feasibility; }
  return {
    model: m,
    contract: { target: target(), acceptable: [{ carrier: "bit", values: ["0", "1"] }], budget: { usd: 5 } },
    implementation: { contract: { operating_envelope: "finite correlated-bit test", resource_binding: "all-behavior-rows" }, declared_harms: [], evidence: [{ claim: "Complete finite component relations supported by declared resource rows", source: "test library", operating_envelope: "finite correlated-bit test" }] },
    holes: ["left", "right"].map((box) => ({ box, alternatives: [{ id: "copy", behavior: copy, feasibility: resource(1) }, { id: "independent", behavior: independent, feasibility: resource(1) }] })),
  };
};

test("multi-hole search checks whole tuples and preserves output correlation", () => {
  const r = synthesizeFinite(request());
  assert.ok(r.ok && r.verdict === "synthesized", JSON.stringify(r));
  assert.ok("candidateSpace" in r && "witness" in r && r.witness);
  assert.equal(r.candidateSpace.size, 4);
  assert.equal(r.candidateSpace.enumerated, 4);
  assert.equal(r.candidateSpace.complete, true);
  assert.equal(r.satisfyingCount, 1);
  assert.deepEqual(r.witness.choices, { left: "copy", right: "copy" });
  assert.equal(r.results.filter((x) => x.result.verdict === "rejected" && x.result.reason === "behavior-changed").length, 3);
  assert.deepEqual(r.witness.model.wires, request().model.wires);
  assert.deepEqual(r.witness.model.carriers, request().model.carriers);
});

test("library impossibility combines all holes' resource demands under one budget", () => {
  const s = request();
  s.holes.forEach((h) => { h.alternatives = [{ id: "copy", behavior: copy, feasibility: resource(3) }]; });
  const r = synthesizeFinite(s);
  assert.ok(r.ok && r.verdict === "impossible-in-library", JSON.stringify(r));
  assert.ok("candidateSpace" in r && r.candidateSpace.complete && r.satisfyingCount === 0);
  assert.equal(r.results[0].result.reason, "resource-infeasible");
});

test("synthesis exposes incomplete search and validates libraries instead of inventing independent projections", () => {
  const capped = synthesizeFinite({ ...request(), max_work: 1 });
  assert.ok(capped.ok && capped.verdict === "undecided" && capped.complete === false);
  assert.equal(synthesizeFinite({ ...request(), unknown: true }).ok, false);
  const missing = request(); missing.holes[0].box = "ghost";
  assert.equal(synthesizeFinite(missing).ok, false);
  const duplicate = request(); duplicate.holes[1].box = "left";
  assert.equal(synthesizeFinite(duplicate).ok, false);
  const bad = request(); bad.holes[0].alternatives[0].behavior = [{ in: { in: "0" }, out: { out: "undeclared" } }];
  assert.equal(synthesizeFinite(bad).ok, false);
});
