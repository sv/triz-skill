/**
 * Declared dynamics: typing of state and transition rows (fail closed), the bearing's heat →
 * preload loop escalating and a damped variant that does not, trapped and recurrent loop classes
 * (a wear model with and without renewal), the horizon and the state cap,
 * input sequences and blocked runs, separation in time along one run, consistency with
 * triz_behavior at fixed points (and where it does not extend), and re-checking every trace.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel } from "../src/act.js";
import { externalBehavior } from "../src/act-behavior.js";
import { boundedDynamics, checkRun, type DynamicsSpec, type RunStep } from "../src/act-dynamics.js";
import { fromHypergraph, toHypergraph } from "../src/act-export.js";
import { toolSpecs } from "../src/tools.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const escalating = () => example("bearing-heat-dynamics");
const box = (m: FunctionModel, id: string) => m.boxes.find((b) => b.id === id)!;
const errors = (r: { ok: boolean; errors?: string[] }) => (r.ok ? "" : r.errors!.join("; "));
const HOT = [{ box: "shaft", state: ["hot"] }];
const COOL = [{ box: "shaft", state: ["cold", "warm"] }];

/** Decided result or fail the test. */
function run(model: FunctionModel, spec: DynamicsSpec) {
  const r = boundedDynamics(model, spec);
  assert.ok(r.ok && r.decided, errors(r as { ok: boolean; errors?: string[] }));
  return r;
}

/** Valuations as port → value maps, comparable across tools whatever their variable order. */
const named = (variables: Array<{ box: string; port: string }>, rows: string[][]) =>
  rows.map((row) => JSON.stringify(Object.fromEntries(variables.map((v, i) => [`${v.box}.${v.port}`, row[i]]).sort()))).sort();

/** The damped bearing: a warm shaft sheds the extra friction heat, and a hot one cools. */
function damped(): FunctionModel {
  const m = escalating();
  for (const r of box(m, "shaft").transition!) if (r.state === "hot" || (r.state === "warm" && r.in["heat-in"] === "high")) r.next = "warm";
  return m;
}

/** Each stateful box frozen at its state in `at`: its rows that stay there, as stateless behaviour. */
function frozen(model: FunctionModel, at: Record<string, string>): FunctionModel {
  return {
    ...model,
    boxes: model.boxes.map(({ state, initial, transition, ...b }) => (transition
      ? { ...b, behavior: transition.filter((r) => r.state === at[b.id] && r.next === at[b.id]).map((r) => ({ in: r.in, out: r.out })) }
      : b)),
  };
}

/** A heater driven by an unwired power input; `drop` removes rows to make runs block. */
function heater(drop: Array<[string, string]> = []): FunctionModel {
  const step: Record<string, Record<string, string>> = { on: { cold: "warm", warm: "hot", hot: "hot" }, off: { cold: "cold", warm: "cold", hot: "warm" } };
  return {
    domain: "physical",
    carriers: [{ id: "power", layer: "energy", dimension: "W", values: ["off", "on"] }, { id: "temperature", layer: "energy", dimension: "K", values: ["cold", "warm", "hot"] }],
    boxes: [{
      id: "heater", name: "Heater", role: "tool", inputs: [{ id: "power", carrier: "power" }], outputs: [{ id: "temp", carrier: "temperature" }],
      state: ["cold", "warm", "hot"], initial: ["cold"],
      transition: Object.entries(step).flatMap(([p, next]) => Object.entries(next)
        .filter(([s]) => !drop.some(([dp, ds]) => dp === p && ds === s))
        .map(([s, n]) => ({ state: s, in: { power: p }, next: n, out: { temp: s } }))),
    }],
    wires: [],
  };
}
const power = (...values: string[]) => values.map((v) => [{ box: "heater", port: "power", values: [v] }]);

/** A warming shaft drives a clearance spacer through a temperature wire. */
function spacer(rows: Array<[state: string, temp: string, next: string]>, initial = ["loose"]): FunctionModel {
  return {
    domain: "physical",
    carriers: [{ id: "temperature", layer: "energy", dimension: "K", values: ["cold", "warm"] }],
    boxes: [
      { id: "shaft", name: "Shaft", role: "product", outputs: [{ id: "temp", carrier: "temperature" }], state: ["cold", "warm"], initial: ["cold"],
        transition: [{ state: "cold", in: {}, next: "warm", out: { temp: "cold" } }, { state: "warm", in: {}, next: "warm", out: { temp: "warm" } }] },
      { id: "spacer", name: "Clearance spacer", role: "mediator", inputs: [{ id: "temp", carrier: "temperature" }], state: ["loose", "tight"], initial,
        transition: rows.map(([s, t, n]) => ({ state: s, in: { temp: t }, next: n, out: {} })) },
    ],
    wires: [{ id: "w-temp", from: { box: "shaft", port: "temp" }, to: { box: "spacer", port: "temp" }, carrier: "temperature", polarity: "useful" }],
  };
}
const FOLLOWS: Array<[string, string, string]> = [["loose", "cold", "loose"], ["loose", "warm", "tight"], ["tight", "cold", "loose"], ["tight", "warm", "tight"]];
const HOLDS: Array<[string, string, string]> = [["loose", "cold", "loose"], ["loose", "warm", "loose"], ["tight", "cold", "tight"], ["tight", "warm", "tight"]];
const CLEARANCE = [
  { id: "no-seizure", where: [{ box: "spacer", state: ["loose"] }], window: { from: 0, to: 1 } },
  { id: "precision", where: [{ box: "spacer", state: ["tight"] }], window: { from: 2, to: 4 } },
];

/** One box whose output y feeds back into its input x; z = x is delivered to a product (as in act-behavior.test.ts). */
function loop(rows: Array<[x: string, y: string]>): FunctionModel {
  return {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "loop", name: "Loop", role: "tool", inputs: [{ id: "x", carrier: "c" }], outputs: [{ id: "y", carrier: "c" }, { id: "z", carrier: "c" }],
        behavior: rows.map(([x, y]) => ({ in: { x }, out: { y, z: x } })) },
      { id: "user", name: "User", role: "product", inputs: [{ id: "p", carrier: "c" }] },
    ],
    wires: [
      { id: "w-loop", from: { box: "loop", port: "y" }, to: { box: "loop", port: "x" }, carrier: "c", polarity: "useful" },
      { id: "w-out", from: { box: "loop", port: "z" }, to: { box: "user", port: "p" }, carrier: "c", polarity: "useful" },
    ],
  };
}

test("state and transition typing fails closed", () => {
  const broken = (edit: (m: FunctionModel) => void) => { const m = escalating(); edit(m); return checkModel(m).errors.join("; "); };
  assert.deepEqual(checkModel(escalating()), { ok: true, errors: [], issues: [] });
  assert.match(broken((m) => { delete box(m, "shaft").state; }), /box 'shaft' declares transition without state.*declares initial without state/);
  assert.match(broken((m) => { delete box(m, "shaft").transition; }), /box 'shaft' declares state without transition/);
  assert.match(broken((m) => { box(m, "shaft").behavior = [{ in: { drive: "rated", support: "supported", "heat-in": "low" }, out: { expansion: "nominal" } }]; }), /box 'shaft' declares both behavior and transition/);
  assert.match(broken((m) => { box(m, "shaft").state!.push("cold"); }), /box 'shaft': duplicate state 'cold'/);
  assert.match(broken((m) => { box(m, "shaft").initial = ["boiling"]; }), /box 'shaft': initial state 'boiling' is not declared in state/);
  assert.match(broken((m) => { box(m, "shaft").transition![0].next = "boiling"; }), /box 'shaft' transition row 0: next 'boiling' is not declared in state/);
  assert.match(broken((m) => { box(m, "shaft").transition![1].state = "molten"; }), /transition row 1: state 'molten' is not declared in state/);
  assert.match(broken((m) => { box(m, "shaft").transition![2].in["heat-in"] = "warm"; }), /box 'shaft' transition row 2: value 'warm' of port 'heat-in' is not declared by carrier 'heat'/);
  assert.match(broken((m) => { delete box(m, "shaft").transition![3].out.expansion; }), /transition row 3: output port 'expansion' has no value/);
  assert.match(broken((m) => { box(m, "shaft").transition![4].in.ghost = "low"; }), /transition row 4: no input port 'ghost'/);
  assert.match(broken((m) => { delete m.carriers.find((c) => c.id === "heat")!.values; }), /box 'shaft' declares transition, but carrier 'heat' of port 'heat-in' declares no values/);
  assert.throws(() => FunctionModel.parse({ ...escalating(), boxes: [{ ...box(escalating(), "shaft"), transition: [] }] }));
  assert.throws(() => FunctionModel.parse({ ...escalating(), boxes: [{ ...box(escalating(), "shaft"), state: [] }] }));
  // Every model-taking tool inherits the check.
  const m = escalating();
  box(m, "shaft").transition![0].next = "boiling";
  assert.equal(boundedDynamics(m).ok, false);
  assert.equal(externalBehavior(m).ok, false);
});

test("targets, initial states, inputs, horizon, and windows fail closed", () => {
  const fails = (spec: DynamicsSpec, model = escalating()) => errors(boundedDynamics(model, spec));
  assert.match(fails({ unsafe: [{ box: "ghost", state: ["hot"] }] }), /unsafe\[0\]: unknown box 'ghost'/);
  assert.match(fails({ unsafe: [{ box: "bearing", state: ["hot"] }] }), /unsafe\[0\]: box 'bearing' declares no state/);
  assert.match(fails({ safe: [{ box: "shaft", state: ["boiling"] }] }), /safe\[0\]: state 'boiling' is not declared by box 'shaft'/);
  assert.match(fails({ safe: [{ box: "bearing", port: "friction", values: ["warm"] }] }), /value 'warm' of port 'bearing.friction' is not declared by carrier 'heat'/);
  assert.match(fails({ safe: [{ box: "bearing", port: "ghost", values: ["low"] }] }), /box 'bearing' has no port 'ghost'/);
  assert.match(fails({ initial: { shaft: ["boiling"] } }), /initial: state 'boiling' is not declared by box 'shaft'/);
  assert.match(fails({ initial: { bearing: ["cold"] } }), /initial: box 'bearing' declares no state/);
  assert.match(fails({ inputs: [[{ box: "shaft", port: "heat-in", values: ["low"] }]], horizon: 0 }), /input port 'shaft.heat-in' is wired; only unwired \(boundary\) inputs can be set/);
  assert.match(fails({ inputs: power("on", "on"), horizon: 2 }, heater()), /horizon 2 needs 3 input entries \(times 0 to 2\); inputs has 2/);
  assert.match(fails({ inputs: [[{ box: "heater", port: "power", values: ["max"] }]] }, heater()), /value 'max' of port 'heater.power' is not declared by carrier 'power'/);
  assert.match(fails({ horizon: 1001 }), /horizon must be an integer from 0 to 1000/);
  assert.match(fails({ horizon: 3, separation: [CLEARANCE[0], { ...CLEARANCE[1], window: { from: 1, to: 4 } }] }, spacer(FOLLOWS)), /the windows of 'no-seizure' and 'precision' overlap/);
  assert.match(fails({ horizon: 3, separation: CLEARANCE }, spacer(FOLLOWS)), /separation 'precision': window ends at 4, after the horizon 3/);
  assert.match(fails({ separation: [CLEARANCE[0], { ...CLEARANCE[1], id: "no-seizure" }] }, spacer(FOLLOWS)), /duplicate demand id 'no-seizure'/);
  const uninitialised = escalating();
  delete box(uninitialised, "shaft").initial;
  assert.match(fails({}, uninitialised), /box 'shaft' declares state but no initial states: declare initial on the box, or pass initial/);
  assert.equal(run(uninitialised, { initial: { shaft: ["hot"] } }).machines[0].initial.join(), "hot");
  assert.match(fails({}, example("bearing-heat-behavior")), /nothing to explore/);
});

test("a box upstream of an observed box with no declared rows leaves the runs undecided", () => {
  const m = escalating();
  delete box(m, "bearing").behavior;
  const r = boundedDynamics(m, { unsafe: HOT });
  assert.ok(r.ok && !r.decided);
  assert.deepEqual(r.missingBehavior, ["bearing"]);
  assert.match(r.note, /Declare behavior or transition for 'bearing'/);
});

test("the bearing's heat → preload loop escalates: a shortest trace from cold to hot, re-checked step by step", () => {
  const spec = { unsafe: HOT, safe: [{ box: "bearing", port: "friction", values: ["low"] }] };
  const r = run(escalating(), spec);
  assert.deepEqual(r.composed, ["motor", "shaft", "bearing"]);
  assert.deepEqual(r.downstream, ["housing", "air"]);
  assert.deepEqual(r.variables.map((v) => `${v.box}.${v.port}`), ["motor.shaft-out", "bearing.race", "bearing.friction", "shaft.expansion"]);
  assert.ok(r.escalation?.verdict === "reachable");
  assert.equal(r.escalation.time, 2);
  assert.deepEqual(r.escalation.trace, [
    { time: 0, state: ["cold"], values: ["rated", "supported", "low", "nominal"] },
    { time: 1, state: ["warm"], values: ["rated", "supported", "high", "high"] },
    { time: 2, state: ["hot"], values: ["rated", "supported", "high", "high"] },
  ]);
  assert.deepEqual(r.escalation.basis, ["reach_of_trace"]);
  assert.ok(r.invariance?.verdict === "violated");
  assert.equal(r.invariance.time, 1);
  assert.deepEqual(r.reachable.byBox, [{ box: "shaft", states: ["cold", "warm", "hot"] }]);
  assert.equal(r.reachable.saturated, true);
  assert.deepEqual(r.fixedPoints.listed.map((f) => f.state), [["hot"]]);
  assert.equal(r.blocked.count, 0);
  assert.deepEqual(checkRun(escalating(), spec, r.escalation.trace), { ok: true, errors: [] });
  // A short horizon does not see it, and says only that.
  const short = run(escalating(), { unsafe: HOT, horizon: 1 });
  assert.ok(short.escalation?.verdict === "unreachable-within-horizon");
  assert.equal(short.escalation.horizon, 1);
  assert.deepEqual(short.escalation.basis, ["reachWithin_iff_trace"]);
  assert.equal(short.reachable.saturated, false);
});

test("the damped variant never escalates: the reachable set saturates, so cold-or-warm is invariant at any horizon", () => {
  const r = run(damped(), { unsafe: HOT, safe: COOL });
  assert.ok(r.escalation?.verdict === "unreachable");
  assert.deepEqual(r.escalation.basis, ["reachWithin_iff_trace", "reachWithin_saturated"]);
  assert.ok(r.invariance?.verdict === "invariant");
  assert.deepEqual(r.reachable.byBox, [{ box: "shaft", states: ["cold", "warm"] }]);
  assert.equal(r.reachable.saturated, true);
  assert.equal(r.reachable.completeAfter, 1);
  // The damped shaft settles warm, with the preload high and the friction high: damping is not cooling.
  assert.deepEqual(r.fixedPoints.listed, [{ time: 1, state: ["warm"], values: ["rated", "supported", "high", "high"] }]);
  // Starting hot, the damped shaft still visits hot once: the verdict is about the declared initial states.
  const hot = run(damped(), { unsafe: HOT, initial: { shaft: ["hot"] } });
  assert.ok(hot.escalation?.verdict === "reachable" && hot.escalation.time === 0);
});

test("the state cap fails closed, on max_states and on the default cap", () => {
  assert.match(errors(boundedDynamics(escalating(), { unsafe: HOT, maxStates: 5 })), /the bounded search passed 5 states/);
  // Three free-running boxes of 50 states each: one step already has 125000 joint choices.
  const states = Array.from({ length: 50 }, (_, i) => `s${i}`);
  const free = (id: string) => ({
    id, name: id, role: "tool" as const, state: states, initial: ["s0"],
    transition: states.flatMap((s) => states.map((n) => ({ state: s, in: {}, next: n, out: {} }))),
  });
  const big: FunctionModel = { domain: "software", carriers: [], boxes: [free("a"), free("b"), free("c")], wires: [] };
  assert.match(errors(boundedDynamics(big, { horizon: 1 })), /the bounded search passed 100000 states/);
  assert.match(errors(boundedDynamics(big, { initial: { a: states, b: states, c: states } })), /the initial states have 125000 combinations; the cap is 100000/);
});

test("input sequences index configurations by time; a state with no row for its input blocks the run", () => {
  const all = run(heater(), { unsafe: [{ box: "heater", state: ["hot"] }] });
  assert.equal(all.inputMode, "all");
  assert.deepEqual(all.inputs, [{ box: "heater", port: "power", carrier: "power" }]);
  assert.ok(all.escalation?.verdict === "reachable" && all.escalation.time === 2);
  const on = run(heater(), { unsafe: [{ box: "heater", state: ["hot"] }], inputs: power("on", "on", "on") });
  assert.equal(on.inputMode, "sequence");
  assert.equal(on.horizon, 2);
  assert.ok(on.escalation?.verdict === "reachable");
  assert.deepEqual(on.escalation.trace.map((s) => s.state[0]), ["cold", "warm", "hot"]);
  const pulsed = run(heater(), { unsafe: [{ box: "heater", state: ["hot"] }], inputs: power("on", "off", "on") });
  // A time-indexed search never saturates: the verdict stays within the horizon.
  assert.ok(pulsed.escalation?.verdict === "unreachable-within-horizon");
  assert.equal(pulsed.reachable.saturated, false);
  const missing = run(heater([["on", "hot"]]), { unsafe: [{ box: "heater", state: ["hot"] }], inputs: power("on", "on", "on") });
  assert.equal(missing.blocked.count, 1);
  assert.deepEqual(missing.blocked.first?.map((s) => [s.time, s.state[0], s.values?.[0]]), [[0, "cold", "on"], [1, "warm", "on"], [2, "hot", undefined]]);
  // A run that blocks in the unsafe state has reached it.
  assert.ok(missing.escalation?.verdict === "reachable");
  assert.deepEqual(missing.escalation.trace, missing.blocked.first);
  assert.match(missing.escalation.note, /the run blocks there/);
  assert.match(missing.note, /1 runs block/);
});

test("a blocked state is never read as safe: state conditions decide there, and a port condition leaves the verdict undecided", () => {
  const stuck = heater([["on", "hot"], ["off", "hot"]]);
  const hot = run(stuck, { unsafe: [{ box: "heater", state: ["hot"] }], safe: [{ box: "heater", state: ["cold", "warm"] }] });
  assert.equal(hot.reachable.saturated, true);
  assert.equal(hot.blocked.count, 1);
  assert.ok(hot.escalation?.verdict === "reachable" && hot.escalation.time === 2);
  assert.deepEqual(hot.escalation.trace.map((s) => [s.state[0], s.values?.[0]]), [["cold", "on"], ["warm", "on"], ["hot", undefined]]);
  assert.deepEqual(checkRun(stuck, {}, hot.escalation.trace), { ok: true, errors: [] });
  assert.ok(hot.invariance?.verdict === "violated" && hot.invariance.time === 2);
  // The temperature port has no value at the blocked state: neither verdict can be decided there.
  const ports = run(stuck, { unsafe: [{ box: "heater", port: "temp", values: ["hot"] }], safe: [{ box: "heater", port: "temp", values: ["cold", "warm"] }] });
  assert.ok(ports.escalation?.verdict === "undecided" && ports.escalation.reason === "blocked");
  assert.ok(ports.invariance?.verdict === "undecided" && ports.invariance.reason === "blocked");
  assert.equal(ports.escalation.trace[ports.escalation.trace.length - 1].state[0], "hot");
  // A state the safe set allows, blocked, is safe; one it forbids by state is a violation whatever the ports.
  const warmOnly = heater([["on", "warm"], ["off", "warm"]]);
  assert.ok(run(warmOnly, { safe: [{ box: "heater", state: ["cold", "warm"] }] }).invariance?.verdict === "invariant");
  assert.ok(run(stuck, { safe: [{ box: "heater", state: ["cold", "warm"] }, { box: "heater", port: "temp", values: ["cold", "warm"] }] }).invariance?.verdict === "violated");
  // Separation: a blocked state can meet a demand that names states only, and leaves one that names a port undecided.
  const blocking = spacer(FOLLOWS.filter(([s]) => s !== "tight"));
  const met = run(blocking, { horizon: 4, separation: CLEARANCE });
  assert.ok(met.separation?.verdict === "realizable");
  assert.deepEqual(met.separation.visits.map((v) => v.time), [0, 2]);
  assert.equal(met.separation.trace[2].values, undefined);
  const withPort = [CLEARANCE[0], { ...CLEARANCE[1], where: [...CLEARANCE[1].where, { box: "spacer", port: "temp", values: ["warm"] }] }];
  const unsure = run(blocking, { horizon: 4, separation: withPort });
  assert.ok(unsure.separation?.verdict === "undecided" && unsure.separation.reason === "blocked");
});

test("separation in time: one run visits each demand in its window, or the reason none does", () => {
  const follows = run(spacer(FOLLOWS), { horizon: 4, separation: CLEARANCE });
  assert.ok(follows.separation?.verdict === "realizable");
  assert.deepEqual(follows.separation.visits.map((v) => [v.id, v.time]), [["no-seizure", 0], ["precision", 2]]);
  assert.deepEqual(follows.separation.trace.map((s) => s.state), [["cold", "loose"], ["warm", "loose"], ["warm", "tight"]]);
  assert.deepEqual(follows.separation.basis, ["reachIn_of_trace"]);
  assert.deepEqual(checkRun(spacer(FOLLOWS), { horizon: 4, separation: CLEARANCE }, follows.separation.trace), { ok: true, errors: [] });

  const stuck = run(spacer(HOLDS), { horizon: 4, separation: CLEARANCE });
  assert.ok(stuck.separation?.verdict === "unrealizable");
  assert.equal(stuck.separation.reason, "demand-never-met");
  assert.deepEqual(stuck.separation.demands.map((d) => [d.id, d.metInWindow]), [["no-seizure", true], ["precision", false]]);

  // Two runs, one loose and one tight: each demand is met, but never by one run. Checking each
  // time's reachable set separately would mix the two runs and wrongly call this realizable.
  const either = run(spacer(HOLDS, ["loose", "tight"]), { horizon: 4, separation: CLEARANCE });
  assert.ok(either.separation?.verdict === "unrealizable");
  assert.equal(either.separation.reason, "not-in-one-run");
  assert.deepEqual(either.separation.demands.map((d) => d.metInWindow), [true, true]);
  assert.match(either.separation.note, /Principle 15/);
  assert.deepEqual(either.reachable.listed.filter((s) => s[0] === "warm"), [["warm", "loose"], ["warm", "tight"]]);
});

test("stateless boxes: every step's valuations are triz_behavior's steady states, and every configuration is a fixed point", () => {
  const m = example("bearing-heat-behavior");
  const steady = externalBehavior(m);
  assert.ok(steady.ok && steady.decided);
  const r = run(m, { safe: [{ box: "shaft", port: "support", values: ["supported"] }] });
  assert.deepEqual(r.composed, steady.composed);
  assert.deepEqual(r.machines, []);
  assert.equal(r.reachable.configurations, steady.relation[0].steadyStateCount);
  assert.equal(r.fixedPoints.count, r.reachable.configurations);
  assert.deepEqual(named(r.variables, r.fixedPoints.listed.map((f) => f.values)), named(steady.variables, steady.relation[0].steadyStates));
  assert.ok(r.invariance?.verdict === "invariant");

  const identity = run(loop([["0", "0"], ["1", "1"]]), { safe: [{ box: "loop", port: "z", values: ["0", "1"] }] });
  const steadyIdentity = externalBehavior(loop([["0", "0"], ["1", "1"]]));
  assert.ok(steadyIdentity.ok && steadyIdentity.decided);
  assert.deepEqual(named(identity.variables, identity.fixedPoints.listed.map((f) => f.values)), named(steadyIdentity.variables, steadyIdentity.relation[0].steadyStates));
  // No steady state ⇔ the run blocks at once.
  const negation = run(loop([["0", "1"], ["1", "0"]]), { safe: [{ box: "loop", port: "z", values: ["0", "1"] }] });
  const steadyNegation = externalBehavior(loop([["0", "1"], ["1", "0"]]));
  assert.ok(steadyNegation.ok && steadyNegation.decided);
  assert.deepEqual(steadyNegation.noSteadyState, [[]]);
  assert.equal(negation.reachable.configurations, 0);
  assert.deepEqual(negation.blocked, { count: 1, first: [{ time: 0, state: [] }] });
});

test("at a reached fixed point, the steps that stay there are triz_behavior's steady states of the model frozen at that state", () => {
  for (const model of [escalating(), damped()]) {
    const r = run(model, { unsafe: HOT });
    assert.ok(r.fixedPoints.count > 0);
    const at = new Map<string, string[][]>();
    for (const f of r.fixedPoints.listed) at.set(JSON.stringify(f.state), [...(at.get(JSON.stringify(f.state)) ?? []), f.values]);
    for (const [key, values] of at) {
      const state: string[] = JSON.parse(key);
      const steady = externalBehavior(frozen(model, Object.fromEntries(r.machines.map((m, k) => [m.box, state[k]]))));
      assert.ok(steady.ok && steady.decided);
      assert.deepEqual(steady.composed, r.composed);
      assert.deepEqual(named(r.variables, values), named(steady.variables, steady.relation[0].steadyStates));
    }
  }
});

test("the agreement is only at reached fixed points: a run may never settle, and a steady state may never be reached", () => {
  // A unit delay in a negation loop oscillates; frozen at either state, the loop has no steady state.
  const bit = [{ id: "bit", layer: "information" as const, dimension: "bit", values: ["0", "1"] }];
  const oscillator: FunctionModel = {
    domain: "software", carriers: bit,
    boxes: [
      { id: "delay", name: "Delay", role: "tool", inputs: [{ id: "x", carrier: "bit" }], outputs: [{ id: "y", carrier: "bit" }], state: ["0", "1"], initial: ["0"],
        transition: ["0", "1"].flatMap((s) => ["0", "1"].map((x) => ({ state: s, in: { x }, next: x, out: { y: s } }))) },
      { id: "not", name: "Negation", role: "product", inputs: [{ id: "a", carrier: "bit" }], outputs: [{ id: "b", carrier: "bit" }],
        behavior: [{ in: { a: "0" }, out: { b: "1" } }, { in: { a: "1" }, out: { b: "0" } }] },
    ],
    wires: [
      { id: "w-y", from: { box: "delay", port: "y" }, to: { box: "not", port: "a" }, carrier: "bit", polarity: "useful" },
      { id: "w-b", from: { box: "not", port: "b" }, to: { box: "delay", port: "x" }, carrier: "bit", polarity: "useful" },
    ],
  };
  const r = run(oscillator, {});
  assert.deepEqual(r.reachable.listed, [["0"], ["1"]]);
  assert.equal(r.reachable.saturated, true);
  assert.equal(r.fixedPoints.count, 0);
  for (const s of ["0", "1"]) {
    const steady = externalBehavior(frozen(oscillator, { delay: s }));
    assert.ok(steady.ok && steady.decided);
    assert.equal(steady.relation[0].steadyStateCount, 0);
  }
  // A latch that starts off has a steady state on that it never reaches.
  const latch: FunctionModel = {
    domain: "software", carriers: bit,
    boxes: [
      { id: "latch", name: "Latch", role: "tool", outputs: [{ id: "q", carrier: "bit" }], state: ["off", "on"], initial: ["off"],
        transition: [{ state: "off", in: {}, next: "off", out: { q: "0" } }, { state: "on", in: {}, next: "on", out: { q: "1" } }] },
      { id: "user", name: "User", role: "product", inputs: [{ id: "p", carrier: "bit" }] },
    ],
    wires: [{ id: "w-q", from: { box: "latch", port: "q" }, to: { box: "user", port: "p" }, carrier: "bit", polarity: "useful" }],
  };
  const on = externalBehavior(frozen(latch, { latch: "on" }));
  assert.ok(on.ok && on.decided);
  assert.deepEqual(on.relation[0].outputs, [["1"]]);
  const reached = run(latch, { unsafe: [{ box: "latch", state: ["on"] }] });
  assert.ok(reached.escalation?.verdict === "unreachable");
  assert.deepEqual(reached.fixedPoints.listed.map((f) => f.state), [["off"]]);
});

test("checkRun rejects traces the declared rows do not admit", () => {
  const spec = { unsafe: HOT };
  const trace = run(escalating(), spec).escalation!.trace as RunStep[];
  const tamper = (edit: (t: RunStep[]) => void) => { const t: RunStep[] = JSON.parse(JSON.stringify(trace)); edit(t); return errors(checkRun(escalating(), spec, t)); };
  assert.match(tamper((t) => { t[0].state = ["warm"]; }), /step 0: 'warm' is not an initial state of 'shaft'/);
  assert.match(tamper((t) => { t[1].state = ["hot"]; }), /step 0: no row of box 'shaft' admits this step/);
  assert.match(tamper((t) => { t[1].values![2] = "low"; }), /step 1: no row of box 'bearing' admits this step/);
  assert.match(tamper((t) => { t[2].time = 3; }), /step 2: time 3, expected 2/);
  assert.match(tamper((t) => { delete t[1].values; }), /step 1: only the last step may block/);
  assert.match(errors(checkRun(escalating(), spec, [])), /the trace is empty/);
  // A trace that skips a step claims the unsafe state too early; it is rejected.
  assert.match(tamper((t) => { t.splice(1, 1); t[1].time = 1; }), /no row of box 'shaft' admits this step/);
});

test("the hypergraph export carries state and transition losslessly", () => {
  const m = escalating();
  const back = fromHypergraph(toHypergraph(m));
  assert.ok(back.ok);
  assert.deepEqual(back.model, m);
});

test("triz_dynamics: snake-case arguments, the same verdicts, and fail-closed errors", async () => {
  const spec = Object.fromEntries(toolSpecs().map((s) => [s.name, s])).triz_dynamics;
  const call = async (args: unknown) => JSON.parse((await spec.handler(args)).content[0].text);
  const r = await call({ model: escalating(), unsafe: HOT, max_states: 1000 });
  assert.equal(r.escalation.verdict, "reachable");
  assert.equal((await call({ model: escalating(), unsafe: HOT, max_states: 5 })).ok, false);
  assert.equal((await call({ model: damped(), safe: COOL })).invariance.verdict, "invariant");
  assert.equal((await call({ model: spacer(FOLLOWS), horizon: 4, separation: CLEARANCE })).separation.verdict, "realizable");
});

/** One stateless-port box whose state follows the given edges (several edges from a state are alternatives). */
function graph(edges: Array<[from: string, to: string]>, initial: string[]): FunctionModel {
  const states = [...new Set(edges.flat())];
  return {
    domain: "physical", carriers: [],
    boxes: [{ id: "ball", name: "Ball", role: "product", state: states, initial, transition: edges.map(([s, n]) => ({ state: s, in: {}, next: n, out: {} })) }],
    wires: [],
  };
}
const TWO_WELLS: Array<[string, string]> = [["top", "left"], ["top", "right"], ["left", "left"], ["right", "right"]];
/** A negation loop whose state is declared: the inverter emits the negation of its state and stores its input. */
const inverter: FunctionModel = {
  domain: "software",
  carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }],
  boxes: [{ id: "inverter", name: "Inverter", role: "tool", inputs: [{ id: "x", carrier: "bit" }], outputs: [{ id: "y", carrier: "bit" }], state: ["0", "1"], initial: ["0"],
    transition: ["0", "1"].flatMap((s) => ["0", "1"].map((x) => ({ state: s, in: { x }, next: x, out: { y: s === "0" ? "1" : "0" } }))) }],
  wires: [{ id: "w-loop", from: { box: "inverter", port: "y" }, to: { box: "inverter", port: "x" }, carrier: "bit", polarity: "harmful" }],
};

test("loop classification: a two-well model is bistable", () => {
  const r = run(graph(TWO_WELLS, ["top"]), {});
  assert.ok(r.loops.classified);
  assert.equal(r.loops.complete, true);
  assert.deepEqual(r.loops.classes, ["bistable"]);
  assert.deepEqual(r.loops.closed.map((c) => [c.states, c.kind]), [[[["left"]], "settles"], [[["right"]], "settles"]]);
  assert.deepEqual(r.loops.bistable, { count: 2, components: [0, 1], fixedPoints: [["left"], ["right"]], basis: ["fixed_on_cycle", "closed_reachIn"] });
  // From a single well there is one closed component: settling is no class.
  const left = run(graph(TWO_WELLS, ["left"]), {});
  assert.ok(left.loops.classified);
  assert.deepEqual(left.loops.classes, []);
});

test("loop classification: the bearing's heat → preload runaway is a trap; the damped bearing settles outside it", () => {
  const r = run(escalating(), { unsafe: HOT });
  assert.ok(r.loops.classified);
  assert.deepEqual(r.loops.classes, ["trapped"]);
  assert.deepEqual(r.loops.harmLoops, [{ boxes: ["bearing", "shaft"], negative: ["w-heat", "w-preload"] }]);
  assert.deepEqual(r.loops.closed, [{ size: 1, states: [["hot"]], kind: "settles", fixedPoints: [["hot"]], unsafe: true, allUnsafe: true }]);
  const [trap] = r.loops.trapped!;
  assert.equal(trap.from, "initial");
  assert.deepEqual(trap.trace, r.escalation!.trace);
  assert.deepEqual(trap.basis, ["trapped_reachIn", "reach_of_trace"]);
  assert.equal(r.loops.recurrent, undefined);
  assert.match(r.loops.note, /never recovers/);
  const calm = run(damped(), { unsafe: HOT });
  assert.ok(calm.loops.classified);
  assert.deepEqual(calm.loops.classes, []);
  assert.deepEqual(calm.loops.closed, [{ size: 1, states: [["warm"]], kind: "settles", fixedPoints: [["warm"]], unsafe: false, allUnsafe: false }]);
});

/**
 * A two-state wear model: a part wears from thin to thick, and thick is unsafe. With `renew`,
 * a thick part can also return to thin.
 */
function wear(renew: boolean): FunctionModel {
  return graph([["thin", "thin"], ["thin", "thick"], ["thick", "thick"], ...(renew ? [["thick", "thin"] as [string, string]] : [])], ["thin"]);
}
const THICK = [{ box: "ball", state: ["thick"] }];

test("loop classification: an absorbing unsafe state is trapped; one the run can leave again is recurrent", () => {
  const absorbing = run(wear(false), { unsafe: THICK });
  assert.ok(absorbing.loops.classified && absorbing.loops.complete);
  assert.deepEqual(absorbing.loops.classes, ["trapped"]);
  assert.deepEqual(absorbing.loops.closed, [{ size: 1, states: [["thick"]], kind: "settles", fixedPoints: [["thick"]], unsafe: true, allUnsafe: true }]);
  const [trap] = absorbing.loops.trapped!;
  assert.deepEqual([trap.from, trap.time, trap.trace.map((st) => st.state[0])], ["initial", 1, ["thin", "thick"]]);
  assert.deepEqual(trap.basis, ["trapped_reachIn", "reach_of_trace"]);
  assert.deepEqual(checkRun(wear(false), { unsafe: THICK }, trap.trace), { ok: true, errors: [] });

  // Renewal makes thin and thick one closed component: it meets the unsafe set and holds a safe state.
  const renewed = run(wear(true), { unsafe: THICK });
  assert.ok(renewed.loops.classified && renewed.loops.complete);
  assert.deepEqual(renewed.loops.classes, ["recurrent"]);
  assert.deepEqual(renewed.loops.closed, [{ size: 2, states: [["thin"], ["thick"]], kind: "settles", fixedPoints: [["thin"], ["thick"]], unsafe: true, allUnsafe: false }]);
  assert.equal(renewed.loops.trapped, undefined);
  const [back] = renewed.loops.recurrent!;
  assert.deepEqual([back.component, back.from, back.time, back.trace.map((st) => st.state[0])], [0, "initial", 1, ["thin", "thick"]]);
  assert.deepEqual(back.safe, { state: ["thin"], values: [] });
  assert.deepEqual(back.basis, ["closed_reachIn", "recurrent_reach", "reach_of_trace"]);
  assert.match(renewed.loops.note, /it can recover, but it never leaves the component/);
  // The escalation verdict is the same for both: the unsafe state is reachable; only the class differs.
  assert.deepEqual([absorbing.escalation?.verdict, renewed.escalation?.verdict], ["reachable", "reachable"]);

  // Without the thin self-loop the renewing part oscillates too, and both classes are listed.
  const cycling = run(graph([["thin", "thick"], ["thick", "thin"]], ["thin"]), { unsafe: THICK });
  assert.ok(cycling.loops.classified);
  assert.deepEqual(cycling.loops.classes, ["recurrent", "oscillating"]);
});

test("loop classification: a state unsafe under one valuation only is recurrent, not trapped", () => {
  // The heater stays hot under either power value, and only power on is unsafe: hot holds a safe configuration.
  const m = heater();
  for (const r of box(m, "heater").transition!) if (r.state === "hot") r.next = "hot";
  const onWhenHot = [{ box: "heater", state: ["hot"] }, { box: "heater", port: "power", values: ["on"] }];
  const r = run(m, { unsafe: onWhenHot });
  assert.ok(r.loops.classified);
  assert.deepEqual(r.loops.closed.map((c) => [c.states, c.unsafe, c.allUnsafe]), [[[["hot"]], true, false]]);
  assert.deepEqual(r.loops.classes, ["recurrent"]);
  const [back] = r.loops.recurrent!;
  assert.deepEqual(back.safe.state, ["hot"]);
  assert.equal(back.safe.values[r.variables.findIndex((v) => v.port === "power")], "off");
  // With every power value unsafe at hot, the same component is trapped.
  const trapped = run(m, { unsafe: [{ box: "heater", state: ["hot"] }] });
  assert.ok(trapped.loops.classified);
  assert.deepEqual(trapped.loops.classes, ["trapped"]);
});

test("loop classification: a negation loop with declared state oscillates with period 2", () => {
  const r = run(inverter, {});
  assert.ok(r.loops.classified);
  assert.deepEqual(r.loops.classes, ["oscillating"]);
  assert.deepEqual(r.loops.oscillating, [{ component: 0, period: 2, cycle: [["0"], ["1"], ["0"]], basis: ["closed_reachIn", "return_ge_two"] }]);
  assert.equal(r.fixedPoints.count, 0);
  // Cycles of lengths 2 and 3 and no fixed point: the period (their gcd) is 1, the shortest cycle still has length 2.
  const mixed = run(graph([["a", "b"], ["b", "a"], ["b", "c"], ["c", "a"]], ["a"]), {});
  assert.ok(mixed.loops.classified);
  assert.deepEqual(mixed.loops.oscillating?.map((o) => [o.period, o.cycle]), [[1, [["a"], ["b"], ["a"]]]]);
});

test("loop classification: classes coexist, safe states are starts, and 'none' only when no closed component is found", () => {
  const edges: Array<[string, string]> = [...TWO_WELLS, ["top", "ring1"], ["ring1", "ring2"], ["ring2", "ring1"]];
  const all = run(graph(edges, ["top"]), { unsafe: [{ box: "ball", state: ["right"] }] });
  assert.ok(all.loops.classified);
  assert.deepEqual(all.loops.classes, ["bistable", "trapped", "oscillating"]);
  assert.deepEqual(all.loops.closed.map((c) => c.kind), ["settles", "settles", "oscillates"]);

  // From the left well alone the right well is unreachable; from the declared safe state top it is a trap.
  const spec = { unsafe: [{ box: "ball", state: ["right"] }], safe: [{ box: "ball", state: ["top", "left"] }] };
  const fromSafe = run(graph(TWO_WELLS, ["left"]), spec);
  assert.ok(fromSafe.escalation?.verdict === "unreachable");
  assert.ok(fromSafe.loops.classified);
  assert.deepEqual(fromSafe.loops.starts, { initial: 1, safe: 1 });
  // The safe start top reaches both wells, so they are reported bistable too, though the initial state reaches one.
  assert.deepEqual(fromSafe.loops.classes, ["bistable", "trapped"]);
  const [trap] = fromSafe.loops.trapped!;
  assert.equal(trap.from, "safe");
  assert.deepEqual(trap.trace.map((st) => st.state[0]), ["top", "right"]);
  assert.deepEqual(checkRun(graph(TWO_WELLS, ["left"]), spec, trap.trace, "safe"), { ok: true, errors: [] });
  assert.match(errors(checkRun(graph(TWO_WELLS, ["left"]), spec, trap.trace)), /'top' is not an initial state of 'ball'/);

  // A chain longer than the cap: no closed component is reached within it.
  const chain = graph(Array.from({ length: 60 }, (_, i) => [`s${i}`, `s${Math.min(i + 1, 59)}`] as [string, string]), ["s0"]);
  const cut = run(chain, { horizon: 5, maxStates: 30 });
  assert.ok(cut.loops.classified);
  assert.equal(cut.loops.complete, false);
  assert.deepEqual(cut.loops.classes, ["none"]);
  const whole = run(chain, { horizon: 5 });
  assert.ok(whole.loops.classified && whole.loops.complete);
  assert.deepEqual(whole.loops.closed.map((c) => c.states), [[["s59"]]]);

  // Too many global states to scan for safe starts: the initial states still classify the trap.
  const wide = escalating();
  wide.boxes.push({ id: "clock", name: "Clock", role: "supersystem", state: Array.from({ length: 40 }, (_, i) => `t${i}`), initial: ["t0"],
    transition: Array.from({ length: 40 }, (_, i) => ({ state: `t${i}`, in: {}, next: "t0", out: {} })) });
  const skipped = run(wide, { unsafe: HOT, safe: [{ box: "shaft", state: ["cold"] }], maxStates: 100 });
  assert.ok(skipped.loops.classified);
  assert.equal(skipped.loops.complete, false);
  assert.match(skipped.loops.safeStartsSkipped!, /120 global states exceed the cap of 100/);
  assert.deepEqual(skipped.loops.starts, { initial: 1, safe: 0 });
  // The clock returns to t0, so the component (hot, any time) holds no safe configuration: still trapped.
  assert.deepEqual(skipped.loops.classes, ["trapped"]);
  assert.deepEqual(skipped.loops.trapped![0].trace.map((st) => st.state), [["cold", "t0"], ["warm", "t0"], ["hot", "t0"]]);

  // A blocked state is a closed component that is not classified.
  const stuck = run(heater([["on", "hot"], ["off", "hot"]]), {});
  assert.ok(stuck.loops.classified);
  assert.deepEqual(stuck.loops.closed.map((c) => [c.states, c.kind]), [[[["hot"]], "blocked"]]);
  assert.deepEqual(stuck.loops.classes, []);
});

test("loop classification applies only to declared transitions, and not to time-varying inputs", () => {
  const stateless = run(example("bearing-heat-behavior"), { safe: [{ box: "shaft", port: "support", values: ["supported"] }] });
  assert.deepEqual(stateless.loops, { classified: false, reason: "no composed box declares transition; behavior rows are steady states, not transitions" });
  const sequenced = run(heater(), { inputs: power("on", "off") });
  assert.equal(sequenced.loops.classified, false);
});
