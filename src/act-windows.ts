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
 *                  restricted too (restrict_rewrite in theory/CategoricalTriz.lean).
 *
 * Every view passes checkModel or the call fails closed. In theory/, the level axis is a presheaf,
 * and the subsystem and system rows with transitions are a functor from time × (box subsets)ᵒᵖ to
 * sets. The supersystem collapse is outside that functor and is not checked against transitions;
 * nothing here is a fibration (references/categorical-model.md).
 */
import { checkModel, harmLoops, idealityProfile, type FunctionModel } from "./act.js";
import { rewrite, type RewriteStep } from "./act-rewrite.js";
import type { Theorem } from "./act-basis.js";

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

function knownSet(model: FunctionModel, ids: string[], what: string): string[] {
  const known = new Set(model.boxes.map((b) => b.id));
  return [
    ...ids.filter((id) => !known.has(id)).map((id) => `${what}: unknown box '${id}'`),
    ...duplicates(ids).map((id) => `${what}: box '${id}' listed twice`),
    ...(ids.length ? [] : [`${what}: empty box set`]),
  ];
}

/** Sub-model on `boxes`; crossing wires become the boundary. Budget and contradictions are dropped (they describe the whole). */
export function restrict(model: FunctionModel, boxes: string[]) {
  const check = checkModel(model);
  const errors = check.ok ? knownSet(model, boxes, "restrict") : check.errors;
  if (errors.length) return { ok: false as const, errors };
  const keep = new Set(boxes);
  const inside = (w: Wire) => keep.has(w.from.box) && keep.has(w.to.box);
  const { budget: _budget, contradictions: _contradictions, ...rest } = model;
  const sub: FunctionModel = { ...rest, boxes: model.boxes.filter((b) => keep.has(b.id)), wires: model.wires.filter(inside) };
  return {
    ok: true as const,
    model: sub,
    boundary: {
      entering: model.wires.filter((w) => !keep.has(w.from.box) && keep.has(w.to.box)).map((w) => w.id),
      leaving: model.wires.filter((w) => keep.has(w.from.box) && !keep.has(w.to.box)).map((w) => w.id),
    },
    basis: RESTRICT,
  };
}

/**
 * Replace `group` by one black box. Each kept port is renamed `<box>.<port>`; a collision between
 * such names fails closed. The box's cost is the per-dimension sum over the group.
 */
export function collapse(model: FunctionModel, group: string[], box: { id: string; name: string; role: Box["role"]; action?: string }) {
  const check = checkModel(model);
  const errors = check.ok ? knownSet(model, group, "collapse") : check.errors;
  if (errors.length) return { ok: false as const, errors };
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
  if (clash.length) return { ok: false as const, errors: clash.map((id) => `collapse: port name '${id}' is ambiguous; rename the boxes or ports involved`) };
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
  const r = rewrite(model, {
    delete: { boxes: group, wires: touching.map((w) => w.id) },
    add: { boxes: [black], wires: crossing.map((w) => ({ ...w, from: redirect(w.from), to: redirect(w.to) })) },
  });
  if (!r.ok) return r;
  return {
    ok: true as const,
    model: r.model,
    hidden: hidden.map((w) => w.id),
    hiddenHarms: hidden.filter((w) => w.polarity === "harmful" || w.polarity === "excessive").map((w) => w.id),
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

/** What a transformation returns: a typed model, or the reasons it failed closed. */
export type Applied = { ok: true; model: FunctionModel; basis?: readonly Theorem[] } | { ok: false; errors: string[] };

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

/** Two models agree on boxes, wires, and carriers as data (array order ignored). */
function sameStructure(a: FunctionModel, b: FunctionModel) {
  const diff = { boxes: differing(a.boxes, b.boxes), wires: differing(a.wires, b.wires), carriers: differing(a.carriers, b.carriers) };
  return { same: !diff.boxes.length && !diff.wires.length && !diff.carriers.length, diff };
}

/** Boxes in `keep` and wires with both ends in it; unlike restrict, an empty or partial set is fine. */
function within(model: FunctionModel, keep: Set<string>): FunctionModel {
  const { budget: _budget, contradictions: _contradictions, ...rest } = model;
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
  const step: RewriteStep = {
    delete: { boxes: a.boxes.filter((x) => !keptBoxes.has(x.id)).map((x) => x.id), wires: a.wires.filter((w) => !keptWires.has(w.id)).map((w) => w.id) },
    add: { boxes: b.boxes.filter((x) => !keptBoxes.has(x.id)), wires: b.wires.filter((w) => !keptWires.has(w.id)) },
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
  const invalid = (errors: string[]) => ({ from, to, status: "invalid" as const, errors });
  const start = models[from];
  if (!start) return invalid([`${key}: no ${from} snapshot; transformations apply forward only`]);
  if (!apply) return invalid([`${key}: no transformation engine supplied`]);
  let model = start;
  const applied: { op: string; basis?: Theorem[] }[] = [];
  for (const [i, t] of seq.entries()) {
    const r = apply(model, t);
    if (!r.ok) return invalid(r.errors.map((e) => `${key}[${i}] ${t.op}: ${e}`));
    model = r.model;
    applied.push({ op: t.op, ...(r.basis ? { basis: [...r.basis] } : {}) });
  }
  const target = models[to];
  if (target) {
    const reach = sameStructure(model, target);
    if (!reach.same) {
      const where = Object.entries(reach.diff).filter(([, v]) => v.length).map(([k, v]) => `${k} [${v.join(", ")}]`);
      return invalid([`${key}: the transformations do not reach the ${to} snapshot; they differ at ${where.join("; ")}`]);
    }
  }
  const net = netStep(start, model);
  if (!net.ok) return invalid([`${key}: internal: the net step does not replay; please report`]);
  const sub = stepInSubsystem(start, model, net.step, keep);
  if (!sub) return invalid([`${key}: internal: restriction does not commute with the step; please report`]);
  return {
    from, to, status: "ok" as const,
    snapshot: target ? "reached" as const : "derived" as const,
    applied,
    step: ids(net.step),
    subsystem: sub,
    ...(target ? {} : { model }),
  };
}

/**
 * The 9-windows grid. `present` is required; `past` and `future` are optional snapshots with
 * stable box ids. `transitions` links them by transformation sequences, applied in order with
 * `apply` (triz_transform's operations at the tool boundary): `past_to_present` needs `past` and
 * must reach `present`; `present_to_future` must reach `future` if one is given, and otherwise
 * derives it. A sequence that fails, or that does not reach the snapshot (boxes, wires, and
 * carriers compared by id and content; array order ignored; other fields not compared), fails
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
}, apply?: (model: FunctionModel, t: T) => Applied) {
  const models: Partial<Record<Time, FunctionModel>> = { past: spec.past, present: spec.present, future: spec.future };
  const keep = new Set(spec.subsystem);
  const transitions = [];
  for (const [from, to, key] of LINKS) {
    const seq = spec.transitions?.[key];
    if (!seq) continue;
    const r = transition(models, from, to, key, seq, keep, apply);
    if (r.status === "ok" && r.model) models[to] = r.model;
    transitions.push(r);
  }

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
  const windows = TIMES.map((time) => {
    const m = models[time];
    if (!m) return { time, status: "missing" as const, prompt: `No ${time} snapshot: model the ${time} system with the same box ids, or give the transformations that lead to it, to fill this column.` };
    const check = checkModel(m);
    if (!check.ok) return { time, status: "invalid" as const, errors: check.errors };
    const present = new Set(m.boxes.map((b) => b.id));
    const zoom = spec.subsystem.filter((b) => present.has(b));
    const sub = zoom.length ? restrict(m, zoom) : null;
    const group = groupOf(m);
    const sup = group.length ? collapse(m, group, { id, name: spec.system?.name ?? m.system ?? "System", role: "tool" }) : null;
    if (sub && !sub.ok) return { time, status: "invalid" as const, errors: sub.errors };
    if (sup && !sup.ok) return { time, status: "invalid" as const, errors: sup.errors };
    return {
      time,
      status: "ok" as const,
      subsystem: sub?.ok
        ? { ...summary(sub.model), boundary: sub.boundary, absent: spec.subsystem.filter((b) => !present.has(b)), basis: sub.basis }
        : { empty: true, absent: spec.subsystem },
      system: summary(m),
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
    changes.push({
      from: TIMES[i] as Time, to: TIMES[i + 1] as Time,
      addedBoxes: [...after].filter((x) => !before.has(x)),
      removedBoxes: [...before].filter((x) => !after.has(x)),
    });
  }
  return {
    ok: windows.every((w) => w.status !== "invalid") && transitions.every((t) => t.status !== "invalid"),
    systemId: id,
    windows,
    changes,
    transitions,
    note: "Views are typed restrictions and collapses of each time's model. A transition given as transformations is applied and checked; between snapshots without one, only the box ids added and removed are listed. The supersystem collapse is not checked against transitions. Fill missing windows before drawing conclusions from the grid.",
  };
}
