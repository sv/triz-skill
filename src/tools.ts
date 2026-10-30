/**
 * Tool definitions shared by every transport: stdio (MCP SDK v1, npm package)
 * and the hosted Workers entry (MCP SDK v2 via agents/mcp/server).
 *
 * Transport-neutral: toolSpecs() returns plain specs; bindV1()/bindV2() attach
 * them to the respective SDK server classes. The graph tools (project
 * extension, fs-backed) are only specced when a graph module is provided;
 * triz_export format svg draws only when a layout loader is provided.
 */
import { z } from "zod";
import * as triz from "./core.js";
import * as act from "./act.js";
import { BuildModelRequest, buildModel } from "./act-builder.js";
import { substitute } from "./act-hierarchy.js";
import { exportModel, exportSvg, CERTIFICATE_NOTE, type LayoutLoader } from "./act-export.js";
import { behaviorCertificate, dynamicsCertificate, separationCertificate, weaknessCertificate, type Certificate } from "./act-cert.js";
import { withSuggestions } from "./act-suggest.js";
import { findIsomorphism } from "./act-iso.js";
import { analysisBasis, comparisonBasis, dynamizeBasis, separationBasis, trimBasis } from "./act-basis.js";
import { segment, takeOut, interpose, applyTrim, rewrite, mapBoxes } from "./act-rewrite.js";
import { nineWindows } from "./act-windows.js";
import { Rule, RuleIds, RuleMatch, TREND_DETECTORS, TREND_RULES, applyRule, laggingSubsystem, matchRule } from "./act-rule.js";
import { flowAnalysis } from "./act-flow.js";
import { merge, rerate, feedback, retarget, reverse, standby, cheapCopy } from "./act-principles.js";
import { compareBehavior, externalBehavior, trimPreservesBehavior, weakestSpec, weakestTrimSpec, weaknessRanking, MAX_STATES, operationalAdequacy, type Acceptable, type BehaviorScope, type JointPriorRow, type OperatingSituation as Situation, type Prior } from "./act-behavior.js";
import { boundedDynamics, Target, PortValues, TimedDemand, DEFAULT_HORIZON, MAX_HORIZON } from "./act-dynamics.js";
import { feasibility, trimFeasibility, MAX_ANTICHAIN, MAX_ITERATIONS } from "./act-feasibility.js";
import { levelsConsistency } from "./act-levels.js";
import { AbstractionMap, checkAbstraction } from "./act-abstraction.js";
import { fail, issue, quoted, rebase, zodHint, type Issue, type Warning } from "./act-issues.js";
import { lintModel, lintTrim } from "./act-lint.js";
import { SemanticIsomorphismRequest, semanticIsomorphism } from "./act-semantic-iso.js";
import { RefinementRequest, SummaryRequest, behaviorRefinement, summarizeSubsystem } from "./act-refinement.js";
import { RuleSetRequest, RewritePairRequest, TrimRewriteRequest, analyzeRuleSet, analyzeRewritePair, trimRewrite } from "./act-rule-analysis.js";
import { ImplementationRequest, AbsorberAssignmentsRequest, OperatingSituation, evaluateImplementations, enumerateAbsorberAssignments } from "./act-contract.js";
import { SynthesisRequest, synthesizeFinite } from "./act-synthesis.js";
import { GlobalSeparationRequest, globalSeparation } from "./act-global.js";
import { QueueRequest, ConservationRequest, analyzeQueue, checkConservation } from "./act-quantitative.js";

import type { McpServer as McpServerV1 } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer as McpServerV2 } from "@modelcontextprotocol/server";

type GraphModule = typeof import("./graph.js");

const Id = z.string().min(1);
/** A set of box ids; a bare id is the usual slip. */
const BoxIds = z.array(Id, { error: zodHint((iss) => (iss.code === "invalid_type" && typeof iss.input === "string" ? `pass an array of box ids, e.g. ["${iss.input}"]` : undefined)) });
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
    mediator: z.strictObject({
      id: Id, name: Name, role: act.Role.optional(), action: z.string().optional(), cost: Cost.optional(),
      behavior: z.union([z.literal("identity"), z.array(act.BehaviorRow).min(1)]).optional()
        .describe("The mediator's relation over ports 'in' and 'out': rows, or 'identity' (one row per declared value of the wire's carrier, in = out)"),
    }),
    polarity: z.strictObject({ in: act.Polarity.optional(), out: act.Polarity.optional() }).optional().describe("Ratings of the two legs; default: the original rating"),
    ids: z.strictObject({ in: Id.optional(), out: Id.optional() }).optional(),
  }).describe("Principle 24 (Intermediary): route a function through a new mediator box"),
  z.strictObject({
    op: z.literal("trim"),
    trim: BoxIds.min(1),
    absorb: z.record(z.string(), act.Endpoint).optional().describe("Function wire id → absorber output port; default: the first absorber triz_trim lists"),
  }).describe("Apply a typed-feasible trim: delete the boxes and re-attach each kept function to an absorber. A rule-B absorber is Principle 25 (Self-service); one box absorbing every function is Principle 6 (Universality)"),
  z.strictObject({
    op: z.literal("merge"),
    boxes: z.array(Id).min(2),
    into: z.strictObject({ id: Id, name: Name, role: act.Role.optional(), action: z.string().optional() })
      .describe("The merged box; role defaults to the boxes' shared role"),
    reading: z.enum(["adjacent", "identical"]).optional().describe("'adjacent' (default): functions inside the group, or consecutive positions on a declared flow, join every box; 'identical': same role and the same carriers on each side"),
  }).describe("Principle 5 (Merging): collapse adjacent or identical boxes into one; functions inside are hidden and listed, harms the merge closes into a loop are listed, and each flow through the group passes the merged box instead"),
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
    delete: z.strictObject({ boxes: z.array(Id).optional(), wires: z.array(Id).optional(), flows: z.array(Id).optional() }).optional(),
    add: z.strictObject({ boxes: z.array(act.Box).optional(), wires: z.array(act.Wire).optional(), flows: z.array(act.Flow).optional() }).optional(),
  }).describe("General rewrite at an occurrence named by id: no-dangling condition (a flow may pass a deleted box only if a box with that id is added back), fresh ids, typed result"),
], {
  error: zodHint((iss) => (iss.code === "invalid_union"
    ? "op names one triz_transform operation, and each op takes its own fields (see the tool description); to screen a trim without applying it, call triz_trim"
    : undefined)),
});
type Transformation = z.infer<typeof Transformation>;

/** Paths of a transformation's failure, from the kernel's (`$.model`, `$.<field>`) to triz_transform's arguments. */
const TRANSFORMATION: Array<[string, string]> = [["$.model", "$.model"], ["$", "$.transformation"]];

/** One issue as a failure. */
const failWith = (code: Issue["code"], path: string, message: string, hint: string) => fail([issue(code, path, message, hint)]);

const BOX_MAP_WITHOUT_COMPARE_TO = () => issue("box-map-without-compare-to", "$.box_map", "box_map needs compare_to",
  "Pass the baseline as compare_to: box_map renames the model's (the concept's) boxes to the baseline's ids before comparing. Without a baseline, drop box_map.");
const ABSORB_WITHOUT_TRIM = () => issue("absorb-without-trim", "$.absorb", "absorb needs trim",
  "Pass trim with the boxes to remove (absorb picks the absorber for each function they perform), or drop absorb.");

/** Lints of the models a call names, when they type-check. */
function warnings(models: Array<[act.FunctionModel | undefined, string]>): Warning[] {
  return models.flatMap(([m, root]) => (m && act.checkModel(m).ok ? lintModel(m, root) : []));
}

/**
 * Analysis with each verdict's Lean basis. Given a baseline, the comparison also says whether the
 * two models share a wiring shape, ignoring ids and labels. With a box map (e.g. a segment's
 * boxMap), deliverables are compared after renaming the concept's boxes to the baseline's.
 */
function functionModel(model: act.FunctionModel, compareTo?: act.FunctionModel, boxMap?: Record<string, string>, mpvWeights?: Record<string, number>) {
  const misuse = [
    ...(boxMap && !compareTo ? [BOX_MAP_WITHOUT_COMPARE_TO()] : []),
    ...(mpvWeights && !compareTo ? [issue("mpv-weights-without-compare-to", "$.mpv_weights", "mpv_weights needs compare_to: the MPV view ranks a concept against a baseline",
      "Pass the baseline as compare_to (the MPV view compares the model with it), or drop mpv_weights.")] : []),
  ];
  if (misuse.length) return fail(misuse);
  const opts = mpvWeights ? { mpvWeights } : {};
  const r = analysisBasis(act.analyseModel(model, compareTo, opts));
  if (!r.ok || !compareTo || !r.comparison) return r;
  const mapped = boxMap ? mapBoxes(model, compareTo, boxMap) : null;
  if (mapped && !mapped.ok) return mapped;
  const comparison = mapped ? { ...comparisonBasis(act.compareIdeality(compareTo, mapped.model, opts)), boxMap } : r.comparison;
  if (comparison.mpv && !comparison.mpv.ok) return fail(comparison.mpv.issues);
  // The isomorphism search compares the outer wiring; inner models are not compared.
  const nested = [model, compareTo].some((m) => m.boxes.some((b) => b.inner));
  const isomorphism = findIsomorphism(compareTo, model);
  return { ...r, comparison: { ...comparison, isomorphism: nested && isomorphism.ok
    ? { ...isomorphism, incompleteHierarchy: true, note: "Outer wiring only: inner models are not compared. Expand nested boxes with triz_expand_hierarchy in both models first." }
    : isomorphism } };
}

/** An acceptability entry: a deliverable port or a carrier, with values or a threshold read through the carrier's levels. */
const AcceptableEntry = z.strictObject({
  box: Id.optional().describe("Deliverable box (with port)"),
  port: Id.optional().describe("Deliverable input port (with box)"),
  carrier: Id.optional().describe("Instead of box and port: every deliverable of this carrier, unless a port entry names it"),
  values: z.array(Id).min(1).optional().describe("The acceptable declared values"),
  at_least: z.number().nonnegative().optional().describe("Instead of values: the amount must be at least this, a threshold declared in the carrier's levels; acceptable are the values from that level up"),
  below: z.number().nonnegative().optional().describe("Instead of values: the amount must stay below this, a threshold declared in the carrier's levels; acceptable are the values under that level"),
});

type BehaviorArgs = {
  model: act.FunctionModel; compare_to?: act.FunctionModel; box_map?: Record<string, string>; trim?: string[];
  row_costs?: Array<{ row: { in: Record<string, string>; out: Record<string, string> }; cost: number }>; max_cost_search?: number;
  absorb?: Record<string, { box: string; port: string }>; max_states?: number; weakest_spec?: boolean; joint_boxes?: string[]; scope?: BehaviorScope; full_relation?: boolean; certificate?: boolean;
};

/**
 * triz_behavior's modes: with compare_to, decide the model (the concept) against the baseline,
 * as triz_function_model orients them; with trim, decide the model's own trim; else compose it.
 * With weakest_spec, the target is the same (the baseline's relation, or the untrimmed model's),
 * and the unknown boxes are specified instead (one/two by default, or an explicit joint relation).
 */
function behavior(args: BehaviorArgs) {
  const { model, compare_to, box_map, trim, absorb, max_states: maxStates, weakest_spec, joint_boxes, scope, full_relation: fullRelation, row_costs: rowCosts, max_cost_search: maxCostSearch } = args;
  const issues = [
    ...(joint_boxes !== undefined && (!weakest_spec || rowCosts !== undefined) ? [issue("invalid-joint-boxes", "$.joint_boxes", "joint_boxes requires weakest_spec and does not support row_costs", "Use joint_boxes with weakest_spec and omit row_costs.")] : []),
    ...((rowCosts !== undefined && !weakest_spec) || (maxCostSearch !== undefined && rowCosts === undefined) ? [issue("row-costs-without-weakest-spec", rowCosts !== undefined ? "$.row_costs" : "$.max_cost_search", "row_costs requires weakest_spec, and max_cost_search requires row_costs", "Use weakest_spec with explicit row_costs, or remove the cost options.")] : []),
    ...(trim && compare_to ? [issue("trim-with-compare-to", "$.trim", "trim and compare_to are exclusive: trim compares the model with its own trim; to compare a trimmed concept, pass it as model",
      "Drop compare_to to decide the model's own trim, or apply the trim with triz_transform and pass the result as model with compare_to.")] : []),
    ...(box_map && !compare_to ? [BOX_MAP_WITHOUT_COMPARE_TO()] : []),
    ...(absorb && !trim ? [ABSORB_WITHOUT_TRIM()] : []),
    ...(weakest_spec && !trim && !compare_to ? [issue("weakest-spec-without-target", "$.weakest_spec", "weakest_spec needs compare_to (the baseline whose relation is the target) or trim (the untrimmed model is the target)",
      "Add compare_to (the baseline whose relation the box must give) or trim (the untrimmed model's relation is the target), or drop weakest_spec.")] : []),
  ];
  if (issues.length) return fail(issues);
  if (weakest_spec) return compare_to ? weakestSpec(model, compare_to, { boxMap: box_map, maxStates, scope, fullRelation, rowCosts, maxCostSearch, jointBoxes: joint_boxes }) : weakestTrimSpec(model, { trim: trim!, absorb, maxStates, scope, fullRelation, rowCosts, maxCostSearch, jointBoxes: joint_boxes });
  if (compare_to) return compareBehavior(compare_to, model, { boxMap: box_map, maxStates, scope, fullRelation });
  return trim ? trimPreservesBehavior(model, { trim, absorb, maxStates, scope, fullRelation }) : externalBehavior(model, { maxStates, scope, fullRelation });
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

/** List the matches of a rule, or apply it at one. Exactly one of a built-in rule id and an inline rule. */
function ruleApply(args: {
  model: act.FunctionModel; rule_id?: string; rule?: Rule; at?: Partial<RuleMatch>; match?: RuleMatch;
  carriers?: Record<string, string>; ids?: RuleIds; limit?: number; max_steps?: number;
}) {
  const builtIn = TREND_RULES.map((r) => r.id);
  const entry = isListingEntry(args.match);
  const issues = [
    ...((args.rule === undefined) === (args.rule_id === undefined) ? [issue("rule-or-rule-id", args.rule === undefined ? "$" : "$.rule", "give exactly one of rule_id and rule",
      `Pass rule_id for a built-in rule (${quoted(builtIn)}) or rule for an inline one, not both.`)] : []),
    ...(entry ? [issue("listing-entry-as-match", "$.match", "match is a listing entry ({ match, applicable, violations }), not a match",
      "pass matches[i].match: the inner match object of the listed entry, not the entry itself.")] : []),
    ...(args.match && args.at ? [issue("at-and-match", "$.at", "'at' seeds the search and 'match' applies: give one of them",
      "Drop at to apply match; or drop match to list the matches near the at seed.")] : []),
    ...(!args.match && (args.carriers || args.ids) ? [issue("apply-args-without-match", args.carriers ? "$.carriers" : "$.ids", "'carriers' and 'ids' are used only when applying, with 'match'",
      "Listing takes no carriers or ids: list first without them, then call again with match: matches[i].match and the carriers (bindCarriers names them) and ids.")] : []),
  ];
  if (issues.length) return fail(issues);
  const detectors = TREND_DETECTORS.map((d) => d.id);
  if ((detectors as string[]).includes(args.rule_id ?? "")) {
    const extra = (["at", "match", "carriers", "ids", "limit", "max_steps"] as const).filter((k) => args[k] !== undefined);
    return extra.length
      ? failWith("detector-takes-model-only", `$.${extra[0]}`, `'${args.rule_id}' is a detector, not a rewrite: it takes only the model, not ${extra.map((x) => `'${x}'`).join(", ")}`,
        `Drop ${quoted(extra)}: a detector reads the model and changes nothing.`)
      : laggingSubsystem(args.model);
  }
  const rule = args.rule ?? TREND_RULES.find((r) => r.id === args.rule_id);
  if (!rule) return failWith("unknown-rule-id", "$.rule_id", `unknown rule_id '${args.rule_id}'; built-in rules: ${builtIn.join(", ")}; detectors: ${detectors.join(", ")}`, `Use one of ${quoted([...builtIn, ...detectors])}, or pass an inline rule as rule.`);
  const r = args.match
    ? applyRule(args.model, rule, args.match, { carriers: args.carriers, ids: args.ids })
    : matchRule(args.model, rule, { at: args.at, limit: args.limit, maxSteps: args.max_steps });
  // A built-in rule is not in the input: its issues point at rule_id.
  return !r.ok && args.rule === undefined ? rebase(r, [["$.rule", "$.rule_id", "collapse"]]) : r;
}

/** A matches[i] entry of a listing ({ match, applicable, violations }) passed where its inner match belongs. */
function isListingEntry(x: unknown): boolean {
  return !!x && typeof x === "object" && ["match", "applicable", "violations"].some((k) => Object.hasOwn(x, k));
}

export interface ToolSpec {
  name: string;
  description: string;
  shape: Record<string, any>;
  handler: (args: any) => Promise<{ content: { type: "text"; text: string }[] }>;
}

/** A certificate as a tool result carries it: the Lean file and what it certifies, or why there is none. */
const certificateField = (c: Certificate) => (c.ok
  ? { format: "lean" as const, content: c.content, certifies: c.certifies, manifest: c.manifest, note: CERTIFICATE_NOTE }
  : { ok: false as const, errors: c.errors, issues: c.issues });

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(withIssues(payload), null, 2) }] };
}

/**
 * Every `ok: false` result carries issues beside its errors. Each kernel failure builds them; a
 * failure that arrives without them would be a kernel bug, so it is reported as internal-error
 * rather than left bare. Tests check that none does.
 */
export function withIssues<T>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;
  const p = payload as { ok?: unknown; errors?: unknown; issues?: unknown };
  if (p.ok !== false || !Array.isArray(p.errors) || Array.isArray(p.issues)) return payload;
  return { ...payload, issues: (p.errors as string[]).map((e) => issue("internal-error", "$", e, "This failure carries no structured issue: report it with the input.")) };
}

export function toolSpecs(opts: { graph?: GraphModule; layout?: LayoutLoader } = {}): ToolSpec[] {
  const { graph, layout } = opts;
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
      name: "triz_build_model",
      description: "Build a typed function model from an interaction table: components with stable ids, names and roles, and subject/action/object interactions with explicit carrier descriptors and polarities. Generates readable, stable ports and wire ids: each interaction gets its own input port on its object, `in:<carrier>:<subject>:<action>`, so no input port is fed by two functions (no fan-in, no extensive-fan-in); each subject gets one output port per carrier it sends, `out:<carrier>`, shared by its functions on that carrier (fan-out: one shared level when intensive, the sum of the demands when extensive); each function is the wire `wire:<subject>:<action>:<object>:<carrier>`. Each part is percent-escaped (':' as %3A, '%' as %25), so distinct tuples never share an id. Validates the result, runs lints, and returns a bounded completeness report of unrecorded component pairs, isolation and product reach. Ratings and behavior are never inferred. Optional flows reference component and carrier ids from the table.",
      shape: BuildModelRequest.shape,
      handler: async (args: BuildModelRequest) => text(buildModel(args)),
    },
    {
      name: "triz_expand_hierarchy",
      description: "Substitute one box's declared inner model into its parent through its checked input/output interface. Returns a typed model and fresh box, wire and flow id maps. Preserves inner box costs, feasibility, states and transitions, and standalone inner flows. Parent flows through the replaced box require an explicit inner route and fail closed, as do inner budgets, weights, contradictions and product-identity changes. Expand nested boxes one at a time before requesting flat behavior, dynamics or resource verdicts. triz_nine_windows reads a selected box's inner model as its subsystem view.",
      shape: { model: act.FunctionModel, box: Id.describe("Box whose inner model is substituted into the parent") },
      handler: async ({ model, box }: { model: act.FunctionModel; box: string }) => text(substitute(model, box)),
    },
    {
      name: "triz_function_model",
      description: "Check a TRIZ function model written as a typed wiring diagram (boxes with typed ports, wires carrying one carrier and a polarity) and analyse it: harm loops (closed loops containing a harmful or excessive function, with witness cycles), an ideality profile per resource dimension (never summed; a scalar ratio only with explicit weights), separation checks for embedded physical contradictions, and, given compare_to, a componentwise baseline-vs-concept comparison plus an isomorphism check: whether the two models share a wiring shape ignoring every id and label (a bijection preserving roles, port sides, shared carriers, wiring, ratings, and costs; decided:false if the bounded search runs out). With mpv_weights (and compare_to), comparison.mpv compares the two models over the main parameters of value only: the named cost dimensions or 'harmful', componentwise and by the explicit weighted sum, listing the other axes on which they differ; a lost deliverable still decides, and no weight is ever filled in. Each verdict cites the theorem in theory/CategoricalTriz.lean it relies on (basis). Any dangling, mis-directed, or mistyped wire, or an invalid embedded contradiction, fails closed with ok:false. Harm loops and separation read the outer wiring and the model's own contradictions only: when boxes declare an `inner` model, incompleteHierarchy lists them, the note says their inner loops and contradictions are not analysed, and the isomorphism check carries incompleteHierarchy: true; run triz_expand_hierarchy on each first. Loops are hypotheses about mechanism to substantiate, not findings.",
      shape: {
        model: act.FunctionModel.describe("The model to analyse (the concept, when compare_to is given)"),
        compare_to: act.FunctionModel.optional().describe("Baseline model of the same system with stable box ids"),
        box_map: z.record(z.string(), Id).optional()
          .describe("Concept box id → baseline box id, applied before comparing deliverables; pass the boxMap a triz_transform segment, take_out, or cheap_copy returns"),
        mpv_weights: z.record(z.string(), z.number().positive()).optional()
          .describe("With compare_to: the main parameters of value, each a cost dimension or 'harmful' with your explicit weight. Adds comparison.mpv: the comparison over those axes only, componentwise and by the weighted sum (lower is better), with the differing axes it ignores. Never filled in, and never used for the model's scalar ratio"),
      },
      handler: async ({ model, compare_to, box_map, mpv_weights }: { model: act.FunctionModel; compare_to?: act.FunctionModel; box_map?: Record<string, string>; mpv_weights?: Record<string, number> }) =>
        text({ ...functionModel(model, compare_to, box_map, mpv_weights), warnings: warnings([[model, "$.model"], [compare_to, "$.compare_to"]]) }),
    },
    {
      name: "triz_flow",
      description: "Flow analysis (router entry 16) over the model's declared `flows`: each an ordered path of the boxes a carrier passes through, in series, which functions do not record (two valves in series both act on the water, not on each other). Per flow: its steps (consecutive boxes, with the functions of the flow's carrier between them; declaredOnly counts the steps no function joins); bottleneck candidates (the performer of an insufficient, excessive, or harmful function that carries the flow's carrier and touches the path: a resistance-like output on the flow, at its position); accumulation candidates (a box where the steps of every flow of the carrier converge, with at least two predecessors and fewer successors, or a last box inside the engineered system, role tool or mediator, that no flow of the carrier continues from); leak candidates (a function on the carrier from a box on the path to an environment or supersystem box off it); loops (a box that recurs on the path, with the cycle between occurrences); and the harm loops that meet the path. Every item is a structural candidate to substantiate, not a finding. Boxes consecutive on a flow are adjacent for triz_transform merge. A model that fails the type-check, flows included, fails closed.",
      shape: { model: act.FunctionModel.describe("A model that declares flows") },
      handler: async ({ model }: { model: act.FunctionModel }) => text(flowAnalysis(model)),
    },
    {
      name: "triz_trim",
      description: "Screen a trimming of one or more boxes by the TRIZ trimming rules: A (object trimmed too, function no longer needed), B (the object performs the function itself), C (another remaining box or supersystem resource has an output of the same carrier). Returns per-function absorbers, orphaned functions that block the trim, harms and costs removed, and one trimming problem per absorber. A carrier match is a necessary condition only; every absorber is a hypothesis to solve and substantiate.",
      shape: {
        model: act.FunctionModel,
        trim: BoxIds.min(1).describe("Ids of the boxes to remove"),
      },
      handler: async ({ model, trim }: { model: act.FunctionModel; trim: string[] }) => {
        const r = trimBasis(act.trimCandidates(model, trim));
        return text({ ...r, warnings: [...warnings([[model, "$.model"]]), ...(r.ok ? lintTrim(r) : [])] });
      },
    },
    {
      name: "triz_separate",
      description: "Decide whether a physical contradiction's demands can be met piecewise over a finite space x time x condition x direction x level base (the MATRIZ separation types). Each demand lists admissible values and the cells where it applies (omitted axis = whole axis). Returns per-pair status (compatible: not a physical contradiction; separated: the separating axes; irreducible: overlap on every axis) and the conflict cells where no value satisfies every active demand. With `along`, also returns the parameter as a function of that axis alone: the admissible values per cell and whether it must change along the axis (with 'time', the checkable part of Principle 15, Dynamics). Each separated pair also gets `suggestions`, hints and not verdicts: per separating axis, the operations that could build the piecewise system (space: triz_transform segment or take_out; time: standby, or triz_dynamics separation with timed demands, Principle 15; condition: rerate, or a rewrite that changes the field, Principle 28; level: triz_nine_windows, the system operator or its subsystem restriction; direction: segment by port direction), each with the demands' cells on that axis and the looked-up text of the principle it follows. With `certificate: true`, also returns a Lean file that states these separation verdicts about this contradiction and proves them against theory/CategoricalTriz.lean, so Lean can check this one result.",
      shape: {
        contradiction: act.PhysicalContradiction,
        along: act.Axis.optional().describe("Axis to index the parameter by, e.g. 'time' for stages"),
        certificate: z.boolean().optional().describe("Also return a Lean certificate of the separation verdicts (check it with scripts/certify.mjs)"),
      },
      handler: async ({ contradiction, along, certificate }: { contradiction: act.PhysicalContradiction; along?: act.Axis; certificate?: boolean }) => {
        const checked = separationBasis(act.separationCheck(contradiction, "$.contradiction"));
        if (!checked.ok) return text(checked);
        const result = withSuggestions(contradiction, checked, triz.getPrinciple);
        const cert = certificate ? separationCertificate(contradiction, { root: "$.contradiction" }) : undefined;
        if (cert && !cert.ok) return text(cert);
        return text({
          ...result,
          ...(along ? { along: dynamizeBasis(act.dynamize(contradiction, along, "$.contradiction")) } : {}),
          ...(cert ? { certificate: { format: "lean", content: cert.content, certifies: cert.certifies, manifest: cert.manifest, note: CERTIFICATE_NOTE } } : {}),
        });
      },
    },
    {
      name: "triz_export",
      description: "Export a function model that type-checks: 'dot' gives Graphviz DOT (each box a table: name and «role» in a role-coloured header, input ports left and output ports right with their carriers, open ports in italics; functions as edges between ports, harmful red, insufficient dashed, excessive bold; flows dotted blue; a legend of what occurs; render with `dot -Tsvg`), 'mermaid' gives a Mermaid flowchart that GitHub, GitLab, and many chat clients render without tools (Mermaid has no ports, so each edge names its out port, in port, and carrier), 'svg' gives a self-contained SVG picture with dot's conventions, laid out by ELK with orthogonal edges, for when Graphviz is not at hand (stdio server only: it needs the optional elkjs package; the hosted server answers ok:false with format-unavailable), 'hypergraph' gives an open hypergraph (ports as carrier-typed vertices, boxes and functions as hyperedges, unwired ports as the interface), 'lean' gives a certificate: a Lean file that encodes the model as finite data and states the kernel's verdicts about it (typing, each harm-loop witness cycle, and the separation verdicts of embedded contradictions), each proved against theory/CategoricalTriz.lean, so Lean can check this one model's verdicts (`certifies` lists them; nothing is extracted). A model that fails the type-check is not exported (ok:false with the errors).",
      shape: {
        model: act.FunctionModel,
        format: z.enum(["dot", "mermaid", "svg", "hypergraph", "lean"]),
      },
      handler: async ({ model, format }: { model: act.FunctionModel; format: "dot" | "mermaid" | "svg" | "hypergraph" | "lean" }) =>
        text(format === "svg" ? await exportSvg(model, layout) : exportModel(model, format)),
    },
    {
      name: "triz_transform",
      description: "Apply one typed model transformation and return the new model. Principle constructions: segment (1: divide a box into parts whose ports partition its ports), take_out (2: separate the ports touching a harmful or excessive function, or isolate the part carrying all useful functions), merge (5: collapse adjacent or identical boxes into one; boxes consecutive on a declared flow are adjacent), standby (11: add an unwired typed absorber for a box's functions), reverse (13: swap a function's performer and object), rerate (16: rate a useful function insufficient or excessive; 23: change the level of a function on a cycle), retarget (22: a harmful function's source feeds a useful function), feedback (23: add a function that closes a loop), interpose (24: route a function through a new mediator box), cheap_copy (26, 27: replace a box by a cheaper copy with the same ports). Also trim (perform a typed-feasible trim, re-attaching each kept function to an absorber; rule B is Principle 25, one absorber for everything is Principle 6) and rewrite (delete and add boxes and wires; no remaining wire may touch a deleted box). Every result type-checks or the call fails closed with ok:false. When the segmented box declares behaviour, segment (and take_out) reports behaviourallyIndependent: whether the box's relation is the product of its projections onto the parts; if so each part gets its projection, else no part gets behaviour and each coupled part is named with a witness: two rows whose mix is not a row. It also suggests the finest partition of the box's ports over which its relation is a product (behavior.finest: parts; cut, the suggested blocks the given parts cut, empty iff the split holds; splitsFurther, when nothing is cut, the parts that hold several blocks; decided:false past the cap). interpose's mediator may declare behavior (rows, or 'identity'). A transformation is a structural move, not evidence that it solves the problem: model the result and compare it with triz_function_model compare_to, or with triz_behavior compare_to when behaviour is declared, passing the boxMap that segment, take_out, or cheap_copy returns as box_map. merge renames the merged ports to '<box>.<port>', so no box_map recovers a merged product box's deliverables: they read as lost and regained. reverse returns undo, a rewrite that restores the original model, added ports included.",
      shape: { model: act.FunctionModel, transformation: Transformation },
      handler: async ({ model, transformation }: { model: act.FunctionModel; transformation: Transformation }) => {
        const r = transform(model, transformation);
        return text(r.ok ? r : rebase(r, TRANSFORMATION));
      },
    },
    {
      name: "triz_rule_apply",
      description: "Double-pushout rewriting with rules as data. A rule is a span L ← K → R of patterns over the function-model schema (boxes with ports typed by carrier variables, and wires); pass it as `rule`, or name a built-in evolution-line rule with `rule_id`: 'mono-bi' (transition to supersystem, mono → bi; apply again for poly), 'feedback' (increasing controllability, self-adjusting with feedback; bind its carrier variable 's' with `carriers`), or 'working-field' (changing the working field: the matched function re-made on another carrier; bind 'd' with `carriers` to a carrier other than the matched one; the result's fieldChanges records both carriers' layer and dimension). Each built-in rule cites the evolution-trends.md line it encodes. `rule_id` 'uneven-development' is a detector, not a rewrite, and takes only the model: the lagging subsystem, a box of the largest harm-loop region that is also on a binding feasibility dimension or limits a deliverable (feasibility finds it unprovidable, or it performs an insufficient function on a product); verdict lagging, none, or undecided (no harm loop, or feasibility undecided). Without `match`: lists every injective match of L (seed it with `at`), each verified as a typed homomorphism and marked applicable when the no-identification and no-dangling conditions hold (a deleted box may not lie on a declared flow) and the rule's `distinct` carrier variables bind different carriers; decided:false if the step budget runs out, complete:false past `limit`. A rule's `forbid` holds negative application conditions (Habel–Pennemann): each pattern extends `left` by id, and a match that extends to an occurrence of one — including any elements the pattern adds — is not applicable; a condition its own step budget cannot decide also refuses the application. With `match` (a listed match, or your own mapping): checks the match, these conditions, and that a kept box keeps the ports its declared rows name (every port for behavior and transition; the named ports for feasibility), then deletes the image of L \\ K, glues R \\ K under fresh ids, and returns the new model, which type-checks or the call fails closed; deliverableKeysChanged says a deliverable moved to another port or carrier. A rule application is a structural move, not evidence that it helps: compare the result with triz_function_model compare_to.",
      shape: {
        model: act.FunctionModel,
        rule_id: z.enum([...TREND_RULES.map((r) => r.id), ...TREND_DETECTORS.map((d) => d.id)] as [string, ...string[]]).optional().describe("A built-in evolution-line rule, or the 'uneven-development' detector"),
        rule: Rule.optional().describe("An inline rule; give this or rule_id"),
        at: RuleMatch.partial().optional().describe("Partial match that seeds the search, e.g. { wires: { f: 'w-drive' } }"),
        match: RuleMatch.optional().describe("The match to apply at; omit to list matches"),
        carriers: z.record(z.string(), Id).optional().describe("Carrier variable used only on the right side → model carrier id"),
        ids: RuleIds.optional().describe("Ids for created elements; default: fresh ids based on the rule's or the copied element's"),
        limit: z.number().int().min(1).max(200).optional().describe("Most matches to list (default 50)"),
        max_steps: z.number().int().min(1).max(1_000_000).optional().describe("Search step budget (default 100000)"),
      },
      handler: async (args: Parameters<typeof ruleApply>[0]) => text(ruleApply(args)),
    },
    {
      name: "triz_behavior",
      description: "Compose declared box behaviour (carrier `values`, box `behavior` rows) into the model's external relation: boundary inputs (unwired input ports) to deliverables (product input ports fed by a non-harmful function). The default upstream scope composes boxes that can reach a deliverable and explicitly assumes omitted boxes accept everything; scope whole composes every box, including downstream and disconnected constraints. full_relation returns all rows within the search cap. Feedback loops compose by the relational trace, so every consistent steady state counts, and the steady states are listed. `factorisations` lists each composed box whose relation is the product of its projections onto two or more groups of ports, with the finest groups, in box order (decided:false past a per-box cap): segment it into them, or unions of them, and each part keeps its projection. The hint describes the declared rows, not a physical split, and changes no verdict. This is steady-state semantics, not dynamics. With `compare_to`, decide whether the model (a concept, e.g. a triz_transform result) has the baseline's input→deliverable relation; pass segment's or take_out's boxMap as `box_map`. `trim` is shorthand: perform the trim as triz_transform does and compare the result with the model. Verdict preserved; changed (a lost deliverable, or a counterexample input with the differing outputs and which relation contains which); or undecided (reason missing-behavior: the boxes that can reach a deliverable and declare no behaviour; reason no-steady-state: neither model has a steady state at any input, so equal empty relations say nothing). With `joint_boxes` and `weakest_spec`, select every composed box without behavior and compute one coupled residual over their combined ports. The joint rows are a single relation: independentSafe checks whether independently declaring their per-box projections stays inside the target, factorizes checks whether their product equals the joint relation, and a counterexample explains unsafe coupling. The exact search is bounded by max_states; row_costs are unsupported in this mode. With `weakest_spec` (and compare_to or trim), give the weakest box specification (residual in Rel) for the one box of the concept that can reach a deliverable and declares no behaviour, against the same target: spec, every row of that box whose composite stays inside the target, with preserves:true when declaring it gives exactly the target (any behaviour that does is contained in it); impossible, when the spec's composite misses part of the target (an uncovered input is given; no behaviour of that box gives the target, and the empty relation, which always stays inside, is never read as preserving) or a deliverable is lost; undecided for three or more unknown boxes when joint_boxes is omitted (several-holes), missing baseline behaviour, an empty target, or past the cap (state-cap). When the box to specify declares `producible` rows (what it can physically produce), the spec is the residual cut down to them: spec when that still covers the target (producible.infeasible lists the residual rows left out); impossible with reason infeasible when the residual covers the target but its producible rows do not, with requiredInfeasible giving, per missing target pair, the residual rows that deliver it, none producible (every relation that gives the target contains one of each); impossible with reason not-covered when the residual itself does not cover. With exactly two boxes without behaviour (boxes), a pair of relations stays inside the target iff every pair of rows, one of each, does, and the maximal such pairs are the formal concepts of the safe row pairs: spec lists those whose composite covers the target (specs, each declared and re-checked to give exactly the target; every pair that gives the target lies inside one), with weakest:true when there is one and weakest:false when several are incomparable; impossible (not-covered) when none covers, with each maximal pair's uncovered input (pairs); undecided (concept-cap) past the cap on concepts. Producible rows cut each box first; impossible with reason infeasible then means some pair over all rows (wouldGive) would give the target. Fails closed on ill-typed behaviour, an ambiguous or mismatched box_map, inputs whose values differ between the models, and past the state cap. With `certificate: true` and compare_to or trim, supported comparisons return a request-bound Lean equality with nonemptiness or an input/output pair belonging to only one relation; declared box_map, one-sided inputs and gained deliverables follow the comparison's baseline interface and selected scope. With row_costs in the one-hole mode, cheapestExtension gives an exact least-cost set of safe nonproducible rows to add, using the complete target relation and explicit integer costs, or reports an undecided capped search; it is not-applicable (target-not-covered-by-residual) when the residual itself misses the target, and row_costs fail with invalid-row-costs wherever no one-box residual is computed; the Boolean verdict is unchanged. The verdict holds for the relations as declared; substantiating them, the absorber's or mediator's first, is outside the kernel.",
      shape: {
        model: act.FunctionModel.describe("The model to compose (the concept, when compare_to is given)"),
        compare_to: act.FunctionModel.optional().describe("Baseline model; with it, decide whether the model preserves the baseline's input→deliverable relation"),
        box_map: z.record(z.string(), Id).optional()
          .describe("With compare_to: concept box id → baseline box id, applied to deliverables and boundary inputs; pass a triz_transform segment or take_out boxMap here"),
        trim: BoxIds.min(1).optional().describe("Boxes to trim; with it, decide whether the trim preserves the external behaviour"),
        absorb: z.record(z.string(), act.Endpoint).optional().describe("With trim: function wire id → absorber output port; default: the first absorber triz_trim lists"),
        max_states: z.number().int().positive().max(MAX_STATES).optional().describe(`Cap on boundary valuations and search states (default and maximum ${MAX_STATES})`),
        scope: z.enum(["upstream", "whole"]).optional().describe("Default upstream assumes omitted boxes accept all received values; whole composes every declared box constraint"),
        full_relation: z.boolean().optional().describe("Return every relation row within the search cap; default output is truncated for display"),
        weakest_spec: z.boolean().optional().describe("With compare_to or trim: give the weakest specification for the one box, or the maximal pairs of relations for the two boxes, that can reach a deliverable and declare no behaviour, against the same target"),
        joint_boxes: z.array(Id).optional().describe("With weakest_spec: select every composed box without behavior as one coupled joint relation"),
        row_costs: z.array(z.strictObject({ row: act.BehaviorRow, cost: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) })).optional()
          .describe("With one-hole weakest_spec: explicit cost of every safe nonproducible row that covers an unmet target pair. cheapestExtension finds the least total cost set of additional rows, charging each once. Costs share one caller-chosen unit; no cost is inferred"),
        max_cost_search: z.number().int().positive().max(100_000).optional().describe("With row_costs: cap on exact extension-search nodes (default and maximum 100000); a capped search makes no optimality claim"),
        certificate: z.boolean().optional().describe("With compare_to or trim: independently certify a finite equality or inequality under the selected scope"),
      },
      handler: async (args: Parameters<typeof behavior>[0]) => {
        const result = behavior(args);
        const payload = { ...result, warnings: warnings([[args.model, "$.model"], [args.compare_to, "$.compare_to"]]) };
        if (!args.certificate || !result.ok) return text(payload);
        const applied = args.trim ? applyTrim(args.model, { trim: args.trim, absorb: args.absorb }) : undefined;
        const certificate = args.weakest_spec || (!args.compare_to && !applied?.ok)
          ? fail([issue("not-certifiable", "$.certificate", "This certificate needs a decided comparison or applied trim; residual certification is not implemented.", "Use compare_to or trim without weakest_spec.")])
          : behaviorCertificate(args.compare_to ?? args.model, applied?.ok ? applied.model : args.model, { scope: args.scope, maxStates: args.max_states, boxMap: args.box_map });
        return text({ ...payload, certificate: certificateField(certificate) });
      },
    },
    {
      name: "triz_weakness",
      description: "Rank candidate concepts that declare behaviour by the operating situations they admit (references/weakness.md). A situation is a valuation of the concepts' boundary inputs (unwired input ports, matched by box and port id) over their carriers' declared values: the declared input space is weakness.md's list of operating situations. A concept admits a situation when it has a steady state there and every deliverable output there is acceptable (`acceptable`: per deliverable port, or per carrier for all its deliverables, the values that are, listed or derived from a threshold `at_least`/`below` that is a declared level of the carrier; required for every deliverable; derived sets are listed under acceptable in the result). Give each operating condition the same box and port id in every concept (e.g. an environment box with an unwired input); readByOne lists the inputs only one concept reads. Ranked by set inclusion: weakest (admits everything any other admits), maximal, and every pair as equal, first-weaker, second-weaker, or incomparable, with a situation only one admits each way. The admitted count is a secondary figure: it depends on how finely carrier values are declared. `priors` gives a real prior over the situations (weakness.md: a real prior beats the uniform assumption): per situation input (box and port), or per carrier, a nonnegative weight per declared value (unlisted inputs and values count 1; 0 rules a value out); each concept carries the total prior mass of what it admits (weightedAdmitted, ranked in byWeight), and no inclusion ever moves under weights. `joint_prior` is the alternative for correlated operating conditions: an explicit complete joint table, a weight for every situation (zero allowed), with no independence assumption; it reports jointAdmittedWeight and jointAdmittedProbability per concept, ranked in byJointPrior, separately from inclusion and counts. Give priors or joint_prior, not both. Fails closed when the concepts deliver different ports, an input several read ranges over different values, or acceptable misses a deliverable or names an undeclared value, or a prior is malformed; undecided on missing behaviour or past the state cap. Filter concepts for adequacy first; for safety, integrity, or authorisation decisions admitting more is the wrong direction. With `certificate: true`, also returns a Lean file that encodes each concept's rows and proves every equal, incomparable, or strictly ordered pair: inclusion one way and not the other (AtLeastAsWeak) and the strictly larger count (card_lt_of_strictly_weaker), decided over every valuation; past its cap, `certificate` gives the reason there is none. Prior mass is not certified.",
      shape: {
        concepts: z.array(z.strictObject({ id: Id, model: act.FunctionModel })).min(2).describe("Candidate concepts, each a model that declares behaviour for every box that can reach a deliverable"),
        acceptable: z.array(AcceptableEntry).min(1)
          .describe("Per deliverable port (a product input port), or per carrier for every deliverable it carries, the acceptable values: listed, or derived from a threshold (at_least, below) through the carrier's levels. An output is acceptable when every deliverable's value is"),
        priors: z.array(z.strictObject({
          box: Id.optional().describe("Situation input box (with port)"),
          port: Id.optional().describe("Situation input port (with box)"),
          carrier: Id.optional().describe("Instead of box and port: every situation input of this carrier, unless a port entry names it"),
          weights: z.record(z.string(), z.number()).describe("Declared value → prior mass. Unlisted values and inputs count 1; 0 rules a value out"),
        })).optional()
          .describe("A prior over the operating situations (weakness.md: a real prior beats the uniform assumption): per situation input (box and port), or per carrier, the weight of each declared value. weightedAdmitted is each concept's total admitted mass and byWeight ranks by it; the inclusion ranking and the pairs never change"),
        max_states: z.number().int().positive().max(MAX_STATES).optional().describe(`Cap on situations and search states per concept (default and maximum ${MAX_STATES})`),
        scope: z.enum(["upstream", "whole"]).optional(),
        joint_prior: z.array(z.strictObject({ input: OperatingSituation, weight: z.number().nonnegative() })).min(1).optional().describe("Instead of priors, for correlated conditions: explicit joint mass for EVERY complete situation, including zero mass; no independent-input assumption. jointAdmittedWeight and jointAdmittedProbability per concept, ranked in byJointPrior"),
        certificate: z.boolean().optional().describe("Also return a Lean certificate of every inclusion, equality, or incomparability pair within its cap; prior mass is not certified"),
      },
      handler: async ({ concepts, acceptable, priors, joint_prior, max_states, certificate, scope }: { concepts: Array<{ id: string; model: act.FunctionModel }>; acceptable: Acceptable[]; priors?: Prior[]; joint_prior?: JointPriorRow[]; max_states?: number; certificate?: boolean; scope?: BehaviorScope }) => {
        const r = weaknessRanking(concepts, acceptable, { maxStates: max_states, scope, priors, jointPrior: joint_prior });
        if (!certificate || !r.ok) return text(r);
        return text({ ...r, certificate: certificateField(weaknessCertificate(concepts, acceptable, { maxStates: max_states, scope, priors, jointPrior: joint_prior })) });
      },
    },
    {
      name: "triz_dynamics",
      description: "Bounded dynamics of a function model whose boxes declare `state`, `initial`, and `transition` rows (state, inputs) → (next state, outputs): each such box is a nondeterministic Mealy machine (a lens with a residual is one, with the residual as state); boxes with `behavior` are stateless. Boxes compose synchronously along the wiring: wires are instantaneous, memory lives only in declared state, and a loop through stateless boxes resolves within a step as in triz_behavior. From the initial states, over the boundary inputs you allow at each time (default: every value), every run is explored breadth first up to `horizon` steps; the result lists the reachable states, the fixed points among them, and the runs that block (a state with no row for its inputs). `unsafe` decides escalation: reachable (with a shortest trace), unreachable (the reachable set stopped growing, so at no horizon), or unreachable-within-horizon. `safe` decides invariance: violated (shortest trace), invariant, or invariant-within-horizon. Without `inputs` the configurations are finite, so each verdict also carries `unbounded`, decided at every horizon by continuing the search past the horizon within the same state cap: reachable or violated (with the time and, past the horizon, a shortest trace), unreachable or invariant (with completeAfter), or undecided (cap-exceeded past the horizon, or blocked); the bounded verdict beside it is unchanged. A blocked state meets a target by its state conditions; a port condition there leaves the verdict undecided (reason blocked), never safe. `separation` takes two to four demands, each a target set with a time window, and decides whether one run visits each within its window (separation in time along a trajectory, Principle 15): realizable with a witness trace, unrealizable (a demand never met, or no single run meets them all), or undecided (a blocked run might meet them all). Without `inputs`, `loops` classifies the closed components (no step leaves them) of the reachable graph of the global states of boxes that declare transition, explored without a horizon up to the cap, from the initial states and every state meeting `safe`'s state conditions: bistable (fixed points in two or more closed components), trapped (a closed component every configuration of which meets `unsafe`: an absorbing trap, with a shortest trace into it), recurrent (a closed component that meets `unsafe` and also holds a safe configuration: the run can recover but never leaves it, with a shortest trace into it and the safe configuration), oscillating (a cycle and no fixed point, with its period and one cycle); each closed component reports `unsafe` (it meets the set) and `allUnsafe` (it lies inside it); classes can coexist, and 'none' means no closed component was found within the cap. Behavior rows are never read as transitions. Every trace is re-checked against the declared rows. With `certificate: true`, supported reachable escalations encode and prove their row-derived trace. State-only negative results encode a closed invariant, initial coverage, and unsafe exclusion or safe containment. Saturated unreachable port-target certificates instead exclude admitted unsafe configurations (Sync.target); they do not certify the absence of unsafe blocked states. When the bounded escalation is open and `unbounded` is decided, the certificate states the unbounded verdict (a trace past the horizon, or the unreachable invariant). Input schedules, bounded-only negatives, safe port predicates and loop-class certificates give an explicit unsupported reason. Certificates have source-bound manifests and require independent Lean checking. Fails closed on ill-typed rows, unknown targets, and past the state cap. Verdicts hold for the rows as declared; continuous dynamics, convergence rates, and control are not modelled.",
      shape: {
        model: act.FunctionModel,
        horizon: z.number().int().min(0).max(MAX_HORIZON).optional().describe(`Steps to explore (times 0 to horizon); default: the length of inputs minus one, else ${DEFAULT_HORIZON}`),
        initial: z.record(z.string(), z.array(Id).min(1)).optional().describe("Box id → initial states, overriding the box's initial"),
        inputs: z.array(z.array(PortValues)).min(1).optional()
          .describe("Entry t lists the values allowed at time t on unwired input ports; an unlisted port takes every value. Omit for every value at every time"),
        unsafe: Target.optional().describe("Escalation: is a configuration where every condition holds reachable? e.g. [{ box: 'bearing', port: 'friction', values: ['high'] }]"),
        safe: Target.optional().describe("Invariance: does every reachable configuration meet every condition?"),
        separation: z.array(TimedDemand).min(2).max(4).optional().describe("Separation in time: does one run visit each demand's target set within its window?"),
        max_states: z.number().int().positive().max(MAX_STATES).optional().describe(`Cap on configurations and search states (default and maximum ${MAX_STATES})`),
        certificate: z.boolean().optional().describe("Also return a Lean certificate of a reachable escalation or supported state-only inductive safety verdict; unsupported targets, inputs and caps return an explicit reason"),
      },
      handler: async ({ model, max_states, certificate, ...rest }: { model: act.FunctionModel; max_states?: number; certificate?: boolean } & Omit<Parameters<typeof boundedDynamics>[1], "maxStates">) => {
        const spec = { ...rest, maxStates: max_states };
        const r = boundedDynamics(model, spec);
        if (!certificate || !r.ok) return text(r);
        return text({ ...r, certificate: certificateField(dynamicsCertificate(model, spec)) });
      },
    },
    {
      name: "triz_feasibility",
      description: "Monotone co-design feasibility (Censi 2015) from declared box `feasibility` rows: each row provides a level per output port against the levels it requires per input port and an operating cost, read monotonically (providing less never needs more; more resources never hurt). The product boxes' rows are the demand. An output port feeding several functions meets the largest of their demands on an intensive carrier (the default: one shared level) and their sum on a carrier declared `quantity: extensive`. Composes the rows along non-harmful functions, including feedback loops, by Kleene's ascent from nothing demanded to the least fixpoint, and returns the minimal resource vectors (fixed costs of every box plus the chosen rows' operating costs), each with its rows and demanded levels. Verdict against the model's budget: feasible; infeasible (reason over-budget, with the binding dimensions every minimal vector exceeds, or unprovidable, naming the port no row can serve); or undecided (missing-feasibility, no-budget, unbudgeted). With `trim` and `absorb` (as triz_behavior takes them), apply the trim and decide the trimmed model; the baseline is solved only to report each absorber's added resources. When carriers declare `levels` (thresholds reading amounts as declared values), `levels` reports each feasibility row, of a box that also declares behaviour, whose named amounts read as values no matching behaviour row gives (value-mismatch) or at inputs the behaviour rules out (no-behavior-row). Fails closed on ill-typed or dominated rows, a requirement no non-harmful function supplies, an extensive input fed by several functions (extensive-fan-in: model a merge box), and past the caps. No polynomial bound is claimed. The verdict holds for the rows as declared; the absorber's new harms are not modelled.",
      shape: {
        model: act.FunctionModel,
        trim: BoxIds.min(1).optional().describe("Boxes to trim; with it, decide whether the remaining boxes provide what the trim leaves them within budget"),
        absorb: z.record(z.string(), act.Endpoint).optional().describe("With trim: function wire id → absorber output port; default: the first absorber triz_trim lists"),
        max_antichain: z.number().int().positive().max(MAX_ANTICHAIN).optional().describe(`Cap on antichain elements per step (default and maximum ${MAX_ANTICHAIN})`),
        max_iterations: z.number().int().positive().max(MAX_ITERATIONS).optional().describe(`Cap on Kleene steps (default and maximum ${MAX_ITERATIONS})`),
      },
      handler: async ({ model, trim, absorb, max_antichain, max_iterations }: { model: act.FunctionModel; trim?: string[]; absorb?: Record<string, { box: string; port: string }>; max_antichain?: number; max_iterations?: number }) => {
        const caps = { maxAntichain: max_antichain, maxIterations: max_iterations };
        const r = trim ? trimFeasibility(model, { trim, absorb, ...caps })
          : absorb ? fail([ABSORB_WITHOUT_TRIM()])
          : feasibility(model, caps);
        const levels = r.ok ? levelsConsistency(model) : undefined;
        return text(levels ? { ...r, levels } : r);
      },
    },
    {
      name: "triz_abstraction",
      description: "Check that a coarse function model (few boxes, e.g. with declared behaviour) is an abstraction of a detailed one of the same system (many boxes, e.g. with costs and feasibility) under a typed map: detailed box → coarse box (several may share one; a box left out is outside the abstraction), per box detailed port → coarse port (default: the same id and side), detailed carrier → coarse carrier (default: the same id). A function between two mapped ports is mapped; one between unmapped ports of boxes with the same image is hidden inside that coarse box; one between boxes with different images and an unmapped port is forgotten. Four checks: total (every mapped port's carrier has an image, and every mapped function has an image coarse function with the mapped endpoints, the mapped carrier, and the same polarity class: negative = harmful or excessive, or not), typed (each mapped port lands on a port of the same side whose carrier is its carrier's image, of the same layer; typed_map), wires (every coarse function is the image of a mapped detailed function of its class), harm loops (every coarse harm loop is the image of a detailed one: each harmful or excessive coarse function on it has such a preimage whose object reaches its performer along mapped and hidden functions; cycle_map, with the detailed cycle as witness). Verdict abstraction or not-an-abstraction with the failing checks. Also reports the functions hidden, forgotten, and left out (harms listed apart), the detailed harm loops the coarse model hides or loses, whether reachability among mapped boxes passes to the coarse model (reach_map, when nothing is forgotten), and, where a coarse box with behaviour has one preimage box with feasibility, whether that box's feasibility amounts read through the coarse carriers' levels fall in the coarse behaviour. When either model declares flows, each detailed flow's runs inside the mapped boxes are sent through the map like a merge and matched step by step against the coarse flows of the image carrier (flows.images), and coarse flow steps no detailed step maps to are listed (flows.unbacked); flows do not change the verdict. Fails closed on a model that does not type-check and on map ids that do not exist. Whether the coarse rows are true of their preimages is substantiated outside the kernel.",
      shape: {
        detailed: act.FunctionModel.describe("The detailed model"),
        coarse: act.FunctionModel.describe("The coarse model of the same system"),
        map: AbstractionMap,
      },
      handler: async ({ detailed, coarse, map }: { detailed: act.FunctionModel; coarse: act.FunctionModel; map: AbstractionMap }) =>
        text(checkAbstraction(detailed, coarse, map)),
    },
    {
      name: "triz_nine_windows",
      description: "System operator (9 windows) over function models: for past, present, and future, the subsystem view (restriction to the boxes you name, with crossing functions as its boundary), the system view, and the supersystem view (the tool and mediator boxes, or the boxes you list, collapsed into one black box; hidden harmful functions are listed). Each view reports its boxes, function counts, and harm loops. Present is required. Past and future are snapshots with stable box ids, or transitions: triz_transform operations applied in order (past_to_present needs past and must reach present; present_to_future must reach future if given, or derives it). A transition that fails or does not reach its snapshot fails closed. Each transition is reported as one net rewrite step, its part inside the subsystem (which takes the earlier subsystem view to the later one), whether it stays within the subsystem, and the boundary functions it cuts and adds. When the snapshots declare behaviour or feasibility, each time's system view carries its verdicts (system.verdicts) and each change between times says how they move (changes[].verdicts): behaviour compared as triz_behavior compare_to does, weakness ranked with `acceptable`, and feasibility, changed only when both sides are decided; a failure there never fails the grid. When the snapshots declare flows, the verdicts carry each flow's triz_flow candidates, and each change lists the flows added, removed, and re-routed and the candidates each flow gains or loses; a transition must reach the snapshot's flows too, and flowsChanged lists the flows it changes. Missing windows are reported as prompts.",
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
        acceptable: z.array(AcceptableEntry).min(1).optional()
          .describe("As triz_weakness takes it: with declared behaviour, rank each pair of consecutive times by the situations they admit"),
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

  const finiteTools: Array<[string, string, z.ZodObject<any>, (args: any) => unknown]> = [
    ["triz_adequacy", "Check nonblocking and acceptable outputs over required operating situations under an explicit scope. Equality of two partial relations does not establish adequacy.", z.strictObject({ model: act.FunctionModel, acceptable: z.array(AcceptableEntry).min(1), required_inputs: z.array(OperatingSituation).min(1).optional(), scope: z.enum(["upstream", "whole"]).default("whole"), max_states: z.number().int().min(1).max(MAX_STATES).optional() }), ({ model, acceptable, required_inputs, scope, max_states }: { model: act.FunctionModel; acceptable: Acceptable[]; required_inputs?: Situation[]; scope: BehaviorScope; max_states?: number }) => operationalAdequacy(model, acceptable, { requiredInputs: required_inputs, scope, maxStates: max_states })],
    ["triz_isomorphism", "Verify or search a bijection preserving wiring and declared semantic annotations; search continues past incompatible automorphisms and returns undecided on its global budget.", SemanticIsomorphismRequest, semanticIsomorphism],
    ["triz_behavior_refinement", "Compose two WHOLE models and check exact equality or directional inclusion under explicit boundary and deliverable value maps. Complete relations are checked; no physical transfer is inferred.", RefinementRequest, behaviorRefinement],
    ["triz_subsystem_summary", "Compose a stateless subsystem into an exact finite boundary relation with an explicit port map, fixed cost, and hidden-harm list. Empty relations are reported without inventing unknown behavior.", SummaryRequest, summarizeSubsystem],
    ["triz_implementations", "Evaluate named complete implementations against one whole-model behavior, adequacy, declared-harm and resource contract. Never splice behavior and cost from different modes; provenance remains declared.", ImplementationRequest, evaluateImplementations],
    ["triz_absorber_assignments", "Enumerate all compatible absorber endpoints and complete assignments under one finite contract and a shared work budget. Separate per-function successes do not establish joint sufficiency.", AbsorberAssignmentsRequest, enumerateAbsorberAssignments],
    ["triz_synthesize", "Search the Cartesian product of finite behavior/resource alternatives for several stateless holes on fixed wiring. Each complete tuple meets one shared contract; capped search is undecided, impossibility is only within this declared library.", SynthesisRequest, synthesizeFinite],
    ["triz_global_separation", "Decide exact finite global compatibility of allowed tuples on overlapping variable contexts, with a witness or complete empty join. Pairwise projection compatibility alone is insufficient; no cohomology is computed.", GlobalSeparationRequest, globalSeparation],
    ["triz_queue", "Compile a finite discrete queue with explicit arrivals, service/storage capacity, schedule and units, then check overflow through existing dynamics. All declared arrival combinations within the schedule are considered.", QueueRequest, analyzeQueue],
    ["triz_conservation", "Check declared consumptive versus shared-level supply constraints for explicit units. Consumptive branches sum; shared intensive requirements use max. No physical law is inferred from labels.", ConservationRequest, checkConservation],
    ["triz_rule_set", "Validate a named rule subset and establish termination when every successful application strictly decreases lexicographic box/wire counts. No global confluence or critical-pair completeness is inferred.", RuleSetRequest, analyzeRuleSet],
    ["triz_rewrite_pair", "Replay two named structural rewrites in both orders and check whether those occurrences commute. Interference does not prove nonconfluence.", RewritePairRequest, analyzeRewritePair],
    ["triz_trim_rewrite", "Return an applied trim as explicit deletion/gluing data with its declared absorbers, interface, and checked replay. No Kan-extension claim is made.", TrimRewriteRequest, trimRewrite],
  ];
  for (const [name, description, schema, run] of finiteTools) specs.push({ name, description, shape: schema.shape, handler: async (args) => text(run(schema.parse(args))) });

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
