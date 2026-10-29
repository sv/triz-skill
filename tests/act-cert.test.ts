/**
 * Lean certificates (src/act-cert.ts): the checked-in fixtures in theory/Certificates equal the
 * generator's output, each certificate states exactly the kernel's verdicts, ids stay inside
 * string literals, and generation fails closed. Where Lean is built locally (theory/.lake), the
 * certificates are also checked: the fixtures and hostile generated models are accepted, and a
 * tampered certificate (verdicts negated, or a carrier changed) fails where it must. Without
 * Lean those tests skip; TRIZ_REQUIRE_LEAN=1 makes them fail instead. Nothing here calls AXLE.
 * Regenerate the fixtures with UPDATE_GOLDEN=1 pnpm test, then review the diff.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel, harmLoops, separationCheck, type PhysicalContradiction } from "../src/act.js";
import { modelCertificate, separationCertificate, leanString, MAX_CERT_WORK, type Certificate } from "../src/act-cert.js";
import { toolSpecs } from "../src/tools.js";
import { check, checkTampered, localLeanAvailable, tamperVariants, theorems } from "../scripts/certify.mjs";
import { rng, genModel } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const FIXTURES = { BearingHeat: "bearing-heat", SoftwareCache: "software-cache" } as const;
const fixturePath = (ns: string) => path.resolve(here, `../theory/Certificates/${ns}.lean`);
const content = (c: Certificate) => { assert.ok(c.ok, JSON.stringify(c)); return c.content; };
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
  for (const [ns, name] of Object.entries(FIXTURES)) {
    const actual = content(modelCertificate(example(name), { namespace: ns }));
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(fixturePath(ns), actual);
    assert.equal(actual, fs.readFileSync(fixturePath(ns), "utf8"), `${ns}.lean drifted; rerun with UPDATE_GOLDEN=1 and review`);
  }
  const root = fs.readFileSync(path.resolve(here, "../theory/Certificates.lean"), "utf8");
  for (const ns of Object.keys(FIXTURES)) assert.match(root, new RegExp(`^import Certificates\\.${ns}$`, "m"));
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
  assert.deepEqual(modelCertificate(example("bearing-heat"), { namespace: "end x" }), { ok: false, errors: ["namespace 'end x' must be a capitalised alphanumeric Lean identifier"] });
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

test("the tamper variants are the verdicts negated and a carrier changed", () => {
  const c = fs.readFileSync(fixturePath("BearingHeat"), "utf8");
  const [negated, carrier] = tamperVariants(c);
  assert.equal(negated.mustFail.length, theorems(c).length);
  assert.match(negated.content, /^theorem typed : ¬ \(diagram\.Typed\) :=$/m);
  assert.deepEqual(carrier.mustFail, ["BearingHeat.typed"]);
  assert.match(carrier.content, /^ {2}carrier := !\[1, 1, 2, 3\]$/m);
});

leanTest("Lean accepts both fixtures, and every verdict in them", async () => {
  for (const [ns, name] of Object.entries(FIXTURES)) {
    const c = fs.readFileSync(fixturePath(ns), "utf8");
    const r = await check(c, { mode: "local" });
    assert.ok(r.ok, r.problems.join("\n"));
    const cert = modelCertificate(example(name), { namespace: ns });
    assert.ok(cert.ok);
    for (const v of cert.certifies) assert.ok(r.certified.includes(v.theorem), v.theorem);
  }
});

leanTest("a tampered certificate fails to check where it was tampered", async () => {
  for (const ns of Object.keys(FIXTURES)) {
    for (const v of tamperVariants(fs.readFileSync(fixturePath(ns), "utf8"))) {
      const r = await checkTampered(v, { mode: "local" });
      assert.ok(r.ok, `${ns} (${v.name}): ${r.problems.join("\n")}`);
    }
  }
  // A certificate that proves its verdict with `sorry`, or with an axiom of its own, is not accepted.
  const c = fs.readFileSync(fixturePath("SoftwareCache"), "utf8");
  const sorry = await check(c.replace(/^( {2})by intro w hw.*$/m, "$1sorry"), { mode: "local" });
  assert.ok(!sorry.ok && sorry.problems.some((p) => /sorry/.test(p)), sorry.problems.join("\n"));
  const axiom = await check(c.replace("/-! ## Verdicts -/", "axiom cheat : False\n\n/-! ## Verdicts -/").replace(/^( {2})by intro w hw.*$/m, "$1cheat.elim"), { mode: "local" });
  assert.ok(!axiom.ok && axiom.problems.some((p) => /non-standard axioms SoftwareCache\.cheat/.test(p)), axiom.problems.join("\n"));
});

leanTest("Lean accepts certificates of hostile generated models and every separation shape", async () => {
  const parts = [separationCertificate(irreducible, { namespace: "Multi" }), separationCertificate(hostile, { namespace: "Hostile" }),
    separationCertificate({ id: "flat", parameter: "p", demands: [{ id: "a", values: ["x"] }, { id: "b", values: ["y"] }] }, { namespace: "Flat" })];
  for (let seed = 1; seed <= 12; seed++) parts.push(modelCertificate(genModel(rng(seed), { contradictions: true }), { namespace: `Gen${seed}` }));
  const combined = ["import CategoricalTriz", ...parts.map((p) => content(p).split("\n").slice(1).join("\n"))].join("\n");
  const r = await check(combined, { mode: "local" });
  assert.ok(r.ok, r.problems.join("\n"));
  assert.equal(r.certified.length, theorems(combined).length);
});
