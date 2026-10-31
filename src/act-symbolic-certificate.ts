/** Independent, deliberately literal checker. No compiler, join, or propagation imports.
 * Indices are local to explicitly named carriers; equal sizes never identify types.
 * The same encoding can be exported to theory/Symbolic.lean for kernel checking. */
import type { FunctionModel } from "./act.js";
export type FiniteMap = { source: string[]; target: string[]; inputs: string[][]; outputs: string[][]; image: number[] };
export type PrimitiveCertificate = { map: FiniteMap; rows: Array<[number, number]> };
export type SummaryEdge = { from: number; to: number; primitive: number; choices: number[] };
export type SummaryStage = { box: string; hole: number | null; inputPorts: string[]; outputPorts: string[]; primitives: PrimitiveCertificate[]; choiceCount: number; edges: SummaryEdge[] };
export type RegionCertificate = { stages: SummaryStage[]; layers: FiniteMap[][] };
export type CertificateCharge = (amount: number) => void;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// Array.every/map skip holes. A certificate must have a value at EVERY declared index.
const dense = (xs: unknown): xs is unknown[] => Array.isArray(xs)
  && Array.from({ length: xs.length }, (_, i) => Object.hasOwn(xs, i)).every(Boolean);

/** Independent mixed-radix encoding of a complete joint carrier domain. */
function declaredProduct(model: FunctionModel, ports: NonNullable<FunctionModel["boxes"][number]["inputs"]>, charge: CertificateCharge) {
  const domains = ports.map(p => model.carriers.find(c => c.id === p.carrier)?.values);
  if (domains.some(d => !d?.length)) return;
  const size = domains.reduce((n, d) => n * d!.length, 1);
  if (!Number.isSafeInteger(size) || size > 1_000_000) return;
  charge(1 + size * (1 + ports.length));
  return Array.from({ length: size }, (_, n) => {
    const tuple: string[] = new Array(ports.length);
    for (let j = ports.length - 1; j >= 0; j--) { tuple[j] = domains[j]![n % domains[j]!.length]; n = Math.floor(n / domains[j]!.length); }
    return tuple;
  });
}
const namesExactly = (row: Record<string, string>, ports: string[]) => Object.keys(row).length === ports.length && ports.every(p => Object.hasOwn(row, p));

/** Bind the normalized encoding back to COMPLETE original joint declarations and explicit
 * wire permutations. Neither equal cardinalities nor independent port projections suffice. */
export function checkRegionDeclarations(c: RegionCertificate, model: FunctionModel,
  holes: Array<{ box: string; alternatives: Array<{ behavior: NonNullable<FunctionModel["boxes"][number]["behavior"]> }> }>, charge: CertificateCharge = () => {}) {
  if (!checkRegionCertificate(c, charge)) return false;
  for (const [i, s] of c.stages.entries()) {
    charge(1 + model.boxes.length + model.wires.length);
    const b = model.boxes.find(b => b.id === s.box);
    if (!b || b.role === "product" || b.inner || b.state || b.initial || b.transition) return false;
    const ins = s.inputPorts.map(id => b.inputs?.find(p => p.id === id));
    const outs = s.outputPorts.map(id => b.outputs?.find(p => p.id === id));
    if (ins.length !== (b.inputs?.length ?? 0) || outs.length !== (b.outputs?.length ?? 0) || ins.some(p => !p) || outs.some(p => !p)) return false;
    const inputs = declaredProduct(model, ins as NonNullable<typeof b.inputs>, charge), outputs = declaredProduct(model, outs as NonNullable<typeof b.outputs>, charge);
    if (!inputs || !outputs) return false;
    const inputIndex = new Map(inputs.map((x, i) => [JSON.stringify(x), i])), outputIndex = new Map(outputs.map((x, i) => [JSON.stringify(x), i]));
    const h = holes.findIndex(h => h.box === b.id);
    if (s.hole !== (h < 0 ? null : h)) return false;
    const declarations = h < 0 ? [b.behavior] : holes[h].alternatives.map(a => a.behavior);
    if (declarations.length !== s.primitives.length) return false;
    for (const [j, rows] of declarations.entries()) {
      const p = s.primitives[j], m = p.map;
      if (!rows || !equal(m.source, ins.map(p => p!.carrier)) || !equal(m.target, outs.map(p => p!.carrier))
        || !equal(m.inputs, inputs) || !equal(m.outputs, outputs) || rows.length !== p.rows.length) return false;
      for (const [r, row] of rows.entries()) {
        charge(1 + ins.length + outs.length);
        if (!namesExactly(row.in, s.inputPorts) || !namesExactly(row.out, s.outputPorts)
          || !equal(p.rows[r], [inputIndex.get(JSON.stringify(s.inputPorts.map(p => row.in[p]))), outputIndex.get(JSON.stringify(s.outputPorts.map(p => row.out[p])))])) return false;
      }
    }
    if (i) {
      const previous = c.stages[i - 1], from = model.boxes.find(b => b.id === previous.box)!;
      const incoming = model.wires.filter(w => w.to.box === b.id), outgoing = model.wires.filter(w => w.from.box === from.id);
      if (incoming.length !== s.inputPorts.length || outgoing.length !== previous.outputPorts.length || incoming.length !== outgoing.length || !incoming.length) return false;
      for (const [j, port] of s.inputPorts.entries()) {
        const wire = incoming.find(w => w.from.box === from.id && w.from.port === previous.outputPorts[j] && w.to.port === port);
        if (!wire || wire.carrier !== ins[j]!.carrier || wire.carrier !== from.outputs!.find(p => p.id === previous.outputPorts[j])!.carrier) return false;
      }
    }
  }
  return true;
}

export function checkRegionCertificate(c: RegionCertificate, charge: CertificateCharge = () => {}) {
  const strings = (xs: unknown): xs is string[] => dense(xs) && xs.every(x => typeof x === "string");
  const validMap = (m: FiniteMap) => {
    if (!m || !strings(m.source) || !strings(m.target) || !dense(m.inputs) || !dense(m.outputs) || !dense(m.image)) return false;
    charge(1 + m.inputs.length * (1 + m.source.length) + m.outputs.length * (1 + m.target.length) + m.image.length);
    return m.inputs.length > 0 && m.outputs.length > 0
      && m.inputs.every(x => strings(x) && x.length === m.source.length) && m.outputs.every(x => strings(x) && x.length === m.target.length)
      && new Set(m.inputs.map(x => JSON.stringify(x))).size === m.inputs.length && new Set(m.outputs.map(x => JSON.stringify(x))).size === m.outputs.length
      && m.image.length === m.inputs.length && m.image.every(y => Number.isSafeInteger(y) && y >= 0 && y < m.outputs.length);
  };
  if (!c || !dense(c.stages) || !dense(c.layers) || !c.stages.length || c.layers.length !== c.stages.length + 1
    || c.layers.some(l => !dense(l)) || c.layers[0].length !== 1
    || c.stages.some(s => !s || typeof s.box !== "string" || !dense(s.primitives) || !dense(s.edges)
      || !strings(s.inputPorts) || !strings(s.outputPorts) || new Set(s.inputPorts).size !== s.inputPorts.length || new Set(s.outputPorts).size !== s.outputPorts.length)
    || new Set(c.stages.map(s => s.box)).size !== c.stages.length) return false;
  const holes = c.stages.flatMap(s => s.hole === null ? [] : [s.hole]);
  if (new Set(holes).size !== holes.length || holes.some(h => !Number.isInteger(h) || h < 0)) return false;
  const root = c.layers[0][0];
  if (!validMap(root) || !equal(root.source, root.target) || !equal(root.inputs, root.outputs) || root.image.some((y, x) => y !== x)) return false;
  for (let i = 0; i < c.stages.length; i++) {
    const s = c.stages[i], before = c.layers[i], after = c.layers[i + 1];
    if (!s.primitives.length || !Number.isInteger(s.choiceCount) || s.choiceCount < 1 || s.choiceCount !== s.primitives.length || !after.length
      || (s.hole === null && s.choiceCount !== 1)) return false;
    for (const state of after) if (!validMap(state)) return false;
    // A graph is exactly the ENTIRE declared relation, including duplicate rows.
    for (const p of s.primitives) {
      if (!p || !validMap(p.map) || p.map.source.length !== s.inputPorts.length || p.map.target.length !== s.outputPorts.length || !dense(p.rows) || p.rows.some(r => !dense(r) || r.length !== 2
        || !r.every(x => Number.isSafeInteger(x) && x >= 0))) return false;
      const pairs = new Set(p.rows.map(([x, y]) => {
        charge(1);
        return JSON.stringify([x, y]);
      }));
      if (pairs.size !== p.map.inputs.length) return false;
      for (let x = 0; x < p.map.inputs.length; x++) {
        charge(1);
        if (!pairs.has(JSON.stringify([x, p.map.image[x]]))) return false;
      }
    }
    const covered = new Set<string>(), reached = new Set<number>();
    for (const e of s.edges) {
      if (!e || ![e.from, e.to, e.primitive].every(n => Number.isSafeInteger(n) && n >= 0) || !dense(e.choices)) return false;
      charge(1 + e.choices.length);
      const a = before[e.from], b = after[e.to], p = s.primitives[e.primitive]?.map;
      if (!a || !b || !p || !e.choices.length || !equal(a.target, p.source) || !equal(a.outputs, p.inputs)
        || !equal(a.source, b.source) || !equal(p.target, b.target) || !equal(a.inputs, b.inputs) || !equal(p.outputs, b.outputs)) return false;
      for (let x = 0; x < a.inputs.length; x++) {
        charge(1);
        if (b.image[x] !== p.image[a.image[x]]) return false;
      }
      for (const choice of e.choices) {
        charge(1 + p.inputs.length + p.outputs.length + p.image.length);
        if (!Number.isInteger(choice) || choice < 0 || choice >= s.choiceCount || !equal(s.primitives[choice].map, p)) return false;
        const key = JSON.stringify([e.from, choice]);
        if (covered.has(key)) return false;
        covered.add(key);
      }
      reached.add(e.to);
    }
    // Each concrete choice from EACH prefix has exactly one successor. No lost supports.
    charge(before.length * s.choiceCount + after.length);
    if (covered.size !== before.length * s.choiceCount || reached.size !== after.length) return false;
    if (new Set(after.map(m => JSON.stringify(m))).size !== after.length) return false;
  }
  return true;
}

/** Exact support multiplicities without expanding concrete words. These are behavior support
 * counts, not engineering verdicts. Distinct ids contribute separately even on the same edge. */
export function countSummarySupports(c: RegionCertificate, domains?: bigint[]): bigint[] {
  let counts = [1n];
  for (const [i, stage] of c.stages.entries()) {
    const next = c.layers[i + 1].map(() => 0n);
    for (const e of stage.edges) {
      const width = stage.hole === null ? 1 : e.choices.filter(choice => !domains || (domains[stage.hole!] & (1n << BigInt(choice))) !== 0n).length;
      next[e.to] += counts[e.from] * BigInt(width);
    }
    counts = next;
  }
  return counts;
}

/** Follow one concrete assignment through a checked DAG; no internal valuations are cached. */
export function summaryForChoices(c: RegionCertificate, choices: number[]): FiniteMap | undefined {
  let state = 0;
  for (const stage of c.stages) {
    const choice = stage.hole === null ? 0 : choices[stage.hole];
    const e = stage.edges.find(e => e.from === state && e.choices.includes(choice));
    if (!e) return;
    state = e.to;
  }
  return c.layers.at(-1)![state];
}

/** Check the WHOLE context after substitution, independently of the compiler's graph edits.
 * Region certificates must also pass checkRegionDeclarations. No outside constraint, resource
 * declaration, metadata, or wire may disappear; virtual choices must denote the certified maps. */
export function checkBoundarySubstitution(model: FunctionModel,
  holes: Array<{ box: string; alternatives: Array<{ id: string; behavior: NonNullable<FunctionModel["boxes"][number]["behavior"]> }> }>,
  certificates: RegionCertificate[], reduced: FunctionModel,
  virtual: Array<{ box: string; alternatives: Array<{ id: string; behavior: NonNullable<FunctionModel["boxes"][number]["behavior"]> }> }>,
  charge: CertificateCharge = () => {}) {
  charge(1 + model.boxes.length + model.wires.length + holes.length);
  const positions = new Map<string, { region: number; index: number }>();
  const covered = new Set<number>();
  for (const [r, c] of certificates.entries()) {
    if (c.stages.length < 2 || !c.stages.some(s => s.hole !== null)) return false;
    for (const [index, s] of c.stages.entries()) {
      charge(1);
      if (positions.has(s.box)) return false;
      positions.set(s.box, { region: r, index });
      if (s.hole !== null) { if (covered.has(s.hole)) return false; covered.add(s.hole); }
    }
    const head = model.boxes.find(b => b.id === c.stages[0].box), replacement = reduced.boxes.find(b => b.id === head?.id), v = virtual[r], maps = c.layers.at(-1)!;
    if (!head || !replacement || !v || v.box !== head.id || v.alternatives.length !== maps.length) return false;
    const outputPorts = replacement.outputs ?? [], last = c.stages.at(-1)!;
    if (outputPorts.length !== last.outputPorts.length || new Set([...(head.inputs ?? []).map(p => p.id), ...outputPorts.map(p => p.id)]).size !== (head.inputs?.length ?? 0) + outputPorts.length) return false;
    for (const [i, m] of maps.entries()) {
      const a = v.alternatives[i];
      charge(1 + m.inputs.length * (1 + c.stages[0].inputPorts.length + outputPorts.length));
      if (a.id !== `summary-${i}` || a.behavior.length !== m.inputs.length) return false;
      for (const [x, row] of a.behavior.entries()) {
        if (!namesExactly(row.in, c.stages[0].inputPorts) || !namesExactly(row.out, outputPorts.map(p => p.id))
          || c.stages[0].inputPorts.some((p, j) => row.in[p] !== m.inputs[x][j])
          || outputPorts.some((p, j) => row.out[p.id] !== m.outputs[m.image[x]][j])) return false;
      }
    }
  }
  const rest = holes.filter((_, h) => !covered.has(h));
  if (virtual.length !== certificates.length + rest.length || !equal(virtual.slice(certificates.length), rest)) return false;
  const retained = model.boxes.filter(b => (positions.get(b.id)?.index ?? 0) === 0);
  if (reduced.boxes.length !== retained.length) return false;
  for (const [i, b] of retained.entries()) {
    if (reduced.boxes[i]?.id !== b.id) return false;
    const p = positions.get(b.id);
    const tail = p ? model.boxes.find(b => b.id === certificates[p.region].stages.at(-1)!.box)! : undefined;
    const outputs = p ? certificates[p.region].stages.at(-1)!.outputPorts.map((id, j) => ({ ...tail!.outputs!.find(p => p.id === id)!, id: reduced.boxes[i].outputs![j].id })) : undefined;
    const expected = !p ? b : { ...b, outputs, behavior: virtual[p.region].alternatives[0].behavior };
    charge(1 + (b.behavior?.length ?? 0) + (b.feasibility?.length ?? 0));
    if (!equal(reduced.boxes[i], expected)) return false;
  }
  // Classify internal edges by their two ORIGINAL endpoints, not by a removal predicate.
  const expectedWires: FunctionModel["wires"] = [];
  for (const w of model.wires) {
    charge(1);
    const src = positions.get(w.from.box), dst = positions.get(w.to.box);
    if (src && dst && src.region === dst.region && dst.index === src.index + 1) continue;
    if (dst && dst.index > 0) return false;
    if (src && src.index < certificates[src.region].stages.length - 1) return false;
    if (!src) expectedWires.push(w);
    else {
      const head = retained.find(b => b.id === certificates[src.region].stages[0].box)!;
      const last = certificates[src.region].stages.at(-1)!, column = last.outputPorts.indexOf(w.from.port);
      if (column < 0) return false;
      const replacement = reduced.boxes.find(b => b.id === head.id)!;
      expectedWires.push({ ...w, from: { box: head.id, port: replacement.outputs![column].id } });
    }
  }
  const { boxes: _oldBoxes, wires: _oldWires, ...oldContext } = model;
  const { boxes: _newBoxes, wires: _newWires, ...newContext } = reduced;
  return equal(oldContext, newContext) && equal(expectedWires, reduced.wires);
}
