/**
 * Typed constructions: every result passes checkModel, and every mistyped application fails
 * closed. Covers the rewrite engine (no-dangling, freshness, typed result), Segmentation,
 * Taking out, Intermediary, the applied trim, dynamization, and the 9-windows level views,
 * on the shipped examples and as properties over generated models.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel, harmLoops, compareIdeality, trimCandidates, dynamize, type PhysicalContradiction } from "../src/act.js";
import { rewrite, segment, takeOut, interpose, applyTrim } from "../src/act-rewrite.js";
import { restrict, collapse, nineWindows } from "../src/act-windows.js";
import { findIsomorphism } from "../src/act-iso.js";
import { toolSpecs } from "../src/tools.js";
import { rng, genModel, pick, shuffle, int } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const errors = (r: { ok: boolean; errors?: string[] }) => (r.ok ? "" : r.errors!.join("; "));
const ports = (b: FunctionModel["boxes"][number]) => [...(b.inputs ?? []), ...(b.outputs ?? [])].map((p) => p.id);
/** Boxes reachable from `start` along wires. */
function reach(m: FunctionModel, start: string): Set<string> {
  const seen = new Set([start]), queue = [start];
  for (let v = queue.shift(); v !== undefined; v = queue.shift()) {
    for (const w of m.wires) if (w.from.box === v && !seen.has(w.to.box)) { seen.add(w.to.box); queue.push(w.to.box); }
  }
  return seen;
}

test("rewrite: no-dangling, fresh ids, and a typed result are all enforced", () => {
  const m = example("bearing-heat");
  assert.match(errors(rewrite(m, { delete: { boxes: ["bearing"] } })), /no-dangling: wire 'w-support' still touches deleted box 'bearing'/);
  assert.match(errors(rewrite(m, { delete: { boxes: ["ghost"] } })), /unknown box 'ghost'/);
  assert.match(errors(rewrite(m, { add: { boxes: [{ id: "shaft", name: "again", role: "tool" }] } })), /box id 'shaft' is not fresh/);
  assert.match(errors(rewrite(m, { add: { wires: [{ ...m.wires[0], id: "w-new", carrier: "heat" }] } })), /^result: wire 'w-new'/);
  const ok = rewrite(m, { delete: { boxes: ["bearing"], wires: ["w-support", "w-heat", "w-preload"] }, add: { wires: [{ id: "w-support", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful" }] } });
  assert.ok(ok.ok);
  assert.deepEqual(checkModel(ok.model), { ok: true, errors: [] });
  // A deleted wire id may be reused by an added wire: delete-then-add, as in a rule's right side.
  assert.deepEqual(harmLoops(ok.model), []);
});

test("segment (Principle 1): ports partitioned, wires follow their ports, collapse recovers the box", () => {
  const m = example("bearing-heat");
  const r = segment(m, { box: "bearing", parts: [{ id: "races", ports: ["preload-in", "race"] }, { id: "rolling", ports: ["friction"] }], costTo: { service_h_year: "rolling" } });
  assert.ok(r.ok);
  assert.deepEqual(checkModel(r.model).ok, true);
  assert.deepEqual(r.boxMap, { races: "bearing", rolling: "bearing" });
  assert.equal(r.independent, true);
  const parts = Object.fromEntries(r.model.boxes.filter((b) => b.id in r.boxMap).map((b) => [b.id, b.cost]));
  assert.deepEqual(parts, { races: { usd_unit: 18 }, rolling: { service_h_year: 2 } });
  // The heat wire now leaves a part outside the preload loop: the model says so, nothing more.
  assert.deepEqual(harmLoops(r.model).map((l) => l.negative), [["w-preload"]]);
  const back = collapse(r.model, ["races", "rolling"], { id: "bearing", name: "Ball bearing", role: "mediator", action: "support" });
  assert.ok(back.ok);
  const iso = findIsomorphism(m, back.model);
  assert.ok(iso.ok && iso.decided && iso.isomorphic);
});

test("segment fails closed on a mistyped application", () => {
  const m = example("bearing-heat");
  const seg = (parts: Parameters<typeof segment>[1]["parts"], costTo?: Record<string, string>) => errors(segment(m, { box: "bearing", parts, costTo }));
  assert.match(seg([{ id: "a", ports: ["race", "friction", "preload-in"] }]), /at least two parts/);
  assert.match(seg([{ id: "a", ports: ["race"] }, { id: "b", ports: ["friction"] }]), /port 'preload-in' of box 'bearing' is assigned to no part/);
  assert.match(seg([{ id: "a", ports: ["race", "friction"] }, { id: "b", ports: ["friction", "preload-in"] }]), /port 'friction' assigned to both/);
  assert.match(seg([{ id: "a", ports: ["race", "ghost"] }, { id: "b", ports: ["friction", "preload-in"] }]), /has no port 'ghost'/);
  assert.match(seg([{ id: "a", ports: ["race"] }, { id: "b", ports: ["friction", "preload-in"] }], { volume: "a" }), /no cost dimension 'volume'/);
  assert.match(seg([{ id: "housing", ports: ["race"] }, { id: "b", ports: ["friction", "preload-in"] }]), /box id 'housing' is not fresh/);
  assert.match(errors(segment(m, { box: "ghost", parts: [] })), /unknown box 'ghost'/);
});

test("take out (Principle 2): the interfering part, or the only needed part", () => {
  const m = example("bearing-heat");
  const interfering = takeOut(m, { box: "bearing", ports: ["friction"], part: { id: "friction-source" } });
  assert.ok(interfering.ok);
  assert.deepEqual(interfering.interfering, ["w-heat"]);
  assert.ok(checkModel(interfering.model).ok);
  assert.match(errors(takeOut(m, { box: "bearing", ports: ["race"], part: { id: "x" } })), /nothing interfering to take out/);

  const needed = takeOut(m, { box: "bearing", ports: ["race"], part: { id: "race-ring", name: "Race ring" }, reading: "needed" });
  assert.ok(needed.ok);
  // The remainder performs only harmful functions, so trimming it orphans nothing.
  const t = trimCandidates(needed.model, ["bearing"]);
  assert.ok(t.ok);
  assert.deepEqual([t.verdict, t.functions, t.removedHarms], ["typed-feasible", [], ["w-heat", "w-preload"]]);
  assert.match(errors(takeOut(m, { box: "bearing", ports: ["friction"], part: { id: "x" }, reading: "needed" })), /useful functions \[w-support\] stay on the remainder/);
});

test("interpose (Principle 24): a function routed through a mediator keeps reachability and harm loops", () => {
  const m = example("bearing-heat");
  const r = interpose(m, { wire: "w-heat", mediator: { id: "jacket", name: "Cooling jacket" } });
  assert.ok(r.ok);
  assert.ok(checkModel(r.model).ok);
  assert.deepEqual(r.legs, ["w-heat/in", "w-heat/out"]);
  for (const b of m.boxes) assert.deepEqual([...reach(r.model, b.id)].filter((x) => x !== "jacket").sort(), [...reach(m, b.id)].sort(), b.id);
  const loopsOf = (x: FunctionModel) => harmLoops(x).map((l) => l.boxes.filter((b) => b !== "jacket"));
  assert.deepEqual(loopsOf(r.model), loopsOf(m));
  const rated = interpose(m, { wire: "w-heat", mediator: { id: "jacket", name: "Cooling jacket" }, polarity: { out: "insufficient" } });
  assert.ok(rated.ok);
  assert.deepEqual(rated.model.wires.filter((w) => w.id.startsWith("w-heat")).map((w) => w.polarity), ["harmful", "insufficient"]);
  assert.match(errors(interpose(m, { wire: "ghost", mediator: { id: "j", name: "J" } })), /unknown wire 'ghost'/);
  assert.match(errors(interpose(m, { wire: "w-heat", mediator: { id: "housing", name: "J" } })), /box id 'housing' is not fresh/);
  assert.match(errors(interpose(m, { wire: "w-heat", mediator: { id: "j", name: "J" }, ids: { in: "w-drive" } })), /wire id 'w-drive' is not fresh/);
});

test("apply trim: Redis absorbed by the service (rule B) dominates; choices outside the screen fail closed", () => {
  const base = example("software-cache");
  const r = applyTrim(base, { trim: ["redis"] });
  assert.ok(r.ok);
  assert.deepEqual(r.chosen, [{ wire: "w-cache", box: "app", port: "memo", rule: "B", defaulted: true }]);
  assert.deepEqual([r.dropped, r.removedHarms], [["w-lookup"], ["w-stale"]]);
  assert.ok(checkModel(r.model).ok);
  const c = compareIdeality(base, r.model);
  assert.equal(c.verdict, "concept-dominates");
  assert.deepEqual(c.better, ["harmful", "cost:p99_ms", "cost:usd_month"]);

  const viaGateway = applyTrim(base, { trim: ["redis"], absorb: { "w-cache": { box: "gateway", port: "edge-cache" } } });
  assert.ok(viaGateway.ok);
  assert.equal(viaGateway.chosen[0].rule, "C");
  assert.match(errors(applyTrim(base, { trim: ["redis"], absorb: { "w-cache": { box: "postgres", port: "result" } } })), /not a typed absorber of 'w-cache'/);
  assert.match(errors(applyTrim(base, { trim: ["redis"], absorb: { "w-cache": { box: "gateway", port: "fwd" } } })), /not a typed absorber/);
  assert.match(errors(applyTrim(base, { trim: ["redis"], absorb: { "w-serve": { box: "app", port: "resp" } } })), /'w-serve' is not a function the trimmed boxes perform/);
  assert.match(errors(applyTrim(example("bearing-heat"), { trim: ["bearing", "housing"] })), /function 'w-support' has no typed absorber: the trim is blocked/);
  assert.match(errors(applyTrim(base, { trim: ["ghost"] })), /unknown box 'ghost'/);
});

const pc = (demands: PhysicalContradiction["demands"], axes?: PhysicalContradiction["axes"]): PhysicalContradiction =>
  ({ id: "pc", parameter: "p", demands, ...(axes ? { axes } : {}) });

test("dynamize (Principle 15): a time-indexed parameter only when it must change", () => {
  const clearance = example("bearing-heat").contradictions![0];
  const d = dynamize(clearance);
  assert.ok(d.ok);
  assert.equal(d.verdict, "dynamizable");
  assert.deepEqual(d.witness, { "cold-start": "loose", steady: "tight", "warm-up": "loose" });

  const constant = dynamize(pc([{ id: "a", values: ["x", "y"], time: ["t1"] }, { id: "b", values: ["y"], time: ["t2"] }]));
  assert.ok(constant.ok);
  assert.deepEqual([constant.verdict, constant.constant], ["constant-suffices", ["y"]]);

  // Opposed in space within one time cell: time alone cannot carry the change.
  const spatial = pc([{ id: "hot", values: ["thick"], space: ["edge"] }, { id: "light", values: ["thin"], space: ["core"] }], { time: ["day"] });
  const t = dynamize(spatial);
  assert.ok(t.ok);
  assert.deepEqual([t.verdict, t.blocked], ["not-dynamizable", ["day"]]);
  const s = dynamize(spatial, "space");
  assert.ok(s.ok);
  assert.equal(s.verdict, "dynamizable");

  assert.match(errors(dynamize(pc([{ id: "a", values: ["x"] }, { id: "b", values: ["y"] }]))), /axis 'time' has no cells/);
  assert.match(errors(dynamize(pc([{ id: "a", values: ["x"], time: ["dusk"] }, { id: "b", values: ["y"] }], { time: ["day"] }))), /cell 'dusk' is not declared/);
});

test("9 windows: restriction, collapse, and the grid on the bearing", () => {
  const m = example("bearing-heat");
  const sub = restrict(m, ["bearing", "shaft"]);
  assert.ok(sub.ok);
  assert.deepEqual(sub.boundary, { entering: ["w-drive"], leaving: [] });
  assert.deepEqual(sub.model.wires.map((w) => w.id), ["w-support", "w-heat", "w-preload"]);

  const sup = collapse(m, ["motor", "bearing", "housing"], { id: "drive-unit", name: "Drive unit", role: "tool" });
  assert.ok(sup.ok);
  assert.ok(checkModel(sup.model).ok);
  assert.deepEqual(harmLoops(sup.model).map((l) => [l.boxes, l.negative]), [[["drive-unit", "shaft"], ["w-heat", "w-preload"]]]);
  const hiding = collapse(m, ["bearing", "shaft"], { id: "rotor", name: "Rotor", role: "product" });
  assert.ok(hiding.ok);
  assert.deepEqual(hiding.hiddenHarms, ["w-heat", "w-preload"]);

  const past = structuredClone(m);
  past.boxes = past.boxes.filter((b) => b.id !== "bearing");
  past.wires = past.wires.filter((w) => w.from.box !== "bearing" && w.to.box !== "bearing")
    .concat({ id: "w-bushing", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "insufficient" });
  const grid = nineWindows({ past, present: m, subsystem: ["bearing", "shaft"] });
  assert.equal(grid.ok, true);
  assert.deepEqual(grid.windows.map((w) => w.status), ["ok", "ok", "missing"]);
  const [p, now] = grid.windows;
  assert.ok(p.status === "ok" && now.status === "ok");
  assert.deepEqual(p.subsystem.absent, ["bearing"]);
  assert.ok("collapsed" in now.supersystem);
  assert.deepEqual(now.supersystem.collapsed, ["motor", "bearing", "housing"]);
  assert.deepEqual(grid.changes, [{ from: "past", to: "present", addedBoxes: ["bearing"], removedBoxes: [] }]);
});

test("9 windows fail closed: unknown ids, ambiguous port names, mistyped snapshots", () => {
  const m = example("bearing-heat");
  assert.match(errors(restrict(m, ["ghost"])), /unknown box 'ghost'/);
  assert.match(errors(restrict(m, [])), /empty box set/);
  const clash: FunctionModel = {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "req" }],
    boxes: [
      { id: "a.b", name: "x", role: "tool", outputs: [{ id: "c", carrier: "c" }] },
      { id: "a", name: "y", role: "tool", outputs: [{ id: "b.c", carrier: "c" }] },
    ],
    wires: [],
  };
  assert.match(errors(collapse(clash, ["a.b", "a"], { id: "s", name: "S", role: "tool" })), /port name 'a.b.c' is ambiguous/);
  const bad = structuredClone(m);
  bad.wires[0].carrier = "heat";
  const grid = nineWindows({ present: bad, subsystem: ["shaft"] });
  assert.equal(grid.ok, false);
  assert.equal(grid.windows[1].status, "invalid");
});

test("property: constructions on generated models type-check, and restriction composes", () => {
  let applied = 0, segmentRoundTrips = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(40_000 + seed);
    const m = genModel(r);
    const boxIds = m.boxes.map((b) => b.id);
    const results: Array<{ ok: boolean; model?: FunctionModel; errors?: string[] }> = [];

    const splittable = m.boxes.filter((b) => ports(b).length >= 2);
    if (splittable.length) {
      const b = pick(r, splittable);
      const ps = shuffle(r, ports(b)), cut = int(r, 1, ps.length - 1);
      const s = segment(m, { box: b.id, parts: [{ id: "part one", ports: ps.slice(0, cut) }, { id: "part two", ports: ps.slice(cut) }] });
      results.push(s);
      // Without a self-loop, collapsing the parts gives back the original shape.
      if (s.ok && !m.wires.some((w) => w.from.box === b.id && w.to.box === b.id)) {
        const back = collapse(s.model, ["part one", "part two"], { id: b.id, name: b.name, role: b.role });
        assert.ok(back.ok, `seed ${seed}`);
        const iso = findIsomorphism(m, back.model);
        assert.ok(iso.ok && iso.decided && iso.isomorphic, `seed ${seed}: segment then collapse is not isomorphic`);
        segmentRoundTrips++;
      }
    }
    if (m.wires.length) {
      const i = interpose(m, { wire: pick(r, m.wires).id, mediator: { id: "mediator ⟨new⟩", name: "M" } });
      results.push(i);
      // With inherited ratings, reachability and harm-loop membership among original boxes are unchanged.
      if (i.ok) {
        const strip = (xs: Iterable<string>) => [...xs].filter((x) => x !== "mediator ⟨new⟩").sort();
        for (const b of boxIds) assert.deepEqual(strip(reach(i.model, b)), strip(reach(m, b)), `seed ${seed}`);
        const loops = (x: FunctionModel) => harmLoops(x).map((l) => JSON.stringify(strip(l.boxes))).sort();
        assert.deepEqual(loops(i.model), loops(m), `seed ${seed}`);
      }
    }
    const t = trimCandidates(m, [pick(r, boxIds)]);
    if (t.ok && t.verdict === "typed-feasible") results.push(applyTrim(m, { trim: t.trim }));
    const group = shuffle(r, boxIds).slice(0, int(r, 1, boxIds.length));
    const c = collapse(m, group, { id: "black box", name: "B", role: "tool" });
    if (c.ok || !/ambiguous/.test(errors(c))) results.push(c);

    for (const x of results) {
      assert.ok(x.ok, `seed ${seed}: ${x.errors?.join("; ")}`);
      assert.deepEqual(checkModel(x.model!), { ok: true, errors: [] }, `seed ${seed}`);
      applied++;
    }

    const A = shuffle(r, boxIds).slice(0, int(r, 1, boxIds.length));
    const B = shuffle(r, A).slice(0, int(r, 1, A.length));
    const ra = restrict(m, A), rb = restrict(m, B);
    assert.ok(ra.ok && rb.ok);
    const rab = restrict(ra.model, B);
    assert.ok(rab.ok);
    assert.deepEqual(rab.model, rb.model, `seed ${seed}`);
  }
  assert.ok(applied > 500, `only ${applied} constructions exercised`);
  assert.ok(segmentRoundTrips > 100, `only ${segmentRoundTrips} segment round trips exercised`);
});

test("kernel construction tools answer over the shared spec", async () => {
  const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
  const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);
  const seg = await call("triz_transform", { model: example("bearing-heat"), transformation: { op: "segment", box: "bearing", parts: [{ id: "a", ports: ["race", "preload-in"] }, { id: "b", ports: ["friction"] }] } });
  assert.equal(seg.ok, true);
  const trim = await call("triz_transform", { model: example("software-cache"), transformation: { op: "trim", trim: ["redis"] } });
  assert.deepEqual(trim.chosen.map((c: { box: string }) => c.box), ["app"]);
  const bad = await call("triz_transform", { model: example("bearing-heat"), transformation: { op: "rewrite", delete: { boxes: ["bearing"] } } });
  assert.equal(bad.ok, false);
  const compared = await call("triz_function_model", { model: example("connection-pool"), compare_to: example("bearing-heat") });
  assert.equal(compared.comparison.isomorphism.isomorphic, true);
  assert.equal(specs.triz_isomorphic, undefined);
  const grid = await call("triz_nine_windows", { present: example("software-cache"), subsystem: ["app", "redis"] });
  assert.equal(grid.ok, true);
  const sep = await call("triz_separate", { contradiction: example("bearing-heat").contradictions![0], along: "time" });
  assert.equal(sep.along.verdict, "dynamizable");
});

test("9 windows: the default collapsed id avoids a box already named 'system'; an explicit clash fails closed", () => {
  const m: FunctionModel = {
    domain: "physical",
    carriers: [{ id: "c", layer: "energy", dimension: "W" }],
    boxes: [
      { id: "engine", name: "Engine", role: "tool", outputs: [{ id: "o", carrier: "c" }] },
      { id: "system", name: "Customer system", role: "product", inputs: [{ id: "i", carrier: "c" }] },
    ],
    wires: [{ id: "w", from: { box: "engine", port: "o" }, to: { box: "system", port: "i" }, carrier: "c", polarity: "useful" }],
  };
  const grid = nineWindows({ present: m, subsystem: ["engine"] });
  assert.equal(grid.ok, true);
  assert.equal(grid.systemId, "system-2");
  const now = grid.windows[1];
  assert.ok(now.status === "ok" && "collapsed" in now.supersystem);
  assert.deepEqual(now.supersystem.boxes, ["system", "system-2"]);
  const explicit = nineWindows({ present: m, subsystem: ["engine"], system: { id: "system" } });
  assert.equal(explicit.ok, false);
  assert.match(JSON.stringify(explicit.windows[1]), /box id 'system' is not fresh/);
});

test("segment then compare: box_map keeps a split product's deliverables from reading as lost", async () => {
  const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
  const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);
  const base = example("bearing-heat");
  const split = segment(base, { box: "shaft", parts: [{ id: "journal", ports: ["support", "heat-in", "expansion"] }, { id: "coupling", ports: ["drive"] }] });
  assert.ok(split.ok);
  assert.equal(split.deliverableKeysChanged, true);
  assert.match(split.note, /box_map/);
  const naive = await call("triz_function_model", { model: split.model, compare_to: base });
  assert.equal(naive.comparison.verdict, "concept-loses-functions");
  const mapped = await call("triz_function_model", { model: split.model, compare_to: base, box_map: split.boxMap });
  assert.deepEqual([mapped.comparison.verdict, mapped.comparison.lostDeliverables, mapped.comparison.gainedDeliverables], ["equal", [], []]);
  assert.deepEqual(mapped.comparison.boxMap, { journal: "shaft", coupling: "shaft" });

  const taken = takeOut(base, { box: "shaft", ports: ["heat-in"], part: { id: "skin" } });
  assert.ok(taken.ok && taken.deliverableKeysChanged);
  const viaTake = await call("triz_function_model", { model: taken.model, compare_to: base, box_map: taken.boxMap });
  assert.deepEqual(viaTake.comparison.lostDeliverables, []);
  const notProduct = segment(base, { box: "bearing", parts: [{ id: "a", ports: ["race", "preload-in"] }, { id: "b", ports: ["friction"] }] });
  assert.ok(notProduct.ok && !notProduct.deliverableKeysChanged);

  assert.deepEqual((await call("triz_function_model", { model: split.model, box_map: split.boxMap })).errors, ["box_map needs compare_to"]);
  const bad = await call("triz_function_model", { model: split.model, compare_to: base, box_map: { ghost: "shaft", journal: "nowhere" } });
  assert.deepEqual(bad.errors, ["box_map: 'ghost' is not a box of the concept model", "box_map: 'nowhere' is not a box of the baseline (compare_to)"]);
});

test("applied trim reads absorber choices as own keys: a wire named 'constructor' is not misread", () => {
  const m: FunctionModel = {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "req" }],
    boxes: [
      { id: "cache", name: "Cache", role: "mediator", outputs: [{ id: "o", carrier: "c" }] },
      { id: "db", name: "DB", role: "mediator", outputs: [{ id: "o", carrier: "c" }] },
      { id: "app", name: "App", role: "product", inputs: [{ id: "i", carrier: "c" }] },
    ],
    wires: [{ id: "constructor", from: { box: "cache", port: "o" }, to: { box: "app", port: "i" }, carrier: "c", polarity: "useful" }],
  };
  const r = applyTrim(m, { trim: ["cache"], absorb: {} });
  assert.ok(r.ok, r.ok ? "" : r.errors.join());
  assert.deepEqual(r.chosen, [{ wire: "constructor", box: "db", port: "o", rule: "C", defaulted: true }]);
});
