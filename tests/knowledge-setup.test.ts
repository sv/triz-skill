import { test } from "node:test";
import assert from "node:assert/strict";
import * as data from "../src/data.js";
import { checkModel, type FunctionModel } from "../src/act.js";
import { compareBehavior } from "../src/act-behavior.js";
import { behaviorCertificate, dynamicsCertificate, modelCertificate } from "../src/act-cert.js";
import { boundedDynamics, checkRun } from "../src/act-dynamics.js";
import { effectChains } from "../src/act-effects.js";
import { rewrite } from "../src/act-rewrite.js";
import { setupEffectModel, type EffectSetupRequest } from "../src/knowledge-setup.js";
import { bindRequest, checkAll, ensureBuilt, lint, localLeanAvailable, tamperVariants } from "../scripts/certify.mjs";
import type { z } from "zod";

const rows = ["off", "on"].map(v => ({ in: { in: v }, out: { out: v } }));

// Synthetic one-tick excitation memory followed by optical guidance and conversion.
// These rows exercise composition, not measured phosphor/device performance.
function delayedLightArgs(): z.input<typeof EffectSetupRequest> {
  return {
    chain: [16, 17, 66], domain: "physical",
    bindings: { "physical:light": { values: ["off", "on"] }, "physical:voltage": { values: ["low", "high"] } },
    boundary: { source_values: ["on"], accepted_values: ["low", "high"] },
    declarations: [
      { state: ["dark", "charged"], initial: ["dark"], transition: [
        { state: "dark", in: { in: "on" }, next: "charged", out: { out: "off" } },
        { state: "charged", in: { in: "on" }, next: "charged", out: { out: "on" } },
      ] },
      { behavior: rows },
      { behavior: [{ in: { in: "off" }, out: { out: "low" } }, { in: { in: "on" }, out: { out: "high" } }] },
    ],
  };
}
function delayedLightExample() {
  const setup = setupEffectModel(delayedLightArgs(), data.knowledge());
  assert.ok(setup.ok, JSON.stringify(setup));
  const spec = { unsafe: [{ box: setup.effects[0].box, state: ["charged"] }], horizon: 2 };
  return { setup, spec };
}
function physicalExample() {
  const args: z.input<typeof EffectSetupRequest> = {
    chain: [66, 74, 64], domain: "physical",
    bindings: Object.fromEntries(["light", "voltage", "current", "heat-flow"].map(id => [`physical:${id}`, { values: ["off", "on"] }])),
    boundary: { source_values: ["on"], accepted_values: ["on"] },
    declarations: [0, 1, 2].map(() => ({ behavior: rows })),
  };
  const setup = setupEffectModel(args, data.knowledge());
  assert.ok(setup.ok, JSON.stringify(setup));
  const concept = setup.model;
  const baseline: FunctionModel = { ...structuredClone(concept), boxes: structuredClone(concept.boxes.slice(0, 2)), wires: [] };
  baseline.boxes.push({ id: "reference", name: "Declared abstract reference", role: "tool",
    inputs: [{ id: "in", carrier: "physical:light" }], outputs: [{ id: "out", carrier: "physical:heat-flow" }], behavior: rows });
  baseline.wires.push(
    { id: "start", from: { box: "resource", port: "out" }, to: { box: "reference", port: "in" }, carrier: "physical:light", polarity: "useful" },
    { id: "finish", from: { box: "reference", port: "out" }, to: { box: "required", port: "in" }, carrier: "physical:heat-flow", polarity: "useful" },
  );
  return { setup, concept, baseline };
}

test("every typed catalogue generator sets up as a typed model without inventing implementation rows", () => {
  const knowledge = data.knowledge();
  assert.equal(data.typedEffects().length, 78);
  for (const effect of data.typedEffects()) {
    const r = setupEffectModel({ chain: [effect.id], domain: "physical" }, knowledge);
    assert.ok(r.ok, `${effect.id}: ${JSON.stringify(r)}`);
    assert.ok(checkModel(r.model).ok);
    assert.ok(r.model.boxes.every(b => !b.behavior && !b.feasibility && !b.cost && !b.state && !b.transition));
    assert.equal(r.effects[0].provenance, "catalogue-verified");
    const certificate = modelCertificate(r.model);
    assert.ok(certificate.ok, JSON.stringify(certificate));
    assert.deepEqual(lint(certificate.content), []);
    assert.deepEqual(bindRequest(certificate.content, { kind: "model", model: r.model }), []);
  }
});

test("registered electrical/thermal types compose and finite declarations enable a nonempty behavior comparison", () => {
  const { setup, concept, baseline } = physicalExample();
  assert.deepEqual(setup.setup.parameter_ids, ["physical:light", "physical:voltage", "physical:current", "physical:heat-flow"]);
  assert.ok(setup.unmetConditions.length, "typing does not discharge operating assumptions");
  assert.equal(concept.carriers.find(c => c.id === "physical:current")!.si, "A");
  const result = compareBehavior(baseline, concept, { scope: "whole" });
  assert.ok(result.ok && result.verdict === "preserved", JSON.stringify(result));
  const certificate = behaviorCertificate(baseline, concept, { scope: "whole" });
  assert.ok(certificate.ok, JSON.stringify(certificate));
  assert.deepEqual(bindRequest(certificate.content, { kind: "behavior", baseline, concept, scope: "whole" }), []);
});

test("setup rejects untyped generators, unsupported composition, weakened types and undeclared finite values", () => {
  const knowledge = data.knowledge();
  const untyped = structuredClone(knowledge);
  untyped.effects.push({ id: "physical:untyped-fixture", name: "Untyped fixture", category: "test", function: "test", statement: "No typing declared", hints: [],
    pack: "physical", domain: "physical", definition: { form: "direct" }, provenance: knowledge.effects[0].provenance, review: knowledge.effects[0].review, limitations: [] });
  assert.equal(setupEffectModel({ chain: ["physical:untyped-fixture"], domain: "physical" }, untyped).ok, false);
  for (const args of [
    { chain: [999] },
    { chain: [26, 2] }, // pressure difference and mechanical stress share SI, not semantics
    { chain: [64, 73] }, // power must not become energy without an explicit integration model
    { chain: [74], bindings: { "physical:voltage": { si: {} } } },
    { chain: [74], bindings: { "physical:heat": { values: ["on"] } } },
    { chain: [74], boundary: { source_values: ["on"], accepted_values: ["on"] } },
  ]) assert.equal(setupEffectModel({ domain: "physical", ...args } as never, knowledge).ok, false, JSON.stringify(args));
  const opaque = setupEffectModel({ chain: [66], domain: "physical" }, knowledge);
  assert.ok(opaque.ok);
  assert.equal(opaque.model.carriers.find(c => c.id === "physical:light")!.si, undefined);
});

test("new chemical and mechanical clauses compose through existing thermal types", () => {
  const setup = setupEffectModel({ chain: [37, 73, 1], domain: "physical" }, data.knowledge());
  assert.ok(setup.ok, JSON.stringify(setup));
  assert.deepEqual(setup.setup.parameter_ids, ["physical:reaction-extent", "physical:heat", "physical:temperature-change", "physical:dimension-change"]);
  for (const chain of [[38, 73], [44, 37], [18, 66], [19, 20], [47, 47]])
    assert.equal(setupEffectModel({ chain, domain: "physical" }, data.knowledge()).ok, false, JSON.stringify(chain));
});

test("same-type generators remain discoverable separately from the zero-length identity", () => {
  for (const id of [16, 17, 35, 49, 50, 52, 54]) {
    const effect = data.typedEffects().find(e => e.id === id)!;
    const args = { resources: [effect.input], output: effect.output, k: 1 };
    const all = effectChains(args, data.typedEffects());
    assert.ok(all.ok && all.verdict === "chains");
    assert.deepEqual(all.chains[0].effects, []);
    const nonempty = effectChains({ ...args, min_length: 1 }, data.typedEffects());
    assert.ok(nonempty.ok && nonempty.verdict === "chains");
    assert.ok(nonempty.chains.every(c => c.effects.length === 1));
    assert.ok(nonempty.chains.some(c => c.effects[0].id === id));
    const setup = setupEffectModel({ chain: [id], domain: "physical" }, data.knowledge());
    assert.ok(setup.ok && setup.model.boxes.length === 3);
  }
  const force = data.typedEffects().find(e => e.id === 49)!.input;
  const twice = effectChains({ resources: [force], output: force, min_length: 2, k: 2 }, data.typedEffects());
  assert.ok(twice.ok && twice.verdict === "chains");
  assert.ok(twice.chains.some(c => c.effects.map(e => e.id).join() === "49,50"));
  assert.ok(twice.chains.every(c => c.effects.length === 2));
  assert.equal(effectChains({ resources: [force], output: force, min_length: 2, k: 1 }).ok, false);
  const capped = effectChains({ resources: [force], output: force, min_length: 1, max_steps: 1 }, data.typedEffects());
  assert.ok(capped.ok && capped.verdict === "undecided");
  assert.deepEqual(capped.chains, []);
});

test("stateful setup composes declared memory with relations and returns the replayable rewrite", () => {
  const { setup, spec } = delayedLightExample();
  const source: FunctionModel = { ...structuredClone(setup.model), boxes: structuredClone(setup.model.boxes.slice(0, 2)), wires: [] };
  const replay = rewrite(source, setup.rewrite);
  assert.ok(replay.ok);
  assert.deepEqual(replay.model, setup.model);
  assert.equal(source.boxes.length, 2, "insertion does not mutate its source");
  const result = boundedDynamics(setup.model, spec);
  assert.ok(result.ok && result.decided && result.escalation?.verdict === "reachable", JSON.stringify(result));
  assert.equal(result.escalation.time, 1);
  assert.equal(checkRun(setup.model, spec, result.escalation.trace).ok, true);
  const voltage = boundedDynamics(setup.model, { unsafe: [{ box: "required", port: "in", values: ["high"] }], horizon: 2 });
  assert.ok(voltage.ok && voltage.decided && voltage.escalation?.verdict === "reachable");
  assert.equal(voltage.escalation.time, 1, "the downstream relation observes the explicitly delayed emission");
  const cert = dynamicsCertificate(setup.model, spec);
  assert.ok(cert.ok, JSON.stringify(cert));
  assert.deepEqual(bindRequest(cert.content, { kind: "dynamics", model: setup.model, spec }), []);
});

test("implementation state fails closed on conflicting, incomplete or ill-typed declarations", () => {
  const args = delayedLightArgs();
  const original = structuredClone(args);
  const broken = [
    { ...args, declarations: [] },
    { ...args, declarations: [{ ...args.declarations![0], behavior: rows }, ...args.declarations!.slice(1)] },
    { ...args, declarations: [{ ...args.declarations![0], state: undefined }, ...args.declarations!.slice(1)] },
    { ...args, declarations: [{ ...args.declarations![0], initial: ["unknown"] }, ...args.declarations!.slice(1)] },
    { ...args, declarations: [{ ...args.declarations![0], transition: [{ state: "dark", in: { in: "on" }, next: "unknown", out: { out: "on" } }] }, ...args.declarations!.slice(1)] },
    { ...args, bindings: { ...args.bindings, "physical:light": { values: ["on"] } } },
  ];
  for (const input of broken) assert.equal(setupEffectModel(input, data.knowledge()).ok, false, JSON.stringify(input));
  assert.deepEqual(args, original);
});

function leanTest(name: string, fn: () => Promise<void>) {
  const available = localLeanAvailable();
  const skip = !process.env.TRIZ_REQUIRE_LEAN && (process.env.TRIZ_SKIP_LEAN ? "TRIZ_SKIP_LEAN is set" : !available && "theory/ is not built");
  test(name, { skip }, async () => {
    assert.ok(available, "TRIZ_REQUIRE_LEAN is set, but theory/ is not built");
    await ensureBuilt();
    await fn();
  });
}

leanTest("Lean accepts configured physical-effect composition and rejects altered certificate rows", async () => {
  const { concept, baseline } = physicalExample();
  const certificates = [modelCertificate(concept), behaviorCertificate(baseline, concept, { scope: "whole" })];
  const texts = certificates.map(c => { assert.ok(c.ok); return c.content; });
  const results = await checkAll({ certificates: texts, tampered: texts.flatMap(tamperVariants) }, { mode: "local" });
  for (const r of [...results.certificates, ...results.tampered]) assert.ok(r.ok, r.problems.join("\n"));
});

leanTest("Lean accepts every catalogue generator and composed stateful optical dynamics", async () => {
  const certificates = data.typedEffects().map(e => {
    const setup = setupEffectModel({ chain: [e.id], domain: "physical" }, data.knowledge());
    assert.ok(setup.ok);
    const cert = modelCertificate(setup.model);
    assert.ok(cert.ok);
    return cert.content;
  });
  const { setup, spec } = delayedLightExample();
  const stateful = [modelCertificate(setup.model), dynamicsCertificate(setup.model, spec)].map(c => { assert.ok(c.ok); return c.content; });
  const results = await checkAll({ certificates: [...certificates, ...stateful], tampered: stateful.flatMap(tamperVariants) }, { mode: "local" });
  for (const r of [...results.certificates, ...results.tampered]) assert.ok(r.ok, r.problems.join("\n"));
});
