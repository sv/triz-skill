/**
 * Joint nondominated ranking of finite candidate designs over declared metric vectors.
 *
 * A candidate is dominated when another is at least as good on every declared metric and strictly
 * better on one, under the metric's direction (minimize by default, maximize on request). The
 * frontier is what nothing dominates; incomparable frontier members are reported as trade-offs
 * and never resolved, because the componentwise order is not total (`pareto_not_total`): any
 * single ranking needs weights the caller chooses, and no weight is ever filled in — weights only
 * order the listing.
 *
 * The metrics are declared numbers, typically what the kernel's own tools already produced:
 * minimal resource vectors (`triz_feasibility`), lifecycle gain and availability
 * (`triz_lifecycle`), component counts (`triz_synthesize`, `triz_component_search`) or declared
 * costs. This tool compares declared numbers; it collects nothing and measures nothing.
 */
import { z } from "zod";
import { at, fail, issue } from "./act-issues.js";
import type { Theorem } from "./act-basis.js";

/** Dominance over declared metrics is the componentwise order; its incomparabilities are trade-offs. */
const BASIS: Theorem[] = ["pareto_not_total", "pareto_incomparable"];

const MetricName = z.string().min(1).regex(/^(?!__proto__$)/);

export const ParetoRequest = z.strictObject({
  candidates: z.array(z.strictObject({
    id: z.string().min(1),
    metrics: z.record(MetricName, z.number()).describe("Metric name → value; every candidate reports the same metric names"),
  })).min(1).max(200).describe("Candidate designs to compare, e.g. the candidates triz_synthesize or triz_component_search returned, or concepts ranked by triz_weakness"),
  directions: z.record(z.string().min(1), z.enum(["minimize", "maximize"])).default({}).describe("Per metric, whether smaller or larger is better; default minimize"),
  weights: z.record(z.string().min(1), z.number().nonnegative()).optional().describe("Advisory only: a weighted sum orders the frontier listing; it changes no verdict (pareto_not_total: a scalar order needs weights the caller chooses)"),
});

type Candidate = z.infer<typeof ParetoRequest>["candidates"][number];
const LISTED_TRADEOFFS = 50;

export function pareto(raw: z.input<typeof ParetoRequest>) {
  const parsed = ParetoRequest.safeParse(raw);
  if (!parsed.success)
    return fail(parsed.error.issues.map((e) => issue("invalid-argument", at("$", ...e.path.map((x) => (typeof x === "number" ? x : String(x)))), e.message, "Use the pareto request schema.")));
  const { candidates, directions, weights } = parsed.data;
  const names = [...new Set(candidates.flatMap((c) => Object.keys(c.metrics)))];
  if (!names.length)
    return fail([issue("invalid-argument", "$.candidates", "every candidate reports an empty metric record", "Give each candidate the same metric names with numeric values, e.g. the minimal resource vector triz_feasibility reported for it.")]);
  for (const [k, c] of candidates.entries()) {
    const missing = names.filter((n) => !(n in c.metrics)), extra = Object.keys(c.metrics).filter((n) => !names.includes(n));
    if (missing.length || extra.length)
      return fail([issue("invalid-argument", at("$.candidates", k), `candidate '${c.id}' ${missing.length ? `does not report ${missing.map((n) => `'${n}'`).join(", ")}` : ""}${missing.length && extra.length ? " and " : ""}${extra.length ? `reports unknown metric ${extra.map((n) => `'${n}'`).join(", ")}` : ""}`, "Every candidate reports the same metric names; a metric one candidate lacks cannot be compared.")]);
  }
  for (const [where, given, known] of [["$.directions", directions, names], ["$.weights", weights, names]] as const) {
    const unknown = Object.keys(given ?? {}).filter((d) => !known.includes(d));
    if (unknown.length)
      return fail([issue(where === "$.weights" ? "invalid-weight" : "invalid-argument", where, `${where === "$.weights" ? "a weight" : "a direction"} is given for unknown metric ${unknown.map((n) => `'${n}'`).join(", ")}`, `Name one of the reported metrics: ${names.map((n) => `'${n}'`).join(", ")}.`)]);
  }
  const duplicateIds = candidates.map((c) => c.id).filter((id, i, all) => all.indexOf(id) !== i);
  if (duplicateIds.length)
    return fail([issue("invalid-argument", "$.candidates", `candidate id${duplicateIds.length > 1 ? "s" : ""} ${[...new Set(duplicateIds)].map((id) => `'${id}'`).join(", ")} listed more than once`, "Give each candidate its own id.")]);

  const direction = (n: string) => directions[n] ?? ("minimize" as const);
  /** Normalized values: lower is better, whatever the declared direction. */
  const vector = (c: Candidate) => names.map((n) => (direction(n) === "maximize" ? -c.metrics[n] : c.metrics[n]));
  const vecs = candidates.map(vector);
  const le = (a: number[], b: number[]) => a.every((x, i) => x <= b[i]);
  const dominates = (i: number, j: number) => le(vecs[i], vecs[j]) && vecs[i].some((x, k) => x < vecs[j][k]);
  const better = (i: number, j: number) => names.flatMap((n, k) => (vecs[i][k] < vecs[j][k] ? [n] : []));

  const dominators = candidates.map((_, j) => candidates.flatMap((_, i) => (i !== j && dominates(i, j) ? [i] : [])));
  const frontier = candidates.map((_, j) => (dominators[j].length ? [] : [j])).flat();
  // One dominator witness per dominated candidate: the first by listing order, with the metrics it wins.
  const dominated = candidates.flatMap((c, j) => (!dominators[j].length ? [] : [{
    id: c.id,
    dominators: dominators[j].map((i) => candidates[i].id),
    witness: { by: candidates[dominators[j][0]].id, better: better(dominators[j][0], j) },
  }]));
  // Trade-offs among frontier members: pairs neither of which dominates the other.
  const tradeoffs: Array<{ a: string; b: string; aBetter: string[]; bBetter: string[] }> = [];
  let truncated = false;
  for (let x = 0; x < frontier.length; x++) for (let y = x + 1; y < frontier.length; y++) {
    const i = frontier[x], j = frontier[y];
    if (dominates(i, j) || dominates(j, i)) continue;
    const aBetter = better(i, j), bBetter = better(j, i);
    if (!aBetter.length && !bBetter.length) continue; // equal metric vectors: duplicates, not a trade-off
    if (tradeoffs.length >= LISTED_TRADEOFFS) { truncated = true; continue; }
    tradeoffs.push({ a: candidates[i].id, b: candidates[j].id, aBetter, bBetter });
  }
  const order = weights
    ? [...frontier].sort((i, j) => names.reduce((s, n, k) => s + (weights[n] ?? 0) * (vecs[i][k] - vecs[j][k]), 0)
      || candidates[i].id.localeCompare(candidates[j].id))
    : frontier;
  return {
    ok: true as const,
    verdict: "ranked" as const,
    metrics: names.map((n) => ({ name: n, direction: direction(n) })),
    frontier: order.map((i) => candidates[i].id),
    frontierCount: frontier.length,
    ...(dominated.length ? { dominated } : {}),
    ...(tradeoffs.length ? { tradeoffs } : {}),
    ...(truncated ? { tradeoffsTruncated: true } : {}),
    ...(weights ? { weightedListing: "weights order the frontier listing only; the frontier, the dominated witnesses and the trade-offs never move under weights" } : {}),
    basis: BASIS,
    note: "Dominance is componentwise under the declared directions: the frontier holds every candidate no other matches on every metric and beats on one, so a smaller frontier is a stronger statement, and equal metric vectors stay on it together. Incomparable frontier members are reported as trade-offs and never resolved: the componentwise order is not total (pareto_not_total), so any single ranking needs weights the caller chooses, and no weight is ever filled in. The compared numbers are declarations — minimal resource vectors, lifecycle figures, component counts or costs the kernel or the caller reported — not measurements taken here.",
  };
}
