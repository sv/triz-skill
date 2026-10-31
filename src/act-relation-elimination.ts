/** Bucket elimination over complete finite relations. Multiplication joins independent
 * eliminated assignments; addition sums disjoint assignments of the removed variable.
 * This counts states, never implementations, resource choices, probabilities or costs. */
import type { ProjectedRow, RelationBinding, RelationBudget, ScopedRelation } from "./act-relations.js";

export type EliminationOptions = {
  elimination?: "auto" | "always" | "off";
  maxEliminationWork?: number;
  maxEliminationCells?: number;
  maxSeparatorVariables?: number;
};
export type EliminationStats = {
  attempted: boolean; applied: boolean; reason: string;
  work: number; cells: number; states: number; messages: number; messageRows: number; separatorWidth: number;
};
export const eliminationStats = (): EliminationStats => ({ attempted: false, applied: false, reason: "small-query",
  work: 0, cells: 0, states: 0, messages: 0, messageRows: 0, separatorWidth: 0 });
type WeightedRow = { binding: RelationBinding; count: bigint; samples: RelationBinding[] };
type Factor = { vars: number[]; rows: WeightedRow[] };
type Join = (sets: ScopedRelation[], assignment: Array<string | undefined>, emit: (picked: number[]) => void,
  budget: RelationBudget) => boolean;
type Outcome = { status: "complete"; table: Map<string, ProjectedRow> } | { status: "fallback" | "overflow" };
class Stop extends Error { constructor(readonly reason: string) { super(reason); } }

/** The caller supplies the shared indexed join, avoiding a second row evaluator. Failed
 * attempts discard all messages and leave the state budget unchanged. Their bounded work
 * remains in stats and is charged to spend when an outer work budget is present. */
export function eliminateProject(sets: ScopedRelation[], domains: string[][], boundary: number[], observed: number[],
  sampleLimit: number, budget: RelationBudget, options: EliminationOptions, stats: EliminationStats, join: Join): Outcome {
  const pinned = new Set([...boundary, ...observed]);
  const variables = [...new Set(sets.flatMap(s => s.vars))];
  const hidden = variables.filter(v => !pinned.has(v));
  if (options.elimination !== "always") {
    if (sets.length < 8 || hidden.length < 4) return { status: "fallback" };
    // Uniform-density estimate is only a planner heuristic, never a rejection rule.
    // Deterministic chains normally predict one state and retain their streaming join.
    let logStates = variables.filter(v => !boundary.includes(v)).reduce((n, v) => n + Math.log2(domains[v].length), 0);
    for (const set of sets) logStates += Math.log2(set.rows.length) - set.vars.reduce((n, v) => n + Math.log2(domains[v].length), 0);
    if (!(logStates >= 8)) { stats.reason = "small-estimated-join"; return { status: "fallback" }; }
  }
  stats.attempted = true;
  const spend = (amount: number) => {
    stats.work += amount; budget.spend?.(amount);
    if (stats.work > (options.maxEliminationWork ?? 100_000)) throw new Stop("work-cap");
  };
  const allocate = (cells: number) => {
    spend(cells); stats.cells += cells;
    if (stats.cells > (options.maxEliminationCells ?? 200_000)) throw new Stop("storage-cap");
  };
  const local: RelationBudget = { explored: 0, max: Math.max(0, budget.max - budget.explored), spend };
  const compiled = new WeakMap<Factor[], ScopedRelation[]>();
  const run = (factors: Factor[], assignment: Array<string | undefined>, emit: (picked: number[]) => void) => {
    spend(factors.length);
    let sets = compiled.get(factors);
    if (!sets) { sets = factors.map(f => ({ vars: f.vars, rows: f.rows.map(r => r.binding) })); compiled.set(factors, sets); }
    if (!join(sets, assignment, emit, local)) throw new Stop("state-cap");
  };
  // Every factor owns a disjoint set of removed variables. Their bounded witness lists
  // can therefore be multiplied lazily; at most sampleLimit complete combinations are built.
  const samples = (selected: WeightedRow[], append: RelationBinding, limit: number): RelationBinding[] => {
    const result: RelationBinding[] = [], bindings: RelationBinding = [...append];
    const visit = (i: number) => {
      if (result.length >= limit) return;
      if (i === selected.length) { allocate(1 + bindings.length); result.push([...bindings]); return; }
      for (const state of selected[i].samples) {
        spend(1 + state.length);
        const size = bindings.length; bindings.push(...state); visit(i + 1); bindings.length = size;
        if (result.length >= limit) break;
      }
    };
    if (limit) visit(0); return result;
  };
  try {
    // Check completeness and domain guards, and deduplicate normalized rows. Sparse
    // relations keep the existing row-selection path instead of acquiring false counts.
    let factors: Factor[] = [];
    const guards = new Map<number, Set<string>>();
    for (const v of variables) { spend(1 + domains[v].length); guards.set(v, new Set(domains[v])); }
    for (const set of sets) {
      spend(1 + set.vars.length);
      const scope = [...new Set(set.vars)], seen = new Set<string>(), rows: WeightedRow[] = [];
      for (const binding of set.rows) {
        spend(1 + binding.length);
        const at = new Map(binding);
        if (scope.length !== at.size || scope.some(v => !at.has(v))) throw new Stop("sparse-relation");
        for (const [v, x] of at) {
          spend(1);
          if (!guards.get(v)?.has(x)) throw new Stop("domain-guard");
        }
        const key = JSON.stringify(scope.map(v => at.get(v)));
        if (seen.has(key)) continue;
        allocate(2 + binding.length); seen.add(key); rows.push({ binding, count: 1n, samples: sampleLimit ? [[]] : [] });
      }
      factors.push({ vars: scope, rows });
    }
    const contradictory = factors.some(f => !f.rows.length);
    if (contradictory) factors = [{ vars: [], rows: [] }];
    // The primal graph includes pinned vertices: fill through them still determines the
    // size of a separator. No acyclicity, direction, determinism or physical law is assumed.
    const graph = new Map(variables.map(v => [v, new Set<number>()]));
    for (const f of factors) for (const v of f.vars) for (const w of f.vars) {
      spend(1); if (v !== w) graph.get(v)!.add(w);
    }
    const pending = new Set(contradictory ? [] : hidden), assignment: Array<string | undefined> = Array(domains.length).fill(undefined);
    while (pending.size) {
      let chosen = -1, bestFill = Infinity, bestSize = Infinity;
      for (const v of pending) {
        spend(1); const neighbors = [...graph.get(v)!]; let fill = 0;
        for (let i = 0; i < neighbors.length; i++) for (let j = i + 1; j < neighbors.length; j++) {
          spend(1); if (!graph.get(neighbors[i])!.has(neighbors[j])) fill++;
        }
        const size = neighbors.reduce((n, w) => n + Math.log2(domains[w].length), 0);
        if (fill < bestFill || (fill === bestFill && size < bestSize)) { chosen = v; bestFill = fill; bestSize = size; }
      }
      const separator = [...graph.get(chosen)!];
      stats.separatorWidth = Math.max(stats.separatorWidth, separator.length);
      if (separator.length > (options.maxSeparatorVariables ?? 12)) throw new Stop("separator-cap");
      for (const v of separator) {
        graph.get(v)!.delete(chosen);
        for (const w of separator) { spend(1); if (v !== w) graph.get(v)!.add(w); }
      }
      graph.delete(chosen); pending.delete(chosen);
      spend(factors.length);
      const bucket = factors.filter(f => f.vars.includes(chosen));
      factors = factors.filter(f => !f.vars.includes(chosen));
      const rows = new Map<string, WeightedRow>();
      run(bucket, assignment, picked => {
        spend(1 + bucket.length + separator.length);
        const selected = bucket.map((f, i) => f.rows[picked[i]]);
        const count = selected.reduce((n, r) => n * r.count, 1n);
        const binding: RelationBinding = separator.map(v => [v, assignment[v]!]);
        const key = JSON.stringify(binding.map(([, x]) => x));
        let row = rows.get(key);
        if (!row) { allocate(2 + separator.length); row = { binding, count: 0n, samples: [] }; rows.set(key, row); }
        row.count += count;
        row.samples.push(...samples(selected, [[chosen, assignment[chosen]!]], sampleLimit - row.samples.length));
      });
      stats.messages++; stats.messageRows += rows.size;
      factors.push({ vars: separator, rows: [...rows.values()] });
      // An empty message is a global contradiction, but keep it as a factor so the
      // collector retains every blocked boundary situation and ignores any huge counts.
      if (!rows.size) { factors = [{ vars: [], rows: [] }]; break; }
    }
    const table = new Map<string, ProjectedRow>();
    const valuations = boundary.reduce((n, v) => n * domains[v].length, 1);
    for (let n = 0; n < valuations; n++) {
      spend(1 + boundary.length);
      let rest = n;
      const input = boundary.map(v => { const x = domains[v][rest % domains[v].length]; rest = Math.floor(rest / domains[v].length); return x; });
      boundary.forEach((v, i) => { assignment[v] = input[i]; });
      const row: ProjectedRow = { input, outputs: new Map(), states: [], count: 0 };
      let count = 0n;
      run(factors, assignment, picked => {
        spend(1 + factors.length + observed.length);
        const selected = factors.map((f, i) => f.rows[picked[i]]);
        count += selected.reduce((n, r) => n * r.count, 1n);
        const out = observed.map(v => assignment[v]!); row.outputs.set(JSON.stringify(out), out);
        for (const bindings of samples(selected, [], sampleLimit - row.states.length)) {
          allocate(1 + domains.length);
          const state = assignment.map(x => x!);
          for (const [v, x] of bindings) state[v] = x;
          row.states.push(state);
        }
      });
      if (count > BigInt(Number.MAX_SAFE_INTEGER)) { stats.reason = "count-overflow"; return { status: "overflow" }; }
      row.count = Number(count); table.set(JSON.stringify(input), row);
    }
    stats.applied = true; stats.reason = "complete"; budget.explored += local.explored;
    return { status: "complete", table };
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    stats.reason = error.reason; return { status: "fallback" };
  } finally { stats.states = local.explored; }
}
