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
    collect(await call("triz_dynamics", { model: m }));
    if (m.wires.length) collect(await call("triz_dynamics", { model: m, unsafe: [{ box: m.wires[0].from.box, port: m.wires[0].from.port, values: m.carriers.find((c) => c.id === m.wires[0].carrier)?.values ?? ["x"] }] }));
    if (m.wires.length) {
      const interpose = { op: "interpose", wire: m.wires[0].id, mediator: { id: "mediator-x", name: "M" } };
      collect(await call("triz_transform", { model: m, transformation: interpose }));
      collect(await call("triz_nine_windows", { present: m, subsystem: [m.wires[0].from.box, m.wires[0].to.box, "mediator-x"], transitions: { present_to_future: [interpose] } }));
    }
  }
  collect(await call("triz_transform", { model: example("software-cache"), transformation: { op: "trim", trim: ["redis"] } }));
  const bearing = example("bearing-heat"), cache = example("software-cache");
  for (const [model, transformation] of [
    [bearing, { op: "merge", boxes: ["bearing", "shaft"], into: { id: "rotor", name: "Rotor", role: "product" } }],
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
  for (const n of ["typed_retarget", "typed_reverse", "typed_extend", "reach_quotient", "cheaper_part_lowers_cost"]) assert.ok(cited.has(n), `'${n}' is never cited`);
  for (const n of cited) assert.ok(([...THEOREMS, ...MATHLIB_THEOREMS] as readonly string[]).includes(n), `cited '${n}' is not a listed theorem`);
  assert.ok(cited.size >= 10, `only ${[...cited].join(", ")} cited`);
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
  assert.deepEqual([grid.windows[1].subsystem.basis, grid.windows[1].supersystem.basis], [["typed_restrict", "restrict_restrict"], ["typed_delete", "typed_glue"]]);
  const dyn = await call("triz_separate", { contradiction: bearing.contradictions![0], along: "time" });
  assert.deepEqual(dyn.along.basis, ["exists_section_iff"]);

  const heated = example("bearing-heat-dynamics");
  const run = await call("triz_dynamics", { model: heated, unsafe: [{ box: "shaft", state: ["hot"] }], safe: [{ box: "shaft", state: ["cold", "warm", "hot"] }] });
  assert.deepEqual([run.escalation.basis, run.invariance.basis], [["reach_of_trace"], ["reachWithin_iff_trace", "reachWithin_saturated"]]);
  const short = await call("triz_dynamics", { model: heated, horizon: 1, unsafe: [{ box: "shaft", state: ["hot"] }] });
  assert.deepEqual(short.escalation.basis, ["reachWithin_iff_trace"]);
  const phases = [{ id: "cold", where: [{ box: "shaft", state: ["cold"] }], window: { from: 0, to: 0 } }, { id: "hot", where: [{ box: "shaft", state: ["hot"] }], window: { from: 1, to: 3 } }];
  assert.deepEqual((await call("triz_dynamics", { model: heated, horizon: 3, separation: phases })).separation.basis, ["reachIn_of_trace"]);
  assert.deepEqual((await call("triz_dynamics", { model: heated, horizon: 3, separation: [phases[0], { ...phases[1], window: { from: 1, to: 1 } }] })).separation.basis, ["reachIn_iff_trace"]);
});
