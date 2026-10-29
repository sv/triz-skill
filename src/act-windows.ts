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
 *  - nineWindows — subsystem, system, and supersystem views for each time snapshot supplied
 *                  (past, present, future). The time axis is the snapshots the caller writes.
 *                  Nothing here computes a transition between them; between snapshots only the box
 *                  ids added and removed are listed.
 *
 * Every view passes checkModel or the call fails closed. Not a fibration: the categorical reading
 * of the system operator stays an analogy (references/categorical-model.md).
 */
import { checkModel, harmLoops, idealityProfile, type FunctionModel } from "./act.js";
import { rewrite } from "./act-rewrite.js";
import type { Theorem } from "./act-basis.js";

/** A restriction keeps typing, and zooming twice is zooming once. */
const RESTRICT: Theorem[] = ["typed_restrict", "restrict_restrict"];

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

function summary(m: FunctionModel) {
  const loops = harmLoops(m);
  return {
    boxes: m.boxes.map((b) => b.id),
    functions: idealityProfile(m).functions,
    harmLoops: loops.map((l) => ({ boxes: l.boxes, negative: l.negative })),
  };
}

/**
 * The 9-windows grid. `present` is required; `past` and `future` are optional snapshots with
 * stable box ids. `subsystem` names the boxes to zoom into (ids absent from a snapshot are listed,
 * not invented). The supersystem view collapses `system.boxes` (default: every tool and mediator
 * box) into one box, so the product and the environment stay visible across its boundary. The
 * collapsed box takes `system.id`; without one it takes 'system', or 'system-2', 'system-3', …
 * if a box left outside the collapse in any snapshot already uses that id. An explicit id that
 * collides still fails closed.
 */
export function nineWindows(spec: {
  present: FunctionModel; past?: FunctionModel; future?: FunctionModel;
  subsystem: string[];
  system?: { id?: string; name?: string; boxes?: string[] };
}) {
  const groupOf = (m: FunctionModel) => {
    const present = new Set(m.boxes.map((b) => b.id));
    return spec.system?.boxes?.filter((b) => present.has(b)) ?? m.boxes.filter((b) => b.role === "tool" || b.role === "mediator").map((b) => b.id);
  };
  const outside = new Set(TIMES.flatMap((t) => {
    const m = spec[t];
    if (!m) return [];
    const group = new Set(groupOf(m));
    return m.boxes.filter((b) => !group.has(b.id)).map((b) => b.id);
  }));
  let id = spec.system?.id ?? "system";
  for (let n = 2; spec.system?.id === undefined && outside.has(id); n++) id = `system-${n}`;
  const windows = TIMES.map((time) => {
    const m = spec[time];
    if (!m) return { time, status: "missing" as const, prompt: `No ${time} snapshot: model the ${time} system with the same box ids to fill this column.` };
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
    const [a, b] = [spec[TIMES[i]], spec[TIMES[i + 1]]];
    if (!a || !b) continue;
    const before = new Set(a.boxes.map((x) => x.id)), after = new Set(b.boxes.map((x) => x.id));
    changes.push({
      from: TIMES[i] as Time, to: TIMES[i + 1] as Time,
      addedBoxes: [...after].filter((x) => !before.has(x)),
      removedBoxes: [...before].filter((x) => !after.has(x)),
    });
  }
  return {
    ok: windows.every((w) => w.status !== "invalid"),
    systemId: id,
    windows,
    changes,
    note: "Views are typed restrictions and collapses of the snapshots you supply; no transition between times is computed. Fill missing windows before drawing conclusions from the grid.",
  };
}
