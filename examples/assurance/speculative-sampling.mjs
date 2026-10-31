/** Exact finite example kernel, not a general probability theorem or an inference benchmark. */
import assert from "node:assert/strict";
import { Z, ONE, add, sub, mul, div, cmp, sum, show } from "../../src/act-rational.ts";

export function speculativeSampling(target, draft) {
  assert.ok(target.length > 0 && target.length === draft.length);
  for (const distribution of [target, draft]) {
    assert.equal(show(sum(distribution)), "1");
    assert.ok(distribution.every(p => cmp(p, Z) >= 0));
  }
  const accepted = target.map((p, i) => mul(draft[i], cmp(draft[i], Z) === 0 ? Z : cmp(p, draft[i]) < 0 ? div(p, draft[i]) : ONE));
  const rejected = sub(ONE, sum(accepted));
  const residual = target.map((p, i) => cmp(p, draft[i]) > 0 ? sub(p, draft[i]) : Z);
  const mass = sum(residual);
  const output = target.map((_, i) => add(accepted[i], cmp(mass, Z) === 0 ? Z : mul(rejected, div(residual[i], mass))));
  return { accepted, rejected, output };
}
