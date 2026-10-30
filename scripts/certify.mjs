#!/usr/bin/env node
/**
 * Check a Lean certificate: the `content` of triz_export format "lean", or of the `certificate`
 * that triz_separate, triz_dynamics, triz_weakness, or triz_behavior returns, saved as a .lean file.
 *
 *   node scripts/certify.mjs [--local | --remote] [--tamper] [--request request.json] <file.lean>...
 *
 * Local (the default; --local says so explicitly): `lake env lean` against theory/, so the
 * certificate's `import CategoricalTriz` is this repo's theory at its Mathlib pin. Build it once
 * with `cd theory && lake exe cache get && lake build`. Without a built theory/, the script stops
 * and says so; it never falls back to the network.
 *
 * Remote (--remote only, an explicit opt-in): the certificate, which holds the model's ids and
 * tables, leaves this machine. It is POSTed with theory/CategoricalTriz.lean inlined ahead of it
 * to the AXLE service (axle.axiommath.ai, or AXLE_API_URL), environment lean-4.32.2, no API key.
 * AXLE replaces the imports with `import Mathlib` at its own Mathlib revision, which may differ
 * from the repo pin, and a remote verdict trusts AXLE to run that Lean faithfully. The MCP server
 * and the hosted Worker never call AXLE; only this script does, and only with --remote.
 *
 * A certificate is accepted only if it is in the generator's grammar (lint: its data lines, its
 * theorems' pinned statements, no command or option in a proof, so no `set_option
 * debug.skipKernelTC`), Lean reports no error and no warning (so no `sorry`), every `theorem` is
 * elaborated (each gets a `#print axioms`), and every axiom it depends on is one of propext,
 * Classical.choice, Quot.sound (so no `native_decide` and no `axiom` of the file's own). Exit
 * status alone is not enough: Lean exits 0 on `sorry`, and AXLE reports `okay`.
 *
 * --tamper also checks that the certificate cannot be bent: with every verdict negated, each
 * verdict theorem must fail where it is declared; with one function's carrier changed, `typed`
 * must fail; with the unsafe set emptied, `escalation` must fail; with the unsafe set filled,
 * `unreachable` must fail; with every row given to the first box and the unsafe set's state
 * conditions filled, so that every state blocks in them, a port target's `unreachable` must fail
 * on its blocked-state conjunct; with no deliverable value acceptable, strict-inclusion and opposed
 * membership witnesses must fail; with no situation allowed, `nonempty` must fail; with the
 * invariant emptied, initial containment must fail; with every port put in one class, each verdict
 * whose proof reads the port classes must fail. A data tamper is tried only where a verdict
 * must fail under it. Errors outside a theorem (a parse error, say) do not count.
 *
 * Locally, all the files and their tampered copies share one Lean process, so the theory's imports
 * load once: each copy sits in a namespace of its own at its own line numbers, and Lean's messages
 * go back to it by line. A copy outside the generator's grammar runs alone, and so does every copy
 * whose messages the batch cannot place (see runLocalBatch).
 *
 * Without --request, this checks the statements about the file's tables. --request binds the
 * manifest to authoritative request JSON, independently compares normalized row/wiring/interface
 * data, then regenerates to detect staleness, before any file reaches Lean; a file that is not
 * bound is not checked. Regeneration is not an encoder-correctness proof.
 * State-only negative claims use invariants over all port valuations. Saturated port-target
 * negatives use finite state invariants against consistent target configurations. Time-varying
 * inputs and negatives supported only to a horizon remain unsupported.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const THEORY_DIR = path.resolve(here, "../theory");
const THEORY_FILE = path.join(THEORY_DIR, "CategoricalTriz.lean");
const OLEAN = path.join(THEORY_DIR, ".lake/build/lib/lean/CategoricalTriz.olean");
export const AXLE_URL = process.env.AXLE_API_URL ?? "https://axle.axiommath.ai";
export const AXLE_ENVIRONMENT = "lean-4.32.2";
export const STANDARD_AXIOMS = ["propext", "Classical.choice", "Quot.sound"];

/**
 * Every `theorem`, fully qualified by the namespaces open at its line. Read from `code(content)`,
 * the text Lean reads, as `lint` does: a `namespace` line inside a comment must not move a theorem
 * into another name, or `#print axioms` would audit the wrong declaration. Empty if the file is
 * not in the generator's lexical subset.
 */
export function theorems(content) {
  const stack = [], out = [];
  (code(content) ?? "").split("\n").forEach((line, i) => {
    let m;
    if ((m = /^namespace (\S+)\s*$/.exec(line))) stack.push(m[1]);
    else if ((m = /^end (\S+)\s*$/.exec(line)) && stack.at(-1) === m[1]) stack.pop();
    else if ((m = /^theorem (\S+) :/.exec(line))) out.push({ name: [...stack, m[1]].join("."), short: m[1], depth: stack.length, line: i + 1 });
  });
  return out;
}

/** The lines a theorem occupies: from its doc comment or declaration up to the next declaration. */
function spans(content) {
  const lines = content.split("\n");
  const codeLines = (code(content) ?? "").split("\n");
  const starts = [];
  lines.forEach((l, i) => { if (/^\/-[-!]/.test(l) || /^(theorem|def|abbrev|namespace|end|#)/.test(codeLines[i] ?? "")) starts.push(i + 1); });
  return theorems(content).map((t) => {
    let from = t.line;
    if (lines[t.line - 2]?.startsWith("/--")) from = t.line - 1;
    const next = starts.find((s) => s > t.line) ?? lines.length + 1;
    return { ...t, from, to: next - 1 };
  });
}

/**
 * The text Lean reads as code: string literals emptied, comments (which nest) removed, line breaks
 * kept. Returns null on anything this scanner might lex differently from Lean: a raw newline in a
 * string, a string not opened after `[`, `,`, space, or `(` (so no `r"…"` or `s!"…"`), a character
 * literal, a «quoted» name, or an unclosed comment. The generator never writes any of these.
 */
export function code(src) {
  let out = "", i = 0, depth = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (depth) {
      if (two === "/-") { depth++; i += 2; } else if (two === "-/") { depth--; i += 2; } else { if (src[i] === "\n") out += "\n"; i++; }
      continue;
    }
    if (two === "/-") { depth = 1; i += 2; continue; }
    if (two === "--") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (src[i] === "'" || src[i] === "«") return null;
    if (src[i] === '"') {
      if (!/[[ ,(]/.test(src[i - 1] ?? "")) return null;
      for (i++; i < src.length && src[i] !== '"'; i++) {
        if (src[i] === "\n") return null;
        if (src[i] === "\\") i++;
      }
      if (i >= src.length) return null;
      out += '""'; i++;
      continue;
    }
    out += src[i++];
  }
  return depth ? null : out;
}

/** Capitalised alphanumeric tokens in Lean's token table at the pin, with all of Mathlib (as AXLE imports it): not names. */
const RESERVED = new Set(["GL", "PiType", "Prop", "Sort", "StateRefT", "Type"]);
const AX = "(space|time|condition|direction|level)";
const NUMS = "!\\[(?:\\d+(?:, \\d+)*)?\\]";
const BOOLS = "!\\[(?:(?:true|false)(?:, (?:true|false))*)?\\]";
const STRS = '!\\[(?:""(?:, "")*)?\\]';
const PAIRS = "!\\[(?:\\(\\d+, \\d+\\)(?:, \\(\\d+, \\d+\\))*)?\\]";
const RATING = "\\.(?:useful|insufficient|excessive|harmful)";
const OPTS = "!\\[(?:(?:none|some \\d+)(?:, (?:none|some \\d+))*)?\\]";
/** A table of tables: rows of `inner`. */
const rows = (inner) => `!\\[(?:${inner}(?:, ${inner})*)?\\]`;
const re = (s) => new RegExp(`^${s}$`);
/** Every declaration line the generator writes at column 0; data only, so the meaning stays in theory/. */
const DECLARATIONS = [
  re('def certificateManifest : String := ""'),
  re(`def (?:firstOnly|secondOnly)\\d+X\\d+ : Input → Value := ${NUMS}`),
  re(`def invariantStates : List \\(Machine → State\\) := \\[(?:${NUMS}(?:, ${NUMS})*)?\\]`),
  re("abbrev invariant : Set \\(\\(Machine → State\\) × \\(Port → Value\\)\\) := \\{c \\| c\\.1 ∈ invariantStates\\}"),
  re("abbrev (?:Box|Port|Fn|Carrier|Demand|Val|Row|Machine|State|Value|Input|Deliverable|Class) := Fin \\d+"),
  re("abbrev Cell := (?:Unit|Fin \\d+(?: × Fin \\d+)*)"),
  re(`def (?:boxId|portId|fnId|carrierId|demandId|valueId) : (?:Box|Port|Fn|Carrier|Demand|Val) → String := ${STRS}`),
  re(`def ${AX}Cell : Fin \\d+ → String := ${STRS}`),
  re('def (?:contradictionId|parameter|conceptId) : String := ""'),
  // Row tables (dynamics and weakness certificates): ids, rows, functions, targets, and the trace.
  re(`def portOwner : Port → String := ${STRS}`),
  re(`def machineId : Machine → String := ${STRS}`),
  re(`def (?:inputId : Input|deliverableId : Deliverable) → String := ${STRS}`),
  re(`def (?:stateId : Machine → State|portValueId : Port → Value|inputValueId : Input → Value|deliverableValueId : Deliverable → Value) → String := ${rows(STRS)}`),
  re(`def rowBox : Row → Box := ${NUMS}`),
  re(`def rowFixes : Row → Port → Bool := ${rows(BOOLS)}`),
  re(`def rowValue : Row → Port → Value := ${rows(NUMS)}`),
  re(`def rowMachine : Row → Option Machine := ${OPTS}`),
  re(`def (?:rowState|rowNext) : Row → State := ${NUMS}`),
  re(`def (?:fnSource|fnTarget) : Fn → Port := ${NUMS}`),
  // The port classes the functions join, and the spanning forest the proofs check (WireClasses.Ok).
  re(`def portClass : Port → Class := ${NUMS}`),
  re(`def classRoot : Class → Port := ${NUMS}`),
  re(`def portLink : Port → Option Fn := ${OPTS}`),
  re(`def portRank : Port → ℕ := ${NUMS}`),
  re("def classes : WireClasses Port Fn Class := ⟨portClass, classRoot, portLink, portRank⟩"),
  re("def system : Sync Box Row Port Machine Fn State Value := ⟨rowBox, rowFixes, rowValue, rowMachine, rowState, rowNext, fnSource, fnTarget⟩"),
  re("def rows : Rows Box Row Port Fn Value := ⟨rowBox, rowFixes, rowValue, fnSource, fnTarget⟩"),
  re(`def (?:initial|unsafeState|safeState) : Machine → State → Bool := ${rows(BOOLS)}`),
  re(`def unsafeValue : Port → Value → Bool := ${rows(BOOLS)}`),
  re(`def (?:acceptable : Deliverable|inputDomain : Input) → Value → Bool := ${rows(BOOLS)}`),
  re(`def trace : Fin \\d+ → \\(Machine → State\\) × \\(Port → Value\\) := ${rows(`\\(${NUMS}, ${NUMS}\\)`)}`),
  re(`def invariant : Fin \\d+ → Machine → State := ${rows(NUMS)}`),
  re(`def reads : Input → Option Port := ${OPTS}`),
  re(`def delivers : Deliverable → Port := ${NUMS}`),
  re(`def portBox : Port → Box := ${NUMS}`),
  re(`def portIsOutput : Port → Bool := ${BOOLS}`),
  re(`def portCarrier : Port → Carrier := ${NUMS}`),
  re("def diagram : Wiring Box Port Fn Carrier where"),
  re(`def rating : Fn → Rating := !\\[(?:${RATING}(?:, ${RATING})*)?\\]`),
  re(`def valueTable : Demand → Val → Bool := !\\[(?:${BOOLS}(?:, ${BOOLS})*)?\\]`),
  re(`def ${AX}Table : Demand → Fin \\d+ → Bool := !\\[(?:${BOOLS}(?:, ${BOOLS})*)?\\]`),
  re("abbrev values \\(i : Demand\\) : Set Val := ofTable \\(valueTable i\\)"),
  re(`abbrev ${AX} \\(i : Demand\\) : Set \\(Fin \\d+\\) := ofTable \\(\\1Table i\\)`),
  re(`abbrev support \\(i : Demand\\) : Set Cell := ${AX} i(?: ×ˢ ${AX} i)*`),
  re("abbrev support \\(_ : Demand\\) : Set Cell := Set\\.univ"),
];
/** The body of `diagram`, line for line: `out` and `inp` read the port tables and nothing else. */
const DIAGRAM = [
  re("  boxes := Set\\.univ"), re("  wires := Set\\.univ"), re(`  src := ${PAIRS}`), re(`  tgt := ${PAIRS}`), re(`  carrier := ${NUMS}`),
  re("  out b p := if portBox p = b ∧ portIsOutput p = true then some \\(portCarrier p\\) else none"),
  re("  inp b p := if portBox p = b ∧ portIsOutput p = false then some \\(portCarrier p\\) else none"),
];
/** The statement each theorem name may carry, so a name means the verdict `certifies` reports. */
function statementOk(name, s) {
  let m;
  const pairSection = (i, j) => `∃ s : Cell → Val, (∀ c ∈ support ${i}, s c ∈ values ${i}) ∧ (∀ c ∈ support ${j}, s c ∈ values ${j})`;
  if (name === "typed") return s === "diagram.Typed";
  if ((m = /^back_\d+$/.exec(name))) return /^Relation\.ReflTransGen diagram\.Acts \(diagram\.tgt (\d+)\)\.1 \(diagram\.src \1\)\.1$/.test(s);
  if ((m = /^loop_\d+$/.exec(name))) {
    return /^\(rating (\d+)\)\.Negative ∧ Relation\.ReflTransGen diagram\.Acts \(diagram\.tgt \1\)\.1 \(diagram\.src \1\)\.1 ∧ Relation\.TransGen diagram\.Acts \(diagram\.src \1\)\.1 \(diagram\.src \1\)\.1$/.test(s);
  }
  if (name === "contradiction") return s === "¬ ∃ v : Val, ∀ i, v ∈ values i";
  if (name === "sharedValue") return s === "∃ v : Val, ∀ i, v ∈ values i";
  if (name === "gluable") return s === "∃ s, IsSection support values s";
  if (name === "notGluable") return s === "¬ ∃ s, IsSection support values s";
  if ((m = /^pair_(\d+)_(\d+)$/.exec(name))) {
    const [, i, j] = m;
    return [`(values ${i} ∩ values ${j}).Nonempty`, pairSection(i, j), `¬ ${pairSection(i, j)}`].includes(s);
  }
  if ((m = /^pair_(\d+)_(\d+)_values$/.exec(name))) return s === `Disjoint (values ${m[1]}) (values ${m[2]})`;
  if (name === "invariantInitial") return s === "system.starts initial ⊆ invariant";
  if (name === "invariantClosed") return s === "Closed system.Step invariant";
  if (name === "invariantDisjoint") return s === "Disjoint invariant {c | ∀ m, unsafeState m (c.1 m) = true}";
  if (name === "invariantSafe") return s === "∀ b ∈ invariant, ∀ m, safeState m (b.1 m) = true";
  if (name === "unreachable") return [
    "∀ a ∈ system.starts initial, ∀ n b, reachIn system.Step n a b → ¬ (∀ m, unsafeState m (b.1 m) = true)",
    "(∀ n, ∀ a ∈ system.starts initial, ∀ b ∈ system.target unsafeState unsafeValue, ¬ reachIn system.Step n a b) ∧ ∀ n, ∀ a ∈ system.starts initial, ∀ b, reachIn system.Step n a b → (∃ v, system.Consistent (b.1, v)) ∨ ¬ ∀ m, unsafeState m (b.1 m) = true",
  ].includes(s);
  if (name === "safetyInvariant") return s === "∀ a ∈ system.starts initial, ∀ n b, reachIn system.Step n a b → ∀ m, safeState m (b.1 m) = true";
  if (name === "escalation") return /^∃ a ∈ system\.starts initial, ∃ b ∈ system\.target unsafeState unsafeValue, reachWithin system\.Step \d+ a b$/.test(s);
  const model = (side) => `${side}.rows.relation inputDomain ${side}.reads ${side}.delivers`;
  if (name === "preserved") return s === `${model("Baseline")} = ${model("Concept")}`;
  if (name === "nonempty") return s === `∃ u y, ${model("Baseline")} u y`;
  const relation = (i) => `(Concept${i}.rows.relation inputDomain Concept${i}.reads Concept${i}.delivers)`;
  if (name === "behaviorPreserved") return s === `${relation(0)} = ${relation(1)}`;
  if (name === "behaviorChanged") return [
    ...[[0, 1], [1, 0]].map(([a, b]) => `∃ u y, ${relation(a)} u y ∧ ¬ ${relation(b)} u y`),
    ...[["Baseline", "Concept"], ["Concept", "Baseline"]].map(([a, b]) => `∃ u y, ${model(a)} u y ∧ ¬ ${model(b)} u y`),
  ].includes(s);
  if ((m = /^equal_(\d+)_(\d+)$/.exec(name))) return m[1] !== m[2] && s === `admits ${relation(m[1])} (accepts acceptable) = admits ${relation(m[2])} (accepts acceptable)`;
  if ((m = /^incomparable_(\d+)_(\d+)$/.exec(name))) return m[1] !== m[2] && s === `¬ AtLeastAsWeak (accepts acceptable) ${relation(m[1])} ${relation(m[2])} ∧ ¬ AtLeastAsWeak (accepts acceptable) ${relation(m[2])} ${relation(m[1])}`;
  if ((m = /^(firstOnly|secondOnly)_(\d+)_(\d+)$/.exec(name))) {
    const [, side,a,b] = m, [x,y] = side === "firstOnly" ? [a,b] : [b,a], u = `${side}${a}X${b}`;
    return a !== b && s === `${u} ∈ admits ${relation(x)} (accepts acceptable) ∧ ${u} ∉ admits ${relation(y)} (accepts acceptable)`;
  }
  if ((m = /^weaker_(\d+)_(\d+)$/.exec(name))) {
    const [, w, t] = m;
    return w !== t && s === `AtLeastAsWeak (accepts acceptable) ${relation(w)} ${relation(t)} ∧ ¬ AtLeastAsWeak (accepts acceptable) ${relation(t)} ${relation(w)}`;
  }
  if ((m = /^count_(\d+)_(\d+)$/.exec(name))) {
    const [, w, t] = m;
    return w !== t && s === `(admitted (accepts acceptable) ${relation(t)}).card < (admitted (accepts acceptable) ${relation(w)}).card`;
  }
  if ((m = new RegExp(`^pair_(\\d+)_(\\d+)_${AX}$`).exec(name))) {
    const [, i, j, a] = m;
    return s === `Disjoint (${a} ${i}) (${a} ${j})` || s === `(${a} ${i} ∩ ${a} ${j}).Nonempty`;
  }
  return false;
}
/** Words and characters a proof line may not contain: commands, options, attributes, metaprogramming. */
const FORBIDDEN = /\b(?:set_option|axiom|variable|include|omit|section|macro|macro_rules|syntax|notation|infixl?|infixr|prefix|postfix|elab|elab_rules|attribute|instance|unsafe|opaque|local|scoped|private|protected|partial|mutual|universe|export|open|import|implemented_by|extern|run_tac|run_cmd|run_elab|initialize|builtin_initialize|deriving|class|structure|inductive|example|theorem|lemma|def|abbrev|namespace|end)\b|[#@$`\\]/;

/**
 * The generator's grammar, checked before Lean runs. A certificate may hold only the generator's
 * line shapes: its data declarations, `diagram`'s body as written, theorems whose names carry
 * their pinned statements, and proof lines free of commands and options. This rules out what the
 * axiom audit cannot see, e.g. `set_option debug.skipKernelTC true`, a hidden `variable`
 * hypothesis, a redefined `out`, or a renamed or restated verdict.
 *
 * With `pinned: false`, a theorem may state anything free of commands and options: the grammar of
 * a tampered copy, whose negated verdicts no longer carry their pinned statements.
 */
export function lint(content, { pinned = true } = {}) {
  const text = code(content);
  if (text === null) return ["the file is not in the generator's lexical subset (strings, comments, quotes)"];
  const problems = [];
  const lines = text.split("\n").map((l) => l.trimEnd());
  const stack = [];
  let block = null; // "diagram" (with the next expected line) or "proof"
  let row = 0;
  lines.forEach((line, n) => {
    const at = `line ${n + 1}`;
    if (!line.trim()) { if (block?.kind === "diagram" && block.next < DIAGRAM.length) problems.push(`${at}: diagram body ends early`); block = null; return; }
    if (line.startsWith("  ")) {
      if (block?.kind === "diagram") {
        if (!DIAGRAM[block.next]?.test(line)) problems.push(`${at}: not the generator's diagram line`);
        block.next++;
      } else if (block?.kind === "proof") {
        if (FORBIDDEN.test(line)) problems.push(`${at}: proof line uses a command, option, or attribute`);
      } else problems.push(`${at}: indented line outside a declaration`);
      return;
    }
    block = null;
    let m;
    if (row++ === 0) { if (line !== "import CategoricalTriz") problems.push(`${at}: the only import is CategoricalTriz`); return; }
    if ((m = /^namespace ([A-Z][A-Za-z0-9]*)$/.exec(line))) {
      if (stack.length > 1 || (stack.length === 1 && !/^(?:(?:Separation|Concept)\d+|Baseline|Concept)$/.test(m[1])) || RESERVED.has(m[1])) problems.push(`${at}: unexpected namespace`);
      stack.push(m[1]);
    } else if ((m = /^end (\S+)$/.exec(line))) {
      if (stack.pop() !== m[1]) problems.push(`${at}: end does not close the open namespace`);
    } else if (line === "open CategoricalTriz") {
      if (stack.length !== 1) problems.push(`${at}: open outside the certificate namespace`);
    } else if ((m = /^theorem (\S+) : (.*) :=$/.exec(line))) {
      if (!stack.length) problems.push(`${at}: theorem outside a namespace`);
      if (pinned ? !statementOk(m[1], m[2]) : FORBIDDEN.test(m[2])) problems.push(`${at}: theorem ${m[1]} does not carry its pinned statement`);
      block = { kind: "proof" };
    } else if (DECLARATIONS.some((d) => d.test(line))) {
      if (!stack.length) problems.push(`${at}: declaration outside a namespace`);
      if (line.startsWith("def diagram ")) block = { kind: "diagram", next: 0 };
    } else problems.push(`${at}: not a line the generator writes`);
  });
  if (stack.length) problems.push("a namespace is left open");
  // Each verdict sits where the generator puts it, under one name: the audit targets are exact.
  const seen = new Set();
  for (const t of theorems(content)) {
    if (seen.has(t.name)) problems.push(`theorem ${t.name} is declared twice`);
    seen.add(t.name);
    const separation = /^(?:contradiction|sharedValue|gluable|notGluable|pair_\d+_\d+(?:_\w+)?)$/.test(t.short);
    if (t.depth !== (separation ? 2 : 1)) problems.push(`line ${t.line}: theorem ${t.short} is not where the generator puts it`);
  }
  return problems;
}

/** `content` with a `#print axioms` for each of its theorems appended: what the acceptance rule runs. */
export const withAxioms = (content) => `${content.trimEnd()}\n\n${theorems(content).map((t) => `#print axioms ${t.name}`).join("\n")}\n`;

let lake;
function lakeBin() {
  if (lake === undefined) {
    lake = ["lake", path.join(os.homedir(), ".elan/bin/lake")].find((bin) => spawnSync(bin, ["--version"], { cwd: THEORY_DIR, stdio: "ignore" }).status === 0) ?? null;
  }
  return lake;
}

/** Local Lean is usable when lake runs and theory/ has been built once. */
export function localLeanAvailable() {
  return Boolean(lakeBin()) && fs.existsSync(OLEAN);
}

/** Why there is no verdict without local Lean: the two ways to get one, and what the second sends where. */
export const NO_LOCAL_LEAN = "local Lean unavailable, and remote checking is off. Either build theory/ (install elan, then "
  + "`cd theory && lake exe cache get && lake build`), or pass --remote (mode \"remote\") to send the certificate, which "
  + `holds the model's ids and tables, with theory/CategoricalTriz.lean to AXLE at ${AXLE_URL}.`;

let rebuilt = false;
/**
 * One `lake env lean --json` on `text` against theory/: its messages, at 1-based lines of `text`,
 * and whether Lean ran cleanly (every output line a message, exit 0, or 1 with an error reported).
 */
function runLean(text) {
  const bin = lakeBin();
  if (!bin || !fs.existsSync(OLEAN)) throw new Error(NO_LOCAL_LEAN);
  if (!rebuilt) {
    // Bring the theory olean up to date with the source (fast when it already is).
    const b = spawnSync(bin, ["build", "CategoricalTriz"], { cwd: THEORY_DIR, encoding: "utf8" });
    if (b.status !== 0) throw new Error(`lake build CategoricalTriz failed:\n${b.stdout}${b.stderr}`);
    rebuilt = true;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "triz-cert-"));
  const file = path.join(dir, "Certificate.lean");
  try {
    fs.writeFileSync(file, text);
    const r = spawnSync(bin, ["env", "lean", "--json", file], { cwd: THEORY_DIR, encoding: "utf8", maxBuffer: 64 << 20 });
    const messages = [];
    let clean = !r.error && !r.signal;
    for (const line of (r.stdout ?? "").split("\n")) {
      if (!line.trim()) continue;
      let m;
      try { m = JSON.parse(line); } catch { messages.push({ severity: "error", line: 0, text: line }); clean = false; continue; }
      messages.push({ severity: m.severity === "information" ? "info" : m.severity, line: m.pos?.line ?? 0, text: m.data });
    }
    const errors = messages.some((m) => m.severity === "error");
    if (r.status !== 0 && !errors) messages.push({ severity: "error", line: 0, text: `lean exited ${r.status ?? r.signal}: ${r.stderr ?? r.error}` });
    return { messages, clean: clean && (r.status === 0 || (r.status === 1 && errors)) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Run Lean on `content` against theory/; messages carry 1-based lines of `content`. */
export function runLocal(content) {
  return { mode: "local", messages: runLean(content).messages, toolProblems: [] };
}

const BATCH = "TrizBatch";

/**
 * Whether `content` may share a Lean process with others: it is in the generator's grammar, bar
 * the pinned statements, so it declares nothing outside its namespaces (no instance, attribute,
 * option, or `open` that would outlive them) and closes every namespace it opens; and it never
 * names the batch's namespaces, so it cannot reach another file's declarations.
 */
function shareable(content) {
  return content.startsWith("import CategoricalTriz\n") && !content.includes(BATCH) && lint(content, { pinned: false }).length === 0;
}

/**
 * One Lean file for several. File k's import line becomes `namespace TrizBatch<k>`, so its lines
 * keep their numbers, counted from `start`, and its declarations their names under that prefix; a
 * sentinel `#print` after its last line shows Lean read it to the end, and `end TrizBatch<k>`
 * closes it.
 */
export function batchFile(texts) {
  const lines = ["import CategoricalTriz"];
  const jobs = texts.map((text, k) => {
    const body = text.split("\n");
    const prefix = `${BATCH}${k}`, start = lines.length + 1;
    lines.push(`namespace ${prefix}`, ...body.slice(1), `#print "${prefix} read"`, `end ${prefix}`);
    return { prefix, start, last: start + body.length - 1 };
  });
  return { text: `${lines.join("\n")}\n`, jobs };
}

/**
 * Each file's messages from the batch, at the file's own lines and with the prefix taken out of
 * names; null where they cannot all be placed: a message on the file's wrapper lines or a missing
 * sentinel, and for every file a message outside all of them or a run that was not clean.
 */
export function splitBatch(layout, messages, clean = true) {
  const out = layout.jobs.map(() => ({ messages: [], read: false, lost: false }));
  let lost = !clean;
  for (const m of messages) {
    const k = layout.jobs.findIndex((j) => m.line >= j.start && m.line <= j.last + 2);
    if (k < 0) { lost = true; continue; }
    const j = layout.jobs[k], o = out[k];
    if (m.line === j.last + 1 && m.severity === "info" && m.text.trim() === `${j.prefix} read` && !o.read) o.read = true;
    else if (m.line === j.start || m.line > j.last) o.lost = true;
    else o.messages.push({ ...m, line: m.line - j.start + 1, text: m.text.replaceAll(`${j.prefix}.`, "") });
  }
  return out.map((o) => (lost || o.lost || !o.read ? null : o.messages));
}

/** What Lean runs for a job: a certificate with its `#print axioms` (`audit`), or a tampered copy as it is. */
const leanText = (job) => (job.audit ? withAxioms(job.content) : job.content);

/**
 * Run Lean on several jobs against theory/, as runLocal would one by one: every shareable job in
 * one process, the rest alone, and alone again any job the batch's messages cannot be placed for.
 */
export function runLocalBatch(jobs) {
  const runs = [];
  const shared = jobs.flatMap((j, i) => (shareable(j.content) ? [i] : []));
  if (shared.length > 1) {
    const layout = batchFile(shared.map((i) => leanText(jobs[i])));
    const r = runLean(layout.text);
    splitBatch(layout, r.messages, r.clean).forEach((messages, n) => {
      if (messages) runs[shared[n]] = { mode: "local", messages, toolProblems: [], batched: true };
    });
  }
  return jobs.map((j, i) => runs[i] ?? runLocal(leanText(j)));
}

/** Run Lean on `content` through AXLE, with the theory inlined; lines are mapped back to `content`. */
export async function runRemote(content) {
  const split = (src) => {
    const lines = src.split("\n");
    return { imports: lines.filter((l) => /^import /.test(l)), body: lines.filter((l) => !/^import /.test(l)) };
  };
  const theory = split(fs.readFileSync(THEORY_FILE, "utf8"));
  const cert = split(content);
  const imports = [...new Set([...theory.imports, ...cert.imports.filter((l) => l.trim() !== "import CategoricalTriz")])];
  const SENTINEL = "-- triz certificate starts here";
  const sent = [...imports, ...theory.body, SENTINEL, ...cert.body].join("\n");
  const res = await fetch(`${AXLE_URL}/api/v1/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-Source": "triz-skill-certify" },
    body: JSON.stringify({ content: sent, environment: AXLE_ENVIRONMENT }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AXLE ${res.status}: ${text.slice(0, 500)}`);
  const r = JSON.parse(text.trim().split("\n")[0]);
  if (r.user_error || r.internal_error || r.error) throw new Error(`AXLE: ${r.user_error ?? r.internal_error ?? r.error}`);
  // AXLE may rewrite the header, so find the certificate by the sentinel in what it checked. Line n
  // of the certificate (1-based, after its import lines) is the sentinel's line + n - dropped.
  const checked = (typeof r.content === "string" && r.content.includes(SENTINEL) ? r.content : sent).split("\n");
  const dropped = content.split("\n").findIndex((l) => !/^import /.test(l));
  const offset = checked.indexOf(SENTINEL) + 1 - dropped;
  const messages = [];
  for (const [severity, list] of [["error", r.lean_messages?.errors], ["warning", r.lean_messages?.warnings], ["info", r.lean_messages?.infos]]) {
    for (const s of list ?? []) {
      const m = /^-:(\d+):\d+(?:-\d+:\d+)?: (?:error|warning|info)(?:\([^)]*\))?: ([\s\S]*)$/.exec(s);
      messages.push({ severity, line: m ? Number(m[1]) - offset : 0, text: (m ? m[2] : s).trimEnd() });
    }
  }
  const toolProblems = [
    ...(r.tool_messages?.errors ?? []),
    ...(r.tool_messages?.warnings ?? []),
    ...(r.failed_declarations ?? []).map((d) => `failed declaration ${d}`),
  ];
  return { mode: "remote", messages, toolProblems, info: r.info };
}

/** The acceptance rule: no error, no warning, every theorem elaborated, standard axioms only. */
export function accept(content, run) {
  const problems = [...run.toolProblems];
  for (const m of run.messages) if (m.severity === "error" || m.severity === "warning") problems.push(`line ${m.line}: ${m.severity}: ${m.text}`);
  const axioms = new Map();
  for (const m of run.messages) {
    const dep = /^'(.+)' depends on axioms: \[([\s\S]*)\]$/.exec(m.text);
    if (dep) axioms.set(dep[1], dep[2].split(",").map((a) => a.trim()).filter(Boolean));
    const none = /^'(.+)' does not depend on any axioms$/.exec(m.text);
    if (none) axioms.set(none[1], []);
  }
  const certified = [];
  for (const t of theorems(content)) {
    const used = axioms.get(t.name);
    if (!used) { problems.push(`${t.name}: not elaborated (no #print axioms output)`); continue; }
    const extra = used.filter((a) => !STANDARD_AXIOMS.includes(a));
    if (extra.length) problems.push(`${t.name}: depends on non-standard axioms ${extra.join(", ")}`);
    else certified.push(t.name);
  }
  if (!theorems(content).length) problems.push("no theorem to certify");
  return { ok: problems.length === 0, mode: run.mode, certified, problems };
}

/** Lean runs locally unless the caller opts in to AXLE with mode "remote"; there is no fallback. */
export async function check(content, opts = {}) {
  return (await checkAll({ certificates: [content] }, opts)).certificates[0];
}

/**
 * Check certificates and tampered copies together, with the verdicts that check and checkTampered
 * give one at a time. A certificate outside the grammar never reaches Lean. Locally, the rest
 * share one Lean process where runLocalBatch can place their messages (`batched` counts them);
 * remotely, each goes to AXLE alone.
 */
export async function checkAll({ certificates = [], tampered = [] }, { mode } = {}) {
  const grammar = certificates.map((c) => lint(c));
  const jobs = [
    ...certificates.flatMap((content, i) => (grammar[i].length ? [] : [{ content, audit: true }])),
    ...tampered.map((v) => ({ content: v.content, audit: false })),
  ];
  const runs = [];
  if (mode === "remote") for (const j of jobs) runs.push(await runRemote(leanText(j)));
  else runs.push(...runLocalBatch(jobs));
  let n = 0;
  return {
    certificates: certificates.map((content, i) => {
      if (grammar[i].length) return { ok: false, mode: "grammar", certified: [], problems: grammar[i] };
      const run = runs[n++];
      return { ...accept(content, run), info: run.info };
    }),
    tampered: tampered.map((v) => rejected(v, runs[n++])),
    batched: runs.filter((r) => r.batched).length,
  };
}

/**
 * Tamper variants: every verdict negated; one function's carrier changed; the unsafe set emptied
 * or filled; every state blocked in the unsafe states; nothing acceptable; no situation allowed;
 * the invariant emptied; the port classes merged. A
 * data tamper is kept only where some verdict must fail under it: emptying the unsafe set leaves
 * an unreachable verdict true. Filling it puts every listed state in the unsafe set's state
 * conditions, so a port target's unreachable verdict fails at a listed state that admits a
 * valuation, which is then in the target, or at one that blocks. Giving every row to the first box
 * leaves every other box without one, so every state blocks and the target is empty; with the
 * unsafe set's state conditions filled, only the blocked-state conjunct of a port target's
 * unreachable verdict can fail, and it must.
 */
export function tamperVariants(content) {
  const variants = [{
    name: "every verdict negated",
    content: content.replace(/^(theorem \S+ : )(.*) :=$/gm, "$1¬ ($2) :="),
    mustFail: theorems(content).map((t) => t.name),
  }];
  const carrier = /^( {2}carrier := !\[)(\d+)/m.exec(content);
  const carriers = Number(/^abbrev Carrier := Fin (\d+)$/m.exec(content)?.[1] ?? 0);
  if (carrier && carriers > 1) {
    variants.push({
      name: "function 0's carrier changed",
      content: content.replace(carrier[0], `${carrier[1]}${(Number(carrier[2]) + 1) % carriers}`),
      mustFail: theorems(content).filter((t) => t.name.endsWith(".typed") && t.name.split(".").length === 2).map((t) => t.name),
    });
  }
  // A data tamper per row-table kind: every entry of the table set to false, or to true.
  const set = (pattern, to) => content.replace(pattern, (line) => line.replace(to ? /\bfalse\b/g : /\btrue\b/g, String(to)));
  const verdicts = (short) => theorems(content).filter((t) => short.test(t.short) && t.depth === 1).map((t) => t.name);
  const data = (name, tampered, mustFail) => { if (tampered !== content && mustFail.length) variants.push({ name, content: tampered, mustFail }); };
  data("the unsafe set emptied", set(/^def (?:unsafeState|unsafeValue) : .*$/gm, false), verdicts(/^escalation$/));
  const names = new Set(theorems(content).map((t) => t.name));
  const unsafeProofs = verdicts(/^unreachable$/).map((name) => {
    const disjoint = name.replace(/\.unreachable$/, ".invariantDisjoint");
    return names.has(disjoint) ? disjoint : name;
  });
  data("the unsafe set filled", set(/^def (?:unsafeState|unsafeValue) : .*$/gm, true), unsafeProofs);
  const rowBox = /^def rowBox : Row → Box := !\[(.*)\]$/m.exec(content);
  if (rowBox && /[1-9]/.test(rowBox[1]) && /^def invariant : Fin \d+ → Machine → State := /m.test(content)) {
    const blocked = set(/^def unsafeState : .*$/m, true).replace(rowBox[0], `def rowBox : Row → Box := ![${rowBox[1].split(", ").map(() => "0").join(", ")}]`);
    data("every state blocked in the unsafe states", blocked, verdicts(/^unreachable$/));
  }
  data("no deliverable value acceptable", set(/^def acceptable : Deliverable → Value → Bool := .*$/m, false), verdicts(/^(?:weaker|count|firstOnly|secondOnly)_\d+_\d+$/));
  data("no situation allowed", set(/^def inputDomain : Input → Value → Bool := .*$/m, false), verdicts(/^nonempty$/));
  data("invariant emptied", content.replace(/^def invariantStates : List \(Machine → State\) := .*$/m, "def invariantStates : List (Machine → State) := []"), verdicts(/^invariantInitial$/));
  // The class witness: in each namespace with two classes or more, every port put in class 0. That
  // joins ports no function joins, so the forest check fails, and so must every verdict whose proof
  // reads those classes.
  const merged = new Set(), stack = [];
  for (const line of content.split("\n")) {
    let m;
    if ((m = /^namespace (\S+)$/.exec(line))) stack.push(m[1]);
    else if ((m = /^end (\S+)$/.exec(line)) && stack.at(-1) === m[1]) stack.pop();
    else if ((m = /^abbrev Class := Fin (\d+)$/.exec(line)) && Number(m[1]) >= 2) merged.add(stack.slice(1).join("."));
  }
  stack.length = 0;
  const zeroed = content.split("\n").map((line) => {
    let m;
    if ((m = /^namespace (\S+)$/.exec(line))) stack.push(m[1]);
    else if ((m = /^end (\S+)$/.exec(line)) && stack.at(-1) === m[1]) stack.pop();
    else if (/^def portClass : Port → Class := /.test(line) && merged.has(stack.slice(1).join("."))) return line.replace(/\d+(?=[,\]])/g, "0");
    return line;
  }).join("\n");
  const lines = content.split("\n");
  const reads = (proof) => [...merged].some((ns) => (ns ? proof.includes(`${ns}.classes`) : /\(q := classes\)/.test(proof)));
  data("port classes merged", zeroed, spans(content).filter((t) => t.depth === 1 && reads(lines.slice(t.line, t.to).join("\n"))).map((t) => t.name));
  return variants;
}

/**
 * Check that a tampered certificate fails: Lean reports an error inside each theorem that must
 * fail, and every error lies inside some theorem (none in the data, none a parse error).
 */
export async function checkTampered(variant, opts = {}) {
  return (await checkAll({ tampered: [variant] }, opts)).tampered[0];
}

/** The rule checkTampered applies to Lean's run on a tampered copy. */
export function rejected(variant, run) {
  const errors = run.messages.filter((m) => m.severity === "error");
  const ranges = spans(variant.content);
  const problems = [];
  for (const name of variant.mustFail) {
    const s = ranges.find((r) => r.name === name);
    if (!s || !errors.some((e) => e.line >= s.from && e.line <= s.to)) problems.push(`${name}: still checks after tampering`);
  }
  for (const e of errors) {
    if (!ranges.some((r) => e.line >= r.from && e.line <= r.to)) problems.push(`error outside any theorem, line ${e.line}: ${e.text.split("\n")[0]}`);
  }
  if (!errors.length) problems.push("no error at all");
  return { ok: problems.length === 0, mode: run.mode, failed: errors.length, problems };
}

/** Canonical authoritative request, independent of the TypeScript certificate generator. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v) ?? "null").join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
/** Remove comments while preserving literal strings and line numbers. No model text executes. */
function dataCode(src) {
  let out="",depth=0,quoted=false;
  for(let i=0;i<src.length;i++) {
    const c=src[i],two=src.slice(i,i+2);
    if(quoted) { out+=c; if(c==="\\") out+=src[++i]??""; else if(c==='"') quoted=false; }
    else if(depth) { if(two==="/-") {depth++;i++;} else if(two==="-/") {depth--;i++;} else if(c==="\n") out+="\n"; }
    else if(two==="/-") {depth=1;i++;} else if(two==="--") {while(i<src.length&&src[i]!=="\n") i++;if(i<src.length) out+="\n";}
    else {out+=c;if(c==='"') quoted=true;}
  }
  return out;
}
/** Read literal tables without evaluating Lean, JavaScript, or model text. */
function literalTables(content) {
  const tables = new Map(), stack = [];
  for (const line of dataCode(content).split("\n")) {
    let m;
    if ((m = /^namespace ([A-Z][A-Za-z0-9]*)$/.exec(line))) stack.push(m[1]);
    else if (/^end /.test(line)) stack.pop();
    else if ((m = /^def (\w+) : .* := (.*)$/.exec(line))) {
      const rhs = m[2];
      if (rhs.startsWith('"') || rhs.startsWith("![") || /^\[(?:!\[|\])/.test(rhs)) {
        // Strings are kept intact while vector notation outside them is replaced.
        let json = "", quoted = false, escaped = false;
        for (let i = 0; i < rhs.length; i++) { const c = rhs[i]; if (quoted) { json += c; if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '\"') quoted = false; } else if (c === '\"') { quoted = true; json += c; } else if (c === "!" && rhs[i+1] === "[") {} else json += c; }
        try { tables.set([...stack.slice(1),m[1]].join("."), JSON.parse(json)); } catch { /* Other data (Option, Rating, tuples) use dedicated comparisons. */ }
      }
    }
  }
  return tables;
}

/** Compare the request to normalized literal tables with a separate direct encoder.
This checks correspondence and request binding; it is not a proof of the TypeScript encoder. */
export function checkCorrespondence(content, request) {
  if (!request || typeof request !== "object" || !["model","separation","weakness","behavior","dynamics"].includes(request.kind)) return ["authoritative request needs a supported certificate kind"];
  if (code(content) === null) return ["certificate is outside the lexical data subset"];
  content = dataCode(content);
  const problems = [], tables = literalTables(content), manifestText = tables.get("certificateManifest");
  let manifest;
  try { manifest = JSON.parse(manifestText); } catch { return ["missing or invalid certificate manifest"]; }
  const normalized = { ...request, ...(["behavior","weakness"].includes(request.kind) ? { scope: request.scope ?? "upstream" } : {}) };
  const source = createHash("sha256").update(canonical(normalized)).digest("hex");
  const scope = ["model","separation"].includes(request.kind) ? "structural" : request.kind === "dynamics" ? "dynamics-upstream" : normalized.scope;
  for (const [key,value] of Object.entries({ format: "triz-certificate-v2", kind: request.kind, source, schema: "function-model-v1", generator: "triz-cert-2", theory: "CategoricalTriz/v2", theorySource: createHash("sha256").update(fs.readFileSync(THEORY_FILE)).digest("hex"), schemaSource: createHash("sha256").update(fs.readFileSync(path.resolve(here,"../src/act.ts"))).digest("hex"), lean: "4.32.2", mathlib: "v4.32.2", scope })) if (manifest[key] !== value) problems.push(`manifest ${key} does not match the authoritative request or supported pin`);
  const outer = /^namespace ([A-Z][A-Za-z0-9]*)$/m.exec(content)?.[1]; if (manifest.namespace !== outer) problems.push("manifest namespace differs from the certificate namespace");
  const normalizedIds = (v) => typeof v === "string" ? [...v].map((ch)=>{const n=ch.codePointAt(0);return /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u.test(ch)&&(n>0xffff||(n>=0xd800&&n<=0xdfff))?"\ufffd":ch;}).join("") : Array.isArray(v) ? v.map(normalizedIds) : v;
  const eq = (name,value) => { if (canonical(tables.get(name)) !== canonical(normalizedIds(value))) problems.push(`table ${name} does not encode the authoritative request`); };
  const raw = (name,value) => { const found = [...content.matchAll(new RegExp(`^def ${name} : .* := (.*)$`, "gm"))].map((m) => m[1]); if (found.length !== 1 || found[0] !== value) problems.push(`table ${name} does not encode the authoritative request`); };
  const key = (b,side,p) => JSON.stringify([b,side,p]);
  const portsOf = (boxes,extra=[]) => { const out = []; for (const b of boxes) for (const [side,ps] of [["in",b.inputs??[]],["out",b.outputs??[]]]) for (const p of ps) out.push({box:b.id,side,port:p.id,carrier:p.carrier}); for (const p of extra) if (!out.some((q) => q.box === p.box && q.side === "in" && q.port === p.port)) out.push({...p,side:"in"}); return out; };
  if (request.kind === "model") {
    const m = request.model, ports = portsOf(m.boxes), pi = new Map(ports.map((p,i)=>[key(p.box,p.side,p.port),i])), bi = new Map(m.boxes.map((b,i)=>[b.id,i]));
    eq("boxId",m.boxes.map((b)=>b.id)); eq("portId",ports.map((p)=>p.port)); eq("fnId",m.wires.map((w)=>w.id)); eq("carrierId",m.carriers.map((c)=>c.id));
    eq("portBox",ports.map((p)=>bi.get(p.box))); eq("portIsOutput",ports.map((p)=>p.side === "out")); eq("portCarrier",ports.map((p)=>m.carriers.findIndex((c)=>c.id === p.carrier)));
    for (const [name,value] of [["src",m.wires.map((w)=>`(${bi.get(w.from.box)}, ${pi.get(key(w.from.box,"out",w.from.port))})`)], ["tgt",m.wires.map((w)=>`(${bi.get(w.to.box)}, ${pi.get(key(w.to.box,"in",w.to.port))})`)], ["carrier",m.wires.map((w)=>m.carriers.findIndex((c)=>c.id===w.carrier))]]) if (!content.includes(`  ${name} := ![${value.join(", ")}]`)) problems.push(`diagram ${name} does not encode the authoritative request`);
    raw("rating",`![${m.wires.map((w)=>`.${w.polarity}`).join(", ")}]`);
  }
  const contradictions=request.kind==="separation"?[request.contradiction]:request.kind==="model"?request.model.contradictions??[]:[];
  for (const [i,pc] of contradictions.entries()) {
    const prefix=`Separation${i}.`, values=[...new Set(pc.demands.flatMap((d)=>d.values))].sort();
    eq(prefix+"contradictionId",pc.id); eq(prefix+"parameter",pc.parameter); eq(prefix+"demandId",pc.demands.map((d)=>d.id)); eq(prefix+"valueId",values);
    eq(prefix+"valueTable",pc.demands.map((d)=>values.map((v)=>d.values.includes(v))));
    for (const axis of ["space","time","condition","direction","level"]) {
      const cells=[...new Set(pc.axes?.[axis]??pc.demands.flatMap((d)=>d[axis]??[]))].sort();
      if (!cells.length) continue;
      eq(prefix+axis+"Cell",cells); eq(prefix+axis+"Table",pc.demands.map((d)=>cells.map((c)=>(d[axis]??cells).includes(c))));
    }
  }
  if (["behavior","weakness","dynamics"].includes(request.kind)) {
    const concepts = request.kind === "weakness" ? request.concepts : request.kind === "behavior" ? [{model:request.baseline,id:"baseline"},{model:request.concept,id:"concept"}] : [{model:request.model}];
    const delivered = (m) => m.boxes.filter((b)=>b.role === "product").flatMap((b)=>(b.inputs??[]).filter((p)=>m.wires.some((w)=>w.to.box===b.id&&w.to.port===p.id&&w.polarity!=="harmful")).map((p)=>({box:b.id,port:p.id,carrier:p.carrier})));
    const target = delivered(concepts[0].model), orders = new Map();
    const toBaseline = (box) => request.kind === "behavior" && Object.hasOwn(request.boxMap ?? {}, box) ? request.boxMap[box] : box;
    const endpoint = (p) => JSON.stringify([p.box, p.port, p.carrier]);
    const offered = request.kind === "behavior" ? new Map(delivered(request.concept).map((p) => [endpoint({ ...p, box: toBaseline(p.box) }), p])) : null;
    if (offered && target.some((p) => !offered.has(endpoint(p)))) return [...problems, "the concept does not supply the baseline deliverable interface"];
    const order = (id) => { if (!orders.has(id)) orders.set(id,[...new Set(concepts.flatMap(({model:m})=>m.carriers.find((c)=>c.id===id)?.values??[]))].sort()); return orders.get(id); };
    const entries = concepts.map(({model:m,id},ci) => {
      const observe = request.kind === "behavior" && ci === 1 ? target.map((p) => offered.get(endpoint(p))) : target;
      const namespace = request.kind === "dynamics" ? "" : request.kind === "behavior" ? ["Baseline", "Concept"][ci] : `Concept${ci}`;
      const rename = request.kind === "behavior" && ci === 1 ? toBaseline : (box) => box;
      const reached = new Set(request.kind === "dynamics" ? [...m.boxes.filter((b)=>b.transition).map((b)=>b.id),...[...request.spec.unsafe??[],...request.spec.safe??[],...(request.spec.separation??[]).flatMap((d)=>d.where)].map((c)=>c.box)] : normalized.scope === "whole" ? m.boxes.map((b)=>b.id) : m.wires.filter((w)=>observe.some((d)=>d.box===w.to.box&&d.port===w.to.port)).map((w)=>w.from.box));
      for (let size=-1;size!==reached.size;) { size=reached.size; for (const w of m.wires) if (reached.has(w.to.box)) reached.add(w.from.box); }
      const boxes=m.boxes.filter((b)=>reached.has(b.id)), ports=portsOf(boxes,request.kind==="dynamics"?[]:observe), pi=new Map(ports.map((p,i)=>[key(p.box,p.side,p.port),i]));
      const wires=m.wires.filter((w)=>pi.has(key(w.to.box,"in",w.to.port))), names=ports.map((p)=>request.kind==="dynamics"?m.carriers.find((c)=>c.id===p.carrier).values:order(p.carrier));
      const rows=boxes.flatMap((b,bi)=>[...b.behavior??[],...b.transition??[]].map((row)=>({box:bi,fixes:ports.map((p)=>p.box===b.id),values:ports.map((p,i)=>p.box===b.id?names[i].indexOf((p.side==="in"?row.in:row.out)[p.port]):0),row,b})));
      return {m,id,ci,namespace,rename,observe,boxes,ports,pi,wires,names,rows};
    });
    const valueWidth=Math.max(1,...entries.flatMap((e)=>e.names.map((n)=>n.length)));
    if (request.kind !== "dynamics") {
      const situations = [];
      for (const e of entries) {
        const fed = new Set(e.wires.map((w)=>e.pi.get(key(w.to.box,"in",w.to.port))));
        for (const [i,p] of e.ports.entries()) if (p.side === "in" && !fed.has(i) && !situations.some((q)=>q.box===e.rename(p.box)&&q.port===p.port)) situations.push({...p,box:e.rename(p.box),declared:e.m.carriers.find((c)=>c.id===p.carrier).values});
      }
      eq("inputId",situations.map((p)=>`${p.box}.${p.port}`)); eq("deliverableId",target.map((p)=>`${p.box}.${p.port}`));
      eq("inputValueId",situations.map((p)=>[...order(p.carrier),...Array(valueWidth-order(p.carrier).length).fill("")]));
      eq("deliverableValueId",target.map((p)=>[...order(p.carrier),...Array(valueWidth-order(p.carrier).length).fill("")]));
      eq("inputDomain",situations.map((p)=>Array.from({length:valueWidth},(_,v)=>v<order(p.carrier).length && p.declared.includes(order(p.carrier)[v]))));
      for (const e of entries) {
        const fed = new Set(e.wires.map((w)=>e.pi.get(key(w.to.box,"in",w.to.port))));
        const expected = `![${situations.map((q)=>{const p=e.ports.findIndex((p,i)=>p.side==="in"&&!fed.has(i)&&e.rename(p.box)===q.box&&p.port===q.port);return p<0?"none":`some ${p}`;}).join(", ")}]`;
        const block=content.split(`namespace ${e.namespace}\n`)[1]?.split(`end ${e.namespace}\n`)[0]??"";
        if (!block.includes(`def reads : Input → Option Port := ${expected}`)) problems.push(`table ${e.namespace}.reads does not encode the authoritative request`);
        eq(`${e.namespace}.delivers`,e.observe.map((p)=>e.pi.get(key(p.box,"in",p.port))));
      }
      if (request.kind === "weakness") eq("acceptable",target.map((p)=>{
        const entry=request.acceptable.find((a)=>a.box===p.box&&a.port===p.port)??request.acceptable.find((a)=>a.carrier===p.carrier);
        const levels=concepts[0].model.carriers.find((c)=>c.id===p.carrier).levels??[];
        const accepted=entry?.values??levels.filter((l)=>(entry.at_least===undefined||l.from>=entry.at_least)&&(entry.below===undefined||l.from<entry.below)).map((l)=>l.value);
        return Array.from({length:valueWidth},(_,v)=>v<order(p.carrier).length&&accepted.includes(order(p.carrier)[v]));
      }));
    }
    for (const e of entries) {
      const prefix=e.namespace ? `${e.namespace}.` : "", set=(n,v)=>eq(prefix+n,v);
      set("boxId",e.boxes.map((b)=>b.id)); set("portOwner",e.ports.map((p)=>p.box)); set("portId",e.ports.map((p)=>p.port)); set("fnId",e.wires.map((w)=>w.id));
      set("portValueId",e.names.map((n)=>[...n,...Array(valueWidth-n.length).fill("")]));
      set("rowBox",e.rows.map((r)=>r.box)); set("rowFixes",e.rows.map((r)=>r.fixes)); set("rowValue",e.rows.map((r)=>r.values));
      set("fnSource",e.wires.map((w)=>e.pi.get(key(w.from.box,"out",w.from.port)))); set("fnTarget",e.wires.map((w)=>e.pi.get(key(w.to.box,"in",w.to.port))));
      if (request.kind==="dynamics") { const machines=e.boxes.filter((b)=>b.transition); set("rowState",e.rows.map((r)=>r.b.transition?r.b.state.indexOf(r.row.state):0)); set("rowNext",e.rows.map((r)=>r.b.transition?r.b.state.indexOf(r.row.next):0)); raw("rowMachine",`![${e.rows.map((r)=>r.b.transition?`some ${machines.findIndex((b)=>b.id===r.b.id)}`:"none").join(", ")}]`); const width=Math.max(1,...machines.map((b)=>b.state.length)); eq("initial",machines.map((b)=>Array.from({length:width},(_,i)=>(request.spec.initial?.[b.id]??b.initial).includes(b.state[i])))); eq("machineId",machines.map((b)=>b.id)); eq("stateId",machines.map((b)=>[...b.state,...Array(width-b.state.length).fill("")]));
        const stateTarget=(conditions)=>machines.map((b)=>Array.from({length:width},(_,i)=>(tables.has("invariantStates")||i<b.state.length)&&conditions.filter((c)=>c.box===b.id&&"state" in c).every((c)=>c.state.includes(b.state[i]))));
        if (request.spec.unsafe) {
          eq("unsafeState",stateTarget(request.spec.unsafe));
          if (!tables.has("invariantStates")) eq("unsafeValue",e.ports.map((p,j)=>Array.from({length:valueWidth},(_,i)=>i<e.names[j].length&&request.spec.unsafe.filter((c)=>c.box===p.box&&c.port===p.port&&"values" in c).every((c)=>c.values.includes(e.names[j][i])))));
        }
        if (request.spec.safe && tables.has("invariantStates")) eq("safeState",stateTarget(request.spec.safe)); }
    }
  }
  return problems;
}

/**
 * The binding half of checkRequest, without Lean: the problems that keep `content` from being bound
 * to `request`, none when it is. Regeneration detects generator staleness; the independent table
 * checks above check correspondence.
 */
export function bindRequest(content, request) {
  let problems;
  try { problems = [...lint(content),...checkCorrespondence(content, request)]; }
  catch (e) { return [`malformed authoritative request: ${e.message ?? e}`]; }
  if (problems.length) return problems;
  const manifest = JSON.parse(literalTables(content).get("certificateManifest"));
  const program = `import fs from "node:fs"; import * as c from "./src/act-cert.ts"; const r=JSON.parse(fs.readFileSync(0,"utf8")); const o={namespace:${JSON.stringify(manifest.namespace)},scope:r.scope,maxStates:r.maxStates,priors:r.priors,jointPrior:r.jointPrior,boxMap:r.boxMap}; const out=r.kind==="model"?c.modelCertificate(r.model,o):r.kind==="separation"?c.separationCertificate(r.contradiction,o):r.kind==="dynamics"?c.dynamicsCertificate(r.model,r.spec,o):r.kind==="weakness"?c.weaknessCertificate(r.concepts,r.acceptable,o):r.kind==="behavior"?c.behaviorCertificate(r.baseline,r.concept,o):null; process.stdout.write(JSON.stringify(out));`;
  const regen = spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",program],{cwd:path.resolve(here,".."),input:JSON.stringify(request),encoding:"utf8",maxBuffer:64<<20});
  if (regen.status !== 0) return [`cannot regenerate the authoritative request: ${regen.stderr.trim()}`];
  let generated; try { generated=JSON.parse(regen.stdout); } catch { return ["generator returned invalid JSON"]; }
  if (!generated?.ok || generated.content !== content) return ["certificate is stale or differs from current request regeneration; this is a staleness check, not an encoder-correctness proof"];
  return [];
}

/** Bind `content` to `request` (bindRequest), then check it as check does; an unbound file never reaches Lean. */
export async function checkRequest(content, request, opts = {}) {
  const problems = bindRequest(content, request);
  if (problems.length) return { ok:false,mode:"binding",certified:[],problems };
  return check(content,opts);
}

async function main(argv) {
  const remote = argv.includes("--remote");
  const tamper = argv.includes("--tamper");
  const requestAt = argv.indexOf("--request");
  const requestFile = requestAt < 0 ? undefined : argv[requestAt + 1];
  const files = argv.filter((a, i) => !a.startsWith("--") && (requestAt < 0 || i !== requestAt + 1));
  if (!files.length || (remote && argv.includes("--local"))) {
    console.error("usage: node scripts/certify.mjs [--local | --remote] [--tamper] [--request request.json] <file.lean>...");
    return 2;
  }
  if (requestAt >= 0 && (!requestFile || requestFile.startsWith("--"))) throw new Error("--request needs an authoritative request JSON file");
  const request = requestFile ? JSON.parse(fs.readFileSync(requestFile, "utf8")) : undefined;
  if (remote) {
    console.log(`Sending data off this machine (--remote): each certificate, with the model's ids and tables, and`);
    console.log(`theory/CategoricalTriz.lean go to AXLE at ${AXLE_URL} (${AXLE_ENVIRONMENT}). The verdict then trusts`);
    console.log("AXLE to run Lean faithfully; AXLE replaces the imports with `import Mathlib` at its own revision, which may differ from theory/'s pin.");
  } else if (!localLeanAvailable()) {
    console.error(`Not checked: ${NO_LOCAL_LEAN}`);
    return 2;
  } else {
    console.log(`Checking locally: lake env lean against ${path.relative(process.cwd(), THEORY_DIR) || "."}/.`);
  }
  const mode = remote ? "remote" : "local";
  const contents = files.map((file) => fs.readFileSync(file, "utf8"));
  // With --request, a file not bound to the request is reported and never reaches Lean.
  const binding = contents.map((c) => (request ? bindRequest(c, request) : []));
  const bound = contents.flatMap((_, i) => (binding[i].length ? [] : [i]));
  // Tampered copies count only for an accepted certificate. Locally, one batch checks every bound
  // certificate and the copies of those in the grammar; remotely, a copy goes to AXLE only once
  // its certificate is accepted.
  const copies = contents.map((c, i) => (tamper && !binding[i].length && !lint(c).length ? tamperVariants(c) : []));
  const local = remote ? null : await checkAll({ certificates: bound.map((i) => contents[i]), tampered: copies.flat() }, { mode });
  const checks = bound.filter((i) => !lint(contents[i]).length).length + copies.flat().length;
  if (local) console.log(`  ${local.batched} of ${checks} Lean checks shared one process.`);
  let failed = 0, n = 0;
  for (const [i, file] of files.entries()) {
    const r = binding[i].length ? { ok: false, mode: "binding", certified: [], problems: binding[i] }
      : local ? local.certificates[bound.indexOf(i)] : await check(contents[i], { mode });
    const verdicts = local?.tampered.slice(n, (n += copies[i].length));
    if (r.info) console.log(`  AXLE info: ${JSON.stringify(r.info)}`);
    if (r.ok) {
      console.log(`✓ ${file}: ${r.certified.length} theorems certified (${r.mode})`);
      for (const name of r.certified) console.log(`    ${name}`);
    } else {
      failed++;
      console.log(`✗ ${file}: not certified (${r.mode})`);
      for (const p of r.problems) console.log(`    ${p}`);
      continue;
    }
    if (!tamper) continue;
    const ts = verdicts ?? (await checkAll({ tampered: copies[i] }, { mode })).tampered;
    for (const [k, v] of copies[i].entries()) {
      const t = ts[k];
      if (t.ok) console.log(`✓ ${file}: tampered (${v.name}) fails to check, as it must`);
      else {
        failed++;
        console.log(`✗ ${file}: tampered (${v.name}) was not rejected as expected`);
        for (const p of t.problems) console.log(`    ${p}`);
      }
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message ?? e); process.exit(1); });
}
