import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { toolSpecs } from "../src/tools.js";
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
