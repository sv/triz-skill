/** Source-backed boundary observations preserve values, not arbitrary same-dimensional meanings. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { setupEffectModel } from "../../src/knowledge-setup.ts";
import { BehaviorEvaluationCache, compareBehavior, externalBehavior } from "../../src/act-behavior.ts";
import { boundedDynamics } from "../../src/act-dynamics.ts";
import { summarizeSubsystem } from "../../src/act-refinement.ts";
import { discovery } from "./effects-configurations.mjs";
import { reductionBaseline } from "./reduction-baseline.mjs";

const p = s => `physical:${s}`;
const bindings = values => Object.fromEntries(Object.entries(values).map(([id, values]) => [p(id), { values }]));
const field = (box, port, values) => ({ box, port, values });
function reference(model, effect, rows, primaryValues) {
  const baseline = structuredClone(model);
  baseline.boxes = baseline.boxes.filter(b => ["resource", "required"].includes(b.id));
  const resource = baseline.boxes.find(b => b.id === "resource");
  resource.inputs = [{ id: "primary", carrier: model.boxes.find(b => b.id === "resource").outputs[0].carrier }];
  resource.behavior = resource.behavior.map(row => ({ ...row, in: { primary: row.out.out } }));
  const activeSource = model.boxes.find(b => b.id === "resource");
  activeSource.inputs = structuredClone(resource.inputs); activeSource.behavior = structuredClone(resource.behavior);
  const input = resource.outputs[0].carrier, output = baseline.boxes.find(b => b.id === "required").inputs[0].carrier;
  baseline.boxes.push({ id: "legacy", name: `Selected reference ${effect}`, role: "tool", inputs: [{ id: "in", carrier: input }], outputs: [{ id: "out", carrier: output }], behavior: rows });
  baseline.wires = [
    { id: "start", from: { box: "resource", port: "out" }, to: { box: "legacy", port: "in" }, carrier: input, polarity: "useful" },
    { id: "finish", from: { box: "legacy", port: "out" }, to: { box: "required", port: "in" }, carrier: output, polarity: "useful" },
  ];
  assert.equal(baseline.boxes.find(b => b.id === "resource").behavior.length, primaryValues.length);
  return baseline;
}
export function validateBoundaryModels(k) {
  const relations = [], symbolicCertificates = [], summaries = [];
  const options = { scope: "whole", evaluationCache: new BehaviorEvaluationCache() };
  const check = (name, baseline, model) => {
    const result = compareBehavior(baseline, model, options);
    assert.ok(result.ok && result.verdict === "preserved", JSON.stringify(result));
    const scan = compareBehavior(baseline, model, { ...options, relationOptions: { indexed: false, decompose: false, elimination: "off" } });
    assert.ok(scan.ok && scan.verdict === "preserved" && scan.inputValuations === result.inputValuations, JSON.stringify(scan));
    const request = { model, boxes: model.boxes.filter(b => !["resource", "required"].includes(b.id)).map(b => b.id) };
    const compact = summarizeSubsystem(request), finite = summarizeSubsystem(request, { symbolic: false });
    assert.ok(compact.ok && compact.verdict === "summarized" && finite.ok && finite.verdict === "summarized", JSON.stringify({ compact, finite }));
    const rows = r => r.relation.map(row => JSON.stringify([row.in, row.out])).sort();
    assert.deepEqual(rows(compact), rows(finite)); assert.deepEqual(compact.inputMap, finite.inputMap); assert.deepEqual(compact.outputMap, finite.outputMap);
    if (compact.symbolicCertificate) symbolicCertificates.push(compact.symbolicCertificate);
    summaries.push({ name, method: compact.method, components_before: request.boxes.length, components_after: 1 });


    relations.push({ name, verdict: result.verdict });
  };
  // Exact selected Malus points with incident irradiance fixed at 2 W/m².
  const analyzer = setupEffectModel({ chain: [20], domain: "physical", bindings: bindings({
    "polarizer-angle": ["0deg", "45deg", "90deg"], "incident-irradiance": ["0", "1", "2"], irradiance: ["0", "1/2", "1", "2"],
  }), boundary: { source_values: ["0deg", "45deg", "90deg"], accepted_values: ["0", "1/2", "1", "2"] }, context_values: { "0/illumination": ["2"] },
    node_declarations: { "0/analyze": { behavior: ["0", "1", "2"].flatMap(illumination => ["0deg", "45deg", "90deg"].map((angle, i) => ({
      in: { angle, illumination }, out: { transmitted: i === 0 ? illumination : i === 2 || illumination === "0" ? "0" : illumination === "1" ? "1/2" : "1" },
    }))) } } }, k);
  assert.ok(analyzer.ok, JSON.stringify(analyzer));
  const ar = ["2", "1", "0"].map((v, i) => ({ in: { in: ["0deg", "45deg", "90deg"][i] }, out: { out: v } }));
  const aref = reference(analyzer.model, 20, ar, ar);
  check("LinearAnalyzer", aref, analyzer.model);
  const dark = structuredClone(analyzer.model);
  for (const row of dark.boxes.find(b => b.id === "resource").behavior) row.out["context-0-illumination"] = "0";
  const darkRelation = externalBehavior(dark, options);
  assert.ok(darkRelation.ok && darkRelation.decided && darkRelation.relation.every(row => row.outputs.every(out => out[0] === "0")));
  // Selected charge q=2 pC, field ±100 kV/m: the example force component is ±0.2 uN.
  const force = setupEffectModel({ chain: [59], domain: "physical", bindings: bindings({
    "electric-field": ["-100kV/m", "0", "100kV/m"], "particle-charge": ["2pC"], "particle-electric-force": ["-0.2uN", "0", "0.2uN"], force: ["-0.2uN", "0", "0.2uN"],
  }), boundary: { source_values: ["-100kV/m", "0", "100kV/m"], accepted_values: ["-0.2uN", "0", "0.2uN"] }, context_values: { "0/charge": ["2pC"] },
    node_declarations: { "0/force": { behavior: ["-100kV/m", "0", "100kV/m"].map((field, i) => ({ in: { field, charge: "2pC" }, out: { force: ["-0.2uN", "0", "0.2uN"][i] } })) } } }, k);
  assert.ok(force.ok, JSON.stringify(force));
  const fr = ["-100kV/m", "0", "100kV/m"].map((field, i) => ({ in: { in: field }, out: { out: ["-0.2uN", "0", "0.2uN"][i] } }));
  const fref = reference(force.model, 59, fr, fr);
  check("ParticleForceObservation", fref, force.model);
  const altered = structuredClone(force.model);
  altered.boxes.find(b => b.id === force.setup.boundary_mappings[0].box).behavior[0].out.out = "0.2uN";
  const wrong = compareBehavior(fref, altered, options);
  assert.ok(wrong.ok && wrong.verdict !== "preserved", "sign-changing force relabeling must fail the reference relation");
  // Stateful phase is retained. The DC-clause relation is supported only in the selected superconducting envelope.
  const currents = ["0A", "1A"];
  const sc = setupEffectModel({ chain: [35], domain: "physical", bindings: bindings({ current: currents, "transmitted-dc-current": currents,
    temperature: ["cold", "hot"], "magnetic-flux-density": ["subcritical"], "superconducting-phase": ["normal", "sc"] }),
    boundary: { source_values: currents, accepted_values: currents }, context_values: { "0/temperature": ["cold"], "0/field": ["subcritical"] },
    node_declarations: {
      "0/phase": { state: ["normal", "sc"], initial: ["sc"], transition: ["normal", "sc"].flatMap(state => ["cold", "hot"].flatMap(temperature => currents.map(drive => ({ state,
        in: { temperature, field: "subcritical", drive }, next: temperature === "cold" ? "sc" : "normal", out: { phase: temperature === "cold" ? "sc" : "normal" } })))) },
      "0/transport": { behavior: currents.map(drive => ({ in: { phase: "sc", drive }, out: { transmitted: drive } })) },
    } }, k);
  assert.ok(sc.ok, JSON.stringify(sc));
  const temporalSummary = summarizeSubsystem({ model: sc.model, boxes: sc.model.boxes.filter(b => !["resource", "required"].includes(b.id)).map(b => b.id) });
  assert.ok(temporalSummary.ok && temporalSummary.verdict === "undecided" && temporalSummary.reason === "missing-behavior", "stateful phase must not become a static symbolic map");
  const snapshot = structuredClone(sc.model), phase = snapshot.boxes.find(b => b.id === sc.setup.model_sources.find(s => s.model === p("superconducting-phase")).node);
  // Explicit restriction to stable SC-state rows. This is not an implicit erasure of dynamics.
  phase.behavior = phase.transition.filter(row => row.state === "sc" && row.next === "sc").map(({ in: input, out }) => ({ in: input, out }));
  delete phase.state; delete phase.initial; delete phase.transition;
  const sr = currents.map(v => ({ in: { in: v }, out: { out: v } }));
  const sref = reference(snapshot, 35, sr, sr);
  check("DCObservationFixedPhase", sref, snapshot);
  const protocol = { horizon: 2, unsafe: [field("resource", "out", ["1A"]), field("required", "in", ["1A"])] };
  const run = boundedDynamics(sc.model, protocol);
  assert.ok(run.ok && run.escalation?.verdict === "reachable", JSON.stringify(run));

  const outside = structuredClone(snapshot);
  for (const row of outside.boxes.find(b => b.id === "resource").behavior) row.out["context-0-temperature"] = "hot";
  const unsupported = externalBehavior(outside, options);
  assert.ok(unsupported.ok && unsupported.decided && unsupported.relation.every(row => row.outputs.length === 0));
  // This denotes an unsupported SC clause outside its envelope; it does not say normal wires carry no current.
  const cases = JSON.parse(fs.readFileSync(new URL("./fixtures/boundary-patent-cases.json", import.meta.url), "utf8")).cases;
  const before = reductionBaseline(k, "previous").knowledge;
  const patentCases = cases.map(c => {
    const old = discovery(c, true, before), current = discovery(c);
    assert.equal(old.result.verdict, "impossible-in-library", c.id);
    const sorted = xs => [...xs].map(String).sort();
    assert.ok(current.components.some(ids => JSON.stringify(sorted(ids)) === JSON.stringify(sorted(c.expected))), c.id);
    assert.ok(c.priority_on <= c.published_on && c.published_on <= "2026-10-31");
    return { ...c, before: old.result.verdict, after: current.result.verdict, candidates: current.result.satisfyingCount };
  });
  assert.ok(options.evaluationCache.stats.hits > 0, "shared summaries should reuse unchanged finite boundaries while rejecting changed models");
  return { report: { finite_relations: relations, zero_illumination_checked: true, force_sign_corruption_rejected: true,
    phase_state_retained: true, out_of_envelope_unsupported: true, patent_cases: patentCases }, symbolicCertificates, summaries };
}
