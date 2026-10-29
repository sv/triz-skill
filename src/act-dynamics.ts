/**
 * Declared dynamics: bounded reachability of a function model whose boxes declare state.
 *
 * A box that declares `state`, `initial`, and `transition` rows (state, inputs) → (next state,
 * outputs) is a nondeterministic Mealy machine: a map S × I → P(S × O), equivalently a coalgebra
 * S → P(S × O)^I. A lens or optic with a residual is such a machine with the residual as its
 * state; nothing more about optics is computed or claimed. A box that declares `behavior` is a
 * machine with one state.
 *
 *  - Step. The composed boxes run synchronously along the wiring. Wires are instantaneous, as in
 *    triz_behavior, and memory lives only in declared state. A step from a global state is a
 *    valuation of the composed ports that every stateless relation, every stateful box's rows at
 *    its current state, and every wire admit, with the next state the picked rows name. A loop
 *    through stateless boxes resolves within the step by the relational trace.
 *  - Configuration at time t: the global state and the valuation of the step taken at t. A state
 *    with no consistent valuation blocks the run: the declared rows say nothing after it.
 *  - boundedDynamics — breadth first from the initial states, over the boundary inputs allowed at
 *    each time, up to a horizon: the reachable configurations, the fixed points among them, the
 *    blocked runs, and three verdicts. Escalation: some run reaches an unsafe set (shortest
 *    trace). Invariance: every reachable configuration is in a safe set. Separation in time: one
 *    run visits each demand's target set within its window.
 *  - checkRun — re-checks a trace step by step against the declared rows, independently of the
 *    search. Every trace boundedDynamics returns passes it.
 *
 * Every search is finite and capped; past the cap the call fails closed. Verdicts hold for the
 * rows as declared. Continuous time, convergence rates, and control are outside the kernel.
 */
import { z } from "zod";
import { checkModel, type FunctionModel } from "./act.js";
import { MAX_STATES, bindRow, joinRows, portVariables, type Binding, type Box, type PortVariables, type Typed } from "./act-behavior.js";
import type { Theorem } from "./act-basis.js";

type Failure = { ok: false; errors: string[] };

export const MAX_HORIZON = 1000;
export const DEFAULT_HORIZON = 20;
const LISTED = 50;

const Id = z.string().min(1);
export const Condition = z.union([
  z.strictObject({ box: Id, state: z.array(Id).min(1).describe("The box is in one of these states") }),
  z.strictObject({ box: Id, port: Id, values: z.array(Id).min(1).describe("The port carries one of these values") }),
]).describe("A box's state, or a port's value, at one time");
export const Target = z.array(Condition).min(1).describe("A target set: the configurations where every condition holds");
export const PortValues = z.strictObject({ box: Id, port: Id.describe("An unwired input port"), values: z.array(Id).min(1) });
export const TimedDemand = z.strictObject({
  id: Id,
  where: Target,
  window: z.strictObject({ from: z.number().int().min(0), to: z.number().int().min(0) })
    .describe("Inclusive times, at most the horizon; the windows of different demands must not overlap"),
}).describe("A demand met when its target set holds at some time within its window");
export type Condition = z.infer<typeof Condition>;
export type PortValues = z.infer<typeof PortValues>;
export type TimedDemand = z.infer<typeof TimedDemand>;

export interface DynamicsSpec {
  horizon?: number;
  initial?: Record<string, string[]>;
  inputs?: PortValues[][];
  unsafe?: Condition[];
  safe?: Condition[];
  separation?: TimedDemand[];
  maxStates?: number;
}

/** A trace whose every step is admitted, ending in the set, makes the set reachable. */
const TRACE: Theorem[] = ["reach_of_trace"];
/** Nothing in the set within the horizon iff no trace of at most that length ends there. */
const EXHAUSTED: Theorem[] = ["reachWithin_iff_trace"];
/** A layer that adds nothing: the bounded reachable set is the whole reachable set. */
const SATURATED: Theorem[] = ["reachWithin_iff_trace", "reachWithin_saturated"];
/** Every point of one trace is reached at its own time, along that one run. */
const TIMED: Theorem[] = ["reachIn_of_trace"];
/** A configuration at exactly time t iff some trace of exactly t steps ends there. */
const TIMED_EXHAUSTED: Theorem[] = ["reachIn_iff_trace"];

const tupleKey = (t: unknown[]) => JSON.stringify(t);
const product = (sizes: number[]) => sizes.reduce((n, k) => n * k, 1);
const duplicates = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
const NOTHING = "nothing to explore: declare state, initial, and transition on a box, or pass unsafe, safe, or separation";
const ASSUMPTION = "Composed: every box that declares transition, every box a target names, and every box upstream of them. Every other box is assumed to accept whatever it receives. A downstream box with partial rows (partialDownstream) would cut runs in the full composite; it is not composed here.";
const SEMANTICS = "Synchronous semantics: wires are instantaneous within a step, memory lives only in declared state, and a loop through stateless boxes resolves within a step as in triz_behavior. Runs are explored breadth first; every trace is a shortest one and is re-checked against the declared rows. Nothing here models continuous time, convergence rates, or control.";

interface Plan { composed: Box[]; downstream: string[]; missing: string[]; partialDownstream: string[]; }

/** The observed boxes and every box upstream of them (backwards along wires), and what they lack. */
function plan(model: FunctionModel, observed: Set<string>): Plan {
  const feeders = new Map<string, string[]>();
  for (const w of model.wires) feeders.set(w.to.box, [...(feeders.get(w.to.box) ?? []), w.from.box]);
  const reached = new Set<string>();
  const queue = [...observed];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (reached.has(id)) continue;
    reached.add(id);
    queue.push(...(feeders.get(id) ?? []));
  }
  const values = new Map(model.carriers.map((c) => [c.id, c.values ?? []]));
  const inputs = (b: Box, r: { in: Record<string, string> }) => (b.inputs ?? []).map((p) => r.in[p.id]);
  const tuples = (b: Box) => product((b.inputs ?? []).map((p) => values.get(p.carrier)!.length));
  const total = (b: Box) => (b.transition
    ? new Set(b.transition.map((r) => tupleKey([r.state, ...inputs(b, r)]))).size === b.state!.length * tuples(b)
    : new Set(b.behavior!.map((r) => tupleKey(inputs(b, r)))).size === tuples(b));
  const composed = model.boxes.filter((b) => reached.has(b.id));
  const downstream = model.boxes.filter((b) => !reached.has(b.id));
  return {
    composed,
    downstream: downstream.map((b) => b.id),
    missing: composed.filter((b) => !b.behavior && !b.transition).map((b) => b.id),
    partialDownstream: downstream.filter((b) => (b.behavior || b.transition) && !total(b)).map((b) => b.id),
  };
}

/** Targets, initial states, inputs, horizon, and windows name declared boxes, ports, states, and values. Fail closed. */
function specErrors(model: FunctionModel, spec: DynamicsSpec, horizon: number): string[] {
  const errors: string[] = [];
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const values = new Map(model.carriers.map((c) => [c.id, c.values]));
  const condition = (where: string, c: Condition) => {
    const b = boxes.get(c.box);
    if (!b) { errors.push(`${where}: unknown box '${c.box}'`); return; }
    if ("state" in c) {
      if (!b.state) { errors.push(`${where}: box '${c.box}' declares no state`); return; }
      for (const s of c.state) if (!b.state.includes(s)) errors.push(`${where}: state '${s}' is not declared by box '${c.box}'`);
      return;
    }
    const p = [...(b.inputs ?? []), ...(b.outputs ?? [])].find((q) => q.id === c.port);
    if (!p) { errors.push(`${where}: box '${c.box}' has no port '${c.port}'`); return; }
    const declared = values.get(p.carrier);
    if (!declared) { errors.push(`${where}: carrier '${p.carrier}' of port '${c.box}.${c.port}' declares no values`); return; }
    for (const x of c.values) if (!declared.includes(x)) errors.push(`${where}: value '${x}' of port '${c.box}.${c.port}' is not declared by carrier '${p.carrier}'`);
  };
  (spec.unsafe ?? []).forEach((c, i) => condition(`unsafe[${i}]`, c));
  (spec.safe ?? []).forEach((c, i) => condition(`safe[${i}]`, c));
  const demands = spec.separation ?? [];
  if (spec.separation && demands.length < 2) errors.push("separation needs at least two demands");
  for (const id of duplicates(demands.map((d) => d.id))) errors.push(`separation: duplicate demand id '${id}'`);
  for (const d of demands) {
    d.where.forEach((c, i) => condition(`separation '${d.id}' where[${i}]`, c));
    if (d.window.from > d.window.to) errors.push(`separation '${d.id}': window from ${d.window.from} is after to ${d.window.to}`);
    if (d.window.to > horizon) errors.push(`separation '${d.id}': window ends at ${d.window.to}, after the horizon ${horizon}`);
  }
  demands.forEach((d, i) => demands.slice(i + 1).forEach((e) => {
    if (d.window.from <= e.window.to && e.window.from <= d.window.to) {
      errors.push(`separation: the windows of '${d.id}' and '${e.id}' overlap; demands separated in time need disjoint windows`);
    }
  }));
  for (const [id, states] of Object.entries(spec.initial ?? {})) {
    const b = boxes.get(id);
    if (!b) { errors.push(`initial: unknown box '${id}'`); continue; }
    if (!b.state) { errors.push(`initial: box '${id}' declares no state`); continue; }
    for (const s of states) if (!b.state.includes(s)) errors.push(`initial: state '${s}' is not declared by box '${id}'`);
  }
  const wired = new Set(model.wires.map((w) => tupleKey([w.to.box, w.to.port])));
  (spec.inputs ?? []).forEach((entry, t) => {
    for (const k of duplicates(entry.map((q) => tupleKey([q.box, q.port])))) errors.push(`inputs[${t}]: port ${k} is listed twice`);
    for (const q of entry) {
      const p = boxes.get(q.box)?.inputs?.find((x) => x.id === q.port);
      if (!p) { errors.push(`inputs[${t}]: '${q.box}.${q.port}' is not an input port`); continue; }
      if (wired.has(tupleKey([q.box, q.port]))) { errors.push(`inputs[${t}]: input port '${q.box}.${q.port}' is wired; only unwired (boundary) inputs can be set`); continue; }
      const declared = values.get(p.carrier);
      if (!declared) { errors.push(`inputs[${t}]: carrier '${p.carrier}' of port '${q.box}.${q.port}' declares no values`); continue; }
      for (const x of q.values) if (!declared.includes(x)) errors.push(`inputs[${t}]: value '${x}' of port '${q.box}.${q.port}' is not declared by carrier '${p.carrier}'`);
    }
  });
  if (spec.inputs && horizon > spec.inputs.length - 1) {
    errors.push(`horizon ${horizon} needs ${horizon + 1} input entries (times 0 to ${horizon}); inputs has ${spec.inputs.length}`);
  }
  return errors;
}

type Predicate = (state: string[], values: string[]) => boolean;
interface Table { box: Box; vars: number[]; rows: Binding[]; byState?: Map<string, { rows: Binding[]; next: string[] }>; }
interface System {
  plan: Plan;
  vars: PortVariables;
  machines: Box[];
  initial: string[][];
  tables: Table[];
  /** Composed index of each machine. */
  slot: number[];
  sequence: boolean;
  allowed: (t: number) => Map<number, Set<string>>;
  holds: (target: Condition[]) => Predicate;
}
type Compiled = { kind: "failure"; errors: string[] } | { kind: "undecided"; plan: Plan } | ({ kind: "system" } & System);

function compile(model: FunctionModel, spec: DynamicsSpec): Compiled {
  const check = checkModel(model);
  if (!check.ok) return { kind: "failure", errors: check.errors };
  const horizon = horizonOf(spec);
  if (!Number.isInteger(horizon) || horizon < 0 || horizon > MAX_HORIZON) {
    return { kind: "failure", errors: [`horizon must be an integer from 0 to ${MAX_HORIZON}; got ${horizon}`] };
  }
  const errors = specErrors(model, spec, horizon);
  if (errors.length) return { kind: "failure", errors };
  const named = [...spec.unsafe ?? [], ...spec.safe ?? [], ...(spec.separation ?? []).flatMap((d) => d.where)].map((c) => c.box);
  const observed = new Set([...model.boxes.filter((b) => b.transition).map((b) => b.id), ...named]);
  if (!observed.size) return { kind: "failure", errors: [NOTHING] };
  const p = plan(model, observed);
  if (p.missing.length) return { kind: "undecided", plan: p };

  const machines = p.composed.filter((b) => b.transition);
  const initial = machines.map((b) => (spec.initial && Object.hasOwn(spec.initial, b.id) ? spec.initial[b.id] : b.initial ?? []));
  const uninitialised = machines.filter((_, k) => !initial[k].length).map((b) => b.id);
  if (uninitialised.length) {
    return { kind: "failure", errors: uninitialised.map((id) => `box '${id}' declares state but no initial states: declare initial on the box, or pass initial`) };
  }
  const vars = portVariables(model, p.composed);
  const portsOf = (b: Box) => [...new Set([...(b.inputs ?? []).map((q) => vars.at(b.id, "in", q.id)), ...(b.outputs ?? []).map((q) => vars.at(b.id, "out", q.id))])];
  const tables: Table[] = p.composed.map((b) => {
    if (!b.transition) {
      const seen = new Map<string, Binding>();
      for (const r of b.behavior!) { const binding = bindRow(b, r, vars.at); seen.set(tupleKey(binding.map(([, x]) => x)), binding); }
      return { box: b, vars: portsOf(b), rows: [...seen.values()] };
    }
    const byState = new Map<string, { rows: Binding[]; next: string[]; seen: Set<string> }>();
    for (const r of b.transition) {
      const binding = bindRow(b, r, vars.at);
      const at = byState.get(r.state) ?? byState.set(r.state, { rows: [], next: [], seen: new Set() }).get(r.state)!;
      const k = tupleKey([...binding.map(([, x]) => x), r.next]);
      if (!at.seen.has(k)) { at.seen.add(k); at.rows.push(binding); at.next.push(r.next); }
    }
    return { box: b, vars: portsOf(b), rows: [], byState: new Map([...byState].map(([s, { rows, next }]) => [s, { rows, next }])) };
  });
  const slot = machines.map((m) => p.composed.indexOf(m));
  const index = (b: Box, port: string) => vars.at(b.id, (b.inputs ?? []).some((q) => q.id === port) ? "in" : "out", port);
  const byId = new Map(model.boxes.map((b) => [b.id, b]));
  const allowed = (t: number) => new Map((spec.inputs?.[t] ?? [])
    .filter((q) => p.composed.some((b) => b.id === q.box))
    .map((q) => [vars.at(q.box, "in", q.port), new Set(q.values)] as const));
  const holds = (target: Condition[]): Predicate => {
    const atoms = target.map((c) => ("state" in c
      ? { state: true, at: machines.findIndex((m) => m.id === c.box), ok: new Set(c.state) }
      : { state: false, at: index(byId.get(c.box)!, c.port), ok: new Set(c.values) }));
    return (state, values) => atoms.every((a) => a.ok.has(a.state ? state[a.at] : values[a.at]));
  };
  return { kind: "system", plan: p, vars, machines, initial, tables, slot, sequence: spec.inputs !== undefined, allowed, holds };
}

const horizonOf = (spec: DynamicsSpec) => spec.horizon ?? (spec.inputs ? spec.inputs.length - 1 : DEFAULT_HORIZON);

interface Step { values: string[]; next: string[][]; }
interface Node { time: number; state: string[]; values: string[]; next: string[][]; mask: number; parent?: Node; }
export interface RunStep { time: number; state: string[]; values?: string[]; }

/** Every step from a global state at time t: each consistent valuation with the next states its rows allow. */
function stepper(s: System, budget: { explored: number; max: number }) {
  const memo = new Map<string, Step[]>();
  return (state: string[], t: number): Step[] | undefined => {
    const key = tupleKey([s.sequence ? t : 0, state]);
    const hit = memo.get(key);
    if (hit) return hit;
    const allowed = s.allowed(t);
    const admits = (binding: Binding) => binding.every(([i, x]) => !allowed.has(i) || allowed.get(i)!.has(x));
    const sets = s.tables.map((tb, j) => {
      const at = tb.byState ? tb.byState.get(state[s.slot.indexOf(j)]) ?? { rows: [], next: [] } : { rows: tb.rows, next: [] as string[] };
      const keep = at.rows.flatMap((r, i) => (admits(r) ? [i] : []));
      return { vars: tb.vars, rows: keep.map((i) => at.rows[i]), next: keep.map((i) => at.next[i]) };
    });
    const found = new Map<string, { values: string[]; next: Map<string, string[]> }>();
    const assign: Array<string | undefined> = new Array(s.vars.variables.length).fill(undefined);
    const ok = joinRows(sets, assign, (picked) => {
      const values = assign.map((x) => x!);
      const next = s.slot.map((j) => sets[j].next[picked[j]]);
      const k = tupleKey(values);
      const entry = found.get(k) ?? found.set(k, { values, next: new Map() }).get(k)!;
      entry.next.set(tupleKey(next), next);
    }, budget);
    if (!ok) return undefined;
    const steps = [...found.values()].map((e) => ({ values: e.values, next: [...e.next.values()] }));
    memo.set(key, steps);
    return steps;
  };
}

function initialStates(s: System): string[][] {
  let out: string[][] = [[]];
  s.initial.forEach((states) => { out = out.flatMap((prefix) => states.map((x) => [...prefix, x])); });
  return out;
}

const traceTo = (n: Node): RunStep[] => {
  const out: RunStep[] = [];
  for (let m: Node | undefined = n; m; m = m.parent) out.unshift({ time: m.time, state: m.state, values: m.values });
  return out;
};

/** Each step of the trace is admitted by the declared rows, from an initial state over the allowed inputs. */
function runErrors(s: System, trace: RunStep[]): string[] {
  const errors: string[] = [];
  if (!trace.length) return ["the trace is empty"];
  const n = s.vars.variables.length;
  trace.forEach((step, t) => {
    if (step.time !== t) errors.push(`step ${t}: time ${step.time}, expected ${t}`);
    if (step.state.length !== s.machines.length) { errors.push(`step ${t}: ${step.state.length} states for ${s.machines.length} stateful boxes`); return; }
    if (t === 0) s.machines.forEach((m, k) => { if (!s.initial[k].includes(step.state[k])) errors.push(`step 0: '${step.state[k]}' is not an initial state of '${m.id}'`); });
    if (!step.values) { if (t !== trace.length - 1) errors.push(`step ${t}: only the last step may block`); return; }
    if (step.values.length !== n) { errors.push(`step ${t}: ${step.values.length} values for ${n} variables`); return; }
    const values = step.values;
    for (const [i, ok] of s.allowed(t)) if (!ok.has(values[i])) errors.push(`step ${t}: input '${values[i]}' is not allowed on ${s.vars.variables[i].box}.${s.vars.variables[i].port}`);
    const following = trace[t + 1]?.state;
    const fits = (b: Box, r: { in: Record<string, string>; out: Record<string, string> }) =>
      (b.inputs ?? []).every((q) => r.in[q.id] === values[s.vars.at(b.id, "in", q.id)])
      && (b.outputs ?? []).every((q) => r.out[q.id] === values[s.vars.at(b.id, "out", q.id)]);
    for (const tb of s.tables) {
      const b = tb.box, k = s.machines.indexOf(b);
      const admitted = k < 0
        ? b.behavior!.some((r) => fits(b, r))
        : b.transition!.some((r) => r.state === step.state[k] && (!following || r.next === following[k]) && fits(b, r));
      if (!admitted) errors.push(`step ${t}: no row of box '${b.id}' admits this step`);
    }
  });
  return errors;
}

/**
 * Re-check a trace (as boundedDynamics returns it: states aligned to `machines`, values to
 * `variables`) against the declared rows: an initial state first, then every step admitted by
 * every composed box's rows, the inputs allowed at its time, and each next state named by a row.
 */
export function checkRun(model: FunctionModel, spec: DynamicsSpec, trace: RunStep[]) {
  const s = compile(model, spec);
  if (s.kind === "failure") return { ok: false as const, errors: s.errors };
  if (s.kind === "undecided") return { ok: false as const, errors: [`declare behavior or transition for ${s.plan.missing.map((id) => `'${id}'`).join(", ")}`] };
  const errors = runErrors(s, trace);
  return { ok: errors.length === 0, errors };
}

/**
 * Explore every run from the initial states up to the horizon and decide escalation (unsafe),
 * invariance (safe), and separation in time (separation). Without an input sequence the system is
 * time-invariant: configurations are explored once, and a layer that adds none means the reachable
 * set is complete for every horizon. With one, configurations are indexed by time.
 */
export function boundedDynamics(model: FunctionModel, spec: DynamicsSpec = {}) {
  const s = compile(model, spec);
  if (s.kind === "failure") return { ok: false as const, errors: s.errors };
  if (s.kind === "undecided") {
    return {
      ok: true as const, decided: false as const, missingBehavior: s.plan.missing, composed: s.plan.composed.map((b) => b.id),
      note: `Declare behavior or transition for ${s.plan.missing.map((id) => `'${id}'`).join(", ")}: they are upstream of an observed box, so the runs depend on them.`,
    };
  }
  const horizon = horizonOf(spec);
  const max = spec.maxStates ?? MAX_STATES;
  const starts = product(s.initial.map((x) => x.length));
  if (starts > max) return { ok: false as const, errors: [`the initial states have ${starts} combinations; the cap is ${max}. Declare fewer initial states`] };
  const budget = { explored: 0, max };
  const steps = stepper(s, budget);
  const OVERFLOW = { ok: false as const, errors: [`the bounded search passed ${max} states. Lower the horizon, declare fewer states or values, or split the model`] };
  const verified = (trace: RunStep[]) => {
    const errors = runErrors(s, trace);
    // The search only follows admitted rows; never emit a trace the declared rows reject.
    if (errors.length) throw new Error(`boundedDynamics invariant: ${errors.join("; ")}`);
    return trace;
  };

  // Escalation and invariance: one breadth-first search, configurations keyed without time unless inputs vary.
  const unsafe = spec.unsafe && s.holds(spec.unsafe), safe = spec.safe && s.holds(spec.safe);
  const seen = new Map<string, Node>();
  const blocked = new Map<string, { time: number; state: string[]; parent?: Node }>();
  const fixed: Node[] = [];
  let hit: Node | undefined, violation: Node | undefined, overflow = false;
  const expand = (state: string[], time: number, parent: Node | undefined, into: Node[]) => {
    const out = steps(state, time);
    if (!out) { overflow = true; return; }
    if (!out.length) {
      const k = tupleKey([s.sequence ? time : 0, state]);
      if (!blocked.has(k)) blocked.set(k, { time, state, parent });
    }
    for (const st of out) {
      const k = tupleKey([s.sequence ? time : 0, state, st.values]);
      if (seen.has(k)) continue;
      if (++budget.explored > max) { overflow = true; return; }
      const n: Node = { time, state, values: st.values, next: st.next, mask: 0, parent };
      seen.set(k, n);
      into.push(n);
      if (unsafe && !hit && unsafe(state, st.values)) hit = n;
      if (safe && !violation && !safe(state, st.values)) violation = n;
      if (st.next.some((x) => tupleKey(x) === tupleKey(state))) fixed.push(n);
    }
  };
  let layer: Node[] = [];
  for (const s0 of initialStates(s)) expand(s0, 0, undefined, layer);
  let depth = 0;
  while (!overflow && layer.length && depth < horizon) {
    const next: Node[] = [];
    for (const n of layer) for (const s1 of n.next) if (!overflow) expand(s1, n.time + 1, n, next);
    layer = next;
    depth++;
  }
  if (overflow) return OVERFLOW;
  const saturated = !s.sequence && !layer.length;
  const nodes = [...seen.values()];
  const deepest = nodes.reduce((t, n) => Math.max(t, n.time), -1);

  const escalation = unsafe && (hit
    ? { verdict: "reachable" as const, time: hit.time, trace: verified(traceTo(hit)), basis: TRACE,
        note: `A run from the initial states reaches the unsafe set at time ${hit.time}; the trace is a shortest one. It is a candidate mechanism: substantiate every row on it.` }
    : saturated
      ? { verdict: "unreachable" as const, basis: SATURATED,
          note: `The reachable configurations stopped growing after time ${deepest}: no run from these initial states and inputs reaches the unsafe set, at any horizon.` }
      : { verdict: "unreachable-within-horizon" as const, horizon, basis: EXHAUSTED,
          note: `No run reaches the unsafe set within ${horizon} steps. Longer runs are not explored${s.sequence ? " (the inputs vary with time)" : ""}.` });
  const invariance = safe && (violation
    ? { verdict: "violated" as const, time: violation.time, trace: verified(traceTo(violation)), basis: TRACE,
        note: `A run leaves the safe set at time ${violation.time}; the trace is a shortest one.` }
    : saturated
      ? { verdict: "invariant" as const, basis: SATURATED, note: "Every reachable configuration is in the safe set, at any horizon." }
      : { verdict: "invariant-within-horizon" as const, horizon, basis: EXHAUSTED, note: `Every configuration reachable within ${horizon} steps is in the safe set.` });

  const separation = spec.separation && separate(s, spec.separation, steps, budget, verified);
  if (separation === null) return OVERFLOW;

  const states = new Map<string, string[]>();
  for (const n of nodes) states.set(tupleKey(n.state), n.state);
  const firstBlocked = [...blocked.values()][0];
  const typed = (e: Typed) => ({ box: e.box, port: e.port, carrier: e.carrier });
  return {
    ok: true as const, decided: true as const,
    horizon, inputMode: s.sequence ? "sequence" as const : "all" as const,
    machines: s.machines.map((m, k) => ({ box: m.id, states: m.state!, initial: s.initial[k] })),
    variables: s.vars.variables.map(typed),
    inputs: s.vars.boundary.map((i) => typed(s.vars.variables[i])),
    composed: s.plan.composed.map((b) => b.id), downstream: s.plan.downstream, partialDownstream: s.plan.partialDownstream,
    reachable: {
      configurations: seen.size,
      states: states.size,
      byBox: s.machines.map((m, k) => ({ box: m.id, states: m.state!.filter((x) => nodes.some((n) => n.state[k] === x)) })),
      listed: [...states.values()].slice(0, LISTED),
      saturated,
      ...(saturated ? { completeAfter: deepest } : {}),
    },
    fixedPoints: { count: fixed.length, listed: fixed.slice(0, LISTED).map((n) => ({ time: n.time, state: n.state, values: n.values })) },
    blocked: {
      count: blocked.size,
      ...(firstBlocked ? { first: verified([...(firstBlocked.parent ? traceTo(firstBlocked.parent) : []), { time: firstBlocked.time, state: firstBlocked.state }]) } : {}),
    },
    ...(escalation ? { escalation } : {}),
    ...(invariance ? { invariance } : {}),
    ...(separation ? { separation } : {}),
    statesExplored: budget.explored,
    assumption: ASSUMPTION,
    note: SEMANTICS + (blocked.size ? ` ${blocked.size} runs block: a state with no row for its inputs. The declared rows say nothing after it, and targets are not checked there.` : ""),
  };
}

/**
 * Separation in time along one run: breadth first over (time, configuration, demands met so far)
 * up to the last window's end. A demand is met at a configuration within its window where its
 * target set holds. Tracking the met demands per run is what keeps two runs from being mixed.
 * Returns null past the cap.
 */
function separate(s: System, demands: TimedDemand[], steps: ReturnType<typeof stepper>, budget: { explored: number; max: number }, verified: (t: RunStep[]) => RunStep[]) {
  const tests = demands.map((d) => s.holds(d.where));
  const full = (1 << demands.length) - 1;
  const end = Math.max(...demands.map((d) => d.window.to));
  const met = demands.map(() => false);
  const seen = new Set<string>();
  let goal: Node | undefined, overflow = false;
  const expand = (state: string[], time: number, parent: Node | undefined, into: Node[]) => {
    const out = steps(state, time);
    if (!out) { overflow = true; return; }
    for (const st of out) {
      let mask = parent?.mask ?? 0;
      demands.forEach((d, i) => {
        if (time >= d.window.from && time <= d.window.to && tests[i](state, st.values)) { met[i] = true; mask |= 1 << i; }
      });
      const k = tupleKey([time, mask, state, st.values]);
      if (seen.has(k)) continue;
      if (++budget.explored > budget.max) { overflow = true; return; }
      seen.add(k);
      const n: Node = { time, state, values: st.values, next: st.next, mask, parent };
      into.push(n);
      if (mask === full) { goal = n; return; }
    }
  };
  let layer: Node[] = [];
  for (const s0 of initialStates(s)) if (!goal && !overflow) expand(s0, 0, undefined, layer);
  for (let t = 0; t < end && !goal && !overflow && layer.length; t++) {
    const next: Node[] = [];
    for (const n of layer) for (const s1 of n.next) if (!goal && !overflow) expand(s1, t + 1, n, next);
    layer = next;
  }
  if (overflow) return null;
  const windows = demands.map((d) => ({ id: d.id, window: d.window }));
  if (goal) {
    const trace = verified(traceTo(goal));
    return {
      verdict: "realizable" as const,
      visits: demands.map((d, i) => ({ ...windows[i], time: trace.find((st) => st.time >= d.window.from && st.time <= d.window.to && tests[i](st.state, st.values!))!.time })),
      trace, basis: TIMED,
      note: "One run visits each demand's target set within its window: the declared dynamics carry the system from one demand to the other. Substantiate the rows on the trace.",
    };
  }
  const each = met.every(Boolean);
  return {
    verdict: "unrealizable" as const,
    reason: each ? "not-in-one-run" as const : "demand-never-met" as const,
    demands: windows.map((w, i) => ({ ...w, metInWindow: met[i] })),
    basis: TIMED_EXHAUSTED,
    note: each
      ? "Each demand is met by some run within its window, but no single run meets them all: the dynamics never carry one run from one demand to the next. Something must change the value between the windows (Principle 15)."
      : `No run meets ${windows.filter((_, i) => !met[i]).map((w) => `'${w.id}'`).join(", ")} within its window.`,
  };
}
