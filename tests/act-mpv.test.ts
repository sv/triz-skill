/**
 * MPV weights on the baseline comparison: the comparison over the named main parameters of value
 * only, componentwise and by the explicit weighted sum; the axes it ignores are listed; a lost
 * deliverable still decides; nothing changes without mpv_weights; the weights never make the
 * scalar ratio computable; and unknown dimensions fail closed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareIdeality, type FunctionModel } from "../src/act.js";
import { applyTrim } from "../src/act-rewrite.js";
import { toolSpecs } from "../src/tools.js";
import { example, box } from "./support/bearing.js";

const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (args: unknown) => JSON.parse((await specs.triz_function_model.handler(args)).content[0].text);

/** The bearing trimmed, its support absorbed by the housing: cheaper, fewer harms, no service. */
function trimmed(): FunctionModel {
  const r = applyTrim(example("bearing-heat"), { trim: ["bearing"] });
  assert.ok(r.ok);
  return r.model;
}

test("mpv_weights compares over the named parameters only, and lists the differing axes it ignores", async () => {
  const r = await call({ model: trimmed(), compare_to: example("bearing-heat"), mpv_weights: { usd_unit: 1 } });
  assert.equal(r.comparison.verdict, "concept-dominates");
  const mpv = r.comparison.mpv;
  assert.deepEqual([mpv.axes, mpv.better, mpv.worse, mpv.pareto, mpv.verdict], [["cost:usd_unit"], ["cost:usd_unit"], [], "concept-dominates", "concept-better"]);
  assert.deepEqual(mpv.weighted, { baseline: 178, concept: 160, formula: mpv.weighted.formula });
  assert.deepEqual(mpv.ignored, ["cost:service_h_year", "harmful"]);
  assert.match(mpv.note, /the models also differ on cost:service_h_year, harmful; the MPV view ignores those axes by choice/);
  // The explicit-weights rule stands: MPV weights never make the scalar ratio computable.
  assert.equal(r.ideality.ratio.computable, false);
  // Without mpv_weights the comparison is exactly as before.
  const plain = await call({ model: trimmed(), compare_to: example("bearing-heat") });
  assert.equal("mpv" in plain.comparison, false);
  const { mpv: _mpv, ...rest } = r.comparison;
  assert.deepEqual(rest, plain.comparison);
});

test("a trade-off on the MPV axes is ranked by the explicit weights, citing why weights are needed", () => {
  const baseline = example("bearing-heat"), concept = example("bearing-heat");
  box(concept, "bearing").cost = { usd_unit: 10, service_h_year: 5 };
  const c = compareIdeality(baseline, concept, { mpvWeights: { usd_unit: 1, service_h_year: 10 } });
  assert.equal(c.verdict, "trade-off");
  assert.ok(c.mpv?.ok);
  assert.equal(c.mpv.pareto, "trade-off");
  assert.deepEqual(c.mpv.basis, ["pareto_incomparable"]);
  assert.deepEqual([c.mpv.weighted.baseline, c.mpv.weighted.concept, c.mpv.verdict], [178 + 20, 170 + 50, "baseline-better"]);
  const cheapService = compareIdeality(baseline, concept, { mpvWeights: { usd_unit: 10, service_h_year: 1 } });
  assert.ok(cheapService.mpv?.ok);
  assert.equal(cheapService.mpv.verdict, "concept-better", "other weights, other ranking: the weights are the user's choice");
  // 'harmful' is an MPV axis too.
  const harm = compareIdeality(baseline, trimmed(), { mpvWeights: { harmful: 1 } });
  assert.ok(harm.mpv?.ok);
  assert.deepEqual([harm.mpv.axes, harm.mpv.weighted.baseline, harm.mpv.weighted.concept], [["harmful"], 2, 0]);
});

test("a lost deliverable decides the MPV view too, and bad weights fail closed", async () => {
  const lossy = example("bearing-heat");
  lossy.wires = lossy.wires.filter((w) => w.id !== "w-support");
  box(lossy, "bearing").cost = { usd_unit: 1 };
  const c = compareIdeality(example("bearing-heat"), lossy, { mpvWeights: { usd_unit: 1 } });
  assert.equal(c.verdict, "concept-loses-functions");
  assert.ok(c.mpv?.ok);
  assert.equal(c.mpv.verdict, "concept-loses-functions");
  assert.equal(c.mpv.pareto, "concept-dominates");
  assert.match(c.mpv.note, /does not override the comparison: the concept loses deliverables/);
  const errs = async (args: unknown) => { const r = await call(args); assert.equal(r.ok, false); return r.errors.join("; "); };
  assert.match(await errs({ model: trimmed(), mpv_weights: { usd_unit: 1 } }), /mpv_weights needs compare_to/);
  assert.match(await errs({ model: trimmed(), compare_to: example("bearing-heat"), mpv_weights: { latency_ms: 1 } }), /mpv_weights: 'latency_ms' is not a cost dimension of either model, nor 'harmful'/);
  assert.match(await errs({ model: trimmed(), compare_to: example("bearing-heat"), mpv_weights: {} }), /mpv_weights names no dimension/);
  assert.equal(specs.triz_function_model.shape.mpv_weights.safeParse({ usd_unit: 0 }).success, false);
  // With a box_map the comparison is redone after renaming, with the same MPV view.
  const seg = await JSON.parse((await specs.triz_transform.handler({ model: example("bearing-heat"), transformation: { op: "segment", box: "shaft", parts: [{ id: "core", ports: ["drive", "support"] }, { id: "skin", ports: ["heat-in", "expansion"] }] } })).content[0].text);
  const mapped = await call({ model: seg.model, compare_to: example("bearing-heat"), box_map: seg.boxMap, mpv_weights: { usd_unit: 1 } });
  assert.equal(mapped.comparison.mpv.verdict, "equal");
});
