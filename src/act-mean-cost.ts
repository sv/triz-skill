/** Karp's dynamic program on a complete strongly connected component, then
 * independently check a rational potential and a tight cycle. */
import {
  Z,
  rational,
  q,
  add,
  sub,
  neg,
  div,
  cmp,
  sum,
  show,
  approx,
  type Q,
} from "./act-rational.js";
export interface CostEdge {
  from: number;
  to: number;
  cost: Record<string, number | string>;
  rows: Array<{ box: string; row: number }>;
}
export class CostCap extends Error {}
export function meanCosts(
  states: string[][],
  edges: CostEdge[],
  maxWork = 100_000,
) {
  let work = 0;
  const charge = () => {
    if (++work > maxWork) throw new CostCap();
  };
  const n = states.length;
  const extreme = (dimension: string, sign: 1 | -1) => {
    const costs = edges.map((e) => {
      charge();
      const x = rational(
        Object.hasOwn(e.cost, dimension) ? e.cost[dimension] : 0,
      );
      return sign === 1 ? x : neg(x);
    });
    const dp: Array<Array<Q | undefined>> = [Array<Q>(n).fill(Z)];
    for (let k = 1; k <= n; k++) {
      const row = Array<Q | undefined>(n).fill(undefined);
      edges.forEach((e, i) => {
        charge();
        const prev = dp[k - 1][e.from];
        if (prev === undefined) return;
        const v = add(prev, costs[i]);
        if (row[e.to] === undefined || cmp(v, row[e.to]!) < 0) row[e.to] = v;
      });
      dp.push(row);
    }
    let lambda: Q | undefined;
    for (let v = 0; v < n; v++) {
      let bound: Q | undefined;
      for (let k = 0; k < n; k++) {
        charge();
        if (dp[n][v] === undefined || dp[k][v] === undefined) continue;
        const r = div(sub(dp[n][v]!, dp[k][v]!), q(BigInt(n - k)));
        if (!bound || cmp(r, bound) > 0) bound = r;
      }
      if (bound && (!lambda || cmp(bound, lambda) < 0)) lambda = bound;
    }
    if (!lambda) throw new Error("component has no cycle");
    const p = Array<Q>(n).fill(Z);
    for (let k = 1; k < n; k++)
      for (let i = 0; i < edges.length; i++) {
        charge();
        const e = edges[i],
          v = add(p[e.from], sub(costs[i], lambda));
        if (cmp(v, p[e.to]) < 0) p[e.to] = v;
      }
    const tight = Array.from({ length: n }, () => [] as number[]);
    edges.forEach((e, i) => {
      charge();
      const r = sub(add(costs[i], p[e.from]), add(p[e.to], lambda!));
      if (cmp(r, Z) < 0) throw new Error("invalid potential");
      if (cmp(r, Z) === 0) tight[e.from].push(i);
    });
    const colour = Array<number>(n).fill(0),
      path: number[] = [],
      at = Array<number>(n).fill(0);
    let witness: number[] | undefined;
    const visit = (v: number) => {
      colour[v] = 1;
      at[v] = path.length;
      for (const i of tight[v]) {
        charge();
        const to = edges[i].to;
        if (colour[to] === 1) {
          witness = [...path.slice(at[to]), i];
          return;
        }
        if (colour[to] === 0) {
          path.push(i);
          visit(to);
          path.pop();
          if (witness) return;
        }
      }
      colour[v] = 2;
    };
    for (let v = 0; v < n && !witness; v++) if (!colour[v]) visit(v);
    if (
      !witness?.length ||
      cmp(
        div(sum(witness.map((i) => costs[i])), q(BigInt(witness.length))),
        lambda,
      ) !== 0
    )
      throw new Error("invalid mean witness");
    const value = sign === 1 ? lambda : neg(lambda);
    return {
      value: approx(value),
      exact: show(value),
      potential: p.map((x) => show(sign === 1 ? x : neg(x))),
      cycle: witness.map((i) => ({
        from: states[edges[i].from],
        to: states[edges[i].to],
        rows: edges[i].rows,
        cost: edges[i].cost,
      })),
      edgeIndices: witness,
    };
  };
  try {
    const dimensions = [...new Set(edges.flatMap((e) => Object.keys(e.cost)))];
    const values = dimensions.map((dimension) => {
      const min = extreme(dimension, 1),
        max = extreme(dimension, -1);
      return {
        dimension,
        min: min.value,
        max: max.value,
        exact: { min: min.exact, max: max.exact },
        minCycle: min.cycle,
        maxCycle: max.cycle,
        potentials: { min: min.potential, max: max.potential },
        basis: [
          "MeanCost.Bounds.walk_mean",
          "MeanCost.cycle_lower",
          "MeanCost.cycle_upper",
          "MeanCost.attains_bound",
        ],
      };
    });
    return { verdict: "decided" as const, values, work };
  } catch (e) {
    if (e instanceof CostCap)
      return { verdict: "undecided" as const, reason: "mean-cost-cap", work };
    throw e;
  }
}
