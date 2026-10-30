import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSubsystemContract, SubsystemContractRequest } from "../src/act-subsystem-contract.js";

function request(): SubsystemContractRequest {
  const c = { id: "bit", layer: "information" as const, dimension: "level", values: ["lo", "hi"], levels: [{ value: "lo", from: 0 }, { value: "hi", from: 1 }] };
  return { mode: "verify", box: "h", model: { domain: "software", carriers: [c], wires: [], boxes: [{ id: "h", name: "H", role: "tool", inputs: [{ id: "x", carrier: "bit" }], outputs: [{ id: "y", carrier: "bit" }], inner: {
    model: { domain: "software", carriers: [structuredClone(c)], wires: [], boxes: [{ id: "a", name: "A", role: "tool", inputs: [{ id: "i", carrier: "bit" }], outputs: [{ id: "o", carrier: "bit" }], behavior: [{ in: { i: "lo" }, out: { o: "lo" } }, { in: { i: "hi" }, out: { o: "hi" } }], feasibility: [{ requires: { i: 0 }, provides: { o: 1 }, cost: { usd: 2 } }] }] },
    inputs: [{ outer: "x", inner: { box: "a", port: "i" } }], outputs: [{ outer: "y", inner: { box: "a", port: "o" } }],
  } }] }, contract: { behavior: [{ in: { x: "lo" }, out: { y: "lo" } }, { in: { x: "hi" }, out: { y: "hi" } }], assumptions: [{ x: "lo" }, { x: "hi" }], resources: { inputs: { x: 0 }, outputs: { y: 0 }, budget: { usd: 2 } }, operating_envelope: "nominal", resource_binding: "all-behavior-rows" } };
}
const inner = (x: SubsystemContractRequest) => x.model.boxes[0].inner.model;

test("checks whole inner relation and same declared resource mode", () => {
  const r = checkSubsystemContract(request()); assert.ok(r.ok && r.status === "checked");
  assert.equal(r.behavior.classification, "exact"); assert.equal(r.behavior.inputEnabled, true);
  assert.equal(r.resources.status, "checked"); assert.equal(r.coupling, "declared-unverified");
  assert.deepEqual(r.resources.costs, { usd: 2 });
});
test("declared is never promoted, and caller cannot provide checked status", () => {
  const x = request(); x.mode = "declared"; const r = checkSubsystemContract(x); assert.ok(r.ok && r.status === "declared-unverified");
  assert.equal(checkSubsystemContract({ ...x, status: "checked" }).ok, false);
});
test("missing and extra behavior and blocked inputs cannot pass", () => {
  const x = request(); x.contract.behavior.pop(); const a = checkSubsystemContract(x); assert.ok(a.ok && a.status === "rejected"); assert.equal(a.behavior.classification, "underapproximation");
  const y = request(); y.contract.behavior.push({ in: { x: "lo" }, out: { y: "hi" } }); const b = checkSubsystemContract(y); assert.ok(b.ok && b.status === "rejected"); assert.equal(b.behavior.classification, "overapproximation");
  const z = request(); inner(z).boxes[0].behavior!.pop(); z.contract.behavior.pop(); const c = checkSubsystemContract(z); assert.ok(c.ok && c.status === "rejected"); assert.equal(c.behavior.inputEnabled, false);
});
test("resources fail on budgets, outputs and unverified coupling; missing levels and modes are undecided", () => {
  const x = request(); x.contract.resources.budget.usd = 1; const a = checkSubsystemContract(x); assert.ok(a.ok && a.status === "rejected"); assert.ok("resources" in a && "reason" in a.resources); assert.equal(a.resources.reason, "over-budget");
  const y = request(); y.contract.assumptions = [{ x: "hi" }]; y.contract.behavior = [y.contract.behavior[1]]; y.contract.resources.outputs.y = 2; const b = checkSubsystemContract(y); assert.ok(b.ok && b.status === "rejected"); assert.ok("resources" in b && "reason" in b.resources); assert.equal(b.resources.reason, "insufficient-output-level");
  const z = request(); delete z.contract.resource_binding; const c = checkSubsystemContract(z); assert.ok(c.ok && c.status === "undecided"); assert.ok("resources" in c && "reason" in c.resources); assert.equal(c.resources.reason, "missing-resource-binding");
  const q = request(); delete inner(q).carriers[0].levels; delete q.model.carriers[0].levels; const d = checkSubsystemContract(q); assert.ok(d.ok && d.status === "undecided"); assert.ok("resources" in d && "reason" in d.resources); assert.equal(d.resources.reason, "missing-carrier-levels");
  const p = request(); inner(p).boxes[0].feasibility!.push({ requires: { i: 1 }, provides: { o: 2 }, cost: { usd: 1 } }); const e = checkSubsystemContract(p); assert.ok(e.ok && e.status === "undecided"); assert.ok("resources" in e && "reason" in e.resources); assert.equal(e.resources.reason, "multiple-resource-modes");
});
test("whole-model disconnected behavior constraints are composed and caps fail closed", () => {
  const x = request(); inner(x).boxes.push({ id: "hidden", name: "hidden", role: "tool", outputs: [{ id: "u", carrier: "bit" }], inputs: [{ id: "v", carrier: "bit" }], behavior: [{ in: { v: "lo" }, out: { u: "hi" } }], feasibility: [{ provides: { u: 1 } }] });
  inner(x).wires.push({ id: "loop", from: { box: "hidden", port: "u" }, to: { box: "hidden", port: "v" }, carrier: "bit", polarity: "useful" });
  const r = checkSubsystemContract(x); assert.ok(r.ok && r.status === "rejected"); assert.equal(r.behavior.inputEnabled, false);
  const y = request(); y.max_states = 1; const c = checkSubsystemContract(y); assert.ok(c.ok && c.status === "undecided");
});
test("invalid source and incomplete resource interfaces fail with input paths", () => {
  const x = request(); inner(x).wires.push({ id: "bad", from: { box: "missing", port: "o" }, to: { box: "a", port: "i" }, carrier: "bit", polarity: "useful" });
  const r = checkSubsystemContract(x); assert.equal(r.ok, false);
  const y = request(); y.contract.resources.inputs = {}; const b = checkSubsystemContract(y); assert.equal(b.ok, false); if (!b.ok) assert.ok(b.issues.some(i => i.path === "$.contract.resources.inputs"));
});


test("nondeterministic outputs are all required and input assumptions must be nonempty", () => {
  const x = request(); inner(x).boxes[0].behavior!.push({ in: { i: "lo" }, out: { o: "hi" } });
  const r = checkSubsystemContract(x); assert.ok(r.ok && r.status === "rejected"); assert.equal(r.behavior.classification, "underapproximation");
  x.contract.behavior.push({ in: { x: "lo" }, out: { y: "hi" } }); const complete = checkSubsystemContract(x); assert.ok(complete.ok && complete.status === "checked");
  x.contract.assumptions = []; assert.equal(checkSubsystemContract(x).ok, false);
});
test("rejects contradictory amount bands and prototype keys before schema parsing", () => {
  const x = request(); x.contract.resources.inputs.x = 1;
  const a = checkSubsystemContract(x); assert.ok(a.ok && a.status === "rejected"); assert.ok("resources" in a && "reason" in a.resources); assert.equal(a.resources.reason, "inconsistent-level-assumptions");
  const y = request(); Object.defineProperty(y.contract.resources.budget, "__proto__", { value: 10, enumerable: true });
  const b = checkSubsystemContract(y); assert.equal(b.ok, false); if (!b.ok) assert.match(b.issues[0].path, /__proto__/);
});

test("extensive internal fan-out cannot exceed the upper band of the source behavior", () => {
  const c = { id: "fluid", layer: "material" as const, dimension: "kg", quantity: "extensive" as const,
    values: ["low", "high", "excess"], levels: [{value:"low",from:0}, {value:"high",from:10}, {value:"excess",from:20}] };
  const port = (id: string) => ({ id, carrier: "fluid" });
  const consumers = ["a", "b", "c"].map(id => ({ id, name:id, role:"mediator" as const, inputs:[port("i")],
    behavior:[{in:{i:"high"},out:{}}], feasibility:[{requires:{i:7}}] }));
  const model: SubsystemContractRequest["model"] = {domain:"physical",carriers:[c],wires:[],boxes:[{id:"h",name:"H",role:"tool",outputs:[port("y")],inner:{
    model:{domain:"physical",carriers:[structuredClone(c)],boxes:[{id:"s",name:"Source",role:"tool",outputs:[port("o"),port("p")],
      behavior:[{in:{},out:{o:"high",p:"high"}}],feasibility:[{provides:{o:30,p:10}}]},...consumers],
      wires:consumers.map(b => ({id:`w-${b.id}`,from:{box:"s",port:"o"},to:{box:b.id,port:"i"},carrier:"fluid",polarity:"useful" as const}))},
    inputs:[],outputs:[{outer:"y",inner:{box:"s",port:"p"}}],
  }}]};
  const x: SubsystemContractRequest = {model,box:"h",mode:"verify",contract:{assumptions:[{}],behavior:[{in:{},out:{y:"high"}}],
    resources:{inputs:{},outputs:{y:1},budget:{}},operating_envelope:"nominal",resource_binding:"all-behavior-rows"}};
  const r = checkSubsystemContract(x); assert.ok(r.ok); if (r.ok) assert.notEqual(r.status, "checked");
  assert.ok(r.ok && r.status === "undecided" && "resources" in r && "reason" in r.resources);
  assert.equal(r.resources.reason, "demand-behavior-incompatible");
  const nested = inner(x);
  // The qualitative high on every consumer entails 10 units each, even when its numeric
  // mode asks for 7. Equality to the upper band remains impossible; just below is allowed.
  x.model.carriers[0].levels![2].from = 30; nested.carriers[0].levels[2].from = 30;
  const atUpper = checkSubsystemContract(x); assert.ok(atUpper.ok && atUpper.status === "undecided");
  x.model.carriers[0].levels![2].from = 31; nested.carriers[0].levels[2].from = 31;
  const belowUpper = checkSubsystemContract(x); assert.ok(belowUpper.ok && belowUpper.status === "checked");
});

test("inner budget is an independent local constraint and incomplete limits remain undecided", () => {
  const x = request(); inner(x).boxes[0].cost = { usd: 2 }; x.contract.resources.budget.usd = 5; inner(x).budget = { usd: 0 };
  const r = checkSubsystemContract(x); assert.ok(r.ok && r.status === "rejected");
  assert.ok("resources" in r && "reason" in r.resources); assert.equal(r.resources.reason, "over-inner-budget");
  inner(x).budget = {}; const incomplete = checkSubsystemContract(x); assert.ok(incomplete.ok && incomplete.status === "undecided");
  assert.ok("resources" in incomplete && "reason" in incomplete.resources); assert.equal(incomplete.resources.reason, "unbudgeted-inner-resource");
  inner(x).budget = { usd: 4 }; const fits = checkSubsystemContract(x); assert.ok(fits.ok && fits.status === "checked");
});


test("contract schema rejects prototype keys before record parsing, including every record location", () => {
  const positions: Array<(x: SubsystemContractRequest) => object> = [
    x => x.contract.assumptions[0], x => x.contract.behavior[0].in, x => x.contract.behavior[0].out,
    x => x.contract.resources.inputs, x => x.contract.resources.outputs, x => x.contract.resources.budget,
  ];
  for (const pick of positions) {
    const x = request(); Object.defineProperty(pick(x), "__proto__", { value: "bad", enumerable: true });
    const result = SubsystemContractRequest.safeParse(x); assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some(i => i.path.includes("__proto__")));
    assert.equal(checkSubsystemContract(x).ok, false);
  }
  const allowed = request(); Object.defineProperty(allowed.contract.resources.budget, "constructor", { value: 0, enumerable: true });
  assert.equal(SubsystemContractRequest.safeParse(allowed).success, true);
  const result = checkSubsystemContract(allowed); assert.ok(result.ok && result.status === "checked");
});
