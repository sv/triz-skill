import { test } from "node:test";
import assert from "node:assert/strict";
import { FunctionModel, analyseModel, checkModel } from "../src/act.js";
import { toolSpecs } from "../src/tools.js";
import { substitute, zoomIn } from "../src/act-hierarchy.js";
import { externalBehavior } from "../src/act-behavior.js";
import { nineWindows } from "../src/act-windows.js";

const carrier = { id: "c", layer: "information" as const, dimension: "bit", values: ["0", "1"] };
const port = (id: string) => ({ id, carrier: "c" });
const rows = (mask: number) => [0, 1, 2, 3].filter(i => mask & (1 << i)).map(i => ({ in: { i: String(i >> 1) }, out: { o: String(i & 1) } }));
function model(mask = 9): FunctionModel {
  return { domain: "software", carriers: [carrier], boxes: [
    { id: "h", name: "H", role: "tool", inputs: [port("x")], outputs: [port("y")], inner: {
      model: { domain: "software", carriers: [structuredClone(carrier)], boxes: [{ id: "a", name: "A", role: "tool", inputs: [port("i")], outputs: [port("o")], behavior: rows(mask) }], wires: [] },
      inputs: [{ outer: "x", inner: { box: "a", port: "i" } }], outputs: [{ outer: "y", inner: { box: "a", port: "o" } }],
    } },
    { id: "p", name: "P", role: "product", inputs: [port("d")] },
    { id: "h/a", name: "collision", role: "environment" },
  ], wires: [{ id: "w", from: { box: "h", port: "y" }, to: { box: "p", port: "d" }, carrier: "c", polarity: "useful" }] };
}

test("hierarchy validates total unique typed boundaries and checked zoom", () => {
  const m = model(); assert.equal(checkModel(m).ok, true); assert.equal(FunctionModel.safeParse(m).success, true);
  assert.equal(zoomIn(m, "h").ok, true);
  for (const mutate of [
    (x: FunctionModel) => { x.boxes[0].inner.inputs = []; },
    (x: FunctionModel) => { x.boxes[0].inner.inputs.push(x.boxes[0].inner.inputs[0]); },
    (x: FunctionModel) => { x.boxes[0].inner.inputs[0].inner.port = "o"; },
    (x: FunctionModel) => { x.boxes[0].inner.model.carriers[0].dimension = "wrong"; },
    (x: FunctionModel) => { x.boxes[0].behavior = [{ in: { x: "0" }, out: { y: "0" } }]; },
    (x: FunctionModel) => { x.boxes[0].inner.model.wires.push({ id: "bad", from: { box: "missing", port: "o" }, to: { box: "a", port: "i" }, carrier: "c", polarity: "useful" }); },
  ]) { const bad = structuredClone(m); mutate(bad); assert.equal(checkModel(bad).ok, false); }
});

test("substitution preserves every nonempty binary relation and uses fresh ids", () => {
  for (let mask = 1; mask < 16; mask++) {
    const m = model(mask), expanded = substitute(m, "h"); assert.equal(expanded.ok, true); if (!expanded.ok) continue;
    assert.equal(expanded.boxNames.a, "h/a#2");
    const flat = structuredClone(m); const h = flat.boxes[0]; delete h.inner;
    h.behavior = rows(mask).map(r => ({ in: { x: r.in.i }, out: { y: r.out.o } }));
    const a = externalBehavior(flat, { fullRelation: true });
    const b = externalBehavior(expanded.model, { fullRelation: true });
    assert.ok(a.ok && a.decided && b.ok && b.decided);
    if (a.ok && a.decided && b.ok && b.decided) {
      const values = (r: typeof a) => r.relation.map(x => [x.input, x.outputs]);
      assert.deepEqual(values(a), values(b));
    }
  }
});

test("nine windows shows the nested subsystem and its boundary", () => {
  const result = nineWindows({ present: model(), subsystem: ["h"] });
  assert.equal(result.ok, true);
  const present = result.windows.find(w => w.time === "present");
  assert.ok(present && present.status === "ok");
  if (present && present.status === "ok") assert.equal("parentBox" in present.subsystem && present.subsystem.parentBox, "h");
});

test("a harm loop inside an inner model is flagged as unanalysed, never reported as a clean verdict", async () => {
  const m = model();
  const inner = m.boxes[0].inner.model as FunctionModel;
  // Inside h: a feeds b, and b harms a back. The outer wiring has no loop.
  inner.boxes = [
    { id: "a", name: "A", role: "tool", inputs: [port("i"), port("back")], outputs: [port("o"), port("fwd")] },
    { id: "b", name: "B", role: "mediator", inputs: [port("i")], outputs: [port("o")] },
  ];
  inner.wires = [
    { id: "ab", from: { box: "a", port: "fwd" }, to: { box: "b", port: "i" }, carrier: "c", polarity: "useful" },
    { id: "ba", from: { box: "b", port: "o" }, to: { box: "a", port: "back" }, carrier: "c", polarity: "harmful" },
  ];
  assert.equal(checkModel(m).ok, true);
  const r = analyseModel(m);
  assert.ok(r.ok);
  assert.deepEqual(r.harmLoops, [], "the outer wiring has no loop");
  assert.deepEqual(r.incompleteHierarchy, ["h"]);
  assert.match(r.note, /inner models of 'h' are not analysed/);
  assert.match(r.note, /triz_expand_hierarchy/);
  // Expanded, the loop is found and nothing is left unanalysed.
  const expanded = substitute(m, "h");
  assert.ok(expanded.ok);
  const flat = analyseModel(expanded.model);
  assert.ok(flat.ok);
  assert.equal(flat.incompleteHierarchy, undefined);
  assert.deepEqual(flat.harmLoops.map((l) => l.negative), [["h/ba"]]);
  // The tool carries the flag, and its isomorphism check says it compared the outer wiring only.
  const spec = toolSpecs().find((s) => s.name === "triz_function_model")!;
  const out = JSON.parse((await spec.handler({ model: m, compare_to: m })).content[0].text);
  assert.deepEqual(out.incompleteHierarchy, ["h"]);
  assert.equal(out.comparison.isomorphism.incompleteHierarchy, true);
});

test("cycles and excessive nesting fail closed in the model checker", () => {
  const cyclic = model(); cyclic.boxes[0].inner.model = cyclic;
  assert.ok(checkModel(cyclic).issues.some(i => i.code === "hierarchy-depth"));
  let nested = model();
  for (let i = 0; i < 9; i++) {
    const next = model(); next.boxes[0].inner.model = nested; nested = next;
  }
  assert.ok(checkModel(nested).issues.some(i => i.code === "hierarchy-depth"));
});

test("schema rejects cyclic and deeply nested inputs before recursive parsing", () => {
  const cyclic = model(); cyclic.boxes[0].inner.model = cyclic;
  assert.equal(FunctionModel.safeParse(cyclic).success, false);
  let inner: unknown = { model: { boxes: [] }, inputs: [], outputs: [] };
  for (let i = 0; i < 10_000; i++) inner = { model: { boxes: [{ inner }] }, inputs: [], outputs: [] };
  const deep = model(); deep.boxes[0].inner = inner;
  assert.equal(FunctionModel.safeParse(deep).success, false);
});
