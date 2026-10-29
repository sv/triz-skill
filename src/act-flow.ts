/**
 * Flows: the boxes a carrier passes through, in series and in order (the model's `flows`).
 *
 * A function model records who acts on whom. It does not record that two boxes sit one after the
 * other along a flow: two valves in series both act on the water, not on each other. A flow path
 * records that order. It is read here and by `merge` (reading 'adjacent'); every other check
 * ignores it.
 *
 *  - flowAnalysis — per flow: its steps, bottleneck candidates, accumulation candidates, leak
 *                   candidates, loops, and the harm loops it meets (the method of router entry 16,
 *                   Flow analysis). Every item is a candidate to substantiate, not a finding.
 *  - mapFlows     — carry flows through a box map: a merge sends a group to one box, a trim
 *                   removes boxes, a renamed copy renames one. Repeats in a row collapse into one
 *                   step, and a flow left with fewer than two boxes is reported as gone.
 *  - restrictFlows — the part of each flow inside a box set: its maximal runs of consecutive boxes
 *                   in the set, for the subsystem view.
 *
 * Definitions, for a flow F with carrier c and path b₀ … bₙ:
 *  - A step is a pair of consecutive boxes (bᵢ, bᵢ₊₁). Its functions are the wires of carrier c
 *    from bᵢ to bᵢ₊₁; a step with none is declared only by the flow.
 *  - A function acts on F at a box of its path when it carries c and its object is on the path
 *    (it acts at the object), or its object is F's `medium`, the box that stands for what flows,
 *    and its performer is on the path (it acts at the performer). The first reading fits boxes
 *    that pass the carrier on; the second fits boxes in series that each act on the medium.
 *  - Bottleneck candidate: the performer of a function acting on F that is rated insufficient,
 *    excessive, or harmful: a resistance-like output on the flow. `at` is the first position on
 *    the path of the box it acts at.
 *  - Accumulation candidate: a box on F where the steps of every flow of carrier c converge (at
 *    least two distinct predecessors, and fewer successors than predecessors), or F's last box when
 *    no flow of c continues from it and it lies inside the engineered system (role tool or
 *    mediator), so the carrier stops there.
 *  - Leak candidate: a function on c from a box on F to an environment or supersystem box off the
 *    path: the carrier leaves the flow.
 *  - Loop: a box that recurs on the path. The cycle runs from one occurrence to the next; its first
 *    step and the rest of it make a cycle of F's step relation (edge_on_cycle). Harm loops
 *    (harmLoops) that share a box with F are listed too.
 */
import { checkModel, harmLoops, type Flow, type FunctionModel, type Polarity } from "./act.js";
import type { Theorem } from "./act-basis.js";
import { fail } from "./act-issues.js";

const RESISTANT: ReadonlySet<Polarity> = new Set(["insufficient", "excessive", "harmful"]);
const INSIDE: ReadonlySet<string> = new Set(["tool", "mediator"]);
const OUTSIDE: ReadonlySet<string> = new Set(["environment", "supersystem"]);
const LOOP: Theorem[] = ["edge_on_cycle"];

/** Drop repeats in a row: the steps of the result are the steps of `path` whose ends differ. */
export function destutter(path: string[]): string[] {
  return path.filter((id, i) => i === 0 || path[i - 1] !== id);
}

/** Consecutive pairs of a path. */
export const stepsOf = (path: string[]) => path.slice(1).map((to, i) => [path[i], to] as const);

/**
 * Flows through a box map: `at(id)` is the box's image, or null when the box is removed. Each path
 * is mapped, removed boxes are skipped, and repeats in a row collapse. `changed` lists the flows
 * whose path changed and survived; `gone` the flows left with fewer than two boxes, which are
 * removed from `flows`.
 */
export function mapFlows(flows: Flow[] | undefined, at: (id: string) => string | null) {
  const out: Flow[] = [], changed: string[] = [], gone: string[] = [];
  for (const f of flows ?? []) {
    const path = destutter(f.path.map(at).filter((id): id is string => id !== null));
    if (path.length < 2) { gone.push(f.id); continue; }
    const { medium: _medium, ...rest } = f;
    const medium = f.medium === undefined ? null : at(f.medium);
    if (JSON.stringify(path) !== JSON.stringify(f.path) || (medium ?? undefined) !== f.medium) changed.push(f.id);
    out.push({ ...rest, path, ...(medium !== null ? { medium } : {}) });
  }
  return { flows: out, changed, gone };
}

/** Flows that pass any of `boxes`, or whose medium is one of them. */
export const flowsThrough = (flows: Flow[] | undefined, boxes: Set<string>) =>
  (flows ?? []).filter((f) => f.path.some((id) => boxes.has(id)) || (f.medium !== undefined && boxes.has(f.medium)));

/**
 * Each flow's maximal runs of consecutive boxes inside `keep`, as flows of at least two boxes. A
 * flow wholly inside keeps its id; a flow cut into several runs gives '<id>/1', '<id>/2', …, made
 * fresh against every flow id. `crossing` lists the flows with boxes both inside and outside.
 */
export function restrictFlows(flows: Flow[] | undefined, keep: Set<string>) {
  const out: Flow[] = [], crossing: string[] = [];
  const taken = new Set((flows ?? []).map((f) => f.id));
  for (const f0 of flows ?? []) {
    // A medium outside the set is not in the view, so the restricted flow names none.
    const { medium: _medium, ...bare } = f0;
    const f = f0.medium === undefined || keep.has(f0.medium) ? f0 : bare;
    const inside = f.path.filter((id) => keep.has(id)).length;
    if (inside === f.path.length) { out.push(f); continue; }
    if (inside) crossing.push(f.id);
    const runs: string[][] = [[]];
    for (const id of f.path) {
      if (keep.has(id)) runs[runs.length - 1].push(id);
      else if (runs[runs.length - 1].length) runs.push([]);
    }
    const long = runs.filter((r) => r.length >= 2);
    long.forEach((path, k) => {
      let id = long.length === 1 ? f.id : `${f.id}/${k + 1}`;
      for (let n = 2; long.length > 1 && taken.has(id); n++) id = `${f.id}/${k + 1}-${n}`;
      taken.add(id);
      out.push({ ...f, id, path });
    });
  }
  return { flows: out, crossing };
}

/** The flow analysis of a typed model. Fails closed on a model that does not type-check; issue paths start at `$.model`. */
export function flowAnalysis(model: FunctionModel) {
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  const flows = model.flows ?? [];
  const role = new Map(model.boxes.map((b) => [b.id, b.role]));
  const loops = harmLoops(model);
  // The step graph of each carrier: every flow of that carrier contributes its steps.
  const preds = new Map<string, Map<string, Set<string>>>(), succs = new Map<string, Map<string, Set<string>>>();
  const add = (m: Map<string, Map<string, Set<string>>>, c: string, a: string, b: string) => {
    const byBox = m.get(c) ?? m.set(c, new Map()).get(c)!;
    (byBox.get(a) ?? byBox.set(a, new Set()).get(a)!).add(b);
  };
  for (const f of flows) for (const [a, b] of stepsOf(f.path)) { add(succs, f.carrier, a, b); add(preds, f.carrier, b, a); }
  const degree = (m: typeof preds, c: string, id: string) => m.get(c)?.get(id)?.size ?? 0;

  const analysed = flows.map((f) => {
    const on = new Set(f.path);
    const first = (id: string) => f.path.indexOf(id);
    const carried = model.wires.filter((w) => w.carrier === f.carrier);
    const steps = stepsOf(f.path).map(([from, to]) => ({
      from, to,
      functions: carried.filter((w) => w.from.box === from && w.to.box === to).map((w) => w.id).sort(),
    }));
    // Where a function acts on the flow: at its object (it carries c), or at its performer (it acts on the medium).
    const actsAt = (w: (typeof model.wires)[number]) =>
      w.carrier === f.carrier && on.has(w.to.box) ? w.to.box
      : f.medium !== undefined && w.to.box === f.medium && on.has(w.from.box) ? w.from.box
      : undefined;
    const bottlenecks = model.wires.filter((w) => RESISTANT.has(w.polarity) && actsAt(w) !== undefined)
      .map((w) => ({ box: w.from.box, wire: w.id, polarity: w.polarity, object: w.to.box, at: first(actsAt(w)!) }))
      .sort((a, b) => a.at - b.at || a.wire.localeCompare(b.wire));
    const accumulation: Array<{ box: string; at: number; reason: "converges" | "ends-inside"; from?: string[] }> = [];
    for (const id of [...on].sort((a, b) => first(a) - first(b))) {
      const p = degree(preds, f.carrier, id), s = degree(succs, f.carrier, id);
      if (p >= 2 && s < p) accumulation.push({ box: id, at: first(id), reason: "converges", from: [...preds.get(f.carrier)!.get(id)!].sort() });
    }
    const last = f.path[f.path.length - 1];
    if (!degree(succs, f.carrier, last) && INSIDE.has(role.get(last)!) && !accumulation.some((a) => a.box === last)) {
      accumulation.push({ box: last, at: f.path.length - 1, reason: "ends-inside" });
    }
    const leaks = carried.filter((w) => on.has(w.from.box) && !on.has(w.to.box) && OUTSIDE.has(role.get(w.to.box)!))
      .map((w) => ({ box: w.from.box, wire: w.id, to: w.to.box })).sort((a, b) => a.wire.localeCompare(b.wire));
    const cycles: Array<{ box: string; cycle: string[]; basis: Theorem[] }> = [];
    const seen = new Map<string, number>();
    f.path.forEach((id, j) => {
      const i = seen.get(id);
      if (i !== undefined) cycles.push({ box: id, cycle: f.path.slice(i, j + 1), basis: LOOP });
      seen.set(id, j);
    });
    return {
      id: f.id,
      carrier: f.carrier,
      ...(f.medium !== undefined ? { medium: f.medium } : {}),
      path: f.path,
      steps,
      declaredOnly: steps.filter((s) => !s.functions.length).length,
      bottlenecks,
      accumulation,
      leaks,
      loops: cycles,
      harmLoops: loops.filter((l) => l.boxes.some((id) => on.has(id))).map((l) => ({ boxes: l.boxes, negative: l.negative, basis: LOOP })),
    };
  });
  return {
    ok: true as const,
    flows: analysed,
    note: flows.length
      ? "Bottlenecks, accumulation points, and leaks are structural candidates, not findings: name the mechanism and the evidence for each. Merge boxes consecutive on a flow with triz_transform merge (reading 'adjacent')."
      : "The model declares no flows. Add `flows`: each an ordered path of the boxes a carrier passes through, in series.",
  };
}
