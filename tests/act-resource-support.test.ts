import { test } from "node:test";
import assert from "node:assert/strict";
import { resourceSourceSupport, type SupportRow } from "../src/act-resource-support.js";

test("grounding exposes an activation derivation and does not seed a positive cycle", () => {
  const ports = [{ box: "a", port: "x" }, { box: "b", port: "y" }];
  const cycle: SupportRow[] = [
    { box: "b", row: 0, demand: [[0, 2]], provide: [[1, 1]] },
    { box: "a", row: 0, demand: [[1, 1]], provide: [[0, 2]] },
  ];
  const unseeded = resourceSourceSupport(ports, cycle, () => {});
  assert.equal(unseeded.grounded, false);
  assert.deepEqual(unseeded.activationOrder, []);
  const seeded = resourceSourceSupport(ports, cycle, () => {}, [[0, 2]]);
  assert.equal(seeded.grounded, true);
  assert.deepEqual(seeded.activationOrder, [{ box: "b", row: 0 }, { box: "a", row: 0 }]);
  const tooLittle = resourceSourceSupport(ports, cycle, () => {}, [[0, 1]]);
  assert.equal(tooLittle.grounded, false);
});

test("activation traces replay and the serial scan agrees with an independent simultaneous closure", () => {
  let seed = 7109;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 8; };
  const ports = Array.from({ length: 4 }, (_, i) => ({ box: `p${i}`, port: "out" }));
  for (let k = 0; k < 200; k++) {
    const rows: SupportRow[] = Array.from({ length: 6 }, (_, i) => ({ box: `r${i}`, row: 0,
      demand: Array.from({ length: rand() % 3 }, () => [rand() % 4, (rand() % 5) / 2] as [number, number]),
      provide: Array.from({ length: rand() % 3 }, () => [rand() % 4, (rand() % 5) / 2] as [number, number]),
    }));
    const initial: Array<[number, number]> = [[rand() % 4, (rand() % 5) / 2]];
    const original = structuredClone([ports, rows, initial]);
    const result = resourceSourceSupport(ports, rows, () => {}, initial);
    const available = ports.map(() => 0), active = new Set<string>();
    for (const [p, level] of initial) available[p] = Math.max(available[p], level);
    for (const entry of result.activationOrder) {
      const row = rows.find(r => r.box === entry.box && r.row === entry.row)!;
      assert.ok(!active.has(row.box));
      assert.ok(row.demand.every(([p, level]) => level <= available[p]));
      active.add(row.box);
      for (const [p, level] of row.provide) available[p] = Math.max(available[p], level);
    }
    // A terminal witness must be closed, even if some circular rows remain ungrounded.
    assert.ok(rows.every(r => active.has(r.box) || r.demand.some(([p, level]) => level > available[p])));
    const reference = ports.map(() => 0), fired = new Set<string>();
    for (const [p, level] of initial) reference[p] = Math.max(reference[p], level);
    for (;;) {
      const enabled = rows.filter(r => !fired.has(r.box) && r.demand.every(([p, level]) => level <= reference[p]));
      if (!enabled.length) break;
      for (const r of enabled) {
        fired.add(r.box);
        for (const [p, level] of r.provide) reference[p] = Math.max(reference[p], level);
      }
    }
    assert.deepEqual([...active].sort(), [...fired].sort());
    assert.deepEqual(available, reference);
    assert.equal(result.grounded, fired.size === rows.length);
    assert.deepEqual([ports, rows, initial], original);
  }
});
