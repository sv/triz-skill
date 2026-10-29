/**
 * Tool definitions shared by every transport: stdio (MCP SDK v1, npm package)
 * and the hosted Workers entry (MCP SDK v2 via agents/mcp/server).
 *
 * Transport-neutral: toolSpecs() returns plain specs; bindV1()/bindV2() attach
 * them to the respective SDK server classes. The graph tools (project
 * extension, fs-backed) are only specced when a graph module is provided.
 */
import { z } from "zod";
import * as triz from "./core.js";
import * as act from "./act.js";
import { exportModel, CERTIFICATE_NOTE } from "./act-export.js";
import { separationCertificate } from "./act-cert.js";
import { findIsomorphism } from "./act-iso.js";
import { analysisBasis, comparisonBasis, dynamizeBasis, separationBasis, trimBasis } from "./act-basis.js";
import { segment, takeOut, interpose, applyTrim, rewrite, mapBoxes } from "./act-rewrite.js";
import { nineWindows } from "./act-windows.js";
import { merge, rerate, feedback, retarget, reverse, standby, cheapCopy } from "./act-principles.js";
import { externalBehavior, trimPreservesBehavior, MAX_STATES } from "./act-behavior.js";
import type { McpServer as McpServerV1 } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer as McpServerV2 } from "@modelcontextprotocol/server";

type GraphModule = typeof import("./graph.js");

const Id = z.string().min(1);
/** A box's name and cost as the model schema has them, so every result a transformation returns parses as a FunctionModel. */
const Name = act.Box.shape.name;
const Cost = act.Box.shape.cost.unwrap();
const Transformation = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("segment"),
    box: Id,
    parts: z.array(z.strictObject({ id: Id, name: Name.optional(), role: act.Role.optional(), ports: z.array(Id).min(1) })).min(2),
    cost_to: z.record(z.string(), Id).optional().describe("Cost dimension → part id; default: every dimension to the first part"),
  }).describe("Principle 1 (Segmentation): divide a box into parts whose ports partition its ports"),
  z.strictObject({
    op: z.literal("take_out"),
    box: Id,
    ports: z.array(Id).min(1).describe("Ports to separate into the new box"),
    part: z.strictObject({ id: Id, name: Name.optional(), role: act.Role.optional() }),
    reading: z.enum(["interfering", "needed"]).optional().describe("'interfering' (default): the ports touch a harmful or excessive function; 'needed': they carry every useful function of the box"),
    cost_to: z.record(z.string(), Id).optional(),
  }).describe("Principle 2 (Taking out): separate an interfering part, or isolate the only needed part"),
  z.strictObject({
    op: z.literal("interpose"),
    wire: Id,
    mediator: z.strictObject({ id: Id, name: Name, role: act.Role.optional(), action: z.string().optional(), cost: Cost.optional() }),
    polarity: z.strictObject({ in: act.Polarity.optional(), out: act.Polarity.optional() }).optional().describe("Ratings of the two legs; default: the original rating"),
    ids: z.strictObject({ in: Id.optional(), out: Id.optional() }).optional(),
  }).describe("Principle 24 (Intermediary): route a function through a new mediator box"),
  z.strictObject({
    op: z.literal("trim"),
    trim: z.array(Id).min(1),
    absorb: z.record(z.string(), act.Endpoint).optional().describe("Function wire id → absorber output port; default: the first absorber triz_trim lists"),
  }).describe("Apply a typed-feasible trim: delete the boxes and re-attach each kept function to an absorber. A rule-B absorber is Principle 25 (Self-service); one box absorbing every function is Principle 6 (Universality)"),
  z.strictObject({
    op: z.literal("merge"),
    boxes: z.array(Id).min(2),
    into: z.strictObject({ id: Id, name: Name, role: act.Role.optional(), action: z.string().optional() })
      .describe("The merged box; role defaults to the boxes' shared role"),
    reading: z.enum(["adjacent", "identical"]).optional().describe("'adjacent' (default): functions inside the group join every box; 'identical': same role and the same carriers on each side"),
  }).describe("Principle 5 (Merging): collapse adjacent or identical boxes into one; functions inside are hidden and listed, and harms the merge closes into a loop are listed"),
  z.strictObject({
    op: z.literal("rerate"),
    wire: Id,
    polarity: act.Polarity,
    reading: z.enum(["partial", "feedback"]).optional().describe("'partial' (default, Principle 16): a useful function becomes insufficient or excessive; 'feedback' (Principle 23): a function on a cycle changes level among useful, insufficient, excessive"),
    cost: Cost.optional().describe("The performing box's cost after the change; default: unchanged"),
  }).describe("Principles 16 (Partial or excessive action) and 23 (Feedback, magnitude): change a function's rating; reports the harm loops created and removed"),
  z.strictObject({
    op: z.literal("feedback"),
    wire: act.Wire.describe("The new function; its object must already reach its performer"),
  }).describe("Principle 23 (Feedback): add a function that closes a loop; reports whether it is a control loop or a harm loop"),
  z.strictObject({
    op: z.literal("retarget"),
    wire: Id.describe("A harmful function"),
    to: act.Endpoint.describe("An input port of the same carrier that the factor should act on usefully"),
    keep_harm: z.boolean().optional().describe("Keep the harmful function and add the useful one beside it; default: redirect the factor"),
    id: Id.optional().describe("Id of the useful function; default: the wire's id, or '<wire>/used' with keep_harm"),
  }).describe("Principle 22 (Blessing in disguise): the harmful function's source port feeds a useful function"),
  z.strictObject({
    op: z.literal("reverse"),
    wire: Id,
    ports: z.strictObject({ from: Id.optional(), to: Id.optional() }).optional()
      .describe("Output port on the old object and input port on the old performer; a named port the box lacks is added with the wire's carrier"),
  }).describe("Principle 13 (The other way round): swap a function's performer and object"),
  z.strictObject({
    op: z.literal("standby"),
    box: Id.describe("The box whose loss is to be cushioned"),
    standby: z.strictObject({ id: Id, name: Name, role: act.Role.optional(), action: z.string().optional(), cost: Cost.optional() }),
  }).describe("Principle 11 (Beforehand cushioning): add an unwired box that is a typed absorber of every useful function the box performs"),
  z.strictObject({
    op: z.literal("cheap_copy"),
    box: Id,
    copy: z.strictObject({ id: Id.optional(), name: Name.optional(), cost: Cost.describe("Lower on at least one dimension, higher on none") }),
  }).describe("Principles 26 (Copying) and 27 (Cheap short-living objects): replace a box by a copy with the same ports and a lower cost"),
  z.strictObject({
    op: z.literal("rewrite"),
    delete: z.strictObject({ boxes: z.array(Id).optional(), wires: z.array(Id).optional() }).optional(),
    add: z.strictObject({ boxes: z.array(act.Box).optional(), wires: z.array(act.Wire).optional() }).optional(),
  }).describe("General rewrite at an occurrence named by id: no-dangling condition, fresh ids, typed result"),
]);
type Transformation = z.infer<typeof Transformation>;

/**
 * Analysis with each verdict's Lean basis. Given a baseline, the comparison also says whether the
 * two models share a wiring shape, ignoring ids and labels. With a box map (e.g. a segment's
 * boxMap), deliverables are compared after renaming the concept's boxes to the baseline's.
 */
function functionModel(model: act.FunctionModel, compareTo?: act.FunctionModel, boxMap?: Record<string, string>) {
  if (boxMap && !compareTo) return { ok: false as const, errors: ["box_map needs compare_to"] };
  const r = analysisBasis(act.analyseModel(model, compareTo));
  if (!r.ok || !compareTo || !r.comparison) return r;
  const mapped = boxMap ? mapBoxes(model, compareTo, boxMap) : null;
  if (mapped && !mapped.ok) return mapped;
  const comparison = mapped ? { ...comparisonBasis(act.compareIdeality(compareTo, mapped.model)), boxMap } : r.comparison;
  return { ...r, comparison: { ...comparison, isomorphism: findIsomorphism(compareTo, model) } };
}

function transform(model: act.FunctionModel, t: Transformation) {
  switch (t.op) {
    case "segment": return segment(model, { box: t.box, parts: t.parts, costTo: t.cost_to });
    case "take_out": return takeOut(model, { box: t.box, ports: t.ports, part: t.part, reading: t.reading, costTo: t.cost_to });
    case "interpose": return interpose(model, { wire: t.wire, mediator: t.mediator, polarity: t.polarity, ids: t.ids });
    case "trim": return applyTrim(model, { trim: t.trim, absorb: t.absorb });
    case "rewrite": return rewrite(model, { delete: t.delete, add: t.add });
    case "merge": return merge(model, { boxes: t.boxes, into: t.into, reading: t.reading });
    case "rerate": return rerate(model, { wire: t.wire, polarity: t.polarity, reading: t.reading, cost: t.cost });
    case "feedback": return feedback(model, { wire: t.wire });
    case "retarget": return retarget(model, { wire: t.wire, to: t.to, keepHarm: t.keep_harm, id: t.id });
    case "reverse": return reverse(model, { wire: t.wire, ports: t.ports });
    case "standby": return standby(model, { box: t.box, standby: t.standby });
    case "cheap_copy": return cheapCopy(model, { box: t.box, copy: t.copy });
  }
}

export interface ToolSpec {
  name: string;
  description: string;
  shape: Record<string, any>;
  handler: (args: any) => Promise<{ content: { type: "text"; text: string }[] }>;
}

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

export function toolSpecs(opts: { graph?: GraphModule } = {}): ToolSpec[] {
  const { graph } = opts;
  const specs: ToolSpec[] = [
    {
      name: "triz_parameter",
      description: "Get a canonical TRIZ engineering parameter (1-39). Omit id to list all 39.",
      shape: { id: z.number().int().min(1).max(39).optional().describe("Parameter number 1-39; omit to list all") },
      handler: async ({ id }: { id?: number }) => text(id == null ? triz.parameters() : triz.getParameter(id) ?? { error: "no parameter " + id }),
    },
    {
      name: "triz_principle",
      description: "Get a canonical TRIZ inventive principle (1-40). Omit id to list all 40. Look up principle numbers instead of recalling them from memory.",
      shape: { id: z.number().int().min(1).max(40).optional().describe("Principle number 1-40; omit to list all") },
      handler: async ({ id }: { id?: number }) => text(id == null ? triz.principles() : triz.getPrinciple(id) ?? { error: "no principle " + id }),
    },
    {
      name: "triz_matrix",
      description: "Look up the canonical contradiction matrix for an improving and worsening engineering parameter. Blank and diagonal cells fail closed; never guess a recommendation.",
      shape: {
        improving: z.number().int().min(1).max(39).describe("Parameter to improve (1-39)"),
        worsening: z.number().int().min(1).max(39).describe("Parameter that worsens (1-39)"),
      },
      handler: async ({ improving, worsening }: { improving: number; worsening: number }) => text(triz.matrixLookup(improving, worsening)),
    },
    {
      name: "triz_matrix_multi",
      description: "Multi-parameter contradiction lookup: every (improving x worsening) matrix cell with the principles aggregated by how many cells recommend each (ties broken by mean position). Use when a conflict involves several parameters on either side; per-cell detail is returned so nothing is hidden. All-blank or diagonal-only results fail closed like triz_matrix.",
      shape: {
        improving: z.array(z.number().int().min(1).max(39)).min(1).describe("Parameters to improve (1-39), e.g. [9, 14]"),
        worsening: z.array(z.number().int().min(1).max(39)).min(1).describe("Parameters that worsen (1-39), e.g. [25, 33]"),
      },
      handler: async ({ improving, worsening }: { improving: number[]; worsening: number[] }) =>
        text(triz.matrixLookupMulti(improving, worsening)),
    },
    {
      name: "triz_resolve",
      description: "Look up a contradiction-matrix cell and expand its recommended principles and both engineering parameters. Fails closed on blank cells.",
      shape: {
        improving: z.number().int().min(1).max(39).describe("Parameter to improve (1-39)"),
        worsening: z.number().int().min(1).max(39).describe("Parameter that worsens (1-39)"),
      },
      handler: async ({ improving, worsening }: { improving: number; worsening: number }) => text(triz.resolve(improving, worsening)),
    },
    {
      name: "triz_tool_catalog",
      description: "List the domain-neutral TRIZ tool catalog, optionally restricted to problem analysis, task modeling, or solution synthesis.",
      shape: { stage: z.enum(["analysis", "modeling", "synthesis"]).optional().describe("Optional workflow stage") },
      handler: async ({ stage }: { stage?: triz.ToolStage }) => text(triz.toolCatalog(stage)),
    },
    {
      name: "triz_effects",
      description: "Search the curated effects database by required function (e.g. 'convert temperature difference into voltage', 'store heat', 'sense strain') or list by category: physical, chemical, geometric. Effects are classical textbook phenomena; selecting and substantiating one remains a synthesis step, never a lookup verdict.",
      shape: {
        query: z.string().optional().describe("Function keywords to search for, e.g. 'store heat' or 'sense magnetic field'"),
        category: z.enum(["physical", "chemical", "geometric"]).optional().describe("Restrict results to one category"),
      },
      handler: async ({ query, category }: { query?: string; category?: "physical" | "chemical" | "geometric" }) =>
        text(triz.effects(query, category)),
    },
    {
      name: "triz_route",
      description: "Route a problem stage and optional observable signals to candidate TRIZ tools. Routing is deterministic and returns only tools registered for that stage.",
      shape: {
        stage: z.enum(["analysis", "modeling", "synthesis"]).describe("Current workflow stage"),
        signals: z.array(z.string()).optional().describe("Problem signals such as bottleneck, stakeholder conflict, or harmful interaction"),
      },
      handler: async ({ stage, signals }: { stage: triz.ToolStage; signals?: string[] }) => text(triz.routeTools(stage, signals)),
    },
    {
      name: "triz_function_model",
      description: "Check a TRIZ function model written as a typed wiring diagram (boxes with typed ports, wires carrying one carrier and a polarity) and analyse it: harm loops (closed loops containing a harmful or excessive function, with witness cycles), an ideality profile per resource dimension (never summed; a scalar ratio only with explicit weights), separation checks for embedded physical contradictions, and, given compare_to, a componentwise baseline-vs-concept comparison plus an isomorphism check: whether the two models share a wiring shape ignoring every id and label (a bijection preserving roles, port sides, shared carriers, wiring, ratings, and costs; decided:false if the bounded search runs out). Each verdict cites the theorem in theory/CategoricalTriz.lean it relies on (basis). Any dangling, mis-directed, or mistyped wire, or an invalid embedded contradiction, fails closed with ok:false. Loops are hypotheses about mechanism to substantiate, not findings.",
      shape: {
        model: act.FunctionModel.describe("The model to analyse (the concept, when compare_to is given)"),
        compare_to: act.FunctionModel.optional().describe("Baseline model of the same system with stable box ids"),
        box_map: z.record(z.string(), Id).optional()
          .describe("Concept box id → baseline box id, applied before comparing deliverables; pass the boxMap a triz_transform segment, take_out, or cheap_copy returns"),
      },
      handler: async ({ model, compare_to, box_map }: { model: act.FunctionModel; compare_to?: act.FunctionModel; box_map?: Record<string, string> }) =>
        text(functionModel(model, compare_to, box_map)),
    },
    {
      name: "triz_trim",
      description: "Screen a trimming of one or more boxes by the TRIZ trimming rules: A (object trimmed too, function no longer needed), B (the object performs the function itself), C (another remaining box or supersystem resource has an output of the same carrier). Returns per-function absorbers, orphaned functions that block the trim, harms and costs removed, and one trimming problem per absorber. A carrier match is a necessary condition only; every absorber is a hypothesis to solve and substantiate.",
      shape: {
        model: act.FunctionModel,
        trim: z.array(z.string().min(1)).min(1).describe("Ids of the boxes to remove"),
      },
      handler: async ({ model, trim }: { model: act.FunctionModel; trim: string[] }) => text(trimBasis(act.trimCandidates(model, trim))),
    },
    {
      name: "triz_separate",
      description: "Decide whether a physical contradiction's demands can be met piecewise over a finite space x time x condition x direction x level base (the MATRIZ separation types). Each demand lists admissible values and the cells where it applies (omitted axis = whole axis). Returns per-pair status (compatible: not a physical contradiction; separated: the separating axes; irreducible: overlap on every axis) and the conflict cells where no value satisfies every active demand. With `along`, also returns the parameter as a function of that axis alone: the admissible values per cell and whether it must change along the axis (with 'time', the checkable part of Principle 15, Dynamics). With `certificate: true`, also returns a Lean file that states these separation verdicts about this contradiction and proves them against theory/CategoricalTriz.lean, so Lean can check this one result.",
      shape: {
        contradiction: act.PhysicalContradiction,
        along: act.Axis.optional().describe("Axis to index the parameter by, e.g. 'time' for stages"),
        certificate: z.boolean().optional().describe("Also return a Lean certificate of the separation verdicts (check it with scripts/certify.mjs)"),
      },
      handler: async ({ contradiction, along, certificate }: { contradiction: act.PhysicalContradiction; along?: act.Axis; certificate?: boolean }) => {
        const result = separationBasis(act.separationCheck(contradiction));
        if (!result.ok) return text(result);
        const cert = certificate ? separationCertificate(contradiction) : undefined;
        if (cert && !cert.ok) return text(cert);
        return text({
          ...result,
          ...(along ? { along: dynamizeBasis(act.dynamize(contradiction, along)) } : {}),
          ...(cert ? { certificate: { format: "lean", content: cert.content, certifies: cert.certifies, note: CERTIFICATE_NOTE } } : {}),
        });
      },
    },
    {
      name: "triz_export",
      description: "Export a function model that type-checks: 'dot' gives Graphviz DOT (boxes as record nodes with input and output port fields, functions as edges; harmful red, insufficient dashed, excessive bold), 'hypergraph' gives an open hypergraph (ports as carrier-typed vertices, boxes and functions as hyperedges, unwired ports as the interface), 'lean' gives a certificate: a Lean file that encodes the model as finite data and states the kernel's verdicts about it (typing, each harm-loop witness cycle, and the separation verdicts of embedded contradictions), each proved against theory/CategoricalTriz.lean, so Lean can check this one model's verdicts (`certifies` lists them; nothing is extracted). A model that fails the type-check is not exported (ok:false with the errors).",
      shape: {
        model: act.FunctionModel,
        format: z.enum(["dot", "hypergraph", "lean"]),
      },
      handler: async ({ model, format }: { model: act.FunctionModel; format: "dot" | "hypergraph" | "lean" }) => text(exportModel(model, format)),
    },
    {
      name: "triz_transform",
      description: "Apply one typed model transformation and return the new model. Principle constructions: segment (1: divide a box into parts whose ports partition its ports), take_out (2: separate the ports touching a harmful or excessive function, or isolate the part carrying all useful functions), merge (5: collapse adjacent or identical boxes into one), standby (11: add an unwired typed absorber for a box's functions), reverse (13: swap a function's performer and object), rerate (16: rate a useful function insufficient or excessive; 23: change the level of a function on a cycle), retarget (22: a harmful function's source feeds a useful function), feedback (23: add a function that closes a loop), interpose (24: route a function through a new mediator box), cheap_copy (26, 27: replace a box by a cheaper copy with the same ports). Also trim (perform a typed-feasible trim, re-attaching each kept function to an absorber; rule B is Principle 25, one absorber for everything is Principle 6) and rewrite (delete and add boxes and wires; no remaining wire may touch a deleted box). Every result type-checks or the call fails closed with ok:false. A transformation is a structural move, not evidence that it solves the problem: model the result and compare it with triz_function_model compare_to, passing the boxMap that segment, take_out, or cheap_copy returns as box_map. merge renames the merged ports to '<box>.<port>', so no box_map recovers a merged product box's deliverables: they read as lost and regained. reverse returns undo, a rewrite that restores the original model, added ports included.",
      shape: { model: act.FunctionModel, transformation: Transformation },
      handler: async ({ model, transformation }: { model: act.FunctionModel; transformation: Transformation }) => text(transform(model, transformation)),
    },
    {
      name: "triz_behavior",
      description: "Compose declared box behaviour (carrier `values`, box `behavior` rows) into the model's external relation: boundary inputs (unwired input ports) to deliverables (product input ports fed by a non-harmful function). Only boxes that can reach a deliverable are composed; feedback loops compose by the relational trace, so every consistent steady state counts, and the steady states are listed. This is steady-state semantics, not dynamics. With `trim`, perform the trim as triz_transform does and decide whether the input→deliverable relation is unchanged: verdict preserved; changed (a lost deliverable, or a counterexample input with the differing outputs and which relation contains which); or undecided (reason missing-behavior: the boxes that can reach a deliverable and declare no behaviour; reason no-steady-state: neither model has a steady state at any input, so equal empty relations say nothing). Fails closed on ill-typed behaviour and past the state cap. The verdict holds for the relations as declared; substantiating them, the absorber's first, is outside the kernel.",
      shape: {
        model: act.FunctionModel,
        trim: z.array(Id).min(1).optional().describe("Boxes to trim; with it, decide whether the trim preserves the external behaviour"),
        absorb: z.record(z.string(), act.Endpoint).optional().describe("With trim: function wire id → absorber output port; default: the first absorber triz_trim lists"),
        max_states: z.number().int().positive().max(MAX_STATES).optional().describe(`Cap on boundary valuations and search states (default and maximum ${MAX_STATES})`),
      },
      handler: async ({ model, trim, absorb, max_states }: { model: act.FunctionModel; trim?: string[]; absorb?: Record<string, { box: string; port: string }>; max_states?: number }) =>
        text(trim ? trimPreservesBehavior(model, { trim, absorb, maxStates: max_states })
          : absorb ? { ok: false, errors: ["absorb needs trim"] }
          : externalBehavior(model, { maxStates: max_states })),
    },
    {
      name: "triz_nine_windows",
      description: "System operator (9 windows) over function models: for past, present, and future, the subsystem view (restriction to the boxes you name, with crossing functions as its boundary), the system view, and the supersystem view (the tool and mediator boxes, or the boxes you list, collapsed into one black box; hidden harmful functions are listed). Each view reports its boxes, function counts, and harm loops. Present is required. Past and future are snapshots with stable box ids, or transitions: triz_transform operations applied in order (past_to_present needs past and must reach present; present_to_future must reach future if given, or derives it). A transition that fails or does not reach its snapshot fails closed. Each transition is reported as one net rewrite step, its part inside the subsystem (which takes the earlier subsystem view to the later one), whether it stays within the subsystem, and the boundary functions it cuts and adds. Missing windows are reported as prompts.",
      shape: {
        present: act.FunctionModel,
        past: act.FunctionModel.optional(),
        future: act.FunctionModel.optional(),
        subsystem: z.array(Id).min(1).describe("Box ids to zoom into for the subsystem row"),
        system: z.strictObject({ id: Id.optional(), name: z.string().optional(), boxes: z.array(Id).optional() }).optional()
          .describe("The collapsed system box for the supersystem row; default boxes: every tool and mediator"),
        transitions: z.strictObject({
          past_to_present: z.array(Transformation).min(1).optional().describe("Applied to past in order; the result must equal present"),
          present_to_future: z.array(Transformation).min(1).optional().describe("Applied to present in order; the result must equal future if given, otherwise it is the future"),
        }).optional().describe("Transformation sequences linking the times, as triz_transform operations"),
      },
      handler: async (args: Parameters<typeof nineWindows<Transformation>>[0]) => text(nineWindows(args, transform)),
    },
    {
      name: "triz_evals",
      description: "Return the domain-neutral TRIZ lookup regressions and cross-domain reasoning cases.",
      shape: {},
      handler: async () => text(triz.evals()),
    },
  ];

  if (graph) {
    specs.push(
      {
        name: "triz_graph",
        description: "Optional project extension: analyse an OTSM Network of Problems (contradiction graph) and its verifier-backed purpose gates. A node may carry a PhysicalContradiction; each is checked by separationCheck (irreducible, separable, no-contradiction, or invalid, which fails closed for that node), and the core-conflict ranking breaks ties on dissolves in favour of irreducible nodes and flags a top node that already separates. Requires a project graph via TRIZ_GRAPH; not part of the neutral skill core.",
        shape: {},
        handler: async () => text(graph.analyse()),
      },
      {
        name: "triz_purpose",
        description: "Optional project extension: inspect the invariant, purpose gate, and separation check of one contradiction node of the project graph.",
        shape: { id: z.string().describe("Node id as used in the project graph, e.g. S1") },
        handler: async ({ id }: { id: string }) => {
          const node = graph.loadGraph().nodes.find((n) => n.id === id);
          if (!node) return text({ error: "no node " + id });
          return text({ id, purpose: node.purpose, refs: node.refs, gate: graph.purposeGate(node, graph.loadRegistryById()), separation: graph.nodeSeparation(node) });
        },
      },
    );
  }

  return specs;
}

/** Attach specs to an MCP SDK v1 server (stdio npm package). */
export function bindV1(server: McpServerV1, specs: ToolSpec[]) {
  for (const s of specs) server.tool(s.name, s.description, s.shape, s.handler);
}

/** Attach specs to an MCP SDK v2 server (hosted Workers entry via agents/mcp/server). */
export function bindV2(server: McpServerV2, specs: ToolSpec[]) {
  for (const s of specs) server.registerTool(s.name, { description: s.description, inputSchema: s.shape }, s.handler);
}
