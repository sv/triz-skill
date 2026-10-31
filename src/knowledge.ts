/** Versioned, cross-domain knowledge packs. Validation never establishes empirical truth. */
import { z } from "zod";
import { EffectField, EffectPort } from "./act-effects.js";
import { sameDimension, SI } from "./act-dimensions.js";
import { Layer } from "./act.js";

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
export const KnowledgeEffect = z.strictObject({
  id: z.union([QualifiedId, z.number().int().positive()]),
  name: Text,
  category: Text,
  function: Text,
  statement: Text,
  hints: z.array(Text),
  input: EffectPort.optional(),
  output: EffectPort.optional(),
  input_parameter: QualifiedId.optional(),
  output_parameter: QualifiedId.optional(),
  field: EffectField.optional(),
  conditions: z.array(Text).optional(),
  source: Text.optional(),
  typed_from: z.enum(["source", "statement"]).optional(),
  provenance: KnowledgeSource.optional(),
  review: KnowledgeReview.optional(),
  limitations: z.array(Text).optional(),
  related_effects: z.array(z.strictObject({
    id: z.union([QualifiedId, z.number().int().positive()]),
    relation: z.enum(["specializes", "uses", "related"]),
  })).optional(),
}).superRefine((e, ctx) => {
  const fields = ["input", "output", "input_parameter", "output_parameter", "field", "conditions", "source", "typed_from"] as const;
  const typing = ["input", "output", "input_parameter", "output_parameter", "field", "typed_from"] as const;
  if (typing.some(k => e[k] !== undefined) && !fields.every(k => e[k] !== undefined))
    ctx.addIssue({ code: "custom", message: "Typing is all-or-none: include both ports, parameter references, field, conditions, source and typed_from" });
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
  effects: z.array(KnowledgeEffect).max(10_000),
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
export type RegisteredEffect = z.infer<typeof KnowledgeEffect> & { pack: string; domain: string; provenance: z.infer<typeof KnowledgeSource>; review: z.infer<typeof KnowledgeReview>; limitations: string[] };

/** Project only complete declarations onto the existing typed-effect kernel schema. */
export function typedKnowledgeEffects(effects: RegisteredEffect[]): import("./act-effects.js").TypedEffect[] {
  return effects.filter(e => e.input && e.output && e.field && e.conditions && e.source && e.typed_from)
    .map(({ id, name, input, output, field, conditions, source, typed_from }) => ({ id, name, input: input!, output: output!, field: field!, conditions: conditions!, source: source!, typed_from: typed_from! }));
}

/** Resolve the complete union before filtering: no pack may silently shadow another. */
export function compileKnowledge(raw: unknown[]) {
  const packs = raw.map(p => KnowledgePack.parse(p));
  const parameters: RegisteredParameter[] = [];
  const effects: RegisteredEffect[] = [];
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
  for (const pack of packs) for (const e of pack.effects) {
    // Preserve the original starter database's numeric ids; extensions use qualified ids.
    if (typeof e.id === "number" ? pack.id !== "physical" : !e.id.startsWith(`${pack.id}:`))
      throw new Error(`Effect ${e.id} must use pack namespace ${pack.id} (numeric ids are reserved for physical)`);
    if (effectIds.has(e.id)) throw new Error(`Duplicate knowledge effect id: ${e.id}`);
    effectIds.add(e.id);
    for (const side of ["input", "output"] as const) {
      const ref = e[`${side}_parameter`];
      if (!ref) continue;
      const p = parameterIds.get(ref), port = e[side]!;
      if (!p) throw new Error(`Effect ${e.id} references unknown parameter ${ref}`);
      if (p.quantity !== port.quantity || !sameDimension(p.si, port.si))
        throw new Error(`Effect ${e.id} ${side} disagrees with parameter ${ref}`);
    }
    effects.push({ ...e, pack: pack.id, domain: pack.domain,
      provenance: e.provenance ?? pack.source, review: e.review ?? pack.review,
      limitations: [...pack.limitations, ...(e.limitations ?? [])] });
  }
  for (const e of effects) for (const ref of e.related_effects ?? []) {
    if (!effectIds.has(ref.id) || ref.id === e.id)
      throw new Error(`Effect ${e.id} has an unknown or self-referential related effect: ${ref.id}`);
  }
  return { packs, parameters, effects };
}

export const knowledgePackJsonSchema = () => ({ ...z.toJSONSchema(KnowledgePack), title: "TRIZ knowledge pack" });
export const knowledgeManifestJsonSchema = () => ({ ...z.toJSONSchema(KnowledgeManifest), title: "TRIZ knowledge manifest" });
