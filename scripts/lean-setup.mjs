#!/usr/bin/env node
/**
 * Set up theory/'s Lean dependencies, theory/.lake/packages (Mathlib and the packages it requires,
 * with the prebuilt oleans of the Mathlib modules the theory imports), as cheaply as this machine
 * allows.
 *
 *   pnpm lean:setup                               (node scripts/lean-setup.mjs)
 *   node scripts/lean-setup.mjs --print-imports   the Mathlib modules theory/ imports, one per line
 *
 * 1. With theory/.lake/packages missing, it looks for another checkout of this repository (each
 *    `git worktree list` entry, and the main checkout) whose theory/lake-manifest.json and
 *    theory/lean-toolchain are byte-identical to this one's and whose packages are checked out at
 *    the manifest's revisions, and clones that checkout's theory/.lake/packages copy-on-write:
 *    `cp -cpR` (clonefile, APFS) on macOS, `cp -pR --reflink=auto` on Linux (a plain copy where the
 *    file system cannot share blocks). It prefers a checkout that has the oleans of every imported
 *    Mathlib module, then one that has built the theory.
 * 2. If no checkout qualifies, the clone fails, or an imported Mathlib module still has no olean, it
 *    runs `lake exe cache get` with the theory's Mathlib imports, the list CI passes (CI reads it
 *    from --print-imports): Lake clones the packages it is missing, and the cache downloads those
 *    modules and their import closure only.
 * Nothing else goes over the network. It prints what it did; build the theory afterwards with
 * `cd theory && lake build`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const THEORY = path.join(ROOT, "theory");
const PACKAGES = path.join(THEORY, ".lake/packages");
const PINS = ["lake-manifest.json", "lean-toolchain"];
/** A module name, so the list is safe to pass on a command line. */
const MODULE = /^Mathlib(?:\.[A-Za-z_][A-Za-z0-9_']*)+$/;

/** The Mathlib modules imported by the .lean files under theory/ (outside .lake), sorted, each once. */
function mathlibImports() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== ".lake") walk(file);
      else if (entry.isFile() && entry.name.endsWith(".lean")) {
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
          if (!line.startsWith("import ")) continue;
          for (const name of line.slice("import ".length).split(/\s+/)) {
            if (!name.startsWith("Mathlib.")) continue;
            if (!MODULE.test(name)) throw new Error(`${path.relative(ROOT, file)}: '${name}' is not a module name this script passes on`);
            found.add(name);
          }
        }
      }
    }
  };
  walk(THEORY);
  return [...found].sort();
}

const olean = (packages, module) => `${path.join(packages, "mathlib/.lake/build/lib/lean", ...module.split("."))}.olean`;

const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8" });

/** Whether every git package of this checkout's manifest is checked out in `packages` at its revision. */
function atPins(packages) {
  const manifest = JSON.parse(fs.readFileSync(path.join(THEORY, "lake-manifest.json"), "utf8"));
  return manifest.packages.filter((p) => p.type === "git").every((p) => {
    const dir = path.join(packages, p.name);
    return fs.existsSync(dir) && run("git", ["rev-parse", "HEAD"], dir).stdout?.trim() === p.rev;
  });
}

/** The other checkouts of this repository: its worktrees and its main checkout. */
function checkouts() {
  const dirs = (run("git", ["worktree", "list", "--porcelain"], ROOT).stdout ?? "")
    .split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.slice("worktree ".length));
  const common = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], ROOT).stdout?.trim();
  if (common) dirs.push(path.dirname(common));
  const seen = new Set([fs.realpathSync(ROOT)]);
  return dirs.filter((dir) => {
    let real;
    try { real = fs.realpathSync(dir); } catch { return false; }
    if (seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}

/** Checkouts whose packages this one can clone, best first. */
function sources(imports) {
  const pins = PINS.map((f) => fs.readFileSync(path.join(THEORY, f)));
  return checkouts().flatMap((dir) => {
    const theory = path.join(dir, "theory"), packages = path.join(theory, ".lake/packages");
    try {
      if (!fs.statSync(packages).isDirectory()) return [];
      if (!PINS.every((f, i) => fs.readFileSync(path.join(theory, f)).equals(pins[i]))) return [];
    } catch { return []; }
    if (!atPins(packages)) return [];
    const complete = imports.every((m) => fs.existsSync(olean(packages, m)));
    const built = fs.existsSync(path.join(theory, ".lake/build/lib/lean/CategoricalTriz.olean"));
    return [{ dir, packages, complete, built }];
  }).sort((a, b) => Number(b.complete) - Number(a.complete) || Number(b.built) - Number(a.built));
}

/** Clone `from` to theory/.lake/packages copy-on-write, through a temporary name renamed at the end. */
function clone(from) {
  const flags = process.platform === "darwin" ? ["-cpR"] : process.platform === "linux" ? ["-pR", "--reflink=auto"] : null;
  if (!flags) return { ok: false, why: `no copy-on-write copy on ${process.platform}` };
  const tmp = path.join(THEORY, ".lake", `packages.clone-${process.pid}`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  const started = Date.now();
  const r = run("cp", [...flags, from, tmp]);
  if (r.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ok: false, why: (r.stderr || r.error?.message || `cp exited ${r.status ?? r.signal}`).trim() };
  }
  fs.renameSync(tmp, PACKAGES);
  return { ok: true, command: `cp ${flags.join(" ")}`, seconds: (Date.now() - started) / 1000 };
}

function lakeBin() {
  return ["lake", path.join(os.homedir(), ".elan/bin/lake")].find((bin) => spawnSync(bin, ["--version"], { cwd: THEORY, stdio: "ignore" }).status === 0);
}

function main(argv) {
  const unknown = argv.filter((a) => a !== "--print-imports");
  if (unknown.length) {
    console.error("usage: node scripts/lean-setup.mjs [--print-imports]");
    return 2;
  }
  const imports = mathlibImports();
  if (argv.includes("--print-imports")) {
    console.log(imports.join("\n"));
    return 0;
  }
  if (fs.existsSync(PACKAGES)) console.log("theory/.lake/packages is present; leaving it as it is.");
  else {
    const [source] = sources(imports);
    if (!source) console.log("No other checkout of this repository has theory/.lake/packages at this lake-manifest.json and lean-toolchain.");
    else {
      const r = clone(source.packages);
      if (r.ok) console.log(`Cloned theory/.lake/packages from ${source.dir} copy-on-write (${r.command}, ${r.seconds.toFixed(1)} s).`);
      else console.log(`Could not clone ${source.packages}: ${r.why}`);
    }
  }
  const missing = fs.existsSync(PACKAGES) && atPins(PACKAGES) ? imports.filter((m) => !fs.existsSync(olean(PACKAGES, m))) : imports;
  if (!missing.length) console.log(`All ${imports.length} Mathlib modules theory/ imports have their oleans; nothing downloaded.`);
  else {
    const bin = lakeBin();
    if (!bin) {
      console.error("lake not found: install elan (https://github.com/leanprover/elan); it installs the toolchain theory/lean-toolchain names.");
      return 1;
    }
    console.log(fs.existsSync(PACKAGES) && missing.length < imports.length
      ? `${missing.length} of the ${imports.length} Mathlib modules theory/ imports have no olean (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", ..." : ""}).`
      : "theory/.lake/packages is missing, or not at the manifest's revisions.");
    console.log(`Running lake exe cache get with the ${imports.length} Mathlib modules theory/ imports: Lake clones the packages it is missing, and the cache fetches those modules and their import closure.`);
    const r = spawnSync(bin, ["exe", "cache", "get", ...imports], { cwd: THEORY, stdio: "inherit" });
    if (r.status !== 0) {
      console.error(`lake exe cache get failed (${r.error?.message ?? `exit ${r.status ?? r.signal}`}).`);
      return 1;
    }
  }
  console.log("Next: cd theory && lake build --wfail   (the same no-sorry check Lean CI runs)");
  return 0;
}

process.exit(main(process.argv.slice(2)));
