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
 * Names are fresh and returned so callers can interpret the result. Inner box declarations
 * and standalone inner flows are retained; a parent flow through the box needs an explicit
 * route and is refused. This preserves declarations, not a dynamic or resource proof. */
export function substitute(model: FunctionModel, box: string) {
  const view = zoomIn(model, box);
  if (!view.ok) return view;
  const inner = view.model;
  if (model.boxes.find(b => b.id === box)?.role === "product" || inner.boxes.some(b => b.role === "product"))
    return problem("substitution would change product deliverable identities", "Substitute only non-product boxes whose inner models have no product boxes; model product deliverables explicitly.");
  if (model.domain !== inner.domain || inner.budget !== undefined || inner.weights !== undefined || inner.contradictions?.length)
    return problem("substitution has unsupported domain or inner model metadata", "Use matching domains and remove the inner budget, weights, or contradictions; their composition is not defined.");
  const crossing = (model.flows ?? []).find(f => f.path.includes(box) || f.medium === box);
  if (crossing) return problem(`parent flow '${crossing.id}' refers to hierarchical box '${box}'`,
    `Describe the intended inner route and medium explicitly before expansion: remove or revise flow '${crossing.id}', then add its expanded path using the returned box names. An inner route cannot be inferred from the interface bindings.`);
  // Values form a set; an omitted quantity is the intensive default. Keep every other
  // declaration exact, including loss: dropping a loss annotation changes flow linting.
  const canonicalCarrier = (carrier: FunctionModel["carriers"][number]) => JSON.stringify({
    ...carrier, quantity: carrier.quantity ?? "intensive", ...(carrier.values ? { values: [...carrier.values].sort() } : {}),
  }, (_k, v) => v && !Array.isArray(v) && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
  for (const carrier of inner.carriers) {
    const existing = model.carriers.find(c => c.id === carrier.id);
    if (existing && canonicalCarrier(existing) !== canonicalCarrier(carrier)) return problem(`carrier '${carrier.id}' differs between models`, "Use the same carrier declaration for each shared id, including its loss annotation.");
  }
  const fresh = (preferred: string, used: Set<string>) => {
    let value = preferred;
    for (let n = 2; used.has(value); n++) value = `${preferred}#${n}`;
    used.add(value);
    return value;
  };
  const usedBoxes = new Set(model.boxes.filter(b => b.id !== box).map(b => b.id));
  const usedWires = new Set(model.wires.map(w => w.id));
  const usedFlows = new Set((model.flows ?? []).map(f => f.id));
  const names = new Map(inner.boxes.map(b => [b.id, fresh(`${box}/${b.id}`, usedBoxes)]));
  const wireNames = new Map(inner.wires.map(w => [w.id, fresh(`${box}/${w.id}`, usedWires)]));
  const flowNames = new Map((inner.flows ?? []).map(f => [f.id, fresh(`${box}/${f.id}`, usedFlows)]));
  const endpoint = (e: { box: string; port: string }) => ({ box: names.get(e.box)!, port: e.port });
  const rewire = (e: { box: string; port: string }, side: "inputs" | "outputs") => e.box === box ? endpoint(view.interface[side].find((v: { outer: string }) => v.outer === e.port)!.inner) : e;
  const result: FunctionModel = {
    ...model,
    carriers: [...model.carriers, ...inner.carriers.filter(c => !model.carriers.some(x => x.id === c.id))],
    boxes: [...model.boxes.filter(b => b.id !== box), ...inner.boxes.map(b => ({ ...b, id: names.get(b.id)! }))],
    wires: [...model.wires.map(w => ({ ...w, from: rewire(w.from, "outputs"), to: rewire(w.to, "inputs") })),
      ...inner.wires.map(w => ({ ...w, id: wireNames.get(w.id)!, from: endpoint(w.from), to: endpoint(w.to) }))],
    ...(model.flows !== undefined || inner.flows !== undefined ? { flows: [
      ...(model.flows ?? []), ...(inner.flows ?? []).map(f => ({ ...f, id: flowNames.get(f.id)!,
        path: f.path.map(id => names.get(id)!), ...(f.medium !== undefined ? { medium: names.get(f.medium)! } : {}) })),
    ] } : {}),
  };
  const check = checkModel(result, "$.model");
  if (!check.ok) return fail(check.issues);
  return { ok: true as const, model: result, boxNames: Object.fromEntries(names), wireNames: Object.fromEntries(wireNames), flowNames: Object.fromEntries(flowNames), interface: view.interface };
}
