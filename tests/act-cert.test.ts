/**
 * Lean certificates (src/act-cert.ts): the checked-in fixtures in theory/Certificates equal the
 * generator's output, each certificate states exactly the kernel's verdicts, ids stay inside
 * string literals, and generation fails closed. Where Lean is built locally (theory/.lake), the
 * certificates are also checked: the fixtures and hostile generated models are accepted, and a
 * tampered certificate (verdicts negated, a carrier changed, the unsafe set emptied or filled,
 * nothing acceptable, a wrong invariant, a concept row changed) fails where it must. Escalation,
 * weakness, and behaviour certificates encode the declared rows, never the kernel's results, and
 * state only what a witness or an exhaustive decision supports. Each Lean test checks its
 * certificates and tampered copies in one Lean process (runLocalBatch), and one test checks that a
 * batch gives every file the messages it gets alone. Without Lean, or with TRIZ_SKIP_LEAN=1, those
 * tests skip; TRIZ_REQUIRE_LEAN=1 makes them run, and fail without Lean, whatever TRIZ_SKIP_LEAN
 * says. The Lean tests run together at the end of the file, TRIZ_LEAN_JOBS at a time (default 1:
 * one Lean process at a time), after theory/ is built once, so the tests themselves only run
 * `lake env lean`, never `lake build`. Nothing here calls AXLE, and without local Lean the checker
 * refuses rather than falling back to it.
 * Regenerate the fixtures with UPDATE_GOLDEN=1 pnpm test, then review the diff.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FunctionModel, checkModel, harmLoops, separationCheck, type PhysicalContradiction } from "../src/act.js";
import { behaviorCertificate, dynamicsCertificate, modelCertificate, separationCertificate, trimCertificate, weaknessCertificate, leanString, MAX_CERT_ROWS, MAX_CERT_WORK, RESERVED_NAMESPACES, type Certificate } from "../src/act-cert.js";
import { boundedDynamics, reachedStates } from "../src/act-dynamics.js";
import { compareBehavior, trimPreservesBehavior, weaknessRanking } from "../src/act-behavior.js";
import { interpose, segment } from "../src/act-rewrite.js";
import { supportConcept, supportConcepts, SUPPORT_ACCEPTABLE } from "./support/concepts.js";
import { toolSpecs } from "../src/tools.js";
// triz_separate looks up principle texts for its suggestions: install the fs-backed data provider.
import "../src/data.js";
import { accept, batchFile, bindRequest, check, checkAll, checkCorrespondence, ensureBuilt, lint, localLeanAvailable, runLocal, runLocalBatch, splitBatch, tamperVariants, theorems, withAxioms } from "../scripts/certify.mjs";
import { rng, genModel } from "./support/gen.js";
import { clock } from "./support/clock.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const FIXTURES = { BearingHeat: "bearing-heat", SoftwareCache: "software-cache" } as const;
const HOT = [{ box: "shaft", state: ["hot"] }];
/** The bearing whose shaft cools back to warm instead of heating to hot: hot is unreachable. */
function damped(): FunctionModel {
  const m = example("bearing-heat-dynamics");
  for (const r of m.boxes.find((b) => b.id === "shaft")!.transition!) if (r.state === "hot" || (r.state === "warm" && r.in["heat-in"] === "high")) r.next = "warm";
  return m;
}
const BEARING_TRIM = { trim: ["bearing"] };
/** Every checked-in certificate, by namespace, and how to generate it again. */
const GENERATED: Record<string, (ns: string) => Certificate> = {
  ...Object.fromEntries(Object.entries(FIXTURES).map(([ns, name]) => [ns, (n: string) => modelCertificate(example(name), { namespace: n })])),
  BearingEscalation: (n) => dynamicsCertificate(example("bearing-heat-dynamics"), { unsafe: HOT }, { namespace: n }),
  SupportWeakness: (n) => weaknessCertificate(supportConcepts(), SUPPORT_ACCEPTABLE, { namespace: n }),
  BearingDamped: (n) => dynamicsCertificate(damped(), { unsafe: HOT }, { namespace: n }),
  BearingTrim: (n) => trimCertificate(example("bearing-heat-behavior"), BEARING_TRIM, { namespace: n }),
  // A port target whose runs block once the shaft is hot, outside the unsafe set's state conditions.
  BearingBlocked: (n) => dynamicsCertificate(stuck(), { unsafe: COLD_FRICTION }, { namespace: n }),
};
const fixturePath = (ns: string) => path.resolve(here, `../theory/Certificates/${ns}.lean`);
const content = (c: Certificate) => { assert.ok(c.ok, JSON.stringify(c)); return c.content; };
const tables = (c: Certificate) => content(c).replace(/^def certificateManifest : String := .*\n/m, "");
const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);

const lean = localLeanAvailable();
/** How many Lean tests run at once: TRIZ_LEAN_JOBS, a positive integer, default 1. */
const LEAN_JOBS = (() => {
  const jobs = process.env.TRIZ_LEAN_JOBS || "1";
  if (!/^[1-9]\d*$/.test(jobs)) throw new Error(`TRIZ_LEAN_JOBS must be a positive integer, not ${JSON.stringify(jobs)}`);
  return Number(jobs);
})();
/** The Lean tests, declared where they stand and run together by the describe at the end of the file. */
const leanTests: Array<[string, () => Promise<void>]> = [];
const leanTest = (name: string, fn: () => Promise<void>) => { leanTests.push([name, fn]); };

/** The text outside string literals, where model ids must never appear. */
const outsideStrings = (lean: string) => lean.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

const irreducible: PhysicalContradiction = {
  id: "pc", parameter: "p", axes: { space: ["edge", "core"], time: ["t1", "t2"], level: ["sys", "sub"] },
  demands: [
    { id: "a", values: ["x"], space: ["edge"] }, { id: "b", values: ["y"] }, { id: "c", values: ["x", "y"] },
    { id: "d", values: ["z"], time: ["t2"], level: ["sub"] }, { id: "e", values: ["w"], time: ["t1"], space: ["core"] },
  ],
};
const hostile: PhysicalContradiction = {
  id: "x -/ #exit /- \"q\" ‮\n", parameter: "p\\",
  axes: { time: ["a-/b", "é\u0000", "😀"] },
  demands: [{ id: "-/", values: ["\"", "​"], time: ["a-/b"] }, { id: "/-", values: ["\ud800"], time: ["é\u0000", "😀"] }],
};

test("fixtures in theory/Certificates equal the generator's output", () => {
  for (const [ns, generate] of Object.entries(GENERATED)) {
    const actual = content(generate(ns));
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(fixturePath(ns), actual);
    assert.equal(actual, fs.readFileSync(fixturePath(ns), "utf8"), `${ns}.lean drifted; rerun with UPDATE_GOLDEN=1 and review`);
  }
  const root = fs.readFileSync(path.resolve(here, "../theory/Certificates.lean"), "utf8");
  for (const ns of Object.keys(GENERATED)) assert.match(root, new RegExp(`^import Certificates\\.${ns}$`, "m"));
});

test("a certificate states exactly the kernel's verdicts", () => {
  const bearing = modelCertificate(example("bearing-heat"));
  assert.ok(bearing.ok);
  assert.deepEqual(bearing.certifies.map((c) => c.theorem), [
    "TrizCertificate.typed", "TrizCertificate.loop_0", "TrizCertificate.loop_1",
    "TrizCertificate.Separation0.contradiction", "TrizCertificate.Separation0.pair_0_1", "TrizCertificate.Separation0.gluable",
  ]);
  assert.match(bearing.certifies[4].verdict, /'precision' and 'no-seizure' are separated on time/);
  assert.match(bearing.content, /^theorem pair_0_1_time : Disjoint \(time 0\) \(time 1\) :=$/m);

  const multi = separationCertificate(irreducible);
  assert.ok(multi.ok);
  const r = separationCheck(irreducible);
  assert.ok(r.ok);
  for (const p of r.pairs) {
    const [i, j] = p.demands.map((id) => irreducible.demands.findIndex((d) => d.id === id));
    const stated: string | undefined = multi.content.split("\n").find((l) => l.startsWith(`theorem pair_${i}_${j} :`))!;
    assert.ok(stated, `${i},${j}`);
    if (p.status === "compatible") assert.match(stated, /Nonempty/);
    else if (p.status === "separated") {
      assert.match(stated, /^theorem \S+ : ∃ s/);
      for (const a of ["space", "time", "level"] as const) {
        assert.match(multi.content, new RegExp(`^theorem pair_${i}_${j}_${a} : ${p.separatingAxes.includes(a) ? "Disjoint" : "\\("}`, "m"));
      }
    } else assert.match(stated, /^theorem \S+ : ¬ ∃ s/);
  }
  assert.match(multi.content, /^theorem notGluable :/m);
  assert.doesNotMatch(multi.content, /^theorem gluable :/m);

  // The generated models' loops and contradictions, verdict for verdict.
  for (let seed = 1; seed <= 200; seed++) {
    const m = genModel(rng(seed), { contradictions: true });
    const c = modelCertificate(m);
    assert.ok(c.ok, `seed ${seed}: ${JSON.stringify(c)}`);
    const cycles = harmLoops(m).flatMap((l) => l.cycles);
    assert.equal(c.certifies.filter((x) => /\.loop_\d+$/.test(x.theorem)).length, cycles.length, `seed ${seed}`);
    for (const [k, pc] of (m.contradictions ?? []).entries()) {
      const s = separationCheck(pc);
      assert.ok(s.ok);
      const names: Array<string | undefined> = c.certifies.filter((x) => x.theorem.includes(`.Separation${k}.`)).map((x) => x.theorem.split(".").at(-1));
      const pair = (ids: string[]) => `pair_${ids.map((id) => pc.demands.findIndex((d) => d.id === id)).join("_")}`;
      assert.deepEqual(names, [s.contradiction ? "contradiction" : "sharedValue", ...s.pairs.map((p) => pair(p.demands)), s.gluable ? "gluable" : "notGluable"], `seed ${seed}`);
    }
  }
});

test("ids stay inside escaped string literals", () => {
  const c = content(separationCertificate(hostile));
  const outside = outsideStrings(c);
  assert.doesNotMatch(outside, /#exit|"q"|‮|\u0000/);
  assert.equal((outside.match(/\/-/g) ?? []).length, (outside.match(/-\//g) ?? []).length, "every comment the generator opens, it closes");
  assert.equal(leanString("a\"b\\c\nd\u0001​\ud800😀"), '"a\\"b\\\\c\\nd\\u0001\\u200b\\ufffd😀"');
  for (let seed = 1; seed <= 100; seed++) {
    const m = genModel(rng(seed), { contradictions: true });
    const out = outsideStrings(content(modelCertificate(m)));
    for (const id of [...m.boxes.map((b) => b.id), ...m.wires.map((w) => w.id)].filter((id) => /[^A-Za-z0-9_]/.test(id))) {
      assert.ok(!out.includes(id), `seed ${seed}: id ${JSON.stringify(id)} outside a string literal`);
    }
  }
});

test("generation fails closed", () => {
  const bad = example("bearing-heat");
  bad.wires[0].carrier = "heat";
  const mistyped = modelCertificate(bad);
  assert.equal(mistyped.ok, false);
  assert.deepEqual(!mistyped.ok && mistyped.errors, checkModel(bad).errors);

  const undeclared = example("bearing-heat");
  undeclared.contradictions![0].demands[0].time = ["noon"];
  const r = modelCertificate(undeclared);
  assert.ok(!r.ok && r.errors.some((e) => e.startsWith("contradiction 'clearance': axis 'time': cell 'noon'")), JSON.stringify(r));

  const cells = Array.from({ length: 100 }, (_, i) => `c${i}`);
  const big = separationCertificate({ id: "big", parameter: "p", axes: { space: cells, time: cells }, demands: ["w", "x", "y", "z"].map((v) => ({ id: v, values: [v] })) });
  assert.ok(!big.ok && big.errors[0].includes(`certificate limit of ${MAX_CERT_WORK}`));
  const named = modelCertificate(example("bearing-heat"), { namespace: "end x" });
  assert.deepEqual(!named.ok && named.errors, ["namespace 'end x' must be a capitalised alphanumeric Lean identifier"]);
  assert.deepEqual(!named.ok && named.issues.map((i) => [i.code, i.path]), [["invalid-namespace", "$.namespace"]]);
  assert.deepEqual(!mistyped.ok && mistyped.issues.map((i) => i.path), checkModel(bad, "$.model").issues.map((i) => i.path));
});

test("tools: triz_export format lean and triz_separate certificate", async () => {
  const exported = await call("triz_export", { model: example("software-cache"), format: "lean" });
  assert.equal(exported.ok, true);
  assert.equal(exported.format, "lean");
  assert.equal(exported.content, content(modelCertificate(example("software-cache"))));
  assert.deepEqual(exported.certifies.map((c: { theorem: string }) => c.theorem), ["TrizCertificate.typed", "TrizCertificate.loop_0"]);
  const bad = example("software-cache");
  bad.wires[0].to.port = "nope";
  assert.equal((await call("triz_export", { model: bad, format: "lean" })).ok, false);

  const pc = example("bearing-heat").contradictions![0];
  const sep = await call("triz_separate", { contradiction: pc, along: "time", certificate: true });
  assert.equal(sep.along.verdict, "dynamizable");
  assert.equal(sep.certificate.content, content(separationCertificate(pc)));
  assert.equal((await call("triz_separate", { contradiction: pc })).certificate, undefined);
});

/**
 * Review of PR #19: a `namespace` line inside a comment moved the real `typed` (proved by
 * `native_decide`) to the name of a decoy `Separation0.typed` with a standard proof, so the axiom
 * audit checked the decoy twice and the verdict never.
 */
function decoy() {
  const c = fs.readFileSync(fixturePath("SoftwareCache"), "utf8");
  const verdict = c.indexOf("/-- `checkModel`");
  const end = c.indexOf("\n\n", c.indexOf("theorem typed :")) + 1;
  const typed = c.slice(verdict, end).replace(/decide \+kernel$/m, "native_decide");
  const standard = c.slice(c.indexOf("theorem typed :"), end);
  return c.slice(0, verdict)
    + `namespace Separation0\n\n${standard}\nend Separation0\n\n/-\nnamespace Separation0\n-/\n${typed}/-\nend Separation0\n-/\n`
    + c.slice(end);
}

test("the checker names each theorem as Lean does, so a commented-out namespace cannot redirect the audit", async () => {
  const t = decoy();
  const names = theorems(t).filter((x) => x.short === "typed").map((x) => x.name);
  assert.deepEqual(names, ["SoftwareCache.Separation0.typed", "SoftwareCache.typed"]);
  assert.ok(lint(t).some((p) => /theorem typed is not where the generator puts it/.test(p)), lint(t).join("\n"));
  const r = await check(t);
  assert.ok(!r.ok && r.mode === "grammar");
  // A theorem declared twice under one name is refused too (Lean would reject it as well).
  const twice = fs.readFileSync(fixturePath("SoftwareCache"), "utf8").replace("end SoftwareCache", "theorem typed : diagram.Typed :=\n  trivial\n\nend SoftwareCache");
  assert.ok(lint(twice).some((p) => /SoftwareCache\.typed is declared twice/.test(p)), lint(twice).join("\n"));
});

test("without local Lean, nothing is sent to AXLE unless --remote is given", () => {
  // No lake on PATH or under HOME, and a dead AXLE address, so a fallback could not reach AXLE.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "triz-no-lean-"));
  const env = { PATH: home, HOME: home, AXLE_API_URL: "http://127.0.0.1:9" };
  const script = path.resolve(here, "../scripts/certify.mjs");
  try {
    const cli = spawnSync(process.execPath, [script, "--tamper", fixturePath("SoftwareCache")], { env, encoding: "utf8" });
    assert.equal(cli.status, 2, cli.stdout + cli.stderr);
    assert.match(cli.stderr, /lake build.*--remote/s);
    assert.doesNotMatch(cli.stdout + cli.stderr, /Sending data|Checking locally|AXLE info|AXLE \d/);
    const conflicting = spawnSync(process.execPath, [script, "--local", "--remote", "--request", path.join(home, "missing.json"), fixturePath("SoftwareCache")], { env, encoding: "utf8" });
    assert.equal(conflicting.status, 2, conflicting.stdout + conflicting.stderr);
    assert.match(conflicting.stderr, /usage:.*--request/);
    assert.doesNotMatch(conflicting.stdout + conflicting.stderr, /Sending data|ENOENT/);
    // Request-bound checks inherit the same explicit opt-in; staleness checking never opts in.
    const request = { kind: "model", model: { domain: "software", carriers: [], boxes: [], wires: [] } } as const;
    const bound = modelCertificate({ ...request.model, carriers: [], boxes: [], wires: [] });
    assert.ok(bound.ok);
    // The library has no fallback either: without mode "remote", check, checkTampered, checkAll, and checkRequest throw rather than fetch.
    const probe = `globalThis.fetch = () => { throw new Error("fetch called"); };
      const m = await import(${JSON.stringify(pathToFileURL(script).href)});
      const src = (await import("node:fs")).readFileSync(${JSON.stringify(fixturePath("SoftwareCache"))}, "utf8");
      const bound = ${JSON.stringify(bound.content)}, request = ${JSON.stringify(request)};
      for (const mode of [undefined, "remote"]) {
        for (const run of [() => m.check(src, {mode}), () => m.checkTampered(m.tamperVariants(src)[0], {mode}), () => m.checkAll({ certificates: [src], tampered: m.tamperVariants(src) }, {mode}), () => m.checkRequest(bound, request, {mode})]) {
          try { await run(); console.log("checked"); } catch (e) { console.log(e.message === m.NO_LOCAL_LEAN ? "refused" : e.message); }
        }
      }`;
    const lib = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { env, encoding: "utf8" });
    assert.equal(lib.stdout, "refused\nrefused\nrefused\nrefused\nfetch called\nfetch called\nfetch called\nfetch called\n", lib.stdout + lib.stderr);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("namespaces that are Lean keywords are refused", () => {
  const empty: FunctionModel = { domain: "physical", carriers: [], boxes: [], wires: [] };
  for (const ns of RESERVED_NAMESPACES) {
    const refused = modelCertificate(empty, { namespace: ns });
    assert.deepEqual(!refused.ok && [refused.errors, refused.issues.map((i) => i.code)], [[`namespace '${ns}' is a Lean keyword`], ["invalid-namespace"]]);
    assert.ok(lint(content(modelCertificate(empty, { namespace: "Empty" })).replace(/\bEmpty\b/g, ns)).some((p) => /unexpected namespace/.test(p)), ns);
  }
  assert.ok(modelCertificate(empty, { namespace: "Empty" }).ok);
});

test("the checker's grammar rejects what Lean's messages and the axiom audit cannot show", async () => {
  const c = fs.readFileSync(fixturePath("BearingHeat"), "utf8");
  assert.deepEqual(lint(c), []);
  for (let seed = 1; seed <= 100; seed++) assert.deepEqual(lint(content(modelCertificate(genModel(rng(seed), { contradictions: true })))), [], `seed ${seed}`);
  assert.deepEqual(lint(content(separationCertificate(hostile))), []);
  assert.deepEqual(lint(content(separationCertificate(irreducible))), []);
  const open = "open CategoricalTriz\n";
  const contradiction = "theorem contradiction : ¬ ∃ v : Val, ∀ i, v ∈ values i :=";
  const tampers: Record<string, string> = {
    // With the kernel check off, `decide +kernel` admits a false verdict, and the axioms stay standard.
    "kernel check off": c.replace(open, `${open}set_option debug.skipKernelTC true\n`).replace(contradiction, "theorem contradiction : ∃ v : Val, ∀ i, v ∈ values i :="),
    "option inside a proof": c.replace(/decide \+kernel$/m, "set_option debug.skipKernelTC true in decide +kernel"),
    "hidden hypothesis": c.replace(open, `${open}variable (h : False)\ninclude h\n`),
    "redefined out": c.replace(/^ {2}out b p := .*$/m, "  out _ _ := none"),
    "restated verdict": c.replace(contradiction, "theorem contradiction : True :="),
    "unknown theorem": c.replace("end Separation0", "theorem bogus : True :=\n  trivial\n\nend Separation0"),
    "own axiom": c.replace("/-! ## Verdicts -/", "axiom cheat : False\n\n/-! ## Verdicts -/"),
    "command": c.replace("/-! ## Verdicts -/", "#exit\n\n/-! ## Verdicts -/"),
    "character literal": c.replace("/-! ## Verdicts -/", "def q : Char := '\"'\n\n/-! ## Verdicts -/"),
    "raw string": c.replace('def boxId : Box → String := !["motor"', 'def boxId : Box → String := ![r"motor\\"'),
    "unclosed comment": c.replace("/-! ## Verdicts -/", "/- open"),
  };
  for (const [name, t] of Object.entries(tampers)) {
    assert.notEqual(t, c, name);
    assert.ok(lint(t).length, `${name} passed the grammar`);
    const r = await check(t);
    assert.ok(!r.ok && r.mode === "grammar", name);
  }
});

test("the tamper variants are the verdicts negated and a carrier changed", () => {
  const c = fs.readFileSync(fixturePath("BearingHeat"), "utf8");
  const [negated, carrier] = tamperVariants(c);
  assert.equal(negated.mustFail.length, theorems(c).length);
  assert.match(negated.content, /^theorem typed : ¬ \(diagram\.Typed\) :=$/m);
  assert.deepEqual(carrier.mustFail, ["BearingHeat.typed"]);
  assert.match(carrier.content, /^ {2}carrier := !\[1, 1, 2, 3\]$/m);
});

test("a batch keeps each file's lines and names, and gives up on messages it cannot place", () => {
  const a = "import CategoricalTriz\n\nnamespace A\n\ntheorem t : True :=\n  trivial\n\nend A\n";
  const b = "import CategoricalTriz\n\nnamespace B\n\ntheorem u : True :=\n  trivial\n\nend B\n";
  const layout = batchFile([a, b]);
  const lines = layout.text.split("\n");
  assert.equal(lines[0], "import CategoricalTriz");
  // File k's line n is the batch's line start + n - 1; its import line opens its namespace.
  for (const [k, f] of [a, b].entries()) {
    const { prefix, start, last } = layout.jobs[k];
    assert.equal(lines[start - 1], `namespace ${prefix}`);
    f.split("\n").slice(1).forEach((l, n) => assert.equal(lines[start + n], l));
    assert.deepEqual(lines.slice(last, last + 2), [`#print "${prefix} read"`, `end ${prefix}`]);
  }
  const [ja, jb] = layout.jobs;
  const read = layout.jobs.map((j) => ({ severity: "info" as const, line: j.last + 1, text: `${j.prefix} read` }));
  const at = (j: typeof ja, n: number, text: string, severity: "error" | "info" = "error") => ({ severity, line: j.start + n - 1, text });
  assert.deepEqual(splitBatch(layout, [...read, at(jb, 5, `unknown constant '${jb.prefix}.B.v'`), at(ja, 5, `'${ja.prefix}.A.t' depends on axioms: [propext]`, "info")]),
    [[{ severity: "info", line: 5, text: "'A.t' depends on axioms: [propext]" }], [{ severity: "error", line: 5, text: "unknown constant 'B.v'" }]]);
  assert.deepEqual(splitBatch(layout, [read[0]]), [[], null], "no sentinel: B was not read to its end");
  assert.deepEqual(splitBatch(layout, [...read, at(ja, 1, "unexpected end")]), [null, []], "a message on A's namespace line");
  assert.deepEqual(splitBatch(layout, [...read, { severity: "error", line: jb.last + 2, text: "invalid 'end'" }]), [[], null], "a message on B's end line");
  assert.deepEqual(splitBatch(layout, [...read, { severity: "error", line: 0, text: "lean exited 139" }]), [null, null], "a message outside every file");
  assert.deepEqual(splitBatch(layout, [...read, { severity: "error", line: 1, text: "unknown module" }]), [null, null], "a message on the batch's import line");
  assert.deepEqual(splitBatch(layout, read, false), [null, null], "a run that was not clean");
});

test("every tampered copy of a fixture may share a batch, and nothing with a command or option may", () => {
  for (const ns of Object.keys(GENERATED)) {
    const c = fs.readFileSync(fixturePath(ns), "utf8");
    for (const v of tamperVariants(c)) assert.deepEqual(lint(v.content, { pinned: false }), [], `${ns} (${v.name})`);
  }
  const c = fs.readFileSync(fixturePath("SoftwareCache"), "utf8");
  const negated = tamperVariants(c)[0].content;
  assert.ok(lint(negated).length, "a negated verdict leaves the pinned grammar");
  for (const t of [
    negated.replace(/^(theorem typed : )/m, "$1(set_option debug.skipKernelTC true in True) ∧ "),
    negated.replace("open CategoricalTriz\n", "open CategoricalTriz\ninstance : Inhabited Nat := ⟨1⟩\n"),
    negated.replace(/decide \+kernel$/m, "attribute [simp] Nat.add_comm in decide +kernel"),
    negated.replace("end SoftwareCache", "end SoftwareCache\nnamespace Other"),
  ]) assert.ok(lint(t, { pinned: false }).length, t);
});

leanTest("Lean accepts every fixture, and every verdict in them", async () => {
  const fixtures = Object.entries(GENERATED);
  const { certificates } = await checkAll({ certificates: fixtures.map(([ns]) => fs.readFileSync(fixturePath(ns), "utf8")) }, { mode: "local" });
  for (const [k, [ns, generate]] of fixtures.entries()) {
    const r = certificates[k];
    assert.ok(r.ok, `${ns}: ${r.problems.join("\n")}`);
    const cert = generate(ns);
    assert.ok(cert.ok);
    for (const v of cert.certifies) assert.ok(r.certified.includes(v.theorem), v.theorem);
  }
});

leanTest("a tampered certificate fails to check where it was tampered", async () => {
  const variants = Object.keys(GENERATED).flatMap((ns) => tamperVariants(fs.readFileSync(fixturePath(ns), "utf8")).map((v) => ({ ...v, name: `${ns} (${v.name})` })));
  // A certificate that proves its verdict with `sorry`, or with an axiom of its own, is not accepted.
  const c = fs.readFileSync(fixturePath("SoftwareCache"), "utf8");
  const { certificates: [sorry, native], tampered } = await checkAll({
    certificates: [c.replace(/^( {2})by intro w hw.*$/m, "$1sorry"), c.replace(/decide \+kernel$/m, "native_decide")],
    tampered: variants,
  }, { mode: "local" });
  for (const [k, v] of variants.entries()) assert.ok(tampered[k].ok, `${v.name}: ${tampered[k].problems.join("\n")}`);
  assert.ok(!sorry.ok && sorry.problems.some((p) => /sorry/.test(p)), sorry.problems.join("\n"));
  assert.ok(!native.ok && native.problems.some((p) => /SoftwareCache\.typed: depends on non-standard axioms .*native_decide/.test(p)), native.problems.join("\n"));
  // Without the grammar, the axiom audit alone still finds the verdict behind the decoy.
  const t = decoy();
  const audit = accept(t, await runLocal(`${t}\n${theorems(t).map((x) => `#print axioms ${x.name}`).join("\n")}\n`));
  assert.ok(!audit.ok && audit.problems.some((p) => /^SoftwareCache\.typed: depends on non-standard axioms .*native_decide/.test(p)), audit.problems.join("\n"));
  assert.ok(audit.certified.includes("SoftwareCache.Separation0.typed"));
});

leanTest("a batch gives each file the messages Lean gives it alone", async () => {
  const c = fs.readFileSync(fixturePath("SoftwareCache"), "utf8");
  const d = fs.readFileSync(fixturePath("BearingDamped"), "utf8");
  // A certificate, a copy of it under the same names, and another certificate's data tamper.
  const jobs = [{ content: c, audit: true }, { content: tamperVariants(c)[0].content, audit: false }, { content: tamperVariants(d)[1].content, audit: false }];
  const batch = await runLocalBatch(jobs);
  assert.ok(batch.every((r) => r.batched), "every job shared the process");
  const sorted = (ms: typeof batch[number]["messages"]) => [...ms].sort((x, y) => x.line - y.line || x.text.localeCompare(y.text));
  for (const [k, j] of jobs.entries()) {
    const alone = await runLocal(j.audit ? withAxioms(j.content) : j.content);
    assert.deepEqual(sorted(batch[k].messages), sorted(alone.messages), `job ${k}`);
  }
});

leanTest("Lean accepts certificates of hostile generated models and every separation shape", async () => {
  const parts = [separationCertificate(irreducible, { namespace: "Multi" }), separationCertificate(hostile, { namespace: "Hostile" }),
    separationCertificate({ id: "flat", parameter: "p", demands: [{ id: "a", values: ["x"] }, { id: "b", values: ["y"] }] }, { namespace: "Flat" }),
    modelCertificate({ domain: "physical", carriers: [], boxes: [], wires: [] }, { namespace: "Empty" })];
  for (let seed = 1; seed <= 12; seed++) parts.push(modelCertificate(genModel(rng(seed), { contradictions: true }), { namespace: `Gen${seed}` }));
  const combined = ["import CategoricalTriz", ...parts.map((p) => content(p).split("\n").slice(1).join("\n"))].join("\n");
  const r = await check(combined, { mode: "local" });
  assert.ok(r.ok, r.problems.join("\n"));
  assert.equal(r.certified.length, theorems(combined).length);
});

test("an escalation certificate encodes the composed rows and the kernel's shortest trace", () => {
  const spec = { unsafe: HOT };
  const r = boundedDynamics(example("bearing-heat-dynamics"), spec);
  assert.ok(r.ok && r.decided && r.escalation?.verdict === "reachable");
  const c = dynamicsCertificate(example("bearing-heat-dynamics"), spec);
  assert.ok(c.ok);
  assert.deepEqual(c.certifies, [{ theorem: "TrizCertificate.escalation", verdict: `boundedDynamics: a run reaches the unsafe set at time ${r.escalation.time}` }]);
  assert.match(c.content, new RegExp(`^theorem escalation : ∃ a ∈ system\\.starts initial, ∃ b ∈ system\\.target unsafeState unsafeValue, reachWithin system\\.Step ${r.escalation.time} a b :=$`, "m"));
  assert.match(c.content, /^def boxId : Box → String := !\["motor", "shaft", "bearing"\]$/m, "the composed boxes, in model order");
  assert.match(c.content, /^def stateId : Machine → State → String := !\[!\["cold", "warm", "hot"\]\]$/m);
  assert.match(c.content, /^def unsafeState : Machine → State → Bool := !\[!\[false, false, true\]\]$/m);
  // One configuration per trace step: the shaft's state, then every port's value.
  const trace = /^def trace : Fin (\d+) → /m.exec(c.content)!;
  assert.equal(Number(trace[1]), r.escalation.trace.length);
  assert.match(c.content, /reach_of_trace/);
  assert.deepEqual(lint(c.content), []);
  // A port condition is a value table on that port; a state condition and a port condition intersect.
  const both = dynamicsCertificate(example("bearing-heat-dynamics"), { unsafe: [...HOT, { box: "bearing", port: "friction", values: ["high"] }] });
  assert.ok(both.ok);
  assert.match(both.content, /^def unsafeValue : Port → Value → Bool := .*!\[false, true\]\]$/m);
});

test("escalation certificates fail closed on what a trace cannot witness", () => {
  const m = example("bearing-heat-dynamics");
  const fails = (c: Certificate) => (c.ok ? "" : c.errors.join("; "));
  assert.match(fails(dynamicsCertificate(m, {})), /pass unsafe/);
  // At horizon 1 the bounded verdict is unreachable-within-horizon; the unbounded one, a trace to
  // time 2, is what a certificate states. Past the cap beyond the horizon only the bounded verdict
  // holds, and the independent state closure, which reaches hot, does not establish an invariant.
  assert.deepEqual(content(dynamicsCertificate(m, { unsafe: HOT, horizon: 1 })).match(/^theorem escalation : .*reachWithin system\.Step (\d+) a b :=$/m)?.[1], "2");
  assert.match(fails(dynamicsCertificate(m, { unsafe: HOT, horizon: 1, maxStates: 12 })), /only the bounded horizon verdict holds/);
  assert.ok(dynamicsCertificate(damped(), { unsafe: HOT }).ok);
  assert.ok(dynamicsCertificate(damped(), { unsafe: HOT, horizon: 1 }).ok, "the independent state closure can establish an all-horizons invariant beyond a bounded search");
  assert.match(fails(dynamicsCertificate(m, { unsafe: HOT, inputs: [[], [], []] })), /an input sequence indexes the runs by time/);
  // A run that blocks where the unsafe set's port conditions have no value leaves the verdict undecided.
  const stuckHot = example("bearing-heat-dynamics");
  stuckHot.boxes.find((b) => b.id === "shaft")!.transition = stuckHot.boxes.find((b) => b.id === "shaft")!.transition!.filter((r) => r.state !== "hot");
  assert.match(fails(dynamicsCertificate(stuckHot, { unsafe: [...HOT, { box: "bearing", port: "friction", values: ["high"] }] })), /the escalation is undecided/);
  // An invariant is decided over every valuation of the composed port classes: six more unwired
  // two-valued ports, six more classes, which the unsafe set only names, take it past the cap.
  const ambient = damped();
  ambient.carriers.push({ id: "bit", layer: "information", dimension: "bit", values: ["a", "b"] });
  const named = [0, 1, 2, 3, 4, 5].map((i) => {
    ambient.boxes.push({ id: `amb${i}`, name: "Ambient", role: "environment", outputs: [{ id: "o", carrier: "bit" }], behavior: [{ in: {}, out: { o: "a" } }, { in: {}, out: { o: "b" } }] });
    return { box: `amb${i}`, port: "o", values: ["a", "b"] };
  });
  const r = boundedDynamics(ambient, { unsafe: [...HOT, ...named] });
  assert.ok(r.ok && r.decided && r.escalation?.verdict === "unreachable");
  assert.match(fails(dynamicsCertificate(ambient, { unsafe: [...HOT, ...named] })), new RegExp(`deciding the invariant reads \\d+ table entries, past the certificate limit of ${MAX_CERT_ROWS}`));
  assert.ok(dynamicsCertificate(ambient, { unsafe: [...HOT, ...named.slice(0, 5)] }).ok, "five more ports stay within it");
  // A run that blocks in the unsafe state has no valuation there.
  const stuck = example("bearing-heat-dynamics");
  const shaft = stuck.boxes.find((b) => b.id === "shaft")!;
  shaft.transition = shaft.transition!.filter((r) => r.state !== "hot");
  assert.match(fails(dynamicsCertificate(stuck, { unsafe: HOT })), /the trace ends in a blocked state/);
  assert.match(fails(dynamicsCertificate(m, { unsafe: HOT }, { namespace: "end" })), /must be a capitalised alphanumeric Lean identifier/);
  // Past the cap on table reads: a box with many one-valued ports and many (repeated) rows. The
  // kernel merges repeated rows, so the search stays small; the certificate would encode them all.
  const wide = example("bearing-heat-dynamics");
  wide.carriers.push({ id: "unit", layer: "information", dimension: "unit", values: ["u"] });
  const outs = Array.from({ length: 300 }, (_, i) => `o${i}`);
  wide.boxes.push({ id: "bulk", name: "Bulk", role: "supersystem", outputs: outs.map((id) => ({ id, carrier: "unit" })), state: ["s"], initial: ["s"],
    transition: Array.from({ length: 1500 }, () => ({ state: "s", in: {}, next: "s", out: Object.fromEntries(outs.map((id) => [id, "u"])) })) });
  assert.match(fails(dynamicsCertificate(wide, { unsafe: HOT })), new RegExp(`past the certificate limit of ${MAX_CERT_ROWS}`));
});

test("a weakness certificate states strict, equal, and incomparable pairs", () => {
  const concepts = supportConcepts();
  const r = weaknessRanking(concepts, SUPPORT_ACCEPTABLE);
  assert.ok(r.ok && r.verdict === "ranked");
  const c = weaknessCertificate(concepts, SUPPORT_ACCEPTABLE);
  assert.ok(c.ok);
  // Opposed witnesses certify ball and bushing are incomparable; each is strictly weaker than tight.
  assert.deepEqual(r.pairs.map((p) => p.order), ["incomparable", "first-weaker", "first-weaker"]);
  assert.deepEqual(c.certifies.map((x) => x.theorem), ["TrizCertificate.incomparable_0_1", "TrizCertificate.weaker_0_2", "TrizCertificate.count_0_2", "TrizCertificate.weaker_1_2", "TrizCertificate.count_1_2"]);
  assert.match(c.certifies[1].verdict, /'ball' is strictly weaker than 'tight'/);
  assert.match(c.content, /^namespace Concept2$/m);
  assert.match(c.content, /^def conceptId : String := "tight"$/m);
  assert.match(c.content, /^theorem count_1_2 : \(admitted \(accepts acceptable\) \(Concept2\.rows\.relation inputDomain Concept2\.reads Concept2\.delivers\)\)\.card < /m);
  assert.deepEqual(lint(c.content), []);
  // Declared value order does not matter: every port of a carrier uses one sorted order, so a
  // function's two ends, and a deliverable across concepts, compare indices of one order.
  const reordered = supportConcepts().map((x) => {
    for (const k of x.model.carriers) if (k.values) k.values = [...k.values].reverse();
    return x;
  });
  assert.equal(tables(weaknessCertificate(reordered, SUPPORT_ACCEPTABLE)), tables(c));
  // Acceptability given per carrier, or as a threshold through the carrier's levels: the same table.
  const byCarrier = weaknessCertificate(concepts, [SUPPORT_ACCEPTABLE[0], { carrier: "radial-load", values: ["supported"] }]);
  assert.equal(tables(byCarrier), tables(c));
  const levelled = supportConcepts().map((x) => {
    x.model.carriers.find((k) => k.id === "radial-load")!.levels = [{ value: "unsupported", from: 0 }, { value: "supported", from: 2500 }];
    return x;
  });
  assert.equal(tables(weaknessCertificate(levelled, [SUPPORT_ACCEPTABLE[0], { carrier: "radial-load", at_least: 2500 }])), tables(c));
  // second-weaker pairs name the weaker concept first.
  const flipped = weaknessCertificate([concepts[2], concepts[0]], SUPPORT_ACCEPTABLE);
  assert.ok(flipped.ok);
  assert.deepEqual(flipped.certifies.map((x) => x.theorem), ["TrizCertificate.weaker_1_0", "TrizCertificate.count_1_0"]);

  const fails = (x: Certificate) => (x.ok ? "" : x.errors.join("; "));
  assert.ok(weaknessCertificate([concepts[0], concepts[1]], SUPPORT_ACCEPTABLE).ok);
  assert.ok(weaknessCertificate([concepts[0], { id: "again", model: concepts[0].model }], SUPPORT_ACCEPTABLE).ok);
  const unknown = structuredClone(concepts[1]);
  delete unknown.model.boxes.find((b) => b.id === "support")!.behavior;
  assert.match(fails(weaknessCertificate([concepts[0], unknown], SUPPORT_ACCEPTABLE)), /the ranking is undecided/);
  // Every valuation of every port is decided, so the work grows fast and is capped.
  const many = (n: number) => { const m = supportConcept("Wide", () => true); for (let i = 0; i < n; i++) { m.boxes.push({ id: `pad${i}`, name: "Pad", role: "mediator", outputs: [{ id: "o", carrier: "lube" }], behavior: [{ in: {}, out: { o: "oiled" } }] }); m.wires.push({ id: `w-pad${i}`, from: { box: `pad${i}`, port: "o" }, to: { box: "shaft", port: `p${i}` }, carrier: "lube", polarity: "useful" }); m.boxes.find((b) => b.id === "shaft")!.inputs!.push({ id: `p${i}`, carrier: "lube" }); } return m; };
  const acceptableWide = (n: number) => [...SUPPORT_ACCEPTABLE, ...Array.from({ length: n }, (_, i) => ({ box: "shaft", port: `p${i}`, values: ["oiled"] }))];
  const tightWide = (n: number) => { const m = many(n); m.boxes.find((b) => b.id === "support")!.behavior = m.boxes.find((b) => b.id === "support")!.behavior!.filter((row) => row.in.lube === "oiled"); return m; };
  assert.match(fails(weaknessCertificate([{ id: "a", model: many(8) }, { id: "b", model: tightWide(8) }], acceptableWide(8))), new RegExp(`past the certificate limit of ${MAX_CERT_ROWS}`));
});

test("triz_dynamics and triz_weakness return certificates, or the reason there is none", async () => {
  const dyn = await call("triz_dynamics", { model: example("bearing-heat-dynamics"), unsafe: HOT, certificate: true });
  assert.equal(dyn.escalation.verdict, "reachable");
  assert.equal(dyn.certificate.format, "lean");
  assert.equal(dyn.certificate.content, content(dynamicsCertificate(example("bearing-heat-dynamics"), { unsafe: HOT })));
  assert.deepEqual(dyn.certificate.certifies.map((x: { theorem: string }) => x.theorem), ["TrizCertificate.escalation"]);
  const later = await call("triz_dynamics", { model: example("bearing-heat-dynamics"), unsafe: HOT, horizon: 1, certificate: true });
  assert.equal(later.escalation.verdict, "unreachable-within-horizon");
  assert.equal(later.escalation.unbounded.verdict, "reachable");
  assert.deepEqual(later.certificate.certifies, [{ theorem: "TrizCertificate.escalation", verdict: "boundedDynamics: a run reaches the unsafe set at time 2" }]);
  const none = await call("triz_dynamics", { model: example("bearing-heat-dynamics"), unsafe: HOT, horizon: 1, max_states: 12, certificate: true });
  assert.equal(none.escalation.verdict, "unreachable-within-horizon");
  assert.equal(none.escalation.unbounded.reason, "cap-exceeded");
  assert.deepEqual(none.certificate.ok, false);
  assert.match(none.certificate.errors.join(), /only the bounded horizon verdict holds/);
  assert.equal((await call("triz_dynamics", { model: example("bearing-heat-dynamics"), unsafe: HOT })).certificate, undefined);

  const weak = await call("triz_weakness", { concepts: supportConcepts(), acceptable: SUPPORT_ACCEPTABLE, certificate: true });
  assert.equal(weak.verdict, "ranked");
  assert.equal(weak.certificate.content, content(weaknessCertificate(supportConcepts(), SUPPORT_ACCEPTABLE)));
  const incomparable = await call("triz_weakness", { concepts: supportConcepts().slice(0, 2), acceptable: SUPPORT_ACCEPTABLE, certificate: true });
  assert.equal(incomparable.certificate.format, "lean");
  assert.equal((await call("triz_weakness", { concepts: supportConcepts(), acceptable: SUPPORT_ACCEPTABLE })).certificate, undefined);
});

/** A dynamics model and two concepts whose ids try to escape their string literals. */
function hostileDynamics(): FunctionModel {
  const m = example("bearing-heat-dynamics");
  const rename = (from: string, to: string) => {
    for (const b of m.boxes) if (b.id === from) b.id = to;
    for (const w of m.wires) { if (w.from.box === from) w.from.box = to; if (w.to.box === from) w.to.box = to; }
  };
  rename("shaft", "s -/ #exit /- \"x\"");
  rename("bearing", "‮b\n");
  m.boxes.find((b) => b.transition)!.state = ["c\"", "w-/", "h😀"];
  for (const r of m.boxes.find((b) => b.transition)!.transition!) { r.state = { cold: "c\"", warm: "w-/", hot: "h😀" }[r.state]!; r.next = { cold: "c\"", warm: "w-/", hot: "h😀" }[r.next]!; }
  m.boxes.find((b) => b.transition)!.initial = ["c\""];
  return m;
}

test("ids stay inside string literals in escalation and weakness certificates", () => {
  const m = hostileDynamics();
  const c = dynamicsCertificate(m, { unsafe: [{ box: "s -/ #exit /- \"x\"", state: ["h😀"] }] });
  assert.ok(c.ok, JSON.stringify(c));
  assert.doesNotMatch(outsideStrings(c.content), /#exit|‮|😀/);
  assert.deepEqual(lint(c.content), []);
  const concepts = supportConcepts().map((x, i) => ({ ...x, id: i ? x.id : "b -/ #exit" }));
  const w = weaknessCertificate(concepts, SUPPORT_ACCEPTABLE);
  assert.ok(w.ok);
  assert.doesNotMatch(outsideStrings(w.content), /#exit/);
  assert.deepEqual(lint(w.content), []);
});

test("the checker's grammar pins the new verdicts and their namespaces", () => {
  const d = fs.readFileSync(fixturePath("BearingEscalation"), "utf8");
  const w = fs.readFileSync(fixturePath("SupportWeakness"), "utf8");
  assert.deepEqual([lint(d), lint(w)], [[], []]);
  const tampers: Record<string, string> = {
    "restated escalation": d.replace(/^theorem escalation : .* :=$/m, "theorem escalation : True :="),
    "another step relation": d.replace(/^def system : Sync .*$/m, "def system : Sync Box Row Port Machine Fn State Value := ⟨rowBox, rowFixes, rowValue, rowMachine, rowState, rowState, fnSource, fnTarget⟩"),
    "a weaker pair swapped": w.replace(/^theorem weaker_0_2 : AtLeastAsWeak \(accepts acceptable\) \(Concept0/m, "theorem weaker_0_2 : AtLeastAsWeak (accepts acceptable) (Concept1"),
    "a count without the domain": w.replace(/^(theorem count_0_2 : .*)inputDomain /m, "$1"),
    "a concept namespace too deep": w.replace("namespace Concept1\n", "namespace Concept1\n\nnamespace Inner\n").replace("end Concept1\n", "end Inner\n\nend Concept1\n"),
    "a verdict inside a concept": w.replace("end Concept2\n", "theorem weaker_0_2 : True :=\n  trivial\n\nend Concept2\n"),
  };
  for (const [name, t] of Object.entries(tampers)) {
    assert.ok(t !== d && t !== w, `${name}: the tamper changed nothing`);
    assert.ok(lint(t).length, `${name} passed the grammar`);
  }
});

leanTest("Lean accepts escalation and weakness certificates of hostile ids, asymmetric situations, and unsorted values", async () => {
  const magnetic = supportConcept("Magnetic bearing", () => true);
  // The magnetic concept also reads a one-valued mode its rival ignores: situations stay at declared values.
  magnetic.carriers.push({ id: "mode", layer: "information", dimension: "mode", values: ["on"] });
  const support = magnetic.boxes.find((b) => b.id === "support")!;
  support.inputs!.push({ id: "mode", carrier: "mode" });
  support.behavior = support.behavior!.map((row) => ({ in: { ...row.in, mode: "on" }, out: row.out }));
  const parts = [
    dynamicsCertificate(hostileDynamics(), { unsafe: [{ box: "s -/ #exit /- \"x\"", state: ["h😀"] }] }, { namespace: "HostileRun" }),
    dynamicsCertificate(example("bearing-heat-dynamics"), { unsafe: [{ box: "bearing", port: "friction", values: ["high"] }] }, { namespace: "PortRun" }),
    weaknessCertificate([{ id: "magnetic", model: magnetic }, supportConcepts()[0]], SUPPORT_ACCEPTABLE, { namespace: "Asymmetric" }),
    // Values declared out of sorted order, on a deliverable's carrier and on a function between two composed boxes.
    weaknessCertificate(supportConcepts().map((x) => {
      const m = x.model;
      m.carriers.find((k) => k.id === "radial-load")!.values = ["unsupported", "supported"];
      m.carriers.push({ id: "grip", layer: "energy", dimension: "grip", values: ["tight", "loose"] });
      const support = m.boxes.find((b) => b.id === "support")!;
      support.outputs = [{ id: "grip", carrier: "grip" }];
      support.behavior = support.behavior!.map((row) => ({ in: row.in, out: { grip: row.out.race === "supported" ? "tight" : "loose" } }));
      m.boxes.push({ id: "sleeve", name: "Sleeve", role: "mediator", inputs: [{ id: "grip", carrier: "grip" }], outputs: [{ id: "race", carrier: "radial-load" }],
        behavior: [{ in: { grip: "tight" }, out: { race: "supported" } }, { in: { grip: "loose" }, out: { race: "unsupported" } }] });
      m.wires = m.wires.map((w) => (w.id === "w-support" ? { ...w, from: { box: "sleeve", port: "race" } } : w));
      m.wires.push({ id: "w-grip", from: { box: "support", port: "grip" }, to: { box: "sleeve", port: "grip" }, carrier: "grip", polarity: "useful" });
      return x;
    }), SUPPORT_ACCEPTABLE, { namespace: "Unsorted" }),
  ];
  const combined = ["import CategoricalTriz", ...parts.map((p) => content(p).split("\n").slice(1).join("\n"))].join("\n");
  const r = await check(combined, { mode: "local" });
  assert.ok(r.ok, r.problems.join("\n"));
  assert.equal(r.certified.length, theorems(combined).length);
});

/** A source whose outputs copy two unwired inputs, x = a and y = b, delivered to a product. */
function copier(): FunctionModel {
  return {
    domain: "software",
    carriers: [{ id: "c", layer: "information", dimension: "bit", values: ["0", "1"] }],
    boxes: [
      { id: "src", name: "Source", role: "tool",
        inputs: [{ id: "a", carrier: "c" }, { id: "b", carrier: "c" }], outputs: [{ id: "x", carrier: "c" }, { id: "y", carrier: "c" }],
        behavior: ["0", "1"].flatMap((a) => ["0", "1"].map((b) => ({ in: { a, b }, out: { x: a, y: b } }))) },
      { id: "p", name: "P", role: "product", inputs: [{ id: "px", carrier: "c" }, { id: "py", carrier: "c" }] },
    ],
    wires: [
      { id: "wx", from: { box: "src", port: "x" }, to: { box: "p", port: "px" }, carrier: "c", polarity: "useful" },
      { id: "wy", from: { box: "src", port: "y" }, to: { box: "p", port: "py" }, carrier: "c", polarity: "useful" },
    ],
  };
}
/** The copier split into one part per input and output, and the boxMap back to it. */
function splitCopier() {
  const r = segment(copier(), { box: "src", parts: [{ id: "s1", ports: ["a", "x"] }, { id: "s2", ports: ["b", "y"] }] });
  assert.ok(r.ok);
  return { model: r.model, boxMap: r.boxMap! };
}
/** The copier reading a third input it ignores: an input only the concept reads. */
function widerCopier(): FunctionModel {
  const m = copier();
  const src = m.boxes[0];
  src.inputs!.push({ id: "e", carrier: "c" });
  src.behavior = src.behavior!.flatMap((row) => ["0", "1"].map((e) => ({ in: { ...row.in, e }, out: row.out })));
  return m;
}
/** The bearing with a fin interposed on its heat path: the fin's useful output is a deliverable only the concept has. */
function finned(): FunctionModel {
  const r = interpose(example("bearing-heat-behavior"), { wire: "w-heat", mediator: { id: "fin", name: "Fin", behavior: "identity" }, polarity: { out: "useful" } });
  assert.ok(r.ok);
  return r.model;
}
/** The bearing's shaft blocks when hot: its hot rows are gone. */
function stuck(): FunctionModel {
  const m = example("bearing-heat-dynamics");
  const shaft = m.boxes.find((b) => b.id === "shaft")!;
  shaft.transition = shaft.transition!.filter((r) => r.state !== "hot");
  return m;
}
/** Cold with high friction: cold expands nominally, so the bearing's friction is low there. */
const COLD_FRICTION = [{ box: "shaft", state: ["cold"] }, { box: "bearing", port: "friction", values: ["high"] }];

test("an unreachable certificate states a closed invariant and distinguishes state-only from admitted targets", () => {
  const r = boundedDynamics(damped(), { unsafe: HOT });
  assert.ok(r.ok && r.decided && r.escalation?.verdict === "unreachable");
  assert.deepEqual(r.escalation.basis, ["reachWithin_iff_trace", "reachWithin_saturated", "unreachable_of_invariant"]);
  const c = dynamicsCertificate(damped(), { unsafe: HOT });
  assert.ok(c.ok);
  assert.deepEqual(c.certifies, [{ theorem: "TrizCertificate.unreachable", verdict: "boundedDynamics: the state-only unsafe target is unreachable at every horizon" }]);
  assert.match(c.content, /^theorem unreachable : ∀ a ∈ system\.starts initial, ∀ n b, reachIn system\.Step n a b → ¬ \(∀ m, unsafeState m \(b\.1 m\) = true\) :=$/m);
  assert.match(c.content, /^def invariantStates : List \(Machine → State\) := \[!\[0\], !\[1\]\]$/m, "cold and warm, with every valuation included");
  assert.match(c.content, /unreachable_of_invariant invariantInitial invariantClosed invariantDisjoint/);
  assert.doesNotMatch(c.content, /^def trace /m);
  assert.deepEqual(lint(c.content), []);
  // An admitted port target uses the saturated reached-state table and Consistent target.
  const admitted = dynamicsCertificate(damped(), { unsafe: [...HOT, { box: "bearing", port: "friction", values: ["high"] }] });
  assert.ok(admitted.ok);
  // Both conjuncts: no admitted unsafe configuration is reached, and no run blocks in the unsafe set's state conditions.
  assert.match(admitted.content, /^theorem unreachable : \(∀ n, ∀ a ∈ system\.starts initial, ∀ b ∈ system\.target unsafeState unsafeValue, ¬ reachIn system\.Step n a b\) ∧ ∀ n, ∀ a ∈ system\.starts initial, ∀ b, reachIn system\.Step n a b → \(∃ v, system\.Consistent \(b\.1, v\)\) ∨ ¬ ∀ m, unsafeState m \(b\.1 m\) = true :=$/m);
  assert.match(admitted.content, /^ {2}system\.unreachable_of_holding_classes \(q := classes\) \(inv := invariant\)/m);
  assert.deepEqual(admitted.certifies, [{ theorem: "TrizCertificate.unreachable", verdict: "boundedDynamics: no run reaches an admitted unsafe configuration, and none blocks in the unsafe set's state conditions, at any horizon" }]);
  assert.match(admitted.content, /^def invariant : Fin 2 → Machine → State := !\[!\[0\], !\[1\]\]$/m);
  assert.deepEqual(lint(admitted.content), []);
  // PR39 also permits a safe-state query beside this unsafe port target; only escalation is certified.
  const combinedSpec = { unsafe: [...HOT, { box: "bearing", port: "friction", values: ["high"] }], safe: [{ box: "shaft", state: ["cold", "warm"] }] };
  const combined = dynamicsCertificate(damped(), combinedSpec);
  assert.ok(combined.ok);
  assert.deepEqual(combined.certifies, admitted.certifies);
  assert.equal(combined.content.replace(/^def certificateManifest :.*$/m, ""), admitted.content.replace(/^def certificateManifest :.*$/m, ""));
  assert.deepEqual(checkCorrespondence(combined.content, { kind: "dynamics", model: damped(), spec: combinedSpec }), []);

  // A blocked state is reached, so the invariant lists it: here the shaft blocks once hot.
  const blocked = boundedDynamics(stuck(), { unsafe: COLD_FRICTION });
  assert.ok(blocked.ok && blocked.decided && blocked.escalation?.verdict === "unreachable" && blocked.blocked.count > 0);
  assert.deepEqual(reachedStates(stuck(), { unsafe: COLD_FRICTION }), [["cold"], ["warm"], ["hot"]]);
  assert.match(content(dynamicsCertificate(stuck(), { unsafe: COLD_FRICTION })), /^def invariant : Fin 3 → Machine → State := !\[!\[0\], !\[1\], !\[2\]\]$/m);
  assert.equal(reachedStates(example("bearing-heat-dynamics"), { unsafe: HOT, inputs: [[], [], []] }), undefined, "an input sequence indexes the states by time");
  // Without a stateful box, the one global state has no machine: a port condition no steady state meets.
  const stateless = dynamicsCertificate(example("bearing-heat-behavior"), { unsafe: [{ box: "bearing", port: "friction", values: ["high"] }, { box: "bearing", port: "preload-in", values: ["nominal"] }] });
  assert.match(content(stateless), /^def invariant : Fin 1 → Machine → State := !\[!\[\]\]$/m);
});

test("port-target invariant reconstruction reports an extra exploration cap without a false internal error", () => {
  const model: FunctionModel = { domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }], boxes: [
    { id: "m", name: "Machine", role: "tool", state: ["a", "b", "c"], initial: ["a", "b"], outputs: [{ id: "o", carrier: "bit" }],
      transition: [{ state: "c", next: "c", in: {}, out: { o: "0" } }] },
  ], wires: [] };
  const spec = { unsafe: [{ box: "m", state: ["c"] }, { box: "m", port: "o", values: ["1"] }], maxStates: 2 };
  const result = boundedDynamics(model, spec);
  assert.ok(result.ok && result.decided && result.escalation?.verdict === "unreachable" && result.blocked.count === 2);
  const certificate = dynamicsCertificate(model, spec);
  assert.ok(!certificate.ok);
  assert.deepEqual(certificate.issues.map((i) => [i.code, i.path]), [["cap-exceeded", "$.max_states"]]);
  assert.match(certificate.errors.join(), /reconstructing the invariant exceeds/);
});

test("aligned behavior certificates bind box maps and scope for equal and changed row relations", () => {
  const baseline = copier(), split = splitCopier();
  const productBehavior = ["0", "1"].flatMap((px) => ["0", "1"].map((py) => ({ in: { px, py }, out: {} })));
  baseline.boxes.find((b) => b.id === "p")!.behavior = productBehavior;
  split.model.boxes.find((b) => b.id === "p")!.behavior = productBehavior;
  const options = { boxMap: split.boxMap, scope: "whole" as const };
  const request = { kind: "behavior" as const, baseline, concept: split.model, ...options };
  const preserved = content(behaviorCertificate(baseline, split.model, options));
  assert.deepEqual(checkCorrespondence(preserved, request), []);
  assert.match(checkCorrespondence(preserved, { ...request, boxMap: {} }).join(), /manifest source/);
  assert.match(checkCorrespondence(preserved, { ...request, scope: "upstream" }).join(), /manifest (source|scope)/);
  for (const row of split.model.boxes.find((b) => b.id === "s1")!.behavior!) row.out.x = row.out.x === "0" ? "1" : "0";
  const changed = content(behaviorCertificate(baseline, split.model, options));
  assert.match(changed, /^theorem behaviorChanged : ∃ u y, Baseline\.rows\.relation .* ∧ ¬ Concept\.rows\.relation .* :=$/m);
  assert.deepEqual(lint(changed), []);
  assert.deepEqual(checkCorrespondence(changed, request), []);
});

test("a behaviour certificate states a preserved verdict: equal relations, not empty", () => {
  const bearing = example("bearing-heat-behavior");
  const r = trimPreservesBehavior(bearing, BEARING_TRIM);
  assert.ok(r.ok && r.verdict === "preserved");
  const c = trimCertificate(bearing, BEARING_TRIM);
  assert.ok(c.ok);
  assert.deepEqual(c.certifies, [
    { theorem: "TrizCertificate.preserved", verdict: "compareBehavior: preserved, the input→deliverable relations are equal" },
    { theorem: "TrizCertificate.nonempty", verdict: "compareBehavior: the relations are not empty" },
  ]);
  assert.match(c.content, /^theorem preserved : Baseline\.rows\.relation inputDomain Baseline\.reads Baseline\.delivers = Concept\.rows\.relation inputDomain Concept\.reads Concept\.delivers :=$/m);
  assert.match(c.content, /^theorem nonempty : ∃ u y, Baseline\.rows\.relation inputDomain Baseline\.reads Baseline\.delivers u y :=$/m);
  const concept = c.content.slice(c.content.indexOf("namespace Concept\n"));
  assert.match(concept, /^def boxId : Box → String := !\["motor", "housing"\]$/m, "the trimmed model's composed boxes");
  assert.doesNotMatch(c.content, /^def acceptable /m);
  assert.deepEqual(lint(c.content), []);

  // box_map: the situations in the baseline's ids, each model's boxes and reads in its own.
  const split = splitCopier();
  const mapped = behaviorCertificate(copier(), split.model, { boxMap: split.boxMap });
  assert.ok(mapped.ok, JSON.stringify(mapped));
  assert.match(mapped.content, /^def inputId : Input → String := !\["src\.a", "src\.b"\]$/m);
  assert.match(mapped.content.slice(mapped.content.indexOf("namespace Concept\n")), /^def boxId : Box → String := !\["s1", "s2"\]$/m);
  assert.equal((mapped.content.match(/^def reads : Input → Option Port := !\[some \d+, some \d+\]$/gm) ?? []).length, 2, "both models read both inputs");
  assert.deepEqual(lint(mapped.content), []);
  // An input only the concept reads ranges over its values; the baseline does not read it.
  const wider = behaviorCertificate(copier(), widerCopier());
  assert.ok(wider.ok, JSON.stringify(wider));
  assert.match(wider.content, /^def inputId : Input → String := !\["src\.a", "src\.b", "src\.e"\]$/m);
  assert.match(wider.content, /^def reads : Input → Option Port := !\[some \d+, some \d+, none\]$/m);
  // Deliverables only the concept has stay out, and so do the boxes that only feed them.
  const r2 = compareBehavior(bearing, finned());
  assert.ok(r2.ok && r2.verdict === "preserved" && r2.gainedDeliverables.length === 1);
  const gained = behaviorCertificate(bearing, finned());
  assert.ok(gained.ok);
  assert.match(gained.content, /^def deliverableId : Deliverable → String := !\["shaft\.drive", "shaft\.support"\]$/m);

  const fails = (x: Certificate) => (x.ok ? "" : x.errors.join("; "));
  assert.ok(behaviorCertificate(copier(), split.model).ok, "a changed row relation has a member/nonmember certificate");
  const blank = example("bearing-heat-behavior");
  delete blank.boxes.find((b) => b.id === "housing")!.behavior;
  assert.match(fails(trimCertificate(blank, BEARING_TRIM)), /the verdict is undecided \(missing-behavior\)/);
  assert.match(fails(trimCertificate(bearing, { trim: ["ghost"] })), /ghost/);
  assert.match(fails(behaviorCertificate(bearing, bearing, { namespace: "end" })), /must be a capitalised alphanumeric Lean identifier/);
  // Every valuation of both models' ports is decided, so the work grows fast and is capped.
  const wide = copier();
  wide.carriers[0].values = ["0", "1", "2", "3"];
  wide.boxes[0].behavior = ["0", "1", "2", "3"].flatMap((a) => ["0", "1", "2", "3"].map((b) => ({ in: { a, b }, out: { x: a, y: b } })));
  assert.ok((() => { const x = compareBehavior(wide, wide); return x.ok && x.verdict === "preserved"; })());
  assert.match(fails(behaviorCertificate(wide, wide)), new RegExp(`deciding the equality reads \\d+ table entries, past the certificate limit of ${MAX_CERT_ROWS}`));
});

test("triz_dynamics and triz_behavior return unreachable and preserved certificates, or the reason there is none", async () => {
  const dyn = await call("triz_dynamics", { model: damped(), unsafe: HOT, certificate: true });
  assert.equal(dyn.escalation.verdict, "unreachable");
  assert.equal(dyn.certificate.content, content(dynamicsCertificate(damped(), { unsafe: HOT })));

  const bearing = example("bearing-heat-behavior");
  const trim = await call("triz_behavior", { model: bearing, trim: ["bearing"], certificate: true });
  assert.equal(trim.verdict, "preserved");
  assert.equal(trim.certificate.format, "lean");
  assert.equal(trim.certificate.content, content(trimCertificate(bearing, BEARING_TRIM)));
  assert.deepEqual(trim.certificate.certifies.map((x: { theorem: string }) => x.theorem), ["TrizCertificate.preserved", "TrizCertificate.nonempty"]);
  const split = splitCopier();
  const mapped = await call("triz_behavior", { model: split.model, compare_to: copier(), box_map: split.boxMap, certificate: true });
  assert.equal(mapped.certificate.content, content(behaviorCertificate(copier(), split.model, { boxMap: split.boxMap })));
  const changed = await call("triz_behavior", { model: split.model, compare_to: copier(), certificate: true });
  assert.equal(changed.verdict, "changed");
  assert.equal(changed.certificate.content, content(behaviorCertificate(copier(), split.model)));
  assert.deepEqual(changed.certificate.certifies.map((x: { theorem: string }) => x.theorem), ["TrizCertificate.behaviorChanged"]);
  assert.match((await call("triz_behavior", { model: bearing, certificate: true })).certificate.errors.join(), /needs a decided comparison or applied trim/);
  const hole = example("bearing-heat-behavior");
  delete hole.boxes.find((b) => b.id === "housing")!.behavior;
  const spec = await call("triz_behavior", { model: hole, trim: ["bearing"], weakest_spec: true, certificate: true });
  assert.equal(spec.ok, true);
  assert.match(spec.certificate.errors.join(), /residual certification is not implemented/);
  assert.equal((await call("triz_behavior", { model: bearing, trim: ["bearing"] })).certificate, undefined);
});

test("the tamper variants of an unreachable certificate fill the unsafe set instead of emptying it", () => {
  const d = content(dynamicsCertificate(damped(), { unsafe: [...HOT, { box: "bearing", port: "friction", values: ["high"] }] }, { namespace: "BearingDamped" }));
  assert.deepEqual(tamperVariants(d).map((v) => [v.name, v.mustFail]), [["every verdict negated", ["BearingDamped.unreachable"]], ["the unsafe set filled", ["BearingDamped.unreachable"]], ["every state blocked in the unsafe states", ["BearingDamped.unreachable"]], ["port classes merged", ["BearingDamped.unreachable"]]]);
  // Every row on the first box, so every other box has none, and the unsafe states filled; the port conditions stay.
  const blocked = tamperVariants(d)[2].content;
  assert.match(blocked, /^def rowBox : Row → Box := !\[0(?:, 0)*\]$/m);
  assert.match(blocked, /^def unsafeState : Machine → State → Bool := !\[!\[true, true, true\]\]$/m);
  assert.equal(blocked.match(/^def unsafeValue : .*$/m)![0], d.match(/^def unsafeValue : .*$/m)![0]);
  assert.match(tamperVariants(d)[1].content, /^def unsafeState : Machine → State → Bool := !\[!\[true, true, true\]\]$/m);
  const e = fs.readFileSync(fixturePath("BearingEscalation"), "utf8");
  assert.deepEqual(tamperVariants(e).map((v) => v.name), ["every verdict negated", "the unsafe set emptied"]);
  const t = fs.readFileSync(fixturePath("BearingTrim"), "utf8");
  assert.deepEqual(tamperVariants(t).map((v) => v.name), ["every verdict negated", "port classes merged"], "no input: no situation to disallow");
  assert.match(tamperVariants(t)[1].content, /^def portClass : Port → Class := !\[0(?:, 0)*\]$/m);
  const w = content(behaviorCertificate(copier(), splitCopier().model, { boxMap: splitCopier().boxMap, namespace: "Mapped" }));
  assert.deepEqual(tamperVariants(w).map((v) => [v.name, v.mustFail]), [["every verdict negated", ["Mapped.preserved", "Mapped.nonempty"]], ["no situation allowed", ["Mapped.nonempty"]], ["port classes merged", ["Mapped.preserved", "Mapped.nonempty"]]]);
});

test("the checker's grammar pins the unreachable and preserved verdicts", () => {
  const d = content(dynamicsCertificate(damped(), { unsafe: [...HOT, { box: "bearing", port: "friction", values: ["high"] }] }, { namespace: "BearingDamped" }));
  const t = fs.readFileSync(fixturePath("BearingTrim"), "utf8");
  assert.deepEqual([lint(d), lint(t)], [[], []]);
  const tampers: Record<string, string> = {
    "unreachable at one horizon": d.replace(/¬ reachIn system\.Step n a b\) ∧/m, "¬ reachIn system.Step 3 a b) ∧"),
    "unreachable without its blocked-state conjunct": d.replace(/^(theorem unreachable : )\((.*)\) ∧ .* :=$/m, "$1$2 :="),
    "an invariant of another type": d.replace(/^def invariant : Fin 2 → Machine → State/m, "def invariant : Fin 2 → Machine → Bool"),
    "preserved one way": t.replace(/^(theorem preserved : .*) = (Concept\.rows.*)$/m, "$1 ≤ $2"),
    "nonempty of the concept": t.replace(/^theorem nonempty : ∃ u y, Baseline\./m, "theorem nonempty : ∃ u y, Concept."),
    "a third model": t.replace("namespace Concept\n", "namespace Other\n").replace("end Concept\n", "end Other\n"),
    "a verdict inside a model": t.replace("end Concept\n", "theorem preserved : True :=\n  trivial\n\nend Concept\n"),
  };
  for (const [name, x] of Object.entries(tampers)) {
    assert.ok(x !== d && x !== t, `${name}: the tamper changed nothing`);
    assert.ok(lint(x).length, `${name} passed the grammar`);
  }
});

leanTest("Lean rejects an invariant that is not closed or meets the unsafe set, and a concept whose relation changed", async () => {
  const d = content(dynamicsCertificate(damped(), { unsafe: [...HOT, { box: "bearing", port: "friction", values: ["high"] }] }, { namespace: "BearingDamped" }));
  const t = fs.readFileSync(fixturePath("BearingTrim"), "utf8");
  const concept = t.indexOf("namespace Concept\n");
  const variants = [
    // Cold alone: a step from cold names warm, which it does not list.
    { name: "an invariant without warm", content: d.replace(/^def invariant : .*$/m, "def invariant : Fin 2 → Machine → State := ![![0], ![0]]"), mustFail: ["BearingDamped.unreachable"] },
    // Every state: closed, but hot is unsafe.
    { name: "an invariant with hot", content: d.replace(/^def invariant : .*$/m, "def invariant : Fin 3 → Machine → State := ![![0], ![1], ![2]]"), mustFail: ["BearingDamped.unreachable"] },
    // The housing's bore delivers unsupported: the trimmed shaft is no longer supported.
    { name: "a concept row changed", content: t.slice(0, concept) + t.slice(concept).replace(/^def rowValue : Row → Port → Value := .*$/m, "def rowValue : Row → Port → Value := ![![0, 0, 0, 0], ![0, 1, 0, 0]]"), mustFail: ["BearingTrim.preserved"] },
  ];
  for (const v of variants) assert.notEqual(v.content, v.name.startsWith("a concept") ? t : d, v.name);
  const { tampered } = await checkAll({ tampered: variants }, { mode: "local" });
  for (const [k, v] of variants.entries()) assert.ok(tampered[k].ok, `${v.name}: ${tampered[k].problems.join("\n")}`);
});

leanTest("Lean accepts unreachable and preserved certificates of blocked runs, stateless targets, box_map, gained deliverables, one-sided inputs, and hostile ids", async () => {
  const hostile = hostileDynamics();
  for (const r of hostile.boxes.find((b) => b.transition)!.transition!) if (r.state === "h😀" || (r.state === "w-/" && r.in["heat-in"] === "high")) r.next = "w-/";
  const split = splitCopier();
  const changed = splitCopier();
  for (const row of changed.model.boxes.find((b) => b.id === "s1")!.behavior!) row.out.x = row.out.x === "0" ? "1" : "0";
  const parts = [
    behaviorCertificate(copier(), changed.model, { boxMap: changed.boxMap, namespace: "ChangedMapped" }),
    dynamicsCertificate(stuck(), { unsafe: COLD_FRICTION }, { namespace: "Blocked" }),
    dynamicsCertificate(example("bearing-heat-behavior"), { unsafe: [{ box: "bearing", port: "friction", values: ["high"] }, { box: "bearing", port: "preload-in", values: ["nominal"] }] }, { namespace: "Stateless" }),
    dynamicsCertificate(hostile, { unsafe: [{ box: "s -/ #exit /- \"x\"", state: ["h😀"] }] }, { namespace: "HostileDamped" }),
    behaviorCertificate(copier(), split.model, { boxMap: split.boxMap, namespace: "Mapped" }),
    behaviorCertificate(copier(), widerCopier(), { namespace: "Wider" }),
    behaviorCertificate(example("bearing-heat-behavior"), finned(), { namespace: "Gained" }),
  ];
  const combined = ["import CategoricalTriz", ...parts.map((p) => content(p).split("\n").slice(1).join("\n"))].join("\n");
  assert.doesNotMatch(outsideStrings(combined), /#exit|😀/);
  // Each tamper variant fails where it must: negated verdicts, a filled unsafe set, no situation allowed.
  const variants = parts.flatMap((p) => tamperVariants(content(p)));
  const { certificates: [r], tampered } = await checkAll({ certificates: [combined], tampered: variants }, { mode: "local" });
  assert.ok(r.ok, r.problems.join("\n"));
  assert.equal(r.certified.length, theorems(combined).length);
  for (const [k, v] of variants.entries()) assert.ok(tampered[k].ok, `${v.name}: ${tampered[k].problems.join("\n")}`);
});

leanTest("the blocked-state conjunct rejects runs that block in the unsafe states, which the admitted target alone accepts", async () => {
  // The shaft blocks once hot, outside the unsafe set's state conditions (cold): the certificate checks.
  const d = content(dynamicsCertificate(stuck(), { unsafe: COLD_FRICTION }, { namespace: "Blocked" }));
  const v = tamperVariants(d).find((x) => x.name === "every state blocked in the unsafe states")!;
  assert.deepEqual(v.mustFail, ["Blocked.unreachable"]);
  // The same tampered tables with only the first conjunct: every state blocks, so the target is empty and it still holds.
  const firstOnly = v.content
    .replace(/^(theorem unreachable : )\((.*)\) ∧ .* :=$/m, "$1$2 :=")
    .replace(/^ {2}system\.unreachable_of_holding_classes .*$/m, "  unreachable_of_invariant (system.starts_subset_holding (inv := invariant) (by decide +kernel)) (system.closed_holding (inv := invariant) (by decide +kernel)) (system.disjoint_holding_target (inv := invariant) (by decide +kernel))");
  assert.notEqual(firstOnly, v.content);
  const [both, first] = await runLocalBatch([{ content: v.content, audit: false }, { content: firstOnly, audit: false }]);
  const errors = (r: typeof both) => r.messages.filter((m) => m.severity === "error");
  assert.ok(errors(both).length, "the blocked-state conjunct fails on the tampered tables");
  assert.deepEqual(errors(first), [], "without the conjunct, the tampered tables still check");
});

/** A bit through one box into a product, each output per input as `output` says (as in tests/act-cert-assurance.test.ts). */
function bitThrough(output: (x: string) => string = (x) => x): FunctionModel {
  return { domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }], boxes: [
    { id: "f", name: "Function", role: "tool", inputs: [{ id: "x", carrier: "bit" }], outputs: [{ id: "y", carrier: "bit" }], behavior: ["0", "1"].map((x) => ({ in: { x }, out: { y: output(x) } })) },
    { id: "p", name: "Product", role: "product", inputs: [{ id: "in", carrier: "bit" }], behavior: ["0", "1"].map((x) => ({ in: { in: x }, out: {} })) },
  ], wires: [{ id: "w", from: { box: "f", port: "y" }, to: { box: "p", port: "in" }, carrier: "bit", polarity: "useful" }] };
}
/** A machine that stays safe; later and bad are declared but unreachable. */
function safeMachine(): FunctionModel {
  return { domain: "software", carriers: [], boxes: [{ id: "m", name: "Machine", role: "tool", state: ["safe", "later", "bad"], initial: ["safe"], transition: [
    { state: "safe", next: "safe", in: {}, out: {} }, { state: "later", next: "bad", in: {}, out: {} }, { state: "bad", next: "bad", in: {}, out: {} },
  ] }], wires: [] };
}

leanTest("Lean accepts whole-scope behaviour, equal and incomparable weakness, and state-only safety certificates, and rejects their tampered copies", async () => {
  const bit = [{ carrier: "bit", values: ["1"] }];
  const a = bitThrough(), b = bitThrough((x) => (x === "0" ? "1" : "0"));
  const texts = [
    behaviorCertificate(a, a, { scope: "whole", namespace: "WholePreserved" }),
    behaviorCertificate(a, b, { scope: "whole" }),
    weaknessCertificate([{ id: "a", model: a }, { id: "b", model: a }], bit, { namespace: "EqualPair" }),
    weaknessCertificate([{ id: "a", model: a }, { id: "b", model: b }], bit, { namespace: "IncomparablePair" }),
    dynamicsCertificate(safeMachine(), { unsafe: [{ box: "m", state: ["bad"] }], safe: [{ box: "m", state: ["safe"] }] }, { namespace: "StateOnlySafe" }),
  ].map(content);
  const variants = texts.flatMap(tamperVariants);
  const { certificates, tampered } = await checkAll({ certificates: texts, tampered: variants }, { mode: "local" });
  for (const r of certificates) assert.ok(r.ok, r.problems.join("\n"));
  for (const [k, v] of variants.entries()) assert.ok(tampered[k].ok, `${v.name}: ${tampered[k].problems.join("\n")}`);
  // The changed comparison Lean accepted above is the one bound to its request.
  assert.deepEqual(bindRequest(texts[1], { kind: "behavior", baseline: a, concept: b, scope: "whole" }), []);
});

/** A source, `n` binary identity mediators in series, and a product: 2n + 2 ports joined by n + 1 functions. */
function mediatorChain(n: number): FunctionModel {
  const pass = [{ in: { i: "a" }, out: { o: "a" } }, { in: { i: "b" }, out: { o: "b" } }];
  const boxes: FunctionModel["boxes"] = [{ id: "src", name: "Source", role: "tool", outputs: [{ id: "o", carrier: "bit" }], behavior: [{ in: {}, out: { o: "a" } }, { in: {}, out: { o: "b" } }] }];
  const wires: FunctionModel["wires"] = [];
  for (let i = 1; i <= n + 1; i++) {
    const to = i <= n ? `m${i}` : "out";
    if (i <= n) boxes.push({ id: to, name: `Mediator ${i}`, role: "mediator", inputs: [{ id: "i", carrier: "bit" }], outputs: [{ id: "o", carrier: "bit" }], behavior: pass });
    wires.push({ id: `w${i}`, from: { box: i === 1 ? "src" : `m${i - 1}`, port: "o" }, to: { box: to, port: "i" }, carrier: "bit", polarity: "useful" });
  }
  boxes.push({ id: "out", name: "Output", role: "product", inputs: [{ id: "i", carrier: "bit" }] });
  return { domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["a", "b"] }], boxes, wires };
}

/** What a behaviour decision read before the port classes: values to the power of the situations, deliverables, and ports, per model. */
function portExponentWork(lean: string): number {
  const top = (name: string) => Number(new RegExp(`^abbrev ${name} := Fin (\\d+)$`, "m").exec(lean)![1]);
  const [values, inputs, deliverables] = ["Value", "Input", "Deliverable"].map(top);
  return ["Baseline", "Concept"].reduce((n, side) => {
    const block = lean.split(`namespace ${side}\n`)[1].split(`end ${side}\n`)[0];
    const [ports, rows, fns] = ["Port", "Row", "Fn"].map((name) => Number(new RegExp(`^abbrev ${name} := Fin (\\d+)$`, "m").exec(block)![1]));
    return n + values ** (inputs + deliverables + ports) * (rows * (ports + 1) + fns);
  }, 0);
}

test("row-table certificates decide over the port classes the functions join, so the work estimate falls", () => {
  const trim = trimCertificate(example("bearing-heat-behavior"), BEARING_TRIM);
  assert.ok(trim.ok);
  // Baseline: 8 ports in 4 classes; concept: 4 ports in 2. Before, the exponent counted ports.
  assert.equal(portExponentWork(trim.content), 68_608 + 768);
  assert.equal(trim.tableReads, 4_550);
  assert.match(trim.content, /^def portClass : Port → Class := !\[0, 0, 1, 2, 3, 3, 1, 2\]$/m);
  assert.match(trim.content, /^def portLink : Port → Option Fn := !\[none, some 0, none, none, none, some 3, some 1, some 2\]$/m);
  assert.match(trim.content, /relation_eq_classes Baseline\.classes \(by decide \+kernel\)/);
  // Eight binary mediators in series: 18 ports, 9 classes. Over the ports the decision read
  // 368,050,176 entries, past the cap; over the classes it is within it.
  const chain = behaviorCertificate(mediatorChain(8), mediatorChain(8));
  assert.ok(chain.ok, JSON.stringify(chain));
  assert.equal(portExponentWork(chain.content), 368_050_176);
  assert.ok(portExponentWork(chain.content) > MAX_CERT_ROWS);
  assert.ok(chain.tableReads! <= MAX_CERT_ROWS);
  assert.match(chain.content, /^abbrev Class := Fin 9$/m);
  assert.deepEqual(chain.certifies.map((c) => c.theorem), ["TrizCertificate.preserved", "TrizCertificate.nonempty"]);
  assert.deepEqual(lint(chain.content), []);
  // A trace certificate enumerates no valuation, so it carries no class witness.
  assert.doesNotMatch(content(dynamicsCertificate(example("bearing-heat-dynamics"), { unsafe: HOT })), /portClass|classes/);
  // The statements stay over raw ports: only the proofs and the witness tables change.
  for (const ns of ["BearingTrim", "SupportWeakness", "BearingDamped", "BearingBlocked"]) {
    const text = fs.readFileSync(fixturePath(ns), "utf8");
    assert.match(text, /^def classes : WireClasses Port Fn Class := /m, ns);
    assert.doesNotMatch(text.split("\n").filter((l) => l.startsWith("theorem ")).join("\n"), /classes|Class/, ns);
  }
});

leanTest("Lean accepts the mediator chain over its classes, and rejects a class map that joins ports no function joins", async () => {
  const chain = content(behaviorCertificate(mediatorChain(8), mediatorChain(8), { namespace: "MediatorChain" }));
  const trim = fs.readFileSync(fixturePath("BearingTrim"), "utf8");
  const verdicts = ["BearingTrim.preserved", "BearingTrim.nonempty"];
  // Baseline port 2 (shaft.support) moved into class 0, with motor.shaft-out: no function joins them.
  const joined = trim.replace("def portClass : Port → Class := ![0, 0, 1, 2, 3, 3, 1, 2]", "def portClass : Port → Class := ![0, 0, 0, 2, 3, 3, 1, 2]");
  // The forest's rank raised at a root, so one link no longer descends towards it.
  const cyclic = trim.replace("def portRank : Port → ℕ := ![0, 1, 0, 0, 0, 1, 1, 1]", "def portRank : Port → ℕ := ![2, 1, 0, 0, 0, 1, 1, 1]");
  assert.notEqual(joined, trim);
  assert.notEqual(cyclic, trim);
  const variants = [
    ...tamperVariants(chain),
    { name: "a class map joining two unwired ports", content: joined, mustFail: verdicts },
    { name: "a forest whose ranks do not descend", content: cyclic, mustFail: verdicts },
  ];
  const { certificates: [r], tampered } = await checkAll({ certificates: [chain], tampered: variants }, { mode: "local" });
  assert.ok(r.ok, r.problems.join("\n"));
  assert.deepEqual(r.certified, ["MediatorChain.preserved", "MediatorChain.nonempty"]);
  for (const [k, v] of variants.entries()) assert.ok(tampered[k].ok, `${v.name}: ${tampered[k].problems.join("\n")}`);
});

test("a horizon-free verdict is certified: a trace past the horizon, or an invariant that saturates past it", () => {
  // Reached first at step 25: the bounded verdict at the default horizon is unreachable-within-horizon.
  const late = dynamicsCertificate(clock(25), { unsafe: [{ box: "clock", state: ["s25"] }] });
  assert.deepEqual(late.ok && late.certifies, [{ theorem: "TrizCertificate.escalation", verdict: "boundedDynamics: a run reaches the unsafe set at time 25" }]);
  assert.match(content(late), /^def trace : Fin 26 → /m);
  // A port target that saturates after step 24: certified through unreachable_of_holding_classes.
  const spec = { unsafe: [{ box: "clock", port: "o", values: ["hi"] }] };
  const r = boundedDynamics(clock(24, { loop: true, port: true }), spec);
  assert.ok(r.ok && r.decided && r.escalation?.verdict === "unreachable-within-horizon");
  const never = dynamicsCertificate(clock(24, { loop: true, port: true }), spec);
  assert.deepEqual(never.ok && never.certifies.map((c) => c.theorem), ["TrizCertificate.unreachable"]);
  assert.match(content(never), /^def invariant : Fin 25 → Machine → State := /m);
  assert.match(content(never), /unreachable_of_holding_classes \(q := classes\)/);
  assert.deepEqual(lint(content(never)), []);
  // Under an input sequence there is no unbounded verdict, and no certificate, as before.
  assert.ok(!dynamicsCertificate(clock(25), { unsafe: [{ box: "clock", state: ["s25"] }], inputs: Array.from({ length: 21 }, () => []) }).ok);
});

leanTest("Lean accepts the horizon-free certificates, and rejects their tampered copies", async () => {
  // Past the default horizon of 20, but small enough to keep the Lean check short: step 21.
  const texts = [
    dynamicsCertificate(clock(21), { unsafe: [{ box: "clock", state: ["s21"] }] }, { namespace: "LateEscalation" }),
    dynamicsCertificate(clock(21, { loop: true, port: true }), { unsafe: [{ box: "clock", port: "o", values: ["hi"] }] }, { namespace: "NeverHigh" }),
    dynamicsCertificate(clock(21, { loop: true }), { unsafe: [{ box: "clock", state: ["bad"] }] }, { namespace: "NeverBad" }),
  ].map(content);
  const variants = texts.flatMap(tamperVariants);
  const { certificates, tampered } = await checkAll({ certificates: texts, tampered: variants }, { mode: "local" });
  for (const r of certificates) assert.ok(r.ok, r.problems.join("\n"));
  assert.deepEqual(certificates.map((r) => r.certified), [["LateEscalation.escalation"], ["NeverHigh.unreachable"], ["NeverBad.invariantInitial", "NeverBad.invariantClosed", "NeverBad.invariantDisjoint", "NeverBad.unreachable"]]);
  for (const [k, v] of variants.entries()) assert.ok(tampered[k].ok, `${v.name}: ${tampered[k].problems.join("\n")}`);
});

// Every Lean test, LEAN_JOBS at a time. theory/ is built once before them (ensureBuilt), so the
// tests only start `lake env lean` processes, and no two `lake build`s contend for Lake's lock.
describe("with local Lean", { concurrency: LEAN_JOBS }, () => {
  if (lean && (process.env.TRIZ_REQUIRE_LEAN || !process.env.TRIZ_SKIP_LEAN)) before(() => ensureBuilt());
  for (const [name, fn] of leanTests) {
    if (process.env.TRIZ_REQUIRE_LEAN) test(name, lean ? fn : () => assert.fail("TRIZ_REQUIRE_LEAN is set, but theory/ is not built"));
    else if (process.env.TRIZ_SKIP_LEAN) test(name, { skip: "TRIZ_SKIP_LEAN is set" }, fn);
    else test(name, { skip: !lean && "theory/ is not built" }, fn);
  }
});
