import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { toolSpecs } from "../src/tools.js";
import { readFileSync } from "node:fs";
import { FunctionModel } from "../src/act.js";

const local = new Map(toolSpecs({ localImports: true }).map(s => [s.name, s]));
async function call(name: string, args: unknown) {
  const s = local.get(name)!;
  return JSON.parse((await s.handler(z.strictObject(s.shape).parse(args))).content[0].text);
}
test("source import and review are local tools and envelope removal cannot authorize drafts", async () => {
  const hosted = new Set(toolSpecs().map(s => s.name));
  assert.equal(hosted.has("triz_import_source"), false);
  assert.equal(hosted.has("triz_review_import"), false);
  assert.ok(hosted.has("triz_subsystem_contract"));
  const imported = await call("triz_import_source", { format: "bom-csv", source: { id: "bom.csv", text: "id,name,parent_id\nroot,Assembly,\npart,Component,root\n" } });
  assert.equal(imported.ok, true);
  assert.equal(imported.model.provenance.status, "draft");
  const bare = FunctionModel.parse(JSON.parse(JSON.stringify(imported.model)));
  for (const [name, args] of [["triz_function_model", { model: bare }], ["triz_export", { model: bare, format: "dot" }]] as const) {
    const rejected = await call(name, args);
    assert.equal(rejected.ok, false);
    assert.ok(rejected.issues.some((i: { code: string }) => i.code === "draft-model"));
  }
  const pending = imported.model.provenance.pending;
  const partial = await call("triz_review_import", { model: bare, decisions: pending.slice(1).map((p: {id:string}) => ({ id: p.id, decision: "confirm" })) });
  assert.equal(partial.ok, false);
  const reviewed = await call("triz_review_import", { model: bare, decisions: pending.map((p: {id:string}) => ({ id: p.id, decision: "confirm", note: "Reviewed the supplied draft data" })) });
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.model.provenance.status, "reviewed");
  assert.deepEqual(reviewed.model.provenance.components, bare.provenance!.components);
  assert.equal((await call("triz_function_model", { model: reviewed.model })).ok, true);
  assert.equal(bare.provenance!.status, "draft");
  assert.equal(z.strictObject(local.get("triz_review_import")!.shape).safeParse({ model: bare, decisions: pending.map((p: {id:string}) => ({ id: p.id, decision: "reject" })) }).success, false);
});

const example = (name: string) => JSON.parse(readFileSync(new URL(`../examples/function-models/${name}.json`, import.meta.url), "utf8"));
/** An example model with reviewed (or draft) import provenance covering every box and wire. */
function sourced(name: string, status: "draft" | "reviewed") {
  const m = example(name), source = { source: "import.json", pointer: "/items/0" };
  return { ...m, provenance: { status, components: m.boxes.map((b: { id: string }) => ({ id: b.id, source })),
    interactions: m.wires.map((w: { id: string }) => ({ wireId: w.id, source })),
    hierarchy: [{ parent: m.boxes[0].id, child: m.boxes[1].id, source }],
    pending: [{ id: "review", kind: "assumption", description: "Review imported assumptions", source }],
    ...(status === "reviewed" ? { review: { decisions: [{ id: "review", decision: "confirm" }] } } : {}) } };
}

test("reviewed imports stay usable by transforms, rules and windows; derived models keep only surviving sources", async () => {
  // The import -> review -> structural tool loop, through the local tools.
  const text = "module M {\n var count: int\n const limit: int\n val ready: bool = count < limit\n action advance = {\n  count' = count + 1\n }\n}\n";
  const imported = await call("triz_import_source", { format: "quint", source: { id: "m.qnt", text } });
  const reviewed = (await call("triz_review_import", { model: imported.model, decisions: imported.model.provenance.pending.map((p: { id: string }) => ({ id: p.id, decision: "confirm" })) })).model;
  const ids = reviewed.boxes.map((b: { id: string }) => b.id), wire = reviewed.wires[0].id;
  const windows = await call("triz_nine_windows", { present: reviewed, subsystem: [ids[0]] });
  assert.equal(windows.ok, true, JSON.stringify(windows.issues));
  const cut = await call("triz_transform", { model: reviewed, transformation: { op: "rewrite", delete: { wires: [wire] } } });
  assert.equal(cut.ok, true, JSON.stringify(cut.issues));
  assert.equal(cut.model.provenance.status, "reviewed");
  assert.deepEqual(cut.model.provenance.interactions.map((i: { wireId: string }) => i.wireId), reviewed.provenance.interactions.map((i: { wireId: string }) => i.wireId).filter((id: string) => id !== wire));
  assert.deepEqual(cut.model.provenance.components, reviewed.provenance.components);
  assert.equal((await call("triz_function_model", { model: cut.model })).ok, true);

  const bearing = sourced("bearing-heat", "reviewed"), cache = sourced("software-cache", "reviewed");
  const cases: Array<[string, Record<string, unknown>]> = [
    ["merge", { model: bearing, transformation: { op: "merge", boxes: ["bearing", "shaft"], into: { id: "rotor", name: "Rotor", role: "product" } } }],
    ["standby", { model: cache, transformation: { op: "standby", box: "postgres", standby: { id: "replica", name: "Replica" } } }],
    ["trim", { model: cache, transformation: { op: "trim", trim: ["redis"] } }],
    ["cheap_copy", { model: bearing, transformation: { op: "cheap_copy", box: "bearing", copy: { id: "bushing", cost: { usd_unit: 5 } } } }],
    ["take_out", { model: bearing, transformation: { op: "take_out", box: "bearing", ports: ["friction"], part: { id: "seal" } } }],
  ];
  for (const [op, args] of cases) {
    const r = await call("triz_transform", args);
    assert.equal(r.ok, true, `${op}: ${JSON.stringify(r.issues)}`);
    const p = r.model.provenance, boxes = new Set(r.model.boxes.map((b: { id: string }) => b.id)), wires = new Set(r.model.wires.map((w: { id: string }) => w.id));
    assert.equal(p.status, "reviewed", op);
    // No stale entry survives; added elements stay unsourced rather than inheriting a source.
    assert.ok(p.components.every((c: { id: string }) => boxes.has(c.id)) && p.interactions.every((i: { wireId: string }) => wires.has(i.wireId)), op);
    assert.ok((p.hierarchy ?? []).every((l: { parent: string; child: string }) => boxes.has(l.parent) && boxes.has(l.child)), op);
  }
  const merged = await call("triz_transform", cases[0][1]);
  assert.ok(!merged.model.provenance.components.some((c: { id: string }) => ["rotor", "bearing", "shaft"].includes(c.id)));
  assert.deepEqual(merged.model.provenance.hierarchy, [], "the motor/shaft containment link names a merged box and is dropped");
  const listed = await call("triz_rule_apply", { model: bearing, rule_id: "mono-bi" });
  const applied = await call("triz_rule_apply", { model: bearing, rule_id: "mono-bi", match: listed.matches[0].match });
  assert.equal(applied.ok, true, JSON.stringify(applied.issues));
  assert.equal((await call("triz_nine_windows", { past: bearing, present: bearing, subsystem: ["bearing", "shaft"] })).ok, true);

  // A stale entry a caller writes by hand is still refused, and a draft still never passes.
  const stale = structuredClone(bearing); stale.provenance.components.push({ id: "gone", source: { source: "import.json", line: 1 } });
  const refused = await call("triz_function_model", { model: stale });
  assert.equal(refused.ok, false);
  assert.ok(refused.issues.some((i: { code: string; path: string }) => i.code === "invalid-import-provenance" && i.path === "$.model.provenance"));
  const draft = sourced("bearing-heat", "draft");
  for (const [tool, args] of [["triz_transform", { ...cases[0][1], model: draft }], ["triz_nine_windows", { present: draft, subsystem: ["bearing"] }]] as const) {
    const r = await call(tool, args);
    assert.equal(r.ok, false, tool);
    assert.ok(r.issues.some((i: { code: string }) => i.code === "draft-model"), tool);
  }
  // A draft must still source every element: an unsourced box is refused besides draft-model.
  const partial = structuredClone(draft); partial.provenance.components.pop();
  assert.ok((await call("triz_function_model", { model: partial })).issues.some((i: { code: string }) => i.code === "invalid-import-provenance"));
});
