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
 * A certificate is accepted only if Lean reports no error and no warning (so no `sorry`), every
 * `theorem` in the file is elaborated (each gets a `#print axioms`), and every axiom it depends on
 * is one of propext, Classical.choice, Quot.sound (so no `native_decide` and no `axiom` of the
 * file's own). Exit status alone is not enough: Lean exits 0 on `sorry`, and AXLE reports `okay`.
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

/** Every `theorem` the generator emits, fully qualified by the namespaces open at its line. */
export function theorems(content) {
  const stack = [], out = [];
  content.split("\n").forEach((line, i) => {
    let m;
    if ((m = /^namespace (\S+)\s*$/.exec(line))) stack.push(m[1]);
    else if ((m = /^end (\S+)\s*$/.exec(line)) && stack.at(-1) === m[1]) stack.pop();
    else if ((m = /^theorem (\S+) :/.exec(line))) out.push({ name: [...stack, m[1]].join("."), line: i + 1 });
  });
  return out;
}

/** The lines a theorem occupies: from its doc comment or declaration up to the next declaration. */
function spans(content) {
  const lines = content.split("\n");
  const starts = [];
  lines.forEach((l, i) => { if (/^(theorem|def|abbrev|namespace|end|\/-[-!]|#)/.test(l)) starts.push(i + 1); });
  return theorems(content).map((t) => {
    let from = t.line;
    if (lines[t.line - 2]?.startsWith("/--")) from = t.line - 1;
    const next = starts.find((s) => s > t.line) ?? lines.length + 1;
    return { ...t, from, to: next - 1 };
  });
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
