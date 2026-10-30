import { z } from "zod";
import { dimensionConflict } from "./act-dimensions.js";
import { Carrier, Flow, FunctionModel, Polarity, Role, checkModel, sameCarrier } from "./act.js";
import { at, fail, issue, type Issue } from "./act-issues.js";
import { lintModel } from "./act-lint.js";
import { Pending, SourceLocation, ModelProvenance, Decision, confirmProvenance, hierarchyProblems } from "./act-provenance.js";

const Id = z.string().min(1);
export const BuildModelRequest = z.strictObject({
  domain: FunctionModel.shape.domain,
  system: z.string().optional(),
  components: z.array(z.strictObject({ id: Id, name: Id, role: Role, source: SourceLocation.optional() })),
  interactions: z.array(z.strictObject({ subject: Id, action: Id, object: Id, carrier: Carrier, polarity: Polarity, source: SourceLocation.optional() })),
  flows: z.array(Flow).optional(),
  draft: z.strictObject({ pending: z.array(Pending).min(1) }).optional(),
  hierarchy: z.array(z.strictObject({parent:Id,child:Id,source:SourceLocation})).optional(),
});
export type BuildModelRequest = z.infer<typeof BuildModelRequest>;

type Interaction = BuildModelRequest["interactions"][number];
/**
 * Readable generated ids: the kind and the parts joined by ':', each part percent-escaped ('%' as
 * '%25', ':' as '%3A'). An escaped part contains no ':', so splitting at ':' recovers the parts and
 * unescaping each recovers the ids: distinct tuples never share an id, whatever the user ids hold.
 * The Id schema only requires a nonempty string, so nothing else needs escaping.
 */
const escape = (part: string) => part.replace(/[%:]/g, (c) => (c === "%" ? "%25" : "%3A"));
const tupleId = (kind: "in" | "out" | "wire", ...parts: string[]) => [kind, ...parts.map(escape)].join(":");
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** One input port per incoming interaction, so no input port is fed by two functions (no fan-in);
 *  the object is the port's box, so carrier, subject and action identify the interaction there. */
const inPort = (i: Interaction) => tupleId("in", i.carrier.id, i.subject, i.action);
/** One output port per (subject, carrier): its functions fan out from one shared port. */
const outPort = (carrier: string) => tupleId("out", carrier);
const wireId = (i: Interaction) => tupleId("wire", i.subject, i.action, i.object, i.carrier.id);
const identity = (i: Interaction) => JSON.stringify([i.subject, i.action, i.object, i.carrier.id]);
// Values form a set; levels remain ordered thresholds. Omitted quantity and explicit
// intensive both mean the default shared quantity, so emit one canonical representation.
const normalizeCarrier = (c: z.infer<typeof Carrier>): z.infer<typeof Carrier> => ({
  id: c.id, layer: c.layer, dimension: c.dimension,
  ...(c.energy === undefined ? {} : { energy:c.energy }),
  ...(c.effect_quantity === undefined ? {} : { effect_quantity: c.effect_quantity }),
  ...(c.si === undefined ? {} : { si: c.si }),
  ...(c.unit === undefined ? {} : { unit: c.unit }),
  ...(c.values === undefined ? {} : { values: [...c.values].sort(cmp) }),
  ...(c.levels === undefined ? {} : { levels: c.levels.map(l => ({ ...l })) }),
  ...(c.quantity === "extensive" ? { quantity: "extensive" as const } : {}),
  ...(c.loss === undefined ? {} : { loss: c.loss }),
});

/** Build only what the table declares. No behavior or function rating is inferred. */
export function buildModel(input: BuildModelRequest) {
  const issues: Issue[] = [];
  if (input.draft && (input.components.some(c => !c.source) || input.interactions.some(i => !i.source)))
    return fail([issue("invalid-import-provenance", "$.draft", "every draft component and interaction needs a source location", "Supply source for every draft entry.")]);
  if (!input.draft && (input.components.some(c => c.source) || input.interactions.some(i => i.source) || input.hierarchy))
    return fail([issue("invalid-import-provenance", "$.draft", "source-bearing builder entries must remain a draft", "Supply draft.pending for the review items.")]);
  const components = new Map<string, number>();
  input.components.forEach((c, index) => {
    if (components.has(c.id)) issues.push(issue("duplicate-id", at("$", "components", index, "id"), `duplicate component id '${c.id}'`, "Give each component a unique id."));
    else components.set(c.id, index);
  });
  const parents = new Map<string, string>();
  input.hierarchy?.forEach((edge, index) => {
    if (!components.has(edge.parent) || !components.has(edge.child)) issues.push(issue("unknown-box", at("$", "hierarchy", index), "hierarchy names an unknown component", "Name declared components as parent and child."));
    if (parents.has(edge.child)) issues.push(issue("invalid-import-provenance", at("$", "hierarchy", index), "a component has more than one hierarchy parent", "Give each child at most one parent."));
    else parents.set(edge.child, edge.parent);
  });
  const visited = new Set<string>();
  for (const id of parents.keys()) {
    const active = new Set<string>();
    let next: string | undefined = id;
    while (next !== undefined && !visited.has(next)) {
      if (active.has(next)) { issues.push(issue("invalid-import-provenance", "$.hierarchy", "hierarchy contains a cycle", "Remove the parent cycle.")); break; }
      active.add(next); next = parents.get(next);
    }
    for (const seen of active) visited.add(seen);
  }
  const carriers = new Map<string, { carrier: z.infer<typeof Carrier>; index: number }>();
  const interactions = new Map<string, number>();
  input.interactions.forEach((i, index) => {
    for (const side of ["subject", "object"] as const) if (!components.has(i[side])) {
      issues.push(issue("unknown-box", at("$", "interactions", index, side), `unknown component '${i[side]}'`, "Use a declared component id."));
    }
    const existing = carriers.get(i.carrier.id);
    if (existing && !sameCarrier(existing.carrier, i.carrier)) {
      issues.push(issue(dimensionConflict(existing.carrier.si, i.carrier.si) ? "dimension-mismatch" : "carrier-mismatch", at("$", "interactions", index, "carrier"), `conflicting declarations of carrier '${i.carrier.id}'`, `Use the same carrier descriptor as interactions[${existing.index}].carrier, or give the different carrier a distinct id.`));
    } else if (!existing) carriers.set(i.carrier.id, { carrier: normalizeCarrier(i.carrier), index });
    const key = identity(i), prior = interactions.get(key);
    if (prior !== undefined) issues.push(issue("duplicate-id", at("$", "interactions", index), `duplicate interaction (also interactions[${prior}])`, "List a subject, action, object and carrier combination once; resolve any conflicting polarity explicitly."));
    else interactions.set(key, index);
  });
  if (issues.length) return fail(issues);

  const orderedInteractions = input.interactions.map((i, index) => ({ i, index })).sort((a, b) => cmp(identity(a.i), identity(b.i)));
  const orderedComponents = input.components.map((c, index) => ({ c, index })).sort((a, b) => cmp(a.c.id, b.c.id));
  const orderedCarriers = [...carriers.values()].sort((a, b) => cmp(a.carrier.id, b.carrier.id));
  const orderedFlows = (input.flows ?? []).map((flow, index) => ({ flow, index })).sort((a, b) => cmp(a.flow.id, b.flow.id));
  // Input ports: one per interaction into the box, ordered by carrier, subject, then action.
  // Output ports: one per carrier the box sends, shared by the functions that fan out from it.
  const ports = new Map<string, { ins: Interaction[]; outs: Set<string> }>();
  for (const id of components.keys()) ports.set(id, { ins: [], outs: new Set() });
  for (const { i } of orderedInteractions) {
    ports.get(i.object)!.ins.push(i);
    ports.get(i.subject)!.outs.add(i.carrier.id);
  }
  const inOrder = (i: Interaction) => JSON.stringify([i.carrier.id, i.subject, i.action]);
  const model: FunctionModel = {
    domain: input.domain, ...(input.system === undefined ? {} : { system: input.system }),
    carriers: orderedCarriers.map(({ carrier }) => carrier),
    boxes: orderedComponents.map(({ c }) => {
      const { ins, outs } = ports.get(c.id)!;
      const { source: _source, ...component } = c;
      return { ...component,
        inputs: [...ins].sort((a, b) => cmp(inOrder(a), inOrder(b))).map((i) => ({ id: inPort(i), carrier: i.carrier.id })),
        outputs: [...outs].sort(cmp).map((id) => ({ id: outPort(id), carrier: id })) };
    }),
    wires: orderedInteractions.map(({ i }) => ({ id: wireId(i), from: { box: i.subject, port: outPort(i.carrier.id) }, to: { box: i.object, port: inPort(i) }, carrier: i.carrier.id, polarity: i.polarity, verb: i.action })),
    ...(input.flows === undefined ? {} : { flows: orderedFlows.map(({ flow }) => flow) }),
  };
  // Diagnostics on generated elements point to the table entry that generated them.
  const inputPath = (path: string) => path.replace(/^\$\.model\.(carriers|boxes|wires|flows)\[(\d+)\]([^]*)$/, (_match, kind: string, n: string, suffix: string) => {
    const index = Number(n);
    if (kind === "carriers") return `$.interactions[${orderedCarriers[index].index}].carrier${suffix}`;
    if (kind === "flows") return `$.flows[${orderedFlows[index].index}]${suffix}`;
    if (kind === "boxes") return `$.components[${orderedComponents[index].index}]`;
    const field = suffix === ".polarity" ? ".polarity" : suffix === ".carrier" ? ".carrier" : "";
    return `$.interactions[${orderedInteractions[index].index}]${field}`;
  });
  const checked = checkModel(model, "$.model");
  if (!checked.ok) return fail(checked.issues.map((i) => ({ ...i, path: inputPath(i.path) })));
  const warnings = lintModel(model, "$.model").map((w) => ({ ...w, path: inputPath(w.path) }));
  if (input.draft) {
    const result = ModelProvenance.safeParse({status:"draft", components:orderedComponents.map(({c}) => ({id:c.id,source:c.source})),
      interactions:orderedInteractions.map(({i}) => ({wireId:wireId(i),source:i.source})), ...(input.hierarchy ? {hierarchy:input.hierarchy} : {}), pending:input.draft.pending});
    if (!result.success) return fail([issue("invalid-import-provenance", "$.draft", "invalid draft provenance or duplicate pending ids", "Provide a unique id for every pending review item.")]);
    Object.assign(model, {provenance:result.data});
  }


  const ids = orderedComponents.map(({ c }) => c.id), touched = new Set<string>(), pairs = new Set<string>();
  const reached = new Set<string>();
  for (const { i } of orderedInteractions) {
    touched.add(i.subject); touched.add(i.object);
    if (i.subject !== i.object) {
      pairs.add(JSON.stringify([i.subject, i.object].sort(cmp)));
      reached.add(i.object);
    }
  }
  const missingPairCount = ids.length * (ids.length - 1) / 2 - pairs.size;
  const missingPairs: string[][] = [];
  outer: for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    if (!pairs.has(JSON.stringify([ids[a], ids[b]]))) missingPairs.push([ids[a], ids[b]]);
    if (missingPairs.length === 100) break outer;
  }
  const products = orderedComponents.filter(({ c }) => c.role === "product").map(({ c }) => ({ id: c.id, reached: reached.has(c.id) }));
  return { ok: true as const, model, ...(input.hierarchy ? {hierarchy: input.hierarchy} : {}), warnings, completeness: {
    missingPairs, missingPairCount, missingPairsTruncated: missingPairCount > missingPairs.length,
    isolatedComponents: ids.filter((id) => !touched.has(id)), products,
    note: "Missing pairs are unrecorded, not necessarily missing functions; not every pair needs to interact. Isolation counts any interaction, including self-interactions. A product is reached when an interaction from another component acts on it, regardless of polarity; this does not establish a useful deliverable. An empty products list means no product was declared.",
  } };
}

/** Confirm every pending item explicitly. This records an analyst assertion, not proof. */
export function reviewImportedModel(model: FunctionModel, decisions: z.infer<typeof Decision>[]) {
  const raw = (model as FunctionModel & {provenance?: unknown}).provenance;
  const parsed = ModelProvenance.safeParse(raw);
  if (!parsed.success) return fail([issue("invalid-import-provenance", "$.model.provenance", "missing or invalid draft provenance", "Supply a model returned by the draft builder.")]);
  const {provenance: _provenance, ...structural} = model as FunctionModel & {provenance?: unknown};
  const checked = checkModel(structural as FunctionModel, "$.model");
  if (!checked.ok) return fail(checked.issues);
  const reviewed = confirmProvenance(parsed.data, decisions);
  if (!reviewed.ok) return fail([issue("invalid-import-provenance", "$.decisions", reviewed.errors.join("; "), "Give one explicit confirm decision for every pending item and no others; edit the model before confirming.")]);
  const componentIds = new Set(model.boxes.map(b => b.id)), wireIds = new Set(model.wires.map(w => w.id));
  const sourcedComponents = new Set(reviewed.provenance.components.map(c => c.id)), sourcedWires = new Set(reviewed.provenance.interactions.map(i => i.wireId));
  const hierarchyErrors = hierarchyProblems(reviewed.provenance.hierarchy ?? [], componentIds);
  if (hierarchyErrors.length) return fail([issue("invalid-import-provenance", "$.model.provenance.hierarchy", hierarchyErrors.join("; "), "Restore valid containment between current model boxes before review.")]);
  if ([...sourcedComponents].some(id => !componentIds.has(id)) || [...sourcedWires].some(id => !wireIds.has(id)) || [...componentIds].some(id => !sourcedComponents.has(id)) || [...wireIds].some(id => !sourcedWires.has(id)))
    return fail([issue("invalid-import-provenance", "$.model.provenance", "provenance must cover every model element and refer only to existing elements", "Restore missing source locations or remove stale references before review.")]);
  return {ok:true as const, model:{...model,provenance:reviewed.provenance}, note:"The analyst reviewed the listed assumptions; this does not prove physical behavior."};
}
