import type { FunctionModel } from "../../src/act.js";
import type { ScopedRelation } from "../../src/act-relations.js";

/** Synthetic algebra fixtures, independent of empirical engineering data. */
export function relationFixture(kind: "indexed-chain" | "hidden-factors" | "boundary-factors", count: number) {
  const values = kind === "indexed-chain" ? Array.from({ length: 96 }, (_, i) => String(i)) : ["0", "1"];
  const domains: string[][] = [], sets: ScopedRelation[] = [], boundary: number[] = [], observed: number[] = [];
  const variable = () => { domains.push(values); return domains.length - 1; };
  if (kind === "indexed-chain") {
    let from = variable(); boundary.push(from);
    for (let i = 0; i < count; i++) {
      const to = variable();
      sets.push({ vars: [from, to], rows: values.map(x => [[from, x], [to, x]]) }); from = to;
    }
    observed.push(from);
  } else if (kind === "boundary-factors") {
    for (let i = 0; i < count; i++) {
      const x = variable(), y = variable(); boundary.push(x); observed.push(y);
      sets.push({ vars: [x, y], rows: values.map(v => [[x, v], [y, v]]) });
    }
  } else {
    const out = variable(); observed.push(out); sets.push({ vars: [out], rows: [[[out, "0"]]] });
    for (let i = 0; i < count; i++) { const v = variable(); sets.push({ vars: [v], rows: values.map(x => [[v, x]]) }); }
  }
  let model: FunctionModel | undefined;
  if (kind === "hidden-factors") model = {
    domain: "software", carriers: [{ id: "bit", dimension: "symbol", layer: "information", values }],
    boxes: [
      { id: "source", name: "Observed source", role: "environment", outputs: [{ id: "out", carrier: "bit" }], behavior: [{ in: {}, out: { out: "0" } }] },
      { id: "product", name: "Observer", role: "product", inputs: [{ id: "in", carrier: "bit" }], behavior: values.map(x => ({ in: { in: x }, out: {} })) },
      ...Array.from({ length: count }, (_, i) => ({ id: `hidden${i}`, name: `Hidden factor ${i}`, role: "tool" as const,
        inputs: [{ id: "in", carrier: "bit" }], outputs: [{ id: "out", carrier: "bit" }], behavior: values.map(x => ({ in: { in: x }, out: { out: x } })) })),
    ], wires: [
      { id: "output", from: { box: "source", port: "out" }, to: { box: "product", port: "in" }, carrier: "bit", polarity: "useful" },
      ...Array.from({ length: count }, (_, i) => ({ id: `loop${i}`, from: { box: `hidden${i}`, port: "out" }, to: { box: `hidden${i}`, port: "in" }, carrier: "bit", polarity: "useful" as const })),
    ],
  };
  return { sets, domains, boundary, observed, model };
}
