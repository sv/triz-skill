#!/usr/bin/env -S npx tsx
/**
 * Import an attributed TRIZ contradiction matrix and regenerate matrix.json.
 * Run where outbound network is open, or point at a local CSV/JSON export.
 *
 *   npx tsx scripts/import-matrix.mjs <url|file> [--format csv|json]
 *
 * Sources (verify license before committing bulk data):
 *   - https://www.triz40.com/aff_Matrix_TRIZ.php   (full public 39x39 matrix)
 *   - InnovateTRIZ / AutoTRIZ repos (JSON exports)
 *   - any local CSV: rows=improving 1..39, cols=worsening 1..39, cell=principle ids
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvMatrix, parseJsonMatrix, validate, merge } from "../src/import.js";
import { resolveDataDir } from "../src/data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readSource(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src} → HTTP ${res.status}`);
    return res.text();
  }
  return fs.readFileSync(src, "utf8");
}

async function main() {
  const [src, ...rest] = process.argv.slice(2);
  if (!src) { console.error("usage: import-matrix.mjs <url|file> [--format csv|json]"); process.exit(2); }
  const fmt = rest.includes("--format") ? rest[rest.indexOf("--format") + 1] : (src.endsWith(".json") ? "json" : "csv");

  const raw = await readSource(src);
  const imported = fmt === "json" ? parseJsonMatrix(JSON.parse(raw)) : parseCsvMatrix(raw);
  const v = validate(imported);
  if (!v.ok) { console.error("invalid matrix:", v.errors); process.exit(1); }

  const dataDir = resolveDataDir();
  const matrixPath = path.join(dataDir, "matrix.json");
  const existing = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  const merged = merge(imported);
  const out = {
    _meta: {
      ...existing._meta,
      coverage: "canonical imported matrix",
      imported_from: src,
      imported_cells: v.count,
      note: "Canonical cells imported from the attributed source. Project-specific overlays are intentionally excluded. Regenerate with scripts/import-matrix.mjs.",
    },
    cells: Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))),
  };
  fs.writeFileSync(matrixPath, JSON.stringify(out, null, 2) + "\n");
  console.error(`wrote ${matrixPath}: ${Object.keys(merged).length} imported cells`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
