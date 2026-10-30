/**
 * Model lints: findings about a model that type-checks, reported beside a verdict and never
 * changing it. Each is an issue (code, path, message, hint) with a severity: `warning` for a
 * likely modelling mistake, `info` for something worth a look. triz_function_model, triz_trim, and
 * triz_behavior report them as `warnings`.
 *
 *  - defect-on-loss-carrier       (warning) an excessive or insufficient function whose flow is a
 *                                 loss: a pressure drop, leakage, noise. A useful-but-excessive
 *                                 rating says some level of the flow is wanted from the performer;
 *                                 for a loss no level is, so the function is harmful.
 *  - product-without-deliverable  (warning) a product box no non-harmful function acts on, so the
 *                                 model has no deliverable there.
 *  - unused-carrier               (info) a carrier that types no port and no wire.
 *  - unwired-port                 (info) a port with no wire. An unwired input is a boundary input
 *                                 (an operating condition) for triz_behavior and triz_dynamics.
 *  - trim-level-functions         (warning, triz_trim) the trim removes excessive or insufficient
 *                                 functions, which it poses under levelProblems.
 *  - unbacked-producible-row      (warning) a box declares producible and feasibility rows, and a
 *                                 producible row's output level, read through the carriers'
 *                                 levels, is reached by no feasibility row of the box at its
 *                                 inputs (src/act-levels.ts, unbackedProducible).
 *
 * The loss lexicon is a heuristic over carrier ids, dimensions, and function verbs; a match is a
 * prompt to check the rating, not a finding.
 */
import type { FunctionModel } from "./act.js";
import { at, quoted, type Severity, type Warning, type IssueCode } from "./act-issues.js";
import { unbackedProducible } from "./act-levels.js";

/** Words naming a flow that is a loss whatever its level. Kept generic: no domain is privileged. */
const LOSS = new Set(["drop", "drops", "loss", "losses", "resistance", "leak", "leaks", "leakage", "noise", "wear", "backpressure", "waste", "contamination", "clogging"]);

const words = (...texts: Array<string | undefined>) => texts.flatMap((t) => (t ?? "").toLowerCase().split(/[^a-z]+/)).filter(Boolean);

const lint = (code: IssueCode, severity: Severity, path: string, message: string, hint: string): Warning => ({ code, path, message, hint, severity });

/** Lints of a model that type-checks; paths start at `root`. */
export function lintModel(model: FunctionModel, root = "$.model"): Warning[] {
  const out: Warning[] = [];
  const carriers = new Map(model.carriers.map((c) => [c.id, c]));
  model.wires.forEach((w, i) => {
    if (w.polarity !== "excessive" && w.polarity !== "insufficient") return;
    const c = carriers.get(w.carrier);
    const loss = words(w.carrier, c?.dimension, w.verb).find((x) => LOSS.has(x));
    if (!loss) return;
    out.push(lint("defect-on-loss-carrier", "warning", at(root, "wires", i, "polarity"),
      `function '${w.id}' (${w.from.box} → ${w.to.box}) carries '${w.carrier}'${c ? ` (${c.dimension})` : ""}, a loss-like flow ('${loss}'), rated ${w.polarity}`,
      `Rate it harmful if no level of it is useful. ${w.polarity === "excessive" ? "Excessive" : "Insufficient"} says some level of '${w.carrier}' is wanted from '${w.from.box}'; if only less of it is better, '${w.id}' is a harm, and the useful function '${w.from.box}' performs is another wire.`));
  });
  const fed = new Set(model.wires.filter((w) => w.polarity !== "harmful").map((w) => w.to.box));
  model.boxes.forEach((b, i) => {
    if (b.role === "product" && !fed.has(b.id)) {
      out.push(lint("product-without-deliverable", "warning", at(root, "boxes", i),
        `product box '${b.id}' receives no non-harmful function, so it has no deliverable`,
        `Wire the main function into an input port of '${b.id}' with a useful (or insufficient, or excessive) rating; if '${b.id}' is not what the system exists for, give it another role.`));
    }
  });
  const typing = new Set([...model.wires.map((w) => w.carrier), ...model.boxes.flatMap((b) => [...(b.inputs ?? []), ...(b.outputs ?? [])].map((p) => p.carrier))]);
  model.carriers.forEach((c, i) => {
    if (!typing.has(c.id)) out.push(lint("unused-carrier", "info", at(root, "carriers", i), `carrier '${c.id}' types no port and no wire`, `Remove carrier '${c.id}', or type the port that carries it.`));
  });
  const wired = new Set(model.wires.flatMap((w) => [JSON.stringify([w.from.box, "outputs", w.from.port]), JSON.stringify([w.to.box, "inputs", w.to.port])]));
  model.boxes.forEach((b, i) => {
    for (const side of ["inputs", "outputs"] as const) {
      (b[side] ?? []).forEach((p, j) => {
        if (wired.has(JSON.stringify([b.id, side, p.id]))) return;
        out.push(lint("unwired-port", "info", at(root, "boxes", i, side, j), `${side === "inputs" ? "input" : "output"} port '${b.id}.${p.id}' has no wire`, side === "inputs"
          ? `Wire the function that acts on '${b.id}' here, or leave it unwired as a boundary input: triz_behavior and triz_dynamics read unwired inputs as operating conditions.`
          : `Wire the function '${b.id}' performs through it, or remove it: triz_trim counts unwired outputs as capacity an absorber could use.`));
      });
    }
  });
  for (const u of unbackedProducible(model)) {
    const b = model.boxes[u.box];
    out.push(lint("unbacked-producible-row", "warning", at(root, "boxes", u.box, "producible", u.row),
      `producible row ${u.row} of '${b.id}' gives ${u.outputs.map((o) => `${o.port} = '${o.value}'`).join(", ")}, but no feasibility row of '${b.id}' reaches that level at its inputs, read through the carriers' levels (the most provided: ${u.most.map((m) => `${m.port} = ${m.amount}, read as '${m.value}'`).join("; ")})`,
      `Add a feasibility row of '${b.id}' that provides that level at those inputs, with its cost, or drop the row from producible if '${b.id}' cannot make it: triz_behavior weakest_spec takes producible as declared, and triz_feasibility takes the feasibility rows.`));
  }
  return out;
}

/** The trim-level-functions lint of a triz_trim result. */
export function lintTrim(r: { levelProblems: Array<{ wire: string; polarity: string }> }): Warning[] {
  if (!r.levelProblems.length) return [];
  return [lint("trim-level-functions", "warning", "$.trim",
    `the trim removes ${r.levelProblems.length} excessive or insufficient function(s): ${quoted(r.levelProblems.map((p) => p.wire))}; they are posed under levelProblems, not handed to an absorber`,
    "For each level problem, find what supplies the level the object needs; if no level of the flow is useful, rate the function harmful, and it needs no absorber.")];
}
