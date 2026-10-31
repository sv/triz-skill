# Engine roadmap

This is the single prioritized backlog. Status was reconciled against reference main
`9bd2942` on 2026-11-01; PR #55 effects changes remain under review.
[Assurance requirements](assurance-requirements.md) owns acceptance and proof obligations,
[delivered assurance](categorical-assurance.md) owns current guarantees, and the
[theory map](theory-map.md#what-is-not-claimed) records their limits. See the
[documentation index](README.md) for feature guides and design notes.

Workstream identifiers are retained so bibliography and issue references remain meaningful.
“Implemented” always means the stated finite scope, not every extension of that workstream.

## Next priorities

1. **E1 + E6: executable requirements, envelopes and applicability.** Bind finite operating
   conditions, observations, assumptions and evidence versions to checked inputs. Add an explicit
   requirement-satisfaction mode alongside exact relation equality. A wider acceptable relation
   must not require realizing every acceptable output. Encoder correspondence remains an
   independent trust obligation.
2. **E2 + C2: compare complete designs under explicit objectives.** Start with supplied finite
   architecture/size/policy alternatives, hard predicates and ordered property vectors. Define
   cost units and sum/max/path aggregation before integrated lifetime/Pareto optimization.
   Then generate sizes and lifecycle models from one parameter assignment. The detailed design
   is [joint engineering synthesis](engineering-synthesis.md).
3. **Q2 + C7 + S1–S4 + S6: reduce semantic search.** Add complexity diagnostics, checked join
   trees, variable elimination and local contracts. Recognize mathematical primitives only after
   checking their complete declared semantics, compose exact symbolic summaries, and retain the
   finite fallback. Shared relation evaluation and bounded serial symbolic compilation are implemented; broader symbolic regions remain open.
4. **E4 → E3 → E5: evolving systems.** Declare context transitions and clocks; verify finite
   safety regions with explicit policy/environment quantifiers. Validate supplied migration paths
   before bounded path optimization, including intermediate configurations and state transfer.
5. **Trust, transport and model acquisition.** Extend certificates and semantic transport to
   remaining verdicts; improve reviewed imports and hierarchy comparisons. General categorical
   completion and graded concepts remain conditional on a concrete consumer.

E1/E6 binding and initial E2 comparison can proceed alongside scaling. S3 multi-mode contracts
need explicit implementation coupling; S5 depends on observable-preserving state reduction.
Calibrated physical models, finite placement generators and principle-to-template mappings
follow the objective/parameter foundation in the design note. New literature candidates are
assessed in [the Russian/Chinese research note](formal-triz-literature.md#reuse-for-this-engine).

## Practice reports to turn into regressions

These are reported limitations to reproduce and scope before changing the API; the table does
not claim a fresh reproduction of every report on this checkout.

| Report | Workstream and intended slice |
|---|---|
| Discovery requires all supplied resources or permits every subset | E1/S3: declare required, optional and forbidden resource use per candidate/context |
| Synthesis requires exact target behavior | E1/E2: ordered requirement satisfaction with nonblocking and universal output safety |
| Separate upkeep and configuration searches cannot rank a lifetime design | E2: one complete design/size/policy witness and explicit horizon/profile accounting |
| Lifecycle cost names and situation coverage impede shared comparisons | E1/E2: declared cost-schema mappings and common external scenarios with explicit applicability |
| Initial policy order and larger state spaces exhaust lifecycle work | S5/E2: robust initialization, scoped multichain methods and bounded policy-solve reuse |
| Equal lifecycle optima leave comparison unresolved | E2: preserve ties; accept an explicit secondary objective or stated policy-selection convention |
| Result display/work caps require manual splitting | Scaling: separate pagination/continuation from search completeness and optimality |
| Expanded hierarchy and its flat shell cannot be compared directly | Q5/item 5: checked observable/interface mapping, independently of internal annotations |
| Typed effect names lack calibrated implementation laws | E1/B2: validate sourced multiport/stateful models with explicit applicability and provenance |

## Assurance and categorical foundations

| ID | Status | Remaining work |
|---|---|---|
| 1 | Implemented in #39 | Unreachability/invariance certificates within their declared scopes; broader temporal claims below |
| 2 | Implemented in #39 | Preserved-behavior certificates and changed-behavior counterexamples; richer interfaces below |
| 3 | Implemented in #35 | Equality and incomparability witnesses; broader certificate families below |
| 4 | Partial, #43 | Declaration-order witness selection and renamed twins exist; permutation/symmetry semantics need explicit treatment |
| 5 | Partial | Index/value/hole-coordinate, weakness and adequacy transport proved; remaining resource, count and dynamic verdicts open |
| 6 | Lean foundation implemented, #32 | One/two-hole union laws proved; optimized TypeScript evaluator correspondence remains open |
| 7 | Foundation implemented, #49 | Joint residuals, controlled trim, whole-state gfp and conditional restriction/descent; general completion open |

Item 4 must separate verdict invariance, witness validity and canonical representatives.
An automorphism swapping equally valid witnesses prevents a structurally invariant choice of
one individual witness without extra structure. Sorting labels does not resolve this.

Item 7's joint residual need not factor into independent components: diagonal joint outputs
cannot be implemented by taking independent projections. Require factorization or coordination.
The whole-state greatest-fixed-point characterization filters complete valuations; it is not a
local solver. Restriction descent needs a uniform context square and target saturation. The
covariant category of elements gives an opfibration; the opposite construction supplies the
fibration orientation. N-ary concepts and a universal Kan characterization remain open.

The cross-cutting trust backlog is a verified/independently checked source encoder, broader
request-bound certificates, uncertainty/evidence contracts, and normalization/critical-pair
coverage. Its detailed adversarial cases live only in
[assurance requirements](assurance-requirements.md).

## Structural constraints

| ID | Status | Next slice and boundary |
|---|---|---|
| C1 | Implemented, #42 | Wire-equivalence quotient for finite certificates |
| C2 | Carrier quantity kinds implemented, #42 | Cost aggregation across ideality, feasibility, windows, refinement and isomorphism; conversion/conservation adapters |
| C3 | Open | Declared value orders, port-level signed SCCs and conditional lattice steady-state results |
| C4 | Implemented in merged #52 | Connected factors, exact boundaries/state counts and bounded sample reconstruction |
| C5 | Implemented, #42 | Horizon-free time-invariant finite saturation; schedules and work caps retain bounded/undecided scope |
| C6 | Indexed table evaluation in merged #52 | Checked total serial maps are implemented; feedback-cut propagation remains open |
| C7 | Abstract gluing theorem implemented, #51 | Check join-tree witnesses and connect a constructive reducer/solver to the theorem |
| C8 | Open | Optional totality/input-enabledness lint with explicit feedback hypotheses |

C2 must distinguish sum, peak max, and latency (sum along a path, max across paths).
Information sharing and consumptive flows need explicit quantity kinds; no inference from names.
C3's fixed-point guarantee needs total deterministic maps, complete lattices and the applicable
signed-order/fan-in hypotheses. Sign SCCs at port level; one cycle does not classify an SCC.
Steady rows imply no temporal convergence or oscillation without a declared transition/delay model.
C4 must retain disconnected inconsistent factors under whole scope; comparisons need compatible
factor partitions. C6 retains genuine nondeterminism and partiality through the finite fallback.
C7 concerns the constraint hypergraph, not just acyclic wiring; the cyclic tables `x=y`, `y=z`,
`x!=z` remain a counterexample to local completeness. Polynomial decision on explicit acyclic
tables does not make listing all solutions polynomial. C8 remains a lint because partial rows
may be intentional.

## Applied mathematics and model acquisition

| ID | Status | Next slice and boundary |
|---|---|---|
| Q1 | Homogeneous graded residual foundation implemented | Use-case-gated graded concepts/weakness and heterogeneous change of base |
| Q2 | Open | Feasibility height/width and feedback-cut complexity diagnostics with actionable cap hints |
| Q3 | Open, optional development dependency | Independent co-design differential oracle, limited to its checked monotone core |
| Q4 | Open, documentation | Model supersystem constraints as explicit design constraints and compare fronts |
| Q5 | Static hierarchy implemented, #46 | Checked comparison with flat observables; broader resource/dynamic preservation theorems |
| Q6 | Open | Minimal cell/axis refinement after irreducible global incompatibility |
| B1 | Implemented | Typed builder from interaction tables with completeness reporting |
| B2 | Initial local adapters implemented | Requested SysML/free-text formats and richer compiler-backed extraction with reviewed provenance |

Q1's Boolean/min-plus residual proofs do not prove the separate one-time row-acquisition cover
optimizer. Probability addition is not an idempotent join; a support/change-of-base map needs
its own preservation law. Stage 2 is not an automatic next step. See R91/R96 in the
[bibliography](../theory/REFERENCES.md#r91).
Q3 cannot assume that an independent solver validates user monotonicity or every theorem in
its manual. Q5's `external_substituteWired` covers static wired substitution with feedback;
resource/dynamic preservation is tested, with explicit routes and opt-in budget/policy composition.
Global budget hoisting can strengthen a local bound. Q6's C-K/topos connection (R95) is motivation,
not a proof of the proposed algorithm. Import drafts must retain source location, containment and
review status; an Agents snapshot does not supply imperative transition semantics.

## Scaling to large models

| ID | Status | Next slice |
|---|---|---|
| S1 | Finite min-fill separator elimination in merged #52 | Checked runtime correspondence; stronger orders and shared decomposition plans; extend beyond behavior projection |
| S2 | Finite row/domain pruning implemented; semijoins in #51, indexed overlap supports in merged #52 | Verify/validate runtime correspondence; retain exact solving after local consistency |
| S3 | Exact stateless single-mode contracts implemented | Local residual synthesis, explicitly coupled multi-mode contracts, then dynamics |
| S4 | Request-local synthesis cache merged in #52 | Checked warm starts/content-hash subsystem reuse across requests |
| S5 | Open; C5/Q5 available | Observable- and reward-preserving bisimulation before dynamic products |
| S6 | Bounded stateless serial finite maps implemented | Affine/feedback summaries, dependency footprints, cross-request reuse and certified parameter bounds |

The merged kernel provides backward residual filtering, propagation over component choices and exact
boundary memoization for stateless fixed-wiring synthesis, plus a shared finite relation layer,
joint-tuple indexed joins, indexed correlation propagation, connected-factor evaluation and
[separator elimination](separator-elimination.md) with exact counts and bounded samples.
See [shared relations](shared-relations.md).
Exhaustive comparison, ablations, rollback caps and measurements are documented in
[synthesis search](synthesis-search.md) and
[benchmarks](../benchmarks/synthesis/latest.md). These finite optimizations do not formally verify the TypeScript optimizer or solve
lifecycle/topology optimization.

S1 remains exponential in treewidth; dense feedback still hits caps. S2 preserves complete
solutions but cannot establish global consistency by itself. S3 must check summaries or provide
a scoped correspondence theorem; an exchange law alone does not generate a contract. S4 treats
caller-supplied summaries/warm starts as untrusted inputs. Cache identity includes every semantic
input relevant to the reused conclusion. Equal behavior does not identify resource modes or costs.
S5 keeps target-named states, ports, costs and observations visible.

S6's bounded stateless serial slice is implemented in [checked symbolic synthesis](symbolic-synthesis.md).
Complete joint declarations and explicit typed interfaces are checked before composition and
compact choice grouping; backward support pruning retains concrete resource distinctions.
The runtime checker and local Lean encodings have distinct trust boundaries. Unsupported or
capped compilation falls back to the same shared relation kernel. General affine/feedback
summaries, dependency footprints, cross-request reuse and parameter bounds remain open.
The [symbolic-summary design](symbolic-summary-design.md) separates this delivered slice from
those extensions and links the current proof and benchmark evidence.

## System evolution and operating boundaries

| ID | Status | Deliverable |
|---|---|---|
| E1 | Open | Executable finite envelopes, controlled/external variables and observation/interface scope |
| E2 | Open | Hard predicates plus ordered properties over one architecture/mode/size/policy witness |
| E3 | Open | Finite safety/viability regions under explicit run or causal-policy quantifiers |
| E4 | Open | Versioned finite context/requirement transitions, schedules and reconciled clocks |
| E5 | Open | Supplied migration-path checking, then bounded path/policy optimization |
| E6 | Open | Scope/version binding and dependency-based revalidation of assumptions and evidence |

Build E1 with initial E6 binding, then E2 supplied-alternative comparison. E4 precedes E3/E5
when context evolves. Supplied-path checking can begin once envelopes, transitions and state
transfer are declared. Current stationary expected-cost MDP results do not establish adversarial
safety games or exact finite-lifetime costs. Adequate endpoints do not establish uninterrupted
migration. Detailed acceptance cases, including nonconvex Pareto fronts, live in
[assurance requirements](assurance-requirements.md#system-evolution-operating-boundaries-and-joint-objectives).
The [mixed-system example](mixed-system-analysis.md) illustrates current foundations.

## Neutral mode for models

| ID | Status | Deliverable |
|---|---|---|
| N1 | Open | Structural ids, supplied plain glosses and human domain labels as three distinct registers |
| N2 | Open | Gloss by role; describe verbs as parameter changes; keep quantitative constraints and SI units |
| N3 | Open | Skill discipline: the kernel computes and the LLM translates; no reasoning over bare ids |
| N4 | Open | Restore domain names and concrete checks at ARIZ 4.1(в), 6.1 and Part 7 |
| N5 | Kernel renamed-twin tests implemented | Agent comprehension and metamorphic quality checks |
| N6 | Open | `triz_neutralize` with an order-preserving bijection, caller-supplied glosses and reversible mapping |

Renaming hides vocabulary, not recognizable structure. Preserve all constraints, relations,
orders and source mappings. Account for remaining id-ordered rule/capped-output choices.
The supporting evidence and its reading limits are R97–R109 in the bibliography.

## Typed effects and lifecycle

T1–T5 are merged in reference main via #51.

| ID | Implemented scope | Remaining boundary |
|---|---|---|
| T1 | Knowledge packs merged in #53; #55 adds 19 model templates, two observations and four named configurations across 78 discovery names | Empirical calibration, assessment coverage and rights for third-party catalogue imports |
| T2 | Explicit SI vectors/base-unit parsing and dimension lints | Conversion and inference |
| T3 | Exact cycle means, potentials and achieving-cycle certificates | Probabilistic/continuous-time extension |
| T4 | Finite average-cost lifecycle policies, occupancy/availability and certificate foundations | General multichain/product methods, joint design optimization and robust games |
| T5 | Effort/flow typing, bounded bond-graph causality and equation structure | Constitutive numerical simulation and chemistry |

See [typed effects and lifecycle](typed-effects-lifecycle.md), [bond graphs](bond-graphs.md),
[component discovery](component-discovery.md) and [mathematical connections](math-connections.md).
These guides own executable examples and current tool restrictions.

The [#55](https://github.com/sv/triz-skill/pull/55) effects follow-up remains bounded:

- **Assessment coverage:** 34 named entries have sourced retain/split decisions; **44 remain
  unassessed**. Further reductions need explicit boundaries, context/state and sources plus
  preserved discovery on relevant examples. Equal fields or units do not justify merging.
- **Calibration:** empirical validation of the **19 templates** and implementation-specific
  checks of the **two boundary observations** remain open. Bind attributed measurements or
  independent expert validation to material, geometry, regime, temporal resolution, uncertainty
  and operating envelopes. See [the validation scope](effects-configurations.md).

Finite rows, typing/behavior certificates and bounded patent regressions establish their
selected declared claims; they do not establish calibrated performance, continuous-law or
whole-patent equivalence, or correctness of unassessed entries.

## Deliberately not planned

- Formal concept analysis of the contradiction matrix as a new kernel foundation. Matrix/standard
  lookup remains separate from reviewed principle-to-candidate generators.
- Unrestricted result-side rewrite `forbid` conditions without a concrete consumer; context
  conditions and explicitly created harms already cover the present rule scope.
- Inferring empirical truth, unmodeled back-reactions or physical realizability from types/proofs.
  Calibrated adapters require independent evidence.
- A universal smooth/hybrid controller or unrestricted invention-rule termination guarantee.
  E3 is explicitly finite; continuous/hybrid adapters require a separate scoped project.
- Kan, AGREE/PBPO+ or graded-concept machinery without a required operation and proved bridge.
