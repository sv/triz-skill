/**
 * Structured feedback for agents. Every `ok: false` result carries `errors: string[]` (unchanged)
 * and `issues`, one per error and in the same order: a stable kebab-case `code`, a JSON `path` into
 * the call's input, the `message` (the error text), and a `hint` naming a concrete fix. Lints are
 * the same shape plus a `severity` and never change a verdict.
 *
 * Paths. A kernel function writes paths into its own input: `$` is the model for checkModel and the
 * contradiction for separationCheck; a function of a model and a spec writes `$.model…` for the
 * model and `$.<field>` for each spec field, named as the tool input names it. Callers re-root
 * them (`rebase`) when they pass a failure on, so at the tool boundary every path starts at the
 * tool's arguments, e.g. `$.compare_to.wires[2].carrier` or `$.transformation.parts[1].ports[0]`.
 * A path into something the input does not contain (a transformation's result, a missing key)
 * points at the nearest input element that produced it.
 */

/** Every issue and lint code, with what it means. references/categorical-model.md tabulates them; a test keeps the two in sync. */
export const ISSUE_CODES = {
  // Typing of a model
  "duplicate-id": "Two elements of one kind share an id (carrier, box, wire, port, state, value, demand, concept)",
  "unknown-carrier": "A port or wire names a carrier the model does not declare",
  "unknown-box": "An id names no box of the model",
  "unknown-port": "A box has no port with that id",
  "unknown-wire": "An id names no wire of the model",
  "wrong-port-side": "A wire leaves an input port or enters an output port",
  "carrier-mismatch": "A wire's carrier differs from a port it is attached to",
  "incomplete-state-machine": "A box declares state, transition, or initial without the others it needs",
  "behavior-and-transition": "A box declares both behavior and transition",
  "undeclared-state": "A state is not among the box's declared states",
  "no-declared-values": "Rows or a check need a carrier's values, and the carrier declares none",
  "row-unknown-port": "A behavior, transition, or feasibility row names a port the box does not have",
  "row-missing-value": "A behavior or transition row gives no value for one of the box's ports",
  "undeclared-value": "A value is not among the carrier's declared values",
  "dominated-row": "A feasibility row repeats or is dominated by another row of the box",
  "producible-with-rows": "A box declares producible together with behavior or transition",
  "invalid-levels": "A carrier's levels do not start at 0 or do not strictly increase",
  "flow-repeats-box": "A flow path lists a box directly after itself",
  // Sets and arguments
  "listed-twice": "An id appears twice in a set argument",
  "empty-set": "A set argument names nothing",
  "too-few-members": "A construction needs at least two parts, boxes, or demands",
  "unknown-cost-dimension": "A cost dimension is not one the box declares",
  "cap-exceeded": "A search or encoding passed its cap",
  "internal-error": "An invariant of the kernel failed; the input is not at fault",
  "format-unavailable": "The export format needs a layout engine this server does not have",
  // Tool argument combinations
  "box-map-without-compare-to": "box_map was passed without compare_to",
  "absorb-without-trim": "absorb was passed without trim",
  "trim-with-compare-to": "trim and compare_to were passed together",
  "weakest-spec-without-target": "weakest_spec was passed without compare_to or trim",
  "rule-or-rule-id": "Neither or both of rule and rule_id were passed",
  "unknown-rule-id": "rule_id names no built-in rule or detector",
  "detector-takes-model-only": "A detector rule_id was passed with at, match, carriers, ids, limit, or max_steps",
  "at-and-match": "at and match were passed together",
  "apply-args-without-match": "carriers or ids were passed while only listing matches",
  "listing-entry-as-match": "A whole matches[i] entry was passed as match",
  "mpv-weights-without-compare-to": "mpv_weights was passed without compare_to",
  "invalid-weight": "An MPV weight is not positive",
  // Physical contradictions
  "undeclared-cell": "A demand names a cell the axis does not declare",
  "empty-axis": "The axis to index by has no cells",
  // Transformations
  "part-without-ports": "A segment part lists no ports",
  "port-assigned-twice": "A port is given to two parts",
  "port-unassigned": "A port of the segmented box is given to no part",
  "unknown-part": "cost_to names a part that is not listed",
  "take-out-reading": "The taken ports do not fit the take_out reading",
  "not-adjacent": "Boxes to merge are not joined by functions inside the group or by consecutive positions on a flow",
  "not-identical": "Boxes to merge as identical differ in role or port carriers",
  "role-ambiguous": "The merged boxes have different roles and into.role is missing",
  "wrong-rating": "The function's rating does not fit the operation",
  "already-rated": "The function already has the requested rating",
  "not-on-cycle": "The function lies on, or closes, no loop",
  "own-object-port": "retarget points the harm at its own object port",
  "self-loop": "The function acts on its own performer",
  "ambiguous-port": "Several ports of the carrier fit; one must be named",
  "missing-port": "No port of the carrier fits; one must be named",
  "declared-rows-block-change": "A box's declared rows would not name a port the change adds or deletes",
  "nothing-to-back-up": "The box performs no useful function on another box",
  "not-cheaper": "The copy is not cheaper than the box",
  "dangling-wire": "A kept wire would touch a deleted box or port",
  "dangling-flow": "A kept flow would pass a deleted box, or name it as its medium",
  "unknown-flow": "An id names no flow of the model",
  "flow-on-split-box": "Segmentation would leave a flow on a box that no part keeps",
  "id-not-fresh": "A new element's id is already taken",
  "ill-typed-result": "The step would produce a model that does not type-check",
  "trim-blocked": "A function of a trimmed box has no typed absorber",
  "not-an-absorbed-function": "absorb names a wire that is not a function the trimmed boxes perform on a remaining box",
  "not-a-typed-absorber": "absorb names a port that is not an output of the function's carrier on a remaining box",
  // Rules
  "rule-ill-typed": "A rule pattern does not type-check, or a carrier variable is declared twice or never used",
  "rule-malformed": "A rule's interface, created elements, or like references are inconsistent",
  "not-a-rule-element": "A match, at, or ids key names nothing the rule has there",
  "match-incomplete": "A left-side element is not mapped by the match",
  "match-not-homomorphic": "The match does not preserve roles, sides, carriers, ratings, or incidences",
  "match-identifies": "Two left-side elements match one model element and one would be deleted",
  "unbound-carrier-variable": "A carrier variable used only on the right side is not bound",
  "not-right-only-variable": "carriers binds a variable that is not used only on the right side",
  "distinct-carriers": "Carrier variables the rule declares distinct bind the same carrier",
  "forbid-violated": "A rule's forbid condition holds: the match extends to an occurrence of it, or the check could not be decided within its budget",
  // Behaviour and weakness
  "no-deliverables": "No product box receives a non-harmful function",
  "box-map-unknown-box": "box_map names a box the concept or baseline does not have",
  "box-map-ambiguous": "box_map lands two concept input ports on one baseline port",
  "box-map-port-mismatch": "box_map maps a box to one without the same input port and carrier",
  "input-domain-mismatch": "An input read by several models ranges over different values",
  "nothing-to-specify": "weakest_spec found no box without behaviour to specify",
  "deliverables-differ": "The concepts deliver different ports",
  "acceptable-not-deliverable": "acceptable names a port that is not a deliverable",
  "acceptable-missing": "A deliverable has no acceptable values",
  "acceptable-entry-malformed": "An acceptable entry names neither or both of a port and a carrier, or of values and a threshold",
  "invalid-threshold": "A threshold cannot be read through the carrier's levels, or reads as no value",
  "levels-differ": "A threshold reads as different values in different concepts",
  "invalid-prior": "A weakness prior is malformed: names neither or both of a port and a carrier, an input that is not a situation input, an undeclared value, a duplicate, or a weight that is not a nonnegative number",
  // Abstraction
  "unmapped-box": "map.ports names a box that map.boxes does not map",
  // Dynamics
  "no-state": "A target or initial names a box that declares no state",
  "uninitialised-state": "A stateful box has no initial states",
  "not-boundary-input": "inputs names a port that is not an unwired input port",
  "window-invalid": "A separation window is inverted or ends after the horizon",
  "windows-overlap": "Two separation windows overlap",
  "horizon-inputs-mismatch": "inputs has fewer entries than the horizon needs",
  "horizon-out-of-range": "The horizon is not an integer from 0 to the maximum",
  "nothing-to-explore": "No box declares transition and no target names a box",
  // Feasibility
  "no-product": "The model has no product box",
  "unsupplied-requirement": "A feasibility row requires a level at an input no non-harmful function feeds",
  // Nine windows
  "ambiguous-port-name": "Collapsing gives two kept ports the same name",
  "no-earlier-snapshot": "A transition starts from a time with no snapshot",
  "snapshot-not-reached": "A transition's result differs from the snapshot it must reach",
  // Certificates
  "invalid-namespace": "The certificate namespace is not a usable Lean identifier",
  "certificate-needs-unsafe": "A dynamics certificate was asked for without an unsafe target",
  "certificate-input-sequence": "A dynamics certificate was asked for runs under an input sequence, which it does not encode",
  "not-certifiable": "The verdict has no certificate: an escalation unreachable only within the horizon, undecided, or whose trace blocks; a behaviour verdict other than preserved; an undecided ranking, or no strictly ordered pair",
  // Lints (warnings channel)
  "defect-on-loss-carrier": "Lint: a loss-like flow (pressure drop, friction, leakage, …) is rated excessive or insufficient",
  "trim-level-functions": "Lint: the trim removes excessive or insufficient functions, listed under levelProblems",
  "product-without-deliverable": "Lint: a product box receives no non-harmful function",
  "unused-carrier": "Lint (info): a carrier types no port and no wire",
  "unwired-port": "Lint (info): a port has no wire",
} as const;

export type IssueCode = keyof typeof ISSUE_CODES;

export interface Issue { code: IssueCode; path: string; message: string; hint: string; }
export type Severity = "warning" | "info";
export interface Warning extends Issue { severity: Severity; }
export interface Failure { ok: false; errors: string[]; issues: Issue[]; }

export const issue = (code: IssueCode, path: string, message: string, hint: string): Issue => ({ code, path, message, hint });

/** A failure whose errors are its issues' messages, so the two never drift. */
export const fail = (issues: Issue[]): Failure => ({ ok: false, errors: issues.map((i) => i.message), issues });

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** JSON path: numbers index arrays; identifier keys use dots, others brackets with quotes. */
export function at(root: string, ...segments: Array<string | number>): string {
  return segments.reduce<string>((p, s) => (typeof s === "number" ? `${p}[${s}]`
    : IDENT.test(s) ? `${p}.${s}` : `${p}['${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}']`), root);
}

/** Re-rooting rules, first match wins: [from, to] keeps the rest of the path; with "collapse", the path becomes `to`. */
export type Reroot = Array<[from: string, to: string] | [from: string, to: string, "collapse"]>;

export function reroot(path: string, rules: Reroot): string {
  for (const [from, to, collapse] of rules) {
    if (path === from || path.startsWith(`${from}.`) || path.startsWith(`${from}[`)) return collapse ? to : to + path.slice(from.length);
  }
  return path;
}

/** Pass a failure on: re-root its paths and prefix its messages, keeping errors and issues in step (and any other field, such as `cap`). */
export function rebase<F extends { errors: string[]; issues: Issue[] }>(f: F, rules: Reroot, prefix = ""): F {
  const issues = f.issues.map((i) => ({ ...i, message: prefix + i.message, path: reroot(i.path, rules) }));
  return { ...f, issues, errors: issues.map((i) => i.message) };
}

interface Shape {
  carriers: Array<{ id: string }>;
  boxes: Array<{ id: string; inputs?: Array<{ id: string }>; outputs?: Array<{ id: string }> }>;
  wires: Array<{ id: string }>;
}

/** Paths to a model's elements by id, under `root`; an id the model lacks points at its list. */
export const where = {
  carrier: (m: Shape, id: string, root = "$") => { const i = m.carriers.findIndex((c) => c.id === id); return i < 0 ? at(root, "carriers") : at(root, "carriers", i); },
  box: (m: Shape, id: string, root = "$") => { const i = m.boxes.findIndex((b) => b.id === id); return i < 0 ? at(root, "boxes") : at(root, "boxes", i); },
  wire: (m: Shape, id: string, root = "$") => { const i = m.wires.findIndex((w) => w.id === id); return i < 0 ? at(root, "wires") : at(root, "wires", i); },
  /** A port, on the given side or either; the box's path if it has no such port. */
  port: (m: Shape, box: string, port: string, root = "$", side?: "inputs" | "outputs") => {
    const i = m.boxes.findIndex((b) => b.id === box);
    if (i < 0) return at(root, "boxes");
    for (const s of side ? [side] : (["inputs", "outputs"] as const)) {
      const j = (m.boxes[i][s] ?? []).findIndex((p) => p.id === port);
      if (j >= 0) return at(root, "boxes", i, s, j);
    }
    return at(root, "boxes", i);
  },
};

/** The common "unknown box" and "unknown wire" issues of an operation's arguments. */
export const unknownBox = (m: Shape, id: string, path: string, prefix = "") =>
  issue("unknown-box", path, `${prefix}unknown box '${id}'`, `Use a box id of the model: ${quoted(m.boxes.map((b) => b.id))}.`);
export const unknownWire = (m: Shape, id: string, path: string, prefix = "") =>
  issue("unknown-wire", path, `${prefix}unknown wire '${id}'`, `Use a wire id of the model: ${quoted(m.wires.map((w) => w.id))}.`);

/** Ids as a quoted list, for hints; long lists are cut after `max`. */
export function quoted(ids: Iterable<string>, max = 12): string {
  const xs = [...ids];
  if (!xs.length) return "none";
  const shown = xs.slice(0, max).map((id) => `'${id}'`).join(", ");
  return xs.length > max ? `${shown}, … (${xs.length} in all)` : shown;
}

/** Index of the second occurrence of `id` in `list`, where a duplicate is reported. */
export const second = (list: string[], id: string) => list.indexOf(id, list.indexOf(id) + 1);

/**
 * A zod error callback that appends a hint to zod's own message when `hint` recognises the issue,
 * so tool-boundary validation errors (which both MCP SDKs print as "message at path") say what to
 * do. Returning undefined keeps zod's message. It never touches the JSON Schema.
 */
export function zodHint(hint: (iss: { code?: string; input?: unknown; keys?: string[]; path?: PropertyKey[] }) => string | undefined) {
  return (iss: { code?: string; input?: unknown; keys?: string[]; path?: PropertyKey[]; message?: string }) => {
    const h = hint(iss);
    if (!h) return undefined;
    return `${defaultMessage(iss)} (hint: ${h})`;
  };
}

/** A zod error callback for a strict object: a hint per unrecognised key that is a known slip, and an optional hint when the input is not an object. */
export function keysHint(keys: Record<string, string>, notObject?: string) {
  return zodHint((iss) => {
    if (iss.code === "invalid_type" && notObject) return notObject;
    if (iss.code !== "unrecognized_keys") return undefined;
    const known = (iss.keys ?? []).filter((k) => Object.hasOwn(keys, k));
    return known.length ? [...new Set(known.map((k) => keys[k]))].join("; ") : undefined;
  });
}

function defaultMessage(iss: { code?: string; input?: unknown; keys?: string[]; message?: string; [k: string]: unknown }): string {
  switch (iss.code) {
    case "unrecognized_keys": return `Unrecognized key${(iss.keys ?? []).length > 1 ? "s" : ""}: ${(iss.keys ?? []).map((k) => `"${k}"`).join(", ")}`;
    case "invalid_type": return `Invalid input: expected ${String(iss.expected)}, received ${iss.input === null ? "null" : Array.isArray(iss.input) ? "array" : typeof iss.input}`;
    case "invalid_value": return `Invalid option: expected one of ${((iss.values as unknown[]) ?? []).map((v) => JSON.stringify(v)).join("|")}`;
    case "invalid_union": return Array.isArray(iss.options) && iss.options.length
      ? `Invalid discriminator value. Expected ${iss.options.map((o) => `'${String(o)}'`).join(" | ")}`
      : "Invalid input";
    default: return iss.message ?? "Invalid input";
  }
}
