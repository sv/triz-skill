/** Coupled finite implementations: behavior and resources are checked on the SAME choice. */
import { z } from "zod";
import { FunctionModel, checkModel, trimCandidates } from "./act.js";
import { compareBehavior, operationalAdequacy } from "./act-behavior.js";
import { feasibility } from "./act-feasibility.js";
import { levelsConsistency } from "./act-levels.js";
import { applyTrim } from "./act-rewrite.js";
import { at, fail, issue, type Failure } from "./act-issues.js";

const Id = z.string().min(1);
const Resources = z.record(z.string().min(1).regex(/^(?!__proto__$)/), z.number().nonnegative());
export const ContractAcceptable = z.strictObject({ box: Id.optional(), port: Id.optional(), carrier: Id.optional(), values: z.array(Id).min(1).optional(), at_least: z.number().nonnegative().optional(), below: z.number().nonnegative().optional() });
export const OperatingSituation = z.array(z.strictObject({ box: Id, port: Id, value: Id })).max(1000);
export const FiniteContract = z.strictObject({
  target: FunctionModel.describe("Whole-system finite target relation, including product/sink behavior"),
  acceptable: z.array(ContractAcceptable).min(1).max(1000),
  required_inputs: z.array(OperatingSituation).min(1).max(10000).optional(),
  budget: Resources.describe("ONE shared budget, used for every complete implementation"),
  allowed_harms: z.array(Id).max(1000).optional().describe("Ids of explicitly accepted declared harms; defaults to none"),
});
export const ImplementationMetadata = z.strictObject({
  contract: z.strictObject({
    operating_envelope: Id,
    resource_binding: z.literal("all-behavior-rows").describe("Assertion: this implementation's one resource mode supports its complete declared behavior relation in this envelope"),
  }),
  declared_harms: z.array(z.strictObject({ id: Id, description: Id, wire: Id.optional() })).max(1000),
  evidence: z.array(z.strictObject({ claim: Id, source: Id, operating_envelope: Id })).min(1).max(1000).describe("User-declared provenance; the kernel does not verify these empirical claims"),
});
export const ImplementationAlternative = ImplementationMetadata.extend({ id: Id, model: FunctionModel });
const Limits = { max_work: z.number().int().min(1).max(1_000_000).optional(), max_states: z.number().int().min(1).max(100_000).optional() };
export const ImplementationRequest = z.strictObject({ contract: FiniteContract, alternatives: z.array(ImplementationAlternative).min(1).max(100), ...Limits });
export const AbsorberAssignmentsRequest = z.strictObject({ model: FunctionModel, trim: z.array(Id).min(1).max(100), contract: FiniteContract, implementation: ImplementationMetadata, ...Limits });
export type Contract = z.infer<typeof FiniteContract>;
export type Alternative = z.infer<typeof ImplementationAlternative>;
export type Metadata = z.infer<typeof ImplementationMetadata>;

export const engineeringInvalid = (errors: z.ZodIssue[]): Failure => fail(errors.map((e) => issue("invalid-argument", at("$", ...e.path.map(String)), e.message, "Use the strict finite contract schema and declared model ids.")));
export class EngineeringBudget {
  used = 0;
  constructor(readonly max: number) {}
  get remaining() { return this.max - this.used; }
  spend(n = 1) { if (!Number.isSafeInteger(n) || n < 0 || n > this.remaining) return false; this.used += n; return true; }
  release(n: number) { this.used -= Math.max(0, Math.min(this.used, n)); }
}
/** Encoding units count declarations plus row cells; solver budgets count search states/row selections. */
export function modelWork(m: FunctionModel) {
  return m.carriers.reduce((n, c) => n + 1 + (c.values?.length ?? 0) + (c.levels?.length ?? 0), 0) + m.wires.length * 3 + m.boxes.reduce((n, b) => n + 1 + (b.inputs?.length ?? 0) + (b.outputs?.length ?? 0) + (b.state?.length ?? 0) + [...(b.behavior ?? []), ...(b.producible ?? []), ...(b.transition ?? [])].reduce((k, r) => k + 1 + Object.keys(r.in).length + Object.keys(r.out).length, 0) + Object.keys(b.cost ?? {}).length + (b.feasibility?.length ?? 0) ** 2 + (b.feasibility ?? []).reduce((k, r) => k + Object.keys(r.requires ?? {}).length + Object.keys(r.provides ?? {}).length + Object.keys(r.cost ?? {}).length, 0), 0) + (m.flows ?? []).reduce((n, f) => n + f.path.length, 0);
}
export const engineeringCap = (budget: EngineeringBudget) => ({ ok: true as const, verdict: "undecided" as const, reason: "work-cap" as const, complete: false as const, work: budget.used, maxWork: budget.max, scope: "whole" as const });
const capFailure = (x: { ok: boolean; issues?: Array<{ code: string }> }) => !x.ok && x.issues?.some((i) => i.code === "cap-exceeded");

/** One bounded joint check. Separate feasibility modes must be represented as separate alternatives. */
export function evaluateImplementation(contract: Contract, alternative: Alternative, budget: EngineeringBudget, maxStates = 100_000) {
  const base = { id: alternative.id, operatingEnvelope: alternative.contract.operating_envelope, evidence: alternative.evidence, declaredHarms: alternative.declared_harms, evidenceStatus: "declared-unverified" as const };
  if (!budget.spend(modelWork(alternative.model) + modelWork(contract.target))) return { ...base, ...engineeringCap(budget) };
  for (const [m, path] of [[alternative.model, "$.alternatives.model"], [contract.target, "$.contract.target"]] as const) {
    const checked = checkModel(m, path);
    if (!checked.ok) return { ...base, ...fail(checked.issues) };
  }
  // Whole-system behavior includes disconnected/sink boxes. Their resources must be
  // explicit too: omission is unknown, while [{}] asserts a zero-resource mode.
  const missingModes = alternative.model.boxes.filter((b) => !b.feasibility?.length).map((b) => b.id);
  if (missingModes.length) return { ...base, ok: true as const, verdict: "undecided" as const, reason: "missing-resource-mode" as const, boxes: missingModes,
    note: "Declare one feasibility row for every box in this complete implementation, including disconnected boxes and sinks. Use an explicit empty row only when asserting that the box requires no operating resources." };
  const uncoupled = alternative.model.boxes.filter((b) => (b.feasibility?.length ?? 0) > 1).map((b) => b.id);
  if (uncoupled.length) return { ...base, ok: true as const, verdict: "undecided" as const, reason: "uncoupled-resource-modes" as const, boxes: uncoupled,
    note: "Name each behavior/resource mode as a separate complete implementation. A feasibility row may not be selected independently of a behavior mode." };
  const levelCheck = levelsConsistency(alternative.model);
  if (levelCheck && !levelCheck.consistent) return { ...base, ok: true as const, verdict: "rejected" as const, reason: "level-inconsistency" as const, levelsConsistency: levelCheck,
    note: "This implementation's numeric resource mode contradicts its declared behavior under the carrier levels. Fix the feasibility row, behavior, or thresholds before asserting joint support." };
  const harms = alternative.declared_harms.map((h) => h.id);
  if (new Set(harms).size !== harms.length) return { ...base, ...fail([issue("invalid-argument", "$.alternatives.declared_harms", "declared harm ids must be distinct", "Give every declared harm a unique id.")]) };
  const nonexistent = alternative.declared_harms.filter((h) => h.wire !== undefined && !alternative.model.wires.some((w) => w.id === h.wire));
  if (nonexistent.length) return { ...base, ...fail([issue("unknown-wire", "$.alternatives.declared_harms", "a declared harm names a wire absent from its implementation", "Name a wire in this complete implementation, or omit wire for a non-wire risk.")]) };
  const undisclosed = alternative.model.wires.filter((w) => ["harmful", "excessive"].includes(w.polarity) && !alternative.declared_harms.some((h) => h.wire === w.id)).map((w) => w.id);
  if (undisclosed.length) return { ...base, ok: true as const, verdict: "undecided" as const, reason: "undisclosed-harms" as const, wires: undisclosed };
  const disallowed = harms.filter((h) => !(contract.allowed_harms ?? []).includes(h));
  if (disallowed.length) return { ...base, ok: true as const, verdict: "rejected" as const, reason: "disallowed-harms" as const, disallowed };
  // Reserve a GLOBAL allowance before each solver. compareBehavior performs at most two
  // maxStates searches and one maxStates boundary comparison; adequacy uses one search
  // and one boundary pass. Reserving the full allowance is deliberately conservative.
  const limit = Math.min(maxStates, Math.floor(budget.remaining / 6));
  if (limit < 1) return { ...base, ...engineeringCap(budget) };
  budget.spend(3 * limit);
  const behavior = compareBehavior(contract.target, alternative.model, { scope: "whole", maxStates: limit });
  if (capFailure(behavior)) return { ...base, ...engineeringCap(budget), behavior };
  if (!behavior.ok) return { ...base, ...behavior };
  const behaviorWork = "baseline" in behavior ? behavior.baseline.statesExplored + behavior.concept.statesExplored + behavior.inputValuations : 1;
  budget.release(3 * limit - behaviorWork);
  if (behavior.verdict === "undecided") return { ...base, ok: true as const, verdict: "undecided" as const, reason: "behavior-undecided" as const, behavior };
  if (behavior.verdict !== "preserved") return { ...base, ok: true as const, verdict: "rejected" as const, reason: "behavior-changed" as const, behavior };
  budget.spend(2 * limit);
  const adequacy = operationalAdequacy(alternative.model, contract.acceptable, { scope: "whole", maxStates: limit, requiredInputs: contract.required_inputs });
  if (capFailure(adequacy)) return { ...base, ...engineeringCap(budget), behavior, adequacy };
  if (!adequacy.ok) return { ...base, ...adequacy };
  const adequacyWork = "statesExplored" in adequacy ? (adequacy.statesExplored ?? 0) + (adequacy.requiredSituationCount ?? 0) : 1;
  budget.release(2 * limit - adequacyWork);
  if (adequacy.verdict === "undecided") return { ...base, ok: true as const, verdict: "undecided" as const, reason: "adequacy-undecided" as const, behavior, adequacy };
  if (adequacy.verdict !== "adequate") return { ...base, ok: true as const, verdict: "rejected" as const, reason: "inadequate" as const, behavior, adequacy };
  budget.spend(limit);
  const resources = feasibility({ ...alternative.model, budget: contract.budget }, { maxCandidates: limit, maxIterations: Math.min(1000, limit), maxAntichain: Math.min(1000, limit) });
  if (capFailure(resources)) return { ...base, ...engineeringCap(budget), behavior, adequacy, resources };
  if (!resources.ok) return { ...base, ...resources };
  budget.release(limit - ("candidates" in resources ? Math.max(1, resources.candidates) : 1));
  return { ...base, ok: true as const, verdict: resources.verdict === "feasible" ? "satisfied" as const : resources.verdict === "infeasible" ? "rejected" as const : "undecided" as const,
    reason: resources.verdict === "feasible" ? "joint-witness" as const : resources.verdict === "infeasible" ? "resource-infeasible" as const : "resources-undecided" as const,
    behavior, adequacy, resources, ...(levelCheck ? { levelsConsistency: levelCheck } : {}), scope: "whole" as const,
    note: resources.verdict === "feasible" ? "This complete declared implementation meets the behavior, adequacy, harm, and resource contract together. Evidence and the assertion that its single resource mode supports all behavior rows remain empirical premises." : "This complete declared implementation passes behavior, adequacy, and harm checks; its resource verdict is reported separately above. Evidence and behavior/resource coupling remain empirical premises." };
}

/** Evaluate every named implementation under one contract; never splice different choices. */
export function evaluateImplementations(input: unknown) {
  const p = ImplementationRequest.safeParse(input);
  if (!p.success) return engineeringInvalid(p.error.issues);
  const s = p.data, budget = new EngineeringBudget(s.max_work ?? 1_000_000);
  if (new Set(s.alternatives.map((a) => a.id)).size !== s.alternatives.length) return fail([issue("invalid-argument", "$.alternatives", "implementation ids must be distinct", "Name each complete implementation once.")]);
  const results: Array<Extract<ReturnType<typeof evaluateImplementation>, { ok: true }>> = [];
  for (const a of s.alternatives) {
    const result = evaluateImplementation(s.contract, a, budget, s.max_states);
    if (!result.ok) return result;
    results.push(result);
    if (result.verdict === "undecided" && result.reason === "work-cap") return { ...engineeringCap(budget), results, candidateCount: s.alternatives.length, checkedCount: results.length };
  }
  const satisfying = results.filter((r) => r.verdict === "satisfied").map((r) => r.id);
  return { ok: true as const, verdict: satisfying.length ? "satisfied" as const : results.some((r) => r.verdict === "undecided") ? "undecided" as const : "rejected" as const,
    complete: true as const, allDecided: results.every((r) => r.verdict !== "undecided"), candidateCount: s.alternatives.length, checkedCount: results.length, satisfying, results, work: budget.used, maxWork: budget.max,
    scope: "whole" as const, evidenceStatus: "declared-unverified" as const,
    note: "Satisfaction is witnessed by one named full implementation. A capable expensive implementation and an incapable cheap one do not jointly satisfy the contract." };
}

/** Enumerate EVERY compatible output endpoint and EVERY complete per-wire absorber assignment. */
export function enumerateAbsorberAssignments(input: unknown) {
  const p = AbsorberAssignmentsRequest.safeParse(input);
  if (!p.success) return engineeringInvalid(p.error.issues);
  const s = p.data, budget = new EngineeringBudget(s.max_work ?? 1_000_000);
  if (!budget.spend(modelWork(s.model))) return engineeringCap(budget);
  const screen = trimCandidates(s.model, s.trim);
  if (!screen.ok) return screen;
  const trimmed = new Set(s.trim);
  const functions = s.model.wires.filter((w) => trimmed.has(w.from.box) && !trimmed.has(w.to.box) && w.polarity !== "harmful").map((w) => ({ wire: w.id, carrier: w.carrier,
    endpoints: s.model.boxes.filter((b) => !trimmed.has(b.id)).flatMap((b) => (b.outputs ?? []).filter((q) => q.carrier === w.carrier).map((q) => ({ box: b.id, port: q.id }))) }));
  let candidateCount = 1;
  for (const f of functions) candidateCount = candidateCount > Number.MAX_SAFE_INTEGER / Math.max(1, f.endpoints.length) ? Infinity : candidateCount * f.endpoints.length;
  if (functions.some((f) => !f.endpoints.length)) return { ok: true as const, verdict: "rejected" as const, reason: "no-compatible-endpoint" as const, complete: true as const, candidateCount: 0, checkedCount: 0, functions };
  const assignment: Record<string, { box: string; port: string }> = Object.create(null);
  const results: Array<{ assignment: Record<string, { box: string; port: string }>; result: ReturnType<typeof evaluateImplementation> }> = [];
  let checked = 0, successes = 0, unknown = false, cap = false, failure: Failure | undefined;
  let witness: { assignment: Record<string, { box: string; port: string }>; model: FunctionModel; result: Extract<ReturnType<typeof evaluateImplementation>, { ok: true }> } | undefined;
  const walk = (k: number) => {
    if (!budget.spend()) { cap = true; return; }
    if (k < functions.length) {
      for (const e of functions[k].endpoints) { assignment[functions[k].wire] = e; walk(k + 1); if (cap || failure) return; }
      return;
    }
    if (!budget.spend(modelWork(s.model))) { cap = true; return; }
    const applied = applyTrim(s.model, { trim: s.trim, absorb: { ...assignment } });
    if (!applied.ok) { failure = applied; return; }
    const result = evaluateImplementation(s.contract, { ...s.implementation, id: `assignment-${checked + 1}`, model: applied.model }, budget, s.max_states);
    if (!result.ok) { failure = result; return; }
    checked++;
    if (result.verdict === "satisfied") {
      successes++;
      witness ??= { assignment: { ...assignment }, model: applied.model, result };
    }
    if (result.verdict === "undecided") unknown = true;
    if (result.verdict === "undecided" && result.reason === "work-cap") cap = true;
    if (results.length < 50) results.push({ assignment: { ...assignment }, result });
  };
  walk(0);
  if (failure) return failure;
  const common = { functions, candidateCount: Number.isFinite(candidateCount) ? candidateCount : null, checkedCount: checked, satisfyingCount: successes, allDecided: !unknown && !cap, results, listedLimit: 50, ...(witness ? { witness } : {}), work: budget.used, maxWork: budget.max,
    scope: "whole" as const, note: "Every compatible output port is a distinct choice. Assignments use one shared contract and budget, and each retained implementation must already declare its full behavior/resource mode and evidence." };
  if (cap) return { ...engineeringCap(budget), ...common };
  return { ok: true as const, verdict: successes ? "satisfied" as const : unknown ? "undecided" as const : "rejected" as const, complete: true as const, ...common };
}
