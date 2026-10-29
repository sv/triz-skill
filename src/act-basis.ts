/**
 * The Lean theorem behind each verdict. A `basis` names the statement in
 * theory/CategoricalTriz.lean, or a Mathlib lemma that file uses, that a verdict's reasoning rests on. That theorem proves the
 * abstract fact, and tests check the TypeScript against it; nothing is extracted from Lean. A
 * basis never means the TRIZ reading of a verdict is proved. Verdicts that need no theorem, such
 * as a shared value that satisfies both demands, cite none.
 *
 * Kernel results from src/act.ts are annotated here, at the tool boundary, so the kernel itself
 * stays unchanged. The construction modules cite their basis inline.
 */
import type { analyseModel, compareIdeality, dynamize, separationCheck, trimCandidates } from "./act.js";

export const THEORY_FILE = "theory/CategoricalTriz.lean";

/** Every theorem a verdict may cite; tests check each name against the Lean file. */
export const THEOREMS = [
  "exists_section_iff", "glue_of_disjoint_regions", "no_section_of_overlap", "separated_iff_axis",
  "edge_on_cycle", "transGen_equiv", "pareto_incomparable", "pareto_not_total",
  "typed_rename", "typed_delete", "typed_glue", "typed_reroute", "typed_restrict",
  "typed_overlay", "typed_dpo",
  "typed_retarget", "typed_reverse", "typed_extend", "reach_quotient", "cheaper_part_lowers_cost",
  "restrict_rewrite", "restrict_rewrite_of_inside", "boundary_rewrite",
  "trim_lowers_cost", "eq_projections_prod_iff", "eq_projections_prod_iff_rectangle", "eq_projections_pi_iff",
  "reachIn_iff_trace", "reachWithin_iff_trace", "reach_of_trace", "reachIn_of_trace", "reachWithin_saturated",
  "fixed_on_cycle", "closed_reachIn", "return_ge_two",
  "kleene_lfp", "kleeneStep_upperClosure", "codesign_lfp",
] as const;
/** Mathlib lemmas a verdict may cite. The Lean file uses each one, so `lake build` checks it exists in the pinned Mathlib. */
export const MATHLIB_THEOREMS = ["Relation.comp_assoc", "Relation.comp_eq"] as const;
export type Theorem = (typeof THEOREMS)[number] | (typeof MATHLIB_THEOREMS)[number];

/** Cells glue iff every cell's active demands share a value. */
const GLUING: Theorem[] = ["exists_section_iff"];
/** Disjoint on some axis ⇒ disjoint product regions ⇒ a piecewise assignment exists. */
const SEPARATED: Theorem[] = ["separated_iff_axis", "glue_of_disjoint_regions"];
/** Overlap on every axis ⇒ a shared cell ⇒ opposing values there admit no assignment. */
const IRREDUCIBLE: Theorem[] = ["separated_iff_axis", "no_section_of_overlap"];
/** Every typed rewrite step: deletion under no-dangling, then gluing typed additions. */
export const REWRITE: Theorem[] = ["typed_delete", "typed_glue"];

type Separation = ReturnType<typeof separationCheck>;

export function separationBasis(r: Separation) {
  if (!r.ok) return r;
  return {
    ...r,
    basis: GLUING,
    pairs: r.pairs.map((p) => (p.status === "compatible" ? p : { ...p, basis: p.status === "separated" ? SEPARATED : IRREDUCIBLE })),
  };
}

/** A section varying along one axis exists iff each cell of that axis admits a value. */
export function dynamizeBasis(r: ReturnType<typeof dynamize>) {
  return r.ok ? { ...r, basis: GLUING } : r;
}

/**
 * Each absorber re-attaches a function to a same-carrier output port, which keeps typing. A trim
 * only removes boxes, so with non-negative costs no dimension rises: the remaining boxes cost the
 * baseline minus `costRelief` (cited when the trimmed boxes declare a cost).
 */
export function trimBasis(r: ReturnType<typeof trimCandidates>) {
  if (!r.ok) return r;
  return {
    ...r,
    functions: r.functions.map((f) => (f.absorbers.length ? { ...f, basis: ["typed_reroute"] as Theorem[] } : f)),
    ...(Object.keys(r.costRelief).length ? {
      costBound: {
        basis: ["trim_lowers_cost"] as Theorem[],
        note: "No cost dimension rises: the remaining boxes cost the baseline minus costRelief, before any absorber's added cost, which is not modelled.",
      },
    } : {}),
  };
}

/** A trade-off is two cost vectors neither of which dominates. */
export function comparisonBasis(c: ReturnType<typeof compareIdeality>) {
  return c.verdict === "trade-off" ? { ...c, basis: ["pareto_incomparable"] as Theorem[] } : c;
}

/**
 * Analysis results:
 * - each harm loop's witness cycle (edge, then return path) is `edge_on_cycle`;
 * - a scalar ratio refused for lack of weights is `pareto_not_total`;
 * - a trade-off verdict is `pareto_incomparable`.
 */
export function analysisBasis(r: ReturnType<typeof analyseModel>) {
  if (!r.ok) return r;
  const ratio = r.ideality.ratio;
  const unweighted = !ratio.computable && ratio.reason.startsWith("no explicit weight");
  return {
    ...r,
    harmLoops: r.harmLoops.map((l) => ({ ...l, basis: ["edge_on_cycle"] as Theorem[] })),
    ideality: { ...r.ideality, ratio: unweighted ? { ...ratio, basis: ["pareto_not_total"] as Theorem[] } : ratio },
    separation: r.separation.map(separationBasis),
    comparison: r.comparison && comparisonBasis(r.comparison),
  };
}
