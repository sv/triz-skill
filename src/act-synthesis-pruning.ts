/** Compile the fixed context into coupled constraints on whole component alternatives.
 * A context trace is enabled exactly when each chosen alternative contains its local row.
 * Unsafe traces are forbidden rectangles; every target pair needs one supporting rectangle.
 * No individual behavior row is deleted from an implementation. Compilation is bounded and
 * discarded on exhaustion; ordinary whole-model validation remains authoritative. */
import type { FunctionModel } from "./act.js";
import { bindRow, deliverablePorts, portVariables, type Binding, type Box } from "./act-behavior.js";
import type { EngineeringBudget } from "./act-contract.js";

export type ChoiceLibrary = { box: string; alternatives: Array<{ id: string; behavior: NonNullable<Box["behavior"]> }> };
type Rectangle = bigint[];
export type ChoiceConstraints = { unsafe: Rectangle[]; coverage: Rectangle[][] };
export const choiceMask = (length: number) => (1n << BigInt(length)) - 1n;
export const choiceIndices = (mask: bigint, length: number) => Array.from({ length }, (_, i) => i).filter(i => (mask & (1n << BigInt(i))) !== 0n);
export const combinationCount = (domains: bigint[]) => domains.reduce((n, mask) => {
  let count = 0n;
  for (; mask; mask &= mask - 1n) count++;
  return n * count;
}, 1n);

export type SynthesisPruningStats = {
  status: "disabled" | "ready" | "fallback";
  reason?: string;
  work: number;
  contextStates: number;
  targetPairs: number;
  unsafeRectangles: number;
  rawUnsafeRectangles: number;
  coverageRectangles: number;
  propagationCalls: number;
  propagationFallbacks: number;
  residualChoiceRemovals: number;
  coverageChoiceRemovals: number;
};
export const pruningStats = (): SynthesisPruningStats => ({ status: "disabled", work: 0, contextStates: 0, targetPairs: 0,
  unsafeRectangles: 0, rawUnsafeRectangles: 0, coverageRectangles: 0, propagationCalls: 0, propagationFallbacks: 0,
  residualChoiceRemovals: 0, coverageChoiceRemovals: 0 });
class Limit extends Error {}
class Unsupported extends Error {}
class Work {
  used = 0;
  constructor(readonly limit: number, readonly budget: EngineeringBudget, readonly stats: SynthesisPruningStats) {}
  spend(amount = 1) {
    if (this.used + amount > this.limit || !this.budget.spend(amount)) throw new Limit();
    this.used += amount; this.stats.work += amount;
  }
}

const endpointKey = (p: { box: string; port: string; carrier: string }) => JSON.stringify([p.box, p.port, p.carrier]);
const localValues = (b: Box, row: NonNullable<Box["behavior"]>[number]) => [
  ...(b.inputs ?? []).map(p => row.in[p.id]), ...(b.outputs ?? []).map(p => row.out[p.id]),
];

/** Exact rectangle union: equal coordinates except one can be coalesced along that
 * coordinate. This never replaces a coupled relation by independent projections. */
function coalesce(rectangles: Rectangle[], width: number, work: Work): Rectangle[] {
  let changed: boolean;
  do {
    changed = false;
    for (let i = 0; i < width; i++) {
      const groups = new Map<string, Rectangle>();
      for (const rectangle of rectangles) {
        work.spend(1 + width);
        const key = rectangle.map((mask, j) => j === i ? "*" : String(mask)).join(",");
        const prior = groups.get(key);
        if (prior) prior[i] |= rectangle[i];
        else groups.set(key, [...rectangle]);
      }
      if (groups.size < rectangles.length) { changed = true; rectangles = [...groups.values()]; }
    }
  } while (changed);
  return rectangles;
}

/** Enumerate relational traces, not the Cartesian product of component alternatives.
 * Every row scan/binding is charged, including failed joins and duplicate projections. */
function network(model: FunctionModel, work: Work) {
  if (model.boxes.some(b => !b.behavior)) throw new Unsupported("missing-behavior");
  work.spend(1 + model.wires.length + model.boxes.reduce((n, b) => n + 1 + (b.inputs?.length ?? 0) + (b.outputs?.length ?? 0), 0));
  const ports = portVariables(model, model.boxes);
  const sets = model.boxes.map(b => {
    const rows = new Map<string, Binding>();
    for (const row of b.behavior!) {
      work.spend(1 + (b.inputs?.length ?? 0) + (b.outputs?.length ?? 0));
      const binding = bindRow(b, row, ports.at);
      rows.set(JSON.stringify(binding), binding);
    }
    return { vars: [...new Set([
      ...(b.inputs ?? []).map(p => ports.at(b.id, "in", p.id)),
      ...(b.outputs ?? []).map(p => ports.at(b.id, "out", p.id)),
    ])], rows: [...rows.values()] };
  });
  const inputs = ports.boundary.map(i => ports.variables[i]);
  const pending = [...sets], ordered: typeof sets = [], bound = new Set<number>();
  while (pending.length) {
    let best = 0, score = -1;
    pending.forEach((set, i) => {
      work.spend(1 + set.vars.length);
      const shared = set.vars.filter(v => bound.has(v)).length;
      if (shared > score || (shared === score && set.rows.length < pending[best].rows.length)) { best = i; score = shared; }
    });
    const [next] = pending.splice(best, 1); ordered.push(next); next.vars.forEach(v => bound.add(v));
  }
  return { ports, inputs, enumerate: (emit: (assignment: string[]) => void) => {
    const assignment: Array<string | undefined> = new Array(ports.variables.length);
    const join = (depth: number) => {
      work.spend();
      if (depth === ordered.length) { emit(assignment as string[]); return; }
      for (const row of ordered[depth].rows) {
        work.spend(1 + row.length);
        const touched: number[] = [];
        let consistent = true;
        for (const [v, x] of row) {
          if (assignment[v] === undefined) { assignment[v] = x; touched.push(v); }
          else if (assignment[v] !== x) { consistent = false; break; }
        }
        if (consistent) join(depth + 1);
        touched.forEach(v => { assignment[v] = undefined; });
      }
    };
    join(0);
  } };
}

export class SynthesisPruner {
  private constructor(readonly unsafe: Rectangle[], readonly coverage: Rectangle[][],
    readonly stats: SynthesisPruningStats, readonly budget: EngineeringBudget, readonly maxWork: number,
    readonly residual: boolean, readonly propagateChoices: boolean) {}

  static compile(model: FunctionModel, target: FunctionModel, holes: ChoiceLibrary[], budget: EngineeringBudget,
    stats: SynthesisPruningStats, maxWork: number, residual: boolean, propagateChoices: boolean): SynthesisPruner | undefined {
    const work = new Work(Math.min(maxWork, Math.floor(budget.remaining / 4)), budget, stats);
    try {
      const byBox = new Map(holes.map(h => [h.box, h]));
      const supports: Array<Map<string, bigint>> = [];
      const union: FunctionModel = { ...model, boxes: model.boxes.map(b => {
        const h = byBox.get(b.id);
        if (!h) return b;
        const rows = new Map<string, NonNullable<Box["behavior"]>[number]>(), support = new Map<string, bigint>();
        for (const [i, a] of h.alternatives.entries()) for (const row of a.behavior) {
          work.spend(1 + (b.inputs?.length ?? 0) + (b.outputs?.length ?? 0));
          const key = JSON.stringify(localValues(b, row));
          rows.set(key, row); support.set(key, (support.get(key) ?? 0n) | (1n << BigInt(i)));
        }
        supports[holes.indexOf(h)] = support;
        const { producible: _producible, ...rest } = b;
        return { ...rest, behavior: [...rows.values()] };
      }) };
      const reference = network(target, work), context = network(union, work);
      const observed = deliverablePorts(target), offered = new Set(deliverablePorts(union).map(endpointKey));
      if (!observed.length || observed.some(p => !offered.has(endpointKey(p)))) throw new Unsupported("different-deliverables");
      if (reference.inputs.length !== context.inputs.length || reference.inputs.some(p => {
        const q = context.inputs.find(q => endpointKey(p) === endpointKey(q));
        if (!q) return true;
        const a = target.carriers.find(c => c.id === p.carrier)!.values!, b = union.carriers.find(c => c.id === q.carrier)!.values!;
        return a.length !== b.length || a.some(v => !b.includes(v));
      })) throw new Unsupported("different-boundary-inputs");
      const cover = new Map<string, Map<string, Rectangle>>();
      reference.enumerate(values => {
        work.spend(1 + reference.inputs.length + observed.length);
        const key = JSON.stringify([
          reference.inputs.map(p => values[reference.ports.at(p.box, "in", p.port)]),
          observed.map(p => values[reference.ports.at(p.box, "in", p.port)]),
        ]);
        if (!cover.has(key)) cover.set(key, new Map());
      });
      if (!cover.size) throw new Unsupported("empty-target-relation");
      stats.targetPairs = cover.size;
      const unsafe = new Map<string, Rectangle>();
      const probes = holes.map(h => {
        const b = model.boxes.find(b => b.id === h.box)!;
        return [...(b.inputs ?? []).map(p => context.ports.at(b.id, "in", p.id)), ...(b.outputs ?? []).map(p => context.ports.at(b.id, "out", p.id))];
      });
      context.enumerate(values => {
        work.spend(1 + probes.reduce((n, p) => n + p.length, 0) + reference.inputs.length + observed.length);
        stats.contextStates++;
        const masks = probes.map((ports, i) => supports[i].get(JSON.stringify(ports.map(v => values[v])))!);
        const signature = masks.join(",");
        const key = JSON.stringify([
          reference.inputs.map(p => values[context.ports.at(p.box, "in", p.port)]),
          observed.map(p => values[context.ports.at(p.box, "in", p.port)]),
        ]);
        const goal = cover.get(key);
        if (goal) { if (propagateChoices) goal.set(signature, masks); }
        else if (residual) unsafe.set(signature, masks);
      });
      stats.rawUnsafeRectangles = unsafe.size;
      const forbidden = coalesce([...unsafe.values()], holes.length, work);
      const required = propagateChoices ? [...cover.values()].map(m => coalesce([...m.values()], holes.length, work)) : [];
      stats.unsafeRectangles = forbidden.length;
      stats.coverageRectangles = required.reduce((n, rows) => n + rows.length, 0);
      stats.status = "ready";
      return new SynthesisPruner(forbidden, required, stats, budget, maxWork, residual, propagateChoices);
    } catch (e) {
      if (!(e instanceof Limit || e instanceof Unsupported)) throw e;
      stats.status = "fallback"; stats.reason = e instanceof Limit ? "compilation-work-cap" : e.message;
      return undefined;
    }
  }

  /** Necessary constraints only. A cap returns the original domains, never partial pruning. */
  filter(original: bigint[], constraints: ChoiceConstraints = this): { domains: bigint[]; constraints: ChoiceConstraints } | undefined {
    if (!constraints.unsafe.length && !constraints.coverage.length) return { domains: original, constraints };
    this.stats.propagationCalls++;
    const work = new Work(Math.min(this.maxWork, Math.floor(this.budget.remaining / 4)), this.budget, this.stats);
    const domains = [...original];
    const priorResidual = this.stats.residualChoiceRemovals, priorCoverage = this.stats.coverageChoiceRemovals;
    const shrink = (i: number, mask: bigint, kind: "residualChoiceRemovals" | "coverageChoiceRemovals") => {
      const next = domains[i] & mask;
      if (next === domains[i]) return false;
      let removed = domains[i] & ~next;
      for (; removed; removed &= removed - 1n) this.stats[kind]++;
      domains[i] = next;
      return true;
    };
    try {
      let unsafe = constraints.unsafe, coverage = constraints.coverage;
      let changed: boolean;
      do {
        changed = false;
        const pendingUnsafe: Rectangle[] = [];
        if (this.residual) for (const masks of unsafe) {
          work.spend(1 + domains.length);
          if (domains.some((d, i) => (d & masks[i]) === 0n)) continue;
          pendingUnsafe.push(masks);
          const escape = domains.flatMap((d, i) => (d & ~masks[i]) !== 0n ? [i] : []);
          if (!escape.length) return undefined;
          if (escape.length === 1) changed = shrink(escape[0], ~masks[escape[0]], "residualChoiceRemovals") || changed;
        }
        unsafe = pendingUnsafe;
        const pendingCoverage: Rectangle[][] = [];
        if (this.propagateChoices) for (const rectangles of coverage) {
          const support = domains.map(() => 0n);
          const viable: Rectangle[] = [];
          let guaranteed = false;
          for (const masks of rectangles) {
            work.spend(1 + 2 * domains.length);
            if (domains.some((d, i) => (d & masks[i]) === 0n)) continue;
            if (domains.every((d, i) => (d & ~masks[i]) === 0n)) { guaranteed = true; break; }
            viable.push(masks);
            masks.forEach((m, i) => { support[i] |= m; });
          }
          if (guaranteed) continue;
          pendingCoverage.push(viable);
          for (let i = 0; i < domains.length; i++) {
            changed = shrink(i, support[i], "coverageChoiceRemovals") || changed;
            if (!domains[i]) return undefined;
          }
        }
        coverage = pendingCoverage;
      } while (changed);
      return { domains, constraints: { unsafe, coverage } };
    } catch (e) {
      if (!(e instanceof Limit)) throw e;
      this.stats.propagationFallbacks++;
      this.stats.residualChoiceRemovals = priorResidual; this.stats.coverageChoiceRemovals = priorCoverage;
      return { domains: original, constraints };
    }
  }
}
