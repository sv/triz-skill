import { test } from "node:test";
import assert from "node:assert/strict";
import * as data from "../src/data.js";
import { type FunctionModel, checkModel } from "../src/act.js";
import { effectChains, inferredEffectHints, type TypedEffect } from "../src/act-effects.js";
import { insertEffectChain } from "../src/act-effect-insert.js";
import { bondGraph } from "../src/act-bond.js";
import { lifecycle } from "../src/act-lifecycle.js";
import { lifecyclePriorRanking } from "../src/act-lifecycle-prior.js";
import { searchComponents } from "../src/act-component-search.js";
import { renamedTwin } from "./support/twin.js";
import { bondModel } from "./support/lifecycle.js";

const effect = (id:string,input:string,output:string): TypedEffect => ({id,name:id,input:{quantity:input},output:{quantity:output},field:"information",conditions:["given"],source:"synthetic declaration",typed_from:"source"});
function interfaceModel(): FunctionModel {
  return {domain:"software",carriers:[{id:"a",layer:"information",dimension:"a",effect_quantity:"a"},{id:"z",layer:"information",dimension:"z",effect_quantity:"z"}],
    boxes:[{id:"s",name:"Source",role:"environment",outputs:[{id:"o",carrier:"a"}]},{id:"p",name:"Product",role:"product",inputs:[{id:"i",carrier:"z"}]}],wires:[]};
}
test("empty effect resources fail closed and chains never reuse an effect", () => {
  for (const args of [{resources:[]},{model:{domain:"software",carriers:[{id:"c",layer:"information",dimension:"q"}],boxes:[],wires:[]}}]) {
    const r=effectChains({...args,output:{quantity:"z"}} as Parameters<typeof effectChains>[0]);
    assert.equal(r.ok,false);
  }
  const r=effectChains({resources:[{quantity:"a"}],output:{quantity:"z"},effects:[effect("forward","a","z"),effect("back","z","a")],k:6});
  assert.ok(r.ok); assert.equal(r.count,1);
  assert.deepEqual(r.chains.map(c=>c.effects.map(e=>e.id)),[["forward"]]);
});
test("inferred effect hints use unknown tool inputs and share one cap", () => {
  const m=interfaceModel();m.carriers[0].effect_quantity="temperature difference";m.carriers[1].effect_quantity="voltage";
  const declared = data.typedEffects().find(e => e.id === 7)!;
  m.carriers[0].si = declared.input.si; m.carriers[1].si = declared.output.si;
  m.boxes.push({id:"unknown",name:"Unknown",role:"tool",inputs:[{id:"i",carrier:"a"}],outputs:[{id:"o",carrier:"z"}]});
  const r=inferredEffectHints(m,data.typedEffects());
  assert.equal(r.complete,true);assert.equal(r.hints.length,1);assert.equal(r.hints[0].box,"unknown");
  assert.ok(r.hints[0].search.ok && r.hints[0].search.chains.length);
  assert.ok(r.hints[0].search.ok && r.hints[0].search.chains.every(c=>c.effects.length>0));
  const capped=inferredEffectHints(m,data.typedEffects(),2);assert.equal(capped.complete,false);assert.ok(capped.work<=3);
});
test("identity replacement must restate changed flow paths", () => {
  const m=interfaceModel();m.carriers[1]=structuredClone(m.carriers[0]);m.carriers.pop();m.boxes[1].inputs![0].carrier="a";
  m.boxes.push({id:"s2",name:"Other source",role:"environment",outputs:[{id:"o",carrier:"a"}]});
  m.wires=[{id:"w",from:{box:"s",port:"o"},to:{box:"p",port:"i"},carrier:"a",polarity:"useful"}];m.flows=[{id:"f",carrier:"a",path:["s","p"]}];
  const args={model:m,from:{box:"s2",port:"o"},to:{box:"p",port:"i"},chain:[],replace_wire:"w"};
  const bad=insertEffectChain(args);assert.equal(bad.ok,false);if(!bad.ok)assert.equal(bad.issues[0].path,"$.flows");
  assert.ok(insertEffectChain({...args,flows:[{id:"f",carrier:"a",path:["s2","p"]}]}).ok);
});
test("insertion verifies curated effect provenance and labels supplied declarations", () => {
  const m=interfaceModel(), e=effect("custom","a","z"), library=data.typedEffects();
  const caller=insertEffectChain({model:m,from:{box:"s",port:"o"},to:{box:"p",port:"i"},chain:[e]},library);
  assert.ok(caller.ok && "effects" in caller);assert.equal(caller.effects[0].provenance,"caller-declared");assert.equal(caller.effects[0].typed_from,"caller-declared");
  const seebeck=library.find(e=>e.id===7)!;
  const forged=insertEffectChain({model:m,from:{box:"s",port:"o"},to:{box:"p",port:"i"},chain:[{...e,id:7,source:seebeck.source,typed_from:seebeck.typed_from}]},library);assert.equal(forged.ok,false);
  m.carriers[0].effect_quantity=seebeck.input.quantity;m.carriers[1].effect_quantity=seebeck.output.quantity;
  m.carriers[0].si=seebeck.input.si;m.carriers[1].si=seebeck.output.si;
  const verified=insertEffectChain({model:m,from:{box:"s",port:"o"},to:{box:"p",port:"i"},chain:[seebeck]},library);
  assert.ok(verified.ok && "effects" in verified);assert.equal(verified.effects[0].provenance,"catalogue-verified");
});
test("entry-derived typings identify their source fields and normalize shared quantity tokens", () => {
  const es=data.typedEffects(), induction=es.find(e=>e.id===3)!, magnetostriction=es.find(e=>e.id===12)!, eddy=es.find(e=>e.id===34)!, peltier=es.find(e=>e.id===8)!;
  assert.equal(induction.typed_from,"source");assert.match(induction.source,/clause/);
  assert.equal(magnetostriction.typed_from,"source");assert.match(magnetostriction.source,/function-field output/);
  assert.equal(induction.input.quantity,eddy.input.quantity);assert.equal(eddy.output.quantity,peltier.input.quantity);
  const r=effectChains({resources:[eddy.input],output:peltier.output},es);assert.ok(r.ok);assert.ok(r.chains.some(c=>JSON.stringify(c.effects.map(e=>e.id))==="[34,8]"));
});
test("reversing a bond reference direction preserves causality findings", () => {
  const m=bondModel(), c=m.carriers[0].id;
  const source=(id:string):FunctionModel["boxes"][number]=>({id,name:id,role:"tool",bond:{element:"Se"},outputs:[{id:"o",carrier:c}]});
  const junction=(id:string):FunctionModel["boxes"][number]=>({id,name:id,role:"mediator",bond:{element:"1"},inputs:[{id:"a",carrier:c}],outputs:[{id:"b",carrier:c},{id:"c",carrier:c}]});
  const storage=(id:string,element:"C"|"I"|"R"):FunctionModel["boxes"][number]=>({id,name:id,role:"tool",bond:{element},inputs:[{id:"p",carrier:c}]});
  m.boxes=[source("s"),junction("j"),storage("i1","I"),storage("i2","I"),source("s2"),junction("k"),storage("c1","C"),storage("r1","R")];
  const wire=(id:string,from:string,port:string,to:string,toPort:string):FunctionModel["wires"][number]=>({id,from:{box:from,port},to:{box:to,port:toPort},carrier:c,polarity:"useful"});
  m.wires=[wire("sj","s","o","j","a"),wire("ji1","j","b","i1","p"),wire("ji2","j","c","i2","p"),wire("sk","s2","o","k","a"),wire("kc","k","b","c1","p"),wire("kr","k","c","r1","p")];
  const a=bondGraph({model:m});assert.ok(a.ok && a.verdict==="assigned");
  const reversed=structuredClone(m), w=reversed.wires[4];[w.from,w.to]=[w.to,w.from];
  const k=reversed.boxes[5], cap=reversed.boxes[6];k.inputs!.push(k.outputs!.shift()!);cap.outputs=cap.inputs;cap.inputs=[];
  assert.ok(checkModel(reversed).ok);
  const b=bondGraph({model:reversed});assert.ok(b.ok && b.verdict==="assigned");
  assert.deepEqual(a.findings,b.findings);assert.deepEqual(a.forcedDerivativeBoxes,b.forcedDerivativeBoxes);assert.deepEqual(a.causality,b.causality);
  assert.equal(a.integralPossible,false);assert.deepEqual(a.forcedDerivativeBoxes,[]);
});
test("tied optimal transitions cannot choose availability or priors by declaration order", () => {
  const model:FunctionModel={domain:"software",carriers:[],boxes:[],wires:[],lifecycle:{states:["up","down"],acceptable:["up"]},actions:[
    {id:"wait",guard:["up"],cost:{c:0},transitions:[{state:"up",next:"up",probability:1}]},
    {id:"cycle",guard:["up"],cost:{c:0},transitions:[{state:"up",next:"down",probability:1}]},
    {id:"repair",guard:["down"],cost:{c:0},transitions:[{state:"down",next:"up",probability:1}]},
  ]};
  for(const actions of [model.actions!,[model.actions![1],model.actions![0],model.actions![2]]]) {
    const r=lifecycle({model:{...model,actions}});assert.ok(r.ok && r.verdict==="undecided");assert.equal(r.reason,"tied-optimal-policies");assert.ok(!("solutions" in r));
  }
  delete model.actions![0].transitions[0].probability;
  const prior=lifecycle({model,derive_prior:true,weights:{c:1}});assert.ok(prior.ok && prior.verdict==="undecided");assert.equal(prior.reason,"probabilities-undeclared");
  assert.equal(lifecycle({model,weights:{missing:1}}).ok,false);
});
test("exactly equal lifecycle prior masses remain tied under either concept order", () => {
  const make=(ps:string[]):FunctionModel=>({domain:"software",carriers:[{id:"v",layer:"information",dimension:"v",values:["v1","v2","v3"]}],
    boxes:[{id:"read",name:"Read",role:"tool",inputs:[{id:"i",carrier:"v"}],outputs:[{id:"o",carrier:"v"}],behavior:["v1","v2","v3"].map(v=>({in:{i:v},out:{o:v}}))},{id:"p",name:"Product",role:"product",inputs:[{id:"i",carrier:"v"}],behavior:["v1","v2","v3"].map(v=>({in:{i:v},out:{}}))}],
    wires:[{id:"w",from:{box:"read",port:"o"},to:{box:"p",port:"i"},carrier:"v",polarity:"useful"}],
    lifecycle:{states:["s1","s2","s3"],situations:Object.fromEntries(["s1","s2","s3"].map((s,i)=>[s,[{box:"read",port:"i",value:`v${i+1}`}]]))},
    actions:[{id:"advance",guard:["s1","s2","s3"],cost:{c:1},transitions:["s1","s2","s3"].flatMap(state=>ps.map((probability,i)=>({state,next:`s${i+1}`,probability})))}]});
  const a={id:"A",model:make(["1/10","2/10","7/10"])},b={id:"B",model:make(["3/10","0/10","7/10"])};
  for(const concepts of [[a,b],[b,a]]) {
    const r=lifecyclePriorRanking(concepts,[{box:"p",port:"i",values:["v1","v2"]}],concepts.map(c=>({concept:c.id,objective:0})));
    assert.ok(r.ok && "lifecyclePriors" in r && r.lifecyclePriors.verdict==="derived",JSON.stringify(r));
    assert.ok(r.lifecyclePriors.byProbability);
    assert.deepEqual(r.lifecyclePriors.byProbability.map(x=>x.id),concepts.map(c=>c.id));
    assert.deepEqual(r.lifecyclePriors.byProbability.map(x=>x.admittedProbabilityExact),["3/10","3/10"]);
  }
});
test("quantity and condition token renaming preserves chain, insertion and bundled-catalogue results", () => {
  const model=interfaceModel(),e=effect("custom","a","z"),t=renamedTwin(model,["given"]);
  const renamed={...e,input:{quantity:t.token("a")},output:{quantity:t.token("z")},conditions:[t.token("given")]};
  const a=effectChains({resources:[e.input],output:e.output,effects:[e],conditions:e.conditions}), b=effectChains({resources:[renamed.input],output:renamed.output,effects:[renamed],conditions:renamed.conditions});
  assert.deepEqual(t.back(b),a);
  const inserted=insertEffectChain({model,from:{box:"s",port:"o"},to:{box:"p",port:"i"},chain:[e],conditions:e.conditions});
  const twinInserted=insertEffectChain({model:t.model,from:{box:t.box("s"),port:t.port("s","o")},to:{box:t.box("p"),port:t.port("p","i")},chain:[renamed],conditions:renamed.conditions});
  assert.ok(inserted.ok && twinInserted.ok);assert.deepEqual(t.back(twinInserted.unmetConditions),inserted.unmetConditions);
  const catalogue=(m:FunctionModel)=>({format:"triz-component-catalogue-v1",id:"bundle",carriers:m.carriers.map((c,i)=>({...c,id:`local${i}`})),entries:[{id:"convert",source:{citation:"synthetic",license:"MIT"},component:{id:"convert",name:"Convert",role:"tool",inputs:[{id:"i",carrier:"local0"}],outputs:[{id:"o",carrier:"local1"}]}}]});
  const result=searchComponents({model,resources:[{box:"s",port:"o"}],targets:[{box:"p",port:"i"}],catalogues:[{catalogue:catalogue(model),bindings:{local0:"a",local1:"z"}}],max_components:1});
  const twin=searchComponents({model:t.model,resources:[{box:t.box("s"),port:t.port("s","o")}],targets:[{box:t.box("p"),port:t.port("p","i")}],catalogues:[{catalogue:catalogue(t.model),bindings:{local0:t.carrier("a"),local1:t.carrier("z")}}],max_components:1});
  assert.ok(result.ok && twin.ok);assert.equal(twin.verdict,result.verdict);assert.equal(twin.satisfyingCount,result.satisfyingCount);
});
