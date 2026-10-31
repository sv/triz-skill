/** Versioned, cross-domain knowledge packs. Validation never establishes empirical truth. */
import { z } from "zod";
import { EffectField, EffectPort } from "./act-effects.js";
import { sameDimension, SI } from "./act-dimensions.js";
import { Layer } from "./act.js";
import { ModelConfiguration, resolveConfiguration, type ResolvedConfiguration } from "./knowledge-configurations.js";
import { BoundaryMappingFields, validateBoundaryMapping } from "./knowledge-boundary-mappings.js";

const Text = z.string().trim().min(1);
const Slug = z.string().regex(/^[a-z][a-z0-9-]*$/);
const QualifiedId = z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/);
export const KnowledgeSource = z.strictObject({ citation: Text, license: Text });
export const KnowledgeReview = z.strictObject({
  status: z.enum(["draft", "curated", "expert-reviewed"]),
  note: Text,
  reviewers: z.array(z.strictObject({ name: Text, expertise: Text })).default([]),
  reviewed_on: z.iso.date().optional(),
}).superRefine((r, ctx) => {
  if (r.status === "expert-reviewed" && (!r.reviewers.length || !r.reviewed_on))
    ctx.addIssue({ code: "custom", message: "Expert review requires named reviewers, expertise and reviewed_on" });
});
export const KnowledgeParameter = z.strictObject({
  id: QualifiedId,
  name: Text,
  description: Text,
  quantity: Text.describe("Exact effect-port token; shared meanings reuse one parameter id"),
  si: SI.optional(),
  layer: Layer.optional().describe("Explicit carrier layer for model setup; no inference from domain or SI"),
  provenance: KnowledgeSource.optional(),
  review: KnowledgeReview.optional(),
  canonical_mappings: z.array(z.strictObject({
    id: z.number().int().min(1).max(39),
    relation: z.enum(["equivalent", "analogy"]),
    rationale: Text,
  })).default([]).describe("Explicit hypotheses; never extend or automatically query the canonical matrix"),
});
export const KnowledgeBoundaryMapping = z.strictObject({ ...BoundaryMappingFields, provenance: KnowledgeSource, review: KnowledgeReview.optional() });
export type RegisteredBoundaryMapping = z.infer<typeof KnowledgeBoundaryMapping> & { pack: string; domain: string; review: z.infer<typeof KnowledgeReview> };
const EffectId = z.union([QualifiedId, z.number().int().positive()]);
export const EffectAssessmentDecision = z.enum(["retain-response", "retain-compound", "split-models"]);
export type EffectAssessmentDecision = z.infer<typeof EffectAssessmentDecision>;
export const EffectModelAssessment = z.strictObject({
  decision: EffectAssessmentDecision,
  selected_clause: Text.describe("Scope of the existing registered typing, not the whole named application"),
  rationale: Text,
  facets: z.array(z.strictObject({
    name: Text,
    effect: EffectId.optional().describe("An existing unary effect clause; neither a substitution nor an equivalence proof"),
    models: z.array(QualifiedId).min(1).max(20).optional().describe("Related multiport model templates; not a realization or equivalence proof"),
  })).min(2).max(20).optional(),
  source: KnowledgeSource,
  status: z.literal("assessment-only").describe("Architectural judgment; neither a recipe nor a physical equivalence proof"),
}).superRefine((a, ctx) => {
  if (a.decision !== "retain-response" && !a.facets)
    ctx.addIssue({ code: "custom", message: "Compound and split assessments must name at least two facets" });
}).meta({ id: "EffectModelAssessment" });
const Description = {
  id: EffectId,
  name: Text,
  category: Text,
  function: Text,
  statement: Text,
  hints: z.array(Text),
  provenance: KnowledgeSource.optional(),
  review: KnowledgeReview.optional(),
  limitations: z.array(Text).optional(),
  model_assessment: EffectModelAssessment.optional(),
  related_effects: z.array(z.strictObject({
    id: EffectId,
    relation: z.enum(["specializes", "uses", "related"]),
  })).optional(),
};
export const KnowledgeEffect = z.strictObject({
  ...Description,
  kind: z.enum(["response", "mechanism"]).optional().describe("Declared modeling role; not scientific novelty or irreducibility"),
  input: EffectPort.optional(),
  output: EffectPort.optional(),
  input_parameter: QualifiedId.optional(),
  output_parameter: QualifiedId.optional(),
  field: EffectField.optional(),
  conditions: z.array(Text).optional(),
  source: Text.optional(),
  typed_from: z.enum(["source", "statement"]).optional(),
}).superRefine((e, ctx) => {
  const fields = ["input", "output", "input_parameter", "output_parameter", "field", "conditions", "source", "typed_from"] as const;
  const typing = ["input", "output", "input_parameter", "output_parameter", "field", "typed_from"] as const;
  if (typing.some(k => e[k] !== undefined) && !fields.every(k => e[k] !== undefined))
    ctx.addIssue({ code: "custom", message: "Typing is all-or-none: include both ports, parameter references, field, conditions, source and typed_from" });
});

/** Families share explicit interfaces; every specialization retains its own physical evidence. */
export const KnowledgeFamily = z.strictObject({
  id: QualifiedId,
  name: Text,
  kind: z.enum(["response", "mechanism"]),
  description: Text,
  signatures: z.array(z.strictObject({ id: Slug, input_parameter: QualifiedId, output_parameter: QualifiedId, field: EffectField })).min(1).max(100),
  provenance: KnowledgeSource,
  review: KnowledgeReview.optional(),
  limitations: z.array(Text).min(1),
});
const KnowledgeSpecialization = z.strictObject({
  ...Description,
  kind: z.literal("specialization"),
  family: QualifiedId,
  signature: Slug,
  conditions: z.array(Text),
  source: Text,
  typed_from: z.enum(["source", "statement"]),
});
const KnowledgeComposite = z.strictObject({
  ...Description,
  kind: z.literal("composite"),
  steps: z.array(EffectId).min(1).max(12),
  conditions: z.array(Text).default([]).describe("Additional assumptions; constituent assumptions are always retained"),
  source: Text,
});
const KnowledgeConfiguration = z.strictObject({
  ...Description,
  kind: z.literal("configuration"),
  role: z.enum(["response", "mechanism"]),
  configuration: ModelConfiguration,
  field: EffectField,
  conditions: z.array(Text),
  source: Text,
  typed_from: z.enum(["source", "statement"]),
});
export const KnowledgeEntry = z.union([KnowledgeEffect, KnowledgeSpecialization, KnowledgeComposite, KnowledgeConfiguration]);
const ModelPort = z.strictObject({ id: Slug, parameter: QualifiedId });
/** Multiport boundaries are separate from the backwards-compatible unary effect library. */
export const KnowledgeModel = z.strictObject({
  id: QualifiedId,
  name: Text,
  description: Text,
  parents: z.array(EffectId).min(1).max(20),
  inputs: z.array(ModelPort).min(1).max(16),
  outputs: z.array(ModelPort).min(1).max(16),
  state_parameter: QualifiedId.optional().describe("Meaning of internal history; configured implementations must declare state, initial and transition"),
  conditions: z.array(Text).min(1),
  provenance: KnowledgeSource,
  review: KnowledgeReview.optional(),
  limitations: z.array(Text).min(1),
}).superRefine((m, ctx) => {
  const ports = [...m.inputs, ...m.outputs].map(p => p.id);
  if (new Set(ports).size !== ports.length)
    ctx.addIssue({ code: "custom", message: "Model port ids must be unique across both sides" });
});
export const KnowledgePack = z.strictObject({
  format: z.literal("triz-knowledge-pack-v1"),
  id: Slug,
  domain: Slug,
  title: Text,
  source: KnowledgeSource,
  review: KnowledgeReview,
  limitations: z.array(Text).min(1),
  parameters: z.array(KnowledgeParameter).max(10_000),
  families: z.array(KnowledgeFamily).max(10_000).default([]),
  models: z.array(KnowledgeModel).max(10_000).default([]),
  boundary_mappings: z.array(KnowledgeBoundaryMapping).max(10_000).default([]),
  effects: z.array(KnowledgeEntry).max(10_000),
  _meta: z.record(z.string(), z.unknown()).optional(),
});
export const KnowledgeManifest = z.strictObject({
  format: z.literal("triz-knowledge-manifest-v1"),
  packs: z.array(z.string().regex(/^(?:effects\.json|knowledge\/[a-z][a-z0-9-]*\.json)$/)).min(1).max(1000),
}).superRefine((m, ctx) => {
  if (new Set(m.packs).size !== m.packs.length)
    ctx.addIssue({ code: "custom", path: ["packs"], message: "Duplicate knowledge pack path" });
});

export type KnowledgePack = z.infer<typeof KnowledgePack>;
export type RegisteredParameter = z.infer<typeof KnowledgeParameter> & { pack: string; domain: string; provenance: z.infer<typeof KnowledgeSource>; review: z.infer<typeof KnowledgeReview> };
export type RegisteredModel = z.infer<typeof KnowledgeModel> & { pack: string; domain: string; review: z.infer<typeof KnowledgeReview> };
export type EffectDefinition = { form: "direct" } | { form: "specialization"; family: string; signature: string } | { form: "composite"; steps: Array<string | number> } | { form: "configuration"; configuration: ResolvedConfiguration };
export type RegisteredEffect = Omit<z.infer<typeof KnowledgeEffect>, "kind"> & {
  kind?: "response" | "mechanism" | "composite";
  definition: EffectDefinition;
  components?: Array<string | number>;
  fields?: z.infer<typeof EffectField>[];
  pack: string; domain: string; provenance: z.infer<typeof KnowledgeSource>; review: z.infer<typeof KnowledgeReview>; limitations: string[];
};

/** Classification and modeling roles are separate axes, neither a basis of physical laws. */
export function effectTaxonomy(effects: readonly RegisteredEffect[]) {
  const roles = { response: 0, mechanism: 0, composite: 0, unclassified: 0 };
  const fieldGroups = EffectField.options.map(field => ({ field,
    entry_ids: effects.filter(e => e.field === field || e.fields?.includes(field)).map(e => e.id),
  })).filter(group => group.entry_ids.length > 0);
  for (const e of effects) roles[e.kind ?? "unclassified"]++;
  return {
    roles,
    field_groups: fieldGroups,
    without_field: effects.filter(e => !e.field && !e.fields?.length).map(e => e.id),
    model_assessments: {
      ...Object.fromEntries(EffectAssessmentDecision.options.map(decision =>
        [decision, effects.filter(e => e.model_assessment?.decision === decision).map(e => e.id)])) as Record<EffectAssessmentDecision, Array<string | number>>,
      unassessed: effects.filter(e => !e.model_assessment).map(e => e.id),
    },
    note: "Fields classify entries; they do not supply response contracts. Roles describe selected responses, designed mechanisms or serial recipes, not scientific novelty or irreducible laws. Model assessments review the whole named function and may cover more than its selected typing; they are advisory. A recipe may belong to several field groups.",
  };
}

/** Conditional discovery index: named configurations are marked summaries, never insertion generators. */
export function typedKnowledgeEffects(effects: RegisteredEffect[]): import("./act-effects.js").TypedEffect[] {
  return effects.filter(e => e.kind !== "composite" && e.input && e.output && e.field && e.conditions && e.source && e.typed_from)
    .map(({ id, name, input, output, field, conditions, source, typed_from, definition }) => ({ id, name, input: input!, output: output!, field: field!, conditions: conditions!, source: source!, typed_from: typed_from!, ...(definition.form === "configuration" ? { realization: "named-configuration" as const, realization_conditions: definition.configuration.conditions } : {}) }));
}

/** Resolve the complete union before filtering: no pack may silently shadow another. */
export function compileKnowledge(raw: unknown[]) {
  const packs = raw.map(p => KnowledgePack.parse(p));
  const parameters: RegisteredParameter[] = [];
  const effects: RegisteredEffect[] = [];
  const models: RegisteredModel[] = [];
  const boundaryMappings: RegisteredBoundaryMapping[] = [];
  const families: Array<z.infer<typeof KnowledgeFamily> & { pack: string; domain: string; review: z.infer<typeof KnowledgeReview> }> = [];
  const packIds = new Set<string>(), parameterIds = new Map<string, RegisteredParameter>();
  const quantities = new Set<string>(), effectIds = new Set<string | number>();
  for (const pack of packs) {
    if (packIds.has(pack.id)) throw new Error(`Duplicate knowledge pack id: ${pack.id}`);
    packIds.add(pack.id);
    for (const p of pack.parameters) {
      if (!p.id.startsWith(`${pack.id}:`)) throw new Error(`Parameter ${p.id} must use pack namespace ${pack.id}`);
      if (parameterIds.has(p.id)) throw new Error(`Duplicate knowledge parameter id: ${p.id}`);
      if (quantities.has(p.quantity)) throw new Error(`Ambiguous quantity token: ${p.quantity}; reuse its existing parameter id or choose a distinct token`);
      const registered = { ...p, pack: pack.id, domain: pack.domain, provenance: p.provenance ?? pack.source, review: p.review ?? pack.review };
      parameters.push(registered);
      parameterIds.set(p.id, registered);
      quantities.add(p.quantity);
    }
  }
  const familyIds = new Map<string, typeof families[number]>();
  for (const pack of packs) for (const f of pack.families) {
    if (!f.id.startsWith(`${pack.id}:`)) throw new Error(`Family ${f.id} must use pack namespace ${pack.id}`);
    if (familyIds.has(f.id)) throw new Error(`Duplicate knowledge family id: ${f.id}`);
    const signatures = new Set<string>();
    for (const s of f.signatures) {
      if (signatures.has(s.id)) throw new Error(`Duplicate signature ${s.id} in family ${f.id}`);
      signatures.add(s.id);
      for (const ref of [s.input_parameter, s.output_parameter])
        if (!parameterIds.has(ref)) throw new Error(`Family ${f.id} references unknown parameter ${ref}`);
    }
    const registered = { ...f, pack: pack.id, domain: pack.domain, review: f.review ?? pack.review };
    families.push(registered);
    familyIds.set(f.id, registered);
  }
  const records = new Map<string | number, { pack: KnowledgePack; entry: z.infer<typeof KnowledgeEntry> }>();
  for (const pack of packs) for (const e of pack.effects) {
    // Preserve the original starter database's numeric ids; extensions use qualified ids.
    if (typeof e.id === "number" ? pack.id !== "physical" : !e.id.startsWith(`${pack.id}:`))
      throw new Error(`Effect ${e.id} must use pack namespace ${pack.id} (numeric ids are reserved for physical)`);
    if (effectIds.has(e.id)) throw new Error(`Duplicate knowledge effect id: ${e.id}`);
    effectIds.add(e.id);
    records.set(e.id, { pack, entry: e });
  }
  const modelIds = new Map<string, RegisteredModel>();
  for (const pack of packs) for (const m of pack.models) {
    if (!m.id.startsWith(`${pack.id}:`)) throw new Error(`Model ${m.id} must use pack namespace ${pack.id}`);
    if (modelIds.has(m.id)) throw new Error(`Duplicate knowledge model id: ${m.id}`);
    for (const ref of [...m.inputs, ...m.outputs].map(p => p.parameter).concat(m.state_parameter ? [m.state_parameter] : []))
      if (!parameterIds.has(ref)) throw new Error(`Model ${m.id} references unknown parameter ${ref}`);
    for (const ref of m.parents)
      if (!effectIds.has(ref)) throw new Error(`Model ${m.id} references unknown parent effect ${ref}`);
    const registered = { ...m, pack: pack.id, domain: pack.domain, review: m.review ?? pack.review,
      limitations: [...pack.limitations, ...m.limitations] };
    models.push(registered);
    modelIds.set(m.id, registered);
  }
  const mappingIds = new Map<string, RegisteredBoundaryMapping>();
  for (const pack of packs) for (const m of pack.boundary_mappings) {
    if (!m.id.startsWith(`${pack.id}:`)) throw new Error(`Boundary mapping ${m.id} must use pack namespace ${pack.id}`);
    if (mappingIds.has(m.id)) throw new Error(`Duplicate boundary mapping ${m.id}`);
    const from = parameterIds.get(m.input_parameter), to = parameterIds.get(m.output_parameter);
    if (!from || !to) throw new Error(`Boundary mapping ${m.id} references unknown parameter`);
    validateBoundaryMapping(m, from, to);
    const registered = { ...m, pack: pack.id, domain: pack.domain, review: m.review ?? pack.review };
    boundaryMappings.push(registered); mappingIds.set(m.id, registered);
  }
  const resolved = new Map<string | number, RegisteredEffect>(), visiting = new Set<string | number>(), heights = new Map<string | number, number>();
  const port = (id: string) => {
    const p = parameterIds.get(id)!;
    return { quantity: p.quantity, ...(p.si === undefined ? {} : { si: p.si }) };
  };
  const resolve = (id: string | number, depth = 0): RegisteredEffect => {
    if (visiting.has(id)) throw new Error(`Cyclic composite definition at ${id}`);
    if (depth > 12) throw new Error(`Composite nesting exceeds 12 at ${id}`);
    const cached = resolved.get(id);
    if (cached) {
      if (depth + heights.get(id)! > 12) throw new Error(`Composite nesting exceeds 12 at ${id}`);
      return cached;
    }
    const record = records.get(id);
    if (!record) throw new Error(`Unknown composite step ${id}`);
    const { pack, entry } = record;
    visiting.add(id);
    const metadata = { pack: pack.id, domain: pack.domain,
      provenance: entry.provenance ?? pack.source, review: entry.review ?? pack.review,
      limitations: [...pack.limitations, ...(entry.limitations ?? [])] };
    let e: RegisteredEffect, height = 0;
    if (entry.kind === "specialization") {
      const family = familyIds.get(entry.family);
      if (!family) throw new Error(`Effect ${id} references unknown family ${entry.family}`);
      const s = family.signatures.find(s => s.id === entry.signature);
      if (!s) throw new Error(`Effect ${id} references unknown signature ${entry.signature}`);
      const { kind, family: _, signature: __, ...description } = entry;
      e = { ...description, ...metadata, kind: family.kind, input: port(s.input_parameter), output: port(s.output_parameter),
        input_parameter: s.input_parameter, output_parameter: s.output_parameter, field: s.field,
        definition: { form: "specialization", family: family.id, signature: s.id } };
    } else if (entry.kind === "configuration") {
      const configuration = resolveConfiguration(entry.configuration, modelIds, mappingIds);
      const input = configuration.inputs.find(p => p.primary)!.parameter;
      const output = configuration.outputs.find(p => p.primary)!.parameter;
      const { kind, role, configuration: _, ...description } = entry;
      e = { ...description, ...metadata, kind: role, input: port(input), output: port(output),
        input_parameter: input, output_parameter: output,
        definition: { form: "configuration", configuration } };
    } else if (entry.kind === "composite") {
      const parts = entry.steps.map(step => resolve(step, depth + 1));
      height = 1 + Math.max(...parts.map(p => heights.get(p.id)!));
      if (parts.some(p => !p.input_parameter || !p.output_parameter)) throw new Error(`Composite ${id} contains an untyped step`);
      for (let i = 1; i < parts.length; i++)
        if (parts[i - 1].output_parameter !== parts[i].input_parameter) throw new Error(`Composite ${id} has incompatible adjacent quantity parameters`);
      const components = parts.flatMap(p => p.components ?? [p.id]);
      if (components.length > 12) throw new Error(`Composite ${id} expands beyond 12 effects`);
      const { steps, ...description } = entry;
      e = { ...description, ...metadata, input: parts[0].input!, output: parts.at(-1)!.output!,
        input_parameter: parts[0].input_parameter, output_parameter: parts.at(-1)!.output_parameter,
        conditions: [...new Set([...parts.flatMap(p => p.conditions ?? []), ...entry.conditions])],
        limitations: [...new Set([...metadata.limitations, ...parts.flatMap(p => p.limitations)])],
        fields: [...new Set(parts.flatMap(p => p.fields ?? (p.field ? [p.field] : [])))],
        components, typed_from: "source", definition: { form: "composite", steps } };
    } else e = { ...entry, ...metadata, definition: { form: "direct" } };
    for (const side of ["input", "output"] as const) {
      const ref = e[`${side}_parameter`];
      if (!ref) continue;
      const p = parameterIds.get(ref), port = e[side]!;
      if (!p) throw new Error(`Effect ${e.id} references unknown parameter ${ref}`);
      if (p.quantity !== port.quantity || !sameDimension(p.si, port.si))
        throw new Error(`Effect ${e.id} ${side} disagrees with parameter ${ref}`);
    }
    visiting.delete(id);
    heights.set(id, height);
    resolved.set(id, e);
    return e;
  };
  for (const id of records.keys()) effects.push(resolve(id));
  for (const e of effects) for (const ref of e.related_effects ?? []) {
    if (!effectIds.has(ref.id) || ref.id === e.id)
      throw new Error(`Effect ${e.id} has an unknown or self-referential related effect: ${ref.id}`);
  }
  for (const e of effects) for (const facet of e.model_assessment?.facets ?? []) {
    for (const ref of facet.models ?? []) {
      const m = modelIds.get(ref);
      if (!m) throw new Error(`Effect ${e.id} model assessment references unknown model ${ref}`);
      if (!m.parents.includes(e.id)) throw new Error(`Model ${ref} does not name parent effect ${e.id}`);
    }
    if (facet.effect === undefined) continue;
    const target = resolved.get(facet.effect);
    if (!target) throw new Error(`Effect ${e.id} model assessment references unknown effect ${facet.effect}`);
    if (!target.input_parameter || !target.output_parameter)
      throw new Error(`Effect ${e.id} model assessment references untyped effect ${facet.effect}`);
  }
  const specializations = effects.filter(e => e.definition.form === "specialization").length;
  const composites = effects.filter(e => e.definition.form === "composite").length;
  const configurations = effects.filter(e => e.definition.form === "configuration").length;
  const direct = effects.length - specializations - composites - configurations;
  return { packs, parameters, effects, families, models, boundary_mappings: boundaryMappings, taxonomy: effectTaxonomy(effects), counts: { direct, signatures: families.reduce((n, f) => n + f.signatures.length, 0), specializations, composites, configurations,
    independent_contracts: effects.filter(e => e.definition.form === "direct" && e.input && e.output).length + families.reduce((n, f) => n + f.signatures.length, 0), searchable: effects.length } };
}

export const knowledgePackJsonSchema = () => ({ ...z.toJSONSchema(KnowledgePack), title: "TRIZ knowledge pack" });
export const knowledgeManifestJsonSchema = () => ({ ...z.toJSONSchema(KnowledgeManifest), title: "TRIZ knowledge manifest" });
