/**
 * Flows (G8): declared flow paths, their typing, the flow analysis (triz_flow), merge along a flow
 * (Principle 5, reading 'adjacent'), and how every construction carries flows. Fixtures are a
 * generic cooling-water line (pump, two valves in series, a heat exchanger) and a request path
 * (clients, gateway, auth, rate limiter, service, job queue).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FunctionModel, checkModel } from "../src/act.js";
import { destutter, flowAnalysis, mapFlows, restrictFlows, stepsOf } from "../src/act-flow.js";
import { merge } from "../src/act-principles.js";
import { collapse, restrict } from "../src/act-windows.js";
import { applyRule, matchRule, type Rule } from "../src/act-rule.js";
import { toDot, toHypergraph, fromHypergraph } from "../src/act-export.js";
import { toolSpecs } from "../src/tools.js";
import { rng, int, pick } from "./support/gen.js";

/** Cooling water: pump → isolation valve → control valve → exchanger, back to the tank. The stages act on the coolant, not on each other. */
const line = (): FunctionModel => FunctionModel.parse({
  domain: "physical",
  system: "Cooling-water line",
  carriers: [
    { id: "water", layer: "material", dimension: "m³/h cooling water" },
    { id: "head", layer: "energy", dimension: "kPa pressure head" },
    { id: "heat", layer: "energy", dimension: "W thermal" },
  ],
  boxes: [
    { id: "tank", name: "Supply tank", role: "environment" },
    { id: "pump", name: "Pump", role: "tool", outputs: [{ id: "head-out", carrier: "head" }], cost: { usd_month: 120 } },
    { id: "valve-a", name: "Isolation valve", role: "tool", outputs: [{ id: "drop", carrier: "head" }], cost: { usd_month: 10 } },
    { id: "valve-b", name: "Control valve", role: "tool", outputs: [{ id: "drop", carrier: "head" }, { id: "seep", carrier: "water" }], cost: { usd_month: 25 } },
    { id: "exchanger", name: "Heat exchanger", role: "tool", outputs: [{ id: "cool", carrier: "heat" }], cost: { usd_month: 60 } },
    { id: "coolant", name: "Cooling water", role: "product", inputs: [{ id: "head-in", carrier: "head" }, { id: "heat-in", carrier: "heat" }] },
    { id: "sump", name: "Drain sump", role: "mediator" },
    { id: "ground", name: "Ground", role: "environment", inputs: [{ id: "wet", carrier: "water" }] },
  ],
  wires: [
    { id: "w-pump", from: { box: "pump", port: "head-out" }, to: { box: "coolant", port: "head-in" }, carrier: "head", polarity: "useful", verb: "pressurize" },
    { id: "w-valve-a", from: { box: "valve-a", port: "drop" }, to: { box: "coolant", port: "head-in" }, carrier: "head", polarity: "harmful", verb: "drop the pressure of" },
    { id: "w-valve-b", from: { box: "valve-b", port: "drop" }, to: { box: "coolant", port: "head-in" }, carrier: "head", polarity: "useful", verb: "regulate" },
    { id: "w-cool", from: { box: "exchanger", port: "cool" }, to: { box: "coolant", port: "heat-in" }, carrier: "heat", polarity: "useful", verb: "cool" },
    { id: "w-leak", from: { box: "valve-b", port: "seep" }, to: { box: "ground", port: "wet" }, carrier: "water", polarity: "harmful", verb: "leak onto" },
  ],
  flows: [
    { id: "loop", carrier: "water", medium: "coolant", path: ["tank", "pump", "valve-a", "valve-b", "exchanger", "tank"] },
    { id: "bleed", carrier: "water", path: ["valve-b", "sump"] },
  ],
});

/** Requests: two clients through a gateway, auth, and a rate limiter to a service, which queues jobs. */
const requests = (): FunctionModel => {
  const port = (id: string) => ({ id, carrier: "request" });
  return FunctionModel.parse({
    domain: "software",
    carriers: [{ id: "request", layer: "information", dimension: "HTTP request" }, { id: "load", layer: "information", dimension: "requests/s" }],
    boxes: [
      { id: "web", name: "Web client", role: "supersystem", outputs: [port("out")] },
      { id: "mobile", name: "Mobile client", role: "supersystem", outputs: [port("out")] },
      { id: "gateway", name: "API gateway", role: "mediator", inputs: [port("in"), { id: "load-in", carrier: "load" }], outputs: [port("out")] },
      { id: "auth", name: "Auth middleware", role: "mediator", inputs: [port("in")], outputs: [port("out")] },
      { id: "limiter", name: "Rate limiter", role: "mediator", inputs: [port("in")], outputs: [port("out"), { id: "load-out", carrier: "load" }] },
      { id: "service", name: "Service", role: "product", inputs: [port("in")], outputs: [port("enqueue")] },
      { id: "queue", name: "Job queue", role: "mediator", inputs: [port("in")] },
    ],
    wires: [
      { id: "w-web", from: { box: "web", port: "out" }, to: { box: "gateway", port: "in" }, carrier: "request", polarity: "useful" },
      { id: "w-mobile", from: { box: "mobile", port: "out" }, to: { box: "gateway", port: "in" }, carrier: "request", polarity: "useful" },
      { id: "w-route", from: { box: "gateway", port: "out" }, to: { box: "auth", port: "in" }, carrier: "request", polarity: "useful" },
      { id: "w-check", from: { box: "auth", port: "out" }, to: { box: "limiter", port: "in" }, carrier: "request", polarity: "useful" },
      { id: "w-admit", from: { box: "limiter", port: "out" }, to: { box: "service", port: "in" }, carrier: "request", polarity: "insufficient", verb: "admit" },
      { id: "w-report", from: { box: "limiter", port: "load-out" }, to: { box: "gateway", port: "load-in" }, carrier: "load", polarity: "useful", verb: "report load to" },
      { id: "w-enqueue", from: { box: "service", port: "enqueue" }, to: { box: "queue", port: "in" }, carrier: "request", polarity: "useful" },
    ],
    flows: [
      { id: "from-web", carrier: "request", path: ["web", "gateway", "auth", "limiter", "service", "queue"] },
      { id: "from-mobile", carrier: "request", path: ["mobile", "gateway", "auth", "limiter", "service", "queue"] },
    ],
  });
};

const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);
const only = <T extends { ok: boolean }>(r: T) => { assert.ok(r.ok, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const errors = (r: { ok: boolean; errors?: string[] }) => (r.ok ? "" : r.errors!.join("; "));

test("flows type-check and fail closed on unknown boxes, carriers, media, repeats in a row, and short paths", () => {
  assert.ok(checkModel(line()).ok);
  const bad = (edit: (m: FunctionModel) => void) => { const m = line(); edit(m); return checkModel(m).errors.join("; "); };
  assert.match(bad((m) => { m.flows![0].path[1] = "nowhere"; }), /flow 'loop': unknown box 'nowhere'/);
  assert.match(bad((m) => { m.flows![0].carrier = "oil"; }), /flow 'loop': unknown carrier 'oil'/);
  assert.match(bad((m) => { m.flows![0].medium = "steam"; }), /flow 'loop': unknown medium box 'steam'/);
  assert.match(bad((m) => { m.flows![1].id = "loop"; }), /duplicate flow id 'loop'/);
  assert.match(bad((m) => { m.flows![0].path.splice(2, 0, "pump"); }), /flow 'loop': box 'pump' follows itself at position 2/);
  assert.equal(FunctionModel.safeParse({ ...line(), flows: [{ id: "f", carrier: "water", path: ["pump"] }] }).success, false);
});

test("flow analysis: steps, bottlenecks at the medium, a leak, the loop, and a flow that ends inside", () => {
  const r = only(flowAnalysis(line()));
  const loop = r.flows.find((f) => f.id === "loop")!;
  assert.equal(loop.declaredOnly, 5, "the stages act on the coolant, so no function joins consecutive ones");
  assert.deepEqual(loop.bottlenecks, [{ box: "valve-a", wire: "w-valve-a", polarity: "harmful", object: "coolant", at: 2 }]);
  assert.deepEqual(loop.leaks, [{ box: "valve-b", wire: "w-leak", to: "ground" }]);
  assert.deepEqual(loop.loops, [{ box: "tank", cycle: ["tank", "pump", "valve-a", "valve-b", "exchanger", "tank"], basis: ["edge_on_cycle"] }]);
  assert.deepEqual(loop.accumulation, [], "the loop returns to the tank, an environment box");
  const bleed = r.flows.find((f) => f.id === "bleed")!;
  assert.deepEqual(bleed.accumulation, [{ box: "sump", at: 1, reason: "ends-inside" }]);
});

test("flow analysis: functions on the flow's carrier act at their object; flows that converge accumulate", () => {
  const r = only(flowAnalysis(requests()));
  const web = r.flows.find((f) => f.id === "from-web")!;
  assert.equal(web.declaredOnly, 0);
  assert.deepEqual(web.steps.map((s) => s.functions), [["w-web"], ["w-route"], ["w-check"], ["w-admit"], ["w-enqueue"]]);
  assert.deepEqual(web.bottlenecks, [{ box: "limiter", wire: "w-admit", polarity: "insufficient", object: "service", at: 4 }]);
  assert.deepEqual(web.accumulation, [
    { box: "gateway", at: 1, reason: "converges", from: ["mobile", "web"] },
    { box: "queue", at: 5, reason: "ends-inside" },
  ]);
  assert.deepEqual(web.loops, []);
  const none = only(flowAnalysis({ ...requests(), flows: undefined }));
  assert.deepEqual(none.flows, []);
  assert.match(none.note, /declares no flows/);
});

test("merge (adjacent): boxes in series on a flow merge though no function joins them", () => {
  const m = line();
  const into = { id: "valves", name: "Valve block" };
  const r = only(merge(m, { boxes: ["valve-a", "valve-b"], into }));
  assert.deepEqual(r.flows!.paths, { loop: ["tank", "pump", "valves", "exchanger", "tank"], bleed: ["valves", "sump"] });
  assert.deepEqual(r.flows!.hidden, []);
  assert.deepEqual(r.flows!.newlyLooped, []);
  assert.deepEqual(r.flows!.basis, ["flow_merge_typed", "flow_merge_reach"]);
  assert.ok(checkModel(r.model).ok);
  // Without the flow, nothing joins the valves: the merge is refused, as before flows existed.
  const bare = merge({ ...m, flows: undefined }, { boxes: ["valve-a", "valve-b"], into });
  assert.match(errors(bare), /not joined to 'valve-a' by functions inside the group or by consecutive positions on a flow/);
});

test("merge (adjacent): boxes with a box between them on a flow are refused, naming the loop it would close", () => {
  const r = merge(line(), { boxes: ["pump", "exchanger"], into: { id: "unit", name: "Unit" } });
  assert.equal(r.ok, false);
  assert.match(errors(r), /on flow 'loop', 'pump' and 'exchanger' have \[valve-a, valve-b\] between them, so merging them would close a loop in the flow/);
});

test("merge joined by a function but apart on a flow reports the loop it closes in the flow", () => {
  const r = only(merge(requests(), { boxes: ["gateway", "limiter"], into: { id: "edge", name: "Edge" } }));
  assert.deepEqual(r.flows!.paths["from-web"], ["web", "edge", "auth", "edge", "service", "queue"]);
  assert.deepEqual(r.flows!.newlyLooped, ["from-mobile", "from-web"]);
  const loops = only(flowAnalysis(r.model)).flows.find((f) => f.id === "from-web")!.loops;
  assert.deepEqual(loops.map((l) => l.cycle), [["edge", "auth", "edge"]]);
});

test("a merged flow's steps are the images of the steps whose ends differ (mergedStep in theory/)", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed);
    const boxes = Array.from({ length: int(r, 2, 6) }, (_, i) => `b${i}`);
    const path = destutter(Array.from({ length: int(r, 2, 10) }, () => pick(r, boxes)));
    if (path.length < 2) continue;
    const group = new Set(boxes.filter(() => r() < 0.4));
    const q = (id: string) => (group.has(id) ? "m" : id);
    const { flows, gone } = mapFlows([{ id: "f", carrier: "c", path }], q);
    const image = new Set(stepsOf(path).filter(([a, b]) => q(a) !== q(b)).map(([a, b]) => JSON.stringify([q(a), q(b)])));
    const merged = flows.length ? new Set(stepsOf(flows[0].path).map((s) => JSON.stringify(s))) : new Set<string>();
    assert.deepEqual(merged, image, `seed ${seed}`);
    assert.equal(gone.length > 0, image.size === 0, `seed ${seed}: a flow is hidden exactly when no step survives`);
  }
});

test("every construction carries flows: each result type-checks, and flows follow their boxes", async () => {
  const m = line();
  const transform = async (transformation: unknown) => call("triz_transform", { model: m, transformation });
  const typed = (r: { ok: boolean; model?: FunctionModel; errors?: string[] }, what: string) => {
    assert.ok(r.ok, `${what}: ${r.errors}`);
    assert.ok(checkModel(r.model!).ok, what);
    return r.model!;
  };
  const flow = (model: FunctionModel, id: string) => model.flows!.find((f) => f.id === id)?.path;

  const trimmed = await transform({ op: "trim", trim: ["valve-a"] });
  assert.deepEqual(flow(typed(trimmed, "trim"), "loop"), ["tank", "pump", "valve-b", "exchanger", "tank"]);
  assert.deepEqual(trimmed.flows, { bypassed: ["loop"], dropped: [] });
  const drained = await transform({ op: "trim", trim: ["sump"] });
  assert.deepEqual(drained.flows, { bypassed: [], dropped: ["bleed"] });
  assert.equal(flow(typed(drained, "trim sump"), "bleed"), undefined);

  const copy = await transform({ op: "cheap_copy", box: "valve-b", copy: { id: "valve-c", cost: { usd_month: 15 } } });
  assert.deepEqual(flow(typed(copy, "cheap_copy"), "loop"), ["tank", "pump", "valve-a", "valve-c", "exchanger", "tank"]);
  assert.deepEqual(flow(copy.model, "bleed"), ["valve-c", "sump"]);

  const kept = await transform({ op: "segment", box: "valve-b", parts: [{ id: "valve-b", ports: ["drop"] }, { id: "valve-b-seal", ports: ["seep"] }] });
  assert.deepEqual(flow(typed(kept, "segment keeping the id"), "loop"), m.flows![0].path);
  const lost = await transform({ op: "segment", box: "valve-b", parts: [{ id: "p1", ports: ["drop"] }, { id: "p2", ports: ["seep"] }] });
  assert.match(errors(lost), /box 'valve-b' lies on flow 'loop', 'bleed': give the part the flow passes through the id 'valve-b'/);

  for (const [what, t] of [
    ["take_out", { op: "take_out", box: "valve-b", ports: ["seep"], part: { id: "seal" } }],
    ["interpose", { op: "interpose", wire: "w-pump", mediator: { id: "damper", name: "Pulsation damper" } }],
    ["merge", { op: "merge", boxes: ["valve-a", "valve-b"], into: { id: "valves", name: "Valve block" } }],
    ["rerate", { op: "rerate", wire: "w-valve-b", polarity: "excessive" }],
    ["standby", { op: "standby", box: "pump", standby: { id: "spare", name: "Spare pump" } }],
    ["reverse", { op: "reverse", wire: "w-leak", ports: { from: "drip", to: "soak" } }],
    ["rewrite", { op: "rewrite", delete: { boxes: ["sump"], flows: ["bleed"] } }],
  ] as const) typed(await transform(t), what);
  const dangling = await transform({ op: "rewrite", delete: { boxes: ["sump"] } });
  assert.match(errors(dangling), /no-dangling: flow 'bleed' still passes deleted box 'sump'; delete or restate it/);
  const medium = await transform({ op: "rewrite", delete: { boxes: ["coolant"], wires: ["w-pump", "w-valve-a", "w-valve-b", "w-cool"] } });
  assert.match(errors(medium), /flow 'loop' still names deleted box 'coolant' as its medium/);
  const restated = await transform({ op: "rewrite", delete: { boxes: ["sump"], flows: ["bleed"] }, add: { flows: [{ id: "bleed", carrier: "water", path: ["valve-b", "ground"] }] } });
  assert.deepEqual(flow(typed(restated, "restated"), "bleed"), ["valve-b", "ground"]);

  const windows = await call("triz_nine_windows", { present: m, subsystem: ["pump", "valve-a", "valve-b"], transitions: { present_to_future: [{ op: "trim", trim: ["valve-a"] }] } });
  assert.equal(windows.ok, true, JSON.stringify(windows.transitions));
  const [step] = windows.transitions;
  assert.deepEqual([step.status, step.step.delete.boxes, step.flowsChanged], ["ok", ["valve-a"], ["loop"]]);
  const reached = await call("triz_nine_windows", { present: m, future: trimmed.model, subsystem: ["pump"], transitions: { present_to_future: [{ op: "trim", trim: ["valve-a"] }] } });
  assert.equal(reached.transitions[0].snapshot, "reached");
  const missed = await call("triz_nine_windows", { present: m, future: { ...trimmed.model, flows: m.flows!.slice(1) }, subsystem: ["pump"], transitions: { present_to_future: [{ op: "trim", trim: ["valve-a"] }] } });
  assert.match(missed.transitions[0].errors.join(), /differ at flows \[loop\]/);
});

test("a rule may not delete a box a flow passes (no-dangling)", () => {
  const drop: Rule = {
    id: "drop-box",
    carriers: [],
    left: { boxes: [{ id: "x", role: "mediator" }] },
    interface: { boxes: [] },
    right: { boxes: [] },
  };
  const listed = matchRule(line(), drop);
  assert.ok(listed.ok);
  const sump = listed.matches.find((x) => x.match.boxes.x === "sump")!;
  assert.equal(sump.applicable, false);
  assert.deepEqual(sump.violations, ["dangling: flow 'bleed' passes deleted box 'sump'"]);
  assert.match(errors(applyRule(line(), drop, sump.match)), /^dangling: flow 'bleed'/);
  const free = { ...line(), flows: [line().flows![0]] };
  assert.ok(applyRule(free, drop, sump.match).ok);
});

test("views: a restriction keeps each flow's runs inside the subsystem; a collapse passes the black box", () => {
  const sub = only(restrict(line(), ["pump", "valve-a", "valve-b", "sump"]));
  // The coolant, the loop's medium, is outside the subsystem, so the restricted loop names none.
  assert.deepEqual(sub.model.flows, [
    { id: "loop", carrier: "water", path: ["pump", "valve-a", "valve-b"] },
    { id: "bleed", carrier: "water", path: ["valve-b", "sump"] },
  ]);
  assert.deepEqual(sub.boundary.flows, ["loop"]);
  assert.ok(checkModel(sub.model).ok);
  const split = restrictFlows([{ id: "f", carrier: "water", path: ["a", "b", "x", "c", "d", "y", "e"] }], new Set(["a", "b", "c", "d", "e"]));
  assert.deepEqual(split.flows.map((f) => [f.id, f.path]), [["f/1", ["a", "b"]], ["f/2", ["c", "d"]]]);
  const sup = only(collapse(line(), ["pump", "valve-a", "valve-b", "exchanger", "sump"], { id: "system", name: "System", role: "tool" }));
  assert.deepEqual(sup.model.flows, [{ id: "loop", carrier: "water", medium: "coolant", path: ["tank", "system", "tank"] }]);
  assert.deepEqual(sup.flows, { through: ["loop", "bleed"], hidden: ["bleed"] });
});

test("exports carry flows: a lossless hypergraph round trip, and dotted DOT edges", () => {
  const m = line();
  assert.deepEqual(fromHypergraph(JSON.parse(JSON.stringify(toHypergraph(m)))), { ok: true, model: m });
  const dot = toDot(m);
  assert.match(dot, /"valve-a" -> "valve-b" \[label="loop \(water\)", style="dotted"/);
});

test("triz_flow answers over the shared tool spec and fails closed", async () => {
  const r = await call("triz_flow", { model: line() });
  assert.equal(r.ok, true);
  assert.deepEqual(r.flows.map((f: { id: string }) => f.id), ["loop", "bleed"]);
  const bad = line();
  bad.flows![0].path.push("nowhere");
  const out = await call("triz_flow", { model: bad });
  assert.equal(out.ok, false);
  assert.match(out.errors.join(), /flow 'loop': unknown box 'nowhere'/);
});
