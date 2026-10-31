import { test } from "node:test";
import assert from "node:assert/strict";
import { propagateRows, semijoinRows, type PropagationSet } from "../src/act-propagation.js";
import { bindRow, deliverablePorts, externalBehavior, joinRows, plan, portVariables } from "../src/act-behavior.js";
import type { FunctionModel } from "../src/act.js";
import { relationFixture } from "./support/relations.js";

/** Independent exhaustive valuations over original finite domains. */
function solutions(sets: PropagationSet[], domains: string[][]): string[][] {
  const all: string[][] = [];
  const visit = (a: string[]) => {
    if (a.length < domains.length) { for (const x of domains[a.length]) visit([...a, x]); return; }
    if (sets.every(s => s.rows.some(row => row.every(([i, x]) => a[i] === x)))) all.push(a);
  };
  visit([]); return all;
}

test("semijoins retain correlations across a multi-variable overlap", () => {
  const sets: PropagationSet[] = [
    { vars: [0, 1], rows: [[[0, "0"], [1, "0"]], [[0, "1"], [1, "1"]]] },
    { vars: [0, 1], rows: [[[0, "0"], [1, "1"]], [[0, "1"], [1, "0"]]] },
  ];
  const unary = propagateRows(sets, [["0", "1"], ["0", "1"]]);
  assert.deepEqual(unary.sets, sets);
  const overlap = semijoinRows(unary.sets);
  assert.equal(overlap.status, "complete");
  assert.ok(overlap.sets.some(s => s.rows.length === 0));
});

test("indexed overlap supports match scan and independent exhaustive valuations", () => {
  let seed = 7823;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 8; };
  const alphabet = ["", "__proto__", "a,b[\"x\"]"], domains = Array.from({ length: 4 }, () => alphabet);
  for (let n = 0; n < 300; n++) {
    const sets: PropagationSet[] = Array.from({ length: 2 + rand() % 4 }, () => {
      const cols = Array.from({ length: 1 + rand() % 6 }, () => rand() % 4);
      return { vars: [...new Set(cols)], rows: Array.from({ length: 8 + rand() % 16 }, () =>
        cols.filter(() => rand() % 8 !== 0).map(v => [v, alphabet[rand() % 3]] as [number, string])) };
    });
    const snapshot = structuredClone(sets), scan = semijoinRows(sets, 1_000_000, { indexed: false }), indexed = semijoinRows(sets);
    assert.equal(scan.status, "complete"); assert.equal(indexed.status, "complete");
    assert.deepEqual(indexed.sets, scan.sets);
    assert.deepEqual(solutions(indexed.sets, domains), solutions(sets, domains));
    assert.deepEqual(semijoinRows(sets, 1_000_000, { maxIndexCells: 0 }).sets, scan.sets);
    assert.deepEqual(semijoinRows(indexed.sets).sets, indexed.sets);
    for (const cap of [0, Math.floor(indexed.work / 2), indexed.work - 1, indexed.work]) {
      const result = semijoinRows(sets, cap);
      if (result.status === "fallback") assert.equal(result.sets, sets);
      else assert.deepEqual(result.sets, indexed.sets);
    }
    assert.deepEqual(sets, snapshot);
  }
});

test("support indexes are invalidated as pruning travels back through a chain", () => {
  const values = Array.from({ length: 16 }, (_, i) => String(i));
  const sets: PropagationSet[] = Array.from({ length: 12 }, (_, i) => ({ vars: [i, i + 1],
    rows: values.map(x => [[i, x], [i + 1, x]]) }));
  sets.push({ vars: [12], rows: values.slice(0, 8).map(x => [[12, x]]) });
  const result = semijoinRows(sets), scan = semijoinRows(sets, 1_000_000, { indexed: false });
  assert.equal(result.status, "complete"); assert.deepEqual(result.sets, scan.sets);
  assert.ok(result.stats.indexBuilds > 0);
  // Eight survivors still qualify for indexing. A stale sixteen-row index would retain
  // removed supports in the next table, rather than merely taking the tiny-table scan path.
  assert.ok(result.sets.every(s => s.rows.length === 8 && s.rows.every(row => row.every(([, x]) => Number(x) < 8))));
  assert.ok(result.stats.rowComparisons < scan.stats.rowComparisons);
});

test("hash semijoins remove quadratic correlation checks and fit a formerly exhausted allowance", () => {
  const f = relationFixture("overlap-contradiction", 512), snapshot = structuredClone(f.sets);
  const scan = semijoinRows(f.sets, 10_000_000, { indexed: false }), indexed = semijoinRows(f.sets);
  assert.equal(scan.status, "complete"); assert.equal(indexed.status, "complete");
  assert.deepEqual(indexed.sets, scan.sets);
  assert.equal(indexed.stats.rowComparisons, 0);
  assert.ok(scan.stats.rowComparisons >= 512 * 512);
  assert.ok(indexed.work * 20 < scan.work);
  assert.equal(semijoinRows(f.sets, indexed.work, { indexed: false }).status, "fallback");
  assert.equal(semijoinRows(f.sets, indexed.work).status, "complete");
  const capped = semijoinRows(f.sets, indexed.work - 1);
  assert.equal(capped.status, "fallback"); assert.equal(capped.sets, f.sets);
  assert.deepEqual(f.sets, snapshot);
  const before = externalBehavior(f.model!, { fullRelation: true, relationOptions: { indexed: false } });
  const after = externalBehavior(f.model!, { fullRelation: true });
  assert.ok(before.ok && before.decided && after.ok && after.decided);
  assert.deepEqual(after.relation, before.relation);
  assert.deepEqual(after.noSteadyState, [[]]);
  assert.equal(after.propagation.status, "complete");
  assert.equal(after.propagation.semijoin?.rowComparisons, 0);
});

test("semijoins preserve exact solutions with wildcards and repeated variables, and discard capped work", () => {
  let seed = 1927;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 8; };
  const domains = Array.from({ length: 3 }, () => ["0", "1"]);
  for (let k = 0; k < 150; k++) {
    const sets: PropagationSet[] = Array.from({ length: 1 + rand() % 4 }, () => {
      const cols = Array.from({ length: rand() % 5 }, () => rand() % 3);
      return { vars: [...new Set(cols)], rows: Array.from({ length: rand() % 5 }, () =>
        cols.filter(() => rand() % 4 !== 0).map(v => [v, String(rand() % 2)] as [number, string])) };
    });
    const snapshot = structuredClone(sets), exact = solutions(sets, domains), full = semijoinRows(sets);
    assert.equal(full.status, "complete");
    assert.deepEqual(solutions(full.sets, domains), exact);
    assert.deepEqual(semijoinRows(full.sets).sets, full.sets);
    for (const cap of [0, Math.floor(full.work / 2), full.work - 1, full.work]) {
      const result = semijoinRows(sets, cap);
      if (result.status === "fallback") assert.equal(result.sets, sets);
      else assert.deepEqual(solutions(result.sets, domains), exact);
    }
    assert.deepEqual(sets, snapshot);
  }
});

test("nonempty semijoin-consistent full tables on a join tree have a global solution", () => {
  const domains = Array.from({ length: 5 }, () => ["0", "1"]);
  for (let mask = 0; mask < 256; mask++) {
    // Running-intersection order: {0,1,2} -- {1,2,3} -- {2,3,4}.
    const sets: PropagationSet[] = [[0, 1, 2], [1, 2, 3], [2, 3, 4]].map((vars, t) => ({
      vars, rows: Array.from({ length: 8 }, (_, n) => vars.map((v, bit) => [v, String((n >> bit) & 1)] as [number, string]))
        .filter((_, n) => ((mask * (2 * t + 1) + t) >> n) & 1),
    }));
    const result = semijoinRows(sets), exact = solutions(sets, domains);
    assert.equal(result.status, "complete");
    assert.deepEqual(solutions(result.sets, domains), exact);
    assert.equal(result.sets.every(s => s.rows.length > 0), exact.length > 0);
    if (exact.length) for (const set of result.sets) for (const row of set.rows) {
      assert.ok(exact.some(a => row.every(([v, x]) => a[v] === x)));
    }
  }
  const eq = (x: number, y: number): PropagationSet => ({ vars: [x, y], rows: [[[x, "0"], [y, "0"]], [[x, "1"], [y, "1"]]] });
  const cyclic = [eq(0, 1), eq(1, 2), { vars: [2, 0], rows: [[[2, "0"], [0, "1"]], [[2, "1"], [0, "0"]]] } satisfies PropagationSet];
  assert.ok(semijoinRows(cyclic).sets.every(s => s.rows.length));
  assert.deepEqual(solutions(cyclic, domains), []);
});

test("behaviour semijoins decide a correlated contradiction before consuming the state budget", () => {
  const p = (id: string) => ({ id, carrier: "c" });
  const model: FunctionModel = { domain: "software", carriers: [{ id: "c", layer: "information", dimension: "bit", values: ["0", "1"] }], boxes: [
    { id: "a", name: "A", role: "tool", outputs: [p("x"), p("y")], behavior: ["0", "1"].map(x => ({ in: {}, out: { x, y: x } })) },
    { id: "b", name: "B", role: "tool", inputs: [p("x"), p("y")], outputs: [p("z")], behavior: ["0", "1"].map(x => ({ in: { x, y: x === "0" ? "1" : "0" }, out: { z: "1" } })) },
    { id: "p", name: "P", role: "product", inputs: [p("z")] },
  ], wires: [
    ...["x", "y"].map(port => ({ id: port, from: { box: "a", port }, to: { box: "b", port }, carrier: "c", polarity: "useful" as const })),
    { id: "z", from: { box: "b", port: "z" }, to: { box: "p", port: "z" }, carrier: "c", polarity: "useful" },
  ] };
  const result = externalBehavior(model, { fullRelation: true, maxStates: 1 });
  assert.ok(result.ok && result.decided);
  assert.equal(result.statesExplored, 1);
  assert.deepEqual(result.noSteadyState, [[]]);
});

test("GAC preserves exactly all satisfying assignments across finite random tables", () => {
  let seed = 143;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 8; };
  const domains = [["0", "1"], ["0", "1"], ["0", "1"]];
  for (let k = 0; k < 300; k++) {
    const sets: PropagationSet[] = Array.from({length: 1 + rand() % 4}, () => {
      const cols = Array.from({length: rand() % 4}, () => rand() % 3);
      return { vars: [...new Set(cols)], rows: Array.from({length: rand() % 5}, () => cols.filter(() => rand() % 4 !== 0).map(i => [i, String(rand() % 2)] as [number, string])) };
    });
    const snapshot = structuredClone([sets, domains]);
    const filtered = propagateRows(sets, domains);
    assert.equal(filtered.status, "complete");
    assert.deepEqual(solutions(filtered.sets, domains), solutions(sets, domains));
    assert.deepEqual([sets, domains], snapshot);
    const capped = propagateRows(sets, domains, 0);
    if (capped.status === "fallback") assert.equal(capped.sets, sets);
    else assert.deepEqual(solutions(capped.sets, domains), solutions(sets, domains));
  }
});

test("self-wiring, empty tuples, fan-in and cyclic inconsistency", () => {
  const domains = [["0", "1"], ["0", "1"], ["0", "1"]];
  const eq = (a: number, b: number): PropagationSet => ({vars: [a, b], rows: [[[a,"0"],[b,"0"]], [[a,"1"],[b,"1"]]]});
  const neq: PropagationSet = {vars: [2, 0], rows: [[[2,"0"],[0,"1"]], [[2,"1"],[0,"0"]]]};
  const cycle = [eq(0, 1), eq(1, 2), neq];
  const filtered = propagateRows(cycle, domains);
  assert.deepEqual(filtered.sets.map(s => s.rows.length), [2, 2, 2]);
  assert.deepEqual(solutions(filtered.sets, domains), []); // arc consistency is not global consistency
  const self: PropagationSet = {vars: [0], rows: [[[0,"0"],[0,"1"]], [[0,"1"],[0,"1"]]]};
  const fanin = propagateRows([self, {vars: [0], rows: [[[0,"1"]]]}, {vars: [], rows: [[]]}], domains);
  assert.deepEqual(fanin.sets[0].rows, [[[0,"1"],[0,"1"]]]);
  assert.deepEqual(fanin.sets[2].rows, [[]]);
  assert.deepEqual(solutions(fanin.sets, domains), solutions([self, {vars:[0],rows:[[[0,"1"]]]}, {vars:[],rows:[[]]}], domains));
});

function chain(): FunctionModel {
  const values = Array.from({length: 30}, (_, i) => `v${i}`), port = (id: string) => ({id, carrier: "c"});
  const boxes: FunctionModel["boxes"] = [{id:"__proto__", name:"source", role:"tool", outputs:[port("out")], behavior: values.map(x => ({in:{}, out:{out:x}}))}];
  const wires: FunctionModel["wires"] = [];
  let from = "__proto__";
  for (let i = 0; i < 12; i++) {
    const id = `mid${i}`, last = i === 11;
    boxes.push({id, name:id, role:"tool", inputs:[port("in")], outputs:[port("out")], behavior:(last ? [values[0]] : values).map(x => ({in:{in:x}, out:{out:x}}))});
    wires.push({id:`w${i}`, from:{box:from,port:"out"}, to:{box:id,port:"in"}, carrier:"c", polarity:"useful"}); from = id;
  }
  boxes.push({id:"product",name:"product",role:"product",inputs:[port("d")]});
  wires.push({id:"end",from:{box:from,port:"out"},to:{box:"product",port:"d"},carrier:"c",polarity:"useful"});
  return {domain:"software",carriers:[{id:"c",layer:"information",dimension:"bit",values}],boxes,wires};
}

test("steady-state evaluator preserves result and prunes a chain before enumeration", () => {
  const model = chain(), original = structuredClone(model), targets = deliverablePorts(model), p = plan(model, targets);
  const {variables,at,boundary} = portVariables(model,p.composed,targets);
  assert.equal(boundary.length, 0);
  const sets = p.composed.map(b => ({vars: [...new Set(bindRow(b,b.behavior![0],at).map(([i]) => i))], rows:b.behavior!.map(r => bindRow(b,r,at))}));
  const budget = {explored:0,max:100_000}, states: string[][] = [];
  const assign: Array<string|undefined> = Array(variables.length).fill(undefined);
  assert.equal(joinRows(sets, assign, () => states.push(assign.map(x => x!)), budget), true);
  const result = externalBehavior(model, {fullRelation:true});
  assert.ok(result.ok && result.decided);
  assert.equal(result.relation.length, 1);
  assert.equal(result.relation[0].steadyStateCount, states.length);
  assert.deepEqual(result.relation[0].steadyStates, states);
  assert.deepEqual(result.relation[0].outputs, [["v0"]]);
  assert.ok(result.statesExplored * 10 < budget.explored, `${result.statesExplored} vs ${budget.explored}`);
  const limited = {explored: 0, max: 25};
  assert.equal(joinRows(sets, Array(variables.length).fill(undefined), () => {}, limited), false);
  const within = externalBehavior(model, {fullRelation:true, maxStates:25});
  assert.ok(within.ok && within.decided);
  assert.deepEqual(within.relation, result.relation);
  assert.deepEqual(model, original);
});


test("a capped propagation discards pruning already performed", () => {
  const sets: PropagationSet[] = [
    {vars:[0],rows:[[[0,"0"]]]},
    {vars:[0],rows:[[[0,"0"]],[[0,"1"]]]},
  ];
  const result = propagateRows(sets, [["0", "1"]], 14);
  assert.equal(result.status, "fallback");
  assert.equal(result.sets, sets);
});

test("boundary rows with no solution remain listed", () => {
  const p = (id: string) => ({id, carrier:"c"});
  const model: FunctionModel = {domain:"software", carriers:[{id:"c",layer:"information",dimension:"bit",values:["0","1"]}], boxes:[
    {id:"a",name:"a",role:"tool",inputs:[p("x")],outputs:[p("y")],behavior:[{in:{x:"0"},out:{y:"0"}}]},
    {id:"prod",name:"prod",role:"product",inputs:[p("d")]},
  ], wires:[{id:"w",from:{box:"a",port:"y"},to:{box:"prod",port:"d"},carrier:"c",polarity:"useful"}]};
  const r = externalBehavior(model, {fullRelation:true});
  assert.ok(r.ok && r.decided);
  assert.deepEqual(r.relation.map(x => [x.input,x.outputs,x.steadyStateCount]), [[['0'],[['0']],1],[['1'],[],0]]);
  assert.deepEqual(r.noSteadyState, [['1']]);
});

test("upstream and whole scopes retain their treatment of disconnected inconsistent loops", () => {
  const model = chain();
  model.boxes.find(b => b.id === "product")!.behavior = model.carriers[0].values!.map(d => ({in:{d},out:{}}));
  model.boxes.push({id:"constructor",name:"loop",role:"tool",inputs:[{id:"x",carrier:"c"}],outputs:[{id:"y",carrier:"c"}],behavior:[{in:{x:"v0"},out:{y:"v1"}}]});
  model.wires.push({id:"loop",from:{box:"constructor",port:"y"},to:{box:"constructor",port:"x"},carrier:"c",polarity:"useful"});
  const upstream = externalBehavior(model, {fullRelation:true});
  const whole = externalBehavior(model, {fullRelation:true,scope:"whole"});
  assert.ok(upstream.ok && upstream.decided && whole.ok && whole.decided);
  assert.deepEqual(upstream.relation[0].outputs, [["v0"]]);
  assert.deepEqual(whole.relation[0].outputs, []);
  assert.deepEqual(whole.noSteadyState, [[]]);
});


test("a sparse row supports every value of its omitted table variables", () => {
  const domains = [["0", "1"], ["0", "1"]];
  const sets: PropagationSet[] = [
    {vars:[0,1],rows:[[[0,"0"]]]},
    {vars:[1],rows:[[[1,"1"]]]},
  ];
  const result = propagateRows(sets, domains);
  assert.equal(result.status, "complete");
  assert.deepEqual(solutions(result.sets, domains), [["0", "1"]]);
  assert.deepEqual(solutions(result.sets, domains), solutions(sets, domains));
  const capped = propagateRows(sets, domains, 3);
  assert.equal(capped.status, "fallback");
  assert.equal(capped.sets, sets);
});


test("domain preflight falls back before traversing or copying oversized shared domains", () => {
  const domain = Array<string>(10_000).fill("x");
  Object.defineProperty(domain, Symbol.iterator, {value: () => { throw new Error("domain was traversed"); }});
  const sets: PropagationSet[] = [{vars:[0], rows:[[[0,"x"]]]}];
  const result = propagateRows(sets, [domain], 10);
  assert.equal(result.status, "fallback");
  assert.equal(result.sets, sets);
});

/**
 * The fixpoint by rescanning every table until nothing changes, charged as propagateRows charges
 * one revision: the reference the worklist must agree with, and the work it must beat.
 */
function rescanAll(sets: PropagationSet[], domains: string[][]) {
  let work = 0;
  for (const d of domains) work += 1 + d.length;
  for (const s of sets) work += 1 + s.vars.length;
  const values = domains.map(d => new Set(d));
  const current = sets.map(s => ({ vars: s.vars, rows: s.rows }));
  for (let changed = true; changed;) {
    changed = false;
    for (let index = 0; index < current.length; index++) {
      const set = current[index];
      work += 1 + set.vars.length;
      const supported = new Map(set.vars.map(i => [i, new Set<string>()]));
      const keep = set.rows.filter(row => {
        work++;
        const binding = new Map<number, string>();
        for (const [i, value] of row) {
          work++;
          if (!values[i].has(value) || (binding.has(i) && binding.get(i) !== value)) return false;
          binding.set(i, value);
        }
        for (const [i, value] of binding) supported.get(i)!.add(value);
        for (const i of set.vars) { work++; if (!binding.has(i)) for (const value of values[i]) { work++; supported.get(i)!.add(value); } }
        return true;
      });
      if (keep.length !== set.rows.length) { changed = true; current[index] = { vars: set.vars, rows: keep }; }
      if (!keep.length) return { sets: current, work, emptied: true };
      for (const [i, support] of supported) for (const value of values[i]) { work++; if (!support.has(value)) { values[i].delete(value); changed = true; } }
    }
  }
  return { sets: current, work, emptied: false };
}

test("the worklist reaches the rescanning fixpoint, revising only tables whose variables shrank", () => {
  // A chain of equalities x0 = x1 = … = x40 over 30 values, then x40 = v0 at the far end: one
  // pruning that ripples back through every link. Rescanning needs a pass per link.
  const n = 41, values = Array.from({ length: 30 }, (_, i) => `v${i}`), domains = Array.from({ length: n }, () => values);
  const sets: PropagationSet[] = [
    ...Array.from({ length: n - 1 }, (_, k): PropagationSet => ({ vars: [k, k + 1], rows: values.map(x => [[k, x], [k + 1, x]]) })),
    { vars: [n - 1], rows: [[[n - 1, "v0"]]] },
  ];
  const snapshot = structuredClone(sets);
  const worklist = propagateRows(sets, domains), rescan = rescanAll(sets, domains);
  assert.equal(worklist.status, "complete");
  assert.deepEqual(worklist.sets, rescan.sets, "the same rows survive, in order");
  assert.ok(worklist.sets.slice(0, n - 1).every(s => s.rows.length === 1 && s.rows[0][0][1] === "v0"));
  assert.deepEqual(sets, snapshot, "the inputs are not mutated");
  assert.ok(worklist.work * 10 < rescan.work, `worklist ${worklist.work} vs rescanning ${rescan.work}`);
  // Within a budget the rescan would exhaust, the worklist completes; below its own need it falls back whole.
  assert.equal(propagateRows(sets, domains, worklist.work).status, "complete");
  const short = propagateRows(sets, domains, worklist.work - 1);
  assert.equal(short.status, "fallback");
  assert.equal(short.sets, sets);
  // On random tables both reach the same fixpoint, and the worklist never charges more.
  let seed = 977;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 8; };
  const small = [["0", "1", "2"], ["0", "1", "2"], ["0", "1", "2"], ["0", "1", "2"]];
  for (let k = 0; k < 300; k++) {
    const random: PropagationSet[] = Array.from({ length: 1 + rand() % 5 }, () => {
      const cols = [...new Set(Array.from({ length: 1 + rand() % 3 }, () => rand() % 4))];
      return { vars: cols, rows: Array.from({ length: rand() % 7 }, () => cols.filter(() => rand() % 5 !== 0).map(i => [i, String(rand() % 3)] as [number, string])) };
    });
    const a = propagateRows(random, small), b = rescanAll(random, small);
    assert.equal(a.status, "complete");
    assert.deepEqual(solutions(a.sets, small), solutions(random, small));
    if (!b.emptied && a.sets.every(s => s.rows.length)) assert.deepEqual(a.sets, b.sets);
    assert.ok(a.work <= b.work + random.length * small.length, `${a.work} vs ${b.work}`);
  }
});

test("behaviour results report the propagation status, and a state cap after a fallback names it", () => {
  const ok = externalBehavior(chain(), { fullRelation: true });
  assert.ok(ok.ok && ok.decided);
  assert.equal(ok.propagation.status, "complete");
  assert.ok(ok.propagation.work > 0);
  // 1,000 variables of 1,000 values: the domain preflight alone passes the pruning work limit.
  const ids = Array.from({ length: 1000 }, (_, i) => String(i)), values = Array.from({ length: 1000 }, (_, i) => `v${i}`);
  const wide: FunctionModel = {
    domain: "software", carriers: [{ id: "c", layer: "information", dimension: "x", values }],
    boxes: [
      { id: "s", name: "S", role: "tool", outputs: ids.map(id => ({ id, carrier: "c" })), behavior: ["v0", "v1"].map(v => ({ in: {}, out: Object.fromEntries(ids.map(id => [id, v])) })) },
      { id: "p", name: "P", role: "product", inputs: ids.map(id => ({ id, carrier: "c" })) },
    ],
    wires: ids.map(id => ({ id, from: { box: "s", port: id }, to: { box: "p", port: id }, carrier: "c", polarity: "useful" as const })),
  };
  const fallback = externalBehavior(wide);
  assert.ok(fallback.ok && fallback.decided);
  assert.equal(fallback.propagation.status, "fallback");
  const capped = externalBehavior(wide, { maxStates: 1 });
  assert.ok(!capped.ok);
  assert.equal(capped.issues[0].code, "cap-exceeded");
  assert.match(capped.issues[0].message, /unpruned rows: arc-consistency pruning stopped at its own work limit/);
  assert.deepEqual("propagation" in capped && capped.propagation, { status: "fallback", work: 1_001_000 });
  // A state cap with complete pruning says nothing about pruning.
  const pruned = externalBehavior(chain(), { maxStates: 1 });
  assert.ok(!pruned.ok);
  assert.doesNotMatch(pruned.issues[0].message, /unpruned/);
  assert.equal((pruned as { propagation?: { status: string } }).propagation?.status, "complete");
});
