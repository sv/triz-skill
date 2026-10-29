# Categorical function models

Write the function model as typed data and let the `triz` MCP server check it, instead of
drawing an informal diagram and reasoning over it by eye. The model is an open wiring diagram:
boxes (components) with typed input and output ports, joined by wires (TRIZ functions) that
carry one flow type and a rating. The checks are finite and deterministic, and they fail closed.

Schema: [function-model.schema.json](../schemas/function-model.schema.json). The repository's
`examples/function-models/` holds worked models of a bearing, a cached API read path, a
marketplace, and a connection pool. The connection pool has the bearing's wiring shape.

## What each piece means

| TRIZ artifact | In the model | Check | Lean statement (`theory/`) |
|---|---|---|---|
| Component, supersystem element | box with `role` and typed ports | — | — |
| Flow (substance, energy, data, money) | carrier with `layer` and `dimension` | — | — |
| Function, rated useful (normal / insufficient / excessive) or harmful | wire from an output port to an input port, one carrier, one `polarity` | `triz_function_model`: endpoints exist, out→in, carriers agree | — |
| Back-reaction, vicious circle | a cycle through a harmful or excessive function | strongly connected regions with one witness cycle per such function | `edge_on_cycle` |
| Trimming rules A/B/C | the system recovered from what remains (left Kan extension of the restriction) | `triz_trim`: carrier screen only | `Recoverable` stated over abstract functors, `recoverable_id`; not linked to the kernel, not decided |
| Ideality comparison | componentwise order on cost vectors | profile per dimension; baseline vs concept with `compare_to` | `trim_lowers_cost`, `pareto_incomparable`, `pareto_not_total` |
| Physical contradiction, separation | gluing a parameter assignment over a finite base | `triz_separate`, or embedded `contradictions` | `exists_section_iff`, `glue_of_disjoint_regions`, `no_section_of_overlap`, `separated_iff_axis`, `separation_on_condition` |
| Same model in another domain | structural isomorphism: a bijection preserving roles, port sides, shared carriers, wiring, ratings, and costs | `triz_function_model` with `compare_to` (`comparison.isomorphism`); every verdict is label-blind (property tests) | `typed_rename`, `transGen_equiv` |
| Drawing the model | Graphviz DOT, or an open hypergraph: ports as carrier-typed vertices, boxes and functions as hyperedges, unwired ports as the interface | `triz_export`, golden outputs, lossless round trip | — |
| Model transformation | a rewrite at an occurrence named by id: delete, check no-dangling, glue, type-check | `triz_transform` | `typed_delete`, `typed_glue`, `typed_reroute` |
| System operator (9 windows), level axis | restriction to a subsystem, a presheaf on the poset of box sets; collapse of the system into one box | `triz_nine_windows` | `typed_restrict`, `restrict_restrict`, `restrict_of_subset`; `supportedOn`, `typedOn` |
| System operator, time axis | a transformation sequence from one time to the next, as one net rewrite step, and its part inside the subsystem | `triz_nine_windows` with `transitions`: each step type-checks and the sequence reaches the later snapshot | `restrict_rewrite`, `restrict_rewrite_of_inside`, `boundary_rewrite`; `restrictionGrid` |

Ratings follow the MATRIZ function definition. A function is useful or harmful. Only useful
functions have a performance level: normal, insufficient, or excessive. A back-reaction is
modelled as an ordinary wire in the reverse direction, so no separate "lens" flag is needed.

## Protocol

1. **Model.** List the boxes, the carriers with their units, and every function with its rating.
   Call `triz_function_model`. On `ok: false`, fix every listed error before going on; never
   reason over a model that does not type-check.
2. **Harm loops.** For each reported loop, name the causal mechanism and the evidence for every
   function in the witness cycle. A loop is a candidate to examine, not a finding. Useful-only
   feedback, such as a control loop, is not reported.
3. **Trim.** Call `triz_trim` with the boxes to remove. The output holds three things:
   - each orphaned function, which blocks the trim;
   - each absorber, ordered rule B (the object serves itself) and then rule C (another
     component, with supersystem resources last);
   - one trimming problem per absorber.

   Treat every trimming problem as a new problem to solve. Still generate at least three
   mechanisms (SKILL.md). Model the chosen concept and compare it with `compare_to`. A concept
   that drops a deliverable loses a function, whatever it saves.
4. **Separate.** For a physical contradiction, give each demand its admissible values and the
   cells where it applies on each axis. Use `space`, `time`, `condition`, `direction`, and
   `level`, which are MATRIZ's five separation types; `condition` is MATRIZ's "relation
   (conditions)". The status drives the route:
   - `compatible`: a value meets both demands, so this is not a physical contradiction. Choose
     that value.
   - `separated`: the listed axes separate the demands. Assign the parameter piecewise.
   - `irreducible`: the demands overlap on every axis. Refine an axis, try another system level,
     or escalate to ARIZ.

5. **Transform.** Use `triz_transform` to apply one structural move and get the new model back.
   Every result type-checks, or the call fails closed:
   - `segment`, `take_out`, and `interpose`, the principle constructions below;
   - `trim`, which performs a trim `triz_trim` screened as typed-feasible: the trimmed boxes go,
     and each function they performed on a remaining box is re-attached to a chosen absorber;
   - `rewrite`, which deletes and adds boxes and wires directly.

   A transformation is a move to evaluate, not a result. Compare the new model with
   `triz_function_model` and `compare_to`. Segmenting a product box, or taking a part out of one,
   moves its deliverables to new box ids, and the result reports `deliverableKeysChanged`. Pass
   the returned `boxMap` as `box_map` so the comparison renames the parts back before matching
   deliverables. Without it, the moved deliverables read as lost and regained.
6. **Windows.** Use `triz_nine_windows` with the present model, any past or future snapshots
   that keep box ids stable, and the boxes to zoom into. Each window reports its harm loops. The
   supersystem view lists the harmful and excessive functions the collapse hides. A missing
   window is returned as a prompt to fill.

   To say how one time becomes the next, give `transitions`: `past_to_present`, or
   `present_to_future`, as a list of `triz_transform` operations. The kernel applies them in
   order. If the later snapshot is given, the result must equal it; otherwise the result
   becomes the future. A step that fails, or a result that misses the snapshot, fails closed.
   Each transition reports:
   - `step`: the net rewrite, as deleted and added box and wire ids;
   - `subsystem.step`: its part inside the subsystem, which takes the earlier subsystem view to
     the later one;
   - `subsystem.withinSubsystem`: the transition is its own part, so it touches nothing outside;
   - `subsystem.interiorUnchanged`: the part is empty;
   - `subsystem.boundary`: the crossing functions the transition cuts and adds.
7. **Share.** Use `triz_export` for a DOT drawing or the hypergraph form. With `compare_to`,
   `triz_function_model` also reports whether the two models have the same wiring shape.

Each verdict cites in `basis` the theorem in `theory/CategoricalTriz.lean` its reasoning uses,
as in the last column above. A test checks that every cited name is a theorem in that file.
That theorem proves the abstract fact. Tests check the TypeScript against it; nothing is
extracted from Lean. A basis never means the TRIZ reading of a verdict is proved. A verdict that
needs no theorem, such as a compatible pair, cites none.

## Principle constructions

A construction is listed here only when the principle's text, looked up in
`data/principles.json` (`triz_principle`), describes a structural move the kernel can make and
check. Each row makes the structural part of the principle checkable. That does not show the
principle solves the problem. Every other principle stays an analogy.

| Principle | Text (`triz_principle`) | Construction | Checked |
|---|---|---|---|
| 1 Segmentation | "Divide an object into independent parts; make it sectional or modular." | `segment`: a box becomes parts whose ports partition its ports. Each wire follows its port, and each cost dimension goes wholly to one part. | The partition is exact and ids are fresh. The result reports whether the parts are independent, meaning no wire joins two parts. For a box with no self-loop, collapsing the parts gives back a model isomorphic to the original. A self-loop instead ends up between parts, or in the collapse's `hidden` list. |
| 2 Taking out | "Separate an interfering part or isolate the only needed part." | `take_out`: split the given ports off into a new box. | Reading `interfering`: the split-off ports touch a harmful or excessive function. Reading `needed`: they carry every useful function, so the remainder is a trimming candidate. |
| 15 Dynamics | "Allow characteristics to change so they are optimal at each stage." | `triz_separate` with `along: "time"`: the parameter as a function of time cells alone. | `dynamizable` only when every stage has an admissible value and no single value meets all stages. A constant that works is reported as `constant-suffices`, not as Principle 15. Values are admissible, not optimised. |
| 24 Intermediary | "Use an intermediary carrier or process, temporarily or permanently." | `interpose`: a function u → v becomes u → m → v through a new mediator box. | Both legs keep the carrier, and keep the rating unless it is overridden. Reachability among the original boxes is unchanged. With inherited ratings, harm-loop membership is unchanged too. "Temporarily" is not modelled. |

The original design suggested "factor a function through a new sub-box" for Principle 2. The
looked-up text of Principle 2 does not describe that move; the text of Principle 24 does, so
that move is `interpose`.

Trimming as a rewrite is the evolution-line move named in
[evolution-trends.md](evolution-trends.md): "the function remains, the component disappears".
`trim` builds that rewrite and checks it. It does not show that a trend applies to the system.

## Domain working translations

These are working translations, not isomorphisms. SKILL.md rule 4 and the "conflict between
people" decline condition still apply.

| Domain | Box | Carrier | Harmful or excessive function | Trimming example |
|---|---|---|---|---|
| Physical | part, fluid, housing | force, heat, mass, momentum | friction heat, wear, expansion preload | remove the bearing and let the housing support the shaft |
| Software | service, buffer, gateway | request, bytes, rows | stale cache reads, lock contention, retry storms | remove a cache tier and let the service or gateway cache |
| Business | business unit, partner, customer segment | cash flow, listings, orders | excessive fees, price pass-through | remove an intermediary and let a remaining party perform its function |

A business loop says only that a closed chain of disadvantages exists in the model. Whether
that chain is moral hazard, a margin squeeze, or nothing at all is an empirical question, for
example cohort churn against fee changes. Name it only from that evidence.

## What is not claimed

- Nothing computes a Kan extension, an optic or lens, or a Grothendieck fibration.
  - Trimming as a Kan extension: `Recoverable` states it over abstract functors, and its one
    theorem, `recoverable_id`, is the case where nothing is trimmed. No theorem links it to
    `Wiring`, `triz_trim`, or the applied trim, and nothing decides it.
  - The system operator is not claimed to be a fibration. What is proved is a functor from the
    time chain times the opposite poset of box sets to sets (`Wiring.restrictionGrid`). It
    covers the subsystem and system rows, not the supersystem collapse, and no Grothendieck
    construction is built.
- Sheaf cohomology is not computed, and none is needed on the base the separation check uses.
  That base is a finite set of cells with no further structure. On it, a global assignment
  exists exactly when every cell admits a value (`exists_section_iff`). So the only obstruction
  to gluing is a cell with no admissible value, and the cell scan finds every such cell. Nothing
  is claimed for a base whose regions carry more structure.
- Rewrites are not a double-pushout rewriting system.
  - A rewrite is applied at an occurrence named by id, and the kernel checks the no-dangling
    condition.
  - Occurrences named by id are injective, so the no-identification condition holds trivially.
    Bonchi et al. (2022), Prop. 3.17, show the two conditions are exactly what the pushout
    complement needs.
  - Rules as reusable patterns, and searching for their occurrences, are not implemented.
- "Domain invariance" is claimed in one sense only: the structured verdicts are label-blind.
  They depend on the wiring shape, not on ids, names, verbs, domain, or carrier layer and
  dimension. This covers the verdicts of `checkModel`, `harmLoops`, `idealityProfile`,
  `trimCandidates`, `compareIdeality`, `separationCheck`, and `dynamize`.
  - Property tests check this over 200 seeded random models with every array permuted.
  - Excluded by design: free text, witness-cycle tie-breaks (which follow id order), absorber
    port tie-breaks (which follow port order), and the truncated conflict-cell list.
  - The bearing and connection-pool examples are isomorphic and get the same verdicts. That
    shows the kernel ignores domain meaning. It does not show that a TRIZ solution transfers
    between domains.
- The hypergraph export uses the hypergraph form of Bonchi et al. (2022, Def. 3.1): hyperedges
  with ordered sources and targets, plus an interface. The encoding is this kernel's own choice.
  Ports are the vertices, and one port may carry several functions: fan-out, or a useful and a
  harmful function on the same pair of ports.
- The 9 windows, as proved in `theory/`:
  - The level axis is a presheaf. `supportedOn` sends a set of boxes to the diagrams it
    supports, and an inclusion to restriction. Typed diagrams form a sub-presheaf, `typedOn`.
  - Restriction commutes with every rewrite step once the step is restricted too
    (`restrict_rewrite`, no hypothesis). A step that adds nothing outside the subsystem applies
    to it unchanged (`restrict_rewrite_of_inside`). The boundary changes by exactly the crossing
    wires the step cuts and adds (`boundary_rewrite`). `withinSubsystem` is stricter: the step
    deletes nothing outside the subsystem either.
  - With two steps, the subsystem and system rows form a functor from time × (box sets)ᵒᵖ to
    sets (`Wiring.restrictionGrid`). The supersystem row is a collapse, not a restriction, and is
    outside it. The functor's sets hold typed and untyped diagrams alike: a step keeps typing
    only under its no-dangling and gluing conditions, which the kernel checks on the model
    given.
- 9 windows, in the kernel:
  - A transition reaches a snapshot when boxes, wires, and carriers agree by id and content,
    ignoring array order. `domain`, `system`, `budget`, `weights`, and `contradictions` are not
    compared.
  - Lean wires have fixed endpoints, so a step never moves one. A function re-attached under the
    same id, as an applied trim does, counts as one function deleted and another glued.
    `reroute` alone does not commute with restriction when it moves an endpoint across the
    boundary; `theory/Witnesses.lean` has the counterexample.
  - Transitions are not inferred. Between snapshots given without one, only the box ids added
    and removed are listed. The supersystem collapse is not checked against transitions.
- A carrier match is necessary for an absorber, not sufficient. Each absorber's added cost and
  its new harms are not modelled.
- `harmLoops` is exhaustive for the model as written. It cannot find a back-reaction the model
  omits.
- A scalar ideality is produced only from explicit `weights` covering every cost dimension and
  `harmful`. Otherwise, costs are reported per dimension and never summed.
- Not adopted: 9 windows as a fibration, evolution trends other than trimming as rewrite rules,
  and principles other than 1, 2, 15, and 24 as transformations. The analogies are recorded in
  [sources.md](sources.md); none is implemented.
