/**
 * Separation suggestions (src/act-suggest.ts): every pair separated on an axis gets the
 * operations that could build the piecewise system on that axis, as hints with no basis. Each
 * names a tool, argument, and triz_transform op that exist; each principle text equals
 * data/principles.json, and its classification the table in docs/theory-map.md. Pairs that are
 * compatible or irreducible get none, and a principle missing from the data fails closed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Axis, type PhysicalContradiction } from "../src/act.js";
import { separationSuggestions, SUGGESTED_PRINCIPLES, type Suggestion } from "../src/act-suggest.js";
import { principles as lookUpPrinciples, getPrinciple } from "../src/core.js";
import { toolSpecs } from "../src/tools.js";
import "../src/data.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);
const ops = new Set((specs.triz_transform.shape.transformation as { options: Array<{ shape: { op: { value: string } } }> }).options.map((o) => o.shape.op.value));
const doc = fs.readFileSync(path.resolve(here, "../docs/theory-map.md"), "utf8");
const classified = new Map([...doc.matchAll(/^\| (\d+) \| [^|]+ \| "[^"]+" \| (structural|parametric|analogy only) \| .+ \|$/gm)].map(([, id, kind]) => [Number(id), kind]));

/** Two demands with opposite values, disjoint on `axis` and on every axis in `also`. */
function separatedOn(axis: Axis, also: Axis[] = []): PhysicalContradiction {
  const cells = (a: Axis) => (a === "direction" ? ["inward", "outward"] : [`${a}-1`, `${a}-2`]);
  const on = (k: number) => Object.fromEntries([axis, ...also].map((a) => [a, [cells(a)[k]]]));
  return { id: `pc-${axis}`, parameter: "stiffness", demands: [{ id: "stiff", values: ["high"], ...on(0) }, { id: "soft", values: ["low"], ...on(1) }] };
}

const EXPECTED: Record<Axis, Array<[Suggestion["tool"], string, number | undefined]>> = {
  space: [["triz_transform", "segment", 1], ["triz_transform", "take_out", 2]],
  time: [["triz_transform", "standby", 11], ["triz_dynamics", "separation", 15]],
  condition: [["triz_transform", "rerate", 16], ["triz_transform", "rewrite", 28]],
  level: [["triz_nine_windows", "restrict", undefined], ["triz_nine_windows", "nine_windows", undefined]],
  direction: [["triz_transform", "segment", 1]],
};

test("each separating axis maps to its constructions, with each demand's cells on that axis", async () => {
  for (const axis of Axis.options) {
    const r = await call("triz_separate", { contradiction: separatedOn(axis) });
    assert.equal(r.pairs[0].status, "separated", axis);
    const s: Suggestion[] = r.pairs[0].suggestions;
    assert.deepEqual(s.map((x) => [x.tool, x.op, x.principle?.id]), EXPECTED[axis], axis);
    for (const x of s) {
      assert.equal(x.axis, axis);
      assert.deepEqual(Object.keys(x.cells), ["stiff", "soft"]);
      assert.ok(x.how.includes("'stiffness'"), `${axis}: ${x.how}`);
      assert.equal("basis" in x, false, "a hint is not a verdict");
    }
    assert.match(r.suggestionNote, /hints, not verdicts/);
  }
});

test("a pair separated on two axes gets suggestions for both, in axis order", async () => {
  const r = await call("triz_separate", { contradiction: separatedOn("space", ["time"]) });
  const [pair] = r.pairs;
  assert.deepEqual(pair.separatingAxes, ["space", "time"]);
  assert.deepEqual(pair.suggestions.map((x: Suggestion) => [x.axis, x.op]), [["space", "segment"], ["space", "take_out"], ["time", "standby"], ["time", "separation"]]);
  assert.deepEqual(pair.suggestions[0].cells, { stiff: ["space-1"], soft: ["space-2"] });
  assert.deepEqual(pair.suggestions[2].cells, { stiff: ["time-1"], soft: ["time-2"] });
});

test("every suggestion names a tool, argument, and op that exist", async () => {
  for (const axis of Axis.options) {
    for (const x of separationSuggestions(separatedOn(axis), getPrinciple).values().next().value!) {
      assert.ok(specs[x.tool], `${x.tool} is not a tool`);
      assert.ok(Object.hasOwn(specs[x.tool].shape, x.use), `${x.tool} has no argument '${x.use}'`);
      if (x.tool === "triz_transform") assert.ok(ops.has(x.op), `triz_transform has no op '${x.op}'`);
    }
  }
});

test("principle texts are looked up, never recalled, and keep the theory map's classification", async () => {
  const data = lookUpPrinciples();
  for (const axis of Axis.options) {
    for (const x of separationSuggestions(separatedOn(axis), getPrinciple).values().next().value!) {
      if (!x.principle) continue;
      const p = data.find((q) => q.id === x.principle!.id)!;
      assert.deepEqual([x.principle.name, x.principle.text], [p.name, p.classic], `principle ${p.id}`);
      assert.equal(x.principle.classified, classified.get(p.id), `principle ${p.id}`);
    }
  }
  for (const [id, kind] of SUGGESTED_PRINCIPLES) assert.equal(kind, classified.get(id), `principle ${id}`);
  // A principle the data lacks fails closed instead of being filled in.
  assert.throws(() => separationSuggestions(separatedOn("condition"), (id) => (id === 28 ? undefined : getPrinciple(id))), /principle 28 is not in principles\.json/);
});

test("compatible and irreducible pairs get no suggestions; the bearing's time-separated pair does", async () => {
  const r = await call("triz_separate", { contradiction: {
    id: "pc", parameter: "p", axes: { space: ["edge", "core"] },
    demands: [{ id: "a", values: ["x"], space: ["edge"] }, { id: "b", values: ["y"] }, { id: "c", values: ["x", "y"] }],
  } });
  assert.deepEqual(r.pairs.map((p: { status: string }) => p.status), ["irreducible", "compatible", "compatible"]);
  assert.ok(r.pairs.every((p: object) => !("suggestions" in p)));
  assert.equal(r.suggestionNote, undefined);

  const bearing = JSON.parse(fs.readFileSync(path.resolve(here, "../examples/function-models/bearing-heat.json"), "utf8"));
  const sep = await call("triz_separate", { contradiction: bearing.contradictions[0] });
  assert.deepEqual(sep.pairs[0].suggestions.map((x: Suggestion) => [x.axis, x.tool, x.op]), [["time", "triz_transform", "standby"], ["time", "triz_dynamics", "separation"]]);
  assert.deepEqual(sep.pairs[0].basis, ["separated_iff_axis", "glue_of_disjoint_regions"], "the verdict keeps its basis");
});
