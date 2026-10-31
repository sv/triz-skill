import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesizeFinite } from "../src/act-synthesis.js";
import { SymbolicPruner, symbolicStats } from "../src/act-synthesis-symbolic.js";
import { checkBoundarySubstitution, checkRegionCertificate, checkRegionDeclarations } from "../src/act-symbolic-certificate.js";
import { symbolicLeanProblems } from "../src/act-symbolic-lean.js";
import { EngineeringBudget } from "../src/act-contract.js";
import { pruningStats } from "../src/act-synthesis-pruning.js";
import { synthesisFixture } from "./support/synthesis.js";

import { wholePortBoundary as boundary } from "./support/whole-port-oracle.js";

const certificates = (input = synthesisFixture("memoization", 2)) => {
  const r = synthesizeFinite({ ...input, strategy: "symbolic", include_symbolic_certificate: true });
  assert.ok(r.ok && "symbolicCertificates" in r && r.symbolicCertificates?.length);
  return r.symbolicCertificates;
};

test("sparse cumulative maps cannot pass certificate checks or declaration binding", () => {
  const input = synthesisFixture("memoization", 2), c = certificates(input)[0];
  for (const layer of c.layers) for (const m of layer) m.image = new Array(m.inputs.length);
  assert.equal(checkRegionCertificate(c), false);
  assert.equal(checkRegionDeclarations(c, input.model, input.holes), false);
  for (const path of ["inputs", "outputs", "image"] as const) {
    const bad = certificates(input)[0];
    delete bad.layers[0][0][path][0];
    assert.equal(checkRegionCertificate(bad), false);
  }
  const bad = certificates(input)[0];
  bad.stages[1].edges[0].from = "0" as unknown as number;
  assert.equal(checkRegionCertificate(bad), false);
});

test("source binding rejects stale rows, renamed interfaces, reordered choices and altered internal wires", () => {
  const input = synthesisFixture("coupled", 2), c = certificates(input)[0];
  const changedRows = structuredClone(input);
  changedRows.holes[0].alternatives.reverse();
  assert.equal(checkRegionDeclarations(c, changedRows.model, changedRows.holes), false);
  const renamed = structuredClone(input);
  renamed.model.boxes[0].outputs![0].id = "renamed";
  assert.equal(checkRegionDeclarations(c, renamed.model, renamed.holes), false);
  const wrongWire = structuredClone(input);
  wrongWire.model.wires[0].from.port = "absent";
  assert.equal(checkRegionDeclarations(c, wrongWire.model, wrongWire.holes), false);
});

test("whole-context substitution checking detects lost boxes, wires, engineering properties and virtual rows", () => {
  const input = synthesisFixture("coupled", 2), c = certificates(input)[0], head = input.model.boxes[0];
  input.model.boxes.push({ id: "side", name: "Side constraint", role: "tool", behavior: [{ in: {}, out: {} }], feasibility: [{ cost: { usd: 7 } }] });
  const sink = input.model.boxes.find(b => b.id === "product0")!;
  const maps = c.layers.at(-1)!;
  const virtual = [{ box: head.id, alternatives: maps.map((m, i) => ({ id: `summary-${i}`, behavior: m.inputs.map((x, j) => ({ in: { in: x[0] }, out: { out: m.outputs[m.image[j]][0] } })) })) }];
  const reduced = { ...input.model, boxes: [{ ...head, behavior: virtual[0].alternatives[0].behavior }, sink, input.model.boxes.at(-1)!],
    wires: [{ ...input.model.wires.at(-1)!, from: { box: head.id, port: "out" } }] };
  assert.ok(checkBoundarySubstitution(input.model, input.holes, [c], reduced, virtual));
  const noSide = structuredClone(reduced); noSide.boxes.pop();
  assert.equal(checkBoundarySubstitution(input.model, input.holes, [c], noSide, virtual), false);
  const noWire = structuredClone(reduced); noWire.wires = [];
  assert.equal(checkBoundarySubstitution(input.model, input.holes, [c], noWire, virtual), false);
  const cheaper = structuredClone(reduced); cheaper.boxes.at(-1)!.feasibility = [{}];
  assert.equal(checkBoundarySubstitution(input.model, input.holes, [c], cheaper, virtual), false);
  const changedPolarity = structuredClone(reduced); changedPolarity.wires[0].polarity = "harmful";
  assert.equal(checkBoundarySubstitution(input.model, input.holes, [c], changedPolarity, virtual), false);
  const changedVirtual = structuredClone(virtual); changedVirtual[0].alternatives[0].behavior[0].out.out = "1";
  assert.equal(checkBoundarySubstitution(input.model, input.holes, [c], reduced, changedVirtual), false);
});


test("backward pruning preserves every oracle solution under all 343 nonempty partial choice domains", () => {
  for (const restricted of [false, true]) {
    const input = synthesisFixture("coupled", 3);
    input.holes.forEach(h => h.alternatives.push({ ...h.alternatives[0], id: "constant", behavior: ["0", "1"].map(x => ({ in: { in: x }, out: { out: "0" } })) }));
    input.holes.reverse();
    if (restricted) for (const m of [input.model, input.contract.target]) m.boxes[0].behavior = [m.boxes[0].behavior![0]];
    const expected = boundary(input.contract.target), solutions: number[][] = [];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
      const word = [a, b, c], model = structuredClone(input.model);
      input.holes.forEach((h, i) => { model.boxes.find(b => b.id === h.box)!.behavior = h.alternatives[word[i]].behavior; });
      if (boundary(model) === expected) solutions.push(word);
    }
    const stats = symbolicStats(), pruner = SymbolicPruner.compile(input.model, input.contract.target, input.holes, new EngineeringBudget(1_000_000), pruningStats(), stats, 100_000, 200_000, true, true);
    assert.ok(pruner);
    for (let a = 1n; a < 8n; a++) for (let b = 1n; b < 8n; b++) for (let c = 1n; c < 8n; c++) {
      const original: bigint[] = [a, b, c];
      const filtered: bigint[] | undefined = pruner.filter(original)?.domains;
      const viable = solutions.filter(word => word.every((choice, i) => (original[i] & (1n << BigInt(choice))) !== 0n));
      for (const word of viable) assert.ok(filtered && word.every((choice, i) => (filtered[i] & (1n << BigInt(choice))) !== 0n));
      if (original.every(d => (d & (d - 1n)) === 0n)) assert.equal(filtered !== undefined, viable.length > 0);
      assert.deepEqual(original, [a, b, c]);
    }
    assert.equal(stats.filterFallbacks, 0);
  }
});

test("tamper checking requires an actual kernel false proof, and axiom audits match theorem identities", () => {
  const falseProof = JSON.stringify({ severity: "error", data: "Tactic `decide` proved that the proposition\n  False\nis false" });
  assert.deepEqual(symbolicLeanProblems({ status: 1, stdout: falseProof }, [], true), []);
  for (const run of [{ status: null, error: "missing lean" }, { status: null, signal: "SIGTERM" }, { status: 1, stderr: "out of memory" }, { status: 1, stdout: "bad json" }]) assert.ok(symbolicLeanProblems(run, [], true).length);
  const line = (name: string, axioms = "propext") => JSON.stringify({ severity: "info", data: `'${name}' depends on axioms: [${axioms}]` });
  assert.deepEqual(symbolicLeanProblems({ status: 0, stdout: line("good") }, ["good"]), []);
  assert.ok(symbolicLeanProblems({ status: 0, stdout: line("other") }, ["good"]).length);
  assert.ok(symbolicLeanProblems({ status: 0, stdout: line("good") + "\n" + line("good") }, ["good", "missing"]).length);
  assert.ok(symbolicLeanProblems({ status: 0, stdout: line("good", "sorryAx") }, ["good"]).length);
});
