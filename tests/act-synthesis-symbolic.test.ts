import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { synthesizeFinite } from "../src/act-synthesis.js";
import { compileRegion, SymbolicPruner, symbolicStats } from "../src/act-synthesis-symbolic.js";
import { checkRegionCertificate, checkRegionDeclarations, countSummarySupports, summaryForChoices, type RegionCertificate } from "../src/act-symbolic-certificate.js";
import { exportSymbolicLean } from "../src/act-symbolic-lean.js";
import { EngineeringBudget } from "../src/act-contract.js";
import { choiceMask, pruningStats } from "../src/act-synthesis-pruning.js";
import { synthesisFixture, type SynthesisInput } from "./support/synthesis.js";
import { distinctMapFixture, typedMapFixture } from "./support/symbolic.js";

function solve(input: SynthesisInput, strategy: "symbolic" | "optimized" | "exhaustive" = "symbolic") {
  const r = synthesizeFinite({ ...input, strategy, include_symbolic_certificate: true });
  assert.ok(r.ok && "searchStats" in r && r.candidateSpace.complete, JSON.stringify(r));
  return r;
}
const successes = (r: ReturnType<typeof solve>) => r.results.filter(x => x.result.verdict === "satisfied").map(x => x.choices);
function differential(input: SynthesisInput) {
  const reference = solve(input, "exhaustive");
  for (const strategy of ["optimized", "symbolic"] as const) {
    const r = solve(input, strategy);
    assert.equal(r.verdict, reference.verdict);
    assert.equal(r.satisfyingCount, reference.satisfyingCount);
    assert.equal(r.allDecided, reference.allDecided);
    assert.deepEqual(r.witness?.choices, reference.witness?.choices);
    if (reference.candidateSpace.size! <= 50) assert.deepEqual(successes(r), successes(reference));
    assert.equal(r.candidateSpace.accountedFor, reference.candidateSpace.size);
    // Compare every surviving concrete implementation's resource outcome with reference.
    for (const a of r.results) {
      const b = reference.results.find(b => JSON.stringify(a.choices) === JSON.stringify(b.choices));
      if (!b) continue;
      assert.equal(a.result.verdict, b.result.verdict);
      assert.equal(a.result.reason, b.result.reason);
      if ("resources" in a.result && "resources" in b.result) assert.deepEqual(a.result.resources, b.result.resources);
    }
  }
  return solve(input);
}

test("caps during initial encoding and alternative validation retain pre-search candidate metadata", () => {
  const cases = JSON.parse(fs.readFileSync(new URL("../examples/assurance/requests.json", import.meta.url), "utf8"));
  const input = cases.find((c: { tool: string }) => c.tool === "triz_synthesize").args;
  for (const strategy of ["exhaustive", "optimized", "symbolic"] as const) {
    let previousWork = -1;
    for (const max_work of [1, 40, 50]) {
      const r = synthesizeFinite({ ...input, strategy, max_work });
      assert.ok(r.ok && r.verdict === "undecided" && "reason" in r && r.reason === "work-cap");
      assert.deepEqual(r.candidateSpace, { size: null, enumerated: 0, complete: false, scope: "Declared finite libraries on fixed wiring; cap reached before search." });
      assert.ok(r.work > previousWork); previousWork = r.work;
    }
  }
});

test("explicitly disabled symbolic pruning reports its reason on small and larger requests", () => {
  for (const n of [2, 6]) {
    const input = synthesisFixture("coupled", n), reference = solve(input, "exhaustive");
    const r = solve({ ...input, optimizations: { backward_residual: false, choice_propagation: false } });
    assert.equal(r.searchStats.symbolic.status, "disabled");
    assert.equal(r.searchStats.symbolic.reason, "pruning-disabled");
    assert.equal(r.searchStats.symbolic.work, 0);
    assert.equal(r.satisfyingCount, reference.satisfyingCount);
    assert.deepEqual(r.witness?.choices, reference.witness?.choices);
  }
});

test("small requests reuse optimized search, including the unchanged shipped synthesis example", () => {
  const cases = JSON.parse(fs.readFileSync(new URL("../examples/assurance/requests.json", import.meta.url), "utf8"));
  const input = cases.find((c: { tool: string }) => c.tool === "triz_synthesize").args;
  for (const usd of [5, 0]) {
    const request = { ...input, contract: { ...input.contract, budget: { usd } } };
    const reference = solve(request, "exhaustive"), optimized = solve(request, "optimized");
    const actual = synthesizeFinite({ ...request, strategy: "symbolic" });
    assert.ok(actual.ok && "searchStats" in actual && actual.complete);
    assert.equal(actual.searchStats.symbolic.reason, "small-context");
    assert.equal(actual.searchStats.symbolic.work, 0);
    assert.equal(actual.work, optimized.work);
    assert.ok(actual.searchStats.unchangedDomainPasses > 0);
    assert.equal(actual.satisfyingCount, reference.satisfyingCount);
    assert.deepEqual(actual.witness?.choices, reference.witness?.choices);
    assert.deepEqual(actual.results.map(x => x.result.reason), optimized.results.map(x => x.result.reason));
    assert.deepEqual(successes(actual), successes(reference));
  }
});

test("the small-context guard does not bypass expensive declarations or explicit certificates", () => {
  const input = synthesisFixture("coupled", 2);
  assert.equal(solve(input).searchStats.symbolic.status, "ready");
  input.holes.forEach(h => h.alternatives.forEach(a => { a.behavior = a.behavior.flatMap(row => Array.from({ length: 100 }, () => row)); }));
  const actual = synthesizeFinite({ ...input, strategy: "symbolic" });
  assert.ok(actual.ok && "searchStats" in actual && actual.complete);
  assert.equal(actual.searchStats.symbolic.status, "ready");
  assert.equal(actual.satisfyingCount, solve(input, "exhaustive").satisfyingCount);
});

test("recognition skips unrelated Cartesian products while preserving their whole-model costs", () => {
  for (const usd of [0, 1001]) {
    const input = synthesisFixture("coupled", 2), outputs = Array.from({ length: 70 }, (_, i) => ({ id: `p${i}`, carrier: "value" }));
    for (const m of [input.model, input.contract.target]) m.boxes.push({ id: "outside", name: "Unobserved fixed constraint", role: "tool", outputs,
      behavior: [{ in: {}, out: Object.fromEntries(outputs.map(p => [p.id, "0"])) }], feasibility: [{}], cost: { usd } });
    const r = differential(input);
    assert.equal(r.searchStats.symbolic.status, "ready");
    assert.equal(r.satisfyingCount, usd ? 0 : 2);
    assert.ok(r.symbolicCertificates!.every(c => c.stages.every(s => s.box !== "outside")));
  }
});

test("symbolic compilation reduces union traces BEFORE residual enumeration, keeping two maps at each prefix", () => {
  for (const length of [2, 4, 6, 8]) {
    const input = synthesisFixture("coupled", length), r = solve(input), before = solve(input, "optimized");
    assert.equal(r.satisfyingCount, 2 ** (length - 1));
    assert.equal(r.satisfyingCount, before.satisfyingCount);
    assert.equal(r.searchStats.symbolic.status, "ready");
    assert.deepEqual(r.searchStats.symbolic.prefixWidths, [[1, 1, ...Array(length).fill(2)]]);
    assert.equal(r.searchStats.pruning.contextStates, 4);
    assert.equal(before.searchStats.pruning.contextStates, 2 ** (length + 1));
    assert.equal(r.searchStats.symbolic.transitions, 4 * length - 1);
    assert.deepEqual(r.searchStats.symbolic.supportCounts, [[String(2 ** (length - 1)), String(2 ** (length - 1))]]);
    assert.ok(r.searchStats.symbolic.certificateWork > 0);
    for (const c of r.symbolicCertificates!) {
      assert.ok(checkRegionDeclarations(c, input.model, input.holes));
      assert.equal(countSummarySupports(c).reduce((a, b) => a + b), 2n ** BigInt(length));
      assert.deepEqual(summaryForChoices(c, Array(length).fill(0))?.image, [0, 1]);
      assert.deepEqual(summaryForChoices(c, [1, ...Array(length - 1).fill(0)])?.image, [1, 0]);
    }
  }
});

test("support DAG counts 100^10 concrete implementations using two states per prefix", () => {
  const input = solve(synthesisFixture("coupled", 2)).symbolicCertificates![0];
  const template = input.stages[1];
  let work = 0;
  const c = compileRegion(Array.from({ length: 10 }, (_, hole) => ({ box: `h${hole}`, hole, inputPorts: template.inputPorts, outputPorts: template.outputPorts, choiceCount: 100,
    primitives: Array.from({ length: 100 }, (_, j) => template.primitives[j % 2]) })), n => { work += n ?? 1; });
  assert.ok(checkRegionCertificate(c));
  assert.deepEqual(c.layers.map(l => l.length), [1, ...Array(10).fill(2)]);
  assert.equal(c.stages.reduce((n, s) => n + s.edges.length, 0), 38);
  assert.deepEqual(countSummarySupports(c), [50_000_000_000_000_000_000n, 50_000_000_000_000_000_000n]);
  assert.ok(work < 20_000);
  assert.equal(countSummarySupports(c, Array(10).fill(1n)).reduce((a, b) => a + b), 1n);
});

test("behavior-equivalent choices retain distinct fixed costs, operating costs and requirements", () => {
  const input = synthesisFixture("memoization", 2);
  input.holes.forEach(h => {
    const a = h.alternatives[0];
    h.alternatives = [
      { ...a, id: "cheap", cost: { usd: 0 } },
      { ...a, id: "expensive-fixed", cost: { usd: 4 } },
      { ...a, id: "needs-more", feasibility: { requires: { in: 2 }, provides: { out: 1 }, cost: { usd: 0 } } },
    ];
  });
  input.contract.budget = { usd: 3 };
  const r = differential(input);
  assert.equal(r.satisfyingCount, 1);
  assert.equal(r.candidateSpace.enumerated, 9);
  assert.deepEqual(r.searchStats.symbolic.supportCounts, [["9"]]);
  assert.ok(r.results.some(r => r.result.reason === "resource-infeasible"));
  assert.equal(r.searchStats.symbolic.prefixWidths[0].at(-1), 1);
});

test("compensating permutations use explicit maps between three different carriers and arbitrary labels", () => {
  const input = synthesisFixture("coupled", 2);
  const values = [["scarlet", "aqua", "ochre"], ["cat", "dog", "elk"], ["alpha", "beta", "gamma"]];
  const carriers = ["A", "B", "C"];
  const behavior = (from: string[], to: string[], map: number[]) => from.map((x, i) => ({ in: { in: x }, out: { out: to[map[i]] } }));
  for (const m of [input.model, input.contract.target]) {
    m.domain = "physical";
    m.carriers = carriers.map((id, i) => ({ id, layer: "information", dimension: "arbitrary", values: values[i] }));
    for (const b of m.boxes) {
      b.name = "copy flip identity tags convey no semantics";
      const i = b.id === "h1" ? 1 : b.id === "product0" ? 2 : 0;
      b.inputs!.forEach(p => { p.carrier = carriers[i]; });
      b.outputs?.forEach(p => { p.carrier = carriers[b.id === "h0" ? 1 : b.id === "h1" ? 2 : 0]; });
      if (b.behavior) b.behavior = b.id === "product0" ? values[2].map(x => ({ in: { in: x }, out: {} }))
        : behavior(values[i], values[b.id === "h0" ? 1 : b.id === "h1" ? 2 : 0], [0, 1, 2]);
    }
    m.wires.forEach(w => { w.carrier = w.from.box === "source" ? "A" : w.from.box === "h0" ? "B" : "C"; });
  }
  input.holes.forEach((h, i) => { h.alternatives = [
    { id: "plain", behavior: behavior(values[i], values[i + 1], [0, 1, 2]), feasibility: h.alternatives[0].feasibility },
    { id: "rotate", behavior: behavior(values[i], values[i + 1], i ? [2, 0, 1] : [1, 2, 0]), feasibility: h.alternatives[0].feasibility },
  ]; });
  input.contract.acceptable = [{ carrier: "C", values: values[2] }];
  const r = differential(input);
  assert.equal(r.satisfyingCount, 2);
  assert.equal(r.searchStats.symbolic.status, "ready");
  assert.deepEqual(r.symbolicCertificates![0].layers.at(-1)![0].target, ["C"]);
  const invalid = structuredClone(input);
  invalid.model.boxes.find(b => b.id === "h1")!.inputs![0].carrier = "C"; // Same size, different carrier.
  assert.equal(synthesizeFinite({ ...invalid, strategy: "symbolic" }).ok, false);
  const c = structuredClone(r.symbolicCertificates![0]);
  c.stages[2].primitives[0].map.source = ["C"];
  assert.equal(checkRegionCertificate(c), false);
});

test("all total deterministic maps, including non-injective maps, match exhaustive on seeded libraries", () => {
  let seed = 991;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let sample = 0; sample < 24; sample++) {
    const input = synthesisFixture("coupled", 3);
    for (const h of input.holes) h.alternatives = Array.from({ length: 3 }, (_, j) => ({ id: `choice${j}`,
      behavior: ["0", "1"].map(x => ({ in: { in: x }, out: { out: String((random() >>> 12) % 2) } })), feasibility: h.alternatives[0].feasibility }));
    // Choose a target that can be implemented, including constant maps.
    input.holes.forEach(h => { input.contract.target.boxes.find(b => b.id === h.box)!.behavior = h.alternatives[0].behavior; });
    const r = differential(input);
    assert.equal(r.searchStats.symbolic.status, "ready");
  }
});

test("typed relabeling and distinct prefix maps preserve exhaustive choices", () => {
  differential(typedMapFixture());
  const r = differential(distinctMapFixture(4));
  assert.deepEqual(r.searchStats.symbolic.prefixWidths, [[1, 1, 2, 4, 8, 16]]);
  assert.equal(r.satisfyingCount, 1);
});

test("unknown resource modes and harm metadata retain the existing pre-behavior checks", () => {
  const missing = synthesisFixture("coupled", 2);
  delete missing.model.boxes[0].feasibility;
  const r = differential(missing);
  assert.equal(r.searchStats.symbolic.reason, "pre-behavior-validation");
  assert.equal(r.allDecided, false);
  const harms = synthesisFixture("coupled", 2);
  harms.implementation.declared_harms.push({ id: "risk", description: "Declared risk", wire: "absent" });
  for (const strategy of ["exhaustive", "optimized", "symbolic"] as const) assert.equal(synthesizeFinite({ ...harms, strategy }).ok, false);
});

test("partial/nondeterministic declarations fall back; names and two-valued carriers imply nothing", () => {
  for (const rows of [
    [{ in: { in: "0" }, out: { out: "0" } }],
    ["0", "1"].flatMap(x => ["0", "1"].map(y => ({ in: { in: x }, out: { out: y } }))),
  ]) {
    const input = synthesisFixture("coupled", 1);
    input.holes[0].alternatives = [{ ...input.holes[0].alternatives[0], id: "identity", behavior: rows }];
    const r = differential(input);
    assert.equal(r.searchStats.symbolic.status, "fallback");
    assert.equal(r.searchStats.symbolic.reason, "no-supported-serial-region");
  }
});

test("whole-model constraints survive substitution, including a disconnected impossible feedback loop", () => {
  const input = synthesisFixture("coupled", 3);
  input.model.boxes.push({ id: "loop", name: "Disconnected involution", role: "tool", inputs: [{ id: "in", carrier: "value" }], outputs: [{ id: "out", carrier: "value" }],
    behavior: input.holes[0].alternatives[1].behavior, feasibility: [{}] });
  input.model.wires.push({ id: "loop", from: { box: "loop", port: "out" }, to: { box: "loop", port: "in" }, carrier: "value", polarity: "useful" });
  const r = differential(input);
  assert.equal(r.searchStats.symbolic.status, "ready");
  assert.equal(r.satisfyingCount, 0);
  assert.equal(r.candidateSpace.pruned, 8);
});

test("two independent summarized regions retain a joint correlated boundary contract", () => {
  const input = synthesisFixture("coupled", 4);
  for (const m of [input.model, input.contract.target]) {
    const product = m.boxes.find(b => b.id === "product0")!;
    product.inputs = ["a", "b"].map(id => ({ id, carrier: "value" }));
    product.behavior = ["0", "1"].flatMap(a => ["0", "1"].map(b => ({ in: { a, b }, out: {} })));
    product.feasibility = [{ requires: { a: 1, b: 1 } }];
    m.wires = ["h0", "h1", "h2", "h3"].map((box, i) => ({ id: `feed${i}`, from: { box: i % 2 ? `h${i - 1}` : "source", port: "out" }, to: { box, port: "in" }, carrier: "value", polarity: "useful" }));
    m.wires.push(...["h1", "h3"].map((box, i) => ({ id: `observe${i}`, from: { box, port: "out" }, to: { box: "product0", port: ["a", "b"][i] }, carrier: "value", polarity: "useful" as const })));
  }
  const r = differential(input);
  assert.equal(r.searchStats.symbolic.regions, 2);
  assert.equal(r.satisfyingCount, 4);
  assert.equal(r.searchStats.pruning.contextStates, 8);
});

test("feedback and fan-in around summarized regions preserve full-system semantics", () => {
  for (const feedback of [false, true]) {
    const input = synthesisFixture("coupled", 3);
    for (const m of [input.model, input.contract.target]) m.wires.push({ id: "extra-equality", from: { box: feedback ? "h2" : "source", port: "out" }, to: { box: "h1", port: "in" }, carrier: "value", polarity: "useful" });
    differential(input);
  }
  const cycle = synthesisFixture("coupled", 2);
  // A cycle without a serial head stays entirely with the existing solver.
  for (const m of [cycle.model, cycle.contract.target]) {
    m.wires = m.wires.filter(w => w.from.box !== "source");
    m.wires.push({ id: "back", from: { box: "h1", port: "out" }, to: { box: "h0", port: "in" }, carrier: "value", polarity: "useful" });
  }
  const a = synthesizeFinite({ ...cycle, strategy: "symbolic" }), b = synthesizeFinite({ ...cycle, strategy: "exhaustive" });
  assert.ok(a.ok && b.ok && "searchStats" in a && "satisfyingCount" in b);
  assert.equal(a.satisfyingCount, b.satisfyingCount);
  assert.equal(a.verdict, b.verdict);
});

test("symbolic allowance exhaustion and memory exhaustion discard compilation atomically", () => {
  const input = synthesisFixture("coupled", 3), copy = structuredClone(input);
  const reference = solve(input, "optimized");
  for (const limits of [{ max_symbolic_work: 0 }, { max_symbolic_work: 100 }, { max_symbolic_cells: 0 }, { max_symbolic_cells: 50 }]) {
    const r = solve({ ...input, ...limits });
    assert.equal(r.searchStats.symbolic.status, "fallback");
    assert.equal(r.searchStats.symbolic.retainedCells, 0);
    assert.equal(r.satisfyingCount, reference.satisfyingCount);
    assert.deepEqual(successes(r), successes(reference));
  }
  const capped = synthesizeFinite({ ...input, strategy: "symbolic", max_work: 1000 });
  assert.ok(capped.ok && capped.verdict === "undecided" && !capped.complete);
  assert.deepEqual(input, copy);
});

test("backward-DAG work exhaustion rolls back domains; invalid later alternatives cannot be hidden", () => {
  const input = synthesisFixture("coupled", 3), budget = new EngineeringBudget(1_000_000), stats = symbolicStats();
  const pruner = SymbolicPruner.compile(input.model, input.contract.target, input.holes, budget, pruningStats(), stats, 100_000, 200_000, true, true);
  assert.ok(pruner);
  budget.spend(budget.remaining - 24);
  const original = [choiceMask(2), choiceMask(2), 1n];
  assert.deepEqual(pruner.filter(original)?.domains, original);
  assert.equal(stats.filterFallbacks, 1);
  assert.deepEqual(original, [3n, 3n, 1n]);
  const invalid = structuredClone(input);
  invalid.holes[2].alternatives[1].behavior[0].out.out = "undeclared";
  for (const strategy of ["exhaustive", "optimized", "symbolic"] as const) assert.equal(synthesizeFinite({ ...invalid, strategy }).ok, false);
});

test("boundary-equivalent implementations retain their own internal diagnostics and declaration-order witness", () => {
  const input = synthesisFixture("coupled", 2);
  input.holes.reverse(); // Declaration order differs from topology order.
  const r = differential(input);
  assert.deepEqual(r.witness?.choices, { h1: "copy", h0: "copy" });
  const good = r.results.filter(x => x.result.verdict === "satisfied");
  assert.equal(good.length, 2);
  const concepts = good.map(x => "behavior" in x.result && x.result.behavior?.ok && "concept" in x.result.behavior ? x.result.behavior.concept : undefined);
  assert.ok(concepts.every(Boolean));
  assert.notDeepEqual(concepts[0]!.relation[0].steadyStates, concepts[1]!.relation[0].steadyStates);
  assert.deepEqual(concepts[0]!.relation.map(x => x.outputs), concepts[1]!.relation.map(x => x.outputs));
});

test("independent checker rejects altered rows, carriers, compositions, support coverage and duplicate supports", () => {
  const input = synthesisFixture("coupled", 2), c = solve(input).symbolicCertificates![0];
  const mutations: Array<(c: RegionCertificate) => void> = [
    c => { c.stages[0].primitives[0].rows.pop(); },
    c => { c.stages[1].primitives[0].rows.push([0, 1]); },
    c => { c.layers[1][0].image[0] = 1; },
    c => { c.stages[1].edges[0].choices = []; },
    c => { c.stages[1].edges.push(c.stages[1].edges[0]); },
    c => { c.stages[2].hole = c.stages[1].hole; },
    c => { c.stages[1].hole = null; },
    c => { c.stages[1].primitives[0].map.source = ["other carrier of same size"]; },
  ];
  for (const change of mutations) { const bad = structuredClone(c); change(bad); assert.equal(checkRegionCertificate(bad), false); }
  const unrelated = structuredClone(input);
  unrelated.holes[0].alternatives[0].behavior.push({ in: { in: "0" }, out: { out: "1" } });
  assert.equal(checkRegionDeclarations(c, unrelated.model, unrelated.holes), false);
  const hostile = structuredClone(c);
  for (const layer of hostile.layers) for (const m of layer) { m.source = ['x"\nend\naxiom bad : False']; m.target = m.source; }
  const lean = exportSymbolicLean([hostile]);
  assert.ok(!lean.includes("axiom bad"));
  assert.ok(!lean.includes("native_decide"));
});
