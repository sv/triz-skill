/**
 * Declared behaviour: the external relation of a function model, and a decided trim.
 *
 * A box that declares `behavior` is a finite relation from its input-port values to its
 * output-port values. Every port is a variable over its carrier's declared values. A wire says
 * its two ports carry the same value, so a port fed by several wires needs them all to agree.
 *
 *  - externalBehavior      — the relation from the boundary inputs (unwired input ports) to the
 *                            deliverables (product input ports fed by a non-harmful function).
 *                            Only the boxes that can reach a deliverable are composed. A steady
 *                            state is a valuation of their ports that every composed box's relation
 *                            and every wire admits. The relation is the set of steady states
 *                            projected onto inputs and deliverables. A feedback loop composes by
 *                            the relational trace: (x, y) is in the result iff some loop value is
 *                            consistent. This is steady-state semantics: it says nothing about
 *                            dynamics, convergence, or which steady state the system reaches.
 *  - trimPreservesBehavior — perform a trim (applyTrim) and decide whether the input→deliverable
 *                            relation is unchanged: preserved, changed (with a counterexample input
 *                            and which relation contains which), or undecided (the boxes that need
 *                            behaviour and declare none, or no steady state in either model).
 *
 * Every search is finite and capped; past the cap the call fails closed. The verdict is about the
 * relations as declared. Whether a declared relation is physically or economically true, the
 * absorber's above all, is outside the kernel.
 */
import { checkModel, type FunctionModel } from "./act.js";
import { applyTrim } from "./act-rewrite.js";
import type { Theorem } from "./act-basis.js";

export type Box = FunctionModel["boxes"][number];
type Endpoint = { box: string; port: string };
export type Typed = Endpoint & { carrier: string };
type Failure = { ok: false; errors: string[] };

/** Cap on boundary valuations and on search states, per evaluation. */
export const MAX_STATES = 100_000;
const LISTED = 50;
const LISTED_STATES = 10;

const portKey = (box: string, side: "in" | "out", port: string) => JSON.stringify([box, side, port]);
const endKey = (e: Endpoint) => JSON.stringify([e.box, e.port]);
const tupleKey = (t: string[]) => JSON.stringify(t);
/** Composing the boxes' relations along the wiring does not depend on how the series is bracketed. */
const SERIES: Theorem[] = ["Relation.comp_assoc"];
const product = (sizes: number[]) => sizes.reduce((n, k) => n * k, 1);

const NO_DELIVERABLES = "no deliverables: mark the box the main function acts on as role 'product' and feed it a non-harmful function";
const ASSUMPTION = "Only boxes that can reach a deliverable are composed. Every other box is assumed to accept whatever it receives. A downstream box with a partial relation (partialDownstream) would rule out steady states in the full relational composite; it is not composed here.";

/** Input ports of product boxes fed by at least one non-harmful function, in model order. */
export function deliverablePorts(model: FunctionModel): Typed[] {
  return model.boxes.filter((b) => b.role === "product").flatMap((b) => (b.inputs ?? [])
    .filter((p) => model.wires.some((w) => w.to.box === b.id && w.to.port === p.id && w.polarity !== "harmful"))
    .map((p) => ({ box: b.id, port: p.id, carrier: p.carrier })));
}

interface Plan { composed: Box[]; downstream: string[]; missing: string[]; partialDownstream: string[]; }

/** The boxes that can reach an observed port (backwards along wires), and what they lack. */
function plan(model: FunctionModel, observe: Endpoint[]): Plan {
  const into = new Map<string, FunctionModel["wires"]>();
  for (const w of model.wires) {
    const k = portKey(w.to.box, "in", w.to.port);
    into.set(k, [...(into.get(k) ?? []), w]);
  }
  const byId = new Map(model.boxes.map((b) => [b.id, b]));
  const reached = new Set<string>();
  const queue = observe.flatMap((d) => into.get(portKey(d.box, "in", d.port)) ?? []).map((w) => w.from.box);
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (reached.has(id)) continue;
    reached.add(id);
    for (const p of byId.get(id)!.inputs ?? []) for (const w of into.get(portKey(id, "in", p.id)) ?? []) queue.push(w.from.box);
  }
  const values = new Map(model.carriers.map((c) => [c.id, c.values ?? []]));
  const total = (b: Box) => {
    const ins = b.inputs ?? [];
    const seen = new Set(b.behavior!.map((r) => tupleKey(ins.map((p) => r.in[p.id]))));
    return seen.size === product(ins.map((p) => values.get(p.carrier)!.length));
  };
  const composed = model.boxes.filter((b) => reached.has(b.id));
  const downstream = model.boxes.filter((b) => !reached.has(b.id));
  return {
    composed,
    downstream: downstream.map((b) => b.id),
    missing: composed.filter((b) => !b.behavior).map((b) => b.id),
    partialDownstream: downstream.filter((b) => b.behavior && !total(b)).map((b) => b.id),
  };
}

interface Row { input: string[]; outputs: Map<string, string[]>; states: string[][]; count: number; }
interface Evaluation { ok: true; inputs: Typed[]; variables: Typed[]; table: Map<string, Row>; explored: number; }

export interface PortVariables {
  variables: Array<Typed & { side: "in" | "out" }>;
  /** The variable a port belongs to. */
  at: (box: string, side: "in" | "out", port: string) => number;
  /** Variables with no output port: the unwired input ports. */
  boundary: number[];
}

/**
 * Ports joined by wires are one variable, represented by its output port when it has one. Covers
 * the ports of `boxes` and the `extra` input ports; every wire into them must come from `boxes`.
 */
export function portVariables(model: FunctionModel, boxes: Box[], extra: Typed[] = []): PortVariables {
  const parent = new Map<string, string>();
  const info = new Map<string, Typed & { side: "in" | "out" }>();
  const find = (k: string): string => {
    while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k)!)!); k = parent.get(k)!; }
    return k;
  };
  const add = (e: Typed, side: "in" | "out") => {
    const k = portKey(e.box, side, e.port);
    if (!parent.has(k)) { parent.set(k, k); info.set(k, { ...e, side }); }
  };
  for (const b of boxes) {
    for (const q of b.inputs ?? []) add({ box: b.id, port: q.id, carrier: q.carrier }, "in");
    for (const q of b.outputs ?? []) add({ box: b.id, port: q.id, carrier: q.carrier }, "out");
  }
  for (const d of extra) add(d, "in");
  for (const w of model.wires) {
    const t = portKey(w.to.box, "in", w.to.port);
    if (parent.has(t)) parent.set(find(t), find(portKey(w.from.box, "out", w.from.port)));
  }
  const index = new Map<string, number>();
  const variables: Array<Typed & { side: "in" | "out" }> = [];
  for (const [k, e] of info) {
    const r = find(k);
    if (!index.has(r)) { index.set(r, variables.length); variables.push(e); }
    else if (e.side === "out" && variables[index.get(r)!].side === "in") variables[index.get(r)!] = e;
  }
  return {
    variables,
    at: (box, side, port) => index.get(find(portKey(box, side, port)))!,
    boundary: variables.flatMap((e, i) => (e.side === "in" ? [i] : [])),
  };
}

/** A row as (variable, value) bindings over the box's ports, inputs first. */
export type Binding = Array<[number, string]>;
export function bindRow(b: Box, row: { in: Record<string, string>; out: Record<string, string> }, at: PortVariables["at"]): Binding {
  return [
    ...(b.inputs ?? []).map((q) => [at(b.id, "in", q.id), row.in[q.id]] as [number, string]),
    ...(b.outputs ?? []).map((q) => [at(b.id, "out", q.id), row.out[q.id]] as [number, string]),
  ];
}

/**
 * Backtracking join: every way to pick one row per set that agrees with the bound entries of
 * `assign` and with the other picks on shared variables. Sets are joined most-bound first, ties in
 * the given order. `done` sees the full assignment and the row picked per set, in the given order.
 * Every search node counts against `budget`; past `budget.max` the join stops and returns false.
 */
export function joinRows(sets: Array<{ vars: number[]; rows: Binding[] }>, assign: Array<string | undefined>, done: (picked: number[]) => void, budget: { explored: number; max: number }): boolean {
  const bound = new Set(assign.flatMap((x, i) => (x === undefined ? [] : [i])));
  const pending = sets.map((s, i) => ({ ...s, i })), order: typeof pending = [];
  while (pending.length) {
    const score = (x: (typeof pending)[number]) => x.vars.filter((i) => bound.has(i)).length;
    let best = 0;
    pending.forEach((x, i) => { if (score(x) > score(pending[best])) best = i; });
    const [next] = pending.splice(best, 1);
    order.push(next);
    for (const i of next.vars) bound.add(i);
  }
  const picked: number[] = new Array(sets.length);
  let overflow = false;
  const join = (depth: number) => {
    if (overflow || ++budget.explored > budget.max) { overflow = true; return; }
    if (depth === order.length) { done(picked); return; }
    order[depth].rows.forEach((binding, r) => {
      const touched: number[] = [];
      let consistent = true;
      for (const [i, x] of binding) {
        if (assign[i] === undefined) { assign[i] = x; touched.push(i); }
        else if (assign[i] !== x) { consistent = false; break; }
      }
      picked[order[depth].i] = r;
      if (consistent) join(depth + 1);
      for (const i of touched) assign[i] = undefined;
    });
  };
  join(0);
  return !overflow;
}

/**
 * Steady states of the composed boxes, by boundary valuation. Ports joined by wires are one
 * variable; each composed box contributes its relation; a backtracking join enumerates every
 * consistent valuation. Fails closed when the boundary valuations or the search states pass `max`.
 */
function evaluate(model: FunctionModel, p: Plan, observe: Typed[], max: number): Evaluation | Failure {
  const { variables, at: v, boundary } = portVariables(model, p.composed, observe);
  const domain = new Map(model.carriers.map((c) => [c.id, c.values ?? []]));
  const valuations = product(boundary.map((i) => domain.get(variables[i].carrier)!.length));
  if (valuations > max) {
    return { ok: false, errors: [`the boundary inputs have ${valuations} valuations; the cap is ${max}. Declare fewer values or split the model`] };
  }

  // Each composed box as deduplicated rows of (variable, value) bindings.
  const rowsOf = (b: Box) => {
    const seen = new Map<string, Binding>();
    for (const r of b.behavior!) {
      const binding = bindRow(b, r, v);
      seen.set(tupleKey(binding.map(([, x]) => x)), binding);
    }
    return [...seen.values()];
  };
  const sets = p.composed.map((b) => {
    const rows = rowsOf(b);
    return { rows, vars: [...new Set(rows[0].map(([i]) => i))] };
  });

  const out = observe.map((d) => v(d.box, "in", d.port));
  const table = new Map<string, Row>();
  const assign: Array<string | undefined> = new Array(variables.length).fill(undefined);
  const budget = { explored: 0, max };
  let overflow = false;
  for (let n = 0; n < valuations && !overflow; n++) {
    let rest = n;
    const input = boundary.map((i) => {
      const vals = domain.get(variables[i].carrier)!;
      const x = vals[rest % vals.length];
      rest = Math.floor(rest / vals.length);
      return x;
    });
    boundary.forEach((i, j) => { assign[i] = input[j]; });
    const row: Row = { input, outputs: new Map(), states: [], count: 0 };
    table.set(tupleKey(input), row);
    overflow = !joinRows(sets, assign, () => {
      const y = out.map((i) => assign[i]!);
      row.outputs.set(tupleKey(y), y);
      if (row.states.length < LISTED_STATES) row.states.push(assign.map((x) => x!));
      row.count++;
    }, budget);
  }
  if (overflow) return { ok: false, errors: [`the steady-state search passed ${max} states. Declare fewer values or split the model`] };
  const typed = (e: Typed) => ({ box: e.box, port: e.port, carrier: e.carrier });
  return { ok: true, inputs: boundary.map((i) => typed(variables[i])), variables: variables.map(typed), table, explored: budget.explored };
}

const sorted = (m: Map<string, string[]>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t);

/** The evaluated relation as returned to callers, truncated to LISTED input valuations. */
function summary(e: Evaluation, p: Plan) {
  const rows = [...e.table.values()];
  return {
    inputs: e.inputs,
    variables: e.variables,
    relation: rows.slice(0, LISTED).map((r) => ({ input: r.input, outputs: sorted(r.outputs), steadyStateCount: r.count, steadyStates: r.states })),
    inputValuations: rows.length,
    noSteadyState: rows.filter((r) => !r.count).map((r) => r.input).slice(0, LISTED),
    severalSteadyStates: rows.filter((r) => r.count > 1).length,
    composed: p.composed.map((b) => b.id),
    downstream: p.downstream,
    partialDownstream: p.partialDownstream,
    statesExplored: e.explored,
    basis: SERIES,
  };
}

/** The model's input→deliverable relation under its declared behaviour (relational trace for feedback). */
export function externalBehavior(model: FunctionModel, opts: { maxStates?: number } = {}) {
  const check = checkModel(model);
  if (!check.ok) return { ok: false as const, errors: check.errors };
  const deliverables = deliverablePorts(model);
  if (!deliverables.length) return { ok: false as const, errors: [NO_DELIVERABLES] };
  const p = plan(model, deliverables);
  if (p.missing.length) {
    return {
      ok: true as const, decided: false as const, deliverables, missingBehavior: p.missing, composed: p.composed.map((b) => b.id),
      note: `Declare behavior for ${p.missing.map((id) => `'${id}'`).join(", ")}: they can reach a deliverable, so the relation depends on them.`,
    };
  }
  const e = evaluate(model, p, deliverables, opts.maxStates ?? MAX_STATES);
  if (!e.ok) return e;
  return {
    ok: true as const, decided: true as const, deliverables, ...summary(e, p), assumption: ASSUMPTION,
    note: "Steady-state semantics: each output is reached by some consistent valuation, including the loop values. Nothing here says which steady state the system reaches, or how. An input with no steady state may signal a runaway loop.",
  };
}

/**
 * Decide whether a trim preserves the input→deliverable relation. Order: the trim must apply
 * (applyTrim); a baseline deliverable port left without a non-harmful function is a structural
 * loss, `changed` without any behaviour; then every box that can reach a deliverable, in either
 * model, must declare behaviour, else `undecided` (missing-behavior); then both relations are
 * compared over the union of their boundary inputs. A port only one model reads ranges over every
 * declared value in both, so a counterexample that sets an opened port follows from the model, not
 * from the physics. When neither model has a steady state at any input, both relations are empty
 * and their equality says nothing: the verdict is `undecided` (no-steady-state), never `preserved`.
 * Otherwise an input where neither model has a steady state agrees, and is counted (`emptyInBoth`).
 */
export function trimPreservesBehavior(model: FunctionModel, spec: { trim: string[]; absorb?: Record<string, Endpoint>; maxStates?: number }) {
  const applied = applyTrim(model, { trim: spec.trim, absorb: spec.absorb });
  if (!applied.ok) return applied;
  const trimmed = applied.model;
  const deliverables = deliverablePorts(model);
  if (!deliverables.length) return { ok: false as const, errors: [NO_DELIVERABLES] };
  const head = { trim: spec.trim, chosen: applied.chosen, deliverables };
  const lost = deliverables.filter((d) => !trimmed.wires.some((w) => w.to.box === d.box && w.to.port === d.port && w.polarity !== "harmful"));
  if (lost.length) {
    return {
      ok: true as const, verdict: "changed" as const, reason: "lost-deliverables" as const, ...head, lostDeliverables: lost,
      note: "The trim leaves these deliverable ports without a non-harmful function: the concept loses functions, whatever the behaviour.",
    };
  }
  const before = plan(model, deliverables), after = plan(trimmed, deliverables);
  if (before.missing.length || after.missing.length) {
    const missing = [...new Set([...before.missing, ...after.missing])];
    return {
      ok: true as const, verdict: "undecided" as const, reason: "missing-behavior" as const, ...head, missingBehavior: missing,
      missingIn: { baseline: before.missing, trimmed: after.missing },
      note: `Declare behavior for ${missing.map((id) => `'${id}'`).join(", ")}: they can reach a deliverable, so the decision depends on them. The carrier screen (triz_trim) is all that holds without it.`,
    };
  }
  const max = spec.maxStates ?? MAX_STATES;
  const b = evaluate(model, before, deliverables, max);
  if (!b.ok) return { ok: false as const, errors: b.errors.map((e) => `baseline: ${e}`) };
  const t = evaluate(trimmed, after, deliverables, max);
  if (!t.ok) return { ok: false as const, errors: t.errors.map((e) => `trimmed: ${e}`) };

  const known = new Set(b.inputs.map(endKey));
  const inputs = [...b.inputs, ...t.inputs.filter((q) => !known.has(endKey(q)))];
  const inputsOnlyIn = { baseline: b.inputs.filter((q) => !t.inputs.some((r) => endKey(r) === endKey(q))), trimmed: t.inputs.filter((q) => !known.has(endKey(q))) };
  const domain = new Map(model.carriers.map((c) => [c.id, c.values ?? []]));
  const valuations = product(inputs.map((q) => domain.get(q.carrier)!.length));
  if (valuations > max) return { ok: false as const, errors: [`the joint boundary inputs have ${valuations} valuations; the cap is ${max}. Declare fewer values or split the model`] };
  const at = (e: Evaluation, u: string[]) => e.table.get(tupleKey(e.inputs.map((q) => u[inputs.findIndex((r) => endKey(r) === endKey(q))])))!.outputs;

  let differing = 0, emptyInBoth = 0, onlyBaseline = false, onlyTrimmed = false;
  let counterexample: { input: Array<Endpoint & { value: string }>; baseline: string[][]; trimmed: string[][]; onlyBaseline: string[][]; onlyTrimmed: string[][] } | undefined;
  for (let n = 0; n < valuations; n++) {
    let rest = n;
    const u = inputs.map((q) => {
      const vals = domain.get(q.carrier)!;
      const x = vals[rest % vals.length];
      rest = Math.floor(rest / vals.length);
      return x;
    });
    const x = at(b, u), y = at(t, u);
    if (!x.size && !y.size) emptyInBoth++;
    const lostHere = sorted(new Map([...x].filter(([k]) => !y.has(k)))), gainedHere = sorted(new Map([...y].filter(([k]) => !x.has(k))));
    if (!lostHere.length && !gainedHere.length) continue;
    differing++;
    onlyBaseline ||= lostHere.length > 0;
    onlyTrimmed ||= gainedHere.length > 0;
    counterexample ??= {
      input: inputs.map((q, i) => ({ box: q.box, port: q.port, value: u[i] })),
      baseline: sorted(x), trimmed: sorted(y), onlyBaseline: lostHere, onlyTrimmed: gainedHere,
    };
  }
  const empties = (e: Evaluation) => [...e.table.values()].filter((r) => !r.count).length;
  const noSteadyState = { baseline: empties(b), trimmed: empties(t) };
  const common = {
    ...head, inputs, inputsOnlyIn, inputValuations: valuations, noSteadyState, emptyInBoth,
    baseline: summary(b, before), trimmed: summary(t, after), assumption: ASSUMPTION,
  };
  if (noSteadyState.baseline === b.table.size && noSteadyState.trimmed === t.table.size) {
    return {
      ok: true as const, verdict: "undecided" as const, reason: "no-steady-state" as const, ...common,
      note: `Neither model has a steady state at any of the ${valuations} compared input valuations: both relations are empty, so their equality says nothing about the trim. Check the loops upstream of the deliverables (baseline.noSteadyState, trimmed.noSteadyState); this may signal a runaway loop or a modelling error.`,
    };
  }
  const runaway = noSteadyState.baseline || noSteadyState.trimmed
    ? ` Input valuations with no steady state: ${noSteadyState.baseline} in the baseline, ${noSteadyState.trimmed} trimmed (listed under baseline.noSteadyState and trimmed.noSteadyState); ${emptyInBoth} of the ${valuations} compared have none in either model and agree only in that. They may signal a runaway loop.`
    : "";
  if (!counterexample) {
    return {
      ok: true as const, verdict: "preserved" as const, ...common,
      note: "The input→deliverable relations are equal under the declared behaviour. Substantiate every declared relation, the absorber's first; its new harms are not modelled here, and its added cost is triz_feasibility's question." + runaway,
    };
  }
  const direction = onlyBaseline && onlyTrimmed ? "incomparable" as const : onlyTrimmed ? "trimmed-contains-baseline" as const : "baseline-contains-trimmed" as const;
  const empty = !counterexample.baseline.length ? " The baseline has no steady state at this input." : !counterexample.trimmed.length ? " The trimmed model has no steady state at this input." : "";
  return {
    ok: true as const, verdict: "changed" as const, reason: "counterexample" as const, ...common, direction, differingInputs: differing, counterexample,
    note: (direction === "incomparable"
      ? "Neither relation contains the other: the trim loses some deliverable outputs and admits new ones."
      : direction === "trimmed-contains-baseline"
        ? "The trimmed relation strictly contains the baseline: the trim admits deliverable outputs the baseline never produces."
        : "The baseline relation strictly contains the trimmed one: the trim rules out deliverable outputs the baseline produces.") + empty + runaway,
  };
}
