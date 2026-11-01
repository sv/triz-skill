/**
 * Joint nondominated ranking: the frontier under declared directions, dominance witnesses with
 * the metrics a dominator wins, trade-offs between incomparable frontier members, equal metric
 * vectors staying on the frontier together, weights ordering only the listing, fail-closed
 * validation, and the renamed-twin invariance of every verdict part (ids move, numbers never).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pareto } from "../src/act-pareto.js";
import { toolSpecs } from "../src/tools.js";

const c = (id: string, metrics: Record<string, number>) => ({ id, metrics });

test("the frontier: dominated candidates get a witness naming the metrics a dominator wins", () => {
  const r = pareto({
    candidates: [
      c("cheap-heavy", { usd: 5, kg: 9 }),
      c("dear-light", { usd: 8, kg: 4 }),
      c("dear-heavy", { usd: 9, kg: 9 }),
    ],
  });
  assert.ok(r.ok && r.verdict === "ranked");
  assert.deepEqual(r.metrics, [{ name: "usd", direction: "minimize" }, { name: "kg", direction: "minimize" }]);
  assert.deepEqual(r.frontier, ["cheap-heavy", "dear-light"]);
  assert.deepEqual(r.dominated, [{ id: "dear-heavy", dominators: ["cheap-heavy", "dear-light"], witness: { by: "cheap-heavy", better: ["usd"] } }]);
  assert.deepEqual(r.tradeoffs, [{ a: "cheap-heavy", b: "dear-light", aBetter: ["usd"], bBetter: ["kg"] }]);
  assert.deepEqual(r.basis, ["pareto_not_total", "pareto_incomparable"]);
  assert.match(r.note, /pareto_not_total/);
});

test("maximize directions and equal metric vectors: equals share the frontier and no trade-off is invented", () => {
  const r = pareto({
    candidates: [c("a", { availability: 0.9, usd: 5 }), c("a-copy", { availability: 0.9, usd: 5 }), c("b", { availability: 0.8, usd: 5 })],
    directions: { availability: "maximize" },
  });
  assert.ok(r.ok);
  assert.ok(r.frontier.includes("a") && r.frontier.includes("a-copy") && !r.frontier.includes("b"), "equal vectors stay together; the lower availability is dominated");
  assert.deepEqual(r.dominated, [{ id: "b", dominators: ["a", "a-copy"], witness: { by: "a", better: ["availability"] } }]);
  assert.equal(r.tradeoffs, undefined, "equal vectors are duplicates, not a trade-off");
});

test("weights order the listing only: the frontier, witnesses and trade-offs never move", () => {
  const candidates = [c("cheap-heavy", { usd: 5, kg: 9 }), c("dear-light", { usd: 8, kg: 4 })];
  const plain = pareto({ candidates });
  const weighted = pareto({ candidates, weights: { usd: 10, kg: 1 } });
  assert.ok(plain.ok && weighted.ok);
  assert.deepEqual(plain.frontier, ["cheap-heavy", "dear-light"], "declaration order lists cheap-heavy first");
  assert.deepEqual(new Set(plain.frontier), new Set(weighted.frontier));
  assert.deepEqual(weighted.frontier, ["cheap-heavy", "dear-light"], "a usd-heavy weighting keeps cheap-heavy first");
  assert.ok(weighted.weightedListing);
  assert.match(weighted.weightedListing, /never move under weights/);
  const flip = pareto({ candidates, weights: { usd: 1, kg: 10 } });
  assert.ok(flip.ok && flip.frontier.indexOf("dear-light") < flip.frontier.indexOf("cheap-heavy"), "a kg-heavy weighting flips the listing");
  assert.deepEqual(new Set(flip.frontier), new Set(plain.frontier));
});

test("fails closed: mismatched metrics, unknown directions or weights, duplicate ids, empty metrics", () => {
  const mismatch = pareto({ candidates: [c("a", { usd: 1 }), c("b", { kg: 2 })] });
  assert.ok(!mismatch.ok && mismatch.issues[0].path === "$.candidates[0]" && /does not report 'kg'/.test(mismatch.issues[0].message));
  const dir = pareto({ candidates: [c("a", { usd: 1 })], directions: { kg: "maximize" } });
  assert.ok(!dir.ok && /unknown metric 'kg'/.test(dir.issues[0].message));
  const weight = pareto({ candidates: [c("a", { usd: 1 })], weights: { kg: 2 } });
  assert.ok(!weight.ok && weight.issues[0].code === "invalid-weight" && /unknown metric 'kg'/.test(weight.issues[0].message));
  const twice = pareto({ candidates: [c("a", { usd: 1 }), c("a", { usd: 2 })] });
  assert.ok(!twice.ok && /listed more than once/.test(twice.issues[0].message));
  const empty = pareto({ candidates: [c("a", {})] });
  assert.ok(!empty.ok && /empty metric record/.test(empty.issues[0].message));
});

test("the shared tool spec serves the same verdicts", async () => {
  const spec = toolSpecs().find((s) => s.name === "triz_pareto")!;
  assert.ok(spec);
  const out = JSON.parse((await spec.handler({ candidates: [c("a", { usd: 1, kg: 5 }), c("b", { usd: 2, kg: 2 })] })).content[0].text);
  assert.ok(out.ok && out.frontier.join() === "a,b" && out.tradeoffs.length === 1);
});

test("renaming candidates and metrics moves ids and names, never a verdict part", () => {
  // The twin of a pareto request: ids and metric names are free labels; numbers and directions stay.
  const token = (s: string) => `x ${s} x`;
  const candidates = [c("cheap-heavy", { usd: 5, kg: 9 }), c("dear-heavy", { usd: 9, kg: 9 }), c("cheap-light", { usd: 4, kg: 3 })];
  const a = pareto({ candidates });
  const b = pareto({ candidates: candidates.map((x) => c(token(x.id), Object.fromEntries(Object.entries(x.metrics).map(([n, v]) => [token(n), v])))) });
  assert.ok(a.ok && b.ok);
  const map = (ids: string[]) => ids.map(token);
  const mapDominated = (ds: Array<{ id: string; dominators: string[]; witness: { by: string; better: string[] } }>) => ds.map((d) => ({ ...d, id: token(d.id), dominators: map(d.dominators), witness: { by: token(d.witness.by), better: d.witness.better.map(token) } }));
  const mapTradeoffs = (ts: Array<{ a: string; b: string; aBetter: string[]; bBetter: string[] }>) => ts.map((t) => ({ a: token(t.a), b: token(t.b), aBetter: t.aBetter.map(token), bBetter: t.bBetter.map(token) }));
  assert.deepEqual(b.frontier, map(a.frontier));
  assert.deepEqual(b.dominated, a.dominated && mapDominated(a.dominated));
  assert.deepEqual(b.tradeoffs, a.tradeoffs && mapTradeoffs(a.tradeoffs));
  assert.deepEqual(b.basis, a.basis);
});
