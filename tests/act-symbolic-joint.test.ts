import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesizeFinite } from "../src/act-synthesis.js";
import { SymbolicPruner, symbolicStats, compileRegion } from "../src/act-synthesis-symbolic.js";
import { checkRegionCertificate, checkRegionDeclarations, countSummarySupports } from "../src/act-symbolic-certificate.js";
import { EngineeringBudget } from "../src/act-contract.js";
import { pruningStats } from "../src/act-synthesis-pruning.js";
import { jointSynthesisFixture, correlatedSynthesisFixture } from "./support/joint-synthesis.js";
import { synthesisFixture, type SynthesisInput } from "./support/synthesis.js";
import { wholePortBoundary } from "./support/whole-port-oracle.js";

function solve(input: SynthesisInput, strategy: "exhaustive" | "optimized" | "symbolic" = "symbolic", memoize = true) {
  const r = synthesizeFinite({ ...input, strategy, optimizations: { ...input.optimizations, memoize_symbolic: memoize }, include_symbolic_certificate: true });
  assert.ok(r.ok && "searchStats" in r && r.complete && r.allDecided, JSON.stringify(r));
  return r;
}
function compare(input: SynthesisInput) {
  const ref = solve(input, "exhaustive"), expected = wholePortBoundary(input.contract.target), oracle: Array<Record<string, string>> = [];
  const choice: number[] = [];
  const visit = (k: number) => {
    if (k < input.holes.length) { input.holes[k].alternatives.forEach((_, i) => { choice[k] = i; visit(k + 1); }); return; }
    const model = structuredClone(input.model);
    input.holes.forEach((h, i) => { model.boxes.find(b => b.id === h.box)!.behavior = h.alternatives[choice[i]].behavior; });
    if (wholePortBoundary(model) === expected) oracle.push(Object.fromEntries(input.holes.map((h, i) => [h.box, h.alternatives[choice[i]].id])));
  };
  visit(0);
  assert.deepEqual(ref.results.filter(x => "adequacy" in x.result && x.result.adequacy?.ok && x.result.adequacy.verdict === "adequate").map(x => x.choices), oracle);
  for (const strategy of ["optimized", "symbolic"] as const) for (const cache of [false, true]) {
    const r = solve(input, strategy, cache);
    assert.equal(r.verdict, ref.verdict); assert.equal(r.satisfyingCount, ref.satisfyingCount);
    assert.deepEqual(r.witness?.choices, ref.witness?.choices);
    assert.deepEqual(r.results.filter(x => x.result.verdict === "satisfied").map(x => x.choices), ref.results.filter(x => x.result.verdict === "satisfied").map(x => x.choices));
    for (const item of r.results) {
      const original = ref.results.find(x => JSON.stringify(x.choices) === JSON.stringify(item.choices))!;
      assert.equal(item.result.reason, original.result.reason);
      if ("resources" in item.result && "resources" in original.result) assert.deepEqual(item.result.resources, original.result.resources);
    }
  }
  return solve(input);
}

test("complete typed JOINT maps compose across explicit port permutations and retain declaration order", () => {
  const input = jointSynthesisFixture(3, 3); input.holes.reverse();
  const r = compare(input);
  assert.equal(r.satisfyingCount, 14);
  assert.equal(r.searchStats.symbolic.status, "ready");
  assert.equal(r.searchStats.pruning.contextStates, 8);
  assert.deepEqual(r.symbolicCertificates![0].stages[1].inputPorts, ["inA", "inB"]);
  assert.deepEqual(input.model.boxes.find(b => b.id === "h0")!.inputs!.map(p => p.id), ["inB", "inA"]);
  assert.ok(r.searchStats.symbolic.residualCacheHits > 0);
  assert.ok(r.searchStats.symbolic.residualCalls < r.searchStats.symbolic.filterCalls);
  assert.equal(r.searchStats.symbolic.primitiveCompositions, 11);
  assert.ok(r.searchStats.symbolic.compositionsAvoided > 0);
  assert.ok(checkRegionDeclarations(r.symbolicCertificates![0], input.model, input.holes));
});

test("arity-changing 2→1→2 maps preserve correlated outputs rather than independent projections", () => {
  const input = correlatedSynthesisFixture(), r = compare(input), c = r.symbolicCertificates![0];
  assert.equal(r.satisfyingCount, 2);
  assert.deepEqual(c.stages.map(s => [s.inputPorts.length, s.outputPorts.length]), [[2, 2], [2, 1], [1, 2]]);
  const m = c.layers.at(-1)![0];
  assert.deepEqual(new Set(m.image.map(i => JSON.stringify([m.outputs[i][c.stages.at(-1)!.outputPorts.indexOf("outA")], m.outputs[i][c.stages.at(-1)!.outputPorts.indexOf("outB")]]))), new Set(['["a0","cold"]', '["a1","hot"]']));
  const bad = structuredClone(c); bad.stages[1].inputPorts.reverse();
  assert.equal(checkRegionDeclarations(bad, input.model, input.holes), false);
  const sparse = structuredClone(c); delete sparse.layers[0][0].inputs[0][0];
  assert.equal(checkRegionCertificate(sparse), false);
});

test("unsupported joint alternatives stay in the whole context around summarized regions", () => {
  const input = correlatedSynthesisFixture(), last = input.holes[1], original = last.alternatives[0];
  last.alternatives.push({ ...original, id: "independent", behavior: ["even", "odd"].flatMap(p => ["a0", "a1"].flatMap(a => ["cold", "hot"].map(b => ({ in: { parity: p }, out: { outA: a, outB: b } })))) });
  const r = compare(input);
  assert.equal(r.satisfyingCount, 2);
  assert.ok(!r.results.some(x => x.choices.h1 === "independent" && x.result.verdict === "satisfied"));
});

test("joint completeness cannot be inferred from complete per-port projections", () => {
  const input = jointSynthesisFixture(2), last = input.holes[1], original = last.alternatives[0];
  last.alternatives.push({ ...original, id: "diagonal-only", behavior: original.behavior.filter(row => (row.in.inA === "a0") === (row.in.inB === "cold")) });
  const r = compare(input);
  assert.equal(r.satisfyingCount, 2);
  assert.equal(r.searchStats.symbolic.status, "ready");
  assert.ok(r.symbolicCertificates!.every(c => c.stages.every(s => s.box !== last.box)));
  assert.ok(!r.results.some(x => x.choices.h1 === "diagonal-only" && x.result.verdict === "satisfied"));
});

test("joint boundary reuse never merges operating costs, fixed costs or resource verdicts", () => {
  const input = jointSynthesisFixture(2, 3); input.contract.budget.usd = 1;
  const r = compare(input);
  assert.equal(r.satisfyingCount, 1);
  assert.ok(r.searchStats.symbolic.residualCacheHits > 0);
  assert.ok(r.results.some(x => x.result.reason === "resource-infeasible"));
});

test("zero-port sources and expanding interfaces have explicit unit domains and collision-free outputs", () => {
  for (const closed of [false, true]) {
    const input = correlatedSynthesisFixture();
    for (const model of [input.model, input.contract.target]) {
      const source = model.boxes[0];
      source.inputs = closed ? [] : [{ id: "summary-output-1", carrier: "A" }];
      source.outputs = [{ id: "x", carrier: "A" }];
      source.behavior = (closed ? ["a0"] : ["a0", "a1"]).map(x => ({ in: Object.fromEntries(closed ? [] : [["summary-output-1", x]]), out: { x } }));
      source.feasibility = [{ provides: { x: 1 } }];
      model.wires = model.wires.filter(w => w.from.box !== "source" || w.from.port === "x");
      model.boxes.find(b => b.id === "h0")!.inputs = [{ id: "inA", carrier: "A" }];
    }
    input.holes[0].alternatives = [0, 1].map(f => ({ id: `convert${f}`, behavior: ["a0", "a1"].map((a, i) => ({ in: { inA: a }, out: { parity: ["even", "odd"][i ^ f] } })), feasibility: { requires: { inA: 1 }, provides: { parity: 1 } }, cost: { usd: 0 } }));
    const target = input.contract.target.boxes.find(b => b.id === "h0")!;
    target.behavior = input.holes[0].alternatives[0].behavior; target.feasibility = [input.holes[0].alternatives[0].feasibility];
    const r = compare(input);
    assert.equal(r.satisfyingCount, 2);
    if (closed) { assert.deepEqual(r.symbolicCertificates![0].layers[0][0].source, []); assert.deepEqual(r.symbolicCertificates![0].layers[0][0].inputs, [[]]); }
  }
});

test("duplicate primitive maps compose once per unique map and preserve all labeled supports", () => {
  const r = solve(synthesisFixture("coupled", 2)), stage = r.symbolicCertificates![0].stages[1], stats = symbolicStats();
  let work = 0;
  const c = compileRegion(Array.from({ length: 10 }, (_, i) => ({ ...stage, box: `b${i}`, hole: i, choiceCount: 100, primitives: Array.from({ length: 100 }, (_, j) => stage.primitives[j % 2]) })), n => { work += n ?? 1; }, stats);
  assert.ok(checkRegionCertificate(c));
  assert.equal(stats.primitiveCompositions, 38);
  assert.equal(stats.compositionsAvoided, 1862);
  assert.equal(countSummarySupports(c).reduce((a, b) => a + b), 100n ** 10n);
  assert.ok(work < 4000);
});

test("cached residual domains are immutable and cache storage respects the symbolic memory bound", () => {
  const input = jointSynthesisFixture(2), budget = new EngineeringBudget(1_000_000), stats = symbolicStats();
  const p = SymbolicPruner.compile(input.model, input.contract.target, input.holes, budget, pruningStats(), stats, 100_000, 200_000, true, true);
  assert.ok(p);
  const a = p.filter([3n, 3n]); assert.ok(a); a.domains[0] = 0n;
  const b = p.filter([3n, 3n]); assert.ok(b); assert.notEqual(b.domains[0], 0n);
  assert.equal(stats.residualCacheHits, 1);
  assert.ok(stats.residualCacheEntries <= 128 && stats.retainedCells <= 200_000);
  const limitedStats = symbolicStats();
  const limited = SymbolicPruner.compile(input.model, input.contract.target, input.holes, new EngineeringBudget(1_000_000), pruningStats(), limitedStats, 100_000, stats.retainedCells - stats.residualCacheCells, true, true);
  assert.ok(limited);
  assert.deepEqual(limited.filter([3n, 3n])?.domains, b.domains);
  assert.equal(limitedStats.residualCacheEntries, 0);
});

test("large joint output products exhaust the allowance before allocating their Cartesian domain", () => {
  const input = synthesisFixture("coupled", 1), outputs = Array.from({ length: 70 }, (_, i) => ({ id: `p${i}`, carrier: "value" }));
  for (const model of [input.model, input.contract.target]) {
    const box = model.boxes.find(b => b.id === "h0")!, sink = model.boxes.find(b => b.id === "product0")!;
    box.outputs = outputs;
    sink.inputs = outputs;
    sink.behavior = [{ in: Object.fromEntries(outputs.map(p => [p.id, "0"])), out: {} }]; sink.feasibility = [{}];
    model.wires = model.wires.filter(w => w.to.box !== "product0");
    model.wires.push(...outputs.map(p => ({ id: `observe-${p.id}`, from: { box: "h0", port: p.id }, to: { box: "product0", port: p.id }, carrier: "value", polarity: "useful" as const })));
  }
  input.holes[0].alternatives = [{ id: "constant", behavior: ["0", "1"].map(x => ({ in: { in: x }, out: Object.fromEntries(outputs.map(p => [p.id, "0"])) })), feasibility: {} }];
  const target = input.contract.target.boxes.find(b => b.id === "h0")!;
  target.behavior = input.holes[0].alternatives[0].behavior; target.feasibility = [{}];
  const a = solve(input), b = solve(input, "exhaustive");
  assert.equal(a.satisfyingCount, b.satisfyingCount);
  assert.equal(a.searchStats.symbolic.status, "fallback");
  assert.equal(a.searchStats.symbolic.reason, "symbolic-product-domain-cap");
});

test("negative boundary results share safely across distinct concrete choices, without caching fallbacks", () => {
  const input = jointSynthesisFixture(2, 3), budget = new EngineeringBudget(1_000_000), stats = symbolicStats(), residualStats = pruningStats();
  const p = SymbolicPruner.compile(input.model, input.contract.target, input.holes, budget, residualStats, stats, 100_000, 200_000, true, true);
  assert.ok(p);
  assert.equal(p.filter([1n, 2n]), undefined);
  const calls = stats.residualCalls;
  assert.equal(p.filter([4n, 2n]), undefined);
  assert.equal(stats.residualCalls, calls);
  assert.equal(stats.residualCacheHits, 1);
  const b = new EngineeringBudget(1_000_000), s = symbolicStats(), r = pruningStats();
  const limited = SymbolicPruner.compile(input.model, input.contract.target, input.holes, b, r, s, 100_000, 200_000, true, true);
  assert.ok(limited); b.spend(b.remaining - 60);
  const original = [7n, 7n];
  assert.deepEqual(limited.filter(original)?.domains, original);
  assert.ok(r.propagationFallbacks > 0 || s.filterFallbacks > 0);
  assert.equal(s.residualCacheEntries, 0);
});

test("residual memoization stops at 128 entries and keeps unsupported choices as separate dimensions", () => {
  const input = jointSynthesisFixture(2), rows = ["a0", "a1"].flatMap(a => ["a0", "a1"].map(b => ({ in: { input: a }, out: { output: b } })));
  for (let i = 0; i < 3; i++) {
    const box = { id: `u${i}`, name: `Uncovered relation ${i}`, role: "tool" as const, inputs: [{ id: "input", carrier: "A" }], outputs: [{ id: "output", carrier: "A" }], behavior: rows, feasibility: [{}] };
    input.model.boxes.push({ ...box, behavior: undefined }); input.contract.target.boxes.push(box);
    input.holes.push({ box: box.id, alternatives: [0, 1, 2].map(j => ({ id: `choice${j}`, behavior: rows, feasibility: {} })) });
  }
  const s = symbolicStats(), p = SymbolicPruner.compile(input.model, input.contract.target, input.holes, new EngineeringBudget(1_000_000), pruningStats(), s, 100_000, 200_000, true, true);
  assert.ok(p);
  for (let a = 1n; a < 8n; a++) for (let b = 1n; b < 8n; b++) for (let c = 1n; c < 8n; c++) {
    const result: { domains: bigint[] } | undefined = p.filter([3n, 3n, a, b, c]); assert.ok(result);
    assert.deepEqual(result.domains.slice(2), [a, b, c]);
  }
  assert.equal(s.residualCacheEntries, 128);
  assert.ok(s.retainedCells <= 200_000);
});

test("joint prefix sharing and residual reuse leave concrete internal diagnostics separate", () => {
  const r = solve(jointSynthesisFixture(2)), good = r.results.filter(x => x.result.verdict === "satisfied");
  const concepts = good.map(x => "behavior" in x.result && x.result.behavior?.ok && "concept" in x.result.behavior ? x.result.behavior.concept : undefined);
  assert.equal(concepts.length, 2); assert.ok(concepts.every(Boolean));
  assert.notDeepEqual(concepts[0]!.relation[0].steadyStates, concepts[1]!.relation[0].steadyStates);
  assert.deepEqual(concepts[0]!.relation.map(x => x.outputs), concepts[1]!.relation.map(x => x.outputs));
});

test("joint cached pruning preserves literal whole-port solutions under every partial choice domain", () => {
  const input = jointSynthesisFixture(2, 3), expected = wholePortBoundary(input.contract.target), words: number[][] = [];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    const model = structuredClone(input.model), word = [a, b];
    input.holes.forEach((h, i) => { model.boxes.find(b => b.id === h.box)!.behavior = h.alternatives[word[i]].behavior; });
    if (wholePortBoundary(model) === expected) words.push(word);
  }
  for (const memoize of [false, true]) {
    const stats = symbolicStats(), p = SymbolicPruner.compile(input.model, input.contract.target, input.holes, new EngineeringBudget(1_000_000), pruningStats(), stats, 100_000, 200_000, true, true, 100_000, memoize);
    assert.ok(p);
    for (let a = 1n; a < 8n; a++) for (let b = 1n; b < 8n; b++) {
      const domains = [a, b], result: { domains: bigint[] } | undefined = p.filter(domains);
      const viable = words.filter(word => word.every((j, i) => (domains[i] & (1n << BigInt(j))) !== 0n));
      for (const word of viable) assert.ok(result && word.every((j, i) => (result.domains[i] & (1n << BigInt(j))) !== 0n));
      if (domains.every(d => (d & (d - 1n)) === 0n)) assert.equal(result !== undefined, viable.length > 0);
    }
    assert.equal(stats.filterFallbacks, 0);
  }
});
