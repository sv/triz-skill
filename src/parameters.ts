/** The classical matrix has a closed vocabulary: exactly one entry for each id 1–39. */
import { z } from "zod";

const Text = z.string().trim().min(1);
const ParameterId = z.number().int().min(1).max(39);
export const CanonicalParameter = z.strictObject({
  id: ParameterId,
  name: Text,
  aliases: z.array(Text).optional().describe("Alternate labels; not automatic quantity or domain mappings"),
  clarification: Text.optional().describe("Repository-authored guidance for interpreting the historical category"),
  distinguish_from: z.array(ParameterId).max(38).optional().describe("Nearby canonical categories to consider separately, not equivalent ids"),
});
export type Parameter = z.infer<typeof CanonicalParameter>;

export const CanonicalParameters = z.strictObject({
  _meta: z.record(z.string(), z.unknown()).optional(),
  parameters: z.array(CanonicalParameter).length(39),
}).superRefine(({ parameters }, ctx) => {
  const ids = new Set<number>(), names = new Set<string>();
  for (const [i, p] of parameters.entries()) {
    if (ids.has(p.id)) ctx.addIssue({ code: "custom", path: ["parameters", i, "id"], message: `Duplicate canonical parameter id ${p.id}` });
    ids.add(p.id);
    const name = p.name.toLowerCase();
    if (names.has(name)) ctx.addIssue({ code: "custom", path: ["parameters", i, "name"], message: `Duplicate canonical parameter name ${p.name}` });
    names.add(name);
    const related = p.distinguish_from ?? [];
    if (related.includes(p.id) || new Set(related).size !== related.length)
      ctx.addIssue({ code: "custom", path: ["parameters", i, "distinguish_from"], message: "Distinctions must name different, non-repeated canonical ids" });
  }
});

export const canonicalParametersJsonSchema = () => ({ ...z.toJSONSchema(CanonicalParameters), title: "Classical TRIZ 39 engineering parameters" });
