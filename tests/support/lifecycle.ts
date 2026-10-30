import type { FunctionModel } from "../../src/act.js";
/** Synthetic, fully declared finite tables; no empirical maintenance data. */
export function lifecycleModel(): FunctionModel {
  return {
    domain: "software",
    carriers: [],
    boxes: [],
    wires: [],
    lifecycle: { states: ["a", "b"], acceptable: ["a"] },
    actions: [
      {
        id: "stay",
        guard: ["a", "b"],
        cost: { resource: 3 },
        transitions: [
          { state: "a", next: "a", probability: "1/2" },
          { state: "a", next: "b", probability: "1/2" },
          { state: "b", next: "a", probability: "1/4" },
          { state: "b", next: "b", probability: "3/4" },
        ],
      },
      {
        id: "reset",
        guard: ["b"],
        cost: { resource: 1 },
        transitions: [{ state: "b", next: "a", probability: 1 }],
      },
    ],
  };
}
export function costModel(): FunctionModel {
  return {
    domain: "software",
    carriers: [],
    wires: [],
    boxes: [
      {
        id: "machine",
        name: "Machine",
        role: "tool",
        state: ["a", "b"],
        initial: ["a"],
        transition: [
          { state: "a", next: "a", in: {}, out: {}, cost: { resource: 4 } },
          { state: "a", next: "b", in: {}, out: {}, cost: { resource: 1 } },
          { state: "b", next: "a", in: {}, out: {}, cost: { resource: 2 } },
        ],
      },
    ],
  };
}
export function bondModel(): FunctionModel {
  return {
    domain: "physical",
    carriers: [
      {
        id: "energy",
        layer: "energy",
        dimension: "declared",
        energy: {
          name: "synthetic",
          kind: "energy",
          effort: { quantity: "e", si: { L: 1 } },
          flow: { quantity: "f", si: { T: -1 } },
          power_si: { L: 1, T: -1 },
        },
      },
    ],
    boxes: [
      {
        id: "source",
        name: "Source",
        role: "tool",
        bond: { element: "Se" },
        outputs: [{ id: "p", carrier: "energy" }],
      },
      {
        id: "junction",
        name: "Junction",
        role: "mediator",
        bond: { element: "0" },
        inputs: [{ id: "a", carrier: "energy" }],
        outputs: [{ id: "b", carrier: "energy" }],
      },
      {
        id: "load",
        name: "Load",
        role: "product",
        bond: { element: "R" },
        inputs: [{ id: "p", carrier: "energy" }],
      },
    ],
    wires: [
      {
        id: "first",
        from: { box: "source", port: "p" },
        to: { box: "junction", port: "a" },
        carrier: "energy",
        polarity: "useful",
      },
      {
        id: "second",
        from: { box: "junction", port: "b" },
        to: { box: "load", port: "p" },
        carrier: "energy",
        polarity: "useful",
      },
    ],
  };
}
