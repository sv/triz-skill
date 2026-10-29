/**
 * Monotone co-design feasibility (Censi 2015): can the boxes provide what the product boxes need,
 * and at what minimal resources?
 *
 * A box that declares `feasibility` is a monotone feasibility relation given by its minimal rows.
 * A row provides a level at each output port against the levels it requires at its input ports
 * and its operating cost. Providing less never needs more and more resources never hurt, so a row
 * also covers every lower provision and every higher resource. The product boxes' rows state the
 * demand: the levels they require at their input ports.
 *
 *  - feasibility     — the minimal resource vectors at which the composed boxes meet every
 *                      requirement. A vector is every box's fixed cost plus the operating cost of
 *                      the rows chosen. Each vector comes with one witness: a row per composed box
 *                      and the level demanded per output port. The verdict against the model's
 *                      budget is feasible, infeasible (over budget with the binding dimensions, or
 *                      unprovidable with the port no row can serve), or undecided.
 *  - trimFeasibility — perform a trim (applyTrim) and decide the trimmed model. The baseline is
 *                      solved only to report each absorber's added resources.
 *
 * Composition. A non-harmful wire turns its input port's requirement into a demand on the output
 * port that feeds it. An output port feeding several functions must meet the largest demand (a
 * port has one level); an input port fed by several functions needs each of them to meet it.
 * Harmful functions carry no demand. The composed boxes are the product boxes, the boxes that
 * declare feasibility, and every box upstream of those along non-harmful wires; the other boxes
 * contribute only their fixed cost.
 *
 * Solution. A configuration is a demanded level per output port and a cost vector, ordered
 * componentwise. A step maps an antichain S of configurations to Min ⋃_{s ∈ S} {x ⊔ s : x ∈ h(s)},
 * where h(s) ranges over the row selections (one row per composed box) that provide what s
 * demands, and x is the demand those rows place upstream with their summed operating cost
 * (Censi 2015, Def. 22, eq. 26). Iterating from ⊥, nothing demanded and no cost, is Kleene's
 * ascent. Every coordinate takes values in a finite set (declared levels; sums of one row per box,
 * closed under max), so the ascent reaches the least fixpoint in finitely many steps. Its minimal
 * elements are exactly the minimal feasible configurations (theory/: kleene_lfp,
 * kleeneStep_upperClosure, codesign_lfp). Feedback loops need no special case: requirements only
 * grow along the ascent, so the least fixpoint is the answer. triz_behavior's steady states
 * equate values and have no order to ascend in; that is why it uses the trace and this uses the
 * least fixpoint.
 *
 * The antichains can grow exponentially with the number of boxes and rows; no polynomial bound is
 * claimed. Antichain size, iterations, and candidate selections are capped, and past a cap the
 * call fails closed. The verdict holds for the rows as declared. Whether they are true, the
 * absorber's above all, and the absorber's new harms are outside the kernel.
 */
import { checkModel, type FunctionModel } from "./act.js";
import { applyTrim } from "./act-rewrite.js";
import type { Theorem } from "./act-basis.js";

type Box = FunctionModel["boxes"][number];
type Failure = { ok: false; errors: string[] };
type Endpoint = { box: string; port: string };

/** Caps per solve: antichain elements, Kleene steps, and row selections tried. */
export const MAX_ANTICHAIN = 1_000;
export const MAX_ITERATIONS = 1_000;
export const MAX_CANDIDATES = 1_000_000;
export interface Caps { maxAntichain?: number; maxIterations?: number; maxCandidates?: number }

const LISTED = 50;
/** The ascent from ⊥ reaches the least fixpoint, computed on antichains, whose minimal elements are the minimal feasible configurations. */
const SOLUTION: Theorem[] = ["kleene_lfp", "kleeneStep_upperClosure", "codesign_lfp"];
const NO_PRODUCT = "no product box: the demand is what the product boxes' feasibility rows require; mark the box the main function acts on as role 'product'";

const portKey = (e: Endpoint) => JSON.stringify([e.box, e.port]);
const own = (dict: Record<string, number> | undefined, key: string) => (dict && Object.hasOwn(dict, key) ? dict[key] : undefined);

interface Row { index: number; provide: Array<[number, number]>; demand: Array<[number, number]>; cost: number[] }
interface Problem { composed: Box[]; ports: Endpoint[]; dims: string[]; fixed: number[]; rows: Row[][] }
interface Config { f: number[]; c: number[]; rows: number[] }

/** Composed boxes, the boxes among them without feasibility, and the compiled rows; fails closed on unsupplied requirements. */
function setup(model: FunctionModel): ({ ok: true; missing: string[] } & Problem) | Failure {
  const check = checkModel(model);
  if (!check.ok) return { ok: false, errors: check.errors };
  if (!model.boxes.some((b) => b.role === "product")) return { ok: false, errors: [NO_PRODUCT] };
  const feeding = new Map<string, FunctionModel["wires"]>();
  for (const w of model.wires) {
    if (w.polarity === "harmful") continue;
    const k = portKey(w.to);
    feeding.set(k, [...(feeding.get(k) ?? []), w]);
  }
  const byId = new Map(model.boxes.map((b) => [b.id, b]));
  const reached = new Set<string>();
  const queue = model.boxes.filter((b) => b.role === "product" || b.feasibility).map((b) => b.id);
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (reached.has(id)) continue;
    reached.add(id);
    for (const p of byId.get(id)!.inputs ?? []) for (const w of feeding.get(portKey({ box: id, port: p.id })) ?? []) queue.push(w.from.box);
  }
  const composed = model.boxes.filter((b) => reached.has(b.id));
  const missing = composed.filter((b) => !b.feasibility).map((b) => b.id);
  const ports = composed.flatMap((b) => (b.outputs ?? []).map((p) => ({ box: b.id, port: p.id })));
  const index = new Map(ports.map((e, i) => [portKey(e), i]));
  const dims = [...new Set([
    ...model.boxes.flatMap((b) => Object.keys(b.cost ?? {})),
    ...composed.flatMap((b) => (b.feasibility ?? []).flatMap((r) => Object.keys(r.cost ?? {}))),
  ])].sort();
  const fixed = dims.map((d) => model.boxes.reduce((s, b) => s + (own(b.cost, d) ?? 0), 0));
  const errors: string[] = [];
  const rows = composed.map((b) => (b.feasibility ?? []).map((r, i): Row => ({
    index: i,
    provide: (b.outputs ?? []).map((p) => [index.get(portKey({ box: b.id, port: p.id }))!, own(r.provides, p.id) ?? 0]),
    demand: (b.inputs ?? []).flatMap((p) => {
      const level = own(r.requires, p.id) ?? 0;
      if (!level) return [];
      const wires = feeding.get(portKey({ box: b.id, port: p.id })) ?? [];
      if (!wires.length) errors.push(`box '${b.id}' feasibility row ${i} requires ${level} at input port '${p.id}', but no non-harmful function feeds that port: model its supplier`);
      return wires.map((w) => [index.get(portKey(w.from))!, level] as [number, number]);
    }),
    cost: dims.map((d) => own(r.cost, d) ?? 0),
  })));
  if (errors.length) return { ok: false, errors };
  return { ok: true, missing, composed, ports, dims, fixed, rows };
}

const leq = (a: Config, b: Config) => a.f.every((x, i) => x <= b.f[i]) && a.c.every((x, i) => x <= b.c[i]);
const configKey = (a: Config) => JSON.stringify([a.c, a.f]);

/** Add `x` to the antichain `list` unless an element already lies below it; drop the elements above it. */
function insertMin(list: Config[], x: Config): Config[] {
  if (list.some((e) => leq(e, x))) return list;
  const kept = list.filter((e) => !leq(x, e));
  kept.push(x);
  return kept;
}

interface Blocked { box: string; ports: Array<{ port: string; demanded: number; provided: number }> }
type Expansion = { ok: true; xs: Config[] } | { ok: true; blocked: Blocked } | Failure;

/**
 * h(s): the minimal (upstream demand, operating cost) pairs over the row selections that provide
 * what `s` demands, folded box by box. Dominated partial selections are dropped after each box,
 * which is sound because demands combine by max and costs by sum, both monotone.
 */
function expand(p: Problem, s: Config, caps: Required<Caps>, work: { candidates: number }): Expansion {
  let acc: Config[] = [{ f: p.ports.map(() => 0), c: p.dims.map(() => 0), rows: [] }];
  for (const [k, box] of p.composed.entries()) {
    const eligible = p.rows[k].filter((r) => r.provide.every(([i, level]) => level >= s.f[i]));
    if (!eligible.length) {
      const ports = p.rows[k][0].provide.flatMap(([i]) => {
        const provided = Math.max(...p.rows[k].map((r) => r.provide.find(([j]) => j === i)![1]));
        return provided < s.f[i] ? [{ port: p.ports[i].port, demanded: s.f[i], provided }] : [];
      });
      return { ok: true, blocked: { box: box.id, ports } };
    }
    let next: Config[] = [];
    for (const a of acc) for (const r of eligible) {
      if (++work.candidates > caps.maxCandidates) return { ok: false, errors: [`the search tried more than ${caps.maxCandidates} row selections. Declare fewer rows or split the model`] };
      const f = [...a.f];
      for (const [i, level] of r.demand) f[i] = Math.max(f[i], level);
      next = insertMin(next, { f, c: a.c.map((x, i) => x + r.cost[i]), rows: [...a.rows, r.index] });
    }
    if (next.length > caps.maxAntichain) return { ok: false, errors: [`the antichain passed ${caps.maxAntichain} partial selections while composing box '${box.id}'. Declare fewer rows or split the model`] };
    acc = next;
  }
  return { ok: true, xs: acc };
}

type Solution =
  | { ok: true; minimal: Array<{ s: Config; witness: Config }>; iterations: number; peak: number; candidates: number }
  | { ok: true; blocked: Blocked; iterations: number; peak: number; candidates: number }
  | Failure;

/** Kleene's ascent from ⊥ on antichains of configurations, then one witness per minimal cost vector. */
function solve(p: Problem, caps: Required<Caps>): Solution {
  const work = { candidates: 0 };
  let S: Config[] = [{ f: p.ports.map(() => 0), c: p.dims.map(() => 0), rows: [] }];
  let peak = 1;
  for (let k = 1; k <= caps.maxIterations; k++) {
    let next: Config[] = [];
    let blocked: Blocked | undefined;
    for (const s of S) {
      const e = expand(p, s, caps, work);
      if (!e.ok) return e;
      if ("blocked" in e) { blocked ??= e.blocked; continue; }
      for (const x of e.xs) next = insertMin(next, { f: x.f.map((v, i) => Math.max(v, s.f[i])), c: x.c.map((v, i) => Math.max(v, s.c[i])), rows: [] });
      if (next.length > caps.maxAntichain) return { ok: false, errors: [`the antichain passed ${caps.maxAntichain} configurations at step ${k}. Declare fewer rows or split the model`] };
    }
    peak = Math.max(peak, next.length);
    if (!next.length) return { ok: true, blocked: blocked!, iterations: k, peak, candidates: work.candidates };
    const same = next.length === S.length && next.map(configKey).sort().join() === S.map(configKey).sort().join();
    S = next;
    if (!same) continue;
    // A fixpoint: each minimal configuration has a row selection that fits under it (codesign_lfp).
    // Project onto the cost dimensions and keep the minimal vectors, one configuration each.
    const minimal: Array<{ s: Config; witness: Config }> = [];
    for (const s of [...S].sort((a, b) => configKey(a).localeCompare(configKey(b)))) {
      if (S.some((t) => t.c.every((x, i) => x <= s.c[i]) && t.c.some((x, i) => x < s.c[i]))) continue;
      if (minimal.some((m) => m.s.c.every((x, i) => x === s.c[i]))) continue;
      const e = expand(p, s, caps, work);
      if (!e.ok) return e;
      const witness = "xs" in e ? e.xs.find((x) => leq(x, s)) : undefined;
      if (!witness) throw new Error("feasibility invariant: a fixpoint configuration has no row selection under it");
      minimal.push({ s, witness });
    }
    return { ok: true, minimal, iterations: k, peak, candidates: work.candidates };
  }
  return { ok: false, errors: [`no fixpoint after ${caps.maxIterations} steps. Raise max_iterations or split the model`] };
}

const record = (dims: string[], v: number[]) => Object.fromEntries(dims.map((d, i) => [d, v[i]]));

/** The minimal resource vectors against the budget: feasible, infeasible (over-budget), or undecided (no budget, or an unbudgeted dimension in use). */
function judge(model: FunctionModel, dims: string[], vectors: number[][]) {
  const budget = model.budget;
  const over = vectors.map((v) => dims.filter((d, i) => budget && own(budget, d) !== undefined && v[i] > own(budget, d)!));
  const unbudgeted = vectors.map((v) => dims.filter((d, i) => budget && own(budget, d) === undefined && v[i] > 0));
  if (!budget) return { verdict: "undecided" as const, reason: "no-budget" as const, over, note: "The model declares no budget: the minimal resource vectors are listed, but nothing decides whether they are affordable." };
  const within = vectors.flatMap((_, i) => (!over[i].length && !unbudgeted[i].length ? [i] : []));
  if (within.length) return { verdict: "feasible" as const, over, withinBudget: within, note: "At least one minimal resource vector is within budget on every dimension (withinBudget lists them)." };
  if (over.every((o) => o.length)) {
    const binding = dims.filter((d) => over.every((o) => o.includes(d)));
    return {
      verdict: "infeasible" as const, reason: "over-budget" as const, over, binding,
      note: binding.length
        ? `Every minimal resource vector exceeds the budget on ${binding.map((d) => `'${d}'`).join(", ")}: no configuration of the declared rows fits.`
        : "Every minimal resource vector exceeds the budget, but on different dimensions: no single dimension binds (binding is empty). Relaxing one dimension alone may not help; see each vector's overBudget.",
    };
  }
  const dimsUsed = [...new Set(unbudgeted.flatMap((u, i) => (over[i].length ? [] : u)))].sort();
  return { verdict: "undecided" as const, reason: "unbudgeted" as const, over, unbudgeted: dimsUsed, note: `A minimal resource vector fits every budgeted dimension but uses ${dimsUsed.map((d) => `'${d}'`).join(", ")}, which the budget does not limit.` };
}

/** The model's minimal resource vectors and their verdict against its budget. */
export function feasibility(model: FunctionModel, caps: Caps = {}) {
  const p = setup(model);
  if (!p.ok) return p;
  const composed = p.composed.map((b) => b.id);
  const fixed = record(p.dims, p.fixed);
  if (p.missing.length) {
    return {
      ok: true as const, verdict: "undecided" as const, reason: "missing-feasibility" as const, missingFeasibility: p.missing, composed, fixed,
      note: `Declare feasibility for ${p.missing.map((id) => `'${id}'`).join(", ")}: they are product boxes or supply one along non-harmful functions, so the answer depends on them.`,
    };
  }
  const full: Required<Caps> = { maxAntichain: caps.maxAntichain ?? MAX_ANTICHAIN, maxIterations: caps.maxIterations ?? MAX_ITERATIONS, maxCandidates: caps.maxCandidates ?? MAX_CANDIDATES };
  const s = solve(p, full);
  if (!s.ok) return s;
  const stats = { composed, fixed, iterations: s.iterations, antichainPeak: s.peak, candidates: s.candidates, basis: SOLUTION };
  if ("blocked" in s) {
    return {
      ok: true as const, verdict: "infeasible" as const, reason: "unprovidable" as const, unprovidable: s.blocked, ...stats,
      note: `No row of '${s.blocked.box}' provides what the requirements demand of it (${s.blocked.ports.map((q) => `'${q.port}': ${q.demanded} demanded, at most ${q.provided} provided`).join("; ")}), so no configuration of the declared rows works, whatever the budget.`,
    };
  }
  const totals = s.minimal.map(({ s: x }) => x.c.map((v, i) => v + p.fixed[i]));
  const { over, ...verdict } = judge(model, p.dims, totals);
  const minimal = s.minimal.map(({ s: x, witness }, i) => ({
    resources: record(p.dims, totals[i]),
    operating: record(p.dims, x.c),
    overBudget: over[i],
    rows: p.composed.map((b, k) => ({ box: b.id, row: witness.rows[k] })),
    levels: p.ports.flatMap((e, k) => (x.f[k] > 0 ? [{ ...e, level: x.f[k] }] : [])),
  }));
  return { ok: true as const, ...verdict, minimal: minimal.slice(0, LISTED), minimalCount: minimal.length, ...stats };
}

type Result = ReturnType<typeof feasibility>;
type Solved = Extract<Result, { minimal: unknown }>;
const solved = (r: Result): r is Solved => r.ok && "minimal" in r && r.minimal.length > 0;

/** The operating resources of `box`'s chosen row in each minimal vector of `r`. */
function rowResources(model: FunctionModel, r: Solved, box: string) {
  const rows = model.boxes.find((b) => b.id === box)?.feasibility ?? [];
  return r.minimal.map((v) => {
    const k = v.rows.find((x) => x.box === box)?.row;
    return { row: k ?? null, resources: k === undefined ? {} : { ...(rows[k].cost ?? {}) } };
  });
}

/**
 * Decide a trim by feasibility. The trim is applied as triz_transform does; the verdict is the
 * trimmed model's. The baseline is solved only for each absorber's added resources: its chosen
 * row's operating cost after the trim minus before it. `added` is given when each side has one
 * minimal vector; with several, the per-vector rows are listed and the pairing is the caller's.
 */
export function trimFeasibility(model: FunctionModel, spec: { trim: string[]; absorb?: Record<string, Endpoint> } & Caps) {
  const applied = applyTrim(model, { trim: spec.trim, absorb: spec.absorb });
  if (!applied.ok) return applied;
  const caps = { maxAntichain: spec.maxAntichain, maxIterations: spec.maxIterations, maxCandidates: spec.maxCandidates };
  const after = feasibility(applied.model, caps);
  if (!after.ok) return { ok: false as const, errors: after.errors.map((e) => `trimmed: ${e}`) };
  const before = feasibility(model, caps);
  const boxes = [...new Set(applied.chosen.map((c) => c.box))];
  const absorbers = boxes.map((box) => {
    const functions = applied.chosen.filter((c) => c.box === box).map((c) => c.wire);
    const trimmed = solved(after) ? rowResources(applied.model, after, box) : [];
    const baseline = solved(before) ? rowResources(model, before, box) : [];
    const unavailable = !solved(after) ? "the trimmed model has no minimal resource vector"
      : !solved(before) ? "the baseline has no minimal resource vector to compare with (see baseline)"
      : trimmed.length > 1 || baseline.length > 1 ? "several minimal resource vectors: compare trimmed and baseline row by row"
      : undefined;
    if (unavailable) return { box, functions, trimmed, baseline, addedUnavailable: unavailable };
    const [t, b] = [trimmed[0].resources, baseline[0].resources];
    const dims = [...new Set([...Object.keys(t), ...Object.keys(b)])].sort();
    return { box, functions, trimmed, baseline, added: Object.fromEntries(dims.map((d) => [d, (own(t, d) ?? 0) - (own(b, d) ?? 0)])) };
  });
  const baseline = !before.ok
    ? { ok: false as const, errors: before.errors }
    : { verdict: before.verdict, ...("reason" in before ? { reason: before.reason } : {}), ...(solved(before) ? { minimal: before.minimal } : {}), ...("missingFeasibility" in before ? { missingFeasibility: before.missingFeasibility } : {}) };
  return {
    ...after, trim: spec.trim, chosen: applied.chosen, absorbers, baseline,
    note: `${after.note} The verdict is the trimmed model's. Each absorber's added resources are its chosen row's operating cost after the trim minus before it; its fixed cost is unchanged, and its new harms are not modelled.`,
  };
}
