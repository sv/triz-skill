/** Restricted rewrite guarantees. No inference of global confluence from bounded joins. */
import { z } from 'zod';
import { FunctionModel, Box, Wire, Flow, Endpoint, checkModel, type FunctionModel as Model } from './act.js';
import { Rule, validateRule } from './act-rule.js';
import { applyTrim, rewrite, type RewriteStep } from './act-rewrite.js';
import { fail, issue } from './act-issues.js';
const Id=z.string().min(1);
const Rewrite=z.strictObject({delete:z.strictObject({boxes:z.array(Id).optional(),wires:z.array(Id).optional(),flows:z.array(Id).optional()}).optional(),add:z.strictObject({boxes:z.array(Box).optional(),wires:z.array(Wire).optional(),flows:z.array(Flow).optional()}).optional()});
export const RewritePairRequest=z.strictObject({model:FunctionModel,first:Rewrite,second:Rewrite});
export const RuleSetRequest=z.strictObject({rules:z.array(Rule).min(1).max(100)});
export const TrimRewriteRequest=z.strictObject({model:FunctionModel,trim:z.array(Id).min(1),absorb:z.record(z.string(),Endpoint).optional()});
function error(e:z.ZodError){return fail(e.issues.map(i=>issue('invalid-argument',`$.${i.path.join('.')}`,i.message,'Use the declared rewrite analysis schema.')));}
const canonical=(x:unknown):string=>x&&typeof x==='object'?Array.isArray(x)?`[${x.map(canonical).join(',')}]`:`{${Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`:JSON.stringify(x);
// Array order is ignored only for model collections and finite row SETS. Flow paths and levels are ordered.
function normalized(m:Model){
  const sorted=(xs:unknown[])=>xs.map(x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)).sort();
  return JSON.stringify({domain:m.domain,system:m.system,carriers:sorted(m.carriers.map(c=>({...c,values:c.values&&[...c.values].sort()}))),boxes:sorted(m.boxes.map(b=>({...b,inputs:b.inputs&&sorted(b.inputs),outputs:b.outputs&&sorted(b.outputs),behavior:b.behavior&&sorted(b.behavior),producible:b.producible&&sorted(b.producible),state:b.state&&[...b.state].sort(),initial:b.initial&&[...b.initial].sort(),transition:b.transition&&sorted(b.transition),feasibility:b.feasibility&&sorted(b.feasibility)}))),wires:sorted(m.wires),flows:sorted(m.flows??[]),budget:m.budget&&sorted(Object.entries(m.budget)),weights:m.weights&&sorted(Object.entries(m.weights)),contradictions:sorted(m.contradictions??[])});
}
export function analyzeRewritePair(input:z.input<typeof RewritePairRequest>){
  const p=RewritePairRequest.safeParse(input);if(!p.success)return error(p.error);
  const {model,first,second}=p.data;
  const checked=checkModel(model,"$.model"); if(!checked.ok)return checked;
  const a=rewrite(model,first),b=rewrite(model,second);if(!a.ok||!b.ok)return {ok:true as const,verdict:'not-applicable',first:a,second:b};
  const ab=rewrite(a.model,second),ba=rewrite(b.model,first);
  const commute=ab.ok&&ba.ok&&normalized(ab.model)===normalized(ba.model);
  return {ok:true as const,verdict:commute?'commute':'interference',scope:'these two named occurrences and their two-step orders only',firstThenSecond:ab,secondThenFirst:ba,confluence:'not-established'};
}
export function analyzeRuleSet(input:z.input<typeof RuleSetRequest>){
  const p=RuleSetRequest.safeParse(input);if(!p.success)return error(p.error);
  const invalid=p.data.rules.flatMap((r,i)=>validateRule(r,`$.rules[${i}]`).issues);if(invalid.length)return fail(invalid);
  if(new Set(p.data.rules.map(r=>r.id)).size!==p.data.rules.length)return fail([issue('duplicate-id','$.rules','Rule ids are duplicated.','Give each rule a distinct id.')]);
  const measures=p.data.rules.map(r=>{
    const kBoxes=new Set(r.interface.boxes.map(b=>b.id)),kWires=new Set((r.interface.wires??[]).map(w=>w.id));
    const boxes=r.right.boxes.filter(b=>!kBoxes.has(b.id)).length-r.left.boxes.filter(b=>!kBoxes.has(b.id)).length;
    const wires=(r.right.wires??[]).filter(w=>!kWires.has(w.id)).length-(r.left.wires??[]).filter(w=>!kWires.has(w.id)).length;
    return {rule:r.id,delta:{boxes,wires},decreases:boxes<0||(boxes===0&&wires<0)};
  });
  return {ok:true as const,termination:measures.every(m=>m.decreases)?'established':'not-established',measure:'lexicographic (number of boxes, number of wires) in natural numbers',rules:measures,scope:'all successful applications of precisely these validated rules under the current injective deletion/fresh-creation conditions',confluence:{verdict:'not-established',reason:'No complete interface-aware critical-pair enumeration or confluence theorem is implemented.'},note:'Failure of this sufficient measure does not show nontermination.'};
}
export function trimRewrite(input:z.input<typeof TrimRewriteRequest>){
  const p=TrimRewriteRequest.safeParse(input);if(!p.success)return error(p.error);
  const applied=applyTrim(p.data.model,p.data);if(!applied.ok)return applied;
  const before=p.data.model,after=applied.model;
  const changed=<T extends{id:string}>(a:T[],b:T[])=>a.filter(x=>!b.some(y=>y.id===x.id&&canonical(y)===canonical(x)));
  const step:RewriteStep={delete:{boxes:changed(before.boxes,after.boxes).map(b=>b.id),wires:changed(before.wires,after.wires).map(w=>w.id),flows:changed(before.flows??[],after.flows??[]).map(f=>f.id)},add:{boxes:changed(after.boxes,before.boxes),wires:changed(after.wires,before.wires),flows:changed(after.flows??[],before.flows??[])}};
  const replay=rewrite(before,step);if(!replay.ok||normalized(replay.model)!==normalized(after))return fail([issue('internal-error','$','Explicit absorber-aware trim rewrite failed replay.','Report this model and absorber assignment.')]);
  return {...applied,rewrite:step,interface:{boxes:before.boxes.filter(b=>!step.delete!.boxes!.includes(b.id)).map(b=>b.id),wires:before.wires.filter(w=>!step.delete!.wires!.includes(w.id)).map(w=>w.id)},replayChecked:true,note:'Absorber choices and every rerouted function are explicit rewrite data. This establishes the named structural step, without a Kan-extension or physical-realizability claim.'};
}
