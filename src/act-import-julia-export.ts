/** Data-only TRIZ interchange adapters. No Julia code, modules or source paths are evaluated. */
import { z } from "zod";
import { MAX_DRAFT_ITEMS, sourceSizeOK, pointer, type DraftTable, type ImportDiagnostic, type ImportResult, type ImportSource, type Importer } from "./act-import.js";
const Id = z.string().min(1);
const Strings = z.array(Id).max(MAX_DRAFT_ITEMS);
const Diagnostic = z.strictObject({code:Id,section:Id,index:z.number().int().nonnegative(),message:Id});
const Equation = z.strictObject({lhs:Id,rhs:Id,lhs_refs:Strings,rhs_refs:Strings});
const Common = {version:z.literal(1),model_id:Id,profile_id:Id,diagnostics:z.array(Diagnostic).max(MAX_DRAFT_ITEMS)};
export const ModelingToolkitInterchange = z.strictObject({format:z.literal("triz-modelingtoolkit"),...Common,
  unknowns:Strings,parameters:Strings,equations:z.array(Equation).max(MAX_DRAFT_ITEMS),observed:z.array(Equation).max(MAX_DRAFT_ITEMS),subsystems:z.array(z.strictObject({path:z.array(Id).min(1).max(64)})).max(MAX_DRAFT_ITEMS).default([])});
export const AgentsInterchange = z.strictObject({format:z.literal("triz-agents-snapshot"),...Common,
  agent_types:z.array(z.strictObject({name:Id,count:z.number().int().positive().safe(),fields:Strings})).max(MAX_DRAFT_ITEMS)});
const encode = (...parts:string[]) => Buffer.from(JSON.stringify(parts)).toString("base64url");

function parse<T extends z.ZodType>(source:ImportSource,schema:T): {ok:true;value:z.output<T>} | {ok:false;errors:string[]} {
  if (!source.id || !sourceSizeOK(source)) return {ok:false,errors:["Source id is required and text must be at most 1000000 UTF-8 bytes."]};
  try {
    const r=schema.safeParse(JSON.parse(source.text));
    return r.success ? {ok:true,value:r.data} : {ok:false,errors:["Invalid versioned TRIZ Julia interchange: " + r.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join("; ")]};
  } catch { return {ok:false,errors:["Julia interchange must be valid JSON data."]}; }
}
function context(source:ImportSource,format:string,model:string,profile:string) {
  const draft:DraftTable={domain:"software",system:model,components:[],interactions:[],draft:{pending:[]}};
  const diagnostics:ImportDiagnostic[]=[];
  const loc=(p:string)=>({source:source.id,pointer:p});
  const diag=(code:string,path:string,message:string)=>{
    if(diagnostics.length >= MAX_DRAFT_ITEMS) throw new Error("Interchange diagnostics exceed the 2000-item cap.");
    const source=loc(path), id=`${format}:diagnostic:${diagnostics.length}`;
    diagnostics.push({code,message,source});draft.draft.pending.push({id,kind:"assumption",description:message,source});
  };
  const component=(id:string,name:string,path:string,detail:string)=>{
    if(draft.components.length+draft.interactions.length>=MAX_DRAFT_ITEMS) throw new Error("Interchange exceeds the 2000-item cap.");
    const source=loc(path); draft.components.push({id,name,role:"tool",source});
    draft.draft.pending.push({id:`${format}:role:${encode(id)}`,kind:"role",description:`Review the proposed role for ${detail}; a symbolic declaration is not a TRIZ component.`,source});
  };
  diag("interchange-coverage","",`Profile '${profile}' of model '${model}' is imported as syntactic metadata. Review all inferred meanings; export is not proof of execution, causality, or physical truth.`);
  return {draft,diagnostics,loc,diag,component};
}

/** ModelingToolkit's symbolic reference arrays are data: their interpretation needs review. */
export function importModelingToolkitJson(source:ImportSource):ImportResult {
  const parsed=parse(source,ModelingToolkitInterchange); if(!parsed.ok)return parsed;
  const data=parsed.value;
  try {
    const total = data.unknowns.length + data.parameters.length + data.equations.length + data.observed.length + data.subsystems.length + data.diagnostics.length + [...data.equations,...data.observed].reduce((n,e)=>n+e.lhs_refs.length+e.rhs_refs.length,0);
    if(total>MAX_DRAFT_ITEMS)throw new Error("Interchange exceeds the 2000-item cap, including references and diagnostics.");
    const c=context(source,"mtk",data.model_id,data.profile_id), symbols=new Map<string,string>();
    for (const group of ["unknowns","parameters"] as const) data[group].forEach((name,i)=>{
      if(symbols.has(name))throw new Error(`Duplicate symbolic identifier '${name}' in the interchange.`);
      const id=`mtk:symbol:${encode(group,name)}`;symbols.set(name,id);c.component(id,name,pointer(group,String(i)),`${group} '${name}'`);
    });
    // ModelingToolkit exposes observed equations separately; when the LHS is itself one
    // symbolic variable, it is an observed declaration even if not an unknown or parameter.
    const observedNames = new Set<string>();
    data.observed.forEach((eq,i)=>{
      if(eq.lhs_refs.length !== 1 || eq.lhs_refs[0] !== eq.lhs)return;
      if(observedNames.has(eq.lhs))throw new Error(`Duplicate observed symbolic identifier '${eq.lhs}'.`);
      observedNames.add(eq.lhs);
      if(symbols.has(eq.lhs))return;
      const id=`mtk:symbol:${encode("observed",eq.lhs)}`;symbols.set(eq.lhs,id);
      c.component(id,eq.lhs,pointer("observed",String(i),"lhs"),`observed symbol '${eq.lhs}'`);
    });
    if (data.subsystems.length) {
      const root=`mtk:system:${encode(data.model_id)}`, nodes=new Map<string,string>();
      c.component(root,data.model_id,"/model_id",`exported system '${data.model_id}'`);c.draft.hierarchy=[];
      data.subsystems.forEach(({path},i)=>{
        const key=JSON.stringify(path);if(nodes.has(key))throw new Error("Duplicate subsystem path.");
        const id=`mtk:subsystem:${encode(...path)}`;nodes.set(key,id);
        c.component(id,path[path.length-1],pointer("subsystems",String(i)),`subsystem '${path.join(" / ")}'`);
      });
      data.subsystems.forEach(({path},i)=>{
        const parent=path.length===1 ? root : nodes.get(JSON.stringify(path.slice(0,-1)));
        if(!parent)throw new Error("Subsystem path is missing its declared parent.");
        c.draft.hierarchy!.push({parent,child:nodes.get(JSON.stringify(path))!,source:c.loc(pointer("subsystems",String(i)))});
      });
    }
    for(const group of ["equations","observed"] as const) data[group].forEach((eq,i)=>{
      const node=`mtk:equation:${encode(group,String(i))}`,base=pointer(group,String(i));
      c.component(node,`${eq.lhs} ~ ${eq.rhs}`,base,`${group} equation ${i+1}`);
      for(const side of ["lhs_refs","rhs_refs"] as const) eq[side].forEach((name,k)=>{
        const path=base+pointer(side,String(k)),target=symbols.get(name);
        if(!target) {c.diag("unresolved-symbol",path,`Symbol '${name}' is absent from exported unknowns and parameters; its meaning is unresolved.`);return;}
        if(c.draft.components.length+c.draft.interactions.length>=MAX_DRAFT_ITEMS)throw new Error("Interchange exceeds the 2000-item cap.");
        const edge=encode(group,String(i),side,String(k),name),at=c.loc(path);
        c.draft.interactions.push({subject:node,action:"references",object:target,carrier:{id:`mtk:reference:${edge}`,layer:"information",dimension:"unverified symbolic reference"},polarity:"useful",source:at});
        c.draft.draft.pending.push(
          {id:`mtk:action:${edge}`,kind:"assumption",description:"Equation occurrence is a symbolic reference, not a verified causal action.",source:at},
          {id:`mtk:carrier:${edge}`,kind:"carrier",description:"Information and symbolic reference are placeholders; review carrier and layer.",source:at},
          {id:`mtk:polarity:${edge}`,kind:"polarity",description:"Useful is a placeholder; symbolic equations do not determine TRIZ polarity.",source:at});
      });
    });
    data.diagnostics.forEach((d,i)=>c.diag(d.code,pointer("diagnostics",String(i)),d.message));
    if(c.draft.draft.pending.length>MAX_DRAFT_ITEMS*4)throw new Error("Interchange exceeds the review-item cap.");
    return {ok:true,draft:c.draft,diagnostics:c.diagnostics};
  } catch(e) {return {ok:false,errors:[e instanceof Error?e.message:"Invalid ModelingToolkit interchange."]};}
}

/** Agent type/field structure is a snapshot, not an export of rules or interactions. */
export function importAgentsJson(source:ImportSource):ImportResult {
  const parsed=parse(source,AgentsInterchange); if(!parsed.ok)return parsed;
  const data=parsed.value;
  try {
    if(data.agent_types.length+data.agent_types.reduce((n,x)=>n+x.fields.length,0)+data.diagnostics.length>MAX_DRAFT_ITEMS)throw new Error("Agent snapshot exceeds the 2000-item cap.");
    const c=context(source,"agents",data.model_id,data.profile_id),seen=new Set<string>();
    c.diag("snapshot-not-behavior","/agent_types","Current agent structure is a snapshot; step rules, schedules, and interaction behavior are not exported.");
    c.draft.hierarchy=[];
    data.agent_types.forEach((type,i)=>{
      if(seen.has(type.name))throw new Error(`Duplicate agent type '${type.name}'.`);seen.add(type.name);
      const base=pointer("agent_types",String(i)),id=`agents:type:${encode(type.name)}`;
      c.component(id,type.name,base,`agent type '${type.name}' (observed count ${type.count})`);
      const fields=new Set<string>();
      type.fields.forEach((field,j)=>{
        if(fields.has(field))throw new Error(`Duplicate field '${field}' in agent type '${type.name}'.`);fields.add(field);
        const fid=`agents:field:${encode(type.name,field)}`,path=base+pointer("fields",String(j));
        c.component(fid,field,path,`agent field '${type.name}.${field}'`);
        c.draft.hierarchy!.push({parent:id,child:fid,source:c.loc(path)});
      });
    });
    data.diagnostics.forEach((d,i)=>c.diag(d.code,pointer("diagnostics",String(i)),d.message));
    if(c.draft.draft.pending.length>MAX_DRAFT_ITEMS*4)throw new Error("Interchange exceeds the review-item cap.");
    return {ok:true,draft:c.draft,diagnostics:c.diagnostics};
  } catch(e) {return {ok:false,errors:[e instanceof Error?e.message:"Invalid agent snapshot interchange."]};}
}
export const modelingToolkitJsonImporter:Importer={format:"modelingtoolkit-json",parse:importModelingToolkitJson};
export const agentsJsonImporter:Importer={format:"agents-json",parse:importAgentsJson};
