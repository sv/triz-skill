#!/usr/bin/env node
/**
 * Regenerate the committed function-model JSON Schema from the zod model in src/act.ts.
 *
 *   node --import tsx scripts/gen-schema.mjs        (pnpm schema)
 *
 * tests/act.test.ts fails when the committed file drifts from the generated one.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { functionModelJsonSchema } from "../src/act.ts";

export const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skills/triz-innovation/schemas/function-model.schema.json");
fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
fs.writeFileSync(schemaPath, JSON.stringify(functionModelJsonSchema(), null, 2) + "\n");
console.log(`wrote ${path.relative(process.cwd(), schemaPath)}`);
