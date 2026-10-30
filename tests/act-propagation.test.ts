import { test } from "node:test";
import assert from "node:assert/strict";
import { propagateRows, type PropagationSet } from "../src/act-propagation.js";
import { bindRow, deliverablePorts, externalBehavior, joinRows, plan, portVariables } from "../src/act-behavior.js";
import type { FunctionModel } from "../src/act.js";

/** Independent exhaustive valuations over original finite domains. */
function solutions(sets: PropagationSet[], domains: string[][]): string[][] {
  const all: string[][] = [];
  const visit = (a: string[]) => {
    if (a.length < domains.length) { for (const x of domains[a.length]) visit([...a, x]); return; }
    if (sets.every(s => s.rows.some(row => row.every(([i, x]) => a[i] === x)))) all.push(a);
  };
  visit([]); return all;
}

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
