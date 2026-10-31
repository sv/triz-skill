/** Independent, deliberately literal checker. No compiler, join, or propagation imports.
 * Indices are local to explicitly named carriers; equal sizes never identify types.
 * The same encoding can be exported to theory/Symbolic.lean for kernel checking. */
import type { FunctionModel } from "./act.js";
export type FiniteMap = { source: string; target: string; inputs: string[]; outputs: string[]; image: number[] };
export type PrimitiveCertificate = { map: FiniteMap; rows: Array<[number, number]> };
export type SummaryEdge = { from: number; to: number; primitive: number; choices: number[] };
export type SummaryStage = { box: string; hole: number | null; primitives: PrimitiveCertificate[]; choiceCount: number; edges: SummaryEdge[] };
export type RegionCertificate = { stages: SummaryStage[]; layers: FiniteMap[][] };
export type CertificateCharge = (amount: number) => void;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// Array.every/map skip holes. A certificate must have a value at EVERY declared index.
const dense = (xs: unknown): xs is unknown[] => Array.isArray(xs)
  && Array.from({ length: xs.length }, (_, i) => Object.hasOwn(xs, i)).every(Boolean);

/** Bind the normalized encoding back to complete original declarations, independently
 * of the recognizer. No names/labels/units participate in semantic recognition. */
export function checkRegionDeclarations(c: RegionCertificate, model: FunctionModel,
  holes: Array<{ box: string; alternatives: Array<{ behavior: NonNullable<FunctionModel["boxes"][number]["behavior"]> }> }>, charge: CertificateCharge = () => {}) {
  if (!checkRegionCertificate(c, charge)) return false;
  const ids = c.stages.map(s => s.box);
  if (new Set(ids).size !== ids.length) return false;
  for (const [i, s] of c.stages.entries()) {
    charge(1 + model.boxes.length + model.wires.length);
    const b = model.boxes.find(b => b.id === s.box);
    if (!b || b.inputs?.length !== 1 || b.outputs?.length !== 1 || b.role === "product" || b.inner || b.state || b.initial || b.transition) return false;
    const h = holes.findIndex(h => h.box === b.id);
    if (s.hole !== (h < 0 ? null : h)) return false;
    const declarations = h < 0 ? [b.behavior] : holes[h].alternatives.map(a => a.behavior);
    if (declarations.length !== s.primitives.length) return false;
    for (const [j, rows] of declarations.entries()) {
      const p = s.primitives[j], m = p.map;
      if (!rows || m.source !== b.inputs[0].carrier || m.target !== b.outputs[0].carrier
        || !equal(m.inputs, model.carriers.find(c => c.id === m.source)?.values)
        || !equal(m.outputs, model.carriers.find(c => c.id === m.target)?.values) || rows.length !== p.rows.length) return false;
      for (const [r, row] of rows.entries()) {
        charge(1 + m.inputs.length + m.outputs.length);
        if (!equal(Object.keys(row.in), [b.inputs[0].id]) || !equal(Object.keys(row.out), [b.outputs[0].id])
          || !equal(p.rows[r], [m.inputs.indexOf(row.in[b.inputs[0].id]), m.outputs.indexOf(row.out[b.outputs[0].id])])) return false;
      }
    }
    if (i) {
      const incoming = model.wires.filter(w => w.to.box === b.id), previous = c.stages[i - 1].box;
      const outgoing = model.wires.filter(w => w.from.box === previous);
      const from = model.boxes.find(b => b.id === previous)!;
      if (incoming.length !== 1 || outgoing.length !== 1 || incoming[0] !== outgoing[0]
        || incoming[0].from.port !== from.outputs![0].id || incoming[0].to.port !== b.inputs[0].id
        || incoming[0].carrier !== b.inputs[0].carrier || incoming[0].carrier !== from.outputs![0].carrier) return false;
    }
  }
  return true;
}

export function checkRegionCertificate(c: RegionCertificate, charge: CertificateCharge = () => {}) {
  const validMap = (m: FiniteMap) => {
    if (!m || typeof m.source !== "string" || typeof m.target !== "string"
      || !dense(m.inputs) || !dense(m.outputs) || !dense(m.image)) return false;
    charge(1 + m.inputs.length + m.outputs.length + m.image.length);
    return m.inputs.length > 0 && m.outputs.length > 0 && new Set(m.inputs).size === m.inputs.length
      && new Set(m.outputs).size === m.outputs.length && m.image.length === m.inputs.length
      && m.inputs.every(x => typeof x === "string") && m.outputs.every(x => typeof x === "string")
      && m.image.every(y => Number.isSafeInteger(y) && y >= 0 && y < m.outputs.length);
  };
  if (!c || !dense(c.stages) || !dense(c.layers) || !c.stages.length || c.layers.length !== c.stages.length + 1
    || c.layers.some(l => !dense(l)) || c.layers[0].length !== 1
    || c.stages.some(s => !s || !dense(s.primitives) || !dense(s.edges))) return false;
  const holes = c.stages.flatMap(s => s.hole === null ? [] : [s.hole]);
  if (new Set(holes).size !== holes.length || holes.some(h => !Number.isInteger(h) || h < 0)) return false;
  const root = c.layers[0][0];
  if (!validMap(root) || root.source !== root.target || !equal(root.inputs, root.outputs) || root.image.some((y, x) => y !== x)) return false;
  for (let i = 0; i < c.stages.length; i++) {
    const s = c.stages[i], before = c.layers[i], after = c.layers[i + 1];
    if (!s.primitives.length || !Number.isInteger(s.choiceCount) || s.choiceCount < 1 || s.choiceCount !== s.primitives.length || !after.length
      || (s.hole === null && s.choiceCount !== 1)) return false;
    for (const state of after) if (!validMap(state)) return false;
    // A graph is exactly the ENTIRE declared relation, including duplicate rows.
    for (const p of s.primitives) {
      if (!p || !validMap(p.map) || !dense(p.rows) || p.rows.some(r => !dense(r) || r.length !== 2
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
      if (!a || !b || !p || !e.choices.length || a.target !== p.source || !equal(a.outputs, p.inputs)
        || a.source !== b.source || p.target !== b.target || !equal(a.inputs, b.inputs) || !equal(p.outputs, b.outputs)) return false;
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
    const head = model.boxes.find(b => b.id === c.stages[0].box), v = virtual[r], maps = c.layers.at(-1)!;
    if (!head || !v || v.box !== head.id || v.alternatives.length !== maps.length) return false;
    for (const [i, m] of maps.entries()) {
      const a = v.alternatives[i];
      charge(1 + m.inputs.length);
      if (a.id !== `summary-${i}` || a.behavior.length !== m.inputs.length) return false;
      for (const [x, row] of a.behavior.entries()) {
        if (!equal(Object.keys(row.in), [head.inputs![0].id]) || !equal(Object.keys(row.out), [head.outputs![0].id])
          || row.in[head.inputs![0].id] !== m.inputs[x] || row.out[head.outputs![0].id] !== m.outputs[m.image[x]]) return false;
      }
    }
  }
  const rest = holes.filter((_, h) => !covered.has(h));
  if (virtual.length !== certificates.length + rest.length || !equal(virtual.slice(certificates.length), rest)) return false;
  const retained = model.boxes.filter(b => (positions.get(b.id)?.index ?? 0) === 0);
  if (reduced.boxes.length !== retained.length) return false;
  for (const [i, b] of retained.entries()) {
    const p = positions.get(b.id);
    const expected = !p ? b : { ...b,
      outputs: [{ ...b.outputs![0], carrier: certificates[p.region].layers.at(-1)![0].target }],
      behavior: virtual[p.region].alternatives[0].behavior };
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
      expectedWires.push({ ...w, from: { box: head.id, port: head.outputs![0].id } });
    }
  }
  const { boxes: _oldBoxes, wires: _oldWires, ...oldContext } = model;
  const { boxes: _newBoxes, wires: _newWires, ...newContext } = reduced;
  return equal(oldContext, newContext) && equal(expectedWires, reduced.wires);
}
