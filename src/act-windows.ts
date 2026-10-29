/**
 * System-operator (9 windows) views of a function model, as typed constructions on the level axis.
 *
 *  - restrict    — the subsystem view: the sub-model on a set of boxes. Wires crossing the set are
 *                  dropped and listed as its boundary. Restriction composes:
 *                  restrict(restrict(m, A), B) = restrict(m, B) when B ⊆ A.
 *  - collapse    — the supersystem view: a group of boxes becomes one black box. Its ports are the
 *                  group's ports that are unwired or carry a crossing function. Functions inside
 *                  the group are hidden and listed, harmful and excessive ones separately, so no
 *                  harm disappears without a trace.
 *  - nineWindows — subsystem, system, and supersystem views for past, present, and future. Each
 *                  later time is a snapshot the caller writes, or a transformation sequence applied
 *                  to the earlier snapshot, or both, in which case the sequence must reach the
 *                  snapshot. Each transition is reported as one net rewrite step and as its part
 *                  inside the subsystem; restriction commutes with every step once the step is
 *                  restricted too (restrict_rewrite in theory/CategoricalTriz.lean). When the
 *                  snapshots declare behaviour, feasibility, or flows, each time's system view
 *                  carries its verdicts, and each change between times says how they move.
 *
 * Every view passes checkModel or the call fails closed. In theory/, the level axis is a presheaf,
 * and the subsystem and system rows with transitions are a functor from time × (box subsets)ᵒᵖ to
 * sets. The supersystem collapse is outside that functor and is not checked against transitions;
 * nothing here is a fibration (references/categorical-model.md).
 */
import { checkModel, harmLoops, idealityProfile, type FunctionModel } from "./act.js";
import { internal, rewrite, type RewriteStep } from "./act-rewrite.js";
import { flowAnalysis, flowsThrough, mapFlows, restrictFlows } from "./act-flow.js";
import { compareBehavior, externalBehavior, weaknessRanking, type Acceptable } from "./act-behavior.js";
import { feasibility } from "./act-feasibility.js";
import type { Theorem } from "./act-basis.js";
import { at, fail, issue, quoted, rebase, second, unknownBox, type Failure, type Issue, type Reroot } from "./act-issues.js";

/** A restriction keeps typing. Each view zooms once, so restriction's composition laws are not cited. */
const RESTRICT: Theorem[] = ["typed_restrict"];
/** A step restricted to the subsystem commutes with restriction; its boundary changes by the crossing wires it cuts and adds. */
const STEP_IN_SUBSYSTEM: Theorem[] = ["restrict_rewrite", "boundary_rewrite"];

type Box = FunctionModel["boxes"][number];
type Wire = FunctionModel["wires"][number];
type Port = NonNullable<Box["inputs"]>[number];

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

/** A box-set argument at `root` names boxes of the model, once each, and at least one. */
function knownSet(model: FunctionModel, ids: string[], what: string, root: string): Issue[] {
  const known = new Set(model.boxes.map((b) => b.id));
  return [
    ...ids.flatMap((id, k) => (known.has(id) ? [] : [unknownBox(model, id, at(root, k), `${what}: `)])),
    ...duplicates(ids).map((id) => issue("listed-twice", at(root, second(ids, id)), `${what}: box '${id}' listed twice`, `List '${id}' once.`)),
    ...(ids.length ? [] : [issue("empty-set", root, `${what}: empty box set`, `Name at least one box: ${quoted(known)}.`)]),
  ];
}

/**
 * Sub-model on `boxes`; crossing wires become the boundary. Budget and contradictions are dropped
 * (they describe the whole). Each flow keeps its runs of consecutive boxes inside (restrictFlows);
 * flows that cross the boundary are listed in it. Issue paths: `$.model…` and `$.boxes[k]`.
 */
export function restrict(model: FunctionModel, boxes: string[]) {
  const check = checkModel(model, "$.model");
  const issues = check.ok ? knownSet(model, boxes, "restrict", "$.boxes") : check.issues;
  if (issues.length) return fail(issues);
  const keep = new Set(boxes);
  const inside = (w: Wire) => keep.has(w.from.box) && keep.has(w.to.box);
  const { budget: _budget, contradictions: _contradictions, flows: _flows, ...rest } = model;
  const cut = restrictFlows(model.flows, keep);
  const sub: FunctionModel = {
    ...rest, boxes: model.boxes.filter((b) => keep.has(b.id)), wires: model.wires.filter(inside),
    ...(model.flows ? { flows: cut.flows } : {}),
  };
  return {
    ok: true as const,
    model: sub,
    boundary: {
      entering: model.wires.filter((w) => !keep.has(w.from.box) && keep.has(w.to.box)).map((w) => w.id),
      leaving: model.wires.filter((w) => keep.has(w.from.box) && !keep.has(w.to.box)).map((w) => w.id),
      ...(cut.crossing.length ? { flows: cut.crossing } : {}),
    },
    basis: RESTRICT,
  };
}

/**
 * Replace `group` by one black box. Each kept port is renamed `<box>.<port>`; a collision between
 * such names fails closed. The box's cost is the per-dimension sum over the group. Each flow
 * through the group passes the black box instead, once per visit (mapFlows); a flow wholly inside
 * the group is hidden and listed. Issue paths: `$.model…`, `$.group[k]`, and `$.box` for the black box.
 */
export function collapse(model: FunctionModel, group: string[], box: { id: string; name: string; role: Box["role"]; action?: string }) {
  const check = checkModel(model, "$.model");
  const issues = check.ok ? knownSet(model, group, "collapse", "$.group") : check.issues;
  if (issues.length) return fail(issues);
  const members = new Set(group);
  const touching = model.wires.filter((w) => members.has(w.from.box) || members.has(w.to.box));
  const hidden = touching.filter((w) => members.has(w.from.box) && members.has(w.to.box));
  const crossing = touching.filter((w) => !hidden.includes(w));
  const used = new Set(crossing.flatMap((w) => [
    ...(members.has(w.from.box) ? [JSON.stringify([w.from.box, "out", w.from.port])] : []),
    ...(members.has(w.to.box) ? [JSON.stringify([w.to.box, "in", w.to.port])] : []),
  ]));
  const wired = new Set(touching.flatMap((w) => [JSON.stringify([w.from.box, "out", w.from.port]), JSON.stringify([w.to.box, "in", w.to.port])]));
  const name = (b: string, p: string) => `${b}.${p}`;
  const kept = (b: Box, side: "in" | "out", ports: Port[] | undefined) => (ports ?? [])
    .filter((p) => used.has(JSON.stringify([b.id, side, p.id])) || !wired.has(JSON.stringify([b.id, side, p.id])))
    .map((p) => ({ id: name(b.id, p.id), carrier: p.carrier, label: p.label ?? `${b.name}: ${p.id}` }));
  const groupBoxes = model.boxes.filter((b) => members.has(b.id));
  const inputs = groupBoxes.flatMap((b) => kept(b, "in", b.inputs)), outputs = groupBoxes.flatMap((b) => kept(b, "out", b.outputs));
  const clash = duplicates([...inputs, ...outputs].map((p) => p.id));
  if (clash.length) {
    return fail(clash.map((id) => issue("ambiguous-port-name", "$.group", `collapse: port name '${id}' is ambiguous; rename the boxes or ports involved`,
      `Kept ports are renamed '<box>.<port>', and two give '${id}': rename a box or port so the dotted names differ (box ids containing '.' are the usual cause).`)));
  }
  const total = new Map<string, number>();
  for (const b of groupBoxes) for (const [d, v] of Object.entries(b.cost ?? {})) total.set(d, (total.get(d) ?? 0) + v);
  const cost = Object.fromEntries(total);
  const black: Box = {
    id: box.id, name: box.name, role: box.role,
    ...(box.action !== undefined ? { action: box.action } : {}),
    ...(inputs.length ? { inputs } : {}),
    ...(outputs.length ? { outputs } : {}),
    ...(Object.keys(cost).length ? { cost } : {}),
  };
  const redirect = (e: Wire["from"]) => (members.has(e.box) ? { box: box.id, port: name(e.box, e.port) } : e);
  const through = flowsThrough(model.flows, members);
  const quotient = mapFlows(through, (id) => (members.has(id) ? box.id : id));
  const r = rewrite(model, {
    delete: { boxes: group, wires: touching.map((w) => w.id), flows: through.map((f) => f.id) },
    add: { boxes: [black], wires: crossing.map((w) => ({ ...w, from: redirect(w.from), to: redirect(w.to) })), flows: quotient.flows },
  });
  if (!r.ok) return internal(r, [["$.add.boxes[0].id", "$.box.id", "collapse"], ["$.add.boxes[0]", "$.box", "collapse"]]);
  return {
    ok: true as const,
    model: r.model,
    hidden: hidden.map((w) => w.id),
    hiddenHarms: hidden.filter((w) => w.polarity === "harmful" || w.polarity === "excessive").map((w) => w.id),
    ...(through.length ? { flows: { through: through.map((f) => f.id), hidden: quotient.gone } } : {}),
    basis: r.basis,
  };
}

const TIMES = ["past", "present", "future"] as const;
type Time = (typeof TIMES)[number];
const LINKS = [["past", "present", "past_to_present"], ["present", "future", "present_to_future"]] as const;

function summary(m: FunctionModel) {
  const loops = harmLoops(m);
  return {
    boxes: m.boxes.map((b) => b.id),
    functions: idealityProfile(m).functions,
    harmLoops: loops.map((l) => ({ boxes: l.boxes, negative: l.negative })),
  };
}

/**
 * What a transformation returns: a typed model, or the reasons it failed closed, with issue paths
 * `$.model…` for the model and `$.<field>` for the transformation's own fields.
 */
export type Applied = { ok: true; model: FunctionModel; basis?: readonly Theorem[] } | Failure;

/** Key-order-free JSON; lists of objects with ids are sorted by id, so port order does not count. */
function canon(x: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const xs = v.map(norm);
      const keyed = xs.every((y) => y && typeof y === "object" && typeof (y as { id?: unknown }).id === "string");
      return keyed ? [...xs].sort((a, b) => ((a as { id: string }).id < (b as { id: string }).id ? -1 : 1)) : xs;
    }
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(norm(x));
}

/** Ids whose element differs between `a` and `b`: missing from one side, or changed. */
function differing<X extends { id: string }>(a: X[], b: X[]): string[] {
  const ka = new Map(a.map((x) => [x.id, canon(x)])), kb = new Map(b.map((x) => [x.id, canon(x)]));
  return [...new Set([...ka.keys(), ...kb.keys()])].filter((id) => ka.get(id) !== kb.get(id)).sort();
}

/** Two models agree on boxes, wires, carriers, and flows as data (array order ignored). */
function sameStructure(a: FunctionModel, b: FunctionModel) {
  const diff = { boxes: differing(a.boxes, b.boxes), wires: differing(a.wires, b.wires), carriers: differing(a.carriers, b.carriers), flows: differing(a.flows ?? [], b.flows ?? []) };
  return { same: Object.values(diff).every((d) => !d.length), diff };
}

/**
 * Boxes in `keep` and wires with both ends in it; unlike restrict, an empty or partial set is fine.
 * Flows are dropped: the subsystem part of a step, and restrict_rewrite, concern boxes and wires.
 */
function within(model: FunctionModel, keep: Set<string>): FunctionModel {
  const { budget: _budget, contradictions: _contradictions, flows: _flows, ...rest } = model;
  return { ...rest, boxes: model.boxes.filter((b) => keep.has(b.id)), wires: model.wires.filter((w) => keep.has(w.from.box) && keep.has(w.to.box)) };
}

/**
 * The one delete-then-add step taking `a` to `b`. A box or wire whose content changes under the
 * same id is deleted and re-added, and so is every wire touching such a box (no dangling). The
 * step is replayed through `rewrite` to confirm it.
 */
function netStep(a: FunctionModel, b: FunctionModel) {
  const changedBoxes = new Set(differing(a.boxes, b.boxes));
  const keptBoxes = new Set(a.boxes.map((x) => x.id).filter((id) => !changedBoxes.has(id)));
  const changedWires = new Set(differing(a.wires, b.wires));
  const kept = (w: Wire) => !changedWires.has(w.id) && keptBoxes.has(w.from.box) && keptBoxes.has(w.to.box);
  const keptWires = new Set(a.wires.filter(kept).map((w) => w.id));
  const changedFlows = new Set(differing(a.flows ?? [], b.flows ?? []));
  const step: RewriteStep = {
    delete: {
      boxes: a.boxes.filter((x) => !keptBoxes.has(x.id)).map((x) => x.id), wires: a.wires.filter((w) => !keptWires.has(w.id)).map((w) => w.id),
      ...(changedFlows.size ? { flows: (a.flows ?? []).filter((f) => changedFlows.has(f.id)).map((f) => f.id) } : {}),
    },
    add: {
      boxes: b.boxes.filter((x) => !keptBoxes.has(x.id)), wires: b.wires.filter((w) => !keptWires.has(w.id)),
      ...(changedFlows.size ? { flows: (b.flows ?? []).filter((f) => changedFlows.has(f.id)) } : {}),
    },
  };
  const replay = rewrite(a, step);
  return replay.ok && sameStructure(replay.model, b).same ? { ok: true as const, step } : { ok: false as const };
}

const ids = (step: RewriteStep) => ({
  delete: { boxes: step.delete?.boxes ?? [], wires: step.delete?.wires ?? [] },
  add: { boxes: (step.add?.boxes ?? []).map((x) => x.id), wires: (step.add?.wires ?? []).map((w) => w.id) },
});

/**
 * A transition seen from the subsystem `keep`. The step's part inside the subsystem (boxes in it,
 * wires with both ends in it) takes the earlier subsystem view to the later one; that is checked
 * here (null if not) and proved as restrict_rewrite. The step equals that part exactly when it deletes and adds
 * nothing outside the subsystem. The boundary changes by the crossing wires the step cuts and adds.
 */
function stepInSubsystem(a: FunctionModel, b: FunctionModel, step: RewriteStep, keep: Set<string>) {
  const inside = (w: Wire) => keep.has(w.from.box) && keep.has(w.to.box);
  const crossing = (w: Wire) => keep.has(w.from.box) !== keep.has(w.to.box);
  const cut = new Set(step.delete?.wires ?? []);
  const cutWires = a.wires.filter((w) => cut.has(w.id));
  const added = step.add?.wires ?? [], newBoxes = step.add?.boxes ?? [];
  const part: RewriteStep = {
    delete: { boxes: (step.delete?.boxes ?? []).filter((x) => keep.has(x)), wires: cutWires.filter(inside).map((w) => w.id) },
    add: { boxes: newBoxes.filter((x) => keep.has(x.id)), wires: added.filter(inside) },
  };
  const later = rewrite(within(a, keep), part);
  if (!later.ok || !sameStructure(later.model, within(b, keep)).same) return null;
  const whole = canon(ids(step)) === canon(ids(part));
  return {
    step: ids(part),
    withinSubsystem: whole,
    interiorUnchanged: !Object.values(ids(part)).some((side) => side.boxes.length || side.wires.length),
    boundary: { cut: cutWires.filter(crossing).map((w) => w.id), added: added.filter(crossing).map((w) => w.id) },
    basis: whole ? [...STEP_IN_SUBSYSTEM, "restrict_rewrite_of_inside"] as Theorem[] : STEP_IN_SUBSYSTEM,
  };
}

/** Apply one link's transformations, check the target snapshot is reached, and report the step. */
function transition<T extends { op: string }>(
  models: Partial<Record<Time, FunctionModel>>, from: Time, to: Time, key: string, seq: T[], keep: Set<string>,
  apply?: (model: FunctionModel, t: T) => Applied,
) {
  const invalid = (issues: Issue[]) => ({ from, to, status: "invalid" as const, errors: issues.map((i) => i.message), issues });
  const root = `$.transitions.${key}`;
  const start = models[from];
  if (!start) {
    return invalid([issue("no-earlier-snapshot", root, `${key}: no ${from} snapshot; transformations apply forward only`,
      `Pass ${from}: the ${from} model with the same box ids, which the transformations start from. Or drop transitions.${key}.`)]);
  }
  if (!apply) return invalid([issue("internal-error", root, `${key}: no transformation engine supplied`, "Call nineWindows with triz_transform's operations (the tool does); this is a caller bug.")]);
  let model = start;
  const applied: { op: string; basis?: Theorem[] }[] = [];
  for (const [i, t] of seq.entries()) {
    const r = apply(model, t);
    if (!r.ok) {
      // Step 0 acts on the input snapshot; later steps act on a model no input holds, so point at the step.
      const step = at(root, i);
      const rules: Reroot = [i === 0 ? ["$.model", `$.${from}`] : ["$.model", step, "collapse"], ["$", step]];
      return invalid(rebase(r, rules, `${key}[${i}] ${t.op}: `).issues);
    }
    model = r.model;
    applied.push({ op: t.op, ...(r.basis ? { basis: [...r.basis] } : {}) });
  }
  const target = models[to];
  if (target) {
    const reach = sameStructure(model, target);
    if (!reach.same) {
      const where = Object.entries(reach.diff).filter(([, v]) => v.length).map(([k, v]) => `${k} [${v.join(", ")}]`);
      return invalid([issue("snapshot-not-reached", `$.${to}`, `${key}: the transformations do not reach the ${to} snapshot; they differ at ${where.join("; ")}`,
        `Make transitions.${key} produce exactly the ${to} snapshot at those ids (boxes, wires, and carriers are compared by id and content), or correct the snapshot.${to === "future" ? " Omit future to derive it from the transformations instead." : ""}`)]);
    }
  }
  const net = netStep(start, model);
  if (!net.ok) return invalid([issue("internal-error", root, `${key}: internal: the net step does not replay; please report`, "Report this with the input; the snapshots themselves may be fine.")]);
  const sub = stepInSubsystem(start, model, net.step, keep);
  if (!sub) return invalid([issue("internal-error", root, `${key}: internal: restriction does not commute with the step; please report`, "Report this with the input; the snapshots themselves may be fine.")]);
  const flowsChanged = differing(start.flows ?? [], model.flows ?? []);
  return {
    from, to, status: "ok" as const,
    snapshot: target ? "reached" as const : "derived" as const,
    applied,
    step: ids(net.step),
    ...(flowsChanged.length ? { flowsChanged } : {}),
    subsystem: sub,
    model,
  };
}

/**
 * A failure kept inside one verdict: it never fails the grid. Its issues are re-rooted from the
 * kernel call's paths to the grid's input by `rules`; anything left over points at the grid.
 */
const failed = (r: Failure, rules: Reroot = []) => {
  const f = rebase(fail(r.issues), [...rules, ["$", "$", "collapse"]]);
  return { ok: false as const, errors: f.errors, issues: f.issues };
};

/** The system view's behaviour at one time: decided or why not, and the size of the relation. */
function behaviourAt(m: FunctionModel, rules: Reroot = []) {
  const r = externalBehavior(m);
  if (!r.ok) return failed(r, rules);
  if (!r.decided) return { ok: true as const, decided: false as const, reason: "missing-behavior" as const, missingBehavior: r.missingBehavior };
  return { ok: true as const, decided: true as const, inputValuations: r.inputValuations, noSteadyState: r.noSteadyState.length, severalSteadyStates: r.severalSteadyStates, basis: r.basis };
}

/** The system view's feasibility at one time: the verdict, its reason, and the minimal resource vectors. */
function feasibilityAt(m: FunctionModel, rules: Reroot = []) {
  const r = feasibility(m);
  if (!r.ok) return failed(r, rules);
  return {
    ok: true as const, verdict: r.verdict,
    ...("reason" in r ? { reason: r.reason } : {}),
    ...("minimal" in r ? { minimal: r.minimal.map((v) => v.resources), minimalCount: r.minimalCount } : {}),
    ...("binding" in r ? { binding: r.binding } : {}),
    ...("basis" in r ? { basis: r.basis } : {}),
  };
}

/** The system view's flows at one time: each flow's path and its triz_flow candidates, by id. */
function flowsAt(m: FunctionModel, rules: Reroot = []) {
  const r = flowAnalysis(m);
  if (!r.ok) return failed(r, rules);
  return {
    ok: true as const,
    flows: r.flows.map((f) => ({
      id: f.id, path: f.path,
      bottlenecks: f.bottlenecks.map((b) => b.wire), accumulation: f.accumulation.map((a) => a.box),
      leaks: f.leaks.map((l) => l.wire), loops: f.loops.length,
    })),
  };
}

/** How the flows change between two times: added, removed, re-routed, and the candidates each flow gains or loses. */
function flowDelta(a: FunctionModel, b: FunctionModel, rules: [Reroot, Reroot]) {
  const [x, y] = [flowsAt(a, rules[0]), flowsAt(b, rules[1])];
  if (!x.ok) return x;
  if (!y.ok) return y;
  const before = new Map(x.flows.map((f) => [f.id, f])), after = new Map(y.flows.map((f) => [f.id, f]));
  const minus = (p: string[], q: string[]) => p.filter((v) => !q.includes(v));
  const both = [...before.keys()].filter((id) => after.has(id));
  const candidates = both.flatMap((id) => {
    const [f, g] = [before.get(id)!, after.get(id)!];
    const d = (k: "bottlenecks" | "accumulation" | "leaks") => ({ gone: minus(f[k], g[k]), new: minus(g[k], f[k]) });
    const out = { bottlenecks: d("bottlenecks"), accumulation: d("accumulation"), leaks: d("leaks") };
    return Object.values(out).some((v) => v.gone.length || v.new.length) ? [{ flow: id, ...out }] : [];
  });
  return {
    ok: true as const,
    added: [...after.keys()].filter((id) => !before.has(id)),
    removed: [...before.keys()].filter((id) => !after.has(id)),
    rerouted: both.filter((id) => JSON.stringify(before.get(id)!.path) !== JSON.stringify(after.get(id)!.path)),
    candidates,
  };
}

const decidedFeasibility = (v: ReturnType<typeof feasibilityAt>) => v.ok && (v.verdict === "feasible" || v.verdict === "infeasible");
const canonVectors = (v: ReturnType<typeof feasibilityAt>) => (v.ok && "minimal" in v ? (v.minimal ?? []).map((x) => canon(x)).sort().join("|") : "");

/**
 * What changes between two times at the system level, beyond structure. Behaviour: the later
 * model compared with the earlier one (compareBehavior: preserved, changed with a counterexample,
 * or undecided). Weakness: the two times ranked as concepts by the situations they admit, with
 * `acceptable`. Feasibility: the verdicts at both times, and changed only when both are decided.
 * A failure (say, different deliverables for the ranking) is reported here and does not fail the grid.
 */
function verdictDelta(a: FunctionModel, b: FunctionModel, from: Time, to: Time, what: { behavior: boolean; feasibility: boolean; flows: boolean }, acceptable: Acceptable[] | undefined, rootOf: (time: Time, path: string) => Reroot[number]) {
  const out: Record<string, unknown> = {};
  if (what.behavior) {
    const c = compareBehavior(a, b);
    out.behavior = !c.ok ? failed(c, [rootOf(from, "$.compare_to"), rootOf(to, "$.model")]) : {
      ok: true as const, verdict: c.verdict,
      ...("reason" in c ? { reason: c.reason } : {}),
      ...("direction" in c ? { direction: c.direction, counterexample: c.counterexample } : {}),
      ...("lostDeliverables" in c ? { lostDeliverables: c.lostDeliverables } : {}),
      ...("missingBehavior" in c ? { missingBehavior: c.missingBehavior } : {}),
      gainedDeliverables: c.gainedDeliverables,
      note: c.verdict === "preserved" ? `The ${to} model has the ${from} model's input→deliverable relation.`
        : c.verdict === "changed" ? `The input→deliverable relation changes from ${from} to ${to}${"direction" in c ? ` (${c.direction}, as baseline ${from} and concept ${to})` : ": a deliverable is lost"}.`
        : `Undecided between ${from} and ${to}: ${"reason" in c ? c.reason : "see the comparison"}.`,
    };
    if (acceptable) {
      const w = weaknessRanking([{ id: from, model: a }, { id: to, model: b }], acceptable);
      out.weakness = !w.ok ? failed(w, [rootOf(from, "$.concepts[0].model"), rootOf(to, "$.concepts[1].model"), ["$.acceptable", "$.acceptable"]]) : w.verdict !== "ranked" ? { ok: true as const, verdict: w.verdict, ...("reason" in w ? { reason: w.reason } : {}) } : {
        ok: true as const, verdict: w.verdict, order: w.pairs[0].order,
        admitted: Object.fromEntries(w.concepts.map((c) => [c.id, c.admitted])), situationCount: w.situationCount,
        ...("onlyFirst" in w.pairs[0] ? { [`only${from[0].toUpperCase()}${from.slice(1)}`]: w.pairs[0].onlyFirst } : {}),
        ...("onlySecond" in w.pairs[0] ? { [`only${to[0].toUpperCase()}${to.slice(1)}`]: w.pairs[0].onlySecond } : {}),
        ...("basis" in w.pairs[0] ? { basis: w.pairs[0].basis } : {}),
        note: w.pairs[0].order === "equal" ? `The ${from} and ${to} models admit the same situations.`
          : w.pairs[0].order === "first-weaker" ? `The ${from} model admits every situation the ${to} model admits, and more: the ${to} model is less robust.`
          : w.pairs[0].order === "second-weaker" ? `The ${to} model admits every situation the ${from} model admits, and more.`
          : `Neither time admits every situation the other does: each admits one the other rejects.`,
      };
    } else out.weakness = { prompt: "Pass acceptable (per deliverable port or carrier: values, or a threshold through the carrier's levels) to rank the times by the situations they admit." };
  }
  if (what.flows) out.flows = flowDelta(a, b, [[rootOf(from, "$.model")], [rootOf(to, "$.model")]]);
  if (what.feasibility) {
    const [x, y] = [feasibilityAt(a, [rootOf(from, "$.model")]), feasibilityAt(b, [rootOf(to, "$.model")])];
    const decided = decidedFeasibility(x) && decidedFeasibility(y);
    const verdictOf = (v: typeof x) => (v.ok ? v.verdict : "error");
    out.feasibility = {
      [from]: x, [to]: y,
      changed: decided ? verdictOf(x) !== verdictOf(y) : null,
      ...(decided && verdictOf(x) === verdictOf(y) ? { resourcesChanged: canonVectors(x) !== canonVectors(y) } : {}),
      note: decided
        ? (verdictOf(x) !== verdictOf(y) ? `Feasibility changes from ${verdictOf(x)} (${from}) to ${verdictOf(y)} (${to}).` : `Feasibility stays ${verdictOf(x)}${canonVectors(x) !== canonVectors(y) ? ", with different minimal resource vectors" : ""}.`)
        : "Not both decided, so no change is claimed: see each time's verdict and reason.",
    };
  }
  return out;
}

/**
 * The 9-windows grid. `present` is required; `past` and `future` are optional snapshots with
 * stable box ids. `transitions` links them by transformation sequences, applied in order with
 * `apply` (triz_transform's operations at the tool boundary): `past_to_present` needs `past` and
 * must reach `present`; `present_to_future` must reach `future` if one is given, and otherwise
 * derives it. A sequence that fails, or that does not reach the snapshot (boxes, wires, carriers,
 * and flows compared by id and content; array order ignored; other fields not compared), fails
 * closed. Each transition is reported as one net step and as its part inside the subsystem.
 *
 * `subsystem` names the boxes to zoom into (ids absent from a snapshot are listed, not invented).
 * The supersystem view collapses `system.boxes` (default: every tool and mediator box) into one
 * box, so the product and the environment stay visible across its boundary. The collapsed box
 * takes `system.id`; without one it takes 'system', or 'system-2', 'system-3', … if a box left
 * outside the collapse in any snapshot already uses that id. An explicit id that collides still
 * fails closed.
 */
export function nineWindows<T extends { op: string }>(spec: {
  present: FunctionModel; past?: FunctionModel; future?: FunctionModel;
  subsystem: string[];
  system?: { id?: string; name?: string; boxes?: string[] };
  transitions?: { past_to_present?: T[]; present_to_future?: T[] };
  acceptable?: Acceptable[];
}, apply?: (model: FunctionModel, t: T) => Applied) {
  const models: Partial<Record<Time, FunctionModel>> = { past: spec.past, present: spec.present, future: spec.future };
  const keep = new Set(spec.subsystem);
  const transitions = [];
  /** The model each transition produced, by the time it leads to; a time with no snapshot takes it. */
  const derived: Partial<Record<Time, FunctionModel>> = {};
  for (const [from, to, key] of LINKS) {
    const seq = spec.transitions?.[key];
    if (!seq) continue;
    const r = transition(models, from, to, key, seq, keep, apply);
    if (r.status === "ok") {
      derived[to] = r.model;
      if (r.snapshot === "derived") models[to] = r.model;
    }
    transitions.push(r.status === "ok" && r.snapshot === "reached" ? (({ model: _model, ...rest }) => rest)(r) : r);
  }
  /** Where a time's model is in the input: its snapshot, or the transition that derived it. */
  const source = (time: Time) => (spec[time] ? `$.${time}` : `$.transitions.${time === "future" ? "present_to_future" : "past_to_present"}`);
  /** A kernel path to a time's model, re-rooted to its source; a derived model is not input, so its paths collapse. */
  const rootOf = (time: Time, from: string): Reroot[number] => (spec[time] ? [from, source(time)] : [from, source(time), "collapse"]);
  const windowIssues = (time: Time, f: Failure) => rebase(f, [
    rootOf(time, "$.model"),
    ["$.boxes", "$.subsystem", "collapse"], ["$.group", "$.system.boxes", "collapse"], ["$.box", "$.system"],
  ]);

  const groupOf = (m: FunctionModel) => {
    const present = new Set(m.boxes.map((b) => b.id));
    return spec.system?.boxes?.filter((b) => present.has(b)) ?? m.boxes.filter((b) => b.role === "tool" || b.role === "mediator").map((b) => b.id);
  };
  const outside = new Set(TIMES.flatMap((t) => {
    const m = models[t];
    if (!m) return [];
    const group = new Set(groupOf(m));
    return m.boxes.filter((b) => !group.has(b.id)).map((b) => b.id);
  }));
  let id = spec.system?.id ?? "system";
  for (let n = 2; spec.system?.id === undefined && outside.has(id); n++) id = `system-${n}`;
  const declared = (pick: (b: FunctionModel["boxes"][number]) => unknown) => TIMES.some((t) => models[t]?.boxes.some((b) => pick(b) !== undefined));
  const what = { behavior: declared((b) => b.behavior), feasibility: declared((b) => b.feasibility), flows: TIMES.some((t) => (models[t]?.flows ?? []).length > 0) };
  const any = what.behavior || what.feasibility || what.flows;
  const verdictsAt = (m: FunctionModel, time: Time) => ({
    ...(what.behavior ? { behavior: behaviourAt(m, [rootOf(time, "$.model")]) } : {}),
    ...(what.feasibility ? { feasibility: feasibilityAt(m, [rootOf(time, "$.model")]) } : {}),
    ...(what.flows ? { flows: flowsAt(m, [rootOf(time, "$.model")]) } : {}),
  });
  const windows = TIMES.map((time) => {
    const m = models[time];
    if (!m) return { time, status: "missing" as const, prompt: `No ${time} snapshot: model the ${time} system with the same box ids, or give the transformations that lead to it, to fill this column.` };
    const invalid = (f: Failure) => {
      const r = windowIssues(time, f);
      return { time, status: "invalid" as const, errors: r.errors, issues: r.issues };
    };
    const check = checkModel(m, "$.model");
    if (!check.ok) return invalid(fail(check.issues));
    const present = new Set(m.boxes.map((b) => b.id));
    const zoom = spec.subsystem.filter((b) => present.has(b));
    const sub = zoom.length ? restrict(m, zoom) : null;
    const group = groupOf(m);
    const sup = group.length ? collapse(m, group, { id, name: spec.system?.name ?? m.system ?? "System", role: "tool" }) : null;
    if (sub && !sub.ok) return invalid(sub);
    if (sup && !sup.ok) return invalid(sup);
    return {
      time,
      status: "ok" as const,
      subsystem: sub?.ok
        ? { ...summary(sub.model), boundary: sub.boundary, absent: spec.subsystem.filter((b) => !present.has(b)), basis: sub.basis }
        : { empty: true, absent: spec.subsystem },
      system: { ...summary(m), ...(any ? { verdicts: verdictsAt(m, time) } : {}) },
      supersystem: sup?.ok
        ? { ...summary(sup.model), collapsed: group, hidden: sup.hidden, hiddenHarms: sup.hiddenHarms, model: sup.model, basis: sup.basis }
        : { empty: true, reason: "no box to collapse into the system" },
    };
  });
  const changes = [];
  for (let i = 0; i + 1 < TIMES.length; i++) {
    const [a, b] = [models[TIMES[i]], models[TIMES[i + 1]]];
    if (!a || !b) continue;
    const before = new Set(a.boxes.map((x) => x.id)), after = new Set(b.boxes.map((x) => x.id));
    const typed = checkModel(a).ok && checkModel(b).ok;
    changes.push({
      from: TIMES[i] as Time, to: TIMES[i + 1] as Time,
      addedBoxes: [...after].filter((x) => !before.has(x)),
      removedBoxes: [...before].filter((x) => !after.has(x)),
      ...(typed && any ? { verdicts: verdictDelta(a, b, TIMES[i], TIMES[i + 1], what, spec.acceptable, rootOf) } : {}),
    });
  }
  const issues = [...transitions, ...windows].flatMap((x) => (x.status === "invalid" ? x.issues : []));
  return {
    ok: !issues.length,
    ...(issues.length ? { errors: issues.map((i) => i.message), issues } : {}),
    systemId: id,
    windows,
    changes,
    transitions,
    ...(Object.keys(derived).length ? { derived } : {}),
    note: "Views are typed restrictions and collapses of each time's model. A transition given as transformations is applied and checked; between snapshots without one, only the box ids added and removed are listed. derived holds the model each transition produced, by time: a derived future is that column's model, and a reached snapshot equals it up to order. The supersystem collapse is not checked against transitions. Fill missing windows before drawing conclusions from the grid."
      + (what.behavior || what.feasibility
        ? " The snapshots declare rows, so each time's system view carries its behaviour and feasibility verdicts (system.verdicts), and each change between times says how they change (changes[].verdicts). These are computed on the system view only: restriction drops the budget and cuts the deliverables' suppliers, and the collapsed box declares no rows."
        : "")
      + (what.flows
        ? " The snapshots declare flows, so each time's system view carries each flow's triz_flow candidates (system.verdicts.flows), and each change lists the flows added, removed, and re-routed and the candidates each flow gains or loses (changes[].verdicts.flows)."
        : ""),
  };
}
