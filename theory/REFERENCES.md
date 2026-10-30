# Literature references

Central bibliography for the categorical TRIZ theory, the finite-assurance implementation,
the eight-workstream research review and future plan, and the skill's supporting TRIZ/AI sources.
It includes methods adopted now, references used to correct suggestions, alternatives considered
but not adopted, and unresolved provenance leads. It is not limited to future plans. Unrelated
search results and papers appearing only inside another work's bibliography are outside this list.

Reference identifiers are stable: R1–R18 retain the original plan's anchors. New references are
appended rather than renumbering existing citations. The [implemented scope](../docs/categorical-assurance.md)
and [future plan](../docs/categorical-future-plan.md) state the actual guarantees and remaining
obligations; [sources and research notes](../skills/triz-innovation/references/sources.md) retain
methodology and data-provenance commentary.

Each entry records its use. **Current basis** means a definition or construction informs current
work, not that the entire cited formalism is implemented. **Method reference** records design
rationale. **Future work / considered alternative** includes directions explicitly deferred or
rejected. **TRIZ / AI context** and **evaluation source** support methodology or case research.
**Provenance lead / supplied material** marks incomplete bibliographic identification. No citation
establishes that the kernel satisfies a paper's hypotheses or that an engineering model is physically
valid. Mutable API pages should be read against the project's pinned dependencies.

## Topic index

| Topic | References |
|---|---|
| Certificates, trust and translation validation | [R1](#r1)–[R3](#r3), [R19](#r19)–[R20](#r20), [R48](#r48), [R84](#r84)–[R86](#r86) |
| Semantics, constraints and abstraction | [R4](#r4), [R9](#r9), [R21](#r21)–[R26](#r26), [R42](#r42)–[R43](#r43), [R75](#r75)–[R76](#r76), [R94](#r94) |
| Co-design, weakness, synthesis and engineering | [R5](#r5)–[R8](#r8), [R10](#r10)–[R11](#r11), [R30](#r30), [R91](#r91)–[R93](#r93) |
| Categorical foundations and alternatives | [R12](#r12)–[R13](#r13), [R17](#r17)–[R18](#r18), [R27](#r27)–[R29](#r29), [R31](#r31)–[R33](#r33), [R35](#r35)–[R39](#r39), [R49](#r49)–[R50](#r50), [R95](#r95)–[R96](#r96) |
| Rewriting, critical pairs and undecidability | [R14](#r14)–[R16](#r16), [R34](#r34), [R40](#r40)–[R41](#r41), [R44](#r44)–[R47](#r47), [R82](#r82)–[R83](#r83) |
| Official TRIZ, MPV and matrix sources | [R51](#r51)–[R69](#r69), [R87](#r87), [R89](#r89)–[R90](#r90), [R97](#r97)–[R100](#r100) |
| AI-TRIZ, published cases and supplied material | [R70](#r70)–[R74](#r74), [R77](#r77)–[R81](#r81), [R88](#r88) |

## R1

K. S. Namjoshi, *Certifying Model Checkers*, CAV 2001. [Author's paper](https://kedar-namjoshi.github.io/papers/Namjoshi-CAV-2001.pdf).

**Method reference.** Inductive safety certificates and independent checking of model-checking results; the generated model still needs correspondence to the request.

## R2

E. Alkassar, S. Böhme, K. Mehlhorn and C. Rizkallah, *A Framework for the Verification of Certifying Computations*. [arXiv:1301.7462](https://arxiv.org/abs/1301.7462).

**Method reference.** The generator/checker trust boundary and explicit checker premises; citing this framework does not verify this repository's encoder.

## R3

Lean Language Reference, *Validating a Lean Proof*. [Official reference](https://lean-lang.org/doc/reference/latest/ValidatingProofs/).

**Current basis.** Distinguishes kernel proof validation, assumptions and the intended meaning of the theorem being checked.

## R4

E. Clarke, O. Grumberg, S. Jha, Y. Lu and H. Veith, *Counterexample-Guided Abstraction Refinement*. [Authors' CAV paper](https://www.cs.cmu.edu/~emc/papers/Conference%20Papers/Counterexample-guided%20Abstraction%20Refinement.pdf).

**Method reference / future work.** Counterexample validation and abstraction refinement. The current exact finite behavioral comparison is not a general CEGAR implementation.

## R5

A. Censi, *A Mathematical Theory of Co-Design*, version 7. [arXiv:1512.08055](https://arxiv.org/abs/1512.08055).

**Current basis / future work.** Ordered resource dimensions, implementation choices and monotone composition. The current finite joint contracts do not implement every construction in the paper.

## R6

A. Censi, *Uncertainty in Monotone Co-Design Problems*. [arXiv:1609.03103](https://arxiv.org/abs/1609.03103).

**Future work.** Conservative uncertainty envelopes for co-design; separate from counts of declared evidence.

## R7

M. T. Bennett, *The Optimal Choice of Hypothesis Is the Weakest, Not the Shortest*. [arXiv:2301.12987](https://arxiv.org/abs/2301.12987).

**Current basis.** Weakness as extension size under the paper's task-distribution assumptions. Weighted operating coverage does not extend its uniform-task theorem.

## R8

A. Iannopollo, S. Tripakis and A. Sangiovanni-Vincentelli, *Constrained Synthesis from Component Libraries*, Science of Computer Programming 171 (2019). [University record and open paper](https://research.aalto.fi/en/publications/constrained-synthesis-from-component-libraries/).

**Method reference.** Finite component-library synthesis with explicit bounds; the repository's fixed-wiring search has its own contract and implementation.

## R9

G. Reissig, A. Weber and M. Rungger, *Feedback Refinement Relations for the Synthesis of Symbolic Controllers*. [arXiv:1503.03715](https://arxiv.org/abs/1503.03715).

**Future work.** Property-preserving dynamic abstraction and controller refinement require the stated simulation/interface hypotheses.

## R10

J.-Y. Le Boudec and P. Thiran, *Network Calculus*. [Authors' book](https://leboudec.github.io/netcal/latex/netCalBook.pdf).

**Future work.** Arrival/service envelopes and backlog/delay bounds. The delivered discrete queue compiler is not a general network-calculus solver.

## R11

J. C. Baez and B. Fong, *A Compositional Framework for Passive Linear Networks*. [arXiv:1504.05625](https://arxiv.org/abs/1504.05625).

**Future work.** Compositional physical component adapters; the delivered resource checks do not establish passive-network semantics.

## R12

S. Abramsky and A. Brandenburger, *The Sheaf-Theoretic Structure of Non-Locality and Contextuality*. [arXiv:1102.0264](https://arxiv.org/abs/1102.0264); [Stacks Project, sheaf definition](https://stacks.math.columbia.edu/tag/006S).

**Current basis / considered extension.** Global sections and compatibility motivate exact finite joins. The Stacks Project supplies the sheaf definition; choosing compatible allowed sections is a separate constraint problem.

## R13

S. Abramsky, S. Mansfield and R. S. Barbosa, *The Cohomology of Non-Locality and Contextuality*. [arXiv:1111.3620](https://arxiv.org/abs/1111.3620).

**Considered alternative.** Cohomological obstructions were discussed but are not used as a complete decision procedure for global compatibility.

## R14

F. Bonchi et al., *String Diagram Rewrite Theory III: Confluence with and without Frobenius*. [arXiv:2109.06049](https://arxiv.org/abs/2109.06049).

**Future work.** Interface-aware critical pairs and confluence hypotheses. Named-occurrence commutation alone does not establish these hypotheses.

## R15

A. Corradini et al., *AGREE — Algebraic Graph Rewriting with Controlled Embedding*. [arXiv:1411.4597](https://arxiv.org/abs/1411.4597).

**Considered extension.** Explicit control of context embedding. The delivered absorber-aware ordinary DPO replay is not an implementation of AGREE.

## R16

R. Overbeek, J. Endrullis and A. Rosset, *Graph Rewriting and Relabeling with PBPO+: A Unifying Theory for Quasitoposes*. [arXiv:2203.01032](https://arxiv.org/abs/2203.01032). R. Overbeek and J. Endrullis, *A PBPO+ Graph Rewriting Tutorial*, EPTCS 377 (2023), 45–63, [arXiv:2301.12912](https://arxiv.org/abs/2301.12912).

**Considered extension.** Richer context control and relabeling, including the tutorial. PBPO+ has not been adopted as the repository's rewrite formalism.

## R17

Mathlib, `Mathlib.CategoryTheory.Elements`. [API and source](https://leanprover-community.github.io/mathlib4_docs/Mathlib/CategoryTheory/Elements.html).

**Future work / API reference.** The category-of-elements construction; the intended fibration or opfibration depends on variance and the chosen base.

## R18

E. Riehl, *Category Theory in Context*, §6.2. [Author's book](https://emilyriehl.github.io/files/context.pdf).

**Future work / definition reference.** Kan extensions require a specified functor, unit and universal property; these do not supply a physical mechanism.

## R19

R. M. McConnell, K. Mehlhorn, S. Näher and P. Schweitzer, *Certifying Algorithms*, Computer Science Review 5(2), 119–161 (2011). [DOI:10.1016/j.cosrev.2010.09.009](https://doi.org/10.1016/j.cosrev.2010.09.009); [institutional record](https://researchportalplus.anu.edu.au/en/publications/certifying-algorithms/).

**Method reference.** Witness-producing algorithms and independent result checking. Corrects the supplied suggestion's journal attribution: this is not an ACM Computing Surveys article.

## R20

A. Pnueli, O. Shtrichman and M. Siegel, *Translation Validation: From SIGNAL to C*, in *Correct System Design*, LNCS 1710 (1999). [Author's abstract](https://cs.nyu.edu/home/people/in_memoriam/pnueli/pss00.htm); [paper](https://cs.nyu.edu/home/people/in_memoriam/pnueli/pss00.pdf).

**Method reference.** Validate the correspondence of each translation to its source. Regeneration/table comparison supplies useful checks here but is not a verified encoder.

## R21

P. Cousot and R. Cousot, *Abstract Interpretation: A Unified Lattice Model for Static Analysis of Programs by Construction or Approximation of Fixpoints*, POPL 1977, 238–252. [Author's record](https://cs.nyu.edu/~pcousot/COUSOTpapers/POPL77.shtml); [paper](https://www.di.ens.fr/~cousot/publications.www/CousotCousot-POPL-77-ACM-p238--252-1977.pdf).

**Method reference.** Sound approximation, semantic correspondence and fixpoint reasoning; local consistency is not automatically equivalent to a global relational solution.

## R22

P. Cousot and R. Cousot, *Refining Model Checking by Abstract Interpretation*, Automated Software Engineering 6(1), 69–95 (1999). [Author's record and paper](https://cs.nyu.edu/~pcousot/COUSOTpapers/ASE-99.shtml).

**Future work.** Sound abstraction/refinement and the conditions under which abstract conclusions transfer to concrete systems.

## R23

P. Cousot, *Asynchronous Correspondences Between Hybrid Trajectory Semantics*, in *Principles of Systems Design*, LNCS 13660 (2023). [Author's record](https://cs.nyu.edu/~pcousot/COUSOTpapers/TH2023.shtml); [full version, arXiv:2209.14945](https://arxiv.org/abs/2209.14945).

**Considered extension.** Hybrid trajectory abstractions and progress conditions. No continuous or hybrid adapter is delivered by the present finite-state work.

## R24

L. Lamport, *A High-Level View of TLA+*, author's introduction, updated 10 August 2021. [Author's page](https://lamport.azurewebsites.net/tla/high-level-view.html).

**Method reference.** State-based behavioral models and the distinction between a model and the physical system it describes; background for separating safety from temporal behavior.

## R25

D. L. Poole and A. K. Mackworth, *Artificial Intelligence: Foundations of Computational Agents*, 3rd ed., §4.3, *Consistency Algorithms*. [Authors' chapter](https://www.cs.ubc.ca/~poole/aibook/3e/html/ArtInt3e.Ch4.S3.html).

**Method reference.** Arc consistency can leave a constraint problem globally unsatisfiable. This informed the exact global join and the inconsistent triangle acceptance case.

## R26

NASA Kennedy Space Center, Modeling and Simulation, *Frequently Asked Questions*. [Official guidance](https://public.ksc.nasa.gov/mns/faq/).

**Method reference.** Modeling/simulation verification and validation context; mathematical consistency and evidence that a model represents its intended system are separate obligations. The page was a research source; retrieval timed out during the bibliography recheck on 30 October 2026.

## R27

D. I. Spivak, *The Operad of Wiring Diagrams: Formalizing a Graphical Language for Databases, Recursion, and Plug-and-Play Circuits* (2013). [arXiv:1305.0297](https://arxiv.org/abs/1305.0297).

**Current basis.** Typed ports, wires and compositional relational interpretations. The TRIZ encoding itself is defined by this repository.

## R28

B. Fong, *Decorated Cospans*, Theory and Applications of Categories 30(33), 1096–1120 (2015). [arXiv:1502.00872](https://arxiv.org/abs/1502.00872).

**Current basis.** Open systems composing along boundaries. The repository proves its own finite open-diagram relation-composition result under explicit interface hypotheses.

## R29

B. Fong and D. I. Spivak, *An Invitation to Applied Category Theory: Seven Sketches in Compositionality*, Cambridge University Press (2019). [DOI:10.1017/9781108668804](https://doi.org/10.1017/9781108668804).

**Current basis / background.** Monoidal preorders, resource theories, co-design and wiring diagrams; vocabulary and constructions, rather than validation of TRIZ concepts.

## R30

T. Fritz, *Resource Convertibility and Ordered Commutative Monoids*, Mathematical Structures in Computer Science 27(6), 850–938 (2017). [DOI:10.1017/S0960129515000444](https://doi.org/10.1017/S0960129515000444).

**Current basis.** Componentwise resource ordering motivates retaining dimensions instead of inventing a scalar ideality score.

## R31

B. Clarke, D. Elkins, J. Gibbons, F. Loregian, B. Milewski, E. Pillmore and M. Román, *Profunctor Optics, a Categorical Update*, Compositionality 6 (2024). [DOI:10.32408/compositionality-6-1](https://doi.org/10.32408/compositionality-6-1).

**Considered alternative.** Bidirectional composition and residuals. The kernel uses explicit reverse wires and declared state; it does not implement profunctor/coend formulas.

## R32

N. Ghani, J. Hedges, V. Winschel and P. Zahn, *Compositional Game Theory*, LICS 2018, 472–481. [DOI:10.1145/3209108.3209165](https://doi.org/10.1145/3209108.3209165).

**Considered alternative.** Forward action and back-reaction; no game-theoretic equilibrium semantics is claimed for the kernel.

## R33

D. Jaz Myers, *Categorical Systems Theory*, book draft, version dated 3 September 2023 in the original source notes. [Author's draft](https://www.davidjaz.com/Papers/DynamicalBook.pdf).

**Current basis / considered extension.** Open dynamical systems. Finite nondeterministic synchronous Mealy behavior and bounded reachability are adopted; smooth dynamics, controller synthesis and double categories are not.

## R34

F. Bonchi, F. Gadducci, A. Kissinger, P. Sobociński and F. Zanasi, *String Diagram Rewrite Theory I: Rewriting with Frobenius Structure*, Journal of the ACM 69(2) (2022). [DOI:10.1145/3502719](https://doi.org/10.1145/3502719); [arXiv:2012.01847](https://arxiv.org/abs/2012.01847).

**Current basis.** Ordered hypergraph interfaces and DPO no-dangling/no-identification conditions. The mapping from function models to these hypergraphs is repository-specific.

## R35

S. Mac Lane, *Categories for the Working Mathematician*, 2nd ed., Graduate Texts in Mathematics 5, Springer (1998), chapter X, *Kan Extensions*. [Publisher record](https://link.springer.com/book/10.1007/978-1-4757-4721-8).

**Considered alternative.** The previous trim-as-Kan-extension framing was removed: absorber attachment is declared data, and no appropriate trimming functor/universal property was established.

## R36

J. C. Baez and J. Master, *Open Petri Nets*, Mathematical Structures in Computer Science 30(3), 314–341 (2020). [arXiv:1808.05415](https://arxiv.org/abs/1808.05415); [authors' manuscript](https://math.ucr.edu/home/baez/petri.pdf).

**Considered extension.** Open process models and reachability semantics; process trimming via Petri nets has not been implemented.

## R37

J. C. Baez and B. S. Pollard, *A Compositional Framework for Reaction Networks*, Reviews in Mathematical Physics 29, 1750028 (2017). [arXiv:1704.02051](https://arxiv.org/abs/1704.02051).

**Considered extension.** Compositional reaction networks, rate equations and steady-state black-boxing; no reaction-network or ODE semantics is claimed here.

## R38

A. Grothendieck et al., *Revêtements étales et groupe fondamental (SGA 1)*, Lecture Notes in Mathematics 224, Springer (1971), Exposé VI; updated edition with remarks by M. Raynaud. [Updated text, arXiv:math/0206203](https://arxiv.org/abs/math/0206203); [Stacks Project bibliography](https://stacks.math.columbia.edu/bibliography/SGA1).

**Considered extension.** Fibered categories as a possible 9-windows interpretation. A presheaf or grid functor alone does not establish the proposed full-grid fibration.

## R39

D. I. Spivak, *Simplicial Databases* (2009). [arXiv:0904.2012](https://arxiv.org/abs/0904.2012).

**Considered extension.** Relational data, schemas and categorical database operations; background to the 9-windows/fibration proposal, not a claim that a simplicial database is implemented.

## R40

H. Ehrig, K. Ehrig, U. Prange and G. Taentzer, *Fundamentals of Algebraic Graph Transformation*, Springer (2006). [DOI:10.1007/3-540-31188-2](https://doi.org/10.1007/3-540-31188-2).

**Current basis / future work.** DPO rewriting foundations. Particular evolution rules are implemented; a complete evolution-trend calculus is not.

## R41

A. Corradini, U. Montanari, F. Rossi, H. Ehrig, R. Heckel and M. Löwe, *Algebraic Approaches to Graph Transformation — Part I: Basic Concepts and Double Pushout Approach*, in *Handbook of Graph Grammars and Computing by Graph Transformation*, Vol. 1, World Scientific (1997). [DOI:10.1142/9789812384720_0003](https://doi.org/10.1142/9789812384720_0003).

**Current basis / background.** Algebraic graph transformation and gluing conditions; the named rules and their TRIZ interpretation remain explicit repository definitions.

## R42

G. Reissig and M. Rungger, *Feedback Refinement Relations for Symbolic Controller Synthesis*, IEEE Conference on Decision and Control (2014), 88–94. [Author's record](https://www.reiszig.de/gunther/pubs/ReissigRungger17aC.html).

**Considered extension.** Earlier conference treatment of the feedback-refinement direction in [R9](#r9); no controller synthesis is delivered by this PR.

## R43

G. Reissig and M. Rungger, *Symbolic Optimal Control*. [arXiv:1709.07333](https://arxiv.org/abs/1709.07333), submitted 2017, revised 2018.

**Considered extension.** Background located during abstraction/controller research; not used as a proof of the delivered finite refinement checks.

## R44

I. Hristakiev and D. Plump, *Towards Critical Pair Analysis for the Graph Programming Language GP 2*, WADT 2016 revised selected papers, LNCS 10644, 153–169 (2017). [DOI:10.1007/978-3-319-72044-9_11](https://doi.org/10.1007/978-3-319-72044-9_11); [author manuscript](https://eprints.whiterose.ac.uk/id/eprint/124166/1/HristakievPlump.WADT16.pdf).

**Future work.** Symbolic critical-pair construction under stated GP 2 restrictions. This is the precise 2017 construction reference behind the supplied suggestions; its coverage result does not automatically apply to this kernel's rule language.

## R45

D. Plump, *Hypergraph Rewriting: Critical Pairs and Undecidability of Confluence*, in *Term Graph Rewriting: Theory and Practice*, Wiley (1993), chapter 15, 201–213. [Institutional record and manuscript](https://eprints.whiterose.ac.uk/id/eprint/243833/).

**Scope correction.** Confluence can be undecidable even for finite terminating hypergraph rewrite systems. Ordinary critical-pair joinability is not a universal confluence test; the interface-aware results in [R14](#r14) have different hypotheses.

## R46

D. Plump, *Termination of Graph Rewriting Is Undecidable*, Fundamenta Informaticae 33(2), 201–209 (1998). [DOI:10.3233/FI-1998-33204](https://doi.org/10.3233/FI-1998-33204).

**Scope correction.** The 1998 result concerns termination, not the confluence result in [R45](#r45). Failure of the kernel's sufficient finite measure is not proof of nontermination.

## R47

A. Matsui, I. Obi, G. Sabbagh, L. Torres, D. Kessler, J. F. Meleiro and K. Muroya, *A Critical Pair Enumeration Algorithm for String Diagram Rewriting*, ACT 2025 proceedings, EPTCS 442, 91–105 (2026). [DOI:10.4204/EPTCS.442.7](https://doi.org/10.4204/EPTCS.442.7); [arXiv:2603.09433](https://arxiv.org/abs/2603.09433); [authors' implementation](https://github.com/GuiSab/hypergraphrewriting).

**Future work / implementation lead.** Exhaustive enumeration for left-connected convex DPOI, with a proof-of-concept Haskell implementation. Its restrictions and hypergraph-isomorphism deduplication gap must be accounted for before reuse; no dependency is added here.

## R48

N. Froleyks, E. Yu, M. Preiner, A. Biere and K. Heljanko, *Introducing Certificates to the Hardware Model Checking Competition*, CAV 2025, LNCS 15931, 281–295. [DOI:10.1007/978-3-031-98668-0_14](https://doi.org/10.1007/978-3-031-98668-0_14); [author manuscript](https://cca.informatik.uni-freiburg.de/papers/FroleyksYuPreinerBiereHeljanko-CAV25.pdf).

**Method reference / suggestion checked.** The HWMCC'24 safety-witness format has five SAT obligations plus a polynomial-time reset-stratification check. This is a certificate-architecture precedent, not a statement that this kernel uses SAT or that every Certifaiger version makes exactly five solver calls; see [R84](#r84)–[R86](#r86).

## R49

Mathlib, `Mathlib.Algebra.Order.Quantale`. [API and source](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Algebra/Order/Quantale.html).

**Future work / API reference.** `Quantale.rightMulResiduation` and its adjunction law were proposed as ingredients for residuals. They do not supply the application-specific relational instance or independent multi-hole factorization proof.

## R50

Mathlib, `Mathlib.Topology.Sheaves.Alexandrov`. [API and source](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Topology/Sheaves/Alexandrov.html).

**Considered analogy / API reference.** `principalsKanExtension` is a right Kan extension in its stated setting. It does not automatically turn supersystem collapse into the left Kan extension proposed in the supplied suggestions.

## R51

MATRIZ, *Methodology*. [Official overview](https://matriz.org/methodology/).

**TRIZ context.** Problem identification, problem solving and concept justification; the skill's stage router is an adaptation, not an official methodology standard.

## R52

MATRIZ, *TRIZ Knowledge Base*. [Official knowledge base](https://wiki.matriz.org/knowledge-base/triz/).

**TRIZ context.** Terminology and tool definitions; specific kernel-relevant pages are listed separately below.

## R53

MATRIZ, *Academia*. [Official archive](https://matriz.org/academia/).

**TRIZ context / discovery source.** Original material, proceedings, TRIZ Review and certification reports/theses. An archive listing is not evidence for an individual engineering claim.

## R54

MATRIZ, *TRIZ Review 2025*, Vol. 3, ISBN 978-83-972661-1-7. [Official volume](https://matriz.org/wp-content/uploads/2025/10/TRIZ-Review-2025.pdf).

**TRIZ context / evaluation source.** Methodological terminology and organizational applications; includes the crushed-stone example identified in [R80](#r80).

## R55

MATRIZ, *TRIZfest 2024* conference archive and proceedings, ISBN 9788397266100. [Official conference archive](https://matriz.org/trizfest/).

**TRIZ context.** Applied-case background recorded in the skill's original research notes; the archive landing page may change as conferences are added.

## R56

MATRIZ, *Proceedings of the 20th International Conference TRIZfest-2025*, ISBN 978-83-972661-2-4. [Official proceedings, posted February 2026](https://matriz.org/wp-content/uploads/2026/02/TRIZfest-2025-Proceedings.pdf).

**TRIZ context / evaluation source.** Business, engineering and AI-assisted innovation cases. Individual benchmark articles are identified in [R77](#r77)–[R79](#r79) and [R81](#r81); the financial-sector and eleven-AI-system articles are [R87](#r87)–[R88](#r88). Empirical maturity must be assessed per case.

## R57

MATRIZ, *TRIZfest 2025 Report*. [Official report](https://matriz.org/wp-content/uploads/2025/12/TRIZfest-2025-Report-final.pdf).

**TRIZ context.** Conference/activity summary, distinct from the research proceedings and from validation of a proposed concept.

## R58

MATRIZ, *TRIZfest 2021 Proceedings*. [Official proceedings](https://matriz.org/wp-content/uploads/2021/12/TRIZfest-2021-Proceedings.pdf).

**TRIZ context.** Published TRIZ Reverse and constrained distribution-strategy cases; business-tool context also appears in [R69](#r69).

## R59

MATRIZ, *TRIZfest 2019 Proceedings*. [Official proceedings](https://matriz.org/wp-content/uploads/2019/12/TRIZfest-2019-Proceedings.pdf).

**TRIZ context.** Product marketing, digital anti-trolling and market-adjacency cases consulted in the original skill research.

## R60

MATRIZ Knowledge Base, *Trimming Rules*. [Official definition](https://wiki.matriz.org/docs/triz/problem-solving-tools-5807/trimming-6398/trimming-rules-6730/).

**Current basis / TRIZ context.** Rules A, B and C supply the trimming interpretation. The page prescribes no execution order; the kernel's ordering is its own convention.

## R61

MATRIZ Knowledge Base, *Function*. [Official definition](https://wiki.matriz.org/docs/triz/problem-solving-tools-5807/function-cost-analysis-7189/function-analysis-5611/function-modeling-5810/function-5674/).

**Current basis / TRIZ context.** Useful/harmful rating and performance levels for useful functions; terminology underlying the kernel's polarity annotations.

## R62

MATRIZ Knowledge Base, *Algorithm for Resolving Physical Contradictions*. [Official algorithm](https://wiki.matriz.org/docs/triz/problem-solving-tools-5890/contradictions/physical-contradiction-6056/algorithm-for-resolving-physical-contradictions/).

**Current basis / TRIZ context.** Five separation types: space, time, relation/conditions, direction and system level. Actual applicability still depends on the declared engineering model.

## R63

MATRIZ Knowledge Base, *Contradiction Matrix*; TRIZ40, public classical matrix. [Official matrix reference](https://wiki.matriz.org/knowledge-base/triz/problem-solving-tools-5890/contradictions/engineering-contradiction-5995/contradiction-matrix-6026/); [TRIZ40 table named by the importer](https://www.triz40.com/aff_Matrix_TRIZ.php).

**Current basis / data provenance.** Classical Altshuller matrix numbering and lookup context. These links do not establish redistribution rights for later matrix variants. The source notes mention an imported workbook without a recoverable workbook URL in current matrix metadata; that provenance gap remains explicit.

## R64

S. Litvin, *Main Parameters of Value: TRIZ-Based Tool Connecting Business Challenges to Technical Problems in Product/Process Innovation*, keynote, 7th Japan TRIZ Symposium, Yokohama, 9 September 2011. [Conference-hosted presentation](https://www.triz-japan.org/PRESENTATION/sympo2011/Pres-Overseas/EI01eS-Litvin_%28Keynote%29-110817.pdf).

**TRIZ context.** The MPV identification pipeline connecting business needs and technical problems; this expands the abbreviated title in the original source notes.

## R65

S. Litvin and P. Rutten, *MPV — Voice of the Product*, white paper (2013), named in the original source notes. The available archive presents *“Voice of the Product” as a Breakthrough Innovation Tool*. [Attributed archived text](https://triz-summit.ru/onto_triz/mod/metod/no_triz/mpv/mpv/vop/); [archive's MPV bibliography](https://triz-summit.ru/onto_triz/mod/metod/no_triz/mpv/).

**TRIZ context / provenance lead.** MPV and expressed versus latent needs. The precise relationship between the named 2013 white-paper edition and this archived text has not been independently established; retain both titles rather than inventing publication metadata.

## R66

N. Kano, N. Seraku, F. Takahashi and S. Tsuji, *Attractive Quality and Must-Be Quality*, Journal of the Japanese Society for Quality Control 14(2), 147–156 (1984). [Publisher record and DOI:10.20684/quality.14.2_147](https://www.jstage.jst.go.jp/article/quality/14/2/14_KJ00002952366/_article/-char/en).

**TRIZ context.** Customer-perceived quality categories inform the MPV discussion. The skill's satisfaction × awareness matrix is a practitioner operationalization, not a verbatim Kano result.

## R67

D. L. Mann, S. Dewulf, B. Zlotin and A. Zusman, *Matrix 2003: Updating the TRIZ Contradiction Matrix*, CREAX Press (2003). [Authors' contemporary paper, reference 2](https://www.osaka-gu.ac.jp/php/nakagawa/TRIZ/eTRIZ/epapers/e2003Papers/eMannDeWulf0303/eMannMatrix030316.html).

**Considered alternative.** The 48-parameter matrix was discussed but not shipped. This corrects the source notes' abbreviated single-author attribution; the technical and business *Hands-On* books are separate entries [R89](#r89)–[R90](#r90). Bibliographic identification does not clear redistribution rights.

## R68

D. Mann, *Business Matrix 3.0*, IFR Press (2018), ISBN 978-1-912670-00-0. [Author/publisher's first-edition listing](https://si-shop.org.uk/business-matrix-3-0/); [contemporary XTRIZ bibliographic notice](https://www.xtriz.com/newsletter/newsletterICGTCFall2018.pdf).

**Considered alternative.** A business-oriented contradiction matrix; no variant table is redistributed or implemented here. The separately listed [2022 PDF edition](https://si-shop.org.uk/business-matrix-3-0-pdf/) has ISBN 978-1-912670-01-7.

## R69

V. Souchkov, *Modern Tools for Business TRIZ*, TRIZfest 2021 Proceedings, 113–124. [Author-hosted paper](https://xtriz.com/publications/Souchkov%20-%20Modern%20Tools%20for%20Business%20TRIZ%20-%20TRIZfest-2021-Proceedings.pdf); [author's bibliography](https://www.xtriz.com/publications/).

**TRIZ context / considered alternative.** Business-method adaptations, including the matrix discussion. It supplies context rather than a license-cleared machine-readable business matrix.

## R70

S. Jiang, W. Li, Y. Qian, Y. Zhang and J. Luo, *AutoTRIZ: Automating Engineering Innovation with TRIZ and Large Language Models*. [arXiv:2403.13002](https://arxiv.org/abs/2403.13002), submitted 2024, revised 2025; Advanced Engineering Informatics 65 (2025), 103312, [DOI:10.1016/j.aei.2025.103312](https://doi.org/10.1016/j.aei.2025.103312).

**AI-TRIZ context.** Structured TRIZ/LLM pipelines and engineering evaluations; does not establish correctness of generated mappings or physical mechanisms.

## R71

L. Chen, Y. Song, S. Ding, L. Sun, P. Childs and H. Zuo, *TRIZ-GPT: An LLM-Augmented Method for Problem-Solving* (2024). [arXiv:2408.05897](https://arxiv.org/abs/2408.05897).

**AI-TRIZ context.** Stepwise problem transformation and case evaluation; independent substantiation remains necessary.

## R72

K. Szczepanik and J. A. Chudziak, *TRIZ Agents: A Multi-Agent LLM Approach for TRIZ-Based Innovation* (2025), ICAART 2025, Vol. 1, 196–207, [DOI:10.5220/0013321900003890](https://doi.org/10.5220/0013321900003890). [arXiv:2506.18783](https://arxiv.org/abs/2506.18783).

**AI-TRIZ context.** Specialized tool-using agents and an engineering case; no general guarantee for agent-generated innovation follows.

## R73

S. Trapp and J. Warschat, *LLM-Based Extraction of Contradictions from Patents* (2024). [arXiv:2403.14258](https://arxiv.org/abs/2403.14258).

**AI-TRIZ context.** Contradiction/parameter extraction is a separate abstraction task, motivating explicit mappings and evaluations.

## R74

Two Russian-language tool-catalog and stage-routing slides supplied by the user on 30 July 2026, as recorded in the skill's original source notes. [Repository provenance note](../skills/triz-innovation/references/sources.md#supplied-reference-slides).

**Supplied material / unresolved provenance.** Author, original deck, publication date and rights were not identifiable from the supplied images. The independent catalog/router is provisional; screenshots are not republished. This entry is a provenance record, not a verified published reference.

## R75

W. Ren and D. V. Dimarogonas, *Symbolic Abstractions for Nonlinear Control Systems via Feedback Refinement Relation* (2020). [arXiv:2011.12824](https://arxiv.org/abs/2011.12824); [author-hosted paper](https://people.kth.se/~dimos/pdfs/Wei_Automatica_2020.pdf).

**Considered extension.** Nonlinear and time-delay abstraction background located during research; these control-system constructions are not implemented.

## R76

J. Calbert, A. Girard and R. M. Jungers, *Characterizing Simulation Relations Through Control Architectures in Abstraction-Based Control*, Automatica (2026). [Publisher record](https://www.sciencedirect.com/science/article/pii/S0005109826002244), DOI:10.1016/j.automatica.2026.113040.

**Considered extension.** Simulation relations and concretization interfaces. Included as a research lead, not as a proof that current finite behavioral refinement transfers arbitrary control properties.

## R77

A. Khristenko, *TRIZ in Airport Activities (Russian Airports)*, TRIZfest 2025 Proceedings, 306–314; benchmark cases on 308–309 and 311. [Proceedings](https://matriz.org/wp-content/uploads/2026/02/TRIZfest-2025-Proceedings.pdf).

**Evaluation source.** Passenger distribution and supplier-partnership cases. Case-specific implementation/outcome labels are preserved in the evaluation data; this is one paper supporting two cases.

## R78

T. S. Yeoh, *Elimination of Incomplete Seal in Tape & Reel System Using ARIZ*, TRIZfest 2025 Proceedings, 109–125. [Proceedings](https://matriz.org/wp-content/uploads/2026/02/TRIZfest-2025-Proceedings.pdf).

**Evaluation source.** Engineering case used in the published-case corpus; a benchmark reconstruction is not a new validation experiment.

## R79

M. Szymaszek and S. Yatsunenko, *Problem Solving in the Production Process of Refractory Materials Using TRIZ Tools*, TRIZfest 2025 Proceedings, 221–227. [Proceedings](https://matriz.org/wp-content/uploads/2026/02/TRIZfest-2025-Proceedings.pdf).

**Evaluation source.** Refractory-production case; source outcomes and caveats stay separate from solver prompts.

## R80

N. B. Primak and D. N. Primak, *Increasing the Idealness of Systems with Implicit Structure by Resolving Contradictions in Their Requirements Using Methods of Mathematical Experiment Planning*, TRIZ Review Vol. 3 (2025), 68–74; worked case on 71–73. [Official volume](https://matriz.org/wp-content/uploads/2025/10/TRIZ-Review-2025.pdf).

**Evaluation source.** Crushed-stone mixture case. The reported result is source evidence, not a kernel theorem about a physical mixture.

## R81

A. Marais, N. Jali, Y. R. Bujang, H. Lenando and N. Kulathuramaiyer, *TRIZ-Based Approach to Enhance Alumni Relations in a Malaysian Public University*, TRIZfest 2025 Proceedings, 336–345. [Proceedings](https://matriz.org/wp-content/uploads/2026/02/TRIZfest-2025-Proceedings.pdf).

**Evaluation source.** Alumni-engagement case; distinguish proposed actions from implemented or experimentally evaluated outcomes.

## R82

I. Hristakiev and D. Plump, *Checking Graph Programs for Confluence*, STAF 2017 collocated workshops, revised selected papers, LNCS 10748, 92–108 (2018; workshop manuscript 2017). [DOI:10.1007/978-3-319-74730-9_8](https://doi.org/10.1007/978-3-319-74730-9_8); [workshop manuscript](https://pages.di.unipi.it/corradini/Workshops/GCM2017/papers/Hristakiev-Plump-GCM2017.pdf).

**Future work.** Strong joinability and local-confluence conditions for restricted attributed rules. Termination and the required coverage/compatibility conditions remain separate obligations.

## R83

D. Plump, *Confluence of Graph Transformation Revisited*, in *Processes, Terms and Cycles: Steps on the Road to Infinity*, LNCS 3838, 280–308 (2005). [DOI:10.1007/11601548_16](https://doi.org/10.1007/11601548_16).

**Scope correction / further reference.** Explains why ordinary critical-pair joinability is insufficient and why stronger compatibility conditions matter. Added while verifying the supplied 1993/1998 leads.

## R84

N. Froleyks and E. Yu, *Hardware Model Checking Certification with Certifaiger and Cerbtora*, IJCAR 2026, LNCS 16688, 276–285. [DOI:10.1007/978-3-032-32589-1_17](https://doi.org/10.1007/978-3-032-32589-1_17); [Certifaiger source](https://github.com/Froleyks/certifaiger).

**Method reference / further reference.** Split, merged and parallel checking configurations show why the five safety obligations in [R48](#r48) do not imply five solver invocations in every configuration. The external tool is not a repository dependency.

## R85

E. Yu, A. Biere and K. Heljanko, *Progress in Certifying Hardware Model Checking Results*, CAV 2021, LNCS 12760, 363–386. [DOI:10.1007/978-3-030-81688-9_17](https://doi.org/10.1007/978-3-030-81688-9_17); [author manuscript](https://fmv.jku.at/papers/YuBiereHeljanko-CAV21.pdf).

**Method reference / further reference.** Earlier Certifaiger/k-witness certification includes a QBF obligation. Retained to make the version-specific distinction explicit, rather than describing all hardware certification as SAT-only.

## R86

E. Yu, N. Froleyks, A. Biere and K. Heljanko, *Stratified Certification for k-Induction*, FMCAD 2022, 59–64. [DOI:10.34727/2022/isbn.978-3-85448-053-2_11](https://doi.org/10.34727/2022/isbn.978-3-85448-053-2_11); [arXiv:2208.01443](https://arxiv.org/abs/2208.01443).

**Method reference / further reference.** This formulation uses six SAT checks and a polynomial-time check. Added when verifying the supplied HWMCC/Certifaiger lead; it is distinct from the HWMCC'24 format in [R48](#r48).

## R87

S. S. Khovanov, A. V. Kudryavtsev, S. A. Yakovenko and D. I. Pravkin, *Adaptation of TRIZ for Solving Business Challenges in the Financial Sector*, TRIZfest 2025 Proceedings, 31–40. [Official proceedings](https://matriz.org/wp-content/uploads/2026/02/TRIZfest-2025-Proceedings.pdf).

**TRIZ context.** The financial-sector implementation and MPV discussion cited in the original source notes. Practitioner reports do not establish a universal ranking of TRIZ tools or validate a kernel resource model.

## R88

Issac Lim Sing Sheng, Izaac Chong Yen Juin, Tan Eng Hoo and Sebastian Kam Jia Yong, *Utilizing Generative Artificial Intelligence as a Personal Tutor for TRIZ Learning*, TRIZfest 2025 Proceedings, 390–402. [Official proceedings](https://matriz.org/wp-content/uploads/2026/02/TRIZfest-2025-Proceedings.pdf).

**AI-TRIZ context.** Eleven-system comparison discussed in the skill's source notes. Only one system received explicit MyTRIZ textbooks, so it is a confounded comparison rather than a same-model skill/no-skill experiment.

## R89

D. L. Mann, *Hands-On Systematic Innovation*, CREAX Press (2002), ISBN 90-77071-02-4. [Author/publisher's technical-book listing](https://si-shop.org.uk/hands-on-systematic-innovation-technical/).

**TRIZ context / considered alternative.** Technical systematic-innovation reference named alongside the matrix variants in the source notes. It is a separate publication from *Matrix 2003* and from the business/management volume in [R90](#r90).

## R90

D. Mann, *Hands on Systematic Innovation for Business & Management*, first published 2004; publisher lists second-edition dates 2007 and 2014, ISBN 1-898546-73-8. [Author/publisher's listing](https://si-shop.org.uk/hands-on-systematic-innovation-for-business-management/).

**TRIZ context / further reference.** Edition clarification found during the bibliography review. Kept separate from the technical book and from *Business Matrix 3.0*; no additional matrix table is shipped.

## R91

H. Riess, Y. Huang, M. Klawonn, G. Zardini and M. Hale, *Quantale-Enriched Co-Design: Toward a Framework for Quantitative Heterogeneous System Design* (2026). [arXiv:2603.29921](https://arxiv.org/abs/2603.29921).

**Future work.** As its abstract states, monotone co-design ([R5](#r5)) generalised to quantales, covering cost, confidence and implementation sets as well as Boolean feasibility, with heterogeneous composition by change of base. Only the abstract has been read. It motivates the staged graded relations of [FUTURE-PLANS.md](../docs/FUTURE-PLANS.md) Q1; nothing in the kernel implements it.

## R92

C. Briat, *codesign-mcdp: A Python Library for Monotone Co-Design Problems*, reference manual v0.2.1 (2026), MIT licence. [arXiv:2607.18415](https://arxiv.org/abs/2607.18415); [source](https://github.com/cbriat/codesign-mcdp).

**Future work / considered tool.** The antichain calculus, series, parallel and feedback composition, a Kleene solver, and declarative and modular builders: a candidate independent oracle for differential tests of `triz_feasibility` (FUTURE-PLANS Q3). An automated review notes that the library does not verify user-supplied monotonicity and that its newer sections rest on unproven theorems; only its core would be used, as an optional development dependency.

## R93

G. Zardini, D. Milojevic, A. Censi and E. Frazzoli, *Co-Design of Embodied Intelligence: A Structured Approach*, IROS 2021. [arXiv:2011.10756](https://arxiv.org/abs/2011.10756).

**Method reference.** Monotone co-design ([R5](#r5)) applied to the full hardware and software stack of a self-driving vehicle; later talks by the authors extend it to mobility systems, from city policy down to vehicle autonomy. It motivates workflow guidance on modelling supersystem constraints as design problems (FUTURE-PLANS Q4). It does not validate any kernel resource model.

## R94

D. Vagner, D. I. Spivak and E. Lerman, *Algebras of Open Dynamical Systems on the Operad of Wiring Diagrams*, Theory and Applications of Categories 30(51), 1793–1822 (2015). [arXiv:1408.1598](https://arxiv.org/abs/1408.1598).

**Future work.** Algebras on the operad of wiring diagrams of [R27](#r27): the substitution structure behind hierarchical boxes (FUTURE-PLANS Q5). Citing it does not establish that the kernel's steady-state semantics is such an algebra; that would be a substitution lemma proved in `theory/Semantics.lean`. The lens and optics view of dynamics is not planned.

## R95

P. Le Masson, A. Hatchuel and B. Weil, *Sheafification as a design technique for creative preservation: principles, illustrations, and first applications*, Proceedings of the Design Society (ICED23), 2023. [DOI:10.1017/pds.2023.317](https://doi.org/10.1017/pds.2023.317).

**Considered alternative / analogy only.** A C-K/topos design model: the knowledge base is a topos, and sheafification preserves existing knowledge while expanding it. It motivates minimal base refinement after an irreducible separation (FUTURE-PLANS Q6) as an analogy only, and is not a basis for any kernel theorem.

## R96

R. Bělohlávek, *Concept lattices and order in fuzzy logic*, Annals of Pure and Applied Logic 128 (2004), 277–298.

**Future work.** Concept lattices over complete residuated lattices: the graded form of the formal concepts behind the two-box weakest specification (FUTURE-PLANS Q1, stage 2). It needs a commutative, integral quantale with residuation, not an arbitrary quantale.

## R97

G. S. Altshuller, *АРИЗ-85-В* (ARIZ-85-V, algorithm of inventive problem solving), nine parts, in Russian. Official G. S. Altshuller Foundation. [Index](https://www.altshuller.ru/triz/ariz85v.asp); [Part 1](https://www.altshuller.ru/triz/ariz85v-1.asp); [Part 3](https://www.altshuller.ru/triz/ariz85v-3.asp).

**TRIZ context.** The primary text behind `references/ariz.md`'s step 1.1 section: step 1.1 states the mini-problem without special terms, note 4 limits that to the terms for the tool and the external environment and gives three reasons, and an ATTENTION box before step 3.3 asks for plain wording throughout. The pages are Windows-1251 encoded. Practice wisdom, not an experiment.

## R98

MATRIZ, *ARIZ 85-C: Algorithm of inventive problem solving – parts 1-3*, based on V. Philatov, A. Zusman, G. Altshuller and B. Zlotin, *Tools of Classical TRIZ*, Ideation International (1999), ISBN 978-1928747024. [MATRIZ PDF](https://wiki.matriz.org/wp-content/uploads/2025/08/ARIZ-85-C.pdf).

**TRIZ context.** An English text of Parts 1–3 of [R97](#r97); it names no translator. Its introduction asks that non-specialised replacements keep the "true" meaning, and its note 4 states the hidden-properties reason without [R97](#r97)'s formwork example. It notes that function analysis was less developed when ARIZ was written.

## R99

G. S. Altshuller, *АРИЗ-77* (ARIZ-77), in Russian. Official G. S. Altshuller Foundation. [Text](https://www.altshuller.ru/triz/ariz77.asp).

**TRIZ context.** An earlier version, cited for lineage only: its step 2.1 asks for the problem to be written without special terms, the instruction that ARIZ-85-В moved to step 1.1.

## R100

G. S. Altshuller, *АРИЗ-82-Г* (ARIZ-82-G), in Russian. Official G. S. Altshuller Foundation. [Text](https://www.altshuller.ru/triz/ariz82g.asp).

**TRIZ context.** An earlier version, cited for lineage only: its step 2.1 states the mini-problem without special terms, as ARIZ-85-В step 1.1 does.
