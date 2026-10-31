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

test("recent publications expose missing clauses, safe sharing and state/probability limits", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "examples/assurance/effects-recent-patents.mjs"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 30_000,
  });
  const report = JSON.parse(output);
  assert.equal(report.cases.length, 9);
  assert.deepEqual(report.selected_clauses, { before: 4, after: 9, rejected_serial_substitutions: 7 });
  assert.equal(report.reduction.repeated_declarations_removed, 3);
  assert.deepEqual(report.reduction.further_identical_unshared_interfaces, []);
  assert.equal(report.programmed_conductance.reachable_at_tick, 2);
  assert.equal(report.programmed_conductance.fixed_resistance, "unreachable");
  assert.equal(report.selective_sampling.finite_binary_cases, 25);
  assert.equal(report.additional_conditional_compositions.length, 3);
  assert.equal(report.certificate_count, 13);
});
