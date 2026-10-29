# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-10-29

### Added

- `triz_function_model`: type-check a function model written as typed data; report harm loops, ideality per cost dimension, separation, and a baseline comparison that includes an isomorphism check and an optional `box_map`.
- `triz_trim`: screen a trim by the MATRIZ trimming rules A/B/C.
- `triz_separate`: decide whether a physical contradiction separates over space, time, condition, direction, or system level; `along` indexes the parameter by one axis.
- `triz_transform`: typed model moves (segment, take out, interpose, apply a trim, rewrite); every result type-checks or fails closed.
- `triz_transform` constructions for Principles 5, 11, 13, 16, 22, 23, 26, and 27 (`merge`, `standby`, `reverse`, `rerate`, `retarget`, `feedback`, `cheap_copy`), with all 40 principles classified in `categorical-model.md`.
- `triz_nine_windows`: subsystem, system, and supersystem views for each time snapshot.
- `triz_rule_apply`: double-pushout rewriting with rules as data (match search, gluing conditions, Lean `typed_dpo`); built-in mono → bi and feedback evolution-line rules; a rule that would break a kept box's declared `behavior`, `transition`, or `feasibility` rows is refused.
- `triz_nine_windows` `transitions`: `triz_transform` sequences linking the times, checked against the snapshots and restricted to the subsystem (`restrict_rewrite`).
- `triz_export`: export a model as Graphviz DOT or an open hypergraph.
- `triz_behavior`: compose declared box behaviour (carrier `values`, box `behavior`) into the input→deliverable relation, with feedback by the relational trace (steady states); with `trim`, decide whether the trim preserves it: `preserved`, `changed` with a counterexample, or `undecided`.
- `triz_behavior` `compare_to`/`box_map` decides transform results against a baseline; mediators declare `behavior`; segment splits behaviour over independent parts or names a coupling witness.
- `triz_behavior` `weakest_spec`: the weakest specification (residual in Rel) for the one box without behaviour, against `compare_to` or the untrimmed model: `spec`, `impossible`, or `undecided`; `triz_weakness` ranks modelled concepts by the situations they admit, by inclusion.
- `triz_dynamics`: boxes may declare `state`, `initial`, and `transition` rows (nondeterministic Mealy machines); bounded runs decide escalation into an unsafe set (shortest trace), invariance, and separation in time along one run, and classify loops as bistable, trapped (a closed component inside the unsafe set), recurrent (one that meets it and holds a safe configuration), or oscillating.
- `triz_feasibility`: monotone co-design (Censi 2015) from box `feasibility` rows, by Kleene's ascent to the least fixpoint; with `trim`, decide whether the remaining boxes provide what the trim leaves them within budget (`feasible`, `infeasible` with the binding dimension, or `undecided`) and report the absorber's added resources.
- Linked models: `triz_abstraction` checks a coarse model against a detailed one under a typed map; carrier `levels` read feasibility amounts as behaviour values and give `triz_weakness` thresholds; `mpv_weights` on `triz_function_model`; `triz_nine_windows` reports verdict changes between times (Lean `typed_map`, `cycle_map`, `level_gc`).
- Flow paths (`flows`) and `triz_flow` (bottleneck, accumulation, and leak candidates, loops), with `merge` accepting boxes in series on a flow and flows carried through every construction, `triz_abstraction`, and the 9-windows deltas (Lean `flow_merge_typed`, `flow_merge_reach`); evolution rule `working-field` and the `uneven-development` detector in `triz_rule_apply`; four release effects (60 entries).
- Verdicts cite the theorem they rely on (`basis`) in `theory/`, a Lean 4 package with no `sorry`.
- Per-instance Lean certificates: `triz_export` format `lean` and `triz_separate` `certificate: true` state typing, harm-loop witness, and separation verdicts as theorems about the model; `scripts/certify.mjs` checks them with local Lean or the AXLE service.
- `theory/Witnesses.lean`: each typing, behaviour-monotonicity, and dynamics lemma's hypotheses hold on a concrete diagram, relation, or step relation, and dropping any one breaks it.
- `theory/Semantics.lean`: the steady-state semantics of declared behaviour, proved compositional (series is `Relation.Comp`, parallel the product, feedback `relTrace`, monotone in each box) with a faithful functor to `RelCat`; `tests/act-semantics.test.ts` checks `externalBehavior` against a brute-force transcription of it.
- Router entries name the MCP tools that carry out their method (`mcp_tools`).
- Network-of-problems nodes can carry a physical contradiction; core-conflict ties favour irreducible ones.
- Function-model JSON Schema and six example models: bearing, bearing with declared behaviour, bearing with declared dynamics, cached API, marketplace, connection pool.
- `categorical-model.md`: modelling protocol, and what is and is not claimed.
- CI and Lean workflows can be started by hand (`workflow_dispatch`).
- Agent feedback: every `ok: false` result adds `issues` (`code`, `path`, `message`, `hint`) beside `errors`, zod errors carry hints, `triz_function_model`/`triz_trim`/`triz_behavior` report lint `warnings`, `triz_trim` lists `levelProblems`, and `triz_nine_windows` returns `derived` models.
- Sharper verdicts: `triz_behavior` `weakest_spec` keeps only a box's `producible` rows and names the rows the target needs but the box cannot produce (`infeasible`); `triz_separate` suggests constructions per separating axis; `triz_dynamics` and `triz_weakness` return Lean certificates of a reachable escalation and of strict inclusions.

### Changed

- `workflow.md` lists all five MATRIZ separation types.
- Releases publish to npm and the MCP Registry through OIDC, with no stored tokens; pnpm is pinned via `packageManager`.
- Dependencies: zod 4.6.6, @modelcontextprotocol/sdk 1.32.0, @modelcontextprotocol/server 2.3.0.

## [0.3.0] - 2026-08-18

### Added

- `triz_matrix_multi`: contradiction lookup over several parameters, with principles ranked by how many cells recommend them.
- Hosted MCP endpoint (Cloudflare Worker, streamable HTTP) with the same tools as the stdio server.
- MPV classification by satisfaction and awareness.
- "When not to use TRIZ" decline conditions in `SKILL.md`.
- Evals for multi-parameter lookup, MPV classification, and declining TRIZ.
- `sources.md` explains why Matrix 2003 and the business matrices are not shipped.

## [0.2.0] - 2026-08-18

### Added

- Publish-ready npm package `triz-mcp`; the server reports its package version.
- MCP handshake smoke test, run in CI and before every release.
- Release workflow: npm publish with provenance and a GitHub release on `v*` tags.
- Smithery manifest, and registry metadata in `SKILL.md` frontmatter.
- `docs/PUBLISHING.md` release runbook.
- Key-gated LLM eval runner (`pnpm evals`) with an offline dry-run mode.
- `triz_effects` and a 56-entry effects database.
- MPV, ARIZ-85C, evolution-trend, AFD, design-around, and software references; the router grows from 34 to 37 tools.

### Changed

- MCP Registry submission uses the official `mcp-publisher` flow and `server.json`.

### Fixed

- `pnpm install` under the pnpm ≥ 10.14 build-script policy.

## [0.1.0] - 2026-08-14

### Added

- `triz-innovation` skill with its knowledge base: 39 parameters, 40 principles, the contradiction matrix, and a 34-tool router.
- `triz` MCP server for parameters, principles, the matrix, tool routing, and evals; blank and diagonal matrix cells fail closed.
- Optional `triz_graph` / `triz_purpose` over a project's network of problems.
- Contradiction-matrix importer and evaluation suites.

### Changed

- Extracted from `flop-labs/flop-core`, with neutral data paths and `TRIZ_*` environment variables.

### Removed

- FLOP-specific benchmark, registry, problem graph, and reconciler CLI.

[unreleased]: https://github.com/sv/triz-skill/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/sv/triz-skill/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sv/triz-skill/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sv/triz-skill/releases/tag/v0.2.0
