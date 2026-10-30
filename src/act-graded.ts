/** A finite set-cover problem. Each row is paid for once, even if it covers several pairs. */
export type CostedCoverRow<T> = { row: T; cost: number; covers: number[] };
export type CoverResult<T> =
  | { status: "optimal"; cost: number; rows: T[]; searched: number }
  | { status: "undecided"; reason: "search-cap" | "cost-overflow"; searched: number }
  | { status: "uncoverable"; searched: number };

/** Exhaustive search with a hard node cap. No optimum is reported until every branch is decided. */
export function cheapestCover<T>(pairCount: number, rows: CostedCoverRow<T>[], cap = 100_000): CoverResult<T> {
  if (!Number.isSafeInteger(pairCount) || pairCount < 0 || !Number.isSafeInteger(cap) || cap < 1 || rows.some(r => !Number.isSafeInteger(r.cost) || r.cost < 0 || r.covers.some(i => !Number.isSafeInteger(i) || i < 0 || i >= pairCount))) throw new Error("invalid cover problem");
  let searched = 0, capped = false, overflow = false;
  let best: { cost: number; rows: T[] } | undefined;
  const counts = Array<number>(pairCount).fill(0), chosen: T[] = [];
  // Explicit frames avoid overflowing the JS call stack on many candidate rows.
  const frames: Array<{ index: number; cost: number; phase: 0 | 1 | 2; covered?: number[] }> = [{ index: 0, cost: 0, phase: 0 }];
  while (frames.length && !capped && !overflow) {
    const frame = frames[frames.length - 1];
    if (frame.phase === 0) {
      if (searched >= cap) { capped = true; break; }
      searched++;
      if ((best && frame.cost >= best.cost) || frame.index === rows.length || counts.every(n => n > 0)) {
        if ((!best || frame.cost < best.cost) && counts.every(n => n > 0)) best = { cost: frame.cost, rows: [...chosen] };
        frames.pop();
        continue;
      }
      frame.phase = 1;
      frames.push({ index: frame.index + 1, cost: frame.cost, phase: 0 });
    } else if (frame.phase === 1) {
      const r = rows[frame.index], next = frame.cost + r.cost;
      if (!Number.isSafeInteger(next)) { overflow = true; break; }
      frame.covered = [...new Set(r.covers)];
      frame.covered.forEach(i => counts[i]++);
      chosen.push(r.row);
      frame.phase = 2;
      frames.push({ index: frame.index + 1, cost: next, phase: 0 });
    } else {
      chosen.pop(); frame.covered!.forEach(i => counts[i]--);
      frames.pop();
    }
  }
  if (capped) return { status: "undecided", reason: "search-cap", searched };
  if (overflow) return { status: "undecided", reason: "cost-overflow", searched };
  return best ? { status: "optimal", ...best, searched } : { status: "uncoverable", searched };
}
