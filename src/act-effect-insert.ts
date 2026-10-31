/** Instantiate a declared effect chain at explicit ports; never invent behavior rows. */
import { z } from "zod";
import {
  FunctionModel,
  Endpoint,
  Box,
  Carrier as CarrierSchema,
  Flow,
  Polarity,
  checkModel,
} from "./act.js";
import { TypedEffect, EffectPort } from "./act-effects.js";
import { sameDimension } from "./act-dimensions.js";
import { rewrite, type RewriteStep } from "./act-rewrite.js";
import { engineeringInvalid } from "./act-contract.js";
import { fail, issue } from "./act-issues.js";
type Carrier = z.infer<typeof FunctionModel>["carriers"][number];

export const EffectInsertRequest = z.strictObject({
  model: FunctionModel,
  from: Endpoint,
  to: Endpoint,
  chain: z.array(TypedEffect).max(12),
  replace_wire: z.string().min(1).optional(),
  conditions: z.array(z.string()).default([]),
  intermediate_carriers: z
    .array(z.string().min(1))
    .max(11)
    .optional()
    .describe(
      "Existing intermediate carrier ids, in chain order; preserves declared finite values/levels for implementation rows",
    ),
  intermediate_layers: z
    .array(CarrierSchema.shape.layer)
    .max(11)
    .optional()
    .describe(
      "Explicit layer of each new intermediate carrier; otherwise uniquely matching existing carrier declarations are reused",
    ),
  declarations: z
    .array(
      Box.pick({
        behavior: true, producible: true, feasibility: true, cost: true,
        state: true, initial: true, transition: true,
      }),
    )
    .max(12)
    .optional()
    .describe(
      "One explicit implementation per effect: finite behavior or state/initial/transition rows, with optional resource declarations; row ports are in/out and no rows are inferred",
    ),
  flows: z
    .array(Flow)
    .optional()
    .describe("Explicit complete replacement of flows when their path changes"),
  polarity: Polarity.optional(),
});

const portType = (c: Carrier): z.infer<typeof EffectPort> | undefined =>
  c.effect_quantity === undefined
    ? undefined
    : {
        quantity: c.effect_quantity,
        ...(c.si === undefined ? {} : { si: c.si }),
      };
const matches = (
  a: z.infer<typeof EffectPort>,
  b: z.infer<typeof EffectPort>,
) =>
  a.quantity === b.quantity &&
  (b.si === undefined || (a.si !== undefined && sameDimension(a.si, b.si)));
/** Generated identifiers follow declaration order, with collision avoidance independent of labels. */
export function allocated(prefix: string, ids: Iterable<string>) {
  const taken = new Set(ids);
  let next = 0;
  return () => {
    let id: string;
    do {
      id = `${prefix}${next++}`;
    } while (taken.has(id));
    taken.add(id);
    return id;
  };
}

export function insertEffectChain(input: unknown, catalogue: z.infer<typeof TypedEffect>[] | (() => z.infer<typeof TypedEffect>[]) = []) {
  const parsed = EffectInsertRequest.safeParse(input);
  if (!parsed.success) return engineeringInvalid(parsed.error.issues);
  const a = parsed.data,
    checked = checkModel(a.model, "$.model");
  if (!checked.ok) return fail(checked.issues);
  if (a.model.boxes.some((b) => b.inner))
    return fail([
      issue(
        "hierarchy-substitution",
        "$.model",
        "Effect insertion requires expanded hierarchy",
        "Expand nested models before inserting a chain.",
      ),
    ]);
  const reject = (path: string, message: string, hint: string) =>
    fail([issue("invalid-argument", path, message, hint)]);
  const provenance: Array<"catalogue-verified" | "caller-declared"> = [];
  let library: z.infer<typeof TypedEffect>[] | undefined;
  for (const [i,e] of a.chain.entries()) {
    library ??= typeof catalogue === "function" ? catalogue() : catalogue;
    const curated = library.find(c => c.id === e.id);
    if (curated && !(matches(e.input,curated.input) && matches(curated.input,e.input) &&
      matches(e.output,curated.output) && matches(curated.output,e.output) && e.field === curated.field &&
      JSON.stringify([...e.conditions].sort()) === JSON.stringify([...curated.conditions].sort()) &&
      e.source === curated.source && e.typed_from === curated.typed_from))
      return reject(`$.chain[${i}]`,"Curated effect id does not match its verified catalogue declaration","Use the curated typing and provenance unchanged, or give a caller-declared entry a distinct id.");
    provenance.push(curated ? "catalogue-verified" as const : "caller-declared" as const);
  }
  const source = a.model.boxes
    .find((b) => b.id === a.from.box)
    ?.outputs?.find((p) => p.id === a.from.port);
  const target = a.model.boxes
    .find((b) => b.id === a.to.box)
    ?.inputs?.find((p) => p.id === a.to.port);
  if (!source || !target)
    return reject(
      !source ? "$.from" : "$.to",
      "An endpoint is not an existing output/input port",
      "Select an existing source output and destination input.",
    );
  const original =
    a.replace_wire === undefined
      ? undefined
      : a.model.wires.find((w) => w.id === a.replace_wire);
  if (
    a.replace_wire !== undefined &&
    (!original ||
      original.to.box !== a.to.box ||
      original.to.port !== a.to.port)
  )
    return reject(
      "$.replace_wire",
      "Replacement must name a wire feeding the selected input",
      "Name that wire explicitly, or choose an unwired input.",
    );
  if (
    a.model.wires.some(
      (w) =>
        w.to.box === a.to.box &&
        w.to.port === a.to.port &&
        w.id !== original?.id,
    )
  )
    return reject(
      "$.to",
      "The input already has another supplying wire",
      "Use replace_wire for its existing supplier.",
    );
  if (a.declarations && a.declarations.length !== a.chain.length)
    return reject(
      "$.declarations",
      "Declarations must correspond one-to-one with the chain",
      "Supply exactly one declaration per effect, or omit declarations.",
    );
  if (
    a.intermediate_carriers &&
    a.intermediate_carriers.length !== Math.max(0, a.chain.length - 1)
  )
    return reject(
      "$.intermediate_carriers",
      "Intermediate carriers must correspond to chain junctions",
      "Supply one existing carrier per internal junction.",
    );
  if (
    a.intermediate_layers &&
    (a.intermediate_carriers ||
      a.intermediate_layers.length !== Math.max(0, a.chain.length - 1))
  )
    return reject(
      "$.intermediate_layers",
      "Choose existing carriers or declare each new intermediate layer",
      "Supply one layer per internal junction, without intermediate_carriers.",
    );
  for (const [i, id] of (a.intermediate_carriers ?? []).entries()) {
    const c = a.model.carriers.find((c) => c.id === id),
      type = c && portType(c);
    if (
      !type ||
      !matches(a.chain[i].output, type) ||
      !matches(type, a.chain[i + 1].input)
    )
      return reject(
        `$.intermediate_carriers[${i}]`,
        "Intermediate carrier does not match both adjacent effect ports",
        "Bind a declared quantity/SI-compatible carrier; declare its values before adding behavior rows.",
      );
  }
  if (
    original &&
    (a.chain.length || original.from.box !== a.from.box) &&
    a.flows === undefined &&
    a.model.flows?.some((f) =>
      f.path.some(
        (b, i) => b === original.from.box && f.path[i + 1] === original.to.box,
      ),
    )
  )
    return reject(
      "$.flows",
      "Insertion changes a declared flow path",
      "Supply the complete restated flows explicitly, including their intermediate boxes, or restate the model first.",
    );
  const sourceCarrier = a.model.carriers.find((c) => c.id === source.carrier)!;
  const targetCarrier = a.model.carriers.find((c) => c.id === target.carrier)!;
  let current = portType(sourceCarrier);
  const required = portType(targetCarrier);
  if (!current || !required)
    return reject(
      "$.model.carriers",
      "Both endpoints need effect_quantity",
      "Declare explicit quantity tokens and any SI constraints; labels are not types.",
    );
  for (const [i, e] of a.chain.entries()) {
    if (!matches(current, e.input))
      return reject(
        `$.chain[${i}].input`,
        "Effect input does not match the preceding quantity/SI declaration",
        "Select a chain whose adjacent explicit types match.",
      );
    current = e.output;
  }
  if (!matches(current, required))
    return reject(
      "$.to",
      "Chain output does not meet the required quantity/SI type",
      "Choose a chain with the required output type and declared SI evidence.",
    );
  if (a.chain.length === 0 && source.carrier !== target.carrier)
    return reject(
      "$.chain",
      "An identity connection requires the same carrier",
      "Use an explicit conversion effect between different carrier declarations.",
    );
  const boxId = allocated(
      "effect-box-",
      a.model.boxes.map((b) => b.id),
    ),
    carrierId = allocated(
      "effect-carrier-",
      a.model.carriers.map((c) => c.id),
    ),
    wireId = allocated(
      "effect-wire-",
      a.model.wires.map((w) => w.id),
    );
  const carriersAdded: Carrier[] = [],
    intermediateIds: string[] = [];
  for (const [i, e] of a.chain.slice(0, -1).entries()) {
    if (a.intermediate_carriers) {
      intermediateIds.push(a.intermediate_carriers[i]);
      continue;
    }
    if (!a.intermediate_layers) {
      const matching = a.model.carriers.filter((c) => {
        const t = portType(c);
        return t && matches(e.output, t) && matches(t, e.output);
      });
      if (matching.length !== 1)
        return reject(
          "$.intermediate_carriers",
          "An internal quantity has no unique existing carrier declaration",
          "Bind intermediate_carriers explicitly, or declare intermediate_layers to create new carriers. Layers, values and levels are never inferred.",
        );
      intermediateIds.push(matching[0].id);
      continue;
    }
    const c: Carrier = {
      id: carrierId(),
      layer: a.intermediate_layers[i],
      dimension: e.output.quantity,
      effect_quantity: e.output.quantity,
      ...(e.output.si === undefined ? {} : { si: e.output.si }),
    };
    carriersAdded.push(c);
    intermediateIds.push(c.id);
  }
  const carriers = [
    source.carrier,
    ...intermediateIds,
    ...(a.chain.length ? [target.carrier] : []),
  ];
  const boxes = a.chain.map((e, i) => ({
    id: boxId(),
    name: e.name,
    role: "tool" as const,
    inputs: [{ id: "in", carrier: carriers[i] }],
    outputs: [{ id: "out", carrier: carriers[i + 1] }],
    ...a.declarations?.[i],
  }));
  const ends = [a.from, ...boxes.map((b) => ({ box: b.id, port: "out" }))];
  const inputs = [...boxes.map((b) => ({ box: b.id, port: "in" })), a.to];
  const wires = ends.map((from, i) => ({
    id: wireId(),
    from,
    to: inputs[i],
    carrier: carriers[i],
    polarity: a.polarity ?? original?.polarity ?? ("useful" as const),
  }));
  const step: RewriteStep = {
    delete: {
      wires: original ? [original.id] : [],
      ...(a.flows ? { flows: (a.model.flows ?? []).map((f) => f.id) } : {}),
    },
    add: { boxes, wires, ...(a.flows ? { flows: a.flows } : {}) },
  };
  const extended = {
      ...a.model,
      carriers: [...a.model.carriers, ...carriersAdded],
    },
    applied = rewrite(extended, step);
  if (!applied.ok) return applied;
  return {
    ...applied,
    verdict: "inserted" as const,
    carriersAdded,
    rewrite: step,
    effects: a.chain.map((e, i) => ({
      box: boxes[i].id,
      effect: e.id,
      source: e.source,
      typed_from: provenance[i] === "catalogue-verified" ? e.typed_from : "caller-declared",
      provenance: provenance[i],
    })),
    unmetConditions: [...new Set(a.chain.flatMap((e) => e.conditions))].filter(
      (c) => !a.conditions.includes(c),
    ),
    note: "Typed wiring hypothesis. Effect citations and conditions are retained; behavior, feasibility and physical sufficiency are never inferred. Replay the rewrite against the original model extended by carriersAdded.",
  };
}
