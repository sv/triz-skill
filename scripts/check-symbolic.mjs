#!/usr/bin/env node
/** LOCAL ONLY. Compile reusable laws, check generated certificates, audit all theorem axioms,
 * and require tampered encodings to fail. Never uses certify.mjs's remote service. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { synthesizeFinite } from "../src/act-synthesis.ts";
import { exportSymbolicLean, symbolicLeanProblems } from "../src/act-symbolic-lean.ts";
import { synthesisFixture } from "../tests/support/synthesis.ts";
import { distinctMapFixture, sharedMapFixture, typedMapFixture } from "../tests/support/symbolic.ts";
import { jointSynthesisFixture, correlatedSynthesisFixture, closedJointSynthesisFixture } from "../tests/support/joint-synthesis.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "triz-symbolic-"));
const lean = process.env.TRIZ_SYMBOLIC_LEAN ?? "lean";
const source = fs.readFileSync(path.join(root, "theory/Symbolic.lean"), "utf8");
const stripComments = text => text.replace(/\/-[\s\S]*?-\//g, "").replace(/--[^\n]*/g, "");
assert.ok(!/\b(?:sorry|axiom|native_decide|bv_decide|unsafe|implemented_by|extern)\b/.test(stripComments(source)), "Forbidden proof/trust escape");
const audit = (text, prefix = "") => [...stripComments(text).matchAll(/^theorem (\w+)/gm)].map(m => `#print axioms ${prefix}${m[1]}`).join("\n");
const run = (file, args = [], accept = true) => {
  const result = spawnSync(lean, ["--json", "-DwarningAsError=true", ...args, file], { cwd: tmp, env: { ...process.env, ELAN_TOOLCHAIN: fs.readFileSync(path.join(root, "theory/lean-toolchain"), "utf8").trim(), LEAN_PATH: tmp }, encoding: "utf8", timeout: 60_000, maxBuffer: 8_000_000 });
  const expected = [...fs.readFileSync(path.join(tmp, file), "utf8").matchAll(/^#print axioms (\S+)$/gm)].map(m => m[1]);
  const problems = symbolicLeanProblems(result, expected, !accept);
  assert.deepEqual(problems, [], `${problems.join("; ")}\n${result.stderr}\n${result.stdout}`);
};
try {
  const compileStart = performance.now();
  fs.writeFileSync(path.join(tmp, "Symbolic.lean"), source + "\n" + audit(source, "Symbolic.") + "\n");
  run("Symbolic.lean", ["-o", "Symbolic.olean"]);
  const lawsMs = performance.now() - compileStart;
  const inputFlag = process.argv.indexOf("--input");
  const requests = inputFlag < 0 ? [...[2, 4, 6].map(n => synthesisFixture("coupled", n)), typedMapFixture(), distinctMapFixture(3), sharedMapFixture(2, 4), jointSynthesisFixture(3), correlatedSynthesisFixture(), closedJointSynthesisFixture()]
    : [JSON.parse(fs.readFileSync(process.argv[inputFlag + 1], "utf8"))];
  const records = [];
  for (const [i, input] of requests.entries()) {
    const started = performance.now();
    const result = synthesizeFinite({ ...input, strategy: "symbolic", include_symbolic_certificate: true });
    assert.ok(result.ok && result.symbolicCertificates?.length, `No checked region: ${JSON.stringify(result.searchStats)}`);
    const text = exportSymbolicLean(result.symbolicCertificates);
    const encodingMs = performance.now() - started;
    const checkStart = performance.now();
    fs.writeFileSync(path.join(tmp, `Request${i}.lean`), text + "\n" + audit(text) + "\n");
    run(`Request${i}.lean`);
    const kernelMs = performance.now() - checkStart;
    // Corrupt a primitive relation, a composition, a support label, and a carrier identity.
    const corruptions = ["relation", "composition", "support", "carrier", "missing-stages", "extra-layer", "repeated-hole", "fixed-choice-count", "tuple-arity", "port-arity"];
    for (const region of result.symbolicCertificates.keys()) for (const kind of corruptions) {
      const bad = structuredClone(result.symbolicCertificates);
      const c = bad[region];
      if (kind === "relation") c.stages[0].primitives[0].rows.pop();
      if (kind === "composition") c.layers[1][0].image[0] = 999;
      if (kind === "support") c.stages[0].edges[0].choices = [];
      if (kind === "carrier") c.layers[1][0].target[0] += "different";
      if (kind === "missing-stages") c.stages = [];
      if (kind === "extra-layer") c.layers.push(c.layers.at(-1));
      if (kind === "repeated-hole") {
        const hole = c.stages.find(s => s.hole !== null);
        c.stages.find(s => s !== hole).hole = hole.hole;
      }
      if (kind === "fixed-choice-count") c.stages[0].choiceCount++;
      if (kind === "tuple-arity") c.layers[0][0].inputs[0].push("extra");
      if (kind === "port-arity") c.stages.find(s => s.inputPorts.length).inputPorts.pop();
      fs.writeFileSync(path.join(tmp, "Tampered.lean"), exportSymbolicLean(bad));
      run("Tampered.lean", [], false);
    }
    records.push({ request: i, holes: input.holes.length, regions: result.symbolicCertificates.length, encodingAndSynthesisMs: encodingMs, certificateBytes: Buffer.byteLength(text), kernelCheckMs: kernelMs, tamperedRejected: corruptions.length * result.symbolicCertificates.length });
  }
  console.log(JSON.stringify({ localOnly: true, reusableLawsCompileAndAuditMs: lawsMs,
    lawTheoremsAudited: [...stripComments(source).matchAll(/^theorem (\w+)/gm)].map(m => m[1]), standardAxiomsOnly: true, records }, null, 2));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
