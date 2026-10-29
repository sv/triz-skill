/**
 * Metamorphic checks beyond the wiring kernel. The relabeller preserves and renames semantic
 * annotations (the older support/gen.relabel deliberately drops them). Every semantic collection
 * is compared in full; the small models stay below display/search caps. Search work counters and
 * free text are excluded. Tied witnesses are checked for validity and length, never identity.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FunctionModel, checkModel } from "../src/act.js";
import { feasibility } from "../src/act-feasibility.js";
import { boundedDynamics, checkRun, type Condition, type DynamicsSpec, type RunStep } from "../src/act-dynamics.js";
import { cheapCopy, feedback, merge, rerate, retarget, reverse, standby } from "../src/act-principles.js";
import { flowAnalysis, mapFlows, restrictFlows } from "../src/act-flow.js";
import { rng, shuffle, type Rng } from "./support/gen.js";

type Model = FunctionModel;
const fixture = (name: string): Model => FunctionModel.parse(JSON.parse(fs.readFileSync(new URL(`../examples/function-models/${name}.json`, import.meta.url), "utf8")));
const sorted = <T>(xs: T[]) => [...xs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

/** All families reverse lexical order; independent seeded permutations also change declaration order. */
function rename(m: Model, random: Rng, extraAtoms: string[] = []) {
  const inverse = new Map<string, string>();
  const family = (xs: string[], tag: string) => new Map([...new Set(xs)].sort().map((x, i, all) => {
    const renamed = `${tag}:${String(all.length - i).padStart(4, "0")}`;
    inverse.set(renamed, x);
    return [x, renamed];
  }));
  const boxes = family(m.boxes.map((b) => b.id), "B"), wires = family(m.wires.map((w) => w.id), "W"), carriers = family(m.carriers.map((c) => c.id), "C");
  const flows = family((m.flows ?? []).map((f) => f.id), "F");
  const dims = family([...m.boxes.flatMap((b) => [...Object.keys(b.cost ?? {}), ...(b.feasibility ?? []).flatMap((r) => Object.keys(r.cost ?? {}))]), ...Object.keys(m.budget ?? {}), ...Object.keys(m.weights ?? {}).filter((d) => d !== "harmful")], "D");
  const atoms = family([...m.carriers.flatMap((c) => c.values ?? []), ...m.boxes.flatMap((b) => b.state ?? []), ...extraAtoms], "V");
  const ports = new Map(m.boxes.map((b, i) => [b.id, family([...(b.inputs ?? []), ...(b.outputs ?? [])].map((p) => p.id), `P${i}`)]));
  for (const b of m.boxes) for (const p of [...(b.inputs ?? []), ...(b.outputs ?? [])]) inverse.set(`${boxes.get(b.id)}.${ports.get(b.id)!.get(p.id)}`, `${b.id}.${p.id}`);
  const box = (x: string) => boxes.get(x)!;
  const atom = (x: string) => atoms.get(x)!;
  const port = (b: string, x: string) => ports.get(b)!.get(x)!;
  const end = (e: { box: string; port: string }) => ({ box: box(e.box), port: port(e.box, e.port) });
  const cost = (x: Record<string, number> | undefined) => x && Object.fromEntries(shuffle(random, Object.entries(x)).map(([k, v]) => [k === "harmful" ? k : dims.get(k)!, v]));
  const record = <T>(b: string, x: Record<string, T>) => Object.fromEntries(shuffle(random, Object.entries(x)).map(([k, v]) => [port(b, k), v]));
  const behavior = (b: string, r: { in: Record<string, string>; out: Record<string, string> }) => ({ in: record(b, Object.fromEntries(Object.entries(r.in).map(([k, v]) => [k, atom(v)]))), out: record(b, Object.fromEntries(Object.entries(r.out).map(([k, v]) => [k, atom(v)]))) });
  const model: Model = {
    ...m,
    carriers: shuffle(random, m.carriers.map((c) => ({ ...c, id: carriers.get(c.id)!, ...(c.values ? { values: shuffle(random, c.values.map(atom)) } : {}) }))),
    boxes: shuffle(random, m.boxes.map((b) => ({
      ...b, id: box(b.id), ...(b.cost ? { cost: cost(b.cost) } : {}),
      ...(b.inputs ? { inputs: shuffle(random, b.inputs.map((p) => ({ ...p, id: port(b.id, p.id), carrier: carriers.get(p.carrier)! }))) } : {}),
      ...(b.outputs ? { outputs: shuffle(random, b.outputs.map((p) => ({ ...p, id: port(b.id, p.id), carrier: carriers.get(p.carrier)! }))) } : {}),
      ...(b.behavior ? { behavior: shuffle(random, b.behavior.map((r) => behavior(b.id, r))) } : {}),
      ...(b.producible ? { producible: shuffle(random, b.producible.map((r) => behavior(b.id, r))) } : {}),
      ...(b.state ? { state: shuffle(random, b.state.map(atom)), initial: shuffle(random, b.initial!.map(atom)) } : {}),
      ...(b.transition ? { transition: shuffle(random, b.transition.map((r) => ({ ...behavior(b.id, r), state: atom(r.state), next: atom(r.next) }))) } : {}),
      ...(b.feasibility ? { feasibility: shuffle(random, b.feasibility.map((r) => ({ ...r, ...(r.provides ? { provides: record(b.id, r.provides) } : {}), ...(r.requires ? { requires: record(b.id, r.requires) } : {}), ...(r.cost ? { cost: cost(r.cost) } : {}) }))) } : {}),
    }))),
    wires: shuffle(random, m.wires.map((w) => ({ ...w, id: wires.get(w.id)!, from: end(w.from), to: end(w.to), carrier: carriers.get(w.carrier)! }))),
    ...(m.flows ? { flows: shuffle(random, m.flows.map((f) => ({ ...f, id: flows.get(f.id)!, carrier: carriers.get(f.carrier)!, path: f.path.map(box), ...(f.medium ? { medium: box(f.medium) } : {}) }))) } : {}),
    ...(m.budget ? { budget: cost(m.budget) } : {}), ...(m.weights ? { weights: cost(m.weights) } : {}),
  };
  const back = (x: string): string => {
    if (inverse.has(x)) return inverse.get(x)!;
    for (const [renamed, original] of inverse) if (x.startsWith(renamed + "/")) return original + x.slice(renamed.length);
    return x;
  };
  const conditions = (xs: Condition[]) => shuffle(random, xs.map((c) => "state" in c ? { box: box(c.box), state: shuffle(random, c.state.map(atom)) } : { ...end(c), values: shuffle(random, c.values.map(atom)) }));
  const spec = (s: DynamicsSpec): DynamicsSpec => ({ ...s,
    ...(s.initial ? { initial: Object.fromEntries(shuffle(random, Object.entries(s.initial)).map(([b, states]) => [box(b), shuffle(random, states.map(atom))])) } : {}),
    ...(s.unsafe ? { unsafe: conditions(s.unsafe) } : {}), ...(s.safe ? { safe: conditions(s.safe) } : {}),
    ...(s.inputs ? { inputs: s.inputs.map((xs) => shuffle(random, xs.map((x) => ({ ...end(x), values: shuffle(random, x.values.map(atom)) })))) } : {}),
    ...(s.separation ? { separation: shuffle(random, s.separation.map((d) => ({ ...d, id: atom(d.id), where: conditions(d.where) }))) } : {}),
  });
  assert.ok(checkModel(model).ok, checkModel(model).errors.join("; "));
  return { model, box, wire: (x: string) => wires.get(x)!, carrier: (x: string) => carriers.get(x)!, port, end, cost, atom, back, spec };
}

/** Canonical full collections; only flow path order is semantic among these model/result arrays. */
function canonical(value: unknown, back: (x: string) => string = (x) => x, field = ""): unknown {
  if (typeof value === "string") return back(value);
  if (Array.isArray(value)) {
    const xs = value.map((x) => canonical(x, back));
    return field === "path" ? xs : sorted(xs);
  }
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([k]) => !["note", "system", "name", "domain", "layer", "dimension", "label", "action", "verb", "statesExplored", "iterations", "antichainPeak", "candidates"].includes(k))
    .map(([k, v]) => [back(k), canonical(v, back, k)]).sort(([a], [b]) => String(a).localeCompare(String(b))));
  return value;
}

/** Witness row choices may tie; independently check their resources and every propagated demand. */
function feasibilitySummary(m: Model) {
  const r = feasibility(m, {}, { listAll: true });
  assert.ok(r.ok && "minimal" in r);
  assert.equal(r.minimal.length, r.minimalCount);
  const minimal = r.minimal.map((v) => {
    assert.equal(v.rows.length, r.composed.length);
    const chosen = new Map(v.rows.map((x) => [x.box, m.boxes.find((b) => b.id === x.box)!.feasibility![x.row]]));
    const demanded = new Map(v.levels.map((p) => [JSON.stringify([p.box, p.port]), p.level]));
    const operating: Record<string, number> = {};
    for (const [b, row] of chosen) {
      for (const [d, n] of Object.entries(row.cost ?? {})) operating[d] = (operating[d] ?? 0) + n;
      for (const [p, level] of Object.entries(row.provides ?? {})) assert.ok(level >= (demanded.get(JSON.stringify([b, p])) ?? 0));
      for (const [p, level] of Object.entries(row.requires ?? {})) for (const w of m.wires.filter((w) => w.to.box === b && w.to.port === p && w.polarity !== "harmful")) assert.ok((demanded.get(JSON.stringify([w.from.box, w.from.port])) ?? 0) >= level);
    }
    for (const [d, n] of Object.entries(v.operating)) assert.equal(n, operating[d] ?? 0);
    for (const [d, n] of Object.entries(v.resources)) assert.equal(n, (r.fixed[d] ?? 0) + (operating[d] ?? 0));
    return { ...v, rows: v.rows.length };
  });
  return { ...r, minimal, ...("withinBudget" in r ? { withinBudget: r.withinBudget!.map((i) => r.minimal[i].resources) } : {}) };
}

function flowFixture(): Model {
  return {
    domain: "software", carriers: [{ id: "c", layer: "information", dimension: "unit" }],
    boxes: [
      ...["a", "b", "p"].map((id) => ({ id, name: id, role: id === "p" ? "product" as const : "tool" as const, inputs: [{ id: "in", carrier: "c" }], outputs: [{ id: "out", carrier: "c" }], cost: { usd: id === "a" ? 10 : 5, time: 1 } })),
      { id: "env", name: "Environment", role: "environment", inputs: [{ id: "in", carrier: "c" }] },
    ],
    wires: [
      { id: "ab", from: { box: "a", port: "out" }, to: { box: "b", port: "in" }, carrier: "c", polarity: "useful" },
      { id: "bp", from: { box: "b", port: "out" }, to: { box: "p", port: "in" }, carrier: "c", polarity: "insufficient" },
      { id: "pa", from: { box: "p", port: "out" }, to: { box: "a", port: "in" }, carrier: "c", polarity: "harmful" },
      { id: "leak", from: { box: "b", port: "out" }, to: { box: "env", port: "in" }, carrier: "c", polarity: "harmful" },
    ],
    flows: [{ id: "main", carrier: "c", path: ["a", "b", "p", "a", "b"] }, { id: "feed", carrier: "c", path: ["env", "b", "p"] }, { id: "medium", carrier: "c", medium: "p", path: ["a", "b"] }],
    budget: { usd: 30, time: 4 },
  };
}

/** Inspect every structural cycle, then replace tied cycle witnesses by their lengths. */
function cycleSummary(m: Model, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((x) => cycleSummary(m, x));
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const result = { ...obj };
  for (const k of ["cycle", ...(typeof obj.via === "string" ? ["path"] : [])]) if (Array.isArray(obj[k]) && obj[k].every((v) => typeof v === "string")) {
    const cycle = obj[k] as string[];
    assert.equal(cycle[0], cycle.at(-1));
    for (let i = 1; i < cycle.length; i++) assert.ok(m.wires.some((w) => w.from.box === cycle[i - 1] && w.to.box === cycle[i]));
    result[k] = { length: cycle.length };
  }
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, cycleSummary(m, v)]));
}

test("metamorphic: full feasibility antichains and checked witnesses survive lexical reversal and row permutations (40 seeds)", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = fixture("bearing-heat-feasibility");
    // Vary budgets and add a genuine two-resource tradeoff, preserving integer exactness.
    m.budget = { usd_unit: 175 + seed % 9, service_h_year: 2 + seed % 4 };
    m.boxes.find((b) => b.id === "bearing")!.feasibility = [{ provides: { race: 3000 }, cost: { usd_unit: 2 + seed % 3 } }, { provides: { race: 3000 }, cost: { service_h_year: 1 + seed % 2 } }];
    const n = rename(m, rng(810_000 + seed));
    assert.deepEqual(canonical(feasibilitySummary(n.model), n.back), canonical(feasibilitySummary(m)), `feasibility seed ${seed}`);
  }
});

test("metamorphic: all principle constructions commute with semantic relabelling and flow permutations (40 seeds)", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = flowFixture(), n = rename(m, rng(820_000 + seed));
    const pairs = [
      [merge(m, { boxes: ["a", "b"], into: { id: "merged", name: "Merged", role: "tool" } }), merge(n.model, { boxes: [n.box("b"), n.box("a")], into: { id: "merged", name: "Merged", role: "tool" } })],
      [rerate(m, { wire: "ab", polarity: "excessive" }), rerate(n.model, { wire: n.wire("ab"), polarity: "excessive" })],
      [feedback(m, { wire: { id: "feedback", from: { box: "b", port: "out" }, to: { box: "a", port: "in" }, carrier: "c", polarity: "useful" } }), feedback(n.model, { wire: { id: "feedback", from: n.end({ box: "b", port: "out" }), to: n.end({ box: "a", port: "in" }), carrier: n.carrier("c"), polarity: "useful" } })],
      [retarget(m, { wire: "pa", to: { box: "b", port: "in" } }), retarget(n.model, { wire: n.wire("pa"), to: n.end({ box: "b", port: "in" }) })],
      [reverse(m, { wire: "ab" }), reverse(n.model, { wire: n.wire("ab") })],
      [standby(m, { box: "a", standby: { id: "backup", name: "Backup", cost: { usd: 2 } } }), standby(n.model, { box: n.box("a"), standby: { id: "backup", name: "Backup", cost: n.cost({ usd: 2 }) } })],
      [cheapCopy(m, { box: "a", copy: { id: "copy", cost: { usd: 4, time: 1 } } }), cheapCopy(n.model, { box: n.box("a"), copy: { id: "copy", cost: n.cost({ usd: 4, time: 1 })! } })],
    ];
    for (const [a, b] of pairs) {
      assert.ok(a.ok && b.ok, JSON.stringify([a, b]));
      assert.ok(checkModel(a.model).ok && checkModel(b.model).ok);
      assert.deepEqual(canonical(cycleSummary(b.model, b), n.back), canonical(cycleSummary(a.model, a)), `principles seed ${seed}`);
    }
  }
});

test("metamorphic: full flow candidates, paths, restrictions and quotient maps are invariant (60 seeds)", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const m = flowFixture(), n = rename(m, rng(830_000 + seed));
    const before = flowAnalysis(m), after = flowAnalysis(n.model);
    assert.ok(before.ok && after.ok);
    assert.deepEqual(canonical(after, n.back), canonical(before), `flow analysis seed ${seed}`);
    assert.deepEqual(canonical(mapFlows(n.model.flows, (b) => b === n.box("b") ? n.box("a") : b), n.back), canonical(mapFlows(m.flows, (b) => b === "b" ? "a" : b)), `flow quotient seed ${seed}`);
    assert.deepEqual(canonical(restrictFlows(n.model.flows, new Set([n.box("a"), n.box("b")])), n.back), canonical(restrictFlows(m.flows, new Set(["a", "b"]))), `flow restriction seed ${seed}`);
  }
});

function dynamicFixture(): Model {
  const next: Record<string, Record<string, string>> = { off: { cold: "cold", warm: "cold", hot: "warm" }, on: { cold: "warm", warm: "hot", hot: "hot" } };
  return {
    domain: "physical",
    carriers: [{ id: "power", layer: "energy", dimension: "W", values: ["off", "on"] }, { id: "temperature", layer: "information", dimension: "K", values: ["cold", "warm", "hot"] }],
    boxes: [
      { id: "heater", name: "Heater", role: "tool", inputs: [{ id: "power", carrier: "power" }], outputs: [{ id: "temp", carrier: "temperature" }], state: ["cold", "warm", "hot"], initial: ["cold"],
        transition: Object.entries(next).flatMap(([power, states]) => Object.entries(states).map(([state, successor]) => ({ state, in: { power }, next: successor, out: { temp: state } }))) },
      { id: "spacer", name: "Spacer", role: "product", inputs: [{ id: "temp", carrier: "temperature" }], state: ["loose", "tight"], initial: ["loose"],
        transition: ["loose", "tight"].flatMap((state) => ["cold", "warm", "hot"].map((temp) => ({ state, in: { temp }, next: temp === "hot" ? "tight" : "loose", out: {} }))) },
    ],
    wires: [{ id: "temperature", from: { box: "heater", port: "temp" }, to: { box: "spacer", port: "temp" }, carrier: "temperature", polarity: "harmful" }],
  };
}

function dynamicsSummary(m: Model, spec: DynamicsSpec, classes?: Set<string>) {
  const r = boundedDynamics(m, spec);
  assert.ok(r.ok && r.decided, JSON.stringify(r));
  // No truncated or cap-dependent partial collection is used for equality.
  assert.equal(r.reachable.listed.length, r.reachable.states);
  assert.equal(r.fixedPoints.listed.length, r.fixedPoints.count);
  if (r.loops.classified) { assert.ok(r.loops.complete); assert.equal(r.loops.closed.length, r.loops.closedCount); r.loops.classes.forEach((c) => classes?.add(c)); }
  const state = (xs: string[]) => Object.fromEntries(r.machines.map((b, i) => [b.box, xs[i]]));
  const values = (xs: string[]) => r.variables.map((p, i) => ({ ...p, value: xs[i] }));
  const holds = (conditions: Condition[], st: RunStep) => conditions.every((c) => "state" in c ? c.state.includes(st.state[r.machines.findIndex((b) => b.box === c.box)]) : c.values.includes(st.values![r.variables.findIndex((p) => p.box === c.box && p.port === c.port)]));
  const trace = (xs: RunStep[], from: "initial" | "safe" = "initial") => {
    assert.deepEqual(checkRun(m, spec, xs, from), { ok: true, errors: [] });
    return { length: xs.length, end: xs.at(-1)!.time };
  };
  const componentKey = (i: number) => {
    assert.ok(r.loops.classified);
    return sorted(r.loops.closed[i].states.map(state));
  };
  const visit = (v: unknown, key = ""): unknown => {
    if (key === "trace") return trace(v as RunStep[]);
    if (key === "state") return state(v as string[]);
    if (key === "values") return values(v as string[]);
    if (key === "cycle") {
      const cycle = v as string[][];
      assert.deepEqual(cycle[0], cycle.at(-1));
      const domains = r.variables.map((p) => m.carriers.find((c) => c.id === p.carrier)!.values!);
      const assignments = domains.reduce<string[][]>((xs, domain) => xs.flatMap((x) => domain.map((v) => [...x, v])), [[]]);
      for (let i = 1; i < cycle.length; i++) assert.ok(assignments.some((values) => checkRun(m, { ...spec, initial: Object.fromEntries(r.machines.map((b, j) => [b.box, [cycle[i - 1][j]]])), inputs: undefined }, [{ time: 0, state: cycle[i - 1], values }, { time: 1, state: cycle[i] }]).ok), "cycle edge is not admitted by the declared transition rows");
      return { length: cycle.length };
    }
    if (key === "component") return componentKey(v as number);
    if (key === "components") return (v as number[]).map(componentKey);
    if (Array.isArray(v)) {
      if (v.length && Array.isArray(v[0]) && typeof v[0][0] === "string") return v.map((x) => state(x));
      return v.map((x) => visit(x));
    }
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (obj.safe && typeof obj.safe === "object" && Array.isArray((obj.safe as { state?: unknown }).state) && typeof obj.component === "number") {
        const safe = obj.safe as { state: string[]; values: string[] };
        assert.ok(r.loops.classified);
        assert.ok(r.loops.closed[obj.component].states.some((s) => JSON.stringify(s) === JSON.stringify(safe.state)));
        assert.equal(holds(spec.unsafe!, { time: 0, ...safe }), false);
        assert.ok(checkRun(m, { ...spec, initial: Object.fromEntries(r.machines.map((b, i) => [b.box, [safe.state[i]]])), inputs: undefined }, [{ time: 0, ...safe }]).ok);
        return visit({ ...obj, safe: { verified: true } });
      }
      if (Array.isArray(obj.trace) && (obj.from === "initial" || obj.from === "safe")) {
        return Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, k === "trace" ? trace(x as RunStep[], obj.from as "initial" | "safe") : visit(x, k)]));
      }
      return Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, visit(x, k)]));
    }
    return v;
  };
  if (r.escalation && "trace" in r.escalation && r.escalation.trace) assert.equal(holds(spec.unsafe!, r.escalation.trace.at(-1)!), true);
  if (r.invariance && "trace" in r.invariance && r.invariance.trace) assert.equal(holds(spec.safe!, r.invariance.trace.at(-1)!), false);
  const separation = r.separation;
  if (separation && "visits" in separation && separation.visits && separation.trace) for (const v of separation.visits) {
    assert.ok(v.time >= v.window.from && v.time <= v.window.to);
    assert.ok(holds(spec.separation!.find((d) => d.id === v.id)!.where, separation.trace.find((s) => s.time === v.time)!));
  }
  return visit(r);
}

test("metamorphic: complete dynamic reachability, loop classes and checked shortest traces survive renaming states, values, targets and inputs (30 seeds)", () => {
  const classes = new Set<string>();
  for (let seed = 1; seed <= 30; seed++) {
    const m = dynamicFixture();
    // Exercise recurrent, trapped, oscillating and bistable complete state graphs.
    if (seed % 8 === 0) for (const row of m.boxes[0].transition!) row.next = row.state === "cold" ? "warm" : "hot";
    if (seed % 8 === 2) for (const row of m.boxes[0].transition!) row.next = row.state === "hot" ? "warm" : "hot";
    if (seed % 8 === 6) for (const row of m.boxes[0].transition!) row.next = row.state;
    const spec: DynamicsSpec = {
      horizon: 5, initial: { heater: ["cold"], spacer: ["loose"] },
      unsafe: [{ box: "spacer", state: ["tight"] }, { box: "heater", port: "temp", values: ["hot"] }],
      safe: [{ box: "spacer", state: ["loose"] }],
      separation: [{ id: "start", where: [{ box: "heater", state: ["cold"] }], window: { from: 0, to: 0 } }, { id: "end", where: [{ box: "spacer", state: ["tight"] }], window: { from: 3, to: 5 } }],
      ...(seed % 2 ? { inputs: Array.from({ length: 6 }, (_, t) => [{ box: "heater", port: "power", values: t === 0 ? ["on"] : ["off", "on"] }]) } : {}),
    };
    const n = rename(m, rng(840_000 + seed), ["start", "end"]);
    assert.deepEqual(canonical(dynamicsSummary(n.model, n.spec(spec)), n.back), canonical(dynamicsSummary(m, spec, classes)), `dynamics seed ${seed}`);
  }
  assert.deepEqual([...classes].sort(), ["bistable", "oscillating", "recurrent", "trapped"]);
});
