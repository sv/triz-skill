/**
 * Structural isomorphism of function models: same wiring shape, whatever the ids and labels.
 *
 * Shape is what the kernel's verdicts read: box roles, port sides and which ports share a
 * carrier, wire endpoints and polarity, and cost/budget/weight values per cost dimension. Labels
 * are ignored: every id, names, actions, verbs, port labels, carrier layer and dimension, the
 * model's domain and system. Embedded contradictions are not part of the shape compared here.
 *
 *  - checkIsomorphism — verifies a given mapping in polynomial time.
 *  - findIsomorphism  — searches for one by colour refinement with individualization and
 *                       backtracking, bounded by a step budget. Every mapping it returns has
 *                       passed checkIsomorphism; when the budget runs out it answers
 *                       `decided: false`, never "not isomorphic".
 */
import { checkModel, type FunctionModel } from "./act.js";
import { dimensionKey, sameDimension } from "./act-dimensions.js";
import type { Theorem } from "./act-basis.js";

export interface ModelMapping {
  boxes: Record<string, string>;
  /** Per source box: source port id → target port id (on the image box). */
  ports: Record<string, Record<string, string>>;
  wires: Record<string, string>;
  carriers: Record<string, string>;
  /** Cost dimension → cost dimension (budget and weight keys included, except 'harmful'). */
  dims: Record<string, string>;
}

/** Own-property lookups: ids and dimension names are user data, so inherited keys never count. */
const own = (r: Record<string, unknown> | undefined, k: string) => r !== undefined && Object.hasOwn(r, k);
const val = (r: Record<string, number> | undefined, k: string) => (own(r, k) ? r![k] : null);
const dimsOf = (m: FunctionModel) => [...new Set([
  ...m.boxes.flatMap((b) => Object.keys(b.cost ?? {})),
  ...Object.keys(m.budget ?? {}),
  ...Object.keys(m.weights ?? {}).filter((k) => k !== "harmful"),
])].sort();

/** Bijection check for one id family; returns errors. */
function bijection(name: string, map: Record<string, string> | undefined, from: string[], to: string[]): string[] {
  const errors: string[] = [];
  const m = map ?? {};
  const target = new Set(to), hit = new Set<string>();
  for (const x of from) {
    if (!own(m, x)) { errors.push(`${name}: '${x}' is not mapped`); continue; }
    const y = m[x];
    if (!target.has(y)) errors.push(`${name}: '${x}' maps to unknown '${y}'`);
    else if (hit.has(y)) errors.push(`${name}: '${y}' is the image of two ${name}`);
    hit.add(y);
  }
  for (const x of Object.keys(m)) if (!from.includes(x)) errors.push(`${name}: '${x}' is not in the source model`);
  if (from.length !== to.length) errors.push(`${name}: ${from.length} in the source model, ${to.length} in the target`);
  return errors;
}

/** Verify that `map` is a shape-preserving bijection from model `a` to model `b`. */
export function checkIsomorphism(a: FunctionModel, b: FunctionModel, map: ModelMapping): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const boxesB = new Map(b.boxes.map((x) => [x.id, x]));
  const dimsA = dimsOf(a), dimsB = dimsOf(b);
  errors.push(
    ...bijection("boxes", map.boxes, a.boxes.map((x) => x.id), b.boxes.map((x) => x.id)),
    ...bijection("wires", map.wires, a.wires.map((x) => x.id), b.wires.map((x) => x.id)),
    ...bijection("carriers", map.carriers, a.carriers.map((x) => x.id), b.carriers.map((x) => x.id)),
    ...bijection("dims", map.dims, dimsA, dimsB),
  );
  if (errors.length) return { ok: false, errors };
  for (const c of a.carriers) {
    const d = b.carriers.find(d => d.id === map.carriers[c.id])!;
    if (!sameDimension(c.si, d.si)) errors.push(`carrier dimension-mismatch: ${c.id}`);
  }
  const dim = (d: string) => map.dims[d];
  for (const x of a.boxes) {
    const y = boxesB.get(map.boxes[x.id])!;
    if (x.role !== y.role) errors.push(`box '${x.id}' (${x.role}) maps to '${y.id}' (${y.role})`);
    for (const d of dimsA) {
      const u = val(x.cost, d), v = val(y.cost, dim(d));
      if (u !== v) errors.push(`box '${x.id}' cost '${d}' ${u} ≠ '${y.id}' cost '${dim(d)}' ${v}`);
    }
    const portsA = [...(x.inputs ?? []).map((p) => ({ ...p, side: "in" })), ...(x.outputs ?? []).map((p) => ({ ...p, side: "out" }))];
    const portsB = new Map([...(y.inputs ?? []).map((p) => ({ ...p, side: "in" })), ...(y.outputs ?? []).map((p) => ({ ...p, side: "out" }))].map((p) => [p.id, p]));
    const pm = map.ports?.[x.id];
    const portErrors = bijection(`ports of '${x.id}'`, pm, portsA.map((p) => p.id), [...portsB.keys()]);
    errors.push(...portErrors);
    if (portErrors.length) continue;
    for (const p of portsA) {
      const q = portsB.get(pm![p.id])!;
      if (p.side !== q.side) errors.push(`port '${x.id}.${p.id}' (${p.side}) maps to '${y.id}.${q.id}' (${q.side})`);
      if (map.carriers[p.carrier] !== q.carrier) errors.push(`port '${x.id}.${p.id}' carrier '${p.carrier}' does not map to '${q.carrier}'`);
    }
  }
  if (errors.length) return { ok: false, errors };
  const wiresB = new Map(b.wires.map((w) => [w.id, w]));
  for (const w of a.wires) {
    const v = wiresB.get(map.wires[w.id])!;
    const end = (e: { box: string; port: string }) => JSON.stringify([map.boxes[e.box], map.ports[e.box][e.port]]);
    if (end(w.from) !== JSON.stringify([v.from.box, v.from.port])) errors.push(`wire '${w.id}' source does not map to wire '${v.id}' source`);
    if (end(w.to) !== JSON.stringify([v.to.box, v.to.port])) errors.push(`wire '${w.id}' target does not map to wire '${v.id}' target`);
    if (map.carriers[w.carrier] !== v.carrier) errors.push(`wire '${w.id}' carrier does not map to wire '${v.id}' carrier`);
    if (w.polarity !== v.polarity) errors.push(`wire '${w.id}' (${w.polarity}) maps to '${v.id}' (${v.polarity})`);
  }
  for (const d of dimsA) {
    if (val(a.budget, d) !== val(b.budget, dim(d))) errors.push(`budget '${d}' does not match budget '${dim(d)}'`);
    if (val(a.weights, d) !== val(b.weights, dim(d))) errors.push(`weight '${d}' does not match weight '${dim(d)}'`);
  }
  if (val(a.weights, "harmful") !== val(b.weights, "harmful")) errors.push("weight 'harmful' differs");
  return { ok: errors.length === 0, errors };
}

/** Coloured, edge-labelled incidence graph of a model's shape. */
interface Incidence {
  colour: string[];
  out: Array<Array<[string, number]>>;
  inc: Array<Array<[string, number]>>;
  /** Node index → [family, id, (box for ports)] for reading a mapping back. */
  ref: Array<{ kind: "box" | "port" | "wire" | "carrier" | "dim"; id: string; box?: string }>;
}

function incidence(m: FunctionModel): Incidence {
  const g: Incidence = { colour: [], out: [], inc: [], ref: [] };
  const node = (colour: string, ref: Incidence["ref"][number]) => { g.colour.push(colour); g.out.push([]); g.inc.push([]); g.ref.push(ref); return g.colour.length - 1; };
  const edge = (x: number, label: string, y: number) => { g.out[x].push([label, y]); g.inc[y].push([label, x]); };
  const carrier = new Map(m.carriers.map((c) => [c.id, node(`carrier si=${dimensionKey(c.si)}`, { kind: "carrier", id: c.id })]));
  const dim = new Map(dimsOf(m).map((d) => [d, node(`dim budget=${val(m.budget, d) ?? "-"} weight=${val(m.weights, d) ?? "-"}`, { kind: "dim", id: d })]));
  const port = new Map<string, number>();
  for (const b of m.boxes) {
    const x = node(`box ${b.role}`, { kind: "box", id: b.id });
    for (const [d, v] of Object.entries(b.cost ?? {})) edge(x, `cost=${v}`, dim.get(d)!);
    for (const [side, ports] of [["in", b.inputs ?? []], ["out", b.outputs ?? []]] as const) {
      for (const p of ports) {
        const y = node(`port ${side}`, { kind: "port", id: p.id, box: b.id });
        port.set(JSON.stringify([b.id, side, p.id]), y);
        edge(x, "has", y);
        edge(y, "carries", carrier.get(p.carrier)!);
      }
    }
  }
  for (const w of m.wires) {
    const x = node(`wire ${w.polarity}`, { kind: "wire", id: w.id });
    edge(x, "from", port.get(JSON.stringify([w.from.box, "out", w.from.port]))!);
    edge(x, "to", port.get(JSON.stringify([w.to.box, "in", w.to.port]))!);
  }
  return g;
}

/** Thrown when a bounded search runs out of steps; callers answer `decided: false`. */
export class Budget extends Error {}

/** Colour refinement to a stable partition over the disjoint union; colours renumbered canonically. */
function refine(g: Incidence, colours: number[]): number[] {
  let current = colours;
  for (;;) {
    const sig = current.map((c, v) => {
      const out = g.out[v].map(([l, y]) => `${l}>${current[y]}`).sort();
      const inc = g.inc[v].map(([l, y]) => `${l}<${current[y]}`).sort();
      return `${c}|${out.join(",")}|${inc.join(",")}`;
    });
    const ids = new Map([...new Set(sig)].sort().map((s, i) => [s, i]));
    const next = sig.map((s) => ids.get(s)!);
    if (new Set(next).size === new Set(current).size) return next;
    current = next;
  }
}

/** Search for a shape-preserving bijection a → b within `budget` individualization steps. */
export function findIsomorphism(a: FunctionModel, b: FunctionModel, budget = 10_000, options: { accept?: (mapping: ModelMapping, charge: () => void) => boolean } = {}) {
  const ca = checkModel(a), cb = checkModel(b);
  if (!ca.ok || !cb.ok) return { ok: false as const, errors: [...ca.errors.map((e) => `a: ${e}`), ...cb.errors.map((e) => `b: ${e}`)] };
  const ga = incidence(a), gb = incidence(b);
  const n = ga.colour.length;
  const counts = (m: FunctionModel) => JSON.stringify([m.boxes.length, m.wires.length, m.carriers.length, dimsOf(m).length, val(m.weights, "harmful")]);
  if (counts(a) !== counts(b) || n !== gb.colour.length) {
    return { ok: true as const, decided: true as const, isomorphic: false as const, reason: "different numbers of boxes, ports, wires, carriers, or cost dimensions" };
  }
  // Disjoint union: a's nodes are 0..n-1, b's are n..2n-1.
  const g: Incidence = {
    colour: [...ga.colour, ...gb.colour],
    out: [...ga.out, ...gb.out.map((es) => es.map(([l, y]): [string, number] => [l, y + n]))],
    inc: [...ga.inc, ...gb.inc.map((es) => es.map(([l, y]): [string, number] => [l, y + n]))],
    ref: [...ga.ref, ...gb.ref],
  };
  const start = new Map([...new Set(g.colour)].sort().map((c, i) => [c, i]));
  const balanced = (cs: number[]) => {
    const tally = new Map<number, number>();
    cs.forEach((c, v) => tally.set(c, (tally.get(c) ?? 0) + (v < n ? 1 : -1)));
    return [...tally.values()].every((t) => t === 0);
  };
  const edgeSet = (lo: number, hi: number, f: (v: number) => number) => {
    const s: string[] = [];
    for (let v = lo; v < hi; v++) for (const [l, y] of g.out[v]) s.push(`${f(v)}|${l}|${f(y)}`);
    return s.sort().join("\n");
  };
  const targetEdges = edgeSet(n, 2 * n, (v) => v);
  let steps = 0;
  const charge = () => { if (++steps > budget) throw new Budget(); };
  const mappingFrom = (image: number[]): ModelMapping => {
    const pairs = (kind: Incidence["ref"][number]["kind"], box?: string) =>
      Object.fromEntries(image.flatMap((w, v) => (ga.ref[v].kind === kind && ga.ref[v].box === box ? [[ga.ref[v].id, gb.ref[w].id]] : [])));
    return {
      boxes: pairs("box"), wires: pairs("wire"), carriers: pairs("carrier"), dims: pairs("dim"),
      ports: Object.fromEntries(a.boxes.map((x) => [x.id, pairs("port", x.id)])),
    };
  };
  const search = (cs: number[]): number[] | null => {
    if (!balanced(cs)) return null;
    const size = new Map<number, number>();
    for (let v = 0; v < n; v++) size.set(cs[v], (size.get(cs[v]) ?? 0) + 1);
    let cell: number | null = null;
    for (const [c, k] of size) if (k > 1 && (cell === null || k < size.get(cell)! || (k === size.get(cell)! && c < cell))) cell = c;
    if (cell === null) {
      const byColour = new Map<number, number>();
      for (let v = n; v < 2 * n; v++) byColour.set(cs[v], v);
      const f = (v: number) => (v < n ? byColour.get(cs[v])! : v);
      const ok = g.colour.slice(0, n).every((c, v) => c === g.colour[f(v)]) && edgeSet(0, n, f) === targetEdges;
      if (!ok) return null;
      const image = Array.from({ length: n }, (_, v) => f(v) - n);
      charge();
      return !options.accept || options.accept(mappingFrom(image), charge) ? image : null;
    }
    let u = 0;
    while (cs[u] !== cell) u++;
    const fresh = Math.max(...cs) + 1;
    for (let v = n; v < 2 * n; v++) {
      if (cs[v] !== cell) continue;
      charge();
      const next = [...cs];
      next[u] = fresh;
      next[v] = fresh;
      const found = search(refine(g, next));
      if (found) return found;
    }
    return null;
  };
  let image: number[] | null;
  try {
    image = search(refine(g, g.colour.map((c) => start.get(c)!)));
  } catch (e) {
    if (e instanceof Budget) return { ok: true as const, decided: false as const, reason: `search budget of ${budget} steps exhausted; isomorphism not decided` };
    throw e;
  }
  if (!image) return { ok: true as const, decided: true as const, isomorphic: false as const, reason: "no bijection preserves roles, port sides, shared carriers, wiring, polarities, and costs" };
  const mapping = mappingFrom(image);
  const verified = checkIsomorphism(a, b, mapping);
  if (!verified.ok) throw new Error(`internal: search returned an unverified mapping: ${verified.errors.join("; ")}`);
  // Isomorphic models get the same verdicts: typing and harm cycles transport along the bijection.
  return { ok: true as const, decided: true as const, isomorphic: true as const, mapping, basis: ["typed_rename", "transGen_equiv"] as Theorem[] };
}
