# Sources and research notes

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

## Matrix variants (Matrix 2003, business matrices) — deliberately not shipped

Darrell Mann's Matrix 2003 (48 parameters, rebuilt from post-Altshuller patent analysis;
*Hands-On Systematic Innovation*, CREAX Press / IFR Press) and the later Business Matrix 3.0
(IFR Press, 2018) extend the classical matrix toward business and software conflicts. Valeri
Souchkov's business-oriented matrix adaptation serves the same goal. This repository ships only
the classical Altshuller matrix because: (a) the variant tables are recent creative compilations
whose redistribution terms have not been cleared; (b) TRIZfest-2025 business practitioners
report the classical matrix is often *easier* to interpret than the adapted ones, with
adaptations needed mainly for non-technical staff; and (c) the fail-closed discipline matters
more than table coverage. When a license-clean machine-readable variant source exists, the
importer (`scripts/import-matrix.mjs`) remains the sanctioned ingestion path — note it would
need its parameter dimension (48, not 39) widened first.

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
