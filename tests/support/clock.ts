/**
 * A clock box for horizon-free dynamics (C5): it counts s0, s1, … one step at a time, past the
 * default horizon of 20. Without `loop` it stops at s<last>, first reached at time `last`. With
 * `loop`, it wraps from s<loop> back to s0 and also declares `bad`, which no run reaches; with
 * `port`, it outputs `hi` in `bad` and `lo` elsewhere, so a port target can name `bad`.
 */
import type { FunctionModel } from "../../src/act.js";

export function clock(last: number, opts: { loop?: boolean; port?: boolean } = {}): FunctionModel {
  const states = Array.from({ length: last + 1 }, (_, i) => `s${i}`);
  const out = (s: string): Record<string, string> => (opts.port ? { o: s === "bad" ? "hi" : "lo" } : {});
  const transition = states.map((s, i) => ({ state: s, in: {}, next: i < last ? `s${i + 1}` : opts.loop ? "s0" : s, out: out(s) }));
  if (opts.loop) transition.push({ state: "bad", in: {}, next: "bad", out: out("bad") });
  return {
    domain: "software",
    carriers: opts.port ? [{ id: "level", layer: "information", dimension: "level", values: ["lo", "hi"] }] : [],
    boxes: [{ id: "clock", name: "Clock", role: "tool", ...(opts.port ? { outputs: [{ id: "o", carrier: "level" }] } : {}),
      state: opts.loop ? [...states, "bad"] : states, initial: ["s0"], transition }],
    wires: [],
  };
}
