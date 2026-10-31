import { test } from "node:test";
import assert from "node:assert/strict";
import { RelationPlan, type ScopedRelation } from "../src/act-relations.js";
import { externalBehavior } from "../src/act-behavior.js";
import { globalSeparation } from "../src/act-global.js";
import { relationFixture } from "./support/relations.js";

/** Independent exhaustive assignments: no kernel join, indexes or graph decomposition. */
function exhaustive(sets: ScopedRelation[], domains: string[][]) {
  const found: string[][] = [];
  const visit = (a: string[]) => {
    if (a.length < domains.length) { for (const x of domains[a.length]) visit([...a, x]); return; }
    if (sets.every(t => t.rows.some(r => r.every(([v, x]) => a[v] === x)))) found.push(a);
  };
  visit([]); return found;
}
const signature = (table: NonNullable<ReturnType<RelationPlan["project"]>>) => [...table.values()]
  .map(r => [r.input, [...r.outputs.keys()].sort(), r.count]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

test("trace observations count materialized valuations rather than factor or separator multiplicities", () => {
  for (const kind of ["hidden-factors", "separator-chain"] as const) {
    const f = relationFixture(kind, 10);
    for (const summarized of [false, true]) {
      let traces = 0;
      const plan = new RelationPlan(f.sets, { decompose: summarized, elimination: summarized && kind === "separator-chain" ? "always" : "off" });
      const table = plan.project(f.domains, f.boundary, f.observed, 3, { explored: 0, max: 100_000, onTrace: () => { traces++; } });
      assert.ok(table);
      const logical = [...table.values()].reduce((n, row) => n + row.count, 0);
      const samples = [...table.values()].reduce((n, row) => n + row.states.length, 0);
      assert.equal(traces, summarized ? samples : logical);
      if (summarized) assert.ok(traces < logical);
      if (summarized && kind === "separator-chain") assert.equal(plan.stats.elimination.applied, true);
    }
  }
});

test("compound indexes avoid single-column candidates while retaining exact outputs and provenance", () => {
  const f = relationFixture("tuple-chain", 5);
  const run = (compoundIndexes: boolean, maxIndexCells?: number) => {
    const plan = new RelationPlan(f.sets, { compoundIndexes, maxIndexCells }), budget = { explored: 0, max: 100_000 };
    const table = plan.project(f.domains, f.boundary, f.observed, 10, budget);
    assert.ok(table); return { table, stats: plan.stats };
  };
  const single = run(false), compound = run(true), scan = run(true, 0);
  assert.deepEqual(signature(compound.table), signature(single.table));
  assert.deepEqual(signature(compound.table), signature(scan.table));
  assert.equal(compound.stats.rowCandidates * 16, single.stats.rowCandidates);
  assert.ok(scan.stats.indexFallbacks > 0);
  const rows: ScopedRelation[] = [{ vars: [0, 1], rows: [
    [], [[0, ""]], [[1, "__proto__"]], [[0, ""], [1, "__proto__"]],
    [[0, "a,b"], [1, "[\"x\"]"]], [[0, "a"], [1, "b,[\"x\"]"]],
    [[0, "bad"], [0, "other"]], [[0, ""]], [[1, "__proto__"]],
  ] }];
  const collect = (indexed: boolean) => {
    const plan = new RelationPlan(rows, { indexed }), found: unknown[] = [], a = ["", "__proto__"];
    assert.equal(plan.enumerate(a, ids => { found.push([[...ids], [...a]]); }, { explored: 0, max: 100 }), true);
    assert.deepEqual(a, ["", "__proto__"]); return found;
  };
  assert.deepEqual(collect(true), collect(false));
});

test("multi-column indexed projections match exhaustive assignments on 200 larger tables", () => {
  let seed = 6151, lookups = 0;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 8; };
  const domains = Array.from({ length: 4 }, () => ["0", "1", "2"]);
  for (let n = 0; n < 200; n++) {
    const sets: ScopedRelation[] = [[0, 1, 2], [1, 2, 3]].map(vars => ({ vars,
      rows: Array.from({ length: 27 }, (_, row) => vars.map((v, i) => [v, String(Math.floor(row / 3 ** i) % 3)] as [number, string]))
        .filter(() => rand() % 4 !== 0) }));
    const all = exhaustive(sets, domains);
    for (const options of [{}, { compoundIndexes: false }, { indexed: false }, { maxIndexCells: 20 }]) {
      const plan = new RelationPlan(sets, options), table = plan.project(domains, [0, 1], [2, 3, 2], 10, { explored: 0, max: 10_000 });
      assert.ok(table); lookups += plan.stats.indexLookups;
      for (const row of table.values()) {
        const expected = all.filter(a => a[0] === row.input[0] && a[1] === row.input[1]);
        assert.equal(row.count, expected.length);
        assert.deepEqual([...row.outputs.keys()].sort(), [...new Set(expected.map(a => JSON.stringify([a[2], a[3], a[2]])))].sort());
        assert.equal(new Set(row.states.map(a => JSON.stringify(a))).size, row.states.length);
        assert.ok(row.states.every(a => expected.some(b => JSON.stringify(a) === JSON.stringify(b))));
      }
    }
  }
  assert.ok(lookups > 0);
});

test("indexed joins preserve sparse/repeated-variable row selections, provenance and caller assignments", () => {
  const sets: ScopedRelation[] = [
    { vars: [0, 1], rows: [[[0, "0"], [0, "1"]], [[0, "0"]], [[1, "1"]], [[0, "1"], [1, "0"]]] },
    { vars: [1], rows: [[[1, "0"]], [[1, "1"]]] },
    { vars: [], rows: [[]] },
  ];
  for (const x of [undefined, "0", "1"]) {
    const collect = (indexed: boolean, maxIndexCells?: number) => {
      const plan = new RelationPlan(sets, { indexed, maxIndexCells }), rows: unknown[] = [];
      const assign: Array<string | undefined> = [x, undefined];
      assert.equal(plan.enumerate(assign, picked => { rows.push([[...assign], [...picked]]); }, { explored: 0, max: 1000 }), true);
      assert.deepEqual(assign, [x, undefined]); return rows;
    };
    assert.deepEqual(collect(true), collect(false));
    assert.deepEqual(collect(true, 0), collect(false));
  }
  const snapshot = structuredClone(sets), assign: Array<string | undefined> = ["0", undefined];
  const p = new RelationPlan(sets);
  assert.equal(p.enumerate(assign, () => {}, { explored: 0, max: 1 }), false);
  assert.deepEqual(assign, ["0", undefined]);
  assert.deepEqual(sets, snapshot);
});

test("all projection/index ablations match independent exhaustive valuations on 300 finite networks", () => {
  let seed = 0x634523;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 8; };
  for (let sample = 0; sample < 300; sample++) {
    const n = 1 + rand() % 5, domains = Array.from({ length: n }, () => ["0", "1"]);
    const sets: ScopedRelation[] = Array.from({ length: 1 + rand() % 5 }, () => {
      const vars = [...new Set(Array.from({ length: rand() % 4 }, () => rand() % n))];
      const rows = Array.from({ length: 2 ** vars.length }, (_, mask) => vars.map((v, i) => [v, String((mask >> i) & 1)] as [number, string]))
        .filter(() => rand() % 3 !== 0);
      return { vars, rows };
    });
    // Full domains also bind isolated variables, independently of the table graph.
    sets.push(...domains.map((values, v) => ({ vars: [v], rows: values.map(x => [[v, x] as [number, string]]) })));
    const boundary = Array.from({ length: n }, (_, i) => i).filter(() => rand() % 3 === 0);
    const observed = Array.from({ length: n }, (_, i) => i).filter(() => rand() % 2 === 0);
    if (sample % 4 === 0 && observed.length) observed.push(observed[0]);
    const exact = exhaustive(sets, domains);
    for (const indexed of [false, true]) for (const decompose of [false, true]) {
      const p = new RelationPlan(sets, { indexed, decompose });
      const projected = p.project(domains, boundary, observed, 10, { explored: 0, max: 10000 });
      assert.ok(projected, `sample ${sample}`);
      for (const row of projected.values()) {
        const states = exact.filter(s => boundary.every((v, i) => s[v] === row.input[i]));
        assert.equal(row.count, states.length, `sample ${sample}`);
        assert.deepEqual([...row.outputs.keys()].sort(), [...new Set(states.map(s => JSON.stringify(observed.map(v => s[v]))))].sort());
        assert.equal(row.states.length, Math.min(10, states.length));
        assert.equal(new Set(row.states.map(s => JSON.stringify(s))).size, row.states.length);
        for (const s of row.states) assert.ok(states.some(t => JSON.stringify(s) === JSON.stringify(t)), `invalid sample ${sample}`);
      }
      const assignment: Array<string | undefined> = Array(n).fill(undefined);
      assert.equal(p.witness(assignment, { explored: 0, max: 10000 }), exact.length > 0);
      if (exact.length) assert.ok(exact.some(s => JSON.stringify(s) === JSON.stringify(assignment)));
    }
  }
});

test("independent hidden factors preserve multiplicative counts without materializing internal products", () => {
  const fixture = relationFixture("hidden-factors", 12), before = new RelationPlan(fixture.sets, { indexed: false, decompose: false, elimination: "off" });
  const after = new RelationPlan(fixture.sets), a = { explored: 0, max: 100000 }, b = { explored: 0, max: 100000 };
  const expected = before.project(fixture.domains, fixture.boundary, fixture.observed, 10, a)!;
  const actual = after.project(fixture.domains, fixture.boundary, fixture.observed, 10, b)!;
  assert.deepEqual(signature(actual), signature(expected));
  assert.equal(actual.get("[]")!.count, 4096);
  assert.ok(b.explored * 100 < a.explored, `${b.explored} vs ${a.explored}`);
  assert.equal(actual.get("[]")!.states.length, 10);
});

test("factor caches preserve correlated outputs, every boundary situation and explicit contradictions", () => {
  const fixture = relationFixture("boundary-factors", 5);
  const before = new RelationPlan(fixture.sets, { indexed: false, decompose: false }), after = new RelationPlan(fixture.sets);
  const expected = before.project(fixture.domains, fixture.boundary, fixture.observed, 10, { explored: 0, max: 100000 })!;
  const actual = after.project(fixture.domains, fixture.boundary, fixture.observed, 10, { explored: 0, max: 100000 })!;
  assert.deepEqual(signature(actual), signature(expected));
  assert.ok(after.stats.factorCacheHits > 0);
  assert.equal(after.stats.factorEvaluations, 10);
  for (const bad of [{ vars: [], rows: [] }, { vars: [10], rows: [[[10, "0"], [10, "1"]]] }] satisfies ScopedRelation[]) {
    const p = new RelationPlan([...fixture.sets, bad]);
    const result = p.project(fixture.domains, fixture.boundary, fixture.observed, 10, { explored: 0, max: 10000 })!;
    assert.ok([...result.values()].every(r => !r.count && !r.outputs.size && !r.states.length));
  }
});

test("output materialization and unsafe numeric state counts still refuse at the cap", () => {
  const f = relationFixture("hidden-factors", 8);
  const p = new RelationPlan(f.sets);
  assert.equal(p.project(f.domains, [], f.domains.map((_, i) => i), 10, { explored: 0, max: 80 }), undefined);
  const huge = relationFixture("hidden-factors", 54);
  assert.equal(new RelationPlan(huge.sets).project(huge.domains, [], huge.observed, 10, { explored: 0, max: 1000 }), undefined);
});

test("isolated internal variables and boundary-only observations retain their domains", () => {
  const p = new RelationPlan([{ vars: [0], rows: [[[0, "0"]]] }]);
  const table = p.project([["0", "1"], ["a", "b"], ["x", "y"]], [2], [1, 2], 10, { explored: 0, max: 100 });
  assert.ok(table);
  assert.equal(table.get('["x"]')!.count, 2);
  assert.deepEqual([...table.get('["x"]')!.outputs.keys()].sort(), ['["a","x"]', '["b","x"]']);
  assert.deepEqual([...table.get('["y"]')!.outputs.keys()].sort(), ['["a","y"]', '["b","y"]']);
});

test("whole behavior retains an inconsistent disconnected factor and global separation binds free variables", () => {
  const model = relationFixture("hidden-factors", 4).model!;
  const r = externalBehavior(model, { scope: "whole", fullRelation: true });
  assert.ok(r.ok && r.decided);
  assert.equal(r.relation[0].steadyStateCount, 16);
  const b = model.boxes.find(b => b.id === "hidden0")!;
  b.behavior = [{ in: { in: "0" }, out: { out: "1" } }, { in: { in: "1" }, out: { out: "0" } }];
  const bad = externalBehavior(model, { scope: "whole", fullRelation: true });
  assert.ok(bad.ok && bad.decided);
  assert.equal(bad.relation[0].steadyStateCount, 0);
  const free = globalSeparation({ variables: [{ id: "__proto__", values: ["a", "b"] }], regions: [] });
  assert.ok(free.ok && free.verdict === "satisfiable");
  assert.equal(free.witness.__proto__, "a");
});
