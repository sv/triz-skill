/**
 * Generic fixtures built from the shipped bearing examples, for the tests that link models: the
 * radial load read through levels (unsupported from 0 N, supported from 2500 N, the shaft's
 * requirement), and the bearing with both declared behaviour and declared feasibility.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunctionModel } from "../../src/act.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const example = (name: string): FunctionModel =>
  FunctionModel.parse(JSON.parse(fs.readFileSync(path.resolve(here, `../../examples/function-models/${name}.json`), "utf8")));

export const box = (m: FunctionModel, id: string) => m.boxes.find((b) => b.id === id)!;
export const carrier = (m: FunctionModel, id: string) => m.carriers.find((c) => c.id === id)!;

/** Radial load read as values: below 2500 N the shaft is unsupported, from 2500 N supported. */
export const RADIAL_LEVELS = [{ value: "unsupported", from: 0 }, { value: "supported", from: 2500 }];

/** A model with levels on its radial-load carrier (which must declare the two values). */
export function withLevels(m: FunctionModel, levels = RADIAL_LEVELS): FunctionModel {
  const out = structuredClone(m);
  carrier(out, "radial-load").levels = structuredClone(levels);
  return out;
}

/**
 * The bearing with declared behaviour, the feasibility rows of bearing-heat-feasibility.json, and
 * radial-load levels. The housing's cheaper row provides 400 N, which reads as unsupported, while
 * its behaviour declares the bore supported: one inconsistency, on purpose.
 */
export function bearingWithRows(): FunctionModel {
  const m = withLevels(example("bearing-heat-behavior"));
  const rows = example("bearing-heat-feasibility");
  for (const b of m.boxes) {
    const f = box(rows, b.id).feasibility;
    if (f) b.feasibility = structuredClone(f);
  }
  return m;
}
