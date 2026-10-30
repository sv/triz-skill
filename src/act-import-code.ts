/** Bounded, static source outlines. These are not parsers, evaluators, or causal models. */
import { MAX_DRAFT_ITEMS, sourceSizeOK, type DraftTable, type ImportDiagnostic, type ImportResult, type ImportSource, type Importer } from "./act-import.js";

type Lang = "quint" | "lean" | "julia";
type Decl = { scope: string; name: string; kind: string; line: number; body: string; parts: Array<{text:string; line:number}>; excluded: Set<string> };
const token = /[A-Za-z_][A-Za-z0-9_']*/g;
const encode = (parts: string[]) => Buffer.from(JSON.stringify(parts)).toString("base64url");

/** Mask strings and nested block/line comments without changing newlines or offsets. */
function mask(text: string, lang: Lang): { text: string; unclosed: boolean } {
  const chars = text.split(""), out = [...chars];
  const blank = (i: number) => { if (chars[i] !== "\n" && chars[i] !== "\r") out[i] = " "; };
  const linePrefix = lang === "julia" ? "#" : lang === "lean" ? "--" : "//";
  const open = lang === "julia" ? "#=" : lang === "lean" ? "/-" : "/*";
  const close = lang === "julia" ? "=#" : lang === "lean" ? "-/" : "*/";
  let i = 0, depth = 0, quote = "", line = false, escaped = false;
  while (i < chars.length) {
    const two = text.slice(i, i + 2), three = text.slice(i, i + 3);
    if (line) { if (chars[i] === "\n") line = false; else blank(i); i++; continue; }
    if (depth) {
      if (two === open) { blank(i); blank(i + 1); depth++; i += 2; }
      else if (two === close) { blank(i); blank(i + 1); depth--; i += 2; }
      else { blank(i); i++; }
      continue;
    }
    if (quote) {
      if (!escaped && text.startsWith(quote, i)) { for (let j = 0; j < quote.length; j++) blank(i + j); i += quote.length; quote = ""; continue; }
      const c = chars[i]; blank(i); i++;
      if (escaped) escaped = false; else if (c === "\\") escaped = true;
      continue;
    }
    if (two === open) { blank(i); blank(i + 1); depth = 1; i += 2; continue; }
    if (text.startsWith(linePrefix, i)) { for (let j = 0; j < linePrefix.length; j++) blank(i + j); i += linePrefix.length; line = true; continue; }
    if (chars[i] === '"' || (lang === 'julia' && chars[i] === '`')) { quote = chars[i] === '`' ? '`' : three === '"""' ? '"""' : '"'; for (let j = 0; j < quote.length; j++) blank(i + j); i += quote.length; continue; }
    i++;
  }
  return { text: out.join(""), unclosed: depth > 0 || !!quote };
}
const braces = (line: string) => { let n = 0; for (const c of line) if (c === "{") n++; else if (c === "}") n--; return n; };
const names = (s: string) => [...s.matchAll(token)].map(m => m[0]);
const excludedNames = (header: string, body: string) => {
  const excluded = new Set<string>();
  // Parameter binders and local definitions shadow a global name. Ambiguous references are
  // suppressed instead of reporting a spurious edge to a global declaration.
  for (const m of header.matchAll(/\b([A-Za-z_]\w*)\s*:/g)) excluded.add(m[1]);
  for (const m of body.matchAll(/\b(?:let|nondet|val|var|have|fun)\s+([A-Za-z_]\w*)/g)) excluded.add(m[1]);
  return excluded;
};

type RawDiagnostic = { code: string; line: number; message: string };
function quint(lines: string[], ds: Decl[], diags: RawDiagnostic[]) {
  let module = "", depth = 0, current: Decl | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], m = l.match(/^\s*module\s+([A-Za-z_]\w*)\s*\{/);
    if (m && !module) { module = m[1]; depth = braces(l); current = undefined; if (/\{\s*\S/.test(l)) diags.push({code:"same-line-module",line:i+1,message:"Declarations on the module header line are not scanned."}); continue; }
    if (!module) continue;
    const d = depth === 1 ? l.match(/^\s*(?:(?:pure|temporal)\s+)?(var|const|type|val|def|action|run)\s+([A-Za-z_]\w*)\b/) : null;
    if (d) {
      const eq = l.indexOf("=", d[0].length); const header = eq < 0 ? l : l.slice(0, eq);
      current = {scope:module,name:d[2],kind:d[1],line:i+1,body:eq < 0 ? "" : l.slice(eq + 1),parts:eq < 0 ? [] : [{text:l.slice(eq + 1),line:i+1}],excluded:excludedNames(header, "")}; ds.push(current);
    } else if (current && depth >= 1) { current.body += `\n${l}`; current.parts.push({text:l,line:i+1}); }
    depth += braces(l);
    if (depth <= 0) { module = ""; current = undefined; depth = 0; }
  }
  if (module) diags.push({code:"unclosed-scope",line:lines.length,message:"Module braces do not close; the outline is partial."});
}

function lean(lines: string[], ds: Decl[], diags: RawDiagnostic[]) {
  const scopes: Array<{kind:string;name:string}> = []; let current: Decl | undefined, indent = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], scope = l.match(/^\s*(namespace|section)\s*([A-Za-z_][\w.]*)?\s*$/);
    if (scope) { scopes.push({kind:scope[1], name:scope[2] ?? ""}); current = undefined; continue; }
    if (/^\s*end(?:\s+[A-Za-z_][\w.]*)?\s*$/.test(l)) { if (scopes.length) scopes.pop(); current = undefined; continue; }
    const d = l.match(/^(\s*)(?:(?:private|protected|noncomputable|unsafe)\s+)*(def|abbrev|theorem|lemma|structure|inductive|class|opaque)\s+([A-Za-z_][\w']*)\b/);
    if (d) {
      if (current && d[1].length > indent) { diags.push({code:"nested-declaration",line:i+1,message:"An indented declaration inside another declaration was omitted."}); continue; }
      const eq = l.indexOf(":=", d[0].length); const header = eq < 0 ? l : l.slice(0, eq);
      const body = header.slice(d[0].length) + (eq < 0 ? "" : l.slice(eq+2));
      current = {scope:scopes.filter(s => s.kind === "namespace").map(s => s.name).filter(Boolean).join("."),name:d[3],kind:d[2],line:i+1,body,parts:[{text:body,line:i+1}],excluded:excludedNames(header, "")};
      ds.push(current); indent = d[1].length;
    } else if (current) { current.body += `\n${l}`; current.parts.push({text:l,line:i+1}); }
  }
}

function julia(lines: string[], ds: Decl[], diags: RawDiagnostic[]) {
  const start = lines.findIndex(l => /@variables\s+begin\b/.test(l));
  if (lines.some(l => /@agent\s+struct\b/.test(l))) diags.push({code:"unsupported-agent-model",line:lines.findIndex(l => /@agent\s+struct\b/.test(l))+1,message:"Agents.jl declarations and imperative transitions are not modeled."});
  if (start < 0) return;
  let fn = start;
  while (fn >= 0 && !/^\s*function\s+[A-Za-z_]\w*/.test(lines[fn])) fn--;
  if (fn < 0) { diags.push({code:"unsupported-scope",line:start+1,message:"A ModelingToolkit declaration outside a named function is unsupported."}); return; }
  const scope = lines[fn].match(/^\s*function\s+([A-Za-z_]\w*)/)![1];
  const end = lines.findIndex((l, i) => i > start && /\bODESystem\s*\(/.test(l));
  if (end < 0) { diags.push({code:"missing-odesystem",line:start+1,message:"No ODESystem call was found after the declarations."}); return; }
  let block: "variables" | "parameters" | "" = "", equation = false;
  const assignments = new Map<string, Decl>(), declared = new Map<string, Decl>();
  const add = (name: string, kind: string, line: number, body = "") => {
    const d: Decl = {scope,name,kind,line,body,parts:body ? [{text:body,line}] : [],excluded:new Set()}; ds.push(d); declared.set(name,d); return d;
  };
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (/^\s*@variables\s+begin\b/.test(line)) { block = "variables"; continue; }
    if (/^\s*@parameters\s+begin\b/.test(line)) { block = "parameters"; continue; }
    if (block) {
      if (/^\s*end\s*$/.test(line)) { block = ""; continue; }
      const m = block === "variables" ? line.match(/^\s*([A-Za-z_]\w*)\s*\(\s*t\s*\)/) : line.match(/^\s*([A-Za-z_]\w*)\s*(?:=|$)/);
      if (m) add(m[1],block,i+1); else if (line.trim()) diags.push({code:"unsupported-declaration",line:i+1,message:`Unrecognized ${block} declaration omitted.`});
      continue;
    }
    if (/^\s*eqs\s*=\s*\[/.test(line)) { equation = true; continue; }
    if (equation) {
      if (/^\s*\]/.test(line)) { equation = false; continue; }
      const e = line.match(/^\s*D\s*\(\s*([A-Za-z_]\w*)\s*\)\s*~\s*(.*)$/);
      if (e) {
        const d = declared.get(e[1]);
        if (d) { d.body += `\n${e[2]}`; d.parts.push({text:e[2],line:i+1}); }
        else diags.push({code:"unknown-equation-state",line:i+1,message:"A differential equation names an undeclared state."});
      } else if (line.trim()) diags.push({code:"unsupported-equation",line:i+1,message:"Equation form or multiline continuation is not recognized."});
      continue;
    }
    if (/^\s*(if|elseif|else|for|while|try|catch)\b/.test(line)) diags.push({code:"conditional-code",line:i+1,message:"Conditional or iterative code is not evaluated; references are candidates across paths."});
    const m = line.match(/^\s*([A-Za-z_]\w*)\s*(\+=|-=|\*=|\/=|=(?!=|>))\s*(.*)$/);
    if (!m || ["u0", "eqs"].includes(m[1])) continue;
    const existing = assignments.get(m[1]);
    if (existing || declared.has(m[1])) {
      diags.push({code:"reassignment",line:i+1,message:`'${m[1]}' is reassigned or conditionally updated; no branch is selected.`});
      if (existing) { existing.body += `\n${m[3]}`; existing.parts.push({text:m[3],line:i+1}); }
      continue;
    }
    const d = add(m[1],"auxiliary",i+1,m[3]); assignments.set(m[1],d);
    let balance = [...m[3]].reduce((n,c) => n + ("([".includes(c) ? 1 : ")]".includes(c) ? -1 : 0),0);
    while (balance > 0 && i + 1 < end) { const next=lines[++i]; d.body += `\n${next}`; d.parts.push({text:next,line:i+1}); balance += [...next].reduce((n,c) => n + ("([".includes(c) ? 1 : ")]".includes(c) ? -1 : 0),0); }
  }
  // Record the call graph of named, top-level helper functions, without evaluating them.
  // Their formal parameters and locals do not refer to the main function's local symbols.
  const helpers = new Map<string, { line:number; body:string; parts:Array<{text:string;line:number}>; excluded:Set<string> }>(), ambiguousHelpers = new Set<string>();
  for (let i = 0; i < fn; i++) {
    const m = lines[i].match(/^(\s*)function\s+([A-Za-z_]\w*)\s*\((.*)$/);
    if (!m) continue;
    const name = m[2], startLine = i + 1, header = [m[3]];
    while (!header.join(" ").includes(")") && i + 1 < fn) header.push(lines[++i]);
    const args = header.join(" ").split(")")[0].split(",").map(x => x.trim().match(/^([A-Za-z_]\w*)/)?.[1]).filter((x): x is string => !!x);
    const excluded = new Set(args), parts:Array<{text:string;line:number}> = [];
    while (i + 1 < fn) {
      const line = lines[++i];
      if (line.trimEnd() === `${m[1]}end`) break;
      const local = line.match(/^\s*([A-Za-z_]\w*)\s*=(?!=|>)/); if (local) excluded.add(local[1]);
      parts.push({text:line,line:i+1});
    }
    if (helpers.has(name) || ambiguousHelpers.has(name)) { diags.push({code:"ambiguous-helper",line:startLine,message:`Helper '${name}' has multiple definitions; its body is not expanded.`}); helpers.delete(name); ambiguousHelpers.add(name); continue; }
    helpers.set(name,{line:startLine,body:parts.map(p => p.text).join("\n"),parts,excluded});
  }
  const pending = ds.flatMap(d => names(d.body)), seen = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    const name = pending[i], helper = helpers.get(name);
    if (!helper || seen.has(name) || declared.has(name)) continue;
    seen.add(name);
    const d = add(name,"helper",helper.line,helper.body);
    d.parts = helper.parts; d.excluded = helper.excluded;
    pending.push(...names(helper.body));
    diags.push({code:"opaque-helper",line:helper.line,message:`Helper '${name}' is syntactically outlined; its behavior was not evaluated.`});
  }
  diags.push({code:"partial-julia",line:start+1,message:"Only the first ModelingToolkit variables/parameters, assignments and explicit differential equations are outlined; helpers and control flow are not evaluated."});
}

function importCode(source: ImportSource, lang: Lang): ImportResult {
  if (!source.id || !sourceSizeOK(source)) return {ok:false,errors:["Source id is required and text must be at most 1000000 UTF-8 bytes."]};
  try {
    const clean = mask(source.text,lang), lines = clean.text.split("\n"), declarations:Decl[] = [], raw:RawDiagnostic[] = [];
    if (clean.unclosed) raw.push({code:"unclosed-comment-or-string",line:lines.length,message:"An unterminated string or comment was masked; the outline is partial."});
    if (lang === "quint") quint(lines,declarations,raw);
    else if (lang === "lean") lean(lines,declarations,raw);
    else julia(lines,declarations,raw);
    if (!declarations.length) return {ok:false,errors:[`No supported ${lang} declarations found; the source is outside this importer's partial syntax.`, ...raw.filter(d => d.code === "unsupported-agent-model").map(d => d.message)]};
    if (declarations.length > MAX_DRAFT_ITEMS || raw.length > MAX_DRAFT_ITEMS) throw new Error("Source outline exceeds the 2000-item limit.");
    const loc = (line:number) => ({source:source.id,line});
    const draft:DraftTable = {domain:"software",components:[],interactions:[],draft:{pending:[]}};
    const diagnostics:ImportDiagnostic[] = [];
    const diag = (d:RawDiagnostic) => {
      if (diagnostics.some(x => x.code === d.code && x.source.line === d.line)) return;
      if (diagnostics.length >= MAX_DRAFT_ITEMS) throw new Error("Source diagnostics exceed the 2000-item limit.");
      const at = loc(d.line), n = diagnostics.length;
      diagnostics.push({code:d.code,message:d.message,source:at});
      draft.draft.pending.push({id:`${lang}:diagnostic:${n}`,kind:"assumption",description:`Review source limitation: ${d.message}`,source:at});
    };
    diag({code:"partial-source",line:1,message:"Static syntactic outline only: imports, execution, types, proof validity and causal meaning are not checked."});
    raw.forEach(diag);
    const byScope = new Map<string,Map<string,Decl>>(), ambiguous = new Set<string>();
    const id = (d:Decl) => `${lang}:symbol:${encode([d.scope,d.name])}`;
    const key = (d:Decl) => JSON.stringify([d.scope,d.name]);
    for (const d of declarations) {
      let scope = byScope.get(d.scope); if (!scope) {scope = new Map(); byScope.set(d.scope,scope);}
      if (scope.has(d.name)) {ambiguous.add(key(d)); diag({code:"ambiguous-declaration",line:d.line,message:`Multiple declarations of '${d.name}' in this scope; references are not resolved.`});continue;}
      scope.set(d.name,d);
      const sourceLocation = loc(d.line), component = id(d);
      draft.components.push({id:component,name:d.name,role:"tool",source:sourceLocation});
      draft.draft.pending.push({id:`${component}:role`,kind:"role",description:`Review the proposed role for the ${d.kind} declaration '${d.name}'; source declarations do not establish TRIZ roles.`,source:sourceLocation});
    }
    const emitted = new Set<string>();
    for (const d of declarations) {
      if (ambiguous.has(key(d))) continue;
      const scope = byScope.get(d.scope)!;
      const excluded = new Set([...d.excluded,...excludedNames("",d.body)]);
      for (const part of d.parts) for (const symbol of names(part.text)) {
        const dependency = scope.get(symbol);
        if (!dependency || symbol === d.name || excluded.has(symbol) || ambiguous.has(key(dependency)) || (d.kind === "helper" && dependency.kind !== "helper")) continue;
        const edgeKey = JSON.stringify([id(d),id(dependency)]);
        if (emitted.has(edgeKey)) continue;
        if (draft.components.length + draft.interactions.length >= MAX_DRAFT_ITEMS) throw new Error("Source outline exceeds the 2000-item limit.");
        emitted.add(edgeKey);
        const at = loc(part.line), edge = encode([d.scope,d.name,dependency.name]);
        draft.interactions.push({subject:id(d),action:"references",object:id(dependency),carrier:{id:`${lang}:reference:${edge}`,layer:"information",dimension:"unverified symbolic reference"},polarity:"useful",source:at});
        draft.draft.pending.push(
          {id:`${lang}:edge:${edge}:action`,kind:"assumption",description:"This syntactic reference is not a verified causal function; review its direction and action.",source:at},
          {id:`${lang}:edge:${edge}:carrier`,kind:"carrier",description:"Information and the symbolic reference dimension are placeholders; review the carrier and layer.",source:at},
          {id:`${lang}:edge:${edge}:polarity`,kind:"polarity",description:"Useful is a placeholder; the source reference does not establish polarity.",source:at},
        );
      }
    }
    if (draft.draft.pending.length > MAX_DRAFT_ITEMS*4) throw new Error("Source review items exceed the 8000-item limit.");
    return {ok:true,draft,diagnostics};
  } catch (e) { return {ok:false,errors:[e instanceof Error ? e.message : "Source could not be outlined."]}; }
}
export const importQuint = (source:ImportSource):ImportResult => importCode(source,"quint");
export const importLean = (source:ImportSource):ImportResult => importCode(source,"lean");
export const importJulia = (source:ImportSource):ImportResult => importCode(source,"julia");
export const quintImporter:Importer = {format:"quint",parse:importQuint};
export const leanImporter:Importer = {format:"lean",parse:importLean};
export const juliaImporter:Importer = {format:"julia",parse:importJulia};
