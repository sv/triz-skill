# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- `docs/PUBLISHING.md` (npm → MCP Registry → directories → skill registries runbook) and
  `docs/modern-triz-survey.md` (coverage vs. modern practice; prioritized gaps).
- `scripts/run-evals.mjs`: key-gated LLM eval runner for the `no-recall`, `reasoning`, and
  `published` suites, with an offline `--dry-run` mode. Refuses to run without
  `TRIZ_EVAL_API_KEY`/`OPENAI_API_KEY`; endpoint and model via `TRIZ_EVAL_BASE_URL` /
  `TRIZ_EVAL_MODEL`. Writes JSON + markdown reports to gitignored `evals/results/`. CI runs it
  in `--dry-run` mode only (`pnpm evals` / `pnpm evals:dry`).

### Fixed

- `pnpm install` under pnpm ≥ 10.14 default build-script policy: `pnpm-workspace.yaml` now
  allows esbuild's install script (the `package.json` `pnpm` field is ignored by pnpm 11, which
  broke local `pnpm test` and CI).

### Added

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

[Unreleased]: https://github.com/sv/triz-skill/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sv/triz-skill/releases/tag/v0.1.0
