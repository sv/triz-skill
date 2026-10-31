/** Named multiport compositions; every connection uses one exact registered parameter. */
import { z } from "zod";
import type { RegisteredModel } from "./knowledge.js";
const Id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const Qualified = z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/);
const End = z.strictObject({ node: Id, port: Id });
export const ModelConfiguration = z.strictObject({
  nodes: z.array(z.strictObject({ id: Id, model: Qualified })).min(1).max(12),
  wires: z.array(z.strictObject({ from: End, to: End })).max(192),
  inputs: z.array(z.strictObject({ id: Id, targets: z.array(End).min(1).max(32), primary: z.boolean().default(false) })).min(1).max(32),
  outputs: z.array(z.strictObject({ id: Id, from: End, primary: z.boolean().default(false) })).min(1).max(32),
});
export type ModelConfiguration = z.infer<typeof ModelConfiguration>;
export type ResolvedConfiguration = Omit<ModelConfiguration, "inputs" | "outputs"> & {
  inputs: Array<ModelConfiguration["inputs"][number] & { parameter: string }>;
  outputs: Array<ModelConfiguration["outputs"][number] & { parameter: string }>;
  conditions: string[];
};
export function resolveConfiguration(config: ModelConfiguration, models: Map<string, RegisteredModel>): ResolvedConfiguration {
  const unique = (ids: string[], kind: string) => {
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate configuration ${kind}`);
  };
  unique(config.nodes.map(n => n.id), "node");
  unique([...config.inputs, ...config.outputs].map(p => p.id), "boundary port");
  if (config.inputs.filter(p => p.primary).length !== 1 || config.outputs.filter(p => p.primary).length !== 1)
    throw new Error("Configuration requires exactly one primary input and output for named effect discovery");
  const nodes = new Map(config.nodes.map(n => {
    const m = models.get(n.model);
    if (!m) throw new Error(`Configuration references unknown model ${n.model}`);
    return [n.id, m];
  }));
  const parameter = (end: z.infer<typeof End>, side: "inputs" | "outputs") => {
    const p = nodes.get(end.node)?.[side].find(p => p.id === end.port);
    if (!p) throw new Error(`Configuration references unknown ${side} port ${end.node}.${end.port}`);
    return p.parameter;
  };
  const supplied = new Set<string>();
  const supply = (end: z.infer<typeof End>, p: string) => {
    if (parameter(end, "inputs") !== p) throw new Error("Configuration connection changes quantity parameter; equal SI does not supply a cast");
    const key = `${end.node}.${end.port}`;
    if (supplied.has(key)) throw new Error(`Configuration input supplied twice: ${key}`);
    supplied.add(key);
  };
  for (const w of config.wires) supply(w.to, parameter(w.from, "outputs"));
  const inputs = config.inputs.map(p => {
    const ref = parameter(p.targets[0], "inputs");
    for (const end of p.targets) supply(end, ref);
    return { ...p, parameter: ref };
  });
  for (const [id, m] of nodes) for (const p of m.inputs)
    if (!supplied.has(`${id}.${p.id}`)) throw new Error(`Configuration has unsupplied input ${id}.${p.id}`);
  const outputs = config.outputs.map(p => ({ ...p, parameter: parameter(p.from, "outputs") }));
  const needed = new Set(outputs.map(p => p.from.node));
  for (let changed = true; changed;) {
    changed = false;
    for (const w of config.wires) if (needed.has(w.to.node) && !needed.has(w.from.node)) { needed.add(w.from.node); changed = true; }
  }
  if (config.nodes.some(n => !needed.has(n.id))) throw new Error("Configuration contains a node that contributes to no boundary output");
  const primaryNeeded = new Set([outputs.find(p => p.primary)!.from.node]);
  for (let changed = true; changed;) {
    changed = false;
    for (const w of config.wires) if (primaryNeeded.has(w.to.node) && !primaryNeeded.has(w.from.node)) { primaryNeeded.add(w.from.node); changed = true; }
  }
  if (!inputs.find(p => p.primary)!.targets.some(t => primaryNeeded.has(t.node)))
    throw new Error("Configuration primary input does not contribute to its primary output");
  return { ...config, inputs, outputs, conditions: [...new Set([...nodes.values()].flatMap(m => m.conditions))] };
}
