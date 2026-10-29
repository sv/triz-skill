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
 * A match is a label-preserving homomorphism L → G (a role or polarity the pattern omits matches
 * any). So a pattern box matches any box that has at least the pattern's ports.
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
 *                   Every failure fails closed with an error naming the condition.
 *  - TREND_RULES  — the evolution lines whose text in evolution-trends.md describes a structural
 *                   move, each citing its line. Trimming is `triz_transform` `trim`.
 *
 * The result is typed by `typed_dpo` in theory/CategoricalTriz.lean. Its hypotheses map to checks
 * here: the model type-checks; R type-checks (validateRule); no surviving wire touches a deleted
 * box (dangling); R gives no port a carrier the model does not (checkMatch, and fresh ids for
 * created ports). No-identification makes the result a pushout but is not needed for typing.
 */
import { z } from "zod";
import { Box, Endpoint, Polarity, Role, checkModel, type FunctionModel } from "./act.js";
import { Budget } from "./act-iso.js";
import type { Theorem } from "./act-basis.js";

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
  like: Id.optional().describe("Created box only: copy role, name, action, and cost from the model box this left-side box matches; a port with the same id as one of that box's ports takes the matched port's id"),
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
}).meta({ id: "RuleMatch" });

export const RuleIds = z.strictObject({
  boxes: z.record(z.string(), Id).optional().describe("Created box id → model id"),
  wires: z.record(z.string(), Id).optional().describe("Created wire id → model id"),
  ports: z.record(z.string(), z.record(z.string(), Id)).optional().describe("Kept box id → (created port id → model port id)"),
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
type Failure = { ok: false; errors: string[] };

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

/** Well-formedness of a rule. Fails closed with every error. */
export function validateRule(rule: Rule): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const vars = rule.carriers;
  for (const v of duplicates(vars)) errors.push(`carrier variable '${v}' declared twice`);
  for (const [side, p] of [["left", rule.left], ["interface", rule.interface], ["right", rule.right]] as const) {
    errors.push(...checkModel(asModel(p, [...new Set(vars)])).errors.map((e) => `${side}: ${e.replace(/unknown carrier/g, "undeclared carrier variable")}`));
  }
  const { L, K, R, leftVars, rightOnlyVars } = index(rule);
  for (const v of vars) if (!leftVars.has(v) && !rightOnlyVars.includes(v)) errors.push(`carrier variable '${v}' is used nowhere`);
  for (const [side, X] of [["left", L], ["right", R]] as const) {
    for (const [id, k] of K.boxes) {
      const x = X.boxes.get(id);
      if (!x) { errors.push(`interface box '${id}' is not in ${side}`); continue; }
      if (x.role !== k.role) errors.push(`interface box '${id}': role constraint differs in ${side}`);
    }
    for (const [pk, q] of K.ports) {
      const x = X.ports.get(pk);
      if (K.boxes.has(q.box) && X.boxes.has(q.box) && (!x || x.side !== q.side || x.carrier !== q.carrier)) {
        errors.push(`interface port '${q.box}.${q.id}' is not in ${side} with the same side and carrier`);
      }
    }
    for (const [id, k] of K.wires) {
      const x = X.wires.get(id);
      if (!x) { errors.push(`interface wire '${id}' is not in ${side}`); continue; }
      if (key(x.from.box, x.from.port, x.to.box, x.to.port, x.carrier) !== key(k.from.box, k.from.port, k.to.box, k.to.port, k.carrier) || x.polarity !== k.polarity) {
        errors.push(`interface wire '${id}' differs in ${side}`);
      }
    }
  }
  const createdOnly = (b: PBox) => (["like", "name", "action", "cost"] as const).filter((f) => b[f] !== undefined);
  for (const [side, p] of [["left", rule.left], ["interface", rule.interface]] as const) {
    for (const b of p.boxes) for (const f of createdOnly(b)) errors.push(`${side} box '${b.id}': '${f}' is only for boxes the rule creates`);
    for (const w of wiresOf(p)) for (const f of (["like", "verb"] as const).filter((f) => w[f] !== undefined)) errors.push(`${side} wire '${w.id}': '${f}' is only for wires the rule creates`);
  }
  for (const b of rule.right.boxes) {
    if (K.boxes.has(b.id)) {
      for (const f of createdOnly(b)) errors.push(`right box '${b.id}': '${f}' is only for boxes the rule creates; '${b.id}' is kept`);
    } else {
      if (b.like !== undefined && !L.boxes.has(b.like)) errors.push(`right box '${b.id}': like '${b.like}' is not a left-side box`);
      if (b.like === undefined && (b.role === undefined || b.name === undefined)) errors.push(`right box '${b.id}': a created box needs role and name, or like`);
    }
  }
  for (const w of wiresOf(rule.right)) {
    if (K.wires.has(w.id)) {
      for (const f of (["like", "verb"] as const).filter((f) => w[f] !== undefined)) errors.push(`right wire '${w.id}': '${f}' is only for wires the rule creates; '${w.id}' is kept`);
    } else {
      if (w.like !== undefined && !L.wires.has(w.like)) errors.push(`right wire '${w.id}': like '${w.like}' is not a left-side wire`);
      if (w.like === undefined && w.polarity === undefined) errors.push(`right wire '${w.id}': a created wire needs polarity, or like`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Verify that `match` is a typed homomorphism L → model: labels, sides, carriers, and incidences preserved. */
export function checkMatch(model: FunctionModel, rule: Rule, match: RuleMatch): string[] {
  const errors: string[] = [];
  const { L } = index(rule);
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const wires = new Map(model.wires.map((w) => [w.id, w]));
  const carriers = new Set(model.carriers.map((c) => c.id));
  for (const v of Object.keys(match.carriers)) {
    if (!rule.carriers.includes(v)) errors.push(`carrier '${v}' is not a carrier variable of the rule`);
    else if (!carriers.has(match.carriers[v])) errors.push(`carrier variable '${v}' bound to unknown carrier '${match.carriers[v]}'`);
  }
  const sigma = (v: string) => get(match.carriers, v);
  for (const id of Object.keys(match.boxes)) if (!L.boxes.has(id)) errors.push(`box '${id}' is not a left-side box`);
  for (const id of Object.keys(match.wires)) if (!L.wires.has(id)) errors.push(`wire '${id}' is not a left-side wire`);
  for (const [b, ps] of Object.entries(match.ports)) {
    for (const p of Object.keys(ps)) if (!L.ports.has(key(b, p))) errors.push(`port '${b}.${p}' is not a left-side port`);
  }
  for (const b of L.boxes.values()) {
    const g = get(match.boxes, b.id);
    const gb = g === undefined ? undefined : boxes.get(g);
    if (g === undefined) { errors.push(`box '${b.id}' is not mapped`); continue; }
    if (!gb) { errors.push(`box '${b.id}' maps to unknown box '${g}'`); continue; }
    if (b.role && gb.role !== b.role) errors.push(`box '${b.id}' (role ${b.role}) maps to '${g}' (role ${gb.role})`);
    for (const p of portsOf(b)) {
      const gp = get(get(match.ports, b.id), p.id);
      const q = gp === undefined ? undefined : portsOf(gb).find((x) => x.id === gp);
      if (gp === undefined) errors.push(`port '${b.id}.${p.id}' is not mapped`);
      else if (!q) errors.push(`port '${b.id}.${p.id}' maps to '${g}.${gp}', which does not exist`);
      else if (q.side !== p.side) errors.push(`port '${b.id}.${p.id}' (${p.side}) maps to '${g}.${gp}' (${q.side})`);
      else if (sigma(p.carrier) !== q.carrier) errors.push(`port '${b.id}.${p.id}' carrier '${p.carrier}' is bound to ${sigma(p.carrier) === undefined ? "nothing" : `'${sigma(p.carrier)}'`}, but '${g}.${gp}' carries '${q.carrier}'`);
    }
  }
  for (const w of L.wires.values()) {
    const g = get(match.wires, w.id);
    const gw = g === undefined ? undefined : wires.get(g);
    if (g === undefined) { errors.push(`wire '${w.id}' is not mapped`); continue; }
    if (!gw) { errors.push(`wire '${w.id}' maps to unknown wire '${g}'`); continue; }
    const end = (e: { box: string; port: string }) => key(get(match.boxes, e.box) ?? "", get(get(match.ports, e.box), e.port) ?? "");
    if (end(w.from) !== key(gw.from.box, gw.from.port)) errors.push(`wire '${w.id}' source does not map to wire '${g}' source`);
    if (end(w.to) !== key(gw.to.box, gw.to.port)) errors.push(`wire '${w.id}' target does not map to wire '${g}' target`);
    if (sigma(w.carrier) !== gw.carrier) errors.push(`wire '${w.id}' carrier '${w.carrier}' does not map to wire '${g}' carrier '${gw.carrier}'`);
    if (w.polarity && gw.polarity !== w.polarity) errors.push(`wire '${w.id}' (${w.polarity}) maps to '${g}' (${gw.polarity})`);
  }
  return errors;
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
  for (const b of model.boxes) {
    if (!gone.boxes.has(b.id)) continue;
    for (const p of portsOf(b)) if (!gone.ports.has(key(b.id, p.id))) dangling.push(`dangling: port '${b.id}.${p.id}' of deleted box '${b.id}' is not on the rule's left side`);
  }
  for (const w of model.wires) {
    if (gone.wires.has(w.id)) continue;
    for (const e of [w.from, w.to]) {
      if (gone.boxes.has(e.box)) dangling.push(`dangling: wire '${w.id}' touches deleted box '${e.box}'`);
      else if (gone.ports.has(key(e.box, e.port))) dangling.push(`dangling: wire '${w.id}' touches deleted port '${e.box}.${e.port}'`);
    }
  }
  return { identification, dangling, ok: !identification.length && !dangling.length };
}

export const MAX_STEPS = 100_000;
export const MAX_MATCHES = 50;

/**
 * Every injective match of the rule's left side, optionally seeded by a partial match `at`.
 * Deterministic: model elements are tried in id order. Fails closed on an invalid model or rule.
 */
export function matchRule(model: FunctionModel, rule: Rule, opts: { at?: Partial<RuleMatch>; limit?: number; maxSteps?: number } = {}) {
  const pre = [...checkModel(model).errors.map((e) => `model: ${e}`), ...validateRule(rule).errors.map((e) => `rule '${rule.id}': ${e}`)];
  if (pre.length) return { ok: false as const, errors: pre };
  const limit = opts.limit ?? MAX_MATCHES, maxSteps = opts.maxSteps ?? MAX_STEPS, at = opts.at ?? {};
  const { L, leftVars, rightOnlyVars } = index(rule);
  const unknown = [
    ...Object.keys(at.boxes ?? {}).filter((b) => !L.boxes.has(b)).map((b) => `at: '${b}' is not a left-side box`),
    ...Object.keys(at.wires ?? {}).filter((w) => !L.wires.has(w)).map((w) => `at: '${w}' is not a left-side wire`),
    ...Object.entries(at.ports ?? {}).flatMap(([b, ps]) => Object.keys(ps).filter((p) => !L.ports.has(key(b, p))).map((p) => `at: '${b}.${p}' is not a left-side port`)),
    ...Object.keys(at.carriers ?? {}).filter((v) => !leftVars.has(v)).map((v) => `at: '${v}' is not a carrier variable of the left side`),
  ];
  if (unknown.length) return { ok: false as const, errors: unknown };
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
    return { match, applicable: g.ok, violations: [...g.identification, ...g.dangling] };
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
 * the model has, including deleted ones.
 */
export function applyRule(model: FunctionModel, rule: Rule, match: RuleMatch, opts: { carriers?: Record<string, string>; ids?: RuleIds } = {}):
  | { ok: true; model: FunctionModel; rule: string; created: { boxes: Record<string, string>; ports: Record<string, Record<string, string>>; wires: Record<string, string> }; deleted: { boxes: string[]; ports: Array<{ box: string; port: string }>; wires: string[] }; basis: Theorem[]; note: string }
  | Failure {
  const pre = [...checkModel(model).errors.map((e) => `model: ${e}`), ...validateRule(rule).errors.map((e) => `rule '${rule.id}': ${e}`)];
  if (pre.length) return { ok: false, errors: pre };
  const { L, K, R, rightOnlyVars } = index(rule);
  const bound = new Map(Object.entries(match.carriers));
  const errors: string[] = [];
  for (const [v, c] of Object.entries(opts.carriers ?? {})) {
    if (!rightOnlyVars.includes(v)) errors.push(`carriers: '${v}' is not a carrier variable used only on the right side`);
    else bound.set(v, c);
  }
  for (const v of rightOnlyVars) {
    if (!bound.has(v)) errors.push(`carriers: variable '${v}' appears only on the right side; bind it to a model carrier (add one to the model if it has none)`);
  }
  errors.push(...checkMatch(model, rule, { ...match, carriers: Object.fromEntries(bound) }).map((e) => `match: ${e}`));
  if (errors.length) return { ok: false, errors };
  const glue = gluingConditions(model, rule, match);
  if (!glue.ok) return { ok: false, errors: [...glue.identification, ...glue.dangling] };

  const gone = deletedBy(rule, match);
  const sigma = (v: string) => bound.get(v)!;
  const boxIds = new Set(model.boxes.map((b) => b.id)), wireIds = new Set(model.wires.map((w) => w.id));
  const portIds = new Map(model.boxes.map((b) => [b.id, new Set(portsOf(b).map((p) => p.id))]));
  const gBox = new Map(model.boxes.map((b) => [b.id, b])), gWire = new Map(model.wires.map((w) => [w.id, w]));
  const claim = (taken: Set<string>, wanted: string | undefined, base: string, what: string) => {
    if (wanted !== undefined && taken.has(wanted)) { errors.push(`ids: ${what} id '${wanted}' is not fresh`); return wanted; }
    const id = wanted ?? freshId(base, taken);
    taken.add(id);
    return id;
  };
  const ids = opts.ids ?? {};
  for (const id of Object.keys(ids.boxes ?? {})) if (!R.boxes.has(id) || K.boxes.has(id)) errors.push(`ids: '${id}' is not a box the rule creates`);
  for (const id of Object.keys(ids.wires ?? {})) if (!R.wires.has(id) || K.wires.has(id)) errors.push(`ids: '${id}' is not a wire the rule creates`);
  for (const [b, ps] of Object.entries(ids.ports ?? {})) {
    for (const p of Object.keys(ps)) if (!K.boxes.has(b) || !R.ports.has(key(b, p)) || K.ports.has(key(b, p))) errors.push(`ids: '${b}.${p}' is not a port the rule creates on a kept box`);
  }

  // Images of right-side boxes and ports: kept ones through the match, created ones fresh.
  const createdBoxes = new Map<string, string>();
  for (const b of R.boxes.values()) {
    if (K.boxes.has(b.id)) continue;
    const base = b.like !== undefined ? get(match.boxes, b.like)! : b.id;
    createdBoxes.set(b.id, claim(boxIds, get(ids.boxes, b.id), base, "box"));
  }
  const createdPorts = new Map<string, Map<string, string>>();
  const newPorts = new Map<string, Array<{ id: string; carrier: string; side: Side }>>();
  for (const [k, p] of R.ports) {
    if (!K.boxes.has(p.box) || K.ports.has(k)) continue;
    const g = get(match.boxes, p.box)!;
    const id = claim(portIds.get(g)!, get(get(ids.ports, p.box), p.id), p.id, `port of '${g}'`);
    createdPorts.set(p.box, (createdPorts.get(p.box) ?? new Map()).set(p.id, id));
    newPorts.set(g, [...(newPorts.get(g) ?? []), { id, carrier: sigma(p.carrier), side: p.side }]);
  }
  const createdWires = new Map<string, string>();
  for (const w of wiresOf(rule.right)) {
    if (K.wires.has(w.id)) continue;
    const base = w.like !== undefined ? get(match.wires, w.like)! : w.id;
    createdWires.set(w.id, claim(wireIds, get(ids.wires, w.id), base, "wire"));
  }
  if (errors.length) return { ok: false, errors };
  const boxImage = (b: string) => (K.boxes.has(b) ? get(match.boxes, b)! : createdBoxes.get(b)!);
  /** A created box's port keeps its rule id, or takes the id of the port it copies through `like`. */
  const createdPortId = (b: string, p: string) => {
    const like = R.boxes.get(b)!.like;
    return (like !== undefined ? get(get(match.ports, like), p) : undefined) ?? p;
  };
  const portImage = (b: string, p: string) =>
    !K.boxes.has(b) ? createdPortId(b, p) : K.ports.has(key(b, p)) ? get(get(match.ports, b), p)! : createdPorts.get(b)!.get(p)!;

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
    const typed = (ps: PBox["inputs"]) => ps?.map((p) => ({ id: createdPortId(rb, p.id), carrier: sigma(p.carrier) }));
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
  if (!after.ok) return { ok: false, errors: after.errors.map((e) => `result: ${e}`) };
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
    basis: ["typed_dpo"],
    note: "A rule application is a structural move, not evidence that it helps: compare the result with the baseline via triz_function_model compare_to. Created elements copy what the rule says; their real cost and any new harms are modelled only if you add them.",
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
].map((r) => Rule.parse(r));
