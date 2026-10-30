/** Annotation-preserving isomorphism. Search continues after a structural mapping fails. */
import { z } from "zod";
import { FunctionModel, checkModel, type FunctionModel as Model } from "./act.js";
import { checkIsomorphism, findIsomorphism, type ModelMapping } from "./act-iso.js";
import { fail, issue } from "./act-issues.js";

// Entry lists preserve arbitrary ids such as __proto__ across Zod/JSON parsing.
const entries = z.array(z.tuple([z.string().min(1), z.string().min(1)])).refine(xs => new Set(xs.map(([k]) => k)).size === xs.length, "Mapping keys must be distinct");
const record = z.union([entries, z.record(z.string(), z.string().min(1))]);
const nested = z.union([z.array(z.tuple([z.string().min(1), record])).refine(xs => new Set(xs.map(([k]) => k)).size === xs.length, "Mapping keys must be distinct"), z.record(z.string(), record)]);
const mappingRecord = (x: z.infer<typeof record>) => Object.fromEntries(Array.isArray(x) ? x : Object.entries(x));
const nestedRecord = (x: z.infer<typeof nested>) => Object.fromEntries((Array.isArray(x) ? x : Object.entries(x)).map(([k, v]) => [k, mappingRecord(v)]));
export const SemanticMapping = z.strictObject({
  boxes: record, ports: nested, wires: record, carriers: record, dims: record,
  values: nested, states: nested.optional(),
});
export type SemanticMapping = ModelMapping & { values: Record<string, Record<string, string>>; states?: Record<string, Record<string, string>> };
const normalizeMapping = (m: z.infer<typeof SemanticMapping>): SemanticMapping => ({ boxes: mappingRecord(m.boxes), ports: nestedRecord(m.ports), wires: mappingRecord(m.wires), carriers: mappingRecord(m.carriers), dims: mappingRecord(m.dims), values: nestedRecord(m.values), ...(m.states ? { states: nestedRecord(m.states) } : {}) });
const portableMapping = (m: SemanticMapping) => ({ boxes: Object.entries(m.boxes), ports: Object.entries(m.ports).map(([k,v]) => [k,Object.entries(v)]), wires: Object.entries(m.wires), carriers: Object.entries(m.carriers), dims: Object.entries(m.dims), values: Object.entries(m.values).map(([k,v]) => [k,Object.entries(v)]), states: Object.entries(m.states ?? {}).map(([k,v]) => [k,Object.entries(v)]) });
export const SemanticIsomorphismRequest = z.strictObject({
  source: FunctionModel, target: FunctionModel, mapping: SemanticMapping.optional(),
  profile: z.enum(["behavior", "dynamics", "feasibility", "flows", "all"]).default("all"),
  max_steps: z.number().int().min(1).max(100_000).default(10_000),
});
export type SemanticProfile = z.infer<typeof SemanticIsomorphismRequest>["profile"];
const canonical = (x: unknown): string => x && typeof x === "object"
  ? Array.isArray(x) ? `[${x.map(canonical).join(",")}]` : `{${Object.entries(x).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`
  : JSON.stringify(x);
const bag = (xs: unknown[]) => xs.map(canonical).sort().join("\n");
const sameSet = (a: string[], b: string[]) => bag([...new Set(a)]) === bag([...new Set(b)]);
function isBijection(map: Record<string, string> | undefined, from: string[], to: string[]) {
  return !!map && sameSet(Object.keys(map), from) && sameSet(Object.values(map), to) && new Set(Object.values(map)).size === from.length && from.length === to.length;
}
const resources = (m: Model) => [...new Set([...m.boxes.flatMap(b => [...Object.keys(b.cost ?? {}), ...(b.feasibility ?? []).flatMap(r => Object.keys(r.cost ?? {}))]), ...Object.keys(m.budget ?? {}), ...Object.keys(m.weights ?? {}).filter(k => k !== "harmful")])];

export function checkSemanticIsomorphism(source: Model, target: Model, mapping: SemanticMapping, profile: SemanticProfile = "all") {
  const a = checkModel(source), b = checkModel(target);
  if (!a.ok || !b.ok) return fail([...(!a.ok ? a.issues : []), ...(!b.ok ? b.issues : [])]);
  const errors: string[] = [];
  // Extra feasibility-only dimensions are irrelevant to the structural checker.
  const structuralDims = new Set([...source.boxes.flatMap(x => Object.keys(x.cost ?? {})), ...Object.keys(source.budget ?? {}), ...Object.keys(source.weights ?? {}).filter(k => k !== "harmful")]);
  const structural = checkIsomorphism(source, target, { ...mapping, dims: Object.fromEntries(Object.entries(mapping.dims).filter(([d]) => structuralDims.has(d))) });
  if (!structural.ok) return { ok: true as const, decided: true as const, aligned: false, profile, errors: structural.errors };
  const boxes = new Map(target.boxes.map(b => [b.id, b]));
  const carriers = new Map(target.carriers.map(c => [c.id, c]));
  for (const c of source.carriers) {
    const d = carriers.get(mapping.carriers[c.id])!;
    const vm = mapping.values[c.id];
    if (!isBijection(vm, c.values ?? [], d.values ?? [])) errors.push(`carrier '${c.id}' values are not mapped bijectively`);
    if (c.layer !== d.layer || c.dimension !== d.dimension) errors.push(`carrier '${c.id}' quantity layer or dimension differs`);
    // Extensive or intensive changes how triz_feasibility adds demands, so a map must keep it.
    if ((c.quantity ?? "intensive") !== (d.quantity ?? "intensive")) errors.push(`carrier '${c.id}' quantity kind (intensive or extensive) differs`);
    if (bag((c.levels ?? []).map(l => ({ ...l, value: vm?.[l.value] }))) !== bag(d.levels ?? [])) errors.push(`carrier '${c.id}' levels differ`);
  }
  if (errors.length) return { ok: true as const, decided: true as const, aligned: false, profile, errors };
  const vector = (v: Record<string, number> | undefined, dims: Record<string, string>) => Object.fromEntries(Object.entries(v ?? {}).map(([k, n]) => [dims[k] ?? k, n]));
  if (profile === "all" || profile === "feasibility") {
    if (!isBijection(mapping.dims, resources(source), resources(target))) errors.push("resource dimensions are not mapped bijectively");
  }
  for (const box of source.boxes) {
    const other = boxes.get(mapping.boxes[box.id])!;
    const pm = mapping.ports[box.id];
    const mapped = (v: Record<string, string>, side: "inputs" | "outputs") => Object.fromEntries(Object.entries(v).map(([p, value]) => {
      const port = (box[side] ?? []).find(q => q.id === p)!;
      return [pm[p], mapping.values[port.carrier][value]];
    }));
    const rows = (rs: NonNullable<typeof box.behavior>) => rs.map(r => ({ in: mapped(r.in, "inputs"), out: mapped(r.out, "outputs") }));
    if (profile === "all" || profile === "behavior") {
      for (const field of ["behavior", "producible"] as const) {
        if ((box[field] === undefined) !== (other[field] === undefined) || bag(rows(box[field] ?? [])) !== bag(other[field] ?? [])) errors.push(`box '${box.id}' ${field} differs`);
      }
    }
    if (profile === "all" || profile === "dynamics") {
      const sm = mapping.states?.[box.id] ?? {};
      if (!isBijection(sm, box.state ?? [], other.state ?? [])) errors.push(`box '${box.id}' state map is not bijective`);
      else {
        if (!sameSet((box.initial ?? []).map(s => sm[s]), other.initial ?? [])) errors.push(`box '${box.id}' initial states differ`);
        if ((box.transition === undefined) !== (other.transition === undefined) || bag((box.transition ?? []).map(r => ({ state: sm[r.state], next: sm[r.next], in: mapped(r.in, "inputs"), out: mapped(r.out, "outputs") }))) !== bag(other.transition ?? [])) errors.push(`box '${box.id}' transitions differ`);
        if ((box.behavior === undefined) !== (other.behavior === undefined) || bag(rows(box.behavior ?? [])) !== bag(other.behavior ?? [])) errors.push(`box '${box.id}' stateless behavior differs`);
      }
    }
    if (profile === "all" || profile === "feasibility") {
      const portVector = (v: Record<string, number> | undefined) => Object.fromEntries(Object.entries(v ?? {}).map(([p, n]) => [pm[p], n]));
      const normal = (r: NonNullable<typeof box.feasibility>[number]) => ({ provides: r.provides ?? {}, requires: r.requires ?? {}, cost: r.cost ?? {} });
      const transformed = (box.feasibility ?? []).map(r => ({ provides: portVector(r.provides), requires: portVector(r.requires), cost: vector(r.cost, mapping.dims) }));
      if ((box.feasibility === undefined) !== (other.feasibility === undefined) || bag(transformed) !== bag((other.feasibility ?? []).map(normal))) errors.push(`box '${box.id}' feasibility differs`);
    }
  }
  if (profile === "all" || profile === "flows") {
    const flows = (source.flows ?? []).map(f => ({ carrier: mapping.carriers[f.carrier], path: f.path.map(b => mapping.boxes[b]), ...(f.medium === undefined ? {} : { medium: mapping.boxes[f.medium] }) }));
    if (bag(flows) !== bag((target.flows ?? []).map(({ carrier, path, medium }) => ({ carrier, path, ...(medium === undefined ? {} : { medium }) })))) errors.push("flow paths differ");
  }
  return { ok: true as const, decided: true as const, aligned: errors.length === 0, profile, errors };
}

/** One global budget includes structural individualization and value/state assignments. */
export function semanticIsomorphism(input: z.input<typeof SemanticIsomorphismRequest>) {
  const parsed = SemanticIsomorphismRequest.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map(e => issue("invalid-argument", `$.${e.path.join(".")}`, e.message, "Use the semantic-isomorphism request schema.")));
  const { source, target, mapping, profile, max_steps } = parsed.data;
  if (mapping) return checkSemanticIsomorphism(source, target, normalizeMapping(mapping), profile);
  let found: SemanticMapping | undefined;
  const extraA = resources(source), extraB = resources(target);
  const result = findIsomorphism(source, target, max_steps, { accept: (base, charge) => {
    const families: Array<{ kind: "values" | "states" | "dims"; id: string; from: string[]; to: string[] }> = [];
    for (const c of source.carriers) families.push({ kind: "values", id: c.id, from: c.values ?? [], to: target.carriers.find(d => d.id === base.carriers[c.id])!.values ?? [] });
    if (profile === "all" || profile === "dynamics") for (const b of source.boxes) families.push({ kind: "states", id: b.id, from: b.state ?? [], to: target.boxes.find(d => d.id === base.boxes[b.id])!.state ?? [] });
    const remainingA = extraA.filter(d => !Object.hasOwn(base.dims, d));
    const remainingB = extraB.filter(d => !Object.values(base.dims).includes(d));
    if (profile === "all" || profile === "feasibility") families.push({ kind: "dims", id: "", from: remainingA, to: remainingB });
    const current: SemanticMapping = { ...base, dims: { ...base.dims }, values: {}, states: {} };
    const family = (index: number): boolean => {
      if (index === families.length) {
        charge();
        const checked = checkSemanticIsomorphism(source, target, current, profile);
        if (checked.ok && checked.aligned) { found = structuredClone(current); return true; }
        return false;
      }
      const f = families[index];
      if (f.from.length !== f.to.length) return false;
      const pairs: Array<[string, string]> = [], used = new Set<string>();
      const permutation = (i: number): boolean => {
        if (i === f.from.length) {
          const map = Object.fromEntries(pairs);
          if (f.kind === "dims") current.dims = { ...base.dims, ...map };
          else if (f.kind === "values") current.values = { ...current.values, [f.id]: map };
          else current.states = { ...current.states, [f.id]: map };
          return family(index + 1);
        }
        for (const y of f.to) if (!used.has(y)) {
          charge(); used.add(y); pairs.push([f.from[i], y]);
          if (permutation(i + 1)) return true;
          pairs.pop(); used.delete(y);
        }
        return false;
      };
      return permutation(0);
    };
    return family(0);
  } });
  if (!result.ok || !result.decided) return { ...result, profile };
  return { ok: true as const, decided: true as const, aligned: result.isomorphic && !!found, profile, ...(found ? { mapping: portableMapping(found), mappingFormat: "entry-lists" } : {}), scope: "annotation-preserving isomorphism; no claim of physical transfer" };
}
