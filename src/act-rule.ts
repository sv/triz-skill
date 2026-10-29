/**
 * Rewrite rules as data, applied by double pushout (DPO).
 *
 * A rule is a span L ← K → R of patterns over the function-model schema: boxes with typed ports,
 * and wires. K is included in L and in R by id. Carriers in a rule are variables. A match binds
 * those used in L, and the caller binds those used only in R to carriers of the model.
 *
 * Encoding. For matching and for the gluing conditions, a model is read as a labelled hypergraph
 * in the sense of Bonchi et al. (2022, Def. 3.1):
 *  - vertices are boxes and ports;
 *  - each port has a `port-of` hyperedge to its box, labelled by side and carrier;
 *  - each wire is a hyperedge from its source port to its target port, labelled by carrier and
 *    polarity.
 * A match instantiates the rule: it binds the carrier variables, fixes any role or polarity the
 * pattern omits to that of its image, and resolves `like`. On the instantiated rule it is a
 * label-preserving homomorphism L → G, and the gluing conditions below are those of the
 * instantiated rule. A pattern box matches any box that has at least the pattern's ports.
 *
 *  - validateRule — L, K and R each type-check as patterns, K ⊆ L and K ⊆ R with the same
 *                   constraints, and every element R creates is fully specified. Fails closed.
 *  - matchRule    — every injective match of L, by backtracking over L's wires, then boxes, then
 *                   ports. Bounded by a step budget (`decided: false` when it runs out) and a
 *                   match limit (`complete: false` when reached). Each match is verified by
 *                   checkMatch and reports whether the gluing conditions hold.
 *  - applyRule    — applies the rule at a given match. It checks that the match is a typed
 *                   homomorphism, then the no-identification and no-dangling conditions (Def. 3.16;
 *                   Prop. 3.17 shows they are exactly what the pushout complement needs), deletes
 *                   the image of L \ K, glues R \ K under fresh ids, and type-checks the result.
 *                   A kept box that declares behaviour must keep its ports. A flow is a
 *                   hyperedge on boxes that no pattern names, so no-dangling also refuses
 *                   deleting a box a flow passes. A rule's `distinct` pairs of carrier variables
 *                   must bind different carriers. Every failure fails closed with an error naming
 *                   the condition. A created wire `like` a deleted wire of another carrier is
 *                   recorded in `fieldChanges`.
 *  - TREND_RULES  — the evolution lines whose text in evolution-trends.md describes a structural
 *                   move, each citing its line. Trimming is `triz_transform` `trim`.
 *  - TREND_DETECTORS, laggingSubsystem — the uneven-development line, whose text names a
 *                   diagnosis: the lagging subsystem, found and changed nothing.
 *
 * The result is typed by `typed_dpo` in theory/CategoricalTriz.lean. Its hypotheses map to checks
 * here: the model type-checks; R type-checks (validateRule); no surviving wire touches a deleted
 * box (dangling); R gives no port a carrier the model does not (checkMatch, and fresh ids for
 * created boxes and ports). No-identification makes the result a pushout but is not needed for
 * typing. `distinct` only refuses applications, so it needs nothing of the theorem.
 */
import { z } from "zod";
import { Box, Endpoint, Polarity, Role, checkModel, harmLoops, idealityProfile, type FunctionModel } from "./act.js";
import { feasibility } from "./act-feasibility.js";
import { Budget } from "./act-iso.js";
import type { Theorem } from "./act-basis.js";
// `at` is also matchRule's seed, so the path helper goes by `jp` where that is in scope.
import { at, at as jp, fail, issue, keysHint, quoted, rebase, second, type Failure, type Issue } from "./act-issues.js";

const Id = z.string().min(1);

export const RulePort = z.strictObject({
  id: Id.describe("Unique within its box"),
  carrier: Id.describe("Carrier variable, declared in the rule's `carriers`"),
}).meta({ id: "RulePort" });

export const RuleBox = z.strictObject({
  id: Id,
  role: Role.optional().describe("On a matched box: the role it must have (omit: any role). On a created box: its role"),
  inputs: z.array(RulePort).optional(),
  outputs: z.array(RulePort).optional(),
  like: Id.optional().describe("Created box only: copy role, name, action, and cost from the model box this left-side box matches; a port with the same id as one of that box's ports takes the matched port's id, made unique within the box"),
  name: z.string().min(1).optional().describe("Created box only"),
  action: z.string().optional().describe("Created box only"),
  cost: Box.shape.cost.describe("Created box only: cost per resource dimension"),
}).meta({ id: "RuleBox", description: "A box of a rule pattern; ports are typed by carrier variables" });

export const RuleWire = z.strictObject({
  id: Id,
  from: Endpoint.describe("Output port of a box in the same pattern"),
  to: Endpoint.describe("Input port of a box in the same pattern"),
  carrier: Id.describe("Carrier variable; must equal both port carriers"),
  polarity: Polarity.optional().describe("On a matched wire: the rating it must have (omit: any rating). On a created wire: its rating"),
  like: Id.optional().describe("Created wire only: copy polarity and verb from the model wire this left-side wire matches"),
  verb: z.string().optional().describe("Created wire only"),
}).meta({ id: "RuleWire" });

export const Pattern = z.strictObject({
  boxes: z.array(RuleBox),
  wires: z.array(RuleWire).optional(),
}).meta({ id: "Pattern" });

export const Rule = z.strictObject({
  id: Id,
  name: z.string().optional(),
  carriers: z.array(Id).describe("Carrier variables. Those used in `left` are bound by the match; those used only in `right` are bound by the caller"),
  left: Pattern.describe("L: what must be present; L \\ K is deleted"),
  interface: Pattern.describe("K: what is kept; every element appears with the same id and constraints in left and right"),
  right: Pattern.describe("R: what is there afterwards; R \\ K is created under fresh ids"),
  distinct: z.array(z.tuple([Id, Id])).optional()
    .describe("Pairs of carrier variables that must bind to different carriers: an application condition, checked with the gluing conditions"),
  source: z.strictObject({
    file: z.string().min(1),
    line: z.number().int().positive(),
    quote: z.string().min(1).describe("Text on that line the rule encodes"),
  }).optional(),
  note: z.string().optional(),
}).meta({ id: "Rule", description: "A double-pushout rewrite rule L ← K → R over the function-model schema, with K included in L and R by id" });

export const RuleMatch = z.strictObject({
  boxes: z.record(z.string(), Id).describe("Left-side box id → model box id"),
  ports: z.record(z.string(), z.record(z.string(), Id)).describe("Left-side box id → (its port id → port id on the image box)"),
  wires: z.record(z.string(), Id).describe("Left-side wire id → model wire id"),
  carriers: z.record(z.string(), Id).describe("Carrier variable → model carrier id"),
}, {
  error: keysHint(Object.fromEntries(["match", "applicable", "violations"].map((k) => [k, "this is a listing entry { match, applicable, violations }: pass matches[i].match"]))),
}).meta({ id: "RuleMatch" });

export const RuleIds = z.strictObject({
  boxes: z.record(z.string(), Id).optional().describe("Created box id → model id"),
  wires: z.record(z.string(), Id).optional().describe("Created wire id → model id"),
  ports: z.record(z.string(), z.record(z.string(), Id)).optional().describe("Right-side box id → (port id → model port id), for the ports the rule creates: new ports of a kept box, or any port of a created box"),
}).meta({ id: "RuleIds" });

export type Rule = z.infer<typeof Rule>;
export type RuleMatch = z.infer<typeof RuleMatch>;
export type RuleIds = z.infer<typeof RuleIds>;
type Pat = z.infer<typeof Pattern>;
type PBox = z.infer<typeof RuleBox>;
type PWire = z.infer<typeof RuleWire>;
type MBox = FunctionModel["boxes"][number];
type MWire = FunctionModel["wires"][number];
type Side = "in" | "out";
type Field = { carrier: string; layer: FunctionModel["carriers"][number]["layer"]; dimension: string };
/** A function the rule re-made on another carrier: the created wire, the deleted wire it is `like`, and both carriers. */
export type FieldChange = { wire: string; replaces: string; from: Field; to: Field };

/** JSON Schema export; the committed schema file is regenerated from this (scripts/gen-schema.mjs). */
export function ruleJsonSchema() {
  return {
    $id: "https://github.com/sv/triz-skill/skills/triz-innovation/schemas/rule.schema.json",
    title: "Rule",
    description: "Double-pushout rewrite rule L ← K → R over the function-model schema. Generated from src/act-rule.ts; do not edit by hand.",
    ...z.toJSONSchema(Rule, { target: "draft-2020-12" }),
  };
}

/** Own-property lookup: ids are user data, so inherited keys like `constructor` never count. */
const get = <T>(r: Record<string, T> | undefined, k: string): T | undefined => (r && Object.hasOwn(r, k) ? r[k] : undefined);
const key = (...xs: string[]) => JSON.stringify(xs);
const portsOf = <B extends { inputs?: Array<{ id: string; carrier: string }>; outputs?: Array<{ id: string; carrier: string }> }>(b: B) => [
  ...(b.inputs ?? []).map((p) => ({ ...p, side: "in" as Side })),
  ...(b.outputs ?? []).map((p) => ({ ...p, side: "out" as Side })),
];
const wiresOf = (p: Pat) => p.wires ?? [];
function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

/** A pattern read as a model over its carrier variables, so checkModel decides its typing. */
const asModel = (p: Pat, vars: string[]): FunctionModel => ({
  domain: "physical",
  carriers: vars.map((id) => ({ id, layer: "material", dimension: "variable" })),
  boxes: p.boxes.map((b) => ({ id: b.id, name: b.id, role: b.role ?? "tool", inputs: b.inputs, outputs: b.outputs })),
  wires: wiresOf(p).map((w) => ({ id: w.id, from: w.from, to: w.to, carrier: w.carrier, polarity: w.polarity ?? "useful" })),
});

/** The parts of a rule the other functions read, indexed by id. */
function index(rule: Rule) {
  const boxes = (p: Pat) => new Map(p.boxes.map((b) => [b.id, b]));
  const wires = (p: Pat) => new Map(wiresOf(p).map((w) => [w.id, w]));
  const ports = (p: Pat) => new Map(p.boxes.flatMap((b) => portsOf(b).map((q) => [key(b.id, q.id), { box: b.id, ...q }] as const)));
  const L = { boxes: boxes(rule.left), wires: wires(rule.left), ports: ports(rule.left) };
  const K = { boxes: boxes(rule.interface), wires: wires(rule.interface), ports: ports(rule.interface) };
  const R = { boxes: boxes(rule.right), wires: wires(rule.right), ports: ports(rule.right) };
  const used = (p: Pat) => new Set([...p.boxes.flatMap((b) => portsOf(b).map((q) => q.carrier)), ...wiresOf(p).map((w) => w.carrier)]);
  const leftVars = used(rule.left);
  const rightOnlyVars = [...used(rule.right)].filter((v) => !leftVars.has(v));
  return { L, K, R, leftVars, rightOnlyVars };
}

/** Well-formedness of a rule. Fails closed with every error. Issue paths start at `root` (default `$`, the rule). */
export function validateRule(rule: Rule, root = "$"): { ok: boolean; errors: string[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const vars = rule.carriers;
  const boxAt = (side: "left" | "interface" | "right", id: string) => at(root, side, "boxes", rule[side].boxes.findIndex((b) => b.id === id));
  const wireAt = (side: "left" | "interface" | "right", id: string) => at(root, side, "wires", wiresOf(rule[side]).findIndex((w) => w.id === id));
  const malformed = (path: string, message: string, hint: string) => issues.push(issue("rule-malformed", path, message, hint));
  for (const v of duplicates(vars)) issues.push(issue("rule-ill-typed", at(root, "carriers", second(vars, v)), `carrier variable '${v}' declared twice`, `Declare carrier variable '${v}' once.`));
  for (const [side, p] of [["left", rule.left], ["interface", rule.interface], ["right", rule.right]] as const) {
    // A pattern read as a model: its boxes and wires keep their indexes; its carriers are the rule's variables.
    const typed = rebase(fail(checkModel(asModel(p, [...new Set(vars)]), at(root, side)).issues), [[at(root, side, "carriers"), at(root, "carriers"), "collapse"]]);
    issues.push(...typed.issues.map((x) => issue("rule-ill-typed", x.path,
      `${side}: ${x.message.replace(/unknown carrier/g, "undeclared carrier variable")}`,
      x.code === "unknown-carrier" ? `Declare the carrier variable in the rule's carriers (${quoted(vars)}), or use one of them.` : x.hint)));
  }
  const { L, K, R, leftVars, rightOnlyVars } = index(rule);
  vars.forEach((v, k) => {
    if (!leftVars.has(v) && !rightOnlyVars.includes(v)) issues.push(issue("rule-ill-typed", at(root, "carriers", k), `carrier variable '${v}' is used nowhere`, `Remove '${v}' from carriers, or type a port or wire with it.`));
  });
  (rule.distinct ?? []).forEach(([a, b], k) => {
    for (const [v, j] of [[a, 0], [b, 1]] as const) {
      if (!vars.includes(v)) malformed(at(root, "distinct", k, j), `distinct: '${v}' is not a carrier variable of the rule`, `Pair carrier variables the rule declares: ${quoted(vars)}.`);
    }
    if (a === b) malformed(at(root, "distinct", k), `distinct: '${a}' is paired with itself`, "Pair two different carrier variables, or drop the pair.");
  });
  for (const [side, X] of [["left", L], ["right", R]] as const) {
    for (const [id, k] of K.boxes) {
      const x = X.boxes.get(id);
      if (!x) { malformed(boxAt("interface", id), `interface box '${id}' is not in ${side}`, `Add box '${id}' to ${side} with the same role: every interface element is in left and right.`); continue; }
      if (x.role !== k.role) malformed(boxAt(side, id), `interface box '${id}': role constraint differs in ${side}`, `Give box '${id}' the same role in ${side} as in interface${k.role ? ` ('${k.role}')` : " (none)"}.`);
    }
    for (const [pk, q] of K.ports) {
      const x = X.ports.get(pk);
      if (K.boxes.has(q.box) && X.boxes.has(q.box) && (!x || x.side !== q.side || x.carrier !== q.carrier)) {
        malformed(boxAt(side, q.box), `interface port '${q.box}.${q.id}' is not in ${side} with the same side and carrier`, `Give box '${q.box}' in ${side} the ${q.side === "in" ? "input" : "output"} port '${q.id}' with carrier '${q.carrier}', as in interface.`);
      }
    }
    for (const [id, k] of K.wires) {
      const x = X.wires.get(id);
      if (!x) { malformed(wireAt("interface", id), `interface wire '${id}' is not in ${side}`, `Add wire '${id}' to ${side}, as in interface.`); continue; }
      if (key(x.from.box, x.from.port, x.to.box, x.to.port, x.carrier) !== key(k.from.box, k.from.port, k.to.box, k.to.port, k.carrier) || x.polarity !== k.polarity) {
        malformed(wireAt(side, id), `interface wire '${id}' differs in ${side}`, `Give wire '${id}' the same from, to, carrier, and polarity in ${side} as in interface.`);
      }
    }
  }
  const createdOnly = (b: PBox) => (["like", "name", "action", "cost"] as const).filter((f) => b[f] !== undefined);
  for (const [side, p] of [["left", rule.left], ["interface", rule.interface]] as const) {
    for (const b of p.boxes) for (const f of createdOnly(b)) malformed(at(boxAt(side, b.id), f), `${side} box '${b.id}': '${f}' is only for boxes the rule creates`, `Remove '${f}' from ${side} box '${b.id}'; put it on a right-side box the rule creates.`);
    for (const w of wiresOf(p)) for (const f of (["like", "verb"] as const).filter((f) => w[f] !== undefined)) malformed(at(wireAt(side, w.id), f), `${side} wire '${w.id}': '${f}' is only for wires the rule creates`, `Remove '${f}' from ${side} wire '${w.id}'; put it on a right-side wire the rule creates.`);
  }
  for (const b of rule.right.boxes) {
    if (K.boxes.has(b.id)) {
      for (const f of createdOnly(b)) malformed(at(boxAt("right", b.id), f), `right box '${b.id}': '${f}' is only for boxes the rule creates; '${b.id}' is kept`, `Remove '${f}' from right box '${b.id}': a kept box keeps the matched box's fields.`);
    } else {
      if (b.like !== undefined && !L.boxes.has(b.like)) malformed(at(boxAt("right", b.id), "like"), `right box '${b.id}': like '${b.like}' is not a left-side box`, `Set like to a left-side box id: ${quoted(L.boxes.keys())}.`);
      if (b.like === undefined && (b.role === undefined || b.name === undefined)) malformed(boxAt("right", b.id), `right box '${b.id}': a created box needs role and name, or like`, `Give right box '${b.id}' a role and a name, or like: a left-side box id to copy them from.`);
    }
  }
  for (const w of wiresOf(rule.right)) {
    if (K.wires.has(w.id)) {
      for (const f of (["like", "verb"] as const).filter((f) => w[f] !== undefined)) malformed(at(wireAt("right", w.id), f), `right wire '${w.id}': '${f}' is only for wires the rule creates; '${w.id}' is kept`, `Remove '${f}' from right wire '${w.id}': a kept wire keeps the matched wire's fields.`);
    } else {
      if (w.like !== undefined && !L.wires.has(w.like)) malformed(at(wireAt("right", w.id), "like"), `right wire '${w.id}': like '${w.like}' is not a left-side wire`, `Set like to a left-side wire id: ${quoted(L.wires.keys())}.`);
      if (w.like === undefined && w.polarity === undefined) malformed(wireAt("right", w.id), `right wire '${w.id}': a created wire needs polarity, or like`, `Give right wire '${w.id}' a polarity, or like: a left-side wire id to copy it from.`);
    }
  }
  return { ok: issues.length === 0, errors: issues.map((i) => i.message), issues };
}

/** Verify that `match` is a typed homomorphism L → model: labels, sides, carriers, and incidences preserved. */
export function checkMatch(model: FunctionModel, rule: Rule, match: RuleMatch): string[] {
  return matchIssues(model, rule, match).map((i) => i.message);
}

/** checkMatch's findings as issues at `$.match` (a carrier binding at `carrierPath(v)`, by default `$.match.carriers[v]`). */
export function matchIssues(model: FunctionModel, rule: Rule, match: RuleMatch, carrierPath = (v: string) => at("$.match.carriers", v)): Issue[] {
  const issues: Issue[] = [];
  const push = (code: Issue["code"], path: string, message: string, hint: string) => issues.push(issue(code, path, message, hint));
  const { L } = index(rule);
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const wires = new Map(model.wires.map((w) => [w.id, w]));
  const carriers = new Set(model.carriers.map((c) => c.id));
  for (const v of Object.keys(match.carriers)) {
    if (!rule.carriers.includes(v)) push("not-a-rule-element", carrierPath(v), `carrier '${v}' is not a carrier variable of the rule`, `Bind the rule's carrier variables only: ${quoted(rule.carriers)}.`);
    else if (!carriers.has(match.carriers[v])) push("unknown-carrier", carrierPath(v), `carrier variable '${v}' bound to unknown carrier '${match.carriers[v]}'`, `Bind '${v}' to a carrier of the model: ${quoted(carriers)}.`);
  }
  const sigma = (v: string) => get(match.carriers, v);
  const mapping = (kind: string, ids: Iterable<string>) => `Key match.${kind} by the rule's left-side ${kind}: ${quoted(ids)}. Copy a match triz_rule_apply listed rather than writing one.`;
  for (const id of Object.keys(match.boxes)) if (!L.boxes.has(id)) push("not-a-rule-element", at("$.match.boxes", id), `box '${id}' is not a left-side box`, mapping("boxes", L.boxes.keys()));
  for (const id of Object.keys(match.wires)) if (!L.wires.has(id)) push("not-a-rule-element", at("$.match.wires", id), `wire '${id}' is not a left-side wire`, mapping("wires", L.wires.keys()));
  for (const [b, ps] of Object.entries(match.ports)) {
    for (const p of Object.keys(ps)) if (!L.ports.has(key(b, p))) push("not-a-rule-element", at("$.match.ports", b, p), `port '${b}.${p}' is not a left-side port`, mapping("ports", [...L.ports.values()].map((q) => `${q.box}.${q.id}`)));
  }
  for (const b of L.boxes.values()) {
    const g = get(match.boxes, b.id);
    const gb = g === undefined ? undefined : boxes.get(g);
    if (g === undefined) { push("match-incomplete", "$.match.boxes", `box '${b.id}' is not mapped`, `Map left-side box '${b.id}' to a model box in match.boxes.`); continue; }
    if (!gb) { push("unknown-box", at("$.match.boxes", b.id), `box '${b.id}' maps to unknown box '${g}'`, `Map '${b.id}' to a box of the model: ${quoted(boxes.keys())}.`); continue; }
    if (b.role && gb.role !== b.role) push("match-not-homomorphic", at("$.match.boxes", b.id), `box '${b.id}' (role ${b.role}) maps to '${g}' (role ${gb.role})`, `Map '${b.id}' to a box with role '${b.role}': ${quoted(model.boxes.filter((x) => x.role === b.role).map((x) => x.id))}.`);
    for (const p of portsOf(b)) {
      const gp = get(get(match.ports, b.id), p.id);
      const q = gp === undefined ? undefined : portsOf(gb).find((x) => x.id === gp);
      const fitting = () => quoted(portsOf(gb).filter((x) => x.side === p.side && (sigma(p.carrier) === undefined || x.carrier === sigma(p.carrier))).map((x) => x.id));
      if (gp === undefined) push("match-incomplete", at("$.match.ports", b.id), `port '${b.id}.${p.id}' is not mapped`, `Map port '${p.id}' of '${b.id}' to a port of '${g}' in match.ports: ${fitting()}.`);
      else if (!q) push("unknown-port", at("$.match.ports", b.id, p.id), `port '${b.id}.${p.id}' maps to '${g}.${gp}', which does not exist`, `Map '${b.id}.${p.id}' to a port of '${g}': ${fitting()}.`);
      else if (q.side !== p.side) push("match-not-homomorphic", at("$.match.ports", b.id, p.id), `port '${b.id}.${p.id}' (${p.side}) maps to '${g}.${gp}' (${q.side})`, `Map '${b.id}.${p.id}' to an ${p.side === "in" ? "input" : "output"} port of '${g}': ${fitting()}.`);
      else if (sigma(p.carrier) !== q.carrier) {
        push("match-not-homomorphic", at("$.match.ports", b.id, p.id), `port '${b.id}.${p.id}' carrier '${p.carrier}' is bound to ${sigma(p.carrier) === undefined ? "nothing" : `'${sigma(p.carrier)}'`}, but '${g}.${gp}' carries '${q.carrier}'`,
          sigma(p.carrier) === undefined ? `Bind carrier variable '${p.carrier}' to '${q.carrier}' in match.carriers.` : `Map '${b.id}.${p.id}' to a port of carrier '${sigma(p.carrier)}' (${fitting()}), or bind '${p.carrier}' to '${q.carrier}'.`);
      }
    }
  }
  for (const w of L.wires.values()) {
    const g = get(match.wires, w.id);
    const gw = g === undefined ? undefined : wires.get(g);
    if (g === undefined) { push("match-incomplete", "$.match.wires", `wire '${w.id}' is not mapped`, `Map left-side wire '${w.id}' to a model wire in match.wires.`); continue; }
    if (!gw) { push("unknown-wire", at("$.match.wires", w.id), `wire '${w.id}' maps to unknown wire '${g}'`, `Map '${w.id}' to a wire of the model: ${quoted(wires.keys())}.`); continue; }
    const end = (e: { box: string; port: string }) => key(get(match.boxes, e.box) ?? "", get(get(match.ports, e.box), e.port) ?? "");
    const incidence = `The images of '${w.id}''s ends must be '${g}''s ends: map the boxes and ports so they agree, or map '${w.id}' to another wire.`;
    if (end(w.from) !== key(gw.from.box, gw.from.port)) push("match-not-homomorphic", at("$.match.wires", w.id), `wire '${w.id}' source does not map to wire '${g}' source`, incidence);
    if (end(w.to) !== key(gw.to.box, gw.to.port)) push("match-not-homomorphic", at("$.match.wires", w.id), `wire '${w.id}' target does not map to wire '${g}' target`, incidence);
    if (sigma(w.carrier) !== gw.carrier) push("match-not-homomorphic", at("$.match.wires", w.id), `wire '${w.id}' carrier '${w.carrier}' does not map to wire '${g}' carrier '${gw.carrier}'`, `Bind '${w.carrier}' to '${gw.carrier}', or map '${w.id}' to a wire of carrier '${sigma(w.carrier) ?? w.carrier}'.`);
    if (w.polarity && gw.polarity !== w.polarity) push("match-not-homomorphic", at("$.match.wires", w.id), `wire '${w.id}' (${w.polarity}) maps to '${g}' (${gw.polarity})`, `Map '${w.id}' to a ${w.polarity} wire: ${quoted(model.wires.filter((x) => x.polarity === w.polarity).map((x) => x.id))}.`);
  }
  return issues;
}

/** The images of L \ K: what the rule deletes. */
function deletedBy(rule: Rule, match: RuleMatch) {
  const { L, K } = index(rule);
  const boxes = new Set([...L.boxes.keys()].filter((b) => !K.boxes.has(b)).map((b) => get(match.boxes, b)!));
  const ports = new Set([...L.ports].filter(([k]) => !K.ports.has(k)).map(([, p]) => key(get(match.boxes, p.box)!, get(get(match.ports, p.box), p.id)!)));
  const wires = new Set([...L.wires.keys()].filter((w) => !K.wires.has(w)).map((w) => get(match.wires, w)!));
  return { boxes, ports, wires };
}

/**
 * The gluing conditions, for a match that checkMatch accepted (Bonchi et al. 2022, Def. 3.16).
 * No-identification: two left-side elements with the same image are both kept. No-dangling: every
 * port of a deleted box is deleted, and every wire on a deleted port is deleted.
 */
export function gluingConditions(model: FunctionModel, rule: Rule, match: RuleMatch) {
  const { L, K } = index(rule);
  const identification: string[] = [];
  const clash = (kind: string, pairs: Array<[string, string, boolean]>) => {
    const byImage = new Map<string, Array<[string, boolean]>>();
    for (const [id, image, kept] of pairs) byImage.set(image, [...(byImage.get(image) ?? []), [id, kept]]);
    for (const [image, xs] of byImage) {
      const deleted = xs.filter(([, kept]) => !kept).map(([id]) => `'${id}'`);
      if (xs.length > 1 && deleted.length) {
        identification.push(`identification: left-side ${kind} ${xs.map(([id]) => `'${id}'`).join(" and ")} all match ${image}, and ${deleted.join(", ")} would be deleted`);
      }
    }
  };
  clash("boxes", [...L.boxes.keys()].map((b) => [b, `box '${get(match.boxes, b)}'`, K.boxes.has(b)]));
  clash("ports", [...L.ports].map(([k, p]) => [`${p.box}.${p.id}`, `port '${get(match.boxes, p.box)}.${get(get(match.ports, p.box), p.id)}'`, K.ports.has(k)]));
  clash("wires", [...L.wires.keys()].map((w) => [w, `wire '${get(match.wires, w)}'`, K.wires.has(w)]));
  const gone = deletedBy(rule, match);
  const dangling: string[] = [];
  const issues: Issue[] = identification.map((m) => issue("match-identifies", "$.match", m,
    "Map these left-side elements to distinct model elements, or keep all of them in the rule's interface."));
  const dangle = (message: string, hint: string) => { dangling.push(message); issues.push(issue("dangling-wire", "$.match", message, hint)); };
  for (const b of model.boxes) {
    if (!gone.boxes.has(b.id)) continue;
    for (const p of portsOf(b)) {
      if (!gone.ports.has(key(b.id, p.id))) dangle(`dangling: port '${b.id}.${p.id}' of deleted box '${b.id}' is not on the rule's left side`, `The rule deletes '${b.id}' but not its port '${p.id}': add that port to the deleted box on the rule's left side, or match a box without it.`);
    }
  }
  for (const w of model.wires) {
    if (gone.wires.has(w.id)) continue;
    for (const e of [w.from, w.to]) {
      if (gone.boxes.has(e.box)) dangle(`dangling: wire '${w.id}' touches deleted box '${e.box}'`, `The rule deletes '${e.box}' but not wire '${w.id}' on it: add the wire to the rule's left side (outside the interface), or match elsewhere.`);
      else if (gone.ports.has(key(e.box, e.port))) dangle(`dangling: wire '${w.id}' touches deleted port '${e.box}.${e.port}'`, `The rule deletes port '${e.box}.${e.port}' but not wire '${w.id}' on it: add the wire to the rule's left side, or match elsewhere.`);
    }
  }
  // A flow is a hyperedge on boxes that no pattern names, so a rule may not delete a box it passes.
  for (const f of model.flows ?? []) {
    const flowDangle = (message: string, hint: string) => { dangling.push(message); issues.push(issue("dangling-flow", "$.match", message, hint)); };
    for (const id of new Set(f.path)) {
      if (gone.boxes.has(id)) flowDangle(`dangling: flow '${f.id}' passes deleted box '${id}'`, `The rule deletes '${id}', which flow '${f.id}' passes, and no rule names flows: restate the flow without '${id}' first (triz_transform rewrite), or match elsewhere.`);
    }
    if (f.medium !== undefined && gone.boxes.has(f.medium)) flowDangle(`dangling: flow '${f.id}' names deleted box '${f.medium}' as its medium`, `Restate flow '${f.id}' with another medium first (triz_transform rewrite), or match elsewhere.`);
  }
  return { identification, dangling, ok: !identification.length && !dangling.length, issues };
}

/** The `distinct` application condition on bound carrier variables; a variable not yet bound is skipped. */
function distinctIssues(rule: Rule, bound: Record<string, string> | Map<string, string>, path: (v: string) => string = (v) => jp("$.match.carriers", v)): Issue[] {
  const bind = (v: string) => (bound instanceof Map ? bound.get(v) : get(bound, v));
  return (rule.distinct ?? []).flatMap(([a, b]) => {
    const x = bind(a), y = bind(b);
    return x !== undefined && x === y
      ? [issue("distinct-carriers", path(b), `distinct: carrier variables '${a}' and '${b}' both bind carrier '${x}'; the rule needs them different`,
        `Bind '${b}' to a carrier other than '${x}'${rule.id === "working-field" ? ": the new field's carrier (add it to the model's carriers if it is missing)" : ""}.`)]
      : [];
  });
}

/**
 * Declared rows a rule would leave ill-typed on a kept box. Behaviour and transition rows name
 * every port once, so the box must keep its ports exactly: a rule that adds or deletes one is
 * refused. Feasibility rows name only some ports (an omitted one provides and needs 0), so the box
 * may gain ports but must keep every port its rows name. These are not gluing conditions; they
 * are checked with them so that a refused application names its reason.
 */
export function declaredRowConditions(model: FunctionModel, rule: Rule, match: RuleMatch): string[] {
  return declaredRowIssues(model, rule, match).map((i) => i.message);
}

/** declaredRowConditions as issues at `$.match`. */
function declaredRowIssues(model: FunctionModel, rule: Rule, match: RuleMatch): Issue[] {
  return declaredRowMessages(model, rule, match).map((m) => issue("declared-rows-block-change", "$.match", m,
    "Restate or remove that box's declared rows first (triz_transform rewrite), or match a box that declares none."));
}

function declaredRowMessages(model: FunctionModel, rule: Rule, match: RuleMatch): string[] {
  const { K, R } = index(rule);
  const gone = deletedBy(rule, match);
  const lost = [...gone.ports].map((k) => JSON.parse(k) as [string, string]).filter(([b]) => !gone.boxes.has(b));
  const changed = new Set([
    ...lost.map(([b]) => b),
    ...[...R.ports].filter(([k, p]) => K.boxes.has(p.box) && !K.ports.has(k)).map(([, p]) => get(match.boxes, p.box)!),
  ]);
  return model.boxes.flatMap((b) => {
    const rows = (["behavior", "transition"] as const).filter((kind) => b[kind] && changed.has(b.id))
      .map((kind) => `behaviour: the rule changes the ports of box '${b.id}', which declares ${kind}; restate or remove its ${kind} first`);
    if (!b.feasibility) return rows;
    const named = new Set(b.feasibility.flatMap((r) => [...Object.keys(r.provides ?? {}), ...Object.keys(r.requires ?? {})]));
    const deleted = lost.filter(([box, port]) => box === b.id && named.has(port)).map(([, port]) => `'${port}'`);
    return deleted.length
      ? [...rows, `feasibility: the rule deletes port${deleted.length > 1 ? "s" : ""} ${deleted.join(", ")} of box '${b.id}', which its feasibility rows name; restate or remove its feasibility first`]
      : rows;
  });
}

/** The model type-checks (`$.model`) and the rule is well formed (`$.rule`). */
function preconditions(model: FunctionModel, rule: Rule): Issue[] {
  return [
    ...rebase(fail(checkModel(model, "$.model").issues), [], "model: ").issues,
    ...rebase(fail(validateRule(rule, "$.rule").issues), [], `rule '${rule.id}': `).issues,
  ];
}

export const MAX_STEPS = 100_000;
export const MAX_MATCHES = 50;

/**
 * Every injective match of the rule's left side, optionally seeded by a partial match `at`.
 * Deterministic: model elements are tried in id order. Fails closed on an invalid model or rule.
 */
export function matchRule(model: FunctionModel, rule: Rule, opts: { at?: Partial<RuleMatch>; limit?: number; maxSteps?: number } = {}) {
  const pre = preconditions(model, rule);
  if (pre.length) return fail(pre);
  const limit = opts.limit ?? MAX_MATCHES, maxSteps = opts.maxSteps ?? MAX_STEPS, at = opts.at ?? {};
  const { L, leftVars, rightOnlyVars } = index(rule);
  const seed = (kind: string, ids: Iterable<string>) => `Seed with the rule's left-side ${kind}: ${quoted(ids)}.`;
  const unknown = [
    ...Object.keys(at.boxes ?? {}).filter((b) => !L.boxes.has(b)).map((b) => issue("not-a-rule-element", jp("$.at.boxes", b), `at: '${b}' is not a left-side box`, seed("boxes", L.boxes.keys()))),
    ...Object.keys(at.wires ?? {}).filter((w) => !L.wires.has(w)).map((w) => issue("not-a-rule-element", jp("$.at.wires", w), `at: '${w}' is not a left-side wire`, seed("wires", L.wires.keys()))),
    ...Object.entries(at.ports ?? {}).flatMap(([b, ps]) => Object.keys(ps).filter((p) => !L.ports.has(key(b, p))).map((p) => issue("not-a-rule-element", jp("$.at.ports", b, p), `at: '${b}.${p}' is not a left-side port`, seed("ports", [...L.ports.values()].map((q) => `${q.box}.${q.id}`))))),
    ...Object.keys(at.carriers ?? {}).filter((v) => !leftVars.has(v)).map((v) => issue("not-a-rule-element", jp("$.at.carriers", v), `at: '${v}' is not a carrier variable of the left side`, `Seed carrier variables of the left side only: ${quoted(leftVars)}.`)),
  ];
  if (unknown.length) return fail(unknown);
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const gBoxes = byId(model.boxes), gWires = byId(model.wires);
  const gBox = new Map(model.boxes.map((b) => [b.id, b]));

  const mBox = new Map<string, string>(), mWire = new Map<string, string>(), mPort = new Map<string, string>(), mCar = new Map<string, string>();
  const usedBox = new Set<string>(), usedWire = new Set<string>(), usedPort = new Set<string>();
  const trail: Array<() => void> = [];
  const set = <K, V>(m: Map<K, V>, k: K, v: V, used?: Set<V>) => { m.set(k, v); used?.add(v); trail.push(() => { m.delete(k); used?.delete(v); }); };
  const undo = (n: number) => { while (trail.length > n) trail.pop()!(); };

  const bindCarrier = (v: string, c: string) => {
    if (mCar.has(v)) return mCar.get(v) === c;
    const fixed = get(at.carriers, v);
    if (fixed !== undefined && fixed !== c) return false;
    set(mCar, v, c);
    return true;
  };
  const bindBox = (b: string, g: string) => {
    if (mBox.has(b)) return mBox.get(b) === g;
    const fixed = get(at.boxes, b), role = L.boxes.get(b)!.role;
    if ((fixed !== undefined && fixed !== g) || usedBox.has(g) || (role && gBox.get(g)!.role !== role)) return false;
    set(mBox, b, g, usedBox);
    return true;
  };
  const bindPort = (b: string, p: string, gp: string) => {
    const k = key(b, p);
    if (mPort.has(k)) return mPort.get(k) === gp;
    const g = mBox.get(b)!, lp = L.ports.get(k)!;
    const fixed = get(get(at.ports, b), p), q = portsOf(gBox.get(g)!).find((x) => x.id === gp);
    if ((fixed !== undefined && fixed !== gp) || !q || q.side !== lp.side || usedPort.has(key(g, gp))) return false;
    if (!bindCarrier(lp.carrier, q.carrier)) return false;
    set(mPort, k, gp);
    usedPort.add(key(g, gp));
    trail.push(() => usedPort.delete(key(g, gp)));
    return true;
  };
  const bindWire = (w: PWire, g: MWire) => {
    const fixed = get(at.wires, w.id);
    if ((fixed !== undefined && fixed !== g.id) || usedWire.has(g.id) || (w.polarity && g.polarity !== w.polarity)) return false;
    if (!bindCarrier(w.carrier, g.carrier)) return false;
    if (!bindBox(w.from.box, g.from.box) || !bindPort(w.from.box, w.from.port, g.from.port)) return false;
    if (!bindBox(w.to.box, g.to.box) || !bindPort(w.to.box, w.to.port, g.to.port)) return false;
    set(mWire, w.id, g.id, usedWire);
    return true;
  };

  type Task = { kind: "wire"; wire: PWire } | { kind: "box"; box: string } | { kind: "port"; box: string; port: string };
  const tasks: Task[] = [
    ...[...L.wires.values()].map((wire) => ({ kind: "wire" as const, wire })),
    ...[...L.boxes.keys()].map((box) => ({ kind: "box" as const, box })),
    ...[...L.ports.values()].map((p) => ({ kind: "port" as const, box: p.box, port: p.id })),
  ];
  const found: RuleMatch[] = [];
  let steps = 0;
  const snapshot = (): RuleMatch => ({
    boxes: Object.fromEntries(mBox),
    ports: Object.fromEntries([...L.boxes.keys()].map((b) => [b, Object.fromEntries(portsOf(L.boxes.get(b)!).map((p) => [p.id, mPort.get(key(b, p.id))!]))])),
    wires: Object.fromEntries(mWire),
    carriers: Object.fromEntries(mCar),
  });
  const go = (i: number): void => {
    if (found.length > limit) return;
    if (i === tasks.length) { found.push(snapshot()); return; }
    const t = tasks[i];
    if ((t.kind === "box" && mBox.has(t.box)) || (t.kind === "port" && mPort.has(key(t.box, t.port)))) return go(i + 1);
    const tries: Array<() => boolean> = t.kind === "wire" ? gWires.map((g) => () => bindWire(t.wire, g))
      : t.kind === "box" ? gBoxes.map((g) => () => bindBox(t.box, g.id))
      : byId(portsOf(gBox.get(mBox.get(t.box)!)!)).map((q) => () => bindPort(t.box, t.port, q.id));
    for (const attempt of tries) {
      if (++steps > maxSteps) throw new Budget();
      const n = trail.length;
      if (attempt()) go(i + 1);
      undo(n);
      if (found.length > limit) return;
    }
  };
  let decided = true;
  try { go(0); } catch (e) {
    if (!(e instanceof Budget)) throw e;
    decided = false;
  }
  const complete = decided && found.length <= limit;
  const matches = found.slice(0, limit).map((match) => {
    const verified = checkMatch(model, rule, match);
    if (verified.length) throw new Error(`internal: search returned an unverified match: ${verified.join("; ")}`);
    const g = gluingConditions(model, rule, match);
    const violations = [...g.identification, ...g.dangling, ...(g.ok ? declaredRowConditions(model, rule, match) : []), ...distinctIssues(rule, match.carriers).map((i) => i.message)];
    return { match, applicable: !violations.length, violations };
  });
  return {
    ok: true as const,
    rule: { id: rule.id, ...(rule.name ? { name: rule.name } : {}), ...(rule.source ? { source: rule.source } : {}) },
    decided,
    complete,
    matches,
    ...(rightOnlyVars.length ? { bindCarriers: rightOnlyVars } : {}),
    note: !decided
      ? `search budget of ${maxSteps} steps exhausted: these matches are valid, but the list is not known to be complete`
      : !complete
        ? `more than ${limit} matches: narrow them with 'at'`
        : `all injective matches of the left side.${rightOnlyVars.length ? ` Bind ${rightOnlyVars.map((v) => `'${v}'`).join(", ")} to model carriers with 'carriers' before applying.` : ""} Apply one by passing it back as 'match'.`,
  };
}

const freshId = (base: string, taken: Set<string>) => {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
};

/**
 * Apply the rule at `match`: check the match, the no-identification and no-dangling conditions,
 * delete the image of L \ K, glue R \ K under fresh ids, and type-check the result. `carriers`
 * binds the variables used only on the right side; `ids` overrides the default fresh ids. A
 * created box or wire defaults to the id of the element it is `like`, made fresh against every id
 * the model has, including deleted ones. A `like` copy does not copy declared behaviour: its ports
 * are the rule's, not the original's.
 */
export function applyRule(model: FunctionModel, rule: Rule, match: RuleMatch, opts: { carriers?: Record<string, string>; ids?: RuleIds } = {}):
  | { ok: true; model: FunctionModel; rule: string; created: { boxes: Record<string, string>; ports: Record<string, Record<string, string>>; wires: Record<string, string> }; deleted: { boxes: string[]; ports: Array<{ box: string; port: string }>; wires: string[] }; fieldChanges?: FieldChange[]; deliverableKeysChanged: boolean; basis: Theorem[]; note: string }
  | Failure {
  const pre = preconditions(model, rule);
  if (pre.length) return fail(pre);
  const { L, K, R, rightOnlyVars } = index(rule);
  const bound = new Map(Object.entries(match.carriers));
  const issues: Issue[] = [];
  const carriers = quoted(model.carriers.map((c) => c.id));
  for (const [v, c] of Object.entries(opts.carriers ?? {})) {
    if (!rightOnlyVars.includes(v)) {
      issues.push(issue("not-right-only-variable", jp("$.carriers", v), `carriers: '${v}' is not a carrier variable used only on the right side`,
        rightOnlyVars.length ? `carriers binds the right-only variables ${quoted(rightOnlyVars)}; the match binds the rest.` : "This rule has no right-only variable: drop carriers; the match binds every variable."));
    } else bound.set(v, c);
  }
  for (const v of rightOnlyVars) {
    if (!bound.has(v)) issues.push(issue("unbound-carrier-variable", "$.carriers", `carriers: variable '${v}' appears only on the right side; bind it to a model carrier (add one to the model if it has none)`, `Pass carriers: { '${v}': <a carrier id of the model: ${carriers}> }.`));
  }
  const fromOpts = new Set(Object.keys(opts.carriers ?? {}));
  issues.push(...rebase(fail(matchIssues(model, rule, { ...match, carriers: Object.fromEntries(bound) }, (v) => jp(fromOpts.has(v) ? "$.carriers" : "$.match.carriers", v))), [], "match: ").issues);
  if (issues.length) return fail(issues);
  const glue = gluingConditions(model, rule, match);
  if (!glue.ok) return fail(glue.issues);
  const declared = declaredRowIssues(model, rule, match);
  if (declared.length) return fail(declared);
  const apart = distinctIssues(rule, bound, (v) => (fromOpts.has(v) ? jp("$.carriers", v) : jp("$.match.carriers", v)));
  if (apart.length) return fail(apart);

  const gone = deletedBy(rule, match);
  const sigma = (v: string) => bound.get(v)!;
  const boxIds = new Set(model.boxes.map((b) => b.id)), wireIds = new Set(model.wires.map((w) => w.id));
  const portIds = new Map(model.boxes.map((b) => [b.id, new Set(portsOf(b).map((p) => p.id))]));
  const gBox = new Map(model.boxes.map((b) => [b.id, b])), gWire = new Map(model.wires.map((w) => [w.id, w]));
  const claim = (taken: Set<string>, wanted: string | undefined, base: string, what: string, path = "$.ids") => {
    if (wanted !== undefined && taken.has(wanted)) {
      issues.push(issue("id-not-fresh", path, `ids: ${what} id '${wanted}' is not fresh`, `Pick an id nothing there uses, e.g. '${freshId(wanted, taken)}', or omit it for a fresh default.`));
      return wanted;
    }
    const id = wanted ?? freshId(base, taken);
    taken.add(id);
    return id;
  };
  const ids = opts.ids ?? {};
  const createdKeys = (kind: string, xs: Iterable<string>) => `ids.${kind} keys are the ${kind} the rule creates: ${quoted(xs)}.`;
  const createdBoxIds = [...R.boxes.keys()].filter((id) => !K.boxes.has(id)), createdWireIds = [...R.wires.keys()].filter((id) => !K.wires.has(id));
  for (const id of Object.keys(ids.boxes ?? {})) if (!R.boxes.has(id) || K.boxes.has(id)) issues.push(issue("not-a-rule-element", jp("$.ids.boxes", id), `ids: '${id}' is not a box the rule creates`, createdKeys("boxes", createdBoxIds)));
  for (const id of Object.keys(ids.wires ?? {})) if (!R.wires.has(id) || K.wires.has(id)) issues.push(issue("not-a-rule-element", jp("$.ids.wires", id), `ids: '${id}' is not a wire the rule creates`, createdKeys("wires", createdWireIds)));
  for (const [b, ps] of Object.entries(ids.ports ?? {})) {
    for (const p of Object.keys(ps)) {
      if (!R.ports.has(key(b, p)) || K.ports.has(key(b, p))) issues.push(issue("not-a-rule-element", jp("$.ids.ports", b, p), `ids: '${b}.${p}' is not a port the rule creates`, createdKeys("ports", [...R.ports].filter(([k]) => !K.ports.has(k)).map(([, q]) => `${q.box}.${q.id}`))));
    }
  }

  // Images of right-side boxes and ports: kept ones through the match, created ones fresh.
  const createdBoxes = new Map<string, string>();
  for (const b of R.boxes.values()) {
    if (K.boxes.has(b.id)) continue;
    const base = b.like !== undefined ? get(match.boxes, b.like)! : b.id;
    createdBoxes.set(b.id, claim(boxIds, get(ids.boxes, b.id), base, "box", jp("$.ids.boxes", b.id)));
  }
  // A created box's ports: given ids first, then each port's rule id, or the id of the port it
  // copies through `like`, made unique within the box.
  const createdPorts = new Map<string, Map<string, string>>();
  for (const rb of createdBoxes.keys()) {
    const b = R.boxes.get(rb)!, assigned = new Map<string, string>(), taken = new Set<string>();
    for (const p of portsOf(b)) {
      const wanted = get(get(ids.ports, rb), p.id);
      if (wanted === undefined) continue;
      if (taken.has(wanted)) issues.push(issue("duplicate-id", jp("$.ids.ports", rb, p.id), `ids: port id '${wanted}' is given twice on created box '${rb}'`, `Give each port of created box '${rb}' its own id.`));
      taken.add(wanted);
      assigned.set(p.id, wanted);
    }
    for (const p of portsOf(b)) {
      if (assigned.has(p.id)) continue;
      const base = (b.like !== undefined ? get(get(match.ports, b.like), p.id) : undefined) ?? p.id;
      assigned.set(p.id, claim(taken, undefined, base, `port of created box '${rb}'`));
    }
    createdPorts.set(rb, assigned);
  }
  const newPorts = new Map<string, Array<{ id: string; carrier: string; side: Side }>>();
  for (const [k, p] of R.ports) {
    if (!K.boxes.has(p.box) || K.ports.has(k)) continue;
    const g = get(match.boxes, p.box)!;
    const id = claim(portIds.get(g)!, get(get(ids.ports, p.box), p.id), p.id, `port of '${g}'`, jp("$.ids.ports", p.box, p.id));
    createdPorts.set(p.box, (createdPorts.get(p.box) ?? new Map()).set(p.id, id));
    newPorts.set(g, [...(newPorts.get(g) ?? []), { id, carrier: sigma(p.carrier), side: p.side }]);
  }
  const createdWires = new Map<string, string>();
  for (const w of wiresOf(rule.right)) {
    if (K.wires.has(w.id)) continue;
    const base = w.like !== undefined ? get(match.wires, w.like)! : w.id;
    createdWires.set(w.id, claim(wireIds, get(ids.wires, w.id), base, "wire", jp("$.ids.wires", w.id)));
  }
  if (issues.length) return fail(issues);
  const boxImage = (b: string) => (K.boxes.has(b) ? get(match.boxes, b)! : createdBoxes.get(b)!);
  const portImage = (b: string, p: string) => (K.ports.has(key(b, p)) ? get(get(match.ports, b), p)! : createdPorts.get(b)!.get(p)!);

  // Pushout complement: delete the image of L \ K. Then the pushout: glue R \ K.
  const keepPorts = (b: MBox, side: Side, list: MBox["inputs"]) => {
    const added = (newPorts.get(b.id) ?? []).filter((p) => p.side === side).map((p) => ({ id: p.id, carrier: p.carrier }));
    if (list === undefined && !added.length) return undefined;
    return [...(list ?? []).filter((p) => !gone.ports.has(key(b.id, p.id))), ...added];
  };
  const kept: MBox[] = model.boxes.filter((b) => !gone.boxes.has(b.id)).map((b) => {
    const inputs = keepPorts(b, "in", b.inputs), outputs = keepPorts(b, "out", b.outputs);
    const box: MBox = { ...b };
    if (inputs) box.inputs = inputs; else delete box.inputs;
    if (outputs) box.outputs = outputs; else delete box.outputs;
    return box;
  });
  const created: MBox[] = [...createdBoxes].map(([rb, id]) => {
    const b = R.boxes.get(rb)!;
    const like = b.like !== undefined ? gBox.get(get(match.boxes, b.like)!)! : undefined;
    const typed = (ps: PBox["inputs"]) => ps?.map((p) => ({ id: createdPorts.get(rb)!.get(p.id)!, carrier: sigma(p.carrier) }));
    const action = b.action ?? like?.action, cost = b.cost ?? like?.cost;
    return {
      id,
      name: b.name ?? like!.name,
      role: b.role ?? like!.role,
      ...(action !== undefined ? { action } : {}),
      ...(b.inputs ? { inputs: typed(b.inputs) } : {}),
      ...(b.outputs ? { outputs: typed(b.outputs) } : {}),
      ...(cost !== undefined ? { cost: { ...cost } } : {}),
    };
  });
  const glued: MWire[] = [...createdWires].map(([rw, id]) => {
    const w = R.wires.get(rw)!;
    const like = w.like !== undefined ? gWire.get(get(match.wires, w.like)!)! : undefined;
    const verb = w.verb ?? like?.verb;
    return {
      id,
      from: { box: boxImage(w.from.box), port: portImage(w.from.box, w.from.port) },
      to: { box: boxImage(w.to.box), port: portImage(w.to.box, w.to.port) },
      carrier: sigma(w.carrier),
      polarity: w.polarity ?? like!.polarity,
      ...(verb !== undefined ? { verb } : {}),
    };
  });
  const result: FunctionModel = { ...model, boxes: [...kept, ...created], wires: [...model.wires.filter((w) => !gone.wires.has(w.id)), ...glued] };
  const after = checkModel(result);
  if (!after.ok) {
    return fail(after.issues.map((x) => issue("ill-typed-result", "$.rule.right", `result: ${x.message}`,
      `Applying the rule here leaves the model ill-typed: ${x.hint} Check the rule's right side and the carriers bound to its variables.`)));
  }
  // A created wire `like` a deleted one on another carrier is the same function in another field: record both carriers.
  const carrier = new Map(model.carriers.map((c) => [c.id, c]));
  const field = (id: string) => ({ carrier: id, layer: carrier.get(id)!.layer, dimension: carrier.get(id)!.dimension });
  const fieldChanges: FieldChange[] = [...createdWires].flatMap(([rw, id]) => {
    const like = R.wires.get(rw)!.like;
    const was = like !== undefined && gone.wires.has(get(match.wires, like)!) ? gWire.get(get(match.wires, like)!)! : undefined;
    const now = glued.find((w) => w.id === id)!;
    return was && was.carrier !== now.carrier ? [{ wire: id, replaces: was.id, from: field(was.carrier), to: field(now.carrier) }] : [];
  });
  const keys = (m: FunctionModel) => idealityProfile(m).deliverables.map((d) => d.key);
  const deliverableKeysChanged = keys(model).some((k) => !keys(result).includes(k));
  return {
    ok: true,
    model: result,
    rule: rule.id,
    created: {
      boxes: Object.fromEntries(createdBoxes),
      ports: Object.fromEntries([...createdPorts].map(([b, ps]) => [b, Object.fromEntries(ps)])),
      wires: Object.fromEntries(createdWires),
    },
    deleted: {
      boxes: [...gone.boxes],
      ports: [...gone.ports].map((k) => JSON.parse(k) as [string, string]).filter(([b]) => !gone.boxes.has(b)).map(([box, port]) => ({ box, port })),
      wires: [...gone.wires],
    },
    ...(fieldChanges.length ? { fieldChanges } : {}),
    deliverableKeysChanged,
    basis: ["typed_dpo"],
    note: "A rule application is a structural move, not evidence that it helps: compare the result with the baseline via triz_function_model compare_to. Created elements copy what the rule says; their real cost and any new harms are modelled only if you add them."
      + (deliverableKeysChanged ? " A deliverable is now on another port or carrier, so compare_to reads it as lost and regained: compare the deliverables by hand." : ""),
  };
}

const TRENDS = "skills/triz-innovation/references/evolution-trends.md";
const functionPattern = {
  boxes: [
    { id: "tool", outputs: [{ id: "out", carrier: "c" }] },
    { id: "object", inputs: [{ id: "in", carrier: "c" }] },
  ],
  wires: [{ id: "f", from: { box: "tool", port: "out" }, to: { box: "object", port: "in" }, carrier: "c" }],
};

/**
 * Evolution lines as rules. A line is encoded only when its text in evolution-trends.md describes
 * a structural move on the wiring; the rule encodes that move and no more. The other lines are
 * recorded, with the reason, in categorical-model.md.
 */
export const TREND_RULES: Rule[] = [
  {
    id: "mono-bi",
    name: "Transition to supersystem: mono → bi",
    carriers: ["c"],
    left: functionPattern,
    interface: functionPattern,
    right: {
      boxes: [...functionPattern.boxes, { id: "tool-2", like: "tool", outputs: [{ id: "out", carrier: "c" }] }],
      wires: [...functionPattern.wires, { id: "f-2", like: "f", from: { box: "tool-2", port: "out" }, to: { box: "object", port: "in" }, carrier: "c" }],
    },
    source: { file: TRENDS, line: 23, quote: "mono → bi → poly → system with its supersystem" },
    note: "Adds a second performer of the matched function. The copy takes the performer's role, name, action, and cost, and the function's rating and verb; it has only the one output port, under the performer's port id. Its cost counts in the ideality profile. Apply again for poly. The last step, a system with its supersystem, is not encoded.",
  },
  {
    id: "feedback",
    name: "Increasing controllability: self-adjusting with feedback",
    carriers: ["c", "s"],
    left: functionPattern,
    interface: functionPattern,
    right: {
      boxes: [
        { id: "tool", inputs: [{ id: "adjust", carrier: "s" }], outputs: [{ id: "out", carrier: "c" }] },
        { id: "object", inputs: [{ id: "in", carrier: "c" }], outputs: [{ id: "state", carrier: "s" }] },
      ],
      wires: [
        ...functionPattern.wires,
        { id: "feedback", from: { box: "object", port: "state" }, to: { box: "tool", port: "adjust" }, carrier: "s", polarity: "useful", verb: "adjust" },
      ],
    },
    source: { file: TRENDS, line: 27, quote: "fixed → adjustable → self-adjusting with feedback" },
    note: "Adds one useful function from the object back to the tool, on a carrier you bind as 's', plus the two ports it needs. No sensor or controller box is added; the line's text names none. A loop of useful functions is not a harm loop. The earlier steps, fixed and adjustable, are not encoded.",
  },
  {
    id: "working-field",
    name: "Changing the working field: the same function on another field",
    carriers: ["c", "d"],
    distinct: [["c", "d"]],
    left: functionPattern,
    interface: { boxes: [{ id: "tool" }, { id: "object" }] },
    right: {
      boxes: [
        { id: "tool", outputs: [{ id: "field", carrier: "d" }] },
        { id: "object", inputs: [{ id: "field", carrier: "d" }] },
      ],
      wires: [{ id: "f-field", like: "f", from: { box: "tool", port: "field" }, to: { box: "object", port: "field" }, carrier: "d" }],
    },
    source: { file: TRENDS, line: 30, quote: "mechanical → thermal → chemical → electric → magnetic → electromagnetic" },
    note: "Re-makes the matched function on a carrier you bind as 'd', which must differ from the matched one: the function and its two ports go, a port of 'd' on each box and a function of 'd' between them come, and the function keeps its rating and verb. The result records both carriers' layer and dimension in fieldChanges. The kernel neither orders fields nor checks that 'd' is a field: which field is cheapest, and whether it still delivers the function, are what to substantiate. A port that carries other functions too cannot go, so that match is not applicable (dangling). A product's deliverable moves to the new port and carrier, so compare_to reads it as lost and regained (deliverableKeysChanged).",
  },
].map((r) => Rule.parse(r));

/**
 * Evolution lines read as detectors: a line whose text names a diagnosis, not a move. A detector
 * reports where the line points in the model and changes nothing.
 */
export const TREND_DETECTORS = [
  {
    id: "uneven-development",
    name: "Uneven development of subsystems: the lagging subsystem",
    source: { file: TRENDS, line: 25, quote: "one subsystem lags and becomes the limiter" },
    note: "Reports the lagging subsystem: a box of the largest harm-loop region that is also on a binding feasibility dimension or limits a deliverable. A diagnosis, not a move: it names where the next contradiction is worth modelling.",
  },
] as const;

type Reason =
  | { kind: "binding"; dimensions: string[]; basis: readonly Theorem[] }
  | { kind: "unprovidable"; basis: readonly Theorem[] }
  | { kind: "insufficient-deliverable"; wires: string[] };

/**
 * Uneven development of subsystems, as a detector. The lagging subsystem is a box that
 *  - lies in a largest harm-loop region: a strongly connected region of harmLoops with the most
 *    boxes (every region of that size is searched, in harmLoops order); and
 *  - is on a binding dimension or limits a deliverable. On a binding dimension: triz_feasibility
 *    finds the model infeasible over budget, and the box's fixed cost, or the operating cost of
 *    its row in the witness of some minimal resource vector, is above 0 on a dimension every
 *    minimal vector exceeds. Every minimal vector is read, not only the 50 the tool lists.
 *    Limits a deliverable: it is the box feasibility finds unprovidable, or it performs an
 *    insufficient function on a product box.
 * Verdicts: `lagging` with the candidates and their reasons; `none` when feasibility is decided and
 * no box of the region qualifies; `undecided` when there is no harm loop (reason no-harm-loop) or,
 * with no box found, feasibility is undecided (its reason). Fails closed on a model or feasibility
 * rows that do not type-check, and past feasibility's caps.
 */
export function laggingSubsystem(model: FunctionModel) {
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  const [d] = TREND_DETECTORS;
  const detector = { id: d.id, name: d.name, source: d.source };
  const loops = harmLoops(model);
  if (!loops.length) {
    return { ok: true as const, detector, verdict: "undecided" as const, reason: "no-harm-loop" as const, lagging: [], note: "The model has no harm loop, so there is no region for a subsystem to lag in. Model the harmful and excessive functions first (triz_function_model)." };
  }
  const size = Math.max(...loops.map((l) => l.boxes.length));
  const regions = loops.filter((l) => l.boxes.length === size);
  // Every minimal vector, not the display list: a vector past the first 50 may be the only one in which a box's row costs on a binding dimension.
  const f = feasibility(model, {}, { listAll: true });
  if (!f.ok) return f;
  const minimal = "minimal" in f ? f.minimal : [];
  if ("minimalCount" in f && minimal.length !== f.minimalCount) throw new Error(`laggingSubsystem invariant: ${minimal.length} of ${f.minimalCount} minimal vectors read`);
  const binding = f.verdict === "infeasible" && "binding" in f ? f.binding : [];
  const unprovidable = f.verdict === "infeasible" && "unprovidable" in f ? f.unprovidable.box : undefined;
  const basis = "basis" in f ? f.basis : [];
  const products = new Set(model.boxes.filter((b) => b.role === "product").map((b) => b.id));
  const byId = new Map(model.boxes.map((b) => [b.id, b]));
  const lagging = regions.flatMap((region) => region.boxes.flatMap((id) => {
    const b = byId.get(id)!;
    const operating = (dim: string) => minimal.some((v) => {
      const k = v.rows.find((r) => r.box === id)?.row;
      return k !== undefined && (get(b.feasibility![k].cost, dim) ?? 0) > 0;
    });
    const dims = binding.filter((dim) => (get(b.cost, dim) ?? 0) > 0 || operating(dim));
    const limits = model.wires.filter((w) => w.from.box === id && products.has(w.to.box) && w.polarity === "insufficient").map((w) => w.id).sort();
    const reasons: Reason[] = [
      ...(dims.length ? [{ kind: "binding" as const, dimensions: dims, basis }] : []),
      ...(unprovidable === id ? [{ kind: "unprovidable" as const, basis }] : []),
      ...(limits.length ? [{ kind: "insufficient-deliverable" as const, wires: limits }] : []),
    ];
    return reasons.length ? [{ box: id, region: region.boxes, reasons }] : [];
  }));
  const verdict = lagging.length ? "lagging" as const : f.verdict !== "undecided" ? "none" as const : "undecided" as const;
  return {
    ok: true as const,
    detector,
    verdict,
    ...(verdict === "undecided" && "reason" in f ? { reason: f.reason } : {}),
    lagging,
    regions: regions.map((l) => ({ boxes: l.boxes, negative: l.negative, basis: ["edge_on_cycle"] as Theorem[] })),
    feasibility: { verdict: f.verdict, ...("reason" in f ? { reason: f.reason } : {}), ...(binding.length ? { binding } : {}), ...(unprovidable ? { unprovidable } : {}) },
    note: verdict === "lagging"
      ? "Each candidate lags by the structural reading of the line, not by measurement: substantiate that it limits the system, then model its contradiction."
      : verdict === "none"
        ? "No box of the largest harm-loop region is on a binding dimension or limits a deliverable: by this reading no subsystem lags."
        : "No box of the largest harm-loop region limits a deliverable, and feasibility is undecided: declare feasibility rows and a budget to decide whether one is on a binding dimension.",
  };
}
