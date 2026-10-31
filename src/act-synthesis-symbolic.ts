/** Checked finite-map compilation BEFORE union trace enumeration. All objects are request-local. */
import type { FunctionModel } from "./act.js";
import type { EngineeringBudget } from "./act-contract.js";
import { SynthesisPruner, type ChoiceLibrary, type SynthesisPruningStats } from "./act-synthesis-pruning.js";
import { checkRegionDeclarations, checkBoundarySubstitution, countSummarySupports, type FiniteMap, type PrimitiveCertificate, type RegionCertificate, type SummaryStage } from "./act-symbolic-certificate.js";

type Box = FunctionModel["boxes"][number];
export const symbolicStats = () => ({ status: "disabled" as "disabled" | "ready" | "fallback", reason: "", work: 0, certificateWork: 0,
  compilationMs: 0, certificateCheckMs: 0, substitutionCheckMs: 0, backwardMs: 0, regions: 0, states: 0, transitions: 0, prefixWidths: [] as number[][], supportCounts: [] as string[][], filterCalls: 0, filterFallbacks: 0, cacheHits: 0, retainedCells: 0 });
export type SymbolicStats = ReturnType<typeof symbolicStats>;
class Stop extends Error {}
const key = (m: FiniteMap) => JSON.stringify(m);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function primitive(model: FunctionModel, b: Box, rows: NonNullable<Box["behavior"]>, spend: (n?: number) => void): PrimitiveCertificate | undefined {
  if (b.inner || b.state || b.initial || b.transition || b.role === "product" || b.inputs?.length !== 1 || b.outputs?.length !== 1) return;
  const input = b.inputs[0], output = b.outputs[0];
  const inputs = model.carriers.find(c => c.id === input.carrier)?.values, outputs = model.carriers.find(c => c.id === output.carrier)?.values;
  if (!inputs?.length || !outputs?.length) return;
  spend(inputs.length + outputs.length + rows.length);
  const image = new Array<number>(inputs.length).fill(-1), relation: Array<[number, number]> = [];
  for (const r of rows) {
    spend(inputs.length + outputs.length);
    if (Object.keys(r.in).length !== 1 || Object.keys(r.out).length !== 1) return;
    const x = inputs.indexOf(r.in[input.id]), y = outputs.indexOf(r.out[output.id]);
    if (x < 0 || y < 0 || (image[x] !== -1 && image[x] !== y)) return;
    image[x] = y; relation.push([x, y]);
  }
  if (image.includes(-1)) return;
  return { map: { source: input.carrier, target: output.carrier, inputs: [...inputs], outputs: [...outputs], image }, rows: relation };
}

export function compileRegion(stages: Array<Omit<SummaryStage, "edges">>, spend: (n?: number) => void): RegionCertificate {
  const first = stages[0].primitives[0].map;
  const layers: FiniteMap[][] = [[{ source: first.source, target: first.source, inputs: first.inputs, outputs: first.inputs, image: first.inputs.map((_, i) => i) }]];
  const compiled: SummaryStage[] = [];
  for (const stage of stages) {
    const next: FiniteMap[] = [], ids = new Map<string, number>();
    const edges = new Map<string, SummaryStage["edges"][number]>();
    for (const [from, a] of layers[layers.length - 1].entries()) for (const [choice, { map: b }] of stage.primitives.entries()) {
      spend(1 + a.image.length + a.outputs.length + b.inputs.length + b.outputs.length);
      if (a.target !== b.source || !same(a.outputs, b.inputs)) throw new Stop("typed-composition");
      const m = { source: a.source, target: b.target, inputs: a.inputs, outputs: b.outputs, image: a.image.map(y => b.image[y]) };
      const signature = key(m);
      let to = ids.get(signature);
      if (to === undefined) { to = next.length; ids.set(signature, to); next.push(m); }
      const edgeKey = JSON.stringify([from, to, key(b)]), prior = edges.get(edgeKey);
      if (prior) prior.choices.push(choice);
      else edges.set(edgeKey, { from, to, primitive: choice, choices: [choice] });
    }
    compiled.push({ ...stage, edges: [...edges.values()] }); layers.push(next);
  }
  return { stages: compiled, layers };
}

type Region = { boxes: Box[]; certificate: RegionCertificate };
/** A wrapper over the existing exact coupled residual, whose choices now name summary states.
 * The DAG carries supports; it is NEVER flattened into rectangles of concrete choices. */
export class SymbolicPruner {
  private constructor(readonly regions: Region[], readonly uncovered: number[], readonly residual: SynthesisPruner,
    readonly budget: EngineeringBudget, readonly maxWork: number, readonly stats: SymbolicStats) {}

  static compile(model: FunctionModel, target: FunctionModel, holes: ChoiceLibrary[], budget: EngineeringBudget, pruning: SynthesisPruningStats,
    stats: SymbolicStats, maxWork: number, maxCells: number, residual: boolean, propagation: boolean, maxPruningWork = maxWork): SymbolicPruner | undefined {
    let used = 0;
    const started = performance.now();
    const limit = Math.min(maxWork, Math.floor(budget.remaining / 4));
    const spend = (n = 1) => { if (used + n > limit || !budget.spend(n)) throw new Stop("symbolic-work-cap"); used += n; stats.work += n; };
    try {
      spend(1 + model.boxes.length + model.wires.length);
      const recognized = new Map<string, Omit<SummaryStage, "edges">>();
      for (const b of model.boxes) {
        const hole = holes.findIndex(h => h.box === b.id), h = holes[hole];
        const rows = h ? h.alternatives.map(a => a.behavior) : b.behavior ? [b.behavior] : [];
        const primitives = rows.map(rows => primitive(model, b, rows, spend));
        if (primitives.length && primitives.every((p): p is PrimitiveCertificate => p !== undefined)) recognized.set(b.id, { box: b.id, hole: h ? hole : null, primitives, choiceCount: rows.length });
      }
      const next = new Map<string, string>(), prior = new Map<string, string>();
      for (const w of model.wires) {
        spend(1 + model.wires.length);
        if (recognized.has(w.from.box) && recognized.has(w.to.box)
          && model.wires.filter(q => q.from.box === w.from.box).length === 1
          && model.wires.filter(q => q.to.box === w.to.box).length === 1) { next.set(w.from.box, w.to.box); prior.set(w.to.box, w.from.box); }
      }
      const regions: Region[] = [], covered = new Set<number>();
      for (const id of recognized.keys()) {
        if (prior.has(id)) continue; // Cycles have no head and remain in the ordinary solver.
        const boxes: Box[] = [];
        for (let at: string | undefined = id; at !== undefined; at = next.get(at)) boxes.push(model.boxes.find(b => b.id === at)!);
        if (boxes.length < 2 || !boxes.some(b => recognized.get(b.id)!.hole !== null)) continue;
        const certificate = compileRegion(boxes.map(b => recognized.get(b.id)!), spend);
        const before = used;
        const checkStarted = performance.now();
        try {
          if (!checkRegionDeclarations(certificate, model, holes, spend)) throw new Stop("certificate-rejected");
        } finally {
          stats.certificateCheckMs += performance.now() - checkStarted;
          stats.certificateWork += used - before;
        }
        for (const s of certificate.stages) if (s.hole !== null) covered.add(s.hole);
        regions.push({ boxes, certificate });
        const cells = JSON.stringify(certificate).length;
        stats.retainedCells += cells;
        if (stats.retainedCells > maxCells) throw new Stop("symbolic-memory-cap");
      }
      if (!regions.length) throw new Stop("no-supported-serial-region");
      const uncovered = holes.flatMap((_, i) => covered.has(i) ? [] : [i]);
      const removed = new Set(regions.flatMap(r => r.boxes.slice(1).map(b => b.id)));
      const heads = new Map(regions.map(r => [r.boxes[0].id, r]));
      const tails = new Map(regions.map(r => [r.boxes[r.boxes.length - 1].id, r.boxes[0]]));
      const virtualHoles: ChoiceLibrary[] = regions.map(r => ({ box: r.boxes[0].id, alternatives: r.certificate.layers.at(-1)!.map((m, i) => ({ id: `summary-${i}`,
        behavior: m.inputs.map((value, x) => ({ in: { [r.boxes[0].inputs![0].id]: value }, out: { [r.boxes[0].outputs![0].id]: m.outputs[m.image[x]] } })) })) }));
      const reduced: FunctionModel = { ...model, boxes: model.boxes.filter(b => !removed.has(b.id)).map(b => {
        const r = heads.get(b.id);
        if (!r) return b;
        return { ...b, outputs: [{ ...b.outputs![0], carrier: r.certificate.layers.at(-1)![0].target }], behavior: virtualHoles[regions.indexOf(r)].alternatives[0].behavior };
      }), wires: model.wires.filter(w => !removed.has(w.to.box)).map(w => {
        const head = tails.get(w.from.box);
        return head ? { ...w, from: { box: head.id, port: head.outputs![0].id } } : w;
      }) };
      const libraries = [...virtualHoles, ...uncovered.map(i => holes[i])];
      const beforeCheck = used, checkStarted = performance.now();
      try {
        if (!checkBoundarySubstitution(model, holes, regions.map(r => r.certificate), reduced, libraries, spend)) throw new Stop("substitution-rejected");
      } finally {
        stats.certificateWork += used - beforeCheck;
        stats.substitutionCheckMs += performance.now() - checkStarted;
      }
      const compiled = SynthesisPruner.compile(reduced, target, libraries, budget, pruning, maxPruningWork, residual, propagation);
      if (!compiled) throw new Stop(`residual-${pruning.reason}`);
      stats.status = "ready"; stats.regions = regions.length;
      stats.prefixWidths = regions.map(r => r.certificate.layers.map(l => l.length));
      stats.states = stats.prefixWidths.flat().reduce((n, x) => n + x, 0);
      stats.transitions = regions.reduce((n, r) => n + r.certificate.stages.reduce((k, s) => k + s.edges.length, 0), 0);
      spend(stats.transitions + regions.reduce((n, r) => n + r.certificate.stages.reduce((k, s) => k + s.edges.reduce((j, e) => j + e.choices.length, 0), 0), 0));
      stats.supportCounts = regions.map(r => countSummarySupports(r.certificate).map(String));
      stats.cacheHits = regions.reduce((n, r) => n + r.certificate.stages.reduce((k, s, i) => k + r.certificate.layers[i].length * s.choiceCount - r.certificate.layers[i + 1].length, 0), 0);
      return new SymbolicPruner(regions, uncovered, compiled, budget, maxWork, stats);
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      stats.status = "fallback"; stats.reason = e.message;
      stats.retainedCells = 0;
      return undefined;
    } finally { stats.compilationMs = performance.now() - started; }
  }

  filter(original: bigint[]) {
    this.stats.filterCalls++;
    let used = 0;
    const started = performance.now();
    const limit = Math.min(this.maxWork, Math.floor(this.budget.remaining / 4));
    const spend = (n = 1) => { if (used + n > limit || !this.budget.spend(n)) throw new Stop(); used += n; this.stats.work += n; };
    try {
      const forward = this.regions.map(({ certificate: c }) => {
        const layers = [1n];
        for (const stage of c.stages) {
          let out = 0n;
          for (const e of stage.edges) {
            spend(1 + e.choices.length);
            if ((layers.at(-1)! & (1n << BigInt(e.from))) && (stage.hole === null || e.choices.some(i => (original[stage.hole!] & (1n << BigInt(i))) !== 0n))) out |= 1n << BigInt(e.to);
          }
          layers.push(out);
        }
        return layers;
      });
      const virtual = [...forward.map(l => l.at(-1)!), ...this.uncovered.map(i => original[i])];
      const result = this.residual.filter(virtual);
      if (!result) return undefined;
      const domains = [...original];
      this.regions.forEach(({ certificate: c }, r) => {
        let accepted = result.domains[r];
        for (let k = c.stages.length - 1; k >= 0; k--) {
          const s = c.stages[k]; let preceding = 0n, choices = 0n;
          for (const e of s.edges) {
            spend(1 + e.choices.length);
            if (!(accepted & (1n << BigInt(e.to))) || !(forward[r][k] & (1n << BigInt(e.from)))) continue;
            const mask = e.choices.reduce((m, i) => m | (1n << BigInt(i)), 0n);
            if (s.hole !== null && !(mask & original[s.hole])) continue;
            preceding |= 1n << BigInt(e.from); choices |= mask;
          }
          if (s.hole !== null) domains[s.hole] &= choices;
          accepted = preceding;
        }
      });
      this.uncovered.forEach((h, i) => { domains[h] &= result.domains[this.regions.length + i]; });
      return domains.every(d => d !== 0n) ? { domains } : undefined;
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      this.stats.filterFallbacks++;
      return { domains: original }; // Atomic rollback; work remains charged.
    } finally { this.stats.backwardMs += performance.now() - started; }
  }
}
