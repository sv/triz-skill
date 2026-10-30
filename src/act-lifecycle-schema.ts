import { z } from "zod";
import { rational, cmp, Z, ONE } from "./act-rational.js";
export const Probability = z
  .union([z.number().min(0).max(1), z.string().max(512)])
  .refine((x) => {
    try {
      const r = rational(x);
      return cmp(r, Z) >= 0 && cmp(r, ONE) <= 0;
    } catch {
      return false;
    }
  }, "Use a rational probability between zero and one");
const Cost = z.record(
  z
    .string()
    .min(1)
    .regex(/^(?!__proto__$)/),
  z.number().nonnegative(),
);
export const MaintenanceAction = z.strictObject({
  id: z.string().min(1),
  guard: z.array(z.string().min(1)).min(1),
  cost: Cost.optional(),
  transitions: z
    .array(
      z.strictObject({
        state: z.string().min(1),
        next: z.string().min(1),
        probability: Probability.optional(),
        cost: Cost.optional(),
      }),
    )
    .min(1),
});
export const LifecycleStates = z.strictObject({
  states: z.array(z.string().min(1)).min(1),
  acceptable: z.array(z.string()).optional(),
  situations: z
    .record(
      z.string(),
      z.array(
        z.strictObject({
          box: z.string(),
          port: z.string(),
          value: z.string(),
        }),
      ),
    )
    .optional(),
});

/** Fractions are optional explicit input for recurring costs; decimal numbers remain supported. */
export const RecurringCost = z.record(
  z
    .string()
    .min(1)
    .regex(/^(?!__proto__$)/),
  z.union([
    z.number().nonnegative(),
    z
      .string()
      .max(512)
      .regex(/^[+-]?\d+\/[1-9]\d*$/)
      .refine((x) => {
        try {
          return cmp(rational(x), Z) >= 0;
        } catch {
          return false;
        }
      }, "Use a nonnegative rational cost"),
  ]),
);
