import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("source-backed product/patent cases preserve discovery, reject invalid decompositions and compose a finite DC force model", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "examples/assurance/effects-products.mjs"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 30_000,
  });
  const report = JSON.parse(output);
  assert.equal(report.cases.length, 3);
  assert.equal(report.cases.flatMap((c: any) => c.paths).length, 9);
  assert.equal(report.cases.flatMap((c: any) => c.rejected_paths).length, 6);
  assert.equal(report.voice_coil.finite_composition, "preserved");
  assert.equal(report.certificate_count, 10);
});
