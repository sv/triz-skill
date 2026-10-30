import "../src/data.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkModel, type FunctionModel } from "../src/act.js";
import { effectChains } from "../src/act-effects.js";
import { insertEffectChain } from "../src/act-effect-insert.js";
import { searchComponents } from "../src/act-component-search.js";
import { rewrite } from "../src/act-rewrite.js";
import { behaviorCertificate, modelCertificate } from "../src/act-cert.js";
import { bindRequest, lint } from "../scripts/certify.mjs";
import { renamedTwin } from "./support/twin.js";
import {
  componentRequest,
  converter,
  contract,
  effects,
  interfaceModel,
  metadata,
  targetModel,
} from "./support/component-search.js";
import { toolSpecs } from "../src/tools.js";

test("a found effect chain inserts into the existing model with replay, citations and explicit hypotheses", () => {
  const model = interfaceModel(),
    found = effectChains({
      resources: [{ quantity: "a", si: {} }],
      output: { quantity: "d", si: {} },
      effects,
      k: 2,
    });
  assert.ok(found.ok && found.verdict === "chains");
  const r = insertEffectChain({
    model,
    from: { box: "source", port: "out" },
    to: { box: "product", port: "in" },
    chain: found.chains[0].effects,
  });
  assert.ok(r.ok && "model" in r, JSON.stringify(r));
  assert.equal(r.model.boxes.length, 4);
  assert.ok(checkModel(r.model).ok);
  assert.deepEqual(r.unmetConditions, ["declared-condition"]);
  assert.equal(r.effects[0].source, effects[0].source);
  assert.equal(r.model.boxes[2].behavior, undefined);
  assert.equal(r.model.boxes[2].feasibility, undefined);
  assert.deepEqual(
    rewrite(
      { ...model, carriers: [...model.carriers, ...r.carriersAdded] },
      r.rewrite,
    ),
    { ok: true, model: r.model, basis: r.basis },
  );
  assert.equal(model.boxes.length, 2);
  assert.deepEqual(model.wires, []);
});

test("effect insertion rejects incompatible SI, occupied inputs, wrong replacement, undeclared endpoints and unsafe flow changes", () => {
  const a = {
    model: interfaceModel(),
    from: { box: "source", port: "out" },
    to: { box: "product", port: "in" },
    chain: effects,
  };
  assert.equal(
    insertEffectChain({
      ...a,
      chain: [
        { ...effects[0], input: { quantity: "a", si: { L: 1 } } },
        effects[1],
      ],
    }).ok,
    false,
  );
  assert.equal(
    insertEffectChain({ ...a, from: { box: "source", port: "missing" } }).ok,
    false,
  );
  assert.equal(insertEffectChain({ ...a, replace_wire: "missing" }).ok, false);
  const m = targetModel();
  assert.equal(insertEffectChain({ ...a, model: m }).ok, false);
  const good = insertEffectChain({ ...a, model: m, replace_wire: "end" });
  assert.ok(good.ok && "model" in good);
  m.flows = [{ id: "path", carrier: "d", path: ["reference", "product"] }];
  assert.equal(
    insertEffectChain({ ...a, model: m, replace_wire: "end" }).ok,
    false,
  );
  assert.equal(
    insertEffectChain({ ...a, model: m, replace_wire: "end", flows: [] }).ok,
    true,
  );
  const missing = interfaceModel();
  delete missing.carriers[0].effect_quantity;
  assert.equal(insertEffectChain({ ...a, model: missing }).ok, false);
});

test("effect insertion preserves declared rows and avoids generated-id collisions", () => {
  const model = interfaceModel();
  model.boxes.push({ id: "effect-box-0", name: "Existing", role: "tool" });
  model.carriers.push({ ...model.carriers[0], id: "effect-carrier-0" });
  const args = {
    model,
    from: { box: "source", port: "out" },
    to: { box: "product", port: "in" },
    chain: effects,
  };
  const bare = insertEffectChain({
    ...args,
    intermediate_layers: ["information"],
  });
  assert.ok(bare.ok && "model" in bare);
  assert.equal(bare.carriersAdded[0].id, "effect-carrier-1");
  const r = insertEffectChain({
    ...args,
    intermediate_carriers: ["b"],
    declarations: [converter("x", "a", "b"), converter("y", "b", "d")].map(
      ({ behavior, feasibility }) => ({ behavior, feasibility }),
    ),
  });
  assert.ok(r.ok && "model" in r, JSON.stringify(r));
  assert.equal(r.effects[0].box, "effect-box-1");
  assert.deepEqual(r.carriersAdded, []);
  assert.ok(r.model.boxes.at(-1)!.behavior);
});

test("component search finds an ordered chain without caller-specified components or wiring", () => {
  const a = componentRequest(),
    r = searchComponents(a);
  assert.ok(r.ok && "candidates" in r, JSON.stringify(r));
  assert.equal(r.verdict, "candidates");
  assert.equal(r.complete, true);
  assert.equal(r.satisfyingCount, 1);
  assert.deepEqual(
    r.candidates[0].components.map((c) => c.template),
    ["bd", "ab"],
  );
  assert.ok(checkModel(r.candidates[0].model).ok);
  const replay = rewrite(a.model, r.candidates[0].rewrite);
  assert.ok(replay.ok);
  assert.deepEqual(replay.model, r.candidates[0].model);
});

test("bounded topology enumeration agrees with an independent path oracle on generated acyclic catalogues", () => {
  for (let mask = 0; mask < 64; mask++) {
    const edges: [[string, string], ...Array<[string, string]>] = [
      ["a", "b"],
      ["a", "c"],
      ["a", "d"],
      ["b", "c"],
      ["b", "d"],
      ["c", "d"],
    ];
    const selected = edges.filter((_, i) => mask & (1 << i));
    const paths = (at: string): string[][] =>
      at === "d"
        ? [[]]
        : selected.flatMap(([s, t], i) =>
            s === at ? paths(t).map((p) => [String(i), ...p]) : [],
          );
    const expected = paths("a")
      .map((p) => [...p].reverse().join(","))
      .sort();
    const r = searchComponents({
      ...componentRequest(),
      catalogue: selected.map(([s, t], i) => ({
        id: String(i),
        component: converter(String(i), s, t),
      })),
      max_components: 3,
      max_work: 100000,
      limit: 100,
    });
    assert.ok(r.ok && "candidates" in r && r.complete, JSON.stringify(r));
    assert.deepEqual(
      r.candidates
        .map((c) => c.components.map((x) => x.template).join(","))
        .sort(),
      expected,
      `graph ${mask}`,
    );
  }
});

test("component search constructs multi-input assemblies and can share one created component", () => {
  const a = componentRequest();
  const joint = {
    ...converter("joint", "a", "d"),
    inputs: [
      { id: "in", carrier: "a" },
      { id: "second", carrier: "a" },
    ],
    behavior: undefined,
    feasibility: undefined,
  };
  const r = searchComponents({
    ...a,
    catalogue: [{ id: "joint", component: joint }],
    max_components: 1,
  });
  assert.ok(
    r.ok && "candidates" in r && r.satisfyingCount === 1,
    JSON.stringify(r),
  );
  assert.equal(r.candidates[0].model.wires.length, 3);
  const m = interfaceModel();
  m.boxes[1].inputs!.push({ id: "other", carrier: "d" });
  m.boxes[1].behavior = undefined;
  const shared = searchComponents({
    ...a,
    model: m,
    targets: [...a.targets, { box: "product", port: "other" }],
    catalogue: [{ id: "direct", component: converter("direct", "a", "d") }],
    max_components: 1,
  });
  assert.ok(
    shared.ok && "candidates" in shared && shared.satisfyingCount === 1,
    JSON.stringify(shared),
  );
  assert.equal(shared.candidates[0].components.length, 1);
});

test("desired behavior and budget are checked together on the constructed assembly", () => {
  const a = componentRequest();
  const wrong = converter("wrong", "a", "d");
  wrong.behavior = ["0", "1"].map((v) => ({
    in: { in: v },
    out: { out: "0" },
  }));
  const r = searchComponents({
    ...a,
    contract: contract(),
    implementation: metadata,
    catalogue: [
      { id: "wrong", component: wrong },
      { id: "expensive", component: converter("expensive", "a", "d", 9) },
      ...a.catalogue,
    ],
    max_work: 1000000,
  });
  assert.ok(r.ok && "candidates" in r, JSON.stringify(r));
  assert.equal(r.verdict, "synthesized");
  assert.equal(r.satisfyingCount, 1);
  assert.ok(
    r.results.some(
      (x) => x.result.ok && x.result.reason === "behavior-changed",
    ),
  );
  assert.ok(
    r.results.some(
      (x) => x.result.ok && x.result.reason === "resource-infeasible",
    ),
  );
  assert.ok(
    r.candidates[0].result?.ok &&
      r.candidates[0].result.verdict === "satisfied",
  );
});

test("removing components automatically retains every lost consumer as a wiring obligation", () => {
  const m = targetModel(),
    a = componentRequest();
  const r = searchComponents({ ...a, model: m, remove: ["reference"] });
  assert.ok(
    r.ok && "candidates" in r && r.satisfyingCount === 1,
    JSON.stringify(r),
  );
  assert.ok(!r.candidates[0].model.boxes.some((b) => b.id === "reference"));
  assert.deepEqual(r.candidates[0].rewrite.delete?.wires, ["start", "end"]);
  const occupied = searchComponents({ ...a, model: m });
  assert.equal(occupied.ok, false);
});

test("caps never report impossibility or rank a truncated search; display limits keep the best complete result", () => {
  const a = componentRequest(),
    capped = searchComponents({ ...a, max_work: 1 });
  assert.ok(capped.ok && "candidates" in capped);
  assert.equal(capped.verdict, "undecided");
  assert.equal(capped.complete, false);
  assert.deepEqual(capped.candidates, []);
  const r = searchComponents({
    ...a,
    catalogue: [
      ...a.catalogue,
      { id: "direct", component: converter("direct", "a", "d") },
    ],
    limit: 1,
  });
  assert.ok(r.ok && "candidates" in r && r.complete);
  assert.equal(r.satisfyingCount, 2);
  assert.equal(r.truncated, true);
  assert.equal(r.candidates[0].components.length, 1);
  const none = searchComponents({ ...a, max_components: 1 });
  assert.ok(none.ok && "candidates" in none);
  assert.equal(none.verdict, "impossible-in-library");
  assert.equal(none.complete, true);
});

test("unknown property evidence stays undecided and malformed templates fail closed", () => {
  const a = componentRequest(),
    incomplete = structuredClone(a);
  delete incomplete.catalogue[0].component.behavior;
  const u = searchComponents({
    ...incomplete,
    contract: contract(),
    implementation: metadata,
    max_work: 1000000,
  });
  assert.ok(u.ok && "candidates" in u);
  assert.equal(u.verdict, "undecided");
  assert.equal(u.allDecided, false);
  assert.equal(searchComponents({ ...a, contract: contract() }).ok, false);
  assert.equal(
    searchComponents({
      ...a,
      catalogue: [{ id: "bad", component: converter("bad", "unknown", "d") }],
    }).ok,
    false,
  );
  assert.equal(
    searchComponents({ ...a, resources: [{ box: "ghost", port: "out" }] }).ok,
    false,
  );
  assert.equal(
    searchComponents({ ...a, targets: [...a.targets, ...a.targets] }).ok,
    false,
  );
});

test("search and insertion verdicts are invariant under systematic id and label renaming", () => {
  const a = componentRequest(),
    combined = {
      ...a.model,
      boxes: [...a.model.boxes, ...a.catalogue.map((t) => t.component)],
    },
    twin = renamedTwin(combined,effects.flatMap(e=>[e.input.quantity,e.output.quantity,...e.conditions]));
  const model = { ...twin.model, boxes: twin.model.boxes.slice(0, 2) };
  const r = searchComponents(a),
    t = searchComponents({
      ...a,
      model,
      resources: a.resources.map((e) => ({
        box: twin.box(e.box),
        port: twin.port(e.box, e.port),
      })),
      targets: a.targets.map((e) => ({
        box: twin.box(e.box),
        port: twin.port(e.box, e.port),
      })),
      catalogue: a.catalogue.map((entry, i) => ({
        ...entry,
        id: `template-${10 - i}`,
        component: twin.model.boxes[i + 2],
      })),
    });
  assert.ok(r.ok && "candidates" in r && t.ok && "candidates" in t);
  assert.equal(r.verdict, t.verdict);
  assert.equal(r.checkedCount, t.checkedCount);
  assert.equal(r.satisfyingCount, t.satisfyingCount);
  assert.deepEqual(
    twin.back(t.candidates[0].model.wires),
    r.candidates[0].model.wires,
  );
  const inserted = insertEffectChain({
    model,
    from: { box: twin.box("source"), port: twin.port("source", "out") },
    to: { box: twin.box("product"), port: twin.port("product", "in") },
    chain: effects.map(e=>({...e,input:{...e.input,quantity:twin.token(e.input.quantity)},output:{...e.output,quantity:twin.token(e.output.quantity)},conditions:e.conditions.map(twin.token)})),
  });
  assert.ok(inserted.ok && "model" in inserted);
  assert.equal(inserted.verdict, "inserted");
});

test("generated networks reuse request-bound typing and behavior certificates", () => {
  const r = searchComponents({
    ...componentRequest(),
    contract: contract(),
    implementation: metadata,
    max_work: 1000000,
  });
  assert.ok(r.ok && "candidates" in r && r.candidates.length);
  const model = r.candidates[0].model,
    typed = modelCertificate(model),
    behavior = behaviorCertificate(contract().target, model, {
      scope: "whole",
    });
  assert.ok(typed.ok && behavior.ok);
  assert.deepEqual(lint(typed.content), []);
  assert.deepEqual(lint(behavior.content), []);
  assert.deepEqual(bindRequest(typed.content, { kind: "model", model }), []);
  assert.deepEqual(
    bindRequest(behavior.content, {
      kind: "behavior",
      baseline: contract().target,
      concept: model,
      scope: "whole",
    }),
    [],
  );
});

test("property-checked discovery is invariant under carrier, value, component and budget renaming", () => {
  const a = componentRequest(),
    combined = targetModel();
  combined.boxes.splice(2, 0, ...a.catalogue.map((t) => t.component));
  const twin = renamedTwin(combined),
    target = {
      ...twin.model,
      boxes: [...twin.model.boxes.slice(0, 2), twin.model.boxes.at(-1)!],
    };
  const r = searchComponents({
    ...a,
    contract: contract(),
    implementation: metadata,
    max_work: 1000000,
  });
  const t = searchComponents({
    ...a,
    model: { ...twin.model, boxes: twin.model.boxes.slice(0, 2), wires: [] },
    resources: [{ box: twin.box("source"), port: twin.port("source", "out") }],
    targets: [{ box: twin.box("product"), port: twin.port("product", "in") }],
    catalogue: a.catalogue.map((c, i) => ({
      ...c,
      id: `neutral-${i}`,
      component: twin.model.boxes[i + 2],
    })),
    contract: {
      target,
      acceptable: [
        {
          box: twin.box("product"),
          port: twin.port("product", "in"),
          values: [twin.value("1")],
        },
      ],
      budget: { [twin.dim("usd")]: 5 },
    },
    implementation: metadata,
    max_work: 1000000,
  });
  assert.ok(
    r.ok && "candidates" in r && t.ok && "candidates" in t,
    JSON.stringify(t),
  );
  assert.equal(t.verdict, r.verdict);
  assert.equal(t.satisfyingCount, r.satisfyingCount);
  assert.equal(t.allDecided, r.allDecided);
  assert.deepEqual(
    twin.back(t.candidates[0].model.wires),
    r.candidates[0].model.wires,
  );
});

test("a property contract rejects an assembly that duplicates a consumptive resource", () => {
  const a = componentRequest();
  a.model.carriers[0].quantity = "extensive";
  const joint = {
    ...converter("joint", "a", "d"),
    inputs: [
      { id: "in", carrier: "a" },
      { id: "second", carrier: "a" },
    ],
    behavior: [{ in: { in: "1", second: "1" }, out: { out: "1" } }],
    feasibility: [
      {
        requires: { in: 1, second: 1 },
        provides: { out: 1 },
        cost: { usd: 1 },
      },
    ],
  };
  const target = targetModel();
  target.carriers[0].quantity = "extensive";
  const r = searchComponents({
    ...a,
    catalogue: [{ id: "joint", component: joint }],
    max_components: 1,
    contract: { ...contract(), target },
    implementation: metadata,
    max_work: 1000000,
  });
  assert.ok(r.ok && "candidates" in r, JSON.stringify(r));
  assert.equal(r.verdict, "impossible-in-library");
  assert.ok(
    r.results.some(
      (x) => x.result.ok && x.result.reason === "resource-infeasible",
    ),
  );
});

test("the MCP exposes component discovery and direct effect-chain insertion", async () => {
  const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
  const found = JSON.parse(
    (await specs.triz_component_search.handler(componentRequest())).content[0]
      .text,
  );
  assert.equal(found.verdict, "candidates");
  const added = JSON.parse(
    (
      await specs.triz_effect_insert.handler({
        model: interfaceModel(),
        from: { box: "source", port: "out" },
        to: { box: "product", port: "in" },
        chain: effects,
      })
    ).content[0].text,
  );
  assert.equal(added.verdict, "inserted");
  const certified = JSON.parse(
    (
      await specs.triz_component_search.handler({
        ...componentRequest(),
        contract: contract(),
        implementation: metadata,
        max_work: 1000000,
        certificate: true,
      })
    ).content[0].text,
  );
  assert.equal(certified.certificates.typing.format, "lean");
  assert.equal(certified.certificates.behavior.format, "lean");
  assert.deepEqual(lint(certified.certificates.typing.content), []);
  assert.deepEqual(lint(certified.certificates.behavior.content), []);
});
