import { test } from "node:test";
import assert from "node:assert/strict";
import { importModelingToolkitJson, importAgentsJson } from "../src/act-import-julia-export.js";
import { DraftTable } from "../src/act-import.js";
import { BuildModelRequest, buildModel } from "../src/act-builder.js";
import { checkModel } from "../src/act.js";
const mtk = () => ({format:"triz-modelingtoolkit",version:1,model_id:"demo",profile_id:"nominal",unknowns:["x(t)","y(t)"],parameters:["gain"],equations:[{lhs:"D(x(t))",rhs:"gain*y(t)",lhs_refs:["x(t)"],rhs_refs:["gain","y(t)"]}],observed:[{lhs:"z(t)",rhs:"x(t)",lhs_refs:["z(t)"],rhs_refs:["x(t)","external(t)"]}],diagnostics:[{code:"symbolic-coverage",section:"model",index:0,message:"Simplification and behavior are not reconstructed."}]});
const source = (value:unknown)=>({id:"synthetic.json",text:JSON.stringify(value)});

test("imports actual symbolic references and preserves pointers as reviewable draft",()=>{
  const r=importModelingToolkitJson(source(mtk())); assert.ok(r.ok);
  assert.equal(DraftTable.safeParse(r.draft).success,true);
  assert.equal(r.draft.components.length,6); assert.equal(r.draft.interactions.length,5);
  assert.ok(r.diagnostics.some(d=>d.code === "unresolved-symbol" && d.source.pointer === "/observed/0/rhs_refs/1"));
  assert.ok(r.draft.interactions.some(i=>i.source.pointer === "/equations/0/rhs_refs/0"));
  assert.ok(r.draft.interactions.every(i=>i.action === "references" && i.polarity === "useful"));
  assert.equal(r.draft.draft.pending.filter(p=>p.kind === "polarity").length,r.draft.interactions.length);
  const b=buildModel(BuildModelRequest.parse(r.draft)); assert.ok(b.ok); assert.equal(checkModel(b.model).ok,false);
});
test("rejects duplicate symbols and malformed or oversized data without reading any path",()=>{
  const x=mtk();x.parameters.push("x(t)");assert.equal(importModelingToolkitJson(source(x)).ok,false);
  assert.equal(importModelingToolkitJson({id:"x",text:'{"format":"triz-modelingtoolkit","version":2}'}).ok,false);
  assert.equal(importModelingToolkitJson({id:"x",text:"x".repeat(1_000_001)}).ok,false);
  assert.equal(importModelingToolkitJson({id:"x",text:'{"file":"/etc/passwd"}'}).ok,false);
  const big=mtk();big.equations[0].rhs_refs=Array(2000).fill("gain");assert.equal(importModelingToolkitJson(source(big)).ok,false);
});
test("agent snapshots expose observed type/field structure but never interaction behavior",()=>{
  const snapshot={format:"triz-agents-snapshot",version:1,model_id:"agents",profile_id:"now",agent_types:[{name:"Worker",count:3,fields:["id","capacity"]}],diagnostics:[]};
  const r=importAgentsJson(source(snapshot));assert.ok(r.ok);
  assert.equal(DraftTable.safeParse(r.draft).success,true);assert.equal(r.draft.interactions.length,0);
  assert.equal(r.draft.components.length,3);assert.equal(r.draft.hierarchy!.length,2);
  assert.ok(r.diagnostics.some(d=>d.code === "snapshot-not-behavior"));
  const b=buildModel(BuildModelRequest.parse(r.draft)); assert.ok(b.ok); assert.equal(checkModel(b.model).ok,false);
  snapshot.agent_types[0].fields.push("id");assert.equal(importAgentsJson(source(snapshot)).ok,false);
});

test("subsystem paths preserve explicit containment without guessing symbol ownership",()=>{
  const x={...mtk(),subsystems:[{path:["inner","child"]},{path:["inner"]}]};
  const r=importModelingToolkitJson(source(x)); assert.ok(r.ok);
  assert.equal(r.draft.hierarchy?.length,2);
  assert.ok(r.draft.hierarchy?.some(h=>h.source.pointer === "/subsystems/0"));
  assert.equal(DraftTable.safeParse(r.draft).success,true);
  const dangling={...mtk(),subsystems:[{path:["missing","child"]}]};assert.equal(importModelingToolkitJson(source(dangling)).ok,false);
  const duplicate={...mtk(),subsystems:[{path:["x"]},{path:["x"]}]};assert.equal(importModelingToolkitJson(source(duplicate)).ok,false);
});

test("symbol occurrences keep separate left and right source pointers", () => {
  const x = {format:"triz-modelingtoolkit",version:1,model_id:"m",profile_id:"p",unknowns:["x"],parameters:[],
    equations:[{lhs:"x",rhs:"x+1",lhs_refs:["x"],rhs_refs:["x"]}],observed:[],diagnostics:[]};
  const result = importModelingToolkitJson(source(x)); assert.ok(result.ok); if (!result.ok) return;
  assert.deepEqual(result.draft.interactions.map(i=>i.source.pointer), ["/equations/0/lhs_refs/0", "/equations/0/rhs_refs/0"]);
  assert.notEqual(result.draft.interactions[0].carrier.id, result.draft.interactions[1].carrier.id);
  const built = buildModel(BuildModelRequest.parse(result.draft)); assert.ok(built.ok);
  if (built.ok) assert.deepEqual(built.model.provenance!.interactions.map(i=>i.source.pointer).sort(), ["/equations/0/lhs_refs/0", "/equations/0/rhs_refs/0"]);
});

test("an observed agent type has a positive population count", () => {
  const x = {format:"triz-agents-snapshot",version:1,model_id:"m",profile_id:"p",agent_types:[{name:"NeverObserved",count:0,fields:[]}],diagnostics:[]};
  assert.equal(importAgentsJson(source(x)).ok, false);
  x.agent_types[0].count = 1; assert.equal(importAgentsJson(source(x)).ok, true);
});
