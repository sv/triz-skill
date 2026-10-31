/** Lower registered effects to open diagrams, then use the kernel's checked substitution. */
import type { FunctionModel } from "./act.js";
import { substitute } from "./act-hierarchy.js";
import { allocated } from "./act-effect-insert.js";
import { rewrite } from "./act-rewrite.js";
import { fail, issue } from "./act-issues.js";
import { bindKnowledgeParameters } from "./knowledge-models.js";
import { boundaryMappingComponent } from "./knowledge-boundary-mappings.js";
import type { z } from "zod";
import type { compileKnowledge, RegisteredEffect, RegisteredBoundaryMapping } from "./knowledge.js";
import type { EffectSetupRequest } from "./knowledge-setup.js";

type Endpoint = FunctionModel["wires"][number]["from"];
export function setupConfigurationChain(a: z.infer<typeof EffectSetupRequest>, k: ReturnType<typeof compileKnowledge>, entries: RegisteredEffect[], requested: RegisteredEffect[]) {
  const reject = (path: string, message: string) => fail([issue("invalid-argument", path, message, "Configure constituent nodes with node_declarations['expanded-step/node']; context inputs remain explicit resources.")]);
  const named = entries.some(e => e.definition.form === "configuration");
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
  const contexts: Array<{ step: number; id: string; parameter: string; source_port: string }> = [];
  const usedDeclarations = new Set<string>(), ends: Array<{ from: Endpoint; to: Endpoint }> = [];
  const modelSources: Array<{ node: string; model: string; conditions: string[]; provenance: unknown; review: unknown; limitations: string[] }> = [];
  const mappingSources: Array<RegisteredBoundaryMapping & { box: string }> = [];
  const shells: Array<{ step: number; box: string; sources: typeof modelSources; observations: typeof mappingSources }> = [];
  const names = new Map<string, Record<string, string>>();
  const scope = (step: number) => `${named ? "effect-" : "effect-box-"}${step}`;
  const addWire = (from: Endpoint, to: Endpoint, carrier: string) => wires.push({
    id: `${named ? "configuration" : "effect"}-wire-${wires.length}`, from, to, carrier, polarity: "useful" });
  for (const [step, e] of entries.entries()) {
    const box = scope(step);
    if (e.definition.form !== "configuration") {
      nodes.push({ id: box, name: e.name, role: "tool", inputs: [{ id: "in", carrier: e.input_parameter! }], outputs: [{ id: "out", carrier: e.output_parameter! }], ...a.declarations?.[step] });
      ends.push({ to: { box, port: "in" }, from: { box, port: "out" } });
      continue;
    }
    if (Object.keys(a.declarations?.[step] ?? {}).length) return reject(`$.declarations[${step}]`, "A named composition cannot hide an implementation in an opaque effect box");
    const config = e.definition.configuration, sources: typeof modelSources = [], observations: typeof mappingSources = [];
    const inner: FunctionModel = { domain: a.domain, carriers, boxes: [], wires: [] };
    for (const n of config.nodes) {
      const m = k.models.find(m => m.id === n.model)!, key = `${step}/${n.id}`;
      if (a.node_declarations[key]) usedDeclarations.add(key);
      const instance = bound.instantiate(m, a.node_declarations[key], `$.node_declarations.${key}`);
      if (!instance.ok) return instance;
      inner.boxes.push({ ...instance.component, id: n.id });
      sources.push({ node: n.id, model: m.id, conditions: m.conditions, provenance: m.provenance, review: m.review, limitations: m.limitations });
    }
    const connect = (from: Endpoint, to: Endpoint) => inner.wires.push({ id: `wire-${inner.wires.length}`, from, to,
      carrier: inner.boxes.find(b => b.id === from.box)!.outputs!.find(p => p.id === from.port)!.carrier, polarity: "useful" });
    for (const w of config.wires) connect({ box: w.from.node, port: w.from.port }, { box: w.to.node, port: w.to.port });
    const observationId = allocated("observe-", inner.boxes.map(b => b.id));
    let observed;
    try { observed = config.outputs.map(p => {
      const from = { box: p.from.node, port: p.from.port };
      if (!p.mapping) return { ...p, end: from };
      const mapping = k.boundary_mappings.find(m => m.id === p.mapping)!, id = observationId();
      inner.boxes.push({ ...boundaryMappingComponent(mapping, carriers.find(c => c.id === p.model_parameter)!, carriers.find(c => c.id === p.parameter)!), id });
      connect(from, { box: id, port: "in" }); observations.push({ ...mapping, box: id });
      return { ...p, end: { box: id, port: "out" } };
    }); } catch (error) { return reject("$.bindings", error instanceof Error ? error.message : "Invalid boundary mapping domains"); }
    // The hierarchy interface is one-to-one. Shared resources use separate pins fed by the
    // same outer source; repeated output aliases share a single pin. Hidden outputs stay explicit.
    const inputs = config.inputs.flatMap(p => p.targets.map((t, i) => ({ id: `input-${p.id}-${i}`, carrier: p.parameter,
      inner: { box: t.node, port: t.port } })));
    const outputs = new Map<string, { id: string; carrier: string; inner: Endpoint }>();
    for (const b of inner.boxes) for (const p of b.outputs ?? []) {
      const end = { box: b.id, port: p.id };
      if (!inner.wires.some(w => w.from.box === b.id && w.from.port === p.id) || observed.some(p => p.end.box === b.id && p.end.port === end.port))
        outputs.set(JSON.stringify(end), { id: `output-${outputs.size}`, carrier: p.carrier, inner: end });
    }
    const outputPorts = [...outputs.values()];
    nodes.push({ id: box, name: e.name, role: "tool", inputs: inputs.map(({ inner, ...p }) => p), outputs: outputPorts.map(({ inner, ...p }) => p),
      inner: { model: inner, inputs: inputs.map(p => ({ outer: p.id, inner: p.inner })), outputs: outputPorts.map(p => ({ outer: p.id, inner: p.inner })) } });
    const input = config.inputs.find(p => p.primary)!, output = observed.find(p => p.primary)!;
    ends.push({ to: { box, port: `input-${input.id}-0` }, from: { box, port: outputs.get(JSON.stringify(output.end))!.id } });
    for (const [i] of input.targets.entries()) if (i > 0)
      addWire(step === 0 ? { box: "resource", port: "out" } : ends[step - 1].from, { box, port: `input-${input.id}-${i}` }, input.parameter);
    for (const context of config.inputs.filter(p => !p.primary)) {
      const source_port = `context-${step}-${context.id}`;
      contexts.push({ step, id: context.id, parameter: context.parameter, source_port });
      for (const [i] of context.targets.entries()) addWire({ box: "resource", port: source_port }, { box, port: `input-${context.id}-${i}` }, context.parameter);
    }
    shells.push({ step, box, sources, observations });
  }
  for (const key of Object.keys(a.node_declarations)) if (!usedDeclarations.has(key)) return reject(`$.node_declarations.${key}`, "Unused configuration node declaration");
  for (const key of Object.keys(a.context_values)) if (!contexts.some(c => `${c.step}/${c.id}` === key)) return reject(`$.context_values.${key}`, "Unused context availability declaration");
  const source: FunctionModel["boxes"][number] = { id: "resource", name: named ? "Declared resources and context" : "Declared resource", role: "environment",
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
  let model: FunctionModel = { ...base, boxes: [...base.boxes, ...nodes], wires };
  for (const shell of shells) {
    const expanded = substitute(model, shell.box);
    if (!expanded.ok) return expanded;
    model = expanded.model; names.set(shell.box, expanded.boxNames);
    modelSources.push(...shell.sources.map(s => ({ ...s, node: expanded.boxNames[s.node] })));
    mappingSources.push(...shell.observations.map(m => ({ ...m, box: expanded.boxNames[m.box] })));
  }
  const step = { delete: {}, add: { boxes: model.boxes.slice(2), wires: model.wires } }, applied = rewrite(base, step);
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
    effects: entries.map((e, i) => ({ effect: e.id, box: e.definition.form === "configuration" ? names.get(scope(i))![e.definition.configuration.nodes[0].id] : scope(i),
      ...(named ? { nodes: e.definition.form === "configuration" ? e.definition.configuration.nodes.map(n => names.get(scope(i))![n.id]) : [] } : {}), source: e.source, typed_from: e.typed_from, provenance: "catalogue-verified" })),
    unmetConditions: hypotheses.filter(c => !a.conditions.includes(c)),
    setup: { parameter_ids: [entries[0].input_parameter!, ...entries.map(e => e.output_parameter!)], effect_ids: a.chain,
      expanded_effect_ids: entries.map(e => e.id), ...(named ? { context_inputs: contexts, model_sources: modelSources, boundary_mappings: mappingSources } : {}),
      sources: [...sources.values()].map(e => ({ id: e.id, definition: e.definition, provenance: e.provenance, review: e.review, limitations: e.limitations })) },
    note: "Registered effects compose as typed open diagrams; named configurations use checked hierarchy substitution. Context availability and implementation behavior remain explicit declarations. Replay rewrite against the resource/required boundary." };
}
