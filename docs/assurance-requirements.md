# Assurance requirements

Acceptance cases and proof/evidence obligations for future engine changes. Priorities,
dependencies and implementation status belong to the [roadmap](FUTURE-PLANS.md).
Current guarantees belong to [delivered assurance](categorical-assurance.md) and the
[theory map](theory-map.md); source-reading limits belong to the
[bibliography](../theory/REFERENCES.md).

These criteria originated in the eight-workstream review in #35 and were extended for
system evolution. They are retained here independently of release history. A roadmap entry
is not an implemented guarantee, and a method citation does not establish its hypotheses.

## 1. Claims, request binding and trust

**Required scope:** formalize the JSON/finite-table encoder correspondence, or use an extracted/verified
encoder. Extend versioned request binding to future certificate kinds. Preserve the distinction
between a generated proof, an input-bound proof, and a proof checked by pinned local Lean or a
separately trusted remote service.

**Acceptance:** a dropped row, wrong index, changed target, altered scope or forged digest cannot
validate against the source request. Prove the correspondence beyond testing/regeneration.

**Foundation:** translation validation [R20](../theory/REFERENCES.md#r20), certifying algorithms
[R19](../theory/REFERENCES.md#r19), and verified certificate checkers [R1](../theory/REFERENCES.md#r1), [R2](../theory/REFERENCES.md#r2); Lean's
separation of proof validity from statement meaning [R3](../theory/REFERENCES.md#r3).

## 2. Invariance and semantic comparison

**Required scope:** extend generated semantic models and stress tests to larger stateful/feasibility
families, supported capped searches and every new transformation. Establish transport theorems
for semantic annotations. Keep witness validity separate from arbitrary witness tie-breaking.
Develop external behavioral equivalence separately from annotation-preserving isomorphism.

**Acceptance:** reverse lexical order under renaming; permute all arrays; include symmetric
models with several shortest witnesses and a mapping rejected before a valid automorphism.
Incomplete capped evidence must remain sound without a promise of identical selected subsets.

## 3. Broader finite certificates

**Required scope:**

1. Residual safety, target coverage and impossibility certificates, using a semantic one-hole
   union theorem and the delivered row/diagram correspondence. The general one/two-hole
   foundation landed in [PR #32](https://github.com/sv/triz-skill/pull/32)
   (`holeContext_preservesUnions`, `holeContext₂_preservesUnions₂`).
2. Harm-loop completeness: every negative edge on a cycle is covered and each claimed region
   has the advertised connectivity. Useful-only cycles must remain admissible.
3. Time-indexed negative dynamics certificates, initial-state coverage and bounded input
   schedules. Preserve blocked-state uncertainty for port predicates.
4. Safe port-predicate invariants, separation-in-time and loop properties. Merged PR #39 supplies
   admitted-configuration unreachability for saturated unsafe port targets; the certificate also
   states the kernel's blocked-state check (`unreachable_of_holding`).
5. Further state/value transport, lost-interface comparison cases, and richer resource certificates.
   Declared behavior box maps and one-sided inputs are supported by the shared PR #39 encoder.

**Acceptance:** an unsaturated BFS frontier is never an unbounded invariant; removing an initial
state/successor invalidates a proof; one machine state with safe and unsafe valuations is handled;
one favorable output cannot establish universal acceptability; possible return is not inevitable
recurrence. No `sorry`, unsafe axioms or skipped kernel validation.

**Foundation:** certifying model checking [R1](../theory/REFERENCES.md#r1) and independent verified checkers [R2](../theory/REFERENCES.md#r2).

## 4. Whole-system semantics and adequacy

**Required scope:** verify the optimized finite joins, variable identification and pruning against the
formal semantics, or validate each optimized result independently. Add checked conditions under
which an omitted context admits every upstream state. Add exact arbitrary observable interfaces,
deadlock-freedom and explicitly quantified temporal requirements.

**Acceptance:** downstream total negation loops, inconsistent fan-in and disconnected inconsistent
components cannot be pruned without justification. Equal partial relations may still fail
nonblocking. Keep relational steady states, viable/infinite runs and temporal least/greatest
fixpoints as different questions.

**Foundation:** abstract interpretation [R21](../theory/REFERENCES.md#r21),
[R22](../theory/REFERENCES.md#r22), and counterexample-guided refinement [R4](../theory/REFERENCES.md#r4). A greatest-fixpoint
characterization over complete valuations is proved in `SteadyStateGfp.lean`; its full-valuation
filter does not remove global search.
Local domain consistency alone is not a complete solver [R25](../theory/REFERENCES.md#r25).
PR #51 adds abstract semijoin soundness and global existence for nonempty pairwise-consistent
tables under a supplied running-intersection order. Checking that order and connecting a
constructive runtime solver to the theorem remain open.

## 5. Fine-grained implementation/evidence contracts

**Required scope:** couple multiple resource/behavior/transition modes with stable implementation and
row identifiers instead of requiring a single resource mode per box. Represent measured,
derived, estimated and hypothetical evidence with operating envelopes and versioned sources.
Bind physical-contradiction parameters explicitly to ports, states or measured expressions.
Support conservative uncertainty envelopes and explicit prior provenance/partial-prior bounds.
Structured envelope applicability and versioning are detailed in E1/E6 below; the existing
`operating_envelope` label is not an executable guard.

**Acceptance:** capable-but-over-budget mode A and cheap-but-incapable mode B never combine into
a passing implementation. Shared costs and new declared harms are checked together. Widening
uncertainty can turn a robust conclusion into unresolved. A provenance count is not a
probability that a model is true.

**Foundation:** co-design with functionality, implementation and resource spaces [R5](../theory/REFERENCES.md#r5), and its
uncertainty treatment [R6](../theory/REFERENCES.md#r6). Weighted operating-situation coverage does not extend the theorem
about a uniform distribution over tasks [R7](../theory/REFERENCES.md#r7).

## 6. Synthesis and abstraction

**Required scope:**

- Merged-hole residuals landed in #49 as coordinated relaxations/diagnostics. Require
  factorization, an explicit coordination mechanism, or finite product-subrelation synthesis
  before calling it independently implementable.
- Search for groups of ports that factor, rather than testing only a supplied partition:
  landed in [PR #38](https://github.com/sv/triz-skill/pull/38) (`behavior.finest`,
  `factorisations`). Maximal relation pairs for two unknown boxes landed in #32. General
  n-ary concept lattices remain open; the merged-hole residual for three or more boxes landed
  in #49.
- Compose feasibility across several detailed preimages with compatible implementation modes.
- Add dynamic simulation relations and validated refinement of coarse counterexamples.
- Check supersystem summaries against transformations through a stated commuting/refinement
  condition; preserve hidden safety obligations.
- Bounded component/topology discovery is implemented in #51 with explicit catalogue,
  instance and component limits. Joint mode/policy/Pareto search remains E2 work below.

**Acceptance:** two independent bit producers cannot realize diagonal outputs `{(0,0),(1,1)}`
by independently implementing its projections. Same wiring with incompatible rows fails
behavioral refinement. Coarse counterexamples are checked against the detailed model. Search
exhaustion means impossible only inside the declared finite candidate space.

**Foundation:** bounded library synthesis [R8](../theory/REFERENCES.md#r8), CEGAR [R4](../theory/REFERENCES.md#r4), and abstraction/refinement methods
whose hypotheses explicitly support the desired transferred property [R9](../theory/REFERENCES.md#r9).

## 7. Engineering models and overlapping contexts

**Required scope:** feed-forward queue networks with declared arrival/service envelopes, backlog/delay
bounds, finite storage and schedules; validated component adapters for conversion, conservation,
loss and buffering. Support richer multi-parameter contexts and return small checked conflict
cores. Investigate continuous/hybrid adapters as a separate project.

**Acceptance:** burst overflow despite acceptable mean load; five consumptive units cannot
supply two simultaneous four-unit branches; a closed lossless model cannot generate a conserved
quantity. An upper bound above capacity does not prove that overflow actually occurs.
Local tables `x=y`, `y=z`, `x!=z` must fail global compatibility.

**Foundation:** network calculus [R10](../theory/REFERENCES.md#r10), compositional passive networks [R11](../theory/REFERENCES.md#r11), and global-section
semantics [R12](../theory/REFERENCES.md#r12). Chosen compatible sections of a sheaf glue; choosing mutually compatible
sections from allowed local relations is a global constraint problem. Cohomological obstructions
are not a complete replacement for exact compatibility decisions [R13](../theory/REFERENCES.md#r13).

## 8. Rewriting and optional categorical completion

**Required scope:**

- Select a fixed-signature normalization subset and prove termination under its actual
  identification, freshness, attribute and flow conditions.
- Enumerate all required interface-aware pre-critical pairs, prove coverage and validate a join
  for each. Apply a confluence theorem only after proving this implementation meets its
  hypotheses. An exhausted budget yields `undecided`.
- The absorber-aware trim structural rule and two-absorber counterexample are formalized in
  `ControlledTrim.lean`. The counterexample proves absorber dependence, not undecidability.
  General categorical identification/pushout claims still need their own proof.
- Introduce AGREE/PBPO+ only if generic control of previously unlisted surrounding context is a
  required consumer; these are additional formalisms, not alternate names for ordinary DPO.
- Optionally construct the category of elements for the level presheaf. State variance and base
  explicitly: ordinary elements of the covariant full grid give an opfibration over its written
  domain; the appropriate opposite construction gives the presheaf fibration.
- Revisit Kan descriptions only with a precise indexing functor, codomain, unit and universal
  property proved to agree with the computed operation. A Kan property supplies no evidence of
  a physical mechanism. Supersystem collapse is not automatically a Kan extension of support.
- Defer bounded snapshot-to-transition inference until the transformation semantics and
  comparison contracts above are stable.

**Acceptance:** disjoint occurrences commute, interfering ones are reported without claiming
nonconfluence, all required critical pairs are covered, and every stated termination measure
decreases. No global guarantee is inferred for unrestricted invention rules.

**Foundation:** DPO with interfaces [R14](../theory/REFERENCES.md#r14), AGREE [R15](../theory/REFERENCES.md#r15), PBPO+ [R16](../theory/REFERENCES.md#r16), Mathlib's actual elements
construction [R17](../theory/REFERENCES.md#r17), and the definition/universal property of Kan extensions [R18](../theory/REFERENCES.md#r18).
Restricted critical-pair algorithms [R44](../theory/REFERENCES.md#r44),
[R47](../theory/REFERENCES.md#r47), [R82](../theory/REFERENCES.md#r82) must be distinguished from
the undecidability and compatibility limits [R45](../theory/REFERENCES.md#r45),
[R46](../theory/REFERENCES.md#r46), [R83](../theory/REFERENCES.md#r83).

## System evolution, operating boundaries and joint objectives

This open workstream connects E1–E6 in the [ranked roadmap](FUTURE-PLANS.md#system-evolution-and-operating-boundaries).
Existing finite conditions, state transitions, typed rewrites and snapshot comparisons are
foundations. They do not yet form an integrated operating-envelope/evolution planner.

### E1 — Executable envelopes and system boundaries

**Required scope:** bind operating assumptions to explicit finite inputs/states, resource/quantity bounds,
initial conditions and evidence. Declare which choices are controlled, which context changes
are external, what the policy observes and which interfaces cross the system boundary.
Preserve coupled conditions instead of expanding them into independent marginals.

**Acceptance:** test interior, boundary and outside-envelope cases. An envelope label alone
must not constrain a solver. Declared conditions outside the supported envelope get an explicit
applicability result; undeclared values still fail validation. Missing assumptions cannot
silently become permissive guarantees. Continuous range abstractions require their own proof.

### E2 — Joint properties and Pareto objectives

**Required scope:** one specification contains hard predicates and an ordered property vector over the
same architecture, resource/behavior mode and policy. Budgets are hard predicates, while the
same cost axes can also be objectives. Declare units, directions and aggregation for each axis.
Extend finite alternative comparison before joint topology/mode/policy optimization.

**Acceptance:** preserve exact ties and incomparable witnesses. Retain the nondominated `(3,3)`
beside `(0,4)` and `(4,0)` for two minimization axes. Do not splice different implementations'
costs, capabilities or policies. Validate sum/max/path/probabilistic aggregation separately;
state availability's initial-state/recurrent-class scope. Caps cannot certify a complete
frontier or a globally optimal evolution path. Weights are explicit preferences, not defaults.

### E3 — Dynamic safe operating regions

**Required scope:** separate steady-state admissibility from safety/viability over trajectories. State
whether the claim concerns some run, every run, or a causal policy against all admissible
disturbance sequences. Define observation and action order before introducing a finite game
solver; the existing stationary expected-cost MDP theorem is not that solver.

**Acceptance:** a state with a safe steady assignment but unavoidable unsafe successor is
excluded from a robust safe region. Check all declared starts, closure and nonblocking. A
policy cannot observe future disturbances. Region maximality requires complete finite
checking; wider modeled coverage is not an estimated probability of successful operation.

### E4 — Context and requirement evolution

**Required scope:** declare finite context transitions, schedules/clocks and versions for workloads,
provider contracts, quotas, compatibility, requirements and objective orders. Reconcile time
scales explicitly. Keep operational state changes, context changes and architecture edits
distinct; future inputs are declarations, not forecasts inferred from TRIZ trends.

**Acceptance:** preserve cross-time correlations, unavailable observations and timing limits.
Removing a difficult context or relaxing a goal cannot silently count as an improvement.
Unsupported future conditions remain unresolved, and changed goals identify a new problem.

### E5 — Migration verification and bounded path planning

**Required scope:** validate a supplied migration with explicit intermediate operational configurations,
live-state/interface maps and rollback transitions. This precedes searching bounded architecture
paths and policies under E1 envelopes and E4 context traces with E2 objective orders.
Snapshot-to-runtime-transition inference remains deferred; state transfer must be supplied.

**Acceptance:** adequate typed endpoints do not certify uninterrupted migration. Reject a path
that temporarily disconnects service or violates peak resources. Account for old/new overlap,
deployment charges, backlog/state transfer, temporary harms, downtime and rollback costs.
Check one compatible joint witness at every stage. Compare cost/risk/downtime vectors across
complete paths; bounded exhaustion concerns only the declared path and policy space.

### E6 — Applicability, evidence and revalidation

**Required scope:** bind proof-relevant context/envelope, requirements, objective algebra, policy and
evidence versions to results, building on §1's encoder correspondence. Record dependency scopes
for targeted rechecking. Monitoring adapters supply explicit observations; this plan does not
deploy a monitoring or automatic corrective-action service.

**Acceptance:** changing a bound, initial condition, correlation, composition law or evidence
scope prevents reuse for the changed problem. A previously checked proof remains about its
original request, not about the new operating conditions. Distinguish observed breaches,
modeled violations, inapplicable evidence and uncertainty; no provenance count becomes a truth
probability.

Build order is maintained only in the [roadmap](FUTURE-PLANS.md#next-priorities).
C2 aggregation, S3 contracts, C7/S1 solvers and S5 dynamics are shared dependencies.
Physlib/CSLib adapters retain their semantic bridge obligations in
[mathematical connections](math-connections.md).
