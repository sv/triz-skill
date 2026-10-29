# Tool selection

The stage router below incorporates the two user-supplied Russian reference slides. Their original
deck and author have not yet been identified, so treat the mapping as a practical routing aid rather
than an official MATRIZ standard. Current MATRIZ terminology and descriptions take precedence.

## Deterministic knowledge

Canonical JSON is in `../data/`. When the `triz` MCP server is available, use it instead of
recalling principle numbers or matrix cells.

| MCP tool | Use |
|---|---|
| `triz_parameter(id?)` | List or retrieve the 39 engineering parameters |
| `triz_principle(id?)` | List or retrieve the 40 inventive principles |
| `triz_matrix(improving, worsening)` | Retrieve a canonical contradiction-matrix cell |
| `triz_matrix_multi(improving[], worsening[])` | All cells for multi-parameter conflicts, frequency-aggregated |
| `triz_resolve(improving, worsening)` | Expand a matrix cell into principle records |
| `triz_tool_catalog(stage?)` | List the broader toolset, optionally by stage |
| `triz_effects(query?, category?)` | Search the curated effects database by required function |
| `triz_route(stage, signals?)` | Route a problem to candidate tools |
| `triz_evals()` | Return public lookup and synthetic reasoning regressions |
| `triz_function_model(model, compare_to?, box_map?, mpv_weights?)` | Type-check a function model; harm loops, ideality profile, separation, baseline comparison, and whether the two models share a wiring shape; with `mpv_weights`, the comparison over the main parameters of value only, by explicit weights |
| `triz_trim(model, trim[])` | Screen a trimming by rules A/B/C; orphaned functions block it; excessive and insufficient functions come back as level problems |
| `triz_separate(contradiction, along?, certificate?)` | Decide whether a physical contradiction separates over space, time, condition, direction, or level; with `along`, index the parameter by one axis; each separated pair gets `suggestions` (hints: the operations that could build it on each separating axis); with `certificate`, also return a Lean certificate |
| `triz_transform(model, transformation)` | Apply one typed move: a principle construction (segment, take_out, merge, standby, reverse, rerate, retarget, feedback, interpose, cheap_copy), an applied trim, or a raw rewrite; the result type-checks or fails closed. categorical-model.md lists which principle each one checks, and which principles have none |
| `triz_rule_apply(model, rule_id \| rule, at?, match?)` | List the matches of a rewrite rule, or apply one by double pushout; built-in rules for evolution lines (mono → bi, self-adjusting feedback) |
| `triz_nine_windows(present, past?, future?, subsystem[], transitions?, acceptable?)` | Subsystem, system, and supersystem views per time, with harm loops per window; transitions as `triz_transform` sequences, checked against the snapshots and restricted to the subsystem; with declared rows, each time's behaviour and feasibility verdicts and how they (and, with `acceptable`, weakness) change between times |
| `triz_export(model, format)` | Graphviz DOT, an open hypergraph, or a Lean certificate (`lean`) of a model that type-checks |
| `triz_behavior(model, compare_to?, box_map?, trim?, absorb?, max_states?, weakest_spec?)` | Input→deliverable relation from declared box behaviour (steady states, relational trace); with `compare_to` (a segment's `boxMap` as `box_map`) or `trim`, decide preserved, changed (counterexample), or undecided; with `weakest_spec`, the weakest specification for the one box without behaviour against the same target: spec, impossible, or undecided; when that box declares `producible` rows, the spec is cut down to them, and `impossible` with reason `infeasible` names the rows the target needs that the box cannot produce |
| `triz_weakness(concepts[], acceptable[], max_states?, certificate?)` | Rank modelled concepts by the situations they admit (steady state, acceptable deliverables), by inclusion, with incomparable pairs; counts second (references/weakness.md). `acceptable` per port or carrier: values, or a threshold (`at_least`, `below`) read through the carrier's levels |
| `triz_dynamics(model, horizon?, initial?, inputs?, unsafe?, safe?, separation?, max_states?, certificate?)` | Bounded runs of boxes with declared state: escalation into an unsafe set (shortest trace), invariance of a safe set, separation in time along one run; loops classified as bistable, trapped (inside the unsafe set), recurrent (meets it, can recover), or oscillating |
| `triz_feasibility(model, trim?, absorb?, max_antichain?, max_iterations?)` | Minimal resource vectors from declared box feasibility (monotone co-design, least fixpoint); with `trim`, decide feasible, infeasible (binding dimension or unprovidable port), or undecided, and the absorber's added resources; with carrier `levels`, the feasibility rows that disagree with declared behaviour |
| `triz_abstraction(detailed, coarse, map)` | Check that a coarse model is an abstraction of a detailed one under a map of boxes, ports, and carriers: total, typed, every coarse function and harm loop the image of a detailed one; forgotten and hidden harms, and feasibility amounts read against coarse behaviour through levels |

The matrix is a heuristic index. A blank or diagonal cell stays blank; never invent a
recommendation.

When a model tool returns `ok: false`, read `issues`, not just `errors`: each names a stable
`code`, the `path` of the argument at fault, and a `hint` with the fix. Correct the input at that
path and call again; do not reason over a result that failed. `triz_function_model`,
`triz_trim`, and `triz_behavior` also return `warnings` (lints that never change a verdict);
`triz_trim` poses excessive and insufficient functions as `levelProblems`; `triz_nine_windows`
returns the models its transitions produce under `derived`. categorical-model.md tabulates the
codes.

## Route by stage

| Stage | Start with | Add when signaled |
|---|---|---|
| Problem analysis | Key stakeholder requirements, functional analysis, cause-effect chain, flow analysis, resource analysis | Benchmarking, external-functioning analysis, component analysis, diagnostic analysis, operating zone/time, system operator, trends, limits, structure, function-cost analysis |
| Task modeling | Technical or physical contradiction, Ideal Final Result, operating zone/time, resources | ARIZ, Su-Field, feature transfer, trimming, size-time-cost, inversion, diagnostic analysis |
| Solution synthesis | Inventive principles, separation principles, inventive standards | ARIZ/ARIP, effects, functional-oriented search, reverse functional-oriented search, feature transfer, creative-imagination tools |
| Concept justification | Experiment, benchmark, prototype, simulation, or other domain evidence | Function-cost analysis, failure analysis, sensitivity analysis, pilot, staged rollout |

## Route by problem shape

| Signal | Candidate tools |
|---|---|
| Goal or stakeholder conflict is unclear | Key stakeholder requirements; external-functioning analysis; system operator |
| Undesirable effect has several plausible causes | Cause-effect chain; diagnostic analysis; operating zone/time |
| Bottleneck, delay, leakage, or accumulation | Flow analysis; resource analysis; function-cost analysis |
| Improving A worsens B | Technical contradiction; matrix; inventive principles |
| One property must have opposing values | Physical contradiction; separation principles |
| Interaction is absent, weak, excessive, or harmful | Functional analysis; Su-Field; inventive standards |
| A harm loop may escalate over time: runaway heat, a retry storm, a fee spiral | Functional analysis with declared state; harm loops (`triz_function_model`), then escalation, invariance, and the loop's class (`triz_dynamics`): bistable, trapped, recurrent, or oscillating |
| A property must take different values at different stages, and the system must get there by itself | Physical contradiction; separation in time; Principle 15, Dynamics (`triz_separate` along time, then `triz_dynamics` separation) |
| Component creates cost but little value | Function-cost analysis; trimming |
| Capability exists in another system or field | Benchmarking; feature transfer; functional-oriented search; effects |
| System is near a structural limit | Trends of evolution; limits analysis; system operator |
| Team is trapped by scale or timing assumptions | Size-time-cost; inversion; creative-imagination tools |
| Many linked contradictions compete for attention | Cause-effect network; rank by causal reach, severity, controllability, and strategic relevance |
| It is unclear what customers actually pay for | Main parameters of value analysis; key stakeholder requirements; trends of evolution |
| Failures must be predicted before launch | Anticipatory failure determination; inversion analysis; diagnostic analysis |
| A patent claim blocks a needed function | Patent circumvention moves; trimming; effects database (see references/patent-circumvention.md) |

## Catalog of the referenced tools

| # | Tool | Main stages | Purpose |
|---:|---|---|---|
| 1 | External-functioning analysis | Analysis | Define supersystem interactions and external functions |
| 2 | Key stakeholder requirements | Analysis | Make stakeholder outcomes and conflicts explicit |
| 3 | ARIZ | Modeling, synthesis | Algorithmically restructure and solve difficult inventive problems |
| 4 | ARIP | Modeling, synthesis | Structured algorithm for engineering problem solving |
| 5 | Benchmarking | Analysis | Compare alternative systems and locate transferable advantages |
| 6 | Effects database | Synthesis | Find scientific, geometric, biological, or other effects that deliver a function |
| 7 | Su-Field analysis | Modeling | Represent and repair incomplete or harmful interactions |
| 8 | Inversion analysis | Analysis, modeling | Reverse assumptions, actions, or system relations |
| 9 | Diagnostic analysis | Analysis, modeling | Localize the mechanism producing an undesirable effect |
| 10 | Trends of engineering-system evolution | Analysis | Identify development direction and structural opportunities |
| 11 | Ideal Final Result | Modeling | State the required function with minimal added cost and harm |
| 12 | Component analysis | Analysis | Identify system and supersystem components |
| 13 | Feature transfer | Modeling, synthesis | Transfer a useful property or function from another system |
| 14 | Operating zone and time | Analysis, modeling | Localize the conflict in space, time, or conditions |
| 15 | Reverse functional-oriented search | Synthesis | Search from available mechanisms or resources toward useful functions |
| 16 | Flow analysis | Analysis | Find blockage, leakage, accumulation, and waste in flows |
| 17 | Limits analysis | Analysis | Identify constraints and the system's development ceiling |
| 18 | 40 inventive principles | Synthesis | Prompt mechanisms for technical contradictions |
| 19 | Separation principles | Synthesis | Resolve physical contradictions in time, space, condition, or level |
| 20 | Cause-effect chain analysis | Analysis | Trace an undesirable effect to actionable causes |
| 21 | Resource analysis | Analysis, modeling | Identify available substance, field, space, time, information, and system resources |
| 22 | Size-time-cost operator | Modeling | Break fixation by changing imagined scale, duration, or cost |
| 23 | Creative-imagination tools | Modeling, synthesis | Expose assumptions and expand the concept space |
| 24 | Structural analysis | Analysis | Examine system relations and arrangement |
| 25 | System operator | Analysis, modeling | Explore subsystem/system/supersystem across past/present/future |
| 26 | Inventive standards | Synthesis | Apply standard transformations to Su-Field models |
| 27 | Technical contradiction | Analysis, modeling | Express improvement of one parameter that worsens another |
| 28 | Functional analysis for products | Analysis | Model useful, harmful, insufficient, and excessive functions |
| 29 | Functional analysis for processes | Analysis | Model functions and interactions across a process |
| 30 | Trimming for products | Modeling | Remove components while preserving their useful functions |
| 31 | Trimming for processes | Modeling | Remove steps or actors while preserving required outcomes |
| 32 | Functional-oriented search | Synthesis | Search other fields for mechanisms that perform the needed function |
| 33 | Physical contradiction | Analysis, modeling | Express opposing requirements on one property |
| 34 | Function-cost analysis | Analysis, modeling | Compare functional contribution with cost or harm |
| 35 | Main parameters of value analysis | Analysis | Identify and rank the parameters customers pay for; link value to trends and limiting parameters |
| 36 | Anticipatory failure determination | Analysis, synthesis | Invert the problem: invent credible failures of the concept before they occur |
| 37 | Patent circumvention (design-around) | Analysis, synthesis | Map claim elements and design around them functionally; methodology only, not legal advice |

The machine-readable version is `../data/tool-router.json`.
