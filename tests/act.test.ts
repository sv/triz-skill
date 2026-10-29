/**
 * Categorical systems kernel tests: typing fails closed, harm loops are exhaustive,
 * trimming follows rules A/B/C, ideality never sums dimensions, separation glues per cell.
 * Domain fixtures are the shipped examples/function-models/*.json.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FunctionModel, checkModel, harmLoops, idealityProfile, compareIdeality, trimCandidates, separationCheck,
  analyseModel, functionModelJsonSchema, shortestPath, type PhysicalContradiction,
} from "../src/act.js";
import { toolSpecs } from "../src/tools.js";
import { ruleJsonSchema } from "../src/act-rule.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const clone = <T>(x: T): T => structuredClone(x);

/** Minimal model builder: every box gets one in and one out port per carrier it touches. */
function graph(edges: Array<[string, string, FunctionModel["wires"][number]["polarity"]]>): FunctionModel {
  const ids = [...new Set(edges.flatMap(([a, b]) => [a, b]))];
  return {
    domain: "physical",
    carriers: [{ id: "c", layer: "energy", dimension: "W" }],
    boxes: ids.map((id) => ({ id, name: id, role: "mediator", inputs: [{ id: "in", carrier: "c" }], outputs: [{ id: "out", carrier: "c" }] })),
    wires: edges.map(([a, b, polarity], i) => ({ id: `w${i}`, from: { box: a, port: "out" }, to: { box: b, port: "in" }, carrier: "c", polarity })),
  };
}

test("shipped domain examples parse and type-check", () => {
  for (const name of ["bearing-heat", "bearing-heat-behavior", "bearing-heat-feasibility", "software-cache", "marketplace-take-rate"]) {
    assert.deepEqual(checkModel(example(name)), { ok: true, errors: [], issues: [] }, name);
  }
});

test("typing fails closed: unknown box/port, wrong direction, carrier mismatch, duplicates", () => {
  const base = example("bearing-heat");
  const broken = (edit: (m: FunctionModel) => void) => { const m = clone(base); edit(m); return checkModel(m); };

  assert.match(broken((m) => { m.wires[0].to.box = "ghost"; }).errors.join(), /unknown box 'ghost'/);
  assert.match(broken((m) => { m.wires[0].to.port = "nope"; }).errors.join(), /has no port 'nope'/);
  assert.match(broken((m) => { m.wires[0].from = { box: "shaft", port: "drive" }; }).errors.join(), /'drive' of box 'shaft' is not an output/);
  assert.match(broken((m) => { m.wires[0].carrier = "heat"; }).errors.join(), /carrier 'heat' does not match port 'motor.shaft-out'/);
  assert.match(broken((m) => { m.boxes[0].outputs![0].carrier = "lava"; }).errors.join(), /unknown carrier 'lava'/);
  assert.match(broken((m) => { m.wires[1].id = m.wires[0].id; }).errors.join(), /duplicate wire id 'w-drive'/);
  assert.match(broken((m) => { m.boxes[1].inputs!.push({ id: "drive", carrier: "torque" }); }).errors.join(), /duplicate port id 'drive'/);
});

test("the pasted-spec business fixture (port-less boxes, invented port names) is rejected", () => {
  const m: FunctionModel = {
    domain: "business",
    carriers: [{ id: "money", layer: "financial", dimension: "USD/month" }],
    boxes: ["platform", "merchants", "consumers"].map((id) => ({ id, name: id, role: "product" as const })),
    wires: [{ id: "w_fee", from: { box: "platform", port: "fee" }, to: { box: "merchants", port: "pay" }, carrier: "money", polarity: "harmful" }],
  };
  const r = checkModel(m);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
  assert.equal(analyseModel(m).ok, false);
});

test("strict schema rejects unknown keys (typo'd fields never pass silently)", () => {
  const raw = JSON.parse(JSON.stringify(example("bearing-heat")));
  raw.wires[0].polarty = "useful";
  assert.equal(FunctionModel.safeParse(raw).success, false);
});

test("physical: bearing ⇄ shaft heat/expansion loop with a witness cycle per harmful function", () => {
  const loops = harmLoops(example("bearing-heat"));
  assert.equal(loops.length, 1);
  assert.deepEqual(loops[0].boxes, ["bearing", "shaft"]);
  assert.deepEqual(loops[0].negative, ["w-heat", "w-preload"]);
  assert.deepEqual(loops[0].cycles, [
    { via: "w-heat", path: ["bearing", "shaft", "bearing"] },
    { via: "w-preload", path: ["shaft", "bearing", "shaft"] },
  ]);
});

test("business: fee → markup → spend loop is found through excessive and harmful functions", () => {
  const loops = harmLoops(example("marketplace-take-rate"));
  assert.equal(loops.length, 1);
  assert.deepEqual(loops[0].negative, ["w-fee", "w-markup"]);
  assert.deepEqual(loops[0].cycles[0].path, ["platform", "merchants", "consumers", "platform"]);
});

test("self-loops count; useful-only feedback does not", () => {
  assert.deepEqual(harmLoops(graph([["a", "a", "harmful"]]))[0].cycles, [{ via: "w0", path: ["a", "a"] }]);
  assert.deepEqual(harmLoops(graph([["sensor", "valve", "useful"], ["valve", "sensor", "useful"]])), []);
  assert.deepEqual(harmLoops(graph([["a", "b", "harmful"]])), []);
});

test("loop search is exhaustive where one DFS pass is not (cycle a→c→b→a)", () => {
  // A DFS from a marks b visited via a→b, then misses a→c→b→a because b is off-stack by then.
  const loops = harmLoops(graph([["a", "b", "harmful"], ["b", "a", "harmful"], ["a", "c", "harmful"], ["c", "b", "harmful"]]));
  assert.equal(loops.length, 1);
  assert.deepEqual(loops[0].boxes, ["a", "b", "c"]);
  assert.deepEqual(loops[0].cycles.find((c) => c.via === "w2")!.path, ["a", "c", "b", "a"]);
});

test("software: trimming Redis — rule B self-service first, rule C gateway next, staleness removed", () => {
  const r = trimCandidates(example("software-cache"), ["redis"]);
  assert.ok(r.ok);
  assert.equal(r.verdict, "typed-feasible");
  assert.deepEqual(r.functions.map((f) => [f.wire, f.rule, f.absorbers.map((a) => `${a.box}:${a.rule}`)]),
    [["w-cache", "B", ["app:B", "gateway:C"]]]);
  assert.deepEqual(r.dropped, ["w-lookup"]);
  assert.deepEqual(r.removedHarms, ["w-stale"]);
  assert.deepEqual(r.costRelief, { usd_month: 400, p99_ms: 2.5 });
  assert.equal(r.trimmingProblems.length, 2);
  assert.match(r.trimmingProblems[1], /^\[C\] How can API gateway cache results for API service/);
});

test("physical: trimming the bearing leaves the housing as the only typed absorber", () => {
  const r = trimCandidates(example("bearing-heat"), ["bearing"]);
  assert.ok(r.ok);
  assert.deepEqual(r.functions[0].absorbers.map((a) => a.box), ["housing"]);
  assert.deepEqual(r.removedHarms, ["w-heat", "w-preload"]);
});

test("trimming: rule A when the object goes too, blocked when a function is orphaned, supersystem last", () => {
  const sw = example("software-cache");
  const both = trimCandidates(sw, ["redis", "app"]);
  assert.ok(both.ok);
  assert.equal(both.functions.find((f) => f.wire === "w-cache")!.rule, "A");

  const bearing = example("bearing-heat");
  const noHousing = trimCandidates(bearing, ["bearing", "housing"]);
  assert.ok(noHousing.ok);
  assert.equal(noHousing.verdict, "blocked");
  assert.deepEqual(noHousing.orphaned, ["w-support"]);

  const withMagnet = clone(bearing);
  withMagnet.boxes.push({ id: "field", name: "Magnetic field", role: "environment", outputs: [{ id: "lift", carrier: "radial-load" }] });
  const r = trimCandidates(withMagnet, ["bearing"]);
  assert.ok(r.ok);
  assert.deepEqual(r.functions[0].absorbers.map((a) => [a.box, a.supersystem]), [["housing", false], ["field", true]]);
});

test("trimming fails closed on unknown ids and invalid models", () => {
  const ghost = trimCandidates(example("bearing-heat"), ["ghost"]);
  assert.deepEqual(ghost.ok === false && ghost.errors, ["unknown box 'ghost' in trim set"]);
  assert.deepEqual(ghost.ok === false && ghost.issues.map((i) => [i.code, i.path]), [["unknown-box", "$.trim[0]"]]);
  const twice = trimCandidates(example("bearing-heat"), ["bearing", "bearing"]);
  assert.deepEqual(twice.ok === false && twice.issues.map((i) => [i.code, i.path, i.message]), [["listed-twice", "$.trim[1]", "box 'bearing' listed twice in trim set"]]);
  const bad = example("bearing-heat");
  bad.wires[0].carrier = "heat";
  const mistyped = trimCandidates(bad, ["bearing"]);
  assert.equal(mistyped.ok, false);
  assert.deepEqual(mistyped.ok === false && [...new Set(mistyped.issues.map((i) => i.path))], ["$.model.wires[0].carrier"]);
});

test("ideality: costs stay per dimension; ratio only under explicit weights", () => {
  const sw = example("software-cache");
  const p = idealityProfile(sw);
  assert.deepEqual(p.costs, { usd_month: 2650, p99_ms: 11.5 });
  assert.deepEqual(p.budget, { overBudget: ["usd_month"], unbudgeted: [], withinBudget: false });
  assert.equal(p.ratio.computable, false);

  sw.weights = { usd_month: 0.001, p99_ms: 0.1, harmful: 1 };
  const q = idealityProfile(sw);
  assert.ok(q.ratio.computable);
  assert.equal(q.ratio.value.toFixed(4), (7 / (2.65 + 1.15 + 1)).toFixed(4));

  const unbudgeted = example("bearing-heat");
  unbudgeted.budget = { usd_unit: 200 };
  assert.deepEqual(idealityProfile(unbudgeted).budget, { overBudget: [], unbudgeted: ["service_h_year"], withinBudget: false });
});

test("compare: Redis absorbed in-process dominates the baseline; dropping the response loses a function", () => {
  const base = example("software-cache");
  const concept = clone(base);
  concept.boxes = concept.boxes.filter((b) => b.id !== "redis");
  concept.wires = concept.wires.filter((w) => w.from.box !== "redis" && w.to.box !== "redis");
  concept.wires.push({ id: "w-memo", from: { box: "app", port: "memo" }, to: { box: "app", port: "cache-in" }, carrier: "cached", polarity: "useful", verb: "cache" });
  concept.boxes.find((b) => b.id === "app")!.cost = { usd_month: 1000 };
  assert.equal(checkModel(concept).ok, true);

  const c = compareIdeality(base, concept);
  assert.equal(c.verdict, "concept-dominates");
  assert.deepEqual(c.better, ["harmful", "cost:p99_ms", "cost:usd_month"]);
  assert.deepEqual(c.worse, []);

  const lossy = clone(concept);
  lossy.wires = lossy.wires.filter((w) => w.id !== "w-serve");
  assert.equal(compareIdeality(base, lossy).verdict, "concept-loses-functions");

  const noProduct = example("bearing-heat");
  noProduct.boxes.find((b) => b.id === "shaft")!.role = "mediator";
  const empty: FunctionModel = { ...noProduct, boxes: [], wires: [], contradictions: [] };
  const vacuous = compareIdeality(noProduct, empty);
  assert.equal(vacuous.verdict, "indeterminate");
  assert.match(vacuous.reason!, /role 'product'/);

  const pricier = clone(concept);
  pricier.boxes.find((b) => b.id === "app")!.cost = { usd_month: 1500 };
  assert.equal(compareIdeality(base, pricier).verdict, "trade-off");
});

const pc = (demands: PhysicalContradiction["demands"], axes?: PhysicalContradiction["axes"]): PhysicalContradiction =>
  ({ id: "pc", parameter: "p", demands, ...(axes ? { axes } : {}) });

test("separation: bearing clearance separates in time and glues", () => {
  const analysed = analyseModel(example("bearing-heat"));
  assert.ok(analysed.ok);
  const [s] = analysed.separation;
  assert.ok(s.ok);
  assert.equal(s.contradiction, true);
  assert.equal(s.gluable, true);
  assert.deepEqual(s.pairs, [{ demands: ["precision", "no-seizure"], status: "separated", separatingAxes: ["time"] }]);
});

test("separation: overlapping regions are irreducible and the conflict cells are named", () => {
  const r = separationCheck(pc([
    { id: "hot", values: ["thick"], space: ["edge", "core"], time: ["day"] },
    { id: "light", values: ["thin"], space: ["edge"] },
  ], { space: ["edge", "core"], time: ["day", "night"] }));
  assert.ok(r.ok);
  assert.equal(r.pairs[0].status, "irreducible");
  assert.equal(r.gluable, false);
  assert.deepEqual(r.conflictCells, [{ cell: { space: "edge", time: "day" }, demands: ["hot", "light"] }]);
  assert.match(r.route, /refine an axis/);
});

test("separation: shared values mean no physical contradiction (decline condition)", () => {
  const r = separationCheck(pc([{ id: "a", values: ["low", "mid"] }, { id: "b", values: ["mid", "high"] }]));
  assert.ok(r.ok);
  assert.equal(r.contradiction, false);
  assert.match(r.route, /Not a physical contradiction/);
});

test("separation: pairwise-compatible demands can still fail to glue jointly", () => {
  const r = separationCheck(pc([{ id: "a", values: ["x", "y"] }, { id: "b", values: ["y", "z"] }, { id: "c", values: ["x", "z"] }]));
  assert.ok(r.ok);
  assert.ok(r.pairs.every((p) => p.status === "compatible"));
  assert.equal(r.gluable, false);
  assert.equal(r.conflictCellCount, 1);
});

test("separation: system level, direction, and fail-closed undeclared cells", () => {
  const chain = separationCheck(pc([
    { id: "wrap", values: ["flexible"], level: ["chain"] },
    { id: "load", values: ["rigid"], level: ["link"] },
  ]));
  assert.ok(chain.ok);
  assert.deepEqual(chain.pairs[0], { demands: ["wrap", "load"], status: "separated", separatingAxes: ["level"] });
  assert.equal(separationCheck(pc([{ id: "a", values: ["x"], time: ["dusk"] }, { id: "b", values: ["y"] }], { time: ["day"] })).ok, false);
  const spring = separationCheck(pc([
    { id: "stiff", values: ["high"], direction: ["axial"] },
    { id: "compliant", values: ["low"], direction: ["radial"] },
  ]));
  assert.ok(spring.ok);
  assert.deepEqual(spring.pairs[0], { demands: ["stiff", "compliant"], status: "separated", separatingAxes: ["direction"] });
});

test("committed JSON Schemas match the zod models (regenerate with pnpm schema)", () => {
  for (const [file, schema] of [["function-model.schema.json", functionModelJsonSchema()], ["rule.schema.json", ruleJsonSchema()]] as const) {
    const committed = JSON.parse(fs.readFileSync(path.resolve(here, `../skills/triz-innovation/schemas/${file}`), "utf8"));
    assert.deepEqual(committed, JSON.parse(JSON.stringify(schema)), file);
  }
});

test("kernel tools are registered and answer over the shared spec", async () => {
  const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
  for (const name of ["triz_function_model", "triz_trim", "triz_separate", "triz_export", "triz_transform", "triz_nine_windows", "triz_rule_apply", "triz_behavior", "triz_weakness", "triz_feasibility", "triz_dynamics", "triz_abstraction"]) assert.ok(specs[name], name);
  const out = JSON.parse((await specs.triz_trim.handler({ model: example("bearing-heat"), trim: ["bearing"] })).content[0].text);
  assert.equal(out.verdict, "typed-feasible");
});

// Review regressions (PR #4).

test("deliverables are per product port: dropping one of two same-carrier inputs loses a function", () => {
  const base: FunctionModel = {
    domain: "physical",
    carriers: [{ id: "force", layer: "energy", dimension: "N" }],
    boxes: [
      { id: "lifter", name: "Lifter", role: "tool", outputs: [{ id: "up", carrier: "force" }], cost: { usd: 10 } },
      { id: "clamp", name: "Clamp", role: "tool", outputs: [{ id: "grip", carrier: "force" }], cost: { usd: 10 } },
      { id: "part", name: "Part", role: "product", inputs: [{ id: "lift", carrier: "force" }, { id: "clamp", carrier: "force" }] },
    ],
    wires: [
      { id: "w-lift", from: { box: "lifter", port: "up" }, to: { box: "part", port: "lift" }, carrier: "force", polarity: "useful" },
      { id: "w-clamp", from: { box: "clamp", port: "grip" }, to: { box: "part", port: "clamp" }, carrier: "force", polarity: "useful" },
    ],
  };
  const concept = clone(base);
  concept.wires = concept.wires.filter((w) => w.id !== "w-clamp");
  concept.boxes = concept.boxes.filter((b) => b.id !== "clamp");
  const c = compareIdeality(base, concept);
  assert.equal(c.verdict, "concept-loses-functions");
  assert.deepEqual(c.lostDeliverables, [JSON.stringify(["part", "clamp", "force"])]);
});

test("cost dimensions are own keys: 'constructor' is just a name, '__proto__' never reaches the kernel", () => {
  const m = example("bearing-heat");
  m.boxes.find((b) => b.id === "housing")!.cost = { constructor: 10 };
  m.budget = undefined;
  m.weights = { harmful: 1 };
  const p = idealityProfile(m);
  assert.equal(p.costs.constructor, 10);
  assert.equal(p.ratio.computable, false);
  if (!p.ratio.computable) assert.match(p.ratio.reason, /'constructor'/);

  m.weights = { harmful: 1, constructor: 1, usd_unit: 1, service_h_year: 1 };
  const q = idealityProfile(m);
  assert.ok(q.ratio.computable && Number.isFinite(q.ratio.value));

  const relief = trimCandidates(m, ["housing", "bearing"]);
  assert.ok(relief.ok);
  assert.deepEqual(relief.costRelief, { constructor: 10, usd_unit: 18, service_h_year: 2 });

  const plain = example("bearing-heat");
  assert.ok(compareIdeality(plain, m).better.length >= 0);
  assert.ok(!compareIdeality(m, plain).worse.includes("cost:constructor"));

  const raw = JSON.parse(JSON.stringify(example("bearing-heat")));
  raw.boxes[0].cost = JSON.parse('{"__proto__": 5, "usd_unit": 1}');
  const parsed = FunctionModel.parse(raw).boxes[0].cost!;
  assert.deepEqual(Object.keys(parsed), ["usd_unit"]);
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  const schema = functionModelJsonSchema() as any;
  assert.equal(schema.$defs.Box.properties.cost.propertyNames.pattern, "^(?!__proto__$)");
});

test("separation: pairwise-compatible demands in separate cells need a piecewise assignment", () => {
  const r = separationCheck(pc([
    { id: "a", values: ["x", "y"], time: ["morning"] },
    { id: "b", values: ["y", "z"], time: ["noon"] },
    { id: "c", values: ["x", "z"], time: ["night"] },
  ]));
  assert.ok(r.ok);
  assert.ok(r.pairs.every((p) => p.status === "compatible"));
  assert.deepEqual(r.sharedValues, []);
  assert.equal(r.contradiction, true);
  assert.equal(r.gluable, true);
  assert.match(r.route, /piecewise/);
  assert.doesNotMatch(r.route, /choose it/);
});

test("witness paths fail closed: an unreachable goal yields no path, never a one-node witness", () => {
  const adj = new Map([["a", ["b"]], ["b", []]]);
  assert.deepEqual(shortestPath("b", "a", adj, new Set(["a", "b"])), []);
  assert.deepEqual(shortestPath("a", "b", adj, new Set(["a", "b"])), ["a", "b"]);
  assert.deepEqual(shortestPath("a", "a", adj, new Set(["a"])), ["a"]);
});

test("an invalid embedded contradiction fails the whole analysis", () => {
  const m = example("bearing-heat");
  m.contradictions![0].demands[1].id = m.contradictions![0].demands[0].id;
  const r = analyseModel(m);
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.errors, ["contradiction 'clearance': duplicate demand id 'precision'"]);
});
