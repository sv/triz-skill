/** Checked finite-map compilation BEFORE union trace enumeration. All objects are request-local. */
import type { FunctionModel } from "./act.js";
import type { EngineeringBudget } from "./act-contract.js";
import { SynthesisPruner, type ChoiceLibrary, type SynthesisPruningStats } from "./act-synthesis-pruning.js";
import { checkRegionDeclarations, checkBoundarySubstitution, countSummarySupports, type FiniteMap, type PrimitiveCertificate, type RegionCertificate, type SummaryStage } from "./act-symbolic-certificate.js";

type Box = FunctionModel["boxes"][number];
export const symbolicStats = () => ({ status: "disabled" as "disabled" | "ready" | "fallback", reason: "", work: 0, certificateWork: 0,
  compilationMs: 0, certificateCheckMs: 0, substitutionCheckMs: 0, backwardMs: 0, regions: 0, states: 0, transitions: 0, prefixWidths: [] as number[][], supportCounts: [] as string[][], filterCalls: 0, filterFallbacks: 0, cacheHits: 0, primitiveGroups: 0, primitiveCompositions: 0, compositionsAvoided: 0, residualCalls: 0, residualCacheHits: 0, residualCacheEntries: 0, residualCacheCells: 0, retainedCells: 0 });
export type SymbolicStats = ReturnType<typeof symbolicStats>;
class Stop extends Error {}
const key = (m: FiniteMap) => JSON.stringify(m);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type StageInput = Omit<SummaryStage, "edges">;
function product(model: FunctionModel, ports: NonNullable<Box["inputs"]>, spend: (n?: number) => void): string[][] {
  const domains = ports.map(p => model.carriers.find(c => c.id === p.carrier)?.values);
  if (domains.some(d => !d?.length)) throw new Stop("missing-carrier-domain");
  const size = domains.reduce((n, d) => n * d!.length, 1);
  if (!Number.isSafeInteger(size)) throw new Stop("symbolic-product-domain-cap");
  spend(1 + size * (1 + ports.length)); // Reserve BEFORE building a Cartesian product.
  let tuples: string[][] = [[]];
  for (const domain of domains) tuples = tuples.flatMap(xs => domain!.map(x => [...xs, x]));
  return tuples;
}

function recognize(model: FunctionModel, b: Box, hole: number, rows: NonNullable<Box["behavior"]>[], spend: (n?: number) => void): StageInput | undefined {
  if (b.inner || b.state || b.initial || b.transition || b.role === "product" || !rows.length) return;
  const ins = b.inputs ?? [], outs = b.outputs ?? [];
  const inputs = product(model, ins, spend), outputs = product(model, outs, spend);
  const inputIndex = new Map(inputs.map((x, i) => [JSON.stringify(x), i])), outputIndex = new Map(outputs.map((x, i) => [JSON.stringify(x), i]));
  const maps = new Map<string, FiniteMap>(), primitives: PrimitiveCertificate[] = [];
  for (const relation of rows) {
    const image = new Array<number>(inputs.length).fill(-1), normalized: Array<[number, number]> = [];
    for (const r of relation) {
      spend(1 + ins.length + outs.length);
      if (Object.keys(r.in).length !== ins.length || Object.keys(r.out).length !== outs.length) return;
      const x = inputIndex.get(JSON.stringify(ins.map(p => r.in[p.id]))), y = outputIndex.get(JSON.stringify(outs.map(p => r.out[p.id])));
      if (x === undefined || y === undefined || (image[x] !== -1 && image[x] !== y)) return;
      image[x] = y; normalized.push([x, y]);
    }
    if (image.includes(-1)) return;
    const signature = image.join(",");
    let map = maps.get(signature);
    if (!map) { map = { source: ins.map(p => p.carrier), target: outs.map(p => p.carrier), inputs, outputs, image }; maps.set(signature, map); }
    primitives.push({ map, rows: normalized });
  }
  return { box: b.id, hole: hole < 0 ? null : hole, inputPorts: ins.map(p => p.id), outputPorts: outs.map(p => p.id), primitives, choiceCount: rows.length };
}

/** Reindex a whole JOINT domain using the explicit incoming wire permutation. */
function reorderInput(model: FunctionModel, b: Box, s: StageInput, order: string[], spend: (n?: number) => void): StageInput {
  if (same(order, s.inputPorts)) return s;
  const columns = order.map(p => s.inputPorts.indexOf(p));
  if (order.length !== s.inputPorts.length || columns.some(i => i < 0) || new Set(columns).size !== s.inputPorts.length) throw new Stop("invalid-wire-permutation");
  const ports = order.map(id => b.inputs!.find(p => p.id === id)!);
  const inputs = product(model, ports, spend), indices = new Map(inputs.map((x, i) => [JSON.stringify(x), i]));
  const oldToNew = s.primitives[0].map.inputs.map(xs => indices.get(JSON.stringify(columns.map(i => xs[i])))!);
  const changed = new Map<FiniteMap, FiniteMap>();
  const primitives = s.primitives.map(p => {
    spend(1 + p.rows.length);
    let map = changed.get(p.map);
    if (!map) {
      spend(1 + p.map.image.length);
      const image = new Array<number>(inputs.length);
      oldToNew.forEach((next, old) => { image[next] = p.map.image[old]; });
      map = { ...p.map, source: ports.map(p => p.carrier), inputs, image }; changed.set(p.map, map);
    }
    return { map, rows: p.rows.map(([x, y]) => [oldToNew[x], y] as [number, number]) };
  });
  return { ...s, inputPorts: order, primitives };
}

export function compileRegion(stages: StageInput[], spend: (n?: number) => void, stats?: SymbolicStats): RegionCertificate {
  const first = stages[0].primitives[0].map;
  const layers: FiniteMap[][] = [[{ source: first.source, target: first.source, inputs: first.inputs, outputs: first.inputs, image: first.inputs.map((_, i) => i) }]];
  const compiled: SummaryStage[] = [];
  for (const stage of stages) {
    const groups = new Map<string, { primitive: number; map: FiniteMap; choices: number[] }>();
    stage.primitives.forEach(({ map }, choice) => {
      spend(1 + map.image.length);
      const signature = key(map), prior = groups.get(signature);
      if (prior) prior.choices.push(choice); else groups.set(signature, { primitive: choice, map, choices: [choice] });
    });
    const next: FiniteMap[] = [], ids = new Map<string, number>(), edges: SummaryStage["edges"] = [];
    const previous = layers[layers.length - 1];
    if (stats) { stats.primitiveGroups += groups.size; stats.compositionsAvoided += previous.length * (stage.choiceCount - groups.size); }
    for (const [from, a] of previous.entries()) for (const g of groups.values()) {
      const b = g.map;
      spend(1 + a.image.length + a.outputs.length + b.inputs.length + b.outputs.length);
      if (stats) stats.primitiveCompositions++;
      if (!same(a.target, b.source) || !same(a.outputs, b.inputs)) throw new Stop("typed-composition");
      const m = { source: a.source, target: b.target, inputs: a.inputs, outputs: b.outputs, image: a.image.map(y => b.image[y]) };
      const signature = key(m);
      let to = ids.get(signature);
      if (to === undefined) { to = next.length; ids.set(signature, to); next.push(m); }
      edges.push({ from, to, primitive: g.primitive, choices: [...g.choices] });
    }
    if (stats) stats.cacheHits += previous.length * groups.size - next.length;
    compiled.push({ ...stage, edges }); layers.push(next);
  }
  return { stages: compiled, layers };
}

type Region = { boxes: Box[]; certificate: RegionCertificate };
/** A wrapper over the existing exact coupled residual, whose choices now name summary states.
 * The DAG carries supports; it is NEVER flattened into rectangles of concrete choices. */
export class SymbolicPruner {
  private readonly virtualCache = new Map<string, bigint[] | null>();
  private readonly edgeMasks: bigint[][][];
  private constructor(readonly regions: Region[], readonly uncovered: number[], readonly residual: SynthesisPruner,
    readonly budget: EngineeringBudget, readonly maxWork: number, readonly stats: SymbolicStats,
    readonly memoryLimit: number, readonly memoize: boolean) {
    this.edgeMasks = regions.map(r => r.certificate.stages.map(s => s.edges.map(e => e.choices.reduce((m, i) => m | (1n << BigInt(i)), 0n))));
    stats.retainedCells += this.edgeMasks.flat(2).reduce((n, m) => n + m.toString().length, 0);
    if (stats.retainedCells > memoryLimit) throw new Stop("symbolic-memory-cap");
  }

  static compile(model: FunctionModel, target: FunctionModel, holes: ChoiceLibrary[], budget: EngineeringBudget, pruning: SynthesisPruningStats,
    stats: SymbolicStats, maxWork: number, maxCells: number, residual: boolean, propagation: boolean, maxPruningWork = maxWork, memoize = true): SymbolicPruner | undefined {
    let used = 0;
    const started = performance.now();
    const limit = Math.min(maxWork, Math.floor(budget.remaining / 4));
    const spend = (n = 1) => { if (used + n > limit || !budget.spend(n)) throw new Stop("symbolic-work-cap"); used += n; stats.work += n; };
    try {
      spend(1 + model.boxes.length + model.wires.length);
      const byId = new Map(model.boxes.map(b => [b.id, b])), incoming = new Map<string, FunctionModel["wires"]>(), outgoing = new Map<string, FunctionModel["wires"]>();
      for (const w of model.wires) { incoming.set(w.to.box, [...(incoming.get(w.to.box) ?? []), w]); outgoing.set(w.from.box, [...(outgoing.get(w.from.box) ?? []), w]); }
      const recognized = new Map<string, StageInput>();
      for (const b of model.boxes) {
        const hole = holes.findIndex(h => h.box === b.id), h = holes[hole];
        const rows = h ? h.alternatives.map(a => a.behavior) : b.behavior ? [b.behavior] : [];
        const stage = recognize(model, b, hole, rows, spend);
        if (stage) recognized.set(b.id, stage);
      }
      const next = new Map<string, string>(), prior = new Map<string, string>();
      for (const [id, s] of recognized) {
        const wires = outgoing.get(id) ?? [];
        spend(1 + wires.length + s.outputPorts.length);
        if (!s.outputPorts.length || wires.length !== s.outputPorts.length || new Set(wires.map(w => w.from.port)).size !== wires.length) continue;
        const targetId = wires[0].to.box, t = recognized.get(targetId);
        if (!t || wires.some(w => w.to.box !== targetId) || (incoming.get(targetId)?.length ?? 0) !== t.inputPorts.length
          || wires.length !== t.inputPorts.length || new Set(wires.map(w => w.to.port)).size !== t.inputPorts.length
          || s.outputPorts.some(p => !wires.some(w => w.from.port === p)) || t.inputPorts.some(p => !wires.some(w => w.to.port === p))) continue;
        next.set(id, targetId); prior.set(targetId, id);
      }
      const regions: Region[] = [], covered = new Set<number>();
      for (const id of recognized.keys()) {
        if (prior.has(id)) continue; // Cycles have no head and remain in the ordinary solver.
        const boxes: Box[] = [];
        for (let at: string | undefined = id; at !== undefined; at = next.get(at)) boxes.push(byId.get(at)!);
        if (boxes.length < 2 || !boxes.some(b => recognized.get(b.id)!.hole !== null)) continue;
        const stages = boxes.map((b, i) => {
          const s = recognized.get(b.id)!;
          if (!i) return s;
          const previous = recognized.get(boxes[i - 1].id)!, wires = outgoing.get(previous.box)!;
          const order = previous.outputPorts.map(id => wires.find(w => w.from.port === id)!.to.port);
          return reorderInput(model, b, s, order, spend);
        });
        const certificate = compileRegion(stages, spend, stats);
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
      const tails = new Map(regions.map(r => [r.boxes[r.boxes.length - 1].id, r]));
      const outputPorts = regions.map(r => {
        const head = r.boxes[0], tail = r.boxes.at(-1)!, used = new Set((head.inputs ?? []).map(p => p.id));
        return r.certificate.stages.at(-1)!.outputPorts.map((id, i) => {
          let port = head.outputs?.[i]?.id ?? `summary-output-${i}`;
          while (used.has(port)) port = `_${port}`;
          used.add(port);
          return { ...tail.outputs!.find(p => p.id === id)!, id: port };
        });
      });
      const virtualHoles: ChoiceLibrary[] = regions.map((r, k) => ({ box: r.boxes[0].id, alternatives: r.certificate.layers.at(-1)!.map((m, i) => ({ id: `summary-${i}`,
        behavior: m.inputs.map((values, x) => ({ in: Object.fromEntries(r.certificate.stages[0].inputPorts.map((p, j) => [p, values[j]])),
          out: Object.fromEntries(outputPorts[k].map((p, j) => [p.id, m.outputs[m.image[x]][j]])) })) })) }));
      const reduced: FunctionModel = { ...model, boxes: model.boxes.filter(b => !removed.has(b.id)).map(b => {
        const r = heads.get(b.id);
        if (!r) return b;
        const k = regions.indexOf(r);
        return { ...b, outputs: outputPorts[k], behavior: virtualHoles[k].alternatives[0].behavior };
      }), wires: model.wires.filter(w => !removed.has(w.to.box)).map(w => {
        const r = tails.get(w.from.box);
        if (!r) return w;
        const k = regions.indexOf(r), column = r.certificate.stages.at(-1)!.outputPorts.indexOf(w.from.port);
        return { ...w, from: { box: r.boxes[0].id, port: outputPorts[k][column].id } };
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
      spend(2 * stats.transitions + 2 * regions.reduce((n, r) => n + r.certificate.stages.reduce((k, s) => k + s.edges.reduce((j, e) => j + e.choices.length, 0), 0), 0));
      stats.supportCounts = regions.map(r => countSummarySupports(r.certificate).map(String));
      return new SymbolicPruner(regions, uncovered, compiled, budget, maxWork, stats, maxCells, memoize);
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      stats.status = "fallback"; stats.reason = e.message;
      stats.retainedCells = 0;
      return undefined;
    } finally { stats.compilationMs = performance.now() - started; }
  }

  filter(original: bigint[]): { domains: bigint[] } | undefined {
    this.stats.filterCalls++;
    let used = 0;
    const started = performance.now();
    const limit = Math.min(this.maxWork, Math.floor(this.budget.remaining / 4));
    const spend = (n = 1) => { if (used + n > limit || !this.budget.spend(n)) throw new Stop(); used += n; this.stats.work += n; };
    try {
      const forward = this.regions.map(({ certificate: c }, r) => {
        const layers = [1n];
        for (const [k, stage] of c.stages.entries()) {
          let out = 0n;
          for (const [j, e] of stage.edges.entries()) {
            spend();
            if ((layers.at(-1)! & (1n << BigInt(e.from))) && (this.edgeMasks[r][k][j] & (stage.hole === null ? 1n : original[stage.hole])) !== 0n) out |= 1n << BigInt(e.to);
          }
          layers.push(out);
        }
        return layers;
      });
      const virtual = [...forward.map(l => l.at(-1)!), ...this.uncovered.map(i => original[i])];
      const signature = this.memoize ? virtual.join(",") : "";
      if (this.memoize) spend(1 + signature.length);
      let acceptedVirtual: bigint[] | null;
      if (this.memoize && this.virtualCache.has(signature)) {
        this.stats.residualCacheHits++;
        const cached = this.virtualCache.get(signature)!;
        acceptedVirtual = cached ? [...cached] : null;
      } else {
        this.stats.residualCalls++;
        const priorFallbacks = this.residual.stats.propagationFallbacks;
        const result = this.residual.filter(virtual);
        acceptedVirtual = result ? result.domains : null;
        if (this.memoize && this.residual.stats.propagationFallbacks === priorFallbacks && this.virtualCache.size < 128) {
          const cells = signature.length + (acceptedVirtual ? acceptedVirtual.join(",").length : 1);
          spend(1 + cells);
          if (this.stats.retainedCells + cells <= this.memoryLimit) {
            this.virtualCache.set(signature, acceptedVirtual ? [...acceptedVirtual] : null);
            this.stats.retainedCells += cells; this.stats.residualCacheCells += cells; this.stats.residualCacheEntries++;
          }
        }
      }
      if (!acceptedVirtual) return undefined;
      const domains = [...original];
      this.regions.forEach(({ certificate: c }, r) => {
        let accepted = acceptedVirtual![r];
        for (let k = c.stages.length - 1; k >= 0; k--) {
          const s = c.stages[k]; let preceding = 0n, choices = 0n;
          for (const [j, e] of s.edges.entries()) {
            spend();
            if (!(accepted & (1n << BigInt(e.to))) || !(forward[r][k] & (1n << BigInt(e.from)))) continue;
            const mask = this.edgeMasks[r][k][j];
            if (s.hole !== null && !(mask & original[s.hole])) continue;
            preceding |= 1n << BigInt(e.from); choices |= mask;
          }
          if (s.hole !== null) domains[s.hole] &= choices;
          accepted = preceding;
        }
      });
      this.uncovered.forEach((h, i) => { domains[h] &= acceptedVirtual![this.regions.length + i]; });
      return domains.every(d => d !== 0n) ? { domains } : undefined;
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      this.stats.filterFallbacks++;
      return { domains: original }; // Atomic rollback; work remains charged.
    } finally { this.stats.backwardMs += performance.now() - started; }
  }
}
