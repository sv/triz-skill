import { MAX_DRAFT_ITEMS, sourceSizeOK, type DraftTable, type ImportResult, type ImportSource, type Importer, pointer } from "./act-import.js";
import type { SourceLocation } from "./act-provenance.js";

type Item = {id:string;name:string;parent?:string;source:SourceLocation};

/** RFC 4180-style CSV fields, including escaped quotes and embedded newlines. A leading UTF-8
 * byte order mark (as spreadsheet exports write it) is not data, and a blank line is no record:
 * a BOM row needs at least the id and name columns. Line numbers count every physical line. */
function csvRows(text: string): Array<{fields:string[];line:number}> {
  const rows: Array<{fields:string[];line:number}> = [];
  let fields:string[] = [], field = "", line = 1, start = 1, quoted = false, closed = false;
  const fieldEnd = () => { fields.push(field); field = ""; closed = false; };
  const rowEnd = () => {
    const blank = !fields.length && !field && !closed;
    fieldEnd(); if (!blank) rows.push({fields,line:start});
    if (rows.length > MAX_DRAFT_ITEMS + 1) throw new Error("Too many BOM items."); fields = []; start = line;
  };
  for (let i = text.startsWith("﻿") ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else { field += c; if (c === "\n") line++; }
    } else if (c === '"') {
      if (field || closed) throw new Error(`Unexpected quote on line ${line}`);
      quoted = true;
    } else if (c === ",") fieldEnd();
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i+1] === "\n") i++; line++; rowEnd(); }
    else { if (closed) throw new Error(`Unexpected character after quoted field on line ${line}`); field += c; }
  }
  if (quoted) throw new Error(`Unclosed quoted field on line ${start}`);
  if (field || fields.length || closed) rowEnd();
  return rows;
}

export function importBom(source: ImportSource, format: "csv" | "json"): ImportResult {
  if (!source.id || !sourceSizeOK(source)) return {ok:false,errors:["Source id is required and text must be at most 1000000 UTF-8 bytes."]};
  let items: Item[];
  try {
    if (format === "csv") {
      const rows = csvRows(source.text);
      const header = rows.shift()?.fields;
      if (!header || new Set(header).size !== header.length || !header.includes("id") || !header.includes("name") || header.some(h => !["id","name","parent_id"].includes(h))) throw new Error("CSV header must contain id,name and optional parent_id, each once.");
      if (rows.length > MAX_DRAFT_ITEMS) throw new Error("Too many BOM items.");
      items = rows.map(({fields,line}) => {
        if (fields.length !== header.length) throw new Error(`Wrong field count on line ${line}.`);
        const get = (key:string) => fields[header.indexOf(key)] ?? "";
        return {id:get("id"),name:get("name"),...(get("parent_id") ? {parent:get("parent_id")} : {}),source:{source:source.id,line}};
      });
    } else {
      const data:unknown = JSON.parse(source.text);
      const array = Array.isArray(data) ? data : data && typeof data === "object" && Object.hasOwn(data,"items") ? (data as {items:unknown}).items : undefined;
      if (!Array.isArray(array) || array.length > MAX_DRAFT_ITEMS) throw new Error("BOM JSON must be an array or an object with an items array within the item cap.");
      const prefix = Array.isArray(data) ? [] : ["items"];
      items = array.map((raw:unknown,i:number) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Item ${i} must be an object.`);
        const r = raw as Record<string,unknown>;
        if (Object.keys(r).some(k => !["id","name","parent_id"].includes(k)) || typeof r.id !== "string" || typeof r.name !== "string" || (r.parent_id !== undefined && typeof r.parent_id !== "string")) throw new Error(`Invalid BOM item ${i}: use id, name and optional parent_id strings.`);
        return {id:r.id,name:r.name,...(r.parent_id ? {parent:r.parent_id as string}:{}),source:{source:source.id,pointer:pointer(...prefix,String(i))}};
      });
    }
    if (items.some(x => !x.id.trim() || !x.name.trim())) throw new Error("Each BOM item needs a nonempty id and name.");
    const ids = new Set(items.map(i => i.id));
    if (ids.size !== items.length) throw new Error("BOM item ids must be unique.");
    if (items.some(i => i.parent && !ids.has(i.parent))) throw new Error("Each BOM parent_id must name an existing item.");
    if (items.some(i => i.parent === i.id)) throw new Error("A BOM item cannot be its own parent.");
    const parentOf = new Map(items.map(i => [i.id, i.parent]));
    const done = new Set<string>();
    for (const item of items) {
      const active = new Set<string>();
      let id: string | undefined = item.id;
      while (id !== undefined && !done.has(id)) {
        if (active.has(id)) throw new Error("BOM parent hierarchy contains a cycle.");
        active.add(id); id = parentOf.get(id);
      }
      for (const visited of active) done.add(visited);
    }
    const draft:DraftTable = {domain:"physical", components:items.map(i => ({id:i.id,name:i.name,role:"tool",source:i.source})), interactions:[],
      hierarchy:items.flatMap(i => i.parent ? [{parent:i.parent,child:i.id,source:i.source}] : []),
      draft:{pending:[{id:"bom:interactions",kind:"assumption",description:"Containment is not a function; review and add interactions, carriers and polarities as appropriate.",source:format === "csv" ? {source:source.id,line:1} : {source:source.id,pointer:""}},
        ...items.map((i,n) => ({id:`bom:role:${n}`,kind:"role" as const,description:`Review the proposed role 'tool' for '${i.id}'.`,source:i.source}))]}};
    return {ok:true,draft,diagnostics:[]};
  } catch (e) { return {ok:false,errors:[e instanceof Error ? e.message : "Invalid BOM source."]}; }
}
export const bomCsvImporter: Importer = {format:"bom-csv",parse:source => importBom(source,"csv")};
export const bomJsonImporter: Importer = {format:"bom-json",parse:source => importBom(source,"json")};
