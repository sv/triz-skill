/** Shared finite scoped relations. Variables are typed by the adapter's finite domains;
 * rows are conjunctions, tables are disjunctions, and tables join on variable equality.
 * Sparse rows are wildcards. No physical, probabilistic or cost semantics is inferred. */
export type RelationBinding = Array<[number, string]>;
export type ScopedRelation = { vars: number[]; rows: RelationBinding[] };
export type RelationBudget = { explored: number; max: number; spend?: (amount: number) => void };
export type RelationOptions = { indexed?: boolean; decompose?: boolean; maxIndexCells?: number; smallFirst?: boolean };
export type RelationStats = {
  inputRows: number; rowCandidates: number; indexLookups: number; indexCells: number;
  indexFallbacks: number; factors: number; factorEvaluations: number; factorCacheHits: number;
  outputCombinations: number;
  countOverflow: boolean;
};
type Row = { binding: RelationBinding; original: number };
type Index = { values: Map<string, number[]>; wildcard: number[] };
type Table = { vars: number[]; rows: Row[]; indexes: Map<number, Index> };
export type ProjectedRow = { input: string[]; outputs: Map<string, string[]>; states: string[][]; count: number };

/** A query plan owns immutable normalized rows and bounded, reusable single-column indexes.
 * Indexes select candidates only: every bound value and repeated-variable equality is checked.
 * Original row ids survive for consumers that need provenance. */
export class RelationPlan {
  readonly stats: RelationStats = { inputRows: 0, rowCandidates: 0, indexLookups: 0, indexCells: 0,
    indexFallbacks: 0, factors: 0, factorEvaluations: 0, factorCacheHits: 0, outputCombinations: 0, countOverflow: false };
  private readonly tables: Table[];
  private readonly orders = new Map<string, number[]>();
  private readonly components: number[][];
  constructor(sets: ScopedRelation[], readonly options: RelationOptions = {}, spend?: (amount: number) => void) {
    this.tables = sets.map(set => {
      spend?.(1 + set.vars.length);
      const scope = new Set(set.vars), rows: Row[] = [];
      for (const [original, row] of set.rows.entries()) {
        spend?.(1 + row.length); this.stats.inputRows++;
        const values = new Map<number, string>();
        let valid = true;
        for (const [v, x] of row) {
          scope.add(v);
          if (values.has(v) && values.get(v) !== x) valid = false;
          values.set(v, x);
        }
        if (valid) rows.push({ original, binding: [...values] });
      }
      return { vars: [...scope], rows, indexes: new Map() };
    });
    if (options.decompose === false) {
      this.components = [this.tables.map((_, i) => i)]; this.stats.factors = 1; return;
    }
    const parent = this.tables.map((_, i) => i), owner = new Map<number, number>();
    const find = (i: number): number => {
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
      return i;
    };
    this.tables.forEach((t, i) => {
      for (const v of t.vars) {
        spend?.(1);
        const prior = owner.get(v);
        if (prior !== undefined) parent[find(i)] = find(prior);
        else owner.set(v, i);
      }
    });
    const groups = new Map<number, number[]>();
    this.tables.forEach((_, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(i); });
    this.components = [...groups.values()];
    this.stats.factors = this.components.length;
  }

  private candidates(t: Table, assign: Array<string | undefined>, budget: RelationBudget): number[] | undefined {
    // On tiny relations scanning is cheaper than constructing a hash index. This is only
    // a query-planning choice; all candidates still undergo the same equality checks.
    if (this.options.indexed === false || t.rows.length < 8) return undefined;
    let best: number[] | undefined;
    for (const v of t.vars) {
      const value = assign[v];
      if (value === undefined) continue;
      let index = t.indexes.get(v);
      if (!index) {
        const cells = t.rows.reduce((n, r) => n + 1 + r.binding.length, 0);
        if (this.stats.indexCells + cells > (this.options.maxIndexCells ?? 200_000)) { this.stats.indexFallbacks++; continue; }
        budget.spend?.(cells);
        this.stats.indexCells += cells;
        index = { values: new Map(), wildcard: [] };
        t.rows.forEach((r, i) => {
          const x = r.binding.find(([w]) => w === v)?.[1];
          if (x === undefined) index!.wildcard.push(i);
          else { if (!index!.values.has(x)) index!.values.set(x, []); index!.values.get(x)!.push(i); }
        });
        t.indexes.set(v, index);
      }
      this.stats.indexLookups++; budget.spend?.(1);
      const matches = index.values.get(value) ?? [];
      // Merge in declaration order; do not change first witnesses by putting wildcards last.
      const rows = !index.wildcard.length ? matches : [...matches, ...index.wildcard].sort((a, b) => a - b);
      if (!best || rows.length < best.length) best = rows;
      if (best.length <= 1) break;
    }
    return best;
  }

  /** Enumerate compatible row selections. Returning false from emit stops after a witness;
   * the result is false only on budget exhaustion. Assignments are restored even on stop/cap. */
  enumerate(assign: Array<string | undefined>, emit: (picked: number[]) => void | boolean,
    budget: RelationBudget, ids = this.tables.map((_, i) => i)): boolean {
    const initial = ids.flatMap(i => this.tables[i].vars.filter(v => assign[v] !== undefined));
    const key = JSON.stringify([ids, [...new Set(initial)]]);
    let order = this.orders.get(key);
    if (!order) {
      const pending = [...ids], bound = new Set(initial); order = [];
      while (pending.length) {
        let best = 0, score = -1;
        pending.forEach((id, i) => {
          const n = this.tables[id].vars.filter(v => bound.has(v)).length;
          if (n > score || (n === score && this.options.smallFirst !== false
            && this.tables[id].rows.length < this.tables[pending[best]].rows.length)) { best = i; score = n; }
        });
        const [id] = pending.splice(best, 1); order.push(id);
        this.tables[id].vars.forEach(v => bound.add(v));
      }
      if (this.orders.size < 128) this.orders.set(key, order);
    }
    const picked: number[] = new Array(this.tables.length);
    let capped = false, stopped = false;
    const visit = (depth: number) => {
      if (stopped || capped) return;
      budget.spend?.(1);
      if (++budget.explored > budget.max) { capped = true; return; }
      if (depth === order!.length) { stopped = emit(picked) === false; return; }
      const id = order![depth], table = this.tables[id];
      const indices = this.candidates(table, assign, budget);
      const scan = (i: number) => {
        const row = table.rows[i]; this.stats.rowCandidates++;
        budget.spend?.(1 + row.binding.length);
        const touched: number[] = []; let valid = true;
        for (const [v, x] of row.binding) {
          if (assign[v] === undefined) { assign[v] = x; touched.push(v); }
          else if (assign[v] !== x) { valid = false; break; }
        }
        picked[id] = row.original;
        if (valid) visit(depth + 1);
        touched.forEach(v => { assign[v] = undefined; });
      };
      if (indices) { for (const i of indices) { scan(i); if (stopped || capped) break; } }
      else for (let i = 0; i < table.rows.length && !stopped && !capped; i++) scan(i);
    };
    visit(0); return !capped;
  }

  /** Solve independent factors once each. All factors, including zero-port contradictions,
   * participate. A supplied assignment is a restriction, never a reason to drop a factor. */
  witness(assign: Array<string | undefined>, budget: RelationBudget): boolean | undefined {
    for (const ids of this.components) {
      let found: Array<string | undefined> | undefined;
      if (!this.enumerate(assign, () => { found = [...assign]; return false; }, budget, ids)) return undefined;
      if (!found) return false;
      this.tables.forEach((t, i) => { if (ids.includes(i)) for (const v of t.vars) assign[v] = found![v]; });
    }
    return true;
  }

  /** Exact boundary relation and state counts. Adapters supply domain-valid, complete,
   * deduplicated table rows (sparse row selection is supported by enumerate, not this collector);
   * each factor is enumerated on its own boundary, then outputs/counts/samples are combined.
   * Output Cartesian products remain bounded; internal products are never materialized. */
  project(domains: string[][], boundary: number[], observed: number[], samples: number,
    budget: RelationBudget): Map<string, ProjectedRow> | undefined {
    const covered = new Set([...boundary, ...this.tables.flatMap(t => t.vars)]);
    const free = domains.flatMap((values, v) => covered.has(v) ? []
      : [{ vars: [v], rows: values.map(x => [[v, x] as [number, string]]) }]);
    if (free.length) {
      // Isolated internal variables still range over their domains and contribute states.
      const complete = new RelationPlan([...this.tables.map(t => ({ vars: t.vars, rows: t.rows.map(r => r.binding) })), ...free], this.options);
      const result = complete.project(domains, boundary, observed, samples, budget);
      Object.assign(this.stats, complete.stats); return result;
    }
    const assignment: Array<string | undefined> = Array(domains.length).fill(undefined);
    const valuations = boundary.reduce((n, v) => n * domains[v].length, 1);
    if (this.components.length <= 1) {
      // Connected queries need no factor cache or Cartesian reconstruction. Keep their
      // ordinary streaming collector, using the same indexed join as decomposed queries.
      const table = new Map<string, ProjectedRow>();
      for (let n = 0; n < valuations; n++) {
        let rest = n;
        const input = boundary.map(v => { const x = domains[v][rest % domains[v].length]; rest = Math.floor(rest / domains[v].length); return x; });
        boundary.forEach((v, i) => { assignment[v] = input[i]; });
        const row: ProjectedRow = { input, outputs: new Map(), states: [], count: 0 };
        if (!this.enumerate(assignment, () => {
          const out = observed.map(v => assignment[v]!);
          row.outputs.set(JSON.stringify(out), out);
          if (row.states.length < samples) row.states.push(assignment.map(x => x!));
          row.count++;
        }, budget)) return undefined;
        this.stats.factorEvaluations++; this.stats.outputCombinations += row.outputs.size;
        table.set(JSON.stringify(input), row);
      }
      return table;
    }
    const factors = this.components.map(ids => {
      const vars = [...new Set(ids.flatMap(i => this.tables[i].vars))];
      return { ids, vars, inputs: boundary.filter(v => vars.includes(v)),
        outputs: observed.flatMap((v, i) => vars.includes(v) ? [i] : []), cache: new Map<string, ProjectedRow>() };
    });
    const table = new Map<string, ProjectedRow>();
    for (let n = 0; n < valuations; n++) {
      let rest = n;
      const input = boundary.map(v => { const x = domains[v][rest % domains[v].length]; rest = Math.floor(rest / domains[v].length); return x; });
      boundary.forEach((v, i) => { assignment[v] = input[i]; });
      const row: ProjectedRow = { input, outputs: new Map(), states: [], count: 1 };
      const parts: Array<{ factor: typeof factors[number]; row: ProjectedRow }> = [];
      for (const factor of factors) {
        const key = JSON.stringify(factor.inputs.map(v => assignment[v]));
        let part = factor.cache.get(key);
        if (part) this.stats.factorCacheHits++;
        else {
          this.stats.factorEvaluations++;
          part = { input: [], outputs: new Map(), states: [], count: 0 };
          if (!this.enumerate(assignment, () => {
            const out = factor.outputs.map(i => assignment[observed[i]]!);
            part!.outputs.set(JSON.stringify(out), out);
            if (part!.states.length < samples) part!.states.push(factor.vars.map(v => assignment[v]!));
            part!.count++;
          }, budget, factor.ids)) return undefined;
          // A bounded number of projected rows is retained; the global state allowance also
          // bounds local solutions. Do not cache unbounded lists of complete valuations.
          factor.cache.set(key, part);
        }
        row.count *= part.count;
        if (!Number.isSafeInteger(row.count)) { this.stats.countOverflow = true; return undefined; }
        parts.push({ factor, row: part });
        if (!part.count) break;
      }
      table.set(JSON.stringify(input), row);
      if (!row.count) continue;
      const output = observed.map(v => assignment[v]!);
      const combine = (i: number) => {
        if (i === parts.length) {
          if (parts.length > 1 && ++budget.explored > budget.max) return false;
          this.stats.outputCombinations++; row.outputs.set(JSON.stringify(output), [...output]); return true;
        }
        const { factor, row: part } = parts[i];
        for (const values of part.outputs.values()) {
          factor.outputs.forEach((pos, j) => { output[pos] = values[j]; });
          if (!combine(i + 1)) return false;
        }
        return true;
      };
      if (!combine(0)) return undefined;
      const sample = (i: number) => {
        if (row.states.length >= samples) return;
        if (i === parts.length) { row.states.push(assignment.map(x => x!)); return; }
        const { factor, row: part } = parts[i];
        for (const state of part.states) {
          factor.vars.forEach((v, j) => { assignment[v] = state[j]; }); sample(i + 1);
          if (row.states.length >= samples) break;
        }
      };
      sample(0);
      // Samples are observations, not restrictions on the next factor evaluation.
      assignment.fill(undefined);
    }
    return table;
  }
}
