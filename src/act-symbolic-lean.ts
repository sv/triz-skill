/** Data-only encoding: no untrusted text is interpolated as Lean syntax. */
import type { FiniteMap, RegionCertificate } from "./act-symbolic-certificate.js";
const list = (xs: string[]) => `[${xs.join(", ")}]`;
// UTF-16 code units preserve arbitrary JS ids, including hostile strings/unpaired surrogates.
const id = (s: string) => list(Array.from({ length: s.length }, (_, i) => String(s.charCodeAt(i))));
const nat = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Certificate indices must be natural safe integers");
  return String(n);
};
const nums = (xs: number[]) => list(xs.map(nat));
const map = (m: FiniteMap) => `⟨${id(m.source)}, ${id(m.target)}, ${list(m.inputs.map(id))}, ${list(m.outputs.map(id))}, ${nums(m.image)}⟩`;
export function exportSymbolicLean(certificates: RegionCertificate[]) {
  const lines = ["import Symbolic", "", "/- Generated from checked symbolic DAGs. Original declaration/topology encoding remains a trust boundary. -/"];
  certificates.forEach((c, r) => {
    const name = `region${r}`;
    lines.push(`def ${name}Layers : List (List Symbolic.MapTable) := ${list(c.layers.map(l => list(l.map(map))))}`);
    c.stages.forEach((s, k) => {
      const primitives = list(s.primitives.map(p => `⟨${map(p.map)}, ${list(p.rows.map(([x, y]) => `(${nat(x)}, ${nat(y)})`))}⟩`));
      const edges = list(s.edges.map(e => `⟨${nat(e.from)}, ${nat(e.to)}, ${nat(e.primitive)}, ${nums(e.choices)}⟩`));
      const hole = s.hole === null ? "none" : `some ${nat(s.hole)}`;
      lines.push(`def ${name}Stage${k} : Symbolic.Stage := ⟨${id(s.box)}, ${hole}, ${nat(s.choiceCount)}, ${primitives}, ${edges}⟩`);
    });
    lines.push(`def ${name}Stages : List Symbolic.Stage := ${list(c.stages.map((_, k) => `${name}Stage${k}`))}`);
    lines.push(`theorem ${name}Checked : Symbolic.regionOK ${name}Layers ${name}Stages := by decide +kernel`);
  });
  return lines.join("\n") + "\n";
}

export type SymbolicLeanProcess = { status: number | null; signal?: string | null; error?: unknown; stdout?: string | null; stderr?: string | null };
/** Evidence policy shared by the local checker and its negative tests. A timeout, missing
 * executable, malformed output or resource failure is never a successful tamper rejection. */
export function symbolicLeanProblems(run: SymbolicLeanProcess, expected: string[], mustReject = false): string[] {
  if (run.error || run.signal || run.status === null) return ["Lean process did not complete normally"];
  let messages: Array<{ severity?: string; data?: string; message?: string }>;
  try { messages = (run.stdout ?? "").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); }
  catch { return ["Lean did not return valid JSON diagnostics"]; }
  if (mustReject) return run.status !== 0 && messages.some(m => m.severity === "error"
    && /Tactic `decide` proved that the proposition[\s\S]*is false/.test(m.data ?? m.message ?? ""))
    ? [] : ["Tampering was not rejected by a kernel-checked false proposition"];
  const problems: string[] = [];
  if (run.status !== 0) problems.push("Lean exited unsuccessfully");
  if (messages.some(m => m.severity === "error" || m.severity === "warning")) problems.push("Lean emitted an error or warning");
  const audited = new Set<string>(), standard = new Set(["propext", "Classical.choice", "Quot.sound"]);
  for (const m of messages) {
    const text = m.data ?? m.message ?? "";
    const audit = /^'([^']+)' (?:does not depend on any axioms|depends on axioms: \[([^\]]*)\])$/.exec(text);
    if (!audit) continue;
    const name = audit[1];
    if (!expected.includes(name) || audited.has(name)) problems.push(`Unexpected or duplicate axiom audit: ${name}`);
    audited.add(name);
    for (const axiom of (audit[2] ?? "").split(",").map(x => x.trim()).filter(Boolean)) if (!standard.has(axiom)) problems.push(`Non-standard axiom: ${axiom}`);
  }
  for (const name of expected) if (!audited.has(name)) problems.push(`Missing axiom audit: ${name}`);
  return problems;
}
