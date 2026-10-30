/** Checked hierarchy views and explicit, conservative wiring substitution. */
import { z } from "zod";
import { ModelProvenance } from "./act-provenance.js";
import { checkModel, sameCarrier, type FunctionModel } from "./act.js";
import { fail, issue } from "./act-issues.js";

const problem = (message: string, hint: string) => fail([issue("hierarchy-substitution", "$.model", message, hint)]);

/** Explicit routes use occurrence indices local to each flow, and inner box IDs. */
export const SubstitutionOptions = z.strictObject({
  routes: z.array(z.strictObject({ flow: z.string().min(1), occurrence: z.number().int().nonnegative(),
    path: z.array(z.string().min(1)).min(1), entry: z.string().min(1).optional(), exit: z.string().min(1).optional() })).optional(),
  media: z.array(z.strictObject({ flow: z.string().min(1), box: z.string().min(1) })).optional(),
  policies: z.strictObject({ budget: z.literal("global-intersection").optional(), weights: z.literal("global-merge").optional(),
    contradictions: z.literal("append-renamed").optional() }).optional(),
});
export type SubstitutionOptions = z.infer<typeof SubstitutionOptions>;

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
 * and standalone inner flows are retained. A parent flow through the box needs an explicit
 * checked route; a shell used as medium needs a checked mapping. Inner budgets, weights and
 * contradictions need explicit global/intersection, global/merge and independent-append
 * policies. This preserves declarations, not a dynamic or resource proof. */
export function substitute(model: FunctionModel, box: string, options: SubstitutionOptions = {}) {
  const validOptions = SubstitutionOptions.safeParse(options);
  if (!validOptions.success) return problem("invalid hierarchy substitution options", "Provide valid routes, media, and supported policy names.");
  const view = zoomIn(model, box);
  if (!view.ok) return view;
  const inner = view.model;
  if (model.boxes.find(b => b.id === box)?.role === "product" || inner.boxes.some(b => b.role === "product"))
    return problem("substitution would change product deliverable identities", "Substitute only non-product boxes whose inner models have no product boxes; model product deliverables explicitly.");
  if (model.domain !== inner.domain)
    return problem("inner model has a different domain", "Use matching outer and inner model domains.");
  const policy = options.policies ?? {};
  if (inner.budget !== undefined && policy.budget !== "global-intersection")
    return problem("inner budget requires an explicit composition policy", "Pass policies.budget: 'global-intersection' to apply the inner budget as a global bound, or remove the inner budget.");
  if (inner.weights !== undefined && policy.weights !== "global-merge")
    return problem("inner weights require an explicit composition policy", "Pass policies.weights: 'global-merge' to apply compatible inner weights globally, or remove the inner weights.");
  if (inner.contradictions?.length && policy.contradictions !== "append-renamed")
    return problem("inner contradictions require an explicit composition policy", "Pass policies.contradictions: 'append-renamed' to append them independently to the outer model, or remove them.");
  const weights = new Map(Object.entries(model.weights ?? {}));
  for (const [dimension, value] of Object.entries(inner.weights ?? {})) {
    if (weights.has(dimension) && weights.get(dimension) !== value)
      return problem(`inner weight '${dimension}' conflicts with the outer weight`, "Use equal weights for every overlapping dimension before global merge.");
    weights.set(dimension, value as number);
  }
  const budget = new Map(Object.entries(model.budget ?? {}));
  for (const [dimension, value] of Object.entries(inner.budget ?? {}))
    budget.set(dimension, Math.min(budget.get(dimension) ?? Infinity, value as number));

  const routes = new Map<string, Map<number, NonNullable<SubstitutionOptions["routes"]>[number]>>();
  for (const route of options.routes ?? []) {
    const byOccurrence = routes.get(route.flow) ?? new Map();
    if (byOccurrence.has(route.occurrence)) return problem(`duplicate route for flow '${route.flow}' occurrence ${route.occurrence}`, "Supply one route for each shell occurrence.");
    byOccurrence.set(route.occurrence, route); routes.set(route.flow, byOccurrence);
  }
  const media = new Map<string, string>();
  for (const medium of options.media ?? []) {
    if (media.has(medium.flow)) return problem(`duplicate medium mapping for flow '${medium.flow}'`, "Supply one medium mapping per flow.");
    media.set(medium.flow, medium.box);
  }
  const parentFlows = new Map((model.flows ?? []).map(f => [f.id, f]));
  for (const [id, entries] of routes) {
    const flow = parentFlows.get(id);
    const count = flow?.path.filter(id => id === box).length ?? 0;
    if (!flow || [...entries.keys()].some(i => i >= count)) return problem(`route references a nonexistent shell occurrence on flow '${id}'`, "Use the flow id and a zero-based occurrence index for an occurrence of the chosen box.");
  }
  for (const [id] of media) if (parentFlows.get(id)?.medium !== box)
    return problem(`medium mapping for flow '${id}' does not refer to the chosen box`, "Map a medium only when that flow names the chosen box as medium.");
  const innerBoxes = new Map(inner.boxes.map(b => [b.id, b]));
  const binding = (side: "inputs" | "outputs", port: string) => view.interface[side].find((b: { outer: string }) => b.outer === port);
  const portMatches = (side: "inputs" | "outputs", port: string, innerId: string, carrier: string) => {
    const b = binding(side, port);
    return b && b.inner.box === innerId && innerBoxes.get(innerId)?.[side]?.some(p => p.id === b.inner.port && p.carrier === carrier);
  };
  for (const flow of model.flows ?? []) {
    if (flow.medium === box) {
      const id = media.get(flow.id), target = id && innerBoxes.get(id);
      if (!id || !target) return problem(`flow '${flow.id}' needs an inner medium mapping`, "Pass media with this flow id and a valid inner box id; specify an inner route too if the flow passes through the box.");
      const carrierEvidence = [...(target.inputs ?? []), ...(target.outputs ?? [])].some(p => p.carrier === flow.carrier) ||
        (inner.flows ?? []).some(f => f.carrier === flow.carrier && f.medium === id);
      if (!carrierEvidence) return problem(`flow '${flow.id}' medium '${id}' has no evidence for carrier '${flow.carrier}'`, "Choose an inner box with that carrier on a port or as the declared medium of an inner flow on that carrier.");
    }
    let occurrence = 0;
    for (const [index, id] of flow.path.entries()) {
      if (id !== box) continue;
      const route = routes.get(flow.id)?.get(occurrence++);
      if (!route) return problem(`parent flow '${flow.id}' needs a route for occurrence ${occurrence - 1}`, "Pass one explicit inner route per shell occurrence using its zero-based occurrence index.");
      if (route.path.some(id => !innerBoxes.has(id))) return problem(`flow '${flow.id}' route names an unknown inner box`, "List only inner box ids in the route.");
      const first = route.path[0], last = route.path[route.path.length - 1];
      const before = flow.path[index - 1], after = flow.path[index + 1];
      if ((before && !route.entry) || (route.entry && (!portMatches("inputs", route.entry, first, flow.carrier) ||
          (before && !model.wires.some(w => w.carrier === flow.carrier && w.from.box === before && w.to.box === box && w.to.port === route.entry)))))
        return problem(`flow '${flow.id}' route entry does not match its crossing wire and interface`, "This expansion requires a same-carrier crossing wire from the previous box to the named outer entry; its binding must target the route's first inner box. Flow paths without such wires are valid, but this route cannot be checked.");
      if ((after && !route.exit) || (route.exit && (!portMatches("outputs", route.exit, last, flow.carrier) ||
          (after && !model.wires.some(w => w.carrier === flow.carrier && w.from.box === box && w.from.port === route.exit && w.to.box === after)))))
        return problem(`flow '${flow.id}' route exit does not match its crossing wire and interface`, "This expansion requires a same-carrier crossing wire from the named outer exit to the next box; its binding must target the route's last inner box. Flow paths without such wires are valid, but this route cannot be checked.");
      for (let i = 1; i < route.path.length; i++) {
        const from = route.path[i - 1], to = route.path[i];
        const wire = inner.wires.some(w => w.from.box === from && w.to.box === to && w.carrier === flow.carrier);
        const step = (inner.flows ?? []).some(f => f.carrier === flow.carrier && f.path.some((id, j) => j > 0 && f.path[j - 1] === from && id === to));
        if (from === to || (!wire && !step)) return problem(`flow '${flow.id}' route has an unsupported step '${from}' → '${to}'`, "Each directed step needs an inner wire or inner flow step of the same carrier; consecutive boxes must differ.");
      }
    }
  }
  // Use the same carrier equivalence as hierarchy interface validation.
  for (const carrier of inner.carriers) {
    const existing = model.carriers.find(c => c.id === carrier.id);
    if (existing && !sameCarrier(existing, carrier)) return problem(`carrier '${carrier.id}' differs between models`, "Use the same carrier declaration for each shared id, including its loss annotation.");
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
  const usedContradictions = new Set((model.contradictions ?? []).map(c => c.id));
  const contradictionNames = new Map((inner.contradictions ?? []).map(c => [c.id, fresh(`${box}/${c.id}`, usedContradictions)]));
  // Sources of the removed shell remain as inherited source entries on every expanded box;
  // inner evidence is kept as additional entries. Pending decisions are namespaced together.
  const outerProvenance = (model as FunctionModel & { provenance?: unknown }).provenance;
  const innerProvenance = (inner as FunctionModel & { provenance?: unknown }).provenance;
  let provenance: z.infer<typeof ModelProvenance> | undefined;
  let inheritedShellSources = 0;
  const pendingNames = new Map<string, string>();
  if (outerProvenance !== undefined || innerProvenance !== undefined) {
    const parse = (value: unknown) => value === undefined ? undefined : ModelProvenance.safeParse(value);
    const a = parse(outerProvenance), b = parse(innerProvenance);
    if ((a && !a.success) || (b && !b.success)) return problem("invalid model provenance", "Review and validate each provenance envelope before expansion.");
    const outer = a?.data, inside = b?.data;
    if (outer?.status === "draft" || inside?.status === "draft") return problem("draft provenance cannot be expanded", "Review the model and every inner model before expansion.");
    if (!outer && (model.boxes.some(b => b.id !== box) || model.wires.length))
      return problem("inner provenance cannot cover unannotated outer elements", "Add reviewed source provenance for the outer boxes and wires before expansion; sources cannot be invented.");
    if (!inside && inner.wires.length)
      return problem("outer provenance cannot cover unannotated inner wires", "Add reviewed source provenance for the inner model's boxes and wires before expansion; sources cannot be invented.");
    if ((outer?.hierarchy ?? []).some(link => link.parent === box || link.child === box))
      return problem("expansion cannot infer how source containment through the shell changes", "Keep the containment artifact separately and supply an explicitly reviewed flat containment model before expansion.");
    const shell = (outer?.components ?? []).filter(x => x.id === box);
    if (shell.length && !inner.boxes.length) return problem("expansion cannot retain the shell's source without an inner box", "Keep at least one inner box or preserve the shell's provenance separately before expanding.");
    inheritedShellSources = shell.length;
    const innerComponents = (inside?.components ?? []).map(x => ({ ...x, id: names.get(x.id) ?? "" }));
    const innerInteractions = (inside?.interactions ?? []).map(x => ({ ...x, wireId: wireNames.get(x.wireId) ?? "" }));
    if (innerComponents.some(x => !x.id) || innerInteractions.some(x => !x.wireId))
      return problem("inner provenance references a missing box or wire", "Ensure every inner provenance reference names an element in the inner model.");
    const usedPending = new Set((outer?.pending ?? []).map(x => x.id));
    for (const entry of inside?.pending ?? []) pendingNames.set(entry.id, fresh(`${box}/${entry.id}`, usedPending));
    const pending = [...(outer?.pending ?? []), ...(inside?.pending ?? []).map(x => ({ ...x, id: pendingNames.get(x.id)! }))];
    const decisions = [...(outer?.review?.decisions ?? []), ...(inside?.review?.decisions ?? []).map(x => ({ ...x, id: pendingNames.get(x.id)! }))];
    const merged = ModelProvenance.safeParse({ status: "reviewed", components: [
      ...(outer?.components ?? []).filter(x => x.id !== box),
      ...shell.flatMap(x => inner.boxes.map(b => ({ ...x, id: names.get(b.id)! }))), ...innerComponents,
    ], interactions: [...(outer?.interactions ?? []), ...innerInteractions],
    ...((outer?.hierarchy !== undefined || inside?.hierarchy !== undefined) ? { hierarchy: [
      ...(outer?.hierarchy ?? []), ...(inside?.hierarchy ?? []).map(link => ({ ...link,
        parent: names.get(link.parent)!, child: names.get(link.child)!,
      })),
    ] } : {}), pending, review: { decisions } });
    if (!merged.success) return problem("provenance could not be preserved during expansion", "Make sure both reviewed models have complete, valid provenance decisions.");
    provenance = merged.data;
  }
  const expandedFlows = (model.flows ?? []).map(flow => {
    let occurrence = 0;
    const path = flow.path.flatMap(id => id === box ? routes.get(flow.id)!.get(occurrence++)!.path.map(id => names.get(id)!) : [id]);
    return { ...flow, path, ...(flow.medium === box ? { medium: names.get(media.get(flow.id)!)! } : {}) };
  });
  const endpoint = (e: { box: string; port: string }) => ({ box: names.get(e.box)!, port: e.port });
  const rewire = (e: { box: string; port: string }, side: "inputs" | "outputs") => e.box === box ? endpoint(view.interface[side].find((v: { outer: string }) => v.outer === e.port)!.inner) : e;
  const result: FunctionModel = {
    ...model,
    carriers: [...model.carriers, ...inner.carriers.filter(c => !model.carriers.some(x => x.id === c.id))],
    boxes: [...model.boxes.filter(b => b.id !== box), ...inner.boxes.map(b => ({ ...b, id: names.get(b.id)! }))],
    ...(provenance !== undefined ? { provenance } : {}),
    ...(inner.budget !== undefined ? { budget: Object.fromEntries(budget) } : {}),
    ...(inner.weights !== undefined ? { weights: Object.fromEntries(weights) } : {}),
    ...(inner.contradictions?.length ? { contradictions: [...(model.contradictions ?? []),
      ...inner.contradictions.map(c => ({ ...c, id: contradictionNames.get(c.id)! }))] } : {}),
    wires: [...model.wires.map(w => ({ ...w, from: rewire(w.from, "outputs"), to: rewire(w.to, "inputs") })),
      ...inner.wires.map(w => ({ ...w, id: wireNames.get(w.id)!, from: endpoint(w.from), to: endpoint(w.to) }))],
    ...(model.flows !== undefined || inner.flows !== undefined ? { flows: [
      ...expandedFlows, ...(inner.flows ?? []).map(f => ({ ...f, id: flowNames.get(f.id)!,
        path: f.path.map(id => names.get(id)!), ...(f.medium !== undefined ? { medium: names.get(f.medium)! } : {}) })),
    ] } : {}),
  };
  const check = checkModel(result, "$.model");
  if (!check.ok) return fail(check.issues);
  return { ok: true as const, model: result, boxNames: Object.fromEntries(names), wireNames: Object.fromEntries(wireNames), flowNames: Object.fromEntries(flowNames), contradictionNames: Object.fromEntries(contradictionNames), interface: view.interface,
    provenanceEffects: { inheritedShellSources, pendingNames: Object.fromEntries(pendingNames) },
    policyEffects: {
      ...(inner.budget !== undefined ? { budget: { policy: "global-intersection" as const, scope: "global" as const, note: "The inner bound now constrains the whole model and may be stronger than a local bound.", result: Object.fromEntries(budget) } } : {}),
      ...(inner.weights !== undefined ? { weights: { policy: "global-merge" as const, scope: "global" as const, result: Object.fromEntries(weights) } } : {}),
      ...(inner.contradictions?.length ? { contradictions: { policy: "append-renamed" as const, scope: "independent" as const, appended: [...contradictionNames.values()] } } : {}),
    } };
}
