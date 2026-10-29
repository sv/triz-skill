/**
 * Seeded generator of well-typed function models and of relabellings, for property tests.
 * No dependency: mulberry32 for randomness, ids drawn from an alphabet that includes the
 * characters exports and keys must survive (: . | " < > { } \ and space). Costs and weights are
 * integers so sums do not depend on summation order.
 */
import type { FunctionModel, PhysicalContradiction } from "../../src/act.js";

export type Rng = () => number;

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export function shuffle<T>(r: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const ALPHABET = "abcxyz:.|\"<>{}\\ -_é";
/**
 * Fresh ids: random tricky prefix plus a counter, so a family never repeats an id. The first two
 * ids of a family are sometimes Object.prototype names, which plain-object lookups get wrong.
 */
export function ids(r: Rng, tag: string) {
  let n = 0;
  return () => {
    const i = n++;
    if (i < 2 && r() < 0.25) return ["constructor", "__proto__"][i];
    return `${Array.from({ length: int(r, 1, 4) }, () => pick(r, [...ALPHABET])).join("")}${tag}${i}`;
  };
}

const ROLES = ["tool", "product", "mediator", "environment", "supersystem"] as const;
const POLARITIES = ["useful", "insufficient", "excessive", "harmful"] as const;
const LAYERS = ["material", "energy", "information", "financial", "legal", "temporal"] as const;
const DOMAINS = ["physical", "software", "business", "cyber-physical"] as const;
const DIMS = ["usd", "ms", "constructor"];

type Box = FunctionModel["boxes"][number];

/** A random model that passes checkModel. */
export function genModel(r: Rng, opts: { contradictions?: boolean } = {}): FunctionModel {
  const cid = ids(r, "c"), bid = ids(r, "b"), pid = ids(r, "p"), wid = ids(r, "w");
  const carriers = Array.from({ length: int(r, 1, 3) }, () => ({ id: cid(), layer: pick(r, LAYERS), dimension: "unit" }));
  const boxes: Box[] = Array.from({ length: int(r, 2, 6) }, (_, i) => {
    const port = () => ({ id: pid(), carrier: pick(r, carriers).id });
    const inputs = Array.from({ length: int(r, 0, 3) }, port), outputs = Array.from({ length: int(r, 0, 3) }, port);
    const cost = Object.fromEntries(DIMS.filter(() => r() < 0.4).map((d) => [d, int(r, 0, 9)]));
    return {
      id: bid(), name: `box ${i}`, role: i === 0 ? "product" : pick(r, ROLES),
      ...(inputs.length ? { inputs } : {}), ...(outputs.length ? { outputs } : {}),
      ...(Object.keys(cost).length ? { cost } : {}),
    };
  });
  const outs = boxes.flatMap((b) => (b.outputs ?? []).map((p) => ({ box: b.id, port: p.id, carrier: p.carrier })));
  const ins = boxes.flatMap((b) => (b.inputs ?? []).map((p) => ({ box: b.id, port: p.id, carrier: p.carrier })));
  const wires: FunctionModel["wires"] = [];
  for (let k = int(r, 0, 9); k > 0 && outs.length; k--) {
    const from = pick(r, outs);
    const targets = ins.filter((p) => p.carrier === from.carrier);
    if (!targets.length) continue;
    const to = pick(r, targets);
    wires.push({ id: wid(), from: { box: from.box, port: from.port }, to: { box: to.box, port: to.port }, carrier: from.carrier, polarity: pick(r, POLARITIES), verb: "act on" });
  }
  const used = [...new Set(boxes.flatMap((b) => Object.keys(b.cost ?? {})))];
  const model: FunctionModel = { domain: pick(r, DOMAINS), system: "generated", carriers, boxes, wires };
  if (r() < 0.5) model.budget = Object.fromEntries(used.filter(() => r() < 0.7).map((d) => [d, int(r, 0, 20)]));
  if (r() < 0.5) model.weights = Object.fromEntries([...used, "harmful"].map((d) => [d, int(r, 1, 3)]));
  if (opts.contradictions ?? r() < 0.5) model.contradictions = [genContradiction(r)];
  return model;
}

export function genContradiction(r: Rng): PhysicalContradiction {
  const did = ids(r, "d"), vid = ids(r, "v"), xid = ids(r, "x");
  const values = Array.from({ length: 3 }, vid);
  const axes = ["time", "space"] as const;
  const cells = Object.fromEntries(axes.map((a) => [a, Array.from({ length: int(r, 2, 3) }, xid)])) as Record<"time" | "space", string[]>;
  return {
    id: "pc", parameter: "p",
    axes: cells,
    demands: Array.from({ length: int(r, 2, 4) }, () => ({
      id: did(),
      values: r() < 0.6 ? [pick(r, values)] : shuffle(r, values).slice(0, 2),
      ...Object.fromEntries(axes.filter(() => r() < 0.7).map((a) => [a, cells[a].filter(() => r() < 0.5).concat(pick(r, cells[a])).filter((v, i, xs) => xs.indexOf(v) === i)])),
    })),
  };
}

/** Bijections applied by relabel, and their inverses for mapping verdicts back. */
export interface Maps {
  box: Map<string, string>; wire: Map<string, string>; carrier: Map<string, string>; dim: Map<string, string>;
  port: Map<string, Map<string, string>>;
  demand: Map<string, string>; value: Map<string, string>; cell: Map<string, string>;
}
export const invert = (m: Map<string, string>) => new Map([...m].map(([k, v]) => [v, k]));

/**
 * Rename every id (boxes, ports, wires, carriers, cost dimensions, demands, values, cells), change
 * every label (domain, system, names, verbs, layers, dimensions), and permute every array. Roles,
 * polarities, and numbers are shape and stay.
 */
export function relabel(r: Rng, m: FunctionModel): { model: FunctionModel; maps: Maps } {
  const fresh = (tag: string) => { const next = ids(r, tag); return (xs: string[]) => new Map(xs.map((x) => [x, next()])); };
  const box = fresh("B")(m.boxes.map((b) => b.id)), wire = fresh("W")(m.wires.map((w) => w.id)), carrier = fresh("C")(m.carriers.map((c) => c.id));
  const dimIds = [...new Set([...m.boxes.flatMap((b) => Object.keys(b.cost ?? {})), ...Object.keys(m.budget ?? {}), ...Object.keys(m.weights ?? {}).filter((k) => k !== "harmful")])];
  const dim = fresh("D")(dimIds);
  const portIds = fresh("P");
  const port = new Map(m.boxes.map((b) => [b.id, portIds([...(b.inputs ?? []), ...(b.outputs ?? [])].map((p) => p.id))]));
  const pcs = m.contradictions ?? [];
  const demand = fresh("E")(pcs.flatMap((pc) => pc.demands.map((d) => d.id)));
  const value = fresh("V")([...new Set(pcs.flatMap((pc) => pc.demands.flatMap((d) => d.values)))]);
  const cell = fresh("X")([...new Set(pcs.flatMap((pc) => [...Object.values(pc.axes ?? {}).flat(), ...pc.demands.flatMap((d) => [d.space ?? [], d.time ?? [], d.condition ?? [], d.direction ?? [], d.level ?? []].flat())]))]);
  const rec = (o: Record<string, number> | undefined) => o && Object.fromEntries(shuffle(r, Object.entries(o)).map(([k, v]) => [k === "harmful" ? k : dim.get(k)!, v]));
  const end = (e: { box: string; port: string }) => ({ box: box.get(e.box)!, port: port.get(e.box)!.get(e.port)! });
  const cells = (xs: string[] | undefined) => xs && shuffle(r, xs.map((x) => cell.get(x)!));
  const model: FunctionModel = {
    domain: pick(r, DOMAINS.filter((d) => d !== m.domain)),
    system: "relabelled",
    carriers: shuffle(r, m.carriers.map((c) => ({ id: carrier.get(c.id)!, layer: pick(r, LAYERS), dimension: "other unit" }))),
    boxes: shuffle(r, m.boxes.map((b) => {
      const ports = (ps: typeof b.inputs) => ps && shuffle(r, ps.map((p) => ({ id: port.get(b.id)!.get(p.id)!, carrier: carrier.get(p.carrier)!, label: "relabelled" })));
      return {
        id: box.get(b.id)!, name: `renamed ${box.get(b.id)}`, role: b.role, action: "act",
        ...(b.inputs ? { inputs: ports(b.inputs) } : {}),
        ...(b.outputs ? { outputs: ports(b.outputs) } : {}),
        ...(b.cost ? { cost: rec(b.cost) } : {}),
      };
    })),
    wires: shuffle(r, m.wires.map((w) => ({ id: wire.get(w.id)!, from: end(w.from), to: end(w.to), carrier: carrier.get(w.carrier)!, polarity: w.polarity, verb: "relabelled verb" }))),
    ...(m.budget ? { budget: rec(m.budget) } : {}),
    ...(m.weights ? { weights: rec(m.weights) } : {}),
    ...(m.contradictions ? {
      contradictions: m.contradictions.map((pc) => ({
        id: pc.id, parameter: "renamed parameter",
        ...(pc.axes ? { axes: Object.fromEntries(Object.entries(pc.axes).map(([a, xs]) => [a, cells(xs)])) } : {}),
        demands: shuffle(r, pc.demands.map((d) => ({
          id: demand.get(d.id)!,
          values: shuffle(r, d.values.map((v) => value.get(v)!)),
          ...Object.fromEntries((["space", "time", "condition", "direction", "level"] as const).filter((a) => d[a]).map((a) => [a, cells(d[a])])),
        }))),
      })),
    } : {}),
  };
  return { model, maps: { box, wire, carrier, dim, port, demand, value, cell } };
}
