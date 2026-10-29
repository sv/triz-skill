/** Exact finite behavioral abstraction and black-box summaries; no inference from wiring alone. */
import { z } from 'zod';
import { FunctionModel, Endpoint, checkModel, type FunctionModel as Model } from './act.js';
import { externalBehavior } from './act-behavior.js';
import { fail, issue } from './act-issues.js';
const ValueMap = z.union([z.array(z.tuple([z.string().min(1),z.string().min(1)])).refine(xs=>new Set(xs.map(([k])=>k)).size===xs.length,'Value map keys must be distinct'),z.record(z.string(),z.string().min(1))]);
const PortMap = z.strictObject({ detailed:Endpoint, coarse:Endpoint, values:ValueMap });
export const RefinementRequest = z.strictObject({ detailed:FunctionModel, coarse:FunctionModel, inputs:z.array(PortMap), outputs:z.array(PortMap).min(1), max_states:z.number().int().min(1).max(100_000).default(100_000) });
const key=(e:{box:string;port:string})=>JSON.stringify([e.box,e.port]);
const tuple=(x:unknown)=>JSON.stringify(x);
export function behaviorRefinement(input:z.input<typeof RefinementRequest>) {
  const parsed=RefinementRequest.safeParse(input);
  if(!parsed.success)return fail(parsed.error.issues.map(e=>issue('invalid-argument',`$.${e.path.join('.')}`,e.message,'Use declared input/deliverable endpoints and a total value map.')));
  const {detailed,coarse,max_states}=parsed.data;
  const normalized=(ms:typeof parsed.data.inputs)=>ms.map(m=>({...m,values:Object.fromEntries(Array.isArray(m.values)?m.values:Object.entries(m.values))}));
  const inputs=normalized(parsed.data.inputs),outputs=normalized(parsed.data.outputs);
  const d=externalBehavior(detailed,{scope:'whole',fullRelation:true,maxStates:max_states});
  const c=externalBehavior(coarse,{scope:'whole',fullRelation:true,maxStates:max_states});
  if(!d.ok)return d;if(!c.ok)return c;
  if(!d.decided||!c.decided)return {ok:true as const,verdict:'undecided',reason:'missing-behavior',detailed:d,coarse:c};
  const issues=[];
  for(const [name,maps,ds,cs]of [['inputs',inputs,d.inputs,c.inputs],['outputs',outputs,d.deliverables,c.deliverables]]as const){
    const seen=new Set<string>();
    for(let i=0;i<maps.length;i++){
      const m=maps[i],a=ds.find(p=>key(p)===key(m.detailed)),b=cs.find(p=>key(p)===key(m.coarse));
      if(!a||!b){issues.push(issue('invalid-argument',`$.${name}[${i}]`,'Mapped endpoint is not on the corresponding external interface.','Map boundary inputs and deliverables reported by whole-model behavior.'));continue;}
      if(seen.has(key(m.detailed)))issues.push(issue('invalid-argument',`$.${name}[${i}]`,'A detailed endpoint is mapped more than once.','Use one image per detailed endpoint.'));
      seen.add(key(m.detailed));
      const av=detailed.carriers.find(x=>x.id===a.carrier)!.values!,bv=coarse.carriers.find(x=>x.id===b.carrier)!.values!;
      if(Object.keys(m.values).length!==av.length||av.some(v=>!Object.hasOwn(m.values,v)||!bv.includes(m.values[v]))||Object.keys(m.values).some(v=>!av.includes(v)))issues.push(issue('invalid-argument',`$.${name}[${i}].values`,'Value map is not total into the coarse carrier.','Map each detailed value exactly once to a declared coarse value.'));
    }
    for(const p of cs)if(!maps.some(m=>key(m.coarse)===key(p)))issues.push(issue('invalid-argument',`$.${name}`,'A coarse interface endpoint has no detailed preimage.','Cover the complete coarse interface.'));
  }
  if(issues.length)return fail(issues);
  const project=(values:string[],ports:typeof d.inputs,maps:typeof inputs,targets:typeof c.inputs)=>targets.map(target=>{
    const vals=maps.filter(m=>key(m.coarse)===key(target)).map(m=>m.values[values[ports.findIndex(p=>key(p)===key(m.detailed))]]);
    return vals.every(v=>v===vals[0])?vals[0]:null;
  });
  const detail=new Set<string>(),abstract=new Set<string>();let conflict:unknown;
  for(const row of d.relation)for(const out of row.outputs){
    const x=project(row.input,d.inputs,inputs,c.inputs),y=project(out,d.deliverables,outputs,c.deliverables);
    if(x.includes(null)||y.includes(null)){conflict??={input:row.input,output:out};continue;}
    detail.add(tuple([x,y]));
  }
  if(conflict)return {ok:true as const,verdict:'not-a-refinement',reason:'inconsistent-identification',counterexample:conflict,scope:'whole'};
  for(const row of c.relation)for(const out of row.outputs)abstract.add(tuple([row.input,out]));
  const missing=[...detail].filter(p=>!abstract.has(p)),extra=[...abstract].filter(p=>!detail.has(p));
  return {ok:true as const,verdict:!missing.length?(!extra.length?'exact':'overapproximation'):(!extra.length?'underapproximation':'incomparable'),soundOverapproximation:!missing.length,scope:'whole',detailedPairCount:detail.size,coarsePairCount:abstract.size,detailedEmpty:!detail.size,coarseEmpty:!abstract.size,...(missing.length?{counterexample:JSON.parse(missing[0])}:{}),...(extra.length?{coarseOnly:JSON.parse(extra[0])}:{}),note:'Inclusion of complete declared steady-state relations under this interface/value map. Nonblocking, hidden harms, and truth of declarations are separate obligations.'};
}
export const SummaryRequest=z.strictObject({model:FunctionModel,boxes:z.array(z.string().min(1)).min(1),id:z.string().min(1).default('summary'),max_states:z.number().int().min(1).max(100_000).default(100_000)});
export function summarizeSubsystem(input:z.input<typeof SummaryRequest>){
  const parsed=SummaryRequest.safeParse(input);if(!parsed.success)return fail(parsed.error.issues.map(e=>issue('invalid-argument',`$.${e.path.join('.')}`,e.message,'Name a nonempty subsystem.')));
  const {model,boxes,id,max_states}=parsed.data;const checked=checkModel(model);if(!checked.ok)return checked;
  const keep=new Set(boxes);if(keep.size!==boxes.length||boxes.some(b=>!model.boxes.some(x=>x.id===b)))return fail([issue('invalid-argument','$.boxes','Subsystem boxes are duplicated or unknown.','Use distinct model box ids.')]);
  if(model.boxes.some(b=>b.id===id&&!keep.has(b.id)))return fail([issue('id-not-fresh','$.id','Summary id belongs to a box outside the subsystem.','Choose a fresh summary id.')]);
  const internal=model.wires.filter(w=>keep.has(w.from.box)&&keep.has(w.to.box));
  const selected=model.boxes.filter(b=>keep.has(b.id));
  const ins=selected.flatMap(b=>(b.inputs??[]).filter(p=>!internal.some(w=>w.to.box===b.id&&w.to.port===p.id)||model.wires.some(w=>!keep.has(w.from.box)&&w.to.box===b.id&&w.to.port===p.id)).map(p=>({box:b.id,...p})));
  const outs=selected.flatMap(b=>(b.outputs??[]).filter(p=>!internal.some(w=>w.from.box===b.id&&w.from.port===p.id)||model.wires.some(w=>!keep.has(w.to.box)&&w.from.box===b.id&&w.from.port===p.id)).map(p=>({box:b.id,...p})));
  if(!outs.length)return {ok:true as const,verdict:'undecided',reason:'no-output-interface'};
  const taken=new Set([...model.boxes.map(b=>b.id),...model.wires.map(w=>w.id)]);let n=0;
  const fresh=()=>{let s;do{s=`__summary_${n++}`;}while(taken.has(s));taken.add(s);return s;};
  const observer=fresh();const env=ins.map(()=>fresh());
  const sourceBoxes=ins.map((p,i)=>({id:env[i],name:'Boundary input',role:'environment' as const,inputs:[{id:'in',carrier:p.carrier}],outputs:[{id:'out',carrier:p.carrier}],behavior:(model.carriers.find(c=>c.id===p.carrier)!.values??[]).map(v=>({in:{in:v},out:{out:v}}))}));
  let combinations:Array<Record<string,string>>=[{}];
  for(let i=0;i<outs.length;i++){
    const values=model.carriers.find(c=>c.id===outs[i].carrier)!.values;
    if(!values)return {ok:true as const,verdict:'undecided',reason:'missing-values'};
    if(combinations.length*values.length>max_states)return {ok:true as const,verdict:'undecided',reason:'cap-exceeded'};
    combinations=combinations.flatMap(r=>values.map(v=>({...r,[`out${i}`]:v})));
  }
  if(sourceBoxes.some(b=>!b.behavior.length))return {ok:true as const,verdict:'undecided',reason:'missing-values'};
  const temporary:Model={domain:model.domain,carriers:model.carriers,boxes:[...selected.map(b=>({...b,role:'tool' as const})),...sourceBoxes,{id:observer,name:'Boundary observations',role:'product',inputs:outs.map((p,i)=>({id:`out${i}`,carrier:p.carrier})),behavior:combinations.map(r=>({in:r,out:{}}))}],wires:[...internal,...ins.map((p,i)=>({id:fresh(),from:{box:env[i],port:'out'},to:{box:p.box,port:p.id},carrier:p.carrier,polarity:'useful' as const})),...outs.map((p,i)=>({id:fresh(),from:{box:p.box,port:p.id},to:{box:observer,port:`out${i}`},carrier:p.carrier,polarity:'useful' as const}))]};
  const evaluated=externalBehavior(temporary,{scope:'whole',fullRelation:true,maxStates:max_states});
  if(!evaluated.ok)return evaluated;if(!evaluated.decided)return {ok:true as const,verdict:'undecided',reason:'missing-behavior',details:evaluated};
  const inputMap=ins.map((p,i)=>({original:{box:p.box,port:p.id},summary:{box:id,port:`in${i}`}}));
  const outputMap=outs.map((p,i)=>({original:{box:p.box,port:p.id},summary:{box:id,port:`out${i}`}}));
  const behavior=evaluated.relation.flatMap(row=>row.outputs.map(out=>({in:Object.fromEntries(ins.map((_,i)=>[`in${i}`,row.input[evaluated.inputs.findIndex(p=>p.box===env[i]&&p.port==='in')]])),out:Object.fromEntries(outs.map((_,i)=>[`out${i}`,out[evaluated.deliverables.findIndex(p=>p.box===observer&&p.port===`out${i}`)]]))})));
  const cost:Record<string,number>={};for(const b of selected)for(const[d,v]of Object.entries(b.cost??{}))Object.defineProperty(cost,d,{value:(Object.hasOwn(cost,d)?cost[d]:0)+v,enumerable:true,configurable:true,writable:true});
  return {ok:true as const,verdict:behavior.length?'summarized':'empty-relation',scope:'whole-subsystem',box:{id,name:`Summary of ${boxes.join(', ')}`,role:'tool' as const,inputs:ins.map((p,i)=>({id:`in${i}`,carrier:p.carrier})),outputs:outs.map((p,i)=>({id:`out${i}`,carrier:p.carrier})),cost,...(behavior.length?{behavior}:{})},relation:behavior,inputMap,outputMap,hiddenHarms:internal.filter(w=>w.polarity==='harmful'||w.polarity==='excessive').map(w=>w.id),note:behavior.length?'Exact declared steady-state summary with fixed costs; operating feasibility, dynamics, and hidden-harm adequacy are not inferred.':'The subsystem admits no boundary behavior. An absent behavior declaration must not be used to represent the empty relation.'};
}
