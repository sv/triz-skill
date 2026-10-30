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

Bounded component/topology discovery and chain insertion are also implemented in this PR;
[component discovery](component-discovery.md) describes their scope. Generic serial laws use
simp/grind locally; generated networks reuse finite certificates. The enumerator is not verified.

First broaden lifecycle certificates to state-dependent gains and initial-condition-dependent
occupancy in multichain models. Next make the rational request-binding encoder independent of
the solver, and prove a concrete rational-matrix-to-kernel encoding rather than requiring its
mass compatibility equations. Then add a dimension adapter and cost-preserving bisimulation.
Full physical-effect catalogues still need verified redistribution rights. These are open work,
not additional claims of this implementation.
