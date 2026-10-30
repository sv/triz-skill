/** One relation row binds wire-unified variable numbers to declared values. */
export type PropagationBinding = Array<[number, string]>;
export type PropagationSet = { vars: number[]; rows: PropagationBinding[] };
export const MAX_PROPAGATION_WORK = 1_000_000;
/** How arc consistency ended: `complete` pruned to the fixpoint (or found a table with no row);
 *  `fallback` hit the work limit and pruned nothing. `work` counts the units charged. */
export type PropagationStatus = { status: "complete" | "fallback"; work: number };

/**
 * Generalized arc consistency for finite table constraints, by an AC-3-style worklist. Keep a value
 * only if every incident table has a compatible supporting row. Every table is revised once; after
 * that a table is revised again only when the domain of one of its variables shrank, and a table
 * is not re-queued for the shrinking its own revision caused, which leaves it consistent. This
 * reaches the same fixpoint as rescanning every table until nothing changes, with the same rows
 * kept in their order, without the rescans. It is unary-domain propagation, not a proof that the
 * surviving rows have a joint solution. A repeated variable inside a row is an equality
 * constraint. Omitted variables are wildcards; an empty row accepts all assignments.
 *
 * The separate work limit is all-or-nothing: when exhausted, return the original sets, with no
 * partial pruning. Neither the caller's domains nor its rows are mutated.
 */
export function propagateRows(sets: PropagationSet[], domains: readonly (readonly string[])[], maxWork = MAX_PROPAGATION_WORK):
  { sets: PropagationSet[] } & PropagationStatus {
  let work = 0;
  const spend = (amount = 1) => (work += amount) <= maxWork;
  // Count the expanded copies before touching domain iterators or allocating per-variable sets.
  // Shared carrier arrays can otherwise be copied once per port even for a tiny work budget.
  for (let i = 0; i < domains.length; i++) {
    if (!spend(1 + domains[i].length)) return { sets, status: "fallback", work };
  }
  // Every table requires at least one support map, and an entry per variable in the index of the
  // tables each variable touches; guard this setup before allocating copies.
  for (let i = 0; i < sets.length; i++) {
    if (!spend(1 + sets[i].vars.length)) return { sets, status: "fallback", work };
  }
  const values = domains.map(d => new Set(d));
  const current = sets.map(s => ({ vars: s.vars, rows: s.rows }));
  const touching = domains.map((): number[] => []);
  current.forEach((set, index) => { for (const i of set.vars) touching[i].push(index); });
  // The worklist: every table once, in order, then the tables a shrunk domain touches.
  const queue = current.map((_, index) => index);
  const queued = current.map(() => true);
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    queued[index] = false;
    const set = current[index];
    // Charge each revision before constructing the per-table support map.
    if (!spend(1 + set.vars.length)) return { sets, status: "fallback", work };
    const supported = new Map(set.vars.map(i => [i, new Set<string>()]));
    const keep: PropagationBinding[] = [];
    for (const row of set.rows) {
      if (!spend()) return { sets, status: "fallback", work };
      const binding = new Map<number, string>();
      let valid = true;
      for (const [i, value] of row) {
        if (!spend()) return { sets, status: "fallback", work };
        if (!values[i].has(value) || (binding.has(i) && binding.get(i) !== value)) { valid = false; break; }
        binding.set(i, value);
      }
      if (!valid) continue;
      keep.push(row);
      for (const [i, value] of binding) supported.get(i)!.add(value);
      // A row that omits a declared table variable supports every current value there.
      for (const i of set.vars) {
        if (!spend()) return { sets, status: "fallback", work };
        if (binding.has(i)) continue;
        for (const value of values[i]) {
          if (!spend()) return { sets, status: "fallback", work };
          supported.get(i)!.add(value);
        }
      }
    }
    if (keep.length !== set.rows.length) current[index] = { vars: set.vars, rows: keep };
    // A relation without rows has no solutions; keep the other sets as-is, preserving the join's
    // normal enumeration of empty boundary rows and its cap accounting.
    if (!keep.length) return { sets: current, status: "complete", work };
    for (const [i, support] of supported) {
      let shrunk = false;
      for (const value of values[i]) {
        if (!spend()) return { sets, status: "fallback", work };
        if (!support.has(value)) { values[i].delete(value); shrunk = true; }
      }
      if (!shrunk) continue;
      // Every row this revision kept uses a supported value of i, so only the other tables need it.
      for (const other of touching[i]) {
        if (other === index || queued[other]) continue;
        if (!spend()) return { sets, status: "fallback", work };
        queued[other] = true;
        queue.push(other);
      }
    }
  }
  return { sets: current, status: "complete", work };
}

/** Pairwise semijoins compare every jointly bound value on a table overlap, retaining
 * correlations that unary domains lose. Sparse bindings remain wildcards. A fixed point
 * is not a global-consistency claim for cyclic scopes or wildcard-expanded relations.
 * As with domain propagation, exhaustion discards this entire pass. */
export function semijoinRows(sets: PropagationSet[], maxWork = MAX_PROPAGATION_WORK):
  { sets: PropagationSet[] } & PropagationStatus {
  let work = 0;
  const spend = (amount = 1) => (work += amount) <= maxWork;
  const fallback = () => ({ sets, status: "fallback" as const, work });
  // Preflight before copying rows or building indices. vars must cover every row's bindings,
  // as in propagateRows and the evaluator's full box tables.
  for (const set of sets) {
    if (!spend(1 + set.vars.length)) return fallback();
    for (const row of set.rows) if (!spend(1 + row.length)) return fallback();
  }
  const current = sets.map(set => set.rows.flatMap(row => {
    const values = new Map<number, string>();
    for (const [v, x] of row) {
      if (values.has(v) && values.get(v) !== x) return [];
      values.set(v, x);
    }
    return [{ row, values }];
  }));
  const finish = () => ({
    sets: sets.map((set, i) => ({ vars: set.vars, rows: current[i].map(r => r.row) })),
    status: "complete" as const, work,
  });
  if (current.some(rows => !rows.length)) return finish();
  const touching = new Map<number, number[]>();
  const neighbors = sets.map(() => new Set<number>());
  for (let i = 0; i < sets.length; i++) {
    for (const v of sets[i].vars) {
      if (!spend()) return fallback();
      const prior = touching.get(v) ?? [];
      for (const other of prior) {
        if (!spend()) return fallback();
        if (other === i) continue;
        neighbors[i].add(other); neighbors[other].add(i);
      }
      prior.push(i); touching.set(v, prior);
    }
  }
  const queue: Array<[number, number]> = [], queued = new Set<string>();
  const enqueue = (left: number, right: number) => {
    if (!spend()) return false;
    const key = `${left}:${right}`;
    if (!queued.has(key)) { queued.add(key); queue.push([left, right]); }
    return true;
  };
  for (let i = 0; i < neighbors.length; i++) {
    for (const j of neighbors[i]) if (!enqueue(i, j)) return fallback();
  }
  for (let head = 0; head < queue.length; head++) {
    if (!spend()) return fallback();
    const [left, right] = queue[head];
    queued.delete(`${left}:${right}`);
    const keep: typeof current[number] = [];
    for (const row of current[left]) {
      if (!spend()) return fallback();
      let supported = false;
      for (const other of current[right]) {
        if (!spend()) return fallback();
        let compatible = true;
        for (const [v, x] of row.values) {
          if (!spend()) return fallback();
          if (other.values.has(v) && other.values.get(v) !== x) { compatible = false; break; }
        }
        if (compatible) { supported = true; break; }
      }
      if (supported) keep.push(row);
    }
    if (keep.length === current[left].length) continue;
    current[left] = keep;
    if (!keep.length) return finish();
    for (const other of neighbors[left]) if (!enqueue(other, left)) return fallback();
  }
  return finish();
}
