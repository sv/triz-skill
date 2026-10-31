import { test } from "node:test";
import assert from "node:assert/strict";
import { BehaviorEvaluationCache, compareBehavior, operationalAdequacy } from "../src/act-behavior.js";
import { synthesizeFinite } from "../src/act-synthesis.js";
import { synthesisFixture, type SynthesisInput } from "./support/synthesis.js";
import type { FunctionModel } from "../src/act.js";
import { EngineeringBudget } from "../src/act-contract.js";
import { SynthesisPruner, choiceMask, pruningStats } from "../src/act-synthesis-pruning.js";

function solved(input: SynthesisInput) {
  const r = synthesizeFinite(input);
  assert.ok(r.ok && "candidateSpace" in r && "searchStats" in r, JSON.stringify(r));
  assert.ok(r.candidateSpace.complete && r.allDecided, JSON.stringify(r));
  return r;
}
const satisfying = (r: ReturnType<typeof solved>) => r.results.filter(x => x.result.verdict === "satisfied").map(x => JSON.stringify(x.choices)).sort();

/** Independent whole-port oracle: no engine evaluator, port quotient, joins, residual,
 * or propagation. Enumerate every port valuation and test literal row/wire equality. */
function bruteBoundary(model: FunctionModel) {
  const ports = model.boxes.flatMap(b => (["in", "out"] as const).flatMap(side =>
    (side === "in" ? b.inputs ?? [] : b.outputs ?? []).map(p => ({ box: b.id, side, port: p.id, values: model.carriers.find(c => c.id === p.carrier)!.values! }))));
  const index = (box: string, side: "in" | "out", port: string) => ports.findIndex(p => p.box === box && p.side === side && p.port === port);
  const inputs = ports.filter(p => p.side === "in" && !model.wires.some(w => w.to.box === p.box && w.to.port === p.port));
  const outputs = ports.filter(p => p.side === "in" && model.boxes.find(b => b.id === p.box)!.role === "product" && model.wires.some(w => w.to.box === p.box && w.to.port === p.port && w.polarity !== "harmful"));
  const relation = new Set<string>(), liveInputs = new Set<string>();
  const assignment: string[] = [];
  const walk = (i: number) => {
    if (i < ports.length) { for (const x of ports[i].values) { assignment[i] = x; walk(i + 1); } return; }
    if (!model.wires.every(w => assignment[index(w.from.box, "out", w.from.port)] === assignment[index(w.to.box, "in", w.to.port)])) return;
    if (!model.boxes.every(b => b.behavior!.some(row =>
      Object.entries(row.in).every(([p, x]) => assignment[index(b.id, "in", p)] === x) &&
      Object.entries(row.out).every(([p, x]) => assignment[index(b.id, "out", p)] === x)))) return;
    const x = inputs.map(p => assignment[index(p.box, p.side, p.port)]);
    relation.add(JSON.stringify([x, outputs.map(p => assignment[index(p.box, p.side, p.port)])]));
    liveInputs.add(JSON.stringify(x));
  };
  walk(0);
  return { relation, nonblocking: liveInputs.size === inputs.reduce((n, p) => n * p.values.length, 1) };
}

test("backward residual removes whole nondeterministic alternatives without hiding bad rows", () => {
  const input = synthesisFixture("safety", 4);
  const reference = solved({ ...input, strategy: "exhaustive" });
  const result = solved({ ...input, optimizations: { choice_propagation: false } });
  assert.equal(reference.candidateSpace.enumerated, 16);
  assert.equal(result.candidateSpace.enumerated, 1);
  assert.equal(result.candidateSpace.pruned, 15);
  assert.equal(result.candidateSpace.accountedFor, 16);
  assert.deepEqual(satisfying(result), satisfying(reference));
  assert.ok(result.searchStats.pruning.residualChoiceRemovals > 0);
  assert.equal(result.searchStats.pruning.coverageChoiceRemovals, 0);
});

test("choice propagation enforces coverage at every target pair with one consistent alternative", () => {
  const input = synthesisFixture("coverage", 3);
  const reference = solved({ ...input, strategy: "exhaustive" });
  const result = solved({ ...input, optimizations: { backward_residual: false } });
  assert.equal(result.candidateSpace.enumerated, 1);
  assert.equal(result.candidateSpace.pruned, 26);
  assert.deepEqual(satisfying(result), satisfying(reference));
  assert.ok(result.searchStats.pruning.coverageChoiceRemovals > 0);
  assert.equal(result.searchStats.pruning.unsafeRectangles, 0);
});

test("coupled residual retains compensating choices rather than intersecting independent projections", () => {
  const input = synthesisFixture("coupled", 4);
  const reference = solved({ ...input, strategy: "exhaustive" });
  for (const optimizations of [{}, { choice_propagation: false }, { backward_residual: false }]) {
    const result = solved({ ...input, optimizations });
    assert.equal(result.satisfyingCount, 8);
    assert.deepEqual(satisfying(result), satisfying(reference));
    assert.deepEqual(result.witness?.choices, reference.witness?.choices);
    assert.equal(result.candidateSpace.accountedFor, 16);
  }
});

test("multi-input/output contracts preserve correlations through swaps and fan-out", () => {
  const input = synthesisFixture("coupled", 2);
  const values = ["0", "1"], pairs = values.flatMap(a => values.map(b => ({ a, b })));
  for (const model of [input.model, input.contract.target]) {
    model.boxes = [
      { id: "source", name: "Two inputs", role: "environment", inputs: [{ id: "a", carrier: "value" }, { id: "b", carrier: "value" }], outputs: [{ id: "x", carrier: "value" }, { id: "y", carrier: "value" }], behavior: pairs.map(p => ({ in: p, out: { x: p.a, y: p.b } })), feasibility: [{ provides: { x: 1, y: 1 } }] },
      ...["h0", "h1"].map(id => ({ id, name: id, role: "tool" as const, inputs: [{ id: "a", carrier: "value" }, { id: "b", carrier: "value" }], outputs: [{ id: "x", carrier: "value" }, { id: "y", carrier: "value" }], behavior: pairs.map(p => ({ in: p, out: { x: p.a, y: p.b } })), feasibility: [{ requires: { a: 1, b: 1 }, provides: { x: 1, y: 1 } }] })),
      { id: "product0", name: "Joint output", role: "product", inputs: [{ id: "a", carrier: "value" }, { id: "b", carrier: "value" }], behavior: pairs.map(p => ({ in: p, out: {} })), feasibility: [{ requires: { a: 1, b: 1 } }] },
    ];
    model.wires = ["source", "h0", "h1"].flatMap((box, i) => ["x", "y"].map((port, j) => ({ id: `${box}-${port}`, from: { box, port }, to: { box: ["h0", "h1", "product0"][i], port: ["a", "b"][j] }, carrier: "value", polarity: "useful" as const })));
  }
  input.holes.forEach(h => {
    const feasibility = { requires: { a: 1, b: 1 }, provides: { x: 1, y: 1 } };
    h.alternatives = [
      { id: "copy", behavior: pairs.map(p => ({ in: p, out: { x: p.a, y: p.b } })), feasibility },
      { id: "swap", behavior: pairs.map(p => ({ in: p, out: { x: p.b, y: p.a } })), feasibility },
      { id: "independent", behavior: pairs.flatMap(p => pairs.map(q => ({ in: p, out: { x: q.a, y: q.b } }))), feasibility },
    ];
    delete input.model.boxes.find(b => b.id === h.box)!.behavior;
  });
  const result = solved(input), reference = solved({ ...input, strategy: "exhaustive" });
  assert.equal(result.satisfyingCount, 2);
  assert.deepEqual(satisfying(result), satisfying(reference));
});

test("a disconnected inconsistent loop is composed before projecting the target boundary", () => {
  const input = synthesisFixture("safety", 2);
  input.model.boxes.push({ id: "loop", name: "No fixed point", role: "tool", inputs: [{ id: "in", carrier: "value" }], outputs: [{ id: "out", carrier: "value" }],
    behavior: [{ in: { in: "0" }, out: { out: "1" } }, { in: { in: "1" }, out: { out: "0" } }], feasibility: [{}] });
  input.model.wires.push({ id: "loop", from: { box: "loop", port: "out" }, to: { box: "loop", port: "in" }, carrier: "value", polarity: "useful" });
  const result = solved(input), reference = solved({ ...input, strategy: "exhaustive" });
  assert.equal(result.verdict, reference.verdict);
  assert.equal(result.verdict, "impossible-in-library");
  assert.equal(result.candidateSpace.enumerated, 0);
  assert.equal(result.candidateSpace.pruned, 4);
});

test("boundary memoization shares behavior while resource modes remain separate", () => {
  const input = synthesisFixture("memoization", 2);
  input.contract.budget = { usd: 1 };
  const reference = solved({ ...input, strategy: "exhaustive" });
  const result = solved({ ...input, optimizations: { backward_residual: false, choice_propagation: false } });
  assert.deepEqual(satisfying(result), satisfying(reference));
  assert.equal(result.satisfyingCount, 3);
  assert.equal(result.candidateSpace.enumerated, 16);
  assert.ok(result.searchStats.boundarySummaries.hits > 0);
  assert.ok(result.searchStats.boundarySummaries.computations < reference.searchStats.boundarySummaries.computations);
  assert.equal(solved({ ...input, optimizations: { memoize_boundaries: false } }).searchStats.boundarySummaries.hits, 0);
});

test("compilation caps discard constraints and exhaustively validate every combination", () => {
  const input = synthesisFixture("safety", 3), reference = solved({ ...input, strategy: "exhaustive" });
  for (const max_pruning_work of [0, 1, 50, 300]) {
    const result = solved({ ...input, max_pruning_work });
    assert.equal(result.searchStats.pruning.status, "fallback");
    assert.equal(result.candidateSpace.pruned, 0);
    assert.equal(result.candidateSpace.enumerated, 8);
    assert.deepEqual(satisfying(result), satisfying(reference));
  }
  const capped = synthesizeFinite({ ...input, max_work: 1000 });
  assert.ok(capped.ok && capped.verdict === "undecided" && !capped.complete);
});

test("propagation exhaustion rolls back even domains already shrunk during that pass", () => {
  const input = synthesisFixture("safety", 4), budget = new EngineeringBudget(1_000_000), stats = pruningStats();
  const pruner = SynthesisPruner.compile(input.model, input.contract.target, input.holes, budget, stats, 100_000, true, true);
  assert.ok(pruner);
  budget.spend(budget.remaining - 40);
  const domains = input.holes.map(h => choiceMask(h.alternatives.length));
  const result = pruner.filter(domains);
  assert.deepEqual(result?.domains, domains);
  assert.equal(stats.propagationFallbacks, 1);
  assert.equal(stats.residualChoiceRemovals, 0);
  assert.equal(stats.coverageChoiceRemovals, 0);
});

test("invalid alternatives cannot disappear behind a residual rejection", () => {
  const input = synthesisFixture("safety", 2);
  input.holes[1].alternatives[1].behavior[0].out.out = "undeclared";
  for (const strategy of ["optimized", "exhaustive"] as const) assert.equal(synthesizeFinite({ ...input, strategy }).ok, false);
});

test("indexed evaluation and connected-factor ablations preserve exhaustive synthesis results", () => {
  for (const kind of ["safety", "coverage", "coupled", "memoization"] as const) {
    const input = synthesisFixture(kind, 2), reference = solved({ ...input, strategy: "exhaustive" });
    for (const indexed_relations of [false, true]) for (const connected_factors of [false, true]) {
      const result = solved({ ...input, optimizations: { indexed_relations, connected_factors } });
      assert.equal(result.verdict, reference.verdict);
      assert.equal(result.satisfyingCount, reference.satisfyingCount);
      assert.deepEqual(result.witness?.choices, reference.witness?.choices);
      assert.deepEqual(satisfying(result), satisfying(reference));
      assert.equal(result.candidateSpace.accountedFor, result.candidateSpace.size);
    }
  }
});

test("unknown resources and mismatched boundary interfaces use the ordinary validator", () => {
  const missing = synthesisFixture("safety", 2);
  delete missing.model.boxes.find(b => b.id === "source")!.feasibility;
  const a = synthesizeFinite(missing), b = synthesizeFinite({ ...missing, strategy: "exhaustive" });
  assert.ok(a.ok && b.ok && "searchStats" in a && "satisfyingCount" in b);
  assert.equal(a.verdict, b.verdict);
  assert.equal(a.satisfyingCount, b.satisfyingCount);
  assert.equal(a.searchStats.pruning.reason, "pre-behavior-validation");
  const extra = synthesisFixture("coupled", 2);
  extra.contract.target.boxes.push({ id: "extra", name: "Extra input", role: "tool", inputs: [{ id: "in", carrier: "value" }],
    behavior: ["0", "1"].map(x => ({ in: { in: x }, out: {} })), feasibility: [{ requires: { in: 1 } }] });
  const result = solved(extra), reference = solved({ ...extra, strategy: "exhaustive" });
  assert.equal(result.searchStats.pruning.reason, "different-boundary-inputs");
  assert.deepEqual(satisfying(result), satisfying(reference));
});

test("cached summaries respect state allowances, observation tuples and changed relations", () => {
  const input = synthesisFixture("memoization", 2), m = input.contract.target;
  const cache = new BehaviorEvaluationCache();
  const initial = compareBehavior(m, m, { scope: "whole", evaluationCache: cache });
  assert.ok(initial.ok && initial.verdict === "preserved");
  assert.ok(cache.stats.hits > 0);
  const capped = compareBehavior(m, m, { scope: "whole", maxStates: 1, evaluationCache: cache });
  assert.equal(capped.ok, false);
  const changed = structuredClone(m);
  changed.boxes.find(b => b.id === "h1")!.behavior = ["0", "1", "2", "3"].map(x => ({ in: { in: x }, out: { out: "0" } }));
  const difference = compareBehavior(m, changed, { scope: "whole", evaluationCache: cache });
  assert.ok(difference.ok && difference.verdict === "changed");
  const adequate = operationalAdequacy(m, input.contract.acceptable, { scope: "whole", evaluationCache: cache });
  const inadequate = operationalAdequacy(m, [{ carrier: "value", values: ["0"] }], { scope: "whole", evaluationCache: cache });
  assert.ok(adequate.ok && adequate.verdict === "adequate");
  assert.ok(inadequate.ok && inadequate.verdict === "inadequate");
});

test("optimized search matches exhaustive choices on 80 seeded partial/nondeterministic networks, including feedback and fan-in", () => {
  let seed = 0x51f15e;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const rows = ["0", "1"].flatMap(x => ["0", "1"].map(y => ({ in: { in: x }, out: { out: y } })));
  const relation = () => { const mask = 1 + random() % 15; return rows.filter((_, i) => (mask & (1 << i)) !== 0).map(r => structuredClone(r)); };
  for (let sample = 0; sample < 80; sample++) {
    const input = synthesisFixture("coupled", 3);
    input.holes.forEach(h => {
      h.alternatives = Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, behavior: relation(), feasibility: { requires: { in: 1 }, provides: { out: 1 }, cost: { usd: i } } }));
      input.contract.target.boxes.find(b => b.id === h.box)!.behavior = relation();
    });
    if (sample % 3 === 0) for (const m of [input.model, input.contract.target]) m.wires.push({ id: "feedback", from: { box: "h2", port: "out" }, to: { box: "h0", port: "in" }, carrier: "value", polarity: "useful" });
    const reference = synthesizeFinite({ ...input, strategy: "exhaustive" });
    const result = synthesizeFinite(input);
    assert.ok(reference.ok && result.ok && "searchStats" in result && "searchStats" in reference, `sample ${sample}: ${JSON.stringify({ result, reference })}`);
    assert.equal(result.verdict, reference.verdict, `sample ${sample}`);
    assert.equal(result.satisfyingCount, reference.satisfyingCount, `sample ${sample}`);
    assert.equal(result.allDecided, reference.allDecided, `sample ${sample}`);
    assert.deepEqual(result.results.filter(x => x.result.verdict === "satisfied").map(x => x.choices), reference.results.filter(x => x.result.verdict === "satisfied").map(x => x.choices), `sample ${sample}`);
    assert.deepEqual(result.witness?.choices, reference.witness?.choices, `sample ${sample}`);
    assert.equal(result.candidateSpace.accountedFor, 27, `sample ${sample}`);
    const target = bruteBoundary(input.contract.target);
    const expected: Array<Record<string, string>> = [];
    if (target.nonblocking && target.relation.size) for (const a of input.holes[0].alternatives) for (const b of input.holes[1].alternatives) for (const c of input.holes[2].alternatives) {
      const choices = [a, b, c];
      const model = structuredClone(input.model);
      input.holes.forEach((h, i) => { model.boxes.find(b => b.id === h.box)!.behavior = choices[i].behavior; });
      const actual = bruteBoundary(model);
      if (actual.relation.size === target.relation.size && [...actual.relation].every(x => target.relation.has(x))) expected.push(Object.fromEntries(input.holes.map((h, i) => [h.box, choices[i].id])));
    }
    // The independent oracle concerns relation equality/nonblocking. Resource grounding
    // can still be undecided on feedback; those behavior-compatible tuples must survive too.
    assert.deepEqual(result.results.filter(x => "adequacy" in x.result && x.result.adequacy?.ok && x.result.adequacy.verdict === "adequate").map(x => x.choices), expected, `independent oracle sample ${sample}`);
  }
});
