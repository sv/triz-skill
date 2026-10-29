# Future plans

The ranked backlog of the categorical-model work. It is weighted by what serious TRIZ practice
actually uses — function analysis, trimming, physical contradictions and separation, concept
selection, evolution trends as rules, and the 9 windows — because that is where formal work pays.
The contradiction matrix and the 76 standards stay data lookups: Altshuller himself had moved
away from them by the late 1980s (ARIZ-85 drops the matrix from the algorithm), and no
formalization effort is planned for them.

Items 3–5 extend the per-instance Lean certificates and the label-blindness tests to the verdicts
they do not cover; item 6 upgrades a tested property to a proved one; item 7 collects the larger
categorical closures. Items 1, 2, 3, and 6 have landed, and parts of 4 and 7. Effort is a focused
PR (S), a few PRs (M), or a small project (L). The per-workstream acceptance criteria of the
assurance extension (#35) are in [categorical-future-plan.md](categorical-future-plan.md), and
what it delivered in [categorical-assurance.md](categorical-assurance.md).

| # | Item | Status | Closes, in categorical-model.md | Effort |
|---|---|---|---|---|
| 1 | Certify unreachability and invariance | **Landed in #39** | Closed | — |
| 2 | Certify `triz_behavior` `preserved`/`changed` | **Landed in #39** (`preserved`; `changed` keeps its counterexample and needs no proof) | Closed | — |
| 3 | Incomparability witnesses in weakness certificates | **Landed in #35** (equal pairs too) | Closed | — |
| 4 | Canonical dynamics tie-breaks, then their label-blindness tests | Open; #35's metamorphic tests cover dynamics up to tied witnesses | "Dynamics verdicts are not covered by the label-blindness property tests, and traces break ties in declaration order" | S–M |
| 5 | Naturality of the verdicts in Lean | Open | Nothing is claimed today; upgrades every label-blindness property test to a theorem | M, Lean |
| 6 | The grouping/join lemma for steady states | **Landed in #32** (`holeContext_preservesUnions`) | Closed for the Lean semantics; the TypeScript join stays tested | — |
| 7 | Joint residuals, the discrete fibration, trim as controlled embedding, whole-model gfp | Partly landed: two boxes in #32, whole-model composition in #35 | Bullets 5 (first part), 2 (system operator), 1 (reframed), 13 (downstream composition) | L |

## Landed

- **#39** `feat(certify): certify unreachable escalations and preserved behaviour` — items 1 and
  2. An unreachable escalation is certified by an inductive invariant exactly as planned: the
  global states the search reached, closed under `Sync.Step` and disjoint from the unsafe set,
  decided by `unreachable_of_invariant` through `Sync.holding`. A `preserved` verdict is
  certified as equality of the two `Rows` relations over every situation and valuation.

- **#32** `feat(theory): narrow four "What is not claimed" gaps` — item 6 (hole union
  preservation, `holeContext_preservesUnions`), part of item 7 (the two-box weakest
  specification via Mathlib's `Concept`; #36 was merged into #32's branch), Mealy fixed points,
  and recurrent reachability (`recurrent_reach`, cited by the `recurrent` loop class; loop
  classes are still not certified).
- **#38** `feat: suggest the finest segmentation of a box's declared relation (Lean-proved)` —
  the group-split search that "What is not claimed" records under segment split.
- **#35** `feat: add finite assurance across eight categorical TRIZ workstreams` — item 3, with
  equal pairs as well (`incomparable_of_witnesses`; every weakness pair is certified), and
  `changed` behaviour and state-only safety certificates. For item 7, `scope: "whole"` composes
  every box by exact finite search; the gfp characterization is not proved. For item 4, its
  metamorphic tests (tests/act-extended-invariance.test.ts) cover dynamics, comparing tied
  witnesses by validity and length, so the canonical tie-break is still open. Its
  `triz_synthesize` searches finite libraries for several holes; it is not the joint residual.

## 3. Incomparability witnesses in weakness certificates

Landed in #35, which also certifies equal pairs. As planned:

`triz_weakness` certified strict inclusions only. An incomparable pair is witnessed by two
situations, one admitted each way; the lemma exists and is uncited (`admits_incomparable`). The
witnesses are already in the ranking output (`pairs.onlyFirst`/`onlySecond`), so this is
plumbing. Equality of admitted sets stays uncertified: deciding it over every valuation is what
the table-read cap refuses, and that limit is documented, not worked around.

## 4. Canonical dynamics tie-breaks, then their label-blindness tests

Traces break ties in declaration order, which is a label, so dynamics verdicts are excluded from
the label-blindness tests. Fix the tie-break (canonical id order after normalization), update
the golden files, then extend tests/act-invariance-rows.test.ts to `triz_dynamics` as the wiring
verdicts are covered.

## 5. Naturality of the verdicts in Lean

The label-blindness property tests check, per seed, that every verdict is invariant under
renaming and permutation. The theorem-shaped statement is that each verdict and construction is
a functor (natural construction) on the groupoid of models and renamings — `Wiring.rename` and
`transGen_equiv` are the ingredients. Proving it makes the invariance discipline a theorem
instead of a tested property. Requires a Mathlib build session (`lake build`, the cache is
several GB); `--wfail` and the no-`sorry` rule apply as everywhere in theory/.

## 6. The grouping/join lemma for steady states

Landed in #32, as `holeContext_preservesUnions` (and `holeContext₂_preservesUnions₂` for two
holes) rather than an iSup lemma. As planned:

The residual theorems hold for every union-preserving context, and the kernel's evaluator groups
steady states by the box's row — tested against a brute force, not proved to be such a context.
The lemma that closes the gap is an iSup version of `mem_steadyStates_glueAlong`
(theory/Semantics.lean): steady states of a composite distribute over the glued box's rows.
This proves the property for the Lean semantics; the TypeScript evaluator stays tested, as the
feasibility solver is.

## 7. The larger categorical closures

- **Multi-box joint weakest specification.** The two-box case landed in #32 (via #36, through
  Mathlib's `Concept`); #35's `triz_synthesize` searches complete tuples of a declared finite
  library instead, which is not a residual. For the general case the joint residual over the disjoint union of the
  unknown boxes' ports always exists (Rel is a residuated quantale; Mathlib ships
  `Quantale.rightMulResiduation` but no Rel instance — prove it from the existing
  `relation_comp_iSup_left` lemmas). It does not factor per-box in general; that
  non-factorization is itself a witness for theory/Witnesses.lean. Kernel: `weakest_spec` over a
  set of boxes as one merged hole, with a coupling warning when the per-box projection is unsafe
  alone.
- **9 windows as a discrete fibration.** Mathlib has `CategoryTheory.Functor.Elements` with a
  faithful projection but no discrete-fibration predicate; define it (short proof) and apply it
  to `Wiring.restrictionGrid`. The supersystem collapse enters as a left Kan extension along the
  collapse map of posets, following the pattern of `Mathlib/Topology/Sheaves/Alexandrov.lean`.
- **Trim as controlled embedding.** The removed Kan-extension trimming (AGREE, PBPO⁺:
  Corradini et al., TCS 2021) reframed as it should be: a trim is a rewrite whose re-attachment
  interface is declared rule data — a mild instance of the existing `typed_dpo` — plus the
  two-absorber test promoted from tests/act-behavior.test.ts to a counterexample in
  theory/Witnesses.lean. Sources.md gains the reference.
- **Whole-model steady states.** `partialDownstream` exists because behaviour has no least
  fixpoint over unordered values. For finite relations the steady states are the *greatest*
  fixpoint of the consistency operator, computed by descent from the full valuation set: a
  `compose: "whole"` option with a `steadyStates_gfp` characterization in theory/. The option
  landed in #35 as `scope: "whole"`, by exact finite search; the characterization remains.

## Deliberately not planned

- **Formal concept analysis of the contradiction matrix.** It would formalize an artifact the
  tradition itself deprecated; the matrix stays a lookup.
- **Result-side `forbid` post-conditions.** Context conditions (shipped) cover the rule-level
  need; created harms are declared data in the right-hand side and visible statically. Revisit
  only if a trim-rule use case appears.
- **The irreducible not-claims.** Physical truth of declared rows, back-reactions the model
  omits, smooth dynamics and controller synthesis, cross-domain transfer of solutions, and the
  semantic half of analogy stay outside the kernel by design; see "What is not claimed" in
  [categorical-model.md](../skills/triz-innovation/references/categorical-model.md).
