import { test } from "node:test";
import assert from "node:assert/strict";
import { importBom } from "../src/act-import-bom.js";
import { importOpenApi } from "../src/act-import-openapi.js";
import { DraftTable } from "../src/act-import.js";
import { buildModel, BuildModelRequest, reviewImportedModel } from "../src/act-builder.js";
import { ModelProvenance, provenanceProblems } from "../src/act-provenance.js";
import { checkModel, type FunctionModel } from "../src/act.js";
import { ImportSourceRequest, importSource } from "../src/act-import-registry.js";

const source = (text:string) => ({id:"local.json",text});

test("CSV quoting and JSON BOM preserve hierarchy, never fabricate functions", () => {
  const bom = importBom({id:"bom.csv",text:'id,name,parent_id\r\np,"Pump, main",\r\nc,"Valve ""A""",p\r\n'},"csv");
  assert.ok(bom.ok);
  assert.deepEqual(bom.draft.components.map(c => [c.id,c.name,c.source]), [["p","Pump, main",{source:"bom.csv",line:2}],["c",'Valve "A"',{source:"bom.csv",line:3}]]);
  assert.deepEqual(bom.draft.hierarchy, [{parent:"p",child:"c",source:{source:"bom.csv",line:3}}]);
  assert.deepEqual(bom.draft.interactions, []);
  assert.equal(bom.draft.draft.pending.filter(x => x.kind === "role").length,2);
  assert.equal(DraftTable.safeParse(bom.draft).success,true);
  const json = importBom(source(JSON.stringify({items:[{id:"__proto__",name:"A"},{id:"b",name:"B",parent_id:"__proto__"}]})),"json");
  assert.ok(json.ok);
  assert.equal(json.draft.hierarchy![0].source.pointer,"/items/1");
  for (const bad of [ '[{"id":"x","name":"X"},{"id":"x","name":"Y"}]', '[{"id":"a","name":"A","parent_id":"z"}]', '[{"id":"a","name":"A","parent_id":"b"},{"id":"b","name":"B","parent_id":"a"}]' ]) assert.equal(importBom(source(bad),"json").ok,false);
  assert.equal(importBom({id:"bom.csv",text:'id,name\nx,"unterminated'},"csv").ok,false);
  const multi = importBom({id:"bom.csv",text:'id,name\na,"Two\nlines"\nb,Next'},"csv");
  assert.ok(multi.ok);
  assert.equal(multi.draft.components[0].name,"Two\nlines");
  assert.equal(multi.draft.components[1].source.line,4);
});

test("OpenAPI extracts declared payloads with source pointers and no interservice edges", () => {
  const doc = {openapi:"3.1.0", paths:{"/orders/{id}":{parameters:[{name:"id",in:"path"}],get:{operationId:"getOrder",parameters:[{name:"id",in:"path"},{name:"token",in:"header"}],responses:{"200":{content:{"application/json":{schema:{$ref:"#/components/schemas/Order"}}}}}}, post:{requestBody:{$ref:"#/components/requestBodies/New"},responses:{"204":{description:"none"}}}}}, components:{schemas:{Order:{type:"object"}},requestBodies:{New:{content:{"application/json":{schema:{type:"object"}}}}}}};
  const result = importOpenApi(source(JSON.stringify(doc))); assert.ok(result.ok);
  assert.equal(DraftTable.safeParse(result.draft).success,true);
  assert.equal(result.draft.components.filter(c => c.id.startsWith("openapi:operation:")).length,2);
  assert.equal(result.draft.interactions.length,5);
  assert.ok(result.draft.interactions.every(i => i.polarity === "useful" && i.source.pointer !== undefined));
  assert.equal(result.draft.interactions.filter(i => i.action === "supply path id").length,2);
  assert.ok(result.draft.interactions.some(i => i.source.pointer === "/components/requestBodies/New/content/application~1json"));
  assert.equal(result.draft.draft.pending.filter(p => p.kind === "polarity").length,5);
  for (const i of result.draft.interactions) assert.ok(i.subject === "openapi:client" || i.object === "openapi:response");
});

test("external, dangling and recursive references are diagnosed and never fetched", () => {
  const doc = {openapi:"3.0.3",paths:{"/x":{get:{parameters:[{$ref:"https://example.invalid/secret"},{$ref:"#/components/parameters/Missing"}],responses:{"200":{content:{"application/json":{schema:{$ref:"#/components/schemas/Node"}}}}}}}},components:{parameters:{},schemas:{Node:{type:"object",properties:{next:{$ref:"#/components/schemas/Node"}}}}}};
  const result = importOpenApi(source(JSON.stringify(doc))); assert.ok(result.ok);
  assert.ok(result.diagnostics.some(d => d.code === "external-ref"));
  assert.ok(result.diagnostics.some(d => d.code === "unresolved-ref"));
  assert.ok(result.diagnostics.some(d => d.code === "cyclic-ref"));
  assert.ok(!result.draft.interactions.some(i => i.action.startsWith("supply")));
  assert.equal(result.draft.draft.pending.filter(p => p.id.startsWith("openapi:diagnostic:")).length,result.diagnostics.length);
});

test("builder embeds draft provenance; complete review preserves all source locations", () => {
  const parsed = importBom(source('[{"id":"a","name":"A"},{"id":"b","name":"B","parent_id":"a"}]'),"json"); assert.ok(parsed.ok);
  const req = BuildModelRequest.parse(parsed.draft), built = buildModel(req); assert.ok(built.ok);
  assert.deepEqual(built.hierarchy, parsed.draft.hierarchy);
  const p = (built.model as typeof built.model & {provenance:unknown}).provenance;
  const provenance = ModelProvenance.parse(p); assert.equal(provenance.status,"draft");
  assert.equal(checkModel(built.model).ok,false);
  const missing = reviewImportedModel(built.model,[]); assert.equal(missing.ok,false);
  const negative = provenance.pending.map(i => ({id:i.id,decision:"reject useful"}));
  assert.equal(reviewImportedModel(built.model,negative as never).ok,false);
  const forged = {...provenance,status:"reviewed",review:{decisions:negative}};
  assert.equal(provenanceProblems(forged).length > 0,true);
  const decisions = provenance.pending.map(i => ({id:i.id,decision:"confirm" as const, note:"Retain proposed value."}));
  assert.equal(reviewImportedModel(built.model,[...decisions,decisions[0]]).ok,false);
  const reviewed = reviewImportedModel(built.model,decisions); assert.ok(reviewed.ok);
  assert.equal(reviewed.model.provenance.status,"reviewed");
  assert.deepEqual(reviewed.model.provenance.components,provenance.components);
  assert.deepEqual(reviewed.model.provenance.hierarchy,parsed.draft.hierarchy);
  assert.equal(checkModel(reviewed.model).ok,true);
  assert.deepEqual(reviewed.model.provenance.pending,provenance.pending);
  assert.deepEqual(provenanceProblems({...provenance,status:"reviewed"}),["Review requires one decision for every pending item and no others"]);
});

test("import limits reject oversized input and malformed formats", () => {
  assert.equal(importBom({id:"x",text:"x".repeat(1_000_001)},"csv").ok,false);
  assert.equal(importOpenApi(source("openapi: 3.1.0" )).ok,false);
  assert.equal(importOpenApi(source('{"openapi":"2.0","paths":{}}')).ok,false);
});

test("builder retains every OpenAPI component, wire and reference diagnostic source", () => {
  const result = importOpenApi(source(JSON.stringify({openapi:"3.1.0",paths:{"/x":{post:{requestBody:{content:{"application/json":{schema:{$ref:"https://outside.invalid/schema"}}}},responses:{"200":{content:{"application/json":{}}}}}}}})));
  assert.ok(result.ok);
  const built = buildModel(BuildModelRequest.parse(result.draft)); assert.ok(built.ok);
  const p = ModelProvenance.parse((built.model as typeof built.model & {provenance:unknown}).provenance);
  assert.equal(p.components.length,built.model.boxes.length);
  assert.equal(p.interactions.length,built.model.wires.length);
  assert.deepEqual(new Set(p.interactions.map(i => i.wireId)),new Set(built.model.wires.map(w => w.id)));
  assert.ok(p.pending.some(i => i.id.startsWith("openapi:diagnostic:") && i.source.source === "local.json"));
  const decisions = p.pending.map(i => ({id:i.id,decision:"confirm" as const}));
  const incomplete = {...built.model, provenance:{...p,components:p.components.slice(1)}};
  assert.equal(reviewImportedModel(incomplete,decisions).ok,false);
});

test("source pointers remain valid after following a local path-item reference", () => {
  const doc = {openapi:"3.1.0",paths:{"/alias":{$ref:"#/components/pathItems/Shared"}},components:{pathItems:{Shared:{get:{responses:{"200":{content:{"application/json":{schema:{type:"string"}}}}}}}}}};
  const parsed = importOpenApi(source(JSON.stringify(doc))); assert.ok(parsed.ok);
  const lookup = (path:string) => path === "" ? doc : path.slice(1).split("/").reduce((v:any,k) => v?.[k.replace(/~1/g,"/").replace(/~0/g,"~")],doc as any);
  for (const entry of [...parsed.draft.components, ...parsed.draft.interactions]) {
    assert.notEqual(lookup(entry.source.pointer!), undefined,entry.source.pointer ?? "missing pointer");
  }
  assert.ok(parsed.draft.interactions.some(i => i.source.pointer === "/components/pathItems/Shared/get/responses/200/content/application~1json"));
});


test("builder rejects edited hierarchy with a missing parent, duplicate parent or cycle", () => {
  const parsed = importBom(source('[{"id":"a","name":"A"},{"id":"b","name":"B","parent_id":"a"}]'),"json"); assert.ok(parsed.ok);
  const req = BuildModelRequest.parse(parsed.draft);
  assert.equal(buildModel({...req,hierarchy:[{...req.hierarchy![0],parent:"missing"}]}).ok,false);
  assert.equal(buildModel({...req,hierarchy:[...req.hierarchy!,req.hierarchy![0]]}).ok,false);
  assert.equal(buildModel({...req,hierarchy:[...req.hierarchy!,{parent:"b",child:"a",source:req.hierarchy![0].source}]}).ok,false);
});


test("embedded containment rejects missing boxes, duplicate parents and cycles before or after review", () => {
  const imported = importBom(source('[{"id":"a","name":"A"},{"id":"b","name":"B","parent_id":"a"}]'),"json"); assert.ok(imported.ok);
  const built = buildModel(BuildModelRequest.parse(imported.draft)); assert.ok(built.ok);
  const p = ModelProvenance.parse(built.model.provenance), link = p.hierarchy![0];
  const decisions = p.pending.map(x => ({id:x.id,decision:"confirm" as const}));
  for (const hierarchy of [
    [{...link, parent:"missing"}],
    [link, {...link, parent:"b", child:"a"}],
    [link, link],
  ]) {
    const edited: FunctionModel = {...built.model,provenance:{...p,hierarchy}};
    assert.equal(reviewImportedModel(edited,decisions).ok,false);
    const fakeReviewed = {...edited,provenance:{...p,hierarchy,status:"reviewed" as const,review:{decisions}}};
    assert.equal(checkModel(fakeReviewed).ok,false);
  }
});

test("CSV ignores a leading byte order mark and blank lines, keeping physical line numbers", () => {
  const bom = importBom({id:"bom.csv",text:'﻿id,name,parent_id\r\np,Pump,\r\n\r\nc,"Valve, A",p\r\n\r\n\n'},"csv");
  assert.ok(bom.ok, JSON.stringify(!bom.ok && bom.errors));
  assert.deepEqual(bom.draft.components.map(c => [c.id,c.name,c.source.line]), [["p","Pump",2],["c","Valve, A",4]]);
  assert.deepEqual(bom.draft.hierarchy, [{parent:"p",child:"c",source:{source:"bom.csv",line:4}}]);
  // An explicit empty quoted field is a value, not a blank line; a BOM is only skipped at the start.
  assert.equal(importBom({id:"bom.csv",text:'id,name\n""\n'},"csv").ok,false);
  const inner = importBom({id:"bom.csv",text:'id,name\n﻿a,A\n'},"csv"); assert.ok(inner.ok);
  assert.equal(inner.draft.components[0].id,"﻿a");
});

test("a malformed percent escape in a path or operation reference is diagnosed, not fatal", () => {
  const doc = {openapi:"3.0.3",paths:{"/bad":{$ref:"#/components/pathItems/%E0"},"/op":{get:{$ref:"#/x%"}},"/ok":{get:{operationId:"ok",responses:{"200":{content:{"application/json":{}}}}}}}};
  const r = importOpenApi(source(JSON.stringify(doc))); assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  assert.ok(r.draft.components.some(c => c.name === "ok"));
  assert.ok(r.diagnostics.some(d => d.code === "unsupported-path" && d.source.pointer === "/paths/~1bad"));
  assert.ok(r.diagnostics.some(d => d.code === "unsupported-operation" && d.source.pointer === "/paths/~1op/get"));
  assert.ok(r.diagnostics.filter(d => d.code === "unresolved-ref").length >= 2);
});

test("the import request schema bounds source text by the byte limit", () => {
  const ok = ImportSourceRequest.safeParse({format:"bom-csv",source:{id:"x",text:"a".repeat(1_000_000)}});
  assert.equal(ok.success,true);
  const big = ImportSourceRequest.safeParse({format:"bom-csv",source:{id:"x",text:"a".repeat(1_000_001)}});
  assert.equal(big.success,false);
  if (!big.success) assert.deepEqual(big.error.issues[0].path,["source","text"]);
  const r = importSource({format:"bom-csv",source:{id:"x",text:"a".repeat(1_000_001)}});
  assert.equal(r.ok,false); if (!r.ok) assert.equal(r.issues[0].path,"$.source.text");
});
