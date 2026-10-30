/** One relation row binds wire-unified variable numbers to declared values. */
export type PropagationBinding = Array<[number, string]>;
export type PropagationSet = { vars: number[]; rows: PropagationBinding[] };
export const MAX_PROPAGATION_WORK = 1_000_000;

/**
 * Generalized arc consistency for finite table constraints. Keep a value only if every incident
 * table has a compatible supporting row; repeat after deletions. This is unary-domain propagation,
 * not a proof that the surviving rows have a joint solution. A repeated variable inside a row is
 * an equality constraint. Omitted variables are wildcards; an empty row accepts all assignments.
 *
 * The separate work limit is all-or-nothing: when exhausted, return the original sets, with no
 * partial pruning. Neither the caller's domains nor its rows are mutated.
 */
export function propagateRows(sets: PropagationSet[], domains: readonly (readonly string[])[], maxWork = MAX_PROPAGATION_WORK):
  { sets: PropagationSet[]; status: "complete" | "fallback"; work: number } {
  let work = 0;
  const spend = (amount = 1) => (work += amount) <= maxWork;
  // Count the expanded copies before touching domain iterators or allocating per-variable sets.
  // Shared carrier arrays can otherwise be copied once per port even for a tiny work budget.
  for (let i = 0; i < domains.length; i++) {
    if (!spend(1 + domains[i].length)) return { sets, status: "fallback", work };
  }
  // Every table requires at least one support map; guard this setup before allocating copies.
  for (let i = 0; i < sets.length; i++) {
    if (!spend(1 + sets[i].vars.length)) return { sets, status: "fallback", work };
  }
  const values = domains.map(d => new Set(d));
  let current = sets.map(s => ({ vars: s.vars, rows: s.rows }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < current.length; index++) {
      const set = current[index];
      // Charge repeated fixed-point passes before constructing the per-table support map.
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
      if (keep.length !== set.rows.length) { changed = true; current[index] = { vars: set.vars, rows: keep }; }
      // A relation without rows has no solutions; keep the other sets as-is, preserving the join's
      // normal enumeration of empty boundary rows and its cap accounting.
      if (!keep.length) return { sets: current, status: "complete", work };
      for (const [i, support] of supported) {
        for (const value of values[i]) {
          if (!spend()) return { sets, status: "fallback", work };
          if (!support.has(value)) { values[i].delete(value); changed = true; }
        }
      }
    }
  }
  return { sets: current, status: "complete", work };
}
