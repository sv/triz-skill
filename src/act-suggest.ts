/**
 * From a separation verdict to construction: hints, not verdicts.
 *
 * `separationCheck` says that two demands are separated on an axis: their regions there are
 * disjoint, so a piecewise assignment meets both. It does not say how to build the piecewise
 * system. For each separated pair and each separating axis, `separationSuggestions` names the
 * kernel operations that build one, with the cells each demand holds on that axis:
 *
 *  - space     — `segment` (Principle 1) or `take_out` (Principle 2) the box that carries the parameter;
 *  - time      — `standby` (Principle 11), or `triz_dynamics` `separation` with one timed demand per
 *                side (Principle 15, classified parametric);
 *  - condition — `rerate` (Principle 16), or a `rewrite` that changes the field the parameter
 *                responds to (Principle 28, classified analogy only);
 *  - level     — `triz_nine_windows`: the system operator, or its subsystem restriction;
 *  - direction — `segment` the box by port direction (Principle 1).
 *
 * A suggestion carries no `basis`: nothing is decided until the move is applied and the result
 * checked (triz_function_model compare_to, triz_behavior, triz_dynamics). Principle texts are looked
 * up through `lookup`, which the tool boundary backs with data/principles.json; none is recalled
 * here. Each principle's classification is the one docs/theory-map.md gives it (tests check).
 */
import type { Axis, PhysicalContradiction } from "./act.js";
import { baseOf, separationCheck } from "./act.js";

export interface PrincipleText { id: number; name: string; classic: string; }
export type PrincipleLookup = (id: number) => PrincipleText | undefined;
/** How docs/theory-map.md classifies a principle: a structural move the kernel makes, a parameter it checks, or an analogy. */
export type Classification = "structural" | "parametric" | "analogy only";

/** The principles a suggestion may cite, with their classification in docs/theory-map.md. */
export const SUGGESTED_PRINCIPLES: ReadonlyMap<number, Classification> = new Map([
  [1, "structural"], [2, "structural"], [11, "structural"], [15, "parametric"], [16, "structural"], [28, "analogy only"],
]);

export interface Suggestion {
  axis: Axis;
  /** The MCP tool to call, and the argument of it that carries the move. */
  tool: "triz_transform" | "triz_dynamics" | "triz_nine_windows";
  use: string;
  /** The triz_transform op, or the mode of the other tool. */
  op: string;
  principle?: { id: number; name: string; text: string; classified: Classification };
  /** Each demand's cells on this axis. */
  cells: Record<string, string[]>;
  how: string;
}

export const SUGGESTION_NOTE = "Suggestions are hints, not verdicts: each names a kernel operation that could build the piecewise system the separation allows, on the axis that separates the pair. None is decided or cited (no basis). Apply one, then check the result against the baseline (triz_function_model or triz_behavior compare_to, triz_dynamics). A principle classified parametric or analogy only is not a construction the kernel makes.";

const list = (xs: string[]) => xs.map((x) => `'${x}'`).join(", ");

/**
 * Suggestions for every pair separated on an axis, keyed like `pairs`. Fails closed (throws) when a
 * principle a suggestion cites is not in the lookup: its text is never recalled.
 */
export function separationSuggestions(pc: PhysicalContradiction, lookup: PrincipleLookup): Map<string, Suggestion[]> {
  const r = separationCheck(pc);
  const out = new Map<string, Suggestion[]>();
  if (!r.ok) return out;
  const { region } = baseOf(pc);
  const byId = new Map(pc.demands.map((d) => [d.id, d]));
  const principle = (id: number) => {
    const p = lookup(id);
    if (!p) throw new Error(`principle ${id} is not in principles.json; its text is never recalled`);
    return { id: p.id, name: p.name, text: p.classic, classified: SUGGESTED_PRINCIPLES.get(id)! };
  };
  const param = `'${pc.parameter}'`;
  for (const pair of r.pairs) {
    if (pair.status !== "separated") continue;
    const [a, b] = pair.demands.map((id) => byId.get(id)!);
    const suggestions: Suggestion[] = [];
    for (const axis of pair.separatingAxes) {
      const cells = { [a.id]: region(a, axis), [b.id]: region(b, axis) };
      const [ca, cb] = [list(cells[a.id]), list(cells[b.id])];
      const at = (tool: Suggestion["tool"], use: string, op: string, how: string, id?: number): Suggestion =>
        ({ axis, tool, use, op, ...(id ? { principle: principle(id) } : {}), cells, how });
      switch (axis) {
        case "space":
          suggestions.push(
            at("triz_transform", "transformation", "segment", `Segment the box that carries ${param} into one part per region: one serving ${ca} ('${a.id}'), one serving ${cb} ('${b.id}'), each with the ports of its region, so each part holds its own value.`, 1),
            at("triz_transform", "transformation", "take_out", `Take out the ports of the box that carries ${param} that serve ${cb} ('${b.id}') into a part of their own, so the rest of the box keeps the value '${a.id}' needs.`, 2),
          );
          break;
        case "time":
          suggestions.push(
            at("triz_transform", "transformation", "standby", `Prepare a standby beforehand for the box that carries ${param}: it takes over the box's functions at ${cb} ('${b.id}'), while the box serves ${ca} ('${a.id}').`, 11),
            at("triz_dynamics", "separation", "separation", `Declare state on the box that carries ${param} and pass separation with two timed demands: '${a.id}' with a window over ${ca} and '${b.id}' with one over ${cb}, each a target set of the values it admits. A realizable verdict gives one run that changes the value between them. The kernel does not know the order of time cells: set the windows yourself.`, 15),
          );
          break;
        case "condition":
          suggestions.push(
            at("triz_transform", "transformation", "rerate", `Rate the function that sets ${param} insufficient or excessive under ${cb} ('${b.id}') and useful under ${ca} ('${a.id}'): a model per condition, compared with the baseline.`, 16),
            at("triz_transform", "transformation", "rewrite", `Replace the means that sets ${param} with a field or interaction that responds to the condition, so the value follows ${ca} versus ${cb} by itself: a rewrite that changes the function's carrier.`, 28),
          );
          break;
        case "level":
          suggestions.push(
            at("triz_nine_windows", "subsystem", "restrict", `Restrict the model to the boxes at ${ca} ('${a.id}') with subsystem, and give ${param} its value there; the system row keeps the value '${b.id}' needs at ${cb}.`),
            at("triz_nine_windows", "system", "nine_windows", `Build the system operator around the box that carries ${param}, with system naming the boxes collapsed into one: the subsystem, system, and supersystem rows show where ${ca} and ${cb} sit, and which row can hold each value.`),
          );
          break;
        case "direction":
          suggestions.push(
            at("triz_transform", "transformation", "segment", `Segment the box that carries ${param} by port direction: one part with the ports on the ${ca} side ('${a.id}'), one with those on the ${cb} side ('${b.id}').`, 1),
          );
          break;
      }
    }
    out.set(JSON.stringify(pair.demands), suggestions);
  }
  return out;
}

/** Attach each separated pair's suggestions to a (basis-annotated) separation result. */
export function withSuggestions<R extends { ok: true; pairs: Array<{ demands: string[]; status: string }> }>(pc: PhysicalContradiction, r: R, lookup: PrincipleLookup) {
  const s = separationSuggestions(pc, lookup);
  if (!s.size) return r;
  return {
    ...r,
    pairs: r.pairs.map((p) => (s.has(JSON.stringify(p.demands)) ? { ...p, suggestions: s.get(JSON.stringify(p.demands))! } : p)),
    suggestionNote: SUGGESTION_NOTE,
  };
}
