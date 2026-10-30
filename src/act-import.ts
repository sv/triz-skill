import { z } from "zod";
import { Carrier, Polarity, Role } from "./act.js";
import { Pending, SourceLocation } from "./act-provenance.js";

export const MAX_SOURCE_BYTES = 1_000_000;
export const MAX_DRAFT_ITEMS = 2_000;
const Id = z.string().min(1);
export const DraftTable = z.strictObject({
  domain: z.enum(["physical", "software", "business", "cyber-physical"]), system: z.string().optional(),
  components: z.array(z.strictObject({id:Id,name:Id,role:Role,source:SourceLocation})).max(MAX_DRAFT_ITEMS),
  interactions: z.array(z.strictObject({subject:Id,action:Id,object:Id,carrier:Carrier,polarity:Polarity,source:SourceLocation})).max(MAX_DRAFT_ITEMS),
  hierarchy: z.array(z.strictObject({parent:Id,child:Id,source:SourceLocation})).max(MAX_DRAFT_ITEMS).optional(),
  draft: z.strictObject({pending:z.array(Pending).max(MAX_DRAFT_ITEMS * 4)}),
});
export type DraftTable = z.infer<typeof DraftTable>;
export type ImportSource = {id:string; text:string};
export type ImportDiagnostic = {code:string; message:string; source:SourceLocation};
export type ImportResult = {ok:true; draft:DraftTable; diagnostics:ImportDiagnostic[]} | {ok:false; errors:string[]};
export interface Importer { format: string; parse(source: ImportSource): ImportResult }
export const sourceSizeOK = (source: ImportSource) => Buffer.byteLength(source.text,"utf8") <= MAX_SOURCE_BYTES;
/** Escape one segment of an RFC 6901 JSON pointer. */
export const pointer = (...parts: string[]) => parts.map(p => "/" + p.replace(/~/g,"~0").replace(/\//g,"~1")).join("");
