import type { FunctionModel } from "../../src/act.js";
import type { SynthesisRequest } from "../../src/act-synthesis.js";
import type { z } from "zod";

export type SynthesisInput = z.input<typeof SynthesisRequest>;
export type SynthesisCase = "safety" | "coverage" | "memoization" | "coupled";

/** Synthetic finite relations, not measured engineering data. Separate product observers
 * keep the model declaration linear while preserving the full joint output relation. */
export function synthesisFixture(kind: SynthesisCase, count: number): SynthesisInput {
  const values = kind === "memoization" ? ["0", "1", "2", "3"] : ["0", "1"];
  const copy = values.map(x => ({ in: { in: x }, out: { out: x } }));
  const independent = values.flatMap(x => values.map(y => ({ in: { in: x }, out: { out: y } })));
  const mode = { requires: { in: 1 }, provides: { out: 1 }, cost: { usd: 0 } };
  const chain = kind === "memoization" || kind === "coupled";
  const model: FunctionModel = { domain: "software", carriers: [{ id: "value", layer: "information", dimension: "symbol", values }], boxes: [
    { id: "source", name: "Synthetic source", role: "environment",
      ...(chain ? { inputs: [{ id: "in", carrier: "value" }] } : {}),
      outputs: [{ id: "out", carrier: "value" }],
      behavior: chain ? copy : (kind === "coverage" ? ["0"] : values).map(x => ({ in: {}, out: { out: x } })),
      feasibility: [{ provides: { out: 1 } }] },
    ...Array.from({ length: count }, (_, i) => ({ id: `h${i}`, name: `Hole ${i}`, role: "tool" as const,
      inputs: [{ id: "in", carrier: "value" }], outputs: [{ id: "out", carrier: "value" }],
      behavior: kind === "coverage" ? independent : copy, feasibility: [mode] })),
    ...Array.from({ length: chain ? 1 : count }, (_, i) => ({ id: `product${i}`, name: `Observer ${i}`, role: "product" as const,
      inputs: [{ id: "in", carrier: "value" }], behavior: values.map(x => ({ in: { in: x }, out: {} })),
      feasibility: [{ requires: { in: 1 } }] })),
  ], wires: [
    ...Array.from({ length: count }, (_, i) => ({ id: `feed${i}`, from: { box: chain && i ? `h${i - 1}` : "source", port: "out" }, to: { box: `h${i}`, port: "in" }, carrier: "value", polarity: "useful" as const })),
    ...Array.from({ length: chain ? 1 : count }, (_, i) => ({ id: `observe${i}`, from: { box: `h${chain ? count - 1 : i}`, port: "out" }, to: { box: `product${i}`, port: "in" }, carrier: "value", polarity: "useful" as const })),
  ] };
  const holes = Array.from({ length: count }, (_, i) => ({ box: `h${i}`, alternatives:
    kind === "safety" ? [{ id: "copy", behavior: copy, feasibility: mode }, { id: "independent", behavior: independent, feasibility: mode }]
    : kind === "coverage" ? [
      ...values.map(y => ({ id: `only-${y}`, behavior: values.map(x => ({ in: { in: x }, out: { out: y } })), feasibility: mode })),
      { id: "both", behavior: independent, feasibility: mode },
    ] : kind === "coupled" ? [{ id: "copy", behavior: copy, feasibility: mode }, { id: "flip", behavior: values.map(x => ({ in: { in: x }, out: { out: x === "0" ? "1" : "0" } })), feasibility: mode }]
    : Array.from({ length: 4 }, (_, j) => ({ id: `implementation-${j}`, behavior: copy, feasibility: { ...mode, cost: { usd: j } } })),
  }));
  const target = structuredClone(model);
  for (const b of model.boxes) if (holes.some(h => h.box === b.id)) { delete b.behavior; delete b.feasibility; }
  return { model, holes, contract: { target, acceptable: [{ carrier: "value", values }], budget: { usd: 1000 } },
    implementation: { contract: { operating_envelope: "synthetic finite benchmark", resource_binding: "all-behavior-rows" }, declared_harms: [],
      evidence: [{ claim: "Declared finite relations and modes", source: "synthetic fixture", operating_envelope: "synthetic finite benchmark" }] }, max_states: 10_000 };
}
