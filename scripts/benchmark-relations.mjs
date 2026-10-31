#!/usr/bin/env node
/** Whole-call comparison with the committed pre-refactor engine, plus shared-kernel ablations.
 * Baseline extraction is local/read-only; all measured variants must return exact results. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { RelationPlan } from "../src/act-relations.ts";
import { externalBehavior } from "../src/act-behavior.ts";
import { globalSeparation } from "../src/act-global.ts";
import { semijoinRows } from "../src/act-propagation.ts";
import { synthesizeFinite } from "../src/act-synthesis.ts";
import { relationFixture } from "../tests/support/relations.ts";
import { synthesisFixture } from "../tests/support/synthesis.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { iterations: { type: "string", default: "7" },
  before: { type: "string" }, base: { type: "string", default: "d7184d9" }, output: { type: "string", default: "benchmarks/relations" } } });
const iterations = Number(values.iterations);
assert.ok(Number.isInteger(iterations) && iterations >= 1 && iterations <= 100);
const base = execFileSync("git", ["rev-parse", values.base], { cwd: root, encoding: "utf8" }).trim();
const temporary = !values.before;
const before = values.before ?? fs.mkdtempSync(path.join(os.tmpdir(), "triz-relations-benchmark-"));
if (temporary) {
  execFileSync("tar", ["-x", "-C", before], { input: execFileSync("git", ["archive", base], { cwd: root, maxBuffer: 100_000_000 }) });
  fs.symlinkSync(path.join(root, "node_modules"), path.join(before, "node_modules"), "dir");
}
try {
  const previous = {
    externalBehavior: (await import(pathToFileURL(path.join(before, "src/act-behavior.ts")).href)).externalBehavior,
    globalSeparation: (await import(pathToFileURL(path.join(before, "src/act-global.ts")).href)).globalSeparation,
    synthesizeFinite: (await import(pathToFileURL(path.join(before, "src/act-synthesis.ts")).href)).synthesizeFinite,
    semijoinRows: (await import(pathToFileURL(path.join(before, "src/act-propagation.ts")).href)).semijoinRows,
  };
  const current = { externalBehavior, globalSeparation, synthesizeFinite, semijoinRows };
  const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const projected = table => [...table.values()].map(r => [r.input, [...r.outputs.keys()].sort(), r.count]);
  const behaviorSignature = r => {
    assert.ok(r.ok && r.decided, JSON.stringify(r));
    return { inputs: r.inputs, variables: r.variables, relation: r.relation.map(row => [row.input, row.outputs, row.steadyStateCount]), noSteadyState: r.noSteadyState };
  };
  const synthesisSignature = r => {
    assert.ok(r.ok && r.complete && r.allDecided, JSON.stringify(r));
    return [r.verdict, r.satisfyingCount, r.witness?.choices];
  };
  const records = [];
  const benchmark = (name, variants, run, signature, counters) => {
    let expected;
    const results = new Map(), times = new Map(variants.map(([id]) => [id, []]));
    const once = (variant, timed) => {
      const [id, config] = variant, start = performance.now(), result = run(config), elapsed = performance.now() - start;
      const sig = signature(result);
      if (expected === undefined) expected = sig; else assert.deepEqual(sig, expected, `${name}/${id}`);
      results.set(id, result); if (timed) times.get(id).push(elapsed);
    };
    variants.forEach(v => once(v, false));
    for (let i = 0; i < iterations; i++) for (let j = 0; j < variants.length; j++) once(variants[(i + j) % variants.length], true);
    for (const [id] of variants) records.push({ case: name, variant: id, medianMs: median(times.get(id)), samplesMs: times.get(id), ...counters(results.get(id)) });
  };
  for (const [kind, size] of [["indexed-chain", 14], ["tuple-chain", 5], ["hidden-factors", 14], ["boundary-factors", 8]]) {
    const f = relationFixture(kind, size);
    benchmark(`kernel/${kind}`, [["scan", { indexed: false, decompose: false }], ["index only", { decompose: false }],
      ["single-column", { compoundIndexes: false }], ["factors only", { indexed: false }], ["index + factors", {}]], options => {
      const plan = new RelationPlan(f.sets, options), budget = { explored: 0, max: 100000 };
      const table = plan.project(f.domains, f.boundary, f.observed, 10, budget);
      assert.ok(table); return { table, states: budget.explored, stats: plan.stats };
    }, r => projected(r.table), r => ({ states: r.states, ...r.stats }));
  }
  for (const size of [128, 512, 1024]) {
    const f = relationFixture("overlap-contradiction", size);
    benchmark(`semijoin/overlap-${size}`, [["before", previous], ["after", current],
      ["scan reference", { semijoinRows: (sets, max) => semijoinRows(sets, max, { indexed: false }) }]], api => api.semijoinRows(f.sets, 10_000_000),
      r => { assert.equal(r.status, "complete"); return r.sets; }, r => ({ work: r.work, ...(r.stats ?? {}) }));
    benchmark(`behavior/overlap-${size}`, [["before", previous], ["after", current]], api => api.externalBehavior(f.model,
      { fullRelation: true, maxStates: 100_000 }), behaviorSignature,
      r => ({ states: r.statesExplored, propagationWork: r.propagation.work, propagationStatus: r.propagation.status,
        semijoinStats: r.propagation.semijoin, ...(r.relationStats ?? {}) }));
  }
  const tupleModel = relationFixture("tuple-chain", 5).model;
  benchmark("behavior/tuple-chain", [["before", previous], ["after", current]], api => api.externalBehavior(tupleModel,
    { fullRelation: true, maxStates: 100_000 }), behaviorSignature,
    r => ({ states: r.statesExplored, propagationWork: r.propagation.work, propagationStatus: r.propagation.status,
      semijoinStats: r.propagation.semijoin, ...(r.relationStats ?? {}) }));
  for (const [name, count] of [["hidden-factors", 14], ["small-connected-control", 0]]) {
    const model = relationFixture("hidden-factors", count).model;
    benchmark(`behavior/${name}`, [["before", previous], ["after", current]], api => api.externalBehavior(model,
      { scope: "whole", fullRelation: true, maxStates: 100000 }), behaviorSignature,
    r => ({ states: r.statesExplored, ...(r.relationStats ?? {}) }));
  }
  // Disconnected free choices precede a cyclic, pairwise-consistent contradiction.
  const bit = ["0", "1"], free = Array.from({ length: 8 }, (_, i) => `free${i}`);
  const problem = { variables: [...free, "x", "y", "z"].map(id => ({ id, values: bit })), regions: [
    ...free.map(id => ({ id, variables: [id], allowed: bit.map(x => [x]) })),
    { id: "xy", variables: ["x", "y"], allowed: [["0", "0"], ["1", "1"]] },
    { id: "yz", variables: ["y", "z"], allowed: [["0", "0"], ["1", "1"]] },
    { id: "xz", variables: ["x", "z"], allowed: [["0", "1"], ["1", "0"]] },
  ], max_work: 1_000_000 };
  benchmark("global/disconnected-contradiction", [["before", previous], ["after", current]], api => api.globalSeparation(problem),
    r => { assert.ok(r.ok && r.complete); return r.verdict; }, r => ({ work: r.work, ...(r.relationStats ?? {}) }));
  for (const [kind, size] of [["safety", 8], ["coverage", 5], ["memoization", 4], ["coupled", 6]]) {
    const input = synthesisFixture(kind, size);
    benchmark(`synthesis/${kind}`, [["before", previous], ["after", current]], api => api.synthesizeFinite(input), synthesisSignature,
      r => ({ fullEvaluations: r.searchStats.fullEvaluations, combinationsAvoided: r.searchStats.combinationsAvoided, work: r.work }));
  }
  const sourceFiles = ["src/act-relations.ts", "src/act-relation-index.ts", "src/act-propagation.ts", "src/act-relation-model.ts", "src/act-behavior.ts", "src/act-global.ts",
    "src/act-synthesis-pruning.ts", "src/act-synthesis.ts", "tests/support/relations.ts", "tests/support/synthesis.ts", "scripts/benchmark-relations.mjs"];
  const report = { generatedAt: new Date().toISOString(), baselineCommit: base, iterations, warmupsPerVariant: 1,
    runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model ?? "unknown" },
    sourceSha256: Object.fromEntries(sourceFiles.map(f => [f, createHash("sha256").update(fs.readFileSync(path.join(root, f))).digest("hex")])), records };
  const lines = ["# Shared relation benchmark", "", `Baseline: \`${base}\`. ${iterations} rotated samples per variant after one warmup; ${process.version}, ${process.platform}/${process.arch}.`, "",
    "Engine rows compare whole calls against the named committed baseline, including validation, propagation, query planning and output construction. Kernel rows include relation compilation/indexing/projection; the single-column variant disables compound keys. Semijoin rows compare complete propagation passes with a 10,000,000 work allowance. Every variant completed with matching relations, state counts or synthesis verdicts/counts/first witnesses. Timing assertions are not tests.", "",
    "| Engine case | Median ms before → after | Speedup | Work or search states before → after |", "|---|---:|---:|---:|"];
  for (const a of records.filter(r => r.variant === "before")) {
    const b = records.find(r => r.case === a.case && r.variant === "after");
    lines.push(`| ${a.case} | ${a.medianMs.toFixed(3)} → ${b.medianMs.toFixed(3)} | ${(a.medianMs / b.medianMs).toFixed(2)}× | ${a.states ?? a.work} → ${b.states ?? b.work} |`);
  }
  lines.push("", "| Semijoin case | Row comparisons scan reference → indexed | Work committed baseline → indexed |", "|---|---:|---:|");
  for (const a of records.filter(r => r.variant === "before" && r.case.startsWith("semijoin/"))) {
    const b = records.find(r => r.case === a.case && r.variant === "after");
    const scan = records.find(r => r.case === a.case && r.variant === "scan reference");
    lines.push(`| ${a.case} | ${scan.rowComparisons} → ${b.rowComparisons} | ${a.work} → ${b.work} |`);
  }
  lines.push("", "| Kernel case | Variant | Row candidates | Search states | Median ms |", "|---|---|---:|---:|---:|");
  for (const r of records.filter(r => r.case.startsWith("kernel/"))) lines.push(`| ${r.case} | ${r.variant} | ${r.rowCandidates} | ${r.states} | ${r.medianMs.toFixed(3)} |`);
  lines.push("", "Independent hidden factors retain all global constraints and multiply exact internal-state counts; no boundary outputs are discarded. The output and state-sample sizes remain bounded. Timings include overhead, so the small connected control and synthesis cases expose regressions as well as improvements. These are synthetic workloads, not universal speed guarantees or physical validation.", "",
    `Reproduce with \`node --import tsx scripts/benchmark-relations.mjs --base ${values.base} --output ${values.output}\`. Raw samples, counters and source hashes are in \`latest.json\`.`, "");
  const output = path.resolve(root, values.output); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "latest.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(output, "latest.md"), lines.join("\n"));
  console.log(lines.join("\n"));
} finally { if (temporary) fs.rmSync(before, { recursive: true, force: true }); }
