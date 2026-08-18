/**
 * Pure TRIZ knowledge core with an injectable data provider.
 *
 * The provider indirection keeps every lookup pure and portable: the fs-backed
 * provider lives in ./data.js (repo checkout / npm package layout), while
 * hosted runtimes (e.g. the Cloudflare Worker in ./worker.ts) install a
 * provider over statically imported JSON. Fails closed if no provider is set.
 */

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
export interface TrizEffect {
  id: number;
  name: string;
  category: "physical" | "chemical" | "geometric";
  function: string;
  statement: string;
  hints: string[];
}

export type DataFile =
  | "parameters.json" | "principles.json" | "matrix.json"
  | "evals.json" | "tool-router.json" | "effects.json";
export type DataProvider = (file: DataFile) => unknown;

let provider: DataProvider | null = null;
let _params: Parameter[] | null = null;
let _principles: Principle[] | null = null;
let _matrix: { cells: Record<string, MatrixCell>; _meta: any } | null = null;
let _evals: any = null;
let _tools: TrizTool[] | null = null;
let _effects: TrizEffect[] | null = null;

/** Install a data provider and reset caches. Hosted runtimes call this once at startup. */
export function useProvider(p: DataProvider) {
  provider = p;
  _params = _principles = _evals = _tools = _effects = null;
  _matrix = null;
}

function load<T>(file: DataFile): T {
  if (!provider) {
    throw new Error(
      "TRIZ data provider not installed: import ./data.js (fs-backed) or call useProvider() with bundled data",
    );
  }
  return provider(file) as T;
}

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
function effectsAll(): TrizEffect[] {
  return (_effects ??= load<{ effects: TrizEffect[] }>("effects.json").effects);
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
  const cell = matrix().cells[improving + "-" + worsening];
  if (!cell) {
    return {
      covered: false,
      improving,
      worsening,
      principles: [],
      hint:
        "No recommendation is recorded for (" + improving + "," + worsening + "). Do not guess: " +
        "verify the parameter mapping, model a physical contradiction, or use another routed tool. " +
        "Reference: " + matrix()._meta.full_matrix_reference,
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

/**
 * Multi-parameter contradiction lookup: every (improving × worsening) cell,
 * aggregated by how many cells recommend each principle (ties broken by mean
 * position). Frequency aggregation follows standard TRIZ-software practice;
 * positions within a cell are NOT treated as documented ranks, so no positional
 * scoring is invented. Per-cell detail is always returned — nothing hidden.
 * Fails closed only when every cell is blank or diagonal.
 */
export interface MultiCellResult extends MatrixResult {
  improving_params: number[];
  worsening_params: number[];
  cells: { improving: number; worsening: number; covered: boolean; principles: number[] }[];
  aggregated: { principle: number; name: string; cell_count: number; mean_position: number; cells: string[] }[];
  covered_cells: number;
  total_cells: number;
}

export function matrixLookupMulti(improving: number[], worsening: number[]): MultiCellResult {
  const cells: MultiCellResult["cells"] = [];
  const freq = new Map<number, { count: number; positions: number[]; cells: string[] }>();

  for (const i of improving) {
    for (const w of worsening) {
      const cell = matrix().cells[i + "-" + w];
      const covered = Boolean(cell);
      cells.push({ improving: i, worsening: w, covered, principles: cell ? cell.principles : [] });
      if (cell) {
        cell.principles.forEach((pid, idx) => {
          const e = freq.get(pid) ?? { count: 0, positions: [], cells: [] };
          e.count += 1;
          e.positions.push(idx + 1);
          e.cells.push(i + "-" + w);
          freq.set(pid, e);
        });
      }
    }
  }

  const coveredCells = cells.filter((c2) => c2.covered).length;
  const aggregated = [...freq.entries()]
    .map(([principle, e]) => ({
      principle,
      name: getPrinciple(principle)?.name ?? "",
      cell_count: e.count,
      mean_position: Math.round((e.positions.reduce((a, b) => a + b, 0) / e.positions.length) * 100) / 100,
      cells: e.cells,
    }))
    .sort((a, b) => b.cell_count - a.cell_count || a.mean_position - b.mean_position);

  return {
    covered: coveredCells > 0,
    improving: improving[0],
    worsening: worsening[0],
    improving_params: improving,
    worsening_params: worsening,
    principles: aggregated.map((a) => a.principle),
    cells,
    aggregated,
    covered_cells: coveredCells,
    total_cells: cells.length,
    hint: coveredCells > 0
      ? undefined
      : "No recommendation is recorded for any (improving, worsening) combination. Do not guess: verify the parameter mapping, model a physical contradiction, or use another routed tool. Reference: " + matrix()._meta.full_matrix_reference,
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

export function effects(query?: string, category?: TrizEffect["category"]) {
  const all = effectsAll();
  let list = category ? all.filter((e) => e.category === category) : all;
  if (query) {
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    list = list
      .map((e) => ({
        e,
        score: tokens.reduce(
          (s, t) =>
            s +
            ((e.name + " " + e.function + " " + e.statement + " " + e.hints.join(" ")).toLowerCase().includes(t) ? 1 : 0),
          0,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.e);
  }
  return { total: all.length, matched: list.length, query: query ?? null, category: category ?? null, effects: list };
}
