import { test } from "node:test";
import assert from "node:assert/strict";
import { type FunctionModel } from "../src/act.js";
import { summarizeSubsystem } from "../src/act-refinement.js";
import { checkRegionDeclarations } from "../src/act-symbolic-certificate.js";
import { wholePortBoundary } from "./support/whole-port-oracle.js";

const p = (id: string) => ({ id, carrier: "bit" });
const pair = () => ["0", "1"].flatMap(a => ["0", "1"].map(b => [a, b]));
function joint(): FunctionModel {
  return { domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "second", name: "Joint readout", role: "tool", inputs: [p("left"), p("right")], outputs: [p("out")], cost: { compute: 3 },
        behavior: pair().map(([a,b]) => ({ in: { left:a, right:b }, out: { out:String(Number(a)^Number(b)) } })) },
      { id: "first", name: "Joint inversion", role: "tool", inputs: [p("a"), p("b")], outputs: [p("x"), p("y")], cost: { compute: 2 },
        behavior: pair().map(([a,b]) => ({ in: { a,b }, out: { x:b, y:a === "0" ? "1" : "0" } })) },
    ], wires: [
      { id: "swap-x", from: { box:"first", port:"x" }, to: { box:"second", port:"right" }, carrier:"bit", polarity:"useful" },
      { id: "swap-y", from: { box:"first", port:"y" }, to: { box:"second", port:"left" }, carrier:"bit", polarity:"excessive" },
    ] };
}
function summary(model: FunctionModel, symbolic = true, max_states = 100_000) {
  const r = summarizeSubsystem({ model, boxes:model.boxes.map(b => b.id), max_states }, { symbolic });
  assert.ok(r.ok && "relation" in r, JSON.stringify(r));
  return r;
}
const signature = (r: ReturnType<typeof summary>) => r.relation.map(row => JSON.stringify([
  r.inputMap.map(p => row.in[p.summary.port]), r.outputMap.map(p => row.out[p.summary.port]),
])).sort().join(";");

test("fixed joint maps reuse checked symbolic composition, preserving permutations, costs and harm metadata", () => {
  const model=joint(), fast=summary(model), finite=summary(model,false);
  assert.equal(fast.method,"symbolic"); assert.equal(finite.method,"finite");
  assert.equal(signature(fast),signature(finite));
  assert.equal(signature(fast),wholePortBoundary(model,{inputs:fast.inputMap.map(p=>p.original),outputs:fast.outputMap.map(p=>p.original)}));
  assert.deepEqual(fast.box.cost,{compute:5}); assert.deepEqual(fast.hiddenHarms,["swap-y"]);
  assert.deepEqual(fast.inputMap,finite.inputMap); assert.deepEqual(fast.outputMap,finite.outputMap);
  assert.ok(fast.symbolicCertificate && checkRegionDeclarations(fast.symbolicCertificate,model,[]));
  assert.ok(fast.symbolicCertificate.stages.every(s=>s.hole===null));
  const altered=structuredClone(fast.symbolicCertificate); altered.layers.at(-1)![0].image[0]^=1;
  assert.equal(checkRegionDeclarations(altered,model,[]),false);
});

test("partial, nondeterministic and disconnected constraints retain exact finite relations; state and caps are never erased", () => {
  for(const nondeterministic of [false,true]){
    const model=joint(), rows=model.boxes[0].behavior!;
    if(nondeterministic)rows.push({in:{...rows[0].in},out:{out:rows[0].out.out==="0"?"1":"0"}}); else rows.pop();
    const r=summary(model);
    assert.equal(r.method,"finite"); assert.equal(r.relation.length,nondeterministic?5:3);
    assert.equal(signature(r),wholePortBoundary(model,{inputs:r.inputMap.map(p=>p.original),outputs:r.outputMap.map(p=>p.original)}));
  }
  const blocked=joint();
  blocked.boxes.push({id:"blocked",name:"Disconnected contradiction",role:"tool",inputs:[p("in")],outputs:[p("out")],
    behavior:[{in:{in:"0"},out:{out:"1"}},{in:{in:"1"},out:{out:"0"}}]});
  blocked.wires.push({id:"feedback",from:{box:"blocked",port:"out"},to:{box:"blocked",port:"in"},carrier:"bit",polarity:"useful"});
  const empty=summary(blocked); assert.equal(empty.method,"finite"); assert.equal(empty.verdict,"empty-relation"); assert.equal(empty.box.behavior,undefined);
  const stateful=joint(), b=stateful.boxes[1];
  b.state=["s"];b.initial=["s"];b.transition=b.behavior!.map(r=>({...r,state:"s",next:"s"}));delete b.behavior;
  const unknown=summarizeSubsystem({model:stateful,boxes:["first","second"]});
  assert.ok(unknown.ok && unknown.verdict==="undecided" && unknown.reason==="missing-behavior");
  const capped=summarizeSubsystem({model:joint(),boxes:["first","second"],max_states:1});
  assert.ok(capped.ok && capped.verdict==="undecided" && capped.reason==="cap-exceeded");
});

test("summaries match an independent whole-port oracle across 200 finite chains and feedback relations", () => {
  let seed=1337;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>8;};
  for(let sample=0;sample<200;sample++){
    const n=1+random()%3, model:FunctionModel={domain:"software",carriers:joint().carriers,boxes:[],wires:[]};
    for(let i=0;i<n;i++){
      const mask=1+random()%15, id=`b${i}`;
      model.boxes.push({id,name:id,role:"tool",inputs:[p("in")],outputs:[p("out")],behavior:pair().filter((_,i)=>mask&(1<<i)).map(([x,y])=>({in:{in:x},out:{out:y}}))});
      if(i)model.wires.push({id:`w${i}`,from:{box:`b${i-1}`,port:"out"},to:{box:id,port:"in"},carrier:"bit",polarity:"useful"});
    }
    if(sample%4===0 && n>1)model.wires.push({id:"feedback",from:{box:`b${n-1}`,port:"out"},to:{box:"b0",port:"in"},carrier:"bit",polarity:"useful"});
    // A tap outside the selection keeps the last output observable even with feedback.
    const selected=model.boxes.map(b=>b.id), observer={id:"observer",name:"Outside",role:"product" as const,inputs:[p("in")],behavior:[{in:{in:"0"},out:{}},{in:{in:"1"},out:{}}]};
    model.boxes.push(observer);model.wires.push({id:"observe",from:{box:`b${n-1}`,port:"out"},to:{box:observer.id,port:"in"},carrier:"bit",polarity:"useful"});
    const r=summarizeSubsystem({model,boxes:selected});assert.ok(r.ok&&"relation"in r,JSON.stringify(r));
    assert.equal(signature(r),wholePortBoundary(model,{inputs:r.inputMap.map(p=>p.original),outputs:r.outputMap.map(p=>p.original)}),`sample ${sample}`);
  }
});

test("outside fan-in and intermediate taps retain correlated boundary observations", () => {
  for(const fanIn of [false,true]){
    const model=joint(), selected=model.boxes.map(b=>b.id);
    if(fanIn){
      model.boxes.push({id:"outside",name:"Outside source",role:"environment",inputs:[p("in")],outputs:[p("out")],
        behavior:[{in:{in:"0"},out:{out:"0"}},{in:{in:"1"},out:{out:"1"}}]});
      model.wires.push({id:"outside",from:{box:"outside",port:"out"},to:{box:"second",port:"left"},carrier:"bit",polarity:"useful"});
    }else{
      model.boxes.push({id:"tap",name:"Outside observer",role:"product",inputs:[p("in")],behavior:[{in:{in:"0"},out:{}},{in:{in:"1"},out:{}}]});
      model.wires.push({id:"tap",from:{box:"first",port:"x"},to:{box:"tap",port:"in"},carrier:"bit",polarity:"useful"});
    }
    const r=summarizeSubsystem({model,boxes:selected});assert.ok(r.ok&&"relation"in r);
    assert.equal(r.method,"finite");assert.equal(r.relation.length,4);
    assert.equal(fanIn?r.inputMap.length:r.outputMap.length,fanIn?3:2);
    assert.equal(signature(r),wholePortBoundary(model,{inputs:r.inputMap.map(p=>p.original),outputs:r.outputMap.map(p=>p.original)}));
  }
});

test("sparse boundary output rows avoid constructing a Cartesian product of observation values", () => {
  const model=joint(), values=Array.from({length:1000},(_,i)=>String(i));
  model.carriers.push({id:"large",layer:"information",dimension:"declared output",values});
  model.boxes=[{id:"sparse",name:"Sparse joint readout",role:"tool",inputs:[p("in")],outputs:[{id:"x",carrier:"large"},{id:"y",carrier:"large"}],
    behavior:[{in:{in:"0"},out:{x:"0",y:"999"}},{in:{in:"1"},out:{x:"999",y:"0"}}]}];model.wires=[];
  const r=summary(model,false,100);
  assert.equal(r.relation.length,2);assert.deepEqual(r.relation.map(r=>r.out),[{out0:"0",out1:"999"},{out0:"999",out1:"0"}]);
});
