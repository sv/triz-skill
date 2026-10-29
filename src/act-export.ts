/**
 * Exports of a checked function model (src/act.ts). All fail closed: a model that does not
 * pass checkModel is never drawn or encoded. Format `lean` is the per-instance certificate of
 * src/act-cert.ts.
 *
 *  - toDot          — Graphviz DOT: boxes as record nodes (inputs | name | outputs), wires as
 *                     edges between port fields, styled by polarity.
 *  - toHypergraph   — open hypergraph: vertices are ports (typed by carrier), hyperedges are boxes
 *                     (input-port vertices → output-port vertices) and functions (one out-port
 *                     vertex → one in-port vertex, carrying the rating). The interface is the
 *                     unwired ports. Ports, not wires, are the vertices because a port may carry
 *                     several functions (fan-out, or a useful and a harmful wire on the same pair).
 *                     Declared box behaviour rides on the box hyperedge; carrier values on the carriers.
 *                     Flows ride along at the top level, like the budget; DOT draws each step of a
 *                     flow as a dotted edge between boxes.
 *  - fromHypergraph — the inverse decoder, so the encoding is tested to be lossless.
 *
 * Pure: no filesystem, so the hosted Worker entry can bundle it.
 */
import { checkModel, type FunctionModel, type Polarity } from "./act.js";
import { modelCertificate } from "./act-cert.js";
import { fail } from "./act-issues.js";

type Box = FunctionModel["boxes"][number];
type Port = NonNullable<Box["inputs"]>[number];

export type ExportFormat = "dot" | "hypergraph" | "lean";

/** Record-label text: backslash-escape the characters records treat as structure. */
const recordText = (s: string) => s.replace(/\s+/g, " ").replace(/[\\{}|<>"]/g, "\\$&");
/** Quoted DOT id: only quote and backslash are escaped, so distinct ids stay distinct. */
const quoted = (s: string) => `"${s.replace(/[\\"]/g, "\\$&")}"`;
/** Quoted DOT label: whitespace collapsed for display. */
const label = (s: string) => quoted(s.replace(/\s+/g, " "));

const EDGE_STYLE: Record<Polarity, string> = {
  useful: `color="black"`,
  insufficient: `color="black", style="dashed"`,
  excessive: `color="black", penwidth=2.5`,
  harmful: `color="red3", fontcolor="red3"`,
};
const NODE_STYLE: Record<Box["role"], string> = {
  tool: "",
  product: ", penwidth=2",
  mediator: "",
  environment: `, style="dashed", color="gray40"`,
  supersystem: `, style="dashed", color="gray40"`,
};

/**
 * Graphviz DOT. With rankdir=LR the outer braces lay the record out left to right and the inner
 * braces stack each port list vertically. Port fields get synthetic names (i0, o0) so no model id
 * needs escaping as a port name; ids and labels are escaped where they appear as text.
 */
export function toDot(model: FunctionModel): string {
  const portName = new Map<string, string>();
  const key = (box: string, side: "in" | "out", port: string) => JSON.stringify([box, side, port]);
  const lines = [
    "digraph function_model {",
    `  graph [rankdir=LR${model.system ? `, label=${label(model.system)}, labelloc=t` : ""}];`,
    `  node [shape=record, fontname="Helvetica", fontsize=11];`,
    `  edge [fontname="Helvetica", fontsize=9];`,
  ];
  for (const b of model.boxes) {
    const field = (side: "in" | "out", ports: Port[]) => ports.map((p, i) => {
      const name = `${side === "in" ? "i" : "o"}${i}`;
      portName.set(key(b.id, side, p.id), name);
      return `<${name}> ${recordText(p.id)} (${recordText(p.carrier)})`;
    }).join("|");
    const title = `${recordText(b.name)}\\n«${b.role}»`;
    const fields = [b.inputs?.length ? `{${field("in", b.inputs)}}` : "", title, b.outputs?.length ? `{${field("out", b.outputs)}}` : ""]
      .filter(Boolean).join("|");
    lines.push(`  ${quoted(b.id)} [label="{${fields}}"${NODE_STYLE[b.role]}];`);
  }
  for (const w of model.wires) {
    const from = `${quoted(w.from.box)}:${portName.get(key(w.from.box, "out", w.from.port))}:e`;
    const to = `${quoted(w.to.box)}:${portName.get(key(w.to.box, "in", w.to.port))}:w`;
    const text = [w.verb ?? w.id, ...(w.polarity === "useful" ? [] : [`[${w.polarity}]`])].join(" ");
    lines.push(`  ${from} -> ${to} [label=${label(text)}, ${EDGE_STYLE[w.polarity]}];`);
  }
  for (const f of model.flows ?? []) {
    f.path.slice(1).forEach((to, i) => {
      lines.push(`  ${quoted(f.path[i])} -> ${quoted(to)} [label=${label(`${f.name ?? f.id} (${f.carrier})`)}, style="dotted", color="blue3", fontcolor="blue3", constraint=false];`);
    });
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

export interface HyperVertex { box: string; port: string; side: "in" | "out"; carrier: string; label?: string; }
export type HyperEdge =
  | { kind: "box"; id: string; name: string; role: Box["role"]; action?: string; cost?: Record<string, number>; behavior?: Box["behavior"]; state?: Box["state"]; initial?: Box["initial"]; transition?: Box["transition"]; feasibility?: Box["feasibility"]; sources: number[]; targets: number[] }
  | { kind: "function"; id: string; carrier: string; polarity: Polarity; verb?: string; sources: [number]; targets: [number] };
export interface OpenHypergraph {
  format: "triz-open-hypergraph/1";
  domain: FunctionModel["domain"];
  system?: string;
  carriers: FunctionModel["carriers"];
  vertices: HyperVertex[];
  hyperedges: HyperEdge[];
  interface: { inputs: number[]; outputs: number[] };
  flows?: FunctionModel["flows"];
  budget?: FunctionModel["budget"];
  weights?: FunctionModel["weights"];
  contradictions?: FunctionModel["contradictions"];
}

/**
 * Open hypergraph form. Vertices are numbered in model order (each box's inputs, then its
 * outputs). The interface lists the unwired input ports (left leg) and unwired output ports
 * (right leg), the ports through which the model would compose with another.
 */
export function toHypergraph(model: FunctionModel): OpenHypergraph {
  const vertices: HyperVertex[] = [];
  const index = new Map<string, number>();
  const key = (box: string, side: "in" | "out", port: string) => JSON.stringify([box, side, port]);
  const vertex = (b: Box, side: "in" | "out", p: Port) => {
    index.set(key(b.id, side, p.id), vertices.length);
    vertices.push({ box: b.id, port: p.id, side, carrier: p.carrier, ...(p.label !== undefined ? { label: p.label } : {}) });
    return vertices.length - 1;
  };
  const hyperedges: HyperEdge[] = model.boxes.map((b) => ({
    kind: "box" as const,
    id: b.id,
    name: b.name,
    role: b.role,
    ...(b.action !== undefined ? { action: b.action } : {}),
    ...(b.cost !== undefined ? { cost: b.cost } : {}),
    ...(b.behavior !== undefined ? { behavior: b.behavior } : {}),
    ...(b.state !== undefined ? { state: b.state } : {}),
    ...(b.initial !== undefined ? { initial: b.initial } : {}),
    ...(b.transition !== undefined ? { transition: b.transition } : {}),
    ...(b.feasibility !== undefined ? { feasibility: b.feasibility } : {}),
    sources: (b.inputs ?? []).map((p) => vertex(b, "in", p)),
    targets: (b.outputs ?? []).map((p) => vertex(b, "out", p)),
  }));
  const wired = new Set<number>();
  for (const w of model.wires) {
    const s = index.get(key(w.from.box, "out", w.from.port))!, t = index.get(key(w.to.box, "in", w.to.port))!;
    wired.add(s).add(t);
    hyperedges.push({ kind: "function", id: w.id, carrier: w.carrier, polarity: w.polarity, ...(w.verb !== undefined ? { verb: w.verb } : {}), sources: [s], targets: [t] });
  }
  const open = (side: "in" | "out") => vertices.flatMap((v, i) => (v.side === side && !wired.has(i) ? [i] : []));
  return {
    format: "triz-open-hypergraph/1",
    domain: model.domain,
    ...(model.system !== undefined ? { system: model.system } : {}),
    carriers: model.carriers,
    vertices,
    hyperedges,
    interface: { inputs: open("in"), outputs: open("out") },
    ...(model.flows !== undefined ? { flows: model.flows } : {}),
    ...(model.budget !== undefined ? { budget: model.budget } : {}),
    ...(model.weights !== undefined ? { weights: model.weights } : {}),
    ...(model.contradictions !== undefined ? { contradictions: model.contradictions } : {}),
  };
}

/**
 * Decode an open hypergraph back into a function model. Fails closed when a vertex index is out
 * of range, a vertex is not owned by exactly one box hyperedge on its own side, a function does
 * not run out-port → in-port, the interface is not exactly the unwired ports, or the decoded
 * model does not type-check.
 */
export function fromHypergraph(h: OpenHypergraph): { ok: true; model: FunctionModel } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const owner = new Map<number, string>();
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < h.vertices.length;
  const boxes: Box[] = [];
  const wires: FunctionModel["wires"] = [];
  const wired = new Set<number>();
  let unread = 0;
  for (const e of h.hyperedges) {
    const outOfRange = [...e.sources, ...e.targets].filter((i) => !inRange(i));
    if (outOfRange.length) {
      // Skip only this hyperedge; later ones are still validated.
      for (const i of outOfRange) errors.push(`hyperedge '${e.id}': vertex ${i} out of range`);
      unread++;
      continue;
    }
    if (e.kind === "box") {
      const port = (side: "in" | "out") => (i: number): Port => {
        const v = h.vertices[i];
        if (owner.has(i)) errors.push(`vertex ${i} belongs to boxes '${owner.get(i)}' and '${e.id}'`);
        owner.set(i, e.id);
        if (v.box !== e.id || v.side !== side) errors.push(`vertex ${i} (${v.box}.${v.port}, ${v.side}) is not a${side === "in" ? "n input" : "n output"} of box '${e.id}'`);
        return { id: v.port, carrier: v.carrier, ...(v.label !== undefined ? { label: v.label } : {}) };
      };
      const inputs = e.sources.map(port("in")), outputs = e.targets.map(port("out"));
      boxes.push({
        id: e.id, name: e.name, role: e.role,
        ...(e.action !== undefined ? { action: e.action } : {}),
        ...(inputs.length ? { inputs } : {}),
        ...(outputs.length ? { outputs } : {}),
        ...(e.cost !== undefined ? { cost: e.cost } : {}),
        ...(e.behavior !== undefined ? { behavior: e.behavior } : {}),
        ...(e.state !== undefined ? { state: e.state } : {}),
        ...(e.initial !== undefined ? { initial: e.initial } : {}),
        ...(e.transition !== undefined ? { transition: e.transition } : {}),
        ...(e.feasibility !== undefined ? { feasibility: e.feasibility } : {}),
      });
    } else {
      if (e.sources.length !== 1 || e.targets.length !== 1) { errors.push(`function '${e.id}' must have one source and one target vertex`); continue; }
      const [s, t] = [h.vertices[e.sources[0]], h.vertices[e.targets[0]]];
      if (s.side !== "out") errors.push(`function '${e.id}': source vertex ${e.sources[0]} is not an output port`);
      if (t.side !== "in") errors.push(`function '${e.id}': target vertex ${e.targets[0]} is not an input port`);
      wired.add(e.sources[0]).add(e.targets[0]);
      wires.push({ id: e.id, from: { box: s.box, port: s.port }, to: { box: t.box, port: t.port }, carrier: e.carrier, polarity: e.polarity, ...(e.verb !== undefined ? { verb: e.verb } : {}) });
    }
  }
  // Ownership and interface are derived from every hyperedge, so they are not judged from a partial read.
  if (unread) return { ok: false, errors };
  h.vertices.forEach((_, i) => { if (!owner.has(i)) errors.push(`vertex ${i} belongs to no box`); });
  for (const side of ["in", "out"] as const) {
    const expected = h.vertices.flatMap((v, i) => (v.side === side && !wired.has(i) ? [i] : []));
    const given = side === "in" ? h.interface.inputs : h.interface.outputs;
    if (JSON.stringify([...given].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
      errors.push(`interface.${side === "in" ? "inputs" : "outputs"} must be exactly the unwired ${side === "in" ? "input" : "output"} ports [${expected.join(", ")}]`);
    }
  }
  if (errors.length) return { ok: false, errors };
  const model: FunctionModel = {
    domain: h.domain,
    ...(h.system !== undefined ? { system: h.system } : {}),
    carriers: h.carriers,
    boxes,
    wires,
    ...(h.flows !== undefined ? { flows: h.flows } : {}),
    ...(h.budget !== undefined ? { budget: h.budget } : {}),
    ...(h.weights !== undefined ? { weights: h.weights } : {}),
    ...(h.contradictions !== undefined ? { contradictions: h.contradictions } : {}),
  };
  const check = checkModel(model);
  return check.ok ? { ok: true, model } : { ok: false, errors: check.errors };
}

export const CERTIFICATE_NOTE = "Lean checks these verdicts for this one instance; nothing is extracted. Save as a .lean file and, in a checkout of github.com/sv/triz-skill, run `node scripts/certify.mjs <file>`: Lean against theory/ when it is built, otherwise the AXLE service (which you then trust). The id tables are the encoding; read them to see that the data is your model.";

/** Export after type-checking; fails closed with the checkModel errors. */
export function exportModel(model: FunctionModel, format: ExportFormat) {
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  if (format === "lean") {
    const cert = modelCertificate(model);
    return cert.ok ? { ok: true as const, format, content: cert.content, certifies: cert.certifies, note: CERTIFICATE_NOTE } : cert;
  }
  return format === "dot"
    ? { ok: true as const, format, content: toDot(model), note: "Render with Graphviz: dot -Tsvg model.dot > model.svg. Harmful functions are red, insufficient dashed, excessive bold." }
    : { ok: true as const, format, content: toHypergraph(model), note: "Vertices are ports typed by carrier; hyperedges are boxes and functions; interface = unwired input and output ports." };
}
