/**
 * Typed model transformations. Every construction here is one rewrite: delete some boxes and
 * wires, then add boxes and wires, at an occurrence given in the model's own ids.
 *
 *  - rewrite    — the engine. It checks the no-dangling condition: no remaining wire may touch a
 *                 deleted box (Bonchi et al. 2022, Def. 3.16). Occurrences are named by id, so they
 *                 are injective and the no-identification condition holds trivially. Added ids must
 *                 be fresh, and the result must pass checkModel. Every failure fails closed.
 *                 Rules as patterns, with occurrence search, are in act-rule.ts.
 *  - segment    — divide a box into parts whose ports partition the box's ports.
 *                 Principle 1 reads "Divide an object into independent parts".
 *  - takeOut    — separate the part of a box that touches a harmful or excessive function, or
 *                 isolate the part that carries all its useful functions.
 *                 Principle 2 reads "Separate an interfering part or isolate the only needed part".
 *  - interpose  — route a function through a new mediator box.
 *                 Principle 24 reads "Use an intermediary carrier or process".
 *  - applyTrim  — perform a trim that triz_trim screened as typed-feasible. Each kept function is
 *                 re-attached to a chosen typed absorber. This is the "function remains, the
 *                 component disappears" move of the increasing-ideality line in evolution-trends.md.
 *
 * The principle texts above are quoted from data/principles.json. A construction makes the
 * structural part of a principle checkable. It does not show that the principle solves anything.
 */
import { checkModel, trimCandidates, type FunctionModel, type Polarity } from "./act.js";
import { REWRITE, type Theorem } from "./act-basis.js";
import { at, fail, issue, quoted, rebase, second, unknownBox, unknownWire, type Failure, type Issue, type Reroot } from "./act-issues.js";

/** An identity mediator composes away: r ∘ (=) = r. */
const IDENTITY: Theorem[] = ["Relation.comp_eq"];
/** One part against the rest: R is π₁R × π₂R iff (a, b), (c, d) ∈ R always give (a, d) ∈ R. */
const RECTANGLE: Theorem[] = ["eq_projections_prod_iff_rectangle"];
/** Not a product of its projections, so no relations on the parts compose back to R. */
const NO_FACTORS: Theorem[] = ["eq_projections_prod_iff"];
/** All parts at once: R is Π πᵢR iff it is a product at all. */
const SPLIT_ALL: Theorem[] = ["eq_projections_pi_iff"];

type Box = FunctionModel["boxes"][number];
type Wire = FunctionModel["wires"][number];
type Port = NonNullable<Box["inputs"]>[number];

const NEGATIVE: ReadonlySet<Polarity> = new Set(["harmful", "excessive"]);
const touches = (w: Wire, box: string) => w.from.box === box || w.to.box === box;

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

export interface RewriteStep {
  delete?: { boxes?: string[]; wires?: string[] };
  add?: { boxes?: Box[]; wires?: Wire[] };
}

/** An id like `id` that none of `taken` uses, for hints. */
export function freshLike(id: string, taken: Set<string>): string {
  for (let n = 2; ; n++) if (!taken.has(`${id}-${n}`)) return `${id}-${n}`;
}

/**
 * A failure of a rewrite step that a construction built itself: the step is not input, so its
 * paths collapse to the construction's spec (`$`), after any more precise `rules`.
 */
export const internal = <F extends Failure>(f: F, rules: Reroot = []): F =>
  rebase(f, [...rules, ["$.delete", "$", "collapse"], ["$.add", "$", "collapse"]]);

/**
 * Apply one rewrite step at an occurrence named by id. Fails closed on every condition. Issue
 * paths are `$.model…` and `$.delete…` / `$.add…`; an issue of the result points at the input
 * element it came from: a kept model element, or the added one.
 */
export function rewrite(model: FunctionModel, step: RewriteStep): { ok: true; model: FunctionModel; basis: Theorem[] } | Failure {
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  const issues: Issue[] = [];
  const delBoxes = step.delete?.boxes ?? [], delWires = step.delete?.wires ?? [];
  const addBoxes = step.add?.boxes ?? [], addWires = step.add?.wires ?? [];
  const boxIds = new Set(model.boxes.map((b) => b.id)), wireIds = new Set(model.wires.map((w) => w.id));
  delBoxes.forEach((id, k) => {
    if (!boxIds.has(id)) issues.push(issue("unknown-box", at("$.delete.boxes", k), `delete: unknown box '${id}'`, `Delete boxes the model has: ${quoted(boxIds)}.`));
  });
  delWires.forEach((id, k) => {
    if (!wireIds.has(id)) issues.push(issue("unknown-wire", at("$.delete.wires", k), `delete: unknown wire '${id}'`, `Delete wires the model has: ${quoted(wireIds)}.`));
  });
  for (const id of duplicates(delBoxes)) issues.push(issue("listed-twice", at("$.delete.boxes", second(delBoxes, id)), `delete: box '${id}' listed twice`, `List '${id}' once in delete.boxes.`));
  for (const id of duplicates(delWires)) issues.push(issue("listed-twice", at("$.delete.wires", second(delWires, id)), `delete: wire '${id}' listed twice`, `List '${id}' once in delete.wires.`));
  const goneBoxes = new Set(delBoxes), goneWires = new Set(delWires);
  for (const w of model.wires) {
    if (goneWires.has(w.id)) continue;
    for (const end of [w.from.box, w.to.box]) {
      if (goneBoxes.has(end)) {
        issues.push(issue("dangling-wire", "$.delete.wires", `no-dangling: wire '${w.id}' still touches deleted box '${end}'; delete or re-attach it`,
          `Add '${w.id}' to delete.wires. To keep the function, also add a copy of it in add.wires attached to a remaining box.`));
      }
    }
  }
  const keptIndex = model.boxes.flatMap((b, i) => (goneBoxes.has(b.id) ? [] : [i]));
  const keptWireIndex = model.wires.flatMap((w, i) => (goneWires.has(w.id) ? [] : [i]));
  const keptBoxes = keptIndex.map((i) => model.boxes[i]), keptWires = keptWireIndex.map((i) => model.wires[i]);
  const keptBoxIds = new Set(keptBoxes.map((b) => b.id)), keptWireIds = new Set(keptWires.map((w) => w.id));
  addBoxes.forEach((b, k) => {
    if (keptBoxIds.has(b.id)) issues.push(issue("id-not-fresh", at("$.add.boxes", k, "id"), `add: box id '${b.id}' is not fresh`, `Pick a box id no kept box uses, e.g. '${freshLike(b.id, keptBoxIds)}', or delete box '${b.id}' in the same step.`));
  });
  addWires.forEach((w, k) => {
    if (keptWireIds.has(w.id)) issues.push(issue("id-not-fresh", at("$.add.wires", k, "id"), `add: wire id '${w.id}' is not fresh`, `Pick a wire id no kept wire uses, e.g. '${freshLike(w.id, keptWireIds)}', or delete wire '${w.id}' in the same step.`));
  });
  const addBoxIds = addBoxes.map((b) => b.id), addWireIds = addWires.map((w) => w.id);
  for (const id of duplicates(addBoxIds)) issues.push(issue("duplicate-id", at("$.add.boxes", second(addBoxIds, id)), `add: box '${id}' added twice`, `Add box '${id}' once.`));
  for (const id of duplicates(addWireIds)) issues.push(issue("duplicate-id", at("$.add.wires", second(addWireIds, id)), `add: wire '${id}' added twice`, `Add wire '${id}' once.`));
  if (issues.length) return fail(issues);
  const result: FunctionModel = { ...model, boxes: [...keptBoxes, ...addBoxes], wires: [...keptWires, ...addWires] };
  const after = checkModel(result, "#");
  if (after.ok) return { ok: true, model: result, basis: REWRITE };
  // The result is not input: point each issue at the kept model element or the added one it came from.
  const origin = (path: string) => {
    const m = /^#\.(boxes|wires)\[(\d+)\](.*)$/.exec(path);
    if (!m) return path.replace(/^#/, "$.model");
    const [, list, n, rest] = m, i = Number(n), kept = list === "boxes" ? keptIndex : keptWireIndex;
    return i < kept.length ? `$.model.${list}[${kept[i]}]${rest}` : `$.add.${list}[${i - kept.length}]${rest}`;
  };
  return fail(after.issues.map((x) => issue("ill-typed-result", origin(x.path), `result: ${x.message}`, `The step leaves the model ill-typed. ${x.hint}`)));
}

export interface PartSpec { id: string; name?: string; role?: Box["role"]; ports: string[]; }

/**
 * Whether a box's declared relation R splits over its parts: R equals the product of its
 * projections πᵢR onto each part's ports. R ⊆ Π πᵢR always holds, so after removing duplicate rows
 * equality is |R| = Π |πᵢR|: about k·|R| steps for k parts, with no membership check per tuple of
 * the product. A part is coupled when R ≠ πᵢR × π(rest)R, each part tested against all the others
 * together: c = a xor b is independent pairwise, yet no part splits off. R splits over all the
 * parts iff no part is coupled. When it splits, each part gets its projection as its behaviour.
 *
 * Each coupled part gets a witness of the rectangle condition failing: rows x = (x₁, x₂) and
 * y = (y₁, y₂) of R, split into the part's ports and the rest, with (x₁, y₂) not a row. The
 * witness is the first such pair with rows in lexicographic order of their values (ports in box
 * order, inputs then outputs; values compared by code unit): the first x whose part value does
 * not meet every rest value, then the first y whose rest value it misses. That order is the one
 * tie-break; it reads value names and port order.
 */
export function splitBehavior(box: Box, parts: Array<{ id: string; ports: string[] }>) {
  const columns = [...(box.inputs ?? []).map((p) => ({ side: "in" as const, id: p.id })), ...(box.outputs ?? []).map((p) => ({ side: "out" as const, id: p.id }))];
  const lexicographic = (a: string[], b: string[]) => {
    const i = a.findIndex((x, j) => x !== b[j]);
    return i < 0 ? 0 : a[i] < b[i] ? -1 : 1;
  };
  const tuples = [...new Map(box.behavior!.map((row) => {
    const t = columns.map((c) => row[c.side][c.id]);
    return [JSON.stringify(t), t] as const;
  })).values()].sort(lexicographic);
  const of = (part: { ports: string[] }) => columns.flatMap((c, i) => (part.ports.includes(c.id) ? [i] : []));
  const key = (t: string[], cols: number[]) => JSON.stringify(cols.map((i) => t[i]));
  const size = (cols: number[]) => new Set(tuples.map((t) => key(t, cols))).size;
  const all = parts.map(of);
  const restOf = (i: number) => all.flatMap((cols, j) => (j === i ? [] : cols));
  const coupledAt = all.flatMap((cols, i) => (size(cols) * size(restOf(i)) !== tuples.length ? [i] : []));
  const independent = all.reduce((n, cols) => n * size(cols), 1) === tuples.length;
  /** A full tuple shown part by part: part id → port id → value. */
  const view = (t: string[]) => Object.fromEntries(parts.map((p, j) => [p.id, Object.fromEntries(all[j].map((i) => [columns[i].id, t[i]]))]));
  const witness = (i: number) => {
    const cols = all[i], rest = restOf(i);
    const meets = new Map<string, Set<string>>();
    for (const t of tuples) meets.set(key(t, cols), (meets.get(key(t, cols)) ?? new Set()).add(key(t, rest)));
    const restValues = size(rest);
    const x = tuples.find((t) => meets.get(key(t, cols))!.size < restValues)!;
    const y = tuples.find((t) => !meets.get(key(x, cols))!.has(key(t, rest)))!;
    const absent = x.map((v, j) => (cols.includes(j) ? v : y[j]));
    return { part: parts[i].id, rows: [view(x), view(y)], absent: view(absent) };
  };
  const project = (cols: number[]) => [...new Map(tuples.map((t) => {
    const row = { in: {} as Record<string, string>, out: {} as Record<string, string> };
    for (const i of cols) row[columns[i].side][columns[i].id] = t[i];
    return [key(t, cols), row] as const;
  })).values()];
  const noFactors = parts.length === 2 ? NO_FACTORS : SPLIT_ALL;
  return {
    independent,
    coupled: coupledAt.map((i) => parts[i].id),
    witnesses: coupledAt.map(witness),
    rows: independent ? new Map(parts.map((p, i) => [p.id, project(all[i])])) : undefined,
    basis: independent ? (parts.length === 2 ? RECTANGLE : SPLIT_ALL) : [...RECTANGLE, ...noFactors],
  };
}

/**
 * Principle 1 (Segmentation), structural part: replace a box by parts whose ports partition the
 * box's ports. Each wire follows its port to the part that now owns it. Each cost dimension goes
 * wholesale to one part (`costTo`, default the first part), so cost totals are unchanged. Parts
 * are independent when no wire joins two of them; the result reports any that do (former
 * self-loops). Splitting a product box changes deliverable keys. Pass the returned `boxMap` as
 * `box_map` to triz_function_model with compare_to (see mapBoxes); `deliverableKeysChanged` says
 * when that is needed.
 */
export function segment(model: FunctionModel, spec: { box: string; parts: PartSpec[]; costTo?: Record<string, string> }) {
  const box = model.boxes.find((b) => b.id === spec.box);
  if (!box) return fail([unknownBox(model, spec.box, "$.box")]);
  const issues: Issue[] = [];
  if (spec.parts.length < 2) issues.push(issue("too-few-members", "$.parts", "segmentation needs at least two parts", `List two or more parts, each with some of '${box.id}''s ports.`));
  const ports = [...(box.inputs ?? []).map((p) => p.id), ...(box.outputs ?? []).map((p) => p.id)];
  const owner = new Map<string, string>();
  spec.parts.forEach((part, i) => {
    if (!part.ports.length) issues.push(issue("part-without-ports", at("$.parts", i, "ports"), `part '${part.id}' has no ports`, `Give part '${part.id}' at least one port of '${box.id}': ${quoted(ports)}.`));
    part.ports.forEach((p, j) => {
      if (!ports.includes(p)) issues.push(issue("unknown-port", at("$.parts", i, "ports", j), `part '${part.id}': box '${box.id}' has no port '${p}'`, `Use ports of '${box.id}': ${quoted(ports)}.`));
      else if (owner.has(p)) issues.push(issue("port-assigned-twice", at("$.parts", i, "ports", j), `port '${p}' assigned to both '${owner.get(p)}' and '${part.id}'`, `Give port '${p}' to one part only: the parts' ports partition the box's ports.`));
      owner.set(p, part.id);
    });
  });
  const unassigned = ports.filter((p) => !owner.has(p));
  for (const p of unassigned) issues.push(issue("port-unassigned", "$.parts", `port '${p}' of box '${box.id}' is assigned to no part`, `Add '${p}' to one part's ports: every port of '${box.id}' goes to exactly one part.`));
  const partIds = spec.parts.map((p) => p.id);
  const costTo = spec.costTo ?? {};
  for (const [dim, part] of Object.entries(costTo)) {
    if (!Object.hasOwn(box.cost ?? {}, dim)) issues.push(issue("unknown-cost-dimension", at("$.cost_to", dim), `costTo: box '${box.id}' has no cost dimension '${dim}'`, `cost_to keys are '${box.id}''s cost dimensions: ${quoted(Object.keys(box.cost ?? {}))}.`));
    if (!partIds.includes(part)) issues.push(issue("unknown-part", at("$.cost_to", dim), `costTo: '${dim}' assigned to unknown part '${part}'`, `cost_to values are part ids: ${quoted(partIds)}.`));
  }
  if (issues.length) return fail(issues);

  const split = box.behavior ? splitBehavior(box, spec.parts) : undefined;
  const parts: Box[] = spec.parts.map((part, i) => {
    const pick = (list: Port[] | undefined) => (list ?? []).filter((p) => owner.get(p.id) === part.id);
    const cost = Object.fromEntries(Object.entries(box.cost ?? {}).filter(([dim]) => (Object.hasOwn(costTo, dim) ? costTo[dim] : partIds[0]) === part.id));
    const inputs = pick(box.inputs), outputs = pick(box.outputs);
    const behavior = split?.rows?.get(part.id);
    return {
      id: part.id,
      name: part.name ?? `${box.name} (part ${i + 1})`,
      role: part.role ?? box.role,
      ...(box.action !== undefined ? { action: box.action } : {}),
      ...(inputs.length ? { inputs } : {}),
      ...(outputs.length ? { outputs } : {}),
      ...(Object.keys(cost).length ? { cost } : {}),
      ...(behavior ? { behavior } : {}),
    };
  });
  const moved = model.wires.filter((w) => touches(w, box.id));
  const follow = (e: Wire["from"]) => (e.box === box.id ? { box: owner.get(e.port)!, port: e.port } : e);
  const rewired = moved.map((w) => ({ ...w, from: follow(w.from), to: follow(w.to) }));
  const r = rewrite(model, { delete: { boxes: [box.id], wires: moved.map((w) => w.id) }, add: { boxes: parts, wires: rewired } });
  if (!r.ok) return internal(r, [["$.add.boxes", "$.parts"]]);
  const between = rewired.filter((w) => partIds.includes(w.from.box) && partIds.includes(w.to.box) && w.from.box !== w.to.box).map((w) => w.id);
  return {
    ok: true as const,
    model: r.model,
    boxMap: Object.fromEntries(partIds.map((p) => [p, box.id])),
    deliverableKeysChanged: box.role === "product" && partIds.some((p) => p !== box.id),
    independent: between.length === 0,
    between,
    ...(split ? {
      behaviourallyIndependent: split.independent,
      behavior: {
        coupled: split.coupled,
        witnesses: split.witnesses,
        basis: split.basis,
        note: split.independent
          ? "The declared relation is the product of its projections onto the parts, so each part carries its projection and together they compose back to it."
          : `The declared relation is not a product over the parts: no relations on the parts compose back to it. Coupled: ${split.coupled.map((id) => `'${id}'`).join(", ")}. Each witness gives two rows whose mix (the part's values from the first, the rest from the second) is not a row. The parts declare no behaviour; declare it to decide the concept with triz_behavior.`,
      },
    } : {}),
    basis: r.basis,
    note: box.role === "product"
      ? "Typing is preserved. The product's deliverables now arrive at part ids: compare with triz_function_model compare_to and box_map set to boxMap, or the comparison reports them lost and regained."
      : "Typing is preserved; whether the parts can really work apart is a design question to substantiate.",
  };
}

/**
 * The concept seen through a box map (concept box id → baseline box id), for comparison only.
 * Every box id and wire endpoint in the map is renamed; others stay. Several parts may map to
 * one baseline box, so the result may repeat a box id: it is an input to compareIdeality, never
 * a model to type-check. Port ids are untouched, so a segment's deliverables keep their
 * [box, port, carrier] keys. Fails closed on keys that are not concept boxes and values that are
 * not baseline boxes.
 */
export function mapBoxes(concept: FunctionModel, baseline: FunctionModel, boxMap: Record<string, string>) {
  const conceptIds = new Set(concept.boxes.map((b) => b.id)), baselineIds = new Set(baseline.boxes.map((b) => b.id));
  const issues = Object.entries(boxMap).flatMap(([from, to]) => [
    ...(conceptIds.has(from) ? [] : [issue("box-map-unknown-box", at("$.box_map", from), `box_map: '${from}' is not a box of the concept model`,
      `box_map keys are box ids of the model (the concept): ${quoted(conceptIds)}. Pass the boxMap triz_transform returned, unchanged.`)]),
    ...(baselineIds.has(to) ? [] : [issue("box-map-unknown-box", at("$.box_map", from), `box_map: '${to}' is not a box of the baseline (compare_to)`,
      `box_map values are box ids of compare_to (the baseline): ${quoted(baselineIds)}.`)]),
  ]);
  if (issues.length) return fail(issues);
  const map = new Map(Object.entries(boxMap));
  const renamed = (id: string) => map.get(id) ?? id;
  return {
    ok: true as const,
    model: {
      ...concept,
      boxes: concept.boxes.map((b) => ({ ...b, id: renamed(b.id) })),
      wires: concept.wires.map((w) => ({ ...w, from: { ...w.from, box: renamed(w.from.box) }, to: { ...w.to, box: renamed(w.to.box) } })),
    },
  };
}

/**
 * Principle 2 (Taking out), structural part: split `ports` off a box into a new box `part`; the
 * remainder keeps the box id. Reading 'interfering' requires the taken ports to touch a harmful or
 * excessive function. Reading 'needed' requires them to carry every useful, insufficient, or
 * excessive function of the box, so the remainder touches only harmful functions, if any, and
 * becomes a trimming candidate. Costs stay with the remainder unless `costTo` moves a dimension.
 */
export function takeOut(model: FunctionModel, spec: {
  box: string; ports: string[]; part: { id: string; name?: string; role?: Box["role"] };
  reading?: "interfering" | "needed"; costTo?: Record<string, string>;
}) {
  const box = model.boxes.find((b) => b.id === spec.box);
  if (!box) return fail([unknownBox(model, spec.box, "$.box")]);
  const reading = spec.reading ?? "interfering";
  const taken = new Set(spec.ports);
  const all = [...(box.inputs ?? []), ...(box.outputs ?? [])].map((p) => p.id);
  const endsOn = (w: Wire, side: "taken" | "rest") => [w.from, w.to].some((e) => e.box === box.id && taken.has(e.port) === (side === "taken"));
  const wires = model.wires.filter((w) => touches(w, box.id));
  const interfering = wires.filter((w) => NEGATIVE.has(w.polarity) && endsOn(w, "taken")).map((w) => w.id);
  const usefulLeft = wires.filter((w) => w.polarity !== "harmful" && endsOn(w, "rest")).map((w) => w.id);
  const usefulTaken = wires.filter((w) => w.polarity !== "harmful" && endsOn(w, "taken")).map((w) => w.id);
  const portsOn = (ws: Wire[]) => [...new Set(ws.flatMap((w) => [w.from, w.to].filter((e) => e.box === box.id).map((e) => e.port)))];
  if (reading === "interfering" && !interfering.length) {
    const negative = portsOn(wires.filter((w) => NEGATIVE.has(w.polarity)));
    return fail([issue("take-out-reading", "$.ports", `no harmful or excessive function touches ports [${spec.ports.join(", ")}] of '${box.id}': nothing interfering to take out (use segment for a plain split)`,
      negative.length ? `Take the ports that touch '${box.id}''s harmful or excessive functions: ${quoted(negative)}. To isolate the useful part instead, use reading 'needed'.`
        : `No harmful or excessive function touches '${box.id}'. Use reading 'needed' to isolate its useful part, or segment for a plain split.`)]);
  }
  if (reading === "needed" && (usefulLeft.length || !usefulTaken.length)) {
    const useful = portsOn(wires.filter((w) => w.polarity !== "harmful"));
    return fail([usefulLeft.length
      ? issue("take-out-reading", "$.ports", `useful functions [${usefulLeft.join(", ")}] stay on the remainder: the taken ports are not the only needed part`,
        `Take every port that carries a useful function of '${box.id}': ${quoted(useful)}. To separate an interfering part instead, use reading 'interfering'.`)
      : issue("take-out-reading", "$.ports", `no useful function touches ports [${spec.ports.join(", ")}] of '${box.id}'`,
        useful.length ? `Take the ports that carry '${box.id}''s useful functions: ${quoted(useful)}.` : `'${box.id}' performs or receives no useful function: screen it with triz_trim instead.`)]);
  }
  const costTo = Object.fromEntries(Object.keys(box.cost ?? {}).map((d) => [d, spec.costTo && Object.hasOwn(spec.costTo, d) ? spec.costTo[d] : box.id]));
  const s = segment(model, {
    box: box.id,
    parts: [
      { id: box.id, name: box.name, role: box.role, ports: all.filter((p) => !taken.has(p)) },
      { id: spec.part.id, name: spec.part.name ?? `${box.name} (taken out)`, role: spec.part.role ?? box.role, ports: spec.ports },
    ],
    costTo,
  });
  // The parts are built from the spec: the remainder from the box, the taken part from `ports` and `part`.
  if (!s.ok) return rebase(s, [["$.parts[1].ports", "$.ports"], ["$.parts[1]", "$.part"], ["$.parts", "$.ports", "collapse"]]);
  return {
    ...s,
    reading,
    interfering,
    note: reading === "interfering"
      ? "The interfering functions now attach to their own box: trim it, move it, or shield it, and substantiate the split."
      : `The remainder '${box.id}' carries no useful function: screen it with triz_trim.`,
  };
}

/**
 * Principle 24 (Intermediary), structural part: replace the function `wire` (u → v) by u → m → v
 * through a new mediator box m with one input and one output port of the wire's carrier. Both
 * legs keep the original rating and verb unless `polarity` overrides them: whether the mediator
 * changes the rating is the design question, not something the rewrite decides. Reachability
 * among the original boxes is unchanged, so with inherited ratings harm-loop membership is too.
 */
export function interpose(model: FunctionModel, spec: {
  wire: string;
  mediator: { id: string; name: string; role?: Box["role"]; action?: string; cost?: Record<string, number>; behavior?: Box["behavior"] | "identity" };
  polarity?: { in?: Polarity; out?: Polarity };
  ids?: { in?: string; out?: string };
}) {
  const w = model.wires.find((x) => x.id === spec.wire);
  if (!w) return fail([unknownWire(model, spec.wire, "$.wire")]);
  const m = spec.mediator;
  const values = model.carriers.find((c) => c.id === w.carrier)?.values;
  if (m.behavior === "identity" && !values) {
    return fail([issue("no-declared-values", "$.mediator.behavior", `mediator behavior 'identity' needs carrier '${w.carrier}' to declare values`,
      `Declare values on carrier '${w.carrier}' in the model, or give the mediator's behavior as rows over ports 'in' and 'out'.`)]);
  }
  const behavior = m.behavior === "identity" ? values!.map((v) => ({ in: { in: v }, out: { out: v } })) : m.behavior;
  const mediator: Box = {
    id: m.id, name: m.name, role: m.role ?? "mediator",
    ...(m.action !== undefined ? { action: m.action } : {}),
    inputs: [{ id: "in", carrier: w.carrier }],
    outputs: [{ id: "out", carrier: w.carrier }],
    ...(m.cost !== undefined ? { cost: m.cost } : {}),
    ...(behavior ? { behavior } : {}),
  };
  const leg = (id: string, from: Wire["from"], to: Wire["to"], polarity: Polarity): Wire => ({ ...w, id, from, to, polarity });
  const legs = [
    leg(spec.ids?.in ?? `${w.id}/in`, w.from, { box: m.id, port: "in" }, spec.polarity?.in ?? w.polarity),
    leg(spec.ids?.out ?? `${w.id}/out`, { box: m.id, port: "out" }, w.to, spec.polarity?.out ?? w.polarity),
  ];
  const r = rewrite(model, { delete: { wires: [w.id] }, add: { boxes: [mediator], wires: legs } });
  if (!r.ok) return internal(r, [["$.add.boxes[0]", "$.mediator"], ["$.add.wires", "$.ids", "collapse"]]);
  // The declared relation is the identity iff its rows are exactly {(v, v)} over the carrier's values.
  const rows = new Set((behavior ?? []).map((row) => JSON.stringify([row.in.in, row.out.out])));
  const identity = !!behavior && rows.size === values!.length && values!.every((v) => rows.has(JSON.stringify([v, v])));
  return {
    ok: true as const,
    model: r.model,
    legs: legs.map((l) => l.id),
    basis: r.basis,
    ...(behavior ? {
      behavior: identity
        ? { identity, basis: IDENTITY, note: "The mediator relates each value to itself, so the composite through it is the original relation: r composed with equality is r. That holds while the legs keep the original rating." }
        : { identity, note: "Compare with the baseline via triz_behavior compare_to to decide whether the mediator preserves the input→deliverable relation." },
    } : {}),
    note: "The mediator's cost and any new harms it brings are modelled only if you add them; legs inherit the original rating unless overridden.",
  };
}

/**
 * Perform a trim: delete the trimmed boxes with every wire touching them, and re-attach each
 * function they performed on a remaining box to a typed absorber (rule B or C from
 * trimCandidates). `absorb` picks an absorber per function wire; the default is the first listed
 * (most radical). Re-attached functions keep their id and rating, which is an assumption to
 * substantiate. A blocked trim (an orphaned function) fails closed: deleting its performer would
 * leave the function dangling.
 */
export function applyTrim(model: FunctionModel, spec: { trim: string[]; absorb?: Record<string, { box: string; port: string }> }) {
  const screen = trimCandidates(model, spec.trim);
  if (!screen.ok) return screen;
  if (screen.verdict === "blocked") {
    return fail(screen.orphaned.map((id) => {
      const f = screen.functions.find((x) => x.wire === id)!;
      return issue("trim-blocked", "$.trim", `function '${id}' has no typed absorber: the trim is blocked`,
        `No remaining box has an output of carrier '${f.carrier}' to take over '${id}'. Add such an output port to a remaining box (or a supersystem resource), trim its object '${f.object}' too, or keep the box that performs it.`);
    }));
  }
  const issues: Issue[] = [];
  const byWire = new Map(model.wires.map((w) => [w.id, w]));
  const absorbed = screen.functions.filter((f) => f.rule !== "A");
  for (const id of Object.keys(spec.absorb ?? {})) {
    if (!absorbed.some((f) => f.wire === id)) {
      issues.push(issue("not-an-absorbed-function", at("$.absorb", id), `absorb: '${id}' is not a function the trimmed boxes perform on a remaining box`,
        absorbed.length ? `absorb keys are the functions to re-attach: ${quoted(absorbed.map((f) => f.wire))}.` : "This trim re-attaches no function: drop absorb."));
    }
  }
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const chosen = absorbed.map((f) => {
    const pick = spec.absorb && Object.hasOwn(spec.absorb, f.wire) ? spec.absorb[f.wire] : undefined;
    const a = pick ? f.absorbers.find((x) => x.box === pick.box) : f.absorbers[0];
    const port = pick?.port ?? a?.port;
    const typed = a && (boxes.get(a.box)!.outputs ?? []).some((p) => p.id === port && p.carrier === f.carrier);
    if (!typed) {
      issues.push(issue("not-a-typed-absorber", at("$.absorb", f.wire), `absorb: '${pick!.box}.${pick!.port}' is not a typed absorber of '${f.wire}' (an output port of carrier '${f.carrier}' on a remaining box)`,
        `Pick one of the absorbers triz_trim lists for '${f.wire}': ${quoted(f.absorbers.map((x) => `${x.box}.${x.port}`))}, or omit '${f.wire}' from absorb for the first one.`));
    }
    return { wire: f.wire, box: a?.box ?? "", port: port ?? "", rule: a?.rule ?? "C", defaulted: !pick };
  });
  if (issues.length) return fail(issues);
  const trimmed = new Set(spec.trim);
  const removed = model.wires.filter((w) => trimmed.has(w.from.box) || trimmed.has(w.to.box));
  const reattached = chosen.map((c) => ({ ...byWire.get(c.wire)!, from: { box: c.box, port: c.port } }));
  const r = rewrite(model, { delete: { boxes: spec.trim, wires: removed.map((w) => w.id) }, add: { wires: reattached } });
  if (!r.ok) return internal(r, [["$.add.wires", "$.absorb", "collapse"]]);
  return {
    ok: true as const,
    model: r.model,
    chosen,
    noLongerNeeded: screen.functions.filter((f) => f.rule === "A").map((f) => f.wire),
    dropped: screen.dropped,
    removedHarms: screen.removedHarms,
    basis: [...r.basis, "typed_reroute"] as Theorem[],
    note: "Compare with the baseline via triz_function_model compare_to. Each absorber is a trimming problem to solve; its new harms are not modelled, and its added cost only where boxes declare feasibility (triz_feasibility).",
  };
}
