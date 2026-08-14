/**
 * Unit-tests the open-data importer core (parse/validate/merge) so the logic is
 * proven even though the network fetch itself is environment-dependent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsvMatrix, parseJsonMatrix, validate, merge } from "../src/import.js";
import type { MatrixCell } from "../src/data.js";

const CSV = [
  ",1,2,9,14",
  "1,,15,29,1",
  "9,8,,,35 10 16",
  "14,1,40,19,",
].join("\n");

test("parseCsvMatrix reads header + cells, skips diagonal/empty", () => {
  const cells = parseCsvMatrix(CSV);
  assert.deepEqual(cells["9-14"], [35, 10, 16]);
  assert.deepEqual(cells["1-2"], [15]);
  assert.deepEqual(cells["14-1"], [1]);
  assert.ok(!("9-9" in cells), "diagonal skipped");
  assert.ok(!("14-14" in cells), "empty cell skipped");
});

test("parseJsonMatrix accepts nested and flat shapes", () => {
  assert.deepEqual(parseJsonMatrix({ cells: { "3-5": [1, 2] } })["3-5"], [1, 2]);
  assert.deepEqual(parseJsonMatrix({ "3-5": [7] })["3-5"], [7]);
  assert.ok(!("bad" in parseJsonMatrix({ bad: [1] })), "non i-w keys dropped");
});

test("validate rejects out-of-range params/principles and empty", () => {
  assert.equal(validate({}).ok, false);
  assert.equal(validate({ "40-1": [1] }).ok, false); // param 40 invalid
  assert.equal(validate({ "1-2": [41] }).ok, false); // principle 41 invalid
  assert.equal(validate({ "1-2": [15] }).ok, true);
});

test("merge: explicit overlay cells are preserved and win on conflict", () => {
  const imported = { "9-14": [8, 13], "3-5": [1] };
  const overlay: Record<string, MatrixCell> = {
    "9-14": { improving_id: 9, worsening_id: 14, improving_label: "Speed", worsening_label: "Strength", principles: [35, 10], source: "project-overlay" },
  };
  const m = merge(imported, overlay);
  assert.equal(m["9-14"].source, "project-overlay", "overlay wins");
  assert.deepEqual(m["9-14"].principles, [35, 10]);
  assert.equal(m["3-5"].source, "altshuller", "imported cell tagged");
});
