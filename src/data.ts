/**
 * fs-backed TRIZ knowledge loader (repo checkout / npm package layout).
 *
 * Installs the filesystem provider into the pure core (./core.js) and
 * re-exports the full lookup API. Resolution uses an environment override
 * first, then repo-relative candidates. Fails closed with a clear message if
 * the data dir is absent — no silent fallback.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useProvider } from "./core.js";

export * from "./core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function candidateDataDirs(): string[] {
  return [
    process.env.TRIZ_DATA_DIR,
    path.resolve(process.cwd(), "skills/triz-innovation/data"),
    path.resolve(__dirname, "../skills/triz-innovation/data"),
    path.resolve(__dirname, "../../skills/triz-innovation/data"),
  ].filter((d): d is string => Boolean(d));
}

export function resolveDataDir(): string {
  for (const dir of candidateDataDirs()) {
    if (fs.existsSync(path.join(dir, "principles.json"))) return dir;
  }
  throw new Error(
    "TRIZ data dir not found; set TRIZ_DATA_DIR or run from the repo root (expects skills/triz-innovation/data/principles.json)",
  );
}

useProvider((file) => JSON.parse(fs.readFileSync(path.join(resolveDataDir(), file), "utf8")));
