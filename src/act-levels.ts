/**
 * Levels: numeric co-design amounts read as qualitative behaviour values.
 *
 * A carrier that declares `levels` gives some of its declared values a threshold each. An amount
 * (a feasibility row's level at a port) reads as the last level whose `from` it reaches. checkModel
 * requires the first level to start at 0 and the thresholds to increase, so the reading is monotone
 * and a Galois connection: an amount reaches a value's threshold iff it reads as that value or
 * above (theory/: level_monotone, level_gc), and every amount lies in the band of the value it
 * reads as (level_band).
 *
 *  - levelOf            — the value an amount reads as.
 *  - thresholdValues    — a numeric requirement (`at_least`, `below`, at a declared threshold) as
 *                         the set of values that meet it: what triz_weakness's `acceptable` takes
 *                         from the carrier instead of a hand-written list (workflow.md, MPV chain).
 *  - rowsConsistency    — does each feasibility row's amounts fall in the values of a matching
 *                         behaviour row? Used within one model (a box that declares both) and
 *                         across an abstraction map (src/act-abstraction.ts).
 *  - levelsConsistency  — rowsConsistency for every box of a model that declares both.
 *
 * A feasibility row is silent on the ports it omits, so only the ports it names, on carriers with
 * levels, are read. The matching behaviour rows are those whose values on the row's input ports
 * are the values its required amounts read as; the row is consistent when one of them has, on the
 * row's output ports, the values its provided amounts read as. Inconsistencies are reported, not
 * failed closed: they are modelling findings, and either side may be the one to fix.
 */
import type { FunctionModel, FeasibilityRow } from "./act.js";
import type { Theorem } from "./act-basis.js";

type Carrier = FunctionModel["carriers"][number];
type Box = FunctionModel["boxes"][number];
type BehaviorRow = NonNullable<Box["behavior"]>[number];
export type Levels = NonNullable<Carrier["levels"]>;

/** Increasing thresholds from 0: the reading is monotone and a Galois connection. */
export const READING: Theorem[] = ["level_monotone", "level_gc"];
/** An amount lies in the band of the value it reads as. */
export const BAND: Theorem[] = ["level_band"];

/** The value an amount reads as: the last level whose `from` the amount reaches (levels as checkModel accepts them). */
export function levelOf(levels: Levels, amount: number): string {
  let value = levels[0].value;
  for (const l of levels) if (l.from <= amount) value = l.value;
  return value;
}

/** The band of amounts a level reads: from its threshold up to the next one (exclusive), or unbounded. */
export function bandOf(levels: Levels, value: string) {
  const i = levels.findIndex((l) => l.value === value);
  return { from: levels[i].from, ...(i + 1 < levels.length ? { below: levels[i + 1].from } : {}) };
}

export interface Threshold { at_least?: number; below?: number }

/**
 * The values that meet a numeric requirement, read through the carrier's levels. `at_least: x`
 * keeps the values whose whole band is at least x, `below: x` those whose whole band is below x;
 * both together keep a range. Each bound must be a declared threshold, so the value set says
 * exactly what the amount does (level_gc: reaching a threshold is reading as its value or above).
 * A bound inside a band fails closed: declare a level there. An empty set fails closed too.
 */
export function thresholdValues(carrier: Carrier, t: Threshold): { ok: true; values: string[] } | { ok: false; error: string } {
  if (!carrier.levels) return { ok: false, error: `carrier '${carrier.id}' declares no levels, so a numeric threshold cannot be read as values: declare levels or list the values` };
  if (t.at_least === undefined && t.below === undefined) return { ok: false, error: "give at_least, below, or values" };
  const levels = carrier.levels;
  const at = (x: number, field: string) => {
    const i = levels.findIndex((l) => l.from === x);
    if (i >= 0) return i;
    const inside = levels.filter((l) => l.from < x).at(-1)!;
    return `${field} ${x} lies inside the band of '${inside.value}' (from ${inside.from}) of carrier '${carrier.id}': it is not a declared threshold (${levels.map((l) => `'${l.value}' from ${l.from}`).join(", ")}). Declare a level at ${x}`;
  };
  const lo = t.at_least === undefined ? 0 : at(t.at_least, "at_least");
  const hi = t.below === undefined ? levels.length : at(t.below, "below");
  if (typeof lo === "string") return { ok: false, error: lo };
  if (typeof hi === "string") return { ok: false, error: hi };
  const values = levels.slice(lo, hi).map((l) => l.value);
  if (!values.length) return { ok: false, error: `no level of carrier '${carrier.id}' meets ${[t.at_least !== undefined ? `at_least ${t.at_least}` : "", t.below !== undefined ? `below ${t.below}` : ""].filter(Boolean).join(" and ")}: the acceptable set would be empty` };
  return { ok: true, values };
}

/** Where a feasibility port is read: the behaviour port it stands for, and the levels that read its amounts. */
export type Reading = (side: "in" | "out", port: string) => { port: string; levels: Levels } | undefined;

export interface Inconsistency {
  box: string;
  behaviorBox: string;
  row: number;
  kind: "no-behavior-row" | "value-mismatch" | "ambiguous-port";
  inputs: Array<{ port: string; amount: number; value: string }>;
  outputs: Array<{ port: string; amount: number; value: string }>;
  declared?: Array<Record<string, string>>;
  note: string;
}

/**
 * Check each feasibility row of `box` against the behaviour rows of `behaviorBox` (the same box,
 * or its image under an abstraction map). `read` says which behaviour port and which levels read
 * each feasibility port; a port it returns nothing for is not compared.
 */
export function rowsConsistency(spec: { box: string; feasibility: FeasibilityRow[]; behaviorBox: string; behavior: BehaviorRow[]; read: Reading }) {
  const inconsistencies: Inconsistency[] = [];
  let checked = 0, silent = 0;
  spec.feasibility.forEach((row, i) => {
    const readSide = (side: "in" | "out", amounts: Record<string, number> | undefined) =>
      Object.entries(amounts ?? {}).flatMap(([p, amount]) => {
        const r = spec.read(side, p);
        return r ? [{ port: r.port, amount, value: levelOf(r.levels, amount), from: p }] : [];
      });
    const inputs = readSide("in", row.requires), outputs = readSide("out", row.provides);
    if (!inputs.length && !outputs.length) { silent++; return; }
    checked++;
    const strip = (xs: typeof inputs) => xs.map(({ port, amount, value }) => ({ port, amount, value }));
    const base = { box: spec.box, behaviorBox: spec.behaviorBox, row: i, inputs: strip(inputs), outputs: strip(outputs) };
    const clash = [...inputs, ...outputs].find((x, j, all) => all.some((y, k) => k !== j && y.port === x.port && y.value !== x.value && (j < inputs.length) === (k < inputs.length)));
    if (clash) {
      inconsistencies.push({ ...base, kind: "ambiguous-port", note: `feasibility row ${i} of '${spec.box}': several ports read at '${spec.behaviorBox}.${clash.port}' read as different values, but a port has one value` });
      return;
    }
    const matching = spec.behavior.filter((r) => inputs.every((x) => r.in[x.port] === x.value));
    if (!matching.length) {
      inconsistencies.push({ ...base, kind: "no-behavior-row",
        note: `feasibility row ${i} of '${spec.box}' works at ${inputs.map((x) => `${x.port} = ${x.amount} ('${x.value}')`).join(", ")}, but '${spec.behaviorBox}' declares no behaviour row at those input values: its behaviour says they cannot occur` });
      return;
    }
    if (matching.some((r) => outputs.every((x) => r.out[x.port] === x.value))) return;
    inconsistencies.push({ ...base, kind: "value-mismatch",
      declared: matching.map((r) => Object.fromEntries(outputs.map((x) => [x.port, r.out[x.port]]))),
      note: `feasibility row ${i} of '${spec.box}' provides ${outputs.map((x) => `${x.port} = ${x.amount} ('${x.value}')`).join(", ")}${inputs.length ? ` at ${inputs.map((x) => `${x.port} = '${x.value}'`).join(", ")}` : ""}, but the matching behaviour rows of '${spec.behaviorBox}' give ${[...new Set(matching.map((r) => outputs.map((x) => `${x.port} = '${r.out[x.port]}'`).join(", ")))].join(" or ")}` });
  });
  return { box: spec.box, behaviorBox: spec.behaviorBox, rows: spec.feasibility.length, checked, silent, inconsistencies };
}

export interface UnbackedRow {
  box: number;
  row: number;
  /** The producible row's values at the outputs its box's feasibility rows provide, on carriers with levels. */
  outputs: Array<{ port: string; value: string }>;
  /** Per such output, the largest amount a feasibility row provides there, and the value it reads as. */
  most: Array<{ port: string; amount: number; value: string }>;
}

/**
 * Producible rows no feasibility row of the same box reaches (the unbacked-producible-row lint).
 * For every box that declares both `producible` and `feasibility`, each feasibility row is read
 * through the levels of its ports' carriers as levelsConsistency reads it: only the ports it names
 * are read, each amount as the value it reads as. As triz_feasibility reads the rows, monotonically,
 * a feasibility row reaches a producible row when it provides at one of the producible row's
 * outputs, each amount it provides there reads as the producible row's value or above (level_gc:
 * the amount reaches that value's threshold), and each amount it requires reads as the producible
 * row's input value or below. Only values that have a level are compared. A producible row is
 * checked when some feasibility row of its box provides at one of its outputs whose value has a
 * level; the others are silent. A finding never changes a verdict.
 */
export function unbackedProducible(model: FunctionModel): UnbackedRow[] {
  const levels = new Map(model.carriers.flatMap((c) => (c.levels ? [[c.id, c.levels] as const] : [])));
  if (!levels.size) return [];
  const out: UnbackedRow[] = [];
  model.boxes.forEach((b, bi) => {
    if (!b.producible || !b.feasibility) return;
    const feasibility = b.feasibility;
    /** A port's levels, and the rank of `value` in them (-1 when the value has no level). */
    const rankAt = (side: "in" | "out", port: string, value: string) => {
      const carrier = (side === "in" ? b.inputs : b.outputs)?.find((q) => q.id === port)?.carrier;
      const l = carrier === undefined ? undefined : levels.get(carrier);
      return l ? { levels: l, rank: l.findIndex((x) => x.value === value) } : undefined;
    };
    const read = (l: Levels, amount: number) => l.findIndex((x) => x.value === levelOf(l, amount));
    const provided = new Set(feasibility.flatMap((f) => Object.keys(f.provides ?? {})));
    b.producible.forEach((row, ri) => {
      // The row's outputs some feasibility row provides at, whose values have a level.
      const outputs = Object.entries(row.out).flatMap(([port, value]) => {
        const r = provided.has(port) ? rankAt("out", port, value) : undefined;
        return r && r.rank >= 0 ? [{ port, value, ...r }] : [];
      });
      if (!outputs.length) return;
      const reaches = (f: FeasibilityRow) => {
        const named = outputs.filter((o) => f.provides && Object.hasOwn(f.provides, o.port));
        return named.length > 0
          && named.every((o) => read(o.levels, f.provides![o.port]) >= o.rank)
          && Object.entries(f.requires ?? {}).every(([port, amount]) => {
            const r = Object.hasOwn(row.in, port) ? rankAt("in", port, row.in[port]) : undefined;
            return !r || r.rank < 0 || read(r.levels, amount) <= r.rank;
          });
      };
      if (feasibility.some(reaches)) return;
      out.push({
        box: bi, row: ri,
        outputs: outputs.map(({ port, value }) => ({ port, value })),
        most: outputs.map(({ port, levels: l }) => {
          const amount = Math.max(...feasibility.flatMap((f) => (f.provides && Object.hasOwn(f.provides, port) ? [f.provides[port]] : [])));
          return { port, amount, value: levelOf(l, amount) };
        }),
      });
    });
  });
  return out;
}

/**
 * Within one model: for every box that declares both feasibility and behavior, read each
 * feasibility row through the levels of its ports' carriers and check it against the box's own
 * behaviour rows. Undefined when no carrier declares levels or no box declares both.
 */
export function levelsConsistency(model: FunctionModel) {
  const levels = new Map(model.carriers.flatMap((c) => (c.levels ? [[c.id, c.levels] as const] : [])));
  const both = model.boxes.filter((b) => b.feasibility && b.behavior);
  if (!levels.size || !both.length) return undefined;
  const boxes = both.map((b) => {
    const carrierOf = new Map([...(b.inputs ?? []).map((p) => [`in:${p.id}`, p.carrier] as const), ...(b.outputs ?? []).map((p) => [`out:${p.id}`, p.carrier] as const)]);
    return rowsConsistency({
      box: b.id, feasibility: b.feasibility!, behaviorBox: b.id, behavior: b.behavior!,
      read: (side, port) => {
        const l = levels.get(carrierOf.get(`${side}:${port}`)!);
        return l ? { port, levels: l } : undefined;
      },
    });
  });
  const inconsistencies = boxes.flatMap((b) => b.inconsistencies);
  return {
    consistent: !inconsistencies.length,
    carriers: [...levels.keys()],
    boxes: boxes.map(({ inconsistencies: _i, ...rest }) => rest),
    inconsistencies,
    basis: [...READING, ...BAND],
    note: (inconsistencies.length
      ? `${inconsistencies.length} feasibility row(s) read through the carriers' levels disagree with the declared behaviour: fix the rows, the behaviour, or the thresholds.`
      : "Every feasibility row that names a port on a carrier with levels reads as values some behaviour row of the same box declares.")
      + " Only the ports a row names are read; a row is silent on the ports it omits.",
  };
}
