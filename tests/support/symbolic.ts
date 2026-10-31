import { synthesisFixture, type SynthesisInput } from "./synthesis.js";

/** More concrete choices than behavioral maps; costs stay attached to each choice. */
export function sharedMapFixture(length: number, librarySize: number): SynthesisInput {
  const input = synthesisFixture("coupled", length);
  input.holes.forEach(h => {
    const maps = h.alternatives;
    h.alternatives = Array.from({ length: librarySize }, (_, i) => ({ ...maps[i % 2], id: `implementation${i}`, cost: { usd: i } }));
  });
  return input;
}

/** Independent disjoint transpositions give 2^length distinct maps, with no state sharing.
 * This deliberately exhibits the finite-map compiler's exponential worst case. */
export function distinctMapFixture(length: number): SynthesisInput {
  const input = synthesisFixture("coupled", length), values = Array.from({ length: 2 * length }, (_, i) => String(i));
  const copy = values.map(x => ({ in: { in: x }, out: { out: x } }));
  for (const m of [input.model, input.contract.target]) {
    m.carriers[0].values = values;
    for (const b of m.boxes) if (b.behavior) b.behavior = b.id === "product0" ? values.map(x => ({ in: { in: x }, out: {} })) : copy;
  }
  input.holes.forEach((h, k) => {
    h.alternatives[0].behavior = copy;
    h.alternatives[1].behavior = values.map((x, i) => ({ in: { in: x }, out: { out: values[i === 2 * k ? i + 1 : i === 2 * k + 1 ? i - 1 : i] } }));
  });
  input.contract.acceptable = [{ carrier: "value", values }];
  return input;
}

/** Explicit converters between distinct typed interfaces, with hostile/renamed labels. */
export function typedMapFixture(): SynthesisInput {
  const input = synthesisFixture("coupled", 3);
  const ids = ["input", 'middle"\n', "another", "result"];
  const values = [["left", "right"], ["cat", "dog"], ["red", "blue"], ["yes", "no"]];
  const convert = (i: number, j: number, flip: boolean) => values[i].map((x, k) => ({ in: { in: x }, out: { out: values[j][flip ? 1 - k : k] } }));
  for (const m of [input.model, input.contract.target]) {
    m.carriers = ids.map((id, i) => ({ id, layer: "information", dimension: "token", values: values[i] }));
    for (const b of m.boxes) {
      const i = b.id === "source" ? 0 : b.id === "product0" ? 3 : Number(b.id.slice(1));
      b.inputs!.forEach(p => { p.carrier = ids[i]; });
      b.outputs?.forEach(p => { p.carrier = ids[b.id === "source" ? 0 : i + 1]; });
      if (b.behavior) b.behavior = b.id === "product0" ? values[3].map(x => ({ in: { in: x }, out: {} })) : convert(i, b.id === "source" ? 0 : i + 1, false);
    }
    m.wires.forEach(w => { w.carrier = ids[w.from.box === "source" ? 0 : Number(w.from.box.slice(1)) + 1]; });
  }
  input.holes.forEach((h, i) => { h.alternatives.forEach((a, j) => { a.behavior = convert(i, i + 1, j === 1); }); });
  input.contract.acceptable = [{ carrier: ids[3], values: values[3] }];
  return input;
}
