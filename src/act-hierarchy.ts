/** Checked hierarchy views and explicit, conservative wiring substitution. */
import { checkModel, type FunctionModel } from "./act.js";
import { fail, issue } from "./act-issues.js";

const problem = (message: string, hint: string) => fail([issue("hierarchy-substitution", "$.model", message, hint)]);

/** Zoom into a declared box, preserving the explicit interface metadata. */
export function zoomIn(model: FunctionModel, box: string) {
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  const chosen = model.boxes.find(b => b.id === box);
  if (!chosen?.inner) return problem(`box '${box}' has no inner model`, "Choose a box with an inner model.");
  return { ok: true as const, model: chosen.inner.model as FunctionModel, interface: { inputs: chosen.inner.inputs, outputs: chosen.inner.outputs }, box };
}

/** Replace one box by its inner diagram, connecting each outer wire to its bound inner port.
 * Names are fresh and returned so callers can interpret the result. Costs, feasibility,
 * dynamics and flow paths have no substitution contract here and are refused. */
export function substitute(model: FunctionModel, box: string) {
  const view = zoomIn(model, box);
  if (!view.ok) return view;
  const inner = view.model;
  if (model.boxes.find(b => b.id === box)?.role === "product" || inner.boxes.some(b => b.role === "product"))
    return problem("substitution would change product deliverable identities", "Substitute only non-product boxes whose inner models have no product boxes; model product deliverables explicitly.");
  if (model.domain !== inner.domain || model.flows?.length || inner.flows?.length || inner.budget || inner.weights || inner.contradictions?.length ||
      inner.boxes.some(b => b.cost || b.feasibility || b.state || b.initial || b.transition))
    return problem("substitution has unsupported domain, flow, cost, feasibility, dynamics, or inner model metadata", "Use matching domains and remove unsupported declarations before substituting; their semantics are not composed here.");
  const canon = (x: unknown): string => JSON.stringify(x, (_k, v) => v && !Array.isArray(v) && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
  for (const carrier of inner.carriers) {
    const existing = model.carriers.find(c => c.id === carrier.id);
    if (existing && canon(existing) !== canon(carrier)) return problem(`carrier '${carrier.id}' differs between models`, "Use the same carrier declaration for each shared id.");
  }
  const fresh = (preferred: string, used: Set<string>) => {
    let value = preferred;
    for (let n = 2; used.has(value); n++) value = `${preferred}#${n}`;
    used.add(value);
    return value;
  };
  const usedBoxes = new Set(model.boxes.filter(b => b.id !== box).map(b => b.id));
  const usedWires = new Set(model.wires.map(w => w.id));
  const names = new Map(inner.boxes.map(b => [b.id, fresh(`${box}/${b.id}`, usedBoxes)]));
  const wireNames = new Map(inner.wires.map(w => [w.id, fresh(`${box}/${w.id}`, usedWires)]));
  const endpoint = (e: { box: string; port: string }) => ({ box: names.get(e.box)!, port: e.port });
  const rewire = (e: { box: string; port: string }, side: "inputs" | "outputs") => e.box === box ? endpoint(view.interface[side].find((v: { outer: string }) => v.outer === e.port)!.inner) : e;
  const result: FunctionModel = {
    ...model,
    carriers: [...model.carriers, ...inner.carriers.filter(c => !model.carriers.some(x => x.id === c.id))],
    boxes: [...model.boxes.filter(b => b.id !== box), ...inner.boxes.map(b => ({ ...b, id: names.get(b.id)! }))],
    wires: [...model.wires.map(w => ({ ...w, from: rewire(w.from, "outputs"), to: rewire(w.to, "inputs") })),
      ...inner.wires.map(w => ({ ...w, id: wireNames.get(w.id)!, from: endpoint(w.from), to: endpoint(w.to) }))],
  };
  const check = checkModel(result, "$.model");
  if (!check.ok) return fail(check.issues);
  return { ok: true as const, model: result, boxNames: Object.fromEntries(names), wireNames: Object.fromEntries(wireNames), interface: view.interface };
}
