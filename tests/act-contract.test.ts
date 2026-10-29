import { test } from "node:test";
import assert from "node:assert/strict";
import { checkModel, type FunctionModel } from "../src/act.js";
import { evaluateImplementations, enumerateAbsorberAssignments } from "../src/act-contract.js";

const metadata = {
  contract: { operating_envelope: "declared finite test envelope", resource_binding: "all-behavior-rows" as const },
  declared_harms: [], evidence: [{ claim: "All declared rows share this resource mode", source: "test declaration", operating_envelope: "declared finite test envelope" }],
};
const model = (value = "good", usd = 1): FunctionModel => ({
  domain: "software", carriers: [{ id: "signal", layer: "information", dimension: "bit", values: ["bad", "good"] }],
  boxes: [
    { id: "driver", name: "Driver", role: "tool", outputs: [{ id: "out", carrier: "signal" }], behavior: [{ in: {}, out: { out: value } }], feasibility: [{ provides: { out: 1 }, cost: { usd } }] },
    { id: "product", name: "Product", role: "product", inputs: [{ id: "in", carrier: "signal" }], behavior: ["bad", "good"].map((v) => ({ in: { in: v }, out: {} })), feasibility: [{ requires: { in: 1 } }] },
  ], wires: [{ id: "deliver", from: { box: "driver", port: "out" }, to: { box: "product", port: "in" }, carrier: "signal", polarity: "useful" }],
});
const contract = () => ({ target: model(), acceptable: [{ box: "product", port: "in", values: ["good"] }], budget: { usd: 5 } });
const alternative = (id: string, m: FunctionModel) => ({ ...metadata, id, model: m });

test("implementation contracts never combine a capable expensive mode with an incapable cheap mode", () => {
  const r = evaluateImplementations({ contract: contract(), alternatives: [alternative("capable-expensive", model("good", 10)), alternative("cheap-incapable", model("bad", 1))] });
  assert.ok(r.ok && r.verdict === "rejected", JSON.stringify(r));
  assert.ok("results" in r);
  assert.deepEqual(r.results.map((x) => x.reason), ["resource-infeasible", "behavior-changed"]);
  const yes = evaluateImplementations({ contract: contract(), alternatives: [alternative("one-joint-witness", model("good", 2))] });
  assert.ok(yes.ok && yes.verdict === "satisfied");
  assert.ok("satisfying" in yes);
  assert.deepEqual(yes.satisfying, ["one-joint-witness"]);
});

test("uncoupled resource rows, missing whole-system behavior, and caps fail closed", () => {
  const modes = model();
  modes.boxes[0].feasibility = [{ provides: { out: 1 }, cost: { usd: 1 } }, { provides: { out: 2 }, cost: { usd: 2 } }];
  assert.ok(checkModel(modes).ok);
  const r = evaluateImplementations({ contract: contract(), alternatives: [alternative("unbound", modes)] });
  assert.ok(r.ok && r.verdict === "undecided");
  assert.ok("results" in r);
  assert.equal(r.results[0].reason, "uncoupled-resource-modes");
  const missing = model(); delete missing.boxes[1].behavior;
  const u = evaluateImplementations({ contract: contract(), alternatives: [alternative("missing-sink", missing)] });
  assert.ok(u.ok && u.verdict === "undecided");
  const cap = evaluateImplementations({ contract: contract(), alternatives: [alternative("one", model())], max_work: 1 });
  assert.ok(cap.ok && cap.verdict === "undecided" && cap.complete === false);
  assert.equal(evaluateImplementations({ contract: contract(), alternatives: [alternative("one", model())], surprise: true }).ok, false);
});

test("every harmful wire requires disclosure and an explicitly allowed declared harm", () => {
  const m = model(); m.wires.push({ ...m.wires[0], id: "harm", polarity: "harmful" });
  const unlisted = evaluateImplementations({ contract: contract(), alternatives: [alternative("unlisted", m)] });
  assert.ok(unlisted.ok && unlisted.verdict === "undecided");
  const disclosed = { ...alternative("disclosed", m), declared_harms: [{ id: "risk", description: "Declared side effect", wire: "harm" }] };
  const refused = evaluateImplementations({ contract: contract(), alternatives: [disclosed] });
  assert.ok(refused.ok && refused.verdict === "rejected");
  const allowed = evaluateImplementations({ contract: { ...contract(), allowed_harms: ["risk"] }, alternatives: [disclosed] });
  assert.ok(allowed.ok && allowed.verdict === "satisfied");
});

test("absorber search includes every compatible port and complete assignments for several wires", () => {
  const m: FunctionModel = {
    domain: "software", carriers: model().carriers,
    boxes: [
      { id: "source", name: "Trimmed source", role: "tool", outputs: [{ id: "x", carrier: "signal" }, { id: "y", carrier: "signal" }], behavior: [{ in: {}, out: { x: "good", y: "good" } }], feasibility: [{ provides: { x: 1, y: 1 } }] },
      { id: "absorber", name: "Absorber", role: "tool", outputs: ["first-bad", "second-good", "third-bad", "fourth-good"].map((id) => ({ id, carrier: "signal" })), behavior: [{ in: {}, out: { "first-bad": "bad", "second-good": "good", "third-bad": "bad", "fourth-good": "good" } }], feasibility: [{ provides: { "first-bad": 1, "second-good": 1, "third-bad": 1, "fourth-good": 1 }, cost: { usd: 1 } }] },
      { id: "product", name: "Product", role: "product", inputs: [{ id: "a", carrier: "signal" }, { id: "b", carrier: "signal" }], behavior: ["bad", "good"].flatMap((a) => ["bad", "good"].map((b) => ({ in: { a, b }, out: {} }))), feasibility: [{ requires: { a: 1, b: 1 } }] },
    ], wires: ["a", "b"].map((port, i) => ({ id: `deliver-${port}`, from: { box: "source", port: ["x", "y"][i] }, to: { box: "product", port }, carrier: "signal", polarity: "useful" })),
  };
  const c = { target: m, acceptable: [{ carrier: "signal", values: ["good"] }], budget: { usd: 5 } };
  const r = enumerateAbsorberAssignments({ model: m, trim: ["source"], contract: c, implementation: metadata });
  assert.ok(r.ok && r.verdict === "satisfied", JSON.stringify(r));
  assert.ok("candidateCount" in r && "satisfyingCount" in r && "results" in r);
  assert.equal(r.candidateCount, 16);
  assert.equal(r.checkedCount, 16);
  assert.equal(r.satisfyingCount, 4);
  assert.equal(r.complete, true);
  assert.ok(r.results.some((x) => x.assignment["deliver-a"].port === "second-good" && x.assignment["deliver-b"].port === "fourth-good" && x.result.ok && x.result.verdict === "satisfied"));
  const cap = enumerateAbsorberAssignments({ model: m, trim: ["source"], contract: c, implementation: metadata, max_work: 1 });
  assert.ok(cap.ok && cap.verdict === "undecided" && cap.complete === false);
});


test("equal partial relations must still be adequate at every required operating input", () => {
  const partial = model();
  partial.boxes[0].inputs = [{ id: "gate", carrier: "signal" }];
  partial.boxes[0].behavior = [{ in: { gate: "good" }, out: { out: "good" } }];
  const c = { ...contract(), target: partial };
  const all = evaluateImplementations({ contract: c, alternatives: [alternative("partial", partial)] });
  assert.ok(all.ok && all.verdict === "rejected");
  assert.ok("results" in all && all.results[0].reason === "inadequate");
  const selected = evaluateImplementations({ contract: { ...c, required_inputs: [[{ box: "driver", port: "gate", value: "good" }]] }, alternatives: [alternative("one-envelope", partial)] });
  assert.ok(selected.ok && selected.verdict === "satisfied");
});


test("whole implementation contracts require explicit resource modes for disconnected boxes", () => {
  const m = model();
  m.boxes.push({ id: "extra", name: "Disconnected extra tool", role: "tool", behavior: [{ in: {}, out: {} }] });
  const c = { ...contract(), target: m };
  const missing = evaluateImplementations({ contract: c, alternatives: [alternative("missing-disconnected-resources", m)] });
  assert.ok(missing.ok && missing.verdict === "undecided");
  assert.ok("results" in missing);
  assert.equal(missing.results[0].reason, "missing-resource-mode");
  assert.ok("boxes" in missing.results[0]);
  assert.deepEqual(missing.results[0].boxes, ["extra"]);
  m.boxes[2].feasibility = [{}];
  const free = evaluateImplementations({ contract: c, alternatives: [alternative("explicit-zero-resources", m)] });
  assert.ok(free.ok && free.verdict === "satisfied");
  m.boxes[2].feasibility = [{ cost: { usd: 9 } }];
  const costly = evaluateImplementations({ contract: c, alternatives: [alternative("explicit-disconnected-cost", m)] });
  assert.ok(costly.ok && costly.verdict === "rejected");
  assert.ok("results" in costly && costly.results[0].reason === "resource-infeasible");
});


test("absorber search retains its satisfying witness beyond the fifty-result display limit", () => {
  const m = model();
  const ports = Array.from({ length: 51 }, (_, i) => `port-${i}`);
  m.boxes.splice(1, 0, {
    id: "absorber", name: "Many-port absorber", role: "tool",
    outputs: ports.map((id) => ({ id, carrier: "signal" })),
    behavior: [{ in: {}, out: Object.fromEntries(ports.map((id, i) => [id, i === 50 ? "good" : "bad"])) }],
    feasibility: [{ provides: Object.fromEntries(ports.map((id) => [id, 1])), cost: { usd: 1 } }],
  });
  const r = enumerateAbsorberAssignments({ model: m, trim: ["driver"], contract: { ...contract(), target: m }, implementation: metadata });
  assert.ok(r.ok && r.verdict === "satisfied", JSON.stringify(r));
  assert.ok("results" in r && "witness" in r && r.witness);
  assert.equal(r.candidateCount, 51);
  assert.equal(r.checkedCount, 51);
  assert.equal(r.satisfyingCount, 1);
  assert.equal(r.results.length, 50);
  assert.ok(r.results.every((x) => x.result.ok && x.result.verdict === "rejected"));
  assert.deepEqual(r.witness.assignment, { deliver: { box: "absorber", port: "port-50" } });
  assert.equal(r.witness.result.verdict, "satisfied");
  assert.deepEqual(r.witness.model.wires[0].from, { box: "absorber", port: "port-50" });
});


test("a resource binding assertion cannot override contradictory declared carrier levels", () => {
  const m = model();
  m.carriers[0].levels = [{ value: "bad", from: 0 }, { value: "good", from: 2 }];
  const c = { ...contract(), target: m, acceptable: [{ carrier: "signal", at_least: 2 }] };
  const r = evaluateImplementations({ contract: c, alternatives: [alternative("inconsistent-capacity", m)] });
  assert.ok(r.ok && r.verdict === "rejected", JSON.stringify(r));
  assert.ok("results" in r);
  const result = r.results[0];
  assert.equal(result.reason, "level-inconsistency");
  assert.ok("levelsConsistency" in result && result.levelsConsistency);
  assert.ok(result.levelsConsistency.inconsistencies.some((x) => x.box === "driver" && x.kind === "value-mismatch" && x.outputs[0].amount === 1 && x.outputs[0].value === "bad"));
  m.boxes[0].feasibility![0].provides!.out = 2;
  const fixed = evaluateImplementations({ contract: c, alternatives: [alternative("consistent-capacity", m)] });
  assert.ok(fixed.ok && fixed.verdict === "satisfied", JSON.stringify(fixed));
});
