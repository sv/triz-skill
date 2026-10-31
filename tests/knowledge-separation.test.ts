import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as data from "../src/data.js";
import { compileKnowledge, KnowledgePack, typedKnowledgeEffects } from "../src/knowledge.js";
import { setupEffectModel } from "../src/knowledge-setup.js";
import { compareBehavior } from "../src/act-behavior.js";
import { behaviorCertificate, modelCertificate } from "../src/act-cert.js";
import { bindRequest, checkAll, ensureBuilt, localLeanAvailable, tamperVariants } from "../scripts/certify.mjs";

const read = (file: string) => JSON.parse(fs.readFileSync(new URL(`../skills/triz-innovation/data/${file}`, import.meta.url), "utf8"));
const packs = () => [read("knowledge/universal.json"), read("effects.json")];
const snapshot = JSON.parse(fs.readFileSync(new URL("./fixtures/effects-before-separation.json", import.meta.url), "utf8"));
function canonical(value: any): any {
  return Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
}
function recipePack() {
  const p = read("effects.json");
  const recipe = (id: string, steps: Array<string | number>, conditions: string[]) => ({
    id, name: id, kind: "composite", category: "synthetic-example", function: "Compose registered conditional clauses",
    statement: "A declared serial recipe, not a quantitative physical implementation", hints: [], steps, conditions,
    source: "tests/knowledge-separation.test.ts: repository-authored synthetic recipe",
  });
  p.effects.push(recipe("physical:voltage-path", [66, 74], ["declared optical/electrical integration"]),
    recipe("physical:light-heater", ["physical:voltage-path", 64], ["declared load integration"]));
  return p;
}
const compiled = () => compileKnowledge([read("knowledge/universal.json"), recipePack()]);
const rows = ["off", "on"].map(v => ({ in: { in: v }, out: { out: v } }));
function models() {
  const knowledge = compiled();
  const options = { domain: "physical" as const,
    bindings: Object.fromEntries(["light", "voltage", "current", "heat-flow"].map(q => [`physical:${q}`, { values: ["off", "on"] }])),
    boundary: { source_values: ["on"], accepted_values: ["on"] }, declarations: [0, 1, 2].map(() => ({ behavior: rows })) };
  const direct = setupEffectModel({ ...options, chain: [66, 74, 64] }, knowledge);
  const recipe = setupEffectModel({ ...options, chain: ["physical:light-heater"] }, knowledge);
  assert.ok(direct.ok && recipe.ok, JSON.stringify({ direct, recipe }));
  return { direct, recipe, options, knowledge };
}

test("all 74 previous interfaces, text, assumptions, attribution and lookup order survive factorization", () => {
  const knowledge = compileKnowledge(packs());
  assert.deepEqual(knowledge.effects.map(e => e.id), snapshot.effects.map((e: any) => e.id));
  for (const e of knowledge.effects) {
    const projection = Object.fromEntries(snapshot.fields.filter((k: string) => (e as any)[k] !== undefined).map((k: string) => [k, (e as any)[k]]));
    const hash = createHash("sha256").update(JSON.stringify(canonical(projection))).digest("hex");
    assert.equal(hash, snapshot.effects.find((s: any) => s.id === e.id).sha256, `Changed legacy contract/evidence ${e.id}`);
  }
  assert.deepEqual(knowledge.counts, { direct: 62, signatures: 7, specializations: 12, composites: 0, independent_contracts: 69, searchable: 74 });
  assert.equal(typedKnowledgeEffects(knowledge.effects).length, 74);
  assert.equal(read("effects.json").effects.filter((e: any) => e.input).length, 62);
  assert.equal(data.effects(undefined, undefined, { form: "specialization" }).matched, 12);
  assert.equal(data.effects(undefined, undefined, { form: "direct" }).matched, 62);
  assert.equal(data.effects(undefined, undefined, { kind: "mechanism" }).matched, 8);
  assert.equal(data.knowledgeCatalog().families.length, 4);
});

test("named specializations derive ports only from explicit family signatures", () => {
  const p = read("effects.json");
  const entry = p.effects.find((e: any) => e.id === 48);
  assert.equal(entry.input, undefined);
  const knowledge = compileKnowledge([p]);
  const e = knowledge.effects.find(e => e.id === 48)!;
  assert.equal(e.input_parameter, "physical:reaction-extent");
  assert.equal(e.output_parameter, "physical:heat");
  assert.equal(e.definition.form, "specialization");
  assert.deepEqual(e.conditions, entry.conditions);
  assert.deepEqual(e.provenance, entry.provenance);
  p.families[0].review = { status: "expert-reviewed", note: "Synthetic family review", reviewers: [{ name: "Fixture", expertise: "Schema testing" }], reviewed_on: "2026-10-31" };
  assert.equal(compileKnowledge([p]).effects.find(e => e.id === 48)!.review.status, "curated", "family review does not upgrade a case's empirical evidence");
});

test("family namespaces, references, signatures and complete evidence fail closed", () => {
  const broken = [
    (p: any) => { p.families.push(structuredClone(p.families[0])); },
    (p: any) => { p.families[0].id = "wrong:family"; },
    (p: any) => { p.families[0].signatures.push(structuredClone(p.families[0].signatures[0])); },
    (p: any) => { p.families[0].signatures[0].input_parameter = "physical:absent"; },
    (p: any) => { p.effects.find((e: any) => e.id === 48).family = "physical:absent"; },
    (p: any) => { p.effects.find((e: any) => e.id === 48).signature = "absent"; },
    (p: any) => { p.effects.find((e: any) => e.id === 48).input = { quantity: "force" }; },
    (p: any) => { delete p.effects.find((e: any) => e.id === 48).conditions; },
    (p: any) => { delete p.effects.find((e: any) => e.id === 48).source; },
  ];
  for (const edit of broken) {
    const p = read("effects.json"); edit(p);
    assert.throws(() => compileKnowledge([p]));
  }
});

test("recipe compilation is independent of declaration order and retains every dependency hypothesis", () => {
  const p = recipePack();
  const knowledge = compileKnowledge([p]);
  const recipe = knowledge.effects.find(e => e.id === "physical:light-heater")!;
  assert.equal(recipe.kind, "composite");
  assert.deepEqual(recipe.components, [66, 74, 64]);
  assert.equal(recipe.input_parameter, "physical:light");
  assert.equal(recipe.output_parameter, "physical:heat-flow");
  assert.deepEqual(recipe.fields, ["optical", "electric"]);
  assert.ok(recipe.conditions!.includes("specified nonzero resistance"));
  assert.ok(recipe.conditions!.includes("declared optical/electrical integration"));
  assert.ok(recipe.conditions!.includes("declared load integration"));
  assert.equal(typedKnowledgeEffects(knowledge.effects).length, 74, "recipes are not opaque search generators");
  p.effects.reverse();
  assert.deepEqual(compileKnowledge([p]).effects.find(e => e.id === recipe.id), recipe);
});

test("domain experts can share families and nested recipes across packs without order-dependent resolution", () => {
  const physical = recipePack(), library = read("knowledge/universal.json");
  library.id = "library"; library.domain = "software"; library.parameters = [];
  library.families = physical.families.map((f: any) => ({ ...f, id: f.id.replace("physical:", "library:") }));
  physical.families = [];
  for (const e of physical.effects) if (e.kind === "specialization") e.family = e.family.replace("physical:", "library:");
  library.effects = [{ ...physical.effects.at(-1), id: "library:heater", steps: ["physical:light-heater"] }];
  const before = compileKnowledge([physical, library]), after = compileKnowledge([library, physical]);
  const find = (k: typeof before) => k.effects.find(e => e.id === "library:heater")!;
  assert.deepEqual(find(before), find(after));
  assert.deepEqual(find(before).components, [66, 74, 64]);
  assert.equal(before.effects.find(e => e.id === 48)!.definition.form, "specialization");
});

test("recipe references, cycles, ambiguous dimensional casts and expansion caps fail closed", () => {
  const edit = (steps: Array<string | number>) => { const p = recipePack(); p.effects.at(-1).steps = steps; return p; };
  for (const steps of [["physical:missing"], ["physical:light-heater"], [26, 2], [64, 73], Array(12).fill("physical:voltage-path")])
    assert.throws(() => compileKnowledge([edit(steps)]));
  const cycle = recipePack();
  cycle.effects.at(-2).steps = ["physical:light-heater"];
  assert.throws(() => compileKnowledge([cycle]), /Cyclic/);
  const untyped = recipePack();
  untyped.effects.push({ id: "physical:untyped", name: "No contract", category: "test", function: "test", statement: "test", hints: [] });
  untyped.effects.at(-2).steps = ["physical:untyped"];
  assert.throws(() => compileKnowledge([untyped]), /untyped/);
  const capped = recipePack();
  capped.effects.push({ ...capped.effects.at(-1), id: "physical:pair", steps: [49, 50] });
  capped.effects.push({ ...capped.effects.at(-1), id: "physical:train", steps: Array(6).fill("physical:pair") });
  assert.equal(compileKnowledge([capped]).effects.find(e => e.id === "physical:train")!.components!.length, 12);
  capped.effects.at(-1).steps.push("physical:pair");
  assert.throws(() => compileKnowledge([capped]), /expands beyond 12/);
  for (const reverse of [false, true]) {
    const deep = recipePack();
    for (let i = 0; i < 14; i++) deep.effects.push({ ...deep.effects.at(-1), id: `physical:deep-${i}`, steps: i ? [`physical:deep-${i - 1}`] : [64] });
    if (reverse) deep.effects.reverse();
    assert.throws(() => compileKnowledge([deep]), /nesting/);
  }
});

test("setup expands recipes before typed rewriting and preserves finite behavior and provenance", () => {
  const { direct, recipe, options, knowledge } = models();
  assert.deepEqual(recipe.model, direct.model);
  assert.deepEqual(recipe.rewrite, direct.rewrite);
  assert.deepEqual(recipe.setup.expanded_effect_ids, [66, 74, 64]);
  assert.deepEqual(recipe.setup.sources.map(e => e.id), ["physical:light-heater", "physical:voltage-path", 66, 74, 64]);
  assert.ok(recipe.unmetConditions.includes("declared optical/electrical integration"));
  assert.ok(recipe.unmetConditions.includes("declared load integration"));
  const behavior = compareBehavior(direct.model, recipe.model, { scope: "whole" });
  assert.ok(behavior.ok && behavior.verdict === "preserved");
  const c = modelCertificate(recipe.model), d = modelCertificate(direct.model);
  assert.ok(c.ok && d.ok);
  assert.equal(c.content, d.content);
  assert.equal(setupEffectModel({ ...options, chain: ["physical:light-heater"], declarations: [{ behavior: rows }] }, knowledge).ok, false);
  assert.equal(setupEffectModel({ chain: Array(5).fill("physical:light-heater"), domain: "physical" }, knowledge).ok, false);
  const mismatch = setupEffectModel({ chain: ["physical:light-heater", 12], domain: "physical" }, knowledge);
  assert.ok(!mismatch.ok);
  assert.equal(mismatch.issues[0].path, "$.chain[1]", "expanded errors point to the caller's requested step");
});

function leanTest(name: string, fn: () => Promise<void>) {
  const available = localLeanAvailable();
  const skip = !process.env.TRIZ_REQUIRE_LEAN && (process.env.TRIZ_SKIP_LEAN ? "TRIZ_SKIP_LEAN is set" : !available && "theory/ is not built");
  test(name, { skip }, async () => { assert.ok(available); await ensureBuilt(); await fn(); });
}
leanTest("Lean accepts expanded recipe typing and nonempty behavior, and rejects tampering", async () => {
  const { direct, recipe } = models();
  const certificates = [modelCertificate(recipe.model), behaviorCertificate(direct.model, recipe.model, { scope: "whole" })];
  const texts = certificates.map(c => { assert.ok(c.ok); return c.content; });
  assert.deepEqual(bindRequest(texts[1], { kind: "behavior", baseline: direct.model, concept: recipe.model, scope: "whole" }), []);
  const results = await checkAll({ certificates: texts, tampered: texts.flatMap(tamperVariants) }, { mode: "local" });
  for (const r of [...results.certificates, ...results.tampered]) assert.ok(r.ok, r.problems.join("\n"));
});
