/** Explicit SI dimensions. Unit symbols: NIST SP 811, table 1 (see sources.md).
 * No prefixes, derived-unit dictionary, scale factors, or inference from labels. */
import { z } from "zod";

export const SI_BASES = ["L", "M", "T", "I", "Θ", "N", "J"] as const;
export type SIVector = Partial<Record<(typeof SI_BASES)[number], number>>;
const symbols = new Map<string, (typeof SI_BASES)[number]>([
  ["m", "L"],
  ["kg", "M"],
  ["s", "T"],
  ["A", "I"],
  ["K", "Θ"],
  ["mol", "N"],
  ["cd", "J"],
]);

/** Products and one denominator of base units, with signed integer powers. */
export function parseUnit(unit: string): SIVector | undefined {
  if (unit.length > 512) return undefined;
  const result: SIVector = {};
  if (unit.trim() === "1") return result;
  const sides = unit.trim().split("/");
  if (sides.length > 2 || sides.some((x) => !x.trim())) return undefined;
  for (let side = 0; side < sides.length; side++) {
    const factors = sides[side].trim().split(/\s*[·*]\s*|\s+/);
    for (const factor of factors) {
      const match = /^(kg|mol|cd|m|s|A|K)(?:\^([+-]?\d+))?$/.exec(factor);
      if (!match) return undefined;
      const exponent = Number(match[2] ?? 1) * (side ? -1 : 1),
        key = symbols.get(match[1])!;
      const value = (result[key] ?? 0) + exponent;
      if (!Number.isSafeInteger(exponent) || !Number.isSafeInteger(value))
        return undefined;
      result[key] = value;
    }
  }
  return result;
}
const exponent = z.number().int().safe().optional();
export const DimensionVector = z.strictObject({
  L: exponent,
  M: exponent,
  T: exponent,
  I: exponent,
  Θ: exponent,
  N: exponent,
  J: exponent,
});
export const SI = z.union([
  DimensionVector,
  z
    .string()
    .min(1)
    .max(512)
    .refine(
      (x) => parseUnit(x) !== undefined,
      "Use SI base units m, kg, s, A, K, mol, cd, products, /, and integer ^ powers",
    ),
]);
export type SI = z.infer<typeof SI>;
export function dimensionKey(si: SI | undefined): string {
  if (si === undefined) return "undeclared";
  const vector = typeof si === "string" ? parseUnit(si) : si;
  if (!vector) return "invalid";
  return JSON.stringify(SI_BASES.map((k) => vector[k] ?? 0));
}
/** Missing declarations match only missing declarations; they never establish a dimension. */
export const sameDimension = (a: SI | undefined, b: SI | undefined) =>
  dimensionKey(a) !== "invalid" && dimensionKey(a) === dimensionKey(b);
export const dimensionConflict = (a: SI | undefined, b: SI | undefined) =>
  a !== undefined && b !== undefined && !sameDimension(a, b);
