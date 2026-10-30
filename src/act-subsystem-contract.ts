/** Local contracts for a hierarchical box. A checked claim is conditional on the declared rows,
 * numeric modes, and the caller's empirical coupling assertion; it is not an extracted proof. */
import { z } from "zod";
import { FunctionModel, checkModel, type FunctionModel as Model } from "./act.js";
import { summarizeSubsystem } from "./act-refinement.js";
import { at, fail, issue, type Issue } from "./act-issues.js";
import { resourceSourceSupport, ResourceSupportCap, type SupportRow } from "./act-resource-support.js";

const Id = z.string().min(1);
const ContractKey = z.string().regex(/^(?!__proto__$)/);
const Values = z.record(ContractKey, Id);
const ContractRow = z.strictObject({ in: Values, out: Values });
const Amounts = z.record(z.string().min(1).regex(/^(?!__proto__$)/), z.number().nonnegative().finite());
/** Detect keys that Zod's record parser would otherwise silently discard. Run before the
 * record schemas, including on the MCP SDK's first validation pass. */
function forbiddenContractKey(value: unknown): Array<string | number> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const c = value as { assumptions?: unknown; behavior?: unknown; resources?: unknown };
  const records: Array<[unknown, Array<string | number>]> = [];
  if (Array.isArray(c.assumptions)) c.assumptions.forEach((row, i) => records.push([row, ["assumptions", i]]));
  if (Array.isArray(c.behavior)) c.behavior.forEach((row, i) => {
    if (row && typeof row === "object") {
      const value = row as { in?: unknown; out?: unknown };
      records.push([value.in, ["behavior", i, "in"]], [value.out, ["behavior", i, "out"]]);
    }
  });
  if (c.resources && typeof c.resources === "object") for (const side of ["inputs", "outputs", "budget"] as const)
    records.push([(c.resources as Record<string, unknown>)[side], ["resources", side]]);
  const bad = records.find(([row]) => row !== null && typeof row === "object" && Object.hasOwn(row, "__proto__"));
  return bad ? [...bad[1], "__proto__"] : undefined;
}

export const SubsystemContractRequest = z.strictObject({
  model: FunctionModel, box: Id, mode: z.enum(["declared", "verify"]),
  contract: z.preprocess((value, ctx) => {
    const bad = forbiddenContractKey(value);
    if (bad) ctx.addIssue({ code: "custom", path: bad, message: "__proto__ is not a usable contract key" });
    return value;
  }, z.strictObject({
    behavior: z.array(ContractRow).max(10000),
    assumptions: z.array(Values).min(1).max(10000),
    resources: z.strictObject({ inputs: Amounts, outputs: Amounts, budget: Amounts }),
    operating_envelope: Id,
    resource_binding: z.literal("all-behavior-rows").optional(),
  })),
  max_states: z.number().int().min(1).max(100_000).optional(),
  max_support_work: z.number().int().min(1).max(1_000_000).optional()
    .describe("Source-support work cap, independent of the behavior state cap; defaults to 100000"),
});
export type SubsystemContractRequest = z.infer<typeof SubsystemContractRequest>;
const canonical = (ids: string[], r: Record<string, string>) => JSON.stringify(ids.map(k => r[k]));
const pair = (ins: string[], outs: string[], r: { in: Record<string, string>; out: Record<string, string> }) => JSON.stringify([ins.map(k => r.in[k]), outs.map(k => r.out[k])]);
const own = <T>(obj: Record<string, T>, key: string): T | undefined => Object.hasOwn(obj, key) ? obj[key] : undefined;
const asNumber = (obj: Record<string, number> | undefined, key: string) => obj ? own(obj, key) ?? 0 : 0;

/** Recompute from the model on each call; no caller-provided checked status is accepted. */
export function checkSubsystemContract(input: unknown) {
  const raw = input && typeof input === "object" ? (input as { contract?: unknown }).contract : undefined;
  const bad = forbiddenContractKey(raw);
  if (bad) return fail([issue("invalid-argument", at("$.contract", ...bad), "__proto__ is not a usable contract key", "Use another port or resource dimension name.")]);
  const parsed = SubsystemContractRequest.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map(e => issue("invalid-argument", at("$", ...e.path.map(String)), e.message, "Use the strict subsystem contract schema.")));
  const { model, box, mode, contract, max_states = 100_000, max_support_work = 100_000 } = parsed.data;
  const checked = checkModel(model, "$.model");
  if (!checked.ok) return fail(checked.issues);
  const outer = model.boxes.find(b => b.id === box);
  if (!outer?.inner) return fail([issue("unknown-box", "$.box", `box '${box}' does not have an inner model`, "Choose a hierarchical box with an inner model.")]);
  const inner = outer.inner.model as Model;
  const ins = (outer.inputs ?? []).map(p => p.id).sort(), outs = (outer.outputs ?? []).map(p => p.id).sort();
  const issues: Issue[] = [];
  const valid = (row: Record<string, string>, ids: string[], side: "inputs" | "outputs", path: string) => {
    const keys = Object.keys(row);
    if (keys.length !== ids.length || ids.some(id => !Object.hasOwn(row, id)) || keys.some(id => !ids.includes(id))) {
      issues.push(issue("invalid-argument", path, "row does not name exactly the interface ports", `Name each ${side} port exactly once: ${ids.join(", ") || "none"}.`)); return;
    }
    for (const id of ids) {
      const port = outer[side]!.find(p => p.id === id)!;
      const values = model.carriers.find(c => c.id === port.carrier)?.values;
      if (values && !values.includes(row[id])) issues.push(issue("undeclared-value", at(path, id), `value '${row[id]}' is not declared on '${id}'`, `Use a value declared for carrier '${port.carrier}'.`));
    }
  };
  contract.assumptions.forEach((r, i) => valid(r, ins, "inputs", at("$.contract.assumptions", i)));
  contract.behavior.forEach((r, i) => { valid(r.in, ins, "inputs", at("$.contract.behavior", i, "in")); valid(r.out, outs, "outputs", at("$.contract.behavior", i, "out")); });
  for (const [side, ids] of [["inputs", ins], ["outputs", outs]] as const) {
    const keys = Object.keys(contract.resources[side]);
    if (keys.length !== ids.length || ids.some(id => !Object.hasOwn(contract.resources[side], id)) || keys.some(id => !ids.includes(id)))
      issues.push(issue("invalid-argument", `$.contract.resources.${side}`, `numeric ${side} must name the whole interface`, `Supply one level for each ${side} port: ${ids.join(", ") || "none"}.`));
  }
  const assumptionKeys = contract.assumptions.map(r => canonical(ins, r));
  if (new Set(assumptionKeys).size !== assumptionKeys.length) issues.push(issue("listed-twice", "$.contract.assumptions", "duplicate operating assumption", "List each joint input assumption once."));
  const rowKeys = contract.behavior.map(r => pair(ins, outs, r));
  if (new Set(rowKeys).size !== rowKeys.length) issues.push(issue("listed-twice", "$.contract.behavior", "duplicate contract behavior row", "List each behavior row once."));
  if (contract.behavior.some(r => !assumptionKeys.includes(canonical(ins, r.in)))) issues.push(issue("invalid-argument", "$.contract.behavior", "a behavior row is outside the operating assumptions", "List rows only for the declared joint input assumptions."));
  if (issues.length) return fail(issues);
  const base = { box, operatingEnvelope: contract.operating_envelope, coupling: contract.resource_binding ? "declared-unverified" as const : "not-declared" as const };
  if (mode === "declared") return { ok: true as const, ...base, status: "declared-unverified" as const, note: "The supplied behavior, assumptions and resource contract have not been checked against the inner model." };
  if (inner.boxes.some(b => b.inner)) return { ok: true as const, ...base, status: "undecided" as const, reason: "nested-inner-model" as const, note: "Expand nested inner boxes before checking this contract." };
  const summary = summarizeSubsystem({ model: inner, boxes: inner.boxes.map(b => b.id), id: "__local_contract__", max_states });
  if (!summary.ok) {
    if (summary.issues.some(i => i.code === "cap-exceeded")) return { ok: true as const, ...base, status: "undecided" as const, reason: "behavior-cap" as const };
    return { ok: true as const, ...base, status: "undecided" as const, reason: "behavior-analysis" as const, details: summary };
  }
  if (!("relation" in summary) || !summary.relation || !("inputMap" in summary) || !summary.inputMap || !("outputMap" in summary) || !summary.outputMap) return { ok: true as const, ...base, status: "undecided" as const, reason: "reason" in summary ? summary.reason : "behavior-analysis" };
  const inputMap = summary.inputMap, outputMap = summary.outputMap;
  const lookup = (side: "inputs" | "outputs", port: string) => outer.inner[side].find((x: { outer: string }) => x.outer === port)!.inner as { box: string; port: string };
  const mapped = (side: "inputs" | "outputs", port: string) => {
    const end = lookup(side, port), map = side === "inputs" ? inputMap : outputMap;
    return map.find(m => m.original.box === end.box && m.original.port === end.port)?.summary.port;
  };
  if ([...ins.map(x => mapped("inputs", x)), ...outs.map(x => mapped("outputs", x))].some(x => x === undefined))
    return { ok: true as const, ...base, status: "undecided" as const, reason: "interface-projection" as const };
  const assumptions = new Set(assumptionKeys), actual = new Set<string>(), activeInputs = new Set<string>();
  for (const r of summary.relation) {
    const x = Object.fromEntries(ins.map(id => [id, r.in[mapped("inputs", id)!]]));
    const y = Object.fromEntries(outs.map(id => [id, r.out[mapped("outputs", id)!]]));
    if (assumptions.has(canonical(ins, x))) { actual.add(pair(ins, outs, { in: x, out: y })); activeInputs.add(canonical(ins, x)); }
  }
  const declared = new Set(rowKeys), missing = [...actual].filter(k => !declared.has(k)), extra = [...declared].filter(k => !actual.has(k));
  const blocked = assumptionKeys.filter(key => !activeInputs.has(key));
  const behavior = { classification: !missing.length && !extra.length ? "exact" as const : !missing.length ? "overapproximation" as const : !extra.length ? "underapproximation" as const : "incomparable" as const,
    inputEnabled: blocked.length === 0, missingPairCount: missing.length, extraPairCount: extra.length, blockedInputCount: blocked.length,
    ...(missing.length ? { missingExample: JSON.parse(missing[0]) } : {}), ...(extra.length ? { extraExample: JSON.parse(extra[0]) } : {}), ...(blocked.length ? { blockedExample: JSON.parse(blocked[0]) } : {}) };
  const resource = checkResources(inner, outer.inner, contract.resources, contract.resource_binding, contract.assumptions, contract.behavior, max_support_work);
  const behaviorPass = behavior.classification === "exact" && behavior.inputEnabled;
  const status = !behaviorPass || resource.status === "rejected" ? "rejected" as const : resource.status === "undecided" ? "undecided" as const : "checked" as const;
  // The interface hides internal functions; a checked contract still names the harmful or
  // excessive ones behind it, as triz_subsystem_summary does.
  const hiddenHarms = "hiddenHarms" in summary && Array.isArray(summary.hiddenHarms) ? summary.hiddenHarms : [];
  return { ok: true as const, ...base, status, behavior, resources: resource, hiddenHarms, scope: "whole-inner-model" as const,
    note: "Checks concern the complete declared steady-state relation and the single declared numeric mode within the stated assumptions, with resource support grounded in boundary supplies or rows without positive requirements. Startup is not simulated. Behavior/resource coupling and the operating envelope remain empirical assertions, not verified evidence. hiddenHarms lists the harmful or excessive inner functions behind the interface." };
}

/** Check the one numeric mode directly, including disconnected boxes and extensive fan-out. */
function checkResources(inner: Model, binding: { inputs: Array<{ outer: string; inner: { box: string; port: string } }>; outputs: Array<{ outer: string; inner: { box: string; port: string } }> },
  resources: SubsystemContractRequest["contract"]["resources"], coupling: SubsystemContractRequest["contract"]["resource_binding"],
  assumptions: SubsystemContractRequest["contract"]["assumptions"], behavior: SubsystemContractRequest["contract"]["behavior"], maxSupportWork: number) {
  const undecided = (reason: string) => ({ status: "undecided" as const, reason });
  const rejected = (reason: string) => ({ status: "rejected" as const, reason });
  if (!coupling) return undecided("missing-resource-binding");
  if (inner.boxes.some(b => !b.feasibility?.length)) return undecided("missing-resource-mode");
  if (inner.boxes.some(b => b.feasibility!.length !== 1)) return undecided("multiple-resource-modes");
  if (inner.boxes.some(b => !b.behavior)) return undecided("missing-behavior");
  const carriers = new Map(inner.carriers.map(c => [c.id, c]));
  // The single feasibility row must cover every value in every behavior row, not just one
  // matching row. A threshold is a minimum amount; this is deliberately sufficient only.
  for (const b of inner.boxes) {
    const mode = b.feasibility![0];
    for (const [side, ports] of [["in", b.inputs ?? []], ["out", b.outputs ?? []]] as const) for (const p of ports) {
      const levels = carriers.get(p.carrier)?.levels;
      if (!levels) return undecided("missing-carrier-levels");
      const amount = asNumber(side === "in" ? mode.requires : mode.provides, p.id);
      for (const row of b.behavior!) {
        const threshold = levels.find(l => l.value === row[side][p.id])?.from;
        if (threshold === undefined) return undecided("missing-value-level");
        if (side === "in" ? amount > threshold : amount < threshold) return undecided("mode-behavior-incompatible");
      }
    }
  }
  // An asserted minimum amount and a qualitative value must be jointly possible in the
  // carrier's half-open level band. Otherwise the envelope itself is contradictory.
  for (const side of ["inputs", "outputs"] as const) for (const b of binding[side]) {
    const box = inner.boxes.find(x => x.id === b.inner.box)!;
    const port = box[side]!.find(x => x.id === b.inner.port)!;
    const levels = carriers.get(port.carrier)?.levels;
    if (!levels) return undecided("missing-carrier-levels");
    const values = side === "inputs" ? assumptions.map(x => x[b.outer]) : behavior.map(x => x.out[b.outer]);
    for (const value of values) {
      const index = levels.findIndex(x => x.value === value);
      if (index < 0) return undecided("missing-value-level");
      const upper = levels[index + 1]?.from;
      if (upper !== undefined && asNumber(resources[side], b.outer) >= upper) return rejected("inconsistent-level-assumptions");
    }
  }
  const outputDemand = new Map<string, number>();
  // Include the lower thresholds required by qualitative input/output values separately from
  // the numeric mode demands. These maxima range over all declared rows, so a conflict found
  // only by this conservative bound is undecided rather than a proof of infeasibility.
  const qualitativeDemand = new Map<string, number>();
  const key = (e: { box: string; port: string }) => JSON.stringify([e.box, e.port]);
  const addDemand = (target: Map<string, number>, e: { box: string; port: string }, amount: number) => {
    const b = inner.boxes.find(x => x.id === e.box)!, p = b.outputs!.find(x => x.id === e.port)!;
    const prev = target.get(key(e)) ?? 0;
    target.set(key(e), carriers.get(p.carrier)?.quantity === "extensive" ? prev + amount : Math.max(prev, amount));
  };
  for (const b of inner.boxes) for (const p of b.inputs ?? []) {
    const amount = asNumber(b.feasibility![0].requires, p.id);
    const wires = inner.wires.filter(w => w.to.box === b.id && w.to.port === p.id && w.polarity !== "harmful");
    if (carriers.get(p.carrier)?.quantity === "extensive" && wires.length > 1) return undecided("extensive-fan-in");
    if (wires.length) {
      const levels = carriers.get(p.carrier)!.levels!;
      const qualitative = b.behavior!.reduce((max, row) => Math.max(max, levels.find(l => l.value === row.in[p.id])!.from), amount);
      for (const w of wires) { addDemand(outputDemand, w.from, amount); addDemand(qualitativeDemand, w.from, qualitative); }
    }
    else {
      const bound = binding.inputs.find(v => v.inner.box === b.id && v.inner.port === p.id);
      if (bound) { if (asNumber(resources.inputs, bound.outer) < amount) return rejected("insufficient-input-assumption"); }
      else if (amount > 0) return rejected("unsupplied-internal-requirement");
    }
  }
  for (const x of binding.outputs) {
    const amount = asNumber(resources.outputs, x.outer);
    addDemand(outputDemand, x.inner, amount);
    const source = inner.boxes.find(b => b.id === x.inner.box)!;
    const port = source.outputs!.find(p => p.id === x.inner.port)!;
    const levels = carriers.get(port.carrier)!.levels!;
    // The boundary itself carries the declared qualitative value. If the same extensive
    // output also feeds internal consumers, its amount adds to their individual demands.
    const qualitative = behavior.reduce((max, row) => Math.max(max, levels.find(l => l.value === row.out[x.outer])!.from), amount);
    addDemand(qualitativeDemand, x.inner, qualitative);
  }
  for (const b of inner.boxes) for (const p of b.outputs ?? []) {
    const demand = outputDemand.get(key({ box: b.id, port: p.id })) ?? 0;
    const qualitative = qualitativeDemand.get(key({ box: b.id, port: p.id })) ?? 0;
    if (!Number.isFinite(demand) || !Number.isFinite(qualitative)) return undecided("numeric-overflow");
    if (asNumber(b.feasibility![0].provides, p.id) < demand) return rejected("insufficient-output-level");
    if (asNumber(b.feasibility![0].provides, p.id) < qualitative) return undecided("demand-behavior-incompatible");
    // The total required amount must fit the qualitative output value in every declared row.
    // A mode's capacity can exceed that value's upper band; capacity alone does not make the
    // demand compatible with the behavior. Some rows may be unreachable in the composite, so
    // this conservative all-rows check returns undecided rather than claiming impossibility.
    const levels = carriers.get(p.carrier)?.levels;
    if (!levels) return undecided("missing-carrier-levels");
    for (const row of b.behavior!) {
      const index = levels.findIndex(level => level.value === row.out[p.id]);
      if (index < 0) return undecided("missing-value-level");
      const upper = levels[index + 1]?.from;
      // A sole boundary output already has this row's qualitative value; taking the maximum
      // over all boundary rows would mix different operating situations. Cross-branch sums
      // remain conservative, including when a boundary and internal consumer share a port.
      const internal = inner.wires.some(w => w.from.box === b.id && w.from.port === p.id && w.polarity !== "harmful");
      const boundary = binding.outputs.some(x => x.inner.box === b.id && x.inner.port === p.id);
      const checkedDemand = internal ? qualitative : boundary ? demand : qualitative;
      if (upper !== undefined && checkedDemand >= upper) return undecided("demand-behavior-incompatible");
    }
  }
  const costs = new Map<string, number>();
  for (const b of inner.boxes) for (const entries of [b.cost ?? {}, b.feasibility![0].cost ?? {}]) for (const [d, value] of Object.entries(entries)) costs.set(d, (costs.get(d) ?? 0) + value);
  if ([...costs.values()].some(v => !Number.isFinite(v))) return undecided("numeric-overflow");
  // An explicitly declared inner budget is a local constraint in addition to the contract's
  // budget. Missing dimensions within that local budget cannot establish affordability.
  if (inner.budget !== undefined) {
    if ([...costs].some(([d, amount]) => own(inner.budget!, d) !== undefined && amount > own(inner.budget!, d)!)) return rejected("over-inner-budget");
    if ([...costs].some(([d, amount]) => amount > 0 && own(inner.budget!, d) === undefined)) return undecided("unbudgeted-inner-resource");
  }
  if ([...costs].some(([d, amount]) => own(resources.budget, d) === undefined && amount > 0)) return undecided("unbudgeted-resource");
  if ([...costs].some(([d, amount]) => amount > (own(resources.budget, d) ?? 0))) return rejected("over-budget");
  let supportWork = 0;
  const charge = () => { if (++supportWork > maxSupportWork) throw new ResourceSupportCap(); };
  try {
    const ports = inner.boxes.flatMap(b => [...(b.outputs ?? []), ...(b.inputs ?? [])].map(p => {
      charge();
      return { box: b.id, port: p.id };
    }));
    const index = new Map(ports.map((p, i) => [key(p), i]));
    const feeding = new Map<string, Model["wires"]>();
    for (const w of inner.wires) {
      charge();
      if (w.polarity === "harmful") continue;
      const k = key(w.to);
      feeding.set(k, [...(feeding.get(k) ?? []), w]);
    }
    const rows: SupportRow[] = inner.boxes.map(b => {
      charge();
      const mode = b.feasibility![0];
      return {
        box: b.id, row: 0,
        provide: (b.outputs ?? []).map(p => { charge(); return [index.get(key({ box: b.id, port: p.id }))!, asNumber(mode.provides, p.id)]; }),
        demand: (b.inputs ?? []).flatMap(p => {
          charge();
          const level = asNumber(mode.requires, p.id), end = { box: b.id, port: p.id };
          if (!level) return [];
          const wires = feeding.get(key(end)) ?? [];
          return wires.length
            ? wires.map(w => { charge(); return [index.get(key(w.from))!, level] as [number, number]; })
            : [[index.get(key(end))!, level] as [number, number]];
        }),
      };
    });
    const initial: Array<[number, number]> = binding.inputs.map(b => {
      charge();
      return [index.get(key(b.inner))!, asNumber(resources.inputs, b.outer)];
    });
    const sourceSupport = { ...resourceSourceSupport(ports, rows, charge, initial), work: supportWork };
    const result = { costs: Object.fromEntries(costs), coupling: "declared-unverified" as const, sourceSupport };
    return sourceSupport.grounded
      ? { status: "checked" as const, ...result }
      : { ...undecided("circular-resource-support"), ...result };
  } catch (e) {
    if (e instanceof ResourceSupportCap) return { ...undecided("source-support-cap"), supportWork };
    throw e;
  }
}
