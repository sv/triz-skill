#!/usr/bin/env node
/** Reproducible synthetic differential benchmarks. Every timed variant must finish and
 * match the exhaustive verdict, count and first witness. No speed threshold is a test. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { synthesizeFinite } from "../src/act-synthesis.ts";
import { synthesisFixture } from "../tests/support/synthesis.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { iterations: { type: "string", default: "7" }, output: { type: "string", default: "benchmarks/synthesis" } } });
const iterations = Number(values.iterations);
assert.ok(Number.isInteger(iterations) && iterations >= 1 && iterations <= 100, "iterations must be 1..100");
const variants = [
  ["exhaustive", { strategy: "exhaustive" }],
  ["memoization only", { optimizations: { backward_residual: false, choice_propagation: false } }],
  ["residual only", { optimizations: { choice_propagation: false, memoize_boundaries: false } }],
  ["propagation only", { optimizations: { backward_residual: false, memoize_boundaries: false } }],
  ["pruning without memoization", { optimizations: { memoize_boundaries: false } }],
  ["optimized", {}],
];
const cases = [["safety", 8], ["coverage", 5], ["memoization", 4], ["coupled", 6]];
const signature = r => ({ verdict: r.verdict, complete: r.complete, allDecided: r.allDecided, satisfyingCount: r.satisfyingCount, witness: r.witness?.choices });
const median = times => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
const records = [];
for (const [kind, count] of cases) {
  const input = synthesisFixture(kind, count), samples = new Map(variants.map(([name]) => [name, []]));
  const results = new Map();
  const run = ([name, config], timed) => {
    const started = performance.now();
    const result = synthesizeFinite({ ...input, ...config });
    const elapsed = performance.now() - started;
    assert.ok(result.ok && result.complete && result.allDecided, `${kind}/${name}: ${JSON.stringify(result)}`);
    if (name !== "exhaustive") assert.deepEqual(signature(result), signature(results.get("exhaustive")), `${kind}/${name}`);
    if (timed) samples.get(name).push(elapsed);
    results.set(name, result);
  };
  // Warm all paths; rotate execution order across samples to reduce order bias.
  variants.forEach(variant => run(variant, false));
  for (let iteration = 0; iteration < iterations; iteration++) for (let j = 0; j < variants.length; j++) run(variants[(iteration + j) % variants.length], true);
  for (const [variant] of variants) {
    const result = results.get(variant), times = samples.get(variant);
    records.push({ case: kind, holes: count, variant, candidateSpace: result.candidateSpace.size, fullEvaluations: result.searchStats.fullEvaluations,
      combinationsAvoided: result.searchStats.combinationsAvoided, satisfyingCount: result.satisfyingCount, work: result.work,
      boundaryComputations: result.searchStats.boundarySummaries.computations, boundaryCacheHits: result.searchStats.boundarySummaries.hits,
      pruning: result.searchStats.pruning, medianMs: median(times), minMs: Math.min(...times), maxMs: Math.max(...times), samplesMs: times });
  }
}
const sourceFiles = ["src/act-synthesis.ts", "src/act-synthesis-pruning.ts", "src/act-behavior.ts", "src/act-contract.ts", "tests/support/synthesis.ts", "scripts/benchmark-synthesis.mjs"];
const report = { generatedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
  iterations, warmupsPerVariant: 1, sourceSha256: Object.fromEntries(sourceFiles.map(file => [file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")])),
  scope: "Synthetic finite fixed-wiring libraries. All variants completed under the same 1,000,000 work and 10,000 state limits; counts, verdicts and first witnesses match exhaustive search. Timings include parsing, preprocessing, validation, caching and result construction. Each request gets a fresh cache.", records };
const lines = ["# Synthesis search benchmark", "", report.scope, "", `Node ${report.runtime.node}, ${report.runtime.platform}/${report.runtime.arch}; ${iterations} samples after one warmup per variant.`, "",
  "| Case | Full evaluations before → after | Avoided | Boundary computations before → after | Median ms before → after | Speedup |",
  "|---|---:|---:|---:|---:|---:|"];
for (const [kind] of cases) {
  const before = records.find(r => r.case === kind && r.variant === "exhaustive"), after = records.find(r => r.case === kind && r.variant === "optimized");
  lines.push(`| ${kind} | ${before.fullEvaluations} → ${after.fullEvaluations} | ${(100 * after.combinationsAvoided / before.candidateSpace).toFixed(1)}% | ${before.boundaryComputations} → ${after.boundaryComputations} | ${before.medianMs.toFixed(2)} → ${after.medianMs.toFixed(2)} | ${(before.medianMs / after.medianMs).toFixed(2)}× |`);
}
lines.push("", "## Individual optimizations", "", "| Case | Variant | Full evaluations | Boundary computations | Cache hits | Work | Median ms |", "|---|---|---:|---:|---:|---:|---:|");
for (const r of records) lines.push(`| ${r.case} | ${r.variant} | ${r.fullEvaluations} | ${r.boundaryComputations} | ${r.boundaryCacheHits} | ${r.work} | ${r.medianMs.toFixed(2)} |`);
lines.push("", "Safety uses nondeterministic alternatives that retain good rows but also produce invalid outputs. Coverage uses safe alternatives that omit required outputs. Memoization uses interchangeable behavior with different resource costs; every resource combination is still checked. Coupled uses copy/flip chains whose individually different choices can compensate. These are synthetic algorithm exercises, not motor/cyclone measurements or a universal speed guarantee.", "",
  "Work is the engine's bounded accounting, not elapsed CPU time. Compilation and propagation can increase work on tightly coupled cases; raw timing samples and source hashes are in latest.json. The exhaustive strategy and optimization switches remain available for diagnosis.", "");
const output = path.resolve(root, values.output);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "latest.json"), JSON.stringify(report, null, 2) + "\n");
fs.writeFileSync(path.join(output, "latest.md"), lines.join("\n"));
console.log(lines.slice(0, 12).join("\n"));
console.log(`\nFull results: ${path.relative(root, output)}/latest.{md,json}`);
