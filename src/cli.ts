#!/usr/bin/env -S npx tsx
/**
 * triz — the kernel's tools on the command line, for scripts and agents without an MCP client.
 *
 *   triz list [--json]                    the tools, one line each
 *   triz schema <tool>                    a tool's description and input JSON Schema
 *   triz call <tool> [args.json | -]      validate the arguments, run the tool, print its JSON
 *
 * A thin wrapper over toolSpecs(): the same specs, options, validation, and JSON Schema
 * conversion as the stdio server (src/server.ts), so a call here answers what the MCP tool
 * answers. stdout carries only JSON (or the list); every error goes to stderr as JSON.
 * Exit codes: 0 a result without ok: false; 1 ok: false, or the tool failed; 2 a usage error,
 * an unknown tool, unreadable or invalid JSON, or arguments that fail the tool's schema.
 */
import fs from "node:fs";
import { objectFromShape, safeParseAsync, getParseErrorMessage } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import "./data.js"; // installs the fs-backed provider (side effect)
import { toolSpecs, type ToolSpec } from "./tools.js";
import * as graph from "./graph.js";
import { loadElk } from "./elk.js";
import { at } from "./act-issues.js";
import { version } from "./version.js";

const HELP = `triz ${version}: call the TRIZ kernel's tools without MCP (the tools the triz-mcp server serves).

Usage:
  triz list [--json]                  One line per tool: its name and the first sentence of its description
  triz schema <tool>                  The tool's name, full description, and input JSON Schema, as JSON
  triz call <tool> [args.json | -]    Validate the arguments, run the tool, and print its JSON result
  triz call <tool> --args '<json>'    The same, with the arguments inline
  triz --version | --help

Options:
  --json     list: a JSON array of {name, description}, with the full description
  --pretty   indent the JSON output

The arguments of call are one JSON object, read from args.json, from stdin (- or no file), or from
--args. Empty input means {}, and so does no file when stdin is a terminal. They are validated
against the tool's schema exactly as the MCP server validates them.

Exit codes:
  0  the result has ok: true, or no ok field
  1  the result has ok: false (printed on stdout, with its issues and hints), or the tool failed
     (message as JSON on stderr)
  2  a usage error, an unknown tool, unreadable or invalid JSON, or arguments that fail the tool's
     schema (the issues as JSON on stderr)

Environment:
  TRIZ_DATA_DIR               the canonical data directory (found from the package by default)
  TRIZ_GRAPH, TRIZ_REGISTRY   a project graph and registry, for triz_graph and triz_purpose
`;

/** What a run prints and its exit code; main writes both streams before exiting. */
interface Outcome { code: 0 | 1 | 2; stdout?: string; stderr?: string }

interface Argv { positionals: string[]; json: boolean; pretty: boolean; help: boolean; version: boolean; args?: string }

const COMMANDS = ["list", "schema", "call", "help"];
const FLAGS: Record<string, "json" | "pretty" | "help" | "version"> = {
  "--json": "json", "--pretty": "pretty", "--help": "help", "-h": "help", "--version": "version", "-v": "version",
};

function parseArgv(argv: string[]): Argv | string {
  const p: Argv = { positionals: [], json: false, pretty: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { p.positionals.push(...argv.slice(i + 1)); break; }
    if (a === "-" || !a.startsWith("-")) { p.positionals.push(a); continue; }
    const eq = a.startsWith("--") ? a.indexOf("=") : -1;
    const flag = eq < 0 ? a : a.slice(0, eq);
    const inline = eq < 0 ? undefined : a.slice(eq + 1);
    if (flag === "--args") {
      if (inline !== undefined) p.args = inline;
      else if (i + 1 < argv.length) p.args = argv[++i];
      else return "--args needs a JSON value";
      continue;
    }
    const key = Object.hasOwn(FLAGS, flag) ? FLAGS[flag] : undefined;
    if (!key) return `unknown option ${flag}`;
    if (inline !== undefined) return `${flag} takes no value`;
    p[key] = true;
  }
  return p;
}

const json = (value: unknown, pretty: boolean) => JSON.stringify(value, null, pretty ? 2 : undefined) + "\n";

function failure(code: 1 | 2, error: string, message: string, extra: Record<string, unknown>, pretty: boolean): Outcome {
  return { code, stderr: json({ error, message, ...extra }, pretty) };
}

const usage = (message: string, pretty = false) => failure(2, "usage", message, { hint: "run triz --help" }, pretty);

/** The first sentence: up to the first ., !, or ? followed by a capital, or the end; not after e.g. or i.e. */
function firstSentence(description: string): string {
  const end = /[.!?](?=\s+[A-Z(`'"]|\s*$)/g;
  for (let m; (m = end.exec(description)); ) {
    if (/\b(?:e\.g|i\.e|cf|vs|etc)$/i.test(description.slice(0, m.index))) continue;
    return description.slice(0, m.index + 1);
  }
  return description;
}

function levenshtein(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/**
 * The closest tool names: names containing the query (or contained in it) first, then by edit
 * distance to the name or, one more, to its prefix of the query's length; triz_ is compared only
 * when the query starts with it.
 */
function closest(query: string, names: string[], n = 3): string[] {
  const q = query.toLowerCase();
  const rank = (name: string) => {
    const forms = q.startsWith("triz_") ? [name] : [name.replace(/^triz_/, "")];
    const distance = (f: string) => Math.min(levenshtein(q, f), levenshtein(q, f.slice(0, q.length)) + 1);
    return [forms.some((f) => f.includes(q) || q.includes(f)) ? 0 : 1, Math.min(...forms.map(distance))];
  };
  return names
    .map((name) => ({ name, r: rank(name) }))
    .sort((x, y) => x.r[0] - y.r[0] || x.r[1] - y.r[1] || x.name.localeCompare(y.name))
    .slice(0, n)
    .map((x) => x.name);
}

function findTool(specs: ToolSpec[], name: string, pretty: boolean): ToolSpec | Outcome {
  const spec = specs.find((s) => s.name === name);
  if (spec) return spec;
  return failure(2, "unknown-tool", `unknown tool '${name}'`, { suggestions: closest(name, specs.map((s) => s.name)), hint: "run triz list" }, pretty);
}

const isOutcome = (x: ToolSpec | Outcome): x is Outcome => "code" in x;

/** Zod issues as the kernel writes paths ($.model.wires[0]), each with its code and message. */
function issuesOf(error: unknown): { code: string; path: string; message: string }[] {
  const issues = (error as { issues?: { code?: string; path?: PropertyKey[]; message?: string }[] })?.issues ?? [];
  return issues.map((i) => ({
    code: String(i.code),
    path: at("$", ...(i.path ?? []).map((s) => (typeof s === "number" ? s : String(s)))),
    message: String(i.message),
  }));
}

const isZodError = (e: unknown) => !!e && typeof e === "object" && (e as Error).name === "ZodError" && Array.isArray((e as { issues?: unknown }).issues);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function readArguments(p: Argv, file: string | undefined): Promise<{ value: unknown } | Outcome> {
  let text: string;
  let source: string;
  if (p.args !== undefined) [text, source] = [p.args, "--args"];
  else if (file !== undefined && file !== "-") {
    source = file;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (e) {
      return failure(2, "unreadable-input", `cannot read ${file}: ${(e as Error).message}`, {}, p.pretty);
    }
  } else if (file === "-" || !process.stdin.isTTY) [text, source] = [await readStdin(), "stdin"];
  else [text, source] = ["", "no input"];
  if (text.trim() === "") return { value: {} };
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    return failure(2, "invalid-json", `${source} is not JSON: ${(e as Error).message}`, {}, p.pretty);
  }
}

async function call(spec: ToolSpec, p: Argv, file: string | undefined): Promise<Outcome> {
  const input = await readArguments(p, file);
  if ("code" in input) return input;
  // The server registers each tool's shape as objectFromShape(shape) and parses `arguments ?? {}`
  // with it (McpServer.validateToolInput); the handler gets the parsed data, defaults applied.
  const parsed = await safeParseAsync(objectFromShape(spec.shape), input.value ?? {});
  const invalid = (error: unknown) => failure(2, "invalid-arguments", `Input validation error: Invalid arguments for tool ${spec.name}: ${getParseErrorMessage(error)}`, { tool: spec.name, issues: issuesOf(error) }, p.pretty);
  if (!parsed.success) return invalid(parsed.error);
  let result: Awaited<ReturnType<ToolSpec["handler"]>>;
  try {
    result = await spec.handler(parsed.data);
  } catch (e) {
    // The finite tools re-parse their strict request schemas, refinements included.
    if (isZodError(e)) return invalid(e);
    return failure(1, "tool-error", e instanceof Error ? e.message : String(e), { tool: spec.name }, p.pretty);
  }
  const text = result.content.map((c) => c.text).join("");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { code: 0, stdout: text.endsWith("\n") ? text : text + "\n" };
  }
  const failed = !!value && typeof value === "object" && !Array.isArray(value) && (value as { ok?: unknown }).ok === false;
  return { code: failed ? 1 : 0, stdout: json(value, p.pretty) };
}

async function run(argv: string[]): Promise<Outcome> {
  const p = parseArgv(argv);
  if (typeof p === "string") return usage(p);
  if (p.help) return { code: 0, stdout: HELP };
  if (p.version) return { code: 0, stdout: version + "\n" };
  const [command, ...rest] = p.positionals;
  if (command === undefined) return { code: 2, stderr: HELP };
  if (command === "help") return { code: 0, stdout: HELP };
  if (!COMMANDS.includes(command)) return usage(`unknown command '${command}'; commands: list, schema, call`, p.pretty);
  if (command !== "list" && p.json) return usage(`--json is an option of list, not ${command}`, p.pretty);
  if (command !== "call" && p.args !== undefined) return usage(`--args is an option of call, not ${command}`, p.pretty);

  const specs = toolSpecs({ graph, layout: loadElk });

  if (command === "list") {
    if (rest.length) return usage(`list takes no arguments, got '${rest[0]}'`, p.pretty);
    if (p.json) return { code: 0, stdout: json(specs.map((s) => ({ name: s.name, description: s.description })), p.pretty) };
    const width = Math.max(...specs.map((s) => s.name.length));
    return { code: 0, stdout: specs.map((s) => `${s.name.padEnd(width)}  ${firstSentence(s.description)}\n`).join("") };
  }

  if (rest.length === 0) return usage(`${command} needs a tool name; run triz list`, p.pretty);
  const spec = findTool(specs, rest[0], p.pretty);
  if (isOutcome(spec)) return spec;

  if (command === "schema") {
    if (rest.length > 1) return usage(`schema takes one tool name, got '${rest[1]}' too`, p.pretty);
    // As McpServer lists the tool: tools/list's inputSchema.
    const inputSchema = toJsonSchemaCompat(objectFromShape(spec.shape), { strictUnions: true, pipeStrategy: "input" });
    return { code: 0, stdout: json({ name: spec.name, description: spec.description, inputSchema }, p.pretty) };
  }

  if (rest.length > 2) return usage(`call takes a tool name and one arguments file, got '${rest[2]}' too`, p.pretty);
  if (rest.length === 2 && p.args !== undefined) return usage("give the arguments as a file, as -, or with --args, not two of them", p.pretty);
  return call(spec, p, rest[1]);
}

const write = (stream: NodeJS.WriteStream, text: string | undefined) =>
  new Promise<void>((resolve) => (text ? stream.write(text, () => resolve()) : resolve()));

async function main() {
  let outcome: Outcome;
  try {
    outcome = await run(process.argv.slice(2));
  } catch (e) {
    outcome = { code: 1, stderr: json({ error: "internal-error", message: e instanceof Error ? e.message : String(e) }, false) };
  }
  // Exit only once both streams are flushed: a large result piped on darwin is written asynchronously.
  await write(process.stdout, outcome.stdout);
  await write(process.stderr, outcome.stderr);
  process.exit(outcome.code);
}

main();
