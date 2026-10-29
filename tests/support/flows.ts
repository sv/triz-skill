/**
 * Flow fixtures: a generic cooling-water line (pump, two valves in series, a heat exchanger) and a
 * request path (clients, gateway, auth, rate limiter, service, job queue). Shared by the flow and
 * export tests.
 */
import { FunctionModel } from "../../src/act.js";

/** Cooling water: pump → isolation valve → control valve → exchanger, back to the tank. The stages act on the coolant, not on each other. */
export const line = (): FunctionModel => FunctionModel.parse({
  domain: "physical",
  system: "Cooling-water line",
  carriers: [
    { id: "water", layer: "material", dimension: "m³/h cooling water" },
    { id: "head", layer: "energy", dimension: "kPa pressure head" },
    { id: "heat", layer: "energy", dimension: "W thermal" },
  ],
  boxes: [
    { id: "tank", name: "Supply tank", role: "environment" },
    { id: "pump", name: "Pump", role: "tool", outputs: [{ id: "head-out", carrier: "head" }], cost: { usd_month: 120 } },
    { id: "valve-a", name: "Isolation valve", role: "tool", outputs: [{ id: "drop", carrier: "head" }], cost: { usd_month: 10 } },
    { id: "valve-b", name: "Control valve", role: "tool", outputs: [{ id: "drop", carrier: "head" }, { id: "seep", carrier: "water" }], cost: { usd_month: 25 } },
    { id: "exchanger", name: "Heat exchanger", role: "tool", outputs: [{ id: "cool", carrier: "heat" }], cost: { usd_month: 60 } },
    { id: "coolant", name: "Cooling water", role: "product", inputs: [{ id: "head-in", carrier: "head" }, { id: "heat-in", carrier: "heat" }] },
    { id: "sump", name: "Drain sump", role: "mediator" },
    { id: "ground", name: "Ground", role: "environment", inputs: [{ id: "wet", carrier: "water" }] },
  ],
  wires: [
    { id: "w-pump", from: { box: "pump", port: "head-out" }, to: { box: "coolant", port: "head-in" }, carrier: "head", polarity: "useful", verb: "pressurize" },
    { id: "w-valve-a", from: { box: "valve-a", port: "drop" }, to: { box: "coolant", port: "head-in" }, carrier: "head", polarity: "harmful", verb: "drop the pressure of" },
    { id: "w-valve-b", from: { box: "valve-b", port: "drop" }, to: { box: "coolant", port: "head-in" }, carrier: "head", polarity: "useful", verb: "regulate" },
    { id: "w-cool", from: { box: "exchanger", port: "cool" }, to: { box: "coolant", port: "heat-in" }, carrier: "heat", polarity: "useful", verb: "cool" },
    { id: "w-leak", from: { box: "valve-b", port: "seep" }, to: { box: "ground", port: "wet" }, carrier: "water", polarity: "harmful", verb: "leak onto" },
  ],
  flows: [
    { id: "loop", carrier: "water", medium: "coolant", path: ["tank", "pump", "valve-a", "valve-b", "exchanger", "tank"] },
    { id: "bleed", carrier: "water", path: ["valve-b", "sump"] },
  ],
});

/** Requests: two clients through a gateway, auth, and a rate limiter to a service, which queues jobs. */
export const requests = (): FunctionModel => {
  const port = (id: string) => ({ id, carrier: "request" });
  return FunctionModel.parse({
    domain: "software",
    carriers: [{ id: "request", layer: "information", dimension: "HTTP request" }, { id: "load", layer: "information", dimension: "requests/s" }],
    boxes: [
      { id: "web", name: "Web client", role: "supersystem", outputs: [port("out")] },
      { id: "mobile", name: "Mobile client", role: "supersystem", outputs: [port("out")] },
      { id: "gateway", name: "API gateway", role: "mediator", inputs: [port("in"), { id: "load-in", carrier: "load" }], outputs: [port("out")] },
      { id: "auth", name: "Auth middleware", role: "mediator", inputs: [port("in")], outputs: [port("out")] },
      { id: "limiter", name: "Rate limiter", role: "mediator", inputs: [port("in")], outputs: [port("out"), { id: "load-out", carrier: "load" }] },
      { id: "service", name: "Service", role: "product", inputs: [port("in")], outputs: [port("enqueue")] },
      { id: "queue", name: "Job queue", role: "mediator", inputs: [port("in")] },
    ],
    wires: [
      { id: "w-web", from: { box: "web", port: "out" }, to: { box: "gateway", port: "in" }, carrier: "request", polarity: "useful" },
      { id: "w-mobile", from: { box: "mobile", port: "out" }, to: { box: "gateway", port: "in" }, carrier: "request", polarity: "useful" },
      { id: "w-route", from: { box: "gateway", port: "out" }, to: { box: "auth", port: "in" }, carrier: "request", polarity: "useful" },
      { id: "w-check", from: { box: "auth", port: "out" }, to: { box: "limiter", port: "in" }, carrier: "request", polarity: "useful" },
      { id: "w-admit", from: { box: "limiter", port: "out" }, to: { box: "service", port: "in" }, carrier: "request", polarity: "insufficient", verb: "admit" },
      { id: "w-report", from: { box: "limiter", port: "load-out" }, to: { box: "gateway", port: "load-in" }, carrier: "load", polarity: "useful", verb: "report load to" },
      { id: "w-enqueue", from: { box: "service", port: "enqueue" }, to: { box: "queue", port: "in" }, carrier: "request", polarity: "useful" },
    ],
    flows: [
      { id: "from-web", carrier: "request", path: ["web", "gateway", "auth", "limiter", "service", "queue"] },
      { id: "from-mobile", carrier: "request", path: ["mobile", "gateway", "auth", "limiter", "service", "queue"] },
    ],
  });
};
