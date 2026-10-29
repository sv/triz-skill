/**
 * Exports: golden DOT, Mermaid, and open-hypergraph output for every shipped example, a lossless
 * hypergraph round trip (examples and 200 generated models with hostile ids), and fail-closed
 * behaviour on mistyped models and tampered hypergraphs. Regenerate goldens with
 * UPDATE_GOLDEN=1 pnpm test, then review the diff.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel } from "../src/act.js";
import { exportModel, toDot, toMermaid, toHypergraph, fromHypergraph, type OpenHypergraph } from "../src/act-export.js";
import { toolSpecs } from "../src/tools.js";
import { rng, genModel } from "./support/gen.js";

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

test("exports fail closed on a mistyped model; decoding fails closed on a tampered hypergraph", () => {
  const bad = example("bearing-heat");
  bad.wires[0].carrier = "heat";
  for (const format of ["dot", "mermaid", "hypergraph"] as const) {
    const r = exportModel(bad, format);
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
