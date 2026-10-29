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
 *    with no consistent valuation is a blocked configuration: it has no valuation and no
 *    successor, since the declared rows say nothing after it. A target holds there if its state
 *    conditions do and it names no port; with a port condition it is undetermined, and a verdict
 *    it would decide is `undecided`, never safe.
 *  - boundedDynamics — breadth first from the initial states, over the boundary inputs allowed at
 *    each time, up to a horizon: the reachable configurations, the fixed points among them, the
 *    blocked runs, and three verdicts. Escalation: some run reaches an unsafe set (shortest
 *    trace). Invariance: every reachable configuration is in a safe set. Separation in time: one
 *    run visits each demand's target set within its window.
 *  - Loop classification — on the reachable graph of the stateful boxes' global states, each
 *    closed strongly connected component (no step leaves it) settles at a fixed point, oscillates
 *    (a cycle and no fixed point), or blocks. Classes: bistable (fixed points in two or more
 *    closed components), escalating (a closed component meets the unsafe set: a trap, with a
 *    shortest trace into it), oscillating. Only boxes that declare transition carry state;
 *    behavior rows are steady states, never read as transitions.
 *  - checkRun — re-checks a trace step by step against the declared rows, independently of the
 *    search. Every trace boundedDynamics returns passes it.
 *
 * Every search is finite and capped; past the cap the call fails closed. Verdicts hold for the
 * rows as declared. Continuous time, convergence rates, and control are outside the kernel.
 */
import { z } from "zod";
import { checkModel, harmLoops, type FunctionModel } from "./act.js";
import { MAX_STATES, bindRow, joinRows, portVariables, type Binding, type Box, type PortVariables, type Typed } from "./act-behavior.js";
import type { Theorem } from "./act-basis.js";
// `at` and `where` are local names here, so the path helpers go by `jp` and `where_`.
import { at as jp, fail, issue, quoted, second, unknownBox, where as where_, type Issue } from "./act-issues.js";


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
/** Fixed points lie on cycles, and a run that enters a closed component never leaves it. */
const BISTABLE: Theorem[] = ["fixed_on_cycle", "closed_reachIn"];
/** A sound trace into a closed component, which the run never leaves. */
const TRAP: Theorem[] = ["closed_reachIn", "reach_of_trace"];
/** A closed component without a fixed point: every return takes two steps or more. */
const OSCILLATING: Theorem[] = ["closed_reachIn", "return_ge_two"];

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
function specIssues(model: FunctionModel, spec: DynamicsSpec, horizon: number): Issue[] {
  const issues: Issue[] = [];
  const push = (code: Issue["code"], path: string, message: string, hint: string) => issues.push(issue(code, path, message, hint));
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const values = new Map(model.carriers.map((c) => [c.id, c.values]));
  const stateful = quoted(model.boxes.filter((b) => b.state).map((b) => b.id));
  const condition = (where: string, path: string, c: Condition) => {
    const b = boxes.get(c.box);
    if (!b) { issues.push(unknownBox(model, c.box, jp(path, "box"), `${where}: `)); return; }
    if ("state" in c) {
      if (!b.state) { push("no-state", jp(path, "box"), `${where}: box '${c.box}' declares no state`, `A state condition names a box that declares state: ${stateful}. For a stateless box, give a port condition { box, port, values }.`); return; }
      c.state.forEach((s, k) => {
        if (!b.state!.includes(s)) push("undeclared-state", jp(path, "state", k), `${where}: state '${s}' is not declared by box '${c.box}'`, `Use states '${c.box}' declares: ${quoted(b.state!)}.`);
      });
      return;
    }
    const p = [...(b.inputs ?? []), ...(b.outputs ?? [])].find((q) => q.id === c.port);
    if (!p) { push("unknown-port", jp(path, "port"), `${where}: box '${c.box}' has no port '${c.port}'`, `Use a port of '${c.box}': ${quoted([...(b.inputs ?? []), ...(b.outputs ?? [])].map((q) => q.id))}.`); return; }
    const declared = values.get(p.carrier);
    if (!declared) { push("no-declared-values", where_.carrier(model, p.carrier, "$.model"), `${where}: carrier '${p.carrier}' of port '${c.box}.${c.port}' declares no values`, `Declare values on carrier '${p.carrier}' to test port '${c.box}.${c.port}'.`); return; }
    c.values.forEach((x, k) => {
      if (!declared.includes(x)) push("undeclared-value", jp(path, "values", k), `${where}: value '${x}' of port '${c.box}.${c.port}' is not declared by carrier '${p.carrier}'`, `Use values of carrier '${p.carrier}': ${quoted(declared)}.`);
    });
  };
  (spec.unsafe ?? []).forEach((c, i) => condition(`unsafe[${i}]`, jp("$.unsafe", i), c));
  (spec.safe ?? []).forEach((c, i) => condition(`safe[${i}]`, jp("$.safe", i), c));
  const demands = spec.separation ?? [];
  if (spec.separation && demands.length < 2) push("too-few-members", "$.separation", "separation needs at least two demands", "Give two to four demands, each a target set with a time window.");
  const demandIds = demands.map((d) => d.id);
  for (const id of duplicates(demandIds)) push("duplicate-id", jp("$.separation", second(demandIds, id), "id"), `separation: duplicate demand id '${id}'`, `Rename one of the two demands '${id}'.`);
  demands.forEach((d, k) => {
    d.where.forEach((c, i) => condition(`separation '${d.id}' where[${i}]`, jp("$.separation", k, "where", i), c));
    if (d.window.from > d.window.to) push("window-invalid", jp("$.separation", k, "window"), `separation '${d.id}': window from ${d.window.from} is after to ${d.window.to}`, `Swap from and to: a window runs from its earliest time to its latest, inclusive.`);
    if (d.window.to > horizon) push("window-invalid", jp("$.separation", k, "window", "to"), `separation '${d.id}': window ends at ${d.window.to}, after the horizon ${horizon}`, `End the window by time ${horizon}, or raise horizon to at least ${d.window.to}.`);
  });
  demands.forEach((d, i) => demands.slice(i + 1).forEach((e, j) => {
    if (d.window.from <= e.window.to && e.window.from <= d.window.to) {
      push("windows-overlap", jp("$.separation", i + 1 + j, "window"), `separation: the windows of '${d.id}' and '${e.id}' overlap; demands separated in time need disjoint windows`,
        `Make the windows disjoint: '${d.id}' has ${d.window.from}–${d.window.to}, '${e.id}' has ${e.window.from}–${e.window.to}.`);
    }
  }));
  for (const [id, states] of Object.entries(spec.initial ?? {})) {
    const b = boxes.get(id);
    if (!b) { issues.push(unknownBox(model, id, jp("$.initial", id), "initial: ")); continue; }
    if (!b.state) { push("no-state", jp("$.initial", id), `initial: box '${id}' declares no state`, `initial overrides the initial states of boxes that declare state: ${stateful}.`); continue; }
    states.forEach((s, k) => {
      if (!b.state!.includes(s)) push("undeclared-state", jp("$.initial", id, k), `initial: state '${s}' is not declared by box '${id}'`, `Use states '${id}' declares: ${quoted(b.state!)}.`);
    });
  }
  const wired = new Set(model.wires.map((w) => tupleKey([w.to.box, w.to.port])));
  const boundary = model.boxes.flatMap((b) => (b.inputs ?? []).filter((q) => !wired.has(tupleKey([b.id, q.id]))).map((q) => `${b.id}.${q.id}`));
  (spec.inputs ?? []).forEach((entry, t) => {
    const keys = entry.map((q) => tupleKey([q.box, q.port]));
    for (const k of duplicates(keys)) push("listed-twice", jp("$.inputs", t, second(keys, k)), `inputs[${t}]: port ${k} is listed twice`, "List each port once per time, with every value allowed there.");
    entry.forEach((q, j) => {
      const here = jp("$.inputs", t, j);
      const p = boxes.get(q.box)?.inputs?.find((x) => x.id === q.port);
      if (!p) { push("not-boundary-input", here, `inputs[${t}]: '${q.box}.${q.port}' is not an input port`, `Set unwired input ports only: ${quoted(boundary)}.`); return; }
      if (wired.has(tupleKey([q.box, q.port]))) { push("not-boundary-input", here, `inputs[${t}]: input port '${q.box}.${q.port}' is wired; only unwired (boundary) inputs can be set`, `A wired input takes the value its function delivers. Set unwired input ports only: ${quoted(boundary)}.`); return; }
      const declared = values.get(p.carrier);
      if (!declared) { push("no-declared-values", where_.carrier(model, p.carrier, "$.model"), `inputs[${t}]: carrier '${p.carrier}' of port '${q.box}.${q.port}' declares no values`, `Declare values on carrier '${p.carrier}'.`); return; }
      q.values.forEach((x, k) => {
        if (!declared.includes(x)) push("undeclared-value", jp(here, "values", k), `inputs[${t}]: value '${x}' of port '${q.box}.${q.port}' is not declared by carrier '${p.carrier}'`, `Use values of carrier '${p.carrier}': ${quoted(declared)}.`);
      });
    });
  });
  if (spec.inputs && horizon > spec.inputs.length - 1) {
    push("horizon-inputs-mismatch", "$.horizon", `horizon ${horizon} needs ${horizon + 1} input entries (times 0 to ${horizon}); inputs has ${spec.inputs.length}`,
      `Lower horizon to ${spec.inputs.length - 1}, or give ${horizon + 1} entries in inputs (an empty entry [] allows every value).`);
  }
  return issues;
}

type Predicate = (state: string[], values: string[]) => boolean;
/** A target at a blocked configuration, which has no port values. */
type Blocked = (state: string[]) => "holds" | "fails" | "undetermined";
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
  atBlocked: (target: Condition[]) => Blocked;
  /** The global states meeting a target's state conditions; undefined when it names none. */
  meetsStates: (target: Condition[]) => ((state: string[]) => boolean) | undefined;
}
type Compiled = { kind: "failure"; issues: Issue[] } | { kind: "undecided"; plan: Plan } | ({ kind: "system" } & System);

function compile(model: FunctionModel, spec: DynamicsSpec): Compiled {
  const check = checkModel(model, "$.model");
  if (!check.ok) return { kind: "failure", issues: check.issues };
  const horizon = horizonOf(spec);
  if (!Number.isInteger(horizon) || horizon < 0 || horizon > MAX_HORIZON) {
    return { kind: "failure", issues: [issue("horizon-out-of-range", spec.horizon === undefined ? "$.inputs" : "$.horizon", `horizon must be an integer from 0 to ${MAX_HORIZON}; got ${horizon}`, `Set horizon to an integer from 0 to ${MAX_HORIZON}${spec.inputs ? ", or give 1 to " + (MAX_HORIZON + 1) + " input entries" : ""}.`)] };
  }
  const issues = specIssues(model, spec, horizon);
  if (issues.length) return { kind: "failure", issues };
  const named = [...spec.unsafe ?? [], ...spec.safe ?? [], ...(spec.separation ?? []).flatMap((d) => d.where)].map((c) => c.box);
  const observed = new Set([...model.boxes.filter((b) => b.transition).map((b) => b.id), ...named]);
  if (!observed.size) {
    return { kind: "failure", issues: [issue("nothing-to-explore", "$.model", NOTHING, "Declare state, initial, and transition rows on the box with memory, or pass unsafe, safe, or separation naming a box to observe.")] };
  }
  const p = plan(model, observed);
  if (p.missing.length) return { kind: "undecided", plan: p };

  const machines = p.composed.filter((b) => b.transition);
  const initial = machines.map((b) => (spec.initial && Object.hasOwn(spec.initial, b.id) ? spec.initial[b.id] : b.initial ?? []));
  const uninitialised = machines.filter((_, k) => !initial[k].length).map((b) => b.id);
  if (uninitialised.length) {
    return { kind: "failure", issues: uninitialised.map((id) => issue("uninitialised-state", where_.box(model, id, "$.model"), `box '${id}' declares state but no initial states: declare initial on the box, or pass initial`,
      `Declare initial on '${id}' (a subset of its state), or pass initial: { '${id}': [...] }.`)) };
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
  const atBlocked = (target: Condition[]): Blocked => {
    const states = target.flatMap((c) => ("state" in c ? [{ at: machines.findIndex((m) => m.id === c.box), ok: new Set(c.state) }] : []));
    const ports = states.length < target.length;
    return (state) => (!states.every((a) => a.ok.has(state[a.at])) ? "fails" : ports ? "undetermined" : "holds");
  };
  const meetsStates = (target: Condition[]) => (target.some((c) => "state" in c) ? (state: string[]) => atBlocked(target)(state) !== "fails" : undefined);
  return { kind: "system", plan: p, vars, machines, initial, tables, slot, sequence: spec.inputs !== undefined, allowed, holds, atBlocked, meetsStates };
}

const horizonOf = (spec: DynamicsSpec) => spec.horizon ?? (spec.inputs ? spec.inputs.length - 1 : DEFAULT_HORIZON);

interface Step { values: string[]; next: string[][]; }
interface Node { time: number; state: string[]; values: string[]; next: string[][]; mask: number; parent?: Node; }
export interface RunStep { time: number; state: string[]; values?: string[]; }

/** Every step from a global state at time t: each consistent valuation with the next states its rows allow. */
function stepper(s: System, budget: { explored: number; max: number }, memo = new Map<string, Step[]>()) {
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

/**
 * Each step of the trace is admitted by the declared rows over the allowed inputs, from an initial
 * state, or (from "safe") from a state that meets the safe set's state conditions.
 */
function runErrors(s: System, trace: RunStep[], from: "initial" | "safe" = "initial", safe?: Condition[]): string[] {
  const safeState = safe && s.meetsStates(safe);
  const errors: string[] = [];
  if (!trace.length) return ["the trace is empty"];
  const n = s.vars.variables.length;
  trace.forEach((step, t) => {
    if (step.time !== t) errors.push(`step ${t}: time ${step.time}, expected ${t}`);
    if (step.state.length !== s.machines.length) { errors.push(`step ${t}: ${step.state.length} states for ${s.machines.length} stateful boxes`); return; }
    if (t === 0 && from === "initial") s.machines.forEach((m, k) => { if (!s.initial[k].includes(step.state[k])) errors.push(`step 0: '${step.state[k]}' is not an initial state of '${m.id}'`); });
    if (t === 0 && from === "safe" && !safeState?.(step.state)) errors.push("step 0: the state does not meet the safe set's state conditions");
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
 * `variables`) against the declared rows: an initial state first (or, from "safe", a state that
 * meets the safe set's state conditions), then every step admitted by every composed box's rows,
 * the inputs allowed at its time, and each next state named by a row.
 */
export function checkRun(model: FunctionModel, spec: DynamicsSpec, trace: RunStep[], from: "initial" | "safe" = "initial") {
  const s = compile(model, spec);
  // A trace verifier, not a tool: it reports the rejected steps as messages only.
  if (s.kind === "failure") return { ok: false as const, errors: s.issues.map((i) => i.message) };
  if (s.kind === "undecided") return { ok: false as const, errors: [`declare behavior or transition for ${s.plan.missing.map((id) => `'${id}'`).join(", ")}`] };
  const errors = runErrors(s, trace, from, spec.safe);
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
  if (s.kind === "failure") return fail(s.issues);
  if (s.kind === "undecided") {
    return {
      ok: true as const, decided: false as const, missingBehavior: s.plan.missing, composed: s.plan.composed.map((b) => b.id),
      note: `Declare behavior or transition for ${s.plan.missing.map((id) => `'${id}'`).join(", ")}: they are upstream of an observed box, so the runs depend on them.`,
    };
  }
  const horizon = horizonOf(spec);
  const max = spec.maxStates ?? MAX_STATES;
  const starts = product(s.initial.map((x) => x.length));
  if (starts > max) {
    return fail([issue("cap-exceeded", spec.initial ? "$.initial" : "$.model", `the initial states have ${starts} combinations; the cap is ${max}. Declare fewer initial states`,
      "Declare fewer initial states per stateful box, or pass initial to start from one configuration.")]);
  }
  const budget = { explored: 0, max };
  const memo = new Map<string, Step[]>();
  const steps = stepper(s, budget, memo);
  const OVERFLOW = fail([issue("cap-exceeded", spec.horizon === undefined ? "$.model" : "$.horizon", `the bounded search passed ${max} states. Lower the horizon, declare fewer states or values, or split the model`,
    "Lower horizon, constrain inputs per time, declare fewer states or carrier values, or split the model.")]);
  const verified = (trace: RunStep[], from: "initial" | "safe" = "initial") => {
    const errors = runErrors(s, trace, from, spec.safe);
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
  const stops = [...blocked.values()];
  const stopTrace = (b: (typeof stops)[number]) => verified([...(b.parent ? traceTo(b.parent) : []), { time: b.time, state: b.state }]);
  /** The earliest of a configuration and a blocked configuration (the configuration on a tie). */
  const earliest = (n: Node | undefined, b: (typeof stops)[number] | undefined) =>
    (b && (!n || b.time < n.time) ? { time: b.time, trace: stopTrace(b) } : n ? { time: n.time, trace: verified(traceTo(n)) } : undefined);
  const UNDETERMINED = (what: string, b: (typeof stops)[number]) => ({
    verdict: "undecided" as const, reason: "blocked" as const, time: b.time, trace: stopTrace(b),
    note: `A run blocks at time ${b.time} in a state that meets the ${what} set's state conditions; its port conditions have no value there. Declare the rows that state lacks.`,
  });
  const unsafeAt = spec.unsafe && s.atBlocked(spec.unsafe), safeAt = spec.safe && s.atBlocked(spec.safe);
  const reached = unsafeAt && earliest(hit, stops.find((b) => unsafeAt(b.state) === "holds"));
  const left = safeAt && earliest(violation, stops.find((b) => safeAt(b.state) === "fails"));
  const unsure = { unsafe: unsafeAt && stops.find((b) => unsafeAt(b.state) === "undetermined"), safe: safeAt && stops.find((b) => safeAt(b.state) === "undetermined") };

  const escalation = unsafe && (reached
    ? { verdict: "reachable" as const, time: reached.time, trace: reached.trace, basis: TRACE,
        note: `A run from the initial states reaches the unsafe set at time ${reached.time}; the trace is a shortest one${reached.trace[reached.trace.length - 1].values ? "" : ", and the run blocks there"}. It is a candidate mechanism: substantiate every row on it.` }
    : unsure.unsafe ? UNDETERMINED("unsafe", unsure.unsafe)
    : saturated
      ? { verdict: "unreachable" as const, basis: SATURATED,
          note: `The reachable configurations stopped growing after time ${deepest}: no run from these initial states and inputs reaches the unsafe set, at any horizon.` }
      : { verdict: "unreachable-within-horizon" as const, horizon, basis: EXHAUSTED,
          note: `No run reaches the unsafe set within ${horizon} steps. Longer runs are not explored${s.sequence ? " (the inputs vary with time)" : ""}.` });
  const invariance = safe && (left
    ? { verdict: "violated" as const, time: left.time, trace: left.trace, basis: TRACE,
        note: `A run leaves the safe set at time ${left.time}; the trace is a shortest one${left.trace[left.trace.length - 1].values ? "" : ", and the run blocks there"}.` }
    : unsure.safe ? UNDETERMINED("safe", unsure.safe)
    : saturated
      ? { verdict: "invariant" as const, basis: SATURATED, note: "Every reachable configuration is in the safe set, at any horizon." }
      : { verdict: "invariant-within-horizon" as const, horizon, basis: EXHAUSTED, note: `Every configuration reachable within ${horizon} steps is in the safe set.` });

  const separation = spec.separation && separate(s, spec.separation, steps, budget, verified);
  if (separation === null) return OVERFLOW;
  const loops = s.sequence ? { classified: false as const, reason: "the inputs vary with time; omit inputs to classify the loops" }
    : !s.machines.length ? { classified: false as const, reason: "no composed box declares transition; behavior rows are steady states, not transitions" }
    : classify(model, s, spec, memo, max, verified);

  const states = new Map<string, string[]>();
  for (const n of nodes) states.set(tupleKey(n.state), n.state);
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
      ...(stops.length ? { first: stopTrace(stops[0]) } : {}),
    },
    ...(escalation ? { escalation } : {}),
    ...(invariance ? { invariance } : {}),
    ...(separation ? { separation } : {}),
    loops,
    statesExplored: budget.explored,
    assumption: ASSUMPTION,
    note: SEMANTICS + (blocked.size ? ` ${blocked.size} runs block: a state with no row for its inputs. The declared rows say nothing after it; a target is checked there on its state conditions only.` : ""),
  };
}

/** Strongly connected components, iteratively: a state graph can be deeper than the call stack. */
function components(n: number, succ: (v: number) => number[]): number[][] {
  const index = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0), onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [], out: number[][] = [];
  let next = 0;
  for (let root = 0; root < n; root++) {
    if (index[root] >= 0) continue;
    const work: Array<[number, number]> = [[root, 0]];
    while (work.length) {
      const top = work[work.length - 1], v = top[0];
      if (top[1] === 0 && index[v] < 0) { index[v] = low[v] = next++; stack.push(v); onStack[v] = true; }
      const ws = succ(v);
      if (top[1] < ws.length) {
        const w = ws[top[1]++];
        if (index[w] < 0) work.push([w, 0]);
        else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
        continue;
      }
      work.pop();
      if (work.length) { const u = work[work.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
      if (low[v] === index[v]) {
        const c: number[] = [];
        let w: number;
        do { w = stack.pop()!; onStack[w] = false; c.push(w); } while (w !== v);
        out.push(c.sort((a, b) => a - b));
      }
    }
  }
  return out;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

interface Vertex { state: string[]; from: "initial" | "safe"; depth: number; parent?: number; via?: string[]; steps?: Step[]; succ: number[]; }

/**
 * Loop classification on the reachable state graph: the stateful boxes' global states, with an
 * edge s → s' when some step from s can move to s'. Explored breadth first, without a horizon and
 * up to the cap, from the initial states and, when the safe set names states, from every global
 * state that meets them. A closed component (every edge from it stays in it, all of it explored)
 * settles (it has a fixed point), oscillates (a cycle and no fixed point), or blocks (one state
 * with no step; not classified). Past the cap the graph is incomplete: every closed component
 * found is still closed, but one may be missed.
 */
function classify(model: FunctionModel, s: System, spec: DynamicsSpec, memo: Map<string, Step[]>, max: number, verified: (t: RunStep[], from: "initial" | "safe") => RunStep[]) {
  const budget = { explored: 0, max };
  const steps = stepper(s, budget, memo);
  const vertices: Vertex[] = [], index = new Map<string, number>();
  let complete = true;
  const add = (state: string[], from: Vertex["from"], parent?: number, via?: string[]) => {
    const k = tupleKey(state), at = index.get(k);
    if (at !== undefined) return at;
    if (++budget.explored > max) { complete = false; return undefined; }
    index.set(k, vertices.length);
    vertices.push({ state, from, depth: parent === undefined ? 0 : vertices[parent].depth + 1, parent, via, succ: [] });
    return vertices.length - 1;
  };
  for (const s0 of initialStates(s)) if (complete) add(s0, "initial");
  const safeState = spec.safe && s.meetsStates(spec.safe);
  const globalStates = product(s.machines.map((m) => m.state!.length));
  // Too many global states to scan for safe ones: explore from the initial states alone, and say so.
  const safeSkipped = safeState !== undefined && globalStates > max;
  let safeStarts = 0;
  if (safeState && !safeSkipped) {
    for (const s0 of allStates(s)) {
      if (!complete) break;
      if (safeState(s0) && !index.has(tupleKey(s0))) { add(s0, "safe"); safeStarts++; }
    }
  }
  for (let i = 0; i < vertices.length && complete; i++) {
    const out = steps(vertices[i].state, 0);
    if (!out) { complete = false; break; }
    const succ = new Set<number>();
    for (const st of out) for (const n of st.next) {
      const j = complete ? add(n, vertices[i].from, i, st.values) : undefined;
      if (j !== undefined) succ.add(j);
    }
    if (!complete) break;
    vertices[i].steps = out;
    vertices[i].succ = [...succ];
  }

  const sccs = components(vertices.length, (v) => vertices[v].succ);
  const comp = new Array<number>(vertices.length);
  sccs.forEach((c, ci) => c.forEach((v) => { comp[v] = ci; }));
  const closedSets = sccs
    .filter((c) => c.every((v) => vertices[v].steps && vertices[v].succ.every((w) => comp[w] === comp[c[0]])))
    .sort((a, b) => a[0] - b[0]);
  const unsafe = spec.unsafe && s.holds(spec.unsafe);
  const pathTo = (v: number) => { const path: number[] = []; for (let u: number | undefined = v; u !== undefined; u = vertices[u].parent) path.unshift(u); return path; };
  const closed = closedSets.map((c) => {
    const members = new Set(c);
    const blocked = c.length === 1 && !vertices[c[0]].succ.length;
    const fixedPoints = c.filter((v) => vertices[v].succ.includes(v));
    const kind = blocked ? "blocked" as const : fixedPoints.length ? "settles" as const : "oscillates" as const;
    // Shortest cycle through the first member, and the period: the gcd of level differences along internal edges.
    let cycle: number[] | undefined, period = 0;
    if (kind === "oscillates") {
      const root = c[0], level = new Map([[root, 0]]), parent = new Map<number, number>(), queue = [root];
      for (let u = queue.shift(); u !== undefined; u = queue.shift()) {
        for (const w of vertices[u].succ) {
          if (!members.has(w)) continue;
          if (w === root && !cycle) { cycle = [root]; for (let x: number | undefined = u; x !== undefined && x !== root; x = parent.get(x)) cycle.splice(1, 0, x); cycle.push(root); }
          if (!level.has(w)) { level.set(w, level.get(u)! + 1); parent.set(w, u); queue.push(w); }
        }
      }
      for (const u of c) for (const w of vertices[u].succ) if (members.has(w)) period = gcd(period, Math.abs(level.get(u)! + 1 - level.get(w)!));
    }
    // A trap meets the unsafe set at a member some step from it satisfies; the nearest one to a start.
    const entry = unsafe && kind !== "blocked"
      ? c.map((v) => ({ v, st: vertices[v].steps!.find((st) => unsafe(vertices[v].state, st.values)) }))
        .filter((x) => x.st).sort((a, b) => vertices[a.v].depth - vertices[b.v].depth || a.v - b.v)[0]
      : undefined;
    return { c, kind, fixedPoints, cycle, period, entry };
  });

  const listed = (vs: number[]) => vs.slice(0, LISTED).map((v) => vertices[v].state);
  const report = closed.slice(0, LISTED).map((x) => ({
    size: x.c.length, states: listed(x.c), kind: x.kind, fixedPoints: listed(x.fixedPoints),
    ...(x.cycle ? { cycle: x.cycle.map((v) => vertices[v].state), period: x.period } : {}),
    ...(unsafe && x.kind !== "blocked" ? { unsafe: x.entry !== undefined } : {}),
  }));
  const settling = closed.flatMap((x, i) => (x.kind === "settles" ? [i] : []));
  const bistable = settling.length >= 2 && { count: settling.length, components: settling.slice(0, LISTED), fixedPoints: settling.slice(0, LISTED).flatMap((i) => listed(closed[i].fixedPoints)).slice(0, LISTED), basis: BISTABLE };
  const escalating = closed.slice(0, LISTED).flatMap((x, i) => {
    if (!x.entry) return [];
    const path = pathTo(x.entry.v), from = vertices[path[0]].from;
    const trace: RunStep[] = path.map((v, t) => ({ time: t, state: vertices[v].state, values: t + 1 < path.length ? vertices[path[t + 1]].via! : x.entry!.st!.values }));
    return [{ component: i, from, time: path.length - 1, trace: verified(trace, from), basis: TRAP }];
  });
  const oscillating = closed.slice(0, LISTED).flatMap((x, i) => (x.kind === "oscillates" ? [{ component: i, period: x.period, cycle: x.cycle!.map((v) => vertices[v].state), basis: OSCILLATING }] : []));
  const traps = closed.some((x) => x.entry), cycles = closed.some((x) => x.kind === "oscillates");
  const classes = closed.length
    ? [...(bistable ? ["bistable" as const] : []), ...(traps ? ["escalating" as const] : []), ...(cycles ? ["oscillating" as const] : [])]
    : ["none" as const];
  const machines = new Set(s.machines.map((m) => m.id));
  return {
    classified: true as const, complete: complete && !safeSkipped, states: vertices.length,
    starts: { initial: vertices.filter((v) => v.parent === undefined && v.from === "initial").length, safe: safeStarts },
    ...(safeSkipped ? { safeStartsSkipped: `the safe set's states were not used as starts: ${globalStates} global states exceed the cap of ${max}` } : {}),
    closedCount: closed.length,
    harmLoops: harmLoops(model).filter((l) => l.boxes.some((b) => machines.has(b))).map((l) => ({ boxes: l.boxes, negative: l.negative })),
    closed: report, classes,
    ...(bistable ? { bistable } : {}),
    ...(escalating.length ? { escalating } : {}),
    ...(oscillating.length ? { oscillating } : {}),
    note: (classes[0] === "none"
      ? "No closed component was found within the cap."
      : "Every run that enters a closed component stays in it. Classes can coexist; a component that settles at one fixed point outside the unsafe set belongs to no class.")
      + (complete ? " The reachable state graph was explored completely, without a horizon." : " The cap cut the exploration: every closed component listed is closed, but others may be missed.")
      + (safeSkipped ? " Only the initial states were starts (safeStartsSkipped)." : "")
      + (closed.length > LISTED ? ` ${LISTED} of ${closed.length} closed components are listed.` : "")
      + " The graph is over the states of boxes that declare transition; harmLoops lists the harm loops through them.",
  };
}

/** Every global state of the stateful boxes, in declaration order. */
function* allStates(s: System): Generator<string[]> {
  const sizes = s.machines.map((m) => m.state!.length), total = product(sizes);
  for (let n = 0; n < total; n++) {
    let rest = n;
    yield s.machines.map((m, k) => { const x = m.state![rest % sizes[k]]; rest = Math.floor(rest / sizes[k]); return x; });
  }
}

/**
 * Separation in time along one run: breadth first over (time, configuration, demands met so far)
 * up to the last window's end. A demand is met at a configuration within its window where its
 * target set holds. Tracking the met demands per run is what keeps two runs from being mixed.
 * Returns null past the cap.
 */
function separate(s: System, demands: TimedDemand[], steps: ReturnType<typeof stepper>, budget: { explored: number; max: number }, verified: (t: RunStep[]) => RunStep[]) {
  const tests = demands.map((d) => s.holds(d.where)), stops = demands.map((d) => s.atBlocked(d.where));
  const full = (1 << demands.length) - 1;
  const end = Math.max(...demands.map((d) => d.window.to));
  const met = demands.map(() => false);
  const seen = new Set<string>();
  let goal: Node | undefined, blockedGoal: RunStep[] | undefined, unsure: RunStep[] | undefined, overflow = false;
  const within = (d: TimedDemand, time: number) => time >= d.window.from && time <= d.window.to;
  const expand = (state: string[], time: number, parent: Node | undefined, into: Node[]) => {
    const out = steps(state, time);
    if (!out) { overflow = true; return; }
    if (!out.length) {
      // A blocked configuration ends its run: it can still meet a demand that names states only.
      let mask = parent?.mask ?? 0, maybe = mask;
      demands.forEach((d, i) => {
        if (!within(d, time)) return;
        const at = stops[i](state);
        if (at === "holds") { met[i] = true; mask |= 1 << i; }
        if (at !== "fails") maybe |= 1 << i;
      });
      const trace = () => verified([...(parent ? traceTo(parent) : []), { time, state }]);
      if (mask === full) blockedGoal ??= trace();
      else if (maybe === full) unsure ??= trace();
    }
    for (const st of out) {
      let mask = parent?.mask ?? 0;
      demands.forEach((d, i) => {
        if (within(d, time) && tests[i](state, st.values)) { met[i] = true; mask |= 1 << i; }
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
  const done = () => goal !== undefined || blockedGoal !== undefined || overflow;
  for (const s0 of initialStates(s)) if (!done()) expand(s0, 0, undefined, layer);
  for (let t = 0; t < end && !done() && layer.length; t++) {
    const next: Node[] = [];
    for (const n of layer) for (const s1 of n.next) if (!done()) expand(s1, t + 1, n, next);
    layer = next;
  }
  if (overflow) return null;
  const windows = demands.map((d) => ({ id: d.id, window: d.window }));
  const meets = (i: number, st: RunStep) => within(demands[i], st.time) && (st.values ? tests[i](st.state, st.values) : stops[i](st.state) === "holds");
  if (goal || blockedGoal) {
    const trace = blockedGoal ?? verified(traceTo(goal!));
    return {
      verdict: "realizable" as const,
      visits: demands.map((_, i) => ({ ...windows[i], time: trace.find((st) => meets(i, st))!.time })),
      trace, basis: TIMED,
      note: "One run visits each demand's target set within its window: the declared dynamics carry the system from one demand to the other. Substantiate the rows on the trace.",
    };
  }
  if (unsure) {
    return {
      verdict: "undecided" as const, reason: "blocked" as const, trace: unsure,
      note: "A run that blocks might meet every demand: a demand it would meet at the blocked state names a port, which has no value there. Declare the rows that state lacks.",
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
