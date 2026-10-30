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
