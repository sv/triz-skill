import { z } from "zod";
import { Carrier, Flow, FunctionModel, Polarity, Role, checkModel } from "./act.js";
import { at, fail, issue, type Issue } from "./act-issues.js";
import { lintModel } from "./act-lint.js";

const Id = z.string().min(1);
export const BuildModelRequest = z.strictObject({
  domain: FunctionModel.shape.domain,
  system: z.string().optional(),
  components: z.array(z.strictObject({ id: Id, name: Id, role: Role })),
  interactions: z.array(z.strictObject({ subject: Id, action: Id, object: Id, carrier: Carrier, polarity: Polarity })),
  flows: z.array(Flow).optional(),
});
export type BuildModelRequest = z.infer<typeof BuildModelRequest>;

// JSON escapes lone surrogates before UTF-8 encoding; unlike concatenation or a hash this
// is an injective encoding of the whole tuple, even for punctuation and arbitrary user IDs.
const tupleId = (kind: string, ...parts: string[]) => `${kind}_${Buffer.from(JSON.stringify(parts)).toString("base64url")}`;
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const portId = (side: "in" | "out", carrier: string) => tupleId(side, carrier);
const identity = (i: BuildModelRequest["interactions"][number]) => JSON.stringify([i.subject, i.action, i.object, i.carrier.id]);
// Values form a set; levels remain ordered thresholds. Omitted quantity and explicit
// intensive both mean the default shared quantity, so emit one canonical representation.
const normalizeCarrier = (c: z.infer<typeof Carrier>): z.infer<typeof Carrier> => ({
  id: c.id, layer: c.layer, dimension: c.dimension,
  ...(c.values === undefined ? {} : { values: [...c.values].sort(cmp) }),
  ...(c.levels === undefined ? {} : { levels: c.levels.map(({ value, from }) => ({ value, from })) }),
  ...(c.quantity === "extensive" ? { quantity: "extensive" as const } : {}),
});
const carrierKey = (c: z.infer<typeof Carrier>) => JSON.stringify(normalizeCarrier(c));

/** Build only what the table declares. No behavior or function rating is inferred. */
export function buildModel(input: BuildModelRequest) {
  const issues: Issue[] = [];
  const components = new Map<string, number>();
  input.components.forEach((c, index) => {
    if (components.has(c.id)) issues.push(issue("duplicate-id", at("$", "components", index, "id"), `duplicate component id '${c.id}'`, "Give each component a unique id."));
    else components.set(c.id, index);
  });
  const carriers = new Map<string, { carrier: z.infer<typeof Carrier>; index: number }>();
  const interactions = new Map<string, number>();
  input.interactions.forEach((i, index) => {
    for (const side of ["subject", "object"] as const) if (!components.has(i[side])) {
      issues.push(issue("unknown-box", at("$", "interactions", index, side), `unknown component '${i[side]}'`, "Use a declared component id."));
    }
    const existing = carriers.get(i.carrier.id);
    if (existing && carrierKey(existing.carrier) !== carrierKey(i.carrier)) {
      issues.push(issue("carrier-mismatch", at("$", "interactions", index, "carrier"), `conflicting declarations of carrier '${i.carrier.id}'`, `Use the same carrier descriptor as interactions[${existing.index}].carrier, or give the different carrier a distinct id.`));
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
  const ports = new Map<string, { ins: Set<string>; outs: Set<string> }>();
  for (const id of components.keys()) ports.set(id, { ins: new Set(), outs: new Set() });
  for (const { i } of orderedInteractions) {
    ports.get(i.object)!.ins.add(i.carrier.id);
    ports.get(i.subject)!.outs.add(i.carrier.id);
  }
  const model: FunctionModel = {
    domain: input.domain, ...(input.system === undefined ? {} : { system: input.system }),
    carriers: orderedCarriers.map(({ carrier }) => carrier),
    boxes: orderedComponents.map(({ c }) => {
      const { ins, outs } = ports.get(c.id)!;
      return { ...c, inputs: [...ins].sort(cmp).map((id) => ({ id: portId("in", id), carrier: id })), outputs: [...outs].sort(cmp).map((id) => ({ id: portId("out", id), carrier: id })) };
    }),
    wires: orderedInteractions.map(({ i }) => ({ id: tupleId("wire", i.subject, i.action, i.object, i.carrier.id), from: { box: i.subject, port: portId("out", i.carrier.id) }, to: { box: i.object, port: portId("in", i.carrier.id) }, carrier: i.carrier.id, polarity: i.polarity, verb: i.action })),
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
  return { ok: true as const, model, warnings, completeness: {
    missingPairs, missingPairCount, missingPairsTruncated: missingPairCount > missingPairs.length,
    isolatedComponents: ids.filter((id) => !touched.has(id)), products,
    note: "Missing pairs are unrecorded, not necessarily missing functions; not every pair needs to interact. Isolation counts any interaction, including self-interactions. A product is reached when an interaction from another component acts on it, regardless of polarity; this does not establish a useful deliverable. An empty products list means no product was declared.",
  } };
}
