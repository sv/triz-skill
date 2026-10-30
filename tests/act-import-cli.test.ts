import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ImportSourceRequest, importSource } from "../src/act-import-registry.js";
import { ModelProvenance } from "../src/act-provenance.js";
import { reviewImportedModel } from "../src/act-builder.js";
import { checkModel } from "../src/act.js";

const cli = (...args:string[]) => spawnSync(process.execPath,["--import","tsx","src/import-source.ts",...args],{encoding:"utf8"});

test("registry returns a builder model that stays draft, with diagnostics and hierarchy", () => {
  const request = ImportSourceRequest.parse({format:"bom-json",source:{id:"fixture",text:'[{"id":"a","name":"A"}]'}});
  const result = importSource(request); assert.ok(result.ok);
  assert.equal(result.model.provenance?.status,"draft");
  assert.equal(ModelProvenance.safeParse(result.model.provenance).success,true);
  assert.equal(result.draft.components[0].source.source,"fixture");
  const invalid = importSource({format:"openapi-json",source:{id:"x",text:"not json"}});
  assert.equal(invalid.ok,false);
  if (!invalid.ok) { assert.equal(invalid.issues[0].code,"invalid-argument"); assert.equal(invalid.issues[0].path,"$.source.text"); }
});

test("CLI imports only the explicit local file and rejects invalid, oversized and malformed inputs", () => {
  const dir = mkdtempSync(path.join(tmpdir(),"triz-import-"));
  try {
    const file = path.join(dir,"bom.json");
    writeFileSync(file,'[{"id":"a","name":"A"},{"id":"b","name":"B","parent_id":"a"}]');
    const result = cli("--format","bom-json",file);
    assert.equal(result.status,0,result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.model.provenance.status,"draft");
    assert.equal(data.model.provenance.components[0].source.source,file);
    assert.equal(data.hierarchy.length,1);
    assert.equal(cli("--help").status,0);
    assert.notEqual(cli("--format","missing",file).status,0);
    assert.notEqual(cli("--format","bom-json",dir).status,0);
    const bad = path.join(dir,"bad.json"); writeFileSync(bad,Buffer.from([0xff]));
    assert.notEqual(cli("--format","bom-json",bad).status,0);
    const big = path.join(dir,"big.json"); writeFileSync(big,Buffer.alloc(1_000_001));
    assert.notEqual(cli("--format","bom-json",big).status,0);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("registry prefers structured Julia exports and preserves unconfirmed draft provenance", () => {
  const envelopes = [
    {format:"modelingtoolkit-json" as const, value:{format:"triz-modelingtoolkit",version:1,model_id:"demo",profile_id:"p",unknowns:["x(t)"],parameters:["k"],equations:[{lhs:"D(x(t))",rhs:"k*x(t)",lhs_refs:["x(t)"],rhs_refs:["k","x(t)"]}],observed:[],diagnostics:[]}},
    {format:"agents-json" as const, value:{format:"triz-agents-snapshot",version:1,model_id:"demo",profile_id:"p",agent_types:[{name:"Agent",count:1,fields:["id"]}],diagnostics:[]}},
  ];
  for (const {format,value} of envelopes) {
    const result = importSource({format,source:{id:"export.json",text:JSON.stringify(value)}});
    assert.ok(result.ok,JSON.stringify(result));
    assert.equal(result.model.provenance?.status,"draft");
    assert.ok(result.model.boxes.length > 0);
    assert.ok(result.model.provenance!.pending.length > 0);
    assert.ok(result.model.provenance!.components.every(c => c.source.source === "export.json"));
  }
  const help = cli("--help");
  assert.match(help.stdout,/modelingtoolkit-json/);
  assert.match(help.stdout,/agents-json/);
  const fallback = importSource({format:"julia",source:{id:"src.jl",text:"function build_model(config)\n @variables begin\n  x(t)\n end\n eqs = [\n D(x) ~ 1,\n ]\n @named system = ODESystem(eqs, t)\nend\n"}});
  assert.ok(fallback.ok);
  assert.equal(fallback.model.provenance?.status,"draft");
});


test("structured Julia containment remains embedded and sourced after reviewing the model alone", () => {
  const envelopes = [
    {format:"modelingtoolkit-json" as const, value:{format:"triz-modelingtoolkit",version:1,model_id:"demo",profile_id:"p",unknowns:["x"],parameters:[],equations:[],observed:[],subsystems:[{path:["inner"]}],diagnostics:[]}},
    {format:"agents-json" as const, value:{format:"triz-agents-snapshot",version:1,model_id:"demo",profile_id:"p",agent_types:[{name:"Agent",count:1,fields:["id","state"]}],diagnostics:[]}},
  ];
  for (const {format,value} of envelopes) {
    const result = importSource({format,source:{id:"fixture.json",text:JSON.stringify(value)}}); assert.ok(result.ok,JSON.stringify(result));
    const model = result.model, p = model.provenance!;
    assert.ok(p.hierarchy && p.hierarchy.length > 0);
    assert.deepEqual(p.hierarchy,result.draft.hierarchy);
    assert.ok(p.hierarchy.every(x => x.source.source === "fixture.json" && x.source.pointer !== undefined));
    const reviewed = reviewImportedModel(model,p.pending.map(x => ({id:x.id,decision:"confirm" as const})));
    assert.ok(reviewed.ok,JSON.stringify(reviewed));
    assert.deepEqual(reviewed.model.provenance.hierarchy,p.hierarchy);
    assert.equal(checkModel(reviewed.model).ok,true);
  }
});
