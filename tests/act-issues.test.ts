/**
 * Agent feedback: every ok:false result carries issues beside its errors (one per error, same
 * order), each with a registered kebab-case code, a JSON path that resolves into the call's input,
 * and a hint. One failing input per code, across every tool that fails closed; the common agent
 * mistakes get pointed hints; zod errors at the tool boundary carry hints; lints never change a
 * verdict; triz_nine_windows returns the models its transitions produce. Fixtures are the shipped
 * examples and small generic models.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { FunctionModel, analyseModel, checkModel, trimCandidates } from "../src/act.js";
import { weakestSpec } from "../src/act-behavior.js";
import { ISSUE_CODES, type Issue, type IssueCode } from "../src/act-issues.js";
import { analysisBasis, trimBasis } from "../src/act-basis.js";
import { matchRule, TREND_RULES, type Rule } from "../src/act-rule.js";
import { nineWindows } from "../src/act-windows.js";
import { modelCertificate } from "../src/act-cert.js";
import { globalSeparation } from "../src/act-global.js";
import { toolSpecs } from "../src/tools.js";
import { supportConcepts, SUPPORT_ACCEPTABLE } from "./support/concepts.js";
import { renamedTwin } from "./support/twin.js";
// triz_separate looks up principle texts for its suggestions: install the fs-backed data provider.
import "../src/data.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);
const edit = (name: string, change: (m: FunctionModel) => void) => { const m = example(name); change(m); return m; };
const box = (m: FunctionModel, id: string) => m.boxes.find((b) => b.id === id)!;

/** A sensor reads an unwired temperature input and signals the product: one boundary input, one deliverable. */
function thermo(values = ["lo", "hi"], port = "sig"): FunctionModel {
  return {
    domain: "physical",
    carriers: [
      { id: "t", layer: "energy", dimension: "K", values },
      { id: "s", layer: "information", dimension: "signal", values: ["off", "on"] },
    ],
    boxes: [
      { id: "sensor", name: "Sensor", role: "tool", inputs: [{ id: "temp", carrier: "t" }], outputs: [{ id: "sig", carrier: "s" }],
        behavior: values.map((v) => ({ in: { temp: v }, out: { sig: v === "hi" ? "on" : "off" } })) },
      { id: "plant", name: "Plant", role: "product", inputs: [{ id: port, carrier: "s" }] },
    ],
    wires: [{ id: "w-sig", from: { box: "sensor", port: "sig" }, to: { box: "plant", port }, carrier: "s", polarity: "useful" }],
  };
}

/** thermo() whose signal carrier reads amounts through `levels`. */
function signalLevels(levels: NonNullable<FunctionModel["carriers"][number]["levels"]>): FunctionModel {
  const m = thermo();
  m.carriers[1].levels = levels;
  return m;
}

/** A pump drives flow through a valve to a load; the valve's pressure drop is rated `polarity`. */
function pipe(polarity: FunctionModel["wires"][number]["polarity"]): FunctionModel {
  return {
    domain: "physical",
    carriers: [
      { id: "flow", layer: "material", dimension: "L/min" },
      { id: "pressure-drop", layer: "energy", dimension: "Pa pressure drop across the valve" },
    ],
    boxes: [
      { id: "pump", name: "Pump", role: "tool", outputs: [{ id: "out", carrier: "flow" }] },
      { id: "valve", name: "Valve", role: "mediator", inputs: [{ id: "in", carrier: "flow" }], outputs: [{ id: "out", carrier: "flow" }, { id: "dp", carrier: "pressure-drop" }] },
      { id: "load", name: "Load", role: "product", inputs: [{ id: "in", carrier: "flow" }, { id: "dp", carrier: "pressure-drop" }] },
    ],
    wires: [
      { id: "w-feed", from: { box: "pump", port: "out" }, to: { box: "valve", port: "in" }, carrier: "flow", polarity: "useful" },
      { id: "w-flow", from: { box: "valve", port: "out" }, to: { box: "load", port: "in" }, carrier: "flow", polarity: "useful" },
      { id: "w-dp", from: { box: "valve", port: "dp" }, to: { box: "load", port: "dp" }, carrier: "pressure-drop", polarity },
    ],
  };
}

const rule = (r: Partial<Rule>): Rule => ({
  id: "r", carriers: ["c"],
  left: { boxes: [{ id: "A", outputs: [{ id: "o", carrier: "c" }] }] },
  interface: { boxes: [{ id: "A", outputs: [{ id: "o", carrier: "c" }] }] },
  right: { boxes: [{ id: "A", outputs: [{ id: "o", carrier: "c" }] }] },
  ...r,
});
const listed = (name: string, model: FunctionModel) => {
  const r = matchRule(model, TREND_RULES.find((x) => x.id === name)!);
  assert.ok(r.ok && r.matches.length, `${name} lists a match`);
  return r.matches[0];
};

/**
 * Walk a JSON path into `input`. A missing tail of named keys is fine: it names an optional
 * argument or field to add (e.g. `$.transformation.ports.from`). A missing array index never is.
 */
function resolves(input: unknown, p: string): boolean {
  if (!p.startsWith("$")) return false;
  const re = /\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]|\['((?:[^'\\]|\\.)*)'\]/g;
  const segments = [...p.slice(1).matchAll(re)];
  if (segments.map((m) => m[0]).join("") !== p.slice(1)) return false;
  let x: unknown = input;
  for (const [i, m] of segments.entries()) {
    const key = m[1] ?? (m[2] !== undefined ? Number(m[2]) : m[3].replace(/\\(.)/g, "$1"));
    if (x === null || typeof x !== "object" || !Object.hasOwn(x, key)) return segments.slice(i).every((s) => s[2] === undefined);
    x = (x as Record<string | number, unknown>)[key];
  }
  return true;
}

type Case = {
  code: IssueCode; path?: string; hint?: RegExp;
  /** A tool call, or a kernel call with the input its paths point into. */
  tool?: string; args?: Record<string, unknown>;
  kernel?: () => unknown; input?: unknown;
  /** The failure inside the result, when it is nested (e.g. triz_separate's along). */
  pick?: (r: any) => any;
};

const bh = () => example("bearing-heat");
const beh = () => example("bearing-heat-behavior");
const dyn = () => example("bearing-heat-dynamics");
const fea = () => example("bearing-heat-feasibility");
const T = (transformation: Record<string, unknown>, model = bh()) => ({ tool: "triz_transform", args: { model, transformation } });
/** The bearing with a flow of radial load from the housing through the bearing to the shaft. */
const flowing = (path = ["housing", "bearing", "shaft"]): FunctionModel => ({ ...bh(), flows: [{ id: "load", carrier: "radial-load", path }] });

/** One box exposes the ports of its nested model, with a matching typed interface. */
function hierarchical(): FunctionModel {
  const c = { id: "c", layer: "information" as const, dimension: "bit" };
  return { domain: "software", carriers: [c], boxes: [{ id: "h", name: "H", role: "tool",
    inputs: [{ id: "x", carrier: "c" }], outputs: [{ id: "y", carrier: "c" }], inner: {
      model: { domain: "software", carriers: [c], boxes: [{ id: "a", name: "A", role: "tool", inputs: [{ id: "i", carrier: "c" }], outputs: [{ id: "o", carrier: "c" }] }], wires: [] },
      inputs: [{ outer: "x", inner: { box: "a", port: "i" } }], outputs: [{ outer: "y", inner: { box: "a", port: "o" } }],
    } }], wires: [] };
}
const hierarchyEdit = (change: (m: FunctionModel) => void) => { const m = hierarchical(); change(m); return m; };
const deepHierarchy = () => {
  let nested = hierarchical();
  for (let i = 0; i < 9; i++) { const outer = hierarchical(); outer.boxes[0].inner.model = nested; nested = outer; }
  return nested;
};
const invalidInner = hierarchyEdit((m) => { m.boxes[0].inner.model = { boxes: [] }; });
const deep = deepHierarchy();

const cases: Case[] = [
  // Hierarchical inputs and costed residual argument validation.
  { code: "hierarchy-depth", kernel: () => checkModel(deep), input: deep, hint: /reduce nesting/ },
  { code: "invalid-inner-model", kernel: () => checkModel(invalidInner), input: invalidInner, path: "$.boxes[0].inner.model", hint: /complete function model/ },
  { code: "hierarchy-summary", tool: "triz_function_model", args: { model: hierarchyEdit((m) => { m.boxes[0].cost = { dollars: 1 }; }) }, path: "$.model.boxes[0].inner", hint: /Remove outer behavior/ },
  { code: "hierarchy-interface", tool: "triz_function_model", args: { model: hierarchyEdit((m) => { m.boxes[0].inner.inputs = []; }) }, path: "$.model.boxes[0].inner.inputs", hint: /unique, total/ },
  { code: "hierarchy-binding", tool: "triz_function_model", args: { model: hierarchyEdit((m) => { m.boxes[0].inner.inputs[0].inner.port = "missing"; }) }, path: "$.model.boxes[0].inner.inputs[0]", hint: /same side and carrier/ },
  { code: "hierarchy-substitution", tool: "triz_trim", args: { model: hierarchical(), trim: ["h"] }, path: "$.model", hint: /Expand nested boxes/ },
  { code: "invalid-row-costs", kernel: () => weakestSpec(beh(), beh(), { maxCostSearch: 10 }), input: { model: beh(), compare_to: beh(), max_cost_search: 10 }, path: "$.max_cost_search", hint: /Supply row_costs/ },
  { code: "row-costs-without-weakest-spec", tool: "triz_behavior", args: { model: beh(), row_costs: [] }, path: "$.row_costs", hint: /weakest_spec/ },
  // Flows, the working-field rule, and the uneven-development detector
  { code: "flow-repeats-box", tool: "triz_function_model", args: { model: flowing(["housing", "bearing", "bearing", "shaft"]) }, path: "$.model.flows[0].path[2]", hint: /Drop the repeated 'bearing'/ },
  { code: "unknown-box", tool: "triz_flow", args: { model: flowing(["housing", "ghost"]) }, path: "$.model.flows[0].path[1]" },
  { code: "unknown-flow", ...T({ op: "rewrite", delete: { flows: ["ghost"] } }, flowing()), path: "$.transformation.delete.flows[0]", hint: /'load'/ },
  { code: "dangling-flow", ...T({ op: "rewrite", delete: { boxes: ["housing"] } }, flowing()), path: "$.model.flows[0]", hint: /delete.flows/ },
  { code: "flow-on-split-box", ...T({ op: "segment", box: "bearing", parts: [{ id: "a", ports: ["race"] }, { id: "b", ports: ["friction", "preload-in"] }] }, flowing()), path: "$.transformation.parts", hint: /'bearing'/ },
  { code: "not-adjacent", ...T({ op: "merge", boxes: ["housing", "shaft"], into: { id: "m", name: "M" } }, flowing()), path: "$.model.flows[0].path", hint: /'bearing'/ },
  { code: "distinct-carriers", tool: "triz_rule_apply", args: { model: bh(), rule_id: "working-field", match: listed("working-field", bh()).match, carriers: { d: listed("working-field", bh()).match.carriers.c } }, path: "$.carriers.d", hint: /new field's carrier/ },
  { code: "detector-takes-model-only", tool: "triz_rule_apply", args: { model: bh(), rule_id: "uneven-development", limit: 5 }, path: "$.limit", hint: /Drop 'limit'/ },
  // checkModel, through each tool that type-checks a model
  { code: "duplicate-id", tool: "triz_function_model", args: { model: edit("bearing-heat", (m) => { m.wires[1].id = m.wires[0].id; }) }, path: "$.model.wires[1]" },
  { code: "unknown-carrier", tool: "triz_function_model", args: { model: edit("bearing-heat", (m) => { m.boxes[0].outputs![0].carrier = "lava"; }) }, path: "$.model.boxes[0].outputs[0].carrier", hint: /Declare carrier 'lava'/ },
  { code: "unknown-box", tool: "triz_export", args: { format: "dot", model: edit("bearing-heat", (m) => { m.wires[0].to.box = "ghost"; }) }, path: "$.model.wires[0].to.box" },
  { code: "unknown-port", tool: "triz_trim", args: { trim: ["bearing"], model: edit("bearing-heat", (m) => { m.wires[0].to.port = "nope"; }) }, path: "$.model.wires[0].to.port", hint: /add \{ id: 'nope'/ },
  { code: "wrong-port-side", tool: "triz_function_model", args: { model: edit("bearing-heat", (m) => { m.wires[0].from = { box: "shaft", port: "drive" }; }) }, path: "$.model.wires[0].from.port", hint: /swap from and to/ },
  { code: "carrier-mismatch", tool: "triz_function_model", args: { compare_to: edit("bearing-heat", (m) => { m.wires[0].carrier = "heat"; }), model: bh() }, path: "$.compare_to.wires[0].carrier", hint: /set the wire's carrier to 'torque'/ },
  { code: "incomplete-state-machine", tool: "triz_dynamics", args: { model: edit("bearing-heat-dynamics", (m) => { delete box(m, "shaft").transition; }) }, path: "$.model.boxes[1].state" },
  { code: "behavior-and-transition", tool: "triz_dynamics", args: { model: edit("bearing-heat-dynamics", (m) => { box(m, "shaft").behavior = box(beh(), "shaft").behavior; }) }, path: "$.model.boxes[1].behavior" },
  { code: "undeclared-state", tool: "triz_dynamics", args: { model: edit("bearing-heat-dynamics", (m) => { box(m, "shaft").initial = ["frozen"]; }) }, path: "$.model.boxes[1].initial[0]" },
  { code: "no-declared-values", tool: "triz_behavior", args: { model: edit("bearing-heat-behavior", (m) => { delete m.carriers[0].values; }) }, path: "$.model.carriers[0]" },
  { code: "row-unknown-port", tool: "triz_behavior", args: { model: edit("bearing-heat-behavior", (m) => { box(m, "bearing").behavior![0].in.bogus = "x"; }) }, path: "$.model.boxes[2].behavior[0].in.bogus" },
  { code: "row-missing-value", tool: "triz_behavior", args: { model: edit("bearing-heat-behavior", (m) => { box(m, "bearing").behavior![0].in = {}; }) }, path: "$.model.boxes[2].behavior[0].in" },
  { code: "undeclared-value", tool: "triz_behavior", args: { model: edit("bearing-heat-behavior", (m) => { box(m, "bearing").behavior![0].out.race = "maybe"; }) }, path: "$.model.boxes[2].behavior[0].out.race", hint: /'supported', 'unsupported'/ },
  { code: "dominated-row", tool: "triz_feasibility", args: { model: edit("bearing-heat-feasibility", (m) => { box(m, "housing").feasibility!.push({ provides: { bore: 100 } }); }) }, path: "$.model.boxes[3].feasibility[2]" },
  { code: "duplicate-id", kernel: () => checkModel(edit("bearing-heat", (m) => { m.carriers.push({ ...m.carriers[0] }); })), input: edit("bearing-heat", (m) => { m.carriers.push({ ...m.carriers[0] }); }), path: "$.carriers[4]" },
  // trimCandidates and triz_trim
  { code: "listed-twice", tool: "triz_trim", args: { model: bh(), trim: ["bearing", "bearing"] }, path: "$.trim[1]" },
  { code: "unknown-box", tool: "triz_trim", args: { model: bh(), trim: ["ghost"] }, path: "$.trim[0]" },
  { code: "empty-set", kernel: () => trimCandidates(bh(), []), input: { model: bh(), trim: [] }, path: "$.trim" },
  // separationCheck and triz_separate
  { code: "undeclared-cell", tool: "triz_separate", args: { contradiction: edit("bearing-heat", (m) => { m.contradictions![0].demands[0].time = ["noon"]; }).contradictions![0] }, path: "$.contradiction.demands[0].time[0]", hint: /Add 'noon' to axes.time/ },
  { code: "undeclared-cell", tool: "triz_function_model", args: { model: edit("bearing-heat", (m) => { m.contradictions![0].demands[0].time = ["noon"]; }) }, path: "$.model.contradictions[0].demands[0].time[0]" },
  { code: "empty-axis", tool: "triz_separate", args: { contradiction: bh().contradictions![0], along: "space" }, pick: (r) => r.along, path: "$.contradiction.axes", hint: /'time'/ },
  { code: "cap-exceeded", tool: "triz_separate", args: { contradiction: { id: "big", parameter: "p", axes: { space: Array.from({ length: 200 }, (_, i) => `s${i}`), time: Array.from({ length: 200 }, (_, i) => `t${i}`) }, demands: [{ id: "a", values: ["x"] }, { id: "b", values: ["y"] }] } }, path: "$.contradiction.axes" },
  // triz_transform
  { code: "unknown-wire", ...T({ op: "rerate", wire: "ghost", polarity: "excessive" }), path: "$.transformation.wire" },
  { code: "unknown-box", ...T({ op: "segment", box: "ghost", parts: [{ id: "a", ports: ["x"] }, { id: "b", ports: ["y"] }] }), path: "$.transformation.box" },
  { code: "too-few-members", ...T({ op: "segment", box: "bearing", parts: [{ id: "a", ports: ["race", "friction", "preload-in"] }] }), path: "$.transformation.parts" },
  { code: "part-without-ports", ...T({ op: "segment", box: "bearing", parts: [{ id: "a", ports: [] }, { id: "b", ports: ["race", "friction", "preload-in"] }] }), path: "$.transformation.parts[0].ports" },
  { code: "port-assigned-twice", ...T({ op: "segment", box: "bearing", parts: [{ id: "a", ports: ["race"] }, { id: "b", ports: ["race", "friction", "preload-in"] }] }), path: "$.transformation.parts[1].ports[0]" },
  { code: "port-unassigned", ...T({ op: "segment", box: "bearing", parts: [{ id: "a", ports: ["race"] }, { id: "b", ports: ["friction"] }] }), path: "$.transformation.parts", hint: /'preload-in'/ },
  { code: "unknown-cost-dimension", ...T({ op: "segment", box: "bearing", parts: [{ id: "a", ports: ["race"] }, { id: "b", ports: ["friction", "preload-in"] }], cost_to: { gold: "a" } }), path: "$.transformation.cost_to.gold" },
  { code: "unknown-part", ...T({ op: "segment", box: "bearing", parts: [{ id: "a", ports: ["race"] }, { id: "b", ports: ["friction", "preload-in"] }], cost_to: { usd_unit: "zzz" } }), path: "$.transformation.cost_to.usd_unit" },
  { code: "take-out-reading", ...T({ op: "take_out", box: "bearing", ports: ["race"], part: { id: "race-part" } }), path: "$.transformation.ports", hint: /'friction', 'preload-in'/ },
  { code: "not-adjacent", ...T({ op: "merge", boxes: ["motor", "housing"], into: { id: "m", name: "M" } }), path: "$.transformation.boxes" },
  { code: "not-identical", ...T({ op: "merge", boxes: ["motor", "housing"], into: { id: "m", name: "M" }, reading: "identical" }), path: "$.transformation.boxes" },
  { code: "role-ambiguous", ...T({ op: "merge", boxes: ["motor", "shaft"], into: { id: "m", name: "M" } }), path: "$.transformation.into" },
  { code: "wrong-rating", ...T({ op: "rerate", wire: "w-heat", polarity: "excessive" }), path: "$.transformation.wire", hint: /retarget/ },
  { code: "already-rated", ...T({ op: "rerate", wire: "w-support", polarity: "useful", reading: "feedback" }), path: "$.transformation.polarity" },
  { code: "not-on-cycle", ...T({ op: "rerate", wire: "w-drive", polarity: "excessive", reading: "feedback" }), path: "$.transformation.wire" },
  { code: "not-on-cycle", ...T({ op: "feedback", wire: { id: "w-back", from: { box: "motor", port: "shaft-out" }, to: { box: "shaft", port: "drive" }, carrier: "torque", polarity: "useful" } }), path: "$.transformation.wire" },
  { code: "own-object-port", ...T({ op: "retarget", wire: "w-heat", to: { box: "shaft", port: "heat-in" } }), path: "$.transformation.to" },
  { code: "self-loop", ...T({ op: "reverse", wire: "w-self" }, edit("bearing-heat", (m) => {
    box(m, "bearing").inputs!.push({ id: "warm", carrier: "heat" });
    m.wires.push({ id: "w-self", from: { box: "bearing", port: "friction" }, to: { box: "bearing", port: "warm" }, carrier: "heat", polarity: "harmful" });
  })), path: "$.transformation.wire" },
  { code: "ambiguous-port", ...T({ op: "reverse", wire: "w-drive" }, edit("bearing-heat", (m) => { box(m, "shaft").outputs!.push({ id: "t1", carrier: "torque" }, { id: "t2", carrier: "torque" }); })), path: "$.transformation.ports.from", hint: /'t1', 't2'/ },
  { code: "missing-port", ...T({ op: "reverse", wire: "w-drive" }), path: "$.transformation.ports.from" },
  { code: "declared-rows-block-change", ...T({ op: "reverse", wire: "w-drive", ports: { from: "tq-out", to: "tq-in" } }, beh()), path: "$.transformation.ports.from" },
  { code: "nothing-to-back-up", ...T({ op: "standby", box: "air", standby: { id: "spare", name: "Spare" } }), path: "$.transformation.box" },
  { code: "not-cheaper", ...T({ op: "cheap_copy", box: "motor", copy: { cost: { usd_unit: 500 } } }), path: "$.transformation.copy.cost.usd_unit", hint: /at most 120/ },
  { code: "dangling-wire", ...T({ op: "rewrite", delete: { boxes: ["bearing"] } }), path: "$.transformation.delete.wires", hint: /Add 'w-support' to delete.wires/ },
  { code: "id-not-fresh", ...T({ op: "rewrite", add: { boxes: [{ id: "motor", name: "Motor 2", role: "tool" }] } }), path: "$.transformation.add.boxes[0].id", hint: /'motor-2'/ },
  { code: "id-not-fresh", ...T({ op: "interpose", wire: "w-drive", mediator: { id: "housing", name: "Coupling" } }), path: "$.transformation.mediator.id" },
  { code: "ill-typed-result", ...T({ op: "rewrite", add: { wires: [{ id: "w-x", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "drive" }, carrier: "radial-load", polarity: "useful" }] } }), path: "$.transformation.add.wires[0].carrier" },
  { code: "trim-blocked", ...T({ op: "trim", trim: ["bearing", "housing"] }), path: "$.transformation.trim", hint: /carrier 'radial-load'/ },
  { code: "not-an-absorbed-function", ...T({ op: "trim", trim: ["bearing"], absorb: { "w-heat": { box: "housing", port: "bore" } } }), path: "$.transformation.absorb['w-heat']", hint: /'w-support'/ },
  { code: "not-a-typed-absorber", ...T({ op: "trim", trim: ["bearing"], absorb: { "w-support": { box: "motor", port: "shaft-out" } } }), path: "$.transformation.absorb['w-support']", hint: /'housing.bore'/ },
  { code: "no-declared-values", ...T({ op: "interpose", wire: "w-drive", mediator: { id: "coupling", name: "Coupling", behavior: "identity" } }), path: "$.transformation.mediator.behavior" },
  // triz_rule_apply
  { code: "rule-or-rule-id", tool: "triz_rule_apply", args: { model: bh() }, path: "$" },
  { code: "unknown-rule-id", tool: "triz_rule_apply", args: { model: bh(), rule_id: "nope" }, path: "$.rule_id", hint: /'mono-bi'/ },
  { code: "at-and-match", tool: "triz_rule_apply", args: { model: bh(), rule_id: "mono-bi", at: {}, match: listed("mono-bi", bh()).match }, path: "$.at" },
  { code: "apply-args-without-match", tool: "triz_rule_apply", args: { model: bh(), rule_id: "feedback", carriers: { s: "heat" } }, path: "$.carriers", hint: /matches\[i\]\.match/ },
  { code: "apply-args-without-match", tool: "triz_rule_apply", args: { model: bh(), rule_id: "mono-bi", ids: { boxes: { "tool-2": "motor-b" } } }, path: "$.ids" },
  { code: "listing-entry-as-match", tool: "triz_rule_apply", args: { model: bh(), rule_id: "mono-bi", match: listed("mono-bi", bh()) }, path: "$.match", hint: /^pass matches\[i\]\.match/ },
  { code: "rule-ill-typed", tool: "triz_rule_apply", args: { model: bh(), rule: rule({ carriers: ["c", "c"] }) }, path: "$.rule.carriers[1]" },
  { code: "rule-ill-typed", tool: "triz_rule_apply", args: { model: bh(), rule: rule({ carriers: ["c", "unused"] }) }, path: "$.rule.carriers[1]" },
  { code: "rule-malformed", tool: "triz_rule_apply", args: { model: bh(), rule: rule({ right: { boxes: [] } }) }, path: "$.rule.interface.boxes[0]" },
  { code: "unknown-box", tool: "triz_rule_apply", args: { model: edit("bearing-heat", (m) => { m.wires[0].to.box = "ghost"; }), rule_id: "mono-bi" }, path: "$.model.wires[0].to.box" },
  { code: "not-a-rule-element", tool: "triz_rule_apply", args: { model: bh(), rule_id: "mono-bi", at: { boxes: { ghost: "motor" } } }, path: "$.at.boxes.ghost" },
  { code: "not-a-rule-element", tool: "triz_rule_apply", args: { model: bh(), rule_id: "mono-bi", match: { ...listed("mono-bi", bh()).match, boxes: { ...listed("mono-bi", bh()).match.boxes, ghost: "air" } } }, path: "$.match.boxes.ghost" },
  { code: "match-incomplete", tool: "triz_rule_apply", args: { model: bh(), rule_id: "mono-bi", match: { ...listed("mono-bi", bh()).match, wires: {} } }, path: "$.match.wires" },
  { code: "match-not-homomorphic", tool: "triz_rule_apply", args: { model: bh(), rule_id: "mono-bi", match: { ...listed("mono-bi", bh()).match, wires: { f: "w-heat" } } }, path: "$.match.wires.f" },
  { code: "match-identifies", tool: "triz_rule_apply", args: {
    model: bh(), rule: { id: "fold", carriers: [], left: { boxes: [{ id: "A" }, { id: "B" }] }, interface: { boxes: [{ id: "A" }] }, right: { boxes: [{ id: "A" }] } },
    match: { boxes: { A: "air", B: "air" }, ports: {}, wires: {}, carriers: {} },
  }, path: "$.match" },
  { code: "dangling-wire", tool: "triz_rule_apply", args: {
    model: bh(), rule: { id: "drop", carriers: [], left: { boxes: [{ id: "A" }] }, interface: { boxes: [] }, right: { boxes: [] } },
    match: { boxes: { A: "housing" }, ports: { A: {} }, wires: {}, carriers: {} },
  }, path: "$.match", hint: /port 'bore'/ },
  { code: "unbound-carrier-variable", tool: "triz_rule_apply", args: { model: bh(), rule_id: "feedback", match: listed("feedback", bh()).match }, path: "$.carriers", hint: /carriers: \{ 's'/ },
  { code: "not-right-only-variable", tool: "triz_rule_apply", args: { model: bh(), rule_id: "feedback", match: listed("feedback", bh()).match, carriers: { s: "heat", zzz: "heat" } }, path: "$.carriers.zzz" },
  { code: "unknown-carrier", tool: "triz_rule_apply", args: { model: bh(), rule_id: "feedback", match: listed("feedback", bh()).match, carriers: { s: "lava" } }, path: "$.carriers.s" },
  { code: "not-a-rule-element", tool: "triz_rule_apply", args: { model: bh(), rule_id: "mono-bi", match: listed("mono-bi", bh()).match, ids: { boxes: { tool: "x" } } }, path: "$.ids.boxes.tool" },
  { code: "id-not-fresh", tool: "triz_rule_apply", args: { model: bh(), rule_id: "mono-bi", match: listed("mono-bi", bh()).match, ids: { boxes: { "tool-2": "shaft" } } }, path: "$.ids.boxes['tool-2']" },
  // triz_behavior
  { code: "box-map-without-compare-to", tool: "triz_behavior", args: { model: beh(), box_map: { a: "b" } }, path: "$.box_map", hint: /compare_to/ },
  { code: "absorb-without-trim", tool: "triz_behavior", args: { model: beh(), absorb: { "w-support": { box: "housing", port: "bore" } } }, path: "$.absorb", hint: /Pass trim/ },
  { code: "trim-with-compare-to", tool: "triz_behavior", args: { model: beh(), compare_to: beh(), trim: ["bearing"] }, path: "$.trim" },
  { code: "weakest-spec-without-target", tool: "triz_behavior", args: { model: beh(), weakest_spec: true }, path: "$.weakest_spec" },
  { code: "no-deliverables", tool: "triz_behavior", args: { model: edit("bearing-heat-behavior", (m) => { box(m, "shaft").role = "mediator"; }) }, path: "$.model.boxes", hint: /role 'product'/ },
  { code: "no-deliverables", tool: "triz_behavior", args: { model: beh(), compare_to: edit("bearing-heat-behavior", (m) => { box(m, "shaft").role = "mediator"; }) }, path: "$.compare_to.boxes" },
  { code: "box-map-unknown-box", tool: "triz_behavior", args: { model: beh(), compare_to: beh(), box_map: { ghost: "shaft" } }, path: "$.box_map.ghost" },
  { code: "box-map-ambiguous", tool: "triz_behavior", args: {
    model: edit("bearing-heat-behavior", (m) => { m.boxes.push({ id: "shaft2", name: "Shaft 2", role: "mediator", inputs: [{ id: "drive", carrier: "torque" }] }); }),
    compare_to: beh(), box_map: { shaft2: "shaft" },
  }, path: "$.box_map.shaft2" },
  { code: "box-map-port-mismatch", tool: "triz_behavior", args: { model: beh(), compare_to: beh(), box_map: { air: "shaft" } }, path: "$.box_map.air" },
  { code: "input-domain-mismatch", tool: "triz_behavior", args: { model: thermo(["lo", "mid", "hi"]), compare_to: thermo() }, path: "$.model.carriers[0]" },
  { code: "nothing-to-specify", tool: "triz_behavior", args: { model: beh(), compare_to: beh(), weakest_spec: true }, path: "$.model" },
  { code: "cap-exceeded", tool: "triz_behavior", args: { model: thermo(), max_states: 1 }, path: "$.model" },
  { code: "trim-blocked", tool: "triz_behavior", args: { model: beh(), trim: ["bearing", "housing"] }, path: "$.trim" },
  // triz_weakness
  { code: "duplicate-id", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "a", model: thermo() }], acceptable: [{ box: "plant", port: "sig", values: ["on"] }] }, path: "$.concepts[1].id" },
  { code: "carrier-mismatch", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: edit("bearing-heat", (m) => { m.wires[0].carrier = "heat"; }) }], acceptable: [{ box: "plant", port: "sig", values: ["on"] }] }, path: "$.concepts[1].model.wires[0].carrier" },
  { code: "deliverables-differ", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo(["lo", "hi"], "sig2") }], acceptable: [{ box: "plant", port: "sig", values: ["on"] }] }, path: "$.concepts[1].model" },
  { code: "acceptable-not-deliverable", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo() }], acceptable: [{ box: "plant", port: "sig", values: ["on"] }, { box: "plant", port: "nope", values: ["on"] }] }, path: "$.acceptable[1]" },
  { code: "listed-twice", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo() }], acceptable: [{ box: "plant", port: "sig", values: ["on"] }, { box: "plant", port: "sig", values: ["off"] }] }, path: "$.acceptable[1]" },
  { code: "undeclared-value", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo() }], acceptable: [{ box: "plant", port: "sig", values: ["maybe"] }] }, path: "$.acceptable[0].values[0]" },
  { code: "acceptable-missing", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo() }], acceptable: [] }, path: "$.acceptable", hint: /port: 'sig'/ },
  { code: "input-domain-mismatch", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo(["lo", "mid", "hi"]) }], acceptable: [{ box: "plant", port: "sig", values: ["on"] }] }, path: "$.concepts[1].model.carriers[0]" },
  // triz_dynamics
  { code: "no-state", tool: "triz_dynamics", args: { model: dyn(), unsafe: [{ box: "motor", state: ["x"] }] }, path: "$.unsafe[0].box", hint: /'shaft'/ },
  { code: "unknown-box", tool: "triz_dynamics", args: { model: dyn(), safe: [{ box: "ghost", state: ["x"] }] }, path: "$.safe[0].box" },
  { code: "undeclared-state", tool: "triz_dynamics", args: { model: dyn(), initial: { shaft: ["frozen"] } }, path: "$.initial.shaft[0]" },
  { code: "unknown-port", tool: "triz_dynamics", args: { model: dyn(), unsafe: [{ box: "shaft", port: "nope", values: ["x"] }] }, path: "$.unsafe[0].port" },
  { code: "uninitialised-state", tool: "triz_dynamics", args: { model: edit("bearing-heat-dynamics", (m) => { delete box(m, "shaft").initial; }) }, path: "$.model.boxes[1]" },
  { code: "not-boundary-input", tool: "triz_dynamics", args: { model: dyn(), inputs: [[{ box: "shaft", port: "drive", values: ["rated"] }]] }, path: "$.inputs[0][0]" },
  { code: "window-invalid", tool: "triz_dynamics", args: { model: dyn(), horizon: 4, separation: [{ id: "a", where: [{ box: "shaft", state: ["hot"] }], window: { from: 3, to: 1 } }, { id: "b", where: [{ box: "shaft", state: ["cold"] }], window: { from: 4, to: 4 } }] }, path: "$.separation[0].window" },
  { code: "windows-overlap", tool: "triz_dynamics", args: { model: dyn(), horizon: 4, separation: [{ id: "a", where: [{ box: "shaft", state: ["hot"] }], window: { from: 0, to: 2 } }, { id: "b", where: [{ box: "shaft", state: ["cold"] }], window: { from: 2, to: 4 } }] }, path: "$.separation[1].window" },
  { code: "too-few-members", tool: "triz_dynamics", args: { model: dyn(), separation: [{ id: "a", where: [{ box: "shaft", state: ["hot"] }], window: { from: 0, to: 2 } }] }, path: "$.separation" },
  { code: "horizon-inputs-mismatch", tool: "triz_dynamics", args: { model: dyn(), horizon: 5, inputs: [[]] }, path: "$.horizon" },
  { code: "horizon-out-of-range", tool: "triz_dynamics", args: { model: dyn(), horizon: 5000 }, path: "$.horizon" },
  { code: "nothing-to-explore", tool: "triz_dynamics", args: { model: bh() }, path: "$.model" },
  { code: "cap-exceeded", tool: "triz_dynamics", args: { model: dyn(), max_states: 1 }, path: "$.model" },
  // triz_feasibility
  { code: "absorb-without-trim", tool: "triz_feasibility", args: { model: fea(), absorb: { "w-support": { box: "housing", port: "bore" } } }, path: "$.absorb" },
  { code: "no-product", tool: "triz_feasibility", args: { model: edit("bearing-heat-feasibility", (m) => { box(m, "shaft").role = "mediator"; }) }, path: "$.model.boxes" },
  { code: "unsupplied-requirement", tool: "triz_feasibility", args: { model: edit("bearing-heat-feasibility", (m) => { m.wires = m.wires.filter((w) => w.id !== "w-support"); }) }, path: "$.model.boxes[1].feasibility[0].requires.support" },
  // The radial load declared extensive, and the housing also feeding the shaft's support: the split is undeclared.
  { code: "extensive-fan-in", tool: "triz_feasibility", args: { model: edit("bearing-heat-feasibility", (m) => {
    m.carriers.find((c) => c.id === "radial-load")!.quantity = "extensive";
    m.wires.push({ id: "w-hold", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful" });
  }) }, path: "$.model.boxes[1].inputs[1]", hint: /merge box/ },
  { code: "cap-exceeded", tool: "triz_feasibility", args: { model: fea(), max_iterations: 1 }, path: "$.max_iterations" },
  { code: "unknown-box", tool: "triz_feasibility", args: { model: fea(), trim: ["ghost"] }, path: "$.trim[0]" },
  // triz_function_model guards
  { code: "box-map-without-compare-to", tool: "triz_function_model", args: { model: bh(), box_map: { a: "b" } }, path: "$.box_map" },
  { code: "box-map-unknown-box", tool: "triz_function_model", args: { model: bh(), compare_to: bh(), box_map: { ghost: "motor" } }, path: "$.box_map.ghost" },
  // triz_nine_windows
  { code: "no-earlier-snapshot", tool: "triz_nine_windows", args: { present: bh(), subsystem: ["bearing"], transitions: { past_to_present: [{ op: "trim", trim: ["housing"] }] } }, path: "$.transitions.past_to_present", hint: /Pass past/ },
  { code: "snapshot-not-reached", tool: "triz_nine_windows", args: { present: bh(), future: bh(), subsystem: ["bearing"], transitions: { present_to_future: [{ op: "rerate", wire: "w-drive", polarity: "excessive" }] } }, path: "$.future" },
  { code: "unknown-wire", tool: "triz_nine_windows", args: { present: bh(), subsystem: ["bearing"], transitions: { present_to_future: [{ op: "rerate", wire: "w-drive", polarity: "excessive" }, { op: "rerate", wire: "ghost", polarity: "excessive" }] } }, path: "$.transitions.present_to_future[1].wire" },
  { code: "unknown-box", tool: "triz_nine_windows", args: { present: edit("bearing-heat", (m) => { m.wires[0].to.box = "ghost"; }), subsystem: ["bearing"] }, path: "$.present.wires[0].to.box" },
  { code: "ambiguous-port-name", tool: "triz_nine_windows", args: {
    present: { domain: "physical", carriers: [{ id: "c", layer: "energy", dimension: "W" }], boxes: [
      { id: "a", name: "A", role: "tool", outputs: [{ id: "b.c", carrier: "c" }] },
      { id: "a.b", name: "AB", role: "tool", outputs: [{ id: "c", carrier: "c" }] },
      { id: "p", name: "P", role: "product", inputs: [{ id: "in", carrier: "c" }] },
    ], wires: [] },
    subsystem: ["p"],
  }, path: "$.system.boxes" },
  { code: "internal-error", kernel: () => nineWindows({ present: bh(), subsystem: ["bearing"], transitions: { present_to_future: [{ op: "trim" }] } }), input: { present: bh(), subsystem: ["bearing"], transitions: { present_to_future: [{ op: "trim" }] } }, path: "$.transitions.present_to_future" },
  // carrier levels, MPV weights, thresholds, abstraction
  { code: "invalid-levels", tool: "triz_function_model", args: { model: edit("bearing-heat-behavior", (m) => { m.carriers[1].levels = [{ value: "unsupported", from: 5 }, { value: "supported", from: 10 }]; }) }, path: "$.model.carriers[1].levels[0].from" },
  { code: "invalid-levels", tool: "triz_function_model", args: { model: edit("bearing-heat-behavior", (m) => { m.carriers[1].levels = [{ value: "unsupported", from: 0 }, { value: "supported", from: 0 }]; }) }, path: "$.model.carriers[1].levels[1].from" },
  { code: "no-declared-values", tool: "triz_function_model", args: { model: edit("bearing-heat", (m) => { m.carriers[1].levels = [{ value: "low", from: 0 }]; }) }, path: "$.model.carriers[1].levels" },
  { code: "mpv-weights-without-compare-to", tool: "triz_function_model", args: { model: bh(), mpv_weights: { usd_unit: 1 } }, path: "$.mpv_weights" },
  { code: "invalid-weight", tool: "triz_function_model", args: { model: bh(), compare_to: bh(), mpv_weights: { usd_unit: -1 } }, path: "$.mpv_weights.usd_unit" },
  { code: "unknown-cost-dimension", tool: "triz_function_model", args: { model: bh(), compare_to: bh(), mpv_weights: { gold: 1 } }, path: "$.mpv_weights.gold", hint: /'usd_unit'/ },
  { code: "empty-set", tool: "triz_function_model", args: { model: bh(), compare_to: bh(), mpv_weights: {} }, path: "$.mpv_weights" },
  { code: "acceptable-entry-malformed", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo() }], acceptable: [{ box: "plant", port: "sig", carrier: "s", values: ["on"] }] }, path: "$.acceptable[0]" },
  { code: "acceptable-entry-malformed", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo() }], acceptable: [{ box: "plant", port: "sig", values: ["on"], at_least: 1 }] }, path: "$.acceptable[0]" },
  { code: "invalid-threshold", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo() }], acceptable: [{ carrier: "s", at_least: 5 }] }, path: "$.acceptable[0].at_least", hint: /Declare levels on carrier 's'/ },
  { code: "levels-differ", tool: "triz_weakness", args: {
    concepts: [
      { id: "a", model: signalLevels([{ value: "off", from: 0 }, { value: "on", from: 10 }]) },
      { id: "b", model: signalLevels([{ value: "on", from: 0 }, { value: "off", from: 10 }]) },
    ],
    acceptable: [{ carrier: "s", at_least: 10 }],
  }, path: "$.acceptable[0]" },
  { code: "acceptable-not-deliverable", tool: "triz_nine_windows", args: { present: beh(), future: beh(), subsystem: ["bearing"], acceptable: [{ box: "shaft", port: "nope", values: ["x"] }] }, pick: (r) => r.changes[0].verdicts.weakness, path: "$.acceptable[0]" },
  { code: "unmapped-box", tool: "triz_abstraction", args: { detailed: bh(), coarse: bh(), map: { boxes: { motor: "motor" }, ports: { shaft: { drive: "drive" } } } }, path: "$.map.ports.shaft" },
  { code: "unknown-box", tool: "triz_abstraction", args: { detailed: bh(), coarse: bh(), map: { boxes: { ghost: "motor" } } }, path: "$.map.boxes.ghost" },
  { code: "unknown-port", tool: "triz_abstraction", args: { detailed: bh(), coarse: bh(), map: { boxes: { shaft: "shaft" }, ports: { shaft: { nope: "drive" } } } }, path: "$.map.ports.shaft.nope" },
  { code: "unknown-carrier", tool: "triz_abstraction", args: { detailed: bh(), coarse: bh(), map: { boxes: { shaft: "shaft" }, carriers: { lava: "heat" } } }, path: "$.map.carriers.lava" },
  { code: "empty-set", tool: "triz_abstraction", args: { detailed: bh(), coarse: bh(), map: { boxes: {} } }, path: "$.map.boxes" },
  { code: "carrier-mismatch", tool: "triz_abstraction", args: { detailed: edit("bearing-heat", (m) => { m.wires[0].carrier = "heat"; }), coarse: bh(), map: { boxes: { motor: "motor" } } }, path: "$.detailed.wires[0].carrier" },
  // triz_export and certificates
  { code: "carrier-mismatch", tool: "triz_export", args: { format: "lean", model: edit("bearing-heat", (m) => { m.wires[0].carrier = "heat"; }) }, path: "$.model.wires[0].carrier" },
  // The shared specs carry no layout engine, as on the hosted server.
  { code: "format-unavailable", tool: "triz_export", args: { format: "svg", model: bh() }, path: "$.format", hint: /format 'dot' .*'mermaid'/ },
  { code: "invalid-namespace", kernel: () => modelCertificate(bh(), { namespace: "end x" }), input: { model: bh(), namespace: "end x" }, path: "$.namespace" },
  // producible rows and dynamics and weakness certificates
  { code: "producible-with-rows", tool: "triz_function_model", args: { model: edit("bearing-heat-behavior", (m) => { box(m, "housing").producible = box(m, "housing").behavior; }) },
    path: `$.model.boxes[${example("bearing-heat-behavior").boxes.findIndex((b) => b.id === "housing")}].producible` },
  { code: "certificate-needs-unsafe", tool: "triz_dynamics", args: { model: example("bearing-heat-dynamics"), certificate: true }, pick: (r) => r.certificate, path: "$.unsafe" },
  { code: "certificate-input-sequence", tool: "triz_dynamics", args: { model: example("bearing-heat-dynamics"), unsafe: [{ box: "shaft", state: ["hot"] }], inputs: [[], [], []], certificate: true },
    pick: (r) => r.certificate, path: "$.inputs" },
  // Past the cap beyond the horizon, only the bounded verdict holds.
  { code: "not-certifiable", tool: "triz_dynamics", args: { model: example("bearing-heat-dynamics"), unsafe: [{ box: "shaft", state: ["hot"] }], horizon: 1, max_states: 12, certificate: true },
    pick: (r) => r.certificate, path: "$.horizon", hint: /Raise max_states so the search past the horizon decides/ },
  { code: "not-certifiable", tool: "triz_behavior", args: { model: example("bearing-heat-behavior"), certificate: true }, pick: (r) => r.certificate, path: "$.certificate", hint: /compare_to/ },
  // rule negative application conditions and weakness priors
  { code: "forbid-violated", tool: "triz_rule_apply", args: {
    model: {
      domain: "physical",
      carriers: [{ id: "c", layer: "energy", dimension: "W" }],
      boxes: [
        { id: "A", name: "A", role: "tool", outputs: [{ id: "p", carrier: "c" }] },
        { id: "P", name: "P", role: "product", inputs: [{ id: "q", carrier: "c" }] },
        { id: "X", name: "X", role: "tool", outputs: [{ id: "r", carrier: "c" }] },
      ],
      wires: [
        { id: "w", from: { box: "A", port: "p" }, to: { box: "P", port: "q" }, carrier: "c", polarity: "useful" },
        { id: "w2", from: { box: "X", port: "r" }, to: { box: "P", port: "q" }, carrier: "c", polarity: "useful" },
      ],
    },
    rule: {
      id: "replace-once",
      carriers: ["c"],
      left: { boxes: [{ id: "old", outputs: [{ id: "out", carrier: "c" }] }, { id: "object", inputs: [{ id: "in", carrier: "c" }] }], wires: [{ id: "f", from: { box: "old", port: "out" }, to: { box: "object", port: "in" }, carrier: "c" }] },
      interface: { boxes: [{ id: "object", inputs: [{ id: "in", carrier: "c" }] }] },
      right: {
        boxes: [{ id: "object", inputs: [{ id: "in", carrier: "c" }] }, { id: "new", role: "tool", name: "New", outputs: [{ id: "out", carrier: "c" }] }],
        wires: [{ id: "g", from: { box: "new", port: "out" }, to: { box: "object", port: "in" }, carrier: "c", polarity: "useful" }],
      },
      forbid: [{
        boxes: [{ id: "old", outputs: [{ id: "out", carrier: "c" }] }, { id: "object", inputs: [{ id: "in", carrier: "c" }] }, { id: "other", outputs: [{ id: "o", carrier: "c" }] }],
        wires: [{ id: "f", from: { box: "old", port: "out" }, to: { box: "object", port: "in" }, carrier: "c" }, { id: "h", from: { box: "other", port: "o" }, to: { box: "object", port: "in" }, carrier: "c" }],
      }],
    },
    match: { boxes: { old: "A", object: "P" }, ports: { old: { out: "p" }, object: { in: "q" } }, wires: { f: "w" }, carriers: { c: "c" } },
  }, path: "$.rule.forbid[0]" },
  { code: "invalid-prior", tool: "triz_weakness", args: { concepts: supportConcepts(), acceptable: SUPPORT_ACCEPTABLE, priors: [{ box: "support", port: "nope", weights: { oiled: 1 } }] }, path: "$.priors[0]" },
  { code: "prior-malformed", tool: "triz_weakness", args: { concepts: [{ id: "a", model: thermo() }, { id: "b", model: thermo() }], acceptable: [{ box: "plant", port: "sig", values: ["on"] }], joint_prior: [{ input: [], weight: 1 }] }, path: "$.joint_prior[0].input" },
  { code: "required-input-malformed", tool: "triz_adequacy", args: { model: thermo(), scope: "upstream", acceptable: [{ box: "plant", port: "sig", values: ["on"] }], required_inputs: [[]] }, path: "$.required_inputs[0]" },
  { code: "invalid-argument", kernel: () => globalSeparation({ variables: [{ id: "x", values: ["0"] }], regions: [{ id: "r", variables: ["missing"], allowed: [["0"]] }] }), input: { variables: [{ id: "x", values: ["0"] }], regions: [{ id: "r", variables: ["missing"], allowed: [["0"]] }] }, path: "$.regions['0'].variables['0']" },
];

const KEBAB = /^[a-z]+(-[a-z]+)*$/;
const LINTS: IssueCode[] = ["defect-on-loss-carrier", "trim-level-functions", "product-without-deliverable", "unused-carrier", "unwired-port", "unbacked-producible-row", "extensive-fan-out"];

test("every failure carries issues: one per error, a registered code, a path into the input, and a hint", async () => {
  const covered = new Set<IssueCode>();
  for (const c of cases) {
    const label = `${c.code} via ${c.tool ?? "kernel"}`;
    const whole = c.tool ? await call(c.tool, c.args) : JSON.parse(JSON.stringify(c.kernel!()));
    const r = c.pick ? c.pick(whole) : whole;
    const input = c.tool ? c.args : c.input;
    assert.equal(r.ok, false, `${label}: ${JSON.stringify(r).slice(0, 300)}`);
    assert.ok(Array.isArray(r.issues) && r.issues.length, `${label}: no issues`);
    assert.deepEqual(r.issues.map((i: Issue) => i.message), r.errors, `${label}: errors and issues differ`);
    for (const i of r.issues as Issue[]) {
      assert.match(i.code, KEBAB, label);
      assert.ok(Object.hasOwn(ISSUE_CODES, i.code), `${label}: unregistered code '${i.code}'`);
      assert.ok(resolves(input, i.path), `${label}: path '${i.path}' does not resolve into the input`);
      assert.ok(i.hint.length > 10, `${label}: hint '${i.hint}'`);
    }
    const hit = (r.issues as Issue[]).filter((i) => i.code === c.code);
    assert.ok(hit.length, `${label}: codes [${r.issues.map((i: Issue) => i.code).join(", ")}]`);
    if (c.path) assert.ok(hit.some((i) => i.path === c.path), `${label}: paths [${hit.map((i) => i.path).join(", ")}], expected ${c.path}`);
    if (c.hint) assert.ok(hit.some((i) => c.hint!.test(i.hint)), `${label}: hints ${JSON.stringify(hit.map((i) => i.hint))}`);
    for (const i of r.issues as Issue[]) covered.add(i.code);
  }
  const missing = Object.keys(ISSUE_CODES).filter((k) => !covered.has(k as IssueCode) && !LINTS.includes(k as IssueCode));
  assert.deepEqual(missing, [], "every issue code has a failing input here");
});

test("only the kernel's own invariant failures read internal-error", async () => {
  for (const c of cases.filter((x) => x.code !== "internal-error" && x.tool)) {
    const r = await call(c.tool!, c.args);
    const failure = c.pick ? c.pick(r) : r;
    assert.ok(!failure.issues.some((i: Issue) => i.code === "internal-error"), `${c.code} via ${c.tool}`);
  }
});

test("common agent mistakes get pointed hints", async () => {
  const model = bh();
  const entry = listed("mono-bi", model);
  const asEntry = await call("triz_rule_apply", { model, rule_id: "mono-bi", match: entry });
  assert.deepEqual(asEntry.issues.map((i: Issue) => [i.code, i.path]), [["listing-entry-as-match", "$.match"]]);
  assert.match(asEntry.issues[0].hint, /pass matches\[i\]\.match/);
  // The same call with the inner match applies.
  assert.equal((await call("triz_rule_apply", { model, rule_id: "mono-bi", match: entry.match })).ok, true);

  for (const extra of [{ carriers: { s: "heat" } }, { ids: { boxes: {} } }]) {
    const r = await call("triz_rule_apply", { model, rule_id: "feedback", ...extra });
    assert.equal(r.issues[0].code, "apply-args-without-match");
    assert.match(r.issues[0].hint, /list first without them, then call again with match: matches\[i\]\.match/);
  }

  for (const tool of ["triz_function_model", "triz_behavior"]) {
    const r = await call(tool, { model: beh(), box_map: { shaft: "shaft" } });
    assert.deepEqual(r.issues.map((i: Issue) => i.code), ["box-map-without-compare-to"], tool);
    assert.match(r.issues[0].hint, /Pass the baseline as compare_to/);
  }
  for (const [tool, model] of [["triz_behavior", beh()], ["triz_feasibility", fea()]] as const) {
    const r = await call(tool, { model, absorb: { "w-support": { box: "housing", port: "bore" } } });
    assert.deepEqual(r.issues.map((i: Issue) => i.code), ["absorb-without-trim"], tool);
    assert.match(r.issues[0].hint, /Pass trim/);
  }
});

test("zod errors at the tool boundary carry hints at their paths", () => {
  const parse = (tool: string, args: unknown) => {
    const r = z.object(specs[tool].shape).safeParse(args);
    assert.equal(r.success, false, tool);
    return r.error!.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  };
  const hinted = (issues: Array<{ path: string; message: string }>, at: string, hint: RegExp) =>
    assert.ok(issues.some((i) => i.path === at && hint.test(i.message)), JSON.stringify(issues));
  const model = bh();

  hinted(parse("triz_rule_apply", { model, rule_id: "mono-bi", match: listed("mono-bi", model) }), "match", /pass matches\[i\]\.match/);
  hinted(parse("triz_transform", { model, transformation: { op: "split", box: "bearing" } }), "transformation.op", /'segment' \| 'take_out'.*call triz_trim/);
  hinted(parse("triz_function_model", { model: edit("bearing-heat", (m) => { (m.wires[0] as { polarity: string }).polarity = "bad"; }) }), "model.wires.0.polarity", /rate it harmful if no level of it is useful/);
  hinted(parse("triz_function_model", { model: edit("bearing-heat", (m) => { (m.boxes[0] as { role: string }).role = "driver"; }) }), "model.boxes.0.role", /the box the main function acts on is the product/);
  hinted(parse("triz_function_model", { model: edit("bearing-heat", (m) => { (m.wires[0] as { from: unknown }).from = "motor.shaft-out"; }) }), "model.wires.0.from", /\{ box: '<box id>', port: '<port id>' \}/);
  hinted(parse("triz_function_model", { model: edit("bearing-heat", (m) => { (m.boxes[0] as Record<string, unknown>).ports = []; }) }), "model.boxes.0", /inputs and output ports under outputs/);
  hinted(parse("triz_function_model", { model: edit("bearing-heat", (m) => { (m.wires[0] as Record<string, unknown>).source = "motor"; }) }), "model.wires.0", /use from and to/);
  hinted(parse("triz_function_model", { model: { ...model, functions: [] } }), "model", /functions are wires/);
  hinted(parse("triz_function_model", { model: edit("bearing-heat", (m) => { (m.carriers[0] as Record<string, unknown>).unit = "Nm"; }) }), "model.carriers.0", /dimension/);
  hinted(parse("triz_trim", { model, trim: "bearing" }), "trim", /\["bearing"\]/);
  hinted(parse("triz_behavior", { model, trim: "bearing" }), "trim", /\["bearing"\]/);
  hinted(parse("triz_transform", { model, transformation: { op: "trim", trim: "bearing" } }), "transformation.trim", /\["bearing"\]/);
  hinted(parse("triz_transform", { model, transformation: { op: "trim", trim: ["bearing"], absorb: { "w-support": "housing.bore" } } }), "transformation.absorb.w-support", /not a 'box.port' string/);
  // A valid argument raises nothing, so the hints never fire on a good call.
  assert.equal(z.object(specs.triz_function_model.shape).safeParse({ model }).success, true);
});

test("lints: each warning or info, never changing the verdict", async () => {
  const lossy = await call("triz_function_model", { model: pipe("excessive") });
  const loss = lossy.warnings.filter((w: Issue) => w.code === "defect-on-loss-carrier");
  assert.deepEqual(loss.map((w: Issue & { severity: string }) => [w.path, w.severity]), [["$.model.wires[2].polarity", "warning"]]);
  assert.match(loss[0].hint, /^Rate it harmful if no level of it is useful/);
  const rated = await call("triz_function_model", { model: pipe("harmful") });
  assert.equal(rated.warnings.filter((w: Issue) => w.code === "defect-on-loss-carrier").length, 0, "a harmful loss is the right rating");

  const unfed = await call("triz_behavior", { model: edit("bearing-heat-behavior", (m) => { box(m, "housing").role = "product"; }) });
  assert.ok(unfed.warnings.some((w: Issue) => w.code === "product-without-deliverable" && w.path === "$.model.boxes[3]"), JSON.stringify(unfed.warnings));

  const spare = edit("bearing-heat", (m) => { m.carriers.push({ id: "spare", layer: "energy", dimension: "W" }); });
  const info = (await call("triz_function_model", { model: spare })).warnings.filter((w: { severity: string }) => w.severity === "info");
  assert.ok(info.some((w: Issue) => w.code === "unused-carrier" && w.path === "$.model.carriers[4]"));
  assert.ok(info.some((w: Issue) => w.code === "unwired-port" && w.path === "$.model.boxes[4].inputs[0]" && /boundary input/.test(w.hint)), "air's sink");
  assert.ok(info.some((w: Issue) => w.code === "unwired-port" && w.path === "$.model.boxes[3].outputs[0]" && /absorber/.test(w.hint)), "housing's bore");

  // An extensive carrier fanned out from one output: behaviour still reads one shared value there.
  const fanned = edit("bearing-heat", (m) => {
    m.carriers.find((c) => c.id === "radial-load")!.quantity = "extensive";
    m.wires.push({ id: "w-hold", from: { box: "bearing", port: "race" }, to: { box: "housing", port: "bore-in" }, carrier: "radial-load", polarity: "useful" });
    box(m, "housing").inputs = [...(box(m, "housing").inputs ?? []), { id: "bore-in", carrier: "radial-load" }];
  });
  const fan = (await call("triz_function_model", { model: fanned })).warnings.filter((w: Issue) => w.code === "extensive-fan-out");
  assert.deepEqual(fan.map((w: Issue & { severity: string }) => w.severity), ["warning"]);
  assert.match(fan[0].message, /output port 'bearing\.race' of extensive carrier 'radial-load' feeds 2 functions/);
  assert.equal((await call("triz_function_model", { model: edit("bearing-heat", () => {}) })).warnings.filter((w: Issue) => w.code === "extensive-fan-out").length, 0);

  // Verdicts are the kernel's, lints or not.
  const { warnings, ...analysed } = lossy;
  assert.ok(Array.isArray(warnings));
  assert.deepEqual(analysed, JSON.parse(JSON.stringify(analysisBasis(analyseModel(pipe("excessive"))))));
  const trimmed = await call("triz_trim", { model: pipe("excessive"), trim: ["valve"] });
  const { warnings: _w, ...screen } = trimmed;
  assert.deepEqual(screen, JSON.parse(JSON.stringify(trimBasis(trimCandidates(pipe("excessive"), ["valve"])))));
  // An ill-typed model is not linted.
  assert.deepEqual((await call("triz_function_model", { model: edit("bearing-heat", (m) => { m.wires[0].carrier = "heat"; }) })).warnings, []);
});

/**
 * A result without its prose (any string with a space: notes, hints, problems, and the labels the
 * twin replaces) and in canonical order. Renaming touches the names that only prose reads.
 */
function verdictsOf(x: unknown): unknown {
  if (typeof x === "string") return x.includes(" ") ? "<prose>" : x;
  if (Array.isArray(x)) return x.map(verdictsOf).map((v) => JSON.stringify(v)).sort();
  if (x && typeof x === "object") {
    return Object.fromEntries(Object.entries(x).filter(([k]) => k !== "warnings")
      .map(([k, v]): [string, unknown] => [k, verdictsOf(v)]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return x;
}
const lintsOf = (ws: Array<Issue & { severity: string }>) => ws.map((w) => [w.code, w.path, w.severity]);

test("defect-on-loss-carrier: a declared loss decides; without one, renaming moves only this lint and never a verdict", async () => {
  const calls: Array<[string, FunctionModel, (m: FunctionModel, t: ReturnType<typeof renamedTwin> | null) => Record<string, unknown>]> = [
    ...["bearing-heat", "bearing-heat-behavior", "bearing-heat-dynamics", "bearing-heat-feasibility", "connection-pool", "marketplace-take-rate", "software-cache"]
      .map((n): [string, FunctionModel, () => Record<string, unknown>] => ["triz_function_model", example(n), () => ({})]),
    ["triz_function_model", pipe("excessive"), () => ({})],
    ["triz_trim", pipe("excessive"), (_, t) => ({ trim: [t ? t.box("valve") : "valve"] })],
    ["triz_trim", pipe("insufficient"), (_, t) => ({ trim: [t ? t.box("valve") : "valve"] })],
    ["triz_trim", example("bearing-heat"), (_, t) => ({ trim: [t ? t.box("bearing") : "bearing"] })],
    ["triz_behavior", example("bearing-heat-behavior"), () => ({})],
  ];
  let silenced = 0;
  for (const [tool, m, args] of calls) {
    const t = renamedTwin(m);
    const original = await call(tool, { model: m, ...args(m, null) });
    const renamed = t.back(await call(tool, { model: t.model, ...args(t.model, t) }));
    assert.ok(original.ok, `${tool}: ${JSON.stringify(original.errors)}`);
    assert.deepEqual(verdictsOf(renamed), verdictsOf(original), `${tool}: renaming moved a verdict`);
    // The twin renames carrier ids, dimensions, and verbs: the word list loses its words, and no other lint moves.
    const kept = original.warnings.filter((w: Issue) => w.code !== "defect-on-loss-carrier");
    silenced += original.warnings.length - kept.length;
    assert.deepEqual(lintsOf(renamed.warnings), lintsOf(kept), `${tool}: renaming moved a lint other than defect-on-loss-carrier`);
  }
  assert.equal(silenced, 3, "the pipe's pressure drop is linted by its words in each excessive or insufficient call");

  // Declared, the lint reads no words: it fires on the twin as on the original, and loss: false silences both.
  for (const loss of [true, false]) {
    const m = pipe("excessive");
    m.carriers[1].loss = loss;
    const t = renamedTwin(m);
    const [a, b] = [await call("triz_function_model", { model: m }), t.back(await call("triz_function_model", { model: t.model }))];
    assert.deepEqual(lintsOf(b.warnings), lintsOf(a.warnings));
    assert.deepEqual(a.warnings.filter((w: Issue) => w.code === "defect-on-loss-carrier").map((w: Issue) => w.path), loss ? ["$.model.wires[2].polarity"] : []);
    if (loss) assert.match(b.warnings.find((w: Issue) => w.code === "defect-on-loss-carrier").message, /declared a loss \(loss: true\)/);
    // The declaration moves no verdict either.
    assert.deepEqual(verdictsOf(a), verdictsOf(await call("triz_function_model", { model: pipe("excessive") })));
  }
  const guessed = (await call("triz_function_model", { model: pipe("excessive") })).warnings.find((w: Issue) => w.code === "defect-on-loss-carrier");
  assert.match(guessed.hint, /The word 'drop' is a guess: declare loss: false on carrier 'pressure-drop'/);
});

test("triz_trim poses excessive and insufficient functions as level problems, not absorber hand-overs", async () => {
  const market = example("marketplace-take-rate");
  const r = await call("triz_trim", { model: market, trim: ["platform"] });
  assert.equal(r.ok, true);
  const level = r.levelProblems.map((p: { wire: string; polarity: string }) => [p.wire, p.polarity]);
  assert.deepEqual(level, [["w-fee", "excessive"]]);
  assert.match(r.levelProblems[0].problem, /^\[level\] .* gets too much 'fee'.*rate 'w-fee' harmful/);
  assert.ok(!r.trimmingProblems.some((p: string) => p.includes("'fee'")), "no absorber is asked to take over the excess");
  assert.ok(r.functions.some((f: { wire: string }) => f.wire === "w-fee"), "the screen and its verdict are unchanged");
  const lint = r.warnings.filter((w: Issue) => w.code === "trim-level-functions");
  assert.deepEqual(lint.map((w: Issue) => w.path), ["$.trim"]);

  const pump = await call("triz_trim", { model: pipe("insufficient"), trim: ["valve"] });
  assert.match(pump.levelProblems.find((p: { wire: string }) => p.wire === "w-dp").problem, /gets too little 'pressure-drop'/);
  assert.ok(pump.warnings.some((w: Issue) => w.code === "defect-on-loss-carrier"), "and the rating itself is suspect");
});

test("triz_nine_windows returns the models its transitions produce, and aggregates failures", async () => {
  const present = example("software-cache");
  const grid = await call("triz_nine_windows", { present, subsystem: ["app", "redis"], transitions: { present_to_future: [{ op: "trim", trim: ["redis"] }] } });
  assert.equal(grid.ok, true);
  assert.equal(grid.errors, undefined);
  assert.deepEqual(grid.derived.future, grid.transitions[0].model);
  assert.equal(checkModel(grid.derived.future).ok, true);
  assert.ok(!grid.derived.future.boxes.some((b: { id: string }) => b.id === "redis"));

  const past = example("software-cache");
  const now = grid.derived.future;
  const reached = await call("triz_nine_windows", { past, present: now, subsystem: ["app"], transitions: { past_to_present: [{ op: "trim", trim: ["redis"] }] } });
  assert.equal(reached.ok, true);
  assert.equal(reached.transitions[0].snapshot, "reached");
  assert.equal(reached.transitions[0].model, undefined);
  assert.deepEqual(reached.derived.present.boxes.map((b: { id: string }) => b.id).sort(), now.boxes.map((b: { id: string }) => b.id).sort());

  const failed = await call("triz_nine_windows", { present, subsystem: ["app"], transitions: { past_to_present: [{ op: "trim", trim: ["redis"] }] } });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.issues.map((i: Issue) => i.code), ["no-earlier-snapshot"]);
  assert.deepEqual(failed.errors, failed.issues.map((i: Issue) => i.message));
  assert.equal(failed.derived, undefined);
});

test("the code tables in error-codes.md list exactly the registered codes, each once", () => {
  const table = fs.readFileSync(path.resolve(here, "../skills/triz-innovation/references/error-codes.md"), "utf8");
  const listedCodes = [...table.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual([...listedCodes].sort(), Object.keys(ISSUE_CODES).sort());
  assert.equal(new Set(listedCodes).size, listedCodes.length, "each code once");
});

test("categorical-model.md's short code list names registered codes only, every lint among them, and links the full table", () => {
  const table = fs.readFileSync(path.resolve(here, "../skills/triz-innovation/references/error-codes.md"), "utf8");
  const lintsAt = table.indexOf("## Lints");
  assert.ok(lintsAt >= 0, "error-codes.md has a Lints section");
  const lintsEnd = table.indexOf("\n## ", lintsAt + 1);
  const lints = [...table.slice(lintsAt, lintsEnd < 0 ? undefined : lintsEnd).matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
  assert.ok(lints.length >= 1, "the Lints section lists codes");
  const doc = fs.readFileSync(path.resolve(here, "../skills/triz-innovation/references/categorical-model.md"), "utf8");
  const start = doc.indexOf("## Issue and lint codes");
  assert.ok(start >= 0, "the section exists");
  const end = doc.indexOf("\n## ", start + 1);
  const section = doc.slice(start, end < 0 ? undefined : end);
  const shortList = [...section.matchAll(/^\| `([a-z-]+)`(?: \(info\))? \|/gm)].map((m) => m[1]);
  for (const code of shortList) assert.ok(Object.hasOwn(ISSUE_CODES, code), `'${code}' is not a registered code`);
  for (const lint of lints) assert.ok(shortList.includes(lint), `lint '${lint}' is missing from the short list`);
  assert.equal(new Set(shortList).size, shortList.length, "each code once");
  assert.match(section, /\]\(error-codes\.md\)/, "the section links the full table");
});
