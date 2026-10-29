/**
 * Double-pushout rules: rule validation, injective matching under the step and match caps, the
 * no-identification and no-dangling conditions, the pushout itself, and each evolution-line rule
 * on an example model. The property test checks the claim of `typed_dpo` on generated models:
 * every applicable match gives a model that type-checks, and every other match fails on a named
 * gluing condition before the result is built.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel, checkModel, harmLoops, idealityProfile } from "../src/act.js";
import { Rule, TREND_RULES, applyRule, checkMatch, matchRule, validateRule, type RuleMatch } from "../src/act-rule.js";
import { toolSpecs } from "../src/tools.js";
import { rng, int, genModel } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const errors = (r: { ok: boolean; errors?: string[] }) => (r.ok ? "" : r.errors!.join("; "));
const trend = (id: string) => TREND_RULES.find((r) => r.id === id)!;
const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const call = async (args: unknown) => JSON.parse((await specs.triz_rule_apply.handler(args)).content[0].text);
function only<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  assert.ok(r.ok, errors(r as { ok: boolean; errors?: string[] }));
  return r as Extract<T, { ok: true }>;
}

/** Tool A performs a function on product P; X is idle. */
const small = (): FunctionModel => ({
  domain: "physical",
  carriers: [{ id: "c", layer: "energy", dimension: "W" }],
  boxes: [
    { id: "A", name: "A", role: "tool", outputs: [{ id: "p", carrier: "c" }], cost: { usd: 10 } },
    { id: "P", name: "P", role: "product", inputs: [{ id: "q", carrier: "c" }] },
    { id: "X", name: "X", role: "tool", outputs: [{ id: "r", carrier: "c" }] },
  ],
  wires: [{ id: "w", from: { box: "A", port: "p" }, to: { box: "P", port: "q" }, carrier: "c", polarity: "useful" }],
});

const fn = {
  boxes: [{ id: "old", outputs: [{ id: "out", carrier: "c" }] }, { id: "object", inputs: [{ id: "in", carrier: "c" }] }],
  wires: [{ id: "f", from: { box: "old", port: "out" }, to: { box: "object", port: "in" }, carrier: "c" }],
};
/** Delete a function's performer and the function; a new tool performs it instead. */
const replace: Rule = Rule.parse({
  id: "replace",
  carriers: ["c"],
  left: fn,
  interface: { boxes: [fn.boxes[1]] },
  right: {
    boxes: [fn.boxes[1], { id: "new", role: "tool", name: "Replacement", outputs: [{ id: "out", carrier: "c" }] }],
    wires: [{ id: "g", from: { box: "new", port: "out" }, to: { box: "object", port: "in" }, carrier: "c", polarity: "useful" }],
  },
});
/** Delete a function and the two ports it uses; keep both boxes. */
const unplug: Rule = Rule.parse({
  id: "unplug",
  carriers: ["c"],
  left: fn,
  interface: { boxes: [{ id: "old" }, { id: "object" }] },
  right: { boxes: [{ id: "old" }, { id: "object" }] },
});

test("built-in rules are valid and quote their line of evolution-trends.md verbatim", () => {
  assert.deepEqual(TREND_RULES.map((r) => r.id), ["mono-bi", "feedback", "working-field"]);
  for (const r of TREND_RULES) {
    assert.ok(validateRule(r).ok, `${r.id}: ${validateRule(r).errors.join("; ")}`);
    const lines = fs.readFileSync(path.resolve(here, "..", r.source!.file), "utf8").split("\n");
    assert.ok(lines[r.source!.line - 1].includes(r.source!.quote), `${r.id}: line ${r.source!.line} does not contain '${r.source!.quote}'`);
  }
});

test("the evolution-line table quotes every line of evolution-trends.md, and quotes it exactly", () => {
  const trends = fs.readFileSync(path.resolve(here, "../skills/triz-innovation/references/evolution-trends.md"), "utf8");
  const doc = fs.readFileSync(path.resolve(here, "../skills/triz-innovation/references/categorical-model.md"), "utf8");
  const section = doc.slice(doc.indexOf("## Evolution lines as rules"), doc.indexOf("## Domain working translations"));
  const rows = section.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Line") && !l.startsWith("|---"));
  const lines = trends.slice(trends.indexOf("## Evolution lines")).split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Line") && !l.startsWith("|---"));
  assert.deepEqual(rows.map((r) => r.split(" | ")[0].slice(2)).sort(), lines.map((l) => l.split(" | ")[0].slice(2)).sort());
  for (const row of rows) {
    const [name, quote] = row.slice(2).split(" | ");
    const line = lines.find((l) => l.startsWith(`| ${name} |`))!;
    assert.ok(line.includes(quote.replace(/^"|"$/g, "")), `${name}: ${quote}`);
  }
});

test("mistyped and malformed rules fail closed", () => {
  const broken = (patch: (r: Rule) => void) => {
    const r = structuredClone(replace);
    patch(r);
    return validateRule(r).errors.join("; ");
  };
  assert.match(broken((r) => { r.right.wires![0].carrier = "d"; r.carriers.push("d"); }), /right: wire 'g' from: carrier 'd' does not match port 'new.out' carrier 'c'/);
  assert.match(broken((r) => { r.right.wires![0].from = { box: "object", port: "in" }; }), /right: wire 'g' from: port 'in' of box 'object' is not an output/);
  assert.match(broken((r) => { r.left.boxes[0].outputs![0].carrier = "z"; }), /left: box 'old' port 'out': undeclared carrier variable 'z'/);
  assert.match(broken((r) => { r.interface.boxes.push({ id: "ghost" }); r.right.boxes.push({ id: "ghost" }); }), /interface box 'ghost' is not in left/);
  assert.match(broken((r) => { r.interface.boxes[0] = { id: "object", role: "product", inputs: r.interface.boxes[0].inputs }; }), /interface box 'object': role constraint differs in left/);
  assert.match(broken((r) => { delete r.right.boxes[1].role; }), /right box 'new': a created box needs role and name, or like/);
  assert.match(broken((r) => { r.right.boxes[1].like = "nowhere"; }), /right box 'new': like 'nowhere' is not a left-side box/);
  assert.match(broken((r) => { delete r.right.wires![0].polarity; }), /right wire 'g': a created wire needs polarity, or like/);
  assert.match(broken((r) => { r.left.boxes[0].name = "Old"; }), /left box 'old': 'name' is only for boxes the rule creates/);
  assert.match(broken((r) => { r.carriers.push("unused"); }), /carrier variable 'unused' is used nowhere/);
  const viaTool = matchRule(small(), Object.assign(structuredClone(replace), { right: { ...replace.right, wires: [{ ...replace.right.wires![0], carrier: "d" }] }, carriers: ["c", "d"] }));
  assert.match(errors(viaTool), /^rule 'replace': right: wire 'g'/);
});

test("matching is injective, verified, seeded by `at`, and capped", () => {
  const m = example("bearing-heat");
  const all = only(matchRule(m, trend("mono-bi")));
  assert.equal(all.decided, true);
  assert.equal(all.complete, true);
  assert.deepEqual(all.matches.map((x) => x.match.wires.f), [...m.wires.map((w) => w.id)].sort());
  for (const x of all.matches) assert.deepEqual(checkMatch(m, trend("mono-bi"), x.match), []);
  assert.equal(all.matches.every((x) => x.applicable), true, "a rule that deletes nothing cannot dangle");

  const seeded = only(matchRule(m, trend("mono-bi"), { at: { wires: { f: "w-drive" } } }));
  assert.deepEqual(seeded.matches.map((x) => x.match.boxes), [{ tool: "motor", object: "shaft" }]);
  assert.match(errors(matchRule(m, trend("mono-bi"), { at: { boxes: { nope: "motor" } } })), /at: 'nope' is not a left-side box/);

  const capped = only(matchRule(m, trend("mono-bi"), { limit: 2 }));
  assert.deepEqual([capped.matches.length, capped.complete, capped.decided], [2, false, true]);
  const starved = only(matchRule(m, trend("mono-bi"), { maxSteps: 2 }));
  assert.deepEqual([starved.decided, starved.complete], [false, false]);
  assert.match(starved.note, /not known to be complete/);

  const roleBound = structuredClone(trend("mono-bi"));
  for (const p of [roleBound.left, roleBound.interface, roleBound.right]) p.boxes[1].role = "product";
  assert.equal(only(matchRule(m, roleBound)).matches.length, 3, "only functions acting on the product shaft");
});

test("a tampered match is rejected as not a typed homomorphism", () => {
  const m = example("bearing-heat");
  const [{ match }] = only(matchRule(m, trend("mono-bi"), { at: { wires: { f: "w-drive" } } })).matches;
  const bad = (patch: (x: RuleMatch) => void) => {
    const x = structuredClone(match);
    patch(x);
    return errors(applyRule(m, trend("mono-bi"), x));
  };
  assert.match(bad((x) => { x.ports.object.in = "expansion"; }), /match: port 'object.in' \(in\) maps to 'shaft.expansion' \(out\)/);
  assert.match(bad((x) => { x.ports.object.in = "support"; }), /match: port 'object.in' carrier 'c' is bound to 'torque', but 'shaft.support' carries 'radial-load'/);
  assert.match(bad((x) => { x.wires.f = "w-support"; }), /match: wire 'f' source does not map to wire 'w-support' source/);
  assert.match(bad((x) => { delete (x.boxes as Record<string, string>).tool; }), /match: box 'tool' is not mapped/);
  assert.match(bad((x) => { x.carriers.c = "volts"; }), /match: carrier variable 'c' bound to unknown carrier 'volts'/);
});

test("DPO: a rule deletes, keeps its interface, and glues fresh elements", () => {
  const m = small();
  const [{ match, applicable }] = only(matchRule(m, replace)).matches;
  assert.ok(applicable);
  const r = only(applyRule(m, replace, match));
  assert.ok(checkModel(r.model).ok);
  assert.deepEqual(r.model.boxes.map((b) => b.id), ["P", "X", "new"]);
  assert.deepEqual(r.model.wires.map((w) => [w.id, w.from.box, w.to.box]), [["g", "new", "P"]]);
  assert.deepEqual(r.deleted, { boxes: ["A"], ports: [], wires: ["w"] });
  assert.deepEqual(r.created, { boxes: { new: "new" }, ports: { new: { out: "out" } }, wires: { g: "g" } });
  assert.deepEqual(r.basis, ["typed_dpo"]);

  const unplugged = only(applyRule(m, unplug, only(matchRule(m, unplug)).matches[0].match));
  assert.deepEqual(unplugged.model.boxes.find((b) => b.id === "A")!.outputs, [], "the deleted port goes; the box stays");
  assert.deepEqual(unplugged.deleted, { boxes: [], ports: [{ box: "A", port: "p" }, { box: "P", port: "q" }], wires: ["w"] });
});

test("no-dangling: a deleted box keeps no unmatched port, a deleted port no surviving wire", () => {
  const extraPort = small();
  extraPort.boxes[0].outputs!.push({ id: "spare", carrier: "c" });
  const [x] = only(matchRule(extraPort, replace)).matches;
  assert.equal(x.applicable, false);
  assert.deepEqual(x.violations, ["dangling: port 'A.spare' of deleted box 'A' is not on the rule's left side"]);
  assert.deepEqual(errors(applyRule(extraPort, replace, x.match)), "dangling: port 'A.spare' of deleted box 'A' is not on the rule's left side");

  const fanOut = small();
  fanOut.boxes.push({ id: "Q", name: "Q", role: "product", inputs: [{ id: "q", carrier: "c" }] });
  fanOut.wires.push({ id: "w2", from: { box: "A", port: "p" }, to: { box: "Q", port: "q" }, carrier: "c", polarity: "useful" });
  const atW = only(matchRule(fanOut, replace, { at: { wires: { f: "w" } } })).matches[0];
  assert.match(errors(applyRule(fanOut, replace, atW.match)), /^dangling: wire 'w2' touches deleted box 'A'/);
  const unplugW = only(matchRule(fanOut, unplug, { at: { wires: { f: "w" } } })).matches[0];
  assert.deepEqual(errors(applyRule(fanOut, unplug, unplugW.match)), "dangling: wire 'w2' touches deleted port 'A.p'");
});

test("no-identification: identifying a deleted element fails; identifying kept ones is allowed", () => {
  const loop: FunctionModel = {
    domain: "physical",
    carriers: [{ id: "c", layer: "energy", dimension: "W" }],
    boxes: [{ id: "S", name: "S", role: "tool", inputs: [{ id: "q", carrier: "c" }], outputs: [{ id: "p", carrier: "c" }] }],
    wires: [{ id: "self", from: { box: "S", port: "p" }, to: { box: "S", port: "q" }, carrier: "c", polarity: "useful" }],
  };
  assert.equal(only(matchRule(loop, replace)).matches.length, 0, "the search is injective");
  const folded = (tool: string, object: string): RuleMatch => ({
    boxes: { [tool]: "S", [object]: "S" }, ports: { [tool]: { out: "p" }, [object]: { in: "q" } }, wires: { f: "self" }, carriers: { c: "c" },
  });
  assert.deepEqual(checkMatch(loop, replace, folded("old", "object")), [], "a homomorphism, but not injective");
  assert.match(errors(applyRule(loop, replace, folded("old", "object"))),
    /^identification: left-side boxes 'old' and 'object' all match box 'S', and 'old' would be deleted/);
  const bi = only(applyRule(loop, trend("mono-bi"), folded("tool", "object")));
  assert.ok(checkModel(bi.model).ok);
  assert.deepEqual(bi.model.wires.map((w) => [w.id, w.from.box, w.to.box]), [["self", "S", "S"], ["self-2", "S-2", "S"]]);
});

test("fresh ids avoid every model id, deleted ones included; overrides must be fresh", () => {
  const m = small();
  m.boxes.push({ id: "A-2", name: "A-2", role: "tool" });
  const [{ match }] = only(matchRule(m, trend("mono-bi"))).matches;
  const r = only(applyRule(m, trend("mono-bi"), match));
  assert.deepEqual(r.created.boxes, { "tool-2": "A-3" });
  const replaced = only(applyRule(small(), replace, only(matchRule(small(), replace)).matches[0].match, { ids: { boxes: { new: "B" } } }));
  assert.ok(replaced.model.boxes.some((b) => b.id === "B"));
  assert.match(errors(applyRule(small(), replace, only(matchRule(small(), replace)).matches[0].match, { ids: { boxes: { new: "A" } } })), /ids: box id 'A' is not fresh/);
  assert.match(errors(applyRule(small(), replace, only(matchRule(small(), replace)).matches[0].match, { ids: { boxes: { object: "Z" } } })), /ids: 'object' is not a box the rule creates/);
});

test("a created box's ports get distinct ids after `like` renames them, and `ids` can name them", () => {
  // Left box `old` has output `p`; it matches host box A, whose output is named `q`. The copy has
  // outputs `p` and `q`: `p` takes the matched id `q`, so the rule's own `q` must not reuse it.
  const copyTwo: Rule = Rule.parse({
    id: "copy-two",
    carriers: ["c"],
    left: { boxes: [{ id: "old", outputs: [{ id: "p", carrier: "c" }] }] },
    interface: { boxes: [{ id: "old", outputs: [{ id: "p", carrier: "c" }] }] },
    right: { boxes: [{ id: "old", outputs: [{ id: "p", carrier: "c" }] }, { id: "copy", like: "old", outputs: [{ id: "p", carrier: "c" }, { id: "q", carrier: "c" }] }] },
  });
  const host: FunctionModel = {
    domain: "physical",
    carriers: [{ id: "c", layer: "energy", dimension: "W" }],
    boxes: [{ id: "A", name: "A", role: "tool", outputs: [{ id: "q", carrier: "c" }] }],
    wires: [],
  };
  const [x] = only(matchRule(host, copyTwo)).matches;
  assert.ok(x.applicable);
  const r = only(applyRule(host, copyTwo, x.match));
  assert.deepEqual(r.model.boxes.find((b) => b.id === "A-2")!.outputs, [{ id: "q", carrier: "c" }, { id: "q-2", carrier: "c" }]);
  assert.deepEqual(r.created.ports, { copy: { p: "q", q: "q-2" } });
  const named = only(applyRule(host, copyTwo, x.match, { ids: { ports: { copy: { q: "z" } } } }));
  assert.deepEqual(named.model.boxes.find((b) => b.id === "A-2")!.outputs!.map((p) => p.id), ["q", "z"]);
  assert.match(errors(applyRule(host, copyTwo, x.match, { ids: { ports: { copy: { p: "z", q: "z" } } } })), /ids: port id 'z' is given twice on created box 'copy'/);
  assert.match(errors(applyRule(host, copyTwo, x.match, { ids: { ports: { old: { p: "z" } } } })), /ids: 'old.p' is not a port the rule creates/);
});

test("trend rule mono-bi: a second performer, its cost counted; again for poly", () => {
  const m = example("bearing-heat");
  const rule = trend("mono-bi");
  const [{ match }] = only(matchRule(m, rule, { at: { wires: { f: "w-drive" } } })).matches;
  const bi = only(applyRule(m, rule, match));
  const copy = bi.model.boxes.find((b) => b.id === "motor-2")!;
  assert.deepEqual([copy.role, copy.name, copy.action, copy.cost], ["tool", "Drive motor", "rotate", { usd_unit: 120 }]);
  assert.deepEqual(bi.model.wires.find((w) => w.id === "w-drive-2"), { id: "w-drive-2", from: { box: "motor-2", port: "shaft-out" }, to: { box: "shaft", port: "drive" }, carrier: "torque", polarity: "useful", verb: "rotate" });
  assert.equal(idealityProfile(bi.model).costs.usd_unit - idealityProfile(m).costs.usd_unit, 120);
  const poly = only(applyRule(bi.model, rule, only(matchRule(bi.model, rule, { at: { wires: { f: "w-drive" } } })).matches[0].match));
  assert.deepEqual(poly.model.wires.filter((w) => w.to.box === "shaft" && w.to.port === "drive").map((w) => w.from.box), ["motor", "motor-2", "motor-3"]);
});

test("trend rule feedback: one useful function back to the tool, on a carrier the caller binds", () => {
  const m = example("bearing-heat");
  m.carriers.push({ id: "signal", layer: "information", dimension: "speed reading" });
  const rule = trend("feedback");
  const listed = only(matchRule(m, rule, { at: { wires: { f: "w-drive" } } }));
  assert.deepEqual(listed.bindCarriers, ["s"]);
  const { match } = listed.matches[0];
  assert.match(errors(applyRule(m, rule, match)), /carriers: variable 's' appears only on the right side/);
  assert.match(errors(applyRule(m, rule, match, { carriers: { s: "nope" } })), /carrier variable 's' bound to unknown carrier 'nope'/);
  const taken = structuredClone(m);
  taken.boxes.find((b) => b.id === "shaft")!.outputs!.push({ id: "state", carrier: "heat" });
  const fresh = only(applyRule(taken, rule, match, { carriers: { s: "signal" } }));
  assert.deepEqual(fresh.created.ports, { tool: { adjust: "adjust" }, object: { state: "state-2" } }, "a created port never reuses a port id the box has");
  const r = only(applyRule(m, rule, match, { carriers: { s: "signal" } }));
  assert.deepEqual(r.model.wires.at(-1), { id: "feedback", from: { box: "shaft", port: "state" }, to: { box: "motor", port: "adjust" }, carrier: "signal", polarity: "useful", verb: "adjust" });
  assert.equal(r.model.boxes.length, m.boxes.length, "no sensor or controller box");
  const negative = (x: FunctionModel) => harmLoops(x).flatMap((l) => l.negative).sort();
  assert.deepEqual(negative(r.model), negative(m), "the useful feedback loop adds no harm");
});

test("trend rule working-field: the same function on another carrier, with the field change recorded", () => {
  const m = example("bearing-heat");
  m.carriers.push({ id: "magnetic", layer: "energy", dimension: "T magnetic coupling" });
  const rule = trend("working-field");
  assert.deepEqual(rule.source, { file: "skills/triz-innovation/references/evolution-trends.md", line: 30, quote: "mechanical → thermal → chemical → electric → magnetic → electromagnetic" });
  const listed = only(matchRule(m, rule, { at: { wires: { f: "w-drive" } } }));
  assert.deepEqual(listed.bindCarriers, ["d"]);
  const { match } = listed.matches[0];
  assert.match(errors(applyRule(m, rule, match, { carriers: { d: "torque" } })), /^distinct: carrier variables 'c' and 'd' both bind carrier 'torque'/);
  const r = only(applyRule(m, rule, match, { carriers: { d: "magnetic" } }));
  assert.ok(checkModel(r.model).ok);
  assert.deepEqual(r.basis, ["typed_dpo"]);
  assert.deepEqual(r.deleted, { boxes: [], ports: [{ box: "motor", port: "shaft-out" }, { box: "shaft", port: "drive" }], wires: ["w-drive"] });
  assert.deepEqual(r.model.wires.find((w) => w.id === "w-drive-2"), { id: "w-drive-2", from: { box: "motor", port: "field" }, to: { box: "shaft", port: "field" }, carrier: "magnetic", polarity: "useful", verb: "rotate" });
  assert.deepEqual(r.fieldChanges, [{
    wire: "w-drive-2", replaces: "w-drive",
    from: { carrier: "torque", layer: "energy", dimension: "N·m" },
    to: { carrier: "magnetic", layer: "energy", dimension: "T magnetic coupling" },
  }]);
  assert.equal(r.deliverableKeysChanged, true, "the shaft is a product, and its deliverable moved to a new port and carrier");
  assert.match(r.note, /lost and regained/);
  assert.equal(r.model.boxes.length, m.boxes.length);
  // A port that carries another function cannot go: the match is not applicable (dangling).
  const cache = example("software-cache");
  cache.carriers.push({ id: "push", layer: "information", dimension: "pushed result" });
  const shared = only(matchRule(cache, rule, { at: { wires: { f: "w-cache" } } })).matches[0];
  assert.equal(shared.applicable, false);
  assert.match(shared.violations.join(), /dangling: wire 'w-stale' touches deleted port 'redis.hit'/);
  // mono-bi keeps every deliverable key and records no field change.
  const bi = only(applyRule(m, trend("mono-bi"), only(matchRule(m, trend("mono-bi"), { at: { wires: { f: "w-drive" } } })).matches[0].match));
  assert.equal(bi.deliverableKeysChanged, false);
  assert.equal(bi.fieldChanges, undefined);
});

test("rule `distinct` must name two carrier variables of the rule", () => {
  const rule = trend("working-field");
  assert.match(validateRule({ ...rule, distinct: [["c", "e"]] }).errors.join(), /distinct: 'e' is not a carrier variable of the rule/);
  assert.match(validateRule({ ...rule, distinct: [["c", "c"]] }).errors.join(), /distinct: 'c' is paired with itself/);
});

test("detector uneven-development reads every minimal vector, not only the 50 feasibility lists", async () => {
  // A is the only box of a harm loop (a harmful self-loop). Its 51 rows all provide level 1; row i
  // costs { a: i, b: 50 - i, usd: 1 only for i = 50 }, so all 51 vectors are minimal. Z, outside
  // the loop, costs 1 USD in every configuration, so with a USD budget of 0 USD binds. Only row 50
  // puts A on that binding dimension.
  const rows = (k: number) => Array.from({ length: k }, (_, i) => ({ provides: { out: 1 }, cost: { a: i, b: 50 - i, ...(i === 50 ? { usd: 1 } : {}) } }));
  const model = (k: number, drop0 = false): FunctionModel => FunctionModel.parse({
    domain: "physical",
    carriers: [{ id: "x", layer: "energy", dimension: "units" }, { id: "h", layer: "energy", dimension: "W" }],
    boxes: [
      { id: "A", name: "A", role: "tool", inputs: [{ id: "back", carrier: "h" }], outputs: [{ id: "out", carrier: "x" }, { id: "heat", carrier: "h" }], feasibility: rows(k).slice(drop0 ? 1 : 0) },
      { id: "P", name: "P", role: "product", inputs: [{ id: "in", carrier: "x" }], feasibility: [{ requires: { in: 1 } }] },
      { id: "Z", name: "Z", role: "tool", cost: { usd: 1 } },
    ],
    wires: [
      { id: "w-out", from: { box: "A", port: "out" }, to: { box: "P", port: "in" }, carrier: "x", polarity: "useful" },
      { id: "w-self", from: { box: "A", port: "heat" }, to: { box: "A", port: "back" }, carrier: "h", polarity: "harmful" },
    ],
    budget: { a: 100, b: 100, usd: 0 },
  });
  const m = model(51);
  const listed = await specs.triz_feasibility.handler({ model: m });
  const f = JSON.parse(listed.content[0].text);
  assert.deepEqual([f.verdict, f.binding, f.minimalCount, f.minimal.length], ["infeasible", ["usd"], 51, 50], "feasibility lists 50 of 51 minimal vectors");
  const r = await call({ model: m, rule_id: "uneven-development" });
  assert.equal(r.verdict, "lagging");
  assert.deepEqual(r.lagging.map((x: { box: string; reasons: Array<{ kind: string; dimensions?: string[] }> }) => [x.box, x.reasons.map((y) => [y.kind, y.dimensions])]), [["A", [["binding", ["usd"]]]]]);
  // The verdict does not depend on which vectors the display list happens to show.
  assert.equal((await call({ model: model(51, true), rule_id: "uneven-development" })).verdict, "lagging");
});

test("detector uneven-development: the lagging box of the largest harm-loop region", async () => {
  const feasible = example("bearing-heat-feasibility");
  const detect = async (model: FunctionModel) => call({ model, rule_id: "uneven-development" });
  // Within budget, and no insufficient deliverable: no subsystem lags.
  const none = await detect(feasible);
  assert.equal(none.verdict, "none");
  assert.deepEqual(none.regions, [{ boxes: ["bearing", "shaft"], negative: ["w-heat", "w-preload"], basis: ["edge_on_cycle"] }]);
  assert.deepEqual(none.detector.source, { file: "skills/triz-innovation/references/evolution-trends.md", line: 25, quote: "one subsystem lags and becomes the limiter" });
  // Over budget on usd_unit: the bearing, in the loop and costing usd_unit, lags; the shaft costs nothing.
  const over = await detect({ ...feasible, budget: { usd_unit: 150, service_h_year: 4 } });
  assert.equal(over.verdict, "lagging");
  assert.deepEqual(over.lagging.map((x: { box: string; reasons: Array<{ kind: string; dimensions?: string[] }> }) => [x.box, x.reasons.map((y) => [y.kind, y.dimensions])]), [["bearing", [["binding", ["usd_unit"]]]]]);
  assert.deepEqual(over.feasibility, { verdict: "infeasible", reason: "over-budget", binding: ["usd_unit"] });
  // A bearing whose row cannot carry the shaft's load limits the deliverable whatever the budget.
  const weak = structuredClone(feasible);
  weak.boxes.find((b) => b.id === "bearing")!.feasibility = [{ provides: { race: 2000 } }];
  const unprovidable = await detect(weak);
  assert.deepEqual(unprovidable.lagging.map((x: { box: string; reasons: Array<{ kind: string }> }) => [x.box, x.reasons.map((y) => y.kind)]), [["bearing", ["unprovidable"]]]);
  // Without feasibility rows, an insufficient function on the product still limits a deliverable.
  const plain = example("bearing-heat");
  assert.equal((await detect(plain)).verdict, "undecided");
  assert.equal((await detect(plain)).reason, "missing-feasibility");
  plain.wires.find((w) => w.id === "w-support")!.polarity = "insufficient";
  const limited = await detect(plain);
  assert.equal(limited.verdict, "lagging");
  assert.deepEqual(limited.lagging, [{ box: "bearing", region: ["bearing", "shaft"], reasons: [{ kind: "insufficient-deliverable", wires: ["w-support"] }] }]);
  // No harm loop: nothing to lag in.
  const cache = example("software-cache");
  const calm = await detect({ ...cache, wires: cache.wires.filter((w) => w.id !== "w-stale") });
  assert.deepEqual([calm.verdict, calm.reason], ["undecided", "no-harm-loop"]);
  assert.match((await call({ model: feasible, rule_id: "uneven-development", at: { boxes: {} } })).errors[0], /is a detector, not a rewrite/);
});

test("a kept box that declares behaviour keeps its ports; a copy does not inherit behaviour", () => {
  const m = example("bearing-heat-behavior");
  assert.ok(checkModel(m).ok);
  const signal = m.carriers.find((c) => c.values)!.id;
  for (const [rule, tool] of [[trend("feedback"), "tool"], [unplug, "old"]] as const) {
    for (const { match, applicable, violations } of only(matchRule(m, rule)).matches) {
      const behaving = [...new Set([match.boxes[tool], match.boxes.object])].filter((id) => m.boxes.find((b) => b.id === id)!.behavior);
      const r = applyRule(m, rule, match, rule.id === "feedback" ? { carriers: { s: signal } } : {});
      if (behaving.length) {
        assert.equal(applicable, false);
        assert.deepEqual([...violations].sort(), behaving.sort().map((id) => `behaviour: the rule changes the ports of box '${id}', which declares behavior; restate or remove its behavior first`));
        assert.match(errors(r), /^behaviour: /);
      } else if (applicable) assert.ok(r.ok, errors(r));
    }
  }
  const copied = only(matchRule(m, trend("mono-bi"), { at: { wires: { f: "w-drive" } } })).matches[0];
  const bi = only(applyRule(m, trend("mono-bi"), copied.match));
  assert.equal(bi.model.boxes.find((b) => b.id === "motor-2")!.behavior, undefined);
  assert.ok(checkModel(bi.model).ok);
});

test("a kept box that declares feasibility may gain ports, but keeps the ports its rows name", () => {
  // The review's reproduction: unplugging A.p → P.q would leave both rows naming deleted ports.
  const m: FunctionModel = {
    domain: "physical",
    carriers: [{ id: "c", layer: "energy", dimension: "N" }],
    boxes: [
      { id: "A", name: "A", role: "tool", outputs: [{ id: "p", carrier: "c" }], feasibility: [{ provides: { p: 1 } }] },
      { id: "P", name: "P", role: "product", inputs: [{ id: "q", carrier: "c" }], feasibility: [{ requires: { q: 1 } }] },
    ],
    wires: [{ id: "w", from: { box: "A", port: "p" }, to: { box: "P", port: "q" }, carrier: "c", polarity: "useful" }],
  };
  const listed = only(matchRule(m, unplug));
  assert.deepEqual(listed.matches.map((x) => [x.applicable, x.violations]), [[false, [
    "feasibility: the rule deletes port 'p' of box 'A', which its feasibility rows name; restate or remove its feasibility first",
    "feasibility: the rule deletes port 'q' of box 'P', which its feasibility rows name; restate or remove its feasibility first",
  ]]]);
  assert.match(errors(applyRule(m, unplug, listed.matches[0].match)), /^feasibility: the rule deletes port 'p' of box 'A'/);
  // Rows that do not name the deleted ports keep the match applicable.
  const unnamed = structuredClone(m);
  unnamed.boxes[0].feasibility = [{ cost: { usd: 1 } }];
  unnamed.boxes[1].feasibility = [{}];
  const ok = only(matchRule(unnamed, unplug)).matches[0];
  assert.ok(ok.applicable);
  assert.ok(only(applyRule(unnamed, unplug, ok.match)).model.wires.length === 0);

  // Gaining a port is fine: feedback adds a port to each box, where the rows provide and need 0.
  const f = example("bearing-heat-feasibility");
  let gained = 0;
  for (const { match, applicable } of only(matchRule(f, trend("feedback"))).matches) {
    assert.ok(applicable, JSON.stringify(match.boxes));
    const r = only(applyRule(f, trend("feedback"), match, { carriers: { s: "torque" } }));
    assert.ok(checkModel(r.model).ok);
    for (const id of [match.boxes.tool, match.boxes.object]) assert.deepEqual(r.model.boxes.find((b) => b.id === id)!.feasibility, f.boxes.find((b) => b.id === id)!.feasibility);
    gained++;
  }
  assert.ok(gained >= 2);
});

test("a kept box that declares transition keeps its ports, like one that declares behavior", () => {
  const m = example("bearing-heat-dynamics");
  // Drop the stateless boxes' behaviour, so only the stateful shaft's transition can refuse.
  for (const b of m.boxes) delete b.behavior;
  assert.ok(checkModel(m).ok);
  const stateful = m.boxes.filter((b) => b.transition).map((b) => b.id);
  const signal = m.carriers.find((c) => c.values)!.id;
  let refused = 0;
  for (const { match, applicable, violations } of only(matchRule(m, trend("feedback"))).matches) {
    const touched = [...new Set([match.boxes.tool, match.boxes.object])].filter((id) => stateful.includes(id));
    const r = applyRule(m, trend("feedback"), match, { carriers: { s: signal } });
    if (!touched.length) { if (applicable) assert.ok(r.ok, errors(r)); continue; }
    assert.equal(applicable, false);
    assert.deepEqual(violations, touched.map((id) => `behaviour: the rule changes the ports of box '${id}', which declares transition; restate or remove its transition first`));
    assert.match(errors(r), /^behaviour: .*declares transition/);
    refused++;
  }
  assert.ok(refused >= 1);
});

/** One feasibility row on some boxes of a generated model, naming a random subset of their ports. */
function annotate(r: () => number, m: FunctionModel): FunctionModel {
  for (const b of m.boxes) {
    if (r() < 0.4) continue;
    const pick = (ports: FunctionModel["boxes"][number]["inputs"]) => Object.fromEntries((ports ?? []).filter(() => r() < 0.6).map((p) => [p.id, int(r, 0, 2)]));
    b.feasibility = [{ provides: pick(b.outputs), requires: pick(b.inputs) }];
  }
  return m;
}

test("property (typed_dpo): every applicable match gives a typed model; others fail on a named condition", () => {
  const rules = [...TREND_RULES, replace, unplug];
  let applied = 0, refused = 0, annotatedApplied = 0, feasibilityRefused = 0;
  for (let seed = 1; seed <= 200; seed++) {
    // Even seeds carry feasibility rows, so the declared-row conditions are exercised too.
    const m = seed % 2 ? genModel(rng(seed)) : annotate(rng(seed + 1000), genModel(rng(seed)));
    const annotated = m.boxes.some((b) => b.feasibility);
    const signal = m.carriers[0].id;
    for (const rule of rules) {
      const listed = only(matchRule(m, rule, { limit: 200 }));
      assert.ok(listed.complete, `seed ${seed} ${rule.id}`);
      for (const { match, applicable } of listed.matches) {
        // working-field needs 'd' on a carrier other than the matched one; with none, the application is refused (distinct).
        const other = m.carriers.find((c) => c.id !== match.carriers.c)?.id ?? match.carriers.c;
        const carriers: Record<string, string> | undefined = rule.id === "feedback" ? { s: signal } : rule.id === "working-field" ? { d: other } : undefined;
        const r = applyRule(m, rule, match, carriers ? { carriers } : {});
        if (applicable && !(rule.id === "working-field" && other === match.carriers.c)) {
          assert.ok(r.ok, `seed ${seed} ${rule.id}: ${errors(r)}`);
          assert.ok(checkModel(r.model).ok);
          applied++;
          if (annotated) annotatedApplied++;
        } else {
          assert.match(errors(r), /^(dangling|identification|behaviour|feasibility|distinct): /, `seed ${seed} ${rule.id}`);
          refused++;
          if (/^feasibility: /.test(errors(r))) feasibilityRefused++;
        }
      }
    }
  }
  assert.ok(applied > 500 && refused > 50, `applied ${applied}, refused ${refused}`);
  assert.ok(annotatedApplied > 100 && feasibilityRefused > 10, `annotated applied ${annotatedApplied}, feasibility refused ${feasibilityRefused}`);
});

test("triz_rule_apply lists and applies, and fails closed on ambiguous arguments", async () => {
  const model = example("bearing-heat");
  const listed = await call({ model, rule_id: "mono-bi", at: { wires: { f: "w-drive" } } });
  assert.equal(listed.matches.length, 1);
  assert.equal(listed.rule.source.line, 23);
  const applied = await call({ model, rule_id: "mono-bi", match: listed.matches[0].match });
  assert.ok(applied.ok && applied.model.boxes.some((b: { id: string }) => b.id === "motor-2"));
  const inline = await call({ model: small(), rule: replace });
  assert.equal(inline.matches.length, 1);
  assert.match((await call({ model, rule_id: "mono-bi", rule: replace })).errors[0], /exactly one of rule_id and rule/);
  assert.match((await call({ model })).errors[0], /exactly one of rule_id and rule/);
  assert.match((await call({ model, rule_id: "nope" })).errors[0], /unknown rule_id 'nope'; built-in rules: mono-bi, feedback/);
  assert.match((await call({ model, rule_id: "mono-bi", carriers: { s: "heat" } })).errors[0], /used only when applying/);
  const mistyped = await call({ model, rule: { ...replace, right: { ...replace.right, wires: [{ ...replace.right.wires![0], to: { box: "new", port: "out" } }] } } });
  assert.equal(mistyped.ok, false);
});
