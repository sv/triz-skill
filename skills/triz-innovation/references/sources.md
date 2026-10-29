# Sources and research notes

The full bibliography is maintained in [theory/REFERENCES.md](../../../theory/REFERENCES.md),
including current foundations, research-review literature, deferred alternatives, official TRIZ
sources, AI-TRIZ studies and case articles. Each entry records its role and any provenance gap.
The notes below explain how those sources inform the skill.

## Primary current references

- [MATRIZ methodology](https://matriz.org/methodology/) — current official structure: problem
  identification, problem solving, and concept justification; links the evolving knowledge base,
  glossary, and interactive contradiction matrix.
- [MATRIZ Knowledge Base](https://wiki.matriz.org/knowledge-base/triz/) — current terminology and
  tool descriptions. Prefer it over secondary summaries when definitions differ.
- [MATRIZ Academia](https://matriz.org/academia/) — official archive of originals, TRIZ Review,
  TRIZfest proceedings, Level 4 reports, and Level 5 theses.
- [TRIZ Review 2025](https://matriz.org/wp-content/uploads/2025/10/TRIZ-Review-2025.pdf) — Volume 3,
  ISBN 978-83-972661-1-7.
- [TRIZfest 2024 archive](https://matriz.org/trizfest/) — conference report and proceedings, ISBN
  9788397266100.
- [TRIZfest 2025 proceedings](https://matriz.org/wp-content/uploads/2026/02/TRIZfest-2025-Proceedings.pdf)
  — ISBN 978-83-972661-2-4, published open access under CC BY.
- [TRIZfest 2025 report](https://matriz.org/wp-content/uploads/2025/12/TRIZfest-2025-Report-final.pdf)
  — activity and conference summary.
- [TRIZfest 2021 proceedings](https://matriz.org/wp-content/uploads/2021/12/TRIZfest-2021-Proceedings.pdf)
  — includes worked TRIZ Reverse and constrained distribution-strategy cases.
- [TRIZfest 2019 proceedings](https://matriz.org/wp-content/uploads/2019/12/TRIZfest-2019-Proceedings.pdf)
  — includes product marketing, digital anti-trolling, and market-adjacency cases.

## What changed in this skill

The 2025 Review explicitly warns about terminological ambiguity, mixing rigorous tools with unrelated
creativity techniques, and treating certification coverage as a learning workflow. Therefore this
skill:

- marks the user-supplied stage router as a routing aid, not an official standard;
- separates core TRIZ models, auxiliary creativity tools, and empirical validation;
- distinguishes the Ideal Final Result from the ideality ratio;
- starts with functional, causal, stakeholder, flow, and resource analysis instead of immediately
  forcing a contradiction matrix.

The official MATRIZ structure makes concept justification a first-class stage. Recent Review
articles extend systematic analysis to organizational goals, strategy, and development, while
TRIZfest 2024–2025 continues to publish applied cases across industries and AI-assisted innovation.
This supports a domain-neutral core, but not unvalidated one-to-one mappings from physical systems
to markets or people. Domain adaptations in this skill are labeled working translations and require
domain evidence.

## Published-case evaluation corpus

`../data/published-case-evals.json` reconstructs six problems from CC BY MATRIZ publications:

- TRIZfest 2025 airport cases for passenger demand/engagement and supplier partnership;
- TRIZfest 2025 tape-and-reel and refractory-production cases;
- TRIZ Review 2025's crushed-stone mixture worked example;
- TRIZfest 2025's university alumni-engagement case.

Solver prompts contain only pre-solution facts. Reported diagnosis, mechanisms, outcomes, and
publication caveats remain in judge-only fields and are not returned by `triz_evals`. Proposed-only
work is labeled separately from implemented or experimentally validated cases. The benchmark
does not require copying the published solution: a causally stronger, testable alternative can earn
full credit.

## MPV analysis — literature anchors

- S. Litvin (2011), *Main Parameters of Value: TRIZ-based tool connecting business and
  engineering*; Litvin & Rutten (2013), *MPV — Voice of the Product* (white paper). Origin of
  the value-parameter identification pipeline used in the workflow reference.
- TRIZfest-2025 financial-sector business-TRIZ paper: MPV analysis ranks in the top-5 tools for
  business projects; also formalizes ideality over weighted MPV sets (functional vs cost
  parameters with per-parameter normalization). Our classification matrix (satisfaction ×
  awareness) is the practitioner operationalization; the awareness axis descends from Kano et
  al. (1984), *Attractive quality and must-be quality* (Journal of the Japanese Society for
  Quality Control) — expressed vs unspoken needs.

## Multi-parameter matrix lookups

When a conflict involves several parameters per side, TRIZ practice looks up every
(improving × worsening) cell and treats principles recommended by more cells as stronger
candidates — the aggregation used by classical TRIZ software (CREAX/Goldfire-style occurrence
counting). This repo's `triz_matrix_multi` follows that practice: occurrence count, ties broken
by mean position, full per-cell detail, fail-closed when every cell is blank. Positional scoring
schemes (e.g. 100/90/80 points by in-cell position) exist in some prompt tools but the classical
sources do not document in-cell ordering as a preference rank, so none is used here.

## Categorical function models

### TRIZ grounding

The kernel behind `triz_function_model`, `triz_trim`, `triz_separate`, `triz_transform`, and
`triz_rule_apply` follows the MATRIZ knowledge base. Pages were checked on 2026-10-29.

- [Trimming rules](https://wiki.matriz.org/docs/triz/problem-solving-tools-5807/trimming-6398/trimming-rules-6730/)
  define three rules:
  - Rule A: the object of the useful function is removed too.
  - Rule B, self-service: the object performs the function itself.
  - Rule C: another component performs it.

  The page prescribes no order. It calls A the most radical, B less radical, and C the most
  frequently used. The kernel lists absorbers by that radicality, and puts supersystem
  resources last within rule C.
- [Function](https://wiki.matriz.org/docs/triz/problem-solving-tools-5807/function-cost-analysis-7189/function-analysis-5611/function-modeling-5810/function-5674/)
  rates a function useful or harmful. Only useful functions have a performance level: normal,
  insufficient, or excessive. The kernel's `polarity` is that rating.
- [Algorithm for resolving physical contradictions](https://wiki.matriz.org/docs/triz/problem-solving-tools-5890/contradictions/physical-contradiction-6056/algorithm-for-resolving-physical-contradictions/)
  lists five separation types: in space, in time, in relation (conditions), in direction, and
  at the system level. The kernel's axes are those five. Older secondary lists name four.

### Formal-methods analogies (not TRIZ methodology)

Applied category theory supplies the vocabulary and the shape of each check. It does not
validate any TRIZ concept, and no result below is computed by the kernel beyond what
[categorical-model.md](categorical-model.md) states. Each entry gives the reference, then what
it supports here.

- **Spivak (2013)**, *The operad of wiring diagrams: formalizing a graphical language for
  databases, recursion, and plug-and-play circuits*,
  [arXiv:1305.0297](https://arxiv.org/abs/1305.0297).
  Typed ports and wires: the model's shape.
- **Fong (2015)**, *Decorated cospans*, Theory and Applications of Categories 30(33), 1096–1120,
  [arXiv:1502.00872](https://arxiv.org/abs/1502.00872).
  Open systems that compose along their boundaries. `theory/Semantics.lean` proves this for
  declared behaviour: gluing open diagrams along a fully exposed interface composes their
  steady-state relations.
- **Fong & Spivak (2019)**, *An Invitation to Applied Category Theory: Seven Sketches in
  Compositionality*, Cambridge University Press, doi:10.1017/9781108668804.
  Monoidal preorders, resource theories, co-design, wiring diagrams.
- **Fritz (2017)**, *Resource convertibility and ordered commutative monoids*, Mathematical
  Structures in Computer Science 27(6), 850–938, doi:10.1017/S0960129515000444.
  **Censi (2015)**, *A mathematical theory of co-design*,
  [arXiv:1512.08055](https://arxiv.org/abs/1512.08055).
  Resources ordered componentwise. This is why ideality here is a comparison per dimension,
  not a sum.
  Censi also supplies `triz_feasibility`. Checked on 2026-10-29 against v7: Def. 13 (a monotone
  design problem), Props. 2–4 (parallel, series, and loop composition keep monotonicity),
  Def. 22 with eq. (26) (a loop's minimal resources as the least fixpoint of
  R ↦ Min ⋃_{r ∈ R} h(f₁, r) ∩ ↑r on antichains, found by Kleene's ascent from ⊥), and Prop. 5
  (memory O(width(R₀)) and work O(width(R₀) × height(A R₀) × c), where R₀ is the resource poset
  of the loop, A R₀ its lattice of antichains, and c the cost of one evaluation of the inner h).
- **Abramsky & Brandenburger (2011)**, *The sheaf-theoretic structure of non-locality and
  contextuality*, New Journal of Physics 13, 113036.
  **Abramsky, Mansfield & Barbosa (2012)**, *The cohomology of non-locality and contextuality*,
  EPTCS 95, 1–14.
  Obstructions to global sections. The separation check is the finite discrete case: a global
  section exists iff every cell's admissible set is non-empty (`exists_section_iff`), so no
  cohomology is needed.
- **Clarke, Elkins, Gibbons, Loregian, Milewski, Pillmore & Román (2024)**, *Profunctor optics,
  a categorical update*, Compositionality 6, doi:10.32408/compositionality-6-1.
  **Ghani, Hedges, Winschel & Zahn (2018)**, *Compositional game theory*, LICS '18, 472–481,
  doi:10.1145/3209108.3209165.
  Bidirectional composition, with forward action and back-reaction. The kernel models
  back-reaction as reverse wires instead. A box with declared state is read as a lens with a
  residual, the residual as its state; profunctor and coend formulas are not adopted.
- **Myers**, *Categorical Systems Theory*, book draft last updated 2023-09-03,
  [davidjaz.com](https://www.davidjaz.com/Papers/DynamicalBook.pdf).
  Open dynamical systems.
  - Adopted: finite nondeterministic Mealy machines composed synchronously along the wiring,
    and their bounded reachability (`triz_dynamics`).
  - Not adopted: smooth dynamics (ODEs, tangent bundles), controller synthesis, and double
    categories.
- **Bonchi, Gadducci, Kissinger, Sobociński & Zanasi (2022)**, *String diagram rewrite theory I:
  Rewriting with Frobenius structure*, Journal of the ACM 69(2), doi:10.1145/3502719,
  [arXiv:2012.01847](https://arxiv.org/abs/2012.01847). Checked on 2026-10-29: Def. 3.1
  (hypergraphs with ordered source and target lists), Def. 3.16 (the no-dangling and
  no-identification conditions), and Prop. 3.17 (a pushout complement exists iff both hold).
  Three uses here:
  - `triz_export`'s open-hypergraph form: hyperedges with ordered sources and targets, plus an
    interface;
  - the no-dangling check in `triz_transform`, where occurrences named by id make the
    no-identification condition trivial;
  - `triz_rule_apply`, which reads a model as a labelled hypergraph for matching and checks both
    conditions before each double-pushout application.

  The encoding of models as hypergraphs is this kernel's own; categorical-model.md gives it.

Considered and not adopted:

- **Mac Lane**, *Categories for the Working Mathematician*, 2nd ed., Springer GTM 5 (1998),
  chapter "Kan Extensions".
  Trimming as a left Kan extension of what remains. It was stated in `theory/`, never decided,
  and then removed. The decided trim (`triz_behavior`) depends on the absorber chosen, a trim
  that re-attaches a function is not an inclusion of the trimmed model, and no functor from
  function models along trims was defined. The functor `theory/Semantics.lean` defines, from open
  diagrams to relations, takes no trim (categorical-model.md).
- **Baez & Master (2020)**, *Open Petri nets*, MSCS 30(3), 314–341.
  **Baez & Pollard (2017)**, *A compositional framework for reaction networks*, Rev. Math.
  Phys. 29, 1750028.
  Candidates for process trimming.
- **Grothendieck & Raynaud**, SGA 1, Springer LNM 224 (1971), Exposé VI.
  **Spivak (2009)**, *Simplicial databases*, [arXiv:0904.2012](https://arxiv.org/abs/0904.2012).
  9 windows as a fibration.
  - Adopted: the level axis as typed restriction and collapse (`triz_nine_windows`), proved a
    presheaf on the poset of box sets; transitions as checked transformation sequences; and,
    in `theory/`, the subsystem and system rows as a functor from time × (box sets)ᵒᵖ to sets.
  - Not adopted: the fibration itself, and the supersystem row in that functor. No Grothendieck
    construction is built.
- **Ehrig, Ehrig, Prange & Taentzer (2006)**, *Fundamentals of Algebraic Graph
  Transformation*, Springer.
  **Corradini, Montanari, Rossi, Ehrig, Heckel & Löwe (1997)**, *Algebraic approaches to graph
  transformation, Part I*, in *Handbook of Graph Grammars and Computing by Graph
  Transformation*, Vol. 1, World Scientific.
  Evolution trends as double-pushout rewriting systems.
  - Adopted: trimming as a single rewrite at a named occurrence (`triz_transform` `trim`). It is
    checked by the no-dangling condition, cited from Bonchi et al. (2022) above.
  - Adopted: rules as data, occurrence search, and double-pushout application
    (`triz_rule_apply`), with three more evolution lines as rules: mono → bi, self-adjusting
    feedback, and changing the working field. Uneven development of subsystems is a detector
    over the same tool, not a rule.
  - Not adopted: the other evolution lines. categorical-model.md gives the reason for each.

## Matrix variants (Matrix 2003, business matrices) — deliberately not shipped

Mann, Dewulf, Zlotin and Zusman's *Matrix 2003: Updating the TRIZ Contradiction Matrix*
(CREAX Press, 2003; 48 parameters, rebuilt from post-Altshuller patent analysis) and Mann's later
*Business Matrix 3.0* (IFR Press, 2018) extend the classical matrix toward business and software
conflicts. Valeri Souchkov's business-oriented matrix adaptation serves the same goal. This repository ships only
the classical Altshuller matrix because: (a) the variant tables are recent creative compilations
whose redistribution terms have not been cleared; (b) TRIZfest-2025 business practitioners
report the classical matrix is often *easier* to interpret than the adapted ones, with
adaptations needed mainly for non-technical staff; and (c) the fail-closed discipline matters
more than table coverage. When a license-clean machine-readable variant source exists, the
importer (`scripts/import-matrix.mjs`) remains the sanctioned ingestion path — note it would
need its parameter dimension (48, not 39) widened first.

## Inventive standards: no data source

Router entry 26, Inventive standards, names no MCP tool, and `data/` holds no list of the
standards. No machine-readable source of their text with clear redistribution terms has been
identified for this repository, and the standards are not written into data from memory: a
standard the server returned would have nothing to be checked against. The kernel's
constructions (harm loops, trimming, `interpose`, the evolution-line rules) work on function
models; none of them is a standard. Until such a source exists, the agent applies the standards
from the literature it cites, and says which.

## Supporting AI-TRIZ research

These are useful engineering references, not official MATRIZ methodology:

- [AutoTRIZ](https://arxiv.org/abs/2403.13002) — Jiang et al.; an automated, structured TRIZ
  pipeline evaluated on textbook and engineering cases. The 2025 revision is also published in
  *Advanced Engineering Informatics*.
- [TRIZ-GPT](https://arxiv.org/abs/2408.05897) — Chen et al.; stepwise problem transformation and
  evaluation-validated prompting, with a mechanical-engineering case.
- [TRIZ Agents](https://arxiv.org/abs/2506.18783) — Szczepanik and Chudziak; specialized,
  tool-using agents for an engineering case.
- [LLM-based Extraction of Contradictions from Patents](https://arxiv.org/abs/2403.14258) — Trapp
  and Warschat; contradiction and engineering-parameter extraction remains a distinct abstraction
  task, supporting explicit mappings and evals instead of silent inference.

These works support deterministic retrieval, structured intermediate artifacts, and eval cases.
They do not establish that LLM-generated parameter mappings or concepts are correct; the
substantiation stage remains mandatory.

TRIZfest 2025's study of eleven generative-AI systems provides a closely related but confounded
comparison: only one specialized system received explicit MyTRIZ textbooks, and it generated a
different problem framing and more solution types, while expert review still found feasibility
errors. It supports knowledge augmentation plus domain validation, but it is not a same-model
skill/no-skill experiment.

## Supplied reference slides

Two Russian slides supplied by the user on 2026-07-30 contributed:

1. a catalog of 34 TRIZ and adjacent analysis/creativity tools;
2. a routing table for problem analysis, task modeling, and solution synthesis.

The original deck, author, date, and publication rights were not identifiable from the images alone.
Do not republish the screenshots. The independently written catalog in this skill is a provisional
interpretation; replace its provenance note if the original source is identified.

## Matrix provenance

`data/matrix.json` was imported from the matrix workbook linked in its metadata. Its parameter and
principle numbering is canonical; the English descriptions in this repository are concise
paraphrases. The underlying table is Altshuller's and widely republished; regenerate the file from
a source of your own choosing with the importer if needed.

## Assurance extension and future work

The implemented finite capabilities and exact limitations are recorded in
[categorical-assurance.md](../../../docs/categorical-assurance.md). The separate
[categorical-future-plan.md](../../../docs/categorical-future-plan.md) preserves the eight-workstream
roadmap, decisions on all eighteen supplied suggestions, and falsifying cases. The complete
[theory/REFERENCES.md bibliography](../../../theory/REFERENCES.md) also includes the existing
theory foundations, methods used to correct the suggestions, alternatives considered but not
adopted, and the TRIZ/AI and evaluation sources above; it is not limited to future work.
It distinguishes implementation from research analogies: certifying model checking (Namjoshi),
verified checkers (Alkassar et al.), implementation-aware co-design (Censi), bounded component
synthesis (Iannopollo et al.), sound abstraction/refinement, exact global-section constraints,
network calculus, and DPO with interfaces. A citation alone does not establish that a kernel
operation satisfies a paper's hypotheses.
