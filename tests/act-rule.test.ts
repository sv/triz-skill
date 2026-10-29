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
import { rng, genModel } from "./support/gen.js";

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
  assert.deepEqual(TREND_RULES.map((r) => r.id), ["mono-bi", "feedback"]);
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
  assert.deepEqual(r.created, { boxes: { new: "new" }, ports: {}, wires: { g: "g" } });
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

test("property (typed_dpo): every applicable match gives a typed model; others fail on a named condition", () => {
  const rules = [...TREND_RULES, replace, unplug];
  let applied = 0, refused = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const m = genModel(rng(seed));
    const signal = m.carriers[0].id;
    for (const rule of rules) {
      const listed = only(matchRule(m, rule, { limit: 200 }));
      assert.ok(listed.complete, `seed ${seed} ${rule.id}`);
      for (const { match, applicable } of listed.matches) {
        const r = applyRule(m, rule, match, rule.id === "feedback" ? { carriers: { s: signal } } : {});
        if (applicable) {
          assert.ok(r.ok, `seed ${seed} ${rule.id}: ${errors(r)}`);
          assert.ok(checkModel(r.model).ok);
          applied++;
        } else {
          assert.match(errors(r), /^(dangling|identification|behaviour): /, `seed ${seed} ${rule.id}`);
          refused++;
        }
      }
    }
  }
  assert.ok(applied > 500 && refused > 50, `applied ${applied}, refused ${refused}`);
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
  assert.match((await call({ model, rule_id: "mono-bi", carriers: { s: "heat" } })).errors[0], /used only when applying/);
  const mistyped = await call({ model, rule: { ...replace, right: { ...replace.right, wires: [{ ...replace.right.wires![0], to: { box: "new", port: "out" } }] } } });
  assert.equal(mistyped.ok, false);
});
