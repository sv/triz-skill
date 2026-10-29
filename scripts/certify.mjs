#!/usr/bin/env node
/**
 * Check a Lean certificate: the `content` of triz_export format "lean", or of triz_separate's
 * `certificate`, saved as a .lean file.
 *
 *   node scripts/certify.mjs [--local | --remote] [--tamper] <file.lean>...
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
 * must fail. Errors outside a theorem (a parse error, say) do not count.
 *
 * This checks the proofs of the statements in the file. Whether the file encodes your model is
 * read from its id tables, or checked by generating it again and comparing.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
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
const re = (s) => new RegExp(`^${s}$`);
/** Every declaration line the generator writes at column 0; data only, so the meaning stays in theory/. */
const DECLARATIONS = [
  re("abbrev (?:Box|Port|Fn|Carrier|Demand|Val) := Fin \\d+"),
  re("abbrev Cell := (?:Unit|Fin \\d+(?: × Fin \\d+)*)"),
  re(`def (?:boxId|portId|fnId|carrierId|demandId|valueId) : (?:Box|Port|Fn|Carrier|Demand|Val) → String := ${STRS}`),
  re(`def ${AX}Cell : Fin \\d+ → String := ${STRS}`),
  re('def (?:contradictionId|parameter) : String := ""'),
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
      if (stack.length > 1 || (stack.length === 1 && !/^Separation\d+$/.test(m[1])) || RESERVED.has(m[1])) problems.push(`${at}: unexpected namespace`);
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

/** Tamper variants: every verdict negated; one function's carrier changed. */
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

async function main(argv) {
  const files = argv.filter((a) => !a.startsWith("--"));
  const mode = argv.includes("--local") ? "local" : argv.includes("--remote") ? "remote" : undefined;
  const tamper = argv.includes("--tamper");
  if (!files.length) {
    console.error("usage: node scripts/certify.mjs [--local | --remote] [--tamper] <file.lean>...");
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
    const r = await check(content, { mode: remote ? "remote" : "local" });
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

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message ?? e); process.exit(1); });
}
