/**
 * Every verdict's `basis` names a theorem that exists in theory/CategoricalTriz.lean (or a Mathlib
 * lemma a proof there uses), and each
 * verdict cites the statement its reasoning uses. Basis names are collected from tool outputs
 * across every example and every tool that cites one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel } from "../src/act.js";
import { THEOREMS, MATHLIB_THEOREMS, THEORY_FILE } from "../src/act-basis.js";
import { toolSpecs } from "../src/tools.js";
// triz_separate looks up principle texts for its suggestions: install the fs-backed data provider.
import "../src/data.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const lean = fs.readFileSync(path.resolve(here, "..", THEORY_FILE), "utf8");
const examples = fs.readdirSync(path.resolve(here, "../examples/function-models")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);

/** Every `basis` array anywhere in a tool output. */
function bases(x: unknown, out: string[][] = []): string[][] {
  if (Array.isArray(x)) x.forEach((y) => bases(y, out));
  else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) {
      if (k === "basis") out.push(v as string[]);
      else bases(v, out);
    }
  }
  return out;
}

test("every citable theorem is proved in the Lean file", () => {
  for (const name of THEOREMS) assert.match(lean, new RegExp(`^theorem ${name}\\b`, "m"), name);
  // A cited Mathlib lemma must close a proof in the Lean file, so lake build checks it exists.
  for (const name of MATHLIB_THEOREMS) assert.match(lean, new RegExp(`:= ${name.replace(".", "\\.")}$`, "m"), name);
});

test("every basis cited by any tool output names a listed theorem", async () => {
  const cited = new Set<string>();
  const collect = (r: unknown) => bases(r).flat().forEach((n) => cited.add(n));
  for (const name of examples) {
    const m = example(name);
    collect(await call("triz_function_model", { model: m }));
    for (const other of examples) collect(await call("triz_function_model", { model: m, compare_to: example(other) }));
    for (const b of m.boxes) collect(await call("triz_trim", { model: m, trim: [b.id] }));
    for (const pc of m.contradictions ?? []) for (const along of ["time", "space"]) collect(await call("triz_separate", { contradiction: pc, along }));
    collect(await call("triz_nine_windows", { present: m, subsystem: m.boxes.slice(0, 2).map((b) => b.id) }));
    collect(await call("triz_behavior", { model: m }));
    collect(await call("triz_feasibility", { model: m }));
    collect(await call("triz_dynamics", { model: m }));
    if (m.wires.length) collect(await call("triz_dynamics", { model: m, unsafe: [{ box: m.wires[0].from.box, port: m.wires[0].from.port, values: m.carriers.find((c) => c.id === m.wires[0].carrier)?.values ?? ["x"] }] }));
    if (m.wires.length) {
      const interpose = { op: "interpose", wire: m.wires[0].id, mediator: { id: "mediator-x", name: "M" } };
      collect(await call("triz_transform", { model: m, transformation: interpose }));
      collect(await call("triz_nine_windows", { present: m, subsystem: [m.wires[0].from.box, m.wires[0].to.box, "mediator-x"], transitions: { present_to_future: [interpose] } }));
    }
    const listed = await call("triz_rule_apply", { model: m, rule_id: "mono-bi" });
    if (listed.matches.length) collect(await call("triz_rule_apply", { model: m, rule_id: "mono-bi", match: listed.matches[0].match }));
  }
  collect(await call("triz_transform", { model: example("software-cache"), transformation: { op: "trim", trim: ["redis"] } }));
  collect(await call("triz_feasibility", { model: example("bearing-heat-feasibility"), trim: ["bearing"] }));
  collect(await call("triz_rule_apply", { model: { ...example("bearing-heat-feasibility"), budget: { usd_unit: 150, service_h_year: 4 } }, rule_id: "uneven-development" }));
  collect(await call("triz_flow", { model: { ...example("bearing-heat"), flows: [{ id: "load", carrier: "radial-load", path: ["housing", "bearing", "shaft", "bearing"] }] } }));
  const bearing = example("bearing-heat"), cache = example("software-cache");
  for (const [model, transformation] of [
    [bearing, { op: "merge", boxes: ["bearing", "shaft"], into: { id: "rotor", name: "Rotor", role: "product" } }],
    [{ ...bearing, flows: [{ id: "load", carrier: "radial-load", path: ["housing", "bearing", "shaft"] }] }, { op: "merge", boxes: ["housing", "bearing"], into: { id: "seat", name: "Seat" } }],
    [cache, { op: "rerate", wire: "w-rows", polarity: "excessive" }],
    [cache, { op: "feedback", wire: { id: "w-back", from: { box: "app", port: "lookup" }, to: { box: "postgres", port: "sql" }, carrier: "query", polarity: "useful" } }],
    [bearing, { op: "retarget", wire: "w-heat", to: { box: "air", port: "sink" } }],
    [cache, { op: "reverse", wire: "w-lookup", ports: { from: "push", to: "pushed" } }],
    [cache, { op: "standby", box: "postgres", standby: { id: "replica", name: "Replica" } }],
    [bearing, { op: "cheap_copy", box: "bearing", copy: { id: "bushing", cost: { usd_unit: 5 } } }],
  ] as const) {
    const r = await call("triz_transform", { model, transformation });
    assert.equal(r.ok, true, `${transformation.op}: ${r.errors}`);
    collect(r);
  }
  const behaving = example("bearing-heat-behavior");
  collect(await call("triz_transform", { model: behaving, transformation: { op: "interpose", wire: "w-support", mediator: { id: "sleeve", name: "Sleeve", behavior: "identity" } } }));
  for (const parts of [[["preload-in", "friction"], ["race"]], [["preload-in", "race"], ["friction"]], [["preload-in"], ["race"], ["friction"]]]) {
    collect(await call("triz_transform", { model: behaving, transformation: { op: "segment", box: "bearing", parts: parts.map((ports, i) => ({ id: `part-${i}`, ports })) } }));
  }
  // The weakest specification (spec and impossible) and the weakness ranking (strict and incomparable pairs).
  const open = example("bearing-heat-behavior");
  delete open.boxes.find((b) => b.id === "housing")!.behavior;
  collect(await call("triz_behavior", { model: open, trim: ["bearing"], weakest_spec: true }));
  const dry = structuredClone(open);
  dry.carriers.push({ id: "lube", layer: "material", dimension: "film", values: ["ok", "dry"] });
  const bearingBox = dry.boxes.find((b) => b.id === "bearing")!;
  bearingBox.inputs!.push({ id: "lube", carrier: "lube" });
  bearingBox.behavior = bearingBox.behavior!.flatMap((r) => [{ in: { ...r.in, lube: "ok" }, out: r.out }, { in: { ...r.in, lube: "dry" }, out: { ...r.out, race: "unsupported" } }]);
  const impossible = await call("triz_behavior", { model: dry, trim: ["bearing"], weakest_spec: true });
  assert.equal(impossible.verdict, "impossible");
  collect(impossible);
  // With producible rows on the housing: a spec within them, and a target only an unproducible row reaches.
  for (const [bore, verdict] of [["supported", "spec"], ["unsupported", "impossible"]] as const) {
    const bounded = structuredClone(open);
    bounded.boxes.find((b) => b.id === "housing")!.producible = [{ in: {}, out: { bore } }];
    const r = await call("triz_behavior", { model: bounded, trim: ["bearing"], weakest_spec: true });
    assert.equal(r.verdict, verdict);
    collect(r);
  }
  // Two boxes without behaviour, the housing and an interposed sleeve: a spec, and an impossible target the lubrication decides.
  const twoBoxes = async (model: FunctionModel) => {
    const trimmed = await call("triz_transform", { model, transformation: { op: "trim", trim: ["bearing"] } });
    return (await call("triz_transform", { model: trimmed.model, transformation: { op: "interpose", wire: "w-support", mediator: { id: "sleeve", name: "Sleeve" } } })).model;
  };
  for (const [model, verdict] of [[open, "spec"], [dry, "impossible"]] as const) {
    const r = await call("triz_behavior", { model: await twoBoxes(model), compare_to: model, weakest_spec: true });
    assert.deepEqual([r.verdict, r.boxes], [verdict, ["housing", "sleeve"]]);
    collect(r);
  }
  const variant = (keep: (lube: string) => boolean) => {
    const m = structuredClone(dry);
    const b = m.boxes.find((x) => x.id === "bearing")!;
    b.behavior = b.behavior!.map((r) => ({ in: r.in, out: { ...r.out, race: keep(r.in.lube) ? "supported" : "unsupported" } }));
    return m;
  };
  const ranked = await call("triz_weakness", {
    concepts: [{ id: "any", model: variant(() => true) }, { id: "oiled", model: variant((l) => l === "ok") }, { id: "dry-only", model: variant((l) => l === "dry") }],
    acceptable: [{ box: "shaft", port: "drive", values: ["rated"] }, { box: "shaft", port: "support", values: ["supported"] }],
  });
  assert.deepEqual(ranked.pairs.map((p: { order: string }) => p.order), ["first-weaker", "first-weaker", "incomparable"]);
  collect(ranked);
  // Loop classes: a wear model whose thick state is absorbing (trapped), and one that can renew (recurrent).
  const wear = (renew: boolean) => ({
    domain: "physical", carriers: [],
    boxes: [{ id: "part", name: "Part", role: "product", state: ["thin", "thick"], initial: ["thin"],
      transition: [["thin", "thin"], ["thin", "thick"], ["thick", "thick"], ...(renew ? [["thick", "thin"]] : [])].map(([state, next]) => ({ state, in: {}, next, out: {} })) }],
    wires: [],
  });
  for (const renew of [false, true]) {
    const loops = (await call("triz_dynamics", { model: wear(renew), unsafe: [{ box: "part", state: ["thick"] }] })).loops;
    assert.deepEqual(loops.classes, [renew ? "recurrent" : "trapped"]);
    collect(loops);
  }
  // Linked models: an abstraction, levels read in one model and across the map, thresholds as acceptable sets.
  const levelled = structuredClone(example("bearing-heat-behavior"));
  levelled.carriers.find((c) => c.id === "radial-load")!.levels = [{ value: "unsupported", from: 0 }, { value: "supported", from: 2500 }];
  const numeric = example("bearing-heat-feasibility");
  collect(await call("triz_abstraction", { detailed: numeric, coarse: levelled, map: { boxes: Object.fromEntries(numeric.boxes.map((b) => [b.id, b.id])) } }));
  const both = structuredClone(levelled);
  for (const b of both.boxes) b.feasibility = numeric.boxes.find((x) => x.id === b.id)!.feasibility;
  collect(await call("triz_feasibility", { model: both }));
  collect(await call("triz_weakness", { concepts: [{ id: "a", model: levelled }, { id: "b", model: levelled }], acceptable: [{ box: "shaft", port: "drive", values: ["rated"] }, { carrier: "radial-load", at_least: 2500 }] }));
  for (const n of cited) assert.ok(([...THEOREMS, ...MATHLIB_THEOREMS] as readonly string[]).includes(n), `cited '${n}' is not a listed theorem`);
  for (const n of ["typed_retarget", "typed_reverse", "typed_extend", "reach_quotient", "flow_merge_typed", "flow_merge_reach", "cheaper_part_lowers_cost", "trim_lowers_cost", "eq_projections_prod_iff", "eq_projections_prod_iff_rectangle", "eq_projections_pi_iff", "Relation.comp_eq",
    "le_residual_iff", "covers_iff_exists_eq", "not_covers_iff", "map_empty", "admits_incomparable", "card_lt_of_strictly_weaker",
    "typed_map", "reach_map", "cycle_map", "level_monotone", "level_gc", "level_band",
    "trapped_reachIn", "closed_reachIn", "covers_feasible_iff", "not_covers_feasible_iff", "required_row_of_eq",
    "safe_iff_le_concept", "concept_maximal", "exists_eq₂_iff"]) assert.ok(cited.has(n), `'${n}' is never cited`);
  assert.ok(cited.size >= 10, `only ${[...cited].join(", ")} cited`);
});

/**
 * Lemmas that pin down the semantics on fixed examples, state a fact no check computes, or serve
 * other proofs (restriction's functor laws) are not the statement any verdict uses, so none may
 * be cited or listed.
 */
test("lemmas no verdict uses exactly are proved but never listed as a verdict basis", () => {
  const sanity = ["relTrace_not_loop", "loopStates_id", "relTrace_swap", "relation_comp_mono", "relTrace_mono", "separation_on_condition", "restrict_restrict", "restrict_of_subset",
    "relation_comp_iSup_left", "relation_comp_iSup_right", "relTrace_iSup", "gc_residual", "map_residual_subset", "subset_residual_of_eq", "admits_bot", "admits_mono_ok", "atLeastAsWeak_refl", "atLeastAsWeak_trans",
    // Helpers of the two-box statements the kernel cites, and dynamics read as behaviour, which the kernel does not compute.
    "PreservesUnions₂.mono", "le_safeRows_iff", "concept_safe", "relTrace_mealyRel_iff", "relTrace_mealyRel_fixed"];
  for (const name of sanity) {
    assert.match(lean, new RegExp(`^theorem ${name}\\b`, "m"), name);
    assert.ok(!(THEOREMS as readonly string[]).includes(name), `'${name}' is listed as a verdict basis`);
  }
});

test("verdicts cite the statement they use", async () => {
  const bearing = example("bearing-heat");
  const analysed = await call("triz_function_model", { model: bearing });
  assert.deepEqual(analysed.harmLoops.map((l: { basis: string[] }) => l.basis), [["edge_on_cycle"]]);
  assert.deepEqual(analysed.ideality.ratio.basis, ["pareto_not_total"]);
  const [sep] = analysed.separation;
  assert.deepEqual(sep.basis, ["exists_section_iff"]);
  assert.deepEqual(sep.pairs[0].basis, ["separated_iff_axis", "glue_of_disjoint_regions"]);

  const irreducible = await call("triz_separate", { contradiction: {
    id: "pc", parameter: "p", axes: { space: ["edge", "core"] },
    demands: [{ id: "a", values: ["x"], space: ["edge"] }, { id: "b", values: ["y"] }, { id: "c", values: ["x", "y"] }],
  } });
  const status = Object.fromEntries(irreducible.pairs.map((p: { demands: string[]; status: string; basis?: string[] }) => [p.demands.join(), [p.status, p.basis]]));
  assert.deepEqual(status, {
    "a,b": ["irreducible", ["separated_iff_axis", "no_section_of_overlap"]],
    "a,c": ["compatible", undefined],
    "b,c": ["compatible", undefined],
  });

  const base = example("software-cache");
  const pricier = structuredClone(base);
  pricier.boxes.find((b) => b.id === "redis")!.cost = { usd_month: 100, p99_ms: 4 };
  const traded = await call("triz_function_model", { model: pricier, compare_to: base });
  assert.equal(traded.comparison.verdict, "trade-off");
  assert.deepEqual(traded.comparison.basis, ["pareto_incomparable"]);
  assert.deepEqual(traded.comparison.isomorphism.basis, undefined, "different costs: not isomorphic, nothing to cite");
  const same = await call("triz_function_model", { model: example("connection-pool"), compare_to: bearing });
  assert.deepEqual(same.comparison.isomorphism.basis, ["typed_rename", "transGen_equiv"]);

  const trim = await call("triz_trim", { model: base, trim: ["redis"] });
  assert.deepEqual(trim.functions[0].basis, ["typed_reroute"]);
  const applied = await call("triz_transform", { model: base, transformation: { op: "trim", trim: ["redis"] } });
  assert.deepEqual(applied.basis, ["typed_delete", "typed_glue", "typed_reroute"]);
  const grid = await call("triz_nine_windows", { present: bearing, subsystem: ["bearing", "shaft"] });
  assert.deepEqual([grid.windows[1].subsystem.basis, grid.windows[1].supersystem.basis], [["typed_restrict"], ["typed_delete", "typed_glue"]]);
  const dyn = await call("triz_separate", { contradiction: bearing.contradictions![0], along: "time" });
  assert.deepEqual(dyn.along.basis, ["exists_section_iff"]);
  const [first] = (await call("triz_rule_apply", { model: bearing, rule_id: "mono-bi" })).matches;
  assert.deepEqual((await call("triz_rule_apply", { model: bearing, rule_id: "mono-bi", match: first.match })).basis, ["typed_dpo"]);

  const heated = example("bearing-heat-dynamics");
  const run = await call("triz_dynamics", { model: heated, unsafe: [{ box: "shaft", state: ["hot"] }], safe: [{ box: "shaft", state: ["cold", "warm", "hot"] }] });
  assert.deepEqual([run.escalation.basis, run.invariance.basis], [["reach_of_trace"], ["reachWithin_iff_trace", "reachWithin_saturated"]]);
  assert.deepEqual(run.loops.trapped[0].basis, ["trapped_reachIn", "reach_of_trace"]);
  const short = await call("triz_dynamics", { model: heated, horizon: 1, unsafe: [{ box: "shaft", state: ["hot"] }] });
  assert.deepEqual(short.escalation.basis, ["reachWithin_iff_trace"]);
  const phases = [{ id: "cold", where: [{ box: "shaft", state: ["cold"] }], window: { from: 0, to: 0 } }, { id: "hot", where: [{ box: "shaft", state: ["hot"] }], window: { from: 1, to: 3 } }];
  assert.deepEqual((await call("triz_dynamics", { model: heated, horizon: 3, separation: phases })).separation.basis, ["reachIn_of_trace"]);
  assert.deepEqual((await call("triz_dynamics", { model: heated, horizon: 3, separation: [phases[0], { ...phases[1], window: { from: 1, to: 1 } }] })).separation.basis, ["reachIn_iff_trace"]);
});

test("a pure trim cites trim_lowers_cost for its cost relief, and only when a trimmed box declares a cost", async () => {
  const trim = await call("triz_trim", { model: example("software-cache"), trim: ["redis"] });
  assert.deepEqual([trim.costRelief, trim.costBound.basis], [{ usd_month: 400, p99_ms: 2.5 }, ["trim_lowers_cost"]]);
  const free = example("software-cache");
  delete free.boxes.find((b) => b.id === "redis")!.cost;
  const none = await call("triz_trim", { model: free, trim: ["redis"] });
  assert.deepEqual([none.costRelief, none.costBound], [{}, undefined]);
});

test("behaviour constructions cite what they use: comp_eq for an identity mediator, the product characterisations for a split", async () => {
  const behaving = example("bearing-heat-behavior");
  const via = (behavior: unknown) => call("triz_transform", { model: behaving, transformation: { op: "interpose", wire: "w-support", mediator: { id: "sleeve", name: "Sleeve", behavior } } });
  assert.deepEqual((await via("identity")).behavior.basis, ["Relation.comp_eq"]);
  assert.deepEqual((await via([{ in: { in: "supported" }, out: { out: "supported" } }, { in: { in: "unsupported" }, out: { out: "unsupported" } }])).behavior.basis, ["Relation.comp_eq"], "explicit identity rows are recognised");
  const lossy = await via([{ in: { in: "supported" }, out: { out: "unsupported" } }, { in: { in: "unsupported" }, out: { out: "unsupported" } }]);
  assert.deepEqual([lossy.behavior.identity, lossy.behavior.basis], [false, undefined]);
  assert.deepEqual((await via(undefined)).behavior, undefined);

  const split = async (parts: string[][]) => (await call("triz_transform", { model: behaving, transformation: { op: "segment", box: "bearing", parts: parts.map((ports, i) => ({ id: `part-${i}`, ports })) } })).behavior.basis;
  assert.deepEqual(await split([["preload-in", "friction"], ["race"]]), ["eq_projections_prod_iff_rectangle"]);
  assert.deepEqual(await split([["preload-in", "race"], ["friction"]]), ["eq_projections_prod_iff_rectangle", "eq_projections_prod_iff"]);
  assert.deepEqual(await split([["preload-in"], ["race"], ["friction"]]), ["eq_projections_prod_iff_rectangle", "eq_projections_pi_iff"]);
});
