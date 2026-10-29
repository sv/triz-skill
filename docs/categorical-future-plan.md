# Future categorical-model work

This is the separate future-work record requested during the eight-workstream review.
Implemented scope and current restrictions are in [categorical-assurance.md](categorical-assurance.md).
The baseline reviewed was `82d87a6a7a124481afa33194679807561bb6358c`.
A roadmap entry is not an implemented guarantee. A paper supplying a method is not a proof that
this kernel satisfies that method's hypotheses.

## 1. Claims, request binding and trust

**Next:** formalize the JSON/finite-table encoder correspondence, or use an extracted/verified
encoder. Extend versioned request binding to future certificate kinds. Preserve the distinction
between a generated proof, an input-bound proof, and a proof checked by pinned local Lean or a
separately trusted remote service.

**Acceptance:** a dropped row, wrong index, changed target, altered scope or forged digest cannot
validate against the source request. Prove the correspondence beyond testing/regeneration.

**Foundation:** translation validation and verified certificate checkers [R1, R2]; Lean's
separation of proof validity from statement meaning [R3].

## 2. Invariance and semantic comparison

**Next:** extend generated semantic models and stress tests to larger stateful/feasibility
families, supported capped searches and every new transformation. Establish transport theorems
for semantic annotations. Keep witness validity separate from arbitrary witness tie-breaking.
Develop external behavioral equivalence separately from annotation-preserving isomorphism.

**Acceptance:** reverse lexical order under renaming; permute all arrays; include symmetric
models with several shortest witnesses and a mapping rejected before a valid automorphism.
Incomplete capped evidence must remain sound without a promise of identical selected subsets.

## 3. Broader finite certificates

**Next, in order:**

1. Residual safety, target coverage and impossibility certificates, using the semantic one-hole
   union theorem and row/diagram correspondence.
2. Harm-loop completeness: every negative edge on a cycle is covered and each claimed region
   has the advertised connectivity. Useful-only cycles must remain admissible.
3. Time-indexed negative dynamics certificates, initial-state coverage and bounded input
   schedules. Preserve blocked-state uncertainty for port predicates.
4. Valid-configuration safety for port predicates, separation-in-time and loop properties.
5. State/box mapping transport, lost-interface comparison cases, and richer resource certificates.

**Acceptance:** an unsaturated BFS frontier is never an unbounded invariant; removing an initial
state/successor invalidates a proof; one machine state with safe and unsafe valuations is handled;
one favorable output cannot establish universal acceptability; possible return is not inevitable
recurrence. No `sorry`, unsafe axioms or skipped kernel validation.

**Foundation:** certifying model checking [R1] and independent verified checkers [R2].

## 4. Whole-system semantics and adequacy

**Next:** verify the optimized finite joins, variable identification and pruning against the
formal semantics, or validate each optimized result independently. Add checked conditions under
which an omitted context admits every upstream state. Add exact arbitrary observable interfaces,
deadlock-freedom and explicitly quantified temporal requirements.

**Acceptance:** downstream total negation loops, inconsistent fan-in and disconnected inconsistent
components cannot be pruned without justification. Equal partial relations may still fail
nonblocking. Keep relational steady states, viable/infinite runs and temporal least/greatest
fixpoints as different questions.

**Foundation:** sound abstraction and counterexample-guided refinement [R4]. A greatest-fixpoint
reformulation over sets of complete valuations is possible but does not remove global search.
Local domain consistency alone is not a complete solver.

## 5. Fine-grained implementation/evidence contracts

**Next:** couple multiple resource/behavior/transition modes with stable implementation and
row identifiers instead of requiring a single resource mode per box. Represent measured,
derived, estimated and hypothetical evidence with operating envelopes and versioned sources.
Bind physical-contradiction parameters explicitly to ports, states or measured expressions.
Support conservative uncertainty envelopes and explicit prior provenance/partial-prior bounds.

**Acceptance:** capable-but-over-budget mode A and cheap-but-incapable mode B never combine into
a passing implementation. Shared costs and new declared harms are checked together. Widening
uncertainty can turn a robust conclusion into unresolved. A provenance count is not a
probability that a model is true.

**Foundation:** co-design with functionality, implementation and resource spaces [R5], and its
uncertainty treatment [R6]. Weighted operating-situation coverage does not extend the theorem
about a uniform distribution over tasks [R7].

## 6. Synthesis and abstraction

**Next:**

- Compute a merged-hole residual as an explicitly coordinated relaxation/diagnostic. Require
  factorization, an explicit coordination mechanism, or finite product-subrelation synthesis
  before calling it independently implementable.
- Search for groups of ports that factor, rather than testing only a supplied partition.
- Compose feasibility across several detailed preimages with compatible implementation modes.
- Add dynamic simulation relations and validated refinement of coarse counterexamples.
- Check supersystem summaries against transformations through a stated commuting/refinement
  condition; preserve hidden safety obligations.
- Expand beyond fixed wiring only with an explicit component/topology bound.

**Acceptance:** two independent bit producers cannot realize diagonal outputs `{(0,0),(1,1)}`
by independently implementing its projections. Same wiring with incompatible rows fails
behavioral refinement. Coarse counterexamples are checked against the detailed model. Search
exhaustion means impossible only inside the declared finite candidate space.

**Foundation:** bounded library synthesis [R8], CEGAR [R4], and abstraction/refinement methods
whose hypotheses explicitly support the desired transferred property [R9].

## 7. Engineering models and overlapping contexts

**Next:** feed-forward queue networks with declared arrival/service envelopes, backlog/delay
bounds, finite storage and schedules; validated component adapters for conversion, conservation,
loss and buffering. Support richer multi-parameter contexts and return small checked conflict
cores. Investigate continuous/hybrid adapters as a separate project.

**Acceptance:** burst overflow despite acceptable mean load; five consumptive units cannot
supply two simultaneous four-unit branches; a closed lossless model cannot generate a conserved
quantity. An upper bound above capacity does not prove that overflow actually occurs.
Local tables `x=y`, `y=z`, `x!=z` must fail global compatibility.

**Foundation:** network calculus [R10], compositional passive networks [R11], and global-section
semantics [R12]. Chosen compatible sections of a sheaf glue; choosing mutually compatible
sections from allowed local relations is a global constraint problem. Cohomological obstructions
are not a complete replacement for exact compatibility decisions [R13].

## 8. Rewriting and optional categorical completion

**Next:**

- Select a fixed-signature normalization subset and prove termination under its actual
  identification, freshness, attribute and flow conditions.
- Enumerate all required interface-aware pre-critical pairs, prove coverage and validate a join
  for each. Apply a confluence theorem only after proving this implementation meets its
  hypotheses. An exhausted budget yields `undecided`.
- Formalize the absorber-aware trim replay and its two-absorber counterexample in Lean.
  The counterexample proves absorber dependence, not undecidability.
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

**Foundation:** DPO with interfaces [R14], AGREE [R15], PBPO+ [R16], Mathlib's actual elements
construction [R17], and the definition/universal property of Kan extensions [R18].

## Suggestions adopted and corrected

| Pasted suggestion | Disposition |
|---|---|
| 1 negative dynamics | Supported state-only inductive certificates delivered; bounded inputs and port predicates remain §3. |
| 2 incomparability | Delivered with generic witnesses and complete admission/rejection obligations. |
| 3 behavior certificates | Delivered for supported aligned finite comparisons; remaining mappings/interfaces in §3. |
| 4 label-blindness | Extended tests and semantic mapping search delivered; sorting ids alone was rejected as a proof of equivariance. |
| 5 model encoding check | Authoritative request binding and independent table comparison delivered; verified encoder remains §1. |
| 6 weighted weakness | Joint operating coverage delivered separately from inclusion; no extension of Bennett's task-prior theorem. |
| 7 row isomorphism | Delivered with value/state maps and continued search after failed automorphisms. |
| 8 grouping theorem | Semantic union/row bridge delivered; optimized evaluator correctness remains §4. |
| 9 harm completeness | Deferred to §3; witness validity must not be described as completeness. |
| 10 loop certificates | Deferred to §3; recurrence requires a quantified statement and full premises. |
| 11 whole composition | Delivered by exact global finite constraints; greatest-fixpoint language not required. |
| 12 merged residual | Real independent finite-library synthesis delivered; coordinated residual/factorization work remains §6. |
| 13 absorber checks | Complete endpoint/assignment search delivered, with joint checks and a shared budget. |
| 14 controlled trim | Explicit replay delivered; AGREE/PBPO+ and general categorical claims remain §8. |
| 15 fibration | Optional §8; proposed full-grid fibration had the wrong variance. |
| 16 overlapping separation | Exact global finite joins delivered; a pairwise scan was rejected as insufficient. |
| 17 critical pairs | Termination measure and occurrence commutation delivered; global critical-pair obligations remain §8. |
| 18 small features | Exact behavioral summaries/refinement delivered; group search, numeric preimages and transition inference remain §§6/8. |

## References

- **R1:** K. S. Namjoshi, *Certifying Model Checkers*, CAV 2001. [Author's paper](https://kedar-namjoshi.github.io/papers/Namjoshi-CAV-2001.pdf).
- **R2:** E. Alkassar, S. Böhme, K. Mehlhorn and C. Rizkallah, *A Framework for the Verification of Certifying Computations*. [arXiv:1301.7462](https://arxiv.org/abs/1301.7462).
- **R3:** Lean Language Reference, *Validating a Lean Proof*. [Official reference](https://lean-lang.org/doc/reference/latest/ValidatingProofs/).
- **R4:** E. Clarke, O. Grumberg, S. Jha, Y. Lu and H. Veith, *Counterexample-Guided Abstraction Refinement*. [Authors' CAV paper](https://www.cs.cmu.edu/~emc/papers/Conference%20Papers/Counterexample-guided%20Abstraction%20Refinement.pdf).
- **R5:** A. Censi, *A Mathematical Theory of Co-Design*, version 7. [arXiv:1512.08055](https://arxiv.org/abs/1512.08055).
- **R6:** A. Censi, *Uncertainty in Monotone Co-Design Problems*. [arXiv:1609.03103](https://arxiv.org/abs/1609.03103).
- **R7:** M. T. Bennett, *The Optimal Choice of Hypothesis Is the Weakest, Not the Shortest*. [arXiv:2301.12987](https://arxiv.org/abs/2301.12987).
- **R8:** A. Iannopollo, S. Tripakis and A. Sangiovanni-Vincentelli, *Constrained Synthesis from Component Libraries*, Science of Computer Programming 171 (2019). [University record and open paper](https://research.aalto.fi/en/publications/constrained-synthesis-from-component-libraries/).
- **R9:** G. Reissig, A. Weber and M. Rungger, *Feedback Refinement Relations for the Synthesis of Symbolic Controllers*. [arXiv:1503.03715](https://arxiv.org/abs/1503.03715).
- **R10:** J.-Y. Le Boudec and P. Thiran, *Network Calculus*. [Authors' book](https://leboudec.github.io/netcal/latex/netCalBook.pdf).
- **R11:** J. C. Baez and B. Fong, *A Compositional Framework for Passive Linear Networks*. [arXiv:1504.05625](https://arxiv.org/abs/1504.05625).
- **R12:** S. Abramsky and A. Brandenburger, *The Sheaf-Theoretic Structure of Non-Locality and Contextuality*. [arXiv:1102.0264](https://arxiv.org/abs/1102.0264); [Stacks Project, sheaf definition](https://stacks.math.columbia.edu/tag/006S).
- **R13:** S. Abramsky, S. Mansfield and R. S. Barbosa, *The Cohomology of Non-Locality and Contextuality*. [arXiv:1111.3620](https://arxiv.org/abs/1111.3620).
- **R14:** F. Bonchi et al., *String Diagram Rewrite Theory III: Confluence with and without Frobenius*. [arXiv:2109.06049](https://arxiv.org/abs/2109.06049).
- **R15:** A. Corradini et al., *AGREE — Algebraic Graph Rewriting with Controlled Embedding*. [arXiv:1411.4597](https://arxiv.org/abs/1411.4597).
- **R16:** R. Overbeek, J. Endrullis and A. Rosset, *Graph Rewriting and Relabeling with PBPO+: A Unifying Theory for Quasitoposes*. [arXiv:2203.01032](https://arxiv.org/abs/2203.01032); [PBPO+ tutorial](https://arxiv.org/abs/2301.12912).
- **R17:** Mathlib, `Mathlib.CategoryTheory.Elements`. [API and source](https://leanprover-community.github.io/mathlib4_docs/Mathlib/CategoryTheory/Elements.html).
- **R18:** E. Riehl, *Category Theory in Context*, §6.2. [Author's book](https://emilyriehl.github.io/files/context.pdf).
