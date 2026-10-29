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
| `triz_function_model(model, compare_to?, box_map?)` | Type-check a function model; harm loops, ideality profile, separation, baseline comparison, and whether the two models share a wiring shape |
| `triz_trim(model, trim[])` | Screen a trimming by rules A/B/C; orphaned functions block it |
| `triz_separate(contradiction, along?, certificate?)` | Decide whether a physical contradiction separates over space, time, condition, direction, or level; with `along`, index the parameter by one axis; with `certificate`, also return a Lean certificate |
| `triz_transform(model, transformation)` | Apply one typed move: a principle construction (segment, take_out, merge, standby, reverse, rerate, retarget, feedback, interpose, cheap_copy), an applied trim, or a raw rewrite; the result type-checks or fails closed. categorical-model.md lists which principle each one checks, and which principles have none |
| `triz_nine_windows(present, past?, future?, subsystem[], transitions?)` | Subsystem, system, and supersystem views per time, with harm loops per window; transitions as `triz_transform` sequences, checked against the snapshots and restricted to the subsystem |
| `triz_export(model, format)` | Graphviz DOT, an open hypergraph, or a Lean certificate (`lean`) of a model that type-checks |
| `triz_behavior(model, trim?, absorb?, max_states?)` | Input→deliverable relation from declared box behaviour (steady states, relational trace); with `trim`, decide preserved, changed (counterexample), or undecided |

The matrix is a heuristic index. A blank or diagonal cell stays blank; never invent a
recommendation.

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
