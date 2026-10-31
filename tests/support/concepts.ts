/**
 * Support concepts for the weakness ranking: a box `support` reading the
 * lubrication and the temperature (the situations) and supporting the shaft where `ok` says so.
 * Every concept uses the same box and port ids, so they read the same situations.
 */
import type { FunctionModel } from "../../src/act.js";

export function supportConcept(name: string, ok: (lube: string, temp: string) => boolean | "none"): FunctionModel {
  const rows = ["oiled", "dry"].flatMap((lube) => ["normal", "hot"].flatMap((temp) => {
    const v = ok(lube, temp);
    return v === "none" ? [] : [{ in: { lube, temp }, out: { race: v ? "supported" : "unsupported" } }];
  }));
  return {
    domain: "physical",
    carriers: [
      { id: "torque", layer: "energy", dimension: "N·m", values: ["rated"] },
      { id: "radial-load", layer: "energy", dimension: "N radial support", values: ["supported", "unsupported"] },
      { id: "lube", layer: "material", dimension: "lubricant film", values: ["oiled", "dry"] },
      { id: "temp", layer: "energy", dimension: "K ambient", values: ["normal", "hot"] },
    ],
    boxes: [
      { id: "motor", name: "Drive motor", role: "tool", outputs: [{ id: "shaft-out", carrier: "torque" }], behavior: [{ in: {}, out: { "shaft-out": "rated" } }] },
      { id: "support", name, role: "mediator", inputs: [{ id: "lube", carrier: "lube" }, { id: "temp", carrier: "temp" }], outputs: [{ id: "race", carrier: "radial-load" }], behavior: rows },
      { id: "shaft", name: "Shaft", role: "product", inputs: [{ id: "drive", carrier: "torque" }, { id: "support", carrier: "radial-load" }] },
    ],
    wires: [
      { id: "w-drive", from: { box: "motor", port: "shaft-out" }, to: { box: "shaft", port: "drive" }, carrier: "torque", polarity: "useful" },
      { id: "w-support", from: { box: "support", port: "race" }, to: { box: "shaft", port: "support" }, carrier: "radial-load", polarity: "useful" },
    ],
  };
}

export const SUPPORT_ACCEPTABLE = [{ box: "shaft", port: "drive", values: ["rated"] }, { box: "shaft", port: "support", values: ["supported"] }];
/** Three concepts: ball and bushing are incomparable, and each is strictly weaker than tight. */
export const supportConcepts = () => [
  { id: "ball", model: supportConcept("Ball bearing", (lube) => lube === "oiled") },
  { id: "bushing", model: supportConcept("Polymer bushing", (_, temp) => temp === "normal") },
  { id: "tight", model: supportConcept("Tight-fit bearing", (lube, temp) => lube === "oiled" && temp === "normal") },
];
