/** Instantiate registered effect generators without inventing finite behavior or resource rows. */
import { z } from "zod";
import { FunctionModel } from "./act.js";
import { EffectInsertRequest } from "./act-effect-insert.js";
import { fail, issue } from "./act-issues.js";
import { compileKnowledge, typedKnowledgeEffects } from "./knowledge.js";
import { KnowledgeBindings, ModelImplementation } from "./knowledge-models.js";
import { setupConfigurationChain } from "./knowledge-configuration-setup.js";

const Text = z.string().min(1);
export const EffectSetupRequest = z.strictObject({
  chain: z.array(z.union([Text, z.number().int()])).min(1).max(12).describe("Registered effect or recipe ids in composition order; recipes expand to at most 12 constituent effects in total"),
  domain: FunctionModel.shape.domain,
  system: Text.optional(),
  bindings: KnowledgeBindings.describe("Parameter id to explicit finite values, levels, carrier layer or allocation semantics; registry quantity/SI types are retained"),
  boundary: z.strictObject({ source_values: z.array(Text).min(1), accepted_values: z.array(Text).min(1) }).optional()
    .describe("Explicit finite source availability and product acceptance; requires corresponding binding values"),
  declarations: EffectInsertRequest.shape.declarations.describe("One implementation declaration per expanded constituent effect, in order; recipes never hide implementation rows"),
  node_declarations: z.record(Text, ModelImplementation).default({}).describe("Expanded step/node id to implementation declaration for named configurations; no opaque replacement rows"),
  context_values: z.record(Text, z.array(Text).min(1)).default({}).describe("Expanded step/context id to explicit finite availability; required alongside boundary for configuration context inputs"),
  conditions: z.array(Text).default([]),
  certificate: z.boolean().optional(),
});

export function setupEffectModel(raw: z.input<typeof EffectSetupRequest>, knowledge: ReturnType<typeof compileKnowledge>) {
  const parsed = EffectSetupRequest.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues.map(e => issue("invalid-argument", `$.${e.path.join(".")}`, e.message, "Use the effect setup schema.")));
  const a = parsed.data;
  const reject = (path: string, message: string, hint: string) => fail([issue("invalid-argument", path, message, hint)]);
  const library = typedKnowledgeEffects(knowledge.effects);
  const requested = a.chain.map(id => knowledge.effects.find(e => e.id === id));
  for (const [i, entry] of requested.entries()) {
    if (!entry) return reject(`$.chain[${i}]`, `Unknown registered effect ${a.chain[i]}`, "Look up an installed effect with triz_effects.");
  }
  const expanded = requested.flatMap(e => e!.components ?? [e!.id]);
  const origins = requested.flatMap((e, i) => (e!.components ?? [e!.id]).map(() => i));
  if (expanded.length > 12) return reject("$.chain", "Recipes expand beyond the 12-effect setup limit", "Use a smaller composition; expansion never silently truncates a recipe.");
  const entries = expanded.map(id => knowledge.effects.find(e => e.id === id)!);
  for (const [i, entry] of entries.entries()) {
    if (!library.some(e => e.id === entry.id)) return reject(`$.chain[${origins[i]}]`, `Expanded effect ${entry.id} at position ${i} has no complete typing`, "Contribute an explicit sourced typing before using this generator in a model.");
  }
  for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1].output_parameter !== entries[i].input_parameter)
      return reject(`$.chain[${origins[i]}]`, "Adjacent effects reference different quantity parameters", "Use triz_effect_chains to discover a compatible chain; equal SI dimensions alone do not establish compatibility.");
  }
  if (!entries.some(e => e.definition.form === "configuration") && (Object.keys(a.node_declarations).length || Object.keys(a.context_values).length))
    return reject("$.node_declarations", "Configuration options supplied without a named configuration", "Use ordinary declarations for direct effects.");
  return setupConfigurationChain(a, knowledge, entries, requested.map(e => e!));
}
