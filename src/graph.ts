/**
 * OTSM-TRIZ Network of Problems + DIKWP purpose layer.
 *
 * Pure graph reasoning over the open-contradiction network:
 *  - coreConflict  — the TOC core conflict = node with the most outgoing
 *    `dissolves` edges (resolving it removes the most other contradictions).
 *    Ties go to the node whose physical contradiction is irreducible, ahead of one
 *    that already separates; every entry carries that status.
 *  - nodeSeparation — a node may carry a PhysicalContradiction (src/act.ts); it is
 *    checked by separationCheck, and an invalid one fails closed for that node only.
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
import { PhysicalContradiction, separationCheck } from "./act.js";
import { separationBasis } from "./act-basis.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type EdgeType = "couples" | "blocks" | "dissolves";
export interface Edge { from: string; to: string; type: EdgeType; via?: string; }
export interface Purpose { statement: string; invariant: string | null; spec: string | null; verified_by?: unknown; }
export interface Node {
  id: string; section: string; title: string; pc: string;
  separation_axis: string; sub_problems: string[]; status: string;
  purpose: Purpose; refs: { registry: string[]; specs: string[] };
  /** Optional PhysicalContradiction (src/act.ts schema); validated when used, never trusted. */
  contradiction?: unknown;
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

export type SeparationStatus = "irreducible" | "unmodelled" | "invalid" | "separable" | "no-contradiction";

/**
 * A node's contradiction, checked: `irreducible` (some cell admits no value), `separable` (a
 * piecewise assignment exists), `no-contradiction` (one value meets every demand), `invalid`
 * (fails the schema or separationCheck; the reason is returned and nothing else is concluded),
 * or `unmodelled` (the node carries none).
 */
export function nodeSeparation(node: Node) {
  if (node.contradiction === undefined) return { status: "unmodelled" as const };
  const parsed = PhysicalContradiction.safeParse(node.contradiction);
  if (!parsed.success) {
    return { status: "invalid" as const, reason: "contradiction does not match the PhysicalContradiction schema", errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const r = separationBasis(separationCheck(parsed.data));
  if (!r.ok) return { status: "invalid" as const, reason: "separationCheck rejected the contradiction", errors: r.errors };
  const status: SeparationStatus = !r.contradiction ? "no-contradiction" : r.gluable ? "separable" : "irreducible";
  return { status, check: r };
}

/** Tie-break order: unresolved cores first, nodes that already separate or are no contradiction last. */
const SEPARATION_RANK: Record<SeparationStatus, number> = { irreducible: 0, unmodelled: 1, invalid: 1, separable: 2, "no-contradiction": 3 };

/**
 * Rank nodes by how many contradictions their resolution dissolves (TOC core conflict first).
 * Ties go to the node whose contradiction is irreducible, then to unmodelled or invalid ones,
 * then to nodes that already separate, then to nodes that are not contradictions; then more
 * `couples`, then id. A node ranked on `dissolves` alone keeps its place even when it already
 * separates, but it is flagged, since separation already gives it a resolution route.
 */
export function coreConflict(nodes: Node[], edges: Edge[]): Array<{ id: string; title: string; dissolves: string[]; couples: number; separation: SeparationStatus; flag?: string }> {
  return nodes
    .map((n) => {
      const separation = nodeSeparation(n).status;
      return {
        id: n.id,
        title: n.title,
        dissolves: edges.filter((e) => e.type === "dissolves" && e.from === n.id).map((e) => e.to),
        couples: edges.filter((e) => e.type === "couples" && (e.from === n.id || e.to === n.id)).length,
        separation,
        ...(separation === "separable" ? { flag: "its contradiction already separates: assign the parameter piecewise before treating it as the core" }
          : separation === "no-contradiction" ? { flag: "one value meets every demand: not a physical contradiction" }
          : separation === "invalid" ? { flag: "its contradiction is invalid: fix it before ranking on it" } : {}),
      };
    })
    .sort((a, b) => b.dissolves.length - a.dissolves.length
      || SEPARATION_RANK[a.separation] - SEPARATION_RANK[b.separation]
      || b.couples - a.couples || a.id.localeCompare(b.id));
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
      separation: nodeSeparation(n),
    })),
    edges,
  };
}
