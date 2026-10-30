# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `triz_rule_apply` rules take `forbid`: negative application conditions (Habel–Pennemann). Each pattern extends `left` by id and may add elements; a match that extends to an occurrence of one is not applicable (listed as a violation, and refused on application), and a condition its own step budget cannot decide also refuses it.
- `triz_weakness` `priors`: a real prior over the operating situations (weakness.md) — per situation input, or per carrier, a nonnegative weight per declared value; each concept carries the total admitted mass (`weightedAdmitted`, ranked in `byWeight`). Inclusions, pairs, and `weakest` never move under weights; the uniform count stays the default.
- Label-blindness property tests for the verdicts that read declared rows and for the principle constructions: `triz_feasibility` over generated antichain rows (relabelled and permuted, ids mapped back) and every construction giving isomorphic results on a model and its relabelling, closing the two gaps "What is not claimed" recorded for feasibility verdicts and principle constructions.
- Whole-model behavior scope, operational adequacy, explicit joint-prior operating coverage
  (`triz_weakness` `joint_prior`, for correlated conditions, exclusive with `priors`), and
  annotation-preserving semantic isomorphism search.
- Input-bound Lean certificate manifests and request/table correspondence checking; supported
  behavior equality/inequality, all weakness pair outcomes, and state-only inductive safety.
- Joint implementation/resource/harm contracts, complete bounded absorber assignments and
  fixed-wiring multi-hole library synthesis.
- Exact behavioral refinement and subsystem summaries, overlapping-constraint global joins,
  discrete queue and conserved-quantity adapters, restricted rule termination and rewrite replay.
- Extended annotation-renaming/permutation tests and a separate cited future-work plan.
- README: a tool map by workflow stage, and why the hosted Worker is unauthenticated with open CORS (and what an operator can change).
- `theory/CategoricalTriz.lean` states the two-box weakest specification within producible rows: a pair of producible relations keeps the composite inside the target iff its product lies inside the safe row pairs intersected with the producible ones (`safe_feasible_iff`), and the formal concepts of the safe pairs of producible rows, which `triz_behavior` `weakest_spec` enumerates, are the maximal such pairs and decide the target (`safe_feasible_iff_le_concept`, `concept_feasible_maximal`, `exists_eq₂_feasible_iff`, cited for the producible two-box verdicts).
- `theory/Semantics.lean`: the part of an open diagram on some of its boxes and ports (`sub`). The whole relates no more on the part's interface (`external_sub_of_external`), and exactly that when every steady state of the part extends (`external_sub_iff_of_extends`): for the whole diagram (`external_sub_univ`), and when the rest accepts whatever the part does (`extends_of_accepts`). This relates `triz_behavior`'s upstream scope to `scope: "whole"`.
- Lint `unbacked-producible-row`: a producible row whose output level no feasibility row of its box reaches, read through the carriers' `levels`; reported by `triz_function_model`, `triz_trim`, and `triz_behavior`, and never a verdict.
- `docs/FUTURE-PLANS.md`: open items from a scan for natural constraints on the kernel's objects (C1–C8; C1, C2 and C5 next) and from applied category theory (Q1–Q6), each with what it closes or adds, effort, risks and evidence. `theory/REFERENCES.md` adds their sources as R91–R96. It also ranks the next priorities by leverage, with a build order (Q1 stage 1, B1, Q5, item 7, item 5), and adds "Building models" (B1 a model builder from an interaction table, B2 pluggable importers) and "Scaling to large models" (S1–S5).
- Row-table certificates (behaviour, weakness, state-only invariants, saturated port targets) decide over the classes of ports the functions join (C1). Each carries the class map and a spanning forest (`portClass`, `classRoot`, `portLink`, `portRank`, `classes`) that `WireClasses.Ok` checks, so a class map that joins two unwired ports fails the proof. New Lean: `WireClasses`, `WireClasses.eq_root`, `Rows.exists_steady_iff_classes`, `Rows.relation_eq_classes`, `Sync.unreachable_of_holding_classes`, `Sync.closed_of_classes`, `admitted_ssubset`. The certified and pinned statements are unchanged; `scripts/certify.mjs` accepts the new data lines and adds a "port classes merged" tamper.
- `Carrier.quantity`: `"intensive"` (the default, today's behaviour: one shared level, so an output meets the largest demand) or `"extensive"` (an amount that divides) (C2). In `triz_feasibility` an extensive output feeding several functions must supply the sum of their demands: a pump providing 5 cannot feed two beds needing 4 each (`infeasible`, `unprovidable`, 8 demanded). An extensive input fed by several functions fails closed with `extensive-fan-in`, whose hint asks for a merge box. New lint `extensive-fan-out`: an extensive output feeding several functions, which behaviour and dynamics still read as one shared value. `triz_isomorphism` keeps the kind. Lean: `selection_mono` (the step's selection shape meets `kleeneStep_upperClosure`'s hypothesis whether demands sum or take the max) and `extensive_demand_mono`, with witnesses; no `basis` changes. The JSON Schema gains the optional `quantity` property.
- `triz_dynamics` horizon-free verdicts (C5). Without `inputs`, `escalation` and `invariance` also carry `unbounded`: the same breadth-first search continued past the horizon, within the same `max_states`, until the configurations stop growing. It is `reachable` or `violated` (with the time and, past the horizon, a shortest trace), `unreachable` or `invariant` (with `completeAfter`), or `undecided` (`cap-exceeded` past the horizon, or `blocked`). The bounded verdict and every other field are unchanged, and a verdict decided today never becomes `cap-exceeded`. A clock first unsafe at step 25 is `unreachable-within-horizon` at the default horizon of 20 and `unbounded: reachable` at time 25. Under an input sequence there is no `unbounded`.

- `pnpm lean:setup` (`scripts/lean-setup.mjs`) sets up `theory/.lake/packages` in a new checkout. It clones them copy-on-write (`cp -cpR` on macOS APFS, `cp -pR --reflink=auto` on Linux) from another worktree or the main checkout whose `theory/lake-manifest.json` and `theory/lean-toolchain` are byte-identical. Without one, or when an imported Mathlib module still has no olean, it runs `lake exe cache get` with the theory's Mathlib imports, its only network access. `--print-imports` prints that list, which the Lean workflow reads.
- `TRIZ_LEAN_JOBS=N` runs N Lean tests at once (default 1). The theory is built once before them, so the tests only run `lake env lean`, and no two `lake build`s contend for Lake's lock.

### Changed

- A dynamics certificate whose bounded escalation is open (`unreachable-within-horizon`, `undecided`) states the decided `unbounded` verdict instead: a trace past the horizon (`reach_of_trace`), or for a port target that saturates past it, the reached global states as the invariant (`unreachable_of_holding_classes`). Before, both were refused ("only the bounded horizon verdict holds", or "requires state-only targets"); that refusal now needs the cap hit past the horizon.

- The certificate work cap counts classes, not ports: the exponent of the value count is the number of port classes. `bearing-heat-behavior`'s trim certificate reads 4,550 table entries instead of 69,376, and a chain of eight binary mediators (368,050,176 reads over its ports, past the cap) now certifies. A generated certificate reports its estimate as `tableReads`. The state-only invariant's initial, unsafe, and safe checks quantify over the global states only.

- The Release workflow's MCP Registry job waits up to 15 minutes for the version to appear on npm before publishing.
- `scripts/certify.mjs` sends a certificate to the AXLE service only with `--remote`. Without it and without a built `theory/`, it stops and names both options instead of falling back to AXLE; the notice for `--remote` says what leaves the machine. Generated certificates and the `triz_export` note say the same.
- `categorical-model.md` states that a box declaring `feasibility` joins the `triz_feasibility` solve wherever it sits, and what follows from that.
- The Lean workflow also runs the Lean tests after the build, with `TRIZ_REQUIRE_LEAN=1` and three at a time (`TRIZ_LEAN_JOBS=3`): only the test files that declare a `leanTest`, since the CI workflow runs every other test. It runs on changes to the kernel, tests, examples, and data those tests use. It caches `theory/.lake/packages` with `~/.cache/mathlib` (keyed on the toolchain, the Lake manifest, and the theory's Mathlib imports), and `theory/.lake/build` (keyed also on the theory's sources; a miss restores the closest build, so Lake rebuilds only what changed). With the packages restored, `lake exe cache get` clones, downloads, and decompresses nothing. It stays one job, `Build theory (no sorry)`.
- `scripts/certify.mjs`: `runLocal` and `runLocalBatch` return promises, so Lean runs no longer block the event loop and several can run at once. A process builds the theory at most once, and concurrent callers share that build (`ensureBuilt`, exported).
- A port-target unreachable certificate (`triz_dynamics` `certificate: true`) also states the kernel's blocked check: no run blocks in a state that meets the unsafe set's state conditions (`Sync.unreachable_of_holding`). A tamper variant that only this conjunct catches, and a fixture whose runs block (`BearingBlocked`), exercise it.
- `categorical-model.md` is now the agent's operating reference only: what each verdict means, how to read and act on it, and its limits. It gains a map of which model fields unlock which verdicts, with the chaining rules (`box_map`, `levels`, an impossible `weakest_spec`, `scope`, `priors` versus `joint_prior`, the finite assurance tools), and a short list of each verdict's limits. The theorem inventory, which verdict cites which Lean statement, the compositional semantics and certificate internals, the classification of all 40 principles, and the complete "What is not claimed" moved to `docs/theory-map.md`; the full issue and lint code table moved to `references/error-codes.md`.

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
