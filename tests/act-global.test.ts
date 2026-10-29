import { test } from "node:test";
import assert from "node:assert/strict";
import { globalSeparation } from "../src/act-global.js";

const impossible = {
  variables: ["x", "y", "z"].map((id) => ({ id, values: ["0", "1"] })),
  regions: [
    { id: "xy", variables: ["x", "y"], allowed: [["0", "0"], ["1", "1"]] },
    { id: "yz", variables: ["y", "z"], allowed: [["0", "0"], ["1", "1"]] },
    { id: "xz", variables: ["x", "z"], allowed: [["0", "1"], ["1", "0"]] },
  ],
};

test("pairwise-consistent projections can have no global section", () => {
  const r = globalSeparation(impossible);
  assert.ok(r.ok && r.verdict === "unsatisfiable" && r.complete, JSON.stringify(r));
});

test("a returned global witness satisfies every complete local tuple", () => {
  const s = { ...impossible, regions: impossible.regions.slice(0, 2) };
  const r = globalSeparation(s);
  assert.ok(r.ok && r.verdict === "satisfiable");
  for (const region of s.regions) assert.ok(region.allowed.some((row) => row.every((v, i) => r.witness[region.variables[i]] === v)));
  const empty = globalSeparation({ variables: [], regions: [{ id: "empty", variables: [], allowed: [[]] }] });
  assert.ok(empty.ok && empty.verdict === "satisfiable");
  const contradiction = globalSeparation({ variables: [], regions: [{ id: "empty", variables: [], allowed: [] }] });
  assert.ok(contradiction.ok && contradiction.verdict === "unsatisfiable");
});

test("global separation validates strict input, local tuple arity and domains, and reports caps as unknown", () => {
  assert.equal(globalSeparation({ ...impossible, additional: true }).ok, false);
  assert.equal(globalSeparation({ ...impossible, regions: [{ id: "bad", variables: ["ghost"], allowed: [["0"]] }] }).ok, false);
  assert.equal(globalSeparation({ ...impossible, regions: [{ id: "bad", variables: ["x"], allowed: [["0", "1"]] }] }).ok, false);
  assert.equal(globalSeparation({ ...impossible, regions: [{ id: "bad", variables: ["x"], allowed: [["unknown"]] }] }).ok, false);
  const r = globalSeparation({ ...impossible, max_work: 1 });
  assert.ok(r.ok && r.verdict === "undecided" && r.complete === false);
});
