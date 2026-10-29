import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import type { FunctionModel } from "../src/act.js";
import { behaviorCertificate, canonicalRequest, CERTIFICATE_SCHEMA_SOURCE, CERTIFICATE_THEORY_SOURCE, dynamicsCertificate, modelCertificate, requestDigest, weaknessCertificate, type Certificate } from "../src/act-cert.js";
import { bindRequest, checkCorrespondence, checkRequest, lint } from "../scripts/certify.mjs";

const acceptable = [{ carrier: "bit", values: ["1"] }];
const content = (c: Certificate) => { assert.ok(c.ok, JSON.stringify(c)); return c.content; };
function model(output: (x: string) => string = (x) => x): FunctionModel {
  return { domain: "software", carriers: [{ id: "bit", layer: "information", dimension: "bit", values: ["0", "1"] }], boxes: [
    { id: "f", name: "Function", role: "tool", inputs: [{ id: "x", carrier: "bit" }], outputs: [{ id: "y", carrier: "bit" }], behavior: ["0","1"].map((x) => ({ in: { x }, out: { y: output(x) } })) },
    { id: "p", name: "Product", role: "product", inputs: [{ id: "in", carrier: "bit" }], behavior: ["0","1"].map((x) => ({ in: { in: x }, out: {} })) },
  ], wires: [{ id: "w", from: { box: "f", port: "y" }, to: { box: "p", port: "in" }, carrier: "bit", polarity: "useful" }] };
}
function dynamics(next = "safe"): FunctionModel {
  return { domain: "software", carriers: [], boxes: [{ id: "m", name: "Machine", role: "tool", state: ["safe","later","bad"], initial: ["safe"], transition: [
    { state: "safe", next, in: {}, out: {} }, { state: "later", next: "bad", in: {}, out: {} }, { state: "bad", next: "bad", in: {}, out: {} },
  ] }], wires: [] };
}

test("canonical source binding hashes the entire authoritative request with standard SHA-256", () => {
  for (const value of [{ b: "\u{1f600}", a: ["x", 2] }, { kind: "model", model: model() }]) assert.equal(requestDigest(value), createHash("sha256").update(canonicalRequest(value)).digest("hex"));
  const m = model(), request = { kind: "model" as const, model: m }, c = modelCertificate(m); assert.ok(c.ok);
  assert.deepEqual(checkCorrespondence(c.content, request), []);
  const other = structuredClone(m); other.boxes[0].name = "Different authoritative declaration";
  assert.match(checkCorrespondence(c.content, { kind: "model", model: other }).join(";"), /manifest source/);
  assert.equal(c.manifest.schema, "function-model-v1"); assert.equal(c.manifest.lean, "4.32.2");
  assert.equal(CERTIFICATE_SCHEMA_SOURCE,createHash("sha256").update(fs.readFileSync(new URL("../src/act.ts",import.meta.url))).digest("hex"));
  assert.equal(CERTIFICATE_THEORY_SOURCE,createHash("sha256").update(fs.readFileSync(new URL("../theory/CategoricalTriz.lean",import.meta.url))).digest("hex"));
});

test("request binding checks normalized row data independently of generator regeneration", () => {
  const m = model(), concepts = [{ id: "a", model: m }, { id: "b", model: model(() => "1") }], request = { kind: "weakness" as const, concepts, acceptable, scope: "whole" as const };
  const c = content(weaknessCertificate(concepts, acceptable, { scope: "whole" }));
  assert.deepEqual(checkCorrespondence(c, request), []);
  const tampered = c.replace(/^(def rowValue : Row → Port → Value := )!\[!\[0,/m, "$1![![1,");
  assert.notEqual(tampered, c); assert.match(checkCorrespondence(tampered, request).join(";"), /rowValue/);
  assert.match(checkCorrespondence(c, { ...request, scope: "upstream" }).join(";"), /manifest (source|scope)/);
  const prior=[{input:[{box:"f",port:"x",value:"0"}],weight:1},{input:[{box:"f",port:"x",value:"1"}],weight:1}];
  const weighted=weaknessCertificate(concepts,acceptable,{scope:"whole",jointPrior:prior}); assert.ok(weighted.ok);
  assert.deepEqual(checkCorrespondence(weighted.content,{...request,jointPrior:prior}),[]);
  assert.match(checkCorrespondence(weighted.content,request).join(";"),/manifest source/);
  const hidden=c.replace(/^def rowValue : (.*)$/m,"/- def rowValue : $1 -/");
  assert.match(checkCorrespondence(hidden,request).join(";"),/rowValue/);
});

test("all weakness pairs have certificate verdicts, including equal and incomparable", () => {
  const a = model(), b = model((x) => x === "0" ? "1" : "0");
  const incomparable = weaknessCertificate([{ id: "copy", model: a }, { id: "negate", model: b }], acceptable);
  assert.ok(incomparable.ok); assert.match(incomparable.content, /theorem firstOnly_0_1 : .* ∈ admits .* ∉ admits/);
  assert.match(incomparable.content, /incomparable_of_witnesses firstOnly_0_1\.1/);
  assert.deepEqual(lint(incomparable.content), []);
  const equal = weaknessCertificate([{ id: "a", model: a }, { id: "b", model: a }], acceptable); assert.ok(equal.ok);
  assert.deepEqual(equal.certifies.map((x) => x.theorem), ["TrizCertificate.equal_0_1"]); assert.deepEqual(lint(equal.content), []);
});

test("changed behavior certificates require a member and nonmember at the same pair", () => {
  const same = content(behaviorCertificate(model(), model(), { scope: "whole" }));
  assert.match(same, /^theorem preserved : .* = .* :=$/m); assert.deepEqual(lint(same), []);
  const changed = content(behaviorCertificate(model(), model(() => "1"), { scope: "whole" }));
  assert.match(changed, /^theorem behaviorChanged : ∃ u y, .* u y ∧ ¬ .* u y :=$/m); assert.deepEqual(lint(changed), []);
});

test("negative dynamics derives a genuinely closed invariant and reports bounded-only limitations", () => {
  const spec = { unsafe: [{ box: "m", state: ["bad"] }], safe: [{ box: "m", state: ["safe"] }] };
  const c = dynamicsCertificate(dynamics(), spec); assert.ok(c.ok);
  assert.match(c.content, /^theorem invariantInitial : system.starts initial ⊆ invariant/m);
  assert.match(c.content, /^theorem invariantClosed : Closed system.Step invariant/m);
  assert.deepEqual(c.certifies.map((x) => x.theorem), ["TrizCertificate.unreachable", "TrizCertificate.safetyInvariant"]);
  assert.deepEqual(lint(c.content), []);
  assert.deepEqual(checkCorrespondence(c.content, { kind: "dynamics", model: dynamics(), spec }), []);
  const bounded = dynamicsCertificate(dynamics("later"), { horizon: 0, unsafe: spec.unsafe }); assert.ok(!bounded.ok);
  assert.match(bounded.errors.join(";"), /only the bounded horizon verdict holds/);
  const sequence = dynamicsCertificate(dynamics(), { unsafe: spec.unsafe, inputs: [[]], horizon: 0 }); assert.ok(!sequence.ok);
  assert.match(sequence.errors.join(";"), /input sequence/);
});

test("request binding regenerates the certificate and refuses a stale one before any Lean check", async () => {
  const a = model(), b = model((x) => x === "0" ? "1" : "0");
  const request = { kind: "behavior" as const, baseline: a, concept: b, scope: "whole" as const };
  const fresh = content(behaviorCertificate(a, b, { scope: "whole" }));
  assert.deepEqual(bindRequest(fresh, request), []);
  const stale = fresh.replace("A pair belongs", "The pair belongs");
  assert.notEqual(stale, fresh);
  assert.match(bindRequest(stale, request).join(";"), /stale/);
  // An unbound file never reaches Lean, so this needs no local theory.
  const refused = await checkRequest(stale, request, { mode: "local" });
  assert.deepEqual([refused.ok, refused.mode], [false, "binding"]);
});

// The Lean-backed checks of these certificates are in tests/act-cert.test.ts, which runs every
// Lean test of the suite in one file, one Lean process per test.
