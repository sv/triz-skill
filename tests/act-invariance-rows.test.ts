/**
 * Label-blindness of the verdicts that read declared rows, which tests/act-invariance.test.ts
 * excludes because its generator and relabelling carry wiring only.
 *
 *  - triz_feasibility: generated models declare antichain feasibility rows on every box (provides,
 *    requires, and cost rise with the row index, so no row dominates another), and the verdicts —
 *    composed boxes, minimal resource vectors with their rows and demanded levels, binding and
 *    unbudgeted dimensions, and the solver's step counts — are equal after renaming every id and
 *    permuting every array, ids mapped back. An unprovidable verdict names the first blocked box
 *    in model order, so only its reason and counts are compared there.
 *  - the principle constructions of src/act-principles.ts: the same construction on a model and on
 *    its relabelling succeeds and fails together, and two successes give isomorphic results (the
 *    wiring isomorphism compares shape, roles, polarities, and costs, not ids or names), with the
 *    same label-free fields.
 *
 * This shows the two read only wiring shape and declared numbers. It does not show that a TRIZ
 * solution transfers between domains.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkModel, harmLoops, idealityProfile, type FunctionModel } from "../src/act.js";
import { feasibility } from "../src/act-feasibility.js";
import { findIsomorphism } from "../src/act-iso.js";
import { merge, rerate, feedback, retarget, reverse, standby, cheapCopy } from "../src/act-principles.js";
import { rng, genModel, relabel, invert, pick, type Maps } from "./support/gen.js";

interface Back { box(id: string): string; port(box: string, id: string): string; wire(id: string): string; carrier(id: string): string; dim(id: string): string }
const identity: Back = { box: (x) => x, port: (_, x) => x, wire: (x) => x, carrier: (x) => x, dim: (x) => x };
function backOf(maps: Maps): Back {
  const inv = { box: invert(maps.box), wire: invert(maps.wire), carrier: invert(maps.carrier), dim: invert(maps.dim) };
  const get = (m: Map<string, string>, x: string) => { assert.ok(m.has(x), `unmapped id '${x}'`); return m.get(x)!; };
  return {
    box: (x) => get(inv.box, x), wire: (x) => get(inv.wire, x), carrier: (x) => get(inv.carrier, x), dim: (x) => get(inv.dim, x),
    port: (b, x) => get(invert(maps.port.get(get(inv.box, b))!), x),
  };
}
const sorted = <T>(xs: T[]) => xs.map((x) => JSON.stringify(x)).sort();

/** Every structured verdict of triz_feasibility, in original ids, order-free. */
function feasibilityVerdict(m: FunctionModel, back: Back) {
  const f = feasibility(m);
  if (!f.ok) return { ok: false as const, errors: f.errors.length };
  const dims = (o: Record<string, number> | undefined) => sorted(Object.entries(o ?? {}).map(([d, v]) => [back.dim(d), v]));
  const out: Record<string, unknown> = {
    verdict: f.verdict, ...("reason" in f ? { reason: f.reason } : {}),
    composed: sorted(f.composed.map(back.box)),
    fixed: dims(f.fixed),
    ...("missingFeasibility" in f ? { missingFeasibility: sorted((f.missingFeasibility ?? []).map(back.box)) } : {}),
  };
  if ("minimal" in f && f.minimal.length) {
    out.minimalCount = f.minimalCount;
    out.minimal = sorted(f.minimal.map((v) => ({
      resources: dims(v.resources), operating: dims(v.operating),
      overBudget: sorted(v.overBudget.map(back.dim)),
      rows: sorted(v.rows.map((x) => [back.box(x.box), x.row])),
      levels: sorted(v.levels.map((l) => [back.box(l.box), back.port(l.box, l.port), l.level])),
    })));
  }
  if ("binding" in f && f.binding) out.binding = sorted(f.binding.map(back.dim));
  if ("unbudgeted" in f && f.unbudgeted) out.unbudgeted = sorted(f.unbudgeted.map(back.dim));
  if ("withinBudgetCount" in f) out.withinBudgetCount = f.withinBudgetCount;
  if ("unprovidable" in f) out.unprovidable = { demanded: f.unprovidable.demanded.length, ports: f.unprovidable.ports.length };
  if ("iterations" in f) Object.assign(out, { iterations: f.iterations, antichainPeak: f.antichainPeak, candidates: f.candidates });
  return out;
}

test("property: feasibility verdicts are label-blind (300 seeds)", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(50_000 + seed);
    const m = genModel(r, { feasibility: true, contradictions: false });
    assert.ok(checkModel(m).ok, `seed ${seed}: generator produced an ill-typed model`);
    const { model: m2, maps } = relabel(r, m);
    assert.ok(checkModel(m2).ok, `seed ${seed}: relabelling produced an ill-typed model`);
    assert.deepEqual(feasibilityVerdict(m2, backOf(maps)), feasibilityVerdict(m, identity), `seed ${seed}`);
  }
});

type Result = { ok: boolean; errors?: string[]; model?: FunctionModel; [k: string]: unknown };
/** The wiring shape of a construction's result: counts only, so free of ids and names. */
const shape = (m: FunctionModel) => ({
  boxes: m.boxes.length, wires: m.wires.length, loops: harmLoops(m).length, deliverables: idealityProfile(m).deliverables.length,
});

test("property: principle constructions are label-blind (200 seeds)", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(60_000 + seed);
    const m = genModel(r, { contradictions: false });
    if (!m.wires.length) continue;
    const { model: m2, maps } = relabel(r, m);
    // maps.port is keyed by the original box id; an id the relabelling never maps (a literal the construction will refuse) passes through.
    const port = (b: string, p: string) => maps.port.get(b)?.get(p) ?? p;
    const boxOf = (id: string) => maps.box.get(id)!;
    const wire = pick(r, m.wires);
    const into = { id: "zz-merged", name: "M", role: "tool" as const };
    const src = (m.boxes.find((b) => b.id === wire.to.box)?.outputs ?? []).find((p) => p.carrier === wire.carrier);
    const dst = (m.boxes.find((b) => b.id === wire.from.box)?.inputs ?? []).find((p) => p.carrier === wire.carrier);
    const harm = m.wires.find((w) => w.polarity === "harmful");
    const elseTarget = m.boxes.flatMap((b) => (b.inputs ?? []).filter((p) => p.carrier === harm?.carrier)
      .map((p) => ({ box: b.id, port: p.id }))).filter((e) => !harm || e.box !== harm.to.box || e.port !== harm.to.port);
    const target = harm ? (elseTarget.length ? pick(r, elseTarget) : { box: harm.to.box, port: harm.to.port }) : null;
    const victim = pick(r, m.boxes);
    const cheaper = Object.entries(victim.cost ?? {}).find(([, v]) => v > 0) as [string, number] | undefined;
    const cases: Array<[() => unknown, () => unknown]> = [
      // merge (Principle 5): the wire's two boxes, adjacent by construction
      [() => merge(m, { boxes: [...new Set([wire.from.box, wire.to.box])], into }), () => merge(m2, { boxes: [...new Set([boxOf(wire.from.box), boxOf(wire.to.box)])], into })],
      // rerate (16): a useful function to insufficient, reading 'partial'
      [() => rerate(m, { wire: wire.id, polarity: "insufficient", reading: "partial" }), () => rerate(m2, { wire: maps.wire.get(wire.id)!, polarity: "insufficient", reading: "partial" })],
      // feedback (23): a function back from the object to the performer
      [() => feedback(m, { wire: { id: "zz-fb", from: { box: wire.to.box, port: src?.id ?? "zz-none" }, to: { box: wire.from.box, port: dst?.id ?? "zz-none" }, carrier: wire.carrier, polarity: "useful", verb: "feed back" } }),
        () => feedback(m2, { wire: { id: "zz-fb", from: { box: boxOf(wire.to.box), port: port(wire.to.box, src?.id ?? "zz-none") }, to: { box: boxOf(wire.from.box), port: port(wire.from.box, dst?.id ?? "zz-none") }, carrier: maps.carrier.get(wire.carrier)!, polarity: "useful", verb: "feed back" } })],
      // retarget (22): a harmful function's factor to another input of the same carrier
      ...harm ? [[
        () => retarget(m, { wire: harm.id, to: target! }),
        () => retarget(m2, { wire: maps.wire.get(harm.id)!, to: { box: boxOf(target!.box), port: port(target!.box, target!.port) } }),
      ] as [() => unknown, () => unknown]] : [],
      // reverse (13): swap performer and object
      [() => reverse(m, { wire: wire.id }), () => reverse(m2, { wire: maps.wire.get(wire.id)! })],
      // standby (11): back up one box with an unwired typed absorber; its cost dim is a name the generator never draws, so it lands as a fresh dimension in both models
      [() => standby(m, { box: victim.id, standby: { id: "zz-standby", name: "S", cost: { "zz-dim": 1 } } }), () => standby(m2, { box: boxOf(victim.id), standby: { id: "zz-standby", name: "S", cost: { "zz-dim": 1 } } })],
      // cheap_copy (26): a copy cheaper on one dimension, or nothing to lower
      [() => cheapCopy(m, { box: victim.id, copy: { id: "zz-copy", cost: cheaper ? { [cheaper[0]]: cheaper[1] - 1 } : {} } }),
        () => cheapCopy(m2, { box: boxOf(victim.id), copy: { id: "zz-copy", cost: cheaper ? { [maps.dim.get(cheaper[0]) ?? cheaper[0]]: cheaper[1] - 1 } : {} } })],
    ];
    cases.forEach(([a, b], k) => {
      const ra = a() as Result, rb = b() as Result;
      assert.equal(rb.ok, ra.ok, `seed ${seed}: case ${k} succeeded on one side only`);
      if (!ra.ok) { assert.equal(rb.errors!.length, ra.errors!.length, `seed ${seed}: case ${k}`); return; }
      const [ma, mb] = [ra.model!, rb.model!];
      assert.ok(checkModel(ma).ok && checkModel(mb).ok, `seed ${seed}: case ${k}`);
      const iso = findIsomorphism(ma, mb);
      assert.ok(iso.ok && iso.decided && iso.isomorphic, `seed ${seed}: case ${k} gave non-isomorphic results`);
      assert.deepEqual(shape(mb), shape(ma), `seed ${seed}: case ${k}`);
      for (const field of ["reading", "loop", "gainsDeliverable"] as const) {
        if (field in ra) assert.deepEqual(rb[field], ra[field], `seed ${seed}: case ${k} field ${field}`);
      }
    });
  }
});
