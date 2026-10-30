#!/usr/bin/env node
/** Local CLI: read exactly the explicit path as data and emit the draft result on stdout. */
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { ImportFormat, importSource } from "./act-import-registry.js";
import { MAX_SOURCE_BYTES } from "./act-import.js";

function main(args: string[]): number {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    process.stdout.write(`Usage: node dist/import-source.js --format <${ImportFormat.options.join("|")}> <local-file>\nReads a local file as data; output is an unconfirmed draft model in JSON.\n`);
    return 0;
  }
  const format = ImportFormat.safeParse(args[1]);
  if (args.length !== 3 || args[0] !== "--format" || !format.success || !args[2] || args[2].startsWith("-")) {
    process.stdout.write(JSON.stringify({ok:false,errors:["Expected --format <supported-format> <local-file>; use --help."]}) + "\n");
    return 2;
  }
  let fd: number | undefined;
  try {
    // Nonblocking open allows rejecting named pipes instead of waiting for a writer.
    fd = openSync(args[2], constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error("Source must be a regular local file.");
    if (stat.size > MAX_SOURCE_BYTES) throw new Error(`Source exceeds the ${MAX_SOURCE_BYTES}-byte limit.`);
    // Limit the read even if the file grows between stat and read.
    const data = Buffer.allocUnsafe(MAX_SOURCE_BYTES + 1);
    let count = 0;
    while (count < data.length) {
      const n = readSync(fd, data, count, data.length - count, null);
      if (!n) break;
      count += n;
    }
    if (count > MAX_SOURCE_BYTES) throw new Error(`Source exceeds the ${MAX_SOURCE_BYTES}-byte limit.`);
    const text = new TextDecoder("utf-8", {fatal:true}).decode(data.subarray(0,count));
    const result = importSource({format:format.data,source:{id:args[2],text}});
    process.stdout.write(JSON.stringify(result) + "\n");
    return result.ok ? 0 : 1;
  } catch (e) {
    process.stdout.write(JSON.stringify({ok:false,errors:[e instanceof Error ? e.message : "Cannot read source file."]}) + "\n");
    return 1;
  } finally { if (fd !== undefined) closeSync(fd); }
}
process.exitCode = main(process.argv.slice(2));
