#!/usr/bin/env node
/** Local CLI: read exactly the explicit path as data and emit the draft result on stdout. */
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { ImportFormat, importSource } from "./act-import-registry.js";
import { MAX_SOURCE_BYTES } from "./act-import.js";
import { fail, issue } from "./act-issues.js";

/** A refusal with the code, path and hint every fail-closed result carries. */
class Refusal extends Error { constructor(readonly path: string, message: string, readonly hint: string) { super(message); } }
const USAGE = `node dist/import-source.js --format <${ImportFormat.options.join("|")}> <local-file>`;
const print = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
const refusal = (path: string, message: string, hint: string) => fail([issue("invalid-argument", path, message, hint)]);

function main(args: string[]): number {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    process.stdout.write(`Usage: ${USAGE}\nReads a local file as data; output is an unconfirmed draft model in JSON.\n`);
    return 0;
  }
  if (args.length !== 3 || args[0] !== "--format" || !args[2] || args[2].startsWith("-")) {
    print(refusal("$.argv", "Expected --format <supported-format> <local-file>.", `Run: ${USAGE}; see --help.`));
    return 2;
  }
  const format = ImportFormat.safeParse(args[1]);
  if (!format.success) {
    print(refusal("$.format", `Unsupported format '${args[1]}'.`, `Use one of: ${ImportFormat.options.join(", ")}.`));
    return 2;
  }
  let fd: number | undefined;
  try {
    // Nonblocking open allows rejecting named pipes instead of waiting for a writer.
    try { fd = openSync(args[2], constants.O_RDONLY | constants.O_NONBLOCK); }
    catch (e) { throw new Refusal("$.file", `Cannot open the source file: ${e instanceof Error ? e.message : String(e)}`, "Check the path and its read permission."); }
    const tooLarge = () => new Refusal("$.file", `Source exceeds the ${MAX_SOURCE_BYTES}-byte limit.`, "Import a smaller source, or split it into several sources.");
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Refusal("$.file", "Source must be a regular local file.", "Pass a regular file, not a directory, device or pipe.");
    if (stat.size > MAX_SOURCE_BYTES) throw tooLarge();
    // Limit the read even if the file grows between stat and read.
    const data = Buffer.allocUnsafe(MAX_SOURCE_BYTES + 1);
    let count = 0;
    while (count < data.length) {
      const n = readSync(fd, data, count, data.length - count, null);
      if (!n) break;
      count += n;
    }
    if (count > MAX_SOURCE_BYTES) throw tooLarge();
    let text: string;
    try { text = new TextDecoder("utf-8", {fatal:true}).decode(data.subarray(0,count)); }
    catch { throw new Refusal("$.file", "Source is not valid UTF-8.", "Save the source as UTF-8 text."); }
    const result = importSource({format:format.data,source:{id:args[2],text}});
    print(result);
    return result.ok ? 0 : 1;
  } catch (e) {
    print(e instanceof Refusal ? refusal(e.path, e.message, e.hint)
      : refusal("$.file", e instanceof Error ? e.message : "Cannot read the source file.", "Check that the path names a readable local file."));
    return 1;
  } finally { if (fd !== undefined) closeSync(fd); }
}
process.exitCode = main(process.argv.slice(2));
