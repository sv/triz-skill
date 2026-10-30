/**
 * The triz command line (src/cli.ts), run as a child process through tsx: list, schema (the
 * inputSchema an MCP client lists), and call with arguments from a file, stdin, or --args, with
 * its exit codes (0 a result, 1 ok: false, 2 a usage or argument-schema error) and nothing but
 * JSON on stdout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import "../src/data.js";
import { toolSpecs, bindV1 } from "../src/tools.js";
import * as graph from "../src/graph.js";
import { loadElk } from "../src/elk.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const example = JSON.parse(fs.readFileSync(path.join(root, "examples/function-models/bearing-heat.json"), "utf8"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "triz-cli-"));
const argsFile = (name: string, value: unknown) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
};

function triz(args: string[], opts: { input?: string; env?: Record<string, string> } = {}) {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: root,
    input: opts.input ?? "",
    env: { ...process.env, ...opts.env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("list: one line per tool, name then the first sentence; --json the full descriptions", () => {
  const r = triz(["list"]);
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.trimEnd().split("\n");
  const names = toolSpecs({ graph, localImports: true }).map((s) => s.name);
  assert.deepEqual(lines.map((l) => l.split(/\s+/)[0]), names);
  const fm = lines.find((l) => l.startsWith("triz_function_model "));
  assert.ok(fm);
  assert.match(fm, /^triz_function_model\s+Check a TRIZ function model .*\.$/);
  assert.match(lines.find((l) => l.startsWith("triz_parameter "))!, /^triz_parameter\s+Get a canonical TRIZ engineering parameter \(1-39\)\.$/);

  const j = triz(["list", "--json"]);
  assert.equal(j.code, 0, j.stderr);
  const listed = JSON.parse(j.stdout) as { name: string; description: string }[];
  assert.deepEqual(listed.map((t) => t.name), names);
  assert.ok(listed.find((t) => t.name === "triz_function_model")!.description.includes("compare_to"));
});

test("schema: the description and the inputSchema an MCP client lists", async () => {
  const r = triz(["schema", "triz_behavior"]);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.name, "triz_behavior");
  assert.ok(s.description.includes("weakest_spec"));
  assert.ok(s.inputSchema.properties.weakest_spec, "inputSchema lists weakest_spec");

  // The stdio server's own listing, over an in-memory transport.
  const server = new McpServer({ name: "triz-mcp", version: "0.0.0" });
  bindV1(server, toolSpecs({ graph, layout: loadElk, localImports: true }));
  const client = new Client({ name: "cli-test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  await client.close();
  for (const name of ["triz_behavior", "triz_evals", "triz_graph", "triz_adequacy", "triz_import_source", "triz_review_import"]) {
    const listed = tools.find((t) => t.name === name)!;
    const out = name === "triz_behavior" ? s : JSON.parse(triz(["schema", name]).stdout);
    assert.deepEqual(out, { name, description: listed.description, inputSchema: listed.inputSchema }, name);
  }
});

test("list and call: the local-only import and review tools, as on the stdio server", () => {
  // The CLI and the stdio server pass the same toolSpecs options; the hosted Worker does not.
  const options = (f: string) => fs.readFileSync(path.join(root, "src", f), "utf8").match(/toolSpecs\(\{([^}]*)\}\)/)?.[1].trim();
  assert.equal(options("cli.ts"), options("server.ts"));
  assert.match(options("cli.ts") ?? "", /\blocalImports: true\b/);
  const listed = triz(["list"]).stdout.trimEnd().split("\n").map((l) => l.split(/\s+/)[0]);
  assert.ok(listed.includes("triz_import_source") && listed.includes("triz_review_import"), listed.join(" "));
  assert.equal(toolSpecs().some((s) => s.name === "triz_import_source"), false, "the hosted tool set has no importer");

  const csv = "id,name,parent_id\nroot,Assembly,\npart,Component,root\n";
  const imported = triz(["call", "triz_import_source", "--args", JSON.stringify({ format: "bom-csv", source: { id: "parts.csv", text: csv } })]);
  assert.equal(imported.code, 0, imported.stderr);
  const draft = JSON.parse(imported.stdout).model;
  assert.equal(draft.provenance.status, "draft");
  const decisions = draft.provenance.pending.map((p: { id: string }) => ({ id: p.id, decision: "confirm" }));
  const reviewed = triz(["call", "triz_review_import", "-"], { input: JSON.stringify({ model: draft, decisions }) });
  assert.equal(reviewed.code, 0, reviewed.stderr);
  assert.equal(JSON.parse(reviewed.stdout).model.provenance.status, "reviewed");
});

test("schema and call: an unknown tool exits 2 with the closest names", () => {
  for (const command of ["schema", "call"]) {
    const r = triz([command, "behaviour"]);
    assert.equal(r.code, 2);
    assert.equal(r.stdout, "");
    const e = JSON.parse(r.stderr);
    assert.equal(e.error, "unknown-tool");
    assert.deepEqual(e.suggestions.slice(0, 2), ["triz_behavior", "triz_behavior_refinement"]);
  }
});

test("call: an example model from a file exits 0 with its JSON result; --pretty indents it", () => {
  const file = argsFile("model.json", { model: example });
  const r = triz(["call", "triz_function_model", file]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.split("\n").length, 2, "compact JSON on one line");
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.ok(Array.isArray(out.harmLoops) && out.harmLoops.length > 0);

  const p = triz(["call", "triz_function_model", file, "--pretty"]);
  assert.equal(p.code, 0, p.stderr);
  assert.ok(p.stdout.startsWith("{\n  \"ok\": true"));
  assert.deepEqual(JSON.parse(p.stdout), out);
});

test("call: arguments from stdin, with - or with no file, and inline with --args", () => {
  const input = JSON.stringify({ improving: 9, worsening: 14 });
  for (const args of [["call", "triz_matrix", "-"], ["call", "triz_matrix"]]) {
    const r = triz(args, { input });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).principles, [8, 3, 26, 14]);
  }
  const inline = triz(["call", "triz_matrix", "--args", input]);
  assert.equal(inline.code, 0, inline.stderr);
  assert.deepEqual(JSON.parse(inline.stdout).principles, [8, 3, 26, 14]);
  // Empty input is {}, as the server reads absent arguments.
  const empty = triz(["call", "triz_parameter"]);
  assert.equal(empty.code, 0, empty.stderr);
  assert.equal(JSON.parse(empty.stdout).length, 39);
});

test("call: an ill-typed model exits 1 with its issues on stdout", () => {
  const mistyped = { ...example, wires: example.wires.map((w: { id: string }, i: number) => (i === 0 ? { ...w, carrier: "heat" } : w)) };
  const r = triz(["call", "triz_function_model", "-"], { input: JSON.stringify({ model: mistyped }) });
  assert.equal(r.code, 1, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.equal(out.issues[0].code, "carrier-mismatch");
  assert.equal(out.issues[0].path, "$.model.wires[0].carrier");
  assert.ok(out.issues[0].hint);
});

test("call: arguments that fail the tool's schema exit 2 with the issues as JSON on stderr", () => {
  const r = triz(["call", "triz_matrix", "--args", JSON.stringify({ improving: "nine", worsening: 40 })]);
  assert.equal(r.code, 2);
  assert.equal(r.stdout, "");
  const e = JSON.parse(r.stderr);
  assert.equal(e.error, "invalid-arguments");
  assert.equal(e.tool, "triz_matrix");
  assert.match(e.message, /^Input validation error: Invalid arguments for tool triz_matrix: /);
  assert.deepEqual(e.issues.map((i: { path: string }) => i.path), ["$.improving", "$.worsening"]);

  const missing = triz(["call", "triz_function_model", "--args", "{}"]);
  assert.equal(missing.code, 2);
  assert.equal(JSON.parse(missing.stderr).issues[0].path, "$.model");
});

test("call: usage errors and unreadable or invalid JSON exit 2", () => {
  for (const [args, error, input] of [
    [["call", "triz_matrix", "-"], "invalid-json", "{improving: 9"],
    [["call", "triz_matrix", path.join(tmp, "absent.json")], "unreadable-input", ""],
    [["call", "triz_matrix", "-", "--args", "{}"], "usage", ""],
    [["call", "triz_matrix", "--frobnicate"], "usage", ""],
    [["frobnicate"], "usage", ""],
    [["schema"], "usage", ""],
    [["list", "--args", "{}"], "usage", ""],
  ] as const) {
    const r = triz([...args], { input });
    assert.equal(r.code, 2, args.join(" "));
    assert.equal(r.stdout, "", args.join(" "));
    assert.equal(JSON.parse(r.stderr).error, error, args.join(" "));
  }
});

test("call: the svg export lays out with elkjs, as on the stdio server", () => {
  const r = triz(["call", "triz_export", "-"], { input: JSON.stringify({ model: example, format: "svg" }) });
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.match(out.content, /^<svg/);
});

test("call: the graph tools read TRIZ_GRAPH and TRIZ_REGISTRY", () => {
  const env = { TRIZ_GRAPH: path.join(root, "examples/problem-graph.json"), TRIZ_REGISTRY: path.join(root, "examples/triz-registry.json") };
  const g = triz(["call", "triz_graph"], { env });
  assert.equal(g.code, 0, g.stderr);
  assert.ok(JSON.parse(g.stdout).coreConflict);
  const id = JSON.parse(fs.readFileSync(env.TRIZ_GRAPH, "utf8")).nodes[0].id;
  const p = triz(["call", "triz_purpose", "--args", JSON.stringify({ id })], { env });
  assert.equal(p.code, 0, p.stderr);
  assert.equal(JSON.parse(p.stdout).id, id);
});

test("--version and --help print on stdout and exit 0; no command exits 2", () => {
  const v = triz(["--version"]);
  assert.equal(v.code, 0);
  assert.equal(v.stdout.trim(), JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version);
  const h = triz(["--help"]);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /triz call <tool> \[args\.json \| -\]/);
  const none = triz([]);
  assert.equal(none.code, 2);
  assert.equal(none.stdout, "");
});
