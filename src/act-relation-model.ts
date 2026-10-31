/** Shared wiring quotient and behavior-table adapter for static evaluation and synthesis. */
import type { FunctionModel } from "./act.js";
import type { ScopedRelation } from "./act-relations.js";
type Box = FunctionModel["boxes"][number];
type Typed = { box: string; port: string; carrier: string };
const portKey = (box: string, side: "in" | "out", port: string) => JSON.stringify([box, side, port]);
const tupleKey = (t: string[]) => JSON.stringify(t);

export interface PortVariables {
  variables: Array<Typed & { side: "in" | "out" }>;
  /** The variable a port belongs to. */
  at: (box: string, side: "in" | "out", port: string) => number;
  /** Variables with no output port: the unwired input ports. */
  boundary: number[];
}

/**
 * Ports joined by wires are one variable, represented by its output port when it has one. Covers
 * the ports of `boxes` and the `extra` input ports; every wire into them must come from `boxes`.
 */
export function portVariables(model: FunctionModel, boxes: Box[], extra: Typed[] = []): PortVariables {
  const parent = new Map<string, string>();
  const info = new Map<string, Typed & { side: "in" | "out" }>();
  const find = (k: string): string => {
    while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k)!)!); k = parent.get(k)!; }
    return k;
  };
  const add = (e: Typed, side: "in" | "out") => {
    const k = portKey(e.box, side, e.port);
    if (!parent.has(k)) { parent.set(k, k); info.set(k, { ...e, side }); }
  };
  for (const b of boxes) {
    for (const q of b.inputs ?? []) add({ box: b.id, port: q.id, carrier: q.carrier }, "in");
    for (const q of b.outputs ?? []) add({ box: b.id, port: q.id, carrier: q.carrier }, "out");
  }
  for (const d of extra) add(d, "in");
  for (const w of model.wires) {
    const t = portKey(w.to.box, "in", w.to.port);
    if (parent.has(t)) parent.set(find(t), find(portKey(w.from.box, "out", w.from.port)));
  }
  const index = new Map<string, number>();
  const variables: Array<Typed & { side: "in" | "out" }> = [];
  for (const [k, e] of info) {
    const r = find(k);
    if (!index.has(r)) { index.set(r, variables.length); variables.push(e); }
    else if (e.side === "out" && variables[index.get(r)!].side === "in") variables[index.get(r)!] = e;
  }
  return {
    variables,
    at: (box, side, port) => index.get(find(portKey(box, side, port)))!,
    boundary: variables.flatMap((e, i) => (e.side === "in" ? [i] : [])),
  };
}

/** A row as (variable, value) bindings over the box's ports, inputs first. */
export type Binding = Array<[number, string]>;
export function bindRow(b: Box, row: { in: Record<string, string>; out: Record<string, string> }, at: PortVariables["at"]): Binding {
  return [
    ...(b.inputs ?? []).map((q) => [at(b.id, "in", q.id), row.in[q.id]] as [number, string]),
    ...(b.outputs ?? []).map((q) => [at(b.id, "out", q.id), row.out[q.id]] as [number, string]),
  ];
}

/** Complete model rows remain correlated. Deduplicate declarations before any projection. */
export function modelRelations(model: FunctionModel, boxes: Box[], extra: Typed[] = []) {
  const ports = portVariables(model, boxes, extra);
  const values = new Map(model.carriers.map(c => [c.id, c.values ?? []]));
  const sets: ScopedRelation[] = boxes.map(b => {
    const rows = new Map<string, Binding>();
    for (const row of b.behavior!) {
      const binding = bindRow(b, row, ports.at);
      rows.set(tupleKey(binding.map(([, x]) => x)), binding);
    }
    return { vars: [...new Set([...(b.inputs ?? []).map(p => ports.at(b.id, "in", p.id)),
      ...(b.outputs ?? []).map(p => ports.at(b.id, "out", p.id))])], rows: [...rows.values()] };
  });
  return { ports, sets, domains: ports.variables.map(p => values.get(p.carrier)!) };
}
