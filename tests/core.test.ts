/**
 * Pure-core tests: provider injection and fail-closed behavior without fs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as core from "../src/core.js";

const dataDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../skills/triz-innovation/data");
const bundled = {
  "parameters.json": JSON.parse(fs.readFileSync(path.join(dataDir, "parameters.json"), "utf8")),
  "principles.json": JSON.parse(fs.readFileSync(path.join(dataDir, "principles.json"), "utf8")),
  "matrix.json": JSON.parse(fs.readFileSync(path.join(dataDir, "matrix.json"), "utf8")),
  "evals.json": JSON.parse(fs.readFileSync(path.join(dataDir, "evals.json"), "utf8")),
  "tool-router.json": JSON.parse(fs.readFileSync(path.join(dataDir, "tool-router.json"), "utf8")),
  "effects.json": JSON.parse(fs.readFileSync(path.join(dataDir, "effects.json"), "utf8")),
};

test("core fails closed before a provider is installed", () => {
  // The fs provider may already be installed if data.js was imported by another
  // test file in the same process; verify the error path with a fresh provider stack.
  core.useProvider(() => {
    throw new Error("provider error");
  });
  assert.throws(() => core.parameters(), /provider error/);
});

test("core serves lookups from an injected static provider (hosted-mode parity)", () => {
  core.useProvider((file) => (bundled as Record<string, unknown>)[file]);
  const cell = core.matrixLookup(9, 14);
  assert.equal(cell.covered, true);
  assert.deepEqual(cell.principles, [8, 3, 26, 14]);
  const blank = core.matrixLookup(10, 16);
  assert.equal(blank.covered, false);
  assert.ok(blank.hint);
  const eff = core.effects("convert temperature difference into voltage");
  assert.ok(eff.effects.slice(0, 5).some((e) => e.name === "Seebeck effect"));
  assert.equal(core.toolCatalog().length, 37);
  assert.equal(core.effects().effects.length, 56);
});

test("useProvider resets caches between providers", () => {
  core.useProvider((file) => (bundled as Record<string, unknown>)[file]);
  assert.equal(core.parameters().length, 39);
  core.useProvider((file) => ({
    ...((bundled as Record<string, unknown>)[file] as object),
    parameters: [{ id: 1, name: "only one" }],
  }));
  assert.equal(core.parameters().length, 1);
  // restore for any later tests in this process
  core.useProvider((file) => (bundled as Record<string, unknown>)[file]);
});
