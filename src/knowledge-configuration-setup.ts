/** Expand named configurations into their actual models, keeping every context input explicit. */
import type { FunctionModel } from "./act.js";
import { rewrite } from "./act-rewrite.js";
import { fail, issue } from "./act-issues.js";
import { bindKnowledgeParameters } from "./knowledge-models.js";
import { boundaryMappingComponent } from "./knowledge-boundary-mappings.js";
import type { z } from "zod";
import type { compileKnowledge, RegisteredEffect } from "./knowledge.js";
import type { EffectSetupRequest } from "./knowledge-setup.js";

export function setupConfigurationChain(a: z.infer<typeof EffectSetupRequest>, k: ReturnType<typeof compileKnowledge>, entries: RegisteredEffect[], requested: RegisteredEffect[]) {
  const reject = (path: string, message: string) => fail([issue("invalid-argument", path, message, "Configure constituent nodes with node_declarations['expanded-step/node']; context inputs remain explicit resources.")]);
  if (entries.reduce((n, e) => n + (e.definition.form === "configuration" ? e.definition.configuration.nodes.length + e.definition.configuration.outputs.filter(p => p.mapping).length : 1), 0) > 12)
    return reject("$.chain", "Named configurations expand beyond the 12-component setup limit");
  if (a.declarations && a.declarations.length !== entries.length) return reject("$.declarations", "Declarations must match expanded effect steps");
  const parameters = new Set<string>(), nodes: FunctionModel["boxes"] = [], wires: FunctionModel["wires"] = [];
  for (const e of entries) {
    parameters.add(e.input_parameter!); parameters.add(e.output_parameter!);
    if (e.definition.form !== "configuration") continue;
    for (const n of e.definition.configuration.nodes) {
      const m = k.models.find(m => m.id === n.model)!;
      for (const p of [...m.inputs, ...m.outputs]) parameters.add(p.parameter);
    }
    for (const p of e.definition.configuration.outputs) if (p.mapping) { parameters.add(p.parameter); parameters.add(p.model_parameter); }
  }
  const bound = bindKnowledgeParameters(parameters, a.bindings, k.parameters, a.domain);
  if (!bound.ok) return bound;
  const { carriers } = bound;
  const projections: Array<{ step: number; id: string; mapping: string; from: { box: string; port: string }; box: string }> = [];
  const contexts: Array<{ step: number; id: string; parameter: string; source_port: string }> = [];
  const usedDeclarations = new Set<string>(), ends: Array<{ from: { box: string; port: string }; to: { box: string; port: string } }> = [];
  const modelSources: Array<{ node: string; model: string; conditions: string[]; provenance: unknown; review: unknown; limitations: string[] }> = [];
  const addWire = (from: { box: string; port: string }, to: { box: string; port: string }, parameter: string) => {
    wires.push({ id: `configuration-wire-${wires.length}`, from, to, carrier: parameter, polarity: "useful" });
  };
  for (const [step, e] of entries.entries()) {
    const box = `effect-${step}`;
    if (e.definition.form !== "configuration") {
      nodes.push({ id: box, name: e.name, role: "tool", inputs: [{ id: "in", carrier: e.input_parameter! }], outputs: [{ id: "out", carrier: e.output_parameter! }], ...a.declarations?.[step] });
      ends.push({ to: { box, port: "in" }, from: { box, port: "out" } });
      continue;
    }
    if (Object.keys(a.declarations?.[step] ?? {}).length) return reject(`$.declarations[${step}]`, "A named composition cannot hide an implementation in an opaque effect box");
    const config = e.definition.configuration;
    const end = (p: { node: string; port: string }) => ({ box: `${box}-${p.node}`, port: p.port });
    for (const n of config.nodes) {
      const m = k.models.find(m => m.id === n.model)!;
      const key = `${step}/${n.id}`;
      if (a.node_declarations[key]) usedDeclarations.add(key);
      const instance = bound.instantiate(m, a.node_declarations[key], `$.node_declarations.${key}`);
      if (!instance.ok) return instance;
      nodes.push({ ...instance.component, id: `${box}-${n.id}` });
      modelSources.push({ node: `${box}-${n.id}`, model: m.id, conditions: m.conditions, provenance: m.provenance, review: m.review, limitations: m.limitations });
    }
    for (const w of config.wires) {
      const m = k.models.find(m => m.id === config.nodes.find(n => n.id === w.from.node)!.model)!;
      addWire(end(w.from), end(w.to), m.outputs.find(p => p.id === w.from.port)!.parameter);
    }
    const input = config.inputs.find(p => p.primary)!, output = config.outputs.find(p => p.primary)!;
    // The first target is supplied by the main chain; the same resource can feed further targets.
    for (const p of config.outputs.filter(p => p.mapping)) {
      projections.push({ step, id: p.id, mapping: p.mapping!, from: end(p.from), box: `${box}-observe-${p.id}` });
    }
    ends.push({ to: end(input.targets[0]), from: output.mapping ? { box: `${box}-observe-${output.id}`, port: "out" } : end(output.from) });
    for (const target of input.targets.slice(1)) {
      // Filled below, once the predecessor endpoint is known.
      addWire(step === 0 ? { box: "resource", port: "out" } : ends[step - 1].from, end(target), input.parameter);
    }
    for (const context of config.inputs.filter(p => !p.primary)) {
      const source_port = `context-${step}-${context.id}`;
      contexts.push({ step, id: context.id, parameter: context.parameter, source_port });
      for (const target of context.targets) addWire({ box: "resource", port: source_port }, end(target), context.parameter);
    }
  }
  for (const key of Object.keys(a.node_declarations)) if (!usedDeclarations.has(key)) return reject(`$.node_declarations.${key}`, "Unused configuration node declaration");
  for (const key of Object.keys(a.context_values)) if (!contexts.some(c => `${c.step}/${c.id}` === key)) return reject(`$.context_values.${key}`, "Unused context availability declaration");
  const mappingSources = [];
  for (const p of projections) {
    const mapping = k.boundary_mappings.find(m => m.id === p.mapping)!;
    const from = carriers.find(c => c.id === mapping.input_parameter)!, to = carriers.find(c => c.id === mapping.output_parameter)!;
    try { nodes.push({ ...boundaryMappingComponent(mapping, from, to), id: p.box }); }
    catch (error) { return reject("$.bindings", error instanceof Error ? error.message : "Invalid boundary mapping domains"); }
    addWire(p.from, { box: p.box, port: "in" }, from.id);
    mappingSources.push({ box: p.box, ...mapping });
  }
  const source: FunctionModel["boxes"][number] = { id: "resource", name: "Declared resources and context", role: "environment",
    outputs: [{ id: "out", carrier: entries[0].input_parameter! }, ...contexts.map(c => ({ id: c.source_port, carrier: c.parameter }))] };
  const target: FunctionModel["boxes"][number] = { id: "required", name: "Required output", role: "product", inputs: [{ id: "in", carrier: entries.at(-1)!.output_parameter! }] };
  if (a.boundary) {
    let rows = a.boundary.source_values.map(v => ({ out: v } as Record<string, string>));
    for (const c of contexts) {
      const values = a.context_values[`${c.step}/${c.id}`];
      if (!values) return reject(`$.context_values.${c.step}/${c.id}`, "Finite source availability must explicitly name every context input");
      if (rows.length * values.length > 10000) return reject("$.context_values", "Context availability exceeds 10000 finite combinations");
      rows = rows.flatMap(row => values.map(v => ({ ...row, [c.source_port]: v })));
    }
    source.behavior = rows.map(out => ({ in: {}, out }));
    target.behavior = a.boundary.accepted_values.map(v => ({ in: { in: v }, out: {} }));
  } else if (Object.keys(a.context_values).length) return reject("$.context_values", "Context availability requires explicit main boundary availability too");
  for (const [i, entry] of entries.entries()) addWire(i === 0 ? { box: "resource", port: "out" } : ends[i - 1].from, ends[i].to, entry.input_parameter!);
  addWire(ends.at(-1)!.from, { box: "required", port: "in" }, entries.at(-1)!.output_parameter!);
  const base: FunctionModel = { domain: a.domain, ...(a.system ? { system: a.system } : {}), carriers, boxes: [source, target], wires: [] };
  const step = { delete: {}, add: { boxes: nodes, wires } };
  const applied = rewrite(base, step);
  if (!applied.ok) return applied;
  const sources = new Map<string | number, RegisteredEffect>();
  const collect = (e: RegisteredEffect) => {
    if (sources.has(e.id)) return;
    sources.set(e.id, e);
    if (e.definition.form === "composite") for (const id of e.definition.steps) collect(k.effects.find(e => e.id === id)!);
  };
  requested.forEach(collect);
  const hypotheses = [...new Set([...requested.flatMap(e => e.conditions ?? []), ...entries.flatMap(e => e.conditions ?? []), ...modelSources.flatMap(m => m.conditions), ...mappingSources.flatMap(m => m.conditions)])];
  return { ...applied, verdict: "inserted" as const, rewrite: step, carriersAdded: [],
    effects: entries.map((e, i) => ({ effect: e.id, box: e.definition.form === "configuration" ? `effect-${i}-${e.definition.configuration.nodes[0].id}` : `effect-${i}`,
      nodes: e.definition.form === "configuration" ? e.definition.configuration.nodes.map(n => `effect-${i}-${n.id}`) : [], source: e.source, typed_from: e.typed_from, provenance: "catalogue-verified" })),
    unmetConditions: hypotheses.filter(c => !a.conditions.includes(c)),
    setup: { parameter_ids: [entries[0].input_parameter!, ...entries.map(e => e.output_parameter!)], effect_ids: a.chain,
      expanded_effect_ids: entries.map(e => e.id), context_inputs: contexts, model_sources: modelSources, boundary_mappings: mappingSources,
      sources: [...sources.values()].map(e => ({ id: e.id, definition: e.definition, provenance: e.provenance, review: e.review, limitations: e.limitations })) },
    note: "Named compositions expand to registered constituent models. Context outputs are required hypotheses, not guaranteed available resources; no behavior, state, feasibility or physical equivalence is inferred. Replay rewrite against the model restricted to resource/required boxes." };
}
