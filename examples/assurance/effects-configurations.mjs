#!/usr/bin/env node
/** Patent terminology is evidence for decomposition, never a search key or a behavior oracle. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { knowledge } from "../../src/data.ts";
import { knowledgeModelCatalogue } from "../../src/knowledge-models.ts";
import { searchComponents } from "../../src/act-component-search.ts";
import { checkModel } from "../../src/act.ts";
import { modelCertificate } from "../../src/act-cert.ts";

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
export function discovery(c, after = true) {
  const extra = knowledgeModelCatalogue({ source: "knowledge", ...(c.state_parameters ? { state_parameters: c.state_parameters } : {}) }, k);
  assert.ok(extra.ok, JSON.stringify(extra));
  const entries = k.effects.filter(e => e.input_parameter && e.output_parameter && e.kind !== "composite").map(e => ({ id: `effect-${e.id}`, original: e.id,
    component: { id: `effect-${e.id}`, name: e.name, role: "tool", inputs: [{ id: "in", carrier: e.input_parameter }], outputs: [{ id: "out", carrier: e.output_parameter }] }, source: e.provenance, conditions: e.conditions, limitations: e.limitations }));
  if (after) entries.push(...extra.catalogue.entries.map(e => ({ ...e, original: e.id })));
  const originals = new Map();
  // Blind ids, names, tags and domains before search. Expected components are only an assertion afterwards.
  const blinded = entries.map((e, i) => {
    const id = `component-${i}`;
    originals.set(id, e.original);
    return { id, component: { ...e.component, id, name: id }, source: e.source, conditions: e.conditions, limitations: e.limitations };
  });
  const catalogue = { format: "triz-component-catalogue-v1", id: "blinded-library", carriers: k.parameters.map(p => carrier(p.id)), entries: blinded };
  const result = searchComponents({ model: boundary(c.resources, c.targets),
    resources: c.resources.map((_, i) => ({ box: "resource", port: `r${i}` })),
    targets: c.targets.map((_, i) => ({ box: "target", port: `t${i}` })),
    catalogues: [{ catalogue }], require_all_resources: true, max_components: c.max_components ?? 5, max_work: 1_000_000, limit: 100 });
  assert.ok(result.ok && result.complete, JSON.stringify(result));
  return { result, components: result.candidates.map(candidate => candidate.components.map(b => originals.get(b.catalogueOrigin.entry))) };
}
export function validateConfigurations() {
  const certificates = {}, results = [];
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
    certificates[c.id.replaceAll("-", "_")] = modelCertificate(candidate.model);
    results.push({ ...c, before: before.result.verdict, after: after.result.verdict, components: after.components[index],
      candidates: after.result.satisfyingCount, work: after.result.work, conditions: [...new Set(candidate.components.flatMap(b => b.catalogueOrigin.conditions ?? []))],
      verification: "typing-only; implementation dynamics checked separately on explicit finite abstractions" });
  }
  return { results, certificates };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { results, certificates } = validateConfigurations();
  const i = process.argv.indexOf("--cert-dir");
  if (i >= 0) {
    assert.ok(process.argv[i + 1]); fs.mkdirSync(process.argv[i + 1], { recursive: true });
    for (const [name, c] of Object.entries(certificates)) { assert.ok(c.ok, JSON.stringify(c)); fs.writeFileSync(path.join(process.argv[i + 1], `${name}.lean`), c.content); }
  }
  console.log(JSON.stringify({ cases: results.length, before_found: 0, after_found: results.length, results }, null, 2));
}
