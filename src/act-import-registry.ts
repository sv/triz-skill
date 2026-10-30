import { z } from "zod";
import { at, fail, issue } from "./act-issues.js";
import { BuildModelRequest, buildModel } from "./act-builder.js";
import { importBom } from "./act-import-bom.js";
import { importOpenApi } from "./act-import-openapi.js";
import { importQuint, importLean, importJulia } from "./act-import-code.js";
import { importModelingToolkitJson, importAgentsJson } from "./act-import-julia-export.js";
import { MAX_SOURCE_BYTES } from "./act-import.js";

export const ImportFormat = z.enum(["bom-csv", "bom-json", "openapi-json", "modelingtoolkit-json", "agents-json", "quint", "lean", "julia"]);
export const ImportSourceRequest = z.strictObject({
  format: ImportFormat,
  // Every UTF-16 code unit takes at least one UTF-8 byte, so a longer string is over the byte
  // limit too; the importers still measure the exact UTF-8 length.
  source: z.strictObject({id:z.string().min(1),text:z.string().max(MAX_SOURCE_BYTES).describe(`Source text, at most ${MAX_SOURCE_BYTES} UTF-8 bytes`)}),
});
export type ImportSourceRequest = z.infer<typeof ImportSourceRequest>;

/** Import supplied text only. The local-only transport decides how to obtain that text. */
export function importSource(input: ImportSourceRequest) {
  const parsed = ImportSourceRequest.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map(e => issue("invalid-argument", at("$",...e.path.map(String)), e.message, "Use a supported format and supply source id and text.")));
  const {format,source} = parsed.data;
  const imported = format === "bom-csv" ? importBom(source,"csv") : format === "bom-json" ? importBom(source,"json") : format === "openapi-json" ? importOpenApi(source) : format === "modelingtoolkit-json" ? importModelingToolkitJson(source) : format === "agents-json" ? importAgentsJson(source) : format === "quint" ? importQuint(source) : format === "lean" ? importLean(source) : importJulia(source);
  if (!imported.ok) return fail(imported.errors.map(message => issue("invalid-argument", "$.source.text", message, "Supply a supported local source document within the documented limits.")));
  const request = BuildModelRequest.safeParse(imported.draft);
  if (!request.success) return fail(request.error.issues.map(e => issue("invalid-argument", at("$.draft",...e.path.map(String)), e.message, "Correct the draft table before building.")));
  const built = buildModel(request.data);
  if (!built.ok) return built;
  return {...built, draft:imported.draft, diagnostics:imported.diagnostics};
}
