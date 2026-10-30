import type { FunctionModel } from "../../src/act.js";
import type { TypedEffect } from "../../src/act-effects.js";
export const metadata = {
  contract: {
    operating_envelope: "synthetic finite tables",
    resource_binding: "all-behavior-rows" as const,
  },
  declared_harms: [],
  evidence: [
    {
      claim: "Declared rows share one resource mode",
      source: "synthetic test declaration",
      operating_envelope: "synthetic finite tables",
    },
  ],
};
export const pass = ["0", "1"].map((v) => ({ in: { in: v }, out: { out: v } }));
export const converter = (
  id: string,
  from: string,
  to: string,
  cost = 1,
): FunctionModel["boxes"][number] => ({
  id,
  name: id,
  role: "tool",
  inputs: [{ id: "in", carrier: from }],
  outputs: [{ id: "out", carrier: to }],
  behavior: pass,
  feasibility: [
    { requires: { in: 1 }, provides: { out: 1 }, cost: { usd: cost } },
  ],
});
export function interfaceModel(): FunctionModel {
  return {
    domain: "software",
    carriers: ["a", "b", "c", "d"].map((id) => ({
      id,
      layer: "information",
      dimension: id,
      effect_quantity: id,
      si: {},
      values: ["0", "1"],
    })),
    boxes: [
      {
        id: "source",
        name: "Declared source",
        role: "environment",
        outputs: [{ id: "out", carrier: "a" }],
        behavior: [{ in: {}, out: { out: "1" } }],
        feasibility: [{ provides: { out: 1 } }],
      },
      {
        id: "product",
        name: "Required output",
        role: "product",
        inputs: [{ id: "in", carrier: "d" }],
        behavior: ["0", "1"].map((v) => ({ in: { in: v }, out: {} })),
        feasibility: [{ requires: { in: 1 } }],
      },
    ],
    wires: [],
  };
}
export function componentRequest() {
  return {
    model: interfaceModel(),
    resources: [{ box: "source", port: "out" }],
    targets: [{ box: "product", port: "in" }],
    catalogue: [
      { id: "ab", component: converter("ab", "a", "b") },
      { id: "bd", component: converter("bd", "b", "d") },
    ],
    max_components: 2,
  };
}
export function targetModel(): FunctionModel {
  const m = interfaceModel();
  m.boxes.push(converter("reference", "a", "d"));
  m.wires = [
    {
      id: "start",
      from: { box: "source", port: "out" },
      to: { box: "reference", port: "in" },
      carrier: "a",
      polarity: "useful",
    },
    {
      id: "end",
      from: { box: "reference", port: "out" },
      to: { box: "product", port: "in" },
      carrier: "d",
      polarity: "useful",
    },
  ];
  return m;
}
export const contract = () => ({
  target: targetModel(),
  acceptable: [{ box: "product", port: "in", values: ["1"] }],
  budget: { usd: 5 },
});
export const effects: TypedEffect[] = [
  {
    id: "ab",
    name: "Synthetic A to B",
    input: { quantity: "a", si: {} },
    output: { quantity: "b", si: {} },
    field: "information",
    conditions: ["declared-condition"],
    source: "synthetic test declaration",
    typed_from: "source",
  },
  {
    id: "bd",
    name: "Synthetic B to D",
    input: { quantity: "b", si: {} },
    output: { quantity: "d", si: {} },
    field: "information",
    conditions: [],
    source: "synthetic test declaration",
    typed_from: "source",
  },
];
