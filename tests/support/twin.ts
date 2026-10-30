/**
 * A renamed twin of a model, for checking what renaming may and may not move. Every id (boxes,
 * ports, wires, carriers, flows, cost dimensions, values and states, contradictions, demands,
 * cells) maps to a neutral token, and every free label (system, names, actions, verbs, port and
 * flow labels, carrier dimensions, contradiction parameters and reasons) is replaced. Every array
 * and record keeps its order, so declaration order is unchanged. Tokens sort in the reverse of
 * declaration order: a tie the kernel breaks by id order comes out the other way in the twin, and
 * one it breaks by declaration order does not. Roles, ratings, numbers, layers, `quantity`,
 * `loss`, and `domain` stay.
 *
 * Every replaced label contains a space, as prose does. `back` maps a twin's result into the
 * original ids: strings, keys, and JSON-encoded string arrays (a deliverable's `key`); prose that
 * quotes an id is not mapped.
 */
import type { FunctionModel } from "../../src/act.js";

type Model = FunctionModel;
type Rows = Array<{ in: Record<string, string>; out: Record<string, string> }> | undefined;
const AXES = ["space", "time", "condition", "direction", "level"] as const;

export interface Twin {
  model: Model;
  box(id: string): string;
  wire(id: string): string;
  carrier(id: string): string;
  port(box: string, id: string): string;
  /** A carrier value or a state. */
  value(id: string): string;
  back<T>(x: T): T;
}

export function renamedTwin(m: Model): Twin {
  const inverse = new Map<string, string>();
  /** Tokens `tag` + a zero-padded rank that falls along declaration order. */
  const family = (xs: Iterable<string>, tag: string) => {
    const all = [...new Set(xs)];
    return new Map(all.map((x, k) => {
      const t = `${tag}${String(all.length - k).padStart(3, "0")}`;
      inverse.set(t, x);
      return [x, t] as const;
    }));
  };
  const rowValues = (rs: Rows) => (rs ?? []).flatMap((r) => [...Object.values(r.in), ...Object.values(r.out)]);
  const pcs = m.contradictions ?? [];
  const boxes = family(m.boxes.map((b) => b.id), "b"), wires = family(m.wires.map((w) => w.id), "w");
  const carriers = family(m.carriers.map((c) => c.id), "c"), flows = family((m.flows ?? []).map((f) => f.id), "f");
  const dims = family([
    ...m.boxes.flatMap((b) => [...Object.keys(b.cost ?? {}), ...(b.feasibility ?? []).flatMap((r) => Object.keys(r.cost ?? {}))]),
    ...Object.keys(m.budget ?? {}), ...Object.keys(m.weights ?? {}).filter((d) => d !== "harmful"),
  ], "d");
  const values = family([
    ...m.carriers.flatMap((c) => [...(c.values ?? []), ...(c.levels ?? []).map((l) => l.value)]),
    ...m.boxes.flatMap((b) => [...(b.state ?? []), ...(b.initial ?? []), ...rowValues(b.behavior), ...rowValues(b.producible),
      ...(b.transition ?? []).flatMap((t) => [t.state, t.next, ...Object.values(t.in), ...Object.values(t.out)])]),
    ...pcs.flatMap((pc) => pc.demands.flatMap((d) => d.values)),
  ], "v");
  const cells = family(pcs.flatMap((pc) => [...AXES.flatMap((a) => pc.axes?.[a] ?? []), ...pc.demands.flatMap((d) => AXES.flatMap((a) => d[a] ?? []))]), "x");
  const contradictions = family(pcs.map((pc) => pc.id), "k"), demands = family(pcs.flatMap((pc) => pc.demands.map((d) => d.id)), "e");
  const ports = new Map(m.boxes.map((b) => [b.id, family([...(b.inputs ?? []), ...(b.outputs ?? [])].map((p) => p.id), `${boxes.get(b.id)}p`)]));

  const get = (f: Map<string, string>, x: string) => {
    const t = f.get(x);
    if (t === undefined) throw new Error(`renamedTwin: unmapped id '${x}'`);
    return t;
  };
  const B = (x: string) => get(boxes, x), C = (x: string) => get(carriers, x), V = (x: string) => get(values, x), X = (x: string) => get(cells, x);
  const P = (b: string, x: string) => get(ports.get(b)!, x);
  const D = (x: string) => (x === "harmful" ? x : get(dims, x));
  const keyed = <T>(o: Record<string, T> | undefined, k: (x: string) => string) => o && Object.fromEntries(Object.entries(o).map(([x, v]) => [k(x), v]));
  const valued = (o: Record<string, string>, b: string) => Object.fromEntries(Object.entries(o).map(([p, v]) => [P(b, p), V(v)]));
  const end = (e: { box: string; port: string }) => ({ box: B(e.box), port: P(e.box, e.port) });
  const opt = <T, U>(x: T | undefined, f: (y: T) => U) => (x === undefined ? {} : f(x));

  const model: Model = {
    domain: m.domain,
    ...opt(m.system, () => ({ system: "the system" })),
    carriers: m.carriers.map((c, i) => ({
      ...c, id: C(c.id), dimension: `unit ${i + 1}`,
      ...opt(c.values, (vs) => ({ values: vs.map(V) })),
      ...opt(c.levels, (ls) => ({ levels: ls.map((l) => ({ ...l, value: V(l.value) })) })),
    })),
    boxes: m.boxes.map((b) => ({
      ...b, id: B(b.id), name: `part ${B(b.id)}`,
      ...opt(b.action, () => ({ action: "act on" })),
      ...opt(b.inputs, (ps) => ({ inputs: ps.map((p) => ({ ...p, id: P(b.id, p.id), carrier: C(p.carrier), ...opt(p.label, () => ({ label: "a port" })) })) })),
      ...opt(b.outputs, (ps) => ({ outputs: ps.map((p) => ({ ...p, id: P(b.id, p.id), carrier: C(p.carrier), ...opt(p.label, () => ({ label: "a port" })) })) })),
      ...opt(b.cost, (c) => ({ cost: keyed(c, D) })),
      ...opt(b.behavior, (rs) => ({ behavior: rs.map((r) => ({ in: valued(r.in, b.id), out: valued(r.out, b.id) })) })),
      ...opt(b.producible, (rs) => ({ producible: rs.map((r) => ({ in: valued(r.in, b.id), out: valued(r.out, b.id) })) })),
      ...opt(b.state, (s) => ({ state: s.map(V) })),
      ...opt(b.initial, (s) => ({ initial: s.map(V) })),
      ...opt(b.transition, (rs) => ({ transition: rs.map((r) => ({ state: V(r.state), in: valued(r.in, b.id), next: V(r.next), out: valued(r.out, b.id) })) })),
      ...opt(b.feasibility, (rs) => ({ feasibility: rs.map((r) => ({
        ...opt(r.provides, (x) => ({ provides: keyed(x, (p) => P(b.id, p)) })),
        ...opt(r.requires, (x) => ({ requires: keyed(x, (p) => P(b.id, p)) })),
        ...opt(r.cost, (x) => ({ cost: keyed(x, D) })),
      })) })),
    })),
    wires: m.wires.map((w) => ({ ...w, id: get(wires, w.id), from: end(w.from), to: end(w.to), carrier: C(w.carrier), ...opt(w.verb, () => ({ verb: "act on" })) })),
    ...opt(m.flows, (fs) => ({ flows: fs.map((f) => ({
      ...f, id: get(flows, f.id), carrier: C(f.carrier), path: f.path.map(B),
      ...opt(f.medium, (x) => ({ medium: B(x) })), ...opt(f.name, () => ({ name: "a flow" })),
    })) })),
    ...opt(m.budget, (x) => ({ budget: keyed(x, D) })),
    ...opt(m.weights, (x) => ({ weights: keyed(x, D) })),
    ...opt(m.contradictions, (xs) => ({ contradictions: xs.map((pc) => ({
      id: get(contradictions, pc.id), parameter: "the parameter",
      ...opt(pc.axes, (ax) => ({ axes: Object.fromEntries(Object.entries(ax).map(([a, cs]) => [a, cs!.map(X)])) })),
      demands: pc.demands.map((d) => ({
        id: get(demands, d.id), values: d.values.map(V), ...opt(d.because, () => ({ because: "a reason" })),
        ...Object.fromEntries(AXES.filter((a) => d[a]).map((a) => [a, d[a]!.map(X)])),
      })),
    })) })),
  };

  const back = (x: unknown): unknown => {
    if (typeof x === "string") {
      if (inverse.has(x)) return inverse.get(x)!;
      if (!x.startsWith("[")) return x;
      try {
        const xs: unknown = JSON.parse(x);
        return Array.isArray(xs) && xs.every((y) => typeof y === "string") ? JSON.stringify(xs.map((y) => inverse.get(y) ?? y)) : x;
      } catch { return x; }
    }
    if (Array.isArray(x)) return x.map(back);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [inverse.get(k) ?? k, back(v)]));
    return x;
  };
  return { model, box: B, wire: (x) => get(wires, x), carrier: C, port: P, value: V, back: <T>(x: T) => back(x) as T };
}
