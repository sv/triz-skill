/**
 * Cross-check of `externalBehavior` against theory/Semantics.lean.
 *
 * The reference below transcribes the Lean definitions literally and shares no code with
 * src/act-behavior.ts:
 *  - `steadyStates`: every valuation of every port over its carrier's declared values that every
 *    box relation admits (`ofRows`: the box's ports read one of its rows) and every wire equality
 *    admits;
 *  - `external`: the steady states projected onto the inputs (the unwired input ports) and the
 *    outputs (the deliverables).
 *
 * The evaluator composes only the boxes that can reach a deliverable, so the reference is applied
 * to that upstream part, re-derived here from the wires. On the whole model, every steady state
 * restricts to one of the upstream part, so the evaluator relates at least what the whole model
 * relates on the upstream inputs; the two are equal when every box is upstream. Lean does not
 * state this restriction; the test checks it, and gives total downstream boxes that make the
 * whole model relate strictly less.
 *
 * Checked on seeded random models (feedback loops, fan-out, fan-in, partial and several-valued
 * relations, missing behaviour) and on the repository's example that declares behaviour, as given
 * and trimmed. Agreement on these is evidence, not extraction: nothing is generated from Lean.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel } from "../src/act.js";
import { externalBehavior } from "../src/act-behavior.js";
import { applyTrim } from "../src/act-rewrite.js";
import { rng, int, pick, type Rng } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));

type Side = "in" | "out";
type Port = { box: string; side: Side; port: string; carrier: string };

/** `OpenDiagram`: ports with declared values, boxes as rows over their own ports, wires, interface. */
interface Diagram {
  ports: Port[];
  values: string[][];
  /** `rows` undefined: a box that declares no behaviour admits every valuation. */
  boxes: Array<{ id: string; ports: number[]; rows?: Set<string> }>;
  wires: Array<[number, number]>;
  input: number[];
  output: number[];
}

const tuple = (xs: string[]) => JSON.stringify(xs);
const portKey = (box: string, side: Side, port: string) => JSON.stringify([box, side, port]);

/** Deliverables: input ports of product boxes fed by a non-harmful function, in model order. */
function deliverables(model: FunctionModel): Port[] {
  return model.boxes.filter((b) => b.role === "product").flatMap((b) => (b.inputs ?? [])
    .filter((q) => model.wires.some((w) => w.to.box === b.id && w.to.port === q.id && w.polarity !== "harmful"))
    .map((q) => ({ box: b.id, side: "in" as const, port: q.id, carrier: q.carrier })));
}

/** The boxes that can reach a deliverable: backwards along every wire, harmful ones included. */
function upstream(model: FunctionModel): Set<string> {
  const reached = new Set<string>();
  const into = (box: string, port: string) => model.wires.filter((w) => w.to.box === box && w.to.port === port);
  const queue = deliverables(model).flatMap((d) => into(d.box, d.port).map((w) => w.from.box));
  while (queue.length) {
    const id = queue.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const q of model.boxes.find((b) => b.id === id)!.inputs ?? []) queue.push(...into(id, q.id).map((w) => w.from.box));
  }
  return reached;
}

/**
 * The kernel's reading of a model as an open diagram, over the boxes `keep` and the deliverable
 * ports: a box's relation is its rows over its own ports, a wire into a kept port equates it with
 * its source, the inputs are the kept input ports no wire feeds, and the outputs the deliverables.
 */
function diagramOf(model: FunctionModel, keep: Set<string>): Diagram {
  const ports: Port[] = [];
  const index = new Map<string, number>();
  const add = (p: Port) => {
    const k = portKey(p.box, p.side, p.port);
    if (!index.has(k)) { index.set(k, ports.length); ports.push(p); }
    return index.get(k)!;
  };
  const kept = model.boxes.filter((b) => keep.has(b.id));
  for (const b of kept) {
    for (const q of b.inputs ?? []) add({ box: b.id, side: "in", port: q.id, carrier: q.carrier });
    for (const q of b.outputs ?? []) add({ box: b.id, side: "out", port: q.id, carrier: q.carrier });
  }
  const output = deliverables(model).map(add);
  const values = ports.map((p) => model.carriers.find((c) => c.id === p.carrier)!.values ?? []);
  const boxes = kept.map((b) => ({
    id: b.id,
    ports: [...(b.inputs ?? []).map((q) => index.get(portKey(b.id, "in", q.id))!), ...(b.outputs ?? []).map((q) => index.get(portKey(b.id, "out", q.id))!)],
    rows: b.behavior && new Set(b.behavior.map((r) => tuple([...(b.inputs ?? []).map((q) => r.in[q.id]), ...(b.outputs ?? []).map((q) => r.out[q.id])]))),
  }));
  const wires: Array<[number, number]> = [];
  for (const w of model.wires) {
    const t = index.get(portKey(w.to.box, "in", w.to.port));
    if (t === undefined) continue;
    const s = index.get(portKey(w.from.box, "out", w.from.port));
    assert.notEqual(s, undefined, `wire '${w.id}' feeds a kept port from a box that is not kept`);
    wires.push([s!, t]);
  }
  const fed = new Set(wires.map(([, t]) => t));
  const input = ports.flatMap((p, i) => (p.side === "in" && !fed.has(i) ? [i] : []));
  return { ports, values, boxes, wires, input, output };
}

/** Every valuation of `sizes`-many values per position, first position fastest. */
function* odometer(sizes: number[]) {
  const total = sizes.reduce((n, k) => n * k, 1);
  for (let n = 0; n < total; n++) {
    let rest = n;
    yield sizes.map((k) => { const x = rest % k; rest = Math.floor(rest / k); return x; });
  }
}

/** `steadyStates`: all port valuations, filtered by every box relation and every wire. */
function steadyStates(d: Diagram): string[][] {
  const out: string[][] = [];
  for (const ix of odometer(d.values.map((v) => v.length))) {
    const s = ix.map((x, p) => d.values[p][x]);
    if (d.boxes.every((b) => !b.rows || b.rows.has(tuple(b.ports.map((p) => s[p])))) && d.wires.every(([a, b]) => s[a] === s[b])) out.push(s);
  }
  return out;
}

/** `external`, with the steady states at each input valuation: input key → output keys and states. */
function external(d: Diagram) {
  const states = steadyStates(d);
  const table = new Map<string, { outputs: Set<string>; states: string[][] }>();
  for (const ix of odometer(d.input.map((p) => d.values[p].length))) {
    table.set(tuple(ix.map((x, j) => d.values[d.input[j]][x])), { outputs: new Set(), states: [] });
  }
  for (const s of states) {
    const row = table.get(tuple(d.input.map((p) => s[p])))!;
    row.outputs.add(tuple(d.output.map((p) => s[p])));
    row.states.push(s);
  }
  return { table, states };
}

const label = (p: { box: string; port: string }) => `${p.box}.${p.port}`;

/**
 * Assert that `externalBehavior` returns exactly the reference relation of the upstream diagram:
 * the same inputs and deliverables, every input valuation listed, the same outputs and number of
 * steady states at each, each listed steady state a reference steady state, and the same inputs
 * with none. Returns the reference for further checks.
 */
function assertAgrees(model: FunctionModel, name: string) {
  const r = externalBehavior(model);
  const keep = upstream(model);
  const missing = model.boxes.filter((b) => keep.has(b.id) && !b.behavior).map((b) => b.id);
  if (!deliverables(model).length) {
    assert.equal(r.ok, false, name);
    return undefined;
  }
  assert.ok(r.ok, `${name}: ${!r.ok && r.errors.join("; ")}`);
  if (missing.length) {
    assert.equal(r.decided, false, name);
    assert.deepEqual(!r.decided && [...r.missingBehavior].sort(), [...missing].sort(), name);
    return undefined;
  }
  assert.ok(r.decided, name);
  const d = diagramOf(model, keep);
  const ref = external(d);
  assert.deepEqual([...r.composed].sort(), [...keep].sort(), `${name}: composed boxes`);
  assert.deepEqual(r.deliverables.map(label), d.output.map((p) => label(d.ports[p])), `${name}: deliverables`);
  assert.deepEqual(r.inputs.map(label).sort(), d.input.map((p) => label(d.ports[p])).sort(), `${name}: inputs`);
  assert.equal(r.inputValuations, ref.table.size, `${name}: input valuations`);
  assert.equal(r.relation.length, r.inputValuations, `${name}: the relation is listed in full`);

  // The evaluator's input order, read in the reference's.
  const order = d.input.map((p) => r.inputs.findIndex((q) => label(q) === label(d.ports[p])));
  const at = (x: string[]) => tuple(order.map((j) => x[j]));
  const byLabel = new Map(d.ports.map((p, i) => [label(p), i]));
  for (const row of r.relation) {
    const want = ref.table.get(at(row.input));
    assert.ok(want, `${name}: input ${tuple(row.input)} is not a reference input`);
    assert.deepEqual(row.outputs.map(tuple).sort(), [...want.outputs].sort(), `${name}: outputs at ${tuple(row.input)}`);
    assert.equal(row.steadyStateCount, want.states.length, `${name}: steady states at ${tuple(row.input)}`);
    assert.equal(row.steadyStates.length, Math.min(want.states.length, 10), name);
    assert.equal(new Set(row.steadyStates.map(tuple)).size, row.steadyStates.length, `${name}: listed states are distinct`);
    for (const st of row.steadyStates) {
      const vars = r.variables.map((v) => byLabel.get(label(v))!);
      assert.ok(want.states.some((s) => vars.every((p, j) => s[p] === st[j])), `${name}: listed state ${tuple(st)} is a reference steady state`);
    }
  }
  const empty = [...ref.table].filter(([, v]) => !v.states.length).map(([k]) => k).sort();
  assert.deepEqual(r.noSteadyState.map(at).sort(), empty, `${name}: inputs with no steady state`);
  return { r, d, ref };
}

const ROLES = ["tool", "mediator", "environment", "supersystem", "product"] as const;
const POLARITIES = ["useful", "insufficient", "excessive", "harmful"] as const;

/** A small random model: every box but some declares behaviour, as total, partial, or several-valued rows. */
function genModel(r: Rng): FunctionModel {
  const carriers = Array.from({ length: int(r, 1, 2) }, (_, i) => ({
    id: `c${i}`, layer: "information" as const, dimension: "unit", values: Array.from({ length: int(r, 1, 3) }, (_, v) => `v${v}`),
  }));
  const boxes: FunctionModel["boxes"] = Array.from({ length: int(r, 2, 4) }, (_, i) => {
    const inputs = Array.from({ length: int(r, 0, 2) }, (_, j) => ({ id: `i${j}`, carrier: pick(r, carriers).id }));
    const outputs = Array.from({ length: int(r, i === 0 ? 0 : 1, 2) }, (_, j) => ({ id: `o${j}`, carrier: pick(r, carriers).id }));
    return { id: `b${i}`, name: `box ${i}`, role: i === 0 ? "product" : pick(r, ROLES), ...(inputs.length ? { inputs } : {}), ...(outputs.length ? { outputs } : {}) };
  });
  if (!boxes[0].inputs) boxes[0].inputs = [{ id: "i0", carrier: carriers[0].id }];
  const outs = boxes.flatMap((b) => (b.outputs ?? []).map((q) => ({ box: b.id, port: q.id, carrier: q.carrier })));
  const ins = boxes.flatMap((b) => (b.inputs ?? []).map((q) => ({ box: b.id, port: q.id, carrier: q.carrier })));
  const wires: FunctionModel["wires"] = [];
  const wire = (from: (typeof outs)[number], to: (typeof ins)[number], polarity: (typeof POLARITIES)[number]) =>
    wires.push({ id: `w${wires.length}`, from: { box: from.box, port: from.port }, to: { box: to.box, port: to.port }, carrier: from.carrier, polarity });
  // A function into the product first, so most models deliver something.
  const target = ins.find((q) => q.box === "b0")!;
  const feeders = outs.filter((q) => q.carrier === target.carrier);
  if (feeders.length) wire(pick(r, feeders), target, pick(r, ["useful", "insufficient", "excessive"] as const));
  for (let k = int(r, 0, 5); k > 0; k--) {
    const from = pick(r, outs);
    const to = ins.filter((q) => q.carrier === from.carrier);
    if (to.length) wire(from, pick(r, to), pick(r, POLARITIES));
  }
  const values = new Map(carriers.map((c) => [c.id, c.values]));
  for (const b of boxes) {
    if (r() < 0.08) continue;
    const ports = [...(b.inputs ?? []).map((q) => ({ ...q, side: "in" as const })), ...(b.outputs ?? []).map((q) => ({ ...q, side: "out" as const }))];
    const nIn = (b.inputs ?? []).length;
    const all = [...odometer(ports.map((q) => values.get(q.carrier)!.length))].map((ix) => ix.map((x, j) => values.get(ports[j].carrier)![x]));
    const mode = pick(r, ["function", "partial", "relation", "all"] as const);
    let rows: string[][];
    if (mode === "all") rows = all;
    else if (mode === "relation") rows = all.filter(() => r() < 0.5);
    else {
      const byInput = new Map<string, string[][]>();
      for (const t of all) byInput.set(tuple(t.slice(0, nIn)), [...(byInput.get(tuple(t.slice(0, nIn))) ?? []), t]);
      rows = [...byInput.values()].filter(() => mode === "function" || r() < 0.6).map((ts) => pick(r, ts));
    }
    if (!rows.length) rows = [pick(r, all)];
    b.behavior = rows.map((t) => ({
      in: Object.fromEntries(ports.flatMap((q, j) => (q.side === "in" ? [[q.id, t[j]]] : []))),
      out: Object.fromEntries(ports.flatMap((q, j) => (q.side === "out" ? [[q.id, t[j]]] : []))),
    }));
  }
  return { domain: "software", system: "generated", carriers, boxes, wires };
}

/** Port valuations of the whole model: the brute force's cost. */
const size = (m: FunctionModel) => m.boxes.reduce((n, b) => n * [...(b.inputs ?? []), ...(b.outputs ?? [])]
  .reduce((k, q) => k * m.carriers.find((c) => c.id === q.carrier)!.values!.length, 1), 1);

/** Whether the wires among `keep` close a loop. */
function hasLoop(model: FunctionModel, keep: Set<string>) {
  const next = (id: string) => model.wires.filter((w) => w.from.box === id && keep.has(w.to.box)).map((w) => w.to.box);
  return [...keep].some((start) => {
    const seen = new Set<string>(), stack = next(start);
    while (stack.length) {
      const id = stack.pop()!;
      if (id === start) return true;
      if (!seen.has(id)) { seen.add(id); stack.push(...next(id)); }
    }
    return false;
  });
}

test("externalBehavior equals the Lean semantics of its upstream part on seeded random models", () => {
  const seen = { decided: 0, undecided: 0, noDeliverable: 0, loop: 0, fanOut: 0, fanIn: 0, partial: 0, several: 0, empty: 0, allUpstream: 0, downstream: 0, wider: 0 };
  let seed = 0;
  for (let n = 0; n < 400; seed++) {
    const r = rng(0x5e3a + seed);
    const m = genModel(r);
    if (size(m) > 20_000) continue;
    n++;
    assert.deepEqual(checkModel(m), { ok: true, errors: [], issues: [] }, `seed ${seed}`);
    const res = assertAgrees(m, `seed ${seed}`);
    if (!deliverables(m).length) { seen.noDeliverable++; continue; }
    if (!res) { seen.undecided++; continue; }
    seen.decided++;
    const { r: out, d, ref } = res;
    const keep = upstream(m);
    if (hasLoop(m, keep)) seen.loop++;
    const count = (ends: number[]) => ends.some((e, i) => ends.indexOf(e) !== i);
    if (count(d.wires.map(([s]) => s))) seen.fanOut++;
    if (count(d.wires.map(([, t]) => t))) seen.fanIn++;
    if (m.boxes.some((b) => keep.has(b.id) && (b.inputs ?? []).length && new Set(b.behavior!.map((row) => tuple((b.inputs ?? []).map((q) => row.in[q.id])))).size
      < (b.inputs ?? []).reduce((k, q) => k * m.carriers.find((c) => c.id === q.carrier)!.values!.length, 1))) seen.partial++;
    if (out.severalSteadyStates) seen.several++;
    if (out.noSteadyState.length) seen.empty++;

    // The whole model: the evaluator relates at least what the whole diagram does on the upstream
    // inputs. When every box is upstream the two diagrams are the same, so the agreement above is
    // with the whole model's semantics.
    if (keep.size === m.boxes.length) { seen.allUpstream++; continue; }
    if (m.boxes.some((b) => !b.behavior)) continue;
    seen.downstream++;
    const whole = diagramOf(m, new Set(m.boxes.map((b) => b.id)));
    const full = external(whole);
    const upInputs = d.input.map((p) => whole.ports.findIndex((q) => label(q) === label(d.ports[p]) && q.side === "in"));
    for (const s of full.states) {
      const row = ref.table.get(tuple(upInputs.map((p) => s[p])))!;
      assert.ok(row.outputs.has(tuple(whole.output.map((p) => s[p]))), `seed ${seed}: a steady state of the whole model is one of its upstream part`);
    }
    // Strictly wider: a downstream box rules out a pair the evaluator relates.
    const projected = new Set(full.states.map((s) => tuple([...upInputs, ...whole.output].map((p) => s[p]))));
    const upper = new Set(ref.states.map((s) => tuple([...d.input, ...d.output].map((p) => s[p]))));
    if (projected.size < upper.size) seen.wider++;
  }
  // Every case the cross-check claims to cover occurred.
  for (const [k, v] of Object.entries(seen)) assert.ok(v > 0, `no generated model had: ${k} (${JSON.stringify(seen)})`);
  assert.ok(seen.decided >= 150, JSON.stringify(seen));
});

test("externalBehavior equals the Lean semantics on the examples, as given and trimmed", () => {
  const dir = path.resolve(here, "../examples/function-models");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) assertAgrees(example(f.slice(0, -5)), f);
  const bearing = example("bearing-heat-behavior");
  const res = assertAgrees(bearing, "bearing-heat-behavior");
  assert.ok(res, "the bearing declares behaviour for every upstream box");
  assert.equal(res.ref.states.length, 2, "the heat loop's two steady states");
  const trimmed = applyTrim(bearing, { trim: ["bearing"] });
  assert.ok(trimmed.ok);
  assert.ok(assertAgrees(trimmed.model, "bearing trimmed, the housing absorbing support"));
});

/** One box `src` with an output into the product, and `extra` boxes and wires downstream of it. */
function withDownstream(extra: Pick<FunctionModel, "boxes" | "wires">): FunctionModel {
  return {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "src", name: "Source", role: "tool", outputs: [{ id: "a", carrier: "c" }, { id: "b", carrier: "c" }], behavior: [{ in: {}, out: { a: "0", b: "1" } }] },
      { id: "user", name: "User", role: "product", inputs: [{ id: "p", carrier: "c" }] },
      ...extra.boxes,
    ],
    wires: [{ id: "w-out", from: { box: "src", port: "a" }, to: { box: "user", port: "p" }, carrier: "c", polarity: "useful" }, ...extra.wires],
  };
}

test("upstream only: a total downstream box can still rule out every steady state of the whole model", () => {
  // A downstream negation loop: total, so not listed as partial, yet the whole model has no steady state.
  const loop = withDownstream({
    boxes: [{ id: "neg", name: "Negation", role: "environment", inputs: [{ id: "x", carrier: "c" }], outputs: [{ id: "y", carrier: "c" }],
      behavior: [{ in: { x: "0" }, out: { y: "1" } }, { in: { x: "1" }, out: { y: "0" } }] }],
    wires: [{ id: "w-loop", from: { box: "neg", port: "y" }, to: { box: "neg", port: "x" }, carrier: "c", polarity: "useful" }],
  });
  // Fan-in at a downstream port: it equates the source's two outputs, which differ.
  const fanIn = withDownstream({
    boxes: [{ id: "sink", name: "Sink", role: "environment", inputs: [{ id: "s", carrier: "c" }], behavior: [{ in: { s: "0" }, out: {} }, { in: { s: "1" }, out: {} }] }],
    wires: [
      { id: "w-a", from: { box: "src", port: "a" }, to: { box: "sink", port: "s" }, carrier: "c", polarity: "useful" },
      { id: "w-b", from: { box: "src", port: "b" }, to: { box: "sink", port: "s" }, carrier: "c", polarity: "useful" },
    ],
  });
  for (const [name, m] of [["downstream negation loop", loop], ["downstream fan-in", fanIn]] as const) {
    const res = assertAgrees(m, name);
    assert.ok(res);
    assert.deepEqual(res.r.partialDownstream, [], `${name}: every downstream relation is total`);
    assert.deepEqual(res.r.relation[0].outputs, [["0"]], `${name}: the upstream part delivers`);
    assert.equal(steadyStates(diagramOf(m, new Set(m.boxes.map((b) => b.id)))).length, 0, `${name}: the whole model has no steady state`);
  }
});
