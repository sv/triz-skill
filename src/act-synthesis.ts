/** Complete bounded library search over multiple holes in a FIXED wiring diagram. */
import { z } from "zod";
import { FunctionModel, BehaviorRow, FeasibilityRow, checkModel } from "./act.js";
import { FiniteContract, ImplementationMetadata, EngineeringBudget, engineeringCap, engineeringInvalid, evaluateImplementation, modelWork } from "./act-contract.js";
import { fail, issue, type Failure } from "./act-issues.js";
import { BehaviorEvaluationCache } from "./act-behavior.js";
import { SynthesisPruner, choiceMask, choiceIndices, combinationCount, pruningStats, type ChoiceConstraints } from "./act-synthesis-pruning.js";
import { SymbolicPruner, symbolicStats } from "./act-synthesis-symbolic.js";

const Id = z.string().min(1);
export const SynthesisRequest = z.strictObject({
  model: FunctionModel.describe("Fixed carriers, boxes, ports, and wires. Only listed holes' complete behavior/resource declarations are substituted"),
  contract: FiniteContract,
  implementation: ImplementationMetadata,
  holes: z.array(z.strictObject({
    box: Id,
    alternatives: z.array(z.strictObject({
      id: Id,
      behavior: z.array(BehaviorRow).min(1).max(10000).describe("Full joint rows, preserving correlations across all ports"),
      feasibility: FeasibilityRow.describe("ONE resource mode supporting ALL behavior rows in this alternative"),
      cost: z.record(z.string().min(1).regex(/^(?!__proto__$)/), z.number().nonnegative()).optional(),
    })).min(1).max(100),
  })).min(1).max(10),
  max_work: z.number().int().min(1).max(1_000_000).optional(),
  max_states: z.number().int().min(1).max(100_000).optional(),
  strategy: z.enum(["symbolic", "optimized", "exhaustive"]).default("optimized").describe("Symbolic checks and composes typed joint serial maps before union trace enumeration; optimized uses coupled residuals; exhaustive retains the reference Cartesian search"),
  max_symbolic_work: z.number().int().min(0).max(1_000_000).default(100_000),
  max_symbolic_cells: z.number().int().min(0).max(1_000_000).default(200_000).describe("Maximum retained symbolic certificate, mask and residual-cache characters; exhaustion discards compilation or skips cache insertion"),
  include_symbolic_certificate: z.boolean().optional().describe("Return the checked finite-map DAG encoding for independent local Lean checking"),
  optimizations: z.strictObject({ backward_residual: z.boolean().optional(), choice_propagation: z.boolean().optional(), memoize_boundaries: z.boolean().optional(), memoize_symbolic: z.boolean().optional() }).optional().describe("Disable individual optimizations for differential checks and benchmarks"),
  max_pruning_work: z.number().int().min(0).max(1_000_000).default(100_000).describe("Per compilation/propagation allowance within max_work, reserving at least three quarters of remaining work for validation; exhaustion falls back without speculative pruning"),
});

/** Full Cartesian tuples are tested; independent projections are never substituted for a relation. */
export function synthesizeFinite(input: unknown) {
  const p = SynthesisRequest.safeParse(input);
  if (!p.success) return engineeringInvalid(p.error.issues);
  const s = p.data, budget = new EngineeringBudget(s.max_work ?? 1_000_000);
  if (!budget.spend(modelWork(s.model) + s.holes.reduce((n, h) => n + h.alternatives.reduce((k, a) => k + a.behavior.length, 0), 0))) return { ...engineeringCap(budget), candidateSpace: { size: null, enumerated: 0, complete: false, scope: "Declared finite libraries on fixed wiring; cap reached before search." } };
  const checked = checkModel(s.model, "$.model");
  if (!checked.ok) return fail(checked.issues);
  if (s.model.boxes.some(b => b.inner)) return fail([issue("hierarchy-substitution", "$.model", "Finite synthesis requires expanded hierarchy", "Expand nested boxes before replacing hole behaviors or checking joint contracts.")]);
  const ids = s.holes.map((h) => h.box);
  if (new Set(ids).size !== ids.length) return fail([issue("invalid-argument", "$.holes", "a synthesis hole is listed twice", "List each hole once with all of its alternatives.")]);
  for (const [i, h] of s.holes.entries()) {
    const b = s.model.boxes.find((b) => b.id === h.box);
    if (!b) return fail([issue("unknown-box", `$.holes[${i}].box`, `unknown hole '${h.box}'`, "Name an existing box in the fixed model.")]);
    if (b.transition || b.state || b.initial) return fail([issue("invalid-argument", `$.holes[${i}].box`, "finite relation synthesis does not replace stateful machines", "Use stateless holes with full behavior rows; dynamics synthesis is unsupported.")]);
    if (new Set(h.alternatives.map((a) => a.id)).size !== h.alternatives.length) return fail([issue("invalid-argument", `$.holes[${i}].alternatives`, "alternative ids within a hole must be distinct", "Give each local alternative its own id.")]);
    // Validate every declaration before pruning can hide an invalid alternative.
    for (const a of h.alternatives) {
      const { producible: _producible, ...rest } = b;
      const declaration = { domain: s.model.domain, carriers: s.model.carriers, wires: [], boxes: [{ ...rest, behavior: a.behavior, feasibility: [a.feasibility], ...(a.cost !== undefined ? { cost: a.cost } : {}) }] };
      if (!budget.spend(modelWork(declaration))) return engineeringCap(budget);
      const valid = checkModel(declaration, `$.holes[${i}].alternatives`);
      if (!valid.ok) return fail(valid.issues);
    }
  }
  const checkedTarget = checkModel(s.contract.target, "$.contract.target");
  if (!checkedTarget.ok) return fail(checkedTarget.issues);
  const optimized = s.strategy !== "exhaustive";
  const cache = new BehaviorEvaluationCache(optimized && s.optimizations?.memoize_boundaries !== false);
  const pruning = pruningStats();
  const holeIds = new Set(ids);
  // These checks precede behavior in evaluateImplementation. Preserve its unknown/error
  // handling rather than using a behavior rejection to hide missing resource declarations.
  const canPrune = !s.model.boxes.some(b => !holeIds.has(b.id) && b.feasibility?.length !== 1)
    && new Set(s.implementation.declared_harms.map(h => h.id)).size === s.implementation.declared_harms.length
    && s.implementation.declared_harms.every(h => h.wire === undefined || s.model.wires.some(w => w.id === h.wire))
    && s.model.wires.every(w => !["harmful", "excessive"].includes(w.polarity) || s.implementation.declared_harms.some(h => h.wire === w.id));
  const residual = s.optimizations?.backward_residual !== false, propagation = s.optimizations?.choice_propagation !== false;
  const symbolic = symbolicStats();
  const symbolicPruner = s.strategy === "symbolic" && canPrune && (residual || propagation)
    ? SymbolicPruner.compile(s.model, s.contract.target, s.holes, budget, pruning, symbolic, s.max_symbolic_work, s.max_symbolic_cells, residual, propagation, s.max_pruning_work, s.optimizations?.memoize_symbolic !== false) : undefined;
  const pruner = !symbolicPruner && optimized && canPrune && (residual || propagation)
    ? SynthesisPruner.compile(s.model, s.contract.target, s.holes, budget, pruning, s.max_pruning_work, residual, propagation) : undefined;
  if (optimized && !canPrune) { pruning.status = "fallback"; pruning.reason = "pre-behavior-validation"; }
  if (s.strategy === "symbolic" && !canPrune) { symbolic.status = "fallback"; symbolic.reason = "pre-behavior-validation"; }
  const initialDomains = s.holes.map(h => choiceMask(h.alternatives.length));
  const sizeExact = combinationCount(initialDomains);
  const asNumber = (n: bigint) => n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
  const selected = new Map<string, (typeof s.holes)[number]["alternatives"][number]>();
  type Evaluation = Extract<ReturnType<typeof evaluateImplementation>, { ok: true }>;
  const results: Array<{ choices: Record<string, string>; result: Evaluation }> = [];
  let checkedCount = 0, satisfyingCount = 0, unknown = false, capped = false, failure: Failure | undefined;
  let pruned = 0n, searchNodes = 0;
  let witness: { choices: Record<string, string>; model: FunctionModel } | undefined;
  const search = (k: number, incoming: bigint[], constraints?: ChoiceConstraints) => {
    if (!budget.spend()) { capped = true; return; }
    searchNodes++;
    const filtered: { domains: bigint[]; constraints?: ChoiceConstraints } | undefined = symbolicPruner ? symbolicPruner.filter(incoming) : pruner?.filter(incoming, constraints);
    const domains = pruner || symbolicPruner ? filtered?.domains : incoming;
    if (pruner || symbolicPruner) pruned += combinationCount(incoming) - (domains ? combinationCount(domains) : 0n);
    if (!domains) return;
    if (k < s.holes.length) {
      for (const i of choiceIndices(domains[k], s.holes[k].alternatives.length)) {
        selected.set(s.holes[k].box, s.holes[k].alternatives[i]);
        const next = [...domains]; next[k] = 1n << BigInt(i);
        search(k + 1, next, filtered?.constraints);
        if (capped || failure) return;
      }
      return;
    }
    const choices = Object.fromEntries([...selected].map(([box, a]) => [box, a.id]));
    const model: FunctionModel = { ...s.model, boxes: s.model.boxes.map((b) => {
      const a = selected.get(b.id);
      if (!a) return b;
      const { producible: _producible, ...rest } = b;
      return { ...rest, behavior: a.behavior, feasibility: [a.feasibility], ...(a.cost !== undefined ? { cost: a.cost } : {}) };
    }) };
    const result = evaluateImplementation(s.contract, { ...s.implementation, id: `tuple-${checkedCount + 1}`, model }, budget, s.max_states, cache);
    if (!result.ok) { failure = result; return; }
    checkedCount++;
    if (result.verdict === "satisfied") { satisfyingCount++; witness ??= { choices, model }; }
    if (result.verdict === "undecided") unknown = true;
    if (result.verdict === "undecided" && result.reason === "work-cap") capped = true;
    if (results.length < 50) results.push({ choices, result });
  };
  search(0, initialDomains);
  if (failure) return failure;
  const common = { candidateSpace: { size: asNumber(sizeExact), sizeExact: String(sizeExact), enumerated: checkedCount,
    pruned: asNumber(pruned), prunedExact: String(pruned), accountedFor: asNumber(pruned + BigInt(checkedCount)), complete: !capped,
    scope: "Cartesian product of the declared finite libraries on the fixed wiring; no unlisted implementation or topology is searched." }, satisfyingCount, allDecided: !unknown && !capped, results, listedLimit: 50,
    searchStats: { strategy: s.strategy, searchNodes, fullEvaluations: checkedCount, combinationsAvoided: asNumber(pruned), pruning,
      symbolic, boundarySummaries: { computations: cache.stats.computations, hits: cache.stats.hits, entries: cache.stats.entries, behaviorTraces: cache.stats.traces, retainedCells: cache.stats.cells } },
    ...(s.include_symbolic_certificate && symbolicPruner ? { symbolicCertificates: symbolicPruner.regions.map(r => r.certificate) } : {}),
    ...(witness ? { witness } : {}), work: budget.used, maxWork: budget.max, scope: "whole" as const,
    note: "Surviving full tuples are checked for exact target relation equality, operational adequacy, declared harms, and one shared resource budget. Pruned tuples violate coupled target safety/coverage constraints; results lists evaluated tuples only. Joint behavior rows are never independently projected or deleted. An empty result proves impossibility only in this declared finite library when candidateSpace.complete is true and every remaining candidate is decided." };
  if (capped) return { ...engineeringCap(budget), ...common };
  return { ok: true as const, verdict: satisfyingCount ? "synthesized" as const : unknown ? "undecided" as const : "impossible-in-library" as const, complete: true as const, ...common };
}
