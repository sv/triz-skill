/** Complete bounded library search over multiple holes in a FIXED wiring diagram. */
import { z } from "zod";
import { FunctionModel, BehaviorRow, FeasibilityRow, checkModel } from "./act.js";
import { FiniteContract, ImplementationMetadata, EngineeringBudget, engineeringCap, engineeringInvalid, evaluateImplementation, modelWork } from "./act-contract.js";
import { fail, issue, type Failure } from "./act-issues.js";

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
  }
  let size = 1;
  for (const h of s.holes) size = size > Number.MAX_SAFE_INTEGER / h.alternatives.length ? Infinity : size * h.alternatives.length;
  const selected = new Map<string, (typeof s.holes)[number]["alternatives"][number]>();
  type Evaluation = Extract<ReturnType<typeof evaluateImplementation>, { ok: true }>;
  const results: Array<{ choices: Record<string, string>; result: Evaluation }> = [];
  let checkedCount = 0, satisfyingCount = 0, unknown = false, capped = false, failure: Failure | undefined;
  let witness: { choices: Record<string, string>; model: FunctionModel } | undefined;
  const search = (k: number) => {
    if (!budget.spend()) { capped = true; return; }
    if (k < s.holes.length) {
      for (const a of s.holes[k].alternatives) { selected.set(s.holes[k].box, a); search(k + 1); if (capped || failure) return; }
      return;
    }
    const choices = Object.fromEntries([...selected].map(([box, a]) => [box, a.id]));
    const model: FunctionModel = { ...s.model, boxes: s.model.boxes.map((b) => {
      const a = selected.get(b.id);
      if (!a) return b;
      const { producible: _producible, ...rest } = b;
      return { ...rest, behavior: a.behavior, feasibility: [a.feasibility], ...(a.cost !== undefined ? { cost: a.cost } : {}) };
    }) };
    const result = evaluateImplementation(s.contract, { ...s.implementation, id: `tuple-${checkedCount + 1}`, model }, budget, s.max_states);
    if (!result.ok) { failure = result; return; }
    checkedCount++;
    if (result.verdict === "satisfied") { satisfyingCount++; witness ??= { choices, model }; }
    if (result.verdict === "undecided") unknown = true;
    if (result.verdict === "undecided" && result.reason === "work-cap") capped = true;
    if (results.length < 50) results.push({ choices, result });
  };
  search(0);
  if (failure) return failure;
  const common = { candidateSpace: { size: Number.isFinite(size) ? size : null, enumerated: checkedCount, complete: !capped,
    scope: "Cartesian product of the declared finite libraries on the fixed wiring; no unlisted implementation or topology is searched." }, satisfyingCount, allDecided: !unknown && !capped, results, listedLimit: 50,
    ...(witness ? { witness } : {}), work: budget.used, maxWork: budget.max, scope: "whole" as const,
    note: "Each full tuple is checked for exact target relation equality, operational adequacy, declared harms, and one shared resource budget. Joint behavior rows preserve correlated outputs. An empty result proves impossibility only in this declared finite library when candidateSpace.complete is true and every candidate is decided." };
  if (capped) return { ...engineeringCap(budget), ...common };
  return { ok: true as const, verdict: satisfyingCount ? "synthesized" as const : unknown ? "undecided" as const : "impossible-in-library" as const, complete: true as const, ...common };
}
