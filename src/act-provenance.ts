import { z } from "zod";

/** Source identifiers are caller-supplied labels; they are never fetched or opened. */
export const SourceLocation = z.strictObject({
  source: z.string().min(1),
  pointer: z.string().refine(s => s === "" || (s.startsWith("/") && !/~(?![01])/.test(s)), "Use an RFC 6901 JSON pointer").optional(),
  line: z.number().int().positive().optional(),
}).refine(x => (x.pointer !== undefined) !== (x.line !== undefined), "Supply exactly one JSON pointer or line number");
export type SourceLocation = z.infer<typeof SourceLocation>;
export const Pending = z.strictObject({
  id: z.string().min(1), kind: z.enum(["role", "carrier", "polarity", "assumption"]),
  description: z.string().min(1), source: SourceLocation,
});
export type Pending = z.infer<typeof Pending>;
export const Decision = z.strictObject({ id: z.string().min(1), decision: z.literal("confirm"), note: z.string().trim().min(1).optional() });
/** Containment is retained as source metadata; it is not a function or a wire. */
export const ProvenanceHierarchyLink = z.strictObject({
  parent: z.string().min(1), child: z.string().min(1), source: SourceLocation,
});
export type ProvenanceHierarchyLink = z.infer<typeof ProvenanceHierarchyLink>;

/** Check single-parent acyclic containment and, when supplied, current box references. */
export function hierarchyProblems(links: readonly ProvenanceHierarchyLink[], boxes?: ReadonlySet<string>): string[] {
  const problems: string[] = [], parentOf = new Map<string, string>();
  for (const link of links) {
    if (boxes && (!boxes.has(link.parent) || !boxes.has(link.child))) problems.push("Containment names an unknown model box");
    if (parentOf.has(link.child)) problems.push("A containment child appears more than once");
    else parentOf.set(link.child, link.parent);
  }
  const visited = new Set<string>();
  for (const child of parentOf.keys()) {
    const active = new Set<string>();
    let cursor: string | undefined = child;
    while (cursor !== undefined && !visited.has(cursor)) {
      if (active.has(cursor)) { problems.push("Containment contains a cycle"); break; }
      active.add(cursor); cursor = parentOf.get(cursor);
    }
    for (const id of active) visited.add(id);
  }
  return [...new Set(problems)];
}
export const ModelProvenance = z.strictObject({
  status: z.enum(["draft", "reviewed"]),
  components: z.array(z.strictObject({ id: z.string().min(1), source: SourceLocation })),
  interactions: z.array(z.strictObject({ wireId: z.string().min(1), source: SourceLocation })),
  hierarchy: z.array(ProvenanceHierarchyLink).optional(),
  pending: z.array(Pending).min(1),
  review: z.strictObject({ decisions: z.array(Decision) }).optional(),
}).superRefine((p, ctx) => {
  const ids = p.pending.map(x => x.id), decisions = p.review?.decisions.map(x => x.id) ?? [];
  for (const message of hierarchyProblems(p.hierarchy ?? [])) ctx.addIssue({code:"custom",path:["hierarchy"],message});
  const pendingIds = new Set(ids);
  if (pendingIds.size !== ids.length) ctx.addIssue({code:"custom",path:["pending"],message:"Pending review ids must be unique"});
  if (p.status === "draft" && p.review !== undefined) ctx.addIssue({code:"custom",path:["review"],message:"A draft has no completed review"});
  if (p.status === "reviewed" && (!p.review || new Set(decisions).size !== decisions.length || decisions.length !== ids.length || decisions.some(id => !pendingIds.has(id))))
    ctx.addIssue({code:"custom",path:["review"],message:"Review requires one decision for every pending item and no others"});
});
export type ModelProvenance = z.infer<typeof ModelProvenance>;

/** Explicit analyst assertion. Decisions are recorded; this does not prove physical truth. */
export function confirmProvenance(p: ModelProvenance, decisions: z.infer<typeof Decision>[]) {
  if (p.status !== "draft") return {ok:false as const, errors:["Only a draft can be reviewed."]};
  const reviewed = ModelProvenance.safeParse({...p, status:"reviewed", review:{decisions}});
  return reviewed.success ? {ok:true as const, provenance: reviewed.data} :
    {ok:false as const, errors:reviewed.error.issues.map(i => i.message)};
}

/** Schema and review-coverage errors for an untrusted model provenance value. */
export function provenanceProblems(value: unknown): string[] {
  const result = ModelProvenance.safeParse(value);
  return result.success ? [] : result.error.issues.map(i => i.message);
}
