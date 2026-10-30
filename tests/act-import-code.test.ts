import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftTable } from "../src/act-import.js";
import { importQuint, importLean, importJulia } from "../src/act-import-code.js";
import { BuildModelRequest, buildModel } from "../src/act-builder.js";
import { checkModel } from "../src/act.js";

const q = `module Protocol {
  // var counterfeit: int
  var count: int
  const limit: int
  val ready: bool = count < limit
  action advance = {
    count' = count + 1
  }
}
`;
const lean = `namespace Example
/- def fake := count -/
def count : Nat := 1
def next : Nat := count + 1
theorem safe : next = next := by
  rfl
end Example
`;
const jl = `function helper2(x)
    x * 2
end
function helper(x)
    helper2(x)
end
function build_model(config)
    @variables begin
        reservoir(t)
        output(t)
    end
    @parameters begin
        gain = config.gain
    end
    flow = helper(
        gain * reservoir)
    if config.enabled
        flow *= config.factor
    end
    eqs = [
        D(reservoir) ~ -flow,
        D(output) ~ flow,
    ]
    @named system = ODESystem(eqs, t, [reservoir, output], [gain])
end
`;
const source = (text:string) => ({id:"fixture",text});
const edge = (r: Extract<ReturnType<typeof importJulia>,{ok:true}>, a:string, b:string) => {
  const names = new Map(r.draft.components.map(c => [c.id,c.name]));
  return r.draft.interactions.some(i => names.get(i.subject) === a && names.get(i.object) === b);
};

test("Quint outlines module declarations and syntactic references with review provenance", () => {
  const r = importQuint(source(q)); assert.ok(r.ok);
  assert.deepEqual(r.draft.components.map(c=>c.name), ["count","limit","ready","advance"]);
  assert.ok(edge(r,"ready","count") && edge(r,"ready","limit") && edge(r,"advance","count"));
  assert.ok(r.draft.interactions.every(i=>i.action === "references" && i.carrier.dimension === "unverified symbolic reference"));
  assert.ok(r.draft.draft.pending.some(p=>p.kind === "role")); assert.equal(r.draft.draft.pending.filter(p=>p.kind === "polarity").length,r.draft.interactions.length);
  assert.equal(DraftTable.safeParse(r.draft).success,true);
  const built = buildModel(BuildModelRequest.parse(r.draft)); assert.ok(built.ok);
  assert.equal(checkModel(built.model).ok,false, "draft cannot be used as a verified model");
});

test("Lean outlines definitions and theorems within namespaces without claiming proof validity", () => {
  const r = importLean(source(lean)); assert.ok(r.ok);
  assert.deepEqual(r.draft.components.map(c=>c.name),["count","next","safe"]);
  assert.ok(edge(r,"next","count") && edge(r,"safe","next"));
  assert.equal(r.draft.components[0].source.line,3);
  assert.ok(r.diagnostics.some(d=>d.code === "partial-source"));
});

test("Julia follows symbolic auxiliary chains and flags conditional mode and opaque helper", () => {
  const r = importJulia(source(jl)); assert.ok(r.ok);
  assert.ok(edge(r,"output","flow") && edge(r,"flow","reservoir") && edge(r,"flow","gain") && edge(r,"flow","helper") && edge(r,"helper","helper2"));
  const names = new Map(r.draft.components.map(c => [c.id,c.name]));
  const outEdge = r.draft.interactions.find(i => names.get(i.subject) === "output" && names.get(i.object) === "flow")!;
  assert.equal(outEdge.source.line, jl.split("\n").findIndex(s => s.includes("D(output)")) + 1);
  assert.ok(r.diagnostics.some(d=>d.code === "conditional-code"));
  assert.ok(r.diagnostics.some(d=>d.code === "reassignment"));
  assert.ok(r.diagnostics.some(d=>d.code === "opaque-helper"));
  assert.equal(DraftTable.safeParse(r.draft).success,true);
  const built = buildModel(BuildModelRequest.parse(r.draft)); assert.ok(built.ok);
});

test("comment, block, string and nested scope lookalikes are not declarations", () => {
  const quint = importQuint(source(`module M {\n/* var hidden: int */\n val actual = "var fake: int"\n action act = {\n  val local = 1\n }\n}\n`));
  assert.ok(quint.ok); assert.deepEqual(quint.draft.components.map(c=>c.name),["actual","act"]);
  const l = importLean(source(`namespace N\n/- def fake := 0 /- def alsoFake := 1 -/ -/\ndef actual := "theorem fake := by"\nend N`));
  assert.ok(l.ok); assert.deepEqual(l.draft.components.map(c=>c.name),["actual"]);
  const j = importJulia(source(`#= @variables begin\nfake(t)\nend =#\n${jl}`)); assert.ok(j.ok); assert.ok(!j.draft.components.some(c=>c.name === "fake"));
  const command = importJulia(source("cmd = `echo\n@variables begin\nlie(t)\nend\n`\n" + jl)); assert.ok(command.ok); assert.ok(!command.draft.components.some(c=>c.name === "lie"));
});

test("ambiguous and shadowed names fail closed, identities are stable under layout changes", () => {
  const shadow = importQuint(source(`module M {\n var value: int\n def f(value: int): int = value\n}\n`)); assert.ok(shadow.ok); assert.ok(!edge(shadow,"f","value"));
  const dup = importQuint(source(`module M {\n var x: int\n var x: bool\n val y = x\n}\n`)); assert.ok(dup.ok); assert.ok(dup.diagnostics.some(d=>d.code === "ambiguous-declaration")); assert.ok(!edge(dup,"y","x"));
  const a = importQuint(source(q)), b = importQuint(source(q.replace("// var counterfeit: int","// edited display comment"))); assert.ok(a.ok && b.ok);
  assert.deepEqual(a.draft.components.map(c=>c.id),b.draft.components.map(c=>c.id));
});

test("unsupported agents, absent declarations and caps fail safely", () => {
  const agent = importJulia(source("@agent struct Node(GridAgent{2})\n state::Int\nend")); assert.equal(agent.ok,false); if (!agent.ok) assert.match(agent.errors.join(" "), /Agents.jl/);
  const withAgent = importJulia(source(`@agent struct Node(GridAgent{2})\n state::Int\nend\n${jl}`)); assert.ok(withAgent.ok); assert.ok(withAgent.diagnostics.some(d=>d.code === "unsupported-agent-model"));
  assert.equal(importQuint(source("// var x: int")).ok,false);
  assert.equal(importLean(source("x".repeat(1_000_001))).ok,false);
  const many = `module M {\n${Array.from({length:2001},(_,i)=>`var x${i}: int`).join("\n")}\n}`;
  assert.equal(importQuint(source(many)).ok,false);
});

test("a Quint next-state write x' references the state variable x", () => {
  const r = importQuint(source(`module M {\n var count: int\n action reset = {\n  count' = 0\n }\n}\n`)); assert.ok(r.ok);
  assert.ok(edge(r,"reset","count"));
  assert.equal(r.draft.interactions[0].source.line,4);
  // Lean's prime is part of a name: foo' and foo are different declarations.
  const l = importLean(source(`def foo : Nat := 1\ndef foo' : Nat := 2\ndef use : Nat := foo'\n`)); assert.ok(l.ok);
  assert.deepEqual(l.draft.components.map(c=>c.name),["foo","foo'","use"]);
  assert.ok(edge(l,"use","foo'") && !edge(l,"use","foo"));
});

test("multi-line headers, binder groups and lambda or match binders shadow globals", () => {
  const q = importQuint(source(`module M {\n var x: int\n var f: int\n var y: int\n def g(\n  x: int\n ): int = x + 1\n def apply(f: int => int, x: int): int = f(x) + y\n pure def h(s: Set[int]): Set[int] = s.map(v => v + y)\n val w = Set(1).map(x => x)\n}\n`)); assert.ok(q.ok);
  assert.ok(!edge(q,"g","x") && !edge(q,"apply","x") && !edge(q,"apply","f") && !edge(q,"w","x"));
  assert.ok(edge(q,"apply","y") && edge(q,"h","y"), "genuine references remain");
  const l = importLean(source(`def x : Nat := 1\ndef y : Nat := 2\ndef f (x y : Nat) : Nat := x + y\ndef g : Nat → Nat\n  | x => x\ndef k : Nat → Nat := fun y => y + x\n`)); assert.ok(l.ok);
  assert.ok(!edge(l,"f","x") && !edge(l,"f","y") && !edge(l,"g","x") && !edge(l,"k","y"));
  assert.ok(edge(l,"k","x"), "a global used beside a binder is still referenced");
});

test("Lean mutual blocks keep their namespace and dotted names are whole declarations", () => {
  const r = importLean(source(`namespace A\nmutual\ndef f : Nat := g\ndef g : Nat := 1\nend\ndef h : Nat := f\nend A\n`)); assert.ok(r.ok);
  assert.ok(edge(r,"f","g") && edge(r,"h","f"));
  const dotted = importLean(source(`def Foo.bar : Nat := 1\ndef Foo.baz : Nat := 2\n`)); assert.ok(dotted.ok);
  assert.deepEqual(dotted.draft.components.map(c=>c.name),["Foo.bar","Foo.baz"]);
  assert.ok(!dotted.diagnostics.some(d=>d.code === "ambiguous-declaration"));
});
