/**
 * Levels: numeric amounts read as declared values. Typing of levels (fail closed), the reading as
 * a Galois connection over random thresholds (level_gc, level_band), the consistency of feasibility
 * rows with behaviour rows in one model (triz_feasibility), and acceptable sets taken from
 * thresholds in triz_weakness, which must rank exactly as the hand-written value lists do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkModel, type FunctionModel } from "../src/act.js";
import { levelOf, bandOf, thresholdValues, levelsConsistency, type Levels } from "../src/act-levels.js";
import { weaknessRanking } from "../src/act-behavior.js";
import { toHypergraph, fromHypergraph } from "../src/act-export.js";
import { toolSpecs } from "../src/tools.js";
import { example, box, carrier, withLevels, bearingWithRows, RADIAL_LEVELS } from "./support/bearing.js";
import { rng, int } from "./support/gen.js";

const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);
const errors = (r: { ok: boolean; errors?: string[] }) => (r.ok ? "" : r.errors!.join("; "));

test("levels typing fails closed: values required and declared, once each, from 0, strictly increasing", () => {
  const broken = (levels: Levels, values?: string[]) => {
    const m = example("bearing-heat-behavior");
    const c = carrier(m, "radial-load");
    c.levels = levels;
    if (values === undefined) delete c.values; else c.values = values;
    return checkModel(m).errors.join("; ");
  };
  assert.deepEqual(checkModel(withLevels(example("bearing-heat-behavior"))), { ok: true, errors: [], issues: [] });
  assert.match(broken(RADIAL_LEVELS), /carrier 'radial-load' declares levels without values/);
  assert.match(broken([{ value: "unsupported", from: 0 }, { value: "held", from: 10 }], ["supported", "unsupported"]), /level value 'held' is not declared in values/);
  assert.match(broken([{ value: "unsupported", from: 0 }, { value: "unsupported", from: 10 }], ["supported", "unsupported"]), /level value 'unsupported' is listed twice/);
  assert.match(broken([{ value: "unsupported", from: 5 }, { value: "supported", from: 10 }], ["supported", "unsupported"]), /the first level \('unsupported'\) must start at 0, so that every amount reads as a value; it starts at 5/);
  assert.match(broken([{ value: "unsupported", from: 0 }, { value: "supported", from: 0 }], ["supported", "unsupported"]), /levels must increase: 'supported' from 0 does not exceed 'unsupported' from 0/);
  // The levels order the values; the values array need not.
  assert.deepEqual(carrier(example("bearing-heat-behavior"), "radial-load").values, ["supported", "unsupported"]);
  // Levels ride on the carrier through the hypergraph export, losslessly.
  const levelled = bearingWithRows();
  const back = fromHypergraph(toHypergraph(levelled));
  assert.ok(back.ok);
  assert.deepEqual(back.model, levelled);
});

test("property: reading amounts through increasing thresholds from 0 is a Galois connection, each amount in its band", () => {
  const r = rng(4242);
  for (let n = 0; n < 300; n++) {
    let from = 0;
    const levels: Levels = Array.from({ length: int(r, 1, 5) }, (_, i) => ({ value: `v${i}`, from: i === 0 ? 0 : (from += int(r, 1, 30)) }));
    const index = (v: string) => levels.findIndex((l) => l.value === v);
    for (let k = 0; k < 20; k++) {
      const a = int(r, 0, from + 40) + (r() < 0.5 ? 0.5 : 0);
      const read = levelOf(levels, a);
      // level_gc: an amount reaches a value's threshold iff it reads as that value or above.
      levels.forEach((l, i) => assert.equal(l.from <= a, i <= index(read), `${a} against ${JSON.stringify(levels)}`));
      // level_band: the amount lies in the band of the value it reads as.
      const band = bandOf(levels, read);
      assert.ok(band.from <= a && (band.below === undefined || a < band.below));
    }
    // A threshold at a declared level gives exactly the values whose bands meet it.
    for (const [i, l] of levels.entries()) {
      const up = thresholdValues({ id: "c", layer: "energy", dimension: "u", values: levels.map((x) => x.value), levels }, { at_least: l.from });
      assert.deepEqual(up.ok && up.values, levels.slice(i).map((x) => x.value));
      const down = thresholdValues({ id: "c", layer: "energy", dimension: "u", values: levels.map((x) => x.value), levels }, { below: l.from });
      assert.deepEqual(down.ok ? down.values : [], levels.slice(0, i).map((x) => x.value));
    }
  }
});

test("triz_feasibility reads each row through the levels: the housing's 400 N row disagrees with its declared behaviour", async () => {
  const m = bearingWithRows();
  const r = await call("triz_feasibility", { model: m });
  assert.equal(r.verdict, "feasible");
  assert.equal(r.levels.consistent, false);
  assert.deepEqual(r.levels.carriers, ["radial-load"]);
  assert.deepEqual(r.levels.boxes.map((b: { box: string; checked: number; silent: number }) => [b.box, b.checked, b.silent]), [["motor", 0, 1], ["shaft", 1, 0], ["bearing", 1, 0], ["housing", 2, 0]]);
  assert.deepEqual(r.levels.inconsistencies.map((i: { box: string; row: number; kind: string }) => [i.box, i.row, i.kind]), [["housing", 0, "value-mismatch"]]);
  assert.match(r.levels.inconsistencies[0].note, /feasibility row 0 of 'housing' provides bore = 400 \('unsupported'\), but the matching behaviour rows of 'housing' give bore = 'supported'/);
  assert.deepEqual(r.levels.basis, ["level_monotone", "level_gc", "level_band"]);
  // Raising the cheap row to 2500 N makes it consistent.
  const fixed = bearingWithRows();
  box(fixed, "housing").feasibility = [{ provides: { bore: 2500 } }];
  assert.equal(levelsConsistency(fixed)!.consistent, true);
  // A row whose required inputs no behaviour row covers: the behaviour says they cannot occur.
  const partial = bearingWithRows();
  const shaft = box(partial, "shaft");
  shaft.behavior = shaft.behavior!.filter((row) => row.in.support === "supported");
  shaft.feasibility = [{ requires: { drive: 10, support: 400 } }];
  const p = levelsConsistency(partial)!;
  assert.deepEqual(p.inconsistencies.map((i) => [i.box, i.kind]), [["shaft", "no-behavior-row"], ["housing", "value-mismatch"]]);
  assert.match(p.inconsistencies[0].note, /works at support = 400 \('unsupported'\), but 'shaft' declares no behaviour row at those input values/);
  // Without levels, or without a box that declares both, nothing is reported.
  assert.equal(levelsConsistency(example("bearing-heat-behavior")), undefined);
  assert.equal((await call("triz_feasibility", { model: example("bearing-heat-feasibility") })).levels, undefined);
});

/** Support concepts over lubrication (the situations), as in weakness.md, with radial-load levels. */
function concept(name: string, ok: (lube: string) => boolean, levels = RADIAL_LEVELS): FunctionModel {
  return {
    domain: "physical",
    carriers: [
      { id: "torque", layer: "energy", dimension: "N·m", values: ["rated"] },
      { id: "radial-load", layer: "energy", dimension: "N radial support", values: ["supported", "unsupported"], levels },
      { id: "lube", layer: "material", dimension: "lubricant film", values: ["oiled", "dry"] },
    ],
    boxes: [
      { id: "motor", name: "Drive motor", role: "tool", outputs: [{ id: "shaft-out", carrier: "torque" }], behavior: [{ in: {}, out: { "shaft-out": "rated" } }] },
      { id: "support", name, role: "mediator", inputs: [{ id: "lube", carrier: "lube" }], outputs: [{ id: "race", carrier: "radial-load" }],
        behavior: ["oiled", "dry"].map((lube) => ({ in: { lube }, out: { race: ok(lube) ? "supported" : "unsupported" } })) },
      { id: "shaft", name: "Shaft", role: "product", inputs: [{ id: "drive", carrier: "torque" }, { id: "support", carrier: "radial-load" }] },
    ],
    wires: [
      { id: "w-drive", from: { box: "motor", port: "shaft-out" }, to: { box: "shaft", port: "drive" }, carrier: "torque", polarity: "useful" },
      { id: "w-support", from: { box: "support", port: "race" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful" },
    ],
  };
}

test("triz_weakness takes acceptable from thresholds through the levels, and ranks exactly as the value lists", async () => {
  const concepts = [{ id: "ball", model: concept("Ball bearing", (l) => l === "oiled") }, { id: "bushing", model: concept("Dry bushing", () => true) }];
  const listed = weaknessRanking(concepts, [{ box: "shaft", port: "drive", values: ["rated"] }, { box: "shaft", port: "support", values: ["supported"] }]);
  const derived = await call("triz_weakness", { concepts, acceptable: [{ box: "shaft", port: "drive", values: ["rated"] }, { carrier: "radial-load", at_least: 2500 }] });
  assert.ok(listed.ok && listed.verdict === "ranked");
  assert.deepEqual(derived.pairs, JSON.parse(JSON.stringify(listed.pairs)));
  assert.deepEqual(derived.concepts, JSON.parse(JSON.stringify(listed.concepts)));
  assert.equal("acceptable" in listed, false, "no threshold, no resolved list");
  assert.deepEqual(derived.acceptable, [
    { box: "shaft", port: "drive", carrier: "torque", values: ["rated"] },
    { box: "shaft", port: "support", carrier: "radial-load", values: ["supported"], threshold: { at_least: 2500, levels: RADIAL_LEVELS }, basis: ["level_gc"] },
  ]);
  // A port entry takes precedence over a carrier entry; `below` keeps the values under the threshold.
  const below = weaknessRanking(concepts, [{ carrier: "torque", values: ["rated"] }, { carrier: "radial-load", at_least: 2500 }, { box: "shaft", port: "support", below: 2500 }]);
  assert.ok(below.ok && below.verdict === "ranked" && below.acceptable);
  assert.deepEqual(below.acceptable.map((a) => a.values), [["rated"], ["unsupported"]]);
  // With only an unsupported shaft acceptable, the ball bearing admits the dry situation and the always-supporting bushing none.
  assert.equal(below.pairs[0].order, "first-weaker");
  assert.deepEqual(below.concepts.map((c) => [c.id, c.admitted]), [["ball", 1], ["bushing", 0]]);
});

test("thresholds fail closed: inside a band, without levels, read differently across concepts, or ill-formed entries", () => {
  const a = concept("A", () => true), b = concept("B", () => true);
  const two = [{ id: "a", model: a }, { id: "b", model: b }];
  const drive = { box: "shaft", port: "drive", values: ["rated"] };
  assert.match(errors(weaknessRanking(two, [drive, { carrier: "radial-load", at_least: 3000 }])),
    /'shaft.support' in concept 'a': at_least 3000 lies inside the band of 'supported' \(from 2500\) of carrier 'radial-load': it is not a declared threshold.*Declare a level at 3000/);
  assert.match(errors(weaknessRanking(two, [drive, { carrier: "radial-load", below: 0 }])), /no level of carrier 'radial-load' meets below 0: the acceptable set would be empty/);
  assert.match(errors(weaknessRanking(two, [{ carrier: "torque", at_least: 0 }, { carrier: "radial-load", at_least: 2500 }])), /carrier 'torque' declares no levels, so a numeric threshold cannot be read as values/);
  const finer = [{ id: "a", model: a }, { id: "b", model: concept("B", () => true, [{ value: "unsupported", from: 0 }, { value: "supported", from: 1000 }]) }];
  assert.match(errors(weaknessRanking(finer, [drive, { carrier: "radial-load", at_least: 0 }])), /^$/, "at_least 0 reads the same everywhere");
  assert.match(errors(weaknessRanking(finer, [drive, { carrier: "radial-load", below: 2500 }])), /in concept 'b': below 2500 lies inside the band of 'supported'/);
  const shifted = [{ id: "a", model: a }, { id: "b", model: concept("B", () => true, [{ value: "supported", from: 0 }, { value: "unsupported", from: 2500 }]) }];
  assert.match(errors(weaknessRanking(shifted, [drive, { carrier: "radial-load", at_least: 2500 }])), /the threshold reads as \[supported\] in concept 'a' and as \[unsupported\] in concept 'b': the concepts declare different levels for carrier 'radial-load'/);
  assert.match(errors(weaknessRanking(two, [drive, { box: "shaft", port: "support", values: ["supported"], at_least: 2500 }])), /'shaft.support': give values or a threshold \(at_least, below\), not both/);
  assert.match(errors(weaknessRanking(two, [drive, { box: "shaft", port: "support" }])), /'shaft.support': give values or a threshold \(at_least, below\), not neither/);
  assert.match(errors(weaknessRanking(two, [drive, { box: "shaft", carrier: "radial-load", values: ["supported"] }])), /names a deliverable port \(box and port\) or a carrier, not both or neither/);
  assert.match(errors(weaknessRanking(two, [drive, { box: "shaft", values: ["supported"] }])), /an entry that names a port gives both box and port/);
  assert.match(errors(weaknessRanking(two, [drive, { carrier: "lube", values: ["oiled"] }, { carrier: "radial-load", at_least: 2500 }])), /carrier 'lube' is the carrier of no deliverable/);
  assert.match(errors(weaknessRanking(two, [drive, { carrier: "radial-load", at_least: 2500 }, { carrier: "radial-load", at_least: 0 }])), /carrier 'radial-load' is listed twice/);
});

/** The bearing with levels and feasibility rows, its housing bounded by producible rows instead of behaviour. */
function producibleHousing(producible: string[], feasibility?: number[]): FunctionModel {
  const m = bearingWithRows();
  const housing = box(m, "housing");
  delete housing.behavior;
  housing.producible = producible.map((bore) => ({ in: {}, out: { bore } }));
  if (feasibility) housing.feasibility = feasibility.map((n) => ({ provides: { bore: n } }));
  return m;
}
type Lint = { code: string; path: string; severity: string; message: string; hint: string };
const unbacked = (r: { warnings: Lint[] }) => r.warnings.filter((w) => w.code === "unbacked-producible-row");

test("unbacked-producible-row: a producible row no feasibility row reaches through the levels, never changing a verdict", async () => {
  // The housing's rows provide 400 N (unsupported) and 3000 N (supported): both producible rows are reached.
  const both = producibleHousing(["supported", "unsupported"]);
  assert.deepEqual(checkModel(both).errors, []);
  assert.deepEqual(unbacked(await call("triz_function_model", { model: both })), []);
  // Only the 400 N row: nothing reaches supported's threshold (2500 N).
  const weak = producibleHousing(["supported", "unsupported"], [400]);
  const [lint, ...rest] = unbacked(await call("triz_function_model", { model: weak }));
  assert.deepEqual(rest, []);
  const at = weak.boxes.findIndex((b) => b.id === "housing");
  assert.deepEqual([lint.path, lint.severity], [`$.model.boxes[${at}].producible[0]`, "warning"]);
  assert.match(lint.message, /^producible row 0 of 'housing' gives bore = 'supported', but no feasibility row of 'housing' reaches that level at its inputs, read through the carriers' levels \(the most provided: bore = 400, read as 'unsupported'\)$/);
  assert.match(lint.hint, /^Add a feasibility row of 'housing' that provides that level/);
  // Read monotonically, as triz_feasibility reads the rows: 3000 N also provides unsupported, so it backs both.
  assert.deepEqual(unbacked(await call("triz_function_model", { model: producibleHousing(["supported", "unsupported"], [3000]) })), []);
  // Silent without levels on the carrier, and where no feasibility row provides at the port.
  const plain = structuredClone(weak);
  delete carrier(plain, "radial-load").levels;
  assert.deepEqual(unbacked(await call("triz_function_model", { model: plain })), []);
  const silent = structuredClone(weak);
  box(silent, "housing").feasibility = [{ cost: { usd_unit: 1 } }];
  // Lints are of models that type-check, so each of these must.
  for (const m of [weak, plain, silent]) assert.deepEqual(checkModel(m).errors, []);
  assert.deepEqual(unbacked(await call("triz_function_model", { model: silent })), []);

  // The required amounts too: the bearing provides 3000 N only from a high preload.
  const preloaded = bearingWithRows();
  carrier(preloaded, "preload").levels = [{ value: "nominal", from: 0 }, { value: "high", from: 100 }];
  const bearing = box(preloaded, "bearing");
  bearing.producible = bearing.behavior;
  delete bearing.behavior;
  bearing.feasibility = [{ provides: { race: 3000 }, requires: { "preload-in": 150 } }];
  assert.deepEqual(checkModel(preloaded).errors, []);
  const needs = unbacked(await call("triz_function_model", { model: preloaded }));
  assert.deepEqual(needs.map((w) => w.path), [`$.model.boxes[${preloaded.boxes.indexOf(bearing)}].producible[0]`], "the nominal-preload row, not the high one");

  // Never a verdict: triz_behavior gives the same weakest spec with the lint and without it (feasibility is not its input).
  const spec = async (m: FunctionModel) => {
    const { warnings, ...r } = await call("triz_behavior", { model: m, trim: ["bearing"], weakest_spec: true });
    return { r, lints: unbacked({ warnings }).length };
  };
  const [linted, clean] = [await spec(weak), await spec(producibleHousing(["supported", "unsupported"]))];
  assert.deepEqual([linted.lints, clean.lints], [1, 0]);
  assert.deepEqual(linted.r, clean.r);
  assert.equal(linted.r.verdict, "spec");
});
