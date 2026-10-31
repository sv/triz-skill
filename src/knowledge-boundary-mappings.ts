/** Explicit forgetful observations at named output boundaries, never general unit casts. */
import { Carrier, type FunctionModel } from "./act.js";
import { sameDimension } from "./act-dimensions.js";
import { z } from "zod";

const Text = z.string().trim().min(1);
const Qualified = z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/);
export const BoundaryMappingFields = {
  id: Qualified, name: Text, description: Text,
  input_parameter: Qualified, output_parameter: Qualified,
  relation: z.literal("forget-refinement"),
  rationale: Text,
  conditions: z.array(Text).min(1), limitations: z.array(Text).min(1),
};
const zMappingBoundary = z.object(BoundaryMappingFields);
export type MappingBoundary = z.infer<typeof zMappingBoundary>;

/** Neither dimensions nor value labels establish the semantic refinement; registry evidence does. */
export function validateBoundaryMapping(mapping: MappingBoundary, from: { si?: z.infer<typeof Carrier>["si"]; layer?: string }, to: { si?: z.infer<typeof Carrier>["si"]; layer?: string }) {
  if (mapping.input_parameter === mapping.output_parameter) throw new Error(`Boundary mapping ${mapping.id} is a redundant identity`);
  if (!sameDimension(from.si, to.si) || !from.layer || from.layer !== to.layer)
    throw new Error(`Boundary mapping ${mapping.id} changes dimension or carrier layer`);
}
export function boundaryMappingComponent(mapping: MappingBoundary, from: z.infer<typeof Carrier>, to: z.infer<typeof Carrier>): FunctionModel["boxes"][number] {
  validateBoundaryMapping(mapping, from, to);
  const levels = (c: z.infer<typeof Carrier>) => c.levels?.map(l => [l.value, l.from, l.unit ?? null]) ?? null;
  if ((from.quantity ?? "intensive") !== (to.quantity ?? "intensive") || JSON.stringify(levels(from)) !== JSON.stringify(levels(to)))
    throw new Error(`Boundary mapping ${mapping.id} changes level thresholds or resource allocation semantics`);
  const source = from.values, target = to.values;
  // These observations preserve the numerical/finite encoding. No relabeling, scale or inverse is guessed.
  if ((source === undefined) !== (target === undefined) || (source && target &&
    (source.length !== target.length || source.some(v => !target.includes(v)))))
    throw new Error(`Boundary mapping ${mapping.id} requires identical explicit finite value domains on both parameters`);
  return { id: mapping.id, name: mapping.name, role: "mediator", inputs: [{ id: "in", carrier: from.id }], outputs: [{ id: "out", carrier: to.id }],
    ...(source ? { behavior: source.map(v => ({ in: { in: v }, out: { out: v } })) } : {}) };
}
