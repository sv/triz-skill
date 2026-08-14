/**
 * OTSM Network-of-Problems + DIKWP purpose-layer tests.
 * Pure functions on synthetic data + structural checks on the shipped example graph.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The graph is project data; the loaders read whatever TRIZ_GRAPH/TRIZ_REGISTRY point at.
const here = path.dirname(fileURLToPath(import.meta.url));
process.env.TRIZ_GRAPH ??= path.resolve(here, "../examples/problem-graph.json");
process.env.TRIZ_REGISTRY ??= path.resolve(here, "../examples/triz-registry.json");
import { coreConflict, clusters, purposeVerified, purposeGate, loadGraph, analyse, type Node, type Edge } from "../src/graph.js";

const N = (id: string, extra: Partial<Node> = {}): Node => ({
  id, section: "x", title: id, pc: "", separation_axis: "", sub_problems: [], status: "open",
  purpose: { statement: "", invariant: null, spec: null }, refs: { registry: [], specs: [] }, ...extra,
});

const nodes = [N("S1"), N("S2"), N("S7"), N("S4")];
const edges: Edge[] = [
  { from: "S2", to: "S1", type: "dissolves" },
  { from: "S2", to: "S7", type: "dissolves" },
  { from: "S1", to: "S2", type: "couples" },
  { from: "S7", to: "S2", type: "couples" },
  { from: "S1", to: "S7", type: "couples" },
];

test("core conflict = node with most 'dissolves' out-edges (S2)", () => {
  const ranked = coreConflict(nodes, edges);
  assert.equal(ranked[0].id, "S2");
  assert.deepEqual(ranked[0].dissolves.sort(), ["S1", "S7"]);
  assert.equal(ranked[1].dissolves.length, 0);
});

test("clusters = connected components over 'couples' ({S1,S2,S7})", () => {
  const c = clusters(nodes, edges);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0], ["S1", "S2", "S7"]);
});

test("purposeVerified true iff a linked registry entry has verified_by", () => {
  const node = N("S4", { refs: { registry: ["R0002-001"], specs: [] } });
  assert.equal(purposeVerified(node, { "R0002-001": { verified_by: { method: "quint" } } }), true);
  assert.equal(purposeVerified(node, { "R0002-001": {} }), false);
  assert.equal(purposeVerified(N("S9"), {}), false);
});

test("purposeGate fails closed without an invariant, passes when verifier-backed", () => {
  const noInv = N("S3", { purpose: { statement: "x", invariant: null, spec: null }, refs: { registry: ["R0002-001"], specs: [] } });
  assert.equal(purposeGate(noInv, { "R0002-001": { verified_by: {} } }).satisfied, false);

  const bound = N("S4", { purpose: { statement: "x", invariant: "inv", spec: "s.qnt" }, refs: { registry: ["R0002-001"], specs: [] } });
  assert.equal(purposeGate(bound, { "R0002-001": {} }).satisfied, false);
  assert.equal(purposeGate(bound, { "R0002-001": { verified_by: {} } }).satisfied, true);
});

test("example graph: P1 is the core conflict and {P1,P2,P3} is a cluster", () => {
  const g = loadGraph();
  assert.equal(coreConflict(g.nodes, g.edges)[0].id, "P1");
  assert.ok(clusters(g.nodes, g.edges).some((c) => ["P1", "P2", "P3"].every((x) => c.includes(x))));
});

test("purposeVerified also honours a node-level purpose.verified_by (direct spec check)", () => {
  const node = N("S2", { purpose: { statement: "x", invariant: "inv", spec: "c.qnt", verified_by: { method: "quint" } }, refs: { registry: [], specs: [] } });
  assert.equal(purposeVerified(node, {}), true);
  assert.equal(purposeGate(node, {}).satisfied, true);
});

test("analyse() reports purpose gates from both evidence routes", () => {
  const byId = Object.fromEntries(analyse().nodes.map((n) => [n.id, n]));
  assert.equal(byId["P1"].purpose_secured, true); // node-level verified_by (direct spec check)
  assert.equal(byId["P2"].purpose_secured, true); // registry-linked verified_by
  assert.equal(byId["P3"].purpose_secured, false); // invariant bound but nothing verifies it
  assert.equal(byId["P4"].purpose_secured, false); // no invariant bound at all
  assert.match(byId["P4"].purpose_reason, /no formal invariant/);
});
