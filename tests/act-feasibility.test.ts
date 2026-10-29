/**
 * Monotone co-design feasibility: typing of feasibility rows (fail closed), the bearing trimmed
 * to the housing with the housing's added load cost, budget verdicts (feasible, over budget with
 * and without a binding dimension, unprovidable, undecided), resource loops solved by Kleene's
 * ascent, the caps, and a brute-force check that the least fixpoint's minimal elements are the
 * minimal feasible row selections on random models.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel, type FeasibilityRow } from "../src/act.js";
import { feasibility, trimFeasibility, MAX_ANTICHAIN, MAX_ITERATIONS } from "../src/act-feasibility.js";
import { segment } from "../src/act-rewrite.js";
import { toolSpecs } from "../src/tools.js";
import { rng, int, genModel } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const bearing = (): FunctionModel => FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, "../examples/function-models/bearing-heat-feasibility.json"), "utf8")));
const box = (m: FunctionModel, id: string) => m.boxes.find((b) => b.id === id)!;
const errors = (r: { ok: boolean; errors?: string[] }) => (r.ok ? "" : r.errors!.join("; "));

/**
 * A pump and a generator in a resource loop: the pump's flow drives the generator, whose power
 * drives the pump. The field (product) needs `demand` L/min. Rows: [provided, required, usd].
 */
function pumpLoop(demand: number, generator: Array<[number, number, number]> = [[6, 8, 2], [12, 15, 4]]): FunctionModel {
  return {
    domain: "physical",
    carriers: [{ id: "power", layer: "energy", dimension: "W" }, { id: "flow", layer: "material", dimension: "L/min" }],
    boxes: [
      { id: "pump", name: "Pump", role: "tool", inputs: [{ id: "power-in", carrier: "power" }], outputs: [{ id: "flow-out", carrier: "flow" }],
        feasibility: [{ provides: { "flow-out": 10 }, requires: { "power-in": 5 }, cost: { usd: 3 } }, { provides: { "flow-out": 20 }, requires: { "power-in": 12 }, cost: { usd: 5 } }] },
      { id: "generator", name: "Generator", role: "tool", inputs: [{ id: "flow-in", carrier: "flow" }], outputs: [{ id: "power-out", carrier: "power" }],
        feasibility: generator.map(([p, q, usd]) => ({ provides: { "power-out": p }, requires: { "flow-in": q }, cost: { usd } })) },
      { id: "field", name: "Field", role: "product", inputs: [{ id: "water", carrier: "flow" }], feasibility: [{ requires: { water: demand } }] },
    ],
    wires: [
      { id: "w-water", from: { box: "pump", port: "flow-out" }, to: { box: "field", port: "water" }, carrier: "flow", polarity: "useful" },
      { id: "w-drive", from: { box: "pump", port: "flow-out" }, to: { box: "generator", port: "flow-in" }, carrier: "flow", polarity: "useful" },
      { id: "w-power", from: { box: "generator", port: "power-out" }, to: { box: "pump", port: "power-in" }, carrier: "power", polarity: "useful" },
    ],
    budget: { usd: 10 },
  };
}

test("feasibility typing fails closed: unknown ports, dominated and repeated rows, unsupplied requirements", () => {
  const broken = (edit: (m: FunctionModel) => void) => { const m = bearing(); edit(m); return checkModel(m).errors.join("; "); };
  assert.deepEqual(checkModel(bearing()), { ok: true, errors: [], issues: [] });
  assert.match(broken((m) => { box(m, "housing").feasibility![0].provides = { ghost: 1 }; }), /box 'housing' feasibility row 0: no output port 'ghost'/);
  assert.match(broken((m) => { box(m, "shaft").feasibility![0].provides = { drive: 1 }; }), /box 'shaft' feasibility row 0: no output port 'drive'/);
  assert.match(broken((m) => { box(m, "shaft").feasibility![0].requires = { expansion: 1 }; }), /box 'shaft' feasibility row 0: no input port 'expansion'/);
  assert.match(broken((m) => { box(m, "housing").feasibility!.push({ provides: { bore: 3000 }, cost: { usd_unit: 25, service_h_year: 1 } }); }),
    /box 'housing' feasibility row 2 is dominated by row 1: it provides no more and needs no less; drop it/);
  const repeated = broken((m) => { box(m, "housing").feasibility!.push({ provides: { bore: 400 } }); });
  assert.match(repeated, /box 'housing' feasibility row 2 repeats row 0: drop one/);
  assert.doesNotMatch(repeated, /row 0 repeats/, "a repeated pair is reported once");
  // Monotone reading: a row that needs nothing and provides 0 is dominated by any row providing more for free.
  assert.match(broken((m) => { box(m, "housing").feasibility!.push({}); }), /row 2 is dominated by row 0/);
  assert.throws(() => FunctionModel.parse({ ...bearing(), boxes: [{ ...box(bearing(), "motor"), feasibility: [] }] }));
  assert.throws(() => FunctionModel.parse({ ...bearing(), boxes: [{ ...box(bearing(), "motor"), feasibility: [{ provides: { "shaft-out": -1 } }] }] }));

  // Harmful functions carry no demand: heat-in is fed only by the bearing's friction heat.
  const harm = bearing();
  box(harm, "shaft").feasibility![0].requires!["heat-in"] = 5;
  assert.match(errors(feasibility(harm)), /box 'shaft' feasibility row 0 requires 5 at input port 'heat-in', but no non-harmful function feeds that port/);
  const zero = bearing();
  box(zero, "shaft").feasibility![0].requires!["heat-in"] = 0;
  assert.equal(feasibility(zero).ok, true, "a zero requirement needs no supplier");
});

test("the bearing as modelled is feasible: fixed costs, the cheapest rows, and the levels the shaft demands", () => {
  const r = feasibility(bearing());
  assert.ok(r.ok && r.verdict === "feasible");
  assert.deepEqual(r.composed, ["motor", "shaft", "bearing", "housing"], "air supplies nothing and declares no feasibility");
  assert.deepEqual(r.fixed, { service_h_year: 2, usd_unit: 178 });
  assert.deepEqual(r.minimal, [{
    resources: { service_h_year: 2, usd_unit: 178 }, operating: { service_h_year: 0, usd_unit: 0 }, overBudget: [],
    rows: [{ box: "motor", row: 0 }, { box: "shaft", row: 0 }, { box: "bearing", row: 0 }, { box: "housing", row: 0 }],
    levels: [{ box: "motor", port: "shaft-out", level: 10 }, { box: "bearing", port: "race", level: 2500 }],
  }]);
  assert.deepEqual(r.basis, ["kleene_lfp", "kleeneStep_upperClosure", "codesign_lfp"]);
});

test("trimming the bearing to the housing: feasible within budget, and the housing's added load cost", () => {
  const r = trimFeasibility(bearing(), { trim: ["bearing"] });
  assert.ok(r.ok && r.verdict === "feasible");
  assert.deepEqual(r.chosen, [{ wire: "w-support", box: "housing", port: "bore", rule: "C", defaulted: true }]);
  assert.deepEqual(r.minimal.map((v) => [v.resources, v.levels]), [[{ service_h_year: 1, usd_unit: 182 }, [{ box: "motor", port: "shaft-out", level: 10 }, { box: "housing", port: "bore", level: 2500 }]]]);
  assert.deepEqual(r.absorbers, [{
    box: "housing", functions: ["w-support"],
    trimmed: [{ row: 1, resources: { usd_unit: 22, service_h_year: 1 } }],
    baseline: [{ row: 0, resources: {} }],
    added: { service_h_year: 1, usd_unit: 22 },
  }]);
  assert.ok("verdict" in r.baseline && r.baseline.verdict === "feasible");
  assert.match(r.note, /new harms are not modelled/);
});

test("over budget: the binding dimension, and no binding dimension when minimal vectors fail on different ones", () => {
  const tight = bearing();
  tight.budget = { usd_unit: 180, service_h_year: 4 };
  const r = trimFeasibility(tight, { trim: ["bearing"] });
  assert.ok(r.ok && r.verdict === "infeasible" && r.reason === "over-budget");
  assert.deepEqual([r.binding, r.minimal[0].overBudget], [["usd_unit"], ["usd_unit"]]);
  const base = feasibility(tight);
  assert.ok(base.ok && base.verdict === "feasible", "the baseline itself fits: the trim is what breaks the budget");

  // Two ways to make the housing carry the shaft: cheaper but serviced, or dearer and maintenance-free.
  const split = bearing();
  box(split, "housing").feasibility!.push({ provides: { bore: 3000 }, cost: { usd_unit: 30 } });
  split.budget = { usd_unit: 185, service_h_year: 0.5 };
  const s = trimFeasibility(split, { trim: ["bearing"] });
  assert.ok(s.ok && s.verdict === "infeasible" && s.reason === "over-budget");
  assert.deepEqual(s.minimal.map((v) => [v.resources, v.overBudget]), [
    [{ service_h_year: 0, usd_unit: 190 }, ["usd_unit"]],
    [{ service_h_year: 1, usd_unit: 182 }, ["service_h_year"]],
  ]);
  assert.deepEqual(s.binding, []);
  assert.match(s.note, /no single dimension binds/);
  assert.equal(s.absorbers[0].added, undefined);
  assert.match(s.absorbers[0].addedUnavailable!, /several minimal resource vectors/);
  assert.deepEqual(s.absorbers[0].trimmed.map((t) => t.row), [2, 1]);

  split.budget = { usd_unit: 200, service_h_year: 0.5 };
  const fits = trimFeasibility(split, { trim: ["bearing"] });
  assert.ok(fits.ok && fits.verdict === "feasible");
  assert.deepEqual(fits.withinBudget, [0]);
});

test("unprovidable: no housing row carries the shaft's load, whatever the budget", () => {
  const weak = bearing();
  box(weak, "housing").feasibility![1].provides = { bore: 2000 };
  const r = trimFeasibility(weak, { trim: ["bearing"] });
  assert.ok(r.ok && r.verdict === "infeasible" && r.reason === "unprovidable");
  assert.deepEqual(r.unprovidable, { box: "housing", demanded: [{ port: "bore", level: 2500 }], ports: [{ port: "bore", demanded: 2500, provided: 2000 }] });
  assert.match(r.absorbers[0].addedUnavailable!, /trimmed model has no minimal resource vector/);
});

/** One supplier box per entry, each with rows `rows(output)`, feeding product P one input each. */
function suppliers(rows: Record<string, (out: string) => FeasibilityRow[]>, budget: Record<string, number>, outputs: string[] = ["o"]): FunctionModel {
  const ids = Object.keys(rows);
  return {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "unit" }],
    boxes: [
      ...ids.map((id) => ({ id, name: id, role: "tool" as const, outputs: outputs.map((o) => ({ id: o, carrier: "c" })), feasibility: rows[id](outputs[0]) })),
      { id: "P", name: "P", role: "product", inputs: ids.flatMap((id) => outputs.map((o) => ({ id: `${id}.${o}`, carrier: "c" }))),
        feasibility: [{ requires: Object.fromEntries(ids.flatMap((id) => outputs.map((o) => [`${id}.${o}`, 1]))) }] },
    ],
    wires: ids.flatMap((id) => outputs.map((o) => ({ id: `w-${id}-${o}`, from: { box: id, port: o }, to: { box: "P", port: `${id}.${o}` }, carrier: "c", polarity: "useful" as const }))),
    budget,
  };
}

test("unprovidable jointly: some row reaches each demanded level, but no row reaches them together", () => {
  const m = suppliers({ A: (): FeasibilityRow[] => [{ provides: { x: 1 } }, { provides: { y: 1 } }] }, {}, ["x", "y"]);
  const r = feasibility(m);
  assert.ok(r.ok && r.verdict === "infeasible" && r.reason === "unprovidable");
  assert.deepEqual(r.unprovidable, { box: "A", demanded: [{ port: "x", level: 1 }, { port: "y", level: 1 }], ports: [] });
  assert.match(r.note, /No single row of 'A' provides the demanded levels together \('x': 1, 'y': 1\), though some row reaches each of them alone/);
  assert.doesNotMatch(r.note, /\(\)/);
});

test("affordable vectors are listed first, so withinBudget resolves past the listing limit", () => {
  // 51 incomparable rows; only row 9, costing { a: 9, b: 41 }, fits the budget.
  const m = suppliers({ S: (o) => Array.from({ length: 51 }, (_, i) => ({ provides: { [o]: 1 }, cost: { a: i, b: 50 - i } })) }, { a: 9, b: 41 });
  const r = feasibility(m);
  assert.ok(r.ok && r.verdict === "feasible");
  assert.deepEqual([r.minimalCount, r.minimal.length, r.withinBudget, r.withinBudgetCount], [51, 50, [0], 1]);
  assert.deepEqual([r.minimal[0].resources, r.minimal[0].overBudget, r.minimal[0].rows], [{ a: 9, b: 41 }, [], [{ box: "S", row: 9 }, { box: "P", row: 0 }]]);
  assert.ok(r.minimal.slice(1).every((v) => v.overBudget.length), "every other listed vector is over budget");
  assert.deepEqual(r.minimal.slice(1, 4).map((v) => v.resources.a), [0, 1, 2], "the rest follow in numeric order");
});

test("the antichain cap holds at every insertion, before two fronts multiply", () => {
  // Two suppliers with 20 incomparable rows each on disjoint dimensions: their product has 400 minimal elements.
  const front = (d: [string, string]) => (o: string) => Array.from({ length: 20 }, (_, i) => ({ provides: { [o]: 1 }, cost: { [d[0]]: i, [d[1]]: 19 - i } }));
  const m = suppliers({ A: front(["a", "b"]), B: front(["c", "d"]) }, {});
  // Failing on the antichain within 100 candidates means the cap fired at insertion 21 of box B, not after all 400.
  assert.match(errors(feasibility(m, { maxAntichain: 20, maxCandidates: 100 })), /the antichain passed 20 partial selections while composing box 'B'/);
  const small = suppliers({ A: front(["a", "b"]), B: (o) => [{ provides: { [o]: 1 } }] }, {});
  assert.match(errors(feasibility(small, { maxAntichain: 19 })), /the antichain passed 19 partial selections while composing box 'A'/);
  const fits = feasibility(small, { maxAntichain: 20 });
  assert.ok(fits.ok && fits.verdict === "undecided" && fits.reason === "unbudgeted" && fits.minimalCount === 20);
});

test("undecided: missing feasibility, no budget, an unbudgeted dimension in use; the trimmed box needs none", () => {
  const noMotor = bearing();
  delete box(noMotor, "motor").feasibility;
  const m = feasibility(noMotor);
  assert.ok(m.ok && m.verdict === "undecided" && m.reason === "missing-feasibility");
  assert.deepEqual(m.missingFeasibility, ["motor"]);
  const noShaft = bearing();
  delete box(noShaft, "shaft").feasibility;
  const p = feasibility(noShaft);
  assert.deepEqual(p.ok && "missingFeasibility" in p && p.missingFeasibility, ["shaft"], "the product's rows are the demand");

  const noBearing = bearing();
  delete box(noBearing, "bearing").feasibility;
  const t = trimFeasibility(noBearing, { trim: ["bearing"] });
  assert.ok(t.ok && t.verdict === "feasible", "the verdict is the trimmed model's");
  assert.deepEqual(t.baseline, { verdict: "undecided", reason: "missing-feasibility", missingFeasibility: ["bearing"] });
  assert.match(t.absorbers[0].addedUnavailable!, /baseline has no minimal resource vector/);

  const unbudgeted = bearing();
  delete unbudgeted.budget;
  const u = feasibility(unbudgeted);
  assert.ok(u.ok && u.verdict === "undecided" && u.reason === "no-budget");
  assert.equal(u.minimal.length, 1);
  unbudgeted.budget = { usd_unit: 200 };
  const v = feasibility(unbudgeted);
  assert.ok(v.ok && v.verdict === "undecided" && v.reason === "unbudgeted");
  assert.deepEqual(v.unbudgeted, ["service_h_year"]);

  const noProduct = bearing();
  box(noProduct, "shaft").role = "mediator";
  assert.match(errors(feasibility(noProduct)), /no product box/);

  // Constructions do not invent feasibility: the part that supports the shaft must declare it.
  const seg = segment(bearing(), { box: "bearing", parts: [{ id: "races", ports: ["preload-in", "race"] }, { id: "rolling", ports: ["friction"] }] });
  assert.ok(seg.ok);
  const s = feasibility(seg.model);
  assert.deepEqual(s.ok && "missingFeasibility" in s && s.missingFeasibility, ["races"]);
});

test("a port has one level: fan-out meets the largest demand, and fan-in needs every feeder to meet it", () => {
  const both = bearing();
  both.wires.push({ id: "w-hold", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful" });
  const r = feasibility(both);
  assert.ok(r.ok && r.verdict === "feasible");
  assert.deepEqual(r.minimal[0].rows.find((x) => x.box === "housing"), { box: "housing", row: 1 }, "the housing must carry the full load too");
  assert.deepEqual(r.minimal[0].resources, { service_h_year: 3, usd_unit: 200 });

  const loop = pumpLoop(10);
  const f = feasibility(loop);
  assert.ok(f.ok && f.verdict === "feasible");
  assert.deepEqual(f.minimal[0].levels.find((l) => l.port === "flow-out"), { box: "pump", port: "flow-out", level: 10 }, "max of the field's 10 and the generator's 8");
});

test("resource loops: Kleene's ascent escalates the loop to its least fixpoint, or proves it unprovidable", () => {
  const easy = feasibility(pumpLoop(10));
  assert.ok(easy.ok && easy.verdict === "feasible");
  assert.deepEqual([easy.minimal[0].resources, easy.iterations], [{ usd: 5 }, 2]);

  // 18 L/min needs the big pump, whose 12 W needs the big generator: the ascent climbs step by step.
  const climb = feasibility(pumpLoop(18));
  assert.ok(climb.ok && climb.verdict === "feasible");
  assert.deepEqual(climb.minimal[0].rows, [{ box: "pump", row: 1 }, { box: "generator", row: 1 }, { box: "field", row: 0 }]);
  assert.deepEqual(climb.minimal[0].resources, { usd: 9 });
  assert.deepEqual(climb.minimal[0].levels, [{ box: "pump", port: "flow-out", level: 18 }, { box: "generator", port: "power-out", level: 12 }]);
  assert.equal(climb.iterations, 4);

  // A generator that needs more flow than the pump can give: the demand runs past every row.
  const runaway = feasibility(pumpLoop(18, [[6, 8, 2], [12, 25, 4]]));
  assert.ok(runaway.ok && runaway.verdict === "infeasible" && runaway.reason === "unprovidable");
  assert.deepEqual(runaway.unprovidable, { box: "pump", demanded: [{ port: "flow-out", level: 25 }], ports: [{ port: "flow-out", demanded: 25, provided: 20 }] });
  assert.equal(runaway.iterations, 4);
});

test("the caps fail closed: iterations, antichain size, and row selections", () => {
  assert.match(errors(feasibility(pumpLoop(18), { maxIterations: 3 })), /no fixpoint after 3 steps/);
  assert.ok(feasibility(pumpLoop(18), { maxIterations: 4 }).ok);
  const split = bearing();
  box(split, "housing").feasibility!.push({ provides: { bore: 3000 }, cost: { usd_unit: 30 } });
  assert.match(errors(trimFeasibility(split, { trim: ["bearing"], maxAntichain: 1 })), /^trimmed: the antichain passed 1 partial selections while composing box 'housing'/);
  assert.match(errors(feasibility(bearing(), { maxCandidates: 5 })), /the search tried more than 5 row selections/);
});

/** Random feasibility rows over a generated model's ports: small levels and costs, minimal rows only. */
function decorate(r: () => number, m: FunctionModel): FunctionModel {
  const fed = new Set(m.wires.filter((w) => w.polarity !== "harmful").map((w) => JSON.stringify([w.to.box, w.to.port])));
  for (const b of m.boxes) {
    if (r() < 0.2) continue;
    const rows: FeasibilityRow[] = Array.from({ length: int(r, 1, 3) }, () => ({
      provides: Object.fromEntries((b.outputs ?? []).map((p) => [p.id, int(r, 0, 3)])),
      requires: Object.fromEntries((b.inputs ?? []).filter((p) => fed.has(JSON.stringify([b.id, p.id]))).map((p) => [p.id, int(r, 0, 3)])),
      cost: { usd: int(r, 0, 4), ms: int(r, 0, 4) },
    }));
    const atLeast = (x: FeasibilityRow, y: FeasibilityRow) => Object.keys(x.provides!).every((k) => x.provides![k] >= y.provides![k])
      && Object.keys(x.requires!).every((k) => x.requires![k] <= y.requires![k]) && x.cost!.usd <= y.cost!.usd && x.cost!.ms <= y.cost!.ms;
    b.feasibility = rows.filter((x, j) => !rows.some((y, k) => k !== j && atLeast(y, x) && (!atLeast(x, y) || k < j)));
  }
  return m;
}

test("the least fixpoint's minimal vectors are exactly the minimal feasible row selections (brute force, 300 random models)", () => {
  let decided = 0, unprovidable = 0, loops = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed);
    const m = decorate(r, genModel(r, { contradictions: false }));
    const res = feasibility(m);
    assert.ok(res.ok, `seed ${seed}: ${errors(res as { ok: boolean; errors?: string[] })}`);
    if (res.verdict === "undecided" && res.reason === "missing-feasibility") continue;
    const composed = res.composed.map((id) => box(m, id));
    if (composed.reduce((n, b) => n * b.feasibility!.length, 1) > 5000) continue;
    const dims = Object.keys(res.fixed);
    const own = (d: Record<string, number> | undefined, k: string) => (d && Object.hasOwn(d, k) ? d[k] : 0);
    const level = (b: string, p: string, sel: Map<string, FeasibilityRow>) => own(sel.get(b)?.provides, p);
    // Every selection whose requirements its own feeders meet, with its total cost.
    const costs: number[][] = [];
    const visit = (k: number, sel: Map<string, FeasibilityRow>) => {
      if (k === composed.length) {
        const ok = composed.every((b) => Object.entries(sel.get(b.id)!.requires ?? {}).every(([port, q]) =>
          m.wires.filter((w) => w.polarity !== "harmful" && w.to.box === b.id && w.to.port === port).every((w) => level(w.from.box, w.from.port, sel) >= q)));
        if (ok) costs.push(dims.map((d) => own(res.fixed, d) + composed.reduce((s, b) => s + own(sel.get(b.id)!.cost, d), 0)));
        return;
      }
      for (const row of composed[k].feasibility!) visit(k + 1, new Map(sel).set(composed[k].id, row));
    };
    visit(0, new Map());
    const minimal = costs.filter((c) => !costs.some((d) => d.every((x, i) => x <= c[i]) && d.some((x, i) => x < c[i])));
    const expected = [...new Set(minimal.map((c) => JSON.stringify(c)))].sort();
    if ("minimal" in res) {
      decided++;
      assert.deepEqual(res.minimal.map((v) => JSON.stringify(dims.map((d) => own(v.resources, d)))).sort(), expected, `seed ${seed}`);
      // Each witness is a selection that meets every requirement, costs its operating vector, and provides its levels.
      for (const v of res.minimal) {
        const sel = new Map(v.rows.map((x) => [x.box, box(m, x.box).feasibility![x.row]]));
        const met = composed.every((b) => Object.entries(sel.get(b.id)!.requires ?? {}).every(([port, q]) =>
          m.wires.filter((w) => w.polarity !== "harmful" && w.to.box === b.id && w.to.port === port).every((w) => level(w.from.box, w.from.port, sel) >= q)));
        assert.ok(met, `seed ${seed}: witness misses a requirement`);
        assert.deepEqual(dims.map((d) => own(v.operating, d)), dims.map((d) => composed.reduce((s, b) => s + own(sel.get(b.id)!.cost, d), 0)), `seed ${seed}`);
        for (const l of v.levels) assert.ok(l.level <= level(l.box, l.port, sel), `seed ${seed}: level ${l.box}.${l.port} not provided`);
      }
      // A loop that carries demand: a non-harmful wire between composed boxes on a cycle, at a positive level.
      const useful = m.wires.filter((w) => w.polarity !== "harmful" && res.composed.includes(w.from.box) && res.composed.includes(w.to.box));
      const reaches = (a: string, b: string) => {
        const seen = new Set([a]), queue = [a];
        for (let x = queue.shift(); x !== undefined; x = queue.shift()) {
          if (x === b) return true;
          for (const w of useful) if (w.from.box === x && !seen.has(w.to.box)) { seen.add(w.to.box); queue.push(w.to.box); }
        }
        return false;
      };
      if (useful.some((w) => reaches(w.to.box, w.from.box) && res.minimal.some((v) => v.levels.some((l) => l.box === w.from.box && l.port === w.from.port)))) loops++;
    } else {
      unprovidable++;
      assert.ok(res.verdict === "infeasible" && res.reason === "unprovidable", `seed ${seed}`);
      assert.deepEqual(expected, [], `seed ${seed}: brute force found a feasible selection`);
    }
  }
  assert.ok(decided >= 120 && unprovidable >= 30 && loops >= 25, `decided ${decided}, unprovidable ${unprovidable}, loops carrying demand ${loops}`);
});

test("a dominated feasibility row fails closed in every tool that takes a model", async () => {
  const bad = bearing();
  box(bad, "housing").feasibility!.push({ provides: { bore: 300 }, cost: { usd_unit: 1 } });
  const args: Record<string, unknown> = {
    triz_function_model: { model: bad },
    triz_trim: { model: bad, trim: ["bearing"] },
    triz_export: { model: bad, format: "hypergraph" },
    triz_transform: { model: bad, transformation: { op: "trim", trim: ["bearing"] } },
    triz_nine_windows: { present: bad, subsystem: ["bearing"] },
    triz_behavior: { model: bad },
    triz_rule_apply: { model: bad, rule_id: "mono-bi" },
    triz_feasibility: { model: bad, trim: ["bearing"] },
    triz_dynamics: { model: bad },
    triz_flow: { model: bad },
  };
  const takesModel = toolSpecs().filter((s) => ["model", "present"].some((k) => k in s.shape));
  assert.deepEqual(takesModel.map((s) => s.name).sort(), Object.keys(args).sort());
  for (const s of takesModel) {
    const out = JSON.parse((await s.handler(args[s.name])).content[0].text);
    assert.equal(out.ok, false, s.name);
    const errors = out.errors ?? out.windows.find((w: { time: string }) => w.time === "present").errors;
    assert.match(errors.join(), /box 'housing' feasibility row 2 is dominated by row 0/, s.name);
  }
});

test("triz_feasibility answers over the shared tool spec and fails closed", async () => {
  const spec = toolSpecs().find((s) => s.name === "triz_feasibility")!;
  const call = async (args: unknown) => JSON.parse((await spec.handler(args)).content[0].text);
  const trimmed = await call({ model: bearing(), trim: ["bearing"] });
  assert.deepEqual([trimmed.verdict, trimmed.absorbers[0].added], ["feasible", { service_h_year: 1, usd_unit: 22 }]);
  assert.equal((await call({ model: bearing() })).verdict, "feasible");
  assert.match((await call({ model: bearing(), absorb: { "w-support": { box: "housing", port: "bore" } } })).errors.join(), /absorb needs trim/);
  assert.match((await call({ model: pumpLoop(18), max_iterations: 2 })).errors.join(), /no fixpoint after 2 steps/);
  assert.equal(spec.shape.max_antichain.safeParse(MAX_ANTICHAIN + 1).success, false);
  assert.equal(spec.shape.max_iterations.safeParse(MAX_ITERATIONS + 1).success, false);
});
