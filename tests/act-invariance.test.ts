/**
 * Kernel verdicts are label-blind: equivariant under renaming every id (boxes, ports, wires,
 * carriers, cost dimensions, demands, values, cells) and changing every label (domain, system,
 * names, verbs, layers, dimensions), with every array permuted. Verdicts are compared after
 * mapping ids back. Excluded by design:
 *  - free text (error strings, trimming problems, notes), compared by count;
 *  - witness cycles, compared by validity and length: ties between equally short cycles are
 *    broken by id order;
 *  - absorber ports, because ties between same-carrier ports follow port order;
 *  - conflict-cell lists, compared by count: the list is truncated in id order.
 *
 * This shows that the kernel reads only the wiring shape. It does not show that a TRIZ solution
 * transfers between domains.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FunctionModel, checkModel, harmLoops, idealityProfile, compareIdeality, trimCandidates, separationCheck, dynamize,
} from "../src/act.js";
import { findIsomorphism, checkIsomorphism, type ModelMapping } from "../src/act-iso.js";
import { rng, genModel, relabel, invert, pick, int, shuffle, type Maps } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));

const SEEDS = 200;
const sorted = <T>(xs: T[]) => xs.map((x) => JSON.stringify(x)).sort();

/** Maps ids of a relabelled model back to the original; identity for the original itself. */
interface Back { box(id: string): string; wire(id: string): string; carrier(id: string): string; dim(id: string): string; demand(id: string): string; value(id: string): string; cell(id: string): string; }
const identity: Back = { box: (x) => x, wire: (x) => x, carrier: (x) => x, dim: (x) => x, demand: (x) => x, value: (x) => x, cell: (x) => x };
function backOf(maps: Maps): Back {
  const inv = { box: invert(maps.box), wire: invert(maps.wire), carrier: invert(maps.carrier), dim: invert(maps.dim), demand: invert(maps.demand), value: invert(maps.value), cell: invert(maps.cell) };
  const get = (m: Map<string, string>, x: string) => { assert.ok(m.has(x), `unmapped id '${x}'`); return m.get(x)!; };
  return {
    box: (x) => get(inv.box, x), wire: (x) => get(inv.wire, x), carrier: (x) => get(inv.carrier, x),
    dim: (x) => (x === "harmful" ? x : get(inv.dim, x)), demand: (x) => get(inv.demand, x), value: (x) => get(inv.value, x), cell: (x) => get(inv.cell, x),
  };
}
function backOfMapping(mapping: ModelMapping): Back {
  const inv = (r: Record<string, string>) => new Map(Object.entries(r).map(([k, v]) => [v, k]));
  const [box, wire, carrier, dim] = [inv(mapping.boxes), inv(mapping.wires), inv(mapping.carriers), inv(mapping.dims)];
  const opaque = () => "(contradiction ids are not part of the wiring isomorphism)";
  return { box: (x) => box.get(x)!, wire: (x) => wire.get(x)!, carrier: (x) => carrier.get(x)!, dim: (x) => dim.get(x)!, demand: opaque, value: opaque, cell: opaque };
}

/** A witness cycle must start along its wire, follow wires, close, and stay in its loop. */
function assertCycle(m: FunctionModel, loopBoxes: string[], via: string, p: string[]) {
  const w = m.wires.find((x) => x.id === via)!;
  assert.equal(p[0], w.from.box);
  assert.equal(p[1], w.to.box);
  assert.equal(p[p.length - 1], p[0]);
  for (let i = 0; i + 1 < p.length; i++) assert.ok(m.wires.some((x) => x.from.box === p[i] && x.to.box === p[i + 1]), `no wire ${p[i]} → ${p[i + 1]}`);
  for (const b of p) assert.ok(loopBoxes.includes(b));
}

/** Every structured verdict of the wiring kernel, in original ids, order-free. */
function wiringVerdicts(m: FunctionModel, back: Back, trim: string[]) {
  const check = checkModel(m);
  const loops = harmLoops(m);
  for (const l of loops) for (const c of l.cycles) assertCycle(m, l.boxes, c.via, c.path);
  const p = idealityProfile(m);
  const t = trimCandidates(m, trim);
  return {
    check: { ok: check.ok, errors: check.errors.length },
    loops: sorted(loops.map((l) => ({
      boxes: sorted(l.boxes.map(back.box)), negative: sorted(l.negative.map(back.wire)),
      cycles: sorted(l.cycles.map((c) => [back.wire(c.via), c.path.length])),
    }))),
    ideality: {
      functions: p.functions,
      deliverables: sorted(p.deliverables.map((d) => [back.box(d.box), back.carrier(d.carrier), d.polarity])),
      costs: sorted(Object.entries(p.costs).map(([d, v]) => [back.dim(d), v])),
      budget: p.budget && { over: sorted(p.budget.overBudget.map(back.dim)), unbudgeted: sorted(p.budget.unbudgeted.map(back.dim)), within: p.budget.withinBudget },
      ratio: p.ratio.computable ? p.ratio.value : "not computable",
    },
    trim: !t.ok ? { ok: false, errors: t.errors.length } : {
      verdict: t.verdict,
      functions: sorted(t.functions.map((f) => ({
        wire: back.wire(f.wire), object: back.box(f.object), carrier: back.carrier(f.carrier), rule: f.rule,
        absorbers: sorted(f.absorbers.map((a) => [back.box(a.box), a.rule, a.supersystem])),
      }))),
      orphaned: sorted(t.orphaned.map(back.wire)), dropped: sorted(t.dropped.map(back.wire)), removedHarms: sorted(t.removedHarms.map(back.wire)),
      costRelief: sorted(Object.entries(t.costRelief).map(([d, v]) => [back.dim(d), v])),
      problems: t.trimmingProblems.length,
    },
  };
}

function separationVerdicts(m: FunctionModel, back: Back) {
  return (m.contradictions ?? []).map((pc) => {
    const s = separationCheck(pc), d = dynamize(pc, "time");
    return {
      separation: !s.ok ? { ok: false, errors: s.errors.length } : {
        contradiction: s.contradiction, gluable: s.gluable, conflictCells: s.conflictCellCount,
        pairs: sorted(s.pairs.map((x) => ({
          demands: sorted(x.demands.map(back.demand)), status: x.status,
          shared: x.sharedValues ? sorted(x.sharedValues.map(back.value)) : null,
          axes: "separatingAxes" in x ? x.separatingAxes : null,
        }))),
      },
      dynamize: !d.ok ? { ok: false } : {
        verdict: d.verdict, blocked: sorted(d.blocked.map(back.cell)),
        schedule: sorted(d.schedule.map((x) => [back.cell(x.cell), sorted(x.demands.map(back.demand)), x.values && sorted(x.values.map(back.value))])),
      },
    };
  });
}

/** A concept to compare against: some wires dropped, one box re-costed. Built the same way in either id space. */
function concept(m: FunctionModel, dropWires: Set<string>, recost: { box: string; dim: string; value: number } | null): FunctionModel {
  return {
    ...m,
    wires: m.wires.filter((w) => !dropWires.has(w.id)),
    boxes: m.boxes.map((b) => (recost && b.id === recost.box ? { ...b, cost: { ...b.cost, [recost.dim]: recost.value } } : b)),
  };
}

function compareVerdict(a: FunctionModel, b: FunctionModel, back: Back) {
  const c = compareIdeality(a, b);
  const axis = (x: string) => (x.startsWith("cost:") ? `cost:${back.dim(x.slice(5))}` : x);
  const key = (k: string, list: FunctionModel) => {
    const d = idealityProfile(list).deliverables.find((x) => x.key === k)!;
    return [back.box(d.box), back.carrier(d.carrier)];
  };
  return {
    verdict: c.verdict, better: sorted(c.better.map(axis)), worse: sorted(c.worse.map(axis)),
    lost: sorted(c.lostDeliverables.map((k) => key(k, a))), gained: sorted(c.gainedDeliverables.map((k) => key(k, b))),
  };
}

test("property: every kernel verdict is invariant under relabelling and permutation (200 seeds)", () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = rng(seed);
    const m = genModel(r);
    assert.ok(checkModel(m).ok, `seed ${seed}: generator produced an ill-typed model`);
    const { model: m2, maps } = relabel(r, m);
    const back = backOf(maps);
    const trim = shuffle(r, m.boxes.map((b) => b.id)).slice(0, int(r, 1, 2));
    assert.deepEqual(wiringVerdicts(m2, back, trim.map((b) => maps.box.get(b)!)), wiringVerdicts(m, identity, trim), `seed ${seed}`);
    assert.deepEqual(separationVerdicts(m2, back), separationVerdicts(m, identity), `seed ${seed}: separation`);

    const drop = new Set(m.wires.filter(() => r() < 0.3).map((w) => w.id));
    const victim = pick(r, m.boxes);
    const recost = r() < 0.5 ? { box: victim.id, dim: pick(r, ["usd", "ms"]), value: int(r, 0, 9) } : null;
    const c1 = concept(m, drop, recost);
    const c2 = concept(m2, new Set([...drop].map((w) => maps.wire.get(w)!)), recost && { box: maps.box.get(recost.box)!, dim: maps.dim.get(recost.dim) ?? recost.dim, value: recost.value });
    if (recost && !maps.dim.has(recost.dim)) continue; // a dimension new to the model has no relabelled name to compare under
    assert.deepEqual(compareVerdict(m2, c2, back), compareVerdict(m, c1, identity), `seed ${seed}: compare`);
  }
});

test("property: mistyped models fail closed the same way after relabelling", () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = rng(10_000 + seed);
    const m = genModel(r);
    if (!m.wires.length || m.carriers.length < 2) continue;
    const w = pick(r, m.wires);
    w.carrier = m.carriers.find((c) => c.id !== w.carrier)!.id;
    const { model: m2 } = relabel(r, m);
    const [a, b] = [checkModel(m), checkModel(m2)];
    assert.equal(a.ok, false);
    assert.deepEqual([b.ok, b.errors.length], [a.ok, a.errors.length], `seed ${seed}`);
  }
});

test("property: a relabelled model is found isomorphic, and the known relabelling verifies", () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = rng(20_000 + seed);
    const m = genModel(r, { contradictions: false });
    const { model: m2, maps } = relabel(r, m);
    const known: ModelMapping = {
      boxes: Object.fromEntries(maps.box), wires: Object.fromEntries(maps.wire), carriers: Object.fromEntries(maps.carrier), dims: Object.fromEntries(maps.dim),
      ports: Object.fromEntries([...maps.port].map(([b, ps]) => [b, Object.fromEntries(ps)])),
    };
    assert.deepEqual(checkIsomorphism(m, m2, known), { ok: true, errors: [] }, `seed ${seed}`);
    const found = findIsomorphism(m, m2);
    assert.ok(found.ok && found.decided && found.isomorphic, `seed ${seed}`);
    // The found mapping may differ from the known one by an automorphism, but verdicts agree under it.
    const trim = [m.boxes[0].id];
    assert.deepEqual(wiringVerdicts(m2, backOfMapping(found.mapping), [found.mapping.boxes[trim[0]]]), wiringVerdicts(m, identity, trim), `seed ${seed}`);
  }
});

test("isomorphism: one flipped polarity, role, cost, or port side is detected", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(30_000 + seed);
    const m = genModel(r, { contradictions: false });
    const { model: m2 } = relabel(r, m);
    const unwiredInput = (x: FunctionModel) => {
      for (const b of x.boxes) for (const p of b.inputs ?? []) if (!x.wires.some((w) => w.to.box === b.id && w.to.port === p.id)) return { b, p };
      return null;
    };
    // Each edit changes the multiset of polarities, roles, costs, or port sides, so no bijection can survive it.
    const edits: Array<(x: FunctionModel) => boolean> = [
      (x) => { const w = x.wires[0]; if (!w) return false; w.polarity = w.polarity === "harmful" ? "useful" : "harmful"; return true; },
      (x) => { const b = x.boxes[0]; b.role = b.role === "product" ? "tool" : "product"; return true; },
      (x) => { const b = x.boxes.find((y) => y.cost && Object.keys(y.cost).length); if (!b) return false; const d = Object.keys(b.cost!)[0]; b.cost![d] += 1; return true; },
      (x) => { const u = unwiredInput(x); if (!u) return false; u.b.inputs = u.b.inputs!.filter((p) => p !== u.p); u.b.outputs = [...(u.b.outputs ?? []), u.p]; return true; },
    ];
    for (const edit of edits) {
      const changed = structuredClone(m2);
      if (!edit(changed)) continue;
      assert.ok(checkModel(changed).ok);
      const found = findIsomorphism(m, changed);
      assert.ok(found.ok && found.decided && !found.isomorphic, `seed ${seed}`);
    }
  }
});

test("isomorphism fails closed on mistyped input and reports an exhausted budget as undecided", () => {
  const bearing = example("bearing-heat");
  const bad = structuredClone(bearing);
  bad.wires[0].carrier = "heat";
  assert.equal(findIsomorphism(bad, bearing).ok, false);
  // Identical boxes wired by `next`: colour refinement alone cannot tell them apart.
  const wired = (n: number, tag: string, next: (i: number) => number): FunctionModel => ({
    domain: "physical",
    carriers: [{ id: `${tag}c`, layer: "energy", dimension: "W" }],
    boxes: Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, name: "x", role: "mediator", inputs: [{ id: "i", carrier: `${tag}c` }], outputs: [{ id: "o", carrier: `${tag}c` }] })),
    wires: Array.from({ length: n }, (_, i) => ({ id: `${tag}w${i}`, from: { box: `${tag}${i}`, port: "o" }, to: { box: `${tag}${next(i)}`, port: "i" }, carrier: `${tag}c`, polarity: "useful" })),
  });
  // Eight separate 2-cycles need one individualization each: a budget of three cannot finish.
  const pairs = (tag: string) => wired(16, tag, (i) => i ^ 1);
  const undecided = findIsomorphism(pairs("a"), pairs("b"), 3);
  assert.deepEqual(undecided.ok && undecided.decided, false);
  const decided = findIsomorphism(pairs("a"), pairs("b"));
  assert.ok(decided.ok && decided.decided && decided.isomorphic);
  // One 16-cycle against eight 2-cycles: same census, different shape.
  const ring = findIsomorphism(wired(16, "a", (i) => (i + 1) % 16), pairs("b"));
  assert.ok(ring.ok && ring.decided && !ring.isomorphic);
});

test("domain blindness: the physical bearing and the software connection pool share one wiring shape and every verdict", () => {
  const bearing = example("bearing-heat"), pool = example("connection-pool");
  const found = findIsomorphism(bearing, pool);
  assert.ok(found.ok && found.decided && found.isomorphic);
  assert.deepEqual(found.mapping.boxes, { motor: "scheduler", shaft: "worker", bearing: "pool", housing: "database", air: "tracing" });
  assert.deepEqual(found.mapping.dims, { service_h_year: "oncall_h_month", usd_unit: "usd_month" });
  assert.deepEqual(wiringVerdicts(pool, backOfMapping(found.mapping), ["pool"]), wiringVerdicts(bearing, identity, ["bearing"]));

  // Contradictions are outside the wiring isomorphism; their verdicts agree on every id-free field.
  const idFree = (m: FunctionModel) => m.contradictions!.map((pc) => {
    const s = separationCheck(pc), d = dynamize(pc, "time");
    assert.ok(s.ok && d.ok);
    return { contradiction: s.contradiction, gluable: s.gluable, statuses: s.pairs.map((p) => [p.status, "separatingAxes" in p ? p.separatingAxes : []]), dynamize: d.verdict, stages: d.schedule.map((x) => x.values?.length) };
  });
  assert.deepEqual(idFree(pool), idFree(bearing));
});
