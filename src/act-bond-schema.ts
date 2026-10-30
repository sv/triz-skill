import { z } from "zod";
import { SI } from "./act-dimensions.js";
const Quantity = z.strictObject({ quantity: z.string().min(1), si: SI });
export const EnergyDomain = z.strictObject({
  name: z.string().min(1),
  kind: z.enum(["energy", "thermal-approximation"]),
  effort: Quantity,
  flow: Quantity,
  power_si: SI,
  approximation: z.string().min(1).optional(),
});
export const BondElement = z.strictObject({
  element: z.enum(["Se", "Sf", "R", "C", "I", "TF", "GY", "0", "1"]),
  parameters: z.record(z.string(), z.number()).optional(),
});
