#!/usr/bin/env node
/**
 * Regenerate the committed JSON Schemas: the function model from src/act.ts, the rewrite rule
 * from src/act-rule.ts.
 *
 *   node --import tsx scripts/gen-schema.mjs        (pnpm schema)
 *
 * tests/act.test.ts fails when a committed file drifts from the generated one.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { functionModelJsonSchema } from "../src/act.ts";
import { ruleJsonSchema } from "../src/act-rule.ts";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skills/triz-innovation/schemas");
fs.mkdirSync(dir, { recursive: true });
for (const [file, schema] of [["function-model.schema.json", functionModelJsonSchema()], ["rule.schema.json", ruleJsonSchema()]]) {
  const target = path.join(dir, file);
  fs.writeFileSync(target, JSON.stringify(schema, null, 2) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), target)}`);
}
