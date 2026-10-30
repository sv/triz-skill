/**
 * Exports: golden DOT, Mermaid, SVG, and open-hypergraph output for every shipped example, a
 * lossless hypergraph round trip (examples and 200 generated models with hostile ids), SVG
 * structure and escaping over generated models, and fail-closed behaviour on mistyped models,
 * tampered hypergraphs, and a missing layout engine. The SVG tests skip when the optional elkjs
 * package is not installed. Regenerate goldens with UPDATE_GOLDEN=1 pnpm test, then review the diff.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel } from "../src/act.js";
import { exportModel, exportSvg, toDot, toMermaid, toSvg, toHypergraph, fromHypergraph, type ElkNode, type Layout, type OpenHypergraph } from "../src/act-export.js";
import { loadElk } from "../src/elk.js";
import { toolSpecs } from "../src/tools.js";
import { rng, genModel } from "./support/gen.js";
import { line, requests } from "./support/flows.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = fs.readdirSync(path.resolve(here, "../examples/function-models")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const golden = (file: string, actual: string) => {
  const p = path.resolve(here, "golden", file);
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(p, actual);
  assert.equal(actual, fs.readFileSync(p, "utf8"), `${file} drifted; rerun with UPDATE_GOLDEN=1 and review`);
};

test("golden DOT, Mermaid, and hypergraph exports for every shipped example", () => {
  assert.deepEqual(examples, ["bearing-heat", "bearing-heat-behavior", "bearing-heat-dynamics", "bearing-heat-feasibility", "connection-pool", "marketplace-take-rate", "software-cache"]);
  for (const name of examples) {
    const dot = exportModel(example(name), "dot");
    const mermaid = exportModel(example(name), "mermaid");
    const hyper = exportModel(example(name), "hypergraph");
    assert.ok(dot.ok && mermaid.ok && hyper.ok);
    golden(`${name}.dot`, dot.content as string);
    golden(`${name}.mmd`, mermaid.content as string);
    golden(`${name}.hypergraph.json`, JSON.stringify(hyper.content, null, 2) + "\n");
  }
});

test("hypergraph: ports are vertices, so fan-out and parallel useful/harmful functions survive", () => {
  const h = toHypergraph(example("software-cache"));
  const v = (box: string, port: string, side: "in" | "out") => h.vertices.findIndex((x) => x.box === box && x.port === port && x.side === side);
  const fn = (id: string) => h.hyperedges.find((e) => e.kind === "function" && e.id === id)!;
  assert.deepEqual([fn("w-lookup").sources, fn("w-sql").sources], [[v("app", "lookup", "out")], [v("app", "lookup", "out")]]);
  assert.deepEqual([fn("w-cache").targets, fn("w-stale").targets], [[v("app", "cache-in", "in")], [v("app", "cache-in", "in")]]);
  assert.deepEqual(h.interface, { inputs: [], outputs: [v("gateway", "edge-cache", "out"), v("app", "memo", "out")] });
  const bearing = toHypergraph(example("bearing-heat"));
  assert.deepEqual(bearing.interface.inputs.map((i) => bearing.vertices[i]), [{ box: "air", port: "sink", side: "in", carrier: "heat" }]);
  assert.deepEqual(bearing.interface.outputs.map((i) => `${bearing.vertices[i].box}.${bearing.vertices[i].port}`), ["housing.bore"]);
});

test("hypergraph round trip is lossless: examples and 200 generated models with hostile ids", () => {
  for (const name of examples) assert.deepEqual(fromHypergraph(toHypergraph(example(name))), { ok: true, model: example(name) }, name);
  for (let seed = 1; seed <= 200; seed++) {
    const m = genModel(rng(seed));
    assert.deepEqual(fromHypergraph(JSON.parse(JSON.stringify(toHypergraph(m)))), { ok: true, model: m }, `seed ${seed}`);
  }
});

test("exports fail closed on a mistyped model; decoding fails closed on a tampered hypergraph", async () => {
  const bad = example("bearing-heat");
  bad.wires[0].carrier = "heat";
  for (const r of [...(["dot", "mermaid", "hypergraph"] as const).map((format) => exportModel(bad, format)), await exportSvg(bad, loadElk), await exportSvg(bad)]) {
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.errors.join(), /carrier 'heat' does not match/);
  }
  const h = toHypergraph(example("bearing-heat"));
  const tamper = (edit: (x: OpenHypergraph) => void) => { const x = structuredClone(h); edit(x); return fromHypergraph(x); };
  const fnIndex = h.hyperedges.findIndex((e) => e.kind === "function");
  const errorsOf = (r: ReturnType<typeof fromHypergraph>) => (r.ok ? "" : r.errors.join("; "));
  assert.match(errorsOf(tamper((x) => { x.hyperedges[fnIndex].sources = [999] as [number]; })), /out of range/);
  assert.match(errorsOf(tamper((x) => { x.interface.inputs = []; })), /interface.inputs must be exactly the unwired input ports/);
  assert.match(errorsOf(tamper((x) => { const e = x.hyperedges[fnIndex]; [e.sources, e.targets] = [e.targets, e.sources]; })), /is not an output port/);
  assert.match(errorsOf(tamper((x) => { const e = x.hyperedges[fnIndex]; if (e.kind === "function") e.carrier = "heat"; })), /does not match port/);
  assert.match(errorsOf(tamper((x) => { (x.hyperedges[0] as { targets: number[] }).targets.push(x.vertices.findIndex((v) => v.box === "shaft")); })), /belongs to boxes|is not an output of box/);
});

/** A flow through every box and back to the first: flat edges between adjacent nodes, which record shapes could not draw. */
const withFlow = (m: FunctionModel): FunctionModel => ({
  ...m,
  flows: [{ id: "through \"all\" <boxes>", carrier: m.carriers[0].id, path: [...m.boxes.map((b) => b.id), m.boxes[0].id] }],
});

test("DOT escapes hostile ids and labels (checked with Graphviz when it is installed)", (t) => {
  const models = Array.from({ length: 50 }, (_, i) => genModel(rng(500 + i))).map((m, i) => (i % 2 ? withFlow(m) : m));
  const spaced = genModel(rng(1));
  spaced.boxes.push({ ...structuredClone(spaced.boxes[0]), id: ` ${spaced.boxes[0].id}  ` });
  models.push(spaced);
  for (const m of models) {
    assert.ok(checkModel(m).ok);
    const dot = toDot(m);
    for (const b of m.boxes) assert.ok(dot.includes(`"${b.id.replace(/[\\"]/g, "\\$&")}" [label=`), b.id);
    const steps = (m.flows ?? []).reduce((n, f) => n + f.path.length - 1, 0);
    assert.equal(dot.split("\n").filter((l) => l.includes(" -> ")).length, m.wires.length + steps);
    assert.doesNotMatch(dot, /shape=record/, "record shapes lose flat edges; boxes are HTML-like tables");
  }
  const probe = spawnSync("dot", ["-V"]);
  if (probe.error) { t.skip("graphviz not installed"); return; }
  for (const m of [...examples.map(example), ...models]) {
    const r = spawnSync("dot", ["-Tplain"], { input: toDot(m) });
    assert.equal(r.status, 0, r.stderr.toString());
    assert.doesNotMatch(r.stderr.toString(), /warning|error/i, r.stderr.toString());
    // Distinct ids stay distinct nodes (ids differing only in whitespace included).
    assert.equal(r.stdout.toString().split("\n").filter((l) => l.startsWith("node ")).length, m.boxes.length);
  }
});

test("triz_export answers over the shared tool spec and fails closed", async () => {
  const spec = toolSpecs().find((s) => s.name === "triz_export")!;
  const dot = JSON.parse((await spec.handler({ model: example("bearing-heat"), format: "dot" })).content[0].text);
  assert.ok(dot.ok);
  assert.match(dot.content, /^digraph function_model \{/);
  const bad = example("bearing-heat");
  bad.wires[0].to.box = "ghost";
  const r = JSON.parse((await spec.handler({ model: bad, format: "hypergraph" })).content[0].text);
  assert.equal(r.ok, false);
});

test("DOT keeps ids that differ only in whitespace as distinct nodes", () => {
  const m: FunctionModel = {
    domain: "physical",
    carriers: [{ id: "c", layer: "energy", dimension: "W" }],
    boxes: [
      { id: "A B", name: "first", role: "tool", outputs: [{ id: "o", carrier: "c" }] },
      { id: "A  B", name: "second", role: "product", inputs: [{ id: "i", carrier: "c" }] },
    ],
    wires: [{ id: "w", from: { box: "A B", port: "o" }, to: { box: "A  B", port: "i" }, carrier: "c", polarity: "useful" }],
  };
  const dot = toDot(m);
  assert.ok(dot.includes('  "A B" [label='));
  assert.ok(dot.includes('  "A  B" [label='));
  assert.ok(dot.includes('"A B":o0:e -> "A  B":i0:w'), "the wire joins two nodes, not a self-loop");
});

test("hypergraph import validates every hyperedge after a bad one, without bogus interface errors", () => {
  const h = toHypergraph(example("bearing-heat"));
  const bad = structuredClone(h);
  const fn = bad.hyperedges.findIndex((e) => e.kind === "function");
  const [first] = bad.hyperedges.splice(fn, 1);
  bad.hyperedges.unshift({ ...first, sources: [999] as [number] });
  const shaft = bad.hyperedges.find((e) => e.kind === "box" && e.id === "shaft")!;
  [shaft.sources, shaft.targets] = [shaft.targets, shaft.sources];
  const r = fromHypergraph(bad);
  assert.equal(r.ok, false);
  const errors = r.ok ? [] : r.errors;
  assert.ok(errors.some((e) => /vertex 999 out of range/.test(e)));
  assert.ok(errors.some((e) => /is not an input of box 'shaft'/.test(e)), "a later hyperedge is still checked");
  assert.ok(!errors.some((e) => /interface|belongs to no box/.test(e)), errors.join("; "));
});

test("DOT draws each box as a table: role header, ports with carriers by side, open ports in italics, a legend of what occurs", () => {
  const dot = toDot(example("software-cache"));
  const app = dot.split("\n").find((l) => l.startsWith('  "app" [label=<'))!;
  assert.match(app, /<TD COLSPAN="2" BGCOLOR="#d6e4f5"><B>API service<\/B><BR\/><FONT POINT-SIZE="9">«tool»<\/FONT><\/TD>/);
  assert.match(app, /<TD PORT="i0" ALIGN="LEFT">req <FONT POINT-SIZE="9" COLOR="gray35">request<\/FONT><\/TD>/);
  assert.match(app, /<TD PORT="o2" ALIGN="RIGHT"><I>memo <FONT[^>]*>cached<\/FONT><\/I><\/TD>/, "memo is unwired: an open port");
  assert.match(dot, /"redis":o0:e -> "app":i1:w \[label="serve stale results to \[harmful\]", color="red3"/);
  const legend = dot.split("\n").find((l) => l.startsWith("  graph ["))!;
  for (const shown of ["«tool»", "«product»", "«mediator»", ">useful<", ">harmful<", "open port"]) assert.ok(legend.includes(shown), shown);
  for (const absent of ["«environment»", "«supersystem»", ">insufficient<", ">excessive<", ">flow<"]) assert.ok(!legend.includes(absent), absent);
  assert.match(legend, /bgcolor="white"/, "an explicit background reads the same under a dark theme");
  assert.match(toDot(example("marketplace-take-rate")).split("\n")[1], />insufficient<.*>excessive</);
});

test("Mermaid: synthetic node ids, entity-coded labels that decode to the model's text, polarity link styles by edge index", () => {
  const decode = (s: string) => s.replace(/#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  const ws = (s: string) => s.replace(/\s+/g, " ");
  for (let seed = 1; seed <= 200; seed++) {
    const m = seed % 2 ? withFlow(genModel(rng(seed))) : genModel(rng(seed));
    const lines = toMermaid(m).split("\n");
    const nodes = lines.filter((l) => /^ {2}b\d+\["/.test(l));
    assert.equal(nodes.length, m.boxes.length);
    nodes.forEach((l, i) => {
      const [, id, text, role] = l.match(/^ {2}(b\d+)\["([^"]*)<br\/>«(\w+)»"\]:::(\w+)$/)!;
      assert.deepEqual([id, decode(text), role], [`b${i}`, ws(m.boxes[i].name), m.boxes[i].role]);
    });
    const edges = lines.filter((l) => /^ {2}b\d+ (--|-\.|==) "/.test(l));
    const steps = (m.flows ?? []).flatMap((f) => f.path.slice(1));
    assert.equal(edges.length, m.wires.length + steps.length);
    m.wires.forEach((w, i) => {
      const [, from, text, to] = edges[i].match(/^ {2}(b\d+) (?:--|-\.|==) "([^"]*)" (?:-->|\.->|==>) (b\d+)$/)!;
      assert.deepEqual([from, to], [`b${m.boxes.findIndex((b) => b.id === w.from.box)}`, `b${m.boxes.findIndex((b) => b.id === w.to.box)}`]);
      const [head, ports] = decode(text).split("<br/>");
      assert.equal(head, `${ws(w.verb ?? w.id)}${w.polarity === "useful" ? "" : ` [${w.polarity}]`}`);
      assert.equal(ports, `${ws(w.from.port)} → ${ws(w.to.port)} : ${ws(w.carrier)}`);
    });
    const styled = new Map(lines.flatMap((l) => { const x = l.match(/^ {2}linkStyle (\d+) (.*)$/); return x ? [[Number(x[1]), x[2]] as const] : []; }));
    m.wires.forEach((w, i) => assert.equal(styled.has(i), w.polarity === "harmful" || w.polarity === "insufficient", `wire ${i} ${w.polarity}`));
    steps.forEach((_, j) => assert.match(styled.get(m.wires.length + j) ?? "", /stroke-dasharray:2 4/));
  }
});

test("triz_export answers format mermaid over the shared tool spec", async () => {
  const spec = toolSpecs().find((s) => s.name === "triz_export")!;
  const r = JSON.parse((await spec.handler({ model: example("software-cache"), format: "mermaid" })).content[0].text);
  assert.ok(r.ok);
  assert.match(r.content, /^---\ntitle: "Read path of an API behind a Redis cache"\n---\nflowchart LR\n/);
  assert.match(r.note, /```mermaid/);
});

/** elkjs's layout, or undefined when the optional package is not installed (the SVG tests then skip). */
const elk = await loadElk().catch(() => undefined);
const ws = (s: string) => s.replace(/\s+/g, " ");
const unxml = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]!);

/** Well-formedness of the XML this writer emits: one svg root, balanced tags, quoted attributes, no raw '<' or stray '&', only XML 1.0 characters. */
function xmlErrors(svg: string): string[] {
  const errors: string[] = [];
  if (!svg.startsWith("<svg ") || !svg.endsWith("</svg>\n")) errors.push("not one svg root");
  if (/[\0-\x08\x0b\x0c\x0e-\x1f￾￿]/.test(svg)) errors.push("a character XML 1.0 forbids");
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(svg)) errors.push("a lone surrogate");
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g)) {
    if (m[6]) { errors.push(`raw '<' at ${m.index}`); continue; }
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+);)/.test(m[5] ?? m[3] ?? "")) errors.push(`stray '&' at ${m.index}`);
    if (m[5] !== undefined) continue;
    if (m[1]) { if (stack.pop() !== m[2]) errors.push(`unbalanced </${m[2]}> at ${m.index}`); }
    else if (!m[4]) stack.push(m[2]);
  }
  if (stack.length) errors.push(`unclosed ${stack.join(", ")}`);
  return errors;
}

interface Drawn { cls: string; title: string; x: number; y: number; w: number; texts: Array<{ attrs: string; text: string; tspan?: string }>; points: number[][][]; label?: { attrs: string; text: string }; }
/** The box, function, and flow groups of an SVG, one per line, in drawing order. */
function groups(svg: string, kind: "box" | "function" | "flow"): Drawn[] {
  return svg.split("\n").filter((l) => l.startsWith(`<g class="${kind}`)).map((l) => {
    const [, cls, title] = l.match(/^<g class="([^"]*)"><title>([^<]*)<\/title>/)!;
    const rect = l.match(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)"/);
    const texts = [...l.matchAll(/<text([^>]*)>([^<]*)(?:<tspan[^>]*>([^<]*)<\/tspan>)?<\/text>/g)].map((t) => ({ attrs: t[1], text: unxml(t[2]), ...(t[3] !== undefined ? { tspan: unxml(t[3]) } : {}) }));
    const points = [...l.matchAll(/<polyline points="([^"]*)"/g)].map((p) => p[1].split(" ").map((q) => q.split(",").map(Number)));
    return { cls, title: unxml(title), x: Number(rect?.[1]), y: Number(rect?.[2]), w: Number(rect?.[3]), texts, points, ...(kind !== "box" && texts.length ? { label: texts[0] } : {}) };
  });
}

test("golden SVG for every shipped example and the cooling-water line", { skip: !elk && "elkjs not installed" }, async () => {
  for (const [name, m] of [...examples.map((n) => [n, example(n)] as const), ["cooling-line", line()] as const]) {
    const r = await exportSvg(m, loadElk);
    assert.ok(r.ok, name);
    golden(`${name}.svg`, r.content);
  }
  // The README shows software-cache drawn by format svg.
  golden("../../docs/img/function-model-svg.svg", fs.readFileSync(path.resolve(here, "golden/software-cache.svg"), "utf8"));
});

test("SVG: well-formed, one group per box, function, and flow step, text that decodes to the model's, edges from port to port", { skip: !elk && "elkjs not installed" }, async () => {
  const models = [...examples.map(example), line(), requests(), ...Array.from({ length: 200 }, (_, i) => (i % 2 ? withFlow(genModel(rng(900 + i))) : genModel(rng(900 + i))))];
  for (const [mi, m] of models.entries()) {
    const at = `model ${mi}`;
    const svg = await toSvg(m, elk!);
    assert.deepEqual(xmlErrors(svg), [], at);
    const key = (box: string, side: string, port: string) => JSON.stringify([box, side, port]);
    const wired = new Set(m.wires.flatMap((w) => [key(w.from.box, "out", w.from.port), key(w.to.box, "in", w.to.port)]));
    const boxes = groups(svg, "box");
    assert.equal(boxes.length, m.boxes.length, at);
    m.boxes.forEach((b, i) => {
      const g = boxes[i];
      assert.deepEqual([g.cls, g.title, g.texts[0].text, g.texts[1].text], [`box ${b.role}`, ws(b.id), ws(b.name), `«${b.role}»`], at);
      const ports = [...(b.inputs ?? []).map((p) => ["in", p] as const), ...(b.outputs ?? []).map((p) => ["out", p] as const)];
      assert.deepEqual(g.texts.slice(2).map((t) => [t.attrs.match(/class="port (in|out)"/)?.[1], t.text, t.tspan, /font-style="italic"/.test(t.attrs)]),
        ports.map(([side, p]) => [side, `${ws(p.label ?? p.id)} `, ws(p.carrier), !wired.has(key(b.id, side, p.id))]), `${at} box ${i}`);
    });
    // Each edge leaves the source box's right side at its port's row and enters the target's left side at its row (flows: at the header).
    const row = (b: Drawn, r: number) => b.y + 46 + 20 * r;
    const near = (p: number[], x: number, y: number) => Math.abs(p[0] - x) <= 0.2 && Math.abs(p[1] - y) <= 0.2;
    const index = new Map(m.boxes.map((b, i) => [b.id, i]));
    const fns = groups(svg, "function");
    assert.equal(fns.length, m.wires.length, at);
    m.wires.forEach((w, k) => {
      const g = fns[k], from = boxes[index.get(w.from.box)!], to = boxes[index.get(w.to.box)!];
      assert.deepEqual([g.cls, g.title, g.label?.text], [`function ${w.polarity}`, ws(w.id), ws(`${w.verb ?? w.id}${w.polarity === "useful" ? "" : ` [${w.polarity}]`}`)], `${at} wire ${k}`);
      assert.equal(g.points.length, 1, `${at} wire ${k}: one section`);
      const pts = g.points[0];
      const r = (side: "inputs" | "outputs", box: string, port: string) => m.boxes[index.get(box)!][side]!.findIndex((p) => p.id === port);
      assert.ok(near(pts[0], from.x + from.w + 4, row(from, r("outputs", w.from.box, w.from.port))), `${at} wire ${k} starts at ${pts[0]}`);
      assert.ok(near(pts.at(-1)!, to.x - 4, row(to, r("inputs", w.to.box, w.to.port))), `${at} wire ${k} ends at ${pts.at(-1)}`);
    });
    const steps = (m.flows ?? []).flatMap((f) => f.path.slice(1).map((to, s) => ({ f, from: f.path[s], to })));
    const flows = groups(svg, "flow");
    assert.equal(flows.length, steps.length, at);
    steps.forEach(({ f, from, to }, s) => {
      const g = flows[s], a = boxes[index.get(from)!], b = boxes[index.get(to)!];
      assert.deepEqual([g.title, g.label?.text], [ws(f.id), ws(`${f.name ?? f.id} (${f.carrier})`)], `${at} step ${s}`);
      assert.ok(near(g.points[0][0], a.x + a.w + 4, a.y + 18) && near(g.points[0].at(-1)!, b.x - 4, b.y + 18), `${at} step ${s}`);
    });
  }
});

test("SVG styles: polarity strokes, role borders, and a legend of what occurs", { skip: !elk && "elkjs not installed" }, async () => {
  const svg = await toSvg(example("marketplace-take-rate"), elk!);
  const stroke = (cls: string) => svg.split("\n").find((l) => l.startsWith(`<g class="${cls}"`))!.match(/<polyline [^>]*\/>/)![0];
  assert.match(stroke("function useful"), /stroke="#333333" stroke-width="1.2" marker-end/);
  assert.match(stroke("function insufficient"), /stroke="#333333" stroke-width="1.2" stroke-dasharray="6 4"/);
  assert.match(stroke("function excessive"), /stroke="#333333" stroke-width="3" marker-end/);
  assert.match(stroke("function harmful"), /stroke="#cd0000" stroke-width="1.6"/);
  assert.match(svg, /<g class="box product">.*<rect [^>]*fill="none" stroke="#333333" stroke-width="2.4"\/>/);
  assert.match(svg, /<g class="box tool">.*<path d="[^"]*" fill="#d6e4f5"\/>/);
  const flowSvg = await toSvg(line(), elk!);
  assert.match(flowSvg, /<g class="flow">.*stroke="#0000cd" stroke-width="1.2" stroke-dasharray="2 3"/);
  assert.match(flowSvg, /<g class="box environment">.*stroke-width="1" stroke-dasharray="4 3"\/>/);
  const legend = (s: string) => s.split("\n").find((l) => l.startsWith('<g class="legend">'))!;
  for (const shown of ["«tool»", "«product»", "«mediator»", ">useful<", ">insufficient<", ">excessive<", ">harmful<"]) assert.ok(legend(svg).includes(shown), shown);
  for (const absent of ["«environment»", "«supersystem»", ">flow<", "open port"]) assert.ok(!legend(svg).includes(absent), absent);
  for (const shown of ["«environment»", ">flow<"]) assert.ok(legend(flowSvg).includes(shown), shown);
  assert.match(legend(await toSvg(example("software-cache"), elk!)), /font-style="italic">open port</, "memo and edge-cache are unwired");
  assert.match(svg, /<rect width="100%" height="100%" fill="#ffffff"\/>/, "an explicit background reads the same under a dark theme");
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="[\d.]+" height="[\d.]+" viewBox="0 0 [\d.]+ [\d.]+"/);
  assert.doesNotMatch(svg, /<script|<style|<image|<foreignObject|href=|url\((?!#arrow-)/, "self-contained: nothing loads or runs");
});

test("SVG escaping: hostile ids reach ELK only as synthetic ids; control characters and lone surrogates become U+FFFD", { skip: !elk && "elkjs not installed" }, async () => {
  const seen: ElkNode[] = [];
  const spy: Layout = (g) => { seen.push(structuredClone(g)); return elk!(g); };
  for (let seed = 1; seed <= 50; seed++) await toSvg(withFlow(genModel(rng(seed))), spy);
  const ids = seen.flatMap((g) => ["root", ...(g.children ?? []).flatMap((n) => [n.id, ...(n.ports ?? []).map((p) => p.id)]), ...(g.edges ?? []).flatMap((e) => [e.id, ...e.sources, ...e.targets])]);
  assert.deepEqual(ids.filter((id) => !/^(root|b\d+(\.(i\d+|o\d+|fi|fo))?|w\d+|f\d+\.\d+)$/.test(id)), []);

  const m: FunctionModel = {
    domain: "software",
    system: "bell\u0007 <&> 'quoted' \"too\"",
    carriers: [{ id: "c\u0000", layer: "information", dimension: "x" }],
    boxes: [
      { id: "a\u001b]0;", name: "lone \ud800 high", role: "tool", outputs: [{ id: "o￿", carrier: "c\u0000" }] },
      { id: "b\tc\n", name: "pair 😀 ok", role: "product", inputs: [{ id: "i\udc00", carrier: "c\u0000", label: "</text><script>" }] },
    ],
    wires: [{ id: "w\u0008", from: { box: "a\u001b]0;", port: "o￿" }, to: { box: "b\tc\n", port: "i\udc00" }, carrier: "c\u0000", polarity: "harmful", verb: "x]]>y" }],
  };
  assert.ok(checkModel(m).ok);
  const r = await exportSvg(m, loadElk);
  assert.ok(r.ok);
  assert.deepEqual(xmlErrors(r.content), []);
  const [a, b] = groups(r.content, "box");
  assert.deepEqual([a.title, a.texts[0].text, a.texts[2].text, a.texts[2].tspan], ["a�]0;", "lone � high", "o� ", "c�"]);
  assert.deepEqual([b.title, b.texts[0].text, b.texts[2].text], ["b c ", "pair 😀 ok", "</text><script> "]);
  assert.deepEqual([groups(r.content, "function")[0].title, groups(r.content, "function")[0].label?.text], ["w�", "x]]>y [harmful]"]);
  assert.match(r.content, /<title>bell� &lt;&amp;&gt; &#39;quoted&#39; &quot;too&quot;<\/title>/);
});

test("SVG fails closed without a layout engine: format-unavailable over the shared specs (the hosted server) and when elkjs is not installed", async () => {
  const none = await exportSvg(example("bearing-heat"));
  assert.deepEqual(none.ok ? [] : none.issues.map((i) => [i.code, i.path]), [["format-unavailable", "$.format"]]);
  assert.match(none.ok ? "" : none.errors[0], /hosted server does not bundle/);
  const missing = await exportSvg(example("bearing-heat"), () => Promise.reject(Object.assign(new Error("Cannot find package 'elkjs'"), { code: "ERR_MODULE_NOT_FOUND" })));
  assert.match(missing.ok ? "" : missing.errors[0], /needs the optional package elkjs, which is not installed/);
  assert.match(missing.ok ? "" : missing.issues[0].hint, /--omit=optional/);
  const broken = await exportSvg(example("bearing-heat"), async () => async () => { throw new Error("boom"); });
  assert.deepEqual(broken.ok ? [] : broken.issues.map((i) => i.code), ["internal-error"]);
  const hosted = toolSpecs().find((s) => s.name === "triz_export")!;
  const r = JSON.parse((await hosted.handler({ model: example("software-cache"), format: "svg" })).content[0].text);
  assert.deepEqual([r.ok, r.issues[0].code], [false, "format-unavailable"]);
});

test("triz_export answers format svg when the server passes a layout loader (the stdio server)", { skip: !elk && "elkjs not installed" }, async () => {
  const spec = toolSpecs({ layout: loadElk }).find((s) => s.name === "triz_export")!;
  const r = JSON.parse((await spec.handler({ model: example("software-cache"), format: "svg" })).content[0].text);
  assert.ok(r.ok);
  assert.match(r.content, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(r.note, /self-contained SVG/);
});

test("the hosted Worker cannot bundle elkjs: no static import of it, and the Worker does not import the loader", () => {
  const src = (f: string) => fs.readFileSync(path.resolve(here, "../src", f), "utf8");
  for (const f of fs.readdirSync(path.resolve(here, "../src")).filter((x) => x.endsWith(".ts"))) assert.doesNotMatch(src(f), /(from|import\()\s*["'`]elkjs/, f);
  assert.doesNotMatch(src("worker.ts"), /from\s+["']\.\/elk\.js["']/);
  assert.match(src("server.ts"), /toolSpecs\(\{ graph, layout: loadElk, localImports: true \}\)/);
});
