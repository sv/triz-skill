#!/usr/bin/env node
/** Patent terminology is evidence for decomposition, never a search key or a behavior oracle. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { knowledge } from "../../src/data.ts";
import { reductionBaseline } from "./reduction-baseline.mjs";
import { knowledgeModelCatalogue } from "../../src/knowledge-models.ts";
import { searchComponents } from "../../src/act-component-search.ts";
import { checkModel } from "../../src/act.ts";

export const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/decomposed-patent-cases.json", import.meta.url), "utf8"));
const k = knowledge();
export const carrier = id => {
  const p = k.parameters.find(p => p.id === id);
  assert.ok(p?.layer, id);
  return { id, layer: p.layer, dimension: p.name, effect_quantity: p.quantity, ...(p.si === undefined ? {} : { si: p.si }) };
};
export function boundary(resources, targets) {
  return { domain: "physical", carriers: [...new Set([...resources, ...targets])].map(carrier), boxes: [
    { id: "resource", name: "Declared resources", role: "environment", outputs: resources.map((id, i) => ({ id: `r${i}`, carrier: id })) },
    { id: "target", name: "Required responses", role: "product", inputs: targets.map((id, i) => ({ id: `t${i}`, carrier: id })) },
  ], wires: [] };
}
export function discovery(c, after = true, k = knowledge()) {
  const mappings = c.mappings_for_targets ? k.boundary_mappings.filter(m => c.targets.includes(m.output_parameter)).map(m => m.id) : [];
  const extra = knowledgeModelCatalogue({ source: "knowledge", ...(mappings.length ? { mappings } : {}), ...(c.state_parameters ? { state_parameters: c.state_parameters } : {}) }, k);
  assert.ok(extra.ok, JSON.stringify(extra));
  const entries = k.effects.filter(e => e.input_parameter && e.output_parameter && e.kind !== "composite" && e.definition.form !== "configuration").map(e => ({ id: `effect-${e.id}`, original: e.id,
    component: { id: `effect-${e.id}`, name: e.name, role: "tool", inputs: [{ id: "in", carrier: e.input_parameter }], outputs: [{ id: "out", carrier: e.output_parameter }] }, source: e.provenance, conditions: e.conditions, limitations: e.limitations }));
  if (after) entries.push(...extra.catalogue.entries.map(e => ({ ...e, original: e.id })));
  const originals = new Map();
  // Assign anonymous ids/names. The explicit allowlist below omits tags/domains from both libraries;
  // types, sources and assumptions stay intact. Expected components are asserted only after search.
  const blinded = entries.map((e, i) => {
    const id = `component-${i}`;
    originals.set(id, e.original);
    return { id, component: { ...e.component, id, name: id }, source: e.source, conditions: e.conditions, limitations: e.limitations };
  });
  assert.ok(blinded.every(e => !("tags" in e) && !("domains" in e)), "organization metadata must not enter the blinded catalogue");
  const catalogue = { format: "triz-component-catalogue-v1", id: "blinded-library", carriers: k.parameters.map(p => carrier(p.id)), entries: blinded };
  const result = searchComponents({ model: boundary(c.resources, c.targets),
    resources: c.resources.map((_, i) => ({ box: "resource", port: `r${i}` })),
    targets: c.targets.map((_, i) => ({ box: "target", port: `t${i}` })),
    catalogues: [{ catalogue }], require_all_resources: true, max_components: c.max_components ?? 5, max_work: 1_000_000, limit: 100 });
  assert.ok(result.ok && result.complete, JSON.stringify(result));
  const topologies = result.candidates.map(candidate => {
    const names = new Map(candidate.components.map(c => [c.box, String(originals.get(c.catalogueOrigin.entry))]));
    const label = end => `${names.get(end.box) ?? end.box}.${end.port}`;
    return JSON.stringify({ nodes: [...names.values()].sort(), wires: candidate.model.wires.map(w => [label(w.from), label(w.to)]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
  }).sort();
  assert.equal(result.satisfyingCount, result.candidates.length, "candidate truncation cannot establish before/after equality");
  return { result, topologies, components: result.candidates.map(candidate => candidate.components.map(b => originals.get(b.catalogueOrigin.entry))) };
}
export function validateReduction() {
  const { knowledge: before, commit } = reductionBaseline(k, "previous");
  assert.equal(before.counts.independent_contracts, 69);
  assert.equal(k.counts.independent_contracts, 66);
  const converted = new Set(["20", "35", "59"]);
  return { baseline: commit, independent_before: before.counts.independent_contracts, independent_after: k.counts.independent_contracts,
    cases: fixture.cases.map(c => {
      const old = discovery(c, true, before), current = discovery(c);
      const unsupported = old.topologies.filter(t => JSON.parse(t).nodes.some(id => converted.has(id)));
      const expressed = old.topologies.filter(t => !JSON.parse(t).nodes.some(id => converted.has(id)));
      assert.deepEqual(current.topologies, expressed, `${c.id}: a fully expressed candidate wiring changed`);
      const wanted = xs => [...xs].map(String).sort();
      for (const result of [old, current]) assert.ok(result.components.some(ids => JSON.stringify(wanted(ids)) === JSON.stringify(wanted(c.expected))), `${c.id}: intended patent mechanism lost`);
      return { id: c.id, before_candidates: old.result.satisfyingCount, after_candidates: current.result.satisfyingCount,
        fully_expressed_topologies_preserved: true, removed_opaque_shortcuts: unsupported.length,
        removed_shortcut_ids: [...new Set(unsupported.flatMap(t => JSON.parse(t).nodes.filter(id => converted.has(id))))] };
    }) };
}
export function validateConfigurations() {
  const results = [];
  for (const c of fixture.cases) {
    assert.ok(c.published_on >= fixture.publication_window[0] && c.published_on <= fixture.publication_window[1]);
    assert.ok((c.priority_on ?? c.filed_on) <= c.published_on);
    const before = discovery(c, false), after = discovery(c);
    assert.equal(before.result.verdict, "impossible-in-library", c.id);
    assert.equal(after.result.verdict, "candidates", c.id);
    const sorted = xs => [...xs].map(String).sort();
    const index = after.components.findIndex(ids => JSON.stringify(sorted(ids)) === JSON.stringify(sorted(c.expected)));
    assert.ok(index >= 0, `${c.id}: missing intended configuration: ${JSON.stringify(after.components)}`);
    const candidate = after.result.candidates[index];
    assert.ok(checkModel(candidate.model).ok);
    results.push({ ...c, before: before.result.verdict, after: after.result.verdict, components: after.components[index],
      candidates: after.result.satisfyingCount, work: after.result.work, conditions: [...new Set(candidate.components.flatMap(b => b.catalogueOrigin.conditions ?? []))],
      verification: "typing-only; implementation dynamics checked separately on explicit finite abstractions" });
  }
  return { results };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { results } = validateConfigurations();
  console.log(JSON.stringify({ cases: results.length, before_found: 0, after_found: results.length, reduction: validateReduction(), results }, null, 2));
}
