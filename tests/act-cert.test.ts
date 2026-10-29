/**
 * Lean certificates (src/act-cert.ts): the checked-in fixtures in theory/Certificates equal the
 * generator's output, each certificate states exactly the kernel's verdicts, ids stay inside
 * string literals, and generation fails closed. Where Lean is built locally (theory/.lake), the
 * certificates are also checked: the fixtures and hostile generated models are accepted, and a
 * tampered certificate (verdicts negated, a carrier changed, the unsafe set emptied, nothing
 * acceptable) fails where it must. Escalation and weakness certificates encode the declared
 * rows, never the kernel's results, and state only what a witness or an exhaustive decision
 * supports. Without
 * Lean those tests skip; TRIZ_REQUIRE_LEAN=1 makes them fail instead. Nothing here calls AXLE,
 * and without local Lean the checker refuses rather than falling back to it.
 * Regenerate the fixtures with UPDATE_GOLDEN=1 pnpm test, then review the diff.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FunctionModel, checkModel, harmLoops, separationCheck, type PhysicalContradiction } from "../src/act.js";
import { dynamicsCertificate, modelCertificate, separationCertificate, weaknessCertificate, leanString, MAX_CERT_ROWS, MAX_CERT_WORK, RESERVED_NAMESPACES, type Certificate } from "../src/act-cert.js";
import { boundedDynamics } from "../src/act-dynamics.js";
import { weaknessRanking } from "../src/act-behavior.js";
import { supportConcept, supportConcepts, SUPPORT_ACCEPTABLE } from "./support/concepts.js";
import { toolSpecs } from "../src/tools.js";
// triz_separate looks up principle texts for its suggestions: install the fs-backed data provider.
import "../src/data.js";
import { accept, check, checkTampered, lint, localLeanAvailable, runLocal, tamperVariants, theorems } from "../scripts/certify.mjs";
import { rng, genModel } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const FIXTURES = { BearingHeat: "bearing-heat", SoftwareCache: "software-cache" } as const;
const HOT = [{ box: "shaft", state: ["hot"] }];
/** Every checked-in certificate, by namespace, and how to generate it again. */
const GENERATED: Record<string, (ns: string) => Certificate> = {
  ...Object.fromEntries(Object.entries(FIXTURES).map(([ns, name]) => [ns, (n: string) => modelCertificate(example(name), { namespace: n })])),
  BearingEscalation: (n) => dynamicsCertificate(example("bearing-heat-dynamics"), { unsafe: HOT }, { namespace: n }),
  SupportWeakness: (n) => weaknessCertificate(supportConcepts(), SUPPORT_ACCEPTABLE, { namespace: n }),
};
const fixturePath = (ns: string) => path.resolve(here, `../theory/Certificates/${ns}.lean`);
const content = (c: Certificate) => { assert.ok(c.ok, JSON.stringify(c)); return c.content; };
const tables = (c: Certificate) => content(c).replace(/^def certificateManifest : String := .*\n/m, "");
const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (name: string, args: unknown) => JSON.parse((await specs[name].handler(args)).content[0].text);

const lean = localLeanAvailable();
const leanTest = (name: string, fn: () => Promise<void>) =>
  lean ? test(name, fn)
  : process.env.TRIZ_REQUIRE_LEAN ? test(name, () => assert.fail("TRIZ_REQUIRE_LEAN is set, but theory/ is not built"))
  : test.skip(name, fn);

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
    // The library has no fallback either: without mode "remote", all checks throw rather than fetch.
    const probe = `globalThis.fetch = () => { throw new Error("fetch called"); };
      const m = await import(${JSON.stringify(pathToFileURL(script).href)});
      const src = (await import("node:fs")).readFileSync(${JSON.stringify(fixturePath("SoftwareCache"))}, "utf8");
      const bound = ${JSON.stringify(bound.content)}, request = ${JSON.stringify(request)};
      for (const mode of [undefined, "remote"]) {
        for (const run of [() => m.check(src, {mode}), () => m.checkTampered(m.tamperVariants(src)[0], {mode}), () => m.checkRequest(bound, request, {mode})]) {
          try { await run(); console.log("checked"); } catch (e) { console.log(e.message === m.NO_LOCAL_LEAN ? "refused" : e.message); }
        }
      }`;
    const lib = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { env, encoding: "utf8" });
    assert.equal(lib.stdout, "refused\nrefused\nrefused\nfetch called\nfetch called\nfetch called\n", lib.stdout + lib.stderr);
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

leanTest("Lean accepts every fixture, and every verdict in them", async () => {
  for (const [ns, generate] of Object.entries(GENERATED)) {
    const c = fs.readFileSync(fixturePath(ns), "utf8");
    const r = await check(c, { mode: "local" });
    assert.ok(r.ok, r.problems.join("\n"));
    const cert = generate(ns);
    assert.ok(cert.ok);
    for (const v of cert.certifies) assert.ok(r.certified.includes(v.theorem), v.theorem);
  }
});

leanTest("a tampered certificate fails to check where it was tampered", async () => {
  for (const ns of Object.keys(GENERATED)) {
    for (const v of tamperVariants(fs.readFileSync(fixturePath(ns), "utf8"))) {
      const r = await checkTampered(v, { mode: "local" });
      assert.ok(r.ok, `${ns} (${v.name}): ${r.problems.join("\n")}`);
    }
  }
  // A certificate that proves its verdict with `sorry`, or with an axiom of its own, is not accepted.
  const c = fs.readFileSync(fixturePath("SoftwareCache"), "utf8");
  const sorry = await check(c.replace(/^( {2})by intro w hw.*$/m, "$1sorry"), { mode: "local" });
  assert.ok(!sorry.ok && sorry.problems.some((p) => /sorry/.test(p)), sorry.problems.join("\n"));
  const native = await check(c.replace(/decide \+kernel$/m, "native_decide"), { mode: "local" });
  assert.ok(!native.ok && native.problems.some((p) => /SoftwareCache\.typed: depends on non-standard axioms .*native_decide/.test(p)), native.problems.join("\n"));
  // Without the grammar, the axiom audit alone still finds the verdict behind the decoy.
  const t = decoy();
  const audit = accept(t, runLocal(`${t}\n${theorems(t).map((x) => `#print axioms ${x.name}`).join("\n")}\n`));
  assert.ok(!audit.ok && audit.problems.some((p) => /^SoftwareCache\.typed: depends on non-standard axioms .*native_decide/.test(p)), audit.problems.join("\n"));
  assert.ok(audit.certified.includes("SoftwareCache.Separation0.typed"));
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
  assert.match(fails(dynamicsCertificate(m, { unsafe: HOT, horizon: 1 })), /only the bounded horizon verdict holds/);
  const damped = example("bearing-heat-dynamics");
  for (const r of damped.boxes.find((b) => b.id === "shaft")!.transition!) if (r.state === "hot" || (r.state === "warm" && r.in["heat-in"] === "high")) r.next = "warm";
  assert.ok(dynamicsCertificate(damped, { unsafe: HOT }).ok);
  assert.match(fails(dynamicsCertificate(m, { unsafe: HOT, inputs: [[], [], []] })), /an input sequence indexes the runs by time/);
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
  const none = await call("triz_dynamics", { model: example("bearing-heat-dynamics"), unsafe: HOT, horizon: 1, certificate: true });
  assert.equal(none.escalation.verdict, "unreachable-within-horizon");
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
