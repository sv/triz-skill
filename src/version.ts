/**
 * Single source of truth for the package version: package.json itself.
 * Read via createRequire so tsc does not need the JSON in the program
 * (keeps rootDir=src clean) and dist/ resolves ../package.json at the
 * package root both in-repo and when installed from npm.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const version: string = require("../package.json").version;
