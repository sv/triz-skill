import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { knowledge } from "../src/data.js";
import { compileKnowledge, typedKnowledgeEffects } from "../src/knowledge.js";
import { knowledgeModelCatalogue } from "../src/knowledge-models.js";
import { searchComponents } from "../src/act-component-search.js";
import { externalBehavior } from "../src/act-behavior.js";
import { boundedDynamics, checkRun } from "../src/act-dynamics.js";
import { dynamicsCertificate, modelCertificate } from "../src/act-cert.js";
import { toolSpecs } from "../src/tools.js";
import type { FunctionModel } from "../src/act.js";
import { bindRequest, checkAll, ensureBuilt, localLeanAvailable, tamperVariants } from "../scripts/certify.mjs";

const p = (s: string) => `physical:${s}`;
const k = knowledge();
const certificates: string[] = [];
const certify = (model: FunctionModel, spec?: any) => {
  const c = spec ? dynamicsCertificate(model, spec) : modelCertificate(model);
  assert.ok(c.ok, JSON.stringify(c));
  assert.deepEqual(bindRequest(c.content, spec ? { kind: "dynamics", model, spec } : { kind: "model", model }), []);
  certificates.push(c.content);
};
const packs = () => structuredClone(k.packs);
const models = () => packs().find(pack => pack.id === "physical")!;
test("multiport models preserve the 78 unary interfaces and validate all cross-references", () => {
  const old = packs();
  for (const pack of old) { pack.models = []; for (const e of pack.effects) for (const f of e.model_assessment?.facets ?? []) delete f.models; }
  const before = JSON.parse(fs.readFileSync(new URL("./fixtures/effect-before-configuration.json", import.meta.url), "utf8"));
  const physical = old.find(p => p.id === "physical")!;
  physical.effects = physical.effects.map(e => e.id === 33 ? before.effect : e);
  for (const f of before.effect.model_assessment.facets) delete f.models;
  const selected = (effects: ReturnType<typeof typedKnowledgeEffects>) => effects.map(({ realization, realization_conditions, ...e }) => e);
  assert.deepEqual(selected(typedKnowledgeEffects(k.effects)), selected(typedKnowledgeEffects(compileKnowledge(old).effects)));
  assert.equal(k.models.length, 18);
  assert.equal(k.parameters.length, 91);
  const edits = [
    (m: any) => { m.id = "other:wrong"; },
    (m: any) => { m.inputs[0].parameter = p("missing"); },
    (m: any) => { m.state_parameter = p("missing"); },
    (m: any) => { m.parents = [9999]; },
    (m: any) => { m.outputs[0].id = m.inputs[0].id; },
  ];
  for (const edit of edits) { const pack = models(); edit(pack.models[0]); assert.throws(() => compileKnowledge([pack])); }
  const duplicate = models(); duplicate.models.push(duplicate.models[0]);
  assert.throws(() => compileKnowledge([duplicate]), /Duplicate knowledge model/);
  const facet = models(); facet.effects.find(e => e.id === 20)!.model_assessment!.facets![0].models = [p("missing")];
  assert.throws(() => compileKnowledge([facet]), /unknown model/);
  facet.effects.find(e => e.id === 20)!.model_assessment!.facets![0].models = [p("corona-ionization")];
  assert.throws(() => compileKnowledge([facet]), /parent effect/);
});

test("catalogue setup exposes hypotheses, exact parameter types and explicit state requirements through the tool", async () => {
  const spec = toolSpecs().find(t => t.name === "triz_component_catalogue")!;
  const general: any = await spec.handler({});
  assert.equal(JSON.parse(general.content[0].text).catalogue.id, "general");
  const response: any = await spec.handler({ source: "knowledge", parent: 16, state_parameters: [p("separated-charge-state")] });
  const r = JSON.parse(response.content[0].text);
  assert.deepEqual(r.models.map((m: any) => m.id), [p("prompt-fluorescence"), p("charge-recombination-emission")]);
  assert.ok(r.models.every((m: any) => !m.configured && m.unmetConditions.length));
  const setup = (extra: any) => knowledgeModelCatalogue({ source: "knowledge", models: [p("charge-recombination-emission")], ...extra }, k);
  assert.equal(setup({ declarations: { [p("charge-recombination-emission")]: { behavior: [{ in: { excitation: "off" }, out: { emission: "on" } }] } } }).ok, false);
  assert.equal(setup({ declarations: { [p("charge-recombination-emission")]: { state: ["empty"], transition: [{ state: "empty", in: { excitation: "off" }, next: "empty", out: { emission: "off" } }] } } }).ok, false);
  assert.equal(setup({ bindings: { [p("light")]: { si: "m" } } }).ok, false);
  assert.equal(setup({ bindings: { [p("temperature")]: { values: ["cold"] } } }).ok, false);
  assert.equal(setup({ models: [p("missing")] }).ok, false);
  assert.equal(setup({ state_parameters: [p("missing")] }).ok, false);
  assert.equal(knowledgeModelCatalogue({ source: "knowledge", models: [p("prompt-fluorescence")], declarations: {
    [p("prompt-fluorescence")]: { state: ["stored"] },
  } }, k).ok, false, "a temporal alternative cannot be smuggled into a stateless template");
});

/** Configure a selected implementation, then let the existing search construct its wiring. */
function network(ids: string[], resources: string[], targets: string[], bindings: Record<string, any>, declarations: Record<string, any>) {
  const r = knowledgeModelCatalogue({ source: "knowledge", models: ids.map(p), bindings: Object.fromEntries(Object.entries(bindings).map(([id, b]) => [p(id), b])),
    declarations: Object.fromEntries(Object.entries(declarations).map(([id, d]) => [p(id), d])) }, k);
  assert.ok(r.ok, JSON.stringify(r));
  const model: FunctionModel = { domain: "physical", carriers: r.catalogue.carriers!, boxes: [
    { id: "source", name: "Scheduled resources", role: "environment", outputs: resources.map((id, i) => ({ id: `r${i}`, carrier: p(id) })) },
    { id: "target", name: "Required responses", role: "product", inputs: targets.map((id, i) => ({ id: `t${i}`, carrier: p(id) })) },
  ], wires: [] };
  const result = searchComponents({ model, resources: resources.map((_, i) => ({ box: "source", port: `r${i}` })), targets: targets.map((_, i) => ({ box: "target", port: `t${i}` })),
    catalogues: [{ catalogue: r.catalogue }], max_components: ids.length, require_all_resources: true, max_work: 1_000_000, limit: 100 });
  assert.ok(result.ok && "candidates" in result && result.complete && result.candidates.length, JSON.stringify(result));
  return result.candidates[0];
}
const finite = (values: string[]) => ({ values });
const cartesian = (columns: string[][]): string[][] => columns.reduce<string[][]>((a, b) => a.flatMap(row => b.map(v => [...row, v])), [[]]);

test("patent decomposition discovers eight bounded configurations with component names blinded, before 0 / after 8", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "examples/assurance/effects-configurations.mjs"], { encoding: "utf8", timeout: 30_000 });
  const report = JSON.parse(output);
  assert.deepEqual([report.cases, report.before_found, report.after_found], [8, 0, 8]);
  const wind = report.results.filter((c: any) => c.id.includes("generated-wind") || c.id === "hybrid-panel-cleaning");
  assert.ok(wind.every((c: any) => c.components.includes(p("ion-neutral-force")) && c.components.includes(p("gas-flow-response"))));
  assert.ok(report.results.every((c: any) => c.conditions.length && c.scope));
});

test("persistent emission requires stored charge: prompt response fails after source-off and charge cannot emit forever", () => {
  const bindings = { light: finite(["off", "on"]), "emitted-light": finite(["off", "on"]) };
  const charge = { state: ["empty", "charged"], initial: ["empty"], transition: [
    { state: "empty", in: { excitation: "on" }, next: "charged", out: { emission: "off" } },
    { state: "charged", in: { excitation: "on" }, next: "charged", out: { emission: "on" } },
    { state: "charged", in: { excitation: "off" }, next: "empty", out: { emission: "on" } },
    { state: "empty", in: { excitation: "off" }, next: "empty", out: { emission: "off" } },
  ] };
  for (const persistent of [true, false]) {
    const id = persistent ? "charge-recombination-emission" : "prompt-fluorescence";
    const n = network([id], ["light"], ["emitted-light"], bindings, { [id]: persistent ? charge : { behavior: [
      { in: { excitation: "on" }, out: { emission: "on" } }, { in: { excitation: "off" }, out: { emission: "off" } },
    ] } });
    const source = n.model.boxes.find(b => b.id === "source")!;
    Object.assign(source, { state: ["illuminate", "dark"], initial: ["illuminate"], transition: [
      { state: "illuminate", in: {}, next: "dark", out: { r0: "on" } },
      { state: "dark", in: {}, next: "dark", out: { r0: "off" } },
    ] });
    const box = n.components[0].box;
    const spec = { horizon: 4, unsafe: [{ box, port: "excitation", values: ["off"] }, { box, port: "emission", values: ["on"] }] };
    const result = boundedDynamics(n.model, spec);
    assert.ok(result.ok && "escalation" in result, JSON.stringify(result));
    assert.equal(result.escalation?.verdict, persistent ? "reachable" : "unreachable");
    if (persistent && result.escalation?.verdict === "reachable") {
      assert.equal(result.escalation.time, 1);
      assert.deepEqual(checkRun(n.model, spec, result.escalation.trace), { ok: true, errors: [] });
      certify(n.model, spec);
      const noPerpetualGlow = boundedDynamics(n.model, { horizon: 4, unsafe: [...spec.unsafe, { box: "source", state: ["dark"] }, { box, state: ["empty"] }] });
      assert.ok(noPerpetualGlow.ok && "escalation" in noPerpetualGlow);
      assert.equal(noPerpetualGlow.escalation?.verdict, "unreachable");
    }
  }
});

test("photoelastic modulation composes with illumination and cannot invert one intensity to a unique stress", () => {
  // Stress-optic law Δ=C L σ, then crossed analyzer I/I0=sin²(πΔ/λ).
  // Chosen example C=3.12e-8 Pa^-1, L=.01 m, λ=624 nm; no patent calibration is claimed.
  const delta = 3.12e-8 * .01 * 1000, wavelength = 624e-9;
  assert.ok(Math.abs(delta / wavelength - .5) < 1e-12);
  const n = network(["photoelastic-retardance", "retardance-analyzer"], ["principal-stress-difference", "incident-irradiance"], ["irradiance"], {
    "principal-stress-difference": finite(["0Pa", "1000Pa", "2000Pa"]), "optical-path-difference": finite(["0m", "312nm", "624nm"]),
    "incident-irradiance": finite(["unit"]), irradiance: finite(["dark", "bright"]),
  }, {
    "photoelastic-retardance": { behavior: ["0m", "312nm", "624nm"].map((d, i) => ({ in: { stress: ["0Pa", "1000Pa", "2000Pa"][i] }, out: { retardance: d } })) },
    "retardance-analyzer": { behavior: ["0m", "312nm", "624nm"].map((d, i) => ({ in: { retardance: d, illumination: "unit" }, out: { transmitted: i === 1 ? "bright" : "dark" } })) },
  });
  const source = n.model.boxes.find(b => b.id === "source")!;
  source.inputs = source.outputs!.map((port, i) => ({ id: `s${i}`, carrier: port.carrier }));
  source.behavior = ["0Pa", "1000Pa", "2000Pa"].map(stress => ({ in: { s0: stress, s1: "unit" }, out: { r0: stress, r1: "unit" } }));
  n.model.boxes.find(b => b.id === "target")!.behavior = ["dark", "bright"].map(v => ({ in: { t0: v }, out: {} }));
  const relation = externalBehavior(n.model, { scope: "whole" });
  assert.ok(relation.ok && relation.decided, JSON.stringify(relation));
  assert.equal(relation.relation.length, 3);
  assert.deepEqual(relation.relation[0].outputs, relation.relation[2].outputs, "two stress values produce the same intensity");
  assert.notDeepEqual(relation.relation[0].outputs, relation.relation[1].outputs);
  assert.ok(modelCertificate(n.model).ok);
  certify(n.model);
});

test("magnetic and DC responses share one phase producer and normal phase does not screen field", () => {
  const phases = ["normal", "transition", "meissner"];
  const n = network(["superconducting-phase", "meissner-screening", "phase-qualified-dc-transport"], ["temperature", "magnetic-flux-density", "current"], ["local-magnetic-flux-density", "transmitted-dc-current"], {
    temperature: finite(["hot", "near", "cold"]), "magnetic-flux-density": finite(["applied"]), current: finite(["probe"]),
    "superconducting-phase": finite(phases), "local-magnetic-flux-density": finite(["full", "partial", "excluded"]), "transmitted-dc-current": finite(["resistive", "critical-branch", "lossless-dc"]),
  }, {
    "superconducting-phase": { state: phases, initial: ["normal"], transition: phases.flatMap(state => phases.map((phase, i) => ({ state,
      in: { temperature: ["hot", "near", "cold"][i], field: "applied", drive: "probe" }, next: phase, out: { phase } }))) },
    "meissner-screening": { behavior: phases.map((phase, i) => ({ in: { phase, field: "applied" }, out: { "local-field": ["full", "partial", "excluded"][i] } })) },
    "phase-qualified-dc-transport": { behavior: phases.map((phase, i) => ({ in: { phase, drive: "probe" }, out: { transmitted: ["resistive", "critical-branch", "lossless-dc"][i] } })) },
  });
  const phase = n.components.find(c => c.catalogueOrigin?.entry === p("superconducting-phase"))!.box;
  assert.equal(n.model.wires.filter(w => w.from.box === phase && w.from.port === "phase").length, 2);
  const screening = n.components.find(c => c.catalogueOrigin?.entry === p("meissner-screening"))!.box;
  n.model.boxes.find(b => b.id === "source")!.behavior = ["hot", "near", "cold"].map(t => ({ in: {}, out: { r0: t, r1: "applied", r2: "probe" } }));
  const spec = { horizon: 2, unsafe: [{ box: screening, port: "phase", values: ["normal"] }, { box: screening, port: "local-field", values: ["excluded"] }] };
  const result = boundedDynamics(n.model, spec);
  assert.ok(result.ok && "escalation" in result, JSON.stringify(result));
  assert.equal(result.escalation?.verdict, "unreachable");
  certify(n.model, spec);
});

test("a finite adsorbent bed breaks through and recovers only after scheduled regeneration with purge resources", () => {
  const schedule = ["adsorb", "regenerate"];
  const n = network(["heated-purge-regeneration", "cyclic-adsorbent-bed"], ["feed-mole-fraction", "feed-molar-flow", "regeneration-command", "purge-molar-flow", "temperature"], ["product-mole-fraction"], {
    "feed-mole-fraction": finite(["dirty"]), "feed-molar-flow": finite(["off", "on"]), "regeneration-command": finite(schedule),
    "purge-molar-flow": finite(["off", "on"]), temperature: finite(["cold", "hot"]), "regeneration-resource": finite(["absent", "ready"]),
    "product-mole-fraction": finite(["clean", "breakthrough", "no-product"]), "adsorbed-amount": finite(["empty", "full"]),
  }, {
    "heated-purge-regeneration": { behavior: cartesian([["off", "on"], ["cold", "hot"]]).map(([purge, temperature]) => ({ in: { purge, temperature }, out: { resource: purge === "on" && temperature === "hot" ? "ready" : "absent" } })) },
    "cyclic-adsorbent-bed": { state: ["empty", "full"], initial: ["empty"], transition:
      cartesian([["empty", "full"], ["off", "on"], schedule, ["absent", "ready"]]).map(([state, flow, command, regeneration]) => {
        const regenerated = flow === "off" && command === "regenerate" && regeneration === "ready";
        const adsorb = flow === "on" && command === "adsorb";
        const next = regenerated ? "empty" : adsorb ? "full" : state;
        return { state, in: { feed: "dirty", flow, command, regeneration }, next, out: { product: adsorb ? state === "empty" ? "clean" : "breakthrough" : "no-product", loading: next } };
      }) },
  });
  const source = n.model.boxes.find(b => b.id === "source")!;
  const outputs = (flow: string, command: string) => ({ r0: "dirty", r1: flow, r2: command, r3: "on", r4: "hot" });
  const stages = ["first", "breakthrough", "purge", "recovered"];
  Object.assign(source, { state: stages, initial: [stages[0]], transition: stages.map((state, i) => ({ state, in: {}, next: stages[Math.min(i + 1, 3)], out: outputs(i === 2 ? "off" : "on", i === 2 ? "regenerate" : "adsorb") })) });
  const bed = n.components.find(c => c.catalogueOrigin?.entry === p("cyclic-adsorbent-bed"))!.box;
  const spec = { horizon: 4, unsafe: [{ box: "source", state: ["recovered"] }, { box: bed, port: "product", values: ["clean"] }] };
  const result = boundedDynamics(n.model, spec);
  assert.ok(result.ok && "escalation" in result && result.escalation?.verdict === "reachable", JSON.stringify(result));
  assert.equal(result.escalation.time, 3);
  assert.deepEqual(checkRun(n.model, spec, result.escalation.trace), { ok: true, errors: [] });
  const noHeat = structuredClone(n.model);
  for (const row of noHeat.boxes.find(b => b.id === "source")!.transition!) row.out.r4 = "cold";
  const failure = boundedDynamics(noHeat, spec);
  assert.ok(failure.ok && "escalation" in failure);
  assert.equal(failure.escalation?.verdict, "unreachable");
  certify(n.model, spec);
  const capped = dynamicsCertificate(noHeat, spec);
  assert.equal(capped.ok, false, "the full unreachable invariant exceeds the certificate valuation cap");
  certify(noHeat); // Certify typing; the no-heat dynamics assertion above is the bounded JS check.
});

test("candidate provenance keeps physical assumptions, and missing resources or same-SI substitutions cannot close a network", () => {
  const library = knowledgeModelCatalogue({ source: "knowledge", models: [p("vapor-deposition")] }, k);
  assert.ok(library.ok);
  const model: FunctionModel = { domain: "physical", carriers: library.catalogue.carriers!, boxes: [
    { id: "source", name: "Resources", role: "environment", outputs: [{ id: "vapor", carrier: p("vapor-mass-rate") }, { id: "cooling", carrier: p("heat-rejection-capacity") }] },
    { id: "target", name: "Capture", role: "product", inputs: [{ id: "in", carrier: p("deposited-solid-mass-rate") }] },
  ], wires: [] };
  const request = { model, resources: [{ box: "source", port: "vapor" }, { box: "source", port: "cooling" }], targets: [{ box: "target", port: "in" }],
    catalogues: [{ catalogue: library.catalogue }], max_components: 1, require_all_resources: true };
  const result = searchComponents(request);
  assert.ok(result.ok && "candidates" in result && result.candidates.length);
  assert.deepEqual(result.candidates[0].components[0].catalogueOrigin?.conditions, k.models.find(m => m.id === p("vapor-deposition"))!.conditions);
  const incomplete = searchComponents({ ...request, resources: request.resources.slice(0, 1) });
  assert.ok(incomplete.ok && incomplete.verdict === "impossible-in-library");
  const wrong = structuredClone(model), heat = k.parameters.find(p => p.id === "physical:heat-flow")!;
  wrong.carriers.push({ id: heat.id, layer: heat.layer!, dimension: heat.name, effect_quantity: heat.quantity, si: heat.si });
  wrong.boxes[0].outputs![1].carrier = heat.id; // W supplied as heat is not W available for rejection.
  const mismatch = searchComponents({ ...request, model: wrong });
  assert.ok(mismatch.ok && mismatch.verdict === "impossible-in-library");
});

// The Lean workflow discovers files containing leanTest( and requires a built theory.
function leanTest(name: string, fn: () => Promise<void>) {
  const available = localLeanAvailable();
  const skip = !process.env.TRIZ_REQUIRE_LEAN && (process.env.TRIZ_SKIP_LEAN ? "TRIZ_SKIP_LEAN is set" : !available && "theory/ is not built");
  test(name, { skip }, async () => { assert.ok(available, "Lean theory must be built"); await ensureBuilt(); await fn(); });
}
leanTest("Lean accepts configured multiport typing and finite dynamics, and rejects tampering", async () => {
  assert.equal(certificates.length, 5);
  const result = await checkAll({ certificates, tampered: certificates.flatMap(tamperVariants) }, { mode: "local" });
  for (const c of [...result.certificates, ...result.tampered]) assert.ok(c.ok, c.problems.join("\n"));
});
