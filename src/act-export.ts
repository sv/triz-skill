/**
 * Exports of a checked function model (src/act.ts). All fail closed: a model that does not
 * pass checkModel is never drawn or encoded. Format `lean` is the per-instance certificate of
 * src/act-cert.ts.
 *
 *  - toDot          — Graphviz DOT: boxes as HTML-like tables (header with name and role, input
 *                     ports left, output ports right), wires as edges between port cells, styled
 *                     by polarity, with a legend in the graph label.
 *  - toMermaid      — Mermaid flowchart: boxes as nodes, wires as edges naming their ports, for
 *                     viewers that render Mermaid without tools.
 *  - toSvg          — a self-contained SVG drawn from an ELK layout (layered, orthogonal edges,
 *                     ports fixed on the box sides), with DOT's visual conventions, for a picture
 *                     without Graphviz. The layout engine is passed in: src/elk.ts loads the
 *                     optional elkjs package for the stdio server; the hosted Worker has none.
 *  - toHypergraph  — open hypergraph: vertices are ports (typed by carrier), hyperedges are boxes
 *                     (input-port vertices → output-port vertices) and functions (one out-port
 *                     vertex → one in-port vertex, carrying the rating). The interface is the
 *                     unwired ports. Ports, not wires, are the vertices because a port may carry
 *                     several functions (fan-out, or a useful and a harmful wire on the same pair).
 *                     Declared box behaviour rides on the box hyperedge; carrier values on the carriers.
 *                     Flows ride along at the top level, like the budget; DOT draws each step of a
 *                     flow as a dotted edge between boxes.
 *  - fromHypergraph — the inverse decoder, so the encoding is tested to be lossless.
 *
 * Pure: no filesystem and no layout engine of its own, so the hosted Worker entry can bundle it.
 */
import { checkModel, type FunctionModel, type Polarity } from "./act.js";
import { modelCertificate } from "./act-cert.js";
import { fail, issue } from "./act-issues.js";

type Box = FunctionModel["boxes"][number];
type Port = NonNullable<Box["inputs"]>[number];

export type ExportFormat = "dot" | "mermaid" | "hypergraph" | "lean";

/** Quoted DOT id: only quote and backslash are escaped, so distinct ids stay distinct. */
const quoted = (s: string) => `"${s.replace(/[\\"]/g, "\\$&")}"`;
/** Quoted DOT label: whitespace collapsed for display. */
const label = (s: string) => quoted(s.replace(/\s+/g, " "));
const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
/** Text inside an HTML-like label: whitespace collapsed, markup characters as entities. */
const html = (s: string) => s.replace(/\s+/g, " ").replace(/[&<>"]/g, (c) => ENTITY[c]);

/** Polarity is told by line style and the [polarity] tag as well as by colour, so it survives greyscale. */
const EDGE_STYLE: Record<Polarity, string> = {
  useful: `color="gray20"`,
  insufficient: `color="gray20", style="dashed"`,
  excessive: `color="gray20", penwidth=2.5`,
  harmful: `color="red3", fontcolor="red3", penwidth=1.5`,
};
/** A legend line sample: the bottom border of an empty cell, in the edge's colour, width, and dash. */
const sample = (attrs: string) =>
  `<TD><TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0"><TR><TD WIDTH="24" HEIGHT="6" SIDES="B" ${attrs}></TD></TR><TR><TD HEIGHT="6"></TD></TR></TABLE></TD>`;
const LEGEND_LINE: Record<Polarity | "flow", string> = {
  useful: sample(`BORDER="1" COLOR="gray20"`),
  insufficient: sample(`BORDER="1" COLOR="gray20" STYLE="dashed"`),
  excessive: sample(`BORDER="3" COLOR="gray20"`),
  harmful: sample(`BORDER="2" COLOR="red3"`),
  flow: sample(`BORDER="1" COLOR="blue3" STYLE="dotted"`),
};
/** Role is told by the header fill and the «role» line; outer roles get a dashed border, the product a heavy one. */
const ROLE_STYLE: Record<Box["role"], { fill: string; border: string }> = {
  tool: { fill: "#d6e4f5", border: `BORDER="1"` },
  product: { fill: "#d5ecd4", border: `BORDER="2"` },
  mediator: { fill: "#e8e8e8", border: `BORDER="1"` },
  supersystem: { fill: "#f6e7c8", border: `BORDER="1" STYLE="dashed"` },
  environment: { fill: "#f3f3f3", border: `BORDER="1" STYLE="dashed"` },
};
const ROLES = Object.keys(ROLE_STYLE) as Box["role"][];
const POLARITIES = Object.keys(EDGE_STYLE) as Polarity[];

/**
 * Graphviz DOT with HTML-like labels (record shapes make dot drop flat edges between adjacent
 * nodes, which flows produce). Each box is a table: a header with name and «role», then input
 * ports down the left and output ports down the right, each with its carrier. Port cells get
 * synthetic names (i0, o0) so no model id needs escaping as a port name. A port no wire touches
 * is open, part of the interface, and drawn in italics. The graph label carries the title and a
 * legend of the roles and polarities that occur, so the legend adds no node. The background is
 * white, so the drawing reads the same under a dark theme.
 */
export function toDot(model: FunctionModel): string {
  const portName = new Map<string, string>();
  const key = (box: string, side: "in" | "out", port: string) => JSON.stringify([box, side, port]);
  const wired = new Set(model.wires.flatMap((w) => [key(w.from.box, "out", w.from.port), key(w.to.box, "in", w.to.port)]));
  const roles = ROLES.filter((r) => model.boxes.some((b) => b.role === r));
  const strokes = [...POLARITIES.filter((p) => model.wires.some((w) => w.polarity === p)), ...(model.flows?.length ? ["flow" as const] : [])];
  const open = model.boxes.some((b) =>
    [...(b.inputs ?? []).map((p) => key(b.id, "in", p.id)), ...(b.outputs ?? []).map((p) => key(b.id, "out", p.id))].some((k) => !wired.has(k)));
  const legend = [
    ...roles.map((r) => `<TD BGCOLOR="${ROLE_STYLE[r].fill}" BORDER="1" COLOR="gray50">«${r}»</TD>`),
    ...strokes.map((p) => `${LEGEND_LINE[p]}<TD ALIGN="LEFT">${p}</TD>`),
    ...(open ? [`<TD><I>open port</I></TD>`] : []),
  ];
  const title = model.system ? `<TR><TD><FONT POINT-SIZE="14"><B>${html(model.system)}</B></FONT></TD></TR>` : "";
  const lines = [
    "digraph function_model {",
    `  graph [rankdir=LR, bgcolor="white", fontname="Helvetica", fontsize=10, nodesep=0.3, ranksep=0.6, labelloc=t, label=<<TABLE BORDER="0" CELLSPACING="0">${title}<TR><TD><TABLE BORDER="0" CELLSPACING="3" CELLPADDING="2"><TR>${legend.join("")}</TR></TABLE></TD></TR></TABLE>>];`,
    `  node [shape=plain, fontname="Helvetica", fontsize=11];`,
    `  edge [fontname="Helvetica", fontsize=9, arrowsize=0.7];`,
  ];
  for (const b of model.boxes) {
    const cell = (side: "in" | "out", p: Port | undefined, i: number) => {
      if (!p) return `<TD></TD>`;
      const name = `${side === "in" ? "i" : "o"}${i}`;
      portName.set(key(b.id, side, p.id), name);
      const text = `${html(p.label ?? p.id)} <FONT POINT-SIZE="9" COLOR="gray35">${html(p.carrier)}</FONT>`;
      return `<TD PORT="${name}" ALIGN="${side === "in" ? "LEFT" : "RIGHT"}">${wired.has(key(b.id, side, p.id)) ? text : `<I>${text}</I>`}</TD>`;
    };
    const ins = b.inputs ?? [], outs = b.outputs ?? [];
    const rows = Array.from({ length: Math.max(ins.length, outs.length) }, (_, i) => `<TR>${cell("in", ins[i], i)}${cell("out", outs[i], i)}</TR>`);
    const { fill, border } = ROLE_STYLE[b.role];
    const header = `<TR><TD COLSPAN="2" BGCOLOR="${fill}"><B>${html(b.name)}</B><BR/><FONT POINT-SIZE="9">«${b.role}»</FONT></TD></TR>`;
    lines.push(`  ${quoted(b.id)} [label=<<TABLE ${border} CELLBORDER="0" CELLSPACING="0" CELLPADDING="4">${header}${rows.join("")}</TABLE>>];`);
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

/** Mermaid label text: whitespace collapsed; characters Mermaid reads as syntax or markup as numeric entity codes. */
const mmd = (s: string) => s.replace(/\s+/g, " ").replace(/[#"&<>`]/g, (c) => `#${c.charCodeAt(0)};`);
/** Polarity as Mermaid arrow and link style; colours are set on text as well, so dark themes stay legible. */
const MERMAID_LINK: Record<Polarity, { arrow: (t: string) => string; style?: string }> = {
  useful: { arrow: (t) => `-- "${t}" -->` },
  insufficient: { arrow: (t) => `-. "${t}" .->`, style: "stroke-dasharray:6 4" },
  excessive: { arrow: (t) => `== "${t}" ==>` },
  harmful: { arrow: (t) => `-- "${t}" -->`, style: "stroke:#c00,color:#c00,stroke-width:2px" },
};
const MERMAID_ROLE: Record<Box["role"], string> = {
  tool: "stroke:#333",
  product: "stroke:#333,stroke-width:3px",
  mediator: "stroke:#333",
  supersystem: "stroke:#555,stroke-dasharray:5 3",
  environment: "stroke:#555,stroke-dasharray:5 3",
};

/**
 * Mermaid flowchart, for viewers that render Mermaid without tools (GitHub and GitLab markdown,
 * many chat clients). Mermaid has no ports, so each box is one node and each function an edge
 * labelled with its verb, rating, and `out port → in port : carrier`; open ports are not drawn
 * (use DOT for the port view). Node ids are synthetic (b0, b1, …), so no model id reaches Mermaid
 * syntax; labels use numeric entity codes. Styling repeats the DOT conventions: role by fill
 * and «role», polarity by line style, colour, and the [polarity] tag. Flows are dotted blue edges.
 */
export function toMermaid(model: FunctionModel): string {
  const node = new Map(model.boxes.map((b, i) => [b.id, `b${i}`]));
  const lines = [
    ...(model.system ? ["---", `title: ${JSON.stringify(model.system.replace(/\s+/g, " "))}`, "---"] : []),
    "flowchart LR",
    ...ROLES.filter((r) => model.boxes.some((b) => b.role === r)).map((r) => `  classDef ${r} fill:${ROLE_STYLE[r].fill},color:#111,${MERMAID_ROLE[r]}`),
    ...model.boxes.map((b) => `  ${node.get(b.id)}["${mmd(b.name)}<br/>«${b.role}»"]:::${b.role}`),
  ];
  const styles: string[] = [];
  model.wires.forEach((w, i) => {
    const link = MERMAID_LINK[w.polarity];
    const text = `${mmd(w.verb ?? w.id)}${w.polarity === "useful" ? "" : ` [${w.polarity}]`}<br/>${mmd(w.from.port)} → ${mmd(w.to.port)} : ${mmd(w.carrier)}`;
    lines.push(`  ${node.get(w.from.box)} ${link.arrow(text)} ${node.get(w.to.box)}`);
    if (link.style) styles.push(`  linkStyle ${i} ${link.style}`);
  });
  let n = model.wires.length;
  for (const f of model.flows ?? []) {
    f.path.slice(1).forEach((to, i) => {
      lines.push(`  ${node.get(f.path[i])} -. "${mmd(`${f.name ?? f.id} (${f.carrier})`)}" .-> ${node.get(to)}`);
      styles.push(`  linkStyle ${n++} stroke:#3366cc,color:#3366cc,stroke-dasharray:2 4`);
    });
  }
  return [...lines, ...styles].join("\n") + "\n";
}

/** The part of an ELK JSON graph that toSvg writes and reads back. elkjs's own types are not imported, so typechecking does not need the optional package. */
export interface ElkPoint { x: number; y: number; }
/** ELK places a label only when it has text. */
export interface ElkLabel { text: string; width: number; height: number; x?: number; y?: number; }
export interface ElkPort { id: string; x: number; y: number; width: number; height: number; layoutOptions?: Record<string, string>; }
export interface ElkEdge { id: string; sources: string[]; targets: string[]; labels?: ElkLabel[]; sections?: Array<{ startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }>; }
export interface ElkNode { id: string; x?: number; y?: number; width?: number; height?: number; layoutOptions?: Record<string, string>; ports?: ElkPort[]; children?: ElkNode[]; edges?: ElkEdge[]; }
/** A layout engine: elkjs's `layout`. */
export type Layout = (graph: ElkNode) => Promise<ElkNode>;
/** Loads the layout engine on first use (src/elk.ts for the stdio server). */
export type LayoutLoader = () => Promise<Layout>;

/** Advance widths (1/1000 em) of Helvetica and Helvetica-Bold, which Arial matches, for ASCII 32–126. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, ...Array(10).fill(556), 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, ...Array(10).fill(556), 333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];
const wide = (cp: number) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
  || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || cp >= 0x1f000;
/**
 * Estimated width in px of display text at `size` px, without font metrics: Helvetica's widths for
 * ASCII and « », 1 em for wide East Asian characters and emoji, 0.75 em (0.8 bold) for anything
 * else, plus 5%. Arial and its metric-compatible stand-ins (Liberation Sans) fit inside it.
 */
export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    w += cp >= 32 && cp <= 126 ? (bold ? HELVETICA_BOLD : HELVETICA)[cp - 32] : cp === 0xab || cp === 0xbb ? 556 : wide(cp) ? 1000 : bold ? 800 : 750;
  }
  return Math.ceil((w * size * 1.05) / 1000);
}

/** Display text: whitespace collapsed; what XML 1.0 cannot carry (C0 controls, lone surrogates, U+FFFE, U+FFFF) as U+FFFD. */
const display = (s: string) => s.replace(/\s+/g, " ")
  .replace(/[\0-\x08\x0e-\x1f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "�");
const XML: Record<string, string> = { ...ENTITY, "'": "&#39;" };
/** SVG character data or attribute value from display text. */
const xml = (s: string) => s.replace(/[&<>"']/g, (c) => XML[c]);
/** Coordinates to one decimal, so the output is stable. */
const num = (v: number) => String(Math.round(v * 10) / 10);

/** The DOT colours: gray20, red3, blue3, gray35. */
const SVG_STROKE: Record<Polarity | "flow", { stroke: string; width: number; dash?: string }> = {
  useful: { stroke: "#333333", width: 1.2 },
  insufficient: { stroke: "#333333", width: 1.2, dash: "6 4" },
  excessive: { stroke: "#333333", width: 3 },
  harmful: { stroke: "#cd0000", width: 1.6 },
  flow: { stroke: "#0000cd", width: 1.2, dash: "2 3" },
};
const MARKER: Record<string, string> = { "#333333": "arrow-dark", "#cd0000": "arrow-red", "#0000cd": "arrow-blue" };
const SVG_ROLE: Record<Box["role"], string> = {
  tool: `stroke-width="1"`,
  product: `stroke-width="2.4"`,
  mediator: `stroke-width="1"`,
  supersystem: `stroke-width="1" stroke-dasharray="4 3"`,
  environment: `stroke-width="1" stroke-dasharray="4 3"`,
};
const CARRIER_FILL = "#595959";
/** Box geometry in px: header band, port row, text inset, gap between an input's and an output's text, port stub. */
const HEADER = 36, ROW = 20, INSET = 8, GAP = 16, STUB = 4, PAD = 16;
const ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.spacing.nodeNode": "30",
  "elk.spacing.edgeLabel": "2",
  "elk.edgeLabels.placement": "CENTER",
  "elk.layered.edgeLabels.sideSelection": "ALWAYS_UP",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
};

/**
 * A self-contained SVG: no fonts, scripts, styles, or links, and a white background. ELK lays
 * the boxes out left to right (layered) with orthogonal edges; each box has fixed ports, inputs
 * on its west side and outputs on its east side, one row each. Every ELK id is synthetic (b0,
 * b0.i0, w0, f0.0), so no model id reaches the layout, and all text is escaped. Drawn as DOT draws
 * it: a header filled by role with the name and «role», ports with their carriers, open ports in
 * italics; functions labelled with verb and [polarity], harmful red, insufficient dashed,
 * excessive bold; each flow step a dotted blue edge between the boxes' flow ports, which sit on
 * the header; a title and a legend of what occurs. Each box and edge is a group whose class names
 * its kind and whose <title> (a tooltip) is the model id. Text widths are estimated (textWidth).
 */
export async function toSvg(model: FunctionModel, layout: Layout): Promise<string> {
  const key = (box: string, side: "in" | "out", port: string) => JSON.stringify([box, side, port]);
  const wired = new Set(model.wires.flatMap((w) => [key(w.from.box, "out", w.from.port), key(w.to.box, "in", w.to.port)]));
  const index = new Map(model.boxes.map((b, i) => [b.id, i]));
  const portId = new Map<string, string>();
  const onFlow = new Set((model.flows ?? []).flatMap((f) => f.path));
  const portText = (p: Port) => ({ name: display(p.label ?? p.id), carrier: display(p.carrier) });
  const portWidth = (p: Port | undefined) => {
    if (!p) return 0;
    const t = portText(p);
    return textWidth(`${t.name} `, 11) + textWidth(t.carrier, 9);
  };
  const children: ElkNode[] = model.boxes.map((b, i) => {
    const ins = b.inputs ?? [], outs = b.outputs ?? [];
    const rows = Math.max(ins.length, outs.length);
    const width = Math.max(80, textWidth(display(b.name), 13, true) + 2 * INSET, textWidth(`«${b.role}»`, 9) + 2 * INSET,
      ...Array.from({ length: rows }, (_, r) => portWidth(ins[r]) + portWidth(outs[r]) + 2 * INSET + GAP));
    const port = (side: "in" | "out", p: Port, r: number): ElkPort => {
      const id = `b${i}.${side === "in" ? "i" : "o"}${r}`;
      portId.set(key(b.id, side, p.id), id);
      return { id, x: side === "in" ? -STUB : width, y: HEADER + r * ROW + ROW / 2 - STUB / 2, width: STUB, height: STUB, layoutOptions: { "elk.port.side": side === "in" ? "WEST" : "EAST" } };
    };
    const flowPorts: ElkPort[] = onFlow.has(b.id) ? [
      { id: `b${i}.fi`, x: -STUB, y: HEADER / 2 - STUB / 2, width: STUB, height: STUB, layoutOptions: { "elk.port.side": "WEST" } },
      { id: `b${i}.fo`, x: width, y: HEADER / 2 - STUB / 2, width: STUB, height: STUB, layoutOptions: { "elk.port.side": "EAST" } },
    ] : [];
    return {
      id: `b${i}`, width, height: HEADER + rows * ROW + 6,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: [...ins.map((p, r) => port("in", p, r)), ...outs.map((p, r) => port("out", p, r)), ...flowPorts],
    };
  });
  const wireText = model.wires.map((w) => display([w.verb ?? w.id, ...(w.polarity === "useful" ? [] : [`[${w.polarity}]`])].join(" ")));
  const steps = (model.flows ?? []).flatMap((f, j) => f.path.slice(1).map((to, s) => ({ id: `f${j}.${s}`, flow: f, from: f.path[s], to, text: display(`${f.name ?? f.id} (${f.carrier})`) })));
  const edges: ElkEdge[] = [
    ...model.wires.map((w, k) => ({
      id: `w${k}`, sources: [portId.get(key(w.from.box, "out", w.from.port))!], targets: [portId.get(key(w.to.box, "in", w.to.port))!],
      labels: [{ text: wireText[k], width: textWidth(wireText[k], 10), height: 12 }],
    })),
    ...steps.map((s) => ({ id: s.id, sources: [`b${index.get(s.from)}.fo`], targets: [`b${index.get(s.to)}.fi`], labels: [{ text: s.text, width: textWidth(s.text, 10), height: 12 }] })),
  ];
  const laid = await layout({ id: "root", layoutOptions: ELK_OPTIONS, children, edges });
  const placed = new Map((laid.children ?? []).map((n) => [n.id, n]));
  const routed = new Map((laid.edges ?? []).map((e) => [e.id, e]));

  // Title and legend on top, centred over the drawing; the canvas is as wide as the widest of the three.
  const title = model.system ? display(model.system) : undefined;
  const roles = ROLES.filter((r) => model.boxes.some((b) => b.role === r));
  const strokes = [...POLARITIES.filter((p) => model.wires.some((w) => w.polarity === p)), ...(steps.length ? ["flow" as const] : [])];
  const open = model.boxes.some((b) =>
    [...(b.inputs ?? []).map((p) => key(b.id, "in", p.id)), ...(b.outputs ?? []).map((p) => key(b.id, "out", p.id))].some((k) => !wired.has(k)));
  const legend: Array<{ width: number; draw: (x: number, y: number) => string }> = [
    ...roles.map((r) => ({
      width: 18 + textWidth(`«${r}»`, 10),
      draw: (x: number, y: number) => `<rect x="${num(x)}" y="${num(y - 9)}" width="14" height="10" fill="${ROLE_STYLE[r].fill}" stroke="#333333" ${SVG_ROLE[r]}/><text x="${num(x + 18)}" y="${num(y)}">«${r}»</text>`,
    })),
    ...strokes.map((p) => ({
      width: 32 + textWidth(p, 10),
      draw: (x: number, y: number) => {
        const s = SVG_STROKE[p];
        return `<line x1="${num(x)}" y1="${num(y - 4)}" x2="${num(x + 26)}" y2="${num(y - 4)}" stroke="${s.stroke}" stroke-width="${s.width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""} marker-end="url(#${MARKER[s.stroke]})"/><text x="${num(x + 32)}" y="${num(y)}"${p === "harmful" || p === "flow" ? ` fill="${s.stroke}"` : ""}>${p}</text>`;
      },
    })),
    ...(open ? [{ width: textWidth("open port", 10), draw: (x: number, y: number) => `<text x="${num(x)}" y="${num(y)}" font-style="italic">open port</text>` }] : []),
  ];
  const legendWidth = legend.reduce((w, item) => w + item.width, 0) + 14 * Math.max(0, legend.length - 1);
  const inner = Math.max(laid.width ?? 0, title ? textWidth(title, 16, true) : 0, legendWidth);
  const width = inner + 2 * PAD;
  const titleY = PAD + 14, legendY = PAD + (title ? 24 : 0) + 12, top = legendY + 14;
  const left = PAD + (inner - (laid.width ?? 0)) / 2;
  const height = top + (laid.height ?? 0) + PAD;

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}" font-family="Helvetica, Arial, 'Liberation Sans', sans-serif" font-size="10" fill="#111111">`,
    ...(title ? [`<title>${xml(title)}</title>`] : []),
    `<defs>${Object.entries(MARKER).map(([c, id]) => `<marker id="${id}" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L8 4L0 8Z" fill="${c}"/></marker>`).join("")}</defs>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...(title ? [`<text class="title" x="${num(width / 2)}" y="${num(titleY)}" text-anchor="middle" font-size="16" font-weight="bold">${xml(title)}</text>`] : []),
  ];
  let x = PAD + (inner - legendWidth) / 2;
  out.push(`<g class="legend">${legend.map((item) => { const s = item.draw(x, legendY); x += item.width + 14; return s; }).join("")}</g>`);

  model.boxes.forEach((b, i) => {
    const n = placed.get(`b${i}`)!;
    const X = left + (n.x ?? 0), Y = top + (n.y ?? 0), w = n.width ?? 0, h = n.height ?? 0, cx = X + w / 2;
    const parts = [
      `<rect x="${num(X)}" y="${num(Y)}" width="${num(w)}" height="${num(h)}" rx="4" fill="#ffffff"/>`,
      `<path d="M${num(X)} ${num(Y + HEADER)}V${num(Y + 4)}a4 4 0 0 1 4 -4H${num(X + w - 4)}a4 4 0 0 1 4 4V${num(Y + HEADER)}Z" fill="${ROLE_STYLE[b.role].fill}"/>`,
      `<rect x="${num(X)}" y="${num(Y)}" width="${num(w)}" height="${num(h)}" rx="4" fill="none" stroke="#333333" ${SVG_ROLE[b.role]}/>`,
      `<text x="${num(cx)}" y="${num(Y + 16)}" text-anchor="middle" font-size="13" font-weight="bold">${xml(display(b.name))}</text>`,
      `<text x="${num(cx)}" y="${num(Y + 30)}" text-anchor="middle" font-size="9">«${b.role}»</text>`,
    ];
    for (const side of ["in", "out"] as const) {
      (side === "in" ? b.inputs ?? [] : b.outputs ?? []).forEach((p, r) => {
        const t = portText(p);
        const at = side === "in" ? `x="${num(X + INSET)}"` : `x="${num(X + w - INSET)}" text-anchor="end"`;
        const italic = wired.has(key(b.id, side, p.id)) ? "" : ` font-style="italic"`;
        parts.push(`<text class="port ${side}" ${at} y="${num(Y + HEADER + r * ROW + 14)}" font-size="11"${italic}>${xml(t.name)} <tspan font-size="9" fill="${CARRIER_FILL}">${xml(t.carrier)}</tspan></text>`);
      });
    }
    out.push(`<g class="box ${b.role}"><title>${xml(display(b.id))}</title>${parts.join("")}</g>`);
  });

  const edge = (id: string, cls: string, tip: string, text: string, kind: Polarity | "flow") => {
    const e = routed.get(id), s = SVG_STROKE[kind];
    const lines = (e?.sections ?? []).map((sec) => {
      const points = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((q) => `${num(left + q.x)},${num(top + q.y)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${s.stroke}" stroke-width="${s.width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""} marker-end="url(#${MARKER[s.stroke]})"/>`;
    });
    const l = e?.labels?.[0];
    const colour = kind === "harmful" || kind === "flow" ? ` fill="${s.stroke}"` : "";
    const label = l && l.x !== undefined && l.y !== undefined
      ? `<text x="${num(left + l.x)}" y="${num(top + l.y + 9)}"${colour} stroke="#ffffff" stroke-width="3" paint-order="stroke">${xml(text)}</text>` : "";
    return `<g class="${cls}"><title>${xml(tip)}</title>${lines.join("")}${label}</g>`;
  };
  model.wires.forEach((w, k) => out.push(edge(`w${k}`, `function ${w.polarity}`, display(w.id), wireText[k], w.polarity)));
  for (const s of steps) out.push(edge(s.id, "flow", display(s.flow.id), s.text, "flow"));
  out.push("</svg>");
  return out.join("\n") + "\n";
}

export interface HyperVertex { box: string; port: string; side: "in" | "out"; carrier: string; label?: string; }
export type HyperEdge =
  | { kind: "box"; id: string; name: string; role: Box["role"]; action?: string; cost?: Record<string, number>; behavior?: Box["behavior"]; producible?: Box["producible"]; state?: Box["state"]; initial?: Box["initial"]; transition?: Box["transition"]; feasibility?: Box["feasibility"]; sources: number[]; targets: number[] }
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
    ...(b.producible !== undefined ? { producible: b.producible } : {}),
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
        ...(e.producible !== undefined ? { producible: e.producible } : {}),
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

export const CERTIFICATE_NOTE = "Lean checks these verdicts for this one instance; nothing is extracted. Save as a .lean file and, in a checkout of github.com/sv/triz-skill, run `node scripts/certify.mjs <file>`: Lean against theory/ once it is built. Only with --remote does it send the file, and so the model, to the AXLE service (which you then trust). The id tables are the encoding; read them to see that the data is your model.";

const DOT_NOTE = "Render with Graphviz: dot -Tsvg model.dot > model.svg (or -Tpng). Boxes show name, «role» (header colour), input ports left and output ports right with their carriers; open ports in italics. Functions: harmful red, insufficient dashed, excessive bold; flows dotted blue. The legend lists what occurs.";
const MERMAID_NOTE = "Paste into a ```mermaid block: GitHub, GitLab, and many chat clients render it as is (or use the Mermaid CLI). Mermaid has no ports, so each edge names its ports and carrier; use format dot to see ports. Functions: harmful red, insufficient dashed, excessive thick; flows dotted blue.";

const SVG_NOTE = "A self-contained SVG (no fonts, scripts, or links, white background): save it as model.svg and open it in a browser, or embed it in markdown. ELK laid it out: boxes left to right, input ports on the left side and output ports on the right with their carriers, open ports in italics, orthogonal edges. Functions: harmful red, insufficient dashed, excessive bold; flows dotted blue. Hover a box or edge for its id. Text widths are estimated for Helvetica and Arial; another font may run slightly past a box.";

/**
 * Format `svg`, after type-checking. Async, since the layout engine is loaded on first use. Fails
 * closed with format-unavailable when the server has no layout engine (the hosted Worker) or the
 * optional elkjs package cannot be loaded.
 */
export async function exportSvg(model: FunctionModel, loader?: LayoutLoader) {
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  if (!loader) {
    return fail([issue("format-unavailable", "$.format", "format 'svg' is not available on this server: it needs the elkjs layout engine, which the hosted server does not bundle",
      "Use format 'dot' (render it with Graphviz) or 'mermaid', or run the stdio server (npx -y triz-mcp), which draws SVG with elkjs.")]);
  }
  let layout: Layout;
  try {
    layout = await loader();
  } catch (e) {
    const missing = ["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"].includes(String((e as { code?: unknown }).code));
    return fail([issue("format-unavailable", "$.format", `format 'svg' needs the optional package elkjs, which ${missing ? "is not installed" : `failed to load: ${(e as Error).message}`}`,
      "Install elkjs beside triz-mcp (an optional dependency: --omit=optional and --no-optional leave it out), or use format 'dot' or 'mermaid'.")]);
  }
  try {
    return { ok: true as const, format: "svg" as const, content: await toSvg(model, layout), note: SVG_NOTE };
  } catch (e) {
    return fail([issue("internal-error", "$.model", `the layout engine failed on this model: ${(e as Error).message}`, "Report it with the model; meanwhile use format 'dot' or 'mermaid'.")]);
  }
}

/** Export after type-checking; fails closed with the checkModel errors. */
export function exportModel(model: FunctionModel, format: ExportFormat) {
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  if (format === "lean") {
    const cert = modelCertificate(model);
    return cert.ok ? { ok: true as const, format, content: cert.content, certifies: cert.certifies, note: CERTIFICATE_NOTE } : cert;
  }
  if (format === "dot") return { ok: true as const, format, content: toDot(model), note: DOT_NOTE };
  if (format === "mermaid") return { ok: true as const, format, content: toMermaid(model), note: MERMAID_NOTE };
  return { ok: true as const, format, content: toHypergraph(model), note: "Vertices are ports typed by carrier; hyperedges are boxes and functions; interface = unwired input and output ports." };
}
