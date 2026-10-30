import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Carrier, FunctionModel, sameCarrier, checkModel } from "../src/act.js";
import { parseUnit, sameDimension } from "../src/act-dimensions.js";
import { lintModel } from "../src/act-lint.js";
import { buildModel } from "../src/act-builder.js";
import { findIsomorphism } from "../src/act-iso.js";
import { boundedDynamics } from "../src/act-dynamics.js";
import { meanCosts, type CostEdge } from "../src/act-mean-cost.js";
import { effectChains, type TypedEffect } from "../src/act-effects.js";
import { lifecycle } from "../src/act-lifecycle.js";
import { bondGraph } from "../src/act-bond.js";
import { meanCostCertificate, lifecycleCertificate } from "../src/act-cert.js";
import {
  lint,
  bindRequest,
  checkAll,
  tamperVariants,
} from "../scripts/certify.mjs";
import { renamedTwin } from "./support/twin.js";
import { costModel, lifecycleModel, bondModel } from "./support/lifecycle.js";
import { toolSpecs } from "../src/tools.js";
import "../src/data.js";
const tools = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (name: string, args: unknown) =>
  JSON.parse((await tools[name].handler(args)).content[0].text);

test("SI base products, denominator powers, zero normalization and invalid units", () => {
  assert.deepEqual(parseUnit("kg·m·s^-2"), { M: 1, L: 1, T: -2 });
  assert.ok(sameDimension("kg*m/s^2", { L: 1, M: 1, T: -2, J: 0 }));
  assert.ok(sameDimension("m/m", {}));
  assert.equal(sameDimension(undefined, {}), false);
  for (const s of [
    "N",
    "m//s",
    "kg·",
    "m^0.5",
    "m^-",
    "m^9007199254740992",
    "unknown",
  ])
    assert.equal(parseUnit(s), undefined, s);
  assert.equal(
    Carrier.safeParse({
      id: "x",
      layer: "energy",
      dimension: "label",
      si: { X: 1 },
    }).success,
    false,
  );
});
test("shared equality and builder preserve SI and reject conflicting dimensions", () => {
  const c = {
    id: "c",
    layer: "energy" as const,
    dimension: "label",
    si: "kg*m/s^2",
    unit: "display",
  };
  assert.ok(
    sameCarrier(c, { ...c, si: { M: 1, L: 1, T: -2 }, unit: "other display" }),
  );
  assert.equal(sameCarrier(c, { ...c, si: { M: 1 } }), false);
  const r = buildModel({
    domain: "physical",
    components: [
      { id: "a", name: "A", role: "tool" },
      { id: "b", name: "B", role: "product" },
    ],
    interactions: [
      {
        subject: "a",
        action: "one",
        object: "b",
        carrier: c,
        polarity: "useful",
      },
      {
        subject: "a",
        action: "two",
        object: "b",
        carrier: { ...c, si: { M: 1 } },
        polarity: "useful",
      },
    ],
  });
  assert.ok(!r.ok);
  assert.equal(r.issues[0].code, "dimension-mismatch");
  assert.equal(r.issues[0].path, "$.interactions[1].carrier");
});
test("dimension lints cover levels and amount declarations and are label blind", () => {
  const m: FunctionModel = {
    domain: "physical",
    carriers: [
      {
        id: "c",
        layer: "energy",
        dimension: "label",
        si: { L: 1 },
        unit: "s",
        values: ["v"],
        levels: [{ value: "v", from: 0, unit: "kg" }],
      },
    ],
    boxes: [
      {
        id: "a",
        name: "A",
        role: "tool",
        outputs: [{ id: "p", carrier: "c" }],
        feasibility: [{ provides: { p: 1 }, units: { p: "s" } }],
      },
    ],
    wires: [],
  };
  assert.ok(checkModel(m).ok);
  const codes = (m: FunctionModel) =>
    lintModel(m)
      .filter((x) => x.code === "dimension-mismatch")
      .map((x) => [x.code, x.path]);
  assert.equal(codes(m).length, 3);
  assert.deepEqual(
    codes(m).map((x) => x[0]),
    codes(renamedTwin(m).model).map((x) => x[0]),
  );
});
test("isomorphism preserves structured SI while ignoring free dimension and unit labels", () => {
  const m = bondModel(),
    t = renamedTwin(m);
  m.carriers[0].si = { L: 1 };
  t.model.carriers[0].si = { L: 1 };
  assert.equal(findIsomorphism(m, t.model).isomorphic, true);
  t.model.carriers[0].si = { T: 1 };
  assert.equal(findIsomorphism(m, t.model).isomorphic, false);
});
test("Karp bounds match independent elementary-cycle enumeration on generated multigraphs", () => {
  for (let seed = 1; seed <= 80; seed++) {
    const n = 2 + (seed % 4);
    let state = seed;
    const rand = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    const edges: CostEdge[] = Array.from({ length: n }, (_, i) => ({
      from: i,
      to: (i + 1) % n,
      cost: { d: (rand() % 19) / 10 },
      rows: [],
    }));
    for (let i = 0; i < n * n; i++)
      if (rand() % 3 === 0)
        edges.push({
          from: rand() % n,
          to: rand() % n,
          cost: { d: (rand() % 19) / 10 },
          rows: [],
        });
    const means: number[] = [];
    const walk = (root: number, v: number, seen: number[], total: number) => {
      for (const e of edges.filter((e) => e.from === v)) {
        const cost = Number(e.cost.d);
        if (e.to === root) means.push((total + cost) / seen.length);
        else if (!seen.includes(e.to))
          walk(root, e.to, [...seen, e.to], total + cost);
      }
    };
    for (let i = 0; i < n; i++) walk(i, i, [i], 0);
    const r = meanCosts(
      Array.from({ length: n }, (_, i) => [String(i)]),
      edges,
    );
    assert.equal(r.verdict, "decided");
    if (r.verdict !== "decided") continue;
    assert.ok(Math.abs(r.values[0].min - Math.min(...means)) < 1e-12);
    assert.ok(Math.abs(r.values[0].max - Math.max(...means)) < 1e-12);
    for (const cycle of [r.values[0].minCycle, r.values[0].maxCycle])
      assert.ok(
        cycle.every(
          (e, i) =>
            JSON.stringify(e.to) ===
            JSON.stringify(cycle[(i + 1) % cycle.length].from),
        ),
      );
  }
});
test("costed dynamics keeps parallel rows, per-dimension costs, renamed witnesses and caps", () => {
  const m = costModel();
  m.boxes[0].transition!.push({
    ...m.boxes[0].transition![0],
    cost: { resource: 7 },
  });
  const r = boundedDynamics(m);
  assert.ok(r.ok && "loops" in r && "closed" in r.loops);
  const mean = r.loops.closed[0].meanCost;
  assert.ok(mean?.verdict === "decided");
  assert.deepEqual([mean.values[0].min, mean.values[0].max], [1.5, 7]);
  const t = renamedTwin(m),
    s = boundedDynamics(t.model);
  assert.ok(s.ok && "loops" in s && "closed" in s.loops);
  assert.deepEqual(t.back(s.loops.closed[0].meanCost), mean);
  const cap = boundedDynamics(m, { maxCostWork: 1 });
  assert.ok(cap.ok && "loops" in cap && "closed" in cap.loops);
  assert.equal(cap.loops.closed[0].meanCost?.verdict, "undecided");
});
const effect = (
  id: string,
  input: string,
  output: string,
  conditions: string[] = [],
): TypedEffect => ({
  id,
  name: id,
  input: { quantity: input },
  output: { quantity: output },
  field: "information",
  conditions,
  source: "synthetic test declaration",
  typed_from: "source",
});
test("effect search returns checked wiring and deterministic semantic ranking", () => {
  const effects = [
    effect("first", "a", "z", ["given"]),
    effect("second", "a", "z"),
    effect("third", "a", "b"),
    effect("fourth", "b", "z"),
  ];
  const args = {
    resources: [{ quantity: "a" }],
    output: { quantity: "z" },
    effects,
    conditions: ["given"],
    k: 2,
  };
  const r = effectChains(args);
  assert.ok(r.ok && "chains" in r);
  assert.equal(r.chains.length, 3);
  assert.ok(r.chains.every((c) => checkModel(c.model).ok));
  assert.deepEqual(
    r.chains.map((c) => c.effects.map((e) => e.id)),
    [["first"], ["second"], ["third", "fourth"]],
  );
  assert.deepEqual(effectChains(args), r);
  const renamed = effectChains({
    ...args,
    effects: effects.map((e, i) => ({
      ...e,
      id: `label${9 - i}`,
      name: "different",
    })),
  });
  assert.ok(renamed.ok && "chains" in renamed);
  assert.deepEqual(
    renamed.chains.map((c) => c.effects.length),
    r.chains.map((c) => c.effects.length),
  );
  const cap = effectChains({ ...args, max_steps: 1 });
  assert.ok(cap.ok && "verdict" in cap);
  assert.equal(cap.verdict, "undecided");
  assert.deepEqual(cap.chains, []);
});
test("effect dimensions must match; model resources use explicit quantity types", () => {
  const e = {
    ...effect("e", "a", "z"),
    input: { quantity: "a", si: { L: 1 } },
  };
  const mismatch = effectChains({
    resources: [{ quantity: "a", si: { T: 1 } }],
    output: { quantity: "z" },
    effects: [e],
  });
  assert.ok(mismatch.ok);
  assert.equal(mismatch.verdict, "none");
  const m: FunctionModel = {
    domain: "physical",
    boxes: [],
    wires: [],
    carriers: [
      {
        id: "c",
        layer: "energy",
        dimension: "free label",
        effect_quantity: "a",
        si: { L: 1 },
      },
    ],
  };
  const r = effectChains({ model: m, output: { quantity: "z" }, effects: [e] });
  const t = renamedTwin(m,["z"]);
  const s = effectChains({
    model: t.model,
    output: { quantity: t.token("z") },
    effects: [{...e,input:{...e.input,quantity:t.token("a")},output:{quantity:t.token("z")}}],
  });
  assert.deepEqual(t.back(s), r);
});
test("typed catalogue entries identify their existing source fields", async () => {
  const result = await call("triz_effects", {
    input: "temperature difference",
    output: "voltage",
  });
  assert.equal(result.effects.length, 1);
  assert.equal(result.effects[0].typed_from, "statement");
  for (const e of JSON.parse(
    fs.readFileSync("skills/triz-innovation/data/effects.json", "utf8"),
  ).effects.filter((e: any) => e.input)) {
    assert.ok(["source","statement"].includes(e.typed_from));
    assert.ok(e.source);
    assert.ok(e.output);
    assert.ok(e.field);
  }
});
test("lifecycle exact policy, bias, occupancy, availability and renamed twins", () => {
  const m = lifecycleModel(),
    r = lifecycle({ model: m });
  assert.ok(r.ok && "solutions" in r && r.solutions);
  const s = r.solutions[0];
  assert.deepEqual(s.policy, { a: "stay", b: "reset" });
  assert.deepEqual(s.occupancy, { a: "2/3", b: "1/3" });
  assert.equal(s.objectiveGain, "7/3");
  assert.equal(s.availability, "2/3");
  const t = renamedTwin(m),
    renamed = lifecycle({ model: t.model });
  assert.ok(renamed.ok && "solutions" in renamed);
  assert.deepEqual(t.back(renamed.solutions), r.solutions);
});
test("lifecycle matches an independent two-state all-policy oracle on generated models", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = lifecycleModel();
    m.actions = [];
    const choices: Array<{ p: number; c: number }[]> = [];
    for (let i = 0; i < 2; i++) {
      const options = [];
      for (let j = 0; j < 2; j++) {
        const p = 1 + ((seed * (i + 2) + j * 3) % 8),
          c = (seed + j * 7 + i * 3) % 13;
        options.push({ p: p / 10, c });
        m.actions.push({
          id: `${i}-${j}`,
          guard: [["a", "b"][i]],
          cost: { d: c },
          transitions: [
            { state: ["a", "b"][i], next: "a", probability: `${p}/10` },
            { state: ["a", "b"][i], next: "b", probability: `${10 - p}/10` },
          ],
        });
      }
      choices.push(options);
    }
    const all = choices[0].flatMap((a) =>
      choices[1].map((b) => {
        const pi = b.p / (1 - a.p + b.p);
        return pi * a.c + (1 - pi) * b.c;
      }),
    );
    const r = lifecycle({ model: m });
    assert.ok(r.ok && "solutions" in r && r.solutions, JSON.stringify(r));
    const exact = r.solutions[0].objectiveGain.split("/").map(Number);
    assert.ok(Math.abs(exact[0] / (exact[1] ?? 1) - Math.min(...all)) < 1e-10);
  }
});
test("lifecycle exact probabilities, explicit weights, multichain refusal and work caps", () => {
  const m = lifecycleModel();
  m.actions![0].transitions[0].probability = "1/3";
  const r = lifecycle({ model: m });
  assert.ok(!r.ok);
  assert.equal(r.issues[0].code, "invalid-probability");
  const cap = lifecycle({ model: lifecycleModel(), max_steps: 1 });
  assert.ok(cap.ok && "verdict" in cap);
  assert.equal(cap.verdict, "undecided");
  const many = lifecycleModel();
  many.actions![1].cost = { resource: 1, other: 2 };
  assert.equal(lifecycle({ model: many, weights: { resource: 1 } }).ok, false);
  assert.equal(
    lifecycle({ model: many, weights: { resource: 1, other: 1 } }).ok,
    true,
  );
  const multi = lifecycleModel();
  multi.actions = [
    {
      id: "wait",
      guard: ["a", "b"],
      cost: { d: 1 },
      transitions: [
        { state: "a", next: "a", probability: 1 },
        { state: "b", next: "b", probability: 1 },
      ],
    },
  ];
  const u = lifecycle({ model: multi });
  assert.ok(u.ok && "verdict" in u);
  assert.equal(u.verdict, "undecided");
});
test("absent probabilities fall back to a checked nondeterministic T3 range", () => {
  const m = lifecycleModel();
  m.actions!.forEach((a) => a.transitions.forEach((r) => delete r.probability));
  const r = lifecycle({ model: m });
  assert.ok(r.ok && "verdict" in r);
  assert.equal(r.verdict, "nondeterministic");
});
test("bond causality checks, conflicts, derivative storage and caps are label blind", () => {
  const m = bondModel(),
    r = bondGraph({ model: m });
  assert.ok(r.ok && r.verdict === "assigned");
  assert.equal(r.findings!.length, 0);
  assert.deepEqual(
    renamedTwin(m).back(bondGraph({ model: renamedTwin(m).model })),
    r,
  );
  const conflict = bondModel();
  conflict.boxes[2].bond = { element: "Se" };
  const s = bondGraph({ model: conflict });
  assert.ok(s.ok);
  assert.equal(s.verdict, "conflict");
  const storage = bondModel();
  storage.boxes[2].bond = { element: "C" };
  const t = bondGraph({ model: storage });
  assert.ok(t.ok && t.verdict === "assigned");
  assert.ok(t.findings!.some((x) => x.code === "derivative-causality"));
  const cap = bondGraph({ model: m, max_steps: 1 });
  assert.ok(cap.ok);
  assert.equal(cap.verdict, "undecided");
});
test("bond typing rejects information, duplicated ports and mismatched energy dimensions", () => {
  const m = bondModel();
  m.carriers[0].layer = "information";
  assert.equal(bondGraph({ model: m }).ok, false);
  const other = bondModel();
  other.carriers[0].energy!.power_si = { M: 1 };
  const r = bondGraph({ model: other });
  assert.ok(!r.ok);
  assert.equal(r.issues[0].code, "invalid-bond");
});
test("new finite certificate grammar, request binding, and per-statement tampers", () => {
  const requests = [
    {
      kind: "mean-cost" as const,
      model: costModel(),
      spec: {},
      component: 0,
      dimension: "resource",
    },
    {
      kind: "lifecycle" as const,
      args: { model: lifecycleModel() },
      objective: 0,
    },
  ];
  const certificates = [
    meanCostCertificate(costModel(), {}, 0, "resource", {
      namespace: "MeanCostFixture",
    }),
    lifecycleCertificate({ model: lifecycleModel() }, 0, {
      namespace: "LifecycleFixture",
    }),
  ];
  for (let i = 0; i < certificates.length; i++) {
    const c = certificates[i];
    assert.ok(c.ok, JSON.stringify(c));
    assert.deepEqual(lint(c.content), []);
    assert.deepEqual(bindRequest(c.content, requests[i]), []);
    assert.ok(tamperVariants(c.content).length >= 3);
    if (process.env.UPDATE_GOLDEN)
      fs.writeFileSync(`theory/Certificates/${c.namespace}.lean`, c.content);
  }
});

test("concept-specific occupancy priors feed weakness without changing inclusion", async () => {
  const m = lifecycleModel();
  m.carriers = [
    {
      id: "q",
      layer: "information",
      dimension: "quantity",
      values: ["low", "high"],
    },
  ];
  m.boxes = [
    {
      id: "read",
      name: "Read",
      role: "tool",
      inputs: [{ id: "in", carrier: "q" }],
      outputs: [{ id: "out", carrier: "q" }],
      behavior: ["low", "high"].map((v) => ({
        in: { in: v },
        out: { out: v },
      })),
    },
    {
      id: "product",
      name: "Product",
      role: "product",
      inputs: [{ id: "p", carrier: "q" }],
      behavior: ["low", "high"].map((v) => ({ in: { p: v }, out: {} })),
    },
  ];
  m.wires = [
    {
      id: "w",
      from: { box: "read", port: "out" },
      to: { box: "product", port: "p" },
      carrier: "q",
      polarity: "useful",
    },
  ];
  m.lifecycle!.situations = {
    a: [{ box: "read", port: "in", value: "low" }],
    b: [{ box: "read", port: "in", value: "high" }],
  };
  const other = structuredClone(m);
  other.actions![0].transitions[0].probability = "1/4";
  other.actions![0].transitions[1].probability = "3/4";
  const concepts = [
      { id: "first", model: m },
      { id: "second", model: other },
    ],
    acceptable = [{ box: "product", port: "p", values: ["low"] }];
  const base = await call("triz_weakness", { concepts, acceptable });
  const derived = await call("triz_weakness", {
    concepts,
    acceptable,
    lifecycle_priors: [
      { concept: "first", objective: 0 },
      { concept: "second", objective: 0 },
    ],
  });
  assert.equal(derived.lifecyclePriors.verdict, "derived");
  assert.deepEqual(derived.pairs, base.pairs);
  assert.ok(
    Math.abs(derived.lifecyclePriors.concepts[0].admittedProbability - 2 / 3) <
      1e-12,
  );
  assert.notEqual(
    derived.lifecyclePriors.concepts[0].admittedProbability,
    derived.lifecyclePriors.concepts[1].admittedProbability,
  );
  const t = renamedTwin(m),
    u = renamedTwin(other);
  const twin = await call("triz_weakness", {
    concepts: [
      { id: "first", model: t.model },
      { id: "second", model: u.model },
    ],
    acceptable: [
      {
        box: t.box("product"),
        port: t.port("product", "p"),
        values: [t.value("low")],
      },
    ],
    lifecycle_priors: [
      { concept: "first", objective: 0 },
      { concept: "second", objective: 0 },
    ],
  });
  assert.deepEqual(
    twin.lifecyclePriors.concepts.map((c: any) => c.admittedProbability),
    derived.lifecyclePriors.concepts.map((c: any) => c.admittedProbability),
  );
});

test("recurring rational costs sum exactly and missing-probability ranges preserve decimal sums", () => {
  const m = costModel();
  m.boxes[0].transition!.forEach((r) => (r.cost = { resource: "1/3" }));
  const r = boundedDynamics(m);
  assert.ok(r.ok && "loops" in r && "closed" in r.loops);
  const mean = r.loops.closed[0].meanCost;
  assert.ok(mean?.verdict === "decided");
  assert.equal(mean.values[0].exact.min, "1/3");
  const action = lifecycleModel();
  action.actions![0].cost = { d: 0.1 };
  action.actions![1].cost = { d: 0.1 };
  action.actions!.forEach((a) =>
    a.transitions.forEach((r) => {
      delete r.probability;
      r.cost = { d: 0.2 };
    }),
  );
  const s = lifecycle({ model: action });
  assert.ok(
    s.ok &&
      s.verdict === "nondeterministic" &&
      s.range &&
      s.range.ok &&
      "loops" in s.range &&
      "closed" in s.range.loops,
  );
  const range = s.range.loops.closed[0].meanCost;
  assert.ok(range?.verdict === "decided");
  assert.equal(range.values[0].exact.min, "3/10");
});

test("effect-chain identity needs no effect when the required resource is already available", () => {
  const r = effectChains({
    resources: [{ quantity: "q", si: { L: 1 } }],
    output: { quantity: "q", si: { L: 1 } },
    effects: [],
    k: 0,
  });
  assert.ok(r.ok);
  assert.equal(r.verdict, "chains");
  assert.equal(r.chains[0].effects.length, 0);
  assert.ok(checkModel(r.chains[0].model).ok);
});
