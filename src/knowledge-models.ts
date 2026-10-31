/** Explicit multiport templates for the existing bounded configuration search. */
import { z } from "zod";
import { Box, Carrier, checkModel } from "./act.js";
import { ComponentCatalogue, GENERAL_CATALOGUE } from "./act-component-catalogue.js";
import { fail, issue } from "./act-issues.js";
import { compileKnowledge } from "./knowledge.js";

const Text = z.string().min(1);
const Implementation = Box.pick({ behavior: true, producible: true, state: true, initial: true, transition: true,
  cost: true, feasibility: true, actions: true, holding_cost: true });
export const KnowledgeCatalogueRequest = z.strictObject({
  source: z.enum(["general", "knowledge"]).default("general"),
  models: z.array(Text).min(1).max(100).optional(),
  query: Text.optional(),
  parent: z.union([Text, z.number().int().positive()]).optional(),
  state_parameters: z.array(Text).max(100).optional().describe("Allowed internal state meanings; stateless models remain candidates. Never inferred from names"),
  bindings: z.record(Text, Carrier.pick({ layer: true, values: true, levels: true, quantity: true }).partial()).default({})
    .describe("Parameter id to finite values, levels, layer and allocation semantics; registry SI and quantity tokens cannot be changed"),
  declarations: z.record(Text, Implementation).default({}).describe("Model id to explicit implementation rows; no physical behavior is inferred"),
  conditions: z.array(Text).default([]),
});
export function knowledgeModelCatalogue(raw: z.input<typeof KnowledgeCatalogueRequest>, knowledge?: ReturnType<typeof compileKnowledge>) {
  const parsed = KnowledgeCatalogueRequest.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues.map(e => issue("invalid-argument", `$.${e.path.join(".")}`, e.message, "Use the component catalogue schema.")));
  const a = parsed.data;
  const reject = (path: string, message: string) => fail([issue("invalid-argument", path, message, "Use registered model/parameter ids and explicit implementation declarations.")]);
  if (a.source === "general") {
    if (a.models || a.query || a.parent !== undefined || a.state_parameters || Object.keys(a.bindings).length || Object.keys(a.declarations).length || a.conditions.length)
      return reject("$.source", "Knowledge model options require source: knowledge");
    return { ok: true as const, catalogue: ComponentCatalogue.parse(GENERAL_CATALOGUE), models: [],
      note: "Abstract identity/fanout relations; no physical implementations or resource modes are asserted." };
  }
  if (!knowledge) return reject("$.source", "Knowledge source requires an installed registry");
  for (const id of a.models ?? []) if (!knowledge.models.some(m => m.id === id)) return reject("$.models", `Unknown model ${id}`);
  for (const id of a.state_parameters ?? []) if (!knowledge.models.some(m => m.state_parameter === id)) return reject("$.state_parameters", `Unknown model state parameter ${id}`);
  if (a.parent !== undefined && !knowledge.effects.some(e => e.id === a.parent)) return reject("$.parent", `Unknown parent effect ${a.parent}`);
  const tokens = a.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const models = knowledge.models.filter(m => (!a.models || a.models.includes(m.id)) &&
    (a.parent === undefined || m.parents.includes(a.parent)) &&
    (!a.state_parameters || !m.state_parameter || a.state_parameters.includes(m.state_parameter)) &&
    tokens.every(t => `${m.id} ${m.name} ${m.description}`.toLowerCase().includes(t)));
  if (models.length > 100) return reject("$.models", "Select at most 100 models per portable catalogue");
  const used = new Set(models.flatMap(m => [...m.inputs, ...m.outputs].map(p => p.parameter)));
  for (const id of Object.keys(a.bindings)) if (!used.has(id)) return reject(`$.bindings.${id}`, "Binding is unused by the selected models");
  for (const id of Object.keys(a.declarations)) if (!models.some(m => m.id === id)) return reject(`$.declarations.${id}`, "Declaration is unused by the selected models");
  const carriers: z.infer<typeof Carrier>[] = [];
  for (const id of used) {
    const p = knowledge.parameters.find(p => p.id === id)!;
    const binding = a.bindings[id] ?? {};
    const layer = binding.layer ?? p.layer;
    if (!layer) return reject(`$.bindings.${id}.layer`, "No carrier layer is declared");
    carriers.push({ id, dimension: p.name, effect_quantity: p.quantity, ...(p.si === undefined ? {} : { si: p.si }), ...binding, layer });
  }
  const entries: Array<z.input<typeof ComponentCatalogue>["entries"][number]> = [];
  for (const m of models) {
    const d = a.declarations[m.id] ?? {};
    const temporal = d.state !== undefined || d.initial !== undefined || d.transition !== undefined;
    const relational = d.behavior !== undefined || d.producible !== undefined;
    if (m.state_parameter && (relational || temporal) && (!d.state || !d.initial || !d.transition || relational))
      return reject(`$.declarations.${m.id}`, "A stateful model requires state, initial and transition; a memoryless relation cannot replace its history");
    if (!m.state_parameter && temporal)
      return reject(`$.declarations.${m.id}`, "This template has no internal state meaning; register a stateful model before adding history");
    const component = { id: m.id, name: m.name, role: "tool" as const,
      inputs: m.inputs.map(p => ({ id: p.id, carrier: p.parameter })),
      outputs: m.outputs.map(p => ({ id: p.id, carrier: p.parameter })), ...d };
    const checked = checkModel({ domain: "physical", carriers, boxes: [component], wires: [] });
    if (!checked.ok) return fail(checked.issues);
    entries.push({ id: m.id, component, source: m.provenance, conditions: m.conditions, limitations: m.limitations,
      tags: m.parents.map(String), domains: [m.domain], max_instances: 1 });
  }
  const catalogue = ComponentCatalogue.safeParse({ format: "triz-component-catalogue-v1", id: "registered-knowledge-models", carriers, entries });
  if (!catalogue.success) return reject("$.models", "Selected models exceed the portable catalogue limits");
  return { ok: true as const, catalogue: catalogue.data, models: models.map(m => ({ ...m,
    configured: !!(a.declarations[m.id]?.behavior || a.declarations[m.id]?.transition),
    unmetConditions: m.conditions.filter(c => !a.conditions.includes(c)) })),
    note: "Templates declare boundaries, not physical laws. Pass catalogue to triz_component_search.catalogues; inspect unmetConditions. Finite rows, initial states, calibration and resource budgets remain caller declarations. A typed candidate does not prove a patent's complete device or physical equivalence to a parent effect." };
}
