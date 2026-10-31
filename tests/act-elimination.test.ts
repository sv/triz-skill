import { test } from "node:test";
import assert from "node:assert/strict";
import { RelationPlan, type RelationOptions, type ScopedRelation } from "../src/act-relations.js";
import { externalBehavior } from "../src/act-behavior.js";
import { relationFixture } from "./support/relations.js";
import { synthesisFixture } from "./support/synthesis.js";
import { synthesizeFinite } from "../src/act-synthesis.js";

/** Independent literal valuations; no join, normalization, graph or elimination helpers. */
function exhaustive(sets: ScopedRelation[], domains: string[][]) {
  const result: string[][] = [];
  const visit = (a: string[]) => {
    if (a.length < domains.length) { for (const x of domains[a.length]) visit([...a, x]); return; }
    if (sets.every(s => s.rows.some(row => row.every(([v, x]) => a[v] === x)))) result.push(a);
  };
  visit([]); return result;
}
function check(sets: ScopedRelation[], domains: string[][], boundary: number[], observed: number[], options: RelationOptions, limit = 10) {
  const states = exhaustive(sets, domains), plan = new RelationPlan(sets, options);
  const table = plan.project(domains, boundary, observed, limit, { explored: 0, max: 100_000 });
  assert.ok(table);
  assert.equal(table.size, boundary.reduce((n, v) => n * domains[v].length, 1));
  for (const row of table.values()) {
    const expected = states.filter(s => boundary.every((v, i) => s[v] === row.input[i]));
    assert.equal(row.count, expected.length);
    assert.deepEqual([...row.outputs.keys()].sort(), [...new Set(expected.map(s => JSON.stringify(observed.map(v => s[v]))))].sort());
    assert.equal(row.states.length, Math.min(limit, expected.length));
    assert.equal(new Set(row.states.map(s => JSON.stringify(s))).size, row.states.length);
    assert.ok(row.states.every(s => expected.some(t => JSON.stringify(s) === JSON.stringify(t))));
  }
  return { plan, table };
}

test("separator elimination matches independent exhaustive valuations on 400 finite networks", () => {
  let seed = 0x62713, applied = 0;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 8; };
  for (let trial = 0; trial < 400; trial++) {
    const n = 1 + rand() % 6, alphabet = trial % 3 ? ["0", "1"] : ["", "__proto__", "a,[\"b\"]"];
    const domains = Array.from({ length: n }, () => alphabet);
    const sets: ScopedRelation[] = Array.from({ length: 1 + rand() % 7 }, () => {
      const vars = [...new Set(Array.from({ length: rand() % 4 }, () => rand() % n))];
      const rows = Array.from({ length: alphabet.length ** vars.length }, (_, index) =>
        vars.map((v, i) => [v, alphabet[Math.floor(index / alphabet.length ** i) % alphabet.length]] as [number, string]))
        .filter(() => rand() % 4 !== 0);
      return { vars, rows };
    });
    const boundary = domains.flatMap((_, v) => rand() % 3 ? [] : [v]);
    const observed = domains.flatMap((_, v) => rand() % 2 ? [] : [v]);
    if (observed.length && trial % 2) observed.push(observed[0]);
    const snapshot = structuredClone(sets);
    for (const indexed of [false, true]) for (const decompose of [false, true]) {
      const { plan } = check(sets, domains, boundary, observed, { indexed, decompose, elimination: "always" }, trial % 3 ? 10 : 0);
      assert.equal(plan.stats.elimination.applied, true, JSON.stringify(plan.stats.elimination)); applied++;
    }
    check(sets, domains, boundary, observed, { elimination: "off" });
    assert.deepEqual(sets, snapshot);
  }
  assert.equal(applied, 1600);
});

test("connected chains, stars and cycles preserve exponential counts and valid bounded samples", () => {
  for (const kind of ["separator-chain", "separator-star", "separator-cycle"] as const) {
    const f = relationFixture(kind, 12), original = structuredClone(f.sets);
    const before = new RelationPlan(f.sets, { elimination: "off" }), after = new RelationPlan(f.sets);
    const a = { explored: 0, max: 100_000 }, b = { explored: 0, max: 100_000 };
    const expected = before.project(f.domains, f.boundary, f.observed, 10, a)!;
    const actual = after.project(f.domains, f.boundary, f.observed, 10, b)!;
    assert.ok(actual); assert.equal(after.stats.elimination.applied, true);
    assert.ok(b.explored * 20 < a.explored, `${kind}: ${b.explored} vs ${a.explored}`);
    for (const [key, row] of actual) {
      assert.equal(row.count, expected.get(key)!.count);
      assert.deepEqual([...row.outputs.keys()].sort(), [...expected.get(key)!.outputs.keys()].sort());
      assert.equal(row.count, 2 ** (kind === "separator-cycle" ? 11 : 12));
      assert.equal(row.states.length, 10);
      assert.equal(new Set(row.states.map(s => JSON.stringify(s))).size, 10);
      assert.ok(row.states.every(s => s.length === f.domains.length && f.sets.every(t => t.rows.some(r => r.every(([v, x]) => s[v] === x)))));
    }
    assert.deepEqual(f.sets, original);
  }
});

test("elimination caps discard all messages and retain the finite join as fallback", () => {
  const f = relationFixture("separator-chain", 4);
  for (const [limits, reason] of [
    [{ maxEliminationWork: 0 }, "work-cap"], [{ maxEliminationCells: 0 }, "storage-cap"], [{ maxSeparatorVariables: 0 }, "separator-cap"],
  ] as const) {
    const { plan } = check(f.sets, f.domains, f.boundary, f.observed, { elimination: "always", ...limits });
    assert.equal(plan.stats.elimination.applied, false); assert.equal(plan.stats.elimination.reason, reason);
    assert.ok(plan.stats.rowCandidates > 0);
  }
  const complete = check(f.sets, f.domains, f.boundary, f.observed, { elimination: "always" }).plan.stats.elimination;
  assert.equal(check(f.sets, f.domains, f.boundary, f.observed, { elimination: "always", maxEliminationWork: complete.work }).plan.stats.elimination.applied, true);
  assert.equal(check(f.sets, f.domains, f.boundary, f.observed, { elimination: "always", maxEliminationWork: complete.work - 1 }).plan.stats.elimination.reason, "work-cap");
  assert.equal(check(f.sets, f.domains, f.boundary, f.observed, { elimination: "always", maxEliminationCells: complete.cells - 1 }).plan.stats.elimination.reason, "storage-cap");
  const reusable = new RelationPlan(f.sets, { elimination: "always", maxEliminationWork: complete.work });
  for (let i = 0; i < 2; i++) {
    assert.ok(reusable.project(f.domains, f.boundary, f.observed, 10, { explored: 0, max: 100_000 }));
    assert.equal(reusable.stats.elimination.applied, true);
    assert.equal(reusable.stats.elimination.work, complete.work);
  }
  const p = new RelationPlan(f.sets, { elimination: "always" }), budget = { explored: 0, max: 1 };
  assert.equal(p.project(f.domains, f.boundary, f.observed, 10, budget), undefined);
  assert.equal(p.stats.elimination.reason, "state-cap");
  assert.equal(p.stats.countOverflow, false);
  assert.ok(budget.explored > budget.max);
});

test("pinned correlations, repeated observations, free variables and feedback survive elimination", () => {
  const sets: ScopedRelation[] = [
    { vars: [0, 1, 2], rows: [[[0, "0"], [1, "0"], [2, "1"]], [[0, "0"], [1, "1"], [2, "0"]], [[0, "1"], [1, "1"], [2, "1"]]] },
    { vars: [1, 2], rows: [[[1, "0"], [2, "1"]], [[1, "1"], [2, "0"]]] },
    { vars: [1], rows: [[[1, "0"], [1, "0"]], [[1, "1"], [1, "1"]], [[1, "0"], [1, "1"]]] },
    { vars: [], rows: [[]] },
  ];
  const domains = Array.from({ length: 5 }, () => ["0", "1"]);
  const { table } = check(sets, domains, [0, 4], [2, 1, 2, 4], { elimination: "always" });
  assert.equal(table.get('["1","0"]')!.count, 0);
  for (const bad of [{ vars: [], rows: [] }, { vars: [3], rows: [[[3, "0"], [3, "1"]]] }] satisfies ScopedRelation[]) {
    const r = check([...sets, bad], domains, [0, 4], [2, 1], { elimination: "always" });
    assert.ok([...r.table.values()].every(row => row.count === 0));
  }
});

test("huge counts remain exact until reporting and cannot mask a disconnected contradiction", () => {
  const f = relationFixture("separator-star", 54);
  const plan = new RelationPlan(f.sets, { elimination: "always", maxEliminationWork: 1_000_000 });
  assert.equal(plan.project(f.domains, f.boundary, f.observed, 0, { explored: 0, max: 100_000 }), undefined);
  assert.equal(plan.stats.countOverflow, true);
  assert.equal(plan.stats.elimination.reason, "count-overflow");
  const bad = new RelationPlan([...f.sets, { vars: [], rows: [] }], { elimination: "always" });
  const table = bad.project(f.domains, f.boundary, f.observed, 10, { explored: 0, max: 100_000 });
  assert.ok(table); assert.ok([...table.values()].every(r => r.count === 0)); assert.equal(bad.stats.countOverflow, false);
  // Min-fill eliminates this star (including its center) before the disconnected cycle.
  // Its nullary message exceeds 2^53 before a later nonempty-table contradiction appears.
  const [a, b, c] = [f.domains.length, f.domains.length + 1, f.domains.length + 2];
  const eq = (x: number, y: number): ScopedRelation => ({ vars: [x, y], rows: ["0", "1"].map(v => [[x, v], [y, v]]) });
  const late = new RelationPlan([...f.sets, eq(a, b), eq(b, c), { vars: [a, c], rows: [[[a, "0"], [c, "1"]], [[a, "1"], [c, "0"]]] }],
    { elimination: "always", maxEliminationWork: 1_000_000 });
  const result = late.project([...f.domains, ["0", "1"], ["0", "1"], ["0", "1"]], [], [], 0, { explored: 0, max: 100_000 });
  assert.ok(result); assert.equal(result.get("[]")!.count, 0); assert.equal(late.stats.countOverflow, false);
  assert.equal(late.stats.elimination.applied, true);
});

test("sparse rows fall back and complete normalized duplicates count assignments once", () => {
  const p = new RelationPlan([{ vars: [0, 1], rows: [[[0, "0"]]] }], { elimination: "always" });
  p.project([["0"], ["0", "1"]], [], [0], 10, { explored: 0, max: 100 });
  assert.equal(p.stats.elimination.reason, "sparse-relation"); assert.equal(p.stats.elimination.applied, false);
  check([{ vars: [0], rows: [[[0, "0"]], [[0, "0"], [0, "0"]]] }], [["0", "1"]], [], [0], { elimination: "always" });
});

test("behavior uses elimination on connected nondeterministic models and skips small deterministic queries", () => {
  const model = relationFixture("separator-chain", 12).model!;
  const before = externalBehavior(model, { scope: "whole", fullRelation: true, maxStates: 100_000, relationOptions: { elimination: "off" } });
  const after = externalBehavior(model, { scope: "whole", fullRelation: true, maxStates: 100_000 });
  assert.ok(before.ok && before.decided && after.ok && after.decided);
  assert.deepEqual(after.relation.map(r => [r.input, r.outputs, r.steadyStateCount]), before.relation.map(r => [r.input, r.outputs, r.steadyStateCount]));
  assert.equal(after.relationStats.elimination.applied, true);
  const small = externalBehavior(relationFixture("hidden-factors", 0).model!, { fullRelation: true });
  assert.ok(small.ok && small.decided); assert.equal(small.relationStats.elimination.attempted, false);
});

test("synthesis keeps implementation counts and resource costs distinct from eliminated state counts", () => {
  const input = synthesisFixture("separators", 9);
  const reference = synthesizeFinite({ ...input, strategy: "exhaustive" });
  const enabled = synthesizeFinite(input);
  for (const separator_elimination of [false, true]) {
    const result = synthesizeFinite({ ...input, optimizations: { ...input.optimizations, separator_elimination } });
    assert.ok(result.ok && result.complete && result.allDecided && "satisfyingCount" in result);
    assert.ok(reference.ok && reference.complete && "satisfyingCount" in reference);
    assert.equal(result.satisfyingCount, 2); assert.equal(result.satisfyingCount, reference.satisfyingCount);
    assert.deepEqual(result.witness?.choices, reference.witness?.choices);
    assert.deepEqual(result.results.map(r => [r.choices, r.result.verdict, "reason" in r.result ? r.result.reason : ""]),
      reference.results.map(r => [r.choices, r.result.verdict, "reason" in r.result ? r.result.reason : ""]));
  }
  assert.ok(enabled.ok && "results" in enabled);
  const result = enabled.results[0].result;
  assert.ok("behavior" in result && result.behavior && "concept" in result.behavior && result.behavior.concept.relationStats.elimination.applied);
});

test("elimination leaves explicit output products bounded and propagates outer work limits", () => {
  const f = relationFixture("hidden-factors", 10), plan = new RelationPlan(f.sets, { elimination: "always" });
  assert.equal(plan.project(f.domains, [], f.domains.map((_, v) => v), 0, { explored: 0, max: 100 }), undefined);
  assert.equal(plan.stats.elimination.reason, "state-cap");
  const limit = new Error("outer work limit"), constrained = new RelationPlan(f.sets, { elimination: "always" });
  assert.throws(() => constrained.project(f.domains, [], f.observed, 0, { explored: 0, max: 10_000, spend() { throw limit; } }), e => e === limit);
});
