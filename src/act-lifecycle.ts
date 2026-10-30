/** Finite average-cost policies, exact rational elimination and Bellman checks.
 * Enumeration is bounded. A scalar optimality witness is required; unsupported
 * multichain cases remain undecided rather than choosing an arbitrary occupancy. */
import { z } from "zod";
import { FunctionModel, checkModel } from "./act.js";
import { fail, issue, at } from "./act-issues.js";
import { boundedDynamics } from "./act-dynamics.js";
import {
  Z,
  ONE,
  q,
  rational,
  add,
  sub,
  mul,
  cmp,
  sum,
  show,
  approx,
  solve,
  type Q,
} from "./act-rational.js";
export const LifecycleRequest = z.strictObject({
  model: FunctionModel,
  box: z.string().optional(),
  weights: z.record(z.string(), z.number().nonnegative()).optional(),
  acceptable: z.array(z.string()).optional().describe("Acceptable states for availability reporting. Box-local calls default to an empty list; model-level calls default to model.lifecycle.acceptable."),
  derive_prior: z.boolean().default(false),
  max_steps: z.number().int().min(1).max(1_000_000).default(100_000),
  certificate: z.boolean().optional(),
});
export function lifecycle(raw: z.input<typeof LifecycleRequest>) {
  const parsed = LifecycleRequest.safeParse(raw);
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
          "Use the lifecycle request schema.",
        ),
      ),
    );
  const a = parsed.data,
    m = a.model,
    checked = checkModel(m, "$.model");
  if (!checked.ok) return fail(checked.issues);
  const box = a.box ? m.boxes.find((b) => b.id === a.box) : undefined;
  if (a.box && !box)
    return fail([
      issue(
        "unknown-box",
        "$.box",
        "No such lifecycle box",
        "Select a declared box.",
      ),
    ]);
  const states = box ? box.state : m.lifecycle?.states,
    actions = box ? box.actions : m.actions;
  if (!states || !actions?.length)
    return fail([
      issue(
        "invalid-argument",
        a.box ? "$.box" : "$.model",
        "Lifecycle needs declared states and actions",
        "Supply model.lifecycle.states and model.actions, or select a stateful box with actions.",
      ),
    ]);
  const root = box
    ? at("$.model", "boxes", m.boxes.indexOf(box), "actions")
    : "$.model.actions";
  const holding = box
    ? (box.holding_cost ?? {})
    : (m.lifecycle?.holding_cost ?? {});
  const holdingRoot = box
    ? at("$.model", "boxes", m.boxes.indexOf(box), "holding_cost")
    : "$.model.lifecycle.holding_cost";
  const errors: ReturnType<typeof issue>[] = [];
  const ids = new Set(states);
  for (const state of Object.keys(holding))
    if (!ids.has(state))
      errors.push(
        issue(
          "undeclared-state",
          at(holdingRoot, state),
          "Holding cost names an undeclared lifecycle state",
          "Declare this state in the selected lifecycle, or remove its holding cost.",
        ),
      );
  if (ids.size !== states.length)
    errors.push(
      issue(
        "duplicate-id",
        "$.model.lifecycle.states",
        "Repeated lifecycle state",
        "Declare each state once.",
      ),
    );
  if (new Set(actions.map((x) => x.id)).size !== actions.length)
    errors.push(
      issue(
        "duplicate-id",
        root,
        "Repeated action id",
        "Declare each action id once.",
      ),
    );
  actions.forEach((action, i) => {
    if (new Set(action.guard).size !== action.guard.length)
      errors.push(
        issue(
          "listed-twice",
          at(root, i, "guard"),
          "Repeated guard state",
          "List each state once.",
        ),
      );
    action.guard.forEach((s) => {
      if (!ids.has(s))
        errors.push(
          issue(
            "undeclared-state",
            at(root, i, "guard"),
            "Unknown guard state",
            "Use declared lifecycle states.",
          ),
        );
    });
    action.transitions.forEach((r, j) => {
      if (
        !ids.has(r.state) ||
        !ids.has(r.next) ||
        !action.guard.includes(r.state)
      )
        errors.push(
          issue(
            "undeclared-state",
            at(root, i, "transitions", j),
            "Transition is outside its declared states or guards",
            "Use a declared source guard state and destination state.",
          ),
        );
    });
    for (const s of action.guard) {
      const rows = action.transitions.filter((r) => r.state === s);
      if (!rows.length)
        errors.push(
          issue(
            "invalid-probability",
            at(root, i, "transitions"),
            "An enabled action has no outcomes",
            "Declare outcomes for every guard state.",
          ),
        );
      else if (
        rows.some((r) => r.probability !== undefined) &&
        (rows.some((r) => r.probability === undefined) ||
          cmp(sum(rows.map((r) => rational(r.probability!))), ONE) !== 0)
      )
        errors.push(
          issue(
            "invalid-probability",
            at(root, i, "transitions"),
            "Probabilities must be explicit and sum exactly to one per state/action",
            "Use rational strings, for example 1/3 and 2/3.",
          ),
        );
    }
  });
  // A selected box has its own state space; model-level availability metadata
  // must not implicitly constrain it, even when state names happen to match.
  const acceptable = a.acceptable ?? (box ? [] : m.lifecycle?.acceptable) ?? [];
  if (acceptable.some((s) => !ids.has(s)))
    errors.push(
      issue(
        "undeclared-state",
        a.acceptable !== undefined
          ? "$.acceptable"
          : "$.model.lifecycle.acceptable",
        "Unknown acceptable lifecycle state",
        "Use declared lifecycle states.",
      ),
    );
  const choices = states.map((s) =>
    actions.flatMap((action, i) => (action.guard.includes(s) ? [i] : [])),
  );
  if (choices.some((c) => !c.length))
    errors.push(
      issue(
        "invalid-argument",
        root,
        "Every lifecycle state needs at least one action",
        "Declare an enabled wait or maintenance action for every state.",
      ),
    );
  if (errors.length) return fail(errors);
  const dims = [
    ...new Set([
      ...actions.flatMap((x) => [
        ...Object.keys(x.cost ?? {}),
        ...x.transitions.flatMap((r) => Object.keys(r.cost ?? {})),
      ]),
      ...Object.values(holding).flatMap((c) => Object.keys(c)),
    ]),
  ];
  if (!dims.length)
    return fail([
      issue(
        "invalid-argument",
        root,
        "No lifecycle cost dimension declared",
        "Declare action cost, including explicit zero when appropriate.",
      ),
    ]);
  if (
    a.weights &&
    (dims.some((d) => !Object.hasOwn(a.weights!, d)) ||
      Object.keys(a.weights).some((d) => !dims.includes(d)) ||
      !Object.values(a.weights).some((x) => x > 0))
  )
    return fail([
      issue(
        "invalid-weight",
        "$.weights",
        "Combined lifecycle objective needs explicit weights on every cost dimension",
        "Supply exactly the declared dimensions with nonnegative weights and at least one positive weight.",
      ),
    ]);
  if (
    actions.some((action) =>
      action.transitions.some((r) => r.probability === undefined),
    )
  ) {
    if (a.derive_prior) return { ok: true as const, verdict: "undecided" as const, reason: "probabilities-undeclared" as const };
    const fallback: FunctionModel = {
      domain: m.domain,
      carriers: [],
      wires: [],
      boxes: [
        {
          id: "lifecycle",
          name: "Lifecycle",
          role: "tool",
          state: states,
          initial: states,
          transition: actions.flatMap((action) =>
            action.transitions.map((r) => ({
              state: r.state,
              next: r.next,
              in: {},
              out: {},
              cost: Object.fromEntries(
                [
                  ...new Set([
                    ...Object.keys(action.cost ?? {}),
                    ...Object.keys(r.cost ?? {}),
                    ...Object.keys(holding[r.state] ?? {}),
                  ]),
                ].map((d) => [
                  d,
                  show(
                    add(
                      rational(
                        holding[r.state] && Object.hasOwn(holding[r.state], d)
                          ? holding[r.state][d]
                          : 0,
                      ),
                      add(
                        rational(
                          action.cost && Object.hasOwn(action.cost, d)
                            ? action.cost[d]
                            : 0,
                        ),
                        rational(
                          r.cost && Object.hasOwn(r.cost, d) ? r.cost[d] : 0,
                        ),
                      ),
                    ),
                  ),
                ]),
              ),
            })),
          ),
        },
      ],
    };
    return {
      ok: true as const,
      verdict: "nondeterministic",
      range: boundedDynamics(fallback, {
        maxStates: a.max_steps,
        maxCostWork: a.max_steps,
      }),
      note: "Probabilities are undeclared. This is the T3 range over declared outcomes; no controller/environment game or optimal policy is claimed.",
    };
  }
  const n = states.length;
  if (n * n * actions.length > a.max_steps)
    return {
      ok: true as const,
      verdict: "undecided",
      reason: "lifecycle-table-cap",
    };
  if (n > 64)
    return {
      ok: true as const,
      verdict: "undecided",
      reason: "lifecycle-state-cap",
    };
  const objectives = a.weights
    ? [{ name: "weighted", weights: a.weights }]
    : dims.map((d) => ({ name: d, weights: { [d]: 1 } }));
  let work = 0;
  const charge = () => {
    if (++work > a.max_steps) throw new Error("cap");
  };
  const P = states.map((s) =>
    actions.map((action) =>
      states.map((t) =>
        sum(
          action.transitions
            .filter((r) => r.state === s && r.next === t)
            .map((r) => rational(r.probability!)),
        ),
      ),
    ),
  );
  const C = states.map((s) =>
    actions.map((action) =>
      Object.fromEntries(
        dims.map((d) => [
          d,
          add(
            rational(
              holding[s] && Object.hasOwn(holding[s], d) ? holding[s][d] : 0,
            ),
            add(
              rational(
                action.cost && Object.hasOwn(action.cost, d)
                  ? action.cost[d]
                  : 0,
              ),
              sum(
                action.transitions
                  .filter((r) => r.state === s)
                  .map((r) =>
                    mul(
                      rational(r.probability!),
                      rational(
                        r.cost && Object.hasOwn(r.cost, d) ? r.cost[d] : 0,
                      ),
                    ),
                  ),
              ),
            ),
          ),
        ]),
      ),
    ),
  );
  let improvement: number[] | undefined;
  const evaluate = (policy: number[], weights: Record<string, number>) => {
    improvement = undefined;
    charge();
    work += n * n * n;
    if (work > a.max_steps) throw new Error("cap");
    const p = policy.map((j, i) => P[i][j]),
      cost = policy.map((j, i) =>
        sum(
          Object.entries(weights).map(([d, w]) =>
            mul(rational(w), C[i][j][d] ?? Z),
          ),
        ),
      );
    const eq = p.map((row, i) => [
      ...row.map((x, j) => sub(i === j ? ONE : Z, x)),
      ONE,
      cost[i],
    ]);
    eq.push([...states.map((_, j) => (j === 0 ? ONE : Z)), Z, Z]);
    const solution = solve(eq, n + 1);
    if (!solution) return undefined;
    const h = solution.slice(0, n),
      g = solution[n];
    const improved = [...policy];
    let optimal = true;
    for (let i = 0; i < n; i++) {
      let best = add(g, h[i]);
      for (const j of choices[i]) {
        charge();
        const rhs = add(
          sum(
            Object.entries(weights).map(([d, w]) =>
              mul(rational(w), C[i][j][d] ?? Z),
            ),
          ),
          sum(P[i][j].map((v, k) => mul(v, h[k]))),
        );
        if (cmp(rhs, best) < 0) {
          best = rhs;
          improved[i] = j;
          optimal = false;
        }
      }
    }
    if (!optimal) {
      improvement = improved;
      return undefined;
    }
    const tiedOptimalActions = states.flatMap((state, i) => choices[i].filter(j => {
      charge();
      return P[i][j].some((x, k) => cmp(x, p[i][k]) !== 0) &&
      cmp(add(sum(Object.entries(weights).map(([d,w]) => mul(rational(w), C[i][j][d] ?? Z))), sum(P[i][j].map((v,k) => mul(v,h[k])))), add(g,h[i])) === 0;
    }).map(j => ({state, action: actions[j].id})));
    const station = states.map((_, j) => [
      ...states.map((_, i) => sub(p[i][j], i === j ? ONE : Z)),
      Z,
    ]);
    station.push([...states.map(() => ONE), ONE]);
    const pi = solve(station, n);
    if (!pi || pi.some((x) => cmp(x, Z) < 0)) return undefined;
    const gain = Object.fromEntries(
      dims.map((d) => [
        d,
        show(sum(policy.map((j, i) => mul(pi[i], C[i][j][d])))),
      ]),
    );
    return {
      tiedOptimalActions,
      policy: Object.fromEntries(
        states.map((s, i) => [s, actions[policy[i]].id]),
      ),
      gain,
      objectiveGain: show(g),
      bias: Object.fromEntries(states.map((s, i) => [s, show(h[i])])),
      occupancy: Object.fromEntries(states.map((s, i) => [s, show(pi[i])])),
      availability: show(
        sum(states.flatMap((s, i) => (acceptable.includes(s) ? [pi[i]] : []))),
      ),
      certificateData: {
        p: p.map((r) => r.map(show)),
        pi: pi.map(show),
        h: h.map(show),
        g: show(g),
        cost: cost.map(show),
        policy: policy.map(
          (j, i) =>
            choices.slice(0, i).reduce((a, c) => a + c.length, 0) +
            choices[i].indexOf(j),
        ),
        alternatives: states.map((_, i) =>
          choices[i].map((j) => ({
            p: P[i][j].map(show),
            cost: show(
              sum(
                Object.entries(weights).map(([d, w]) =>
                  mul(rational(w), C[i][j][d] ?? Z),
                ),
              ),
            ),
          })),
        ),
      },
      basis: [
        "Lifecycle.stationary_invariant",
        "Lifecycle.optimality_stationary",
        "Lifecycle.policy_attains_gain",
      ],
    };
  };
  try {
    const solutions = [];
    for (const objective of objectives) {
      let result: ReturnType<typeof evaluate>;
      // Howard-style strict policy improvement; ties retain the incumbent.
      // Singular policies can require a different starting recurrent class, so
      // a separately capped enumeration supplies a complete finite fallback.
      let incumbent = choices.map((c) => c[0]);
      const visited = new Set<string>();
      while (!visited.has(JSON.stringify(incumbent))) {
        visited.add(JSON.stringify(incumbent));
        result = evaluate(incumbent, objective.weights);
        if (result || !improvement) break;
        incumbent = improvement;
      }
      const visit = (policy: number[]) => {
        if (result) return;
        if (policy.length === n) {
          result = evaluate(policy, objective.weights);
          return;
        }
        for (const j of choices[policy.length]) {
          charge();
          visit([...policy, j]);
          if (result) return;
        }
      };
      if (!result) visit([]);
      if (!result)
        return {
          ok: true as const,
          verdict: "undecided",
          reason: "no-scalar-gain-or-unique-occupancy",
          work,
        };
      if (result.tiedOptimalActions.length) return {
        ok: true as const, verdict: "undecided" as const, reason: "tied-optimal-policies" as const,
        objective: objective.name, objectiveGain: result.objectiveGain, tiedActions: result.tiedOptimalActions, work,
        note: "Distinct transition choices satisfy the optimal Bellman equations. Cost optimality is established, but occupancy, availability and derived priors are not claimed unique across optimal policies.",
      };
      let joint_prior:
        | Array<{
            input: Array<{ box: string; port: string; value: string }>;
            weight: number;
          }>
        | undefined;
      if (a.derive_prior) {
        const situations = m.lifecycle?.situations;
        if (!situations || states.some((s) => !Object.hasOwn(situations, s)))
          return fail([
            issue(
              "prior-malformed",
              "$.model.lifecycle.situations",
              "Every lifecycle state needs an explicit operating situation",
              "Map every state to a complete weakness input, including zero-occupancy states.",
            ),
          ]);
        const grouped = new Map<
          string,
          { input: (typeof situations)[string]; weight: Q }
        >();
        for (const s of states) {
          const input = situations[s],
            key = JSON.stringify(
              [...input].sort((a, b) =>
                JSON.stringify([a.box, a.port]).localeCompare(
                  JSON.stringify([b.box, b.port]),
                ),
              ),
            );
          const old = grouped.get(key);
          grouped.set(key, {
            input,
            weight: add(old?.weight ?? Z, rational(result.occupancy[s])),
          });
        }
        joint_prior = [...grouped.values()].map((x) => ({
          input: x.input,
          weight: approx(x.weight),
        }));
      }
      solutions.push({
        objective: objective.name,
        ...result,
        ...(joint_prior ? { joint_prior } : {}),
      });
    }
    return {
      ok: true as const,
      verdict: "optimal",
      solutions,
      work,
      note: "Exact scalar average-cost equations and unique stationary occupancy. Availability is stationary acceptable-state mass. Probabilities are declared data. No ergodic theorem or sample-path frequency claim.",
    };
  } catch (e) {
    if (e instanceof Error && e.message === "cap")
      return {
        ok: true as const,
        verdict: "undecided",
        reason: "lifecycle-work-cap",
        work,
      };
    throw e;
  }
}
