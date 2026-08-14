/**
 * Reuse OPEN TRIZ contradiction-matrix data.
 *
 * The 39 parameters and 40 principles are already vendored. The 39x39 matrix
 * cell contents are imported from an attributed source. This module parses a
 * machine-readable matrix (CSV or JSON) and can merge an explicit overlay.
 *
 * Pure functions here; the CLI is scripts/import-matrix.mjs. Kept pure so the
 * parse/validate/merge logic is unit-tested (tests/import.test.ts) even though
 * the fetch itself needs open network (blocked in some sandboxes).
 *
 * Accepted machine-readable sources, e.g.:
 *   - CSV: rows = improving 1..39, cols = worsening 1..39, cell = space/;/,-separated principle ids
 *   - JSON: { "cells": { "i-w": [p,...] } }  or  { "i-w": [p,...] }
 */

import type { MatrixCell } from "./data.js";

export type ImportedCells = Record<string, number[]>;

/** Parse the common TRIZ matrix CSV: header row of worsening ids, first col improving id. */
export function parseCsvMatrix(text: string): ImportedCells {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(/[,\t]/).map((c) => c.trim()));
  if (rows.length < 2) throw new Error("csv: need a header row + at least one data row");
  const header = rows[0].slice(1).map((h) => Number(h.replace(/[^0-9]/g, "")));
  const out: ImportedCells = {};
  for (const row of rows.slice(1)) {
    const imp = Number(row[0].replace(/[^0-9]/g, ""));
    if (!Number.isInteger(imp)) continue;
    row.slice(1).forEach((cell, i) => {
      const wor = header[i];
      const ps = cell.split(/[;\s]+/).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 40);
      if (imp !== wor && ps.length) out[`${imp}-${wor}`] = ps;
    });
  }
  return out;
}

/** Parse a JSON matrix: {cells:{"i-w":[...]}} or flat {"i-w":[...]}. */
export function parseJsonMatrix(obj: unknown): ImportedCells {
  const src = (obj && typeof obj === "object" && "cells" in (obj as any)) ? (obj as any).cells : obj;
  const out: ImportedCells = {};
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (!/^\d+-\d+$/.test(k)) continue;
    const ps = (Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 40);
    if (ps.length) out[k] = ps;
  }
  return out;
}

/** Structural sanity: keys are i-w with 1..39 params, principles 1..40, matrix non-empty. */
export function validate(cells: ImportedCells): { ok: boolean; count: number; errors: string[] } {
  const errors: string[] = [];
  const keys = Object.keys(cells);
  if (!keys.length) errors.push("empty matrix");
  for (const k of keys) {
    const [i, w] = k.split("-").map(Number);
    if (!(i >= 1 && i <= 39 && w >= 1 && w <= 39)) errors.push(`bad params: ${k}`);
    if (cells[k].some((p) => p < 1 || p > 40)) errors.push(`bad principle in ${k}`);
    if (errors.length > 8) break;
  }
  return { ok: errors.length === 0, count: keys.length, errors };
}

/**
 * Merge imported Altshuller cells with an explicit optional overlay.
 * Overlay cells keep their metadata and win on conflict.
 */
export function merge(
  imported: ImportedCells,
  overlayCells: Record<string, MatrixCell> = {},
): Record<string, MatrixCell> {
  const out: Record<string, MatrixCell> = {};
  for (const [key, principles] of Object.entries(imported)) {
    const [i, w] = key.split("-").map(Number);
    out[key] = { improving_id: i, worsening_id: w, improving_label: "", worsening_label: "", principles, source: "altshuller" };
  }
  for (const [key, cell] of Object.entries(overlayCells)) out[key] = cell;
  return out;
}
