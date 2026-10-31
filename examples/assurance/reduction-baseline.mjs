import fs from "node:fs";
import { compileKnowledge } from "../../src/knowledge.ts";

/** Reconstruct actual prior implementations, not a compatibility-only list of ids. */
export function reductionBaseline(knowledge, stage = "original") {
  const first = JSON.parse(fs.readFileSync(new URL("../../tests/fixtures/effect-before-configuration.json", import.meta.url), "utf8"));
  const second = JSON.parse(fs.readFileSync(new URL("../../tests/fixtures/effects-before-boundary-mappings.json", import.meta.url), "utf8"));
  const packs = structuredClone(knowledge.packs), physical = packs.find(p => p.id === "physical");
  const replacements = new Map(second.effects.map(e => [e.id, e]));
  if (stage === "original") replacements.set(first.effect.id, first.effect);
  physical.effects = physical.effects.map(e => replacements.get(e.id) ?? e);
  physical.models = physical.models.filter(m => m.id !== "physical:linear-analyzer-transmission");
  physical.boundary_mappings = [];
  return { knowledge: compileKnowledge(packs), commit: stage === "original" ? first.commit : second.commit };
}
