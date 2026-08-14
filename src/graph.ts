/**
 * OTSM-TRIZ Network of Problems + DIKWP purpose layer.
 *
 * Pure graph reasoning over the open-contradiction network:
 *  - coreConflict  — the TOC core conflict = node with the most outgoing
 *    `dissolves` edges (resolving it removes the most other contradictions).
 *  - clusters      — connected components over `couples` edges.
 *  - purposeVerified — DIKWP reverse-regulation: a node's purpose (the invariant
 *    it serves) is "verified" when a linked registry entry carries a verified_by
 *    record. Closing a verify→repair loop (which writes verified_by) flips it.
 *
 * The graph itself is project data, not part of the neutral TRIZ core. Point
 * TRIZ_GRAPH (and optionally TRIZ_REGISTRY) at your own network of problems;
 * `examples/` holds a synthetic one with the expected shape.
 *
 * Reasoning functions are pure (take data as args); loaders resolve the JSON.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type EdgeType = "couples" | "blocks" | "dissolves";
export interface Edge { from: string; to: string; type: EdgeType; via?: string; }
export interface Purpose { statement: string; invariant: string | null; spec: string | null; verified_by?: unknown; }
export interface Node {
  id: string; section: string; title: string; pc: string;
  separation_axis: string; sub_problems: string[]; status: string;
  purpose: Purpose; refs: { registry: string[]; specs: string[] };
}
export interface Graph { nodes: Node[]; edges: Edge[]; _meta?: unknown; }

let _graph: Graph | null = null;
export function resolveGraphPath(): string {
  const candidates = [
    process.env.TRIZ_GRAPH,
    path.resolve(process.cwd(), "data/problem-graph.json"),
    path.resolve(__dirname, "../data/problem-graph.json"),
  ].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "problem graph not found; set TRIZ_GRAPH to your network-of-problems JSON (see examples/problem-graph.json) or place it at data/problem-graph.json",
  );
}

export function loadGraph(): Graph {
  if (_graph) return _graph;
  return (_graph = JSON.parse(fs.readFileSync(resolveGraphPath(), "utf8")) as Graph);
}

/** Registry entries keyed by id, for purpose-verification cross-reference. */
export function loadRegistryById(): Record<string, any> {
  const candidates = [
    process.env.TRIZ_REGISTRY,
    path.resolve(process.cwd(), "data/triz-registry.json"),
    path.resolve(__dirname, "../data/triz-registry.json"),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, "utf8"));
      return Object.fromEntries((d.contradictions ?? []).map((c: any) => [c.id, c]));
    }
  }
  return {};
}

/** Rank nodes by how many contradictions their resolution dissolves (TOC core conflict first). */
export function coreConflict(nodes: Node[], edges: Edge[]): Array<{ id: string; title: string; dissolves: string[]; couples: number }> {
  return nodes
    .map((n) => ({
      id: n.id,
      title: n.title,
      dissolves: edges.filter((e) => e.type === "dissolves" && e.from === n.id).map((e) => e.to),
      couples: edges.filter((e) => e.type === "couples" && (e.from === n.id || e.to === n.id)).length,
    }))
    .sort((a, b) => b.dissolves.length - a.dissolves.length || b.couples - a.couples || a.id.localeCompare(b.id));
}

/** Connected components over `couples` edges (the coupled clusters). */
export function clusters(nodes: Node[], edges: Edge[]): string[][] {
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const e of edges) if (e.type === "couples") union(e.from, e.to);
  const groups = new Map<string, string[]>();
  for (const n of nodes) { const r = find(n.id); (groups.get(r) ?? groups.set(r, []).get(r)!).push(n.id); }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort());
}

/** DIKWP: is the node's purpose (its invariant) verifier-backed — either directly on the
 * node (purpose.verified_by, written when its spec's invariant is checked) or via a linked
 * registry entry that carries verified_by? */
export function purposeVerified(node: Node, registryById: Record<string, any>): boolean {
  return Boolean(node.purpose?.verified_by)
    || (node.refs?.registry ?? []).some((id) => Boolean(registryById[id]?.verified_by));
}

export interface PurposeGate { id: string; satisfied: boolean; reason: string; }
/** A node is "purpose-secured" only when it names an invariant AND that invariant is verifier-backed. Fail closed. */
export function purposeGate(node: Node, registryById: Record<string, any>): PurposeGate {
  if (!node.purpose?.invariant || !node.purpose?.spec) {
    return { id: node.id, satisfied: false, reason: "no formal invariant bound to this purpose yet" };
  }
  if (!purposeVerified(node, registryById)) {
    return { id: node.id, satisfied: false, reason: `invariant '${node.purpose.invariant}' not yet verifier-backed (no node/registry verified_by)` };
  }
  const via = node.purpose.verified_by
    ? "direct spec check"
    : `registry ${node.refs.registry.filter((id) => registryById[id]?.verified_by).join(", ")}`;
  return { id: node.id, satisfied: true, reason: `invariant '${node.purpose.invariant}' verifier-backed via ${via}` };
}

/** Full analysed view for the MCP tool / report. */
export function analyse() {
  const { nodes, edges } = loadGraph();
  const reg = loadRegistryById();
  return {
    coreConflict: coreConflict(nodes, edges),
    clusters: clusters(nodes, edges),
    nodes: nodes.map((n) => ({
      id: n.id, section: n.section, title: n.title, status: n.status,
      purpose: n.purpose.statement, invariant: n.purpose.invariant, spec: n.purpose.spec,
      purpose_secured: purposeGate(n, reg).satisfied,
      purpose_reason: purposeGate(n, reg).reason,
    })),
    edges,
  };
}
