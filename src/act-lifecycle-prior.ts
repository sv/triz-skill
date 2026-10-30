import { z } from "zod";
import {
  weaknessRanking,
  type Acceptable,
  type BehaviorScope,
} from "./act-behavior.js";
import { lifecycle } from "./act-lifecycle.js";
import type { FunctionModel } from "./act.js";
import { fail, issue, rebase } from "./act-issues.js";
export const LifecyclePrior = z.strictObject({
  concept: z.string().min(1),
  box: z.string().optional(),
  weights: z.record(z.string(), z.number().nonnegative()).optional(),
  objective: z.number().int().nonnegative().default(0),
  max_steps: z.number().int().min(1).max(1_000_000).optional(),
});
export function lifecyclePriorRanking(
  concepts: Array<{ id: string; model: FunctionModel }>,
  acceptable: Acceptable[],
  selections: z.infer<typeof LifecyclePrior>[],
  opts: { maxStates?: number; scope?: BehaviorScope } = {},
) {
  const selected = new Map(selections.map((s) => [s.concept, s]));
  if (
    selected.size !== concepts.length ||
    selected.size !== selections.length ||
    concepts.some((c) => !selected.has(c.id))
  )
    return fail([
      issue(
        "invalid-prior",
        "$.lifecycle_priors",
        "Select every concept exactly once for occupancy-derived priors",
        "Supply one lifecycle_priors selection per concept.",
      ),
    ]);
  const base = weaknessRanking(concepts, acceptable, opts);
  if (!base.ok || base.verdict !== "ranked") return base;
  const scores = [];
  for (const [index, concept] of concepts.entries()) {
    const selection = selected.get(concept.id)!;
    const r = lifecycle({
      model: concept.model,
      box: selection.box,
      weights: selection.weights,
      max_steps: selection.max_steps,
      derive_prior: true,
    });
    if (!r.ok)
      return rebase(r, [
        ["$.model", `$.concepts[${index}].model`],
        ["$.box", `$.lifecycle_priors[${selections.indexOf(selection)}].box`],
      ]);
    if (r.verdict !== "optimal")
      return {
        ...base,
        lifecyclePriors: {
          verdict: "undecided",
          concept: concept.id,
          reason: r.verdict === "undecided" ? r.reason : r.verdict,
        },
      };
    const solution = r.solutions![selection.objective];
    if (!solution?.joint_prior)
      return fail([
        issue(
          "invalid-prior",
          "$.lifecycle_priors",
          "Selected lifecycle objective is unavailable",
          "Select a solved lifecycle objective.",
        ),
      ]);
    const scored = weaknessRanking(concepts, acceptable, {
      ...opts,
      jointPrior: solution.joint_prior,
    });
    if (!scored.ok)
      return rebase(scored, [
        ["$.joint_prior", `$.concepts[${index}].model.lifecycle.situations`],
      ]);
    if (scored.verdict !== "ranked")
      return {
        ...base,
        lifecyclePriors: { verdict: "undecided", concept: concept.id },
      };
    const own = scored.concepts.find((c) => c.id === concept.id)!;
    scores.push({
      id: concept.id,
      admittedProbability: own.jointAdmittedProbability,
      joint_prior: solution.joint_prior,
      policy: solution.policy,
      occupancy: solution.occupancy,
    });
  }
  return {
    ...base,
    lifecyclePriors: {
      verdict: "derived",
      concepts: scores,
      byProbability: [...scores]
        .sort((a, b) => b.admittedProbability! - a.admittedProbability!)
        .map((s) => ({ id: s.id, admittedProbability: s.admittedProbability })),
      note: "Each concept uses its own declared dynamics and optimal policy. Inclusion and count orders are unchanged; probabilities describe different concept-specific operating distributions.",
    },
  };
}
