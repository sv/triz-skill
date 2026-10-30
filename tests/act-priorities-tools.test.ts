import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { z } from "zod";
import { toolSpecs } from "../src/tools.js";
import { type FunctionModel, analyseModel, compareIdeality, trimCandidates } from "../src/act.js";
import { externalBehavior } from "../src/act-behavior.js";
import { semanticIsomorphism } from "../src/act-semantic-iso.js";
import { synthesizeFinite } from "../src/act-synthesis.js";

const specs = new Map(toolSpecs().map(s => [s.name, s]));
async function call(name: string, args: unknown) {
  const spec = specs.get(name)!;
  const parsed = z.strictObject(spec.shape).parse(args);
  return JSON.parse((await spec.handler(parsed)).content[0].text);
}
const row = { in: {}, out: { bore: "supported" } };
function pricedModel() {
  const baseline = JSON.parse(fs.readFileSync(new URL("../examples/function-models/bearing-heat-behavior.json", import.meta.url), "utf8")) as FunctionModel;
  const concept = structuredClone(baseline);
  concept.boxes = concept.boxes.filter(b => b.id !== "bearing");
  concept.wires = concept.wires.filter(w => w.from.box !== "bearing" && w.to.box !== "bearing").concat({ id: "support", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful" });
  const housing = concept.boxes.find(b => b.id === "housing")!;
  delete housing.behavior;
  housing.producible = [{ in: {}, out: { bore: "unsupported" } }];
  return { model: concept, compare_to: baseline };
}
function hierarchy(inverted = false): FunctionModel {
  const c = { id: "c", layer: "information" as const, dimension: "bit", values: ["0", "1"] };
  return { domain: "software", carriers: [c], boxes: [
    { id: "h", name: "H", role: "tool", inputs: [{ id: "x", carrier: "c" }], outputs: [{ id: "y", carrier: "c" }], inner: {
      model: { domain: "software", carriers: [c], boxes: [{ id: "a", name: "A", role: "tool", inputs: [{ id: "i", carrier: "c" }], outputs: [{ id: "o", carrier: "c" }], behavior: ["0", "1"].map(v => ({ in: { i: v }, out: { o: inverted ? (v === "0" ? "1" : "0") : v } })) }], wires: [] },
      inputs: [{ outer: "x", inner: { box: "a", port: "i" } }], outputs: [{ outer: "y", inner: { box: "a", port: "o" } }],
    } }, { id: "p", name: "P", role: "product", inputs: [{ id: "i", carrier: "c" }], behavior: ["0", "1"].map(v => ({ in: { i: v }, out: {} })) },
  ], wires: [
    { id: "observe", from: { box: "h", port: "y" }, to: { box: "p", port: "i" }, carrier: "c", polarity: "useful" },
    { id: "feedback", from: { box: "h", port: "y" }, to: { box: "h", port: "x" }, carrier: "c", polarity: "useful" },
  ] };
}

test("builder request crosses the shared transport schema and feeds model analysis", async () => {
  const request = { domain: "software", components: [{ id: "s", name: "Source", role: "tool" }, { id: "p", name: "Product", role: "product" }], interactions: [{ subject: "s", action: "signal", object: "p", carrier: { id: "c", layer: "information", dimension: "bit" }, polarity: "useful" }] };
  const built = await call("triz_build_model", request);
  assert.equal(built.ok, true);
  assert.equal((await call("triz_function_model", { model: built.model })).ok, true);
  const unreviewed = structuredClone(request) as any;
  delete unreviewed.interactions[0].polarity;
  assert.equal(z.strictObject(specs.get("triz_build_model")!.shape).safeParse(unreviewed).success, false);
});

test("priced residual transport preserves Boolean verdict and caps optimum claims", async () => {
  const request = { ...pricedModel(), weakest_spec: true, row_costs: [{ row, cost: 7 }] };
  const result = await call("triz_behavior", request);
  assert.equal(result.verdict, "impossible");
  assert.equal(result.reason, "infeasible");
  assert.equal(result.cheapestExtension.status, "optimal");
  assert.equal(result.cheapestExtension.cost, 7);
  const capped = await call("triz_behavior", { ...request, max_cost_search: 1 });
  assert.equal(capped.cheapestExtension.status, "undecided");
  assert.equal("cost" in capped.cheapestExtension, false);
  const invalid = await call("triz_behavior", { ...request, weakest_spec: false });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.issues[0].code, "row-costs-without-weakest-spec");
});

test("hierarchy expansion preserves feedback constraints and exposed product fan-out", async () => {
  for (const inverted of [false, true]) {
    const model = hierarchy(inverted);
    const expanded = await call("triz_expand_hierarchy", { model, box: "h" });
    assert.equal(expanded.ok, true);
    const result = externalBehavior(expanded.model, { scope: "whole", fullRelation: true });
    assert.ok(result.ok && result.decided);
    if (result.ok && result.decided) {
      assert.equal(result.relation.flatMap(r => r.outputs).length, inverted ? 0 : 2);
    }
  }
});

test("hidden hierarchy cannot drive cost, synthesis, or annotation-equivalence verdicts", () => {
  const model = hierarchy();
  model.boxes[0].inner.model.boxes[0].cost = { usd: 10 };
  model.budget = { usd: 0 };
  const analyzed = analyseModel(model);
  assert.ok(analyzed.ok);
  if (analyzed.ok) {
    assert.deepEqual(analyzed.ideality.incompleteHierarchy, ["h"]);
    assert.equal(analyzed.ideality.ratio.computable, false);
    assert.equal(analyzed.ideality.budget, undefined);
  }
  assert.equal(compareIdeality(model, model).verdict, "indeterminate");
  assert.equal(trimCandidates(model, ["h"]).ok, false);
  const iso = semanticIsomorphism({ source: model, target: model });
  assert.equal(iso.ok, false);
  const examples = JSON.parse(fs.readFileSync(new URL("../examples/assurance/requests.json", import.meta.url), "utf8"));
  const request = examples.find((x: any) => x.tool === "triz_synthesize").args;
  const synthesis = synthesizeFinite({ ...request, model });
  assert.equal(synthesis.ok, false);
  if (!synthesis.ok) assert.equal(synthesis.issues[0].code, "hierarchy-substitution");
});
