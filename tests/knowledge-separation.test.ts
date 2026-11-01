import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as data from "../src/data.js";
import { compileKnowledge, effectTaxonomy, KnowledgePack, typedKnowledgeEffects } from "../src/knowledge.js";
import { setupEffectModel } from "../src/knowledge-setup.js";
import { compareBehavior } from "../src/act-behavior.js";

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
  const legacy = knowledge.effects.filter(e => typeof e.id === "number" && e.id <= 74);
  assert.deepEqual(legacy.map(e => e.id), snapshot.effects.map((e: any) => e.id));
  for (const e of legacy) {
    const projection = Object.fromEntries(snapshot.fields.filter((k: string) => (e as any)[k] !== undefined).map((k: string) => [k, (e as any)[k]]));
    const hash = createHash("sha256").update(JSON.stringify(canonical(projection))).digest("hex");
    assert.equal(hash, snapshot.effects.find((s: any) => s.id === e.id).sha256, `Changed legacy contract/evidence ${e.id}`);
  }
  assert.deepEqual(knowledge.counts, { direct: 52, signatures: 14, specializations: 22, composites: 0, configurations: 4, independent_contracts: 66, searchable: 78 });
  assert.equal(typedKnowledgeEffects(knowledge.effects).length, 78);
  assert.equal(read("effects.json").effects.filter((e: any) => e.input).length, 52);
  assert.equal(data.effects(undefined, undefined, { form: "specialization" }).matched, 22);
  assert.equal(data.effects(undefined, undefined, { form: "direct" }).matched, 52);
  assert.equal(data.effects(undefined, undefined, { kind: "mechanism" }).matched, 9);
  assert.equal(data.knowledgeCatalog().families.length, 8);
});

test("fields group response contracts without replacing them or counting mechanisms as responses", () => {
  const knowledge = compileKnowledge(packs());
  assert.deepEqual(knowledge.taxonomy.roles, { response: 69, mechanism: 9, composite: 0, unclassified: 0 });
  const magnetic = knowledge.taxonomy.field_groups.find(g => g.field === "magnetic")!;
  assert.deepEqual(magnetic.entry_ids, [3, 12, 14, 34, 65, 76]);
  const force = knowledge.effects.find(e => e.id === 65)!;
  assert.equal(force.kind, "response");
  assert.equal(force.input_parameter, "physical:current");
  assert.equal(force.output_parameter, "physical:force");
  const screen = knowledge.effects.find(e => e.id === 72)!;
  assert.equal(screen.kind, "mechanism");
  assert.deepEqual(screen.related_effects?.filter(r => r.relation === "uses").map(r => r.id), [59, 71]);
  assert.deepEqual(data.knowledgeCatalog().taxonomy, knowledge.taxonomy);
  assert.deepEqual(data.knowledgeCatalog("missing", "software").taxonomy, knowledge.taxonomy,
    "the documented all-installed-packs scope also applies to taxonomy");
});

test("taxonomy preserves unclassified entries and counts a multi-field recipe once in its role", () => {
  const p = recipePack();
  p.effects.push({ id: "physical:unclassified", name: "Unclassified", category: "test", function: "test", statement: "test", hints: [] });
  const knowledge = compileKnowledge([p]);
  const recipe = knowledge.effects.find(e => e.id === "physical:light-heater")!;
  const unknown = knowledge.effects.find(e => e.id === "physical:unclassified")!;
  const taxonomy = effectTaxonomy([recipe, unknown]);
  assert.deepEqual(taxonomy.roles, { response: 0, mechanism: 0, composite: 1, unclassified: 1 });
  assert.deepEqual(taxonomy.field_groups, [
    { field: "electric", entry_ids: [recipe.id] }, { field: "optical", entry_ids: [recipe.id] },
  ]);
  assert.deepEqual(taxonomy.without_field, [unknown.id]);
  assert.deepEqual(effectTaxonomy([]).roles, { response: 0, mechanism: 0, composite: 0, unclassified: 0 });
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

test("new clauses and further interface sharing preserve roles and explicit quantity distinctions", () => {
  const k = compileKnowledge(packs());
  const find = (id: number) => k.effects.find(e => e.id === id)!;
  assert.deepEqual([find(2).input_parameter, find(2).output_parameter], ["physical:mechanical-stress", "physical:voltage"]);
  assert.deepEqual([find(75).input_parameter, find(75).output_parameter], ["physical:voltage", "physical:dimension-change"]);
  assert.equal(find(2).definition.form, "specialization");
  assert.equal(find(75).definition.form, "specialization");
  assert.equal(find(76).input_parameter, "physical:magnetic-flux-density-change");
  assert.equal(find(77).input_parameter, "physical:electric-field-change");
  assert.equal(find(78).input_parameter, "physical:electric-field");
  assert.equal(find(76).output_parameter, "physical:temperature-change");
  assert.equal(find(77).output_parameter, "physical:temperature-change");
  assert.equal(find(78).output_parameter, "physical:fluid-velocity");
  for (const ids of [[15, 67], [16, 17], [51, 56]]) {
    const [a, b] = ids.map(find);
    assert.deepEqual(a.definition, b.definition);
    assert.notEqual(a.source, b.source, "sharing retains case-specific evidence");
    assert.notDeepEqual(a.conditions, b.conditions, "sharing retains operating assumptions");
  }
  assert.equal(find(56).kind, "mechanism");
  const meta = read("effects.json")._meta;
  assert.equal(meta.typing.typed_count, typedKnowledgeEffects(k.effects).length);
  assert.equal(meta.typing.total_count, k.effects.length);
  assert.deepEqual(meta.definitions, { ...meta.definitions,
    direct_definitions: k.counts.direct, family_definitions: k.families.length, shared_signatures: k.counts.signatures,
    specializations: k.counts.specializations, composites: k.counts.composites,
    independent_interface_contracts: k.counts.independent_contracts, searchable_effects: k.counts.searchable,
  });
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
  assert.equal(typedKnowledgeEffects(knowledge.effects).length, 78, "recipes are not opaque search generators");
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
  assert.equal(JSON.stringify(recipe.model), JSON.stringify(direct.model));
  assert.equal(setupEffectModel({ ...options, chain: ["physical:light-heater"], declarations: [{ behavior: rows }] }, knowledge).ok, false);
  assert.equal(setupEffectModel({ chain: Array(5).fill("physical:light-heater"), domain: "physical" }, knowledge).ok, false);
  const mismatch = setupEffectModel({ chain: ["physical:light-heater", 12], domain: "physical" }, knowledge);
  assert.ok(!mismatch.ok);
  assert.equal(mismatch.issues[0].path, "$.chain[1]", "expanded errors point to the caller's requested step");
});
