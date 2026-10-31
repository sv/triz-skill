/** Typed effect chains are hypotheses, checked only as wiring diagrams. */
import { z } from "zod";
import {
  FunctionModel,
  Carrier,
  checkModel,
  type FunctionModel as Model,
} from "./act.js";
import { SI, sameDimension } from "./act-dimensions.js";
import { fail, issue, at } from "./act-issues.js";
export const EffectField = z.enum([
  "mechanical",
  "acoustic",
  "thermal",
  "chemical",
  "electric",
  "magnetic",
  "optical",
  "gravitational",
  "information",
]);
export const EffectPort = z.strictObject({
  quantity: z.string().min(1),
  si: SI.optional(),
});
export const TypedEffect = z.strictObject({
  id: z.union([z.string().min(1), z.number().int()]),
  name: z.string(),
  input: EffectPort,
  output: EffectPort,
  field: EffectField,
  conditions: z.array(z.string()),
  source: z.string().min(1),
  typed_from: z.enum(["source", "statement"]),
});
export type TypedEffect = z.infer<typeof TypedEffect>;
export const EffectChainsRequest = z.strictObject({
  model: FunctionModel.optional(),
  resources: z.array(EffectPort).optional(),
  output: EffectPort,
  effects: z.array(TypedEffect).max(10_000).optional(),
  conditions: z.array(z.string()).default([]),
  k: z.number().int().min(0).max(12).default(4),
  min_length: z.number().int().min(0).max(12).default(0)
    .describe("Minimum number of effects; use 1 to search nonempty chains between the same input/output type"),
  max_steps: z.number().int().min(1).max(1_000_000).default(20_000),
  limit: z.number().int().min(1).max(1000).default(50),
});
type Port = z.infer<typeof EffectPort>;
const matches = (a: Port, b: Port) =>
  a.quantity === b.quantity &&
  (b.si === undefined || (a.si !== undefined && sameDimension(a.si, b.si)));
function diagram(resource: Port, chain: TypedEffect[]): Model {
  const ports = [resource, ...chain.map((e) => e.output)];
  const carriers = ports.map((p, i) => ({
    id: `c${i}`,
    layer: "information" as const,
    dimension: p.quantity,
    ...(p.si === undefined ? {} : { si: p.si }),
  }));
  // Each junction uses one canonical carrier for both connected ports. Quantity
  // compatibility was checked before construction, independently of generated ids.
  const boxes: Model["boxes"] = [
    {
      id: "resource",
      name: resource.quantity,
      role: "environment",
      outputs: [{ id: "out", carrier: "c0" }],
    },
  ];
  chain.forEach((e, i) =>
    boxes.push({
      id: `e${i}`,
      name: e.name,
      role: "tool",
      inputs: [{ id: "in", carrier: `c${i}` }],
      outputs: [{ id: "out", carrier: `c${i + 1}` }],
    }),
  );
  boxes.push({
    id: "required",
    name: ports.at(-1)!.quantity,
    role: "product",
    inputs: [{ id: "in", carrier: `c${chain.length}` }],
  });
  const sources = ["resource", ...chain.map((_, i) => `e${i}`)],
    targets = [...chain.map((_, i) => `e${i}`), "required"];
  return {
    domain: "physical",
    carriers,
    boxes,
    wires: sources.map((box, i) => ({
      id: `w${i}`,
      from: { box, port: "out" },
      to: { box: targets[i], port: "in" },
      carrier: `c${i}`,
      polarity: "useful",
    })),
  };
}
/** Complete search precedes display truncation. On a cap no ranking is claimed. */
export function effectChains(
  raw: z.input<typeof EffectChainsRequest>,
  catalogue: TypedEffect[] = [],
) {
  const parsed = EffectChainsRequest.safeParse(raw);
  if (!parsed.success)
    return fail(
      parsed.error.issues.map((e) =>
        issue(
          "invalid-argument",
          at(
            "$",
            ...e.path.map((x) => (typeof x === "number" ? x : String(x))),
          ),
          e.message,
          "Use the typed effect-chain schema.",
        ),
      ),
    );
  const a = parsed.data;
  if (a.min_length > a.k)
    return fail([issue("invalid-argument", "$.min_length", "Minimum chain length exceeds k", "Use min_length <= k.")]);
  if (a.model) {
    const c = checkModel(a.model, "$.model");
    if (!c.ok) return fail(c.issues);
  }
  const resources =
    a.resources ??
    a.model?.carriers
      .filter((c) => c.effect_quantity !== undefined)
      .map((c) => ({
        quantity: c.effect_quantity!,
        ...(c.si === undefined ? {} : { si: c.si }),
      }));
  if (!resources?.length)
    return fail([
      issue(
        "invalid-argument",
        a.resources !== undefined || !a.model ? "$.resources" : "$.model.carriers",
        "No resources declared",
        "Supply resources, or a model whose carriers name the available quantities.",
      ),
    ]);
  const library = a.effects ?? catalogue,
    met = new Set(a.conditions);
  let steps = 0;
  const found: Array<{
    effects: TypedEffect[];
    resource: Port;
    conditionsMet: number;
    unmetConditions: string[];
    fieldChanges: number;
    model: Model;
  }> = [];
  const visit = (resource: Port, current: Port, chain: TypedEffect[]) => {
    if (chain.length >= a.k) return;
    for (const effect of library) {
      if (++steps > a.max_steps) throw new Error("cap");
      if (chain.some(e => e.id === effect.id)) continue;
      if (!matches(current, effect.input)) continue;
      const next = [...chain, effect];
      if (next.length >= a.min_length && matches(effect.output, a.output)) {
        const model = diagram(resource, next);
        if (!checkModel(model).ok) throw new Error("ill-typed effect diagram");
        const conditions = [...new Set(next.flatMap((e) => e.conditions))];
        found.push({
          effects: next,
          resource,
          conditionsMet: conditions.filter((c) => met.has(c)).length,
          unmetConditions: conditions.filter((c) => !met.has(c)),
          fieldChanges: next
            .slice(1)
            .filter((e, i) => e.field !== next[i].field).length,
          model,
        });
      }
      if (next.length < a.k) visit(resource, effect.output, next);
    }
  };
  try {
    for (const resource of resources) {
      if (++steps > a.max_steps) throw new Error("cap");
      if (a.min_length === 0 && matches(resource, a.output)) {
        const model = diagram(resource, []);
        if (!checkModel(model).ok)
          throw new Error("ill-typed effect identity diagram");
        found.push({
          effects: [],
          resource,
          conditionsMet: 0,
          unmetConditions: [],
          fieldChanges: 0,
          model,
        });
      }
      visit(resource, resource, []);
    }
  } catch (e) {
    if (e instanceof Error && e.message === "cap")
      return {
        ok: true as const,
        verdict: "undecided",
        reason: "effect-chain-cap",
        steps,
        chains: [],
        basis: [],
      };
    throw e;
  }
  found.sort(
    (a, b) =>
      a.effects.length - b.effects.length ||
      b.conditionsMet - a.conditionsMet ||
      a.fieldChanges - b.fieldChanges,
  );
  return {
    ok: true as const,
    verdict: found.length ? "chains" : "none",
    steps,
    count: found.length,
    truncated: found.length > a.limit,
    chains: found.slice(0, a.limit),
    basis: [],
    note: "Typed wiring hypotheses only. Magnitudes, efficiency, scale, missing resources, and physical sufficiency require substantiation.",
  };
}

/** Optional suggestions share one budget and draw resources only from each
 * unknown tool's declared inputs, never from the output being explained. */
export function inferredEffectHints(model: Model, catalogue: TypedEffect[] | (() => TypedEffect[]), maxSteps = 20_000) {
  const carriers = new Map<string, Model["carriers"][number]>();
  const hints: Array<{box:string;port:string;search:ReturnType<typeof effectChains>}> = [];
  let work = 0;
  let library: TypedEffect[] | undefined;
  for (const c of model.carriers) {
    if (++work > maxSteps) return {hints,complete:false,work};
    carriers.set(c.id,c);
  }
  for (const b of model.boxes) {
    if (++work > maxSteps) return {hints,complete:false,work};
    if (!["tool","mediator"].includes(b.role) || b.behavior || b.transition) continue;
    for (const p of b.outputs ?? []) {
      if (++work > maxSteps) return {hints,complete:false,work};
      const c = carriers.get(p.carrier)!;
      if (!c.effect_quantity) continue;
      const resources: Port[] = [];
      for (const p of b.inputs ?? []) {
        if (++work > maxSteps) return {hints,complete:false,work};
        const input = carriers.get(p.carrier)!;
        if (input.effect_quantity && input.effect_quantity !== c.effect_quantity)
          resources.push({quantity:input.effect_quantity,...(input.si ? {si:input.si}: {})});
      }
      if (!resources.length) continue;
      library ??= typeof catalogue === "function" ? catalogue() : catalogue;
      const search = effectChains({resources,output:{quantity:c.effect_quantity,si:c.si},max_steps:Math.max(1,maxSteps-work)},library);
      if (search.ok) work += search.steps;
      hints.push({box:b.id,port:p.id,search});
      if (work >= maxSteps || (search.ok && search.verdict === "undecided")) return {hints,complete:false,work};
    }
  }
  return {hints,complete:true,work};
}
