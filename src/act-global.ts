/** Exact finite gluing for overlapping local relations. No topological obstruction is inferred. */
import { z } from "zod";
import { RelationPlan, type RelationOptions } from "./act-relations.js";
import { fail, issue, at } from "./act-issues.js";

const Id = z.string().min(1);
export const GlobalSeparationRequest = z.strictObject({
  variables: z.array(z.strictObject({ id: Id, values: z.array(Id).min(1).max(1000) })).max(100),
  regions: z.array(z.strictObject({ id: Id, variables: z.array(Id).max(100), allowed: z.array(z.array(Id).max(100)).max(10000) })).max(100),
  max_work: z.number().int().min(1).max(1_000_000).optional(),
}).superRefine((s, ctx) => {
  const add = (path: Array<string | number>, message: string) => ctx.addIssue({ code: "custom", path, message });
  const unique = (xs: string[], path: Array<string | number>) => xs.forEach((x, i) => { if (xs.indexOf(x) !== i) add([...path, i], `duplicate '${x}'`); });
  unique(s.variables.map((v) => v.id), ["variables"]);
  unique(s.regions.map((r) => r.id), ["regions"]);
  s.variables.forEach((v, i) => unique(v.values, ["variables", i, "values"]));
  const vars = new Map(s.variables.map((v) => [v.id, v.values]));
  s.regions.forEach((r, i) => {
    unique(r.variables, ["regions", i, "variables"]);
    r.variables.forEach((v, j) => { if (!vars.has(v)) add(["regions", i, "variables", j], `unknown variable '${v}'`); });
    r.allowed.forEach((row, j) => {
      if (row.length !== r.variables.length) add(["regions", i, "allowed", j], "tuple must give exactly one value per region variable");
      row.forEach((v, k) => { if (vars.has(r.variables[k]) && !vars.get(r.variables[k])!.includes(v)) add(["regions", i, "allowed", j, k], `undeclared value '${v}'`); });
    });
  });
});
export type GlobalSeparationInput = z.infer<typeof GlobalSeparationRequest>;

/** Global consistency requires a single assignment meeting ALL local tuples simultaneously. */
export function globalSeparation(input: unknown, options: RelationOptions = {}) {
  const parsed = GlobalSeparationRequest.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((e) => issue("invalid-argument", at("$", ...e.path.map(String)), e.message, "Use declared variables, values, and complete local tuples only.")));
  const s = parsed.data, max = s.max_work ?? 100_000;
  let work = s.variables.reduce((n, v) => n + v.values.length, 0) + s.regions.reduce((n, r) => n + r.allowed.length * Math.max(1, r.variables.length), 0);
  class Limit extends Error {}
  const spend = (n: number) => { if (work + n > max) { work = max; throw new Limit(); } work += n; };
  let witness: Record<string, string> | undefined;
  let capped = work > max;
  let relations: RelationPlan | undefined;
  if (!capped) try {
    const index = new Map(s.variables.map((v, i) => [v.id, i]));
    const sets = s.regions.map(r => ({ vars: r.variables.map(v => index.get(v)!),
      rows: r.allowed.map(row => row.map((x, i) => [index.get(r.variables[i])!, x] as [number, string])) }));
    // Domain factors also supply unconstrained variables; no caller variable disappears.
    sets.push(...s.variables.map((v, i) => ({ vars: [i], rows: v.values.map(x => [[i, x] as [number, string]]) })));
    relations = new RelationPlan(sets, options, spend);
    const assignment: Array<string | undefined> = Array(s.variables.length).fill(undefined);
    const found = relations.witness(assignment, { explored: 0, max: Infinity, spend });
    if (found) witness = Object.fromEntries(s.variables.map((v, i) => [v.id, assignment[i]!]));
  } catch (e) {
    if (!(e instanceof Limit)) throw e;
    capped = true;
  }
  const common = { ok: true as const, work: Math.min(work, max), maxWork: max, ...(relations ? { relationStats: relations.stats } : {}), semantics: "One finite global assignment must restrict to an allowed tuple in every overlapping region. Pairwise projection agreement alone does not establish it." };
  if (witness) return { ...common, verdict: "satisfiable" as const, witness, complete: true };
  if (capped) return { ...common, verdict: "undecided" as const, reason: "work-cap" as const, complete: false };
  return { ...common, verdict: "unsatisfiable" as const, complete: true, obstruction: { regions: s.regions.map((r) => r.id), note: "The full finite join is empty; no minimal unsatisfiable core or cohomology class is claimed." } };
}
