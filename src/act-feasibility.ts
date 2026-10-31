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
 * port that feeds it. An output port feeding several functions must meet the largest demand when
 * its carrier is intensive (the default: a port has one level), and their sum when the carrier is
 * extensive (`quantity`: the amount divides among the functions). An input port fed by several
 * functions needs each of them to meet it; on an extensive carrier that split is undeclared, so the
 * call fails closed (`extensive-fan-in`) and asks for a merge box. Harmful functions carry no demand. The composed boxes are the product boxes, the boxes that
 * declare feasibility, and every box upstream of those along non-harmful wires; the other boxes
 * contribute only their fixed cost.
 *
 * Solution. A configuration is a demanded level per output port and a cost vector, ordered
 * componentwise. A step maps an antichain S of configurations to Min ⋃_{s ∈ S} {x ⊔ s : x ∈ h(s)},
 * where h(s) ranges over the row selections (one row per composed box) that provide what s
 * demands, and x is the demand those rows place upstream with their summed operating cost
 * (Censi 2015, Def. 22, eq. 26). Iterating from ⊥, nothing demanded and no cost, is Kleene's
 * ascent. Every coordinate takes values in a finite set (declared levels, or on an extensive port
 * their sums over the consumers; sums of one row per box; closed under max), so the ascent
 * reaches the least fixpoint in finitely many steps. The demand x depends on the rows chosen, not
 * on s, so a smaller s admits every selection a larger one does, whether demands sum or take the
 * max (selection_mono). Its minimal
 * elements are exactly the minimal feasible configurations (theory/: kleene_lfp,
 * kleeneStep_upperClosure, codesign_lfp). Feedback loops need no special case: requirements only
 * grow along the ascent, so the least fixpoint is the answer. triz_behavior's steady states
 * equate values and have no order to ascend in; that is why it uses the trace and this uses the
 * least fixpoint. This establishes steady-state balance only. A separate bounded
 * source-support closure checks selected witnesses from zero provision; a closed
 * positive-requirement cycle without grounded provision remains undecided.
 *
 * The antichains can grow exponentially with the number of boxes and rows; no polynomial bound is
 * claimed. Antichain size, iterations, and candidate selections are capped, and past a cap the
 * call fails closed. The verdict holds for the rows as declared. Whether they are true, the
 * absorber's above all, and the absorber's new harms are outside the kernel.
 */
import { checkModel, type FunctionModel } from "./act.js";
import { applyTrim } from "./act-rewrite.js";
import type { Theorem } from "./act-basis.js";
import { at, fail, issue, rebase, where, type Failure } from "./act-issues.js";
import { resourceSourceSupport, ResourceSupportCap } from "./act-resource-support.js";

type Box = FunctionModel["boxes"][number];
type Endpoint = { box: string; port: string };

/** A failure past a cap: `path` is the cap's argument, or the model when only it can shrink the search. */
const capExceeded = (message: string, path: string, hint = "Declare fewer feasibility rows per box, or split the model; the caps can only be lowered.") =>
  fail([issue("cap-exceeded", path, message, hint)]);

/** Caps per solve: antichain elements, Kleene steps, and shared row-selection/source-support work. */
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
/** `extensive[i]`: output port i's carrier is extensive, so the demands on it add up. */
interface Problem { composed: Box[]; ports: Endpoint[]; extensive: boolean[]; dims: string[]; fixed: number[]; rows: Row[][] }
interface Config { f: number[]; c: number[]; rows: number[] }

/** Composed boxes, the boxes among them without feasibility, and the compiled rows; fails closed on unsupplied requirements. */
function setup(model: FunctionModel): ({ ok: true; missing: string[] } & Problem) | Failure {
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  if (!model.boxes.some((b) => b.role === "product")) {
    return fail([issue("no-product", "$.model.boxes", NO_PRODUCT, "Set role 'product' on the box the main function acts on, and give it feasibility rows: what it requires is the demand.")]);
  }
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
  const extensiveCarrier = new Set(model.carriers.filter((c) => c.quantity === "extensive").map((c) => c.id));
  const ports = composed.flatMap((b) => (b.outputs ?? []).map((p) => ({ box: b.id, port: p.id })));
  const extensive = composed.flatMap((b) => (b.outputs ?? []).map((p) => extensiveCarrier.has(p.carrier)));
  const index = new Map(ports.map((e, i) => [portKey(e), i]));
  // An extensive input fed by several functions: how the amount divides among them is undeclared.
  const fanIn = composed.flatMap((b) => (b.inputs ?? []).flatMap((p, j) => {
    const wires = feeding.get(portKey({ box: b.id, port: p.id })) ?? [];
    return extensiveCarrier.has(p.carrier) && wires.length > 1
      ? [issue("extensive-fan-in", at(where.box(model, b.id, "$.model"), "inputs", j), `input port '${b.id}.${p.id}' of extensive carrier '${p.carrier}' is fed by ${wires.length} functions (${wires.map((w) => `'${w.id}'`).join(", ")}): what each supplies of the amount is not declared`,
        `Model a merge box: give it one input per function and an output wired into '${b.id}.${p.id}', with feasibility rows that say what it provides from what it receives. If every function delivers the same shared level, mark carrier '${p.carrier}' intensive.`)]
      : [];
  }));
  if (fanIn.length) return fail(fanIn);
  const dims = [...new Set([
    ...model.boxes.flatMap((b) => Object.keys(b.cost ?? {})),
    ...composed.flatMap((b) => (b.feasibility ?? []).flatMap((r) => Object.keys(r.cost ?? {}))),
  ])].sort();
  const fixed = dims.map((d) => model.boxes.reduce((s, b) => s + (own(b.cost, d) ?? 0), 0));
  const issues: ReturnType<typeof issue>[] = [];
  const rows = composed.map((b) => (b.feasibility ?? []).map((r, i): Row => ({
    index: i,
    provide: (b.outputs ?? []).map((p) => [index.get(portKey({ box: b.id, port: p.id }))!, own(r.provides, p.id) ?? 0]),
    demand: (b.inputs ?? []).flatMap((p) => {
      const level = own(r.requires, p.id) ?? 0;
      if (!level) return [];
      const wires = feeding.get(portKey({ box: b.id, port: p.id })) ?? [];
      if (!wires.length) {
        issues.push(issue("unsupplied-requirement", at(where.box(model, b.id, "$.model"), "feasibility", i, "requires", p.id), `box '${b.id}' feasibility row ${i} requires ${level} at input port '${p.id}', but no non-harmful function feeds that port: model its supplier`,
          `Wire a useful function of carrier '${p.carrier}' into '${b.id}.${p.id}' from the box that supplies it (an environment box for an outside resource), or drop the requirement.`));
      }
      return wires.map((w) => [index.get(portKey(w.from))!, level] as [number, number]);
    }),
    cost: dims.map((d) => own(r.cost, d) ?? 0),
  })));
  if (issues.length) return fail(issues);
  return { ok: true, missing, composed, ports, extensive, dims, fixed, rows };
}

const leq = (a: Config, b: Config) => a.f.every((x, i) => x <= b.f[i]) && a.c.every((x, i) => x <= b.c[i]);
const configKey = (a: Config) => JSON.stringify([a.c, a.f]);
/** Numeric order on configurations, cost first: the order in which minimal vectors are listed. */
const compareConfig = (a: Config, b: Config) => {
  for (const [x, y] of [[a.c, b.c], [a.f, b.f]]) for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

/** Add `x` to the antichain `list` unless an element already lies below it; drop the elements above it. */
function insertMin(list: Config[], x: Config): Config[] {
  if (list.some((e) => leq(e, x))) return list;
  const kept = list.filter((e) => !leq(x, e));
  kept.push(x);
  return kept;
}

/** A box with no row for what is demanded: the joint demand, and the ports no row reaches even alone (possibly none). */
interface Blocked { box: string; demanded: Array<{ port: string; level: number }>; ports: Array<{ port: string; demanded: number; provided: number }> }
type Expansion = { ok: true; xs: Config[] } | { ok: true; blocked: Blocked } | Failure;

/**
 * h(s): the minimal (upstream demand, operating cost) pairs over the row selections that provide
 * what `s` demands, folded box by box. Dominated partial selections are dropped after each box,
 * which is sound because demands combine by max (an intensive port) or by sum (an extensive one)
 * and costs by sum, all monotone.
 */
function expand(p: Problem, s: Config, caps: Required<Caps>, work: { candidates: number }): Expansion {
  let acc: Config[] = [{ f: p.ports.map(() => 0), c: p.dims.map(() => 0), rows: [] }];
  for (const [k, box] of p.composed.entries()) {
    const eligible = p.rows[k].filter((r) => r.provide.every(([i, level]) => level >= s.f[i]));
    if (!eligible.length) {
      const outs = p.rows[k][0].provide.map(([i]) => i);
      const demanded = outs.filter((i) => s.f[i] > 0).map((i) => ({ port: p.ports[i].port, level: s.f[i] }));
      const ports = outs.flatMap((i) => {
        const provided = Math.max(...p.rows[k].map((r) => r.provide.find(([j]) => j === i)![1]));
        return provided < s.f[i] ? [{ port: p.ports[i].port, demanded: s.f[i], provided }] : [];
      });
      return { ok: true, blocked: { box: box.id, demanded, ports } };
    }
    let next: Config[] = [];
    for (const a of acc) for (const r of eligible) {
      if (++work.candidates > caps.maxCandidates) return capExceeded(`the search tried more than ${caps.maxCandidates} row selections. Declare fewer rows or split the model`, "$.model");
      const f = [...a.f];
      for (const [i, level] of r.demand) f[i] = p.extensive[i] ? f[i] + level : Math.max(f[i], level);
      next = insertMin(next, { f, c: a.c.map((x, i) => x + r.cost[i]), rows: [...a.rows, r.index] });
      if (next.length > caps.maxAntichain) return capExceeded(`the antichain passed ${caps.maxAntichain} partial selections while composing box '${box.id}'. Declare fewer rows or split the model`, "$.max_antichain");
    }
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
      for (const x of e.xs) {
        next = insertMin(next, { f: x.f.map((v, i) => Math.max(v, s.f[i])), c: x.c.map((v, i) => Math.max(v, s.c[i])), rows: [] });
        if (next.length > caps.maxAntichain) return capExceeded(`the antichain passed ${caps.maxAntichain} configurations at step ${k}. Declare fewer rows or split the model`, "$.max_antichain");
      }
    }
    peak = Math.max(peak, next.length);
    if (!next.length) return { ok: true, blocked: blocked!, iterations: k, peak, candidates: work.candidates };
    const same = next.length === S.length && next.map(configKey).sort().join() === S.map(configKey).sort().join();
    S = next;
    if (!same) continue;
    // A fixpoint: each minimal configuration has a row selection that fits under it (codesign_lfp).
    // Project onto the cost dimensions and keep the minimal vectors, one configuration each.
    const minimal: Array<{ s: Config; witness: Config }> = [];
    for (const s of [...S].sort(compareConfig)) {
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
  return capExceeded(`no fixpoint after ${caps.maxIterations} steps. Raise max_iterations or split the model`, "$.max_iterations",
    `Raise max_iterations (at most ${MAX_ITERATIONS}), or split the model; a long feedback chain needs one step per link.`);
}

const record = (dims: string[], v: number[]) => Object.fromEntries(dims.map((d, i) => [d, v[i]]));

/** A steady balance need not justify its own resource supply. Starting at zero,
 * activate only selected rows whose positive input requirements already have
 * grounded provision. A stalled closure is unknown initialization/support, not
 * a proof that the steady-state equations are inconsistent. */
function sourceSupport(p:Problem,witness:Config,charge:()=>void) {
  const rows=p.composed.map((b,i)=>{
    const r=p.rows[i].find(r=>r.index===witness.rows[i])!;
    return {box:b.id,row:r.index,demand:r.demand,provide:r.provide};
  });
  return resourceSourceSupport(p.ports,rows,charge);
}

/** The minimal resource vectors against the budget: feasible, infeasible (over-budget), or undecided (no budget, or an unbudgeted dimension in use). */
function judge(model: FunctionModel, dims: string[], vectors: number[][]) {
  const budget = model.budget;
  const over = vectors.map((v) => dims.filter((d, i) => budget && own(budget, d) !== undefined && v[i] > own(budget, d)!));
  const unbudgeted = vectors.map((v) => dims.filter((d, i) => budget && own(budget, d) === undefined && v[i] > 0));
  if (!budget) return { verdict: "undecided" as const, reason: "no-budget" as const, over, within: [] as number[], note: "The model declares no budget: the minimal resource vectors are listed, but nothing decides whether they are affordable." };
  const within = vectors.flatMap((_, i) => (!over[i].length && !unbudgeted[i].length ? [i] : []));
  if (within.length) return { verdict: "feasible" as const, over, within, note: "At least one minimal resource vector is within budget on every dimension. Those are listed first; withinBudget gives their positions in minimal, and withinBudgetCount how many there are." };
  if (over.every((o) => o.length)) {
    const binding = dims.filter((d) => over.every((o) => o.includes(d)));
    return {
      verdict: "infeasible" as const, reason: "over-budget" as const, over, within, binding,
      note: binding.length
        ? `Every minimal resource vector exceeds the budget on ${binding.map((d) => `'${d}'`).join(", ")}: no configuration of the declared rows fits.`
        : "Every minimal resource vector exceeds the budget, but on different dimensions: no single dimension binds (binding is empty). Relaxing one dimension alone may not help; see each vector's overBudget.",
    };
  }
  const dimsUsed = [...new Set(unbudgeted.flatMap((u, i) => (over[i].length ? [] : u)))].sort();
  return { verdict: "undecided" as const, reason: "unbudgeted" as const, over, within, unbudgeted: dimsUsed, note: `A minimal resource vector fits every budgeted dimension but uses ${dimsUsed.map((d) => `'${d}'`).join(", ")}, which the budget does not limit.` };
}

/**
 * The model's minimal resource vectors and their verdict against its budget. `minimal` lists at
 * most 50 vectors for display, affordable ones first; `minimalCount` is how many there are. A
 * caller that decides something about every minimal vector passes `listAll`, which lists them all.
 */
export function feasibility(model: FunctionModel, caps: Caps = {}, opts: { listAll?: boolean } = {}) {
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
    const b = s.blocked;
    return {
      ok: true as const, verdict: "infeasible" as const, reason: "unprovidable" as const, unprovidable: b, ...stats,
      relaxation: b.ports.length
        ? { kind: "capability" as const, box: b.box,
            ports: b.ports.map((q) => ({ ...q, raise: q.demanded - q.provided })),
            note: `Each port lists the smallest raise of '${b.box}'s best provided level that reaches what is demanded. Add or redeclare rows of '${b.box}', or lower what the requirements demand of it.` }
        : { kind: "capability" as const, box: b.box, demanded: b.demanded,
            note: `Some row of '${b.box}' reaches each demanded level alone, but no single row provides them together: declare a combined row, or split the demand across rows through a merge box.` },
      note: (b.ports.length
        ? `No row of '${b.box}' provides what the requirements demand of it (${b.ports.map((q) => `'${q.port}': ${q.demanded} demanded, at most ${q.provided} provided`).join("; ")})`
        : `No single row of '${b.box}' provides the demanded levels together (${b.demanded.map((q) => `'${q.port}': ${q.level}`).join(", ")}), though some row reaches each of them alone`)
        + ", so no configuration of the declared rows works, whatever the budget.",
    };
  }
  const totals = s.minimal.map(({ s: x }) => x.c.map((v, i) => v + p.fixed[i]));
  const { over, within, ...balance } = judge(model, p.dims, totals);
  let supportWork=0;
  const support=[] as ReturnType<typeof sourceSupport>[];
  try {
    for(const {witness} of s.minimal) support.push(sourceSupport(p,witness,()=>{if(s.candidates + ++supportWork > full.maxCandidates)throw new ResourceSupportCap();}));
  } catch(e) {
    if(e instanceof ResourceSupportCap)return capExceeded("resource source-support checking exhausted the shared candidate/work cap","$.model");
    throw e;
  }
  const groundedWithin=within.filter(i=>support[i].grounded);
  const verdict=balance.verdict==="feasible"&&!groundedWithin.length
    ? {verdict:"undecided" as const,reason:"circular-resource-support" as const,note:"The declared rows balance within budget, but their selected positive requirements have no grounded supply from zero-requirement rows. Initialization or an external resource source is unsubstantiated; the steady balance is not a complete feasibility witness."}
    : balance;
  const all = s.minimal.map(({ s: x, witness }, i) => ({
    resources: record(p.dims, totals[i]),
    operating: record(p.dims, x.c),
    overBudget: over[i],
    rows: p.composed.map((b, k) => ({ box: b.id, row: witness.rows[k] })),
    levels: p.ports.flatMap((e, k) => (x.f[k] > 0 ? [{ ...e, level: x.f[k] }] : [])),
  }));
  // Affordable vectors first, so every withinBudget position resolves to a listed witness.
  const order = [...groundedWithin, ...all.map((_, i) => i).filter((i) => !groundedWithin.includes(i))];
  const listed = opts.listAll ? all.length : LISTED;
  const affordable = verdict.verdict === "feasible" ? { withinBudget: groundedWithin.slice(0, listed).map((_, k) => k), withinBudgetCount: groundedWithin.length } : {};
  const relaxation = verdict.verdict === "infeasible" && verdict.reason === "over-budget" ? budgetRelaxation(model, p.dims, totals, over, all) : undefined;
  return { ok: true as const, ...verdict, ...(relaxation ? { relaxation } : {}), ...affordable, minimal: order.slice(0, listed).map((i) => all[i]), minimalCount: all.length, ...stats,candidates:s.candidates+supportWork,supportWork,
    steadyState:{...balance,withinBudget:within.map(i=>order.indexOf(i)),withinBudgetCount:within.length},
    sourceSupport:{groundedCount:support.filter(x=>x.grounded).length,checkedCount:support.length,witnesses:order.slice(0,listed).map(i=>support[i]),hint:"Declare source-backed operating rows for required inputs, or substantiate initialization separately. Circular steady-state balance alone does not establish input supply."} };
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

/** The budget-relaxation basis: the frontier's fixpoint plus the lemma naming when a budget admits one. */
const RELAXATION: Theorem[] = ["codesign_lfp", "budget_feasible_iff"];

/**
 * The minimal budget raises that restore affordability, when every minimal resource vector is
 * over budget. Each kept entry is one minimal vector's per-dimension deficit against the budget,
 * nondominated among the deficits: by `budget_feasible_iff` a raised budget admits a feasible
 * configuration exactly when it lies above some minimal vector, so these raises are a complete
 * set — if any raise of this budget helps, one of these does. Raises advise; the budget stays
 * the caller's declaration.
 */
function budgetRelaxation(
  model: FunctionModel,
  dims: string[],
  totals: number[][],
  over: string[][],
  all: Array<{ rows: Array<{ box: string; row: number }> }>,
) {
  const budget = model.budget;
  if (!budget || !over.every((o) => o.length)) return undefined;
  const budgeted = dims.map((d) => own(budget, d) !== undefined);
  const deficits = totals.map((v) => v.map((x, i) => (budgeted[i] ? Math.max(0, x - own(budget, dims[i])!) : 0)));
  const le = (a: number[], b: number[]) => a.every((x, i) => x <= b[i]);
  const keys = new Set<string>();
  const unique: number[] = [];
  for (let i = 0; i < deficits.length; i++) {
    const k = JSON.stringify(deficits[i]);
    if (!keys.has(k)) { keys.add(k); unique.push(i); }
  }
  const kept = unique.filter((i) => !unique.some((j) => j !== i && le(deficits[j], deficits[i]) && JSON.stringify(deficits[j]) !== JSON.stringify(deficits[i])));
  const perDimension = dims.flatMap((d, i) => (!budgeted[i] ? [] : [{
    dimension: d,
    raise: Math.min(...totals.map((_, k) => (over[k].length === 1 && over[k][0] === d ? deficits[k][i] : Infinity))),
  }]));
  return {
    kind: "budget" as const,
    basis: RELAXATION,
    raises: kept.map((k) => ({
      raise: Object.fromEntries(dims.flatMap((d, i) => (budgeted[i] ? [[d, deficits[k][i]]] : []))),
      resources: record(dims, totals[k]),
      rows: all[k].rows,
    })),
    ...(perDimension.some((p) => Number.isFinite(p.raise))
      ? { perDimension: perDimension.map((p) => ({ ...p, raise: Number.isFinite(p.raise) ? p.raise : null })) }
      : {}),
    note: "Each raise is one minimal way to make the model affordable: raise exactly the listed budget dimensions by these amounts and that row selection fits (budget_feasible_iff: a budget admits a configuration iff it lies above one of the minimal resource vectors). The listed raises are nondominated, so none is componentwise below another, and they are complete: if any raise of this budget admits a configuration, one of these does. Raising a budget is a design decision, not a verdict.",
  };
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
  // The trimmed model is the trim's result, which no input holds.
  if (!after.ok) return rebase(after, [["$.model", "$.trim", "collapse"]], "trimmed: ");
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
    ? { ok: false as const, errors: before.errors, issues: before.issues }
    : { verdict: before.verdict, ...("reason" in before ? { reason: before.reason } : {}), ...(solved(before) ? { minimal: before.minimal } : {}), ...("missingFeasibility" in before ? { missingFeasibility: before.missingFeasibility } : {}) };
  return {
    ...after, trim: spec.trim, chosen: applied.chosen, absorbers, baseline,
    note: `${after.note} The verdict is the trimmed model's. Each absorber's added resources are its chosen row's operating cost after the trim minus before it; its fixed cost is unchanged, and its new harms are not modelled.`,
  };
}
