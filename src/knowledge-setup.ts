/** Instantiate registered effect generators without inventing finite behavior or resource rows. */
import { z } from "zod";
import { Carrier, FunctionModel, type FunctionModel as Model } from "./act.js";
import { EffectInsertRequest, insertEffectChain } from "./act-effect-insert.js";
import { fail, issue } from "./act-issues.js";
import { compileKnowledge, typedKnowledgeEffects } from "./knowledge.js";
import { ModelImplementation } from "./knowledge-models.js";
import { setupConfigurationChain } from "./knowledge-configuration-setup.js";

const Text = z.string().min(1);
export const EffectSetupRequest = z.strictObject({
  chain: z.array(z.union([Text, z.number().int()])).min(1).max(12).describe("Registered effect or recipe ids in composition order; recipes expand to at most 12 constituent effects in total"),
  domain: FunctionModel.shape.domain,
  system: Text.optional(),
  bindings: z.record(Text, Carrier.pick({ layer: true, values: true, levels: true, quantity: true }).partial())
    .default({}).describe("Parameter id to explicit finite values, levels, carrier layer or allocation semantics; registry quantity/SI types are retained"),
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
  if (entries.some(e => e.definition.form === "configuration")) return setupConfigurationChain(a, knowledge, entries, requested.map(e => e!));
  if (Object.keys(a.node_declarations).length || Object.keys(a.context_values).length)
    return reject("$.node_declarations", "Configuration options supplied without a named configuration", "Use ordinary declarations for direct effects.");
  const path = [entries[0].input_parameter!, ...entries.map(e => e.output_parameter!)];
  const parameters = [...new Set(path)].map(id => knowledge.parameters.find(p => p.id === id)!);
  for (const id of Object.keys(a.bindings)) {
    if (!parameters.some(p => p.id === id)) return reject(`$.bindings.${id}`, "Binding does not name a parameter used by the selected chain", "Bind only the selected chain's registered quantity parameters.");
  }
  const carriers: Model["carriers"] = [];
  for (const p of parameters) {
    const binding = a.bindings[p.id] ?? {};
    const layer = binding.layer ?? p.layer;
    if (!layer) return reject(`$.bindings.${p.id}.layer`, "No carrier layer is declared", "Supply a layer binding or add an explicit layer to this registered parameter.");
    const { layer: _layer, ...declarations } = binding;
    carriers.push({ id: p.id, layer, dimension: p.name, effect_quantity: p.quantity,
      ...(p.si === undefined ? {} : { si: p.si }), ...declarations });
  }
  const model: Model = {
    domain: a.domain, ...(a.system ? { system: a.system } : {}), carriers,
    boxes: [
      { id: "resource", name: "Declared resource", role: "environment", outputs: [{ id: "out", carrier: path[0] }],
        ...(a.boundary ? { behavior: a.boundary.source_values.map(v => ({ in: {}, out: { out: v } })) } : {}) },
      { id: "required", name: "Required output", role: "product", inputs: [{ id: "in", carrier: path.at(-1)! }],
        ...(a.boundary ? { behavior: a.boundary.accepted_values.map(v => ({ in: { in: v }, out: {} })) } : {}) },
    ], wires: [],
  };
  const chain = expanded.map(id => library.find(e => e.id === id)!);
  const result = insertEffectChain({ model, from: { box: "resource", port: "out" }, to: { box: "required", port: "in" },
    chain, intermediate_carriers: path.slice(1, -1), declarations: a.declarations, conditions: a.conditions }, library);
  if (!result.ok) return result;
  const conditions = [...new Set([...result.unmetConditions, ...requested.flatMap(e => e!.conditions ?? []).filter(c => !a.conditions.includes(c))])];
  const sourceMap = new Map<string | number, typeof entries[number]>();
  const collect = (entry: typeof entries[number]) => {
    if (sourceMap.has(entry.id)) return;
    sourceMap.set(entry.id, entry);
    if (entry.definition.form === "composite") for (const id of entry.definition.steps)
      collect(knowledge.effects.find(e => e.id === id)!);
  };
  requested.forEach(e => collect(e!));
  return { ...result, unmetConditions: conditions, setup: { parameter_ids: path, effect_ids: a.chain, expanded_effect_ids: expanded,
    sources: [...sourceMap.values()].map(e => ({ id: e.id, definition: e.definition, provenance: e.provenance, review: e.review, limitations: e.limitations })) } };
}
