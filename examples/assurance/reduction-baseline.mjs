import fs from "node:fs";
import { compileKnowledge } from "../../src/knowledge.ts";

/** Reconstruct actual prior implementations, not a compatibility-only list of ids. */
export function reductionBaseline(knowledge, stage = "original") {
  const fixture = JSON.parse(fs.readFileSync(new URL("../../tests/fixtures/effects-before-reduction.json", import.meta.url), "utf8"));
  const packs = structuredClone(knowledge.packs), physical = packs.find(p => p.id === "physical");
  const replacements = new Map(fixture.effects.filter(e => stage === "original" || e.id !== 33).map(e => [e.id, e]));
  physical.effects = physical.effects.map(e => replacements.get(e.id) ?? e);
  physical.models = physical.models.filter(m => m.id !== "physical:linear-analyzer-transmission");
  physical.boundary_mappings = [];
  return { knowledge: compileKnowledge(packs), commit: fixture.commits[stage] };
}
