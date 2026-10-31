import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileKnowledge, KnowledgeManifest, KnowledgePack, knowledgeManifestJsonSchema, knowledgePackJsonSchema } from "../src/knowledge.js";
import * as core from "../src/core.js";
import { effectChains } from "../src/act-effects.js";
import { bundledKnowledge } from "../src/knowledge-bundle.js";
import { toolSpecs } from "../src/tools.js";
import { checkModel, type FunctionModel } from "../src/act.js";
import { bindRequest, checkAll, ensureBuilt, lint, localLeanAvailable, tamperVariants } from "../scripts/certify.mjs";

const data = new URL("../skills/triz-innovation/data/", import.meta.url);
const read = (file: string) => JSON.parse(fs.readFileSync(new URL(file, data), "utf8"));
const manifest = KnowledgeManifest.parse(read("knowledge.json"));
const installed = () => manifest.packs.map(read);
const universal = () => read("knowledge/universal.json");

/** Synthetic relations exercise cross-domain composition without claiming a real mechanism. */
function extension() {
  const general = universal();
  general.effects = [{
    id: "universal:normalize", name: "Synthetic normalization", category: "abstract",
    function: "synthetic normalization", statement: "Declared test relation only", hints: [],
    input: { quantity: "duration", si: { T: 1 } }, input_parameter: "universal:duration",
    output: { quantity: "fraction", si: {} }, output_parameter: "universal:fraction",
    field: "information", conditions: ["synthetic fixture"],
    source: "tests/knowledge.test.ts", typed_from: "statement",
  }];
  const software = {
    ...universal(), id: "software", domain: "software", title: "Synthetic software fixture",
    parameters: [{ id: "software:signal", name: "Signal", quantity: "software:signal", description: "Synthetic signal" }],
    effects: [{ ...general.effects[0], id: "software:emit", name: "Synthetic emission", category: "algorithmic",
      input: { quantity: "fraction", si: {} }, input_parameter: "universal:fraction",
      output: { quantity: "software:signal" }, output_parameter: "software:signal" }],
  };
  return [general, software];
}

test("installed knowledge preserves classic lookups and exposes explicit quantity provenance", () => {
  core.useProvider(file => file in bundledKnowledge ? bundledKnowledge[file] : read(file));
  assert.equal(core.parameters().length, 39);
  assert.equal(core.effects().matched, 74);
  assert.equal(core.typedEffects().length, 74);
  const catalog = core.knowledgeCatalog();
  assert.equal(catalog.packs.length, 2);
  assert.equal(catalog.parameters.length, 66);
  const seebeck = core.effects(undefined, undefined, { input: "temperature difference", output: "voltage" }).effects[0];
  assert.equal(seebeck.input_parameter, "physical:temperature-difference");
  assert.equal(seebeck.review.status, "curated");
  assert.deepEqual(seebeck.provenance, read("effects.json").effects.find((e: { id: number }) => e.id === 7).provenance, "per-entry attribution overrides pack defaults");
  assert.equal(core.effects().effects.find(e => e.id === 3)!.provenance.license, "MIT", "legacy entries inherit pack attribution");
  assert.ok(seebeck.limitations.length);
});

test("all packs feed search and chains by default, domain filtering keeps universal effects", async () => {
  const [general, software] = extension();
  assert.doesNotThrow(() => compileKnowledge([software, general]), "cross-pack parameter references do not depend on manifest order");
  const packs = [general, read("effects.json"), software];
  const files: Record<string, unknown> = {
    "knowledge.json": { ...manifest, packs: ["knowledge/universal.json", "effects.json", "knowledge/software.json"] },
    "knowledge/universal.json": general, "effects.json": packs[1], "knowledge/software.json": software,
  };
  core.useProvider(file => files[file] ?? read(file));
  try {
    assert.equal(core.effects().matched, 76);
    assert.deepEqual(core.effects(undefined, undefined, { domain: "software" }).effects.map(e => e.id), ["universal:normalize", "software:emit"]);
    assert.deepEqual(core.effects(undefined, undefined, { pack: "software" }).effects.map(e => e.id), ["software:emit"]);
    assert.equal(core.effects(undefined, "algorithmic").matched, 1);
    assert.equal(core.knowledgeCatalog(undefined, "software").parameters.length, 4);
    assert.equal(core.knowledgeCatalog("fraction", "software").matched, 1);
    const chains = effectChains({ resources: [{ quantity: "duration", si: { T: 1 } }], output: { quantity: "software:signal" } }, core.typedEffects());
    assert.ok(chains.ok && chains.verdict === "chains");
    assert.deepEqual(chains.chains[0].effects.map(e => e.id), ["universal:normalize", "software:emit"]);
    assert.deepEqual(chains.chains[0].unmetConditions, ["synthetic fixture"]);
    const spec = toolSpecs().find(s => s.name === "triz_effects")!;
    const payload = await spec.handler({ domain: "software", category: "algorithmic" });
    assert.equal(JSON.parse((payload.content[0] as { text: string }).text).effects[0].id, "software:emit");
  } finally {
    core.useProvider(file => file in bundledKnowledge ? bundledKnowledge[file] : read(file));
  }
  assert.equal(core.effects().matched, 74, "provider changes invalidate knowledge caches");
});

test("hosted imports contain exactly the manifest files and agree with filesystem data", () => {
  assert.deepEqual(Object.keys(bundledKnowledge), ["knowledge.json", ...manifest.packs]);
  for (const [file, contents] of Object.entries(bundledKnowledge)) assert.deepEqual(contents, read(file));
  assert.deepEqual(compileKnowledge(installed()), compileKnowledge(manifest.packs.map(p => bundledKnowledge[p])));
});

test("a pack cannot shadow ids, invent a parameter reference or weaken quantity dimensions", () => {
  const [general, software] = extension();
  assert.throws(() => compileKnowledge([general, general]), /Duplicate knowledge pack id/);
  const duplicateToken = structuredClone(software);
  duplicateToken.parameters[0].quantity = "duration";
  assert.throws(() => compileKnowledge([general, duplicateToken]), /Ambiguous quantity token/);
  const wrongNamespace = structuredClone(software);
  wrongNamespace.parameters[0].id = "foreign:signal";
  assert.throws(() => compileKnowledge([general, wrongNamespace]), /namespace/);
  const duplicateEffect = structuredClone(software);
  duplicateEffect.effects.push(duplicateEffect.effects[0]);
  assert.throws(() => compileKnowledge([general, duplicateEffect]), /Duplicate knowledge effect id/);
  const missing = structuredClone(software);
  missing.effects[0].input_parameter = "universal:missing";
  assert.throws(() => compileKnowledge([general, missing]), /unknown parameter/);
  const wrongType = structuredClone(software);
  wrongType.effects[0].input.si = { T: 1 } as {};
  assert.throws(() => compileKnowledge([general, wrongType]), /disagrees with parameter/);
  const numeric = structuredClone(software) as any;
  numeric.effects[0].id = 7;
  assert.throws(() => compileKnowledge([general, numeric]), /numeric ids are reserved/);
  const partial = structuredClone(software) as any;
  delete partial.effects[0].output;
  assert.throws(() => compileKnowledge([general, partial]), /all-or-none/);
  const dangling = structuredClone(software) as any;
  dangling.effects[0].related_effects = [{ id: "software:absent", relation: "uses" }];
  assert.throws(() => compileKnowledge([general, dangling]), /related effect/);
});

test("review claims require attribution and manifest paths remain within the data vocabulary", () => {
  const pack = universal();
  pack.review.status = "expert-reviewed";
  assert.equal(KnowledgePack.safeParse(pack).success, false);
  pack.review.reviewers = [{ name: "Synthetic reviewer", expertise: "Fixture validation" }];
  pack.review.reviewed_on = "2026-10-31";
  assert.equal(KnowledgePack.safeParse(pack).success, true);
  for (const packs of [["../outside.json"], ["/tmp/outside.json"], ["effects.json", "effects.json"]])
    assert.equal(KnowledgeManifest.safeParse({ ...manifest, packs }).success, false);
});

test("knowledge JSON schemas are generated from the runtime definitions", () => {
  for (const [file, generated] of [["knowledge-pack.schema.json", knowledgePackJsonSchema()], ["knowledge-manifest.schema.json", knowledgeManifestJsonSchema()]] as const) {
    const committed = JSON.parse(fs.readFileSync(new URL(`../skills/triz-innovation/schemas/${file}`, import.meta.url), "utf8"));
    assert.deepEqual(committed, generated);
  }
});

/** Run the installed-pack path through discovery, typed rewriting and finite semantics. */
async function categoricalExample() {
  const [general, software] = extension();
  const files: Record<string, unknown> = {
    "knowledge.json": { ...manifest, packs: ["knowledge/universal.json", "knowledge/software.json"] },
    "knowledge/universal.json": general, "knowledge/software.json": software,
  };
  core.useProvider(file => files[file] ?? read(file));
  try {
    const specs = Object.fromEntries(toolSpecs().map(s => [s.name, s]));
    const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);
    const found = await call("triz_effect_chains", {
      resources: [{ quantity: "duration", si: { T: 1 } }], output: { quantity: "software:signal" },
    });
    assert.equal(found.verdict, "chains");
    const model: FunctionModel = {
      domain: "software",
      carriers: [
        { id: "duration", layer: "information", dimension: "duration", effect_quantity: "duration", si: { T: 1 }, values: ["0", "1"] },
        { id: "fraction", layer: "information", dimension: "fraction", effect_quantity: "fraction", si: {}, values: ["0", "1"] },
        { id: "signal", layer: "information", dimension: "signal", effect_quantity: "software:signal", values: ["0", "1"] },
      ],
      boxes: [
        { id: "source", name: "Declared source", role: "environment", outputs: [{ id: "out", carrier: "duration" }], behavior: [{ in: {}, out: { out: "1" } }] },
        { id: "product", name: "Required output", role: "product", inputs: [{ id: "in", carrier: "signal" }], behavior: ["0", "1"].map(v => ({ in: { in: v }, out: {} })) },
      ],
      wires: [],
    };
    const insertion = {
      model, from: { box: "source", port: "out" }, to: { box: "product", port: "in" },
      chain: found.chains[0].effects, intermediate_carriers: ["fraction"],
    };
    const bare = await call("triz_effect_insert", { ...insertion, certificate: true });
    assert.equal(bare.verdict, "inserted");
    assert.ok(checkModel(bare.model).ok);
    assert.deepEqual(bare.basis, ["typed_delete", "typed_glue"]);
    assert.ok(bare.effects.every((e: { provenance: string }) => e.provenance === "catalogue-verified"));
    assert.deepEqual(bare.unmetConditions, ["synthetic fixture"]);
    assert.equal(bare.certificate.format, "lean");
    assert.ok(bare.model.boxes.slice(2).every((b: { behavior?: unknown; feasibility?: unknown }) => !b.behavior && !b.feasibility));
    const unknown = await call("triz_behavior", { model: bare.model, scope: "whole" });
    assert.equal(unknown.decided, false, "a typed effect alone must not establish behavior");
    assert.equal(unknown.missingBehavior.length, 2);

    // These finite rows are analyst declarations, independent of catalogue descriptions.
    const rows = ["0", "1"].map(v => ({ in: { in: v }, out: { out: v } }));
    const declared = await call("triz_effect_insert", { ...insertion, declarations: [{ behavior: rows }, { behavior: rows }] });
    const baseline: FunctionModel = structuredClone(model);
    baseline.boxes.push({ id: "reference", name: "One-step reference", role: "tool", inputs: [{ id: "in", carrier: "duration" }], outputs: [{ id: "out", carrier: "signal" }], behavior: rows });
    baseline.wires.push(
      { id: "start", from: { box: "source", port: "out" }, to: { box: "reference", port: "in" }, carrier: "duration", polarity: "useful" },
      { id: "finish", from: { box: "reference", port: "out" }, to: { box: "product", port: "in" }, carrier: "signal", polarity: "useful" },
    );
    const compared = await call("triz_behavior", { model: declared.model, compare_to: baseline, scope: "whole", certificate: true });
    assert.equal(compared.verdict, "preserved");
    assert.equal(compared.certificate.format, "lean");
    assert.deepEqual(lint(bare.certificate.content), []);
    assert.deepEqual(lint(compared.certificate.content), []);
    assert.deepEqual(bindRequest(bare.certificate.content, { kind: "model", model: bare.model }), []);
    assert.deepEqual(bindRequest(compared.certificate.content, { kind: "behavior", baseline, concept: declared.model, scope: "whole" }), []);
    return [bare.certificate.content, compared.certificate.content] as string[];
  } finally {
    core.useProvider(file => file in bundledKnowledge ? bundledKnowledge[file] : read(file));
  }
}

test("installed knowledge feeds theorem-backed rewriting and explicitly declared compositional behavior", async () => { await categoricalExample(); });

// The Lean CI discovers files containing leanTest( and requires a built theory.
function leanTest(name: string, fn: () => Promise<void>) {
  const available = localLeanAvailable();
  const skip = !process.env.TRIZ_REQUIRE_LEAN && (process.env.TRIZ_SKIP_LEAN ? "TRIZ_SKIP_LEAN is set" : !available && "theory/ is not built");
  test(name, { skip }, async () => {
    assert.ok(available, "TRIZ_REQUIRE_LEAN is set, but theory/ is not built");
    await ensureBuilt();
    await fn();
  });
}

leanTest("Lean accepts cross-pack typing and behavior certificates and rejects tampering", async () => {
  const texts = await categoricalExample();
  const variants = texts.flatMap(tamperVariants);
  const results = await checkAll({ certificates: texts, tampered: variants }, { mode: "local" });
  for (const result of results.certificates) assert.ok(result.ok, result.problems.join("\n"));
  for (const result of results.tampered) assert.ok(result.ok, result.problems.join("\n"));
});
