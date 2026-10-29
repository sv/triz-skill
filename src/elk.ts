/**
 * The layout engine of triz_export format `svg`: elkjs, an optional dependency, loaded on first
 * use. Only the stdio server (src/server.ts) passes loadElk to toolSpecs. The hosted Worker does
 * not import this file, so wrangler never bundles elkjs (src/worker.ts says why).
 */
import type { ElkNode, Layout } from "./act-export.js";

/** A variable, not a literal, so typechecking and bundlers do not need the optional package. */
const ELKJS = "elkjs/lib/elk.bundled.js";

let engine: Promise<Layout> | undefined;

/** elkjs's layout; rejects (and retries on the next call) when elkjs cannot be loaded. */
export function loadElk(): Promise<Layout> {
  engine ??= import(ELKJS).then((m: { default: new () => { layout(graph: ElkNode): Promise<ElkNode> } }) => {
    const elk = new m.default();
    return (graph: ElkNode) => elk.layout(graph);
  });
  engine.catch(() => { engine = undefined; });
  return engine;
}
