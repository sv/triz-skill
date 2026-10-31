/** Exact tuple buckets shared by joins and semijoins. Missing values are wildcards;
 * they remain candidates and must still be checked by the caller. Keys encode whole
 * tuples, so punctuation, empty strings and prototype names have no special meaning. */
export class RelationTupleIndex {
  private readonly buckets = new Map<string, number[]>();
  private readonly wildcard: number[] = [];
  get complete(): boolean { return this.wildcard.length === 0; }

  constructor(readonly vars: readonly number[], rows: readonly ReadonlyMap<number, string>[],
    spend?: (amount: number) => void) {
    for (let i = 0; i < rows.length; i++) {
      spend?.(1 + vars.length);
      const tuple = vars.map(v => rows[i].get(v));
      if (tuple.some(x => x === undefined)) this.wildcard.push(i);
      else {
        const key = JSON.stringify(tuple), bucket = this.buckets.get(key);
        if (bucket) bucket.push(i); else this.buckets.set(key, [i]);
      }
    }
  }

  /** Undefined means a partial query cannot use this index, not that it has no support. */
  candidates(value: (v: number) => string | undefined): readonly number[] | undefined {
    const tuple = this.vars.map(value);
    if (tuple.some(x => x === undefined)) return undefined;
    const matches = this.buckets.get(JSON.stringify(tuple)) ?? [];
    if (!this.wildcard.length) return matches;
    // Merge sorted row ids without changing first witnesses or moving wildcard rows last.
    const merged: number[] = [];
    let i = 0, j = 0;
    while (i < matches.length || j < this.wildcard.length) {
      if (j === this.wildcard.length || (i < matches.length && matches[i] < this.wildcard[j])) merged.push(matches[i++]);
      else merged.push(this.wildcard[j++]);
    }
    return merged;
  }
}
