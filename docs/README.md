# Documentation

Start with the [repository README](../README.md) for installation and the tool map, or the
[agent reference](../skills/triz-innovation/references/categorical-model.md) for model fields,
tool protocols and verdict limits.

## Planning and assurance

| Document | Owns |
|---|---|
| [Roadmap](FUTURE-PLANS.md) | Current priorities, dependencies and the status of each workstream |
| [Assurance requirements](assurance-requirements.md) | Acceptance cases and proof/evidence obligations for future work |
| [Delivered assurance](categorical-assurance.md) | Implemented finite guarantees and trust boundaries |
| [Theory map](theory-map.md) | Theorem-to-verdict correspondence and what is not claimed |
| [Joint engineering synthesis](engineering-synthesis.md) | Design of coupled architecture, sizing and maintenance optimization |
| [Checked symbolic summaries](symbolic-summary-design.md) | Literature-backed proposal for exact summary composition, equivalent-choice search and dependency reuse |

The roadmap is the single source for prioritization. Design notes explain a proposed feature;
requirements state what would justify its claims. Neither records an implemented guarantee.
Merged implementation history belongs in the [changelog](../CHANGELOG.md) and git history.
The roadmap distinguishes the reference main revision from local changes awaiting integration.

## Models and tools

- [Importing models](importing-models.md): builders, supported adapters and draft review.
- [Component discovery](component-discovery.md): typed catalogues and bounded assembly search.
- [Synthesis search](synthesis-search.md): residual filtering, choice propagation, memoization,
  exhaustive comparison and [benchmarks](../benchmarks/synthesis/latest.md).
- [Shared finite relations](shared-relations.md): indexed evaluation and correlation propagation,
  connected-factor decomposition, [before/after benchmarks](../benchmarks/relations/latest.md)
  and [incremental tuple-index results](../benchmarks/tuple-index/latest.md).
- [Typed effects and lifecycle](typed-effects-lifecycle.md): dimensions, effect chains, costed
  dynamics and maintenance policies.
- [Bond graphs](bond-graphs.md): structural power/causality scope.
- [Mixed-system analysis](mixed-system-analysis.md): a runnable hardware/software/context example.

## Research and maintenance

- [Russian and Chinese formal TRIZ literature](formal-triz-literature.md): checked sources,
  mathematical content, reuse candidates and limits of the search.
- [Mathematical connections](math-connections.md): candidate bridges to formal libraries.
- [Bibliography](../theory/REFERENCES.md): stable R-identifiers and source-reading scope.
- [Publishing](PUBLISHING.md): release and distribution procedure.

The two planning files originated separately: acceptance criteria from #35 and a ranked
backlog from #37. The former `categorical-future-plan.md` is now `assurance-requirements.md`;
its acceptance criteria were retained. `engineering-synthesis-roadmap.md` is now `engineering-synthesis.md`,
so only `FUTURE-PLANS.md` carries the project backlog. The earlier documents remain in git.
