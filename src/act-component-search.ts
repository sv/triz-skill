/** Backward, bounded construction of component networks from explicit typed templates. */
import { z } from "zod";
import {
  FunctionModel,
  Box,
  Endpoint,
  Flow,
  checkModel,
  type FunctionModel as Model,
} from "./act.js";
import { allocated } from "./act-effect-insert.js";
import { rewrite, type RewriteStep } from "./act-rewrite.js";
import {
  EngineeringBudget,
  FiniteContract,
  ImplementationMetadata,
  engineeringInvalid,
  evaluateImplementation,
  modelWork,
} from "./act-contract.js";
import { fail, issue, type Failure } from "./act-issues.js";
import { REWRITE } from "./act-basis.js";

export const ComponentSearchRequest = z.strictObject({
  model: FunctionModel.describe(
    "Retained interface and components; catalogue ports reference its declared carrier ids",
  ),
  resources: z.array(Endpoint).max(100),
  targets: z.array(Endpoint).min(1).max(32),
  catalogue: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        component: Box,
        max_instances: z.number().int().min(1).max(8).default(1),
      }),
    )
    .max(100),
  remove: z.array(z.string().min(1)).max(100).default([]),
  replace_wires: z.array(z.string().min(1)).max(100).default([]),
  flows: z
    .array(Flow)
    .optional()
    .describe("Explicit complete replacement of declared flows"),
  contract: FiniteContract.optional(),
  implementation: ImplementationMetadata.optional(),
  max_components: z.number().int().min(0).max(8).default(4),
  max_work: z.number().int().min(1).max(1_000_000).default(100_000),
  max_states: z.number().int().min(1).max(100_000).default(10_000),
  limit: z.number().int().min(1).max(100).default(20),
  certificate: z
    .boolean()
    .optional()
    .describe(
      "Return existing local Lean typing/behavior certificates for the first reported network",
    ),
});

type End = z.infer<typeof Endpoint>;
type Wire = Model["wires"][number];
type Component = Model["boxes"][number];
const key = (e: End) => JSON.stringify([e.box, e.port]);
export function searchComponents(input: unknown) {
  const parsed = ComponentSearchRequest.safeParse(input);
  if (!parsed.success) return engineeringInvalid(parsed.error.issues);
  const a = parsed.data,
    check = checkModel(a.model, "$.model");
  if (!check.ok) return fail(check.issues);
  const bad = (path: string, message: string, hint: string) =>
    fail([issue("invalid-argument", path, message, hint)]);
  if (!!a.contract !== !!a.implementation)
    return bad(
      "$.contract",
      "Contract and implementation evidence must be supplied together",
      "Supply both for property checks, or omit both for typed wiring candidates.",
    );
  if (
    a.model.boxes.some((b) => b.inner) ||
    a.catalogue.some((t) => t.component.inner)
  )
    return fail([
      issue(
        "hierarchy-substitution",
        "$.model",
        "Component search requires expanded hierarchy",
        "Expand nested components before topology search.",
      ),
    ]);
  for (const [path, ids] of [
    ["catalogue", a.catalogue.map((t) => t.id)],
    ["remove", a.remove],
    ["replace_wires", a.replace_wires],
    ["resources", a.resources.map(key)],
    ["targets", a.targets.map(key)],
  ] as const)
    if (new Set(ids).size !== ids.length)
      return bad(
        `$.${path}`,
        "A declaration is listed twice",
        "List each catalogue entry, component, wire or endpoint once.",
      );
  if (a.contract) {
    const c = checkModel(a.contract.target, "$.contract.target");
    if (!c.ok) return fail(c.issues);
  }
  for (const [i, t] of a.catalogue.entries()) {
    if (t.component.role === "product")
      return bad(
        `$.catalogue[${i}].component.role`,
        "New product boxes would change the required interface",
        "Use tool, mediator or environment templates and retain the existing product ports.",
      );
    const c = checkModel(
      {
        domain: a.model.domain,
        carriers: a.model.carriers,
        boxes: [t.component],
        wires: [],
      },
      `$.catalogue[${i}]`,
    );
    if (!c.ok)
      return fail(
        c.issues.map((e) => ({
          ...e,
          path: e.path
            .replace(
              `$.catalogue[${i}].boxes[0]`,
              `$.catalogue[${i}].component`,
            )
            .replace(`$.catalogue[${i}].carriers`, "$.model.carriers"),
        })),
      );
    if (
      (t.component.inputs?.length ?? 0) > 16 ||
      (t.component.outputs?.length ?? 0) > 16
    )
      return bad(
        `$.catalogue[${i}].component`,
        "A component exceeds the 16-input/output search bound",
        "Use a smaller interface or a reviewed finite subsystem summary.",
      );
  }
  const budget = new EngineeringBudget(a.max_work);
  const inputWork =
    modelWork(a.model) +
    a.catalogue.reduce(
      (n, t) =>
        n +
        modelWork({
          domain: a.model.domain,
          carriers: [],
          boxes: [t.component],
          wires: [],
        }),
      0,
    ) +
    (a.contract ? modelWork(a.contract.target) : 0);
  let capped = !budget.spend(inputWork),
    unknown = false,
    failure: Failure | undefined;
  const removed = new Set(a.remove);
  const removedWires = a.model.wires
    .filter(
      (w) =>
        removed.has(w.from.box) ||
        removed.has(w.to.box) ||
        a.replace_wires.includes(w.id),
    )
    .map((w) => w.id);
  for (const id of a.replace_wires)
    if (!a.model.wires.some((w) => w.id === id))
      return bad(
        "$.replace_wires",
        `Unknown wire '${id}'`,
        "Name existing wires to replace.",
      );
  const deletion: RewriteStep = {
    delete: {
      boxes: a.remove,
      wires: removedWires,
      ...(a.flows ? { flows: (a.model.flows ?? []).map((f) => f.id) } : {}),
    },
    ...(a.flows ? { add: { flows: a.flows } } : {}),
  };
  const base = rewrite(a.model, deletion);
  if (!base.ok) return base;
  const endpoint = (m: Model, e: End, side: "inputs" | "outputs") =>
    m.boxes.find((b) => b.id === e.box)?.[side]?.find((p) => p.id === e.port);
  for (const [i, e] of a.resources.entries())
    if (!endpoint(base.model, e, "outputs"))
      return bad(
        `$.resources[${i}]`,
        "Resource is not a retained output port",
        "Select an existing output that remains after removal.",
      );
  const initialGoals = [...a.targets];
  // Deleting a supplier also makes its retained consumers obligations; no useful
  // function may silently disappear merely because the caller omitted its target.
  for (const w of a.model.wires)
    if (
      removedWires.includes(w.id) &&
      !removed.has(w.to.box) &&
      !initialGoals.some((e) => key(e) === key(w.to))
    )
      initialGoals.push(w.to);
  for (const [i, e] of initialGoals.entries()) {
    if (!endpoint(base.model, e, "inputs"))
      return bad(
        `$.targets[${i}]`,
        "Target is not a retained input port",
        "Select existing destination inputs that remain after removal.",
      );
    if (base.model.wires.some((w) => key(w.to) === key(e)))
      return bad(
        "$.targets",
        "A target is already supplied by a retained wire",
        "Explicitly include its supplier in replace_wires before searching.",
      );
  }
  type Evaluation = ReturnType<typeof evaluateImplementation>;
  type Candidate = {
    model: Model;
    rewrite: RewriteStep;
    components: Array<{ box: string; template: string }>;
    result?: Evaluation;
  };
  const candidates: Candidate[] = [],
    results: Array<{
      components: Candidate["components"];
      result: Evaluation;
    }> = [];
  let checkedCount = 0,
    satisfyingCount = 0;
  const counts = Array<number>(a.catalogue.length).fill(0);
  const search = (
    boxes: Component[],
    wires: Wire[],
    goals: End[],
    choices: Candidate["components"],
  ) => {
    if (capped || failure) return;
    if (!budget.spend(1 + boxes.length + wires.length + goals.length)) {
      capped = true;
      return;
    }
    if (!goals.length) {
      if (
        !budget.spend(
          modelWork(base.model) +
            boxes.reduce(
              (n, b) =>
                n +
                modelWork({
                  domain: a.model.domain,
                  carriers: [],
                  boxes: [b],
                  wires: [],
                }),
              0,
            ) +
            wires.length * 3,
        )
      ) {
        capped = true;
        return;
      }
      const step: RewriteStep = {
          ...deletion,
          add: { ...deletion.add, boxes, wires },
        },
        applied = rewrite(a.model, step);
      if (!applied.ok) {
        failure = applied;
        return;
      }
      checkedCount++;
      const result =
        a.contract && a.implementation
          ? evaluateImplementation(
              a.contract,
              {
                ...a.implementation,
                id: `network-${checkedCount}`,
                model: applied.model,
              },
              budget,
              a.max_states,
            )
          : undefined;
      if (result && !result.ok) {
        failure = result;
        return;
      }
      if (result?.verdict === "undecided") {
        unknown = true;
        if (result.reason === "work-cap") capped = true;
      }
      if (result && results.length < a.limit)
        results.push({ components: choices, result });
      if (!result || result.verdict === "satisfied") {
        satisfyingCount++;
        candidates.push({
          model: applied.model,
          rewrite: step,
          components: choices,
          ...(result ? { result } : {}),
        });
        candidates.sort((x, y) => x.components.length - y.components.length);
        if (candidates.length > a.limit) candidates.pop();
      }
      return;
    }
    const m = { ...base.model, boxes: [...base.model.boxes, ...boxes] },
      [goal, ...rest] = goals;
    const needed = endpoint(m, goal, "inputs")!;
    const available = [
      ...a.resources,
      ...boxes.flatMap((b) =>
        (b.outputs ?? []).map((p) => ({ box: b.id, port: p.id })),
      ),
    ];
    const wireId = allocated(
      "component-wire-",
      [...a.model.wires, ...wires].map((w) => w.id),
    );
    for (const from of available) {
      if (!budget.spend()) {
        capped = true;
        return;
      }
      if (endpoint(m, from, "outputs")!.carrier !== needed.carrier) continue;
      const wire: Wire = {
        id: wireId(),
        from,
        to: goal,
        carrier: needed.carrier,
        polarity: "useful",
      };
      search(boxes, [...wires, wire], rest, choices);
      if (capped || failure) return;
    }
    if (boxes.length >= a.max_components) return;
    for (const [i, t] of a.catalogue.entries()) {
      if (!budget.spend()) {
        capped = true;
        return;
      }
      if (counts[i] >= t.max_instances) continue;
      for (const output of t.component.outputs ?? []) {
        if (!budget.spend()) {
          capped = true;
          return;
        }
        if (output.carrier !== needed.carrier) continue;
        const fresh = allocated(
          "component-box-",
          m.boxes.map((b) => b.id),
        )();
        const b = { ...t.component, id: fresh };
        const wire: Wire = {
          id: wireId(),
          from: { box: b.id, port: output.id },
          to: goal,
          carrier: needed.carrier,
          polarity: "useful",
        };
        counts[i]++;
        search(
          [...boxes, b],
          [...wires, wire],
          [
            ...rest,
            ...(b.inputs ?? []).map((p) => ({ box: b.id, port: p.id })),
          ],
          [...choices, { box: b.id, template: t.id }],
        );
        counts[i]--;
        if (capped || failure) return;
      }
    }
  };
  search([], [], initialGoals, []);
  if (failure) return failure;
  // Enumerate the entire bounded space before claiming a best ranking or no match.
  candidates.sort((x, y) => x.components.length - y.components.length);
  return {
    ok: true as const,
    verdict: capped
      ? ("undecided" as const)
      : satisfyingCount
        ? a.contract
          ? ("synthesized" as const)
          : ("candidates" as const)
        : unknown
          ? ("undecided" as const)
          : ("impossible-in-library" as const),
    ...(capped ? { reason: "work-cap" } : {}),
    complete: !capped,
    allDecided: !capped && !unknown,
    checkedCount,
    satisfyingCount,
    candidates: capped ? [] : candidates,
    results,
    listedLimit: a.limit,
    truncated: satisfyingCount > a.limit,
    work: budget.used,
    maxWork: budget.max,
    basis: REWRITE,
    candidateSpace: {
      maxComponents: a.max_components,
      complete: !capped,
      scope:
        "Goal-directed networks with at most max_components template instances, their declared instance bounds, retained resources and explicit removals; every created component feeds a target. Unused disconnected additions are excluded.",
    },
    note: a.contract
      ? "Each satisfying network meets one whole-model finite behavior, adequacy, harm and resource contract using its own declarations. Evidence remains empirical; no dynamic or physical-property inference is performed."
      : "Candidates satisfy typed wiring obligations only. Supply a finite contract and implementation evidence to check behavior, acceptable outputs, harms and resources. No physical properties are inferred.",
  };
}
