# Working artifacts and concept justification

Use these artifacts when the compact workflow in `SKILL.md` is insufficient.

## Frame

```text
System / supersystem:
Decision owner:
Affected stakeholders:
Desired outcome and baseline:
Undesirable effect:
Constraints / non-negotiables:
Harm guardrails:
Evidence available and missing:
```

Turn “increase demand,” “improve engagement,” or “improve PR” into an observable stakeholder
decision and realized outcome. State whose benefit and cost count.

## Diagnose

Start with the smallest useful set:

- stakeholder requirements for conflicting jobs, outcomes, and constraints;
- component and functional analysis for system structure;
- cause-effect chain analysis for the undesirable effect;
- flow analysis for material, work, information, money, attention, or trust;
- operating zone/time and resources for where and when the conflict exists;
- system operator for subsystem/system/supersystem across past/present/future.

Do not select a key problem merely because it is easy to solve.

## Main parameters of value

Before modeling a contradiction, know which parameters carry value. MPV analysis (Litvin's
Main Parameters of Value, a top-5 tool in current business TRIZ practice) is the identification
pipeline:

1. list the parameters customers and stakeholders actually judge and pay for — the parameters
   of value;
2. classify each on two axes — **satisfaction** (met / unmet) and **awareness** (customers can
   articulate it / they cannot yet):

   | | **Unmet need** | **Met need** |
   |---|---|---|
   | **Known to customers** | **MPV** — improvement directly drives purchase; model its contradiction first | **PV** — maintain; do not over-invest |
   | **Not yet articulated** | **Latent MPV** — the competitor-blind opportunity; needs discovery work (observation, interviews) before it is modelable | **Latent PV** — unclaimed delighter or irrelevant; verify before investing |

3. for each MPV (known first, latent after discovery), find the trend it rides
   ([evolution-trends.md](evolution-trends.md)) and the system parameter that limits it today;
4. the limiting parameter of the highest-ranked MPV is where the next contradiction is worth
   modeling.

Classification honesty: "unmet" and "not articulated" are empirical claims — record the
evidence (survey, interview, observation, churn reason) per cell, and mark inferred
classifications as hypotheses, consistent with keeping fact and inference separate. The
awareness axis descends from Kano's expressed/unspoken distinction; the value framing is
Litvin's.

Improving a parameter nobody pays for is cost without value; ignoring the trend leaves the
decisive MPV open to a competitor's jump. The MPV chain — value driver → trend → limiting
parameter → contradiction — is the backbone of problem identification. When comparing concept
variants, ideality can be computed over the MPV set with explicit weights and normalization
per parameter (functional over cost parameters, in the formalization of current TRIZfest work).

## Model

```text
Technical contradiction:
When [intervention] improves [A], [B] worsens because [causal mechanism].

Physical contradiction:
[Element/property] must be [X] under [condition] to achieve [A], and [not-X] under
[condition] to protect [B].

Ideal Final Result:
[Needed function] occurs by itself, using available resources, without added complexity or harm.
```

The Ideal Final Result is a target. Ideality is a comparison:

```text
ideality = useful effects / (costs + harmful effects)
```

For a credible engineering mapping, look up the matrix rather than recalling it. The matrix is an
ideation index, not proof. Blank and diagonal cells stay blank. For a physical contradiction,
test separation in time, space, condition (relation), direction, and system level. Use Su-Field only when the
components and interaction are meaningful; people are stakeholders and agents, not substances.

## Synthesize

Common paths:

- technical contradiction → matrix and inventive principles;
- physical contradiction → separation principles;
- incomplete, weak, excessive, or harmful interaction → functional/Su-Field analysis and
  inventive standards;
- missing capability → effects, feature transfer, or functional-oriented search;
- excess cost or complexity → trimming and function-cost analysis;
- fixation on existing scale or timing → inversion and size-time-cost.

Generate at least three distinct mechanisms:

```text
TRIZ prompt used:
Mechanism:
Resource exploited:
Assumptions:
Expected benefit:
Possible harm / displaced cost:
Fastest falsifying test:
```

A principle name is not a solution. Translate it into a causal mechanism in the target system.

## Predict failure before it happens (AFD)

Anticipatory failure determination inverts the problem: instead of explaining an observed
failure, assume the failure has happened and invent how the system could produce it.

1. name the failure to invent (the harm or loss event);
2. work backwards: what chain of causes, in this system as built, would deliver it;
3. use inversion deliberately — treat safety and interlock functions as absent, reversed, or
   defeated, and ask what then becomes possible;
4. each credible invented chain is a design contradiction to close, not an observation to
   file.

Run AFD on every recommended concept during justification, not only on the baseline: a new
mechanism is a new set of possible failures.

## Substantiate and repair

Use the smallest objective comparison able to disprove the recommendation: experiment, pilot,
prototype, simulation, benchmark, test suite, or staged rollout. Predefine the baseline, primary
outcome, guardrails, horizon, decision threshold, and rollback.

If it fails:

1. identify whether the cause, contradiction, resource, or operating condition was wrong;
2. capture the new undesirable effect or displaced harm;
3. remodel or change the separation axis;
4. test the next mechanism.

Mark unresolved uncertainty. Never relabel a proposal as an implemented result.
