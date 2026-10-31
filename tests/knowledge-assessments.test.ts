import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { z } from "zod";
import * as data from "../src/data.js";
import { compileKnowledge, typedKnowledgeEffects } from "../src/knowledge.js";
import { setupEffectModel } from "../src/knowledge-setup.js";
import { effectChains } from "../src/act-effects.js";
import { toolSpecs } from "../src/tools.js";

const physical = () => JSON.parse(fs.readFileSync(new URL("../skills/triz-innovation/data/effects.json", import.meta.url), "utf8"));
const compoundIds = [30, 40, 41, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 60, 72];
const splitIds = [16, 20, 33, 35, 46, 47];
const retainedIds = [2, 6, 7, 8, 9, 10, 31, 34, 42, 45, 75, 76, 77];

test("the compound/split assessment exposes named-function decisions separately from existing typing roles", async () => {
  const k = compileKnowledge([physical()]);
  const expected = { "retain-response": retainedIds, "retain-compound": compoundIds, "split-models": splitIds };
  for (const [decision, ids] of Object.entries(expected)) {
    assert.deepEqual(k.taxonomy.model_assessments[decision as keyof typeof expected], ids);
    assert.deepEqual(data.effects(undefined, undefined, { assessment: decision as keyof typeof expected }).effects.map(e => e.id), ids);
  }
  assert.equal(k.taxonomy.model_assessments.unassessed.length, 44);
  assert.deepEqual(k.taxonomy.roles, { response: 69, mechanism: 9, composite: 0, unclassified: 0 });
  assert.deepEqual(data.knowledgeCatalog().taxonomy.model_assessments, k.taxonomy.model_assessments);
  const tool = toolSpecs().find(t => t.name === "triz_effects")!;
  assert.equal(z.object(tool.shape).safeParse({ assessment: "split-models" }).success, true);
  assert.equal(z.object(tool.shape).safeParse({ assessment: "proved-primitive" }).success, false);
  const result = await tool.handler({ assessment: "split-models" });
  assert.deepEqual(JSON.parse((result as any).content[0].text).effects.map((e: any) => e.id), splitIds);
});

test("advisory facets do not create generators, executable recipes, new conditions or inferred physics", () => {
  const annotated = physical(), bare = structuredClone(annotated);
  for (const e of bare.effects) delete e.model_assessment;
  const a = compileKnowledge([annotated]), b = compileKnowledge([bare]);
  assert.deepEqual(a.counts, b.counts);
  assert.deepEqual(typedKnowledgeEffects(a.effects), typedKnowledgeEffects(b.effects));
  assert.equal(a.effects.length, 78);
  for (const id of [...compoundIds, ...splitIds, ...retainedIds]) {
    const withAssessment = setupEffectModel({ chain: [id], domain: "physical" }, a);
    const without = setupEffectModel({ chain: [id], domain: "physical" }, b);
    assert.deepEqual(withAssessment, without, `Assessment changed setup ${id}`);
  }
  const photoelasticity = a.effects.find(e => e.id === 20)!.model_assessment!.facets!.find(f => f.name.includes("retardance"))!;
  assert.equal(photoelasticity.effect, undefined);
  const stress = a.parameters.find(p => p.id === "physical:mechanical-stress")!;
  const result = effectChains({ resources: [{ quantity: stress.quantity, si: stress.si }], output: { quantity: "optical retardance" }, k: 3 }, typedKnowledgeEffects(a.effects));
  assert.ok(result.ok && result.verdict === "none");
  assert.equal(setupEffectModel({ chain: ["photoelasticity"], domain: "physical" }, a).ok, false);
  assert.equal(a.effects.find(e => e.id === 72)!.definition.form, "direct", "facet links do not become an invalid serial recipe");
});

test("assessments require evidence, scoped decisions, multiple facets and valid typed references", () => {
  const broken = [
    (e: any) => { delete e.model_assessment.facets; },
    (e: any) => { e.model_assessment.facets = [{ name: "only one" }]; },
    (e: any) => { e.model_assessment.status = "proved"; },
    (e: any) => { e.model_assessment.source.citation = " "; },
    (e: any) => { e.model_assessment.selected_clause = ""; },
    (e: any) => { e.model_assessment.facets[0].effect = "physical:missing"; },
  ];
  for (const edit of broken) {
    const p = physical(); edit(p.effects.find((e: any) => e.id === 20));
    assert.throws(() => compileKnowledge([p]));
  }
  const p = physical();
  p.effects.push({ id: "physical:untyped-facet", name: "Untyped facet", category: "test", function: "test", statement: "test", hints: [] });
  p.effects.find((e: any) => e.id === 20).model_assessment.facets[0].effect = "physical:untyped-facet";
  assert.throws(() => compileKnowledge([p]), /untyped effect/);
  assert.doesNotThrow(() => compileKnowledge([physical()]), "self and reciprocal observational links are not recursive recipes");
});
