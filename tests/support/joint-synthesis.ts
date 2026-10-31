import type { FunctionModel } from "../../src/act.js";
import type { SynthesisInput } from "./synthesis.js";
import { synthesisFixture } from "./synthesis.js";

/** Complete JOINT maps over two different carriers. Declaration orders deliberately disagree
 * along the chain; only the actual wires identify how the tuples compose. */
export function jointSynthesisFixture(length: number, librarySize = 2): SynthesisInput {
  const a = ["a0", "a1"], b = ["cold", "hot"], pairs = a.flatMap(x => b.map(y => [x, y]));
  const model: FunctionModel = { domain: "software", carriers: [{ id: "A", values: a, layer: "information", dimension: "symbol" }, { id: "B", values: b, layer: "information", dimension: "symbol" }], boxes: [
    { id: "source", name: "Joint stimulus", role: "environment", inputs: [{ id: "a", carrier: "A" }, { id: "b", carrier: "B" }], outputs: [{ id: "x", carrier: "A" }, { id: "y", carrier: "B" }],
      behavior: pairs.map(([x, y]) => ({ in: { a: x, b: y }, out: { x, y } })), feasibility: [{ provides: { x: 1, y: 1 } }] },
    ...Array.from({ length }, (_, i) => {
      const inputs = [{ id: "inA", carrier: "A" }, { id: "inB", carrier: "B" }];
      const outputs = [{ id: "outA", carrier: "A" }, { id: "outB", carrier: "B" }];
      if (i % 2 === 0) inputs.reverse();
      if (i % 3 === 1) outputs.reverse();
      return { id: `h${i}`, name: `Joint component ${i}`, role: "tool" as const, inputs, outputs,
        behavior: pairs.map(([x, y]) => ({ in: { inA: x, inB: y }, out: { outA: x, outB: y } })), feasibility: [{ requires: { inA: 1, inB: 1 }, provides: { outA: 1, outB: 1 } }] };
    }),
    { id: "product", name: "Joint observation", role: "product", inputs: [{ id: "a", carrier: "A" }, { id: "b", carrier: "B" }], behavior: pairs.map(([x, y]) => ({ in: { a: x, b: y }, out: {} })), feasibility: [{ requires: { a: 1, b: 1 } }] },
  ], wires: [
    ...Array.from({ length }, (_, i) => ["A", "B"].map((carrier, j) => ({ id: `feed${i}-${j}`, from: { box: i ? `h${i - 1}` : "source", port: i ? `out${carrier}` : ["x", "y"][j] }, to: { box: `h${i}`, port: `in${carrier}` }, carrier, polarity: "useful" as const }))).flat(),
    ...["A", "B"].map((carrier, j) => ({ id: `observe${j}`, from: { box: `h${length - 1}`, port: `out${carrier}` }, to: { box: "product", port: ["a", "b"][j] }, carrier, polarity: "useful" as const })),
  ] };
  const holes = Array.from({ length }, (_, i) => ({ box: `h${i}`, alternatives: Array.from({ length: librarySize }, (_, j) => ({ id: `implementation${j}`,
    behavior: pairs.map(([x, y]) => ({ in: { inA: x, inB: y }, out: { outA: j % 2 ? a[1 - a.indexOf(x)] : x, outB: y } })),
    feasibility: { requires: { inA: 1, inB: 1 }, provides: { outA: 1, outB: 1 }, cost: { usd: j } }, cost: { usd: j } })) }));
  const target = structuredClone(model);
  for (const box of model.boxes) if (holes.some(h => h.box === box.id)) { delete box.behavior; delete box.feasibility; }
  return { model, holes, contract: { target, acceptable: [{ carrier: "A", values: a }, { carrier: "B", values: b }], budget: { usd: 1000 } }, implementation: synthesisFixture("coupled", 1).implementation, max_states: 10_000 };
}

/** 2→1→2 maps: the two delivered values are correlated through a joint parity computation. */
export function correlatedSynthesisFixture(): SynthesisInput {
  const input = jointSynthesisFixture(2), parity = ["even", "odd"];
  input.model.carriers.push({ id: "parity", values: parity, layer: "information", dimension: "symbol" });
  input.contract.target.carriers = structuredClone(input.model.carriers);
  const first = input.holes[0], second = input.holes[1];
  first.alternatives = [0, 1].map(flip => ({ id: `parity${flip}`, behavior: ["a0", "a1"].flatMap((a, i) => ["cold", "hot"].map((b, j) => ({ in: { inA: a, inB: b }, out: { parity: parity[i ^ j ^ flip] } }))), feasibility: { requires: { inA: 1, inB: 1 }, provides: { parity: 1 } }, cost: { usd: 0 } }));
  second.alternatives = [0, 1].map(flip => ({ id: `decode${flip}`, behavior: parity.map((p, i) => ({ in: { parity: p }, out: { outA: ["a0", "a1"][i ^ flip], outB: ["cold", "hot"][i ^ flip] } })), feasibility: { requires: { parity: 1 }, provides: { outA: 1, outB: 1 } }, cost: { usd: 0 } }));
  for (const m of [input.model, input.contract.target]) {
    m.boxes.find(b => b.id === "h0")!.outputs = [{ id: "parity", carrier: "parity" }];
    m.boxes.find(b => b.id === "h1")!.inputs = [{ id: "parity", carrier: "parity" }];
    m.wires = m.wires.filter(w => w.from.box !== "h0");
    m.wires.push({ id: "joint-parity", from: { box: "h0", port: "parity" }, to: { box: "h1", port: "parity" }, carrier: "parity", polarity: "useful" });
  }
  for (const h of input.holes) { const b = input.contract.target.boxes.find(b => b.id === h.box)!; b.behavior = h.alternatives[0].behavior; b.feasibility = [h.alternatives[0].feasibility]; }
  return input;
}

/** Unit-domain producer followed by the same typed, arity-changing joint pipeline. */
export function closedJointSynthesisFixture(): SynthesisInput {
  const input = correlatedSynthesisFixture();
  for (const model of [input.model, input.contract.target]) {
    const source = model.boxes[0];
    source.inputs = []; source.behavior = [{ in: {}, out: { x: "a0", y: "cold" } }];
  }
  return input;
}
