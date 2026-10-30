import { test } from "node:test";
import assert from "node:assert/strict";
import { type FunctionModel, checkModel } from "../src/act.js";
import { feasibility } from "../src/act-feasibility.js";
import { lifecycle } from "../src/act-lifecycle.js";
import { searchComponents } from "../src/act-component-search.js";
import { semanticIsomorphism } from "../src/act-semantic-iso.js";
import { renamedTwin } from "./support/twin.js";
import {
  contract,
  converter,
  interfaceModel,
  metadata,
} from "./support/component-search.js";
import { costModel, lifecycleModel } from "./support/lifecycle.js";
import { lifecycleCertificate } from "../src/act-cert.js";
import { bindRequest } from "../scripts/certify.mjs";

function circular(): FunctionModel {
  return {
    domain: "physical",
    budget: { usd: 10 },
    carriers: [
      { id: "a", layer: "material", dimension: "a" },
      { id: "s", layer: "energy", dimension: "s" },
    ],
    boxes: [
      {
        id: "f",
        name: "F",
        role: "mediator",
        inputs: [{ id: "in", carrier: "a" }],
        outputs: [{ id: "out", carrier: "a" }],
        feasibility: [
          { requires: { in: 1 }, provides: { out: 1 }, cost: { usd: 1 } },
        ],
      },
      {
        id: "g",
        name: "G",
        role: "tool",
        inputs: [{ id: "w", carrier: "a" }],
        outputs: [{ id: "s", carrier: "s" }],
        feasibility: [
          { requires: { w: 1 }, provides: { s: 1 }, cost: { usd: 1 } },
        ],
      },
      {
        id: "p",
        name: "P",
        role: "product",
        inputs: [{ id: "in", carrier: "s" }],
        feasibility: [{ requires: { in: 1 } }],
      },
    ],
    wires: [
      {
        id: "loop",
        from: { box: "f", port: "out" },
        to: { box: "f", port: "in" },
        carrier: "a",
        polarity: "useful",
      },
      {
        id: "w2",
        from: { box: "f", port: "out" },
        to: { box: "g", port: "w" },
        carrier: "a",
        polarity: "useful",
      },
      {
        id: "w3",
        from: { box: "g", port: "s" },
        to: { box: "p", port: "in" },
        carrier: "s",
        polarity: "useful",
      },
    ],
  };
}
test("the review's self-supplied resource cycle has a steady balance but no grounded supply witness", () => {
  const r = feasibility(circular());
  assert.ok(r.ok && "steadyState" in r, JSON.stringify(r));
  assert.equal(r.verdict, "undecided");
  assert.equal(r.reason, "circular-resource-support");
  assert.equal(r.steadyState.verdict, "feasible");
  assert.deepEqual(r.minimal[0].resources, { usd: 2 });
  assert.equal(r.sourceSupport.groundedCount, 0);
  assert.ok(r.sourceSupport.witnesses[0].unresolved.some((x) => x.box === "f"));
});
test("multi-box resource cycles are ungrounded while a declared zero-requirement feedback source is supported", () => {
  const m = circular();
  m.boxes[1].outputs!.push({ id: "back", carrier: "a" });
  m.boxes[1].feasibility![0].provides!.back = 1;
  m.wires[0].from = { box: "g", port: "back" };
  const u = feasibility(m);
  assert.ok(
    u.ok &&
      u.verdict === "undecided" &&
      u.reason === "circular-resource-support",
  );
  m.boxes[0].feasibility![0].requires = { in: 0 };
  const grounded = feasibility(m);
  assert.ok(
    grounded.ok && grounded.verdict === "feasible",
    JSON.stringify(grounded),
  );
  assert.equal(grounded.sourceSupport.groundedCount, 1);
});
test("resource support is label blind and its work shares the feasibility cap", () => {
  const m = circular(),
    twin = renamedTwin(m),
    r = feasibility(m),
    t = feasibility(twin.model);
  assert.ok(r.ok && "sourceSupport" in r && t.ok && "sourceSupport" in t);
  assert.equal(t.verdict, r.verdict);
  assert.deepEqual(twin.back(t.sourceSupport), r.sourceSupport);
  const capped = feasibility(m, { maxCandidates: r.candidates - 1 });
  assert.equal(capped.ok, false);
});
test("automatic discovery cannot certify an identity fixed point as a self-supplied engineering implementation", () => {
  const model = interfaceModel();
  model.carriers[0].values = ["1"];
  model.carriers[3].values = ["1"];
  model.boxes[1].behavior = [{ in: { in: "1" }, out: {} }];
  const stage = converter("stage", "d", "d");
  stage.behavior = [{ in: { in: "1" }, out: { out: "1" } }];
  const target = structuredClone(model);
  target.boxes.push({
    ...converter("target", "a", "d"),
    behavior: [{ in: { in: "1" }, out: { out: "1" } }],
  });
  target.wires = [
    {
      id: "in",
      from: { box: "source", port: "out" },
      to: { box: "target", port: "in" },
      carrier: "a",
      polarity: "useful",
    },
    {
      id: "out",
      from: { box: "target", port: "out" },
      to: { box: "product", port: "in" },
      carrier: "d",
      polarity: "useful",
    },
  ];
  const args = {
    model,
    resources: [{ box: "source", port: "out" }],
    targets: [{ box: "product", port: "in" }],
    catalogue: [{ id: "stage", component: stage }],
    max_components: 1,
    max_work: 1000000,
  };
  const r = searchComponents({
    ...args,
    contract: { ...contract(), target },
    implementation: metadata,
  });
  assert.ok(r.ok && "candidates" in r, JSON.stringify(r));
  assert.equal(r.verdict, "undecided");
  assert.deepEqual(r.candidates, []);
  assert.ok(
    r.results.some(
      (x) => x.result.ok && x.result.reason === "resources-undecided",
    ),
  );
  const typed = searchComponents(args);
  assert.ok(typed.ok && "candidates" in typed);
  assert.deepEqual(typed.candidates[0].unusedResources, args.resources);
  const used = searchComponents({ ...args, require_all_resources: true });
  assert.ok(used.ok && "candidates" in used);
  assert.equal(used.verdict, "impossible-in-library");
  assert.ok(used.unusedResourceRejected > 0);
});
function holdingModel(): FunctionModel {
  return {
    domain: "software",
    carriers: [],
    boxes: [],
    wires: [],
    lifecycle: { states: ["ready", "blocked"], acceptable: ["ready"] },
    actions: [
      {
        id: "run",
        guard: ["ready"],
        transitions: [{ state: "ready", next: "blocked", probability: 1 }],
      },
      {
        id: "wait",
        guard: ["blocked"],
        cost: { resource: 0 },
        transitions: [{ state: "blocked", next: "blocked", probability: 1 }],
      },
      {
        id: "service",
        guard: ["blocked"],
        cost: { resource: 2 },
        transitions: [{ state: "blocked", next: "ready", probability: 1 }],
      },
    ],
  };
}
test("an explicit holding cost makes servicing worthwhile instead of remaining blocked for free", () => {
  const m = holdingModel(),
    free = lifecycle({ model: m });
  assert.ok(free.ok && "solutions" in free);
  assert.equal(free.solutions![0].policy.blocked, "wait");
  assert.equal(free.solutions![0].availability, "0");
  m.lifecycle!.holding_cost = { blocked: { resource: 5 } };
  const paid = lifecycle({ model: m });
  assert.ok(paid.ok && "solutions" in paid, JSON.stringify(paid));
  assert.equal(paid.solutions![0].policy.blocked, "service");
  assert.equal(paid.solutions![0].gain.resource, "7/2");
  assert.equal(paid.solutions![0].availability, "1/2");
});
test("holding costs are charged once at the source state, not once per stochastic outcome", () => {
  const m = lifecycleModel();
  m.actions = [m.actions![0]];
  m.actions!.forEach((a) => {
    a.cost = { resource: 0 };
  });
  m.lifecycle!.holding_cost = {
    a: { resource: "1/3" },
    b: { resource: "1/3" },
  };
  const r = lifecycle({ model: m });
  assert.ok(r.ok && "solutions" in r, JSON.stringify(r));
  assert.equal(r.solutions![0].gain.resource, "1/3");
  const twin = renamedTwin(m),
    t = lifecycle({ model: twin.model });
  assert.ok(t.ok && "solutions" in t);
  assert.deepEqual(twin.back(t.solutions![0].gain), r.solutions![0].gain);
  assert.deepEqual(twin.back(t.solutions![0].policy), r.solutions![0].policy);
});
test("holding costs alone define dimensions and also enter the nondeterministic fallback", () => {
  const m = holdingModel();
  m.actions = m.actions!.filter(a => a.id !== "service");
  m.actions!.forEach((a) => {
    delete a.cost;
  });
  m.lifecycle!.holding_cost = {
    ready: { resource: 4 },
    blocked: { resource: 4 },
  };
  const exact = lifecycle({ model: m });
  assert.ok(exact.ok && "solutions" in exact);
  assert.equal(exact.solutions![0].gain.resource, "4");
  m.actions!.forEach((a) =>
    a.transitions.forEach((r) => {
      delete r.probability;
    }),
  );
  const range = lifecycle({ model: m });
  assert.ok(range.ok && "range" in range);
  assert.match(JSON.stringify(range.range), /"min":4/);
  assert.match(JSON.stringify(range.range), /"max":4/);
});

test("holding-cost certificates bind the declared state charges into the exact request", () => {
  const m = holdingModel();
  m.lifecycle!.holding_cost = { blocked: { resource: 5 } };
  const c = lifecycleCertificate({ model: m }, 0);
  assert.ok(c.ok, JSON.stringify(c));
  assert.deepEqual(
    bindRequest(c.content, {
      kind: "lifecycle",
      args: { model: m },
      objective: 0,
    }),
    [],
  );
  m.lifecycle!.holding_cost.blocked.resource = 6;
  assert.ok(
    bindRequest(c.content, {
      kind: "lifecycle",
      args: { model: m },
      objective: 0,
    }).length,
  );
});
test("holding costs validate their state names and box-local selection does not inherit global charges", () => {
  const m = holdingModel();
  m.lifecycle!.holding_cost = { unknown: { resource: 1 } };
  assert.equal(lifecycle({ model: m }).ok, false);
  const b = costModel();
  b.boxes[0].actions = [
    {
      id: "wait",
      guard: ["a", "b"],
      cost: { resource: 0 },
      transitions: [
        { state: "a", next: "b", probability: 1 },
        { state: "b", next: "a", probability: 1 },
      ],
    },
  ];
  b.boxes[0].holding_cost = { a: { resource: 2 }, b: { resource: 2 } };
  b.lifecycle = {
    states: ["a", "b"],
    holding_cost: { a: { resource: 99 }, b: { resource: 99 } },
  };
  b.actions = b.boxes[0].actions;
  const r = lifecycle({ model: b, box: "machine" });
  assert.ok(r.ok && "solutions" in r);
  assert.equal(r.solutions![0].gain.resource, "2");
  const local = structuredClone(b);
  delete local.lifecycle;
  delete local.actions;
  const twin = renamedTwin(local);
  const iso = semanticIsomorphism({
    source: local,
    target: twin.model,
    profile: "all",
    max_steps: 100000,
  });
  assert.ok(iso.ok && "aligned" in iso && iso.aligned, JSON.stringify(iso));
  local.boxes[0].feasibility = [{ cost: { unrelated: 1 } }];
  const dynamicsOnly = semanticIsomorphism({
    source: local,
    target: twin.model,
    profile: "dynamics",
    max_steps: 100000,
  });
  assert.ok(
    dynamicsOnly.ok && "aligned" in dynamicsOnly && dynamicsOnly.aligned,
    JSON.stringify(dynamicsOnly),
  );
  delete local.boxes[0].feasibility;
  local.boxes[0].holding_cost!.a.resource = 3;
  assert.ok(checkModel(local).ok);
  const different = semanticIsomorphism({
    source: local,
    target: twin.model,
    profile: "all",
    max_steps: 100000,
  });
  assert.ok(different.ok && "aligned" in different && !different.aligned);
});

test("box-local lifecycle results do not inherit unrelated or colliding global availability states", () => {
  const local: FunctionModel = { domain: "software", carriers: [], wires: [], boxes: [{
    id: "local", name: "Local", role: "tool", state: ["ready"], initial: ["ready"],
    transition: [{ state: "ready", next: "ready", in: {}, out: {} }],
    holding_cost: { ready: { resource: 2 } },
    actions: [{ id: "wait", guard: ["ready"], cost: { resource: 1 }, transitions: [{ state: "ready", next: "ready", probability: 1 }] }],
  }] };
  const baseline = lifecycle({ model: local, box: "local" });
  assert.ok(baseline.ok && "solutions" in baseline);
  assert.equal(baseline.solutions![0].availability, "0");
  for (const state of ["unrelated", "ready"]) {
    const model = structuredClone(local);
    model.lifecycle = { states: [state], acceptable: [state], holding_cost: { [state]: { resource: 99 } } };
    model.actions = [{ id: "global-wait", guard: [state], cost: { resource: 7 }, transitions: [{ state, next: state, probability: 1 }] }];
    assert.deepEqual(lifecycle({ model, box: "local" }), baseline);
    const explicit = lifecycle({ model, box: "local", acceptable: ["ready"] });
    assert.ok(explicit.ok && "solutions" in explicit);
    assert.equal(explicit.solutions![0].availability, "1");
    assert.equal(explicit.solutions![0].gain.resource, "3");
    const global = lifecycle({ model });
    assert.ok(global.ok && "solutions" in global);
    assert.equal(global.solutions![0].availability, "1");
    assert.equal(global.solutions![0].gain.resource, "106");
  }
  assert.equal(lifecycle({ model: local, box: "local", acceptable: ["unknown"] }).ok, false);
});
