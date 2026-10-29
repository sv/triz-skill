/**
 * Abstraction between a detailed and a coarse model of one system: the four checks (total, typed,
 * wires, harm loops), each failing on what it names; a segment mapped back onto its box; a coarse
 * loop no detailed loop maps onto; forgotten, hidden, and left-out functions; feasibility amounts
 * read through the coarse carriers' levels; and, over generated models, that a collapse with its
 * induced map always passes the total, typed, and wires checks and preserves reachability.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { type FunctionModel } from "../src/act.js";
import { checkAbstraction, type AbstractionMap } from "../src/act-abstraction.js";
import { collapse } from "../src/act-windows.js";
import { segment } from "../src/act-rewrite.js";
import { toolSpecs } from "../src/tools.js";
import { example, box, withLevels } from "./support/bearing.js";
import { rng, genModel, int, shuffle } from "./support/gen.js";

const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (args: unknown) => JSON.parse((await specs.triz_abstraction.handler(args)).content[0].text);
const identity = (m: FunctionModel) => Object.fromEntries(m.boxes.map((b) => [b.id, b.id]));
type Result = Extract<ReturnType<typeof checkAbstraction>, { ok: true }>;
const decided = (r: ReturnType<typeof checkAbstraction>): Result => {
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
  return r;
};

/** The bearing segmented into two parts, the parts mapped back onto the bearing. */
function segmented(parts: string[][]) {
  const s = segment(example("bearing-heat"), { box: "bearing", parts: parts.map((ports, i) => ({ id: `part-${i}`, ports })) });
  assert.ok(s.ok);
  return { detailed: s.model, map: { boxes: { ...identity(s.model), ...s.boxMap } } };
}

test("the bearing with feasibility maps onto the bearing with behaviour: an abstraction, and the housing's cheap row reads as unsupported", async () => {
  const detailed = example("bearing-heat-feasibility"), coarse = withLevels(example("bearing-heat-behavior"));
  const r = await call({ detailed, coarse, map: { boxes: identity(detailed) } });
  assert.equal(r.verdict, "abstraction");
  assert.deepEqual(r.failed, []);
  assert.deepEqual(r.checks.typed.basis, ["typed_restrict", "typed_map"]);
  assert.deepEqual(r.reachability, { preserved: true, basis: ["reach_map"], note: r.reachability.note });
  assert.deepEqual(r.checks.harmLoops.loops[0].images.map((i: { coarse: string; detailed: string; basis: string[] }) => [i.coarse, i.detailed, i.basis]),
    [["w-heat", "w-heat", ["cycle_map"]], ["w-preload", "w-preload", ["cycle_map"]]]);
  assert.equal(r.map.defaultedPorts.length, 10, "every port maps by id");
  // Numeric to qualitative across the map: the shaft's 2500 N and the bearing's 3000 N read as supported; the housing's 400 N does not.
  assert.equal(r.levels.consistent, false);
  assert.deepEqual(r.levels.boxes.map((b: { box: string; checked: number }) => [b.box, b.checked]), [["shaft", 1], ["bearing", 1], ["housing", 2]]);
  assert.deepEqual(r.levels.inconsistencies.map((i: { box: string; row: number; kind: string; outputs: unknown; declared: unknown }) => [i.box, i.row, i.kind, i.outputs, i.declared]),
    [["housing", 0, "value-mismatch", [{ port: "bore", amount: 400, value: "unsupported" }], [{ bore: "supported" }]]]);
  assert.deepEqual(r.levels.basis, ["level_monotone", "level_gc", "level_band"]);
});

test("a segment's parts map back onto the box: each coarse harm loop is the image of a detailed one, with the detailed cycle", () => {
  const { detailed, map } = segmented([["preload-in", "friction"], ["race"]]);
  const r = decided(checkAbstraction(detailed, example("bearing-heat"), map));
  assert.equal(r.verdict, "abstraction");
  const images = r.checks.harmLoops.loops[0].images;
  assert.deepEqual(images.map((i) => ("cycle" in i ? i.cycle : null)), [["part-0", "shaft", "part-0"], ["shaft", "part-0", "shaft"]]);
  assert.deepEqual(r.detailedLoops.map((l) => [l.wire, l.status]), [["w-heat", "image"], ["w-preload", "image"]]);
  assert.deepEqual(r.coarseWithoutPreimage, []);
});

test("a coarse harm loop that no detailed loop maps onto fails the harm-loop check", () => {
  // The friction comes from a part the preload never reaches: in the detailed model the heat closes no loop.
  const { detailed, map } = segmented([["preload-in", "race"], ["friction"]]);
  const r = decided(checkAbstraction(detailed, example("bearing-heat"), map));
  assert.equal(r.verdict, "not-an-abstraction");
  assert.deepEqual(r.failed, ["harmLoops"]);
  assert.deepEqual(r.checks.harmLoops.errors, ["coarse harm loop [bearing, shaft] through 'w-heat' is not the image of a detailed harm loop: its preimage 'w-heat' lies on no loop of the detailed model"]);
  assert.deepEqual(r.detailedLoops.map((l) => [l.wire, l.status]), [["w-preload", "image"]]);
  assert.ok(r.checks.total.ok && r.checks.typed.ok && r.checks.wires.ok);
});

test("a detailed loop through a box left out does not back the coarse loop", () => {
  // The heat returns to the bearing only through a cooling jacket the map leaves out.
  const detailed = example("bearing-heat");
  detailed.carriers.push({ id: "coolant", layer: "material", dimension: "L/min" });
  detailed.boxes.push({ id: "jacket", name: "Cooling jacket", role: "mediator", inputs: [{ id: "warm", carrier: "heat" }], outputs: [{ id: "back", carrier: "preload" }] });
  box(detailed, "shaft").outputs!.push({ id: "conduct", carrier: "heat" });
  detailed.wires = detailed.wires.filter((w) => w.id !== "w-preload").concat(
    { id: "w-conduct", from: { box: "shaft", port: "conduct" }, to: { box: "jacket", port: "warm" }, carrier: "heat", polarity: "useful" },
    { id: "w-back", from: { box: "jacket", port: "back" }, to: { box: "bearing", port: "preload-in" }, carrier: "preload", polarity: "harmful" },
  );
  const map = { boxes: { motor: "motor", shaft: "shaft", bearing: "bearing", housing: "housing", air: "air" } };
  const r = decided(checkAbstraction(detailed, example("bearing-heat"), map));
  assert.deepEqual(r.unmappedBoxes, ["jacket"]);
  assert.deepEqual(r.functions.outside, ["w-conduct", "w-back"]);
  assert.deepEqual(r.functions.outsideHarms, ["w-back"]);
  assert.ok(!r.checks.wires.ok, "the coarse w-preload has no preimage");
  assert.match(r.checks.harmLoops.errors.join(), /through 'w-heat' is not the image of a detailed harm loop: its preimage 'w-heat' lies on a detailed harm loop only through functions the abstraction forgets or leaves out/);
});

test("total, typed, and wires each fail on what they name", () => {
  const base = example("bearing-heat");
  const run = (edit: (coarse: FunctionModel, map: AbstractionMap) => void, detailed = example("bearing-heat")) => {
    const coarse = example("bearing-heat"), map: AbstractionMap = { boxes: identity(detailed) };
    edit(coarse, map);
    return decided(checkAbstraction(detailed, coarse, map));
  };
  // A mapped function with no image: total.
  const lost = run((c) => { c.wires = c.wires.filter((w) => w.id !== "w-support"); });
  assert.deepEqual(lost.failed, ["total"]);
  assert.match(lost.checks.total.errors.join(), /function 'w-support' \(bearing.race → shaft.support, useful\) maps to bearing.race → shaft.support, where the coarse model has no function/);
  // A coarse function with no preimage: wires.
  const extra = run((c) => { c.wires.push({ id: "w-extra", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful" }); });
  assert.deepEqual(extra.failed, ["wires"]);
  assert.match(extra.checks.wires.errors.join(), /coarse function 'w-extra' \(housing.bore → shaft.support, useful\) is the image of no mapped detailed function/);
  // A different polarity class: no image of the same class either way, and the coarse loop loses a negative function.
  const rerated = run((c) => { c.wires.find((w) => w.id === "w-heat")!.polarity = "useful"; });
  assert.deepEqual(rerated.failed, ["total", "wires"]);
  assert.match(rerated.checks.total.errors.join(), /only 'w-heat' \(heat, useful\): no function of carrier 'heat' in the negative class/);
  assert.match(rerated.checks.wires.errors.join(), /its preimages 'w-heat' \(harmful\) are negative/);
  // Excessive is in the negative class, so rating the heat excessive at the coarse level still maps.
  assert.equal(run((c) => { c.wires.find((w) => w.id === "w-heat")!.polarity = "excessive"; }).verdict, "abstraction");
  // A port onto the wrong side, and a carrier onto another carrier: typed.
  const side = run((_, m) => { m.ports = { bearing: { race: "preload-in" } }; });
  assert.ok(side.failed.includes("typed"));
  assert.match(side.checks.typed.errors.join(), /port 'bearing.race' is an output, but its image 'bearing.preload-in' is an input/);
  const carrierMap = run((_, m) => { m.carriers = { heat: "preload" }; });
  assert.ok(carrierMap.failed.includes("typed"));
  assert.match(carrierMap.checks.typed.errors.join(), /port 'bearing.friction' carries 'heat', whose image is 'preload', but its image port 'bearing.friction' carries 'heat'/);
  assert.equal(carrierMap.checks.typed.basis, undefined, "no typing basis is cited when typing fails");
  const layer = run((c) => { c.carriers.find((x) => x.id === "heat")!.layer = "information"; });
  assert.match(layer.checks.typed.errors.join(), /carrier 'heat' \(energy\) maps to 'heat' \(information\): the layers differ/);
  // A mapped port whose carrier has no image: total.
  const renamed = structuredClone(base);
  renamed.carriers.find((c) => c.id === "heat")!.id = "thermal";
  for (const b of renamed.boxes) for (const p of [...(b.inputs ?? []), ...(b.outputs ?? [])]) if (p.carrier === "heat") p.carrier = "thermal";
  for (const w of renamed.wires) if (w.carrier === "heat") w.carrier = "thermal";
  const unmapped = run(() => {}, renamed);
  assert.match(unmapped.checks.total.errors.join(), /port 'bearing.friction' maps to 'bearing.friction', but its carrier 'thermal' has no image: add it to map.carriers/);
  assert.equal(run((_, m) => { m.carriers = { thermal: "heat" }; }, renamed).verdict, "abstraction");
});

test("forgotten and hidden functions are listed, harms apart, and reachability is claimed only when nothing is forgotten", () => {
  const detailed = example("bearing-heat");
  detailed.carriers.push({ id: "vibration", layer: "energy", dimension: "mm/s" }, { id: "spacing", layer: "material", dimension: "mm" });
  box(detailed, "motor").outputs!.push({ id: "shake", carrier: "vibration" });
  box(detailed, "housing").inputs = [{ id: "mount", carrier: "vibration" }];
  detailed.wires.push({ id: "w-vibrate", from: { box: "motor", port: "shake" }, to: { box: "housing", port: "mount" }, carrier: "vibration", polarity: "harmful" });
  const s = segment(detailed, { box: "bearing", parts: [{ id: "races", ports: ["preload-in", "friction"] }, { id: "balls", ports: ["race"] }] });
  assert.ok(s.ok);
  box(s.model, "races").outputs!.push({ id: "guide", carrier: "spacing" });
  box(s.model, "balls").inputs = [{ id: "guided", carrier: "spacing" }];
  s.model.wires.push({ id: "w-guide", from: { box: "races", port: "guide" }, to: { box: "balls", port: "guided" }, carrier: "spacing", polarity: "useful" });
  const r = decided(checkAbstraction(s.model, example("bearing-heat"), { boxes: { ...identity(s.model), ...s.boxMap } }));
  assert.equal(r.verdict, "abstraction");
  assert.deepEqual(r.functions.hidden, [{ wire: "w-guide", inside: "bearing" }]);
  assert.deepEqual(r.functions.forgotten, ["w-vibrate"]);
  assert.deepEqual(r.functions.forgottenHarms, ["w-vibrate"]);
  assert.equal(r.reachability.preserved, false);
  assert.match(r.note, /does not show 'w-vibrate', harmful or excessive in the detailed model/);
});

test("malformed maps and ill-typed models fail closed", async () => {
  const m = example("bearing-heat");
  const errs = async (args: unknown) => { const r = await call(args); assert.equal(r.ok, false); return r.errors.join("; "); };
  assert.match(await errs({ detailed: m, coarse: m, map: { boxes: {} } }), /map.boxes is empty/);
  assert.match(await errs({ detailed: m, coarse: m, map: { boxes: { ghost: "shaft", shaft: "nowhere" } } }), /'ghost' is not a box of the detailed model.*'nowhere' is not a box of the coarse model/);
  assert.match(await errs({ detailed: m, coarse: m, map: { boxes: { shaft: "shaft" }, ports: { motor: { "shaft-out": "shaft-out" } } } }), /map.ports: box 'motor' is not mapped in map.boxes/);
  assert.match(await errs({ detailed: m, coarse: m, map: { boxes: { shaft: "shaft" }, ports: { shaft: { drive: "ghost", nope: "drive" } } } }), /coarse box 'shaft' has no port 'ghost'.*box 'shaft' has no port 'nope'/);
  assert.match(await errs({ detailed: m, coarse: m, map: { boxes: { shaft: "shaft" }, carriers: { ghost: "heat", heat: "ghost" } } }), /'ghost' is not a carrier of the detailed model.*'ghost' is not a carrier of the coarse model/);
  const bad = example("bearing-heat-behavior");
  box(bad, "motor").behavior![0].out["shaft-out"] = "stalled";
  assert.match(await errs({ detailed: bad, coarse: m, map: { boxes: { shaft: "shaft" } } }), /^detailed: box 'motor' behavior row 0: value 'stalled' of port 'shaft-out' is not declared by carrier 'torque'/);
  assert.match(await errs({ detailed: m, coarse: bad, map: { boxes: { shaft: "shaft" } } }), /^coarse: box 'motor'/);
});

test("property: a collapse with its induced map passes total, typed, and wires, and preserves reachability", () => {
  const r = rng(20261029);
  let checked = 0;
  for (let n = 0; n < 150; n++) {
    const m = genModel(r);
    const group = shuffle(r, m.boxes.map((b) => b.id)).slice(0, int(r, 1, Math.max(1, m.boxes.length - 1)));
    const c = collapse(m, group, { id: "collapsed", name: "Collapsed", role: "tool" });
    if (!c.ok || m.boxes.some((b) => b.id === "collapsed")) continue;
    const kept = new Set([...(box(c.model, "collapsed").inputs ?? []), ...(box(c.model, "collapsed").outputs ?? [])].map((p) => p.id));
    const map: AbstractionMap = {
      boxes: Object.fromEntries(m.boxes.map((b) => [b.id, group.includes(b.id) ? "collapsed" : b.id])),
      ports: Object.fromEntries(group.map((g) => [g, Object.fromEntries([...(box(m, g).inputs ?? []), ...(box(m, g).outputs ?? [])].filter((p) => kept.has(`${g}.${p.id}`)).map((p) => [p.id, `${g}.${p.id}`]))])),
    };
    const a = decided(checkAbstraction(m, c.model, map));
    assert.ok(a.checks.total.ok && a.checks.typed.ok && a.checks.wires.ok, `${a.checks.total.errors} ${a.checks.typed.errors} ${a.checks.wires.errors}`);
    assert.deepEqual(a.functions.forgotten, []);
    assert.deepEqual(a.functions.hidden.map((h) => h.wire).sort(), [...c.hidden].sort());
    assert.equal(a.reachability.preserved, true);
    checked++;
  }
  assert.ok(checked > 100, `only ${checked} collapses checked`);
});
