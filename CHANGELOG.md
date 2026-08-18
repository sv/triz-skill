# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `triz_matrix_multi`: multi-parameter contradiction lookup — every (improving × worsening)
  cell with principles aggregated by recommendation frequency (ties broken by mean position,
  per-cell detail always returned, fail-closed when all cells blank). Follows TRIZ-software
  occurrence-counting practice; deliberately no positional scoring (sources.md documents why).
- MPV analysis upgraded with the satisfaction × awareness classification (MPV / latent MPV /
  PV / latent PV), evidence-honesty requirements, and literature anchors (Litvin 2011/2013,
  Kano 1984, TRIZfest-2025 top-5 business tool and weighted-ideality formalization).
- SKILL.md "When NOT to use TRIZ here" section: decline conditions (no opposing states,
  cheaper measurement, standard pattern, plain selection, people-conflicts).
- Evals: two deterministic `triz_matrix_multi` lookup evals plus a cross-check property test
  (multi aggregation == manual fold of single lookups); reasoning evals for MPV classification
  and for correctly declining TRIZ on a non-contradiction.

### Documented (not adopted)

- Matrix 2003 / Business Matrix 3.0 / Souchkov business matrix: provenance, licensing, and
  the TRIZfest-2025 finding that practitioners often prefer the classical matrix — recorded in
  sources.md with the importer named as the sanctioned future path.

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

[Unreleased]: https://github.com/sv/triz-skill/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sv/triz-skill/releases/tag/v0.2.0
[0.1.0]: https://github.com/sv/triz-skill/releases/tag/v0.1.0
