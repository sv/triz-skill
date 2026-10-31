import { test } from "node:test";
import assert from "node:assert/strict";
import * as data from "../src/data.js";
import { checkModel, type FunctionModel } from "../src/act.js";
import { compareBehavior } from "../src/act-behavior.js";
import { behaviorCertificate, modelCertificate } from "../src/act-cert.js";
import { setupEffectModel, type EffectSetupRequest } from "../src/knowledge-setup.js";
import { bindRequest, checkAll, ensureBuilt, lint, localLeanAvailable, tamperVariants } from "../scripts/certify.mjs";
import type { z } from "zod";

const rows = ["off", "on"].map(v => ({ in: { in: v }, out: { out: v } }));
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
  assert.equal(data.typedEffects().length, 37);
  for (const effect of data.typedEffects()) {
    const r = setupEffectModel({ chain: [effect.id], domain: "physical" }, knowledge);
    assert.ok(r.ok, `${effect.id}: ${JSON.stringify(r)}`);
    assert.ok(checkModel(r.model).ok);
    assert.ok(r.model.boxes.every(b => !b.behavior && !b.feasibility && !b.cost));
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
  for (const args of [
    { chain: [999] }, { chain: [10] },
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
