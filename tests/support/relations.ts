import type { FunctionModel } from "../../src/act.js";
import type { ScopedRelation } from "../../src/act-relations.js";

/** Synthetic algebra fixtures, independent of empirical engineering data. */
export function relationFixture(kind: "indexed-chain" | "hidden-factors" | "boundary-factors" | "tuple-chain" | "overlap-contradiction", count: number) {
  const values = kind === "indexed-chain" || kind === "tuple-chain" || kind === "overlap-contradiction"
    ? Array.from({ length: kind === "indexed-chain" ? 96 : kind === "tuple-chain" ? 16 : count }, (_, i) => String(i)) : ["0", "1"];
  const domains: string[][] = [], sets: ScopedRelation[] = [], boundary: number[] = [], observed: number[] = [];
  const variable = () => { domains.push(values); return domains.length - 1; };
  if (kind === "tuple-chain") {
    let from = [variable(), variable()]; boundary.push(...from);
    for (let i = 0; i < count; i++) {
      const to = [variable(), variable()];
      sets.push({ vars: [...from, ...to], rows: values.flatMap(x => values.map(y =>
        [[from[0], x], [from[1], y], [to[0], x], [to[1], y]])) }); from = to;
    }
    observed.push(...from);
  } else if (kind === "overlap-contradiction") {
    const x = variable(), y = variable(), z = variable(); observed.push(z);
    sets.push({ vars: [x, y], rows: values.map(v => [[x, v], [y, v]]) },
      { vars: [x, y, z], rows: values.map((v, i) => [[x, v], [y, values[(i + 1) % values.length]], [z, v]]) });
  } else if (kind === "indexed-chain") {
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
  if (kind === "tuple-chain" || kind === "overlap-contradiction") {
    const p = (id: string) => ({ id, carrier: "symbol" });
    const ports = (vars: number[]) => vars.map(v => p(`v${v}`));
    model = { domain: "software", carriers: [{ id: "symbol", layer: "information", dimension: "symbol", values }], boxes: [], wires: [] };
    const owner = new Map<number, string>();
    sets.forEach((set, i) => {
      const id = `part${i}`;
      const inputs = set.vars.filter(v => owner.has(v) || boundary.includes(v)), outputs = set.vars.filter(v => !inputs.includes(v));
      model!.boxes.push({ id, name: id, role: "tool", inputs: ports(inputs), outputs: ports(outputs),
        behavior: set.rows.map(row => { const at = new Map(row); return {
          in: Object.fromEntries(inputs.map(v => [`v${v}`, at.get(v)!])), out: Object.fromEntries(outputs.map(v => [`v${v}`, at.get(v)!])),
        }; }) });
      for (const v of inputs) if (owner.has(v)) model!.wires.push({ id: `wire${i}_${v}`, from: { box: owner.get(v)!, port: `v${v}` },
        to: { box: id, port: `v${v}` }, carrier: "symbol", polarity: "useful" });
      for (const v of outputs) owner.set(v, id);
    });
    model.boxes.push({ id: "product", name: "Observer", role: "product", inputs: ports(observed) });
    for (const v of observed) model.wires.push({ id: `output${v}`, from: { box: owner.get(v)!, port: `v${v}` },
      to: { box: "product", port: `v${v}` }, carrier: "symbol", polarity: "useful" });
  }
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
