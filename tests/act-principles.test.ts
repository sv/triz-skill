/**
 * Principle constructions in src/act-principles.ts, plus the trim readings of Principles 6 and 25.
 * Each has a typed result, a mistyped application that fails closed, and its structural property,
 * on the shipped examples and as properties over generated models. The last tests check the
 * classification table in categorical-model.md against data/principles.json.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { FunctionModel, checkModel, harmLoops, idealityProfile, compareIdeality, trimCandidates } from "../src/act.js";
import { applyTrim, mapBoxes } from "../src/act-rewrite.js";
import { restrict } from "../src/act-windows.js";
import { findIsomorphism } from "../src/act-iso.js";
import { merge, rerate, feedback, retarget, reverse, standby, cheapCopy } from "../src/act-principles.js";
import "../src/data.js";
import { principles as lookUpPrinciples } from "../src/core.js";
import { toolSpecs } from "../src/tools.js";
import { rng, genModel, pick } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const errors = (r: { ok: boolean; errors?: string[] }) => (r.ok ? "" : r.errors!.join("; "));
const typedOk = (m: FunctionModel) => assert.deepEqual(checkModel(m), { ok: true, errors: [] });
/** Boxes reachable from `start` along wires, including `start`. */
function reach(m: FunctionModel, start: string): Set<string> {
  const seen = new Set([start]), queue = [start];
  for (let v = queue.shift(); v !== undefined; v = queue.shift()) {
    for (const w of m.wires) if (w.from.box === v && !seen.has(w.to.box)) { seen.add(w.to.box); queue.push(w.to.box); }
  }
  return seen;
}
const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
const normal = (m: FunctionModel) => ({ ...m, boxes: byId(m.boxes), wires: byId(m.wires) });
const loopShape = (m: FunctionModel) => harmLoops(m).map((l) => ({ boxes: l.boxes, negative: l.negative }));
const keys = (m: FunctionModel) => idealityProfile(m).deliverables.map((d) => d.key);
const performs = (m: FunctionModel, box: string) => m.wires.filter((w) => w.from.box === box && w.polarity !== "harmful").map((w) => w.id).sort();

/** Two identical workers between a dispatcher and a sink. */
const workers: FunctionModel = {
  domain: "software",
  carriers: [{ id: "job", layer: "information", dimension: "job" }, { id: "result", layer: "information", dimension: "result" }],
  boxes: [
    { id: "dispatch", name: "Dispatcher", role: "tool", outputs: [{ id: "a", carrier: "job" }, { id: "b", carrier: "job" }] },
    { id: "worker-a", name: "Worker A", role: "mediator", inputs: [{ id: "in", carrier: "job" }], outputs: [{ id: "out", carrier: "result" }], cost: { usd: 5 } },
    { id: "worker-b", name: "Worker B", role: "mediator", inputs: [{ id: "in", carrier: "job" }], outputs: [{ id: "out", carrier: "result" }], cost: { usd: 5 } },
    { id: "sink", name: "Result store", role: "product", inputs: [{ id: "a", carrier: "result" }, { id: "b", carrier: "result" }] },
  ],
  wires: [
    { id: "w-a", from: { box: "dispatch", port: "a" }, to: { box: "worker-a", port: "in" }, carrier: "job", polarity: "useful" },
    { id: "w-b", from: { box: "dispatch", port: "b" }, to: { box: "worker-b", port: "in" }, carrier: "job", polarity: "useful" },
    { id: "w-ra", from: { box: "worker-a", port: "out" }, to: { box: "sink", port: "a" }, carrier: "result", polarity: "useful" },
    { id: "w-rb", from: { box: "worker-b", port: "out" }, to: { box: "sink", port: "b" }, carrier: "result", polarity: "useful" },
  ],
};

/** A heater warming a room; the room reports its temperature on a signal port nobody reads yet. */
const heater: FunctionModel = {
  domain: "physical",
  carriers: [{ id: "heat", layer: "energy", dimension: "W" }, { id: "signal", layer: "information", dimension: "°C reading" }],
  boxes: [
    { id: "heater", name: "Heater", role: "tool", inputs: [{ id: "setpoint", carrier: "signal" }], outputs: [{ id: "out", carrier: "heat" }], cost: { usd: 40 } },
    { id: "room", name: "Room", role: "product", inputs: [{ id: "warm", carrier: "heat" }], outputs: [{ id: "reading", carrier: "signal" }] },
    { id: "outside", name: "Outside air", role: "environment", inputs: [{ id: "loss", carrier: "heat" }] },
  ],
  wires: [{ id: "w-warm", from: { box: "heater", port: "out" }, to: { box: "room", port: "warm" }, carrier: "heat", polarity: "useful" }],
};

const sense = { id: "w-sense", from: { box: "room", port: "reading" }, to: { box: "heater", port: "setpoint" }, carrier: "signal", polarity: "useful" as const };
/** The heater with the room's reading fed back to its setpoint: a control loop. */
function controlled(): FunctionModel {
  const m = structuredClone(heater);
  m.wires.push(sense);
  return m;
}

test("merge (Principle 5): adjacent boxes collapse, internal harms are hidden and listed", () => {
  const m = example("bearing-heat");
  const r = merge(m, { boxes: ["bearing", "shaft"], into: { id: "rotor", name: "Rotor", role: "product" } });
  assert.ok(r.ok, errors(r));
  typedOk(r.model);
  assert.deepEqual([r.reading, r.hidden, r.hiddenHarms, r.deliverableKeysChanged], ["adjacent", ["w-support", "w-heat", "w-preload"], ["w-heat", "w-preload"], true]);
  assert.deepEqual(harmLoops(r.model), []);
  assert.ok(r.basis.includes("reach_quotient"));

  assert.match(errors(merge(m, { boxes: ["bearing", "housing"], into: { id: "x", name: "X" } })), /\[housing\] are not joined to 'bearing'/);
  assert.match(errors(merge(m, { boxes: ["bearing", "shaft"], into: { id: "x", name: "X" } })), /roles \[mediator, product\]: give into.role/);
  assert.match(errors(merge(m, { boxes: ["bearing", "housing"], into: { id: "x", name: "X" }, reading: "identical" })), /\[housing\] differ from 'bearing'/);
  assert.match(errors(merge(m, { boxes: ["bearing"], into: { id: "x", name: "X" } })), /at least two boxes/);
  assert.match(errors(merge(m, { boxes: ["bearing", "ghost", "bearing"], into: { id: "x", name: "X" } })), /unknown box 'ghost'; box 'bearing' listed twice/);
  assert.match(errors(merge(m, { boxes: ["bearing", "shaft"], into: { id: "motor", name: "X", role: "tool" } })), /box id 'motor' is not fresh/);
});

test("declared behaviour: merge lists what it drops, cheap_copy keeps it, reverse will not add an unnamed port", () => {
  const m = example("bearing-heat-behavior");
  const merged = merge(m, { boxes: ["bearing", "shaft"], into: { id: "rotor", name: "Rotor", role: "product" } });
  assert.ok(merged.ok, errors(merged));
  assert.deepEqual([merged.droppedBehavior, merged.model.boxes.find((b) => b.id === "rotor")!.behavior], [["bearing", "shaft"], undefined]);
  const plain = merge(example("bearing-heat"), { boxes: ["bearing", "shaft"], into: { id: "rotor", name: "Rotor", role: "product" } });
  assert.ok(plain.ok);
  assert.deepEqual(plain.droppedBehavior, []);
  const bearing = m.boxes.find((b) => b.id === "bearing")!;
  const copy = cheapCopy(m, { box: "bearing", copy: { cost: { usd_unit: 10 } } });
  assert.ok(copy.ok, errors(copy));
  typedOk(copy.model);
  assert.deepEqual(copy.model.boxes.find((b) => b.id === "bearing")!.behavior, bearing.behavior);
  assert.match(errors(reverse(m, { wire: "w-support", ports: { from: "push", to: "pushed" } })), /box 'shaft' declares behavior: a new port needs a value in every row; .*box 'bearing' declares behavior/);
});

test("merge (Principle 5): identical boxes merge by shape alone, and a merge can close a harm loop", () => {
  const r = merge(workers, { boxes: ["worker-a", "worker-b"], into: { id: "pool", name: "Worker pool" }, reading: "identical" });
  assert.ok(r.ok, errors(r));
  typedOk(r.model);
  const pool = r.model.boxes.find((b) => b.id === "pool")!;
  assert.deepEqual([pool.role, pool.cost, pool.inputs!.map((p) => p.id)], ["mediator", { usd: 10 }, ["worker-a.in", "worker-b.in"]]);
  // Names and actions are labels: renaming one worker does not make them different.
  const renamed = structuredClone(workers);
  Object.assign(renamed.boxes[2], { name: "Something else", action: "compute" });
  assert.ok(merge(renamed, { boxes: ["worker-a", "worker-b"], into: { id: "pool", name: "P" }, reading: "identical" }).ok);
  // The workers are not joined to each other, so they are not adjacent.
  assert.match(errors(merge(workers, { boxes: ["worker-a", "worker-b"], into: { id: "pool", name: "P" } })), /not joined/);

  const loop: FunctionModel = {
    domain: "software",
    carriers: [{ id: "x", layer: "information", dimension: "x" }],
    boxes: ["a", "b", "c"].map((id) => ({ id, name: id, role: id === "a" ? "tool" as const : "mediator" as const, inputs: [{ id: "in", carrier: "x" }], outputs: [{ id: "out", carrier: "x" }] })),
    wires: [
      { id: "w-ab", from: { box: "a", port: "out" }, to: { box: "b", port: "in" }, carrier: "x", polarity: "harmful" },
      { id: "w-ca", from: { box: "c", port: "out" }, to: { box: "a", port: "in" }, carrier: "x", polarity: "useful" },
    ],
  };
  assert.deepEqual(harmLoops(loop), []);
  const closed = merge(loop, { boxes: ["b", "c"], into: { id: "bc", name: "BC" }, reading: "identical" });
  assert.ok(closed.ok, errors(closed));
  assert.deepEqual(closed.newlyLooped, ["w-ab"]);
  assert.deepEqual(harmLoops(closed.model).map((l) => l.boxes), [["a", "bc"]]);
});

test("property: merging the ends of a function keeps typing and maps every path to a path", () => {
  let merged = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(70_000 + seed);
    const m = genModel(r);
    const between = m.wires.filter((w) => w.from.box !== w.to.box);
    if (!between.length) continue;
    const w = pick(r, between);
    const group = [w.from.box, w.to.box];
    const x = merge(m, { boxes: group, into: { id: "merged ⟨new⟩", name: "M", role: "tool" } });
    if (!x.ok && /ambiguous/.test(errors(x))) continue;
    assert.ok(x.ok, `seed ${seed}: ${errors(x)}`);
    typedOk(x.model);
    const q = (b: string) => (group.includes(b) ? "merged ⟨new⟩" : b);
    for (const u of m.boxes) for (const v of reach(m, u.id)) assert.ok(reach(x.model, q(u.id)).has(q(v)), `seed ${seed}: ${u.id} →* ${v} lost`);
    merged++;
  }
  assert.ok(merged > 100, `only ${merged} merges exercised`);
});

test("rerate (Principle 16): slightly less or more keeps every deliverable and may close a harm loop", () => {
  const m = example("software-cache");
  const less = rerate(m, { wire: "w-rows", polarity: "insufficient" });
  assert.ok(less.ok, errors(less));
  typedOk(less.model);
  assert.deepEqual([keys(less.model), less.harmLoops], [keys(m), { created: [], removed: [] }]);
  const c = compareIdeality(m, less.model);
  assert.deepEqual([c.verdict, c.worse], ["baseline-dominates", ["defective"]]);
  assert.match(less.note, /worse unless something else improves/);

  // The cache path is already one harm loop (stale reads), so slightly more Postgres creates none.
  const more = rerate(m, { wire: "w-rows", polarity: "excessive" });
  assert.ok(more.ok);
  assert.deepEqual([more.harmLoops, more.cycle], [{ created: [], removed: [] }, ["postgres", "app", "postgres"]]);
  // A control loop becomes a harm loop once one of its functions is excessive.
  const control = controlled();
  const hot = rerate(control, { wire: "w-warm", polarity: "excessive" });
  assert.ok(hot.ok);
  assert.deepEqual(hot.harmLoops, { created: [["heater", "room"]], removed: [] });
  assert.ok(hot.basis.includes("edge_on_cycle"));

  // Doing less with a cheaper performer is a trade-off, not a loss.
  const cheaper = rerate(m, { wire: "w-rows", polarity: "insufficient", cost: { usd_month: 600, p99_ms: 9 } });
  assert.ok(cheaper.ok);
  typedOk(cheaper.model);
  assert.deepEqual(cheaper.model.boxes.find((b) => b.id === "postgres")!.cost, { usd_month: 600, p99_ms: 9 });
  assert.equal(compareIdeality(m, cheaper.model).verdict, "trade-off");

  assert.match(errors(rerate(m, { wire: "w-stale", polarity: "insufficient" })), /rated 'harmful', not useful/);
  assert.match(errors(rerate(m, { wire: "w-rows", polarity: "harmful" })), /'insufficient' \(slightly less\) or 'excessive'/);
  assert.match(errors(rerate(m, { wire: "ghost", polarity: "excessive" })), /unknown wire 'ghost'/);
});

test("rerate (Principle 23): changing the level of feedback, and only of feedback", () => {
  const hot = rerate(controlled(), { wire: "w-warm", polarity: "excessive" });
  assert.ok(hot.ok);
  const back = rerate(hot.model, { wire: "w-warm", polarity: "useful", reading: "feedback" });
  assert.ok(back.ok, errors(back));
  assert.deepEqual(back.harmLoops, { created: [], removed: [["heater", "room"]] });

  // Lowering the excessive fee keeps the marketplace loop: the harmful markup is still on it.
  const market = example("marketplace-take-rate");
  const fee = rerate(market, { wire: "w-fee", polarity: "useful", reading: "feedback" });
  assert.ok(fee.ok);
  assert.deepEqual([fee.harmLoops, harmLoops(fee.model)[0].negative], [{ created: [], removed: [] }, ["w-markup"]]);

  const bearing = example("bearing-heat");
  assert.match(errors(rerate(bearing, { wire: "w-drive", polarity: "insufficient", reading: "feedback" })), /lies on no cycle \('shaft' does not reach 'motor'\)/);
  assert.match(errors(rerate(bearing, { wire: "w-preload", polarity: "excessive", reading: "feedback" })), /'harmful' to 'excessive' is not such a change/);
  assert.match(errors(rerate(market, { wire: "w-fee", polarity: "excessive", reading: "feedback" })), /already rated 'excessive'/);
});

test("property: re-rating never changes deliverables; insufficient never adds a loop, excessive adds exactly an all-useful cycle", () => {
  let rated = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(71_000 + seed);
    const m = genModel(r);
    const useful = m.wires.filter((w) => w.polarity === "useful");
    if (!useful.length) continue;
    const w = pick(r, useful);
    const less = rerate(m, { wire: w.id, polarity: "insufficient" });
    assert.ok(less.ok, `seed ${seed}: ${errors(less)}`);
    typedOk(less.model);
    assert.deepEqual([keys(less.model), loopShape(less.model).map((l) => l.boxes)], [keys(m), loopShape(m).map((l) => l.boxes)], `seed ${seed}`);
    const more = rerate(m, { wire: w.id, polarity: "excessive" });
    assert.ok(more.ok);
    assert.deepEqual(keys(more.model), keys(m));
    const onLoop = reach(m, w.to.box).has(w.from.box);
    const alreadyHarm = harmLoops(m).some((l) => l.boxes.includes(w.from.box) && l.boxes.includes(w.to.box));
    assert.equal(more.harmLoops.created.length, onLoop && !alreadyHarm ? 1 : 0, `seed ${seed}`);
    assert.deepEqual(more.harmLoops.removed, []);
    rated++;
  }
  assert.ok(rated > 100, `only ${rated} re-ratings exercised`);
});

test("feedback (Principle 23): a function closing a loop, as control or as harm", () => {
  const r = feedback(heater, { wire: sense });
  assert.ok(r.ok, errors(r));
  typedOk(r.model);
  assert.deepEqual([r.cycle, r.loop], [["room", "heater", "room"], "control"]);
  assert.ok(r.basis.includes("edge_on_cycle"));

  const overheating = structuredClone(heater);
  overheating.wires[0].polarity = "excessive";
  const harm = feedback(overheating, { wire: sense });
  assert.ok(harm.ok);
  assert.equal(harm.loop, "harm");
  assert.ok(harm.ok && harm.harmLoop && harm.harmLoop.negative.includes("w-warm"));

  assert.match(errors(feedback(heater, { wire: { ...sense, from: { box: "heater", port: "out" }, to: { box: "outside", port: "loss" }, carrier: "heat" } })), /'outside' does not reach 'heater': the function closes no loop/);
  assert.match(errors(feedback(heater, { wire: { ...sense, carrier: "heat" } })), /^result: wire 'w-sense'/);
  assert.match(errors(feedback(heater, { wire: { ...sense, id: "w-warm" } })), /wire id 'w-warm' is not fresh/);
  assert.match(errors(feedback(heater, { wire: { ...sense, to: { box: "ghost", port: "x" } } })), /unknown box 'ghost'/);
});

test("property: every feedback function lies on its witness cycle", () => {
  let added = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(72_000 + seed);
    const m = genModel(r);
    const outs = m.boxes.flatMap((b) => (b.outputs ?? []).map((p) => ({ box: b.id, port: p.id, carrier: p.carrier })));
    const ins = m.boxes.flatMap((b) => (b.inputs ?? []).map((p) => ({ box: b.id, port: p.id, carrier: p.carrier })));
    const pairs = outs.flatMap((o) => ins.filter((i) => i.carrier === o.carrier && reach(m, i.box).has(o.box)).map((i) => [o, i] as const));
    if (!pairs.length) continue;
    const [o, i] = pick(r, pairs);
    const x = feedback(m, { wire: { id: "feedback ⟨new⟩", from: { box: o.box, port: o.port }, to: { box: i.box, port: i.port }, carrier: o.carrier, polarity: "useful" } });
    assert.ok(x.ok, `seed ${seed}: ${errors(x)}`);
    typedOk(x.model);
    assert.deepEqual([x.cycle[0], x.cycle[1], x.cycle.at(-1)], [o.box, i.box, o.box]);
    for (let k = 1; k + 1 < x.cycle.length; k++) {
      assert.ok(m.wires.some((w) => w.from.box === x.cycle[k] && w.to.box === x.cycle[k + 1]), `seed ${seed}: no wire ${x.cycle[k]} → ${x.cycle[k + 1]}`);
    }
    added++;
  }
  assert.ok(added > 50, `only ${added} feedback functions exercised`);
});

test("retarget (Principle 22): the bearing's friction heat warms another object usefully", () => {
  const m = example("bearing-heat");
  const r = retarget(m, { wire: "w-heat", to: { box: "air", port: "sink" } });
  assert.ok(r.ok, errors(r));
  typedOk(r.model);
  assert.deepEqual([r.used, r.removedHarm, r.gainsDeliverable], ["w-heat", "w-heat", false]);
  const w = r.model.wires.find((x) => x.id === "w-heat")!;
  assert.deepEqual([w.from, w.to, w.polarity], [{ box: "bearing", port: "friction" }, { box: "air", port: "sink" }, "useful"]);
  const before = idealityProfile(m).functions, after = idealityProfile(r.model).functions;
  assert.deepEqual([after.harmful, after.useful], [before.harmful - 1, before.useful + 1]);
  assert.equal(compareIdeality(m, r.model).verdict, "concept-dominates");
  assert.ok(r.basis.includes("typed_retarget"));

  const kept = retarget(m, { wire: "w-heat", to: { box: "air", port: "sink" }, keepHarm: true });
  assert.ok(kept.ok);
  assert.deepEqual([kept.used, kept.removedHarm, idealityProfile(kept.model).functions.harmful], ["w-heat/used", null, before.harmful]);

  // Sent to a product's port, the factor becomes a deliverable.
  const oil = structuredClone(m);
  oil.boxes.push({ id: "oil", name: "Oil bath", role: "product", inputs: [{ id: "warm", carrier: "heat" }] });
  const warmed = retarget(oil, { wire: "w-heat", to: { box: "oil", port: "warm" } });
  assert.ok(warmed.ok);
  assert.equal(warmed.gainsDeliverable, true);
  assert.deepEqual(compareIdeality(oil, warmed.model).better, ["harmful", "deliverables"]);

  assert.match(errors(retarget(m, { wire: "w-support", to: { box: "air", port: "sink" } })), /rated 'useful', not harmful/);
  assert.match(errors(retarget(m, { wire: "w-heat", to: { box: "shaft", port: "heat-in" } })), /harm's own object port/);
  assert.match(errors(retarget(m, { wire: "w-heat", to: { box: "shaft", port: "drive" } })), /^result: wire 'w-heat' to: carrier 'heat' does not match port 'shaft.drive' carrier 'torque'/);
  assert.match(errors(retarget(m, { wire: "w-heat", to: { box: "air", port: "sink" }, keepHarm: true, id: "w-drive" })), /wire id 'w-drive' is not fresh/);
});

test("property: retargeting a harm trades one harmful function for one useful one", () => {
  let moved = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(73_000 + seed);
    const m = genModel(r);
    const harms = m.wires.filter((w) => w.polarity === "harmful");
    if (!harms.length) continue;
    const w = pick(r, harms);
    const targets = m.boxes.flatMap((b) => (b.inputs ?? []).filter((p) => p.carrier === w.carrier && !(b.id === w.to.box && p.id === w.to.port)).map((p) => ({ box: b.id, port: p.id })));
    if (!targets.length) continue;
    const to = pick(r, targets);
    const before = idealityProfile(m).functions;
    const x = retarget(m, { wire: w.id, to });
    assert.ok(x.ok, `seed ${seed}: ${errors(x)}`);
    typedOk(x.model);
    const after = idealityProfile(x.model).functions;
    assert.deepEqual([after.harmful, after.useful], [before.harmful - 1, before.useful + 1], `seed ${seed}`);
    const kept = retarget(m, { wire: w.id, to, keepHarm: true, id: "used ⟨new⟩" });
    assert.ok(kept.ok);
    assert.deepEqual([idealityProfile(kept.model).functions.harmful, idealityProfile(kept.model).functions.useful], [before.harmful, before.useful + 1]);
    moved++;
  }
  assert.ok(moved > 50, `only ${moved} retargets exercised`);
});

test("reverse (Principle 13): performer and object swap, and reversing back undoes it", () => {
  const m = example("software-cache");
  // The cache does not query the service, so the reversal needs ports that are not there: name them.
  assert.match(errors(reverse(m, { wire: "w-lookup" })), /box 'redis' has no output port of carrier 'query': name one in ports.from to add it; box 'app' has no input port of carrier 'query': name one in ports.to to add it/);
  const r = reverse(m, { wire: "w-lookup", ports: { from: "push", to: "pushed" } });
  assert.ok(r.ok, errors(r));
  typedOk(r.model);
  assert.deepEqual(r.addedPorts, ["redis.push", "app.pushed"]);
  const w = r.model.wires.find((x) => x.id === "w-lookup")!;
  assert.deepEqual([w.from, w.to, w.polarity], [{ box: "redis", port: "push" }, { box: "app", port: "pushed" }, "useful"]);
  assert.deepEqual(r.basis, ["typed_delete", "typed_glue", "typed_reverse", "typed_extend"]);
  assert.equal(r.model.wires.length, m.wires.length);

  const moving: FunctionModel = {
    domain: "physical",
    carriers: [{ id: "motion", layer: "energy", dimension: "m/s" }],
    boxes: [
      { id: "tool", name: "Cutter", role: "tool", inputs: [{ id: "in", carrier: "motion" }], outputs: [{ id: "out", carrier: "motion" }] },
      { id: "part", name: "Workpiece", role: "product", inputs: [{ id: "in", carrier: "motion" }], outputs: [{ id: "out", carrier: "motion" }, { id: "spare", carrier: "motion" }] },
    ],
    wires: [{ id: "w-move", from: { box: "tool", port: "out" }, to: { box: "part", port: "in" }, carrier: "motion", polarity: "useful", verb: "move to" }],
  };
  assert.match(errors(reverse(moving, { wire: "w-move" })), /box 'part' has output ports \[out, spare\] of carrier 'motion': name one in ports.from/);
  const once = reverse(moving, { wire: "w-move", ports: { from: "out" } });
  assert.ok(once.ok, errors(once));
  assert.deepEqual(once.addedPorts, []);
  assert.deepEqual(once.basis, ["typed_delete", "typed_glue", "typed_reverse"]);
  const twice = reverse(once.model, { wire: "w-move", ports: once.ports.original });
  assert.ok(twice.ok);
  assert.deepEqual(normal(twice.model), normal(moving));

  assert.match(errors(reverse(moving, { wire: "w-move", ports: { from: "in" } })), /ports.from: port 'part.in' is not an output/);
  const selfLoop = structuredClone(moving);
  selfLoop.wires.push({ id: "w-self", from: { box: "part", port: "spare" }, to: { box: "part", port: "in" }, carrier: "motion", polarity: "useful" });
  assert.match(errors(reverse(selfLoop, { wire: "w-self" })), /self-loop on 'part'/);
  const twoCarriers = structuredClone(moving);
  twoCarriers.carriers.push({ id: "heat", layer: "energy", dimension: "W" });
  twoCarriers.boxes[1].outputs!.push({ id: "hot", carrier: "heat" });
  assert.match(errors(reverse(twoCarriers, { wire: "w-move", ports: { from: "hot" } })), /ports.from: port 'part.hot' carries 'heat', not 'motion'/);
});

test("property: a reversal is the converse of one edge, and reversing back with the original ports is the identity", () => {
  let reversed = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(74_000 + seed);
    const m = genModel(r);
    const box = (id: string) => m.boxes.find((b) => b.id === id)!;
    const candidates = m.wires.filter((w) => w.from.box !== w.to.box
      && (box(w.to.box).outputs ?? []).some((p) => p.carrier === w.carrier)
      && (box(w.from.box).inputs ?? []).some((p) => p.carrier === w.carrier));
    if (!candidates.length) continue;
    const w = pick(r, candidates);
    const from = pick(r, (box(w.to.box).outputs ?? []).filter((p) => p.carrier === w.carrier)).id;
    const to = pick(r, (box(w.from.box).inputs ?? []).filter((p) => p.carrier === w.carrier)).id;
    const x = reverse(m, { wire: w.id, ports: { from, to } });
    assert.ok(x.ok, `seed ${seed}: ${errors(x)}`);
    typedOk(x.model);
    const edge = (y: FunctionModel["wires"][number]) => JSON.stringify([y.id, y.from.box, y.to.box]);
    assert.deepEqual(x.model.wires.map(edge).sort(), m.wires.map((y) => (y.id === w.id ? { ...y, from: y.to, to: y.from } : y)).map(edge).sort(), `seed ${seed}`);
    const back = reverse(x.model, { wire: w.id, ports: x.ports.original });
    assert.ok(back.ok);
    assert.deepEqual(normal(back.model), normal(m), `seed ${seed}`);
    reversed++;
  }
  assert.ok(reversed > 50, `only ${reversed} reversals exercised`);
});

test("standby (Principle 11): a replica covers Postgres, so losing it orphans nothing", () => {
  const m = example("software-cache");
  const blocked = trimCandidates(m, ["postgres"]);
  assert.ok(blocked.ok);
  assert.deepEqual(blocked.orphaned, ["w-rows"]);
  const r = standby(m, { box: "postgres", standby: { id: "replica", name: "Read replica", cost: { usd_month: 300 } } });
  assert.ok(r.ok, errors(r));
  typedOk(r.model);
  assert.deepEqual([r.covers, r.newlyCovered], [["w-rows"], ["w-rows"]]);
  const replica = r.model.boxes.find((b) => b.id === "replica")!;
  assert.deepEqual([replica.role, replica.outputs, replica.inputs], ["mediator", [{ id: "result", carrier: "rows" }], undefined]);
  // Unwired: nothing the original boxes do changes, and only cost rises.
  assert.deepEqual([r.model.wires, loopShape(r.model), keys(r.model)], [m.wires, loopShape(m), keys(m)]);
  const ids = m.boxes.map((b) => b.id);
  assert.ok(restrict(m, ids).ok && restrict(r.model, ids).ok);
  assert.deepEqual((restrict(r.model, ids) as { model: FunctionModel }).model, (restrict(m, ids) as { model: FunctionModel }).model);
  const c = compareIdeality(m, r.model);
  assert.deepEqual([c.verdict, c.worse], ["baseline-dominates", ["cost:usd_month"]]);
  // Losing Postgres is now a typed-feasible trim onto the replica.
  const lost = applyTrim(r.model, { trim: ["postgres"], absorb: { "w-rows": { box: "replica", port: "result" } } });
  assert.ok(lost.ok, errors(lost));

  const bearing = standby(example("bearing-heat"), { box: "bearing", standby: { id: "spare", name: "Spare bearing" } });
  assert.ok(bearing.ok);
  assert.deepEqual([bearing.covers, bearing.newlyCovered], [["w-support"], []]);
  assert.match(errors(standby(example("bearing-heat"), { box: "air", standby: { id: "s", name: "S" } })), /'air' performs no useful function on another box/);
  assert.match(errors(standby(m, { box: "postgres", standby: { id: "redis", name: "S" } })), /box id 'redis' is not fresh/);
  assert.match(errors(standby(m, { box: "ghost", standby: { id: "s", name: "S" } })), /unknown box 'ghost'/);
});

test("property: a standby leaves every original function alone and absorbs every useful one its box performs", () => {
  let covered = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(75_000 + seed);
    const m = genModel(r);
    const performers = m.boxes.filter((b) => m.wires.some((w) => w.from.box === b.id && w.to.box !== b.id && w.polarity !== "harmful"));
    if (!performers.length) continue;
    const b = pick(r, performers);
    const x = standby(m, { box: b.id, standby: { id: "standby ⟨new⟩", name: "S" } });
    assert.ok(x.ok, `seed ${seed}: ${errors(x)}`);
    typedOk(x.model);
    assert.deepEqual([x.model.wires, loopShape(x.model), keys(x.model)], [m.wires, loopShape(m), keys(m)], `seed ${seed}`);
    const t = trimCandidates(x.model, [b.id]);
    assert.ok(t.ok);
    for (const f of t.functions.filter((f) => f.object !== b.id)) assert.ok(f.absorbers.some((a) => a.box === "standby ⟨new⟩"), `seed ${seed}: ${f.wire}`);
    covered++;
  }
  assert.ok(covered > 100, `only ${covered} standbys exercised`);
});

test("cheap copy (Principles 26, 27): same ports, lower cost, and the comparison says so", () => {
  const m = example("bearing-heat");
  const r = cheapCopy(m, { box: "bearing", copy: { cost: { usd_unit: 10, service_h_year: 2 } } });
  assert.ok(r.ok, errors(r));
  typedOk(r.model);
  assert.deepEqual([r.boxMap, r.deliverableKeysChanged, r.costRelief], [{}, false, { usd_unit: 8 }]);
  const c = compareIdeality(m, r.model);
  assert.deepEqual([c.verdict, c.better], ["concept-dominates", ["cost:usd_unit"]]);
  // The wiring shape is the original's: only the declared cost differs.
  const expected = structuredClone(m);
  expected.boxes.find((b) => b.id === "bearing")!.cost = { usd_unit: 10, service_h_year: 2 };
  const iso = findIsomorphism(expected, r.model);
  assert.ok(iso.ok && iso.decided && iso.isomorphic);
  assert.ok(r.basis.includes("cheaper_part_lowers_cost"));

  // A copy of a product under a new id needs the box map to keep its deliverables.
  const priced = structuredClone(m);
  priced.boxes.find((b) => b.id === "shaft")!.cost = { usd_unit: 30 };
  const shaft = cheapCopy(priced, { box: "shaft", copy: { id: "shaft-cast", cost: { usd_unit: 20 } } });
  assert.ok(shaft.ok);
  assert.deepEqual([shaft.boxMap, shaft.deliverableKeysChanged], [{ "shaft-cast": "shaft" }, true]);
  assert.ok(shaft.basis.includes("typed_rename"));
  assert.equal(compareIdeality(priced, shaft.model).verdict, "concept-loses-functions");
  const mapped = mapBoxes(shaft.model, priced, shaft.boxMap);
  assert.ok(mapped.ok);
  assert.equal(compareIdeality(priced, mapped.model).verdict, "concept-dominates");

  assert.match(errors(cheapCopy(m, { box: "bearing", copy: { cost: { usd_unit: 10, service_h_year: 3 } } })), /cost 'service_h_year' rises from 2 to 3/);
  assert.match(errors(cheapCopy(m, { box: "bearing", copy: { cost: { usd_unit: 10, service_h_year: 2, kg: 1 } } })), /cost 'kg' rises from 0 to 1/);
  assert.match(errors(cheapCopy(m, { box: "bearing", copy: { cost: { usd_unit: 18, service_h_year: 2 } } })), /no cost dimension of 'bearing' is lower/);
  assert.match(errors(cheapCopy(m, { box: "shaft", copy: { cost: {} } })), /no cost dimension of 'shaft' is lower/);
  assert.match(errors(cheapCopy(m, { box: "bearing", copy: { id: "housing", cost: { usd_unit: 1 } } })), /box id 'housing' is not fresh/);
});

test("trim readings: Principle 25 is a rule-B absorber, Principle 6 one box performing several functions", () => {
  const m = example("software-cache");
  const self = applyTrim(m, { trim: ["redis"] });
  assert.ok(self.ok);
  assert.deepEqual(self.chosen.map((c) => [c.wire, c.box, c.rule]), [["w-cache", "app", "B"]]);
  const universal = applyTrim(m, { trim: ["redis"], absorb: { "w-cache": { box: "gateway", port: "edge-cache" } } });
  assert.ok(universal.ok);
  assert.deepEqual([universal.chosen[0].rule, performs(m, "gateway"), performs(universal.model, "gateway")], ["C", ["w-route"], ["w-cache", "w-route"]]);
});

test("principle constructions answer over the shared triz_transform spec", async () => {
  const spec = toolSpecs().find((s) => s.name === "triz_transform")!;
  const input = z.object(spec.shape);
  const call = async (model: FunctionModel, transformation: unknown) => {
    const args = input.parse({ model, transformation });
    return JSON.parse((await spec.handler(args)).content[0].text);
  };
  const bearing = example("bearing-heat"), cache = example("software-cache");
  const results = await Promise.all([
    call(bearing, { op: "merge", boxes: ["bearing", "shaft"], into: { id: "rotor", name: "Rotor", role: "product" } }),
    call(cache, { op: "rerate", wire: "w-rows", polarity: "excessive" }),
    call(heater, { op: "feedback", wire: { id: "w-sense", from: { box: "room", port: "reading" }, to: { box: "heater", port: "setpoint" }, carrier: "signal", polarity: "useful" } }),
    call(bearing, { op: "retarget", wire: "w-heat", to: { box: "air", port: "sink" }, keep_harm: true }),
    call(cache, { op: "reverse", wire: "w-lookup", ports: { from: "push", to: "pushed" } }),
    call(cache, { op: "standby", box: "postgres", standby: { id: "replica", name: "Replica" } }),
    call(bearing, { op: "cheap_copy", box: "bearing", copy: { id: "bushing", cost: { usd_unit: 5 } } }),
  ]);
  for (const r of results) assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(results[3].used, "w-heat/used");
  assert.deepEqual(results[6].boxMap, { bushing: "bearing" });
  assert.throws(() => input.parse({ model: bearing, transformation: { op: "cheap_copy", box: "bearing", copy: { cost: { usd_unit: -1 } } } }));
  assert.throws(() => input.parse({ model: bearing, transformation: { op: "merge", boxes: ["bearing"], into: { id: "x", name: "X" } } }));
});

/** Rows of the classification table in categorical-model.md. */
const doc = fs.readFileSync(path.resolve(here, "../skills/triz-innovation/references/categorical-model.md"), "utf8");
/** The triz_principle tool's data, never recalled text. */
const principles = lookUpPrinciples();
const rows = [...doc.matchAll(/^\| (\d+) \| ([^|]+) \| "([^"]+)" \| (structural|parametric|analogy only) \| (.+) \|$/gm)]
  .map(([, id, name, text, kind, why]) => ({ id: Number(id), name: name.trim(), text, kind, why }));

test("the classification table covers all 40 principles with their looked-up text", () => {
  assert.deepEqual(rows.map((r) => r.id), principles.map((p) => p.id));
  for (const r of rows) {
    const p = principles.find((x) => x.id === r.id)!;
    assert.deepEqual([r.name, r.text], [p.name, p.classic], `principle ${r.id}`);
    assert.ok(r.why.length > 20, `principle ${r.id}: no justification`);
  }
});

test("every structural row names an operation triz_transform has", () => {
  const spec = toolSpecs().find((s) => s.name === "triz_transform")!;
  const ops = new Set((spec.shape.transformation as { options: Array<{ shape: { op: { value: string } } }> }).options.map((o) => o.shape.op.value));
  for (const r of rows) {
    const named = [...r.why.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]).filter((n) => ops.has(n));
    if (r.kind === "structural") assert.ok(named.length, `principle ${r.id} is structural but names no operation`);
  }
  const structural = rows.filter((r) => r.kind === "structural").map((r) => r.id);
  assert.deepEqual(structural, [1, 2, 5, 6, 11, 13, 16, 22, 23, 24, 25, 26, 27]);
  assert.deepEqual(rows.filter((r) => r.kind === "parametric").map((r) => r.id), [3, 15, 19, 20, 32, 33, 35]);
  // The disclaimer rule stays next to the table.
  assert.match(doc, /makes the structural part of the principle checkable\. That does not show the\s+principle solves the problem/);
});
