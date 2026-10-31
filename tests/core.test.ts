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
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, "knowledge.json"), "utf8"));
Object.assign(bundled, { "knowledge.json": manifest }, Object.fromEntries(
  manifest.packs.map((file: string) => [file, JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"))]),
));

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
  assert.equal(core.effects().effects.length, 78);
});

test("useProvider resets caches between providers", () => {
  core.useProvider((file) => (bundled as Record<string, unknown>)[file]);
  assert.equal(core.parameters().length, 39);
  core.useProvider((file) => ({
    ...((bundled as Record<string, unknown>)[file] as object),
    parameters: bundled["parameters.json"].parameters.map((p: core.Parameter) => p.id === 1 ? { ...p, name: "changed first label" } : p),
  }));
  assert.equal(core.parameters().length, 39);
  assert.equal(core.getParameter(1)?.name, "changed first label");
  // restore for any later tests in this process
  core.useProvider((file) => (bundled as Record<string, unknown>)[file]);
});

test("canonical parameter loading fails closed for an incomplete injected table", () => {
  core.useProvider(file => file === "parameters.json"
    ? { parameters: bundled["parameters.json"].parameters.slice(1) }
    : (bundled as Record<string, unknown>)[file]);
  try {
    assert.throws(() => core.parameters(), /39/);
  } finally {
    core.useProvider(file => (bundled as Record<string, unknown>)[file]);
  }
  assert.equal(core.parameters().length, 39);
});
