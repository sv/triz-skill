/**
 * TRIZ knowledge-core loader + pure lookup functions.
 *
 * Single source of truth is the JSON under `skills/triz-innovation/data/`
 * (shared with the triz-innovation skill). Resolution uses an environment override
 * first, then repo-relative candidates. Fails closed with a
 * clear message if the data dir is absent — no silent fallback.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Parameter { id: number; name: string; }
export interface Principle { id: number; name: string; classic: string; }
export interface MatrixCell {
  improving_id: number; worsening_id: number;
  improving_label: string; worsening_label: string;
  principles: number[]; source: string; status?: string; note?: string;
}
export type ToolStage = "analysis" | "modeling" | "synthesis";
export interface TrizTool {
  id: number;
  source_code: string;
  name: string;
  stages: ToolStage[];
  signals: string[];
}

function candidateDataDirs(): string[] {
  return [
    process.env.TRIZ_DATA_DIR,
    path.resolve(process.cwd(), "skills/triz-innovation/data"),
    path.resolve(__dirname, "../skills/triz-innovation/data"),
    path.resolve(__dirname, "../../skills/triz-innovation/data"),
  ].filter((d): d is string => Boolean(d));
}

export function resolveDataDir(): string {
  for (const dir of candidateDataDirs()) {
    if (fs.existsSync(path.join(dir, "principles.json"))) return dir;
  }
  throw new Error(
    "TRIZ data dir not found; set TRIZ_DATA_DIR or run from the repo root (expects skills/triz-innovation/data/principles.json)",
  );
}

function load<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(resolveDataDir(), file), "utf8")) as T;
}

let _params: Parameter[] | null = null;
let _principles: Principle[] | null = null;
let _matrix: { cells: Record<string, MatrixCell>; _meta: any } | null = null;
let _evals: any | null = null;
let _tools: TrizTool[] | null = null;

export function parameters(): Parameter[] {
  return (_params ??= load<{ parameters: Parameter[] }>("parameters.json").parameters);
}
export function principles(): Principle[] {
  return (_principles ??= load<{ principles: Principle[] }>("principles.json").principles);
}
export function matrix() {
  return (_matrix ??= load<{ cells: Record<string, MatrixCell>; _meta: any }>("matrix.json"));
}
export function evals(): any {
  return (_evals ??= load<any>("evals.json"));
}
export function toolCatalog(stage?: ToolStage): TrizTool[] {
  const all = (_tools ??= load<{ tools: TrizTool[] }>("tool-router.json").tools);
  return stage ? all.filter((tool) => tool.stages.includes(stage)) : all;
}

export function routeTools(stage: ToolStage, signals: string[] = []) {
  const candidates = toolCatalog(stage);
  const normalized = signals.map((signal) => signal.trim().toLowerCase()).filter(Boolean);
  const tools = normalized.length === 0
    ? candidates
    : candidates.filter((tool) =>
        tool.signals.some((raw) => {
          const toolSignal = raw.trim().toLowerCase();
          return normalized.some(
            (signal) => toolSignal.includes(signal) || signal.includes(toolSignal),
          );
        }),
      );
  return { stage, signals, tools };
}

export function getParameter(id: number): Parameter | undefined {
  return parameters().find((p) => p.id === id);
}
export function getPrinciple(id: number): Principle | undefined {
  return principles().find((p) => p.id === id);
}

export interface MatrixResult {
  covered: boolean;
  improving: number;
  worsening: number;
  principles: number[];
  source?: string;
  status?: string;
  note?: string;
  hint?: string;
}

/** Fail-closed matrix lookup: uncovered cell → covered:false + pointer, never a guess. */
export function matrixLookup(improving: number, worsening: number): MatrixResult {
  const cell = matrix().cells[`${improving}-${worsening}`];
  if (!cell) {
    return {
      covered: false,
      improving,
      worsening,
      principles: [],
      hint: `No recommendation is recorded for (${improving},${worsening}). Do not guess: verify the parameter mapping, model a physical contradiction, or use another routed tool. Reference: ${matrix()._meta.full_matrix_reference}`,
    };
  }
  return {
    covered: true,
    improving,
    worsening,
    principles: cell.principles,
    source: cell.source,
    status: cell.status,
    note: cell.note,
  };
}

/** Matrix lookup + expansion of each canonical principle. */
export function resolve(improving: number, worsening: number) {
  const base = matrixLookup(improving, worsening);
  return {
    ...base,
    improving_parameter: getParameter(improving) ?? null,
    worsening_parameter: getParameter(worsening) ?? null,
    principles_detail: base.principles.map((id) => getPrinciple(id)).filter(Boolean),
  };
}
