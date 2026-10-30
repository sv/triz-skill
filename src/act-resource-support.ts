/** Ground a selected resource mode from declared boundary supplies and rows with
 * no positive requirements. Balance, extensive allocation and affordability are
 * separate obligations checked by the callers. This does not simulate startup. */
export interface SupportEndpoint { box: string; port: string }
export interface SupportRow {
  box: string;
  row: number;
  demand: Array<[number, number]>;
  provide: Array<[number, number]>;
}
export class ResourceSupportCap extends Error {}

export function resourceSourceSupport(
  ports: SupportEndpoint[],
  rows: SupportRow[],
  charge: () => void,
  initial: Array<[number, number]> = [],
) {
  const available = ports.map(() => 0), active = rows.map(() => false);
  for (const [i, level] of initial) {
    charge();
    available[i] = Math.max(available[i], level);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 0; k < rows.length; k++) {
      charge();
      if (active[k]) continue;
      const row = rows[k];
      if (!row.demand.every(([i, level]) => { charge(); return available[i] >= level; })) continue;
      active[k] = true;
      changed = true;
      for (const [i, level] of row.provide) {
        charge();
        available[i] = Math.max(available[i], level);
      }
    }
  }
  return {
    grounded: active.every(Boolean),
    groundedBoxes: rows.filter((_, i) => active[i]).map(r => r.box),
    unresolved: rows.flatMap((r, k) => active[k] ? [] : [{
      box: r.box,
      row: r.row,
      requirements: r.demand.filter(([i, level]) => available[i] < level)
        .map(([i, level]) => ({ ...ports[i], required: level, groundedProvision: available[i] })),
    }]),
  };
}
