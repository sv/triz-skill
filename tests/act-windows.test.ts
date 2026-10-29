/**
 * 9 windows with transitions: transformation sequences linking past, present, and future are
 * applied, checked against the snapshots they must reach, and reported as one net step and its
 * part inside the subsystem. The commuting square (restrict_rewrite) is checked independently of
 * the kernel's own check, on the shipped examples and over generated models.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel } from "../src/act.js";
import { rewrite } from "../src/act-rewrite.js";
import { toolSpecs } from "../src/tools.js";
import { rng, genModel, pick, shuffle, int } from "./support/gen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../examples/function-models/${name}.json`), "utf8")));
const specs = Object.fromEntries(toolSpecs().map((s) => [s.name, s]));
const windows = async (args: unknown) => JSON.parse((await specs.triz_nine_windows.handler(args)).content[0].text);

type Box = FunctionModel["boxes"][number];
type Wire = FunctionModel["wires"][number];
const byId = <X extends { id: string }>(xs: X[]) => JSON.stringify([...xs].sort((a, b) => (a.id < b.id ? -1 : 1)));
const same = (a: FunctionModel, b: FunctionModel) => byId(a.boxes) === byId(b.boxes) && byId(a.wires) === byId(b.wires);
const within = (m: FunctionModel, keep: Set<string>): FunctionModel => ({
  ...m, boxes: m.boxes.filter((b) => keep.has(b.id)), wires: m.wires.filter((w) => keep.has(w.from.box) && keep.has(w.to.box)),
});

interface StepIds { delete: { boxes: string[]; wires: string[] }; add: { boxes: string[]; wires: string[] } }

/** The commuting square, checked from the outside: the reported part of the step takes the earlier subsystem view to the later one. */
function squareCommutes(before: FunctionModel, after: FunctionModel, part: StepIds, keep: Set<string>) {
  const r = rewrite(within(before, keep), {
    delete: part.delete,
    add: { boxes: after.boxes.filter((b: Box) => part.add.boxes.includes(b.id)), wires: after.wires.filter((w: Wire) => part.add.wires.includes(w.id)) },
  });
  return r.ok && same(r.model, within(after, keep));
}

/** The bearing with a plain bushing in place of the rolling bearing. */
function bushingPast() {
  const past = example("bearing-heat");
  past.boxes = past.boxes.filter((b) => b.id !== "bearing");
  past.wires = past.wires.filter((w) => w.from.box !== "bearing" && w.to.box !== "bearing")
    .concat({ id: "w-bushing", from: { box: "housing", port: "bore" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "insufficient" });
  return past;
}

test("present → future by a trim: the future is derived, and the step stays within the subsystem", async () => {
  const present = example("software-cache");
  const grid = await windows({ present, subsystem: ["app", "redis"], transitions: { present_to_future: [{ op: "trim", trim: ["redis"] }] } });
  assert.equal(grid.ok, true);
  assert.deepEqual(grid.windows.map((w: { status: string }) => w.status), ["missing", "ok", "ok"]);
  const [t] = grid.transitions;
  assert.equal(t.status, "ok");
  assert.equal(t.snapshot, "derived");
  assert.deepEqual(t.applied.map((a: { op: string }) => a.op), ["trim"]);
  assert.deepEqual(t.step.delete.boxes, ["redis"]);
  assert.deepEqual(grid.windows[2].system.boxes, t.model.boxes.map((b: Box) => b.id));
  assert.equal(t.subsystem.withinSubsystem, true);
  assert.deepEqual(t.subsystem.step, t.step);
  assert.deepEqual(t.subsystem.boundary, { cut: [], added: [] });
  assert.deepEqual(t.subsystem.basis, ["restrict_rewrite", "boundary_rewrite", "restrict_rewrite_of_inside"]);
  assert.ok(squareCommutes(present, t.model, t.subsystem.step, new Set(["app", "redis"])));
  assert.deepEqual(grid.changes, [{ from: "present", to: "future", addedBoxes: [], removedBoxes: ["redis"] }]);

  // Giving the same future as a snapshot: the transition must reach it, and does.
  const checked = await windows({ present, future: t.model, subsystem: ["app", "redis"], transitions: { present_to_future: [{ op: "trim", trim: ["redis"] }] } });
  assert.equal(checked.ok, true);
  assert.equal(checked.transitions[0].snapshot, "reached");
  assert.equal(checked.transitions[0].model, undefined);
});

test("a step across the subsystem boundary: the interior is unchanged and the boundary lists what moved", async () => {
  const present = example("software-cache");
  const grid = await windows({
    present, subsystem: ["app", "redis"],
    transitions: { present_to_future: [{ op: "interpose", wire: "w-route", mediator: { id: "balancer", name: "Load balancer" } }] },
  });
  assert.equal(grid.ok, true);
  const { subsystem } = grid.transitions[0];
  assert.equal(subsystem.withinSubsystem, false);
  assert.equal(subsystem.interiorUnchanged, true);
  assert.deepEqual(subsystem.boundary, { cut: ["w-route"], added: ["w-route/out"] });
  assert.deepEqual(subsystem.basis, ["restrict_rewrite", "boundary_rewrite"]);
  assert.deepEqual(grid.windows[1].subsystem.boundary, { entering: ["w-route", "w-rows"], leaving: ["w-serve", "w-sql"] });
  assert.deepEqual(grid.windows[2].subsystem.boundary, { entering: ["w-rows", "w-route/out"], leaving: ["w-serve", "w-sql"] });
});

test("past → present by a rewrite must reach the present snapshot, or the call fails closed", async () => {
  const present = example("bearing-heat"), past = bushingPast();
  const fit = {
    op: "rewrite",
    delete: { wires: ["w-bushing"] },
    add: { boxes: present.boxes.filter((b) => b.id === "bearing"), wires: present.wires.filter((w) => w.from.box === "bearing" || w.to.box === "bearing") },
  };
  const grid = await windows({ past, present, subsystem: ["bearing", "shaft"], transitions: { past_to_present: [fit] } });
  assert.equal(grid.ok, true);
  const [t] = grid.transitions;
  assert.equal(t.snapshot, "reached");
  assert.deepEqual(t.step, { delete: { boxes: [], wires: ["w-bushing"] }, add: { boxes: ["bearing"], wires: ["w-support", "w-heat", "w-preload"] } });
  assert.deepEqual(t.subsystem.step, { delete: { boxes: [], wires: [] }, add: { boxes: ["bearing"], wires: ["w-support", "w-heat", "w-preload"] } });
  assert.deepEqual(t.subsystem.boundary, { cut: ["w-bushing"], added: [] });
  assert.equal(t.subsystem.withinSubsystem, false);
  assert.ok(squareCommutes(past, present, t.subsystem.step, new Set(["bearing", "shaft"])));

  const short = { ...fit, add: { ...fit.add, wires: fit.add.wires.filter((w) => w.id !== "w-preload") } };
  const missed = await windows({ past, present, subsystem: ["bearing", "shaft"], transitions: { past_to_present: [short] } });
  assert.equal(missed.ok, false);
  assert.equal(missed.transitions[0].status, "invalid");
  assert.match(missed.transitions[0].errors[0], /do not reach the present snapshot; they differ at wires \[w-preload\]/);
});

test("transitions fail closed: no snapshot to start from, or a failing step", async () => {
  const present = example("bearing-heat");
  const noPast = await windows({ present, subsystem: ["shaft"], transitions: { past_to_present: [{ op: "trim", trim: ["bearing"] }] } });
  assert.equal(noPast.ok, false);
  assert.match(noPast.transitions[0].errors[0], /no past snapshot; transformations apply forward only/);

  const dangling = await windows({ present, subsystem: ["shaft"], transitions: { present_to_future: [{ op: "rewrite", delete: { boxes: ["bearing"] } }] } });
  assert.equal(dangling.ok, false);
  assert.match(dangling.transitions[0].errors.join("; "), /present_to_future\[0\] rewrite: no-dangling/);
  assert.equal(dangling.windows[2].status, "missing");
});

test("property: every transition's part inside the subsystem commutes with restriction", async () => {
  let within_ = 0, crossing = 0, interiorUnchanged = 0, reached = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const r = rng(70_000 + seed);
    const m = genModel(r);
    const boxIds = m.boxes.map((b) => b.id);
    const ops: unknown[] = [];
    if (m.wires.length) ops.push({ op: "interpose", wire: pick(r, m.wires).id, mediator: { id: "mediator ⟨new⟩", name: "M" } });
    const splittable = m.boxes.filter((b) => (b.inputs ?? []).length + (b.outputs ?? []).length >= 2);
    if (splittable.length) {
      const b = pick(r, splittable);
      const ps = shuffle(r, [...(b.inputs ?? []), ...(b.outputs ?? [])].map((p) => p.id)), cut = int(r, 1, ps.length - 1);
      ops.push({ op: "segment", box: b.id, parts: [{ id: "part one", ports: ps.slice(0, cut) }, { id: "part two", ports: ps.slice(cut) }] });
    }
    if (!ops.length) continue;
    const seq = shuffle(r, ops).slice(0, int(r, 1, ops.length));
    const A = shuffle(r, [...boxIds, "mediator ⟨new⟩", "part one"]).slice(0, int(r, 1, boxIds.length + 2));
    const grid = await windows({ present: m, subsystem: A, transitions: { present_to_future: seq } });
    const t = grid.transitions[0];
    if (t.status !== "ok") {
      // Only a later op may fail, because an earlier one consumed its target; never the kernel.
      assert.doesNotMatch(t.errors.join("; "), /internal/, `seed ${seed}`);
      continue;
    }
    assert.equal(grid.ok, true, `seed ${seed}`);
    const keep = new Set<string>(A);
    assert.ok(squareCommutes(m, t.model, t.subsystem.step, keep), `seed ${seed}: the square does not commute`);
    const inside = (w: Wire) => keep.has(w.from.box) && keep.has(w.to.box);
    const cross = (w: Wire) => keep.has(w.from.box) !== keep.has(w.to.box);
    const wire = (model: FunctionModel, id: string) => model.wires.find((w) => w.id === id)!;
    const all = t.step.delete.boxes.every((b: string) => keep.has(b)) && t.step.add.boxes.every((b: string) => keep.has(b))
      && t.step.delete.wires.every((id: string) => inside(wire(m, id))) && t.step.add.wires.every((id: string) => inside(wire(t.model, id)));
    assert.equal(t.subsystem.withinSubsystem, all, `seed ${seed}`);
    assert.deepEqual(t.subsystem.boundary, {
      cut: t.step.delete.wires.filter((id: string) => cross(wire(m, id))),
      added: t.step.add.wires.filter((id: string) => cross(wire(t.model, id))),
    }, `seed ${seed}`);
    if (all) within_++; else crossing++;
    if (t.subsystem.interiorUnchanged) interiorUnchanged++;

    const again = await windows({ present: m, future: t.model, subsystem: A, transitions: { present_to_future: seq } });
    assert.equal(again.transitions[0].snapshot, "reached", `seed ${seed}`);
    assert.deepEqual(again.transitions[0].step, t.step, `seed ${seed}`);
    reached++;
  }
  assert.ok(within_ > 10 && crossing > 50 && interiorUnchanged > 5 && reached > 100, `${within_} within, ${crossing} crossing, ${interiorUnchanged} unchanged, ${reached} reached`);
});
