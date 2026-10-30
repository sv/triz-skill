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
 *  - checkModel        — wiring typing: endpoints exist, out→in, carriers agree; flows name a
 *                        known carrier and known boxes. Fails closed.
 *  - harmLoops         — strongly connected regions that contain a harmful/excessive function,
 *                        with one witness cycle per such function. Useful-only feedback is not a harm.
 *  - idealityProfile   — function counts and costs per resource dimension; dimensions are never
 *                        summed, and a scalar ratio exists only under explicit weights.
 *  - compareIdeality   — baseline vs concept as a componentwise (Pareto) comparison; with MPV
 *                        weights, also over the main parameters of value only (mpvComparison).
 *  - trimCandidates    — TRIZ trimming rules A/B/C screened by carrier type (necessary, not sufficient).
 *  - separationCheck   — physical contradiction as a gluing problem over a finite
 *                        space × time × condition × direction × level base.
 *  - dynamize          — the parameter as a function of one axis alone (Principle 15 along time).
 *
 * Pure functions (data in, verdict out) so the stdio and hosted entries share them.
 */
import { z } from "zod";
import { at, fail, issue, keysHint, quoted, rebase, second, where, zodHint, type Issue } from "./act-issues.js";

const Id = z.string().min(1);
/**
 * Resource-dimension key. JSON Schema validators reject `__proto__` through this pattern; zod's
 * record parser drops that key before validating it (never touching the prototype), so it can
 * neither reach nor pollute the kernel's per-dimension dictionaries.
 */
const Dim = z.string().min(1).regex(/^(?!__proto__$)/, "'__proto__' is not a usable dimension name");

export const Polarity = z.enum(["useful", "insufficient", "excessive", "harmful"], {
  error: zodHint((iss) => (iss.code === "invalid_value" ? "rate a function useful, insufficient, excessive, or harmful; rate it harmful if no level of it is useful" : undefined)),
})
  .describe("TRIZ function rating: useful at the right level, useful but insufficient, useful but excessive, or harmful");
export const Layer = z.enum(["material", "energy", "information", "financial", "legal", "temporal"]);
export const Role = z.enum(["tool", "product", "mediator", "environment", "supersystem"], {
  error: zodHint((iss) => (iss.code === "invalid_value" ? "the box the main function acts on is the product; the box performing it is the tool; boxes between are mediators; resources outside the system are environment or supersystem" : undefined)),
})
  .describe("Function-analysis role; environment and supersystem boxes are resources outside the engineered system");
export const Axis = z.enum(["space", "time", "condition", "direction", "level"]);
export type Polarity = z.infer<typeof Polarity>;
export type Axis = z.infer<typeof Axis>;

export const CarrierLevel = z.strictObject({
  value: Id.describe("A declared value of the carrier"),
  from: z.number().nonnegative().describe("Least amount that reads as this value, in the units of the feasibility rows on this carrier"),
}).meta({ id: "CarrierLevel" });

export const Carrier = z.strictObject({
  id: Id,
  layer: Layer,
  dimension: z.string().min(1).describe("Unit, protocol, or measure carried, e.g. 'W thermal', 'gRPC request', 'USD/month'"),
  values: z.array(Id).min(1).optional()
    .describe("Finite set of values the carrier can take, e.g. ['low', 'high']; required on every port of a box that declares behavior"),
  levels: z.array(CarrierLevel).min(1).optional()
    .describe("Thresholds that read a numeric amount (a feasibility row's level) as one of the declared values (a behavior row's value): an amount reads as the last level whose `from` it reaches. The list orders its values from least to most; the first starts at 0 and each `from` exceeds the one before. Requires values, e.g. [{ value: 'low', from: 0 }, { value: 'high', from: 50 }]"),
  quantity: z.enum(["intensive", "extensive"]).optional()
    .describe("How amounts on this carrier combine where one output port feeds several functions. 'intensive' (the default) is one shared level, such as a voltage, a temperature, or a copied message: the port meets the largest demand. 'extensive' is an amount that divides, such as a flow of water or a current: triz_feasibility makes the port supply the sum of the demands, and refuses an extensive input fed by several functions (model a merge box). Declare it explicitly; it is never inferred from the layer"),
}, { error: keysHint({ unit: "the unit goes in dimension", units: "the unit goes in dimension", type: "the flow type goes in layer", kind: "the flow type goes in layer", name: "a carrier has an id and a dimension, no name" }) }).meta({ id: "Carrier" });

export const Port = z.strictObject({
  id: Id.describe("Unique within its box"),
  carrier: Id.describe("Carrier id"),
  label: z.string().optional(),
}, { error: keysHint({ type: "carrier names the port's carrier id", direction: "a port's side is the list it is in: inputs or outputs", side: "a port's side is the list it is in: inputs or outputs", name: "use label for a port's display name" }) }).meta({ id: "Port" });

export const BehaviorRow = z.strictObject({
  in: z.record(z.string(), Id).describe("Input port id → value; names every input port of the box"),
  out: z.record(z.string(), Id).describe("Output port id → value; names every output port of the box"),
}).meta({ id: "BehaviorRow", description: "One admissible (inputs, outputs) pair of the box's relation" });

export const TransitionRow = z.strictObject({
  state: Id.describe("Current state; one of the box's declared state values"),
  in: z.record(z.string(), Id).describe("Input port id → value; names every input port of the box"),
  next: Id.describe("Next state; one of the box's declared state values"),
  out: z.record(z.string(), Id).describe("Output port id → value; names every output port of the box"),
}).meta({ id: "TransitionRow", description: "One admissible step of a stateful box: in this state, on these inputs, it may move to next and emit these outputs" });
const Level = z.number().nonnegative();
export const FeasibilityRow = z.strictObject({
  provides: z.record(z.string(), Level).optional()
    .describe("Output port id → level the box can provide there, in the carrier's dimension; an omitted port provides nothing (level 0)"),
  requires: z.record(z.string(), Level).optional()
    .describe("Input port id → level the box needs there to provide this row; an omitted port needs nothing. Only a non-harmful function can supply it"),
  cost: z.record(Dim, z.number().nonnegative()).optional()
    .describe("Operating resources per cost dimension, added to the box's fixed cost; an omitted dimension needs nothing"),
}).meta({ id: "FeasibilityRow", description: "One minimal (functionality provided, resources required) pair of the box's monotone feasibility relation" });

/** Bound recursive parsing before Zod descends. Reject cycles and more than eight levels. */
function safeHierarchy(value: unknown): boolean {
  const pending: Array<{ inner: unknown; depth: number; ancestors: Set<object> }> = [{ inner: value, depth: 1, ancestors: new Set() }];
  while (pending.length) {
    const { inner, depth, ancestors } = pending.pop()!;
    if (!inner || typeof inner !== "object") continue; // ordinary schema validation reports malformed input
    if (depth > 8 || ancestors.has(inner)) return false;
    const model = (inner as { model?: unknown }).model;
    if (!model || typeof model !== "object") continue;
    if (ancestors.has(model)) return false;
    const next = new Set(ancestors).add(inner).add(model);
    const boxes = (model as { boxes?: unknown }).boxes;
    if (Array.isArray(boxes)) for (const box of boxes) {
      if (box && typeof box === "object" && "inner" in box && box.inner !== undefined)
        pending.push({ inner: box.inner, depth: depth + 1, ancestors: next });
    }
  }
  return true;
}

export const Box = z.strictObject({
  id: Id,
  name: z.string().min(1),
  role: Role,
  inner: z.preprocess((value) => safeHierarchy(value) ? value : null, z.lazy((): z.ZodType<any> => Inner)).optional().describe("Nested model and explicit one-to-one outer-to-inner interface bindings"),
  action: z.string().optional().describe("Main action verb, e.g. 'support', 'route', 'monetize'"),
  inputs: z.array(Port).optional(),
  outputs: z.array(Port).optional(),
  cost: z.record(Dim, z.number().nonnegative()).optional()
    .describe("Cost per resource dimension, e.g. { usd_month: 400, latency_ms: 2.5 }; dimensions are never summed together"),
  behavior: z.array(BehaviorRow).min(1).optional()
    .describe("Declared behaviour: a finite relation from input-port values to output-port values over the carriers' declared values. An input tuple with no row cannot occur; several rows for one input tuple are alternatives. Omit when unknown"),
  producible: z.array(BehaviorRow).min(1).optional()
    .describe("For a box whose behaviour is unknown: the rows it can physically produce, over the carriers' declared values, as behavior rows. triz_behavior weakest_spec keeps only these, and reports the rows the target needs that the box cannot produce. A box declares behavior or producible, not both"),
  state: z.array(Id).min(1).optional()
    .describe("Declared state: the finite set of values the box carries from one step to the next. Requires transition"),
  initial: z.array(Id).min(1).optional().describe("States the box may start in; a subset of state"),
  transition: z.array(TransitionRow).min(1).optional()
    .describe("Declared dynamics: rows (state, inputs) → (next state, outputs) over the declared state and carrier values, making the box a nondeterministic Mealy machine. A (state, inputs) pair with no row cannot occur; several rows are alternatives. Requires state; a box declares behavior or transition, not both"),
  feasibility: z.array(FeasibilityRow).min(1).optional()
    .describe("Monotone co-design feasibility: the minimal rows the box can work at, each a level provided per output port against the levels it requires per input port and its operating cost. Read monotonically: providing less never needs more, and more resources never hurt. No row may be dominated by another. An output port of an intensive carrier has one level shared by every function on it; on an extensive carrier (`quantity`) the demands of its functions add up. Omit when unknown"),
}, {
  error: keysHint({
    ports: "list input ports under inputs and output ports under outputs",
    type: "the function-analysis role goes in role", kind: "the function-analysis role goes in role",
    label: "a box's display name goes in name", functions: "functions are wires, listed at the model's top level",
    wires: "functions are wires, listed at the model's top level",
  }),
}).meta({ id: "Box" });

export const Endpoint = z.strictObject({ box: Id, port: Id }, {
  error: keysHint({ boxId: "use box and port", portId: "use box and port", id: "an endpoint names a box and one of its ports: { box, port }" }, "an endpoint is { box: '<box id>', port: '<port id>' }, not a 'box.port' string"),
}).meta({ id: "Endpoint" });

export const Wire = z.strictObject({
  id: Id,
  from: Endpoint.describe("Output port of the box performing the function"),
  to: Endpoint.describe("Input port of the box the function acts on"),
  carrier: Id.describe("Carrier id; must equal both port carriers"),
  polarity: Polarity,
  verb: z.string().optional().describe("Function verb in base form, e.g. 'heat', 'cache', 'charge'"),
}, {
  error: keysHint({
    source: "a wire runs from an output endpoint to an input endpoint: use from and to", target: "a wire runs from an output endpoint to an input endpoint: use from and to",
    rating: "the rating goes in polarity", type: "the rating goes in polarity", kind: "the rating goes in polarity",
    name: "the function's verb goes in verb", label: "the function's verb goes in verb", function: "the function's verb goes in verb",
  }),
}).meta({ id: "Wire", description: "A TRIZ function: a typed wire from an output port of the performing box to an input port of the box acted on" });

export const Flow = z.strictObject({
  id: Id,
  carrier: Id.describe("Carrier id: what moves along the flow, e.g. water, a request, cash"),
  path: z.array(Id).min(2).describe("Box ids in the order the flow passes through them, in series. A box listed again later closes a loop; a box may not follow itself"),
  medium: Id.optional().describe("The box that stands for what flows, when the boxes on the path act on it rather than pass it on, e.g. a 'water' or 'request' product box"),
  name: z.string().optional(),
}).meta({ id: "Flow", description: "A flow path: the boxes a carrier passes through in series, in order. It records order along the flow, which functions do not: two boxes in series need not act on each other" });

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
  flows: z.array(Flow).optional()
    .describe("Flow paths: which boxes a carrier passes through, in order. Read by triz_flow and by merge's adjacent reading; the other checks ignore them"),
  budget: z.record(Dim, z.number().nonnegative()).optional()
    .describe("Resource limit per cost dimension"),
  weights: z.record(Dim, z.number().positive()).optional()
    .describe("Explicit normalization to a scalar ideality: one weight per cost dimension plus 'harmful'"),
  contradictions: z.array(PhysicalContradiction).optional(),
}, {
  error: keysHint({
    functions: "functions are wires", edges: "functions are wires", links: "functions are wires",
    components: "components are boxes", nodes: "components are boxes", elements: "components are boxes",
  }),
});

/** A hierarchy interface binds outer port ids to ports on the inner diagram. */
export const Inner = z.strictObject({
  model: FunctionModel,
  inputs: z.array(z.strictObject({ outer: Id, inner: Endpoint })),
  outputs: z.array(z.strictObject({ outer: Id, inner: Endpoint })),
}).meta({ id: "Inner" });

export type FunctionModel = z.infer<typeof FunctionModel>;
export type PhysicalContradiction = z.infer<typeof PhysicalContradiction>;
export type FeasibilityRow = z.infer<typeof FeasibilityRow>;
export type Flow = z.infer<typeof Flow>;
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
/** Useful functions at the wrong level. */
const LEVEL_DEFECT: ReadonlySet<Polarity> = new Set(["insufficient", "excessive"]);
const SUPERSYSTEM: ReadonlySet<string> = new Set(["environment", "supersystem"]);

/** Own-property lookup: dimension names are user data, so never read inherited keys like `constructor`. */
const own = (dict: Record<string, number> | undefined, key: string): number | undefined =>
  dict && Object.hasOwn(dict, key) ? dict[key] : undefined;

/** Sum per-dimension costs into a Map, then emit a plain object whose keys are all own. */
function sumCosts(costs: Iterable<Record<string, number> | undefined>): Record<string, number> {
  const total = new Map<string, number>();
  for (const c of costs) for (const [dim, v] of Object.entries(c ?? {})) total.set(dim, (total.get(dim) ?? 0) + v);
  return Object.fromEntries(total);
}

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

/**
 * Typing of declared rows: every port's carrier declares its values, and every row gives each
 * input and output port exactly one declared value. A stateful box declares state and transition
 * together, with initial and every row's state and next among its states, and declares no
 * behavior. Unknown ports, values, and states fail closed.
 */
function rowIssues(b: Box, bi: number, carriers: FunctionModel["carriers"], root: string): Issue[] {
  const issues: Issue[] = [];
  const here = (...segments: Array<string | number>) => at(root, "boxes", bi, ...segments);
  if (b.transition && !b.state) issues.push(issue("incomplete-state-machine", here("transition"), `box '${b.id}' declares transition without state`, `Declare state on '${b.id}': the values it carries from one step to the next, which the rows' state and next name. Or drop transition and declare behavior.`));
  if (b.state && !b.transition) issues.push(issue("incomplete-state-machine", here("state"), `box '${b.id}' declares state without transition`, `Declare transition rows { state, in, next, out } on '${b.id}', or drop state.`));
  if (b.initial && !b.state) issues.push(issue("incomplete-state-machine", here("initial"), `box '${b.id}' declares initial without state`, `Declare state on '${b.id}' (initial is a subset of it), or drop initial.`));
  if (b.behavior && b.transition) issues.push(issue("behavior-and-transition", here("behavior"), `box '${b.id}' declares both behavior and transition: a stateless box declares behavior, a stateful one transition`, `Keep one: behavior if '${b.id}' has no memory, transition (with state) if it does.`));
  if (b.producible && (b.behavior || b.transition)) issues.push(issue("producible-with-rows", here("producible"), `box '${b.id}' declares producible with ${b.behavior ? "behavior" : "transition"}: producible bounds a box whose behaviour is unknown`, `Keep one: drop producible if the rows of '${b.id}' are known, or drop its ${b.behavior ? "behavior" : "transition"} to have weakest_spec specify it within producible.`));
  for (const s of duplicates(b.state ?? [])) issues.push(issue("duplicate-id", here("state", second(b.state!, s)), `box '${b.id}': duplicate state '${s}'`, `List state '${s}' once.`));
  const states = new Set(b.state ?? []);
  if (b.state) (b.initial ?? []).forEach((s, k) => {
    if (!states.has(s)) issues.push(issue("undeclared-state", here("initial", k), `box '${b.id}': initial state '${s}' is not declared in state`, `Use one of ${quoted(states)}, or add '${s}' to state.`));
  });
  if (b.state) b.transition?.forEach((row, i) => {
    for (const [field, s] of [["state", row.state], ["next", row.next]] as const) {
      if (!states.has(s)) issues.push(issue("undeclared-state", here("transition", i, field), `box '${b.id}' transition row ${i}: ${field} '${s}' is not declared in state`, `Use one of ${quoted(states)}, or add '${s}' to state.`));
    }
  });
  const values = new Map(carriers.map((c) => [c.id, c.values]));
  for (const [kind, rows] of [["behavior", b.behavior], ["transition", b.transition], ["producible", b.producible]] as const) {
    if (!rows) continue;
    for (const p of [...inputs(b), ...outputs(b)]) {
      if (values.has(p.carrier) && !values.get(p.carrier)) {
        issues.push(issue("no-declared-values", where.carrier({ carriers, boxes: [], wires: [] }, p.carrier, root), `box '${b.id}' declares ${kind}, but carrier '${p.carrier}' of port '${p.id}' declares no values`, `Declare values on carrier '${p.carrier}' (e.g. ["low", "high"]), or drop ${kind} from '${b.id}'.`));
      }
    }
    rows.forEach((row, i) => {
      for (const [side, field, ports, given] of [["input", "in", inputs(b), row.in], ["output", "out", outputs(b), row.out]] as const) {
        for (const k of Object.keys(given)) {
          if (!ports.some((p) => p.id === k)) issues.push(issue("row-unknown-port", here(kind, i, field, k), `box '${b.id}' ${kind} row ${i}: no ${side} port '${k}'`, `Key ${field} by the ${side} ports of '${b.id}': ${quoted(ports.map((p) => p.id))}.`));
        }
        for (const p of ports) {
          const declared = values.get(p.carrier);
          if (!Object.hasOwn(given, p.id)) {
            issues.push(issue("row-missing-value", here(kind, i, field), `box '${b.id}' ${kind} row ${i}: ${side} port '${p.id}' has no value`, `Give '${p.id}' a value in this row${declared ? `: one of ${quoted(declared)}` : ""}. A row names every ${side} port.`));
            continue;
          }
          if (declared && !declared.includes(given[p.id])) issues.push(issue("undeclared-value", here(kind, i, field, p.id), `box '${b.id}' ${kind} row ${i}: value '${given[p.id]}' of port '${p.id}' is not declared by carrier '${p.carrier}'`, `Use one of ${quoted(declared)}, or add '${given[p.id]}' to carrier '${p.carrier}' values.`));
        }
      }
    });
  }
  return issues;
}

/**
 * Typing of a feasibility relation: rows name only the box's own ports, output ports under
 * `provides` and input ports under `requires`, and the rows are minimal. Row j is dominated by
 * row i when i provides at least as much at every output port and needs at most as much at every
 * input port and cost dimension (an omitted entry is 0). Monotone reading makes a dominated row
 * redundant, so it fails closed rather than being dropped silently.
 */
function feasibilityIssues(b: Box, bi: number, root: string): Issue[] {
  if (!b.feasibility) return [];
  const issues: Issue[] = [];
  const here = (...segments: Array<string | number>) => at(root, "boxes", bi, "feasibility", ...segments);
  b.feasibility.forEach((row, i) => {
    for (const [field, ports, kind, other, otherField] of [["provides", outputs(b), "output", inputs(b), "requires"], ["requires", inputs(b), "input", outputs(b), "provides"]] as const) {
      for (const k of Object.keys(row[field] ?? {})) {
        if (ports.some((p) => p.id === k)) continue;
        issues.push(issue("row-unknown-port", here(i, field, k), `box '${b.id}' feasibility row ${i}: no ${kind} port '${k}'`, other.some((p) => p.id === k)
          ? `'${k}' is ${kind === "output" ? "an input" : "an output"} port: list it under ${otherField}.`
          : `${field} names ${kind} ports of '${b.id}': ${quoted(ports.map((p) => p.id))}.`));
      }
    }
  });
  const dims = [...new Set(b.feasibility.flatMap((r) => Object.keys(r.cost ?? {})))];
  const atLeast = (x: FeasibilityRow, y: FeasibilityRow) =>
    outputs(b).every((p) => (own(x.provides, p.id) ?? 0) >= (own(y.provides, p.id) ?? 0))
    && inputs(b).every((p) => (own(x.requires, p.id) ?? 0) <= (own(y.requires, p.id) ?? 0))
    && dims.every((d) => (own(x.cost, d) ?? 0) <= (own(y.cost, d) ?? 0));
  b.feasibility.forEach((row, j) => {
    const i = b.feasibility!.findIndex((other, k) => k !== j && atLeast(other, row));
    if (i < 0) return;
    const repeat = atLeast(row, b.feasibility![i]);
    if (repeat && i > j) return;
    issues.push(repeat
      ? issue("dominated-row", here(j), `box '${b.id}' feasibility row ${j} repeats row ${i}: drop one`, `Delete feasibility row ${j} of '${b.id}' (or row ${i}): they are the same row.`)
      : issue("dominated-row", here(j), `box '${b.id}' feasibility row ${j} is dominated by row ${i}: it provides no more and needs no less; drop it`, `Delete feasibility row ${j} of '${b.id}': row ${i} provides at least as much for no more. If row ${j} should win somewhere, lower one of its requirements or costs, or raise what it provides.`));
  });
  return issues;
}

/**
 * Typing of a carrier's levels: they need declared values, name each declared value at most once,
 * start at 0 (every amount is non-negative, so every amount reads as some value), and strictly
 * increase. That makes the reading of amounts as values monotone and a Galois connection
 * (level_monotone, level_gc).
 */
function levelIssues(c: FunctionModel["carriers"][number], ci: number, root: string): Issue[] {
  if (!c.levels) return [];
  const here = (...segments: Array<string | number>) => at(root, "carriers", ci, ...segments);
  if (!c.values) {
    return [issue("no-declared-values", here("levels"), `carrier '${c.id}' declares levels without values`,
      `Declare values on carrier '${c.id}', listing ${quoted(c.levels.map((l) => l.value))} from least to most, or drop levels.`)];
  }
  const issues: Issue[] = [];
  c.levels.forEach((l, k) => {
    if (!c.values!.includes(l.value)) issues.push(issue("undeclared-value", here("levels", k, "value"), `carrier '${c.id}': level value '${l.value}' is not declared in values`, `Use one of ${quoted(c.values!)}, or add '${l.value}' to values.`));
  });
  const named = c.levels.map((l) => l.value);
  for (const v of duplicates(named)) issues.push(issue("duplicate-id", here("levels", second(named, v)), `carrier '${c.id}': level value '${v}' is listed twice`, `Give value '${v}' one level: each level is the least amount that reads as its value.`));
  if (c.levels[0].from !== 0) {
    issues.push(issue("invalid-levels", here("levels", 0, "from"), `carrier '${c.id}': the first level ('${c.levels[0].value}') must start at 0, so that every amount reads as a value; it starts at ${c.levels[0].from}`,
      `Set the first level's from to 0; to leave amounts below ${c.levels[0].from} out, add a lower value starting at 0 before '${c.levels[0].value}'.`));
  }
  c.levels.forEach((l, i) => {
    const prev = c.levels![i - 1];
    if (i && l.from <= prev.from) {
      issues.push(issue("invalid-levels", here("levels", i, "from"), `carrier '${c.id}': levels must increase: '${l.value}' from ${l.from} does not exceed '${prev.value}' from ${prev.from}`,
        `List the levels from least to most amount, each from above the one before: raise '${l.value}' above ${prev.from}, or reorder.`));
    }
  });
  return issues;
}

export interface CheckResult { ok: boolean; errors: string[]; issues: Issue[]; }

/**
 * Typing of the wiring: every reference resolves, wires run out→in, and carriers agree. Fail
 * closed. Issue paths start at `root` (default `$`, the model itself).
 */
export function checkModel(model: FunctionModel, root = "$", depth = 0, ancestors = new Set<object>()): CheckResult {
  const issues: Issue[] = [];
  if (depth > 8 || ancestors.has(model)) {
    const problem = issue("hierarchy-depth", root, "hierarchy is cyclic or exceeds eight nested levels", "Remove the cycle or reduce nesting to eight levels.");
    return { ok: false, errors: [problem.message], issues: [problem] };
  }
  const nextAncestors = new Set(ancestors).add(model);
  const carriers = new Set(model.carriers.map((c) => c.id));
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const carrierIds = model.carriers.map((c) => c.id), boxIds = model.boxes.map((b) => b.id), wireIds = model.wires.map((w) => w.id);
  for (const [kind, ids] of [["carrier", carrierIds], ["box", boxIds], ["wire", wireIds]] as const) {
    const list = kind === "carrier" ? "carriers" : kind === "box" ? "boxes" : "wires";
    for (const id of duplicates(ids)) {
      issues.push(issue("duplicate-id", at(root, list, second(ids, id)), `duplicate ${kind} id '${id}'`, `Rename one of the two ${kind}s '${id}': ${kind} ids must be unique.`));
    }
  }
  model.carriers.forEach((c, ci) => {
    for (const v of duplicates(c.values ?? [])) issues.push(issue("duplicate-id", at(root, "carriers", ci, "values", second(c.values!, v)), `carrier '${c.id}': duplicate value '${v}'`, `List value '${v}' once.`));
  });
  model.carriers.forEach((c, ci) => issues.push(...levelIssues(c, ci, root)));
  model.boxes.forEach((b, bi) => {
    const ports = [...inputs(b).map((p, j) => ["inputs", j, p] as const), ...outputs(b).map((p, j) => ["outputs", j, p] as const)];
    const portIds = ports.map(([, , p]) => p.id);
    for (const id of duplicates(portIds)) {
      const [side, j] = ports[second(portIds, id)];
      issues.push(issue("duplicate-id", at(root, "boxes", bi, side, j), `box '${b.id}': duplicate port id '${id}'`, `Rename one of the two ports '${id}' of '${b.id}': port ids are unique within a box, across inputs and outputs.`));
    }
    for (const [side, j, p] of ports) {
      if (!carriers.has(p.carrier)) {
        issues.push(issue("unknown-carrier", at(root, "boxes", bi, side, j, "carrier"), `box '${b.id}' port '${p.id}': unknown carrier '${p.carrier}'`, `Declare carrier '${p.carrier}' in carriers, or use one of ${quoted(carrierIds)}.`));
      }
    }
    issues.push(...rowIssues(b, bi, model.carriers, root), ...feasibilityIssues(b, bi, root));
    if (b.inner) {
      const path = at(root, "boxes", bi, "inner");
      const shape = z.strictObject({ model: z.record(z.string(), z.unknown()), inputs: z.array(z.strictObject({ outer: Id, inner: Endpoint })), outputs: z.array(z.strictObject({ outer: Id, inner: Endpoint })) }).safeParse(b.inner);
      if (!shape.success) {
        issues.push(issue("invalid-inner-model", path, `box '${b.id}': invalid inner declaration`, "Provide a model and input/output binding arrays."));
        return;
      }
      if (depth >= 8 || nextAncestors.has(b.inner.model)) {
        issues.push(issue("hierarchy-depth", path, "hierarchy is cyclic or exceeds eight nested levels", "Remove the cycle or reduce nesting to eight levels."));
        return;
      }
      const parsed = FunctionModel.omit({ boxes: true }).safeParse(Object.fromEntries(Object.entries(b.inner.model).filter(([key]) => key !== "boxes")));
      if (!parsed.success || !Array.isArray(b.inner.model.boxes) || b.inner.model.boxes.some((box: unknown) => !box || typeof box !== "object" || !Box.omit({ inner: true }).safeParse(Object.fromEntries(Object.entries(box).filter(([key]) => key !== "inner"))).success)) {
        issues.push(issue("invalid-inner-model", at(path, "model"), `box '${b.id}': invalid inner model`, "Provide a complete function model inside inner.model."));
        return;
      }
      const inner = b.inner.model as FunctionModel;
      issues.push(...checkModel(inner, at(path, "model"), depth + 1, nextAncestors).issues);
      if (b.behavior || b.producible || b.state || b.initial || b.transition || b.feasibility || b.cost) {
        issues.push(issue("hierarchy-summary", path, `box '${b.id}': inner model cannot be combined with an unchecked outer summary`, "Remove outer behavior, producible, state, initial, transition, feasibility, and cost; analyze the inner model explicitly."));
      }
      for (const side of ["inputs", "outputs"] as const) {
        const bindings: { outer: string; inner: { box: string; port: string } }[] = b.inner[side];
        const outerPorts = b[side] ?? [];
        const ids = bindings.map(x => x.outer);
        const ends = bindings.map(x => JSON.stringify([x.inner.box, x.inner.port]));
        const boundary = inner.boxes.flatMap(box => (box[side] ?? []).filter(port => !inner.wires.some(w => side === "inputs" ? w.to.box === box.id && w.to.port === port.id : w.from.box === box.id && w.from.port === port.id)).map(port => JSON.stringify([box.id, port.id])));
        if (duplicates(ids).length || duplicates(ends).length || outerPorts.some(p => !ids.includes(p.id)) || boundary.some(x => !ends.includes(x)))
          issues.push(issue("hierarchy-interface", at(path, side), `box '${b.id}': ${side} interface must bind each outer port and each exposed inner port exactly once`, "Supply unique, total interface bindings."));
        bindings.forEach((binding, i) => {
          const op = outerPorts.find(p => p.id === binding.outer);
          const ib = inner.boxes.find(box => box.id === binding.inner.box);
          const ip = ib?.[side]?.find(p => p.id === binding.inner.port);
          const boundInput = side === "inputs" && inner.wires.some(w => w.to.box === binding.inner.box && w.to.port === binding.inner.port);
          const oc = model.carriers.find(c => c.id === op?.carrier), ic = inner.carriers.find(c => c.id === ip?.carrier);
          const equalCarrier = oc && ic && oc.id === ic.id && oc.layer === ic.layer && oc.dimension === ic.dimension && (oc.quantity ?? "intensive") === (ic.quantity ?? "intensive") && JSON.stringify([...(oc.values ?? [])].sort()) === JSON.stringify([...(ic.values ?? [])].sort()) && JSON.stringify(oc.levels ?? []) === JSON.stringify(ic.levels ?? []);
          if (!op || !ip || boundInput || !equalCarrier)
            issues.push(issue("hierarchy-binding", at(path, side, i), `box '${b.id}': invalid ${side} binding for '${binding.outer}'`, "Bind the correct outer side to an inner port of the same side and carrier declaration; inner inputs must be unwired."));
        });
      }
    }
  });
  model.wires.forEach((w, wi) => {
    if (!carriers.has(w.carrier)) issues.push(issue("unknown-carrier", at(root, "wires", wi, "carrier"), `wire '${w.id}': unknown carrier '${w.carrier}'`, `Declare carrier '${w.carrier}' in carriers, or use one of ${quoted(carrierIds)}.`));
    const ends = [["from", w.from, outputs, "output", "outputs"], ["to", w.to, inputs, "input", "inputs"]] as const;
    for (const [side, end, ports, kind, list] of ends) {
      const box = boxes.get(end.box);
      if (!box) {
        issues.push(issue("unknown-box", at(root, "wires", wi, side, "box"), `wire '${w.id}' ${side}: unknown box '${end.box}'`, `Use one of the model's box ids ${quoted(boxIds)}, or add box '${end.box}'.`));
        continue;
      }
      const port = ports(box).find((p) => p.id === end.port);
      if (!port) {
        const wrongWay = [...inputs(box), ...outputs(box)].some((p) => p.id === end.port);
        issues.push(wrongWay
          ? issue("wrong-port-side", at(root, "wires", wi, side, "port"), `wire '${w.id}' ${side}: port '${end.port}' of box '${end.box}' is not an ${kind}`,
            `A function runs from an output port of its performer to an input port of its object. Use one of the ${kind} ports of '${end.box}' (${quoted(ports(box).map((p) => p.id))}), move '${end.port}' to ${list}, or swap from and to if the direction is reversed.`)
          : issue("unknown-port", at(root, "wires", wi, side, "port"), `wire '${w.id}' ${side}: box '${end.box}' has no port '${end.port}'`,
            `Use one of the ${kind} ports of '${end.box}' (${quoted(ports(box).map((p) => p.id))}), or add { id: '${end.port}', carrier: '${w.carrier}' } to its ${list}.`));
        continue;
      }
      if (port.carrier !== w.carrier) {
        issues.push(issue("carrier-mismatch", at(root, "wires", wi, "carrier"), `wire '${w.id}' ${side}: carrier '${w.carrier}' does not match port '${end.box}.${end.port}' carrier '${port.carrier}'`,
          `A wire carries its ports' carrier: set the wire's carrier to '${port.carrier}', or attach it to a port of carrier '${w.carrier}'.`));
      }
    }
  });
  issues.push(...flowIssues(model, carriers, boxes, root));
  return { ok: issues.length === 0, errors: issues.map((i) => i.message), issues };
}

/** Typing of flows: unique ids, a known carrier, known boxes and medium, and no box directly after itself. */
function flowIssues(model: FunctionModel, carriers: Set<string>, boxes: Map<string, Box>, root: string): Issue[] {
  const flows = model.flows ?? [];
  const ids = flows.map((f) => f.id), boxIds = [...boxes.keys()];
  const issues = duplicates(ids).map((id) => issue("duplicate-id", at(root, "flows", second(ids, id)), `duplicate flow id '${id}'`, `Rename one of the two flows '${id}': flow ids must be unique.`));
  flows.forEach((f, fi) => {
    if (!carriers.has(f.carrier)) {
      issues.push(issue("unknown-carrier", at(root, "flows", fi, "carrier"), `flow '${f.id}': unknown carrier '${f.carrier}'`, `Declare carrier '${f.carrier}' in carriers, or use one of ${quoted(carriers)}.`));
    }
    const seen = new Set<string>();
    f.path.forEach((id, i) => {
      if (!boxes.has(id) && !seen.has(id)) issues.push(issue("unknown-box", at(root, "flows", fi, "path", i), `flow '${f.id}': unknown box '${id}'`, `List boxes of the model on the path: ${quoted(boxIds)}, or add box '${id}'.`));
      seen.add(id);
    });
    if (f.medium !== undefined && !boxes.has(f.medium)) {
      issues.push(issue("unknown-box", at(root, "flows", fi, "medium"), `flow '${f.id}': unknown medium box '${f.medium}'`, `Name the box that stands for what flows (${quoted(boxIds)}), or drop medium.`));
    }
    f.path.forEach((id, i) => {
      if (i > 0 && f.path[i - 1] === id) {
        issues.push(issue("flow-repeats-box", at(root, "flows", fi, "path", i), `flow '${f.id}': box '${id}' follows itself at position ${i}`, `Drop the repeated '${id}': a step joins two different boxes. To return to '${id}' later, list the boxes in between.`));
      }
    });
  });
  return issues;
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

/** Shortest path from `start` to `goal` inside `within` (BFS, sorted neighbours); [] if unreachable. */
export function shortestPath(start: string, goal: string, adj: Map<string, string[]>, within: Set<string>): string[] {
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const v = queue.shift()!;
    if (v === goal) break;
    for (const w of adj.get(v) ?? []) {
      if (within.has(w) && !prev.has(w)) { prev.set(w, v); queue.push(w); }
    }
  }
  if (!prev.has(goal)) return [];
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
      cycles: negative.map((w) => {
        const back = shortestPath(w.to.box, w.from.box, adj, members);
        // Same-SCC membership guarantees a return path; never emit a witness without one.
        if (!back.length) throw new Error(`harmLoops invariant: no return path ${w.to.box} → ${w.from.box} for '${w.id}'`);
        return { via: w.id, path: [w.from.box, ...back] };
      }),
    });
  }
  return loops.sort((a, b) => a.boxes[0].localeCompare(b.boxes[0]));
}

/** A product function is identified by the product box, the input port it arrives on, and its carrier. */
const deliverableKey = (w: Wire) => JSON.stringify([w.to.box, w.to.port, w.carrier]);

export interface IdealityProfile {
  incompleteHierarchy?: string[];
  functions: Record<Polarity, number>;
  deliverables: Array<{ key: string; box: string; port: string; carrier: string; polarity: Polarity }>;
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
    .map((w) => ({ key: deliverableKey(w), box: w.to.box, port: w.to.port, carrier: w.carrier, polarity: w.polarity }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const costs = sumCosts(model.boxes.map((b) => b.cost));
  const dims = Object.keys(costs).sort();

  const profile: IdealityProfile = { functions, deliverables, costs, ratio: { computable: false, reason: "" } };
  const nested = model.boxes.filter(b => b.inner).map(b => b.id);
  if (nested.length) {
    profile.incompleteHierarchy = nested;
    profile.ratio = { computable: false, reason: "Inner models hide functions and costs; expand hierarchy before comparing ideality or checking budgets. Listed counts and costs describe only the outer wiring." };
    return profile;
  }
  if (model.budget) {
    const overBudget = dims.filter((d) => (own(model.budget, d) ?? Infinity) < costs[d]);
    const unbudgeted = dims.filter((d) => own(model.budget, d) === undefined);
    profile.budget = { overBudget, unbudgeted, withinBudget: !overBudget.length && !unbudgeted.length };
  }
  const missing = [...dims, "harmful"].filter((d) => own(model.weights, d) === undefined);
  if (missing.length) {
    profile.ratio = {
      computable: false,
      reason: `no explicit weight for ${missing.map((d) => `'${d}'`).join(", ")}; costs in different dimensions are not summed. Compare models with compareIdeality instead.`,
    };
  } else {
    const weight = (d: string) => own(model.weights, d)!;
    const useful = functions.useful + functions.insufficient + functions.excessive;
    const denominator = dims.reduce((s, d) => s + weight(d) * costs[d], 0) + weight("harmful") * functions.harmful;
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
export function compareIdeality(baseline: FunctionModel, concept: FunctionModel, opts: { mpvWeights?: Record<string, number> } = {}) {
  const a = idealityProfile(baseline), b = idealityProfile(concept);
  const after = new Set(b.deliverables.map((d) => d.key)), before = new Set(a.deliverables.map((d) => d.key));
  const lostDeliverables = [...before].filter((k) => !after.has(k));
  const gainedDeliverables = [...after].filter((k) => !before.has(k));
  const better: string[] = [], worse: string[] = [];
  const axis = (name: string, x: number, y: number) => { if (y < x) better.push(name); else if (y > x) worse.push(name); };
  axis("harmful", a.functions.harmful, b.functions.harmful);
  axis("defective", a.functions.insufficient + a.functions.excessive, b.functions.insufficient + b.functions.excessive);
  for (const d of [...new Set([...Object.keys(a.costs), ...Object.keys(b.costs)])].sort()) axis(`cost:${d}`, own(a.costs, d) ?? 0, own(b.costs, d) ?? 0);
  if (gainedDeliverables.length) better.push("deliverables");
  const incomplete = !!(a.incompleteHierarchy?.length || b.incompleteHierarchy?.length);
  const verdict: Verdict = incomplete || !before.size ? "indeterminate"
    : lostDeliverables.length ? "concept-loses-functions"
    : !worse.length && !better.length ? "equal"
    : !worse.length ? "concept-dominates"
    : !better.length ? "baseline-dominates"
    : "trade-off";
  const reason = incomplete ? "Expand hierarchy before comparing ideality; inner functions and costs are not included." : !before.size
    ? "baseline has no deliverables: mark the box the main function acts on as role 'product'"
    : undefined;
  const mpv = opts.mpvWeights ? mpvComparison(a, b, opts.mpvWeights, { verdict, better, worse }) : undefined;
  return { verdict, ...(reason ? { reason } : {}), better, worse, lostDeliverables, gainedDeliverables, baseline: a, concept: b, ...(mpv ? { mpv } : {}) };
}

/**
 * The comparison restricted to the main parameters of value (workflow.md). `weights` names the MPV
 * axes, cost dimensions or 'harmful', each with the user's explicit weight; nothing else is an MPV,
 * and no weight is ever filled in. Each MPV axis is compared componentwise (`pareto`), and the
 * weighted sum Σ weight·value over the MPV axes alone, lower being better, ranks the two models
 * (`verdict`). Axes outside the MPV set that differ are listed (`ignored`), so nothing the MPV view
 * leaves out is hidden. A lost deliverable, or a baseline without deliverables, decides the verdict
 * as in compareIdeality. These weights never make the scalar ideality ratio computable: that still
 * needs `weights` on the model.
 */
export function mpvComparison(a: IdealityProfile, b: IdealityProfile, weights: Record<string, number>, full: { verdict: Verdict; better: string[]; worse: string[] }) {
  if (a.incompleteHierarchy?.length || b.incompleteHierarchy?.length) return fail([issue("hierarchy-substitution", "$.model", "MPV comparison requires expanded hierarchy", "Expand nested boxes before comparing costs or function counts.")]);
  const dims = new Set([...Object.keys(a.costs), ...Object.keys(b.costs)]);
  const names = Object.keys(weights).sort();
  const known = quoted([...[...dims].sort(), "harmful"]);
  const issues = [
    ...(names.length ? [] : [issue("empty-set", "$.mpv_weights", "mpv_weights names no dimension: give each main parameter of value its explicit weight", `Name the main parameters of value with a positive weight each, from ${known}.`)]),
    ...names.filter((d) => d !== "harmful" && !dims.has(d)).map((d) => issue("unknown-cost-dimension", at("$.mpv_weights", d), `mpv_weights: '${d}' is not a cost dimension of either model, nor 'harmful'`, `Weight a cost dimension of the models or 'harmful': ${known}.`)),
    ...names.filter((d) => !(own(weights, d)! > 0)).map((d) => issue("invalid-weight", at("$.mpv_weights", d), `mpv_weights: the weight of '${d}' must be positive`, `Give '${d}' a positive weight, or leave it out of mpv_weights.`)),
  ];
  if (issues.length) return fail(issues);
  const axisName = (d: string) => (d === "harmful" ? "harmful" : `cost:${d}`);
  const value = (p: IdealityProfile, d: string) => (d === "harmful" ? p.functions.harmful : own(p.costs, d) ?? 0);
  const axes = names.map(axisName);
  const better = full.better.filter((x) => axes.includes(x)), worse = full.worse.filter((x) => axes.includes(x));
  const ignored = [...full.better, ...full.worse].filter((x) => !axes.includes(x)).sort();
  const weighted = (p: IdealityProfile) => names.reduce((s, d) => s + own(weights, d)! * value(p, d), 0);
  const [x, y] = [weighted(a), weighted(b)];
  const pareto = !worse.length && !better.length ? "equal" as const : !worse.length ? "concept-dominates" as const : !better.length ? "baseline-dominates" as const : "trade-off" as const;
  const decided = full.verdict === "indeterminate" || full.verdict === "concept-loses-functions";
  const verdict = decided ? full.verdict : y < x ? "concept-better" as const : y > x ? "baseline-better" as const : "equal" as const;
  return {
    ok: true as const, weights, axes, better, worse, pareto, ignored,
    weighted: { baseline: x, concept: y, formula: "Σ weight·value over the MPV axes (cost per dimension, or the harmful-function count); lower is better" },
    verdict,
    ...(pareto === "trade-off" ? { basis: ["pareto_incomparable"] as const } : {}),
    note: (decided
      ? `The MPV view does not override the comparison: ${full.verdict === "indeterminate" ? "the baseline has no deliverables" : "the concept loses deliverables"}.`
      : `Ranked by the explicit MPV weights over ${axes.join(", ")} only.`)
      + (ignored.length ? ` Outside the MPV set, the models also differ on ${ignored.join(", ")}; the MPV view ignores those axes by choice, not because they are equal.` : ""),
  };
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
  if (model.boxes.some(b => b.inner)) return fail([issue("hierarchy-substitution", "$.model", "Trimming and cost relief require expanded hierarchy", "Expand nested boxes before screening trims.")]);
  const check = checkModel(model, "$.model");
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const unknown = trim.flatMap((id, k) => (boxes.has(id) ? [] : [issue("unknown-box", at("$.trim", k), `unknown box '${id}' in trim set`, `Trim boxes of the model: ${quoted(boxes.keys())}.`)]));
  const repeated = duplicates(trim).map((id) => issue("listed-twice", at("$.trim", second(trim, id)), `box '${id}' listed twice in trim set`, `List '${id}' once in trim.`));
  const empty = trim.length ? [] : [issue("empty-set", "$.trim", "empty trim set", "Name at least one box to trim.")];
  if (!check.ok || unknown.length || repeated.length || empty.length) return fail([...check.issues, ...unknown, ...repeated, ...empty]);
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
  const costRelief = sumCosts(trim.map((id) => boxes.get(id)!.cost));
  const wire = (id: string) => model.wires.find((w) => w.id === id)!;
  const verb = (id: string) => wire(id).verb ?? "perform its function on";
  const trimmedNames = trim.map(name).join(" and ");
  // An excessive or insufficient function is not a function to hand over as it is: the object
  // needs the flow at the right level, so it is posed as a level problem, not an absorber's.
  const level = (id: string) => LEVEL_DEFECT.has(wire(id).polarity);
  const levelProblems = functions.filter((f) => f.rule !== "A" && level(f.wire)).map((f) => {
    const polarity = wire(f.wire).polarity as "insufficient" | "excessive";
    return {
      wire: f.wire, polarity, carrier: f.carrier, object: f.object, absorbers: f.absorbers.map((a) => a.box),
      problem: polarity === "excessive"
        ? `[level] ${name(f.object)} gets too much '${f.carrier}' from ${trimmedNames}. Without ${trimmedNames}, what supplies the level ${name(f.object)} needs? If no level of it is useful, rate '${f.wire}' harmful: a harm needs no absorber.`
        : `[level] ${name(f.object)} gets too little '${f.carrier}' from ${trimmedNames}. Without ${trimmedNames}, what supplies enough of it?`,
    };
  });
  return {
    ok: true as const,
    trim,
    verdict: orphaned.length ? "blocked" as const : "typed-feasible" as const,
    functions,
    orphaned,
    dropped: touching.filter((w) => !trimmed.has(w.from.box) && w.polarity !== "harmful").map((w) => w.id),
    removedHarms: touching.filter((w) => w.polarity === "harmful").map((w) => w.id),
    costRelief,
    trimmingProblems: functions.filter((f) => !level(f.wire)).flatMap((f) => f.absorbers.map((a) => a.rule === "B"
      ? `[B] How can ${name(f.object)} ${verb(f.wire)} itself (carrier '${f.carrier}') without ${trimmedNames}?`
      : `[C] How can ${name(a.box)}${a.supersystem ? " (supersystem)" : ""} ${verb(f.wire)} ${name(f.object)} (carrier '${f.carrier}') without ${trimmedNames}?`)),
    levelProblems,
    note: "Carrier match is necessary, not sufficient. Each absorber is a trimming problem to solve and substantiate; the absorber's new harms are not modelled, and its added cost only where boxes declare feasibility (triz_feasibility). Excessive and insufficient functions are posed as levelProblems, not handed to an absorber as they are; their absorbers stay listed under functions.",
  };
}

const AXES: Axis[] = Axis.options;
const MAX_CELLS = 10_000;

/**
 * Physical contradiction as gluing. Each demand admits a set of parameter values on a product
 * region of the space × time × condition × direction × level base (omitted axis = whole axis).
 * The axes are MATRIZ's five separation types; `condition` is its "relation (conditions)". A parameter
 * assignment satisfying every demand exists iff every cell's active demands share a value; on a
 * finite discrete base no cohomology is needed to decide it. It is a physical contradiction iff
 * no single value meets every demand — pairwise compatibility is not enough. For each pair of
 * demands with no common value, the axes on which their regions are disjoint are the separation
 * principles that apply; a pair overlapping on every axis is irreducible at this resolution.
 */
/** The finite base of a contradiction: declared (or named) cells per axis. Fails closed on undeclared cells. */
export function baseOf(pc: PhysicalContradiction, root = "$") {
  const issues: Issue[] = [];
  const ids = pc.demands.map((d) => d.id);
  for (const id of duplicates(ids)) issues.push(issue("duplicate-id", at(root, "demands", second(ids, id)), `duplicate demand id '${id}'`, `Rename one of the two demands '${id}'.`));
  const universe = {} as Record<Axis, string[]>;
  for (const axis of AXES) {
    const named = [...new Set(pc.demands.flatMap((d) => d[axis] ?? []))];
    const declared = pc.axes?.[axis];
    if (declared) {
      for (const c of named) {
        if (declared.includes(c)) continue;
        const d = pc.demands.findIndex((x) => (x[axis] ?? []).includes(c));
        issues.push(issue("undeclared-cell", at(root, "demands", d, axis, pc.demands[d][axis]!.indexOf(c)), `axis '${axis}': cell '${c}' is not declared`, `Add '${c}' to axes.${axis}, or use one of its cells ${quoted(declared)}.`));
      }
    }
    universe[axis] = [...new Set(declared ?? named)].sort();
  }
  const cellCount = AXES.reduce((n, a) => n * Math.max(1, universe[a].length), 1);
  if (cellCount > MAX_CELLS) issues.push(issue("cap-exceeded", at(root, "axes"), `base has ${cellCount} cells; limit is ${MAX_CELLS}`, "Declare fewer cells on some axis (coarser zones or stages), or split the contradiction into smaller ones."));
  const region = (d: (typeof pc.demands)[number], axis: Axis) => d[axis] ?? universe[axis];
  return { errors: issues.map((i) => i.message), issues, universe, region };
}

/** Separation verdicts of one physical contradiction; issue paths start at `root` (default `$`, the contradiction). */
export function separationCheck(pc: PhysicalContradiction, root = "$") {
  const { issues, universe, region } = baseOf(pc, root);
  if (issues.length) return fail(issues);

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
  const sharedValues = pc.demands.slice(1).reduce((acc, d) => acc.filter((v) => d.values.includes(v)), [...pc.demands[0].values]);
  return {
    ok: true as const,
    parameter: pc.parameter,
    contradiction: sharedValues.length === 0,
    gluable: conflictCells.length === 0,
    sharedValues,
    pairs,
    conflictCells: conflictCells.slice(0, 50),
    conflictCellCount: conflictCells.length,
    route: sharedValues.length
      ? `Not a physical contradiction: ${sharedValues.map((v) => `'${v}'`).join(", ")} satisfies every demand; choose it.`
      : !conflictCells.length
        ? "No single value satisfies every demand, but each cell's demands agree: assign the parameter piecewise, along the separating axes where pairs name them and cell by cell otherwise."
        : "Irreducible on the conflict cells at this resolution: refine an axis (finer zones, intervals, conditions), try separation between system levels, or escalate to ARIZ.",
  };
}

/**
 * The parameter as a function of one axis alone. A section that varies only along `axis` must,
 * at each cell t of that axis, take a value every demand applying at t admits (a demand applies at
 * t when its region on `axis` contains t; its other regions are non-empty, so it is active at some
 * cell over t). Verdicts: `dynamizable` (an admissible value at every cell, and no single value
 * works for all of them, so the parameter must change along the axis), `constant-suffices` (one
 * value meets every cell: no change is needed), `not-dynamizable` (some cell admits no value; the
 * conflict is not along this axis alone). With axis 'time' this is the checkable part of
 * Principle 15's "change so they are optimal at each stage": values are admissible, not optimised.
 */
export function dynamize(pc: PhysicalContradiction, axis: Axis = "time", root = "$") {
  const { issues, universe, region } = baseOf(pc, root);
  if (!issues.length && !universe[axis].length) {
    const used = AXES.filter((a) => universe[a].length);
    issues.push(issue("empty-axis", at(root, "axes"), `axis '${axis}' has no cells: declare them in axes.${axis} or name them in a demand`, `Declare cells in axes.${axis} and say where each demand applies along it, or index by an axis that has cells: ${quoted(used)}.`));
  }
  if (issues.length) return fail(issues);
  const schedule = universe[axis].map((cell) => {
    const applying = pc.demands.filter((d) => region(d, axis).includes(cell));
    const values = applying.reduce<string[] | null>((acc, d) => (acc === null ? [...new Set(d.values)].sort() : acc.filter((v) => d.values.includes(v))), null);
    return { cell, demands: applying.map((d) => d.id), values };
  });
  const blocked = schedule.filter((s) => s.values !== null && !s.values.length).map((s) => s.cell);
  const constrained = schedule.filter((s) => s.values !== null).map((s) => s.values!);
  const constant = constrained.reduce<string[] | null>((acc, v) => (acc === null ? v : acc.filter((x) => v.includes(x))), null);
  const verdict = blocked.length ? "not-dynamizable" as const
    : constant === null || constant.length ? "constant-suffices" as const
    : "dynamizable" as const;
  return {
    ok: true as const,
    parameter: pc.parameter,
    axis,
    verdict,
    schedule,
    blocked,
    ...(verdict === "dynamizable" ? { witness: Object.fromEntries(schedule.filter((s) => s.values).map((s) => [s.cell, s.values![0]])) } : {}),
    ...(verdict === "constant-suffices" ? { constant: constant ?? [] } : {}),
    note: verdict === "dynamizable"
      ? `Assign the parameter per ${axis} cell from the schedule; the witness is one admissible choice, not an optimised one.`
      : verdict === "constant-suffices"
        ? "One value meets every cell: no change along this axis is needed."
        : `No admissible value at ${blocked.map((c) => `'${c}'`).join(", ")}: the demands conflict within a cell of this axis. Try another axis with triz_separate, refine the cells, or escalate to ARIZ.`,
  };
}

/** One call for an agent: typing, harm loops, ideality profile, embedded contradictions, optional comparison. */
export function analyseModel(model: FunctionModel, compareTo?: FunctionModel, opts: { mpvWeights?: Record<string, number> } = {}) {
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  if (compareTo) {
    const base = checkModel(compareTo, "$.compare_to");
    if (!base.ok) return rebase(fail(base.issues), [], "compare_to: ");
  }
  const separation = [];
  const separationIssues: Issue[] = [];
  for (const [k, pc] of (model.contradictions ?? []).entries()) {
    const r = separationCheck(pc, at("$.model", "contradictions", k));
    if (r.ok) separation.push({ id: pc.id, ...r });
    else separationIssues.push(...rebase(r, [], `contradiction '${pc.id}': `).issues);
  }
  if (separationIssues.length) return fail(separationIssues);
  return {
    ok: true as const,
    domain: model.domain,
    harmLoops: harmLoops(model),
    ideality: idealityProfile(model),
    separation,
    comparison: compareTo ? compareIdeality(compareTo, model, opts) : undefined,
    note: "Loops and absorbers are hypotheses about mechanism, not findings: name the causal evidence for each before acting on it.",
  };
}
