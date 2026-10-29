#!/usr/bin/env node
/**
 * Check a Lean certificate: the `content` of triz_export format "lean", or of the `certificate`
 * that triz_separate, triz_dynamics, or triz_weakness returns, saved as a .lean file.
 *
 *   node scripts/certify.mjs [--local | --remote] [--tamper] [--request request.json] <file.lean>...
 *
 * Local (the default when theory/ is built): `lake env lean` against theory/, so the certificate's
 * `import CategoricalTriz` is this repo's theory at its Mathlib pin. Build it once with
 * `cd theory && lake exe cache get && lake build`.
 *
 * Remote (--remote, or no local Lean): the AXLE service (axle.axiommath.ai), environment
 * lean-4.32.2, no API key. The theory file is sent inline ahead of the certificate. AXLE replaces
 * the imports with `import Mathlib` at its own Mathlib revision, which may differ from the repo
 * pin. A remote verdict trusts AXLE to run that Lean faithfully. The MCP server and the hosted
 * Worker never call AXLE; only this script does.
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
 * must fail; with the unsafe set emptied, `escalation` must fail; with no deliverable value
 * acceptable, the strict-inclusion and opposed membership witnesses must fail; with the
 * invariant emptied, initial containment must fail. Errors outside a theorem do not count.
 *
 * Without --request, this checks the statements about the file's tables. --request binds the
 * manifest to authoritative request JSON, independently compares normalized row/wiring/interface
 * data, then regenerates to detect staleness. Regeneration is not an encoder-correctness proof.
 * Negative certificates currently cover state-only inductive invariants. Time-varying inputs,
 * port-target negative claims, and negatives supported only to a horizon remain unsupported.
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
  re("abbrev (?:Box|Port|Fn|Carrier|Demand|Val|Row|Machine|State|Value|Input|Deliverable) := Fin \\d+"),
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
  re("def system : Sync Box Row Port Machine Fn State Value := ⟨rowBox, rowFixes, rowValue, rowMachine, rowState, rowNext, fnSource, fnTarget⟩"),
  re("def rows : Rows Box Row Port Fn Value := ⟨rowBox, rowFixes, rowValue, fnSource, fnTarget⟩"),
  re(`def (?:initial|unsafeState|safeState) : Machine → State → Bool := ${rows(BOOLS)}`),
  re(`def unsafeValue : Port → Value → Bool := ${rows(BOOLS)}`),
  re(`def (?:acceptable : Deliverable|inputDomain : Input) → Value → Bool := ${rows(BOOLS)}`),
  re(`def trace : Fin \\d+ → \\(Machine → State\\) × \\(Port → Value\\) := ${rows(`\\(${NUMS}, ${NUMS}\\)`)}`),
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
  if (name === "unreachable") return s === "∀ a ∈ system.starts initial, ∀ n b, reachIn system.Step n a b → ¬ (∀ m, unsafeState m (b.1 m) = true)";
  if (name === "safetyInvariant") return s === "∀ a ∈ system.starts initial, ∀ n b, reachIn system.Step n a b → ∀ m, safeState m (b.1 m) = true";
  if (name === "escalation") return /^∃ a ∈ system\.starts initial, ∃ b ∈ system\.target unsafeState unsafeValue, reachWithin system\.Step \d+ a b$/.test(s);
  const relation = (i) => `(Concept${i}.rows.relation inputDomain Concept${i}.reads Concept${i}.delivers)`;
  if (name === "behaviorPreserved") return s === `${relation(0)} = ${relation(1)}`;
  if (name === "behaviorChanged") return [ [0,1], [1,0] ].some(([a,b]) => s === `∃ u y, ${relation(a)} u y ∧ ¬ ${relation(b)} u y`);
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
 */
export function lint(content) {
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
      if (stack.length > 1 || (stack.length === 1 && !/^(?:Separation|Concept)\d+$/.test(m[1])) || RESERVED.has(m[1])) problems.push(`${at}: unexpected namespace`);
      stack.push(m[1]);
    } else if ((m = /^end (\S+)$/.exec(line))) {
      if (stack.pop() !== m[1]) problems.push(`${at}: end does not close the open namespace`);
    } else if (line === "open CategoricalTriz") {
      if (stack.length !== 1) problems.push(`${at}: open outside the certificate namespace`);
    } else if ((m = /^theorem (\S+) : (.*) :=$/.exec(line))) {
      if (!stack.length) problems.push(`${at}: theorem outside a namespace`);
      if (!statementOk(m[1], m[2])) problems.push(`${at}: theorem ${m[1]} does not carry its pinned statement`);
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

const withAxioms = (content) => `${content.trimEnd()}\n\n${theorems(content).map((t) => `#print axioms ${t.name}`).join("\n")}\n`;

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

let rebuilt = false;
/** Run Lean on `content` against theory/; messages carry 1-based lines of `content`. */
export function runLocal(content) {
  const bin = lakeBin();
  if (!bin || !fs.existsSync(OLEAN)) throw new Error("local Lean unavailable: install elan, then cd theory && lake exe cache get && lake build");
  if (!rebuilt) {
    // Bring the theory olean up to date with the source (fast when it already is).
    const b = spawnSync(bin, ["build", "CategoricalTriz"], { cwd: THEORY_DIR, encoding: "utf8" });
    if (b.status !== 0) throw new Error(`lake build CategoricalTriz failed:\n${b.stdout}${b.stderr}`);
    rebuilt = true;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "triz-cert-"));
  const file = path.join(dir, "Certificate.lean");
  try {
    fs.writeFileSync(file, content);
    const r = spawnSync(bin, ["env", "lean", "--json", file], { cwd: THEORY_DIR, encoding: "utf8", maxBuffer: 64 << 20 });
    const messages = [];
    for (const line of r.stdout.split("\n")) {
      if (!line.trim()) continue;
      let m;
      try { m = JSON.parse(line); } catch { messages.push({ severity: "error", line: 0, text: line }); continue; }
      messages.push({ severity: m.severity === "information" ? "info" : m.severity, line: m.pos?.line ?? 0, text: m.data });
    }
    if (r.status !== 0 && !messages.some((m) => m.severity === "error")) messages.push({ severity: "error", line: 0, text: `lean exited ${r.status}: ${r.stderr}` });
    return { mode: "local", messages, toolProblems: [] };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

export async function check(content, { mode } = {}) {
  const grammar = lint(content);
  if (grammar.length) return { ok: false, mode: "grammar", certified: [], problems: grammar };
  const useLocal = mode === "local" || (mode !== "remote" && localLeanAvailable());
  const run = useLocal ? runLocal(withAxioms(content)) : await runRemote(withAxioms(content));
  return { ...accept(content, run), info: run.info };
}

/** Tamper variants: every verdict negated; one function's carrier changed; the unsafe set emptied; nothing acceptable. */
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
  // A data tamper per row-table kind: every entry of the table set to false.
  const emptied = (pattern) => content.replace(pattern, (line) => line.replace(/\btrue\b/g, "false"));
  const unsafe = emptied(/^def (?:unsafeState|unsafeValue) : .*$/gm);
  if (unsafe !== content && theorems(content).some((t) => t.short === "escalation")) {
    variants.push({ name: "the unsafe set emptied", content: unsafe, mustFail: theorems(content).filter((t) => t.short === "escalation" && t.depth === 1).map((t) => t.name) });
  }
  const refused = emptied(/^def acceptable : Deliverable → Value → Bool := .*$/m);
  if (refused !== content && theorems(content).some((t) => /^(?:weaker|count|firstOnly|secondOnly)_/.test(t.short))) {
    variants.push({ name: "no deliverable value acceptable", content: refused, mustFail: theorems(content).filter((t) => /^(?:weaker|count|firstOnly|secondOnly)_\d+_\d+$/.test(t.short) && t.depth === 1).map((t) => t.name) });
  }
  if (/^def invariantStates :/m.test(content)) variants.push({name:"invariant emptied",content:content.replace(/^def invariantStates : List \(Machine → State\) := .*$/m,"def invariantStates : List (Machine → State) := []"),mustFail:theorems(content).filter((t)=>t.short==="invariantInitial").map((t)=>t.name)});
  return variants;
}

/**
 * Check that a tampered certificate fails: Lean reports an error inside each theorem that must
 * fail, and every error lies inside some theorem (none in the data, none a parse error).
 */
export async function checkTampered(variant, { mode } = {}) {
  const useLocal = mode === "local" || (mode !== "remote" && localLeanAvailable());
  const run = useLocal ? runLocal(variant.content) : await runRemote(variant.content);
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
    const order = (id) => { if (!orders.has(id)) orders.set(id,[...new Set(concepts.flatMap(({model:m})=>m.carriers.find((c)=>c.id===id)?.values??[]))].sort()); return orders.get(id); };
    const entries = concepts.map(({model:m,id},ci) => {
      const reached = new Set(request.kind === "dynamics" ? [...m.boxes.filter((b)=>b.transition).map((b)=>b.id),...[...request.spec.unsafe??[],...request.spec.safe??[],...(request.spec.separation??[]).flatMap((d)=>d.where)].map((c)=>c.box)] : normalized.scope === "whole" ? m.boxes.map((b)=>b.id) : m.wires.filter((w)=>target.some((d)=>d.box===w.to.box&&d.port===w.to.port)).map((w)=>w.from.box));
      for (let size=-1;size!==reached.size;) { size=reached.size; for (const w of m.wires) if (reached.has(w.to.box)) reached.add(w.from.box); }
      const boxes=m.boxes.filter((b)=>reached.has(b.id)), ports=portsOf(boxes,request.kind==="dynamics"?[]:target), pi=new Map(ports.map((p,i)=>[key(p.box,p.side,p.port),i]));
      const wires=m.wires.filter((w)=>pi.has(key(w.to.box,"in",w.to.port))), names=ports.map((p)=>request.kind==="dynamics"?m.carriers.find((c)=>c.id===p.carrier).values:order(p.carrier));
      const rows=boxes.flatMap((b,bi)=>[...b.behavior??[],...b.transition??[]].map((row)=>({box:bi,fixes:ports.map((p)=>p.box===b.id),values:ports.map((p,i)=>p.box===b.id?names[i].indexOf((p.side==="in"?row.in:row.out)[p.port]):0),row,b})));
      return {m,id,ci,boxes,ports,pi,wires,names,rows};
    });
    const valueWidth=Math.max(1,...entries.flatMap((e)=>e.names.map((n)=>n.length)));
    if (request.kind !== "dynamics") {
      const situations = [];
      for (const e of entries) {
        const fed = new Set(e.wires.map((w)=>e.pi.get(key(w.to.box,"in",w.to.port))));
        for (const [i,p] of e.ports.entries()) if (p.side === "in" && !fed.has(i) && !situations.some((q)=>q.box===p.box&&q.port===p.port)) situations.push({...p,declared:e.m.carriers.find((c)=>c.id===p.carrier).values});
      }
      eq("inputId",situations.map((p)=>`${p.box}.${p.port}`)); eq("deliverableId",target.map((p)=>`${p.box}.${p.port}`));
      eq("inputValueId",situations.map((p)=>[...order(p.carrier),...Array(valueWidth-order(p.carrier).length).fill("")]));
      eq("deliverableValueId",target.map((p)=>[...order(p.carrier),...Array(valueWidth-order(p.carrier).length).fill("")]));
      eq("inputDomain",situations.map((p)=>Array.from({length:valueWidth},(_,v)=>v<order(p.carrier).length && p.declared.includes(order(p.carrier)[v]))));
      for (const e of entries) {
        const fed = new Set(e.wires.map((w)=>e.pi.get(key(w.to.box,"in",w.to.port))));
        const expected = `![${situations.map((q)=>{const p=e.ports.findIndex((p,i)=>p.side==="in"&&!fed.has(i)&&p.box===q.box&&p.port===q.port);return p<0?"none":`some ${p}`;}).join(", ")}]`;
        const block=content.split(`namespace Concept${e.ci}\n`)[1]?.split(`end Concept${e.ci}\n`)[0]??"";
        if (!block.includes(`def reads : Input → Option Port := ${expected}`)) problems.push(`table Concept${e.ci}.reads does not encode the authoritative request`);
        eq(`Concept${e.ci}.delivers`,target.map((p)=>e.pi.get(key(p.box,"in",p.port))));
      }
      if (request.kind === "weakness") eq("acceptable",target.map((p)=>{
        const entry=request.acceptable.find((a)=>a.box===p.box&&a.port===p.port)??request.acceptable.find((a)=>a.carrier===p.carrier);
        const levels=concepts[0].model.carriers.find((c)=>c.id===p.carrier).levels??[];
        const accepted=entry?.values??levels.filter((l)=>(entry.at_least===undefined||l.from>=entry.at_least)&&(entry.below===undefined||l.from<entry.below)).map((l)=>l.value);
        return Array.from({length:valueWidth},(_,v)=>v<order(p.carrier).length&&accepted.includes(order(p.carrier)[v]));
      }));
    }
    for (const e of entries) {
      const prefix=request.kind==="dynamics"?"":`Concept${e.ci}.`, set=(n,v)=>eq(prefix+n,v);
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

/** Regeneration detects generator staleness. Independent table checks above check correspondence. */
export async function checkRequest(content, request, opts = {}) {
  let problems;
  try { problems = [...lint(content),...checkCorrespondence(content, request)]; }
  catch (e) { return {ok:false,mode:"binding",certified:[],problems:[`malformed authoritative request: ${e.message ?? e}`]}; }
  if (problems.length) return { ok:false,mode:"binding",certified:[],problems };
  const manifest = JSON.parse(literalTables(content).get("certificateManifest"));
  const program = `import fs from "node:fs"; import * as c from "./src/act-cert.ts"; const r=JSON.parse(fs.readFileSync(0,"utf8")); const o={namespace:${JSON.stringify(manifest.namespace)},scope:r.scope,maxStates:r.maxStates,prior:r.prior}; const out=r.kind==="model"?c.modelCertificate(r.model,o):r.kind==="separation"?c.separationCertificate(r.contradiction,o):r.kind==="dynamics"?c.dynamicsCertificate(r.model,r.spec,o):r.kind==="weakness"?c.weaknessCertificate(r.concepts,r.acceptable,o):r.kind==="behavior"?c.behaviorCertificate(r.baseline,r.concept,o):null; process.stdout.write(JSON.stringify(out));`;
  const regen = spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",program],{cwd:path.resolve(here,".."),input:JSON.stringify(request),encoding:"utf8",maxBuffer:64<<20});
  if (regen.status !== 0) return {ok:false,mode:"binding",certified:[],problems:[`cannot regenerate the authoritative request: ${regen.stderr.trim()}`]};
  let generated; try { generated=JSON.parse(regen.stdout); } catch { return {ok:false,mode:"binding",certified:[],problems:["generator returned invalid JSON"]}; }
  if (!generated?.ok || generated.content !== content) return {ok:false,mode:"binding",certified:[],problems:["certificate is stale or differs from current request regeneration; this is a staleness check, not an encoder-correctness proof"]};
  return check(content,opts);
}

async function main(argv) {
  const requestAt = argv.indexOf("--request");
  const requestFile = requestAt < 0 ? undefined : argv[requestAt + 1];
  if (requestAt >= 0 && (!requestFile || requestFile.startsWith("--"))) throw new Error("--request needs an authoritative request JSON file");
  const files = argv.filter((a,i) => !a.startsWith("--") && (requestAt < 0 || i !== requestAt + 1));
  const request = requestFile ? JSON.parse(fs.readFileSync(requestFile,"utf8")) : undefined;
  const mode = argv.includes("--local") ? "local" : argv.includes("--remote") ? "remote" : undefined;
  const tamper = argv.includes("--tamper");
  if (!files.length) {
    console.error("usage: node scripts/certify.mjs [--local | --remote] [--tamper] [--request request.json] <file.lean>...");
    return 2;
  }
  const remote = mode === "remote" || (mode !== "local" && !localLeanAvailable());
  if (remote) {
    console.log(`Checking remotely with AXLE (${AXLE_URL}, ${AXLE_ENVIRONMENT}). This trusts AXLE to run Lean faithfully;`);
    console.log("AXLE replaces the imports with `import Mathlib` at its own revision, which may differ from theory/'s pin.");
  } else {
    console.log(`Checking locally: lake env lean against ${path.relative(process.cwd(), THEORY_DIR) || "."}/.`);
  }
  let failed = 0;
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const r = await (request ? checkRequest(content, request, { mode: remote ? "remote" : "local" }) : check(content, { mode: remote ? "remote" : "local" }));
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
    for (const v of tamperVariants(content)) {
      const t = await checkTampered(v, { mode: remote ? "remote" : "local" });
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
