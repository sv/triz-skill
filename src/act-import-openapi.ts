import { MAX_DRAFT_ITEMS, sourceSizeOK, pointer, type DraftTable, type ImportDiagnostic, type ImportResult, type ImportSource, type Importer } from "./act-import.js";
import type { SourceLocation } from "./act-provenance.js";

type Obj = Record<string, unknown>;
const object = (x: unknown): x is Obj => x !== null && typeof x === "object" && !Array.isArray(x);
const refId = (s: string) => Buffer.from(JSON.stringify(s)).toString("base64url");
const METHODS = ["get","put","post","delete","options","head","patch","trace"];

/** JSON only: source text is parsed as data; no URL is fetched and no source is executed. */
export function importOpenApi(source: ImportSource): ImportResult {
  if (!source.id || !sourceSizeOK(source)) return {ok:false,errors:["Source id is required and text must be at most 1000000 UTF-8 bytes."]};
  try {
    const root: unknown = JSON.parse(source.text);
    if (!object(root) || typeof root.openapi !== "string" || !/^3\.(0|1)\./.test(root.openapi) || !object(root.paths)) throw new Error("OpenAPI must be a JSON document with an openapi 3.0/3.1 version and paths object.");
    const diagnostics:ImportDiagnostic[] = [], seenDiags = new Set<string>();
    const location = (p:string):SourceLocation => ({source:source.id,pointer:p});
    const diag = (code:string, p:string, message:string) => { const key = JSON.stringify([code,p]); if (!seenDiags.has(key)) {seenDiags.add(key);diagnostics.push({code,message,source:location(p)});} };
    const lookup = (ref:string): unknown => {
      if (ref === "#") return root;
      if (!ref.startsWith("#/")) return undefined;
      let decoded:string;
      try { decoded = decodeURIComponent(ref.slice(1)); } catch { return undefined; }
      let node:unknown = root;
      for (const raw of decoded.slice(1).split("/")) {
        if (/~(?![01])/.test(raw)) return undefined;
        const part = raw.replace(/~1/g,"/").replace(/~0/g,"~");
        if ((!object(node) && !Array.isArray(node)) || !Object.hasOwn(node,part)) return undefined;
        node = (node as Record<string,unknown>)[part];
      }
      return node;
    };
    // Traverse references as edges as well as ordinary JSON nodes. A grey node is a cycle;
    // every node is expanded once, preventing reference fanout from exploding work.
    const visited = new WeakSet<object>(), active = new WeakSet<object>();
    const stack:Array<{value:unknown;p:string;leave?:boolean}> = [{value:root,p:""}];
    let work = 0;
    while (stack.length) {
      if (++work > 200_000) throw new Error("OpenAPI document exceeds the traversal limit.");
      const {value,p,leave} = stack.pop()!;
      if (!value || typeof value !== "object") continue;
      if (leave) { active.delete(value); visited.add(value); continue; }
      if (active.has(value)) { diag("cyclic-ref",p,"A cyclic local reference is not expanded."); continue; }
      if (visited.has(value)) continue;
      active.add(value); stack.push({value,p,leave:true});
      if (object(value) && Object.hasOwn(value,"$ref")) {
        const ref = value.$ref;
        if (typeof ref !== "string" || (ref !== "#" && !ref.startsWith("#/"))) diag("external-ref",p + "/$ref","Only local JSON references are supported; this reference was not fetched.");
        else {
          const target = lookup(ref);
          if (target === undefined) diag("unresolved-ref",p + "/$ref","The local reference could not be resolved.");
          else { let targetPath = ""; try { targetPath = ref === "#" ? "" : decodeURIComponent(ref.slice(1)); } catch { /* lookup already rejected malformed fragments */ } stack.push({value:target,p:targetPath}); }
        }
      }
      for (const [key, child] of Object.entries(value)) if (child && typeof child === "object") stack.push({value:child,p:p + pointer(key)});
    }
    const deref = (raw:unknown,p:string):{value:Obj; path:string} | undefined => {
      let value = raw, path = p; const seen = new Set<object>();
      while (object(value) && Object.hasOwn(value,"$ref")) {
        if (seen.has(value)) {diag("cyclic-ref",p,"Cyclic reference cannot be expanded.");return undefined;}
        seen.add(value);
        if (typeof value.$ref !== "string" || (value.$ref !== "#" && !value.$ref.startsWith("#/"))) return undefined;
        path = value.$ref === "#" ? "" : decodeURIComponent(value.$ref.slice(1));
        value = lookup(value.$ref);
      }
      return object(value) ? {value,path} : undefined;
    };
    const rootLoc = location("");
    const draft:DraftTable = {domain:"software",components:[
      {id:"openapi:client",name:"API client",role:"environment",source:rootLoc},
      {id:"openapi:response",name:"API response",role:"product",source:rootLoc},
    ],interactions:[],draft:{pending:[
      {id:"openapi:review",kind:"assumption",description:"Review the extracted contract and any diagnostics; API descriptions do not establish interservice call edges.",source:rootLoc},
      {id:"openapi:client-role",kind:"role",description:"Review the proposed client role.",source:rootLoc},
      {id:"openapi:response-role",kind:"role",description:"Review the proposed response product role.",source:rootLoc},
    ]}};
    const add = (subject:string, action:string, target:string, loc:string, label:string) => {
      if (draft.interactions.length >= MAX_DRAFT_ITEMS) throw new Error("OpenAPI draft has too many interactions.");
      const n = draft.interactions.length, at = location(loc);
      draft.interactions.push({subject,action,object:target,carrier:{id:`openapi:carrier:${refId(JSON.stringify([loc,label]))}`,layer:"information",dimension:label},polarity:"useful",source:at});
      draft.draft.pending.push({id:`openapi:carrier:${n}`,kind:"carrier",description:`Review the proposed information carrier for ${label}.`,source:at},
        {id:`openapi:polarity:${n}`,kind:"polarity",description:`Review the proposed useful polarity for ${label}.`,source:at});
    };
    for (const [path, rawPath] of Object.entries(root.paths)) {
      const sourcePath = pointer("paths",path), resolvedPath = deref(rawPath,sourcePath);
      if (!resolvedPath) {diag("unsupported-path",sourcePath,"Path item could not be resolved and was omitted.");continue;}
      const pathItem = resolvedPath.value, pp = resolvedPath.path;
      for (const method of METHODS) {
        if (!Object.hasOwn(pathItem,method)) continue;
        const sourceOpPath = pp + pointer(method), resolvedOp = deref(pathItem[method],sourceOpPath);
        if (!resolvedOp) {diag("unsupported-operation",sourceOpPath,"Operation could not be resolved and was omitted.");continue;}
        const op = resolvedOp.value, opPath = resolvedOp.path;
        if (draft.components.length >= MAX_DRAFT_ITEMS) throw new Error("OpenAPI draft has too many components.");
        const id = `openapi:operation:${refId(`${method} ${path}`)}`, loc = location(opPath);
        draft.components.push({id,name:typeof op.operationId === "string" && op.operationId ? op.operationId : `${method.toUpperCase()} ${path}`,role:"tool",source:loc});
        draft.draft.pending.push({id:`openapi:role:${refId(id)}`,kind:"role",description:`Review the proposed tool role for ${method.toUpperCase()} ${path}.`,source:loc});
        // Operation-level parameters replace a path-level parameter with the same name and location.
        const parameters = new Map<string, {p:string; name:string; where:string}>();
        for (const [origin, params] of [[pp,pathItem.parameters],[opPath,op.parameters]] as const) {
          if (params === undefined) continue;
          if (!Array.isArray(params)) {diag("unsupported-parameters",origin + "/parameters","Parameters must be an array and were omitted.");continue;}
          params.forEach((raw,i) => {
            const p = origin + pointer("parameters",String(i)), item = deref(raw,p)?.value;
            if (!item || typeof item.name !== "string" || typeof item.in !== "string") {diag("unsupported-parameter",p,"Parameter could not be resolved or lacks name/in; omitted.");return;}
            parameters.set(JSON.stringify([item.in,item.name]), {p,name:item.name,where:item.in});
          });
        }
        for (const {p,name,where} of parameters.values()) add("openapi:client",`supply ${where} ${name}`,id,p,`${where} parameter ${name}`);
        if (op.requestBody !== undefined) {
          const rawBase = opPath + "/requestBody", resolvedBody = deref(op.requestBody,rawBase), body = resolvedBody?.value, base = resolvedBody?.path ?? rawBase;
          if (!body || !object(body.content)) diag("unsupported-request-body",base,"Request body could not be resolved or has no content; omitted.");
          else for (const mime of Object.keys(body.content)) add("openapi:client",`send ${mime}`,id,base + pointer("content",mime),`request ${mime}`);
        }
        if (!object(op.responses)) diag("unsupported-responses",opPath + "/responses","Responses are missing or unsupported.");
        else for (const [status,raw] of Object.entries(op.responses)) {
          const rawBase = opPath + pointer("responses",status), resolvedResponse = deref(raw,rawBase), response = resolvedResponse?.value, base = resolvedResponse?.path ?? rawBase;
          if (!response) {diag("unsupported-response",base,"Response could not be resolved and was omitted.");continue;}
          if (object(response.content)) for (const mime of Object.keys(response.content)) add(id,`return ${status} ${mime}`,"openapi:response",base + pointer("content",mime),`response ${status} ${mime}`);
        }
      }
    }
    // Diagnostics that indicate omitted or unsupported constructs must survive when the caller
    // keeps only the model. Each one becomes a separately reviewed assumption.
    for (const [i, d] of diagnostics.entries()) {
      if (draft.draft.pending.length >= MAX_DRAFT_ITEMS * 4) throw new Error("OpenAPI has too many review items.");
      draft.draft.pending.push({id:`openapi:diagnostic:${i}`,kind:"assumption",description:`${d.code}: ${d.message}`,source:d.source});
    }
    return {ok:true,draft,diagnostics};
  } catch(e) {return {ok:false,errors:[e instanceof Error ? e.message : "Invalid OpenAPI source."]};}
}
export const openApiImporter:Importer = {format:"openapi-json",parse:importOpenApi};
