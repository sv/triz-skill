/** Structural causality constraints only; see docs/bond-graphs.md and sources.md.
 * Effort producer is a wire endpoint; flow causality goes the other way. */
import { z } from "zod";
import { FunctionModel, checkModel } from "./act.js";
import {
  SI_BASES,
  parseUnit,
  sameDimension,
  type SI,
} from "./act-dimensions.js";
import { fail, issue, at } from "./act-issues.js";
export const BondGraphRequest = z.strictObject({
  model: FunctionModel,
  max_steps: z.number().int().min(1).max(1_000_000).default(20_000),
});
export function bondGraph(raw: z.input<typeof BondGraphRequest>) {
  const parsed = BondGraphRequest.safeParse(raw);
  if (!parsed.success)
    return fail(
      parsed.error.issues.map((e) =>
        issue(
          "invalid-argument",
          at(
            "$",
            ...e.path.map((x) => (typeof x === "number" ? x : String(x))),
          ),
          e.message,
          "Use the bond-graph schema.",
        ),
      ),
    );
  const { model: m, max_steps: cap } = parsed.data,
    c = checkModel(m, "$.model");
  if (!c.ok) return fail(c.issues);
  const boxes = m.boxes.filter((b) => b.bond),
    boxIds = new Set(boxes.map((b) => b.id)),
    carriers = new Map(m.carriers.map((c) => [c.id, c]));
  if (!boxes.length)
    return fail([
      issue(
        "invalid-bond",
        "$.model.boxes",
        "No bond elements declared",
        "Declare bond.element on every energy-subsystem box.",
      ),
    ]);
  const wires = m.wires.filter(
    (w) => boxIds.has(w.from.box) || boxIds.has(w.to.box),
  );
  const errors: ReturnType<typeof issue>[] = [];
  const vector = (si: SI) => (typeof si === "string" ? parseUnit(si)! : si);
  m.carriers.forEach((c, i) => {
    if (!c.energy) return;
    const d = c.energy,
      e = vector(d.effort.si),
      f = vector(d.flow.si);
    const power = Object.fromEntries(
      SI_BASES.map((k) => [k, (e[k] ?? 0) + (f[k] ?? 0)]),
    );
    if (
      c.layer === "information" ||
      !sameDimension(power, d.power_si) ||
      (d.kind === "thermal-approximation" && !d.approximation)
    )
      errors.push(
        issue(
          "invalid-bond",
          at("$.model", "carriers", i, "energy"),
          "Energy pair is information, dimensionally inconsistent, or lacks a thermal approximation",
          "Declare an energy carrier with effort×flow matching its power_si and document a thermal approximation.",
        ),
      );
  });
  const seenPorts = new Set<string>();
  wires.forEach((w) => {
    const wi = m.wires.indexOf(w);
    if (
      !boxIds.has(w.from.box) ||
      !boxIds.has(w.to.box) ||
      !carriers.get(w.carrier)?.energy ||
      w.from.box === w.to.box
    )
      errors.push(
        issue(
          "invalid-bond",
          at("$.model", "wires", wi),
          "A bond needs two distinct declared energy elements and an energy carrier",
          "Connect declared bond elements on an explicit energy carrier.",
        ),
      );
    for (const e of [w.from, w.to]) {
      const key = JSON.stringify([e.box, e.port]);
      if (seenPorts.has(key))
        errors.push(
          issue(
            "invalid-bond",
            at("$.model", "wires", wi),
            "An energy port is connected more than once",
            "Use one bond per port and an explicit 0/1 junction.",
          ),
        );
      seenPorts.add(key);
    }
  });
  const incident = boxes.map((b) =>
    wires.flatMap((w, i) =>
      w.from.box === b.id || w.to.box === b.id ? [i] : [],
    ),
  );
  boxes.forEach((b, i) => {
    const e = b.bond!.element,
      count = incident[i].length,
      ports = [...(b.inputs ?? []), ...(b.outputs ?? [])];
    const required = ["TF", "GY"].includes(e)
      ? 2
      : ["0", "1"].includes(e)
        ? undefined
        : 1;
    if (
      (required !== undefined && count !== required) ||
      (!required && count < 2) ||
      ports.length !== count
    )
      errors.push(
        issue(
          "invalid-bond",
          at("$.model", "boxes", m.boxes.indexOf(b), "bond"),
          "Element arity or bond port coverage is invalid",
          "Connect every port once: sources/R/C/I have one port, TF/GY two, junctions at least two.",
        ),
      );
    if (["0", "1"].includes(e) && new Set(ports.map((p) => p.carrier)).size > 1)
      errors.push(
        issue(
          "dimension-mismatch",
          at("$.model", "boxes", m.boxes.indexOf(b), "bond"),
          "A junction mixes carrier declarations",
          "Use one carrier per junction; use an explicit TF/GY between domains.",
        ),
      );
    if (["TF", "GY"].includes(e) && ports.length === 2) {
      const a = carriers.get(ports[0].carrier)?.energy,
        b = carriers.get(ports[1].carrier)?.energy;
      if (a && b && !sameDimension(a.power_si, b.power_si))
        errors.push(
          issue(
            "dimension-mismatch",
            at("$.model", "boxes", m.boxes.indexOf(boxes[i]), "bond"),
            "Two-port element power dimensions differ",
            "Use effort/flow pairs with the same power dimension.",
          ),
        );
    }
  });
  if (errors.length) return fail(errors);
  if (wires.length > 128)
    return {
      ok: true as const,
      verdict: "undecided",
      reason: "bond-size-cap",
      basis: [],
    };
  let work = 0;
  const charge = () => {
    if (++work > cap) throw new Error("cap");
  };
  const supplies = (box: string, edge: number, value: number) =>
    value === (wires[edge].from.box === box ? 0 : 1);
  // A rule checks a partial assignment and drives propagation by eliminating
  // unsupported endpoint choices. Source rules and integral preferences go first.
  const compatible = (assign: number[], integral: boolean | Set<string>) =>
    boxes.every((b, k) => {
      const e = b.bond!.element,
        es = incident[k],
        known = es.filter((i) => assign[i] >= 0),
        n = known.filter((i) => supplies(b.id, i, assign[i])).length;
      if (e === "Se" || e === "Sf" || ((integral === true || integral instanceof Set && integral.has(b.id)) && (e === "C" || e === "I"))) {
        const want = e === "Se" || e === "C";
        return !known.length || (n === 1) === want;
      }
      if (e === "TF") return known.length < 2 || n === 1;
      if (e === "GY") return known.length < 2 || n === 0 || n === 2;
      if (e === "0")
        return (
          known.length - n <= 1 &&
          (known.length < es.length || known.length - n === 1)
        );
      if (e === "1") return n <= 1 && (known.length < es.length || n === 1);
      return true;
    });
  const priority = boxes
    .map((b, i) => ({
      i,
      rank: ["Se", "Sf"].includes(b.bond!.element)
        ? 0
        : ["C", "I"].includes(b.bond!.element)
          ? 1
          : 2,
    }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .flatMap((x) => incident[x.i]);
  const order = [...new Set(priority)];
  const boxOrder = new Map(boxes.map((b,i) => [b.id,i]));
  const search = (integral: boolean | Set<string>) => {
    let answer: number[] | undefined;
    const visit = (incoming: number[]) => {
      charge();
      if (answer) return;
      const assign = [...incoming];
      let changed = true;
      while (changed) {
        changed = false;
        for (const i of order) {
          if (assign[i] >= 0) continue;
          charge();
          assign[i] = 0;
          const zero = compatible(assign, integral);
          assign[i] = 1;
          const one = compatible(assign, integral);
          assign[i] = -1;
          if (!zero && !one) return;
          if (zero !== one) {
            assign[i] = zero ? 0 : 1;
            changed = true;
          }
        }
      }
      if (!compatible(assign, integral)) return;
      const i = order.find((i) => assign[i] < 0);
      if (i === undefined) {
        answer = assign;
        return;
      }
      const first = boxOrder.get(wires[i].from.box)! < boxOrder.get(wires[i].to.box)! ? 0 : 1;
      for (const v of [first, 1-first]) {
        const next = [...assign];
        next[i] = v;
        visit(next);
        if (answer) return;
      }
    };
    visit(wires.map(() => -1));
    return answer;
  };
  try {
    let assignment = search(true);
    const integralPossible = !!assignment;
    if (!assignment) assignment = search(false);
    if (!assignment)
      return {
        ok: true as const,
        verdict: "conflict",
        findings: [
          issue(
            "causality-conflict",
            "$.model",
            "No assignment satisfies the source and junction causality constraints",
            "Review sources, junctions, or introduce a declared storage/constitutive change.",
          ),
        ],
        work,
        basis: [],
      };
    if (!compatible(assignment, false))
      throw new Error("invalid causality witness");
    const derivative = boxes.filter(
      (b, k) =>
        ["C", "I"].includes(b.bond!.element) &&
        supplies(b.id, incident[k][0], assignment![incident[k][0]]) !==
          (b.bond!.element === "C"),
    );
    // A derivative choice in one witness does not establish necessity. Check
    // each storage element independently with every other preference relaxed.
    const forcedDerivative = integralPossible ? [] : boxes.filter(b =>
      ["C","I"].includes(b.bond!.element) && !search(new Set([b.id])));
    // Direct-feedthrough dependencies are between individual effort/flow variables,
    // so a bidirectional bond alone is not an algebraic loop.
    const dependencies: Array<[string, string]> = [];
    const key = (edge: number, variable: string) => `${edge}:${variable}`;
    boxes.forEach((b, k) => {
      const e = b.bond!.element,
        es = incident[k];
      if (["Se", "Sf", "C", "I"].includes(e)) return;
      const reads = es.map((i) =>
          key(i, supplies(b.id, i, assignment![i]) ? "flow" : "effort"),
        ),
        writes = es.map((i) =>
          key(i, supplies(b.id, i, assignment![i]) ? "effort" : "flow"),
        );
      for (const read of reads)
        for (const write of writes) {
          const rv = read.split(":")[1],
            wv = write.split(":")[1];
          if (
            e === "R" ||
            (read.split(":")[0] !== write.split(":")[0] &&
              (e === "GY" ? rv !== wv : rv === wv))
          )
            dependencies.push([read, write]);
        }
    });
    const adj = new Map<string, string[]>();
    for (const [u, v] of dependencies) adj.set(u, [...(adj.get(u) ?? []), v]);
    const colour = new Map<string, number>(),
      stack: string[] = [];
    let algebraic: string[] | undefined;
    const visit = (u: string) => {
      charge();
      colour.set(u, 1);
      stack.push(u);
      for (const v of adj.get(u) ?? []) {
        if (colour.get(v) === 1) {
          algebraic = [...stack.slice(stack.indexOf(v)), v];
          break;
        }
        if (!colour.has(v)) visit(v);
        if (algebraic) break;
      }
      stack.pop();
      colour.set(u, 2);
    };
    for (const u of adj.keys()) if (!colour.has(u) && !algebraic) visit(u);
    return {
      ok: true as const,
      verdict: "assigned",
      work,
      integralPossible,
      forcedDerivativeBoxes: forcedDerivative.map(b => b.id),
      causality: wires.map((w, i) => ({
        wire: w.id,
        effortFrom: assignment![i] === 0 ? w.from : w.to,
        flowFrom: assignment![i] === 0 ? w.to : w.from,
      })),
      findings: [
        ...forcedDerivative.map((b) =>
          issue(
            "derivative-causality",
            at("$.model", "boxes", m.boxes.indexOf(b), "bond"),
            "Storage element has derivative causality in every admissible assignment",
            "Review storage independence or accept a differential/algebraic structure.",
          ),
        ),
        ...(!integralPossible && !forcedDerivative.length ? [issue("derivative-causality", "$.model", "No assignment gives every storage element integral causality; the affected element depends on the assignment", "Review storage dependencies; individual storage necessity is reported only when independently established.")] : []),
        ...(algebraic
          ? [
              issue(
                "algebraic-loop",
                "$.model.wires",
                "Direct constitutive dependencies contain an algebraic cycle",
                "Supply constitutive laws and solve the simultaneous constraints; this is not a numerical inconsistency verdict.",
              ),
            ]
          : []),
      ],
      equationStructure: {
        states: boxes
          .filter((b) => ["C", "I"].includes(b.bond!.element))
          .map((b) => ({
            box: b.id,
            element: b.bond!.element,
            causality: derivative.includes(b) ? "derivative" : "integral",
            forcedDerivative: forcedDerivative.includes(b),
          })),
        constraints: boxes.map((b, k) => ({
          box: b.id,
          element: b.bond!.element,
          bonds: incident[k].map((i) => wires[i].id),
          parameters: b.bond!.parameters ?? {},
        })),
        dependencies,
        algebraicCycle: algebraic ?? null,
      },
      basis: [],
      note: "Structural assignment and constitutive equation structure only. No numeric simulation, energetic accuracy, chemical model, or TRIZ contradiction is certified.",
    };
  } catch (e) {
    if (e instanceof Error && e.message === "cap")
      return {
        ok: true as const,
        verdict: "undecided",
        reason: "causality-work-cap",
        work,
        basis: [],
      };
    throw e;
  }
}
