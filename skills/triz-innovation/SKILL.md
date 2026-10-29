---
name: triz-innovation
description: "Apply TRIZ to identify, model, solve, and validate contradictions in artificial systems. Use for product, service, process, organizational, demand, supply, engagement, public-relations, and technical problems where improving one outcome worsens another, a harmful effect persists, or incremental optimization has stalled."
license: MIT
metadata:
  version: 0.2.0
  source: https://github.com/sv/triz-skill
---

# TRIZ Innovation

Eliminate the contradiction instead of selecting a compromise. Treat products, services,
organizations, markets, operations, and technical artifacts as systems with components,
interactions, resources, constraints, and measurable outcomes.

Follow MATRIZ's three stages: problem identification, problem solving, and concept justification.
The references split problem solving into modeling and synthesis only to route tools.

## Operating rules

1. Define the system boundary, owner, affected stakeholders, goal, baseline, constraints, and harms.
2. Diagnose before ideating. Do not begin with the 40 principles.
3. Model the mechanism that makes an improvement worsen another outcome.
4. Use the contradiction matrix only when both sides credibly map to engineering parameters.
   Never force people, trust, or market behavior into a physical analogy.
5. Keep fact, inference, and hypothesis visibly separate.
6. A concept is not a resolution until a domain-relevant test supports it.

## When NOT to use TRIZ here

Decline or stop the workflow — and say so — when any of these hold:

- **No opposing states.** The situation is ordinary prioritization or resource allocation, not
  one property needing contradictory values. Choose directly; do not manufacture a contradiction.
- **A cheap measurement decides it.** If one experiment or data pull reveals which side matters,
  measure instead of modeling.
- **A standard pattern already resolves it.** Caching, versioning, queues, feature flags,
  staged rollout: apply the known pattern; TRIZ adds nothing.
- **One option is simply better under stated constraints.** Trade-off analysis suffices.
- **The conflict is between people, not parameters.** Authority, incentives, or negotiation
  work; forcing stakeholders into engineering parameters distorts the problem.

A forced contradiction poisons everything downstream — the matrix will happily return
principles for a conflict that does not exist.

## Deterministic lookup

If the `triz` MCP server is available (published as `npx -y triz-mcp`, or run from a checkout
with `tsx src/server.ts`), cite only parameters, principles, and matrix cells you retrieved
from it — never numbers recalled from memory; a blank or diagonal cell is a fail-closed answer,
not a gap to fill. The skill remains usable without the server, but the recall rule stands.
See [tool-selection.md](references/tool-selection.md).

## Workflow

1. **Frame.** Establish the boundary, decision owner, stakeholders, desired outcome, baseline,
   undesirable effect, constraints, guardrails, and available evidence.
2. **Diagnose.** Trace functions, flows, causes, operating conditions, and available resources.
   Select the key problem by causal reach, severity, controllability, and strategic relevance.
3. **Model.** State a causal technical contradiction, a physical contradiction, an incomplete or
   harmful interaction, or a missing function. Define the Ideal Final Result.
4. **Synthesize.** Generate at least three mechanisms that remove or separate the conflict. Name
   the resource, assumption, expected benefit, displaced harm, and fastest falsifying test.
   Where several mechanisms resolve the contradiction equally well on the evidence you have,
   select the **weakest** — the one that commits to the fewest facts about the operating
   conditions, and therefore admits the most future situations. Simplicity and brevity break
   ties; they do not decide them. Record the commitments each rejected mechanism would have
   made. See [weakness.md](references/weakness.md).
5. **Substantiate.** Compare the best concept with the baseline using outcome, cost, time,
   quality, resilience, and harm measures. A failure creates a new contradiction to model.

Detailed templates and the repair loop are in [workflow.md](references/workflow.md). Route tools
by stage and problem shape with [tool-selection.md](references/tool-selection.md).

## Output

Return a compact decision record:

1. frame and evidence;
2. key problem and causal chain;
3. contradiction or interaction model;
4. tools selected and why;
5. three candidate mechanisms;
6. recommended concept and rejected alternatives;
7. substantiation plan, metrics, guardrails, and remaining uncertainty.

Read only what the task needs:

- demand, supply, engagement, public relations, service, process, or organization:
  [domain-guides.md](references/domain-guides.md);
- tool routing, the routed tool catalog, and deterministic MCP lookup:
  [tool-selection.md](references/tool-selection.md);
- exact artifacts, concept templates, MPV analysis, failure prediction, and repair:
  [workflow.md](references/workflow.md);
- function models as typed data, harm loops, trimming screens, trims decided under declared
  behaviour, bounded dynamics, separation checks, typed transformations, 9-windows views and
  transitions, and exports:
  [categorical-model.md](references/categorical-model.md);
- ARIZ entry criteria and the ARIZ-85C part ladder: [ariz.md](references/ariz.md);
- S-curve staging and evolution lines: [evolution-trends.md](references/evolution-trends.md);
- design-around moves and their cautions: [patent-circumvention.md](references/patent-circumvention.md);
- methodology and research provenance: [sources.md](references/sources.md).

## Anti-patterns

- Recalling matrix cells or principle numbers from memory.
- Forcing market or organizational language into engineering parameters.
- Treating brainstorming as diagnosis.
- Optimizing one stakeholder's metric while hiding transferred harm.
- Confusing the Ideal Final Result with the ideality ratio.
- Naming a principle without a causal mechanism.
- Declaring success without baseline, test, and guardrails.
- Selecting the shortest or most elegant concept over one that assumes less about the operating
  conditions, when both resolve the contradiction on the available evidence.
