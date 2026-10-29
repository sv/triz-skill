/** Narrow discrete queue and conserved-quantity adapters; no continuous physics is inferred. */
import { z } from "zod";
import { checkModel, type FunctionModel } from "./act.js";
import { boundedDynamics, type DynamicsSpec } from "./act-dynamics.js";
import { at, fail, issue } from "./act-issues.js";

const Id = z.string().min(1);
const Count = z.number().int().nonnegative().max(1_000_000_000);
export const QueueRequest = z.strictObject({
  time_unit: Id.describe("Duration represented by one synchronous queue step, e.g. '1 ms'"),
  quantity_unit: Id.describe("Discrete conserved unit, e.g. requests or packets"),
  arrivals: z.array(z.array(Count).min(1).max(1000)).min(1).max(1000).describe("Alternative arrival counts for EACH time slot; every combination is considered"),
  service_capacity: Count.describe("Maximum units served per time slot"),
  storage_capacity: z.number().int().nonnegative().max(1000),
  initial_backlog: z.number().int().nonnegative().max(1000),
  schedule: z.enum(["arrive-then-serve", "serve-then-arrive"]).describe("Specifies exactly when storage overflow is checked"),
  max_work: z.number().int().min(1).max(1_000_000).optional(),
}).superRefine((s, ctx) => {
  if (s.initial_backlog > s.storage_capacity) ctx.addIssue({ code: "custom", path: ["initial_backlog"], message: "initial backlog exceeds storage capacity" });
  s.arrivals.forEach((a, i) => { if (new Set(a).size !== a.length) ctx.addIssue({ code: "custom", path: ["arrivals", i], message: "arrival alternatives must be distinct" }); });
});
export type QueueInput = z.infer<typeof QueueRequest>;
const invalid = (es: z.ZodIssue[]) => fail(es.map((e) => issue("invalid-argument", at("$", ...e.path.map(String)), e.message, "Use a discrete bounded queue with a declared slot duration and arrival alternatives.")));
const capped = (max: number, work: number) => ({ ok: true as const, verdict: "undecided" as const, reason: "work-cap" as const, complete: false as const, maxWork: max, work: Math.min(max, work) });

/** Compile the declared queue into a finite Mealy machine accepted by the dynamics kernel. */
export function compileQueueModel(input: unknown) {
  const p = QueueRequest.safeParse(input);
  if (!p.success) return invalid(p.error.issues);
  const s = p.data, max = s.max_work ?? 100_000;
  const amounts = [...new Set(s.arrivals.flat())].sort((a, b) => a - b);
  // Reserve work for all generated states/rows before allocating them.
  const work = s.arrivals.reduce((n, a) => n + a.length, 0) + (s.storage_capacity + 2) * (amounts.length + 1);
  if (work > max) return capped(max, work);
  const states = [...Array.from({ length: s.storage_capacity + 1 }, (_, n) => `q:${n}`), "overflow"];
  const transition = states.flatMap((state) => amounts.map((arrival) => {
    let next = "overflow";
    if (state !== "overflow") {
      const before = Number(state.slice(2));
      const peak = s.schedule === "arrive-then-serve" ? before + arrival : Math.max(0, before - s.service_capacity) + arrival;
      if (peak <= s.storage_capacity) next = `q:${s.schedule === "arrive-then-serve" ? Math.max(0, peak - s.service_capacity) : peak}`;
    }
    return { state, in: { arrivals: String(arrival) }, next, out: { backlog: next } };
  }));
  const model: FunctionModel = {
    domain: "software", system: `Discrete queue (${s.time_unit})`,
    carriers: [
      { id: "arrival", layer: "information", dimension: `${s.quantity_unit}/${s.time_unit}`, values: amounts.map(String) },
      { id: "backlog", layer: "information", dimension: s.quantity_unit, values: states },
    ],
    boxes: [{ id: "queue", name: "Finite queue", role: "tool", inputs: [{ id: "arrivals", carrier: "arrival" }], outputs: [{ id: "backlog", carrier: "backlog" }], state: states, initial: [`q:${s.initial_backlog}`], transition }], wires: [],
  };
  const checked = checkModel(model);
  if (!checked.ok) return fail(checked.issues);
  const spec: DynamicsSpec = {
    horizon: s.arrivals.length - 1,
    inputs: s.arrivals.map((a) => [{ box: "queue", port: "arrivals", values: a.map(String) }]),
    unsafe: [{ box: "queue", port: "backlog", values: ["overflow"] }],
  };
  return { ok: true as const, verdict: "compiled" as const, model, spec, work, maxWork: max,
    assumptions: { timeUnit: s.time_unit, quantityUnit: s.quantity_unit, schedule: s.schedule, overflow: "The buffer capacity is checked after arrivals in the declared schedule; overflow is absorbing.", scope: "Finite discrete slots, declared independent arrival alternatives, fixed service capacity. No average-rate or continuous-time guarantee." } };
}

/** Exhaust all declared arrival alternatives through boundedDynamics, including bursts. */
export function analyzeQueue(input: unknown) {
  const compiled = compileQueueModel(input);
  if (!compiled.ok || compiled.verdict !== "compiled") return compiled;
  const remaining = compiled.maxWork - compiled.work;
  if (remaining < 1) return capped(compiled.maxWork, compiled.work);
  const dynamics = boundedDynamics(compiled.model, { ...compiled.spec, maxStates: Math.min(100_000, remaining) });
  if (!dynamics.ok) {
    if (dynamics.issues.some((x) => x.code === "cap-exceeded")) return { ...capped(compiled.maxWork, compiled.maxWork), assumptions: compiled.assumptions };
    return dynamics;
  }
  if (!dynamics.decided) return { ok: true as const, verdict: "undecided" as const, complete: false as const, dynamics, assumptions: compiled.assumptions };
  const overflow = dynamics.escalation?.verdict === "reachable";
  return { ok: true as const, verdict: overflow ? "overflow" as const : "within-capacity" as const, complete: true as const,
    slots: compiled.spec.horizon! + 1, work: compiled.work + dynamics.statesExplored, maxWork: compiled.maxWork,
    dynamics, assumptions: compiled.assumptions,
    note: overflow ? "A declared arrival sequence overflows storage; the dynamics trace witnesses it." : "No declared arrival sequence overflows in these slots. This is a bounded result for the declared arrival alternatives." };
}

const QuantityPort = z.strictObject({ port: Id, amount: Count });
export const ConservationRequest = z.strictObject({
  operation: z.enum(["splitter", "merge"]),
  quantity_kind: z.enum(["extensive", "intensive"]),
  unit: Id,
  inputs: z.array(QuantityPort).min(1).max(1000).describe("Available amount, or shared intensive level"),
  outputs: z.array(QuantityPort).min(1).max(1000).describe("Simultaneous requested amounts, or minimum intensive levels"),
  allow_loss: z.boolean().optional(),
  max_work: z.number().int().min(1).max(1_000_000).optional(),
}).superRefine((s, ctx) => {
  if (s.operation === "splitter" && s.inputs.length !== 1) ctx.addIssue({ code: "custom", path: ["inputs"], message: "a splitter has exactly one input" });
  if (s.operation === "merge" && s.outputs.length !== 1) ctx.addIssue({ code: "custom", path: ["outputs"], message: "a merge has exactly one output" });
  for (const side of ["inputs", "outputs"] as const) if (new Set(s[side].map((p) => p.port)).size !== s[side].length) ctx.addIssue({ code: "custom", path: [side], message: "port ids must be distinct on each side" });
});

/** Extensive quantities add; shared intensive levels combine by max, as feasibility levels do. */
export function checkConservation(input: unknown) {
  const p = ConservationRequest.safeParse(input);
  if (!p.success) return invalid(p.error.issues);
  const s = p.data, work = s.inputs.length + s.outputs.length, max = s.max_work ?? 100_000;
  if (work > max) return capped(max, work);
  const intensive = s.quantity_kind === "intensive";
  const available = intensive ? Math.max(...s.inputs.map((p) => p.amount)) : s.inputs.reduce((n, p) => n + p.amount, 0);
  const required = intensive ? Math.max(...s.outputs.map((p) => p.amount)) : s.outputs.reduce((n, p) => n + p.amount, 0);
  const feasible = required <= available && (intensive || s.allow_loss !== false || required === available);
  return { ok: true as const, verdict: feasible ? "feasible" as const : "infeasible" as const, complete: true as const, work,
    quantityKind: s.quantity_kind, unit: s.unit, available, required, surplus: available - required,
    semantics: intensive ? "An output requires a minimum shared level; independent consumers may share that level. No mixing, amplification, or conservation of intensive levels is asserted." : "All simultaneous output amounts consume the same finite input pool; they are summed. No replenishment or amplification is implicit.",
    ...(feasible ? {} : { reason: required > available ? "insufficient-quantity" as const : "unaccounted-loss" as const }) };
}
