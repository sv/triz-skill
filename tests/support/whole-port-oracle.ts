import type { FunctionModel } from "../../src/act.js";

/** Literal whole-port oracle: no recognition, quotient, joins, cache or pruning helpers. */
export function wholePortBoundary(model: FunctionModel) {
  const ports = model.boxes.flatMap(b => (["in", "out"] as const).flatMap(side => (side === "in" ? b.inputs ?? [] : b.outputs ?? []).map(p => ({ box: b.id, side, port: p.id, domain: model.carriers.find(c => c.id === p.carrier)!.values! }))));
  const find = (box: string, side: "in" | "out", port: string) => ports.findIndex(p => p.box === box && p.side === side && p.port === port);
  const ins = ports.filter(p => p.side === "in" && !model.wires.some(w => w.to.box === p.box && w.to.port === p.port));
  const outs = ports.filter(p => p.side === "in" && model.boxes.find(b => b.id === p.box)!.role === "product" && model.wires.some(w => w.to.box === p.box && w.to.port === p.port && w.polarity !== "harmful"));
  const rows = new Set<string>(), values: string[] = [];
  const visit = (i: number) => {
    if (i < ports.length) { for (const x of ports[i].domain) { values[i] = x; visit(i + 1); } return; }
    if (model.wires.some(w => values[find(w.from.box, "out", w.from.port)] !== values[find(w.to.box, "in", w.to.port)])) return;
    if (!model.boxes.every(b => b.behavior!.some(r => Object.entries(r.in).every(([p, x]) => values[find(b.id, "in", p)] === x) && Object.entries(r.out).every(([p, x]) => values[find(b.id, "out", p)] === x)))) return;
    rows.add(JSON.stringify([ins.map(p => values[find(p.box, p.side, p.port)]), outs.map(p => values[find(p.box, p.side, p.port)])]));
  };
  visit(0);
  return [...rows].sort().join(";");
}
