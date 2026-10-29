import { test } from "node:test";
import assert from "node:assert/strict";
import { checkModel } from "../src/act.js";
import { analyzeQueue, compileQueueModel, checkConservation } from "../src/act-quantitative.js";

const queue = { time_unit: "1 ms", quantity_unit: "requests", arrivals: [[0], [0], [8]], service_capacity: 3, storage_capacity: 5, initial_backlog: 0, schedule: "arrive-then-serve" };

test("finite queue compiler emits a valid transition model and catches bursts despite average arrival below service", () => {
  const compiled = compileQueueModel(queue);
  assert.ok(compiled.ok && compiled.verdict === "compiled");
  assert.ok(checkModel(compiled.model).ok);
  assert.ok(8 / 3 < queue.service_capacity);
  const r = analyzeQueue(queue);
  assert.ok(r.ok && r.verdict === "overflow", JSON.stringify(r));
  assert.ok("dynamics" in r && r.dynamics.decided && r.dynamics.escalation?.verdict === "reachable");
  assert.equal(r.dynamics.escalation.time, 2);
});

test("queue examines alternatives at every slot and honors initial backlog and event order", () => {
  const alternative = analyzeQueue({ ...queue, arrivals: [[0, 6], [0]] });
  assert.ok(alternative.ok && alternative.verdict === "overflow");
  const before = analyzeQueue({ ...queue, arrivals: [[3]], initial_backlog: 5 });
  assert.ok(before.ok && before.verdict === "overflow");
  const after = analyzeQueue({ ...queue, arrivals: [[3]], initial_backlog: 5, schedule: "serve-then-arrive" });
  assert.ok(after.ok && after.verdict === "within-capacity");
  const zero = analyzeQueue({ ...queue, arrivals: [[0]], storage_capacity: 0 });
  assert.ok(zero.ok && zero.verdict === "within-capacity");
});

test("queue rejects unknown fields and invalid backlogs, and caps cannot establish capacity safety", () => {
  assert.equal(analyzeQueue({ ...queue, extra: true }).ok, false);
  assert.equal(analyzeQueue({ ...queue, initial_backlog: 6 }).ok, false);
  assert.equal(analyzeQueue({ ...queue, time_unit: "" }).ok, false);
  const r = analyzeQueue({ ...queue, max_work: 1 });
  assert.ok(r.ok && r.verdict === "undecided" && r.complete === false);
});

test("five conserved units cannot meet two simultaneous four-unit demands, while a shared intensive level can", () => {
  const s = { operation: "splitter", quantity_kind: "extensive", unit: "units", inputs: [{ port: "supply", amount: 5 }], outputs: [{ port: "first", amount: 4 }, { port: "second", amount: 4 }] };
  const conserved = checkConservation(s);
  assert.ok(conserved.ok && conserved.verdict === "infeasible");
  assert.ok("required" in conserved && conserved.required === 8);
  const shared = checkConservation({ ...s, quantity_kind: "intensive" });
  assert.ok(shared.ok && shared.verdict === "feasible");
  const merge = checkConservation({ ...s, operation: "merge", inputs: [{ port: "a", amount: 3 }, { port: "b", amount: 2 }], outputs: [{ port: "out", amount: 5 }], allow_loss: false });
  assert.ok(merge.ok && merge.verdict === "feasible");
  const loss = checkConservation({ ...s, outputs: [{ port: "out", amount: 4 }], allow_loss: false });
  assert.ok(loss.ok && loss.verdict === "infeasible");
  assert.equal(checkConservation({ ...s, magic: true }).ok, false);
  const cap = checkConservation({ ...s, max_work: 1 });
  assert.ok(cap.ok && cap.verdict === "undecided");
});
