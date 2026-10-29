# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Categorical systems kernel (`src/act.ts`): TRIZ function models as typed open wiring
  diagrams. It is pure and shared by the stdio and hosted entries. Three new tools:
  - `triz_function_model`: wiring type-check, harm loops, ideality profile, separation, and
    baseline comparison.
    - The type-check fails closed on dangling, mis-directed, or mistyped wires.
    - Harm loops come from strongly connected components, with one witness cycle per harmful
      or excessive function. Useful-only feedback is not reported.
    - The ideality profile keeps each cost dimension separate. It gives a scalar ratio only
      under explicit weights.
    - The baseline-vs-concept comparison is componentwise, and a lost deliverable is never
      counted as a trade-off.
  - `triz_trim`: screens a trimming by MATRIZ rules A/B/C on carrier type and returns one
    trimming problem per absorber. Orphaned functions block the trim.
  - `triz_separate`: treats a physical contradiction as gluing over a finite space × time ×
    condition × direction × level base. It returns the separating axes per pair of demands
    and the conflict cells.
- `function-model.schema.json` (JSON Schema 2020-12), generated from the zod model by
  `pnpm schema`, with a drift test.
- Physical, software, and business example models in `examples/function-models/`.
- `theory/`: a Lean 4 / Mathlib (v4.32.2) package that proves the statements behind the
  checks, with no `sorry`. It also states trimming as a left Kan extension, which the kernel
  does not decide. A path-filtered `Lean` CI workflow builds it.
- `references/categorical-model.md`: the modelling protocol, the domain working translations,
  and what is not claimed. `sources.md` gains MATRIZ grounding for trimming rules, function
  rating, and the five separation types, plus verified applied-category-theory references.
- Exports: `triz_export` writes a model that type-checks as Graphviz DOT or as an open
  hypergraph. In the DOT, boxes are record nodes and functions are edges styled by rating. In the
  hypergraph, ports are carrier-typed vertices, boxes and functions are hyperedges, and the
  unwired ports are the interface. Both formats fail closed on a mistyped model. A decoder
  provides a lossless round trip.
- Label blindness: the structured verdicts of `checkModel`, `harmLoops`, `idealityProfile`,
  `trimCandidates`, `compareIdeality`, `separationCheck`, and `dynamize` are equivariant under
  renaming ids and changing labels (domain, names, layers, dimensions). Free text and id-order
  tie-breaks are excluded, as listed in `categorical-model.md`. Property tests check this with a seeded, dependency-free
  generator over 200 models with every array permuted. `triz_isomorphic` decides whether two
  models share a wiring shape. It uses a polynomial verifier and a bounded search, and reports
  `decided: false` rather than guessing.
- New example `connection-pool.json`: a software model with the bearing's wiring shape, which
  gets the same verdicts.
- Typed constructions via `triz_transform`. Each result type-checks, or the call fails closed.
  - The rewrite engine enforces the no-dangling condition and requires fresh ids.
  - Constructions are matched to their looked-up principle texts:
    - `segment` (Principle 1);
    - `take_out`, with interfering and needed readings (Principle 2);
    - `interpose` (Principle 24).
  - `trim` performs a typed-feasible trim. It re-attaches each kept function to an absorber.
- `triz_separate` gains `along`: the parameter as a function of one axis. With `time`, this is
  the checkable part of Principle 15 (Dynamics). It is reported only when the value must change.
- `triz_nine_windows`: system-operator views for each time snapshot.
  - Subsystem: restriction, with crossing functions as the boundary.
  - System: the model itself.
  - Supersystem: a collapse into one box that lists the harms it hides.
- Lean (`theory/`), all with no `sorry`:
  - typing is label-blind (`typed_rename`), and so are harm cycles (`transGen_equiv`);
  - deletion under the no-dangling condition, gluing, and re-attachment to a same-carrier
    port all keep typing;
  - restriction composes.
- 44 kernel tests, including golden DOT and hypergraph outputs for every example. The MCP smoke
  test calls `triz_export` and `triz_transform`, including their fail-closed paths.

### Changed

- `workflow.md` lists all five MATRIZ separation types, adding direction.
- `compareIdeality` matches deliverables by the (box, carrier) pair. The display key `box:carrier`
  could collide when ids contain `:`.

### Documented (not adopted)

- These remain analogies with sources:
  - 9 windows as a Grothendieck fibration, including any computed transition between times;
  - double-pushout rewriting systems (rules as patterns, occurrence search) and evolution lines
    other than trimming;
  - principles other than 1, 2, 15, and 24 as transformations.

## [0.3.0] - 2026-08-18

### Added

- `triz_matrix_multi` — multi-parameter contradiction lookup: every (improving × worsening)
  cell, principles aggregated by recommendation frequency, fail-closed when all cells blank.
- Hosted streamable-HTTP MCP entry (`src/worker.ts`: stateless Cloudflare Worker over
  MCP SDK v2, bundled knowledge base, CORS + `/health`); transport-neutral tool specs shared
  by stdio and hosted entries.
- MPV satisfaction × awareness classification (MPV / latent MPV / PV / latent PV) with
  literature anchors (Litvin 2011/2013, Kano 1984, TRIZfest-2025).
- "When NOT to use TRIZ here" decline conditions in SKILL.md.
- Evals: matrix-multi deterministic cases and an aggregation property test; MPV-classification
  and decline-TRIZ reasoning cases (38 tests total).

### Documented (not adopted)

- Matrix 2003 / business matrix variants: licensing unclear and practitioners often prefer the
  classical matrix (TRIZfest-2025); importer remains the future path.

## [0.2.0] - 2026-08-18

### Changed

- MCP Registry submission moved to the official `mcp-publisher` CLI flow: `server.json`
  (current reverse-DNS schema, `io.github.sv/triz`) replaces `registry/triz.json`;
  `package.json` carries the `mcpName` ownership marker the registry verifies in the
  published package; PUBLISHING.md and README updated to match.

### Added

- Publish-ready npm package: `build` script (`tsconfig.build.json` → `dist` with a fixed
  `#!/usr/bin/env node` shebang), `bin` now targets `dist/server.js`, `files` whitelist,
  repository/keywords/engines metadata; version bumped to 0.2.0 and the server now reports the
  package version (`src/version.ts`) with a drift regression test.
- `scripts/smoke-mcp.mjs`: real MCP client handshake against the built server; runs in CI and
  gates `prepublishOnly` and the Release workflow (`npm publish --provenance` on `v*` tags,
  version-tag match check, GitHub release).
- `smithery.yaml` build manifest; `registry/triz.json` MCP Registry entry (version-synced).
- SKILL.md frontmatter now carries `license` and `metadata` for skill registries, and a
  Deterministic lookup section references the `triz` MCP server.
- `docs/PUBLISHING.md` (npm → MCP Registry → directories → skill registries runbook).
- `scripts/run-evals.mjs`: key-gated LLM eval runner for the `no-recall`, `reasoning`, and
  `published` suites, with an offline `--dry-run` mode. Refuses to run without
  `TRIZ_EVAL_API_KEY`/`OPENAI_API_KEY`; endpoint and model via `TRIZ_EVAL_BASE_URL` /
  `TRIZ_EVAL_MODEL`. Writes JSON + markdown reports to gitignored `evals/results/`. CI runs it
  in `--dry-run` mode only (`pnpm evals` / `pnpm evals:dry`).

- Modern-practice gap closures: effects starter database (56 curated textbook entries) with a
  `triz_effects` MCP tool and lookup evals; Main parameters of value (MPV) analysis workflow
  section and routed tool; ARIZ-85C entry criteria and part-ladder reference; S-curve stages and
  evolution-lines reference; anticipatory failure determination (AFD) workflow section and routed
  tool; patent design-around reference and routed tool; software domain guide and a software
  reasoning eval. Tool catalog grows from 34 to 37 routed tools.

### Fixed

- `pnpm install` under pnpm ≥ 10.14 default build-script policy: `pnpm-workspace.yaml` now
  allows esbuild's install script (the `package.json` `pnpm` field is ignored by pnpm 11, which
  broke local `pnpm test` and CI).

## [0.1.0] - 2026-08-14

### Added

- `triz-innovation` skill: `SKILL.md`, workflow / tool-selection / domain-guides / weakness /
  sources references, and the canonical knowledge base (39 parameters, 40 principles, imported
  contradiction matrix, 34-tool router).
- `triz` MCP server with `triz_parameter`, `triz_principle`, `triz_matrix`, `triz_resolve`,
  `triz_tool_catalog`, `triz_route`, and `triz_evals`. Blank and diagonal matrix cells fail closed.
- Optional `triz_graph` / `triz_purpose` tools over a project-supplied OTSM Network of Problems with
  a DIKWP purpose layer, plus `scripts/graph-report.mjs` and synthetic `examples/`.
- Contradiction-matrix importer (`scripts/import-matrix.mjs`) for regenerating `matrix.json` from a
  licensed CSV or JSON source.
- Evaluation suites: deterministic lookup regressions, synthetic reasoning cases, and six blinded
  cases reconstructed from CC BY MATRIZ publications.

### Changed

- Extracted from `flop-labs/flop-core`. Data-directory resolution, the graph loader, and the
  registry loader now use neutral paths and the `TRIZ_DATA_DIR`, `TRIZ_GRAPH`, and `TRIZ_REGISTRY`
  environment variables; the legacy `FLOP_*` overrides are gone.

### Removed

- FLOP-specific agent-demand benchmark, contradiction registry, problem graph, and the registry
  reconciler CLI, none of which are part of the domain-neutral core.

[Unreleased]: https://github.com/sv/triz-skill/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/sv/triz-skill/releases/tag/v0.3.0
[0.2.0]: https://github.com/sv/triz-skill/releases/tag/v0.2.0
[0.1.0]: https://github.com/sv/triz-skill/releases/tag/v0.1.0
