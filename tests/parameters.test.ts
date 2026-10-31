import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CanonicalParameters, canonicalParametersJsonSchema } from "../src/parameters.js";
import "../src/data.js";
import { toolSpecs } from "../src/tools.js";

const read = (name: string) => JSON.parse(fs.readFileSync(new URL(`../skills/triz-innovation/data/${name}`, import.meta.url), "utf8"));

test("the audited vocabulary covers every matrix axis without adding or merging categories", () => {
  const { parameters } = CanonicalParameters.parse(read("parameters.json"));
  const ids = new Set(parameters.map(p => p.id));
  assert.deepEqual([...ids].sort((a, b) => a - b), Array.from({ length: 39 }, (_, i) => i + 1));
  for (const [key, cell] of Object.entries(read("matrix.json").cells) as Array<[string, { improving_id: number; worsening_id: number }]>) {
    assert.ok(ids.has(cell.improving_id) && ids.has(cell.worsening_id), `matrix cell ${key} references declared parameters`);
    assert.equal(key, `${cell.improving_id}-${cell.worsening_id}`);
  }
  for (const pair of [[1, 2], [3, 4], [5, 6], [7, 8], [15, 16], [19, 20]]) {
    assert.ok(parameters.find(p => p.id === pair[0])!.distinguish_from?.includes(pair[1]), `retain moving/stationary distinction ${pair}`);
  }
});

test("canonical validation rejects incomplete, extended, duplicate or internally inconsistent lists", () => {
  const original = read("parameters.json");
  const missing = structuredClone(original);
  missing.parameters.pop();
  assert.equal(CanonicalParameters.safeParse(missing).success, false);
  const extended = structuredClone(original);
  extended.parameters.push({ id: 40, name: "Domain-specific addition" });
  assert.equal(CanonicalParameters.safeParse(extended).success, false);
  const duplicate = structuredClone(original);
  duplicate.parameters[1].id = duplicate.parameters[0].id;
  assert.equal(CanonicalParameters.safeParse(duplicate).success, false);
  const duplicateName = structuredClone(original);
  duplicateName.parameters[1].name = duplicateName.parameters[0].name.toUpperCase();
  assert.equal(CanonicalParameters.safeParse(duplicateName).success, false);
  for (const refs of [[10], [11, 11], [40]]) {
    const invalid = structuredClone(original);
    invalid.parameters[9].distinguish_from = refs;
    assert.equal(CanonicalParameters.safeParse(invalid).success, false);
  }
});

test("parameter lookups expose alternate labels and guidance while matrix recommendations remain canonical", async () => {
  const specs = toolSpecs();
  const parameter = specs.find(t => t.name === "triz_parameter")!;
  const readResult = async (id: number) => JSON.parse((await parameter.handler({ id })).content[0].text);
  const force = await readResult(10);
  assert.equal(force.name, "Force");
  assert.ok(force.aliases.includes("Force / Intensity"));
  assert.ok(force.clarification);
  assert.ok(force.distinguish_from.includes(11));
  const all = JSON.parse((await parameter.handler({})).content[0].text);
  assert.equal(all.length, 39);
  const resolved = JSON.parse((await specs.find(t => t.name === "triz_resolve")!.handler({ improving: 10, worsening: 14 })).content[0].text);
  assert.equal(resolved.improving_parameter.name, "Force");
  assert.deepEqual(resolved.principles, read("matrix.json").cells["10-14"].principles);
});

test("the committed canonical parameter schema agrees with runtime validation", () => {
  const committed = JSON.parse(fs.readFileSync(new URL("../skills/triz-innovation/schemas/parameters.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(committed, canonicalParametersJsonSchema());
});
