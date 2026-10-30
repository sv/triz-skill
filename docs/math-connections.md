# Mathematical connections and library choices

Checked against live repositories and TheoremSearch on 2026-10-30. Search suggestions are
leads, not proof dependencies; locally elaborated Lean statements and finite certificates
remain the acceptance criteria.

## Validation and search

AXLE checked the complete new `MeanCost` and `Lifecycle` sources on Lean 4.32.2 before the
requested 4.35.0 upgrade: `okay:true`, no failed declarations, errors or warnings. Axiom output
for all eight theorems contained only propext, Classical.choice and Quot.sound. No model data
was submitted. The user explicitly authorized uploading these two source files. The matching
4.35.0 recheck also passed with no errors, warnings, or failed declarations, and the same
standard-axiom audit (423 ms reported server processing time).

Three [TheoremSearch](https://www.theoremsearch.com/docs) queries were actually run, returning
five candidates each: minimum-mean-cycle potentials/Karp certificates; average-cost MDP
Bellman gain/bias and occupancy; and Dirac structures/compositional power conservation.
The strongest relevant source checks were:

| Search result | Checked source | Use and limitation |
|---|---|---|
| Karp exact arithmetic and an achieving cycle, Proposition 2 | Pilarczyk, Palczewski, Luzzatto, [Rigorous computation of expansion in one-dimensional dynamics](https://arxiv.org/html/2505.20495v1), §2.3 and §3.4, CC BY 4.0 | Confirms exact cycle/potential certification direction. Its graph assumptions are not silently imported; self-loops/multiedges are independently tested here |
| Average-cost Bellman characterization (search labelled it “Lemma 12”) | Gupta, Jain, Glynn, [Probabilistic Contraction Analysis of Iterated Random Operators](https://arxiv.org/abs/1804.01195), v6 | The source confirms the gain/bias equation in Example 2; the search result’s Lemma 12 label was not corroborated. The implemented Lean theorem proves a finite stationary-comparison statement, not the paper's convergence results |
| Composition of Dirac structures, Lemmas 5.0.1–2 | Kumar, van der Vegt, Zwart, [Port-Hamiltonian Discontinuous Galerkin Finite Element Methods](https://arxiv.org/abs/2212.07041) | Motivates a future power-preserving relational composition layer. PDEs, finite elements and stochastic port-Hamiltonian systems are not implemented |

## Connections that are useful now

1. **Potentials and bias are the same cancellation mechanism.** Cycle potentials telescope
   around a closed path; a Markov bias cancels after averaging against stationary occupancy.
   A deterministic Markov transition specializes the latter to the former. A shared finite
   potential certificate abstraction could reduce duplication without combining their scopes.
2. **Optimization duality.** A cycle is a primal flow witness; a potential is its dual bound.
   MDP occupancy is a primal stationary flow, with gain/bias supplying Bellman dual inequalities.
   A rational LP backend would broaden multichain handling and support cost/availability
   constraints. Complementary slackness can remain a small decidable certificate.
3. **Dimensions grade the wiring.** Exponent addition under products makes explicit quantity
   types a grading of effect composition. A dimension-preserving adapter can prove that
   changing notation preserves port compatibility; it cannot establish physical sufficiency.
4. **Energy relations and typed wiring.** Zero/one junctions give finite power identities.
   Composing their power-preserving relations leads toward Dirac/port-Hamiltonian semantics.
   That would justify conservation under interconnection, while causality and solvability
   remain separate questions.
5. **Bisimulation can reduce finite dynamics.** A cost-preserving probabilistic bisimulation
   could reduce products before policy solving, if it preserves rewards and acceptance labels.
   An unweighted structural quotient alone does not preserve the new cost/occupancy verdicts.

## Integrated theorem-search results

A second search batch on 2026-10-30 used 12 formal/informal `/graph/embedding` queries,
three `/search` literature queries, seven `/graph/statement` neighborhoods and six
`/graph/paper` graphs. The [query and endpoint audit](theorem-search-2026-10-30.json) records
the requests, identifiers and graph sizes. The documented `/graph?external_id=2603.00448`
returned HTTP 404; its paper graph succeeded. Graph edge counts include signature,
definition and documentation edges, not just proof dependencies. Informal edges can be
heuristic or model-extracted. Indexed theorem numbers sometimes differ from the checked
paper version. These graphs guide source inspection; they do not certify new proofs.

Formal matches were indexed from Mathlib 4.27/4.28. Eleven relevant declarations were
elaborated against our 4.35 pin before integration. In particular,
`fixedPoints.lfp_eq_sSup_iterate` requires omega-Scott continuity, a hypothesis omitted by
the search summary. The source-support certificate below uses leastness and a finite
derivation instead, so it needs neither continuity nor a claimed iteration bound.

| Connection | Integrated improvement | What it unlocks, and its boundary |
|---|---|---|
| Galois connections / contract quotients | `CategoricalTriz.residual_inter`, `residual_iInter`, `residual_comp` reuse Mathlib's adjoint laws | Factor target safety requirements and calculate missing-component specifications backwards through nested contexts. Exact coverage and joint-hole coupling remain separate obligations |
| Horn closure / least fixed points | `SourceSupport.lean` proves source inclusion, closure leastness, derivation soundness and equality of a closed terminal derivation with the least closure; threshold/max compatibility is explicit. Runtime results now include `activationOrder` | Replay why a selected row is grounded; a foundation for request-bound grounding certificates. The generic proof and runtime replay tests do not yet verify an encoder or issue such certificates |
| Acyclic constraint networks / semijoins | Behavior evaluation adds bounded overlap-aware row filtering after unary propagation. `Propagation.satisfies_pair_iff_semijoin` proves the abstract solution-preservation law; `exists_solution_of_runningIntersection` proves existence for nonempty pairwise-consistent full tables with a supplied running-intersection order | Reject incompatible multi-port correlations before costly enumeration. A future join-tree checker and constructive row-selection backend can use the completeness theorem. The current evaluator still enumerates; it does not infer acyclicity or claim global consistency for cyclic scopes or sparse wildcard rows |
| Stationary occupation measures / LP duality | `Lifecycle.Occupation`, `occupation_of_stationary_policy`, `occupation_bias_cancel`, `occupation_cost_lower`, `occupation_attains_gain` | Compare randomized stationary competitors and certify attainment by equality on occupied actions. This supplies the mathematics for secondary availability objectives on cost-optimal stationary flows; no LP backend, optimal-face range computation or initial-state reachability encoding is added |

The runtime semijoin pass preserves row order, sparse wildcards, repeated-variable equality
and the exact set of joined assignments. Unary and overlap filtering share the existing
1,000,000-work preprocessing allowance. If either phase exhausts it, the evaluator discards
both phases and searches the original tables. An already empty unary-pruned table remains
a decided contradiction. Tests compare pruning with exhaustive assignments, exercise
join-tree instances and a cyclic counterexample, and check cap rollback. One regression
has equal/unequal two-port tables whose unary domains remain unchanged: semijoins find
the contradiction within a one-state search budget.

`SynthesisWitnesses.lean` is a default build target covering a seeded rule, an unseeded
self-supply cycle, compatible overlapping tables and a randomized occupation witness.
These are mathematical witnesses, not generated per-request certificates.

Integration validation checked all 17 new reusable theorem declarations and four non-vacuity
witnesses locally; their axiom dependencies are limited to `propext`, `Classical.choice` and
`Quot.sound`. The previously authorized `MeanCost.lean`/`Lifecycle.lean` upload was rechecked
on AXLE's Lean 4.35 environment after adding the occupation theorems: all 13 theorem audits
passed with no failed declarations, errors or warnings, using the same standard axioms.

### Research that shapes the next adapters

- **Assume-guarantee contracts.** Incer, Benveniste and Sangiovanni-Vincentelli describe
  composition quotients as the largest missing contract satisfying a composed requirement
  ([§2.6](https://arxiv.org/html/2309.08875v1)). Our residual laws already provide the
  relational instance. An assumption/guarantee adapter would need explicit refinement and
  composition correspondence proofs.
- **Acyclic joins.** Kolaitis's [Semijoins of Annotated Relations](https://arxiv.org/html/2603.00448v1)
  recalls the classical local-to-global theorem and extends full reducers to annotated
  relations under positive-commutative-monoid and inner-consistency hypotheses. Our new
  theorem covers unannotated tables with a supplied leaf-elimination order. The condition
  concerns the constraint hypergraph, not merely a directed acyclic wiring graph. Graded
  completeness would require the additional algebraic hypotheses.
- **Typed grades and formal concepts.** Lai and Shen derive multi-adjoint concept lattices
  from [quantaloid-enriched Isbell adjunctions](https://arxiv.org/html/1903.08922v2).
  This connects our two-hole formal concepts and homogeneous quantale residuals. It suggests
  a general catalogue with different hom-types and explicit compatible grade operations;
  a quantaloid adapter is future work, not an installed library or arbitrary grade mixing.
- **Feedback with delay.** Milius and Litak prove a correspondence between
  [guarded traces and guarded fixed-point operators](https://arxiv.org/html/1309.0895v1).
  This suggests a separate staged feedback semantics. Delay and initialization declarations
  must be explicit; the result does not supply physical sources or prove timed startup.
  The existing relational steady-state trace is unchanged.
- **Physical/dynamic black boxes.** Fong and Sarazola's
  [black-box functor construction](https://arxiv.org/abs/1812.03601) preserves composition
  while exposing boundary behavior; their dynamical example uses **semialgebraic** relations
  (the search summary incorrectly called them stochastic). A Physlib-backed component
  semantics would need the corresponding interface, constitutive assumptions and functor
  laws. The paper is a design reference, not an imported physical-effect catalogue.
- **Initial-state-aware MDP planning.** Atia et al.'s
  [multichain steady-state planning](https://arxiv.org/pdf/2012.02178) explicitly includes
  initial distributions and policy-class constraints. Our stationary-flow theorems do not
  remove that obligation. Computing availability ranges over cost-optimal flows is a
  proposed next use; lifecycle still returns `tied-optimal-policies` when occupancy is ambiguous.

The shared catalogue can therefore grow through composition laws, contract refinement,
typed grades and explicit feedback semantics. Concrete domain entries still require their
own validated behavior and resource declarations. Mathlib suffices for the integrated
proofs; this search does not establish that adding Physlib or CSLib would supply the
remaining synthesis algorithms.

## Physlib and CSLib

[Physlib](https://github.com/leanprover-community/physlib) is Apache-2.0. Its current
[toolchain](https://github.com/leanprover-community/physlib/blob/master/lean-toolchain) and
[Mathlib dependency](https://github.com/leanprover-community/physlib/blob/master/lakefile.toml)
are 4.35.0, matching this PR after the user's upgrade request. Its
[Dimension API](https://github.com/leanprover-community/physlib/blob/master/Physlib/Units/Dimension.lean)
has basis-parameterized exponent algebra, products, inverses and dimension-preserving maps.
Use the seven-base ISQ basis for an adapter; the default charge-based five-generator basis is
not the same as the SI schema. Its broader exponent representation should not silently expand
the kernel's integer-only input. A small adapter is preferable to importing all physics modules.

[CSLib](https://github.com/leanprover/cslib) is Apache-2.0. The current head uses 4.36.0-rc2,
but the verified [`v4.35.0` tag](https://github.com/leanprover/cslib/tree/v4.35.0), commit
`5b56df99362532c46e1175381fbbdd755bd56030`, pins both
[Lean](https://github.com/leanprover/cslib/blob/v4.35.0/lean-toolchain) and
[Mathlib](https://github.com/leanprover/cslib/blob/v4.35.0/lakefile.toml) to 4.35.0.
Its LTS simulation/bisimulation, executions, Büchi automata and safety/liveness language
infrastructure are useful candidates for dynamics reduction and temporal specifications.
That is a verified compatible tag, not a claim that CSLib supplies a finished average-cost MDP
solver or Karp theorem. Neither library is added as a dependency in this PR: the current finite
proofs need Mathlib only, and adapters deserve explicit scope and compatibility tests.

## Improvements to prioritize

Budgets belong to the hard part of one joint specification, and costs may be multidimensional.
A future optimizer should order complete assembly/mode/policy choices by a declared property
vector, retaining the Pareto frontier without implicit weights. Current resource antichains,
per-dimension lifecycle solves and component-count ranking do not yet provide that joint
optimizer. The [mixed-system guide](mixed-system-analysis.md) explains the distinction and
demonstrates current analysis and discovery on synthetic hardware/software/provider declarations.

Bounded component/topology discovery and chain insertion are also implemented in this PR;
[component discovery](component-discovery.md) describes their scope. Generic serial laws use
simp/grind locally; generated networks reuse finite certificates. The enumerator is not verified.

First connect the grounding derivation to a request-bound certificate with an independent
threshold/rule encoder. Next add an explicit join-tree witness checker and constructive
acyclic solver; the completeness theorem is now available. Then optimize secondary
availability objectives on the cost-optimal occupation face, retaining initial-distribution
and recurrent-class constraints. State-dependent gains and multichain policy reconstruction
remain separate extensions. Also make the rational request-binding encoder independent of
the solver and prove a concrete rational-matrix-to-kernel encoding rather than requiring its
mass compatibility equations. A dimension adapter and cost-preserving bisimulation follow.
Full physical-effect catalogues still need verified redistribution rights. These are open work,
not additional claims of this implementation.
