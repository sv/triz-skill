#!/usr/bin/env node
/** Synthetic differential benchmarks, including parsing, compilation, certificates and validation.
 * No timing assertion; every uncapped variant must match exhaustive choices/count/first witness. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { synthesizeFinite } from "../src/act-synthesis.ts";
import { synthesisFixture } from "../tests/support/synthesis.ts";
import { sharedMapFixture, distinctMapFixture } from "../tests/support/symbolic.ts";
import { jointSynthesisFixture, correlatedSynthesisFixture, closedJointSynthesisFixture } from "../tests/support/joint-synthesis.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { iterations: { type: "string", default: "7" }, output: { type: "string", default: "benchmarks/synthesis" }, baseline: { type: "string" } } });
const repositoryInput = JSON.parse(fs.readFileSync(path.join(root, "examples/assurance/requests.json"), "utf8")).find(r => r.tool === "triz_synthesize").args;
const iterations = Number(values.iterations);
assert.ok(Number.isInteger(iterations) && iterations >= 1 && iterations <= 100, "iterations must be 1..100");
const scanOnly = { indexed_relations: false, connected_factors: false, separator_elimination: false };
const variants = [
  ["exhaustive", { strategy: "exhaustive" }],
  ["memoization only", { strategy: "optimized", optimizations: { ...scanOnly, backward_residual: false, choice_propagation: false } }],
  ["residual only", { strategy: "optimized", optimizations: { ...scanOnly, choice_propagation: false, memoize_boundaries: false } }],
  ["propagation only", { strategy: "optimized", optimizations: { ...scanOnly, backward_residual: false, memoize_boundaries: false } }],
  ["pruning without memoization", { strategy: "optimized", optimizations: { ...scanOnly, memoize_boundaries: false } }],
  ["indexed evaluation only", { strategy: "optimized", optimizations: { backward_residual: false, choice_propagation: false, memoize_boundaries: false, connected_factors: false, separator_elimination: false } }],
  ["factor decomposition only", { strategy: "optimized", optimizations: { backward_residual: false, choice_propagation: false, memoize_boundaries: false, indexed_relations: false, separator_elimination: false } }],
  ["separator elimination only", { strategy: "optimized", optimizations: { backward_residual: false, choice_propagation: false, memoize_boundaries: false, indexed_relations: false, connected_factors: false } }],
  ["optimized", { strategy: "optimized" }],
  ["symbolic forced", { strategy: "symbolic", include_symbolic_certificate: true }],
  ["symbolic without residual cache", { strategy: "symbolic", optimizations: { memoize_symbolic: false } }],
  ["symbolic", { strategy: "symbolic" }],
];
const cases = [
  ["repository-driver", repositoryInput],
  ["separators", synthesisFixture("separators", 9)],
  ...[["safety", 8], ["coverage", 5], ["memoization", 4], ["coupled", 6]].map(([kind, n]) => [kind, synthesisFixture(kind, n)]),
  ...[2, 4, 8, 10].map(n => [`chain-${n}`, synthesisFixture("coupled", n)]),
  ...[2, 4, 8].map(n => [`library-${n}`, sharedMapFixture(3, n)]),
  ...[3, 5].map(n => [`distinct-${n}`, distinctMapFixture(n)]),
  ...[2, 4, 6, 8].map(n => [`joint-chain-${n}`, jointSynthesisFixture(n)]),
  ["joint-library-4", jointSynthesisFixture(3, 4)],
  ["joint-library-8", jointSynthesisFixture(3, 8)],
  ["joint-correlated", correlatedSynthesisFixture()],
  ["joint-unit-source", closedJointSynthesisFixture()],
  ["symbolic-work-fallback", { ...synthesisFixture("coupled", 4), max_symbolic_work: 1, include_symbolic_certificate: true }],
  ["symbolic-memory-fallback", { ...synthesisFixture("coupled", 4), max_symbolic_cells: 1, include_symbolic_certificate: true }],
];
const signature = r => ({ verdict: r.verdict, complete: r.complete, allDecided: r.allDecided, satisfyingCount: r.satisfyingCount, witness: r.witness?.choices });
const median = times => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
// Optional comparisons against a local checkout/archive; no network or private inputs.
let repositoryBeforeAfter, integrationBeforeAfter;
if (values.baseline) {
  const baselineFile = path.resolve(values.baseline, "src/act-synthesis.ts");
  const previous = (await import(pathToFileURL(baselineFile).href)).synthesizeFinite;
  const configurations = [["previous optimized", previous, "optimized"], ["previous symbolic", previous, "symbolic"], ["current optimized", synthesizeFinite, "optimized"], ["current symbolic", synthesizeFinite, "symbolic"]];
  const compare = (name, input, warmups, samplesCount, batch) => {
    const expected = synthesizeFinite({ ...input, strategy: "exhaustive" });
    const samples = configurations.map(() => []), last = [], warmupBatches = warmups / batch;
    for (let i = 0; i < warmupBatches + samplesCount; i++) for (let j = 0; j < configurations.length; j++) {
      const v = (i + j) % configurations.length, [, fn, strategy] = configurations[v], started = performance.now();
      for (let k = 0; k < batch; k++) last[v] = fn({ ...input, strategy });
      const elapsed = (performance.now() - started) / batch;
      if (i >= warmupBatches) samples[v].push(elapsed);
      assert.deepEqual(signature(last[v]), signature(expected), name);
      if (expected.candidateSpace.size <= 50) assert.deepEqual(last[v].results.filter(r => r.result.verdict === "satisfied").map(r => r.choices), expected.results.filter(r => r.result.verdict === "satisfied").map(r => r.choices));
    }
    return { case: name, baselineSourceSha256: createHash("sha256").update(fs.readFileSync(baselineFile)).digest("hex"), inputSha256: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
      warmups, samples: samplesCount, requestsPerBatch: batch, records: configurations.map(([variant], i) => ({ variant, medianMs: median(samples[i]), samplesMs: samples[i], work: last[i].work,
        fullEvaluations: last[i].searchStats.fullEvaluations, unionTraces: last[i].searchStats.pruning.contextStates, unchangedDomainPasses: last[i].searchStats.unchangedDomainPasses ?? 0 })) };
  };
  repositoryBeforeAfter = compare("repository-driver", repositoryInput, 1000, 31, 20);
  integrationBeforeAfter = cases.filter(([name]) => ["chain-10", "joint-chain-8", "separators"].includes(name)).map(([name, input]) => compare(name, input, 1, iterations, 1));
}
const records = [];
for (const [name, input] of cases) {
  const samples = new Map(variants.map(([name]) => [name, []])), results = new Map();
  const phases = new Map(variants.map(([name]) => [name, []]));
  const run = ([variant, config], timed) => {
    const started = performance.now();
    const result = synthesizeFinite({ ...input, ...config,
      ...(config.optimizations ? { optimizations: { ...input.optimizations, ...config.optimizations } } : {}) });
    const elapsed = performance.now() - started;
    assert.ok(result.ok && result.complete && result.allDecided, `${name}/${variant}: ${JSON.stringify({ verdict: result.verdict, work: result.work, stats: result.searchStats })}`);
    if (variant !== "exhaustive") assert.deepEqual(signature(result), signature(results.get("exhaustive")), `${name}/${variant}`);
    if (timed) {
      samples.get(variant).push(elapsed);
      phases.get(variant).push({ compilationMs: result.searchStats.symbolic.compilationMs, certificateCheckMs: result.searchStats.symbolic.certificateCheckMs, substitutionCheckMs: result.searchStats.symbolic.substitutionCheckMs,
        backwardMs: result.searchStats.symbolic.backwardMs, heapUsedAfterBytes: process.memoryUsage().heapUsed });
    }
    results.set(variant, result);
  };
  variants.forEach(variant => run(variant, false));
  for (let iteration = 0; iteration < iterations; iteration++) for (let j = 0; j < variants.length; j++) run(variants[(iteration + j) % variants.length], true);
  for (const [variant] of variants) {
    const result = results.get(variant), times = samples.get(variant), stats = result.searchStats;
    records.push({ case: name, holes: input.holes.length, librarySizes: input.holes.map(h => h.alternatives.length), variant, candidateSpace: result.candidateSpace.size,
      fullEvaluations: stats.fullEvaluations, combinationsAvoided: stats.combinationsAvoided, unchangedDomainPasses: stats.unchangedDomainPasses, satisfyingCount: result.satisfyingCount, work: result.work,
      behaviorTracesEnumerated: stats.pruning.targetStates + stats.pruning.contextStates + stats.boundarySummaries.behaviorTraces,
      unionTracesEnumerated: stats.pruning.contextStates, targetTracesEnumerated: stats.pruning.targetStates, validationTracesEnumerated: stats.boundarySummaries.behaviorTraces,
      boundaryComputations: stats.boundarySummaries.computations, boundaryCacheHits: stats.boundarySummaries.hits,
      retainedBoundaryCells: stats.boundarySummaries.retainedCells, symbolic: stats.symbolic, pruning: stats.pruning,
      medianMs: median(times), minMs: Math.min(...times), maxMs: Math.max(...times), samplesMs: times, phaseSamples: phases.get(variant) });
  }
}
// Separate offline law compilation/kernel certificate checking from request timings.
const proofOutput = fs.mkdtempSync(path.join(os.tmpdir(), "triz-symbolic-benchmark-"));
let proofChecking;
try {
  // Files also work in sandboxes that restrict child-process output pipes.
  const fd = fs.openSync(path.join(proofOutput, "proof.json"), "w");
  let proofs;
  try { proofs = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-symbolic.mjs"], { cwd: root, stdio: ["ignore", fd, fd], timeout: 120_000 }); }
  finally { fs.closeSync(fd); }
  const text = fs.readFileSync(path.join(proofOutput, "proof.json"), "utf8");
  assert.equal(proofs.status, 0, text);
  proofChecking = JSON.parse(text);
} finally { fs.rmSync(proofOutput, { recursive: true, force: true }); }
const sourceFiles = ["src/act-synthesis.ts", "src/act-synthesis-pruning.ts", "src/act-synthesis-symbolic.ts", "src/act-symbolic-certificate.ts", "src/act-symbolic-lean.ts", "src/act-behavior.ts", "src/act-contract.ts", "src/act-relations.ts", "src/act-relation-model.ts", "src/act-relation-index.ts", "src/act-relation-elimination.ts", "src/act-propagation.ts", "package.json", "pnpm-lock.yaml", "theory/Symbolic.lean", "tests/support/synthesis.ts", "tests/support/relations.ts", "tests/support/symbolic.ts", "tests/support/joint-synthesis.ts", "examples/assurance/requests.json", "scripts/check-symbolic.mjs", "scripts/benchmark-synthesis.mjs"];
const report = { generatedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
  iterations, warmupsPerVariant: 1, sourceSha256: Object.fromEntries(sourceFiles.map(file => [file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")])),
  limits: { maxWork: 1_000_000, maxStates: 100_000, syntheticMaxStates: 10_000, maxPruningWorkPerPass: 100_000, maxSymbolicWorkPerPass: 100_000,
    maxRetainedSymbolicCharacters: 200_000, maxBoundaryCacheEntries: 128, maxSymbolicResidualCacheEntries: 128, maxRetainedBoundaryCellsAndKeyCharacters: 200_000 },
  scope: "Shared-kernel finite fixed-wiring libraries, including the unchanged shipped driver request and the separator/resource control. Every variant completed under identical work/state limits and matched exhaustive verdicts, satisfying counts and declaration-order first witnesses. Timings include parsing, preprocessing, independent declaration/certificate checking, propagation, validation, caching and result construction. Each request gets fresh caches. Offline Lean checks are reported separately. Small requests use optimized fallback unless a certificate is explicitly requested; the forced variant isolates that cost. These are declared finite examples, not production performance evidence.",
  memoryNote: "Retained symbolic characters and boundary cells/key characters are logical bounds, not JS heap byte bounds. Heap samples after each request include process history, GC and other variants; they are not peak allocation measurements. Search work also bounds transient DAG construction; compilation and propagation each receive at most one quarter of then-remaining work.",
  proofChecking, repositoryBeforeAfter, integrationBeforeAfter, records };
const lines = ["# Synthesis search benchmark", "", report.scope, "", `Node ${report.runtime.node}, ${report.runtime.platform}/${report.runtime.arch}, ${report.runtime.cpu}; ${iterations} rotated samples after one warmup.`, "",
  "| Case | Full validations E / O / S | Union traces O → S | Summary states / transitions | Median ms E / O / S | O / S speedup |",
  "|---|---:|---:|---:|---:|---:|"];
for (const [name] of cases) {
  const [e, o, s] = ["exhaustive", "optimized", "symbolic"].map(v => records.find(r => r.case === name && r.variant === v));
  lines.push(`| ${name} | ${e.fullEvaluations} / ${o.fullEvaluations} / ${s.fullEvaluations} | ${o.unionTracesEnumerated} → ${s.unionTracesEnumerated} | ${s.symbolic.states} / ${s.symbolic.transitions} | ${e.medianMs.toFixed(2)} / ${o.medianMs.toFixed(2)} / ${s.medianMs.toFixed(2)} | ${(o.medianMs / s.medianMs).toFixed(2)}× |`);
}
if (repositoryBeforeAfter) {
  lines.push("", "## Existing repository request: before/after", "", "Unchanged `triz_synthesize` request in examples/assurance/requests.json; 31 rotated batches of 20 requests after 1,000 warmups per variant. Both versions warm together before the larger benchmark cases. Median ms per complete request; preprocessing, runtime checks and result construction included. Baseline source fingerprint and all samples are in local latest.json. Reproduce with `pnpm bench:synthesis --baseline /path/to/baseline-checkout`.", "", "| Variant | Median ms | Work | Full validations | Union traces | Unchanged passes reused |", "|---|---:|---:|---:|---:|---:|");
  for (const r of repositoryBeforeAfter.records) lines.push(`| ${r.variant} | ${r.medianMs.toFixed(3)} | ${r.work} | ${r.fullEvaluations} | ${r.unionTraces} | ${r.unchangedDomainPasses} |`);
}
if (integrationBeforeAfter) {
  lines.push("", "## Shared-kernel integration: before/after", "", `${iterations} rotated samples after one warmup per variant; identical input and work/state limits across the archived pre-integration engine and current shared kernel.`, "", "| Case | Variant | Median ms | Work | Full validations | Union traces |", "|---|---|---:|---:|---:|---:|");
  for (const c of integrationBeforeAfter) for (const r of c.records) lines.push(`| ${c.case} | ${r.variant} | ${r.medianMs.toFixed(2)} | ${r.work} | ${r.fullEvaluations} | ${r.unionTraces} |`);
}
lines.push("", "E = exhaustive; O = current optimized; S = adaptive checked symbolic. Unsupported, small or capped compilation falls back to optimized. Full validations still check original engineering choices; behavior grouping does not collapse their costs/resources.", "",
  "## Trace, cache, and work accounting", "", "| Case | Variant | All traces | Boundary cache hits | Primitive compositions / avoided | Residual calls / cache hits | Symbolic checks (work) | Retained symbolic chars | Work | Median ms |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const r of records.filter(r => ["repository-driver", "chain-10", "library-8", "joint-chain-8", "distinct-5"].includes(r.case) && ["optimized", "symbolic forced", "symbolic without residual cache", "symbolic"].includes(r.variant))) lines.push(`| ${r.case} | ${r.variant} | ${r.behaviorTracesEnumerated} | ${r.boundaryCacheHits} | ${r.symbolic.primitiveCompositions} / ${r.symbolic.compositionsAvoided} | ${r.symbolic.residualCalls} / ${r.symbolic.residualCacheHits} | ${r.symbolic.certificateWork} | ${r.symbolic.retainedCells} | ${r.work} | ${r.medianMs.toFixed(2)} |`);
lines.push("", "## Proof checking and bounds", "", `Reusable laws compiled and all theorem axioms audited locally in ${proofChecking.reusableLawsCompileAndAuditMs.toFixed(2)} ms. These are build-time costs. Per-request normalized certificate/declaration/substitution checks run inside TypeScript and are INCLUDED in request timings and work. Optional offline kernel checks of actual generated whole-region certificates took ${Math.min(...proofChecking.records.map(r => r.kernelCheckMs)).toFixed(2)}–${Math.max(...proofChecking.records.map(r => r.kernelCheckMs)).toFixed(2)} ms per request; encoding sizes ${Math.min(...proofChecking.records.map(r => r.certificateBytes))}–${Math.max(...proofChecking.records.map(r => r.certificateBytes))} bytes. ${proofChecking.records.reduce((n, r) => n + r.tamperedRejected, 0)} altered certificates across ${proofChecking.records.reduce((n, r) => n + r.regions, 0)} regions were rejected by kernel-proved false propositions; process failures and timeouts are not accepted as rejection evidence. The remaining trust boundary is documented in docs/symbolic-synthesis.md.`, "",
  "Global work ≤ 1,000,000; solver states ≤ 100,000 (synthetic fixtures: 10,000); symbolic/residual work per pass ≤ 100,000 and ≤ one quarter of remaining work. Retained symbolic encoding/masks/residual cache ≤ 200,000 characters; residual cache ≤ 128 entries. Boundary cache ≤ 128 entries / 200,000 cells and key characters. " + report.memoryNote, "",
  "Safety/coverage exercise unsupported nondeterministic/partial rows. Copy/involution chain prefixes retain two maps (after the fixed source's one map), while support multiplicities remain exponential. Joint cases compose multi-port maps with explicit typed wire permutations; the correlated case changes arity 2→1→2, and the unit-source case starts from a zero-port source. Duplicate primitive grouping and residual reuse compound the summary sharing; the uncached symbolic variant isolates residual-cache effects. Library cases vary concrete implementations sharing those two maps. Distinct cases use disjoint transpositions: prefix widths double and symbolic checking can cost more. Bounded fallback cases force work or memory exhaustion. No universal polynomial-time claim is made for arbitrary maps, relations, or engineering search.", "",
  "Validation trace counters count complete valuations actually emitted or reconstructed, including discarded attempts; factor/separator multiplicities are not enumeration. Intermediate relation work remains in relationStats. Full ablations, timing/phase/heap samples, fallback reasons, support counts, prefix widths and source hashes are generated into git-ignored latest.json. Regenerate with `pnpm bench:synthesis`. Timings are observations, never correctness thresholds.", "");
const output = path.resolve(root, values.output);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "latest.json"), JSON.stringify(report, null, 2) + "\n");
fs.writeFileSync(path.join(output, "latest.md"), lines.join("\n"));
console.log(lines.slice(0, 33).join("\n"));
console.log(`\nFull results: ${path.relative(root, output)}/latest.{md,json}`);
