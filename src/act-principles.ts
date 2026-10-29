/**
 * Principle constructions beyond Segmentation, Taking out, and Intermediary (src/act-rewrite.ts).
 * Each is one rewrite at an occurrence named by id, so every result passes checkModel or the call
 * fails closed. The principle texts below are quoted from data/principles.json.
 *
 *  - merge      — collapse boxes that are adjacent (joined by functions) or identical (same role
 *                 and the same carriers on each side) into one box. The move is `collapse`.
 *                 Principle 5 reads "Bring identical or adjacent operations together in space or time".
 *  - rerate     — rate a useful function insufficient or excessive, or change the level of a
 *                 function on a cycle.
 *                 Principle 16 reads "If the full action is difficult, do slightly less or slightly more".
 *                 Principle 23 reads "... change the magnitude and influence of existing feedback".
 *  - feedback   — add a function whose object already reaches its performer, so it closes a loop.
 *                 Principle 23 reads "Introduce feedback, ...".
 *  - retarget   — send a harmful function's factor to another input port, as a useful function.
 *                 Principle 22 reads "Use a harmful factor to achieve a positive effect".
 *  - reverse    — swap a function's performer and object.
 *                 Principle 13 reads "Invert the action; make movable parts fixed and fixed parts movable".
 *  - standby    — add an unwired box that is a typed absorber of every function a box performs.
 *                 Principle 11 reads "Prepare emergency means beforehand to offset low reliability".
 *  - cheapCopy  — replace a box by one with the same ports and a componentwise lower cost.
 *                 Principle 26 reads "Use inexpensive copies instead of an unavailable, expensive, or fragile original".
 *                 Principle 27 reads "Replace an expensive durable object with inexpensive short-lived ones".
 *
 * Principles 6 and 25 need no code here. Principle 6 ("Make an object perform multiple functions
 * and eliminate other parts") is `applyTrim` with every function absorbed by one box. Principle 25
 * ("Make an object serve or repair itself") is `applyTrim` with a rule-B absorber.
 *
 * A construction makes the structural part of a principle checkable. It does not show that the
 * principle solves anything.
 */
import { checkModel, harmLoops, shortestPath, trimCandidates, type FunctionModel, type Polarity } from "./act.js";
import { rewrite, type RewriteStep } from "./act-rewrite.js";
import { collapse } from "./act-windows.js";
import { flowsThrough, mapFlows, stepsOf } from "./act-flow.js";
import type { Theorem } from "./act-basis.js";

type Box = FunctionModel["boxes"][number];
type Wire = FunctionModel["wires"][number];
type Endpoint = Wire["from"];
type Failure = { ok: false; errors: string[] };

const LEVELS: ReadonlySet<Polarity> = new Set(["useful", "insufficient", "excessive"]);
const fail = (...errors: string[]): Failure => ({ ok: false, errors });
const typed = (model: FunctionModel): Failure | null => {
  const check = checkModel(model);
  return check.ok ? null : fail(...check.errors);
};

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

/** Box → sorted successor boxes, as harmLoops builds it. */
function successors(model: FunctionModel): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const w of model.wires) {
    const list = adj.get(w.from.box) ?? adj.set(w.from.box, []).get(w.from.box)!;
    if (!list.includes(w.to.box)) list.push(w.to.box);
  }
  for (const list of adj.values()) list.sort();
  return adj;
}

/** A cycle through wire u → v: (u, v, …, u), or [] when v does not reach u. */
function cycleThrough(model: FunctionModel, w: Wire): string[] {
  const back = shortestPath(w.to.box, w.from.box, successors(model), new Set(model.boxes.map((b) => b.id)));
  return back.length ? [w.from.box, ...back] : [];
}

/**
 * The inverse of a `replace` step, as a step on its result: delete the same ids and add back the
 * original boxes and wires.
 */
function restore(model: FunctionModel, step: RewriteStep): RewriteStep {
  const boxes = new Set(step.delete?.boxes ?? []), wires = new Set(step.delete?.wires ?? []);
  return {
    delete: { boxes: [...boxes], wires: [...wires] },
    add: { boxes: model.boxes.filter((b) => boxes.has(b.id)), wires: model.wires.filter((w) => wires.has(w.id)) },
  };
}

/** Negative functions that lie on a harm loop. */
const looped = (model: FunctionModel) => new Set(harmLoops(model).flatMap((l) => l.negative));

/**
 * A rewrite that replaces boxes and wires in place by id: each replaced box goes with every wire
 * touching it, and those wires come back (replaced where `wires` names them).
 */
function replace(model: FunctionModel, spec: { boxes?: Box[]; wires?: Wire[] }): RewriteStep {
  const boxIds = new Set((spec.boxes ?? []).map((b) => b.id));
  const byId = new Map((spec.wires ?? []).map((w) => [w.id, w]));
  const moved = model.wires.filter((w) => byId.has(w.id) || boxIds.has(w.from.box) || boxIds.has(w.to.box));
  return {
    delete: { boxes: [...boxIds], wires: moved.map((w) => w.id) },
    add: { boxes: spec.boxes ?? [], wires: moved.map((w) => byId.get(w.id) ?? w) },
  };
}

/**
 * Principle 5 (Merging), structural part: `collapse` the boxes into one box. Reading 'adjacent'
 * (default) requires the group to be joined, ignoring direction, by functions inside it or by
 * steps of a declared flow inside it: two boxes one after the other on a flow are adjacent even
 * when neither acts on the other. Boxes on one flow with a box outside the group between them are
 * not: merging them would close a loop in the flow. Reading 'identical' requires the same role and
 * the same multiset of carriers on each side; names and actions are labels and are not compared.
 * Every path between boxes maps to a path between their images, and every flow passes the merged
 * box where it passed the group (flow_merge_reach), but merging can close new loops: negative
 * functions newly on a harm loop are listed, flows whose merged path newly recurs to the merged box
 * are listed, and functions inside the group are hidden and listed, as are flows wholly inside it.
 * The merged box declares no behavior, so the boxes whose declared behavior it drops are listed
 * too. There is no box map: the merged ports are renamed '<box>.<port>', so a merged product's
 * deliverables get new keys whatever box id a map names, and compare_to reads them as lost and
 * regained. "In space or time" is not modelled.
 */
export function merge(model: FunctionModel, spec: {
  boxes: string[]; into: { id: string; name: string; role?: Box["role"]; action?: string }; reading?: "adjacent" | "identical";
}) {
  const bad = typed(model);
  if (bad) return bad;
  const byId = new Map(model.boxes.map((b) => [b.id, b]));
  const errors = [
    ...spec.boxes.filter((id) => !byId.has(id)).map((id) => `unknown box '${id}'`),
    ...duplicates(spec.boxes).map((id) => `box '${id}' listed twice`),
    ...(spec.boxes.length < 2 ? ["merging needs at least two boxes"] : []),
  ];
  if (errors.length) return fail(...errors);
  const reading = spec.reading ?? "adjacent";
  const group = spec.boxes.map((id) => byId.get(id)!);
  if (reading === "identical") {
    const carriers = (ports: Box["inputs"]) => (ports ?? []).map((p) => p.carrier).sort();
    const shape = (b: Box) => JSON.stringify([b.role, carriers(b.inputs), carriers(b.outputs)]);
    const differ = group.filter((b) => shape(b) !== shape(group[0])).map((b) => b.id);
    if (differ.length) return fail(`boxes [${differ.join(", ")}] differ from '${group[0].id}' in role or port carriers: not identical`);
  } else {
    const members = new Set(spec.boxes), seen = new Set([spec.boxes[0]]), queue = [spec.boxes[0]];
    const links = [
      ...model.wires.map((w) => [w.from.box, w.to.box] as const),
      ...(model.flows ?? []).flatMap((f) => stepsOf(f.path)),
    ].filter(([a, b]) => members.has(a) && members.has(b));
    for (let v = queue.shift(); v !== undefined; v = queue.shift()) {
      for (const [a, b] of links) {
        const next = a === v ? b : b === v ? a : undefined;
        if (next !== undefined && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    const apart = spec.boxes.filter((id) => !seen.has(id));
    if (apart.length) {
      const gaps = apart.flatMap((id) => {
        for (const f of model.flows ?? []) {
          const at = f.path.flatMap((x, i) => (x === id ? [i] : [])), near = f.path.flatMap((x, i) => (seen.has(x) ? [i] : []));
          const pairs = at.flatMap((i) => near.map((j) => [Math.min(i, j), Math.max(i, j)] as const)).sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
          if (pairs.length) {
            const [i, j] = pairs[0];
            return [`on flow '${f.id}', '${f.path[i]}' and '${f.path[j]}' have [${f.path.slice(i + 1, j).join(", ")}] between them, so merging them would close a loop in the flow`];
          }
        }
        return [];
      });
      return fail(`boxes [${apart.join(", ")}] are not joined to '${spec.boxes[0]}' by functions inside the group or by consecutive positions on a flow: not adjacent (reading 'identical' merges unjoined boxes of the same shape)`, ...gaps);
    }
  }
  const roles = [...new Set(group.map((b) => b.role))];
  const role = spec.into.role ?? (roles.length === 1 ? roles[0] : undefined);
  if (!role) return fail(`the boxes have roles [${roles.join(", ")}]: give into.role`);
  const c = collapse(model, spec.boxes, { ...spec.into, role });
  if (!c.ok) return c;
  const before = looped(model);
  const members = new Set(spec.boxes);
  const through = flowsThrough(model.flows, members);
  const merged = mapFlows(through, (id) => (members.has(id) ? spec.into.id : id));
  // A merged path recurs to the merged box more often than the path recurred to any one member: the merge closed that loop.
  const count = (path: string[], id: string) => path.filter((x) => x === id).length;
  const newlyLoopedFlows = merged.flows.filter((f) => {
    const original = through.find((g) => g.id === f.id)!;
    return count(f.path, spec.into.id) > Math.max(...spec.boxes.map((id) => count(original.path, id)));
  }).map((f) => f.id).sort();
  return {
    ok: true as const,
    model: c.model,
    reading,
    hidden: c.hidden,
    hiddenHarms: c.hiddenHarms,
    newlyLooped: [...looped(c.model)].filter((id) => !before.has(id)).sort(),
    ...(through.length ? {
      flows: {
        paths: Object.fromEntries(merged.flows.map((f) => [f.id, f.path])),
        hidden: merged.gone,
        newlyLooped: newlyLoopedFlows,
        basis: ["flow_merge_typed", "flow_merge_reach"] as Theorem[],
      },
    } : {}),
    droppedBehavior: group.filter((b) => b.behavior).map((b) => b.id),
    deliverableKeysChanged: group.some((b) => b.role === "product"),
    basis: [...c.basis, "reach_quotient"] as Theorem[],
    note: group.some((b) => b.role === "product")
      ? "Merged ports are renamed '<box>.<port>', so compare_to reads the merged product's deliverables as lost and regained, and no box_map recovers them: merge non-product boxes, or compare the deliverables by hand. Substantiate that the merged box can really perform every operation."
      : "Merged ports are renamed '<box>.<port>'; no product box is merged, so deliverables keep their keys. Functions inside the group are hidden, and newlyLooped lists harms the merge closes into a loop: substantiate that the merged box can really perform every operation.",
  };
}

/**
 * Principle 16 (reading 'partial'): a useful function is rated insufficient or excessive.
 * Principle 23 (reading 'feedback'): a function on a cycle changes level among useful,
 * insufficient, and excessive. Either way the function keeps its ports, so typing and deliverables
 * are unchanged. Rating changes never change which boxes share a cycle, so the harm loops created
 * and removed are exactly the cycles that gain their first or lose their last negative function.
 * `cost` replaces the performing box's cost: what doing less or more saves.
 */
export function rerate(model: FunctionModel, spec: {
  wire: string; polarity: Polarity; reading?: "partial" | "feedback"; cost?: Record<string, number>;
}) {
  const bad = typed(model);
  if (bad) return bad;
  const w = model.wires.find((x) => x.id === spec.wire);
  if (!w) return fail(`unknown wire '${spec.wire}'`);
  const reading = spec.reading ?? "partial";
  const cycle = cycleThrough(model, w);
  if (reading === "partial") {
    if (w.polarity !== "useful") return fail(`function '${w.id}' is rated '${w.polarity}', not useful: the full action to do less or more of is a useful one`);
    if (spec.polarity !== "insufficient" && spec.polarity !== "excessive") return fail(`reading 'partial' rates the function 'insufficient' (slightly less) or 'excessive' (slightly more), not '${spec.polarity}'`);
  } else {
    if (!LEVELS.has(w.polarity) || !LEVELS.has(spec.polarity)) return fail(`reading 'feedback' changes the level of a useful function (useful, insufficient, excessive); '${w.polarity}' to '${spec.polarity}' is not such a change`);
    if (w.polarity === spec.polarity) return fail(`function '${w.id}' is already rated '${spec.polarity}'`);
    if (!cycle.length) return fail(`function '${w.id}' lies on no cycle ('${w.to.box}' does not reach '${w.from.box}'): it is not feedback`);
  }
  const performer = model.boxes.find((b) => b.id === w.from.box)!;
  const r = rewrite(model, replace(model, {
    boxes: spec.cost ? [{ ...performer, cost: spec.cost }] : [],
    wires: [{ ...w, polarity: spec.polarity }],
  }));
  if (!r.ok) return r;
  const key = (l: { boxes: string[] }) => JSON.stringify(l.boxes);
  const was = harmLoops(model), now = harmLoops(r.model);
  const created = now.filter((l) => !was.some((x) => key(x) === key(l))).map((l) => l.boxes);
  const removed = was.filter((l) => !now.some((x) => key(x) === key(l))).map((l) => l.boxes);
  return {
    ok: true as const,
    model: r.model,
    reading,
    ...(cycle.length ? { cycle } : {}),
    harmLoops: { created, removed },
    basis: [...r.basis, ...(cycle.length ? ["edge_on_cycle"] : [])] as Theorem[],
    note: reading === "partial"
      ? "The function keeps its object, so every deliverable stays; compare_to counts one more defective function, so the concept is worse unless something else improves, such as the performer's cost."
      : "Only the rating changes; how the loop's influence changes is the mechanism to substantiate.",
  };
}

/**
 * Principle 23 ("Introduce feedback"), structural part: add a function whose object already
 * reaches its performer, so the new function lies on a cycle (u, v, …, u). A loop of useful
 * functions only is a control loop; a loop with a harmful or excessive function is a harm loop
 * and is returned for substantiation. A function that closes no loop fails closed.
 */
export function feedback(model: FunctionModel, spec: { wire: Wire }) {
  const bad = typed(model);
  if (bad) return bad;
  const w = spec.wire;
  const known = new Set(model.boxes.map((b) => b.id));
  const missing = [w.from.box, w.to.box].filter((b) => !known.has(b));
  if (missing.length) return fail(...[...new Set(missing)].map((b) => `unknown box '${b}'`));
  const cycle = cycleThrough(model, w);
  if (!cycle.length) return fail(`'${w.to.box}' does not reach '${w.from.box}': the function closes no loop, so it is not feedback`);
  const r = rewrite(model, { add: { wires: [w] } });
  if (!r.ok) return r;
  const loop = harmLoops(r.model).find((l) => l.boxes.includes(w.from.box));
  return {
    ok: true as const,
    model: r.model,
    cycle,
    loop: loop ? "harm" as const : "control" as const,
    ...(loop ? { harmLoop: loop } : {}),
    basis: [...r.basis, "edge_on_cycle"] as Theorem[],
    note: loop
      ? "The new function closes a loop with a harmful or excessive function: name the mechanism for every function on the witness cycle before relying on it."
      : "A control loop of useful functions. Whether it stabilises anything is dynamics, which the model does not contain.",
  };
}

/**
 * Principle 22 (Blessing in disguise), structural part: the harmful function's source port feeds a
 * useful function at `to`, an input port of the same carrier. By default the factor is redirected:
 * the harmful function becomes that useful one (same id). With `keepHarm`, the harm stays and the
 * useful function is added beside it (id `id`, default '<wire>/used'). The harm's own object port
 * is refused as a target: rating the harm useful there would not use the factor elsewhere.
 */
export function retarget(model: FunctionModel, spec: { wire: string; to: Endpoint; keepHarm?: boolean; id?: string }) {
  const bad = typed(model);
  if (bad) return bad;
  const w = model.wires.find((x) => x.id === spec.wire);
  if (!w) return fail(`unknown wire '${spec.wire}'`);
  if (w.polarity !== "harmful") return fail(`function '${w.id}' is rated '${w.polarity}', not harmful: there is no harmful factor to use`);
  if (spec.to.box === w.to.box && spec.to.port === w.to.port) return fail(`'${w.to.box}.${w.to.port}' is the harm's own object port: rating it useful there does not use the factor elsewhere`);
  const used: Wire = { ...w, id: spec.keepHarm ? spec.id ?? `${w.id}/used` : spec.id ?? w.id, to: spec.to, polarity: "useful" };
  const r = rewrite(model, spec.keepHarm ? { add: { wires: [used] } } : { delete: { wires: [w.id] }, add: { wires: [used] } });
  if (!r.ok) return r;
  const target = r.model.boxes.find((b) => b.id === spec.to.box)!;
  return {
    ok: true as const,
    model: r.model,
    used: used.id,
    removedHarm: spec.keepHarm ? null : w.id,
    gainsDeliverable: target.role === "product",
    basis: [...r.basis, ...(spec.keepHarm ? [] : ["typed_retarget"])] as Theorem[],
    note: spec.keepHarm
      ? "The harm still acts on its object; the factor now also performs a useful function. Whether the factor suffices for both is the design question."
      : "Redirecting assumes the factor no longer reaches its old object. Substantiate that, and the useful rating, before relying on the comparison.",
  };
}

/**
 * Principle 13 (The other way round), structural part: the function u → v becomes v → u, keeping
 * its id, carrier, rating, and verb. It needs an output port of the carrier on v and an input port
 * of the carrier on u. `ports.from` / `ports.to` name them; a named port the box lacks is added
 * with the carrier. Unnamed, the box's only port of that carrier and side is used, and none or
 * several fail closed. A box that declares behavior cannot gain a port here, since its rows would
 * not name it. `undo` is a rewrite that restores the original boxes and function, removing any
 * added port. "Movable" and "fixed" are not modelled.
 */
export function reverse(model: FunctionModel, spec: { wire: string; ports?: { from?: string; to?: string } }) {
  const bad = typed(model);
  if (bad) return bad;
  const w = model.wires.find((x) => x.id === spec.wire);
  if (!w) return fail(`unknown wire '${spec.wire}'`);
  if (w.from.box === w.to.box) return fail(`function '${w.id}' is a self-loop on '${w.from.box}': reversing it leaves a self-loop`);
  const byId = new Map(model.boxes.map((b) => [b.id, b]));
  const resolve = (box: Box, side: "outputs" | "inputs", named: string | undefined): { port: string; added: boolean } | string => {
    const field = side === "outputs" ? "ports.from" : "ports.to", kind = side === "outputs" ? "output" : "input";
    if (named !== undefined) {
      const p = (box[side] ?? []).find((x) => x.id === named);
      if (p) return p.carrier === w.carrier ? { port: named, added: false } : `${field}: port '${box.id}.${named}' carries '${p.carrier}', not '${w.carrier}'`;
      const other = side === "outputs" ? box.inputs : box.outputs;
      return (other ?? []).some((x) => x.id === named) ? `${field}: port '${box.id}.${named}' is not an ${kind}` : { port: named, added: true };
    }
    const fits = (box[side] ?? []).filter((x) => x.carrier === w.carrier).map((x) => x.id);
    if (fits.length === 1) return { port: fits[0], added: false };
    return fits.length
      ? `box '${box.id}' has ${kind} ports [${fits.join(", ")}] of carrier '${w.carrier}': name one in ${field}`
      : `box '${box.id}' has no ${kind} port of carrier '${w.carrier}': name one in ${field} to add it`;
  };
  const performer = byId.get(w.to.box)!, object = byId.get(w.from.box)!;
  const from = resolve(performer, "outputs", spec.ports?.from), to = resolve(object, "inputs", spec.ports?.to);
  const errors = [from, to].filter((x): x is string => typeof x === "string");
  if (errors.length) return fail(...errors);
  const [src, tgt] = [from, to] as Array<{ port: string; added: boolean }>;
  const declared = [...(src.added ? [performer] : []), ...(tgt.added ? [object] : [])].filter((b) => b.behavior).map((b) => b.id);
  if (declared.length) return fail(...declared.map((id) => `box '${id}' declares behavior: a new port needs a value in every row; declare it with rewrite, then reverse onto it`));
  const extended = new Map<string, Box>();
  const add = (box: Box, side: "outputs" | "inputs", port: string) => {
    const b = extended.get(box.id) ?? box;
    extended.set(box.id, { ...b, [side]: [...(b[side] ?? []), { id: port, carrier: w.carrier }] });
  };
  if (src.added) add(performer, "outputs", src.port);
  if (tgt.added) add(object, "inputs", tgt.port);
  const reversed: Wire = { ...w, from: { box: performer.id, port: src.port }, to: { box: object.id, port: tgt.port } };
  const step = replace(model, { boxes: [...extended.values()], wires: [reversed] });
  const r = rewrite(model, step);
  if (!r.ok) return r;
  return {
    ok: true as const,
    model: r.model,
    reversed: w.id,
    ports: { from: src.port, to: tgt.port, original: { from: w.from.port, to: w.to.port } },
    addedPorts: [...(src.added ? [`${performer.id}.${src.port}`] : []), ...(tgt.added ? [`${object.id}.${tgt.port}`] : [])],
    undo: { op: "rewrite" as const, ...restore(model, step) },
    basis: [...r.basis, "typed_reverse", ...(src.added || tgt.added ? ["typed_extend"] : [])] as Theorem[],
    note: "The former object now performs the function, with its rating unchanged: whether it can is the design question. To go back, apply undo with triz_transform: it restores the original model, added ports included.",
  };
}

/**
 * Principle 11 (Beforehand cushioning), structural part: add a standby box with an output port
 * for each port through which `box` performs a useful function on another box. The standby is
 * unwired: harm loops, deliverables, and every existing function are unchanged, and its cost is
 * added. Losing `box` is modelled as trimming it: afterwards triz_trim lists the standby as a
 * typed absorber of each such function, so the trim orphans none of them. Reliability itself, and
 * whether the standby takes over in time, are not modelled.
 */
export function standby(model: FunctionModel, spec: {
  box: string; standby: { id: string; name: string; role?: Box["role"]; action?: string; cost?: Record<string, number> };
}) {
  const bad = typed(model);
  if (bad) return bad;
  const box = model.boxes.find((b) => b.id === spec.box);
  if (!box) return fail(`unknown box '${spec.box}'`);
  const performed = model.wires.filter((w) => w.from.box === box.id && w.to.box !== box.id && w.polarity !== "harmful");
  if (!performed.length) return fail(`box '${box.id}' performs no useful function on another box: nothing to back up`);
  const s = spec.standby;
  const outputs = (box.outputs ?? []).filter((p) => performed.some((w) => w.from.port === p.id)).map((p) => ({ id: p.id, carrier: p.carrier }));
  const backup: Box = {
    id: s.id, name: s.name, role: s.role ?? box.role,
    ...(s.action !== undefined ? { action: s.action } : {}),
    outputs,
    ...(s.cost !== undefined ? { cost: s.cost } : {}),
  };
  const before = trimCandidates(model, [box.id]);
  const r = rewrite(model, { add: { boxes: [backup] } });
  if (!r.ok) return r;
  const after = trimCandidates(r.model, [box.id]);
  if (!before.ok || !after.ok) throw new Error("standby invariant: the trim screen of a typed model failed");
  const covered = after.functions.filter((f) => f.absorbers.some((a) => a.box === backup.id)).map((f) => f.wire);
  // Each performed function's carrier has a standby output, so the screen must list it.
  if (covered.length !== performed.length) throw new Error(`standby invariant: '${backup.id}' absorbs [${covered.join(", ")}] of [${performed.map((w) => w.id).join(", ")}]`);
  return {
    ok: true as const,
    model: r.model,
    covers: covered,
    newlyCovered: before.orphaned,
    basis: [...r.basis, "typed_reroute"] as Theorem[],
    note: "The standby adds cost and no function until it is wired in. It is a typed absorber, which is necessary, not sufficient: substantiate that it can take over, and how fast.",
  };
}

/**
 * Principles 26 and 27 (Copying; Cheap short-living objects), structural part: replace a box by a
 * copy with the same role, action, and ports and a cost no higher on any dimension and lower on at
 * least one. Every function re-attaches to the copy with its rating. The copy keeps the box's id
 * unless `copy.id` gives a new one; then `boxMap` maps it back for compare_to. Availability,
 * fragility, durability, and how well the copy performs are not modelled.
 */
export function cheapCopy(model: FunctionModel, spec: { box: string; copy: { id?: string; name?: string; cost: Record<string, number> } }) {
  const bad = typed(model);
  if (bad) return bad;
  const box = model.boxes.find((b) => b.id === spec.box);
  if (!box) return fail(`unknown box '${spec.box}'`);
  const was = box.cost ?? {}, now = spec.copy.cost;
  const at = (c: Record<string, number>, d: string) => (Object.hasOwn(c, d) ? c[d] : 0);
  const dims = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort();
  const rising = dims.filter((d) => at(now, d) > at(was, d));
  const lower = dims.filter((d) => at(now, d) < at(was, d));
  if (rising.length) return fail(...rising.map((d) => `cost '${d}' rises from ${at(was, d)} to ${at(now, d)}: the copy is not inexpensive`));
  if (!lower.length) return fail(`no cost dimension of '${box.id}' is lower in the copy: the copy is not inexpensive`);
  const id = spec.copy.id ?? box.id;
  const { cost: _cost, ...rest } = box;
  const copy: Box = { ...rest, id, name: spec.copy.name ?? `${box.name} (copy)`, ...(Object.keys(now).length ? { cost: now } : {}) };
  const moved = model.wires.filter((w) => w.from.box === box.id || w.to.box === box.id);
  const follow = (e: Endpoint) => (e.box === box.id ? { box: id, port: e.port } : e);
  // A renamed copy takes the box's place on every flow.
  const through = id === box.id ? [] : flowsThrough(model.flows, new Set([box.id]));
  const renamedFlows = mapFlows(through, (x) => (x === box.id ? id : x));
  const r = rewrite(model, {
    delete: { boxes: [box.id], wires: moved.map((w) => w.id), flows: through.map((f) => f.id) },
    add: { boxes: [copy], wires: moved.map((w) => ({ ...w, from: follow(w.from), to: follow(w.to) })), flows: renamedFlows.flows },
  });
  if (!r.ok) return r;
  const renamed = id !== box.id;
  return {
    ok: true as const,
    model: r.model,
    boxMap: renamed ? { [id]: box.id } : {},
    deliverableKeysChanged: renamed && box.role === "product",
    costRelief: Object.fromEntries(lower.map((d) => [d, at(was, d) - at(now, d)])),
    basis: [...r.basis, ...(renamed ? ["typed_rename"] : []), "cheaper_part_lowers_cost"] as Theorem[],
    note: "Only cost is compared: the copy's functions keep their ratings. If it performs less well, rate them with rerate; whether it is available, robust, or lasts is not modelled.",
  };
}
