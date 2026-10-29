/**
 * Categorical systems kernel: TRIZ function models as typed open wiring diagrams.
 *
 * A model is a set of boxes (components) with typed input/output ports, joined by
 * wires (TRIZ functions) that carry exactly one flow type (carrier) and a polarity.
 * Every check here is finite and decidable over that data; no category theory is
 * computed. The categorical vocabulary names the structure each check is a
 * necessary condition of — see references/categorical-model.md for exactly what
 * is and is not claimed, and theory/ for the Lean statements behind the checks.
 *
 *  - checkModel        — wiring typing: endpoints exist, out→in, carriers agree. Fails closed.
 *  - harmLoops         — strongly connected regions that contain a harmful/excessive function,
 *                        with one witness cycle per such function. Useful-only feedback is not a harm.
 *  - idealityProfile   — function counts and costs per resource dimension; dimensions are never
 *                        summed, and a scalar ratio exists only under explicit weights.
 *  - compareIdeality   — baseline vs concept as a componentwise (Pareto) comparison.
 *  - trimCandidates    — TRIZ trimming rules A/B/C screened by carrier type (necessary, not sufficient).
 *  - separationCheck   — physical contradiction as a gluing problem over a finite
 *                        space × time × condition × direction × level base.
 *
 * Pure functions (data in, verdict out) so the stdio and hosted entries share them.
 */
import { z } from "zod";

const Id = z.string().min(1);

export const Polarity = z.enum(["useful", "insufficient", "excessive", "harmful"])
  .describe("TRIZ function rating: useful at the right level, useful but insufficient, useful but excessive, or harmful");
export const Layer = z.enum(["material", "energy", "information", "financial", "legal", "temporal"]);
export const Role = z.enum(["tool", "product", "mediator", "environment", "supersystem"])
  .describe("Function-analysis role; environment and supersystem boxes are resources outside the engineered system");
export const Axis = z.enum(["space", "time", "condition", "direction", "level"]);
export type Polarity = z.infer<typeof Polarity>;
export type Axis = z.infer<typeof Axis>;

export const Carrier = z.strictObject({
  id: Id,
  layer: Layer,
  dimension: z.string().min(1).describe("Unit, protocol, or measure carried, e.g. 'W thermal', 'gRPC request', 'USD/month'"),
}).meta({ id: "Carrier" });

export const Port = z.strictObject({
  id: Id.describe("Unique within its box"),
  carrier: Id.describe("Carrier id"),
  label: z.string().optional(),
}).meta({ id: "Port" });

export const Box = z.strictObject({
  id: Id,
  name: z.string().min(1),
  role: Role,
  action: z.string().optional().describe("Main action verb, e.g. 'support', 'route', 'monetize'"),
  inputs: z.array(Port).optional(),
  outputs: z.array(Port).optional(),
  cost: z.record(z.string(), z.number().nonnegative()).optional()
    .describe("Cost per resource dimension, e.g. { usd_month: 400, latency_ms: 2.5 }; dimensions are never summed together"),
}).meta({ id: "Box" });

export const Endpoint = z.strictObject({ box: Id, port: Id }).meta({ id: "Endpoint" });

export const Wire = z.strictObject({
  id: Id,
  from: Endpoint.describe("Output port of the box performing the function"),
  to: Endpoint.describe("Input port of the box the function acts on"),
  carrier: Id.describe("Carrier id; must equal both port carriers"),
  polarity: Polarity,
  verb: z.string().optional().describe("Function verb in base form, e.g. 'heat', 'cache', 'charge'"),
}).meta({ id: "Wire", description: "A TRIZ function: a typed wire from an output port of the performing box to an input port of the box acted on" });

const AxisCells = z.array(Id).min(1);
export const Demand = z.strictObject({
  id: Id,
  values: z.array(Id).min(1).describe("Admissible values of the parameter for this demand"),
  because: z.string().optional().describe("The outcome the demand protects"),
  space: AxisCells.optional(),
  time: AxisCells.optional(),
  condition: AxisCells.optional(),
  direction: AxisCells.optional(),
  level: AxisCells.optional(),
}).meta({ id: "Demand", description: "One requirement on the parameter; where a demand omits an axis it applies across that whole axis" });

export const PhysicalContradiction = z.strictObject({
  id: Id,
  parameter: z.string().min(1),
  axes: z.strictObject({
    space: AxisCells.optional(),
    time: AxisCells.optional(),
    condition: AxisCells.optional(),
    direction: AxisCells.optional(),
    level: AxisCells.optional(),
  }).optional().describe("Declared cells per axis; defaults to the cells the demands name"),
  demands: z.array(Demand).min(2),
}).meta({ id: "PhysicalContradiction" });

export const FunctionModel = z.strictObject({
  domain: z.enum(["physical", "software", "business", "cyber-physical"]),
  system: z.string().optional(),
  carriers: z.array(Carrier),
  boxes: z.array(Box),
  wires: z.array(Wire),
  budget: z.record(z.string(), z.number().nonnegative()).optional()
    .describe("Resource limit per cost dimension"),
  weights: z.record(z.string(), z.number().positive()).optional()
    .describe("Explicit normalization to a scalar ideality: one weight per cost dimension plus 'harmful'"),
  contradictions: z.array(PhysicalContradiction).optional(),
});

export type FunctionModel = z.infer<typeof FunctionModel>;
export type PhysicalContradiction = z.infer<typeof PhysicalContradiction>;
type Box = z.infer<typeof Box>;
type Wire = z.infer<typeof Wire>;

/** JSON Schema export; the committed schema file is regenerated from this (scripts/gen-schema.mjs). */
export function functionModelJsonSchema() {
  return {
    $id: "https://github.com/sv/triz-skill/skills/triz-innovation/schemas/function-model.schema.json",
    title: "FunctionModel",
    description: "TRIZ function model as a typed open wiring diagram: boxes with typed ports, wires carrying one carrier and a polarity. Generated from src/act.ts; do not edit by hand.",
    ...z.toJSONSchema(FunctionModel, { target: "draft-2020-12" }),
  };
}

const inputs = (b: Box) => b.inputs ?? [];
const outputs = (b: Box) => b.outputs ?? [];
const NEGATIVE: ReadonlySet<Polarity> = new Set(["harmful", "excessive"]);
const SUPERSYSTEM: ReadonlySet<string> = new Set(["environment", "supersystem"]);

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

export interface CheckResult { ok: boolean; errors: string[]; }

/** Typing of the wiring: every reference resolves, wires run out→in, and carriers agree. Fail closed. */
export function checkModel(model: FunctionModel): CheckResult {
  const errors: string[] = [];
  const carriers = new Set(model.carriers.map((c) => c.id));
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  for (const id of duplicates(model.carriers.map((c) => c.id))) errors.push(`duplicate carrier id '${id}'`);
  for (const id of duplicates(model.boxes.map((b) => b.id))) errors.push(`duplicate box id '${id}'`);
  for (const id of duplicates(model.wires.map((w) => w.id))) errors.push(`duplicate wire id '${id}'`);
  for (const b of model.boxes) {
    for (const id of duplicates([...inputs(b), ...outputs(b)].map((p) => p.id))) errors.push(`box '${b.id}': duplicate port id '${id}'`);
    for (const p of [...inputs(b), ...outputs(b)]) {
      if (!carriers.has(p.carrier)) errors.push(`box '${b.id}' port '${p.id}': unknown carrier '${p.carrier}'`);
    }
  }
  for (const w of model.wires) {
    if (!carriers.has(w.carrier)) errors.push(`wire '${w.id}': unknown carrier '${w.carrier}'`);
    const ends = [["from", w.from, outputs, "output"], ["to", w.to, inputs, "input"]] as const;
    for (const [side, end, ports, kind] of ends) {
      const box = boxes.get(end.box);
      if (!box) { errors.push(`wire '${w.id}' ${side}: unknown box '${end.box}'`); continue; }
      const port = ports(box).find((p) => p.id === end.port);
      if (!port) {
        const wrongWay = [...inputs(box), ...outputs(box)].some((p) => p.id === end.port);
        errors.push(wrongWay
          ? `wire '${w.id}' ${side}: port '${end.port}' of box '${end.box}' is not an ${kind}`
          : `wire '${w.id}' ${side}: box '${end.box}' has no port '${end.port}'`);
        continue;
      }
      if (port.carrier !== w.carrier) {
        errors.push(`wire '${w.id}' ${side}: carrier '${w.carrier}' does not match port '${end.box}.${end.port}' carrier '${port.carrier}'`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Tarjan's strongly connected components; deterministic over sorted ids. */
function stronglyConnected(nodes: string[], adj: Map<string, string[]>): string[][] {
  let next = 0;
  const index = new Map<string, number>(), low = new Map<string, number>();
  const stack: string[] = [], onStack = new Set<string>(), out: string[][] = [];
  const visit = (v: string) => {
    index.set(v, next); low.set(v, next); next++;
    stack.push(v); onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); scc.push(w); } while (w !== v);
      out.push(scc.sort());
    }
  };
  for (const v of nodes) if (!index.has(v)) visit(v);
  return out;
}

/** Shortest path from `start` to `goal` inside `within` (BFS, sorted neighbours). */
function shortestPath(start: string, goal: string, adj: Map<string, string[]>, within: Set<string>): string[] {
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const v = queue.shift()!;
    if (v === goal) break;
    for (const w of adj.get(v) ?? []) {
      if (within.has(w) && !prev.has(w)) { prev.set(w, v); queue.push(w); }
    }
  }
  const path: string[] = [];
  for (let v: string | null = goal; v !== null; v = prev.get(v) ?? null) path.unshift(v);
  return path;
}

export interface HarmLoop {
  boxes: string[];
  negative: string[];
  cycles: Array<{ via: string; path: string[] }>;
}

/**
 * Closed loops that a harmful or excessive function belongs to. A function u→v lies on a
 * cycle iff v reaches u, i.e. iff u and v share a strongly connected component, so this is
 * exhaustive where a single DFS pass is not. Each negative function gets one witness cycle
 * (u, v, …, u). Loops made only of useful functions are ordinary feedback and are not reported.
 */
export function harmLoops(model: FunctionModel): HarmLoop[] {
  const adj = new Map<string, string[]>();
  for (const w of model.wires) {
    const list = adj.get(w.from.box) ?? adj.set(w.from.box, []).get(w.from.box)!;
    if (!list.includes(w.to.box)) list.push(w.to.box);
  }
  for (const list of adj.values()) list.sort();
  const nodes = model.boxes.map((b) => b.id).sort();
  const loops: HarmLoop[] = [];
  for (const scc of stronglyConnected(nodes, adj)) {
    const members = new Set(scc);
    const internal = model.wires.filter((w) => members.has(w.from.box) && members.has(w.to.box));
    if (scc.length === 1 && !internal.length) continue;
    const negative = internal.filter((w) => NEGATIVE.has(w.polarity)).sort((a, b) => a.id.localeCompare(b.id));
    if (!negative.length) continue;
    loops.push({
      boxes: scc,
      negative: negative.map((w) => w.id),
      cycles: negative.map((w) => ({ via: w.id, path: [w.from.box, ...shortestPath(w.to.box, w.from.box, adj, members)] })),
    });
  }
  return loops.sort((a, b) => a.boxes[0].localeCompare(b.boxes[0]));
}

const deliverableKey = (w: Wire) => `${w.to.box}:${w.carrier}`;

export interface IdealityProfile {
  functions: Record<Polarity, number>;
  deliverables: Array<{ key: string; box: string; carrier: string; polarity: Polarity }>;
  costs: Record<string, number>;
  budget?: { overBudget: string[]; unbudgeted: string[]; withinBudget: boolean };
  ratio: { computable: true; value: number; formula: string } | { computable: false; reason: string };
}

/**
 * Ideality as a profile, not a number. Deliverables are non-harmful functions acting on a
 * product box — the value the system exists for. Costs stay per dimension; a scalar ratio
 * (useful functions / weighted costs and harms) is produced only when `weights` names every
 * cost dimension and 'harmful', because only the user can make USD and milliseconds commensurable.
 */
export function idealityProfile(model: FunctionModel): IdealityProfile {
  const functions: Record<Polarity, number> = { useful: 0, insufficient: 0, excessive: 0, harmful: 0 };
  for (const w of model.wires) functions[w.polarity]++;
  const products = new Set(model.boxes.filter((b) => b.role === "product").map((b) => b.id));
  const deliverables = model.wires
    .filter((w) => w.polarity !== "harmful" && products.has(w.to.box))
    .map((w) => ({ key: deliverableKey(w), box: w.to.box, carrier: w.carrier, polarity: w.polarity }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const costs: Record<string, number> = {};
  for (const b of model.boxes) for (const [dim, v] of Object.entries(b.cost ?? {})) costs[dim] = (costs[dim] ?? 0) + v;
  const dims = Object.keys(costs).sort();

  const profile: IdealityProfile = { functions, deliverables, costs, ratio: { computable: false, reason: "" } };
  if (model.budget) {
    const overBudget = dims.filter((d) => d in model.budget! && costs[d] > model.budget![d]);
    const unbudgeted = dims.filter((d) => !(d in model.budget!));
    profile.budget = { overBudget, unbudgeted, withinBudget: !overBudget.length && !unbudgeted.length };
  }
  const missing = [...dims, "harmful"].filter((d) => !(d in (model.weights ?? {})));
  if (missing.length) {
    profile.ratio = {
      computable: false,
      reason: `no explicit weight for ${missing.map((d) => `'${d}'`).join(", ")}; costs in different dimensions are not summed. Compare models with compareIdeality instead.`,
    };
  } else {
    const w = model.weights!;
    const useful = functions.useful + functions.insufficient + functions.excessive;
    const denominator = dims.reduce((s, d) => s + w[d] * costs[d], 0) + w.harmful * functions.harmful;
    profile.ratio = denominator === 0
      ? { computable: false, reason: "no costs and no harmful functions: the ratio is unbounded" }
      : { computable: true, value: useful / denominator, formula: "useful functions / (Σ weight·cost + weight_harmful·harmful functions)" };
  }
  return profile;
}

export type Verdict = "concept-dominates" | "baseline-dominates" | "equal" | "trade-off" | "concept-loses-functions" | "indeterminate";

/**
 * Componentwise comparison of two models of the same system (box ids must be stable). The
 * concept must keep every baseline deliverable; otherwise the verdict is a lost function, not a
 * trade-off. Remaining axes — harmful count, defective (insufficient + excessive) count, each cost
 * dimension, deliverables gained — are compared one by one, never summed. A baseline with no
 * deliverables (no function acting on a product box) gives nothing to lose, so the verdict is
 * indeterminate rather than letting an empty concept win on cost.
 */
export function compareIdeality(baseline: FunctionModel, concept: FunctionModel) {
  const a = idealityProfile(baseline), b = idealityProfile(concept);
  const after = new Set(b.deliverables.map((d) => d.key)), before = new Set(a.deliverables.map((d) => d.key));
  const lostDeliverables = [...before].filter((k) => !after.has(k));
  const gainedDeliverables = [...after].filter((k) => !before.has(k));
  const better: string[] = [], worse: string[] = [];
  const axis = (name: string, x: number, y: number) => { if (y < x) better.push(name); else if (y > x) worse.push(name); };
  axis("harmful", a.functions.harmful, b.functions.harmful);
  axis("defective", a.functions.insufficient + a.functions.excessive, b.functions.insufficient + b.functions.excessive);
  for (const d of [...new Set([...Object.keys(a.costs), ...Object.keys(b.costs)])].sort()) axis(`cost:${d}`, a.costs[d] ?? 0, b.costs[d] ?? 0);
  if (gainedDeliverables.length) better.push("deliverables");
  const verdict: Verdict = !before.size ? "indeterminate"
    : lostDeliverables.length ? "concept-loses-functions"
    : !worse.length && !better.length ? "equal"
    : !worse.length ? "concept-dominates"
    : !better.length ? "baseline-dominates"
    : "trade-off";
  const reason = !before.size
    ? "baseline has no deliverables: mark the box the main function acts on as role 'product'"
    : undefined;
  return { verdict, ...(reason ? { reason } : {}), better, worse, lostDeliverables, gainedDeliverables, baseline: a, concept: b };
}

export type TrimRule = "A" | "B" | "C";
export interface Absorber { box: string; port: string; rule: "B" | "C"; supersystem: boolean; }

/**
 * TRIZ trimming screened by carrier type. For every non-harmful function a trimmed box
 * performs: rule A if its object is trimmed too (the function is no longer needed); otherwise
 * rule B absorbers (the object has an output of the same carrier: self-service) and rule C
 * absorbers (another remaining box does, system components before supersystem resources).
 * Rules follow the MATRIZ knowledge base; absorbers are listed most radical rule first.
 * A function with no absorber is orphaned and blocks the trim. A typed match is a necessary
 * condition only: each absorber is a trimming problem to solve and substantiate, not a result.
 */
export function trimCandidates(model: FunctionModel, trim: string[]) {
  const check = checkModel(model);
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const unknown = trim.filter((id) => !boxes.has(id));
  const repeated = duplicates(trim);
  if (!check.ok || unknown.length || repeated.length || !trim.length) {
    return {
      ok: false as const,
      errors: [
        ...check.errors,
        ...unknown.map((id) => `unknown box '${id}' in trim set`),
        ...repeated.map((id) => `box '${id}' listed twice in trim set`),
        ...(trim.length ? [] : ["empty trim set"]),
      ],
    };
  }
  const trimmed = new Set(trim);
  const name = (id: string) => boxes.get(id)!.name;
  const performed = model.wires.filter((w) => trimmed.has(w.from.box) && w.polarity !== "harmful");
  const functions = performed.map((w) => {
    if (trimmed.has(w.to.box)) return { wire: w.id, carrier: w.carrier, object: w.to.box, rule: "A" as TrimRule, absorbers: [] as Absorber[] };
    const absorbers: Absorber[] = [];
    for (const b of [...boxes.values()].sort((x, y) => x.id.localeCompare(y.id))) {
      if (trimmed.has(b.id)) continue;
      const port = outputs(b).find((p) => p.carrier === w.carrier);
      if (port) absorbers.push({ box: b.id, port: port.id, rule: b.id === w.to.box ? "B" : "C", supersystem: SUPERSYSTEM.has(b.role) });
    }
    absorbers.sort((x, y) => x.rule.localeCompare(y.rule) || Number(x.supersystem) - Number(y.supersystem) || x.box.localeCompare(y.box));
    return { wire: w.id, carrier: w.carrier, object: w.to.box, rule: (absorbers[0]?.rule ?? null) as TrimRule | null, absorbers };
  });
  const orphaned = functions.filter((f) => f.rule === null).map((f) => f.wire);
  const touching = model.wires.filter((w) => trimmed.has(w.from.box) || trimmed.has(w.to.box));
  const costRelief: Record<string, number> = {};
  for (const id of trim) for (const [dim, v] of Object.entries(boxes.get(id)!.cost ?? {})) costRelief[dim] = (costRelief[dim] ?? 0) + v;
  const verb = (wire: string) => model.wires.find((w) => w.id === wire)!.verb ?? "perform its function on";
  const trimmedNames = trim.map(name).join(" and ");
  return {
    ok: true as const,
    trim,
    verdict: orphaned.length ? "blocked" as const : "typed-feasible" as const,
    functions,
    orphaned,
    dropped: touching.filter((w) => !trimmed.has(w.from.box) && w.polarity !== "harmful").map((w) => w.id),
    removedHarms: touching.filter((w) => w.polarity === "harmful").map((w) => w.id),
    costRelief,
    trimmingProblems: functions.flatMap((f) => f.absorbers.map((a) => a.rule === "B"
      ? `[B] How can ${name(f.object)} ${verb(f.wire)} itself (carrier '${f.carrier}') without ${trimmedNames}?`
      : `[C] How can ${name(a.box)}${a.supersystem ? " (supersystem)" : ""} ${verb(f.wire)} ${name(f.object)} (carrier '${f.carrier}') without ${trimmedNames}?`)),
    note: "Carrier match is necessary, not sufficient. Each absorber is a trimming problem to solve and substantiate; the absorber's added cost and new harms are not modelled here.",
  };
}

const AXES: Axis[] = Axis.options;
const MAX_CELLS = 10_000;

/**
 * Physical contradiction as gluing. Each demand admits a set of parameter values on a product
 * region of the space × time × condition × direction × level base (omitted axis = whole axis).
 * The axes are MATRIZ's five separation types; `condition` is its "relation (conditions)". A parameter
 * assignment satisfying every demand exists iff every cell's active demands share a value; on a
 * finite discrete base no cohomology is needed to decide it. For each pair of demands with no
 * common value, the axes on which their regions are disjoint are the separation principles that
 * apply; a pair overlapping on every axis is irreducible at this resolution.
 */
export function separationCheck(pc: PhysicalContradiction) {
  const errors: string[] = [];
  for (const id of duplicates(pc.demands.map((d) => d.id))) errors.push(`duplicate demand id '${id}'`);
  const universe = {} as Record<Axis, string[]>;
  for (const axis of AXES) {
    const named = [...new Set(pc.demands.flatMap((d) => d[axis] ?? []))];
    const declared = pc.axes?.[axis];
    if (declared) for (const c of named) if (!declared.includes(c)) errors.push(`axis '${axis}': cell '${c}' is not declared`);
    universe[axis] = [...new Set(declared ?? named)].sort();
  }
  const cellCount = AXES.reduce((n, a) => n * Math.max(1, universe[a].length), 1);
  if (cellCount > MAX_CELLS) errors.push(`base has ${cellCount} cells; limit is ${MAX_CELLS}`);
  if (errors.length) return { ok: false as const, errors };

  const region = (d: (typeof pc.demands)[number], axis: Axis) => d[axis] ?? universe[axis];
  const pairs = [];
  for (let i = 0; i < pc.demands.length; i++) for (let j = i + 1; j < pc.demands.length; j++) {
    const [p, q] = [pc.demands[i], pc.demands[j]];
    const shared = p.values.filter((v) => q.values.includes(v));
    if (shared.length) { pairs.push({ demands: [p.id, q.id], status: "compatible" as const, sharedValues: shared }); continue; }
    const separatingAxes = AXES.filter((a) => universe[a].length && !region(p, a).some((c) => region(q, a).includes(c)));
    pairs.push({ demands: [p.id, q.id], status: separatingAxes.length ? "separated" as const : "irreducible" as const, separatingAxes });
  }

  const cells: Array<Partial<Record<Axis, string>>> = [{}];
  for (const axis of AXES) {
    if (!universe[axis].length) continue;
    cells.splice(0, cells.length, ...cells.flatMap((c) => universe[axis].map((v) => ({ ...c, [axis]: v }))));
  }
  const conflictCells = [];
  for (const cell of cells) {
    const active = pc.demands.filter((d) => AXES.every((a) => cell[a] === undefined || region(d, a).includes(cell[a]!)));
    const admissible = active.reduce<string[] | null>((acc, d) => (acc === null ? [...d.values] : acc.filter((v) => d.values.includes(v))), null);
    if (admissible !== null && !admissible.length) conflictCells.push({ cell, demands: active.map((d) => d.id) });
  }
  const contradictory = pairs.some((p) => p.status !== "compatible");
  return {
    ok: true as const,
    parameter: pc.parameter,
    contradiction: contradictory || conflictCells.length > 0,
    gluable: conflictCells.length === 0,
    pairs,
    conflictCells: conflictCells.slice(0, 50),
    conflictCellCount: conflictCells.length,
    route: !contradictory && !conflictCells.length
      ? "No opposing demands: a value satisfies every demand. Not a physical contradiction; choose that value."
      : !conflictCells.length
        ? "Demands are already separated: assign the parameter piecewise along the separating axes."
        : "Irreducible on the conflict cells at this resolution: refine an axis (finer zones, intervals, conditions), try separation between system levels, or escalate to ARIZ.",
  };
}

/** One call for an agent: typing, harm loops, ideality profile, embedded contradictions, optional comparison. */
export function analyseModel(model: FunctionModel, compareTo?: FunctionModel) {
  const check = checkModel(model);
  if (!check.ok) return { ok: false as const, errors: check.errors };
  if (compareTo) {
    const base = checkModel(compareTo);
    if (!base.ok) return { ok: false as const, errors: base.errors.map((e) => `compare_to: ${e}`) };
  }
  return {
    ok: true as const,
    domain: model.domain,
    harmLoops: harmLoops(model),
    ideality: idealityProfile(model),
    separation: (model.contradictions ?? []).map((pc) => ({ id: pc.id, ...separationCheck(pc) })),
    comparison: compareTo ? compareIdeality(compareTo, model) : undefined,
    note: "Loops and absorbers are hypotheses about mechanism, not findings: name the causal evidence for each before acting on it.",
  };
}
