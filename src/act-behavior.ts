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
 *  - weakestSpec           — for the one box that can reach a deliverable and declares no behaviour,
 *                            the weakest box specification (residual in Rel): every row whose
 *                            composite stays inside a target relation, and whether its composite
 *                            covers the target (spec) or not (impossible: no behaviour of the box
 *                            gives the target).
 *  - weaknessRanking       — the situations each concept admits (a steady state, and every output
 *                            acceptable), ranked by inclusion; the count is a secondary figure.
 *                            Acceptable values are listed, or derived from a threshold through the
 *                            carrier's levels (src/act-levels.ts).
 *
 * Every search is finite and capped; past the cap the call fails closed. The verdict is about the
 * relations as declared. Whether a declared relation is physically or economically true, the
 * absorber's above all, is outside the kernel.
 */
import { checkModel, type FunctionModel } from "./act.js";
import { applyTrim, mapBoxes } from "./act-rewrite.js";
import { thresholdValues } from "./act-levels.js";
import type { Theorem } from "./act-basis.js";
// `at` is a local name for lookups here, so the path helper goes by `jp`.
import { at as jp, fail, issue, quoted, rebase, where, type Failure as BaseFailure, type Issue, type Reroot } from "./act-issues.js";

export type Box = FunctionModel["boxes"][number];
type Endpoint = { box: string; port: string };
export type Typed = Endpoint & { carrier: string };
/** Ports observed by an evaluation: deliverables, and with `side: "out"` any other composed port. */
type Observed = Typed & { side?: "in" | "out" };
/** `cap` marks a failure past the state cap, which the spec and ranking read as undecided. */
type Failure = BaseFailure & { cap?: true };

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

/** The no-deliverables issue, at the model's first product box (or its boxes when it has none). */
function noDeliverables(model: FunctionModel, root: string, prefix = ""): Issue {
  const product = model.boxes.findIndex((b) => b.role === "product");
  return issue("no-deliverables", product < 0 ? jp(root, "boxes") : jp(root, "boxes", product), prefix + NO_DELIVERABLES, product < 0
    ? "Set role 'product' on the box the main function acts on, and wire a useful, insufficient, or excessive function into one of its input ports."
    : `Wire a useful, insufficient, or excessive function into an input port of '${model.boxes[product].id}': a deliverable is a product input fed by a non-harmful function.`);
}

/** A failure past the state cap; the spec and the ranking read it as undecided. */
const capFail = (message: string, path = "$.model", hint = "Declare fewer values on the boundary inputs' carriers, or split the model."): Failure =>
  ({ ...fail([issue("cap-exceeded", path, message, hint)]), cap: true });
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
function evaluate(model: FunctionModel, p: Plan, observe: Observed[], max: number): Evaluation | Failure {
  // Output-side probes are ports of composed boxes, so only input-side observations are extra.
  const { variables, at: v, boundary } = portVariables(model, p.composed, observe.filter((d) => (d.side ?? "in") === "in"));
  const domain = new Map(model.carriers.map((c) => [c.id, c.values ?? []]));
  const valuations = product(boundary.map((i) => domain.get(variables[i].carrier)!.length));
  if (valuations > max) return capFail(`the boundary inputs have ${valuations} valuations; the cap is ${max}. Declare fewer values or split the model`);

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

  const out = observe.map((d) => v(d.box, d.side ?? "in", d.port));
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
  if (overflow) return capFail(`the steady-state search passed ${max} states. Declare fewer values or split the model`, "$.model", "Declare fewer values on the carriers inside loops, or split the model.");
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
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  const deliverables = deliverablePorts(model);
  if (!deliverables.length) return fail([noDeliverables(model, "$.model")]);
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
 * The concept's endpoints in the baseline's box ids. `boxMap` (concept box id → baseline box id,
 * as segment and take_out return it) is checked by mapBoxes, which also gives each concept box its
 * baseline id. Only input ports are compared (deliverables and boundary inputs), so each mapped
 * box's input ports must exist on its baseline box with the same carrier (else mismatch), and no
 * two concept boxes may land one input port on the same baseline port (else ambiguous). Fails
 * closed on both.
 */
function alignment(baseline: FunctionModel, concept: FunctionModel, boxMap: Record<string, string>) {
  const mapped = mapBoxes(concept, baseline, boxMap);
  if (!mapped.ok) return mapped;
  const toBaseline = new Map(concept.boxes.map((b, i) => [b.id, mapped.model.boxes[i].id]));
  const baseBoxes = new Map(baseline.boxes.map((b) => [b.id, b]));
  const owner = new Map<string, string>();
  const issues: Issue[] = [];
  const mapKey = (id: string) => (Object.hasOwn(boxMap, id) ? jp("$.box_map", id) : "$.box_map");
  for (const b of concept.boxes) {
    const target = toBaseline.get(b.id)!;
    for (const p of b.inputs ?? []) {
      const k = endKey({ box: target, port: p.id });
      if (owner.has(k)) {
        issues.push(issue("box-map-ambiguous", mapKey(b.id), `box_map: input port '${p.id}' of '${owner.get(k)}' and of '${b.id}' both map to '${target}.${p.id}': ambiguous`,
          `Map '${owner.get(k)}' and '${b.id}' to different baseline boxes, or rename one of their '${p.id}' ports. Pass a segment's or take_out's boxMap unchanged.`));
      } else owner.set(k, b.id);
      if (Object.hasOwn(boxMap, b.id) && !(baseBoxes.get(target)!.inputs ?? []).some((q) => q.id === p.id && q.carrier === p.carrier)) {
        issues.push(issue("box-map-port-mismatch", mapKey(b.id), `box_map: '${b.id}' maps to '${target}', which has no input port '${p.id}' of carrier '${p.carrier}'`,
          `Map '${b.id}' to a baseline box with input port '${p.id}' of carrier '${p.carrier}', or drop it from box_map if it is new.`));
      }
    }
  }
  if (issues.length) return fail(issues);
  return { ok: true as const, toBaseline: (e: Typed): Typed => ({ ...e, box: toBaseline.get(e.box)! }) };
}

const deliverableKey = (d: Typed) => JSON.stringify([d.box, d.port, d.carrier]);

/**
 * Decide whether a concept preserves the baseline's input→deliverable relation. The concept is any
 * model of the same system: a trim, a segment, an interposed mediator, a rewrite. With `boxMap`,
 * the concept's deliverables and boundary inputs are renamed to baseline box ids before matching;
 * each model is still evaluated in its own ids. Order:
 *  1. a baseline deliverable ([box, port, carrier]) with no non-harmful function in the concept is a
 *     structural loss, `changed` without any behaviour;
 *  2. every box that can reach a deliverable, in either model, must declare behaviour, else
 *     `undecided` (missing-behavior);
 *  3. both relations are compared over the union of their boundary inputs. A port only one model
 *     reads ranges over every declared value in both, so a counterexample that sets it follows from
 *     the model, not from the physics. A port both read must have the same carrier and values in
 *     both, else the call fails closed. When neither model has a steady state at any input, both
 *     relations are empty and their equality says nothing: `undecided` (no-steady-state), never
 *     `preserved`. Otherwise an input where neither has one agrees, and is counted (`emptyInBoth`).
 * Deliverables only the concept has are listed (`gainedDeliverables`) and not compared.
 */
export function compareBehavior(baseline: FunctionModel, concept: FunctionModel, opts: { boxMap?: Record<string, string>; maxStates?: number } = {}) {
  // Paths as triz_behavior orients the models: the baseline is compare_to, the concept is model.
  for (const [side, m, root] of [["baseline", baseline, "$.compare_to"], ["concept", concept, "$.model"]] as const) {
    const check = checkModel(m, root);
    if (!check.ok) return rebase(fail(check.issues), [], `${side}: `);
  }
  const deliverables = deliverablePorts(baseline);
  if (!deliverables.length) return fail([noDeliverables(baseline, "$.compare_to")]);
  const align = alignment(baseline, concept, opts.boxMap ?? {});
  if (!align.ok) return align;
  const offered = new Map(deliverablePorts(concept).map((d) => [deliverableKey(align.toBaseline(d)), d]));
  const wanted = new Set(deliverables.map(deliverableKey));
  const head = {
    deliverables,
    ...(opts.boxMap ? { boxMap: opts.boxMap } : {}),
    gainedDeliverables: [...offered].filter(([k]) => !wanted.has(k)).map(([, d]) => d),
  };
  const lost = deliverables.filter((d) => !offered.has(deliverableKey(d)));
  if (lost.length) {
    return {
      ok: true as const, verdict: "changed" as const, reason: "lost-deliverables" as const, ...head, lostDeliverables: lost,
      note: "The concept leaves these deliverable ports without a non-harmful function: it loses functions, whatever the behaviour. A segment or take_out of the product needs box_map.",
    };
  }
  const observed = deliverables.map((d) => offered.get(deliverableKey(d))!);
  const before = plan(baseline, deliverables), after = plan(concept, observed);
  if (before.missing.length || after.missing.length) {
    const missing = [...new Set([...before.missing, ...after.missing])];
    return {
      ok: true as const, verdict: "undecided" as const, reason: "missing-behavior" as const, ...head, missingBehavior: missing,
      missingIn: { baseline: before.missing, concept: after.missing },
      note: `Declare behavior for ${missing.map((id) => `'${id}'`).join(", ")}: they can reach a deliverable, so the decision depends on them. Without it only the structural checks hold (triz_trim's carrier screen, triz_function_model compare_to).`,
    };
  }
  const max = opts.maxStates ?? MAX_STATES;
  const b = evaluate(baseline, before, deliverables, max);
  if (!b.ok) return rebase(fail(b.issues), [["$.model", "$.compare_to"]], "baseline: ");
  const c = evaluate(concept, after, observed, max);
  if (!c.ok) return rebase(fail(c.issues), [], "concept: ");

  // The concept's boundary inputs in baseline ids; each model's own carriers give its domain.
  const cInputs = c.inputs.map(align.toBaseline);
  const known = new Map(b.inputs.map((q) => [endKey(q), q]));
  const inputs = [...b.inputs, ...cInputs.filter((q) => !known.has(endKey(q)))];
  const values = (m: FunctionModel, carrier: string) => m.carriers.find((x) => x.id === carrier)!.values!;
  const mismatched = cInputs.flatMap((q) => {
    const p = known.get(endKey(q));
    if (!p) return [];
    const [x, y] = [values(baseline, p.carrier), values(concept, q.carrier)];
    return p.carrier === q.carrier && x.length === y.length && x.every((v) => y.includes(v)) ? []
      : [issue("input-domain-mismatch", where.carrier(concept, q.carrier, "$.model"), `input port '${q.box}.${q.port}' reads carrier '${p.carrier}' [${x.join(", ")}] in the baseline and '${q.carrier}' [${y.join(", ")}] in the concept: the relations range over different values`,
        `Give input '${q.box}.${q.port}' the same carrier and values in both models (the baseline has '${p.carrier}' [${x.join(", ")}]), so both relations range over the same situations.`)];
  });
  if (mismatched.length) return fail(mismatched);
  const domain = inputs.map((q) => (known.has(endKey(q)) ? values(baseline, q.carrier) : values(concept, q.carrier)));
  const inputsOnlyIn = { baseline: b.inputs.filter((q) => !cInputs.some((r) => endKey(r) === endKey(q))), concept: cInputs.filter((q) => !known.has(endKey(q))) };
  const valuations = product(domain.map((vals) => vals.length));
  if (valuations > max) return fail([issue("cap-exceeded", "$.model", `the joint boundary inputs have ${valuations} valuations; the cap is ${max}. Declare fewer values or split the model`, "Declare fewer values on the boundary inputs' carriers, or read fewer inputs only one model has.")]);
  const at = (e: Evaluation, own: Typed[], u: string[]) => e.table.get(tupleKey(own.map((q) => u[inputs.findIndex((r) => endKey(r) === endKey(q))])))!.outputs;

  let differing = 0, emptyInBoth = 0, onlyBaseline = false, onlyConcept = false;
  let counterexample: { input: Array<Endpoint & { value: string }>; baseline: string[][]; concept: string[][]; onlyBaseline: string[][]; onlyConcept: string[][] } | undefined;
  for (let n = 0; n < valuations; n++) {
    let rest = n;
    const u = domain.map((vals) => {
      const x = vals[rest % vals.length];
      rest = Math.floor(rest / vals.length);
      return x;
    });
    const x = at(b, b.inputs, u), y = at(c, cInputs, u);
    if (!x.size && !y.size) emptyInBoth++;
    const lostHere = sorted(new Map([...x].filter(([k]) => !y.has(k)))), gainedHere = sorted(new Map([...y].filter(([k]) => !x.has(k))));
    if (!lostHere.length && !gainedHere.length) continue;
    differing++;
    onlyBaseline ||= lostHere.length > 0;
    onlyConcept ||= gainedHere.length > 0;
    counterexample ??= {
      input: inputs.map((q, i) => ({ box: q.box, port: q.port, value: u[i] })),
      baseline: sorted(x), concept: sorted(y), onlyBaseline: lostHere, onlyConcept: gainedHere,
    };
  }
  const empties = (e: Evaluation) => [...e.table.values()].filter((r) => !r.count).length;
  const noSteadyState = { baseline: empties(b), concept: empties(c) };
  const common = {
    ...head, inputs, inputsOnlyIn, inputValuations: valuations, noSteadyState, emptyInBoth,
    baseline: summary(b, before), concept: summary(c, after), assumption: ASSUMPTION,
  };
  if (noSteadyState.baseline === b.table.size && noSteadyState.concept === c.table.size) {
    return {
      ok: true as const, verdict: "undecided" as const, reason: "no-steady-state" as const, ...common,
      note: `Neither model has a steady state at any of the ${valuations} compared input valuations: both relations are empty, so their equality says nothing about the concept. Check the loops upstream of the deliverables (baseline.noSteadyState, concept.noSteadyState); this may signal a runaway loop or a modelling error.`,
    };
  }
  const runaway = noSteadyState.baseline || noSteadyState.concept
    ? ` Input valuations with no steady state: ${noSteadyState.baseline} in the baseline, ${noSteadyState.concept} in the concept (listed under baseline.noSteadyState and concept.noSteadyState); ${emptyInBoth} of the ${valuations} compared have none in either model and agree only in that. They may signal a runaway loop.`
    : "";
  if (!counterexample) {
    return {
      ok: true as const, verdict: "preserved" as const, ...common,
      note: "The input→deliverable relations are equal under the declared behaviour. Substantiate every declared relation, first those the concept adds or changes (an absorber's, a mediator's, a part's); their new harms are not modelled here, and their added cost is triz_feasibility's question." + runaway,
    };
  }
  const direction = onlyBaseline && onlyConcept ? "incomparable" as const : onlyConcept ? "concept-contains-baseline" as const : "baseline-contains-concept" as const;
  const empty = !counterexample.baseline.length ? " The baseline has no steady state at this input." : !counterexample.concept.length ? " The concept has no steady state at this input." : "";
  return {
    ok: true as const, verdict: "changed" as const, reason: "counterexample" as const, ...common, direction, differingInputs: differing, counterexample,
    note: (direction === "incomparable"
      ? "Neither relation contains the other: the concept loses some deliverable outputs and admits new ones."
      : direction === "concept-contains-baseline"
        ? "The concept's relation strictly contains the baseline's: it admits deliverable outputs the baseline never produces."
        : "The baseline's relation strictly contains the concept's: the concept rules out deliverable outputs the baseline produces.") + empty + runaway,
  };
}

/** Perform a trim (applyTrim) and compare the trimmed model with the original (compareBehavior). */
export function trimPreservesBehavior(model: FunctionModel, spec: { trim: string[]; absorb?: Record<string, Endpoint>; maxStates?: number }) {
  const applied = applyTrim(model, { trim: spec.trim, absorb: spec.absorb });
  if (!applied.ok) return applied;
  const r = compareBehavior(model, applied.model, { maxStates: spec.maxStates });
  return r.ok ? { ...r, trim: spec.trim, chosen: applied.chosen } : rebase(r, TRIMMED);
}

/** Against its own trim, the baseline is the input model and the concept is the trim's result, which no input holds. */
const TRIMMED: Reroot = [["$.compare_to", "$.model"], ["$.model", "$.trim", "collapse"]];

const LISTED_ROWS = 200;
const label = (e: Endpoint) => `${e.box}.${e.port}`;

/** Every valuation of `inputs` over `domain`, first input fastest, as evaluate enumerates them. */
function* valuationsOf(inputs: Typed[], domain: Map<string, string[]>) {
  const sizes = inputs.map((q) => domain.get(q.carrier)!.length);
  for (let n = 0; n < product(sizes); n++) {
    let rest = n;
    yield inputs.map((q, i) => {
      const x = domain.get(q.carrier)![rest % sizes[i]];
      rest = Math.floor(rest / sizes[i]);
      return x;
    });
  }
}

/**
 * The situations several evaluations are compared over: the union of their boundary inputs, each
 * over its carrier's declared values. An input read by several must agree on carrier and values.
 */
function situations(parts: Array<{ name: string; inputs: Typed[]; carriers: FunctionModel["carriers"]; root: string }>) {
  const inputs: Typed[] = [], domain = new Map<string, string[]>(), seen = new Map<string, { name: string; carrier: string; values: string[] }>();
  const issues: Issue[] = [];
  for (const { name, inputs: own, carriers, root } of parts) {
    const values = new Map(carriers.map((c) => [c.id, c.values ?? []]));
    for (const q of own) {
      const first = seen.get(endKey(q)), vals = values.get(q.carrier)!;
      if (!first) {
        seen.set(endKey(q), { name, carrier: q.carrier, values: vals });
        inputs.push(q);
        domain.set(q.carrier + "\u0000" + endKey(q), vals);
      } else if (first.carrier !== q.carrier || first.values.length !== vals.length || first.values.some((x) => !vals.includes(x))) {
        issues.push(issue("input-domain-mismatch", where.carrier({ carriers, boxes: [], wires: [] }, q.carrier, root), `input '${label(q)}' is read by ${first.name} as carrier '${first.carrier}' [${first.values.join(", ")}] and by ${name} as carrier '${q.carrier}' [${vals.join(", ")}]: the situations must be the same`,
          `Give input '${label(q)}' the same carrier and values in every model that reads it (${first.name} has '${first.carrier}' [${first.values.join(", ")}]), or use different port ids if they are different conditions.`));
      }
    }
  }
  if (issues.length) return fail(issues);
  // Each input gets its own domain entry, so carriers that share an id across models cannot clash.
  const typed = inputs.map((q) => ({ ...q, carrier: q.carrier + "\u0000" + endKey(q) }));
  const at = (q: Endpoint) => typed.findIndex((r) => endKey(r) === endKey(q));
  return { ok: true as const, inputs, typed, domain, at };
}

/** The outputs an evaluation relates to situation `u`, reading only its own inputs. */
function outputsAt(e: Evaluation, own: Endpoint[], at: (q: Endpoint) => number, u: string[]) {
  return e.table.get(tupleKey(own.map((q) => u[at(q)])))!.outputs;
}

/** The weakest specification and ranking read a state-cap failure as undecided. */
const capped = (f: Failure, prefix = "", rules: Reroot = []) => {
  const r = rebase(fail(f.issues), rules, prefix);
  return f.cap
    ? { ok: true as const, verdict: "undecided" as const, reason: "state-cap" as const, errors: r.errors, note: "The search passed the state cap, so nothing is decided. Declare fewer values or split the model." }
    : r;
};

/**
 * The weakest box specification (residual in Rel) for the one box of `concept` that can reach a
 * deliverable and declares no behaviour, against the target relation of `baseline`.
 *
 * Every other box is fixed, so the context C sends a relation R for the box to the concept's
 * input→deliverable relation C[R]. One search with the box admitting every row finds C[{r}] for
 * each row r: every steady state fixes exactly one row of the box, so grouping steady states by
 * that row is the union C[R] = ⋃ C[{r}]. The spec W is every row whose composite stays inside the
 * target T at every situation; it is the largest such relation (le_residual_iff). Staying inside is
 * not enough, since the empty relation does too: the verdict is `spec` (preserves) only when
 * C[W] covers T, and otherwise `impossible`, since then no relation for the box gives T
 * (covers_iff_exists_eq). Both are re-checked by evaluating the concept with W declared.
 *
 * Fails closed: a concept that loses a deliverable is `impossible` before any search (deliverables
 * only the concept has are listed and not compared, as in compareBehavior); a
 * second box without behaviour is `undecided` (several-holes), since the residual for one depends
 * on the relation chosen for the other; a target with no steady state anywhere is `undecided`
 * (no-steady-state); past the cap, `undecided` (state-cap).
 */
function residualSpec(concept: FunctionModel, baseline: FunctionModel, opts: { boxMap?: Record<string, string>; maxStates?: number }, of: string) {
  // Paths as with compare_to: the baseline is compare_to, the concept is model.
  const checked = checkModel(baseline, "$.compare_to");
  if (!checked.ok) return rebase(fail(checked.issues), [], `${of}: `);
  const target = deliverablePorts(baseline);
  if (!target.length) return fail([noDeliverables(baseline, "$.compare_to", `${of}: `)]);
  const align = alignment(baseline, concept, opts.boxMap ?? {});
  if (!align.ok) return align;
  const rename = align.toBaseline;
  const byKey = new Map(deliverablePorts(concept).map((d) => [deliverableKey(rename(d)), d]));
  const wanted = new Set(target.map(deliverableKey));
  const gainedDeliverables = [...byKey].filter(([k]) => !wanted.has(k)).map(([, d]) => d);
  const lost = target.filter((d) => !byKey.has(deliverableKey(d)));
  if (lost.length) {
    return {
      ok: true as const, verdict: "impossible" as const, reason: "lost-deliverables" as const, preserves: false as const,
      deliverables: target, lostDeliverables: lost, gainedDeliverables,
      note: "The concept leaves these deliverable ports without a non-harmful function, so no behaviour of any box gives the target relation: that is wiring, not behaviour. A segment or take_out of the product needs box_map.",
    };
  }
  const observe = target.map((d) => byKey.get(deliverableKey(d))!);
  const before = plan(baseline, target);
  if (before.missing.length) {
    return {
      ok: true as const, verdict: "undecided" as const, reason: "missing-behavior" as const, deliverables: target, missingBehavior: before.missing, missingIn: of,
      note: `Declare behavior for ${before.missing.map((id) => `'${id}'`).join(", ")} in the ${of === "compare_to" ? "baseline (compare_to)" : "baseline"}: the target relation depends on them.`,
    };
  }
  const p = plan(concept, observe);
  if (p.missing.length > 1) {
    return {
      ok: true as const, verdict: "undecided" as const, reason: "several-holes" as const, deliverables: target, missingBehavior: p.missing,
      note: `${p.missing.length} boxes that can reach a deliverable declare no behaviour (${p.missing.map((id) => `'${id}'`).join(", ")}). The weakest specification is decided for one unknown box only: with several, the largest safe relation for one depends on the relation chosen for the others, so there is no single weakest choice per box. Declare all but one.`,
    };
  }
  if (!p.missing.length) {
    return fail([issue("nothing-to-specify", "$.model", "every box that can reach a deliverable declares behavior: there is no box to specify. Remove the behavior of the box to specify, or compare the relations with trim",
      "Drop behavior from the one box whose specification you want (it becomes the box to specify), or omit weakest_spec to compare the relations as declared.")]);
  }
  const hole = concept.boxes.find((b) => b.id === p.missing[0])!;
  const declared = new Map(concept.carriers.map((c) => [c.id, c.values]));
  const ports = [...(hole.inputs ?? []).map((q) => ({ ...q, side: "in" as const })), ...(hole.outputs ?? []).map((q) => ({ ...q, side: "out" as const }))];
  const bare = ports.filter((q) => !declared.get(q.carrier));
  if (bare.length) {
    return fail(bare.map((q) => issue("no-declared-values", where.carrier(concept, q.carrier, "$.model"), `box '${hole.id}' is the box to specify, but carrier '${q.carrier}' of port '${q.id}' declares no values`,
      `Declare values on carrier '${q.carrier}': the specification's rows range over them.`)));
  }
  const max = opts.maxStates ?? MAX_STATES;
  const candidates = product(ports.map((q) => declared.get(q.carrier)!.length));
  if (candidates > max) return capped(capFail(`box '${hole.id}' has ${candidates} candidate rows; the cap is ${max}. Declare fewer values or split the box`, where.box(concept, hole.id, "$.model"), `Declare fewer values on the carriers of '${hole.id}''s ports, or segment it so each part has fewer ports.`));
  const domain = new Map([...declared].map(([k, v]) => [k, v!]));
  const asRow = (vals: string[]) => ({
    in: Object.fromEntries(ports.flatMap((q, i) => (q.side === "in" ? [[q.id, vals[i]]] : []))),
    out: Object.fromEntries(ports.flatMap((q, i) => (q.side === "out" ? [[q.id, vals[i]]] : []))),
  });
  const rows = [...valuationsOf(ports.map((q) => ({ box: hole.id, port: q.id, carrier: q.carrier })), domain)];
  const withBehavior = (behavior: ReturnType<typeof asRow>[]) => ({ ...concept, boxes: concept.boxes.map((b) => (b.id === hole.id ? { ...b, behavior } : b)) });

  const t = evaluate(baseline, before, target, max);
  if (!t.ok) return capped(t, `${of}: `, [["$.model", "$.compare_to"]]);
  if ([...t.table.values()].every((r) => !r.count)) {
    return {
      ok: true as const, verdict: "undecided" as const, reason: "no-steady-state" as const, deliverables: target,
      note: "The target relation is empty: the baseline has no steady state at any input. Every relation for the box stays inside it and the empty relation equals it, so nothing is decided. Check the baseline's loops.",
    };
  }
  const full = withBehavior(rows.map(asRow));
  const probe: Observed[] = ports.map((q) => ({ box: hole.id, port: q.id, carrier: q.carrier, side: q.side }));
  const e = evaluate(full, plan(full, observe), [...observe, ...probe], max);
  if (!e.ok) return capped(e);
  const space = situations([
    { name: "the baseline", inputs: t.inputs, carriers: baseline.carriers, root: "$.compare_to" },
    { name: "the concept", inputs: e.inputs.map(rename), carriers: concept.carriers, root: "$.model" },
  ]);
  if (!space.ok) return space;
  const conceptInputs = e.inputs.map(rename);
  const valuations = product(space.typed.map((q) => space.domain.get(q.carrier)!.length));
  if (valuations > max) return capped(capFail(`the joint boundary inputs have ${valuations} valuations; the cap is ${max}. Declare fewer values or split the model`));

  // C[{r}] at each situation, grouped by the box's row r (the probe, after the deliverables).
  const k = observe.length;
  const violation = new Map<string, { input: string[]; outputs: string[]; target: string[][] }>();
  const used = new Set<string>();
  for (const u of valuationsOf(space.typed, space.domain)) {
    const goal = outputsAt(t, t.inputs, space.at, u);
    for (const z of outputsAt(e, conceptInputs, space.at, u).values()) {
      const r = tupleKey(z.slice(k));
      used.add(r);
      if (!goal.has(tupleKey(z.slice(0, k))) && !violation.has(r)) violation.set(r, { input: u, outputs: z.slice(0, k), target: sorted(goal) });
    }
  }
  const spec = rows.filter((r) => !violation.has(tupleKey(r)));
  const inSpec = new Set(spec.map(tupleKey));
  let uncoveredInputs = 0;
  let uncovered: { input: Array<Endpoint & { value: string }>; target: string[][]; delivered: string[][]; missing: string[][] } | undefined;
  for (const u of valuationsOf(space.typed, space.domain)) {
    const goal = outputsAt(t, t.inputs, space.at, u);
    const delivered = new Map([...outputsAt(e, conceptInputs, space.at, u).values()].filter((z) => inSpec.has(tupleKey(z.slice(k)))).map((z) => [tupleKey(z.slice(0, k)), z.slice(0, k)]));
    const missing = [...goal].filter(([y]) => !delivered.has(y));
    if (!missing.length) continue;
    uncoveredInputs++;
    uncovered ??= { input: space.inputs.map((q, i) => ({ box: q.box, port: q.port, value: u[i] })), target: sorted(goal), delivered: sorted(delivered), missing: sorted(new Map(missing)) };
  }

  // Independent re-check: declare the spec and compare the concept's relation with the target.
  if (spec.length) {
    const declaredSpec = withBehavior(spec.map(asRow));
    const again = evaluate(declaredSpec, plan(declaredSpec, observe), observe, max);
    if (!again.ok) throw new Error(`invariant: re-evaluating the spec failed: ${again.errors.join("; ")}`);
    for (const u of valuationsOf(space.typed, space.domain)) {
      const goal = outputsAt(t, t.inputs, space.at, u), got = outputsAt(again, conceptInputs, space.at, u);
      const outside = [...got.keys()].some((y) => !goal.has(y)), short = [...goal.keys()].some((y) => !got.has(y));
      if (outside || (!uncovered && short)) throw new Error(`invariant: the declared spec ${outside ? "leaves" : "does not cover"} the target at input [${u.join(", ")}]`);
    }
  }

  const byIn = new Map<string, number>();
  for (const r of spec) { const x = tupleKey(r.filter((_, i) => ports[i].side === "in")); byIn.set(x, (byIn.get(x) ?? 0) + 1); }
  const inputTuples = [...valuationsOf(ports.filter((q) => q.side === "in").map((q) => ({ box: hole.id, port: q.id, carrier: q.carrier })), domain)];
  const blocked = inputTuples.filter((x) => !byIn.has(tupleKey(x)));
  const inputsOf = (x: string[]) => Object.fromEntries(ports.filter((q) => q.side === "in").map((q, i) => [q.id, x[i]]));
  const common = {
    box: hole.id,
    ports: { inputs: (hole.inputs ?? []).map((q) => ({ port: q.id, carrier: q.carrier })), outputs: (hole.outputs ?? []).map((q) => ({ port: q.id, carrier: q.carrier })) },
    spec: spec.slice(0, LISTED_ROWS).map(asRow), specRows: spec.length, specTruncated: spec.length > LISTED_ROWS, candidateRows: rows.length,
    unusedRows: spec.filter((r) => !used.has(tupleKey(r))).length,
    excluded: rows.filter((r) => violation.has(tupleKey(r))).slice(0, LISTED).map((r) => {
      const v = violation.get(tupleKey(r))!;
      return { row: asRow(r), input: space.inputs.map((q, i) => ({ box: q.box, port: q.port, value: v.input[i] })), delivers: v.outputs, target: v.target };
    }),
    blockedInputs: blocked.slice(0, LISTED).map(inputsOf),
    deliverables: target, gainedDeliverables, inputs: space.inputs, inputValuations: valuations, composed: p.composed.map((b) => b.id), assumption: ASSUMPTION,
  };
  const blockNote = blocked.length && spec.length
    ? ` At ${blocked.length} input tuple(s) of '${hole.id}' (blockedInputs) every output takes the composite outside the target, so the spec has no row there: '${hole.id}' must rule those steady states out, which the physics must substantiate.`
    : "";
  const unusedNote = common.unusedRows ? ` ${common.unusedRows} row(s) of the spec occur in no steady state (unusedRows): they constrain nothing.` : "";
  if (uncovered) {
    return {
      ok: true as const, verdict: "impossible" as const, reason: "not-covered" as const, preserves: false as const, ...common, uncovered, uncoveredInputs,
      basis: ["not_covers_iff", ...(spec.length ? [] : ["map_empty"])] as Theorem[],
      note: `No behaviour of '${hole.id}' gives the target relation. Every relation that keeps the composite inside the target is contained in the spec, and the spec's composite misses the outputs under uncovered (${uncoveredInputs} of ${valuations} input valuations). Change another box or the wiring.`
        + (spec.length ? "" : ` The spec is empty: every row of '${hole.id}' takes the composite outside the target. The empty relation stays inside trivially, since its composite is empty, so staying inside is never read as preserving.`),
    };
  }
  return {
    ok: true as const, verdict: "spec" as const, preserves: true as const, ...common,
    basis: ["le_residual_iff", "covers_iff_exists_eq"] as Theorem[],
    note: `The weakest specification for '${hole.id}' (residual in Rel): every row whose composite stays inside the target, and with all of them declared the concept's relation equals the target. Any behaviour of '${hole.id}' that gives the target is contained in it, so declaring it commits '${hole.id}' to the fewest constraints. It holds for the other boxes' relations as declared; whether a physical '${hole.id}' can meet it, and at what cost, is outside the kernel.` + blockNote + unusedNote,
  };
}

/** The weakest specification for the concept's one box without behaviour, against the baseline (compare_to). */
export function weakestSpec(concept: FunctionModel, baseline: FunctionModel, opts: { boxMap?: Record<string, string>; maxStates?: number } = {}) {
  const checked = checkModel(concept, "$.model");
  if (!checked.ok) return fail(checked.issues);
  return residualSpec(concept, baseline, opts, "compare_to");
}

/** Perform a trim and give the weakest specification for the one box without behaviour, against the untrimmed model. */
export function weakestTrimSpec(model: FunctionModel, spec: { trim: string[]; absorb?: Record<string, Endpoint>; maxStates?: number }) {
  const applied = applyTrim(model, { trim: spec.trim, absorb: spec.absorb });
  if (!applied.ok) return applied;
  const r = residualSpec(applied.model, model, { maxStates: spec.maxStates }, "baseline");
  return r.ok ? { trim: spec.trim, chosen: applied.chosen, ...r } : rebase(r, TRIMMED);
}

/**
 * One acceptability entry: for a deliverable port (box and port) or for every deliverable of a
 * carrier, either the acceptable values or a numeric threshold read through the carrier's levels
 * (`at_least`, `below`; src/act-levels.ts). A port entry takes precedence over a carrier entry.
 */
export type Acceptable = { box?: string; port?: string; carrier?: string; values?: string[]; at_least?: number; below?: number };

/**
 * Each deliverable's acceptable values. A threshold is read in each concept through that concept's
 * levels for the carrier, and must give the same values in all of them. Fails closed on an entry
 * that names neither or both of a port and a carrier, neither or both of values and a threshold, a
 * port that is not a deliverable, a carrier no deliverable carries, an entry listed twice, an
 * undeclared value, a threshold that is not a declared level, and a deliverable with no entry.
 */
function resolveAcceptable(concepts: Array<{ id: string; model: FunctionModel }>, target: Typed[], acceptable: Acceptable[]) {
  const issues: Issue[] = [];
  const push = (code: Issue["code"], path: string, message: string, hint: string) => issues.push(issue(code, path, message, hint));
  const byPort = new Map<string, { a: Acceptable; k: number }>(), byCarrier = new Map<string, { a: Acceptable; k: number }>();
  const deliverables = quoted(target.map(label));
  acceptable.forEach((a, k) => {
    const here = jp("$.acceptable", k);
    const named = a.box !== undefined || a.port !== undefined;
    if (named === (a.carrier !== undefined)) {
      push("acceptable-entry-malformed", here, "acceptable: each entry names a deliverable port (box and port) or a carrier, not both or neither", `Give either box and port of a deliverable (${deliverables}) or a carrier, not both.`);
      return;
    }
    if (named && (a.box === undefined || a.port === undefined)) { push("acceptable-entry-malformed", here, "acceptable: an entry that names a port gives both box and port", `Give both box and port, e.g. of one of ${deliverables}.`); return; }
    const name = named ? `'${a.box}.${a.port}'` : `carrier '${a.carrier}'`;
    const threshold = a.at_least !== undefined || a.below !== undefined;
    if (threshold === (a.values !== undefined)) {
      push("acceptable-entry-malformed", here, `acceptable: ${name}: give values or a threshold (at_least, below), not ${threshold ? "both" : "neither"}`,
        threshold ? "Drop values to read the threshold through the carrier's levels, or drop at_least and below to list the values." : "Add values (the acceptable declared values), or at_least or below (a threshold that is one of the carrier's levels).");
      return;
    }
    if (named) {
      const e = { box: a.box!, port: a.port! };
      if (!target.some((x) => endKey(x) === endKey(e))) { push("acceptable-not-deliverable", here, `acceptable: '${label(e)}' is not a deliverable (deliverables: ${target.map(label).join(", ")})`, `Name a deliverable port (a product input fed by a non-harmful function): ${deliverables}.`); return; }
      if (byPort.has(endKey(e))) { push("listed-twice", here, `acceptable: '${label(e)}' is listed twice`, `List '${label(e)}' once, with every acceptable value.`); return; }
      byPort.set(endKey(e), { a, k });
    } else {
      const carriers = [...new Set(target.map((d) => d.carrier))];
      if (!target.some((x) => x.carrier === a.carrier)) { push("acceptable-not-deliverable", jp(here, "carrier"), `acceptable: carrier '${a.carrier}' is the carrier of no deliverable (deliverables: ${target.map((d) => `${label(d)} (${d.carrier})`).join(", ")})`, `Name a carrier a deliverable carries: ${quoted(carriers)}.`); return; }
      if (byCarrier.has(a.carrier!)) { push("listed-twice", here, `acceptable: carrier '${a.carrier}' is listed twice`, `List carrier '${a.carrier}' once.`); return; }
      byCarrier.set(a.carrier!, { a, k });
    }
  });
  const accept = new Map<string, Set<string>>();
  const resolved: Array<Typed & { values: string[]; threshold?: { at_least?: number; below?: number; levels: unknown }; basis?: Theorem[] }> = [];
  for (const d of target) {
    const entry = byPort.get(endKey(d)) ?? byCarrier.get(d.carrier);
    if (!entry) {
      push("acceptable-missing", "$.acceptable", `acceptable: no values for deliverable '${label(d)}'; the acceptability predicate is required for every deliverable`,
        `Add { box: '${d.box}', port: '${d.port}', values: [...] } (or an entry for carrier '${d.carrier}') to acceptable, listing the values that are acceptable there.`);
      continue;
    }
    const { a, k } = entry;
    const carrierIn = (c: { model: FunctionModel }) => c.model.carriers.find((x) => x.id === d.carrier)!;
    if (a.values) {
      for (const c of concepts) {
        a.values.forEach((v, j) => {
          if (!(carrierIn(c).values ?? []).includes(v)) push("undeclared-value", jp("$.acceptable", k, "values", j), `acceptable: value '${v}' of '${label(d)}' is not declared by carrier '${d.carrier}' in concept '${c.id}'`, `Use values carrier '${d.carrier}' declares in concept '${c.id}': ${quoted(carrierIn(c).values ?? [])}.`);
        });
      }
      accept.set(endKey(d), new Set(a.values));
      resolved.push({ ...d, values: a.values });
      continue;
    }
    const t = { ...(a.at_least !== undefined ? { at_least: a.at_least } : {}), ...(a.below !== undefined ? { below: a.below } : {}) };
    let first: { id: string; values: string[] } | undefined;
    for (const c of concepts) {
      const r = thresholdValues(carrierIn(c), t);
      if (!r.ok) {
        const levels = carrierIn(c).levels;
        push("invalid-threshold", jp("$.acceptable", k, a.at_least !== undefined ? "at_least" : "below"), `acceptable: '${label(d)}' in concept '${c.id}': ${r.error}`,
          levels ? `Use a threshold that is one of carrier '${d.carrier}''s level starts in concept '${c.id}' (${levels.map((l) => l.from).join(", ")}), or list values instead.` : `Declare levels on carrier '${d.carrier}' in concept '${c.id}', or list the acceptable values instead.`);
        continue;
      }
      if (!first) first = { id: c.id, values: r.values };
      else if (r.values.length !== first.values.length || r.values.some((v) => !first!.values.includes(v))) {
        push("levels-differ", jp("$.acceptable", k), `acceptable: '${label(d)}': the threshold reads as [${first.values.join(", ")}] in concept '${first.id}' and as [${r.values.join(", ")}] in concept '${c.id}': the concepts declare different levels for carrier '${d.carrier}'`,
          `Declare the same levels for carrier '${d.carrier}' in every concept, or list the acceptable values instead of a threshold.`);
      }
    }
    if (first) {
      accept.set(endKey(d), new Set(first.values));
      resolved.push({ ...d, values: first.values, threshold: { ...t, levels: carrierIn(concepts[0]).levels }, basis: ["level_gc"] });
    }
  }
  if (issues.length) return fail(issues);
  return { ok: true as const, accept, resolved };
}

/**
 * Rank concepts that declare behaviour by the situations they admit. A situation is a valuation of
 * the union of the concepts' boundary inputs over their carriers' declared values: the operating
 * situations of weakness.md's step 1, declared in the model. A concept admits a situation when it
 * has a steady state there and every deliverable output there is acceptable (`acceptable`: per
 * deliverable port, the values that are). Concepts are ordered by inclusion of what they admit;
 * incomparable pairs are reported with a witness each way. The count of admitted situations is a
 * secondary figure: it depends on how finely the carriers' values are declared.
 *
 * Fails closed: concepts must deliver the same ports (a concept that drops a deliverable has fewer
 * outputs to be acceptable and would look weaker), `acceptable` must cover every deliverable with
 * declared values, and an input several concepts read must range over the same values. Missing
 * behaviour or the state cap is `undecided`.
 */
export function weaknessRanking(concepts: Array<{ id: string; model: FunctionModel }>, acceptable: Acceptable[], opts: { maxStates?: number } = {}) {
  const issues: Issue[] = [];
  const ids = concepts.map((c) => c.id);
  const root = (i: number) => jp("$.concepts", i, "model");
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) issues.push(issue("duplicate-id", jp("$.concepts", ids.indexOf(id, ids.indexOf(id) + 1), "id"), `duplicate concept id '${id}'`, `Give each concept its own id; rename the second '${id}'.`));
  concepts.forEach((c, i) => issues.push(...rebase(fail(checkModel(c.model, root(i)).issues), [], `concept '${c.id}': `).issues));
  if (issues.length) return fail(issues);
  const delivered = concepts.map((c) => deliverablePorts(c.model));
  const target = delivered[0];
  if (!target.length) return fail([noDeliverables(concepts[0].model, root(0), `concept '${concepts[0].id}': `)]);
  const same = `Deliver the same product input ports in every concept as '${concepts[0].id}' does (${quoted(target.map(label))}); rank only concepts that pass the adequacy filter.`;
  concepts.forEach((c, i) => {
    for (const d of target) if (!delivered[i].some((x) => deliverableKey(x) === deliverableKey(d))) issues.push(issue("deliverables-differ", root(i), `concept '${c.id}' does not deliver '${label(d)}' (carrier '${d.carrier}'), which '${concepts[0].id}' does`, same));
    for (const d of delivered[i]) if (!target.some((x) => deliverableKey(x) === deliverableKey(d))) issues.push(issue("deliverables-differ", root(i), `concept '${c.id}' delivers '${label(d)}' (carrier '${d.carrier}'), which '${concepts[0].id}' does not`, same));
  });
  if (issues.length) return fail([...issues, issue("deliverables-differ", "$.concepts", "the concepts must deliver the same ports: one that drops a deliverable has fewer outputs to be acceptable, and would look weaker", same)]);
  const acceptance = resolveAcceptable(concepts, target, acceptable);
  if (!acceptance.ok) return acceptance;
  const accept = acceptance.accept;

  const plans = concepts.map((c) => plan(c.model, target));
  const missing = Object.fromEntries(concepts.flatMap((c, i) => (plans[i].missing.length ? [[c.id, plans[i].missing]] : [])));
  if (Object.keys(missing).length) {
    return {
      ok: true as const, verdict: "undecided" as const, reason: "missing-behavior" as const, missingBehavior: missing,
      note: "Declare behavior for the listed boxes: they can reach a deliverable, so what the concept admits depends on them.",
    };
  }
  const max = opts.maxStates ?? MAX_STATES;
  const evals: Evaluation[] = [];
  for (const [i, c] of concepts.entries()) {
    const e = evaluate(c.model, plans[i], target, max);
    if (!e.ok) return capped(e, `concept '${c.id}': `, [["$.model", root(i)]]);
    evals.push(e);
  }
  const space = situations(concepts.map((c, i) => ({ name: `concept '${c.id}'`, inputs: evals[i].inputs, carriers: c.model.carriers, root: root(i) })));
  if (!space.ok) return space;
  const valuations = product(space.typed.map((q) => space.domain.get(q.carrier)!.length));
  if (valuations > max) return capped(capFail(`the joint boundary inputs have ${valuations} valuations; the cap is ${max}. Declare fewer values or split the model`, "$.concepts", "Declare fewer values on the situation inputs' carriers, or give the same operating condition the same box and port id in every concept."));
  const ok = (y: string[]) => y.every((x, j) => accept.get(endKey(target[j]))!.has(x));
  const all = [...valuationsOf(space.typed, space.domain)];
  const situation = (u: string[]) => space.inputs.map((q, i) => ({ box: q.box, port: q.port, value: u[i] }));

  const admits = evals.map((e) => all.map((u) => {
    const out = [...outputsAt(e, e.inputs, space.at, u).values()];
    return out.length ? (out.every(ok) ? "admitted" as const : out.find((y) => !ok(y))!) : "no-steady-state" as const;
  }));
  const reads = evals.map((e) => e.inputs.map(label));
  const readByOne = space.inputs.filter((q) => reads.filter((r) => r.includes(label(q))).length === 1).map((q) => ({ input: label(q), concept: concepts[reads.findIndex((r) => r.includes(label(q)))].id }));
  const perConcept = concepts.map((c, i) => {
    const a = admits[i];
    const firstRejected = a.findIndex((x) => x !== "admitted");
    return {
      id: c.id, reads: reads[i], admitted: a.filter((x) => x === "admitted").length,
      rejected: { noSteadyState: a.filter((x) => x === "no-steady-state").length, unacceptable: a.filter((x) => Array.isArray(x)).length },
      admittedSituations: all.filter((_, n) => a[n] === "admitted").slice(0, LISTED).map((u) => u),
      firstRejected: firstRejected < 0 ? null : {
        situation: situation(all[firstRejected]),
        ...(a[firstRejected] === "no-steady-state" ? { reason: "no-steady-state" as const } : { reason: "unacceptable-output" as const, output: a[firstRejected] as string[] }),
      },
    };
  });
  const inside = (i: number, j: number) => all.findIndex((_, n) => admits[i][n] === "admitted" && admits[j][n] !== "admitted");
  const pairs = concepts.flatMap((c, i) => concepts.slice(i + 1).map((d, dj) => {
    const j = i + 1 + dj, onlyFirst = inside(i, j), onlySecond = inside(j, i);
    const order = onlyFirst < 0 && onlySecond < 0 ? "equal" as const : onlySecond < 0 ? "first-weaker" as const : onlyFirst < 0 ? "second-weaker" as const : "incomparable" as const;
    return {
      concepts: [c.id, d.id], order,
      ...(onlyFirst >= 0 ? { onlyFirst: situation(all[onlyFirst]) } : {}),
      ...(onlySecond >= 0 ? { onlySecond: situation(all[onlySecond]) } : {}),
      ...(order === "incomparable" ? { basis: ["admits_incomparable"] as Theorem[] } : order === "equal" ? {} : { basis: ["card_lt_of_strictly_weaker"] as Theorem[] }),
    };
  }));
  const contains = (i: number, j: number) => inside(j, i) < 0;
  const maximal = concepts.filter((_, i) => !concepts.some((__, j) => j !== i && contains(j, i) && !contains(i, j))).map((c) => c.id);
  const weakest = concepts.filter((_, i) => concepts.every((__, j) => contains(i, j))).map((c) => c.id);
  return {
    ok: true as const, verdict: "ranked" as const, deliverables: target,
    ...(acceptance.resolved.some((r) => r.threshold) ? { acceptable: acceptance.resolved } : {}),
    situations: space.inputs, situationCount: valuations, readByOne,
    weakest, maximal, pairs, concepts: perConcept,
    byCount: [...perConcept].sort((a, b) => b.admitted - a.admitted).map((c) => ({ id: c.id, admitted: c.admitted })),
    assumption: ASSUMPTION,
    note: (weakest.length ? `Weakest: ${weakest.map((id) => `'${id}'`).join(", ")} admits every situation any other concept admits.` : `No concept admits every situation the others admit: the maximal concepts ${maximal.map((id) => `'${id}'`).join(", ")} are incomparable (pairs).`)
      + (readByOne.length ? ` ${readByOne.length} situation input(s) are read by one concept only (readByOne); the other concepts admit or reject regardless of them. If one names the same operating condition as another concept's input, give both the same box and port id (an environment box with an unwired input), or the ranking treats them as independent conditions.` : "")
      + " The situations are the valuations of the boundary inputs over their carriers' declared values: the operating situations of weakness.md's step 1, declared in the model, so the ranking is relative to them. A concept admits a situation when it has a steady state there and every deliverable output there is acceptable. The ranking is by inclusion; byCount depends on how finely the carriers' values are declared, so read it second. Whether each concept resolves the contradiction is filtered before ranking; for a safety, integrity, or authorisation decision, admitting more is the wrong direction (weakness.md).",
  };
}
