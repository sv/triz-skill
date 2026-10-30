import { test } from "node:test";
import assert from "node:assert/strict";
import { checkModel, type FunctionModel } from "../src/act.js";
import { substitute, type SubstitutionOptions } from "../src/act-hierarchy.js";
import { flowAnalysis } from "../src/act-flow.js";
import { feasibility } from "../src/act-feasibility.js";

const c = { id: "c", layer: "material" as const, dimension: "kg", quantity: "intensive" as const };
const port = (id: string) => ({ id, carrier: "c" });
const wire = (id: string, from: string, fp: string, to: string, tp: string) => ({ id, from: { box: from, port: fp }, to: { box: to, port: tp }, carrier: "c", polarity: "useful" as const });
function fixture(): FunctionModel {
  return { domain: "physical", carriers: [c], budget: { usd: 10, latency: 4 }, weights: { usd: 1, harmful: 2 }, boxes: [
    { id: "s", name: "Source", role: "environment", outputs: [port("o")], feasibility: [{ provides: { o: 2 } }] },
    { id: "h", name: "Shell", role: "tool", inputs: [port("in")], outputs: [port("out")], inner: {
      model: { domain: "physical", carriers: [c], boxes: [
        { id: "__proto__", name: "A", role: "tool", inputs: [port("i")], outputs: [port("o")], cost: { usd: 2 }, feasibility: [{ requires: { i: 1 }, provides: { o: 1 } }] },
        { id: "b", name: "B", role: "mediator", inputs: [port("i")], outputs: [port("o")], cost: { usd: 1 }, feasibility: [{ requires: { i: 1 }, provides: { o: 1 } }] },
      ], wires: [wire("inside", "__proto__", "o", "b", "i")], flows: [{ id: "inner", carrier: "c", path: ["__proto__", "b"], medium: "b" }] },
      inputs: [{ outer: "in", inner: { box: "__proto__", port: "i" } }], outputs: [{ outer: "out", inner: { box: "b", port: "o" } }],
    } },
    { id: "m", name: "Middle", role: "mediator", inputs: [port("i")], outputs: [port("o")], feasibility: [{ requires: { i: 1 }, provides: { o: 1 } }] },
    { id: "p", name: "Product", role: "product", inputs: [port("d")], feasibility: [{ requires: { d: 1 } }] },
  ], wires: [wire("enter", "s", "o", "h", "in"), wire("middle-out", "h", "out", "m", "i"), wire("middle-in", "m", "o", "h", "in"), wire("exit", "h", "out", "p", "d")],
  flows: [{ id: "f", carrier: "c", path: ["s", "h", "m", "h", "p"], medium: "h" }] };
}
const routes: NonNullable<SubstitutionOptions["routes"]> = [0, 1].map(occurrence => ({ flow: "f", occurrence, path: ["__proto__", "b"], entry: "in", exit: "out" }));
const opts: SubstitutionOptions = { routes, media: [{ flow: "f", box: "b" }] };

test("explicit repeated routes and medium preserve flows, loops, ids and model immutability", () => {
  const m = fixture(), snapshot = structuredClone(m), options = structuredClone(opts);
  assert.equal(checkModel(m).ok, true);
  const r = substitute(m, "h", options); assert.ok(r.ok); if (!r.ok) return;
  assert.deepEqual(m, snapshot); assert.deepEqual(options, opts);
  assert.equal(Object.hasOwn(r.boxNames, "__proto__"), true); assert.equal(r.boxNames.__proto__, "h/__proto__");
  assert.deepEqual(r.model.flows![0], { id: "f", carrier: "c", path: ["s", "h/__proto__", "h/b", "m", "h/__proto__", "h/b", "p"], medium: "h/b" });
  assert.equal(checkModel(r.model).ok, true);
  const flows = flowAnalysis(r.model); assert.ok(flows.ok); if (flows.ok) assert.ok(flows.flows.find(f => f.id === "f")!.loops.length > 0);
  const feasible = feasibility(r.model); assert.ok(feasible.ok && feasible.verdict === "feasible");
});

test("missing, extra, duplicate, invalid and disconnected routes fail closed", () => {
  const m = fixture();
  const bad: SubstitutionOptions[] = [
    {}, { routes: [routes[0]], media: opts.media }, { routes: [routes[0], routes[0]], media: opts.media },
    { routes: [...routes, { ...routes[0], occurrence: 2 }], media: opts.media },
    { routes, media: [{ flow: "unknown", box: "b" }] }, { routes, media: [{ flow: "f", box: "missing" }] },
    { routes: [{ ...routes[0], entry: "wrong" }, routes[1]], media: opts.media },
    { routes: [{ ...routes[0], exit: "in" }, routes[1]], media: opts.media },
    { routes: [{ ...routes[0], path: ["__proto__", "missing"] }, routes[1]], media: opts.media },
    { routes: [{ ...routes[0], path: ["__proto__", "__proto__", "b"] }, routes[1]], media: opts.media },
    { routes: [{ ...routes[0], path: ["b", "__proto__"] }, routes[1]], media: opts.media },
  ];
  for (const options of bad) assert.equal(substitute(m, "h", options).ok, false, JSON.stringify(options));
  const noEvidence = structuredClone(m); noEvidence.boxes[1].inner.model.wires = []; noEvidence.boxes[1].inner.model.flows = [];
  // The input remains well typed: add the newly exposed endpoints to the shell interface first.
  noEvidence.boxes[1].inputs!.push(port("otherIn")); noEvidence.boxes[1].outputs!.push(port("otherOut"));
  noEvidence.boxes[1].inner.inputs.push({ outer: "otherIn", inner: { box: "b", port: "i" } });
  noEvidence.boxes[1].inner.outputs.push({ outer: "otherOut", inner: { box: "__proto__", port: "o" } });
  assert.equal(checkModel(noEvidence).ok, true);
  const disconnected = substitute(noEvidence, "h", opts); assert.equal(disconnected.ok, false);
  if (!disconnected.ok) assert.match(disconnected.errors.join(" "), /unsupported step/);
  const wrongCarrier = structuredClone(m); wrongCarrier.carriers.push({ ...c, id: "other" }); wrongCarrier.flows![0].carrier = "other";
  assert.equal(substitute(wrongCarrier, "h", opts).ok, false);
});

test("inner flow steps support a route without internal wires", () => {
  const m = fixture(), inner = m.boxes[1].inner.model;
  inner.wires = [];
  m.boxes[1].inputs!.push(port("otherIn")); m.boxes[1].outputs!.push(port("otherOut"));
  m.boxes[1].inner.inputs.push({ outer: "otherIn", inner: { box: "b", port: "i" } });
  m.boxes[1].inner.outputs.push({ outer: "otherOut", inner: { box: "__proto__", port: "o" } });
  const r = substitute(m, "h", opts); assert.ok(r.ok); if (r.ok) assert.equal(checkModel(r.model).ok, true);
});

test("policies explicitly hoist budgets, reconcile weights and append independent contradictions", () => {
  const m = fixture(), inner = m.boxes[1].inner.model;
  inner.budget = { usd: 6, power: 2 }; inner.weights = { usd: 1, power: 3 };
  inner.contradictions = [{ id: "__proto__", parameter: "p", demands: [{ id: "a", values: ["0"] }, { id: "b", values: ["1"] }] }];
  m.contradictions = [{ id: "h/__proto__", parameter: "q", demands: [{ id: "a", values: ["0"] }, { id: "b", values: ["1"] }] }];
  assert.equal(substitute(m, "h", opts).ok, false);
  const r = substitute(m, "h", { ...opts, policies: { budget: "global-intersection", weights: "global-merge", contradictions: "append-renamed" } });
  assert.ok(r.ok); if (!r.ok) return;
  assert.deepEqual(r.model.budget, { usd: 6, latency: 4, power: 2 });
  assert.deepEqual(r.model.weights, { usd: 1, harmful: 2, power: 3 });
  assert.equal(r.model.contradictions![1].id, "h/__proto__#2");
  assert.equal(r.contradictionNames.__proto__, "h/__proto__#2");
  assert.equal(r.policyEffects.budget?.scope, "global"); assert.match(r.policyEffects.budget!.note, /stronger than a local bound/);
  assert.equal(r.policyEffects.contradictions?.scope, "independent");
  const bad = structuredClone(m); bad.boxes[1].inner.model.weights.usd = 3;
  assert.equal(substitute(bad, "h", { ...opts, policies: { budget: "global-intersection", weights: "global-merge", contradictions: "append-renamed" } }).ok, false);
});

test("an empty inner contradiction list needs no policy and reports no policy effect", () => {
  const m = fixture(); m.boxes[1].inner.model.contradictions = [];
  const r = substitute(m, "h", opts);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors)); if (!r.ok) return;
  assert.equal(r.model.contradictions, undefined);
  assert.equal(r.policyEffects.contradictions, undefined);
  m.contradictions = [{ id: "outer", parameter: "q", demands: [{ id: "a", values: ["0"] }, { id: "b", values: ["1"] }] }];
  const kept = substitute(m, "h", opts); assert.ok(kept.ok); if (kept.ok) assert.deepEqual(kept.model.contradictions, m.contradictions);
});

test("routes at the start or end of a flow may omit the open-side port", () => {
  const first = fixture(); first.flows![0].path = ["h", "m", "h", "p"];
  const a = substitute(first, "h", { routes: [{ ...routes[0], entry: undefined }, routes[1]], media: opts.media });
  assert.ok(a.ok); if (a.ok) assert.equal(a.model.flows![0].path[0], "h/__proto__");
  const last = fixture(); last.flows![0].path = ["s", "h", "m", "h"];
  const b = substitute(last, "h", { routes: [routes[0], { ...routes[1], exit: undefined }], media: opts.media });
  assert.ok(b.ok); if (b.ok) assert.equal(b.model.flows![0].path.at(-1), "h/b");
  const wrongOpen = substitute(last, "h", { routes: [routes[0], { ...routes[1], exit: "in" }], media: opts.media });
  assert.equal(wrongOpen.ok, false);
});

test("strict route crossing refuses a declared flow step without a crossing wire", () => {
  const m = fixture(); m.wires = m.wires.filter(w => w.id !== "enter");
  const r = substitute(m, "h", opts); assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.issues[0].hint, /Flow paths without such wires are valid/);
});

test("reviewed parent and inner provenance survives with remapped references and decisions", () => {
  const m = fixture() as FunctionModel & { provenance?: unknown };
  const source = (name: string) => ({ source: name, pointer: "/items/0" });
  m.provenance = { status: "reviewed", components: [{ id: "h", source: source("shell") }, { id: "s", source: source("source") }, { id: "m", source: source("middle") }, { id: "p", source: source("product") }],
    interactions: ["enter", "middle-out", "middle-in", "exit"].map(wireId => ({ wireId, source: source("outer-wire") })),
    pending: [{ id: "h/review", kind: "assumption", description: "outer decision", source: source("outer") }],
    review: { decisions: [{ id: "h/review", decision: "confirm" }] } };
  m.boxes[1].inner.model.provenance = { status: "reviewed", components: [{ id: "__proto__", source: source("inner-box") }, { id: "b", source: source("inner-b") }],
    interactions: [{ wireId: "inside", source: source("inner-wire") }],
    pending: [{ id: "review", kind: "carrier", description: "inner decision", source: source("inner") },
      { id: "__proto__", kind: "role", description: "second decision", source: source("inner2") }],
    review: { decisions: [{ id: "review", decision: "confirm" }, { id: "__proto__", decision: "confirm" }] } };
  m.provenance!.hierarchy = [{ parent: "s", child: "m", source: source("outer-containment") }];
  m.boxes[1].inner.model.provenance!.hierarchy = [{ parent: "__proto__", child: "b", source: source("inner-containment") }];
  const original = structuredClone(m);
  const r = substitute(m, "h", opts); assert.ok(r.ok, r.ok ? "" : r.errors.join("; ")); if (!r.ok) return;
  assert.deepEqual(m, original);
  const p = (r.model as FunctionModel & { provenance: { status: string; components: Array<{id:string; source: {source:string}}>; interactions: Array<{wireId:string}>; pending: Array<{id:string}>; review: {decisions:Array<{id:string;decision:string}>} } }).provenance;
  assert.equal(p.status, "reviewed");
  assert.deepEqual(p.components.map(x => [x.id, x.source.source]), [["s", "source"], ["m", "middle"], ["p", "product"], ["h/__proto__", "shell"], ["h/b", "shell"], ["h/__proto__", "inner-box"], ["h/b", "inner-b"]]);
  assert.deepEqual(p.interactions.map(x => x.wireId), ["enter", "middle-out", "middle-in", "exit", "h/inside"]);
  assert.deepEqual(p.pending.map(x => x.id), ["h/review", "h/review#2", "h/__proto__"]);
  assert.deepEqual(p.review.decisions.map(x => [x.id, x.decision]), [["h/review", "confirm"], ["h/review#2", "confirm"], ["h/__proto__", "confirm"]]);
  assert.equal(r.provenanceEffects.inheritedShellSources, 1);
  assert.equal(r.provenanceEffects.pendingNames.__proto__, "h/__proto__");
  assert.deepEqual(r.model.provenance!.hierarchy, [
    { parent: "s", child: "m", source: source("outer-containment") },
    { parent: "h/__proto__", child: "h/b", source: source("inner-containment") },
  ]);
  assert.equal(checkModel(r.model).ok, true);
  m.provenance!.hierarchy = [{ parent: "s", child: "h", source: source("shell-containment") }];
  const ambiguous = substitute(m, "h", opts);
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.match(ambiguous.errors.join(" "), /source containment/);
});

test("draft and orphaned provenance fail closed", () => {
  const m = fixture() as FunctionModel & { provenance?: unknown };
  const source = { source: "doc", pointer: "" };
  m.boxes[1].inner.model.provenance = { status: "draft", components: [{ id: "__proto__", source }], interactions: [], pending: [] };
  assert.equal(substitute(m, "h", opts).ok, false);
  m.boxes[1].inner.model.provenance = { status: "reviewed", components: [{ id: "missing", source }], interactions: [], pending: [], review: { decisions: [] } };
  assert.equal(substitute(m, "h", opts).ok, false);
});

test("a medium-only reference needs its own evidenced mapping", () => {
  const m = fixture(); m.flows![0].path = ["s", "m"];
  const r = substitute(m, "h", { media: [{ flow: "f", box: "b" }] });
  assert.ok(r.ok); if (r.ok) assert.equal(r.model.flows![0].medium, "h/b");
  m.boxes[1].inner.model.boxes.push({ id: "empty", name: "Empty", role: "mediator" });
  const bad = substitute(m, "h", { media: [{ flow: "f", box: "empty" }] });
  assert.equal(bad.ok, false);
});

test("global budget intersection changes the resulting feasibility verdict", () => {
  const m = fixture(); m.boxes[1].inner.model.budget = { usd: 2 };
  const r = substitute(m, "h", { ...opts, policies: { budget: "global-intersection" } });
  assert.ok(r.ok); if (!r.ok) return;
  const f = feasibility(r.model); assert.ok(f.ok); if (f.ok) assert.equal(f.verdict, "infeasible");
  assert.equal(r.model.budget!.usd, 2);
});

test("partial provenance fails instead of inventing sources for uncovered elements", () => {
  const source = { source: "doc", pointer: "" };
  const pending = [{ id: "review", kind: "assumption" as const, description: "review", source }];
  const review = { decisions: [{ id: "review", decision: "confirm" as const }] };
  const innerOnly = fixture();
  innerOnly.boxes[1].inner.model.provenance = { status: "reviewed", components: ["__proto__", "b"].map(id => ({ id, source })), interactions: [{ wireId: "inside", source }], pending, review };
  const a = substitute(innerOnly, "h", opts); assert.equal(a.ok, false);
  if (!a.ok) assert.match(a.errors.join(" "), /unannotated outer/);
  const outerOnly = fixture();
  outerOnly.provenance = { status: "reviewed", components: ["s", "h", "m", "p"].map(id => ({ id, source })), interactions: ["enter", "middle-out", "middle-in", "exit"].map(wireId => ({ wireId, source })), pending, review };
  const b = substitute(outerOnly, "h", opts); assert.equal(b.ok, false);
  if (!b.ok) assert.match(b.errors.join(" "), /unannotated inner wires/);
});
