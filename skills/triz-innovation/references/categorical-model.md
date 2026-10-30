# Categorical function models

Write the function model as typed data and let the `triz` MCP server check it, instead of
drawing an informal diagram and reasoning over it by eye. The model is an open wiring diagram:
boxes (components) with typed input and output ports, joined by wires (TRIZ functions) that
carry one flow type and a rating. The checks are finite and deterministic, and they fail closed.

Schema: [function-model.schema.json](../schemas/function-model.schema.json). The repository's
`examples/function-models/` holds worked models of a bearing, a cached API read path, a
marketplace, and a connection pool. The connection pool has the bearing's wiring shape.
`bearing-heat-behavior.json` is the bearing with declared behaviour,
`bearing-heat-dynamics.json` the bearing with a declared shaft temperature, and
`bearing-heat-feasibility.json` the bearing with declared feasibility.

This file is what a session needs. Every issue and lint code is in
[error-codes.md](error-codes.md). For auditing only, not for a session: the
[theory map](../../../docs/theory-map.md) holds every Lean statement behind the verdicts, cited or
not, how the semantics and the certificates work inside, and the complete list of what is not
claimed. The finite assurance extensions, their exact implemented scope, and examples of the
new APIs are summarized in [categorical-assurance.md](../../../docs/categorical-assurance.md).
Deferred work, acceptance criteria and adopted suggestions are recorded separately in
[categorical-future-plan.md](../../../docs/categorical-future-plan.md), and the ranked backlog in
[FUTURE-PLANS.md](../../../docs/FUTURE-PLANS.md). Literature is collected in
[theory/REFERENCES.md](../../../theory/REFERENCES.md).

## What each piece means

| TRIZ artifact | In the model | Tool | Cited in `basis` |
|---|---|---|---|
| Component, supersystem element | box with `role` and typed ports | — | — |
| Flow (substance, energy, data, money) | carrier with `layer` and `dimension` | — | — |
| Function, rated useful (normal / insufficient / excessive) or harmful | wire from an output port to an input port, one carrier, one `polarity` | `triz_function_model`: endpoints exist, out→in, carriers agree | — |
| Back-reaction, vicious circle | a cycle through a harmful or excessive function | strongly connected regions with one witness cycle per such function | `edge_on_cycle` |
| Components in series along a flow; flow analysis | `flows`: an ordered path of the boxes a carrier passes through, optionally with the `medium` box that stands for what flows | `triz_flow`: bottleneck, accumulation, and leak candidates, loops; `merge` treats boxes consecutive on a flow as adjacent | `edge_on_cycle` (loops), `flow_merge_typed`, `flow_merge_reach` |
| Trimming rules A/B/C | delete the trimmed boxes; re-attach each function they performed on a remaining box to a typed absorber | `triz_trim`: carrier screen; `triz_transform` `trim` applies it | `typed_reroute`; `trim_lowers_cost` (`costBound`) |
| Declared behaviour, steady state | carrier `values` and box `behavior` rows: each box a finite relation; the external relation from boundary inputs to deliverables, with feedback by the relational trace | `triz_behavior`; with `compare_to` (and `box_map`), decides whether a concept preserves that relation; `trim` is shorthand for the model's own trim | `Relation.comp_assoc` (Mathlib); definition `relTrace` |
| What an absorber or other unknown box must do | the weakest box specification (residual in Rel): every row of the one box without behaviour whose composite stays inside a target relation | `triz_behavior` with `weakest_spec` and `compare_to` or `trim`: spec, impossible, or undecided | `le_residual_iff`, `covers_iff_exists_eq`, `not_covers_iff`, `map_empty`; within producible rows, `covers_feasible_iff`, `not_covers_feasible_iff`, `required_row_of_eq` |
| What two unknown boxes must do | the maximal pairs of relations that stay inside the target (formal concepts of the safe row pairs), and whether one covers it | the same, with two boxes without behaviour | `safe_iff_le_concept`, `concept_maximal`, `exists_eq₂_iff`; within producible rows, `safe_feasible_iff`, `safe_feasible_iff_le_concept`, `concept_feasible_maximal`, `exists_eq₂_feasible_iff` |
| Weakness of a concept ([weakness.md](weakness.md)) | the situations it admits: boundary-input valuations with a steady state and only acceptable deliverable outputs, ordered by inclusion | `triz_weakness` | `incomparable_of_witnesses`, `card_lt_of_strictly_weaker`; definitions `admits`, `AtLeastAsWeak` |
| Dynamics: escalation, invariance, separation in time | box `state`, `initial`, and `transition` rows: a nondeterministic Mealy machine, which is a lens with a residual as its state; the synchronous composite's runs up to a horizon | `triz_dynamics`: escalation into an unsafe set (shortest trace), invariance of a safe set, separation in time along one run | `reach_of_trace`, `reachWithin_iff_trace`, `reachWithin_saturated`, `unreachable_of_invariant`; separation, `reachIn_of_trace`, `reachIn_iff_trace` |
| Loop behaviour: bistable, runaway, oscillating | closed strongly connected components of the reachable graph of declared states | `triz_dynamics` `loops`: bistable, trapped (inside the unsafe set) or recurrent (meets it, and holds a safe configuration), each with a shortest trace, oscillating (period and one cycle) | `fixed_on_cycle`, `closed_reachIn`, `trapped_reachIn`, `recurrent_reach`, `return_ge_two` |
| Absorber's added resources, co-design | box `feasibility` rows: each box a monotone feasibility relation; the composite by Kleene's ascent to the least fixpoint (Censi 2015) | `triz_feasibility`; with `trim`, decides whether the remaining boxes provide what the trim leaves them within budget | `kleene_lfp`, `kleeneStep_upperClosure`, `codesign_lfp` |
| Numeric amount read as a qualitative value | carrier `levels`: a threshold per value, from 0, increasing; an amount reads as the last value whose threshold it reaches | checkModel (fail closed); `triz_feasibility` `levels`: each feasibility row against the box's behaviour rows; `triz_abstraction` across the map; `triz_weakness` `acceptable` by `at_least` or `below` | `level_monotone`, `level_gc`, `level_band` |
| A detailed and a coarse model of one system | an abstraction map: detailed box → coarse box (many to one), port → port per box, carrier → carrier | `triz_abstraction`: total, typed, every coarse function an image of its class, every coarse harm loop the image of a detailed one | `typed_restrict` and `typed_map` (typed), `reach_map`, `cycle_map`, `reach_quotient` (flows); definition `Wiring.map` |
| Ideality comparison | componentwise order on cost vectors | profile per dimension; baseline vs concept with `compare_to`; over the main parameters of value only with `mpv_weights`; `triz_trim`'s `costRelief` (`costBound`) | `trim_lowers_cost`, `pareto_incomparable`, `pareto_not_total` |
| Physical contradiction, separation | gluing a parameter assignment over a finite base | `triz_separate`, or embedded `contradictions` | `exists_section_iff`, `separated_iff_axis`, `glue_of_disjoint_regions`, `no_section_of_overlap` |
| Same model in another domain | structural isomorphism: a bijection preserving roles, port sides, shared carriers, wiring, ratings, and costs | `triz_function_model` with `compare_to` (`comparison.isomorphism`); every wiring verdict is label-blind (property tests) | `typed_rename`, `transGen_equiv` |
| Drawing the model | Graphviz DOT (ports drawn), a Mermaid flowchart (ports named on edges), an SVG picture laid out by elkjs (ports drawn), or an open hypergraph: ports as carrier-typed vertices, boxes and functions as hyperedges, unwired ports as the interface | `triz_export`, golden outputs, lossless round trip | — |
| Certificate of one run | the model as finite Lean tables; each verdict a theorem about them | `triz_export` format `lean`, `triz_separate`, `triz_behavior`, `triz_dynamics`, and `triz_weakness` with `certificate`; checked by Lean (`scripts/certify.mjs`) | none: the certificate proves its own statements; definitions `Wiring.Typed`, `Wiring.Acts`, row tables `Sync.Step`, `Rows.relation` |
| Model transformation | a rewrite at an occurrence named by id: delete, check no-dangling, glue, type-check | `triz_transform` | `typed_delete`, `typed_glue`; each construction adds its own ([Principle constructions](#principle-constructions)) |
| Reusable move, evolution-line step | a rule L ← K → R applied by double pushout at a match found by search | `triz_rule_apply`: matches, no-identification and no-dangling conditions, fresh ids, typed result | `typed_dpo` |
| A subsystem that lags (uneven development) | a box of the largest harm-loop region that is on a binding feasibility dimension or limits a deliverable | `triz_rule_apply` `uneven-development`: lagging, none, or undecided | `edge_on_cycle`; the feasibility verdict's basis |
| Behaviour through a construction | segment: the box's relation splits over the parts iff it is the product of its projections, iff it is a rectangle (rows (a, b) and (c, d) give the row (a, d)); interpose: an identity mediator composes away | `triz_transform` segment and take_out (`behaviourallyIndependent`, coupling witnesses), interpose (`behavior.identity`) | `eq_projections_prod_iff_rectangle`, `eq_projections_prod_iff`, `eq_projections_pi_iff`, `Relation.comp_eq` (Mathlib) |
| Which ports of a box are independent | the finest partition of a box's ports over which its declared relation is the product of its block projections: unique, and a partition splits iff each part is a union of its blocks | `triz_transform` segment and take_out (`behavior.finest`), `triz_behavior` (`factorisations`) | `IsFinest.addPort`, `factors_split_iff`, `IsFinest.factors_iff` |
| System operator (9 windows), level axis | restriction to a subsystem, a presheaf on the poset of box sets; collapse of the system into one box | `triz_nine_windows` | `typed_restrict`; definitions `supportedOn`, `typedOn` |
| System operator, time axis | a transformation sequence from one time to the next, as one net rewrite step, and its part inside the subsystem; with declared rows, the verdicts per time and how they change | `triz_nine_windows` with `transitions`: each step type-checks and the sequence reaches the later snapshot; `system.verdicts` and `changes[].verdicts` | `restrict_rewrite`, `restrict_rewrite_of_inside`, `boundary_rewrite`; definition `restrictionGrid` |

Ratings follow the MATRIZ function definition. A function is useful or harmful. Only useful
functions have a performance level: normal, insufficient, or excessive. A back-reaction is
modelled as an ordinary wire in the reverse direction, so no separate "lens" flag is needed.

Each verdict cites in `basis` the theorem in `theory/CategoricalTriz.lean` its reasoning uses, or
a Mathlib lemma a proof there uses; the last column lists them. That theorem proves the abstract
fact; tests check the TypeScript against it, and nothing is extracted from Lean. A basis never
means the TRIZ reading of a verdict is proved. A verdict that needs no theorem, such as a
compatible pair, cites none. The lemmas no verdict cites, and which verdict cites which theorem,
are in the [theory map](../../../docs/theory-map.md#theorem-inventory).

## Build and expand models

`triz_build_model` accepts a domain, components (`id`, `name`, `role`), and interactions
(`subject`, `action`, `object`, `carrier`, `polarity`). Each carrier supplies its id, layer and
dimension. Optional flows reference those component and carrier ids. It generates the ports and
wires by one fixed scheme, and the same table always gives the same ids; renaming a component’s
display name changes none:

| Generated | Id | One per |
|---|---|---|
| Input port on the object | `in:<carrier>:<subject>:<action>` | interaction |
| Output port on the subject | `out:<carrier>` | subject and carrier |
| Wire | `wire:<subject>:<action>:<object>:<carrier>` | interaction |

So two interactions bringing the same carrier into one object reach two input ports, and no
input port is fed by two functions: no source has to agree with another under behaviour, and an
extensive carrier never fails with `extensive-fan-in`. Declare the object's behavior or
feasibility rows per port. An output port is shared by the subject's functions on that carrier
and fans out: one shared level on an intensive carrier, the sum of the demands on an extensive
one. Each part is percent-escaped (`:` as `%3A`, `%` as `%25`), so ids containing `:` never
collide: `wire:a%3Ab:…` is subject `a:b`. Quote the generated ids back exactly. It
validates the result and returns lints and a completeness report. Unrecorded component pairs
are prompts to review, not claims that every pair should interact. Product reach counts any
incoming interaction, including harm; it does not establish a useful deliverable. Ratings and
behavior rows are never invented.

A box can declare `inner: { model, inputs, outputs }`. Each binding is
`{ outer: "port-id", inner: { box: "inner-box", port: "inner-port" } }`. Bind every outer and
exposed inner port once, on matching sides with matching carrier declarations; inner inputs
must be unwired. Nesting is capped at eight levels. The box cannot also declare an unchecked
outer behavior, producible, state, transition, feasibility or cost summary.

`triz_nine_windows` displays the inner model and its interface when one selected box declares
one. `triz_expand_hierarchy(model, box)` explicitly substitutes it into the parent and returns
fresh box/wire/flow maps. It preserves each inner box’s fixed cost, feasibility rows, states,
initial states and transition rows, and rewrites standalone inner flow paths and media to the fresh
box ids. Parent budgets and weights stay on the parent. An outer flow that passes through the
replaced box or names it as medium is refused: the interface does not determine a unique inner
route. Declare that route explicitly rather than guessing. Inner budgets, weights, contradictions,
different domains, and product deliverable identity changes are still refused. Expand further
nested boxes one at a time. Resource and dynamic declarations are preserved and tested against
manually flattened models; the static substitution theorem does not prove those semantics. Until expanded, semantic tools do not infer inner rows; residual
synthesis and semantic isomorphism refuse nested shells, and ideality marks its outer-only counts
and costs incomplete. `triz_function_model` reads harm loops and separation over the outer wiring
and the model's own contradictions only: with nested boxes it returns `incompleteHierarchy` (their
ids) beside them, and its isomorphism check carries `incompleteHierarchy: true`. An empty
`harmLoops` there is not a clean verdict, since a loop inside an inner model is not reported:
expand first. Generic explicit deletes may remove a whole nested box; they are structural
edits, not behavior-preservation claims.

For a one-hole `weakest_spec` with an infeasible producible bound, `extensionCandidates.rows`
lists the safe nonproducible rows that cover missing target pairs. The default lists 50;
`full_relation: true` returns every candidate within the existing state cap. Supply each listed
candidate exactly once in `row_costs: [{ row: { in, out }, cost }]`, with nonnegative safe-integer
prices in one common caller-chosen unit. `cheapestExtension` finds the least total cost set,
paying once per added row even when it covers several target pairs. It changes no Boolean
verdict and adds no rows to the model. `max_cost_search` caps the exact search at up to 100,000
nodes; cap or integer overflow gives `undecided`, with no optimality claim. When the residual
itself misses the target (`impossible`, `not-covered`), no added row can help: `cheapestExtension`
is `{ status: "not-applicable", reason: "target-not-covered-by-residual" }`, and the supplied
entries are checked for shape only (each a row of the box, every port once with a declared value,
listed once, at a valid cost). Where no one-box residual is computed (two or several boxes to
specify, missing baseline behaviour, an empty target relation, a lost deliverable) `row_costs`
fail with `invalid-row-costs`, whose message names the result; drop them to see it. Two-hole costs
are unsupported. The finite cover algorithm is tested against exhaustive subsets; its optimality is
not certified by the graded-residual theorem.

Before stateless composition, bounded unary-domain arc consistency removes unsupported values
and rows over the wire-unified variables. Surviving rows keep their original order. Every original
boundary input and its empty-output row is still enumerated, so pruning changes no relation or
admitted situation. A worklist revises a table again only when one of its variables lost a
value, so one pruning that ripples down a chain costs a pass per table, not a rescan of every
table per link. A separate preprocessing cap (1,000,000 work units) discards all partial pruning
and uses the old join. Arc consistency does not decide global consistency: cyclic constraints can
still have no joint solution. The boundary-valuation and join-search caps remain in force.

The composed relation (`triz_behavior` without `compare_to`), `triz_adequacy`'s result, and every
steady-state `cap-exceeded` failure or `state-cap` verdict carry `propagation: { status, work }`. `status` is `complete` (pruned to
the fixpoint) or `fallback` (the pruning cap was hit, so nothing was pruned), and `work` is the
units spent. After a fallback, a state cap's message and hint say the search ran over unpruned
rows, so the cause is the size of the tables: declare fewer values or rows, or split the model.

## Fields and tool dependencies

Declare the fields a question needs, on the boxes that matter. Missing rows give `undecided`,
naming the boxes, or fail closed with a code; the kernel never fills anything in.

| Field | On | Unlocks | Without it |
|---|---|---|---|
| `values` | carrier | every row: behaviour, transition, producible, targets, `acceptable` | rows or checks that read the carrier fail (`no-declared-values`) |
| `behavior` | box | `triz_behavior` (and `weakest_spec` for the other boxes), `triz_weakness`, `triz_adequacy`, behaviour certificates, the behaviour of constructions, `triz_nine_windows` verdicts, and the finite assurance tools below | `undecided` (`missing-behavior`) for every box that can reach a deliverable |
| `producible` | a box without `behavior` or `transition` | `weakest_spec` cut to what the box can make: `impossible` with reason `infeasible`; with `feasibility` and `levels` too, the `unbacked-producible-row` lint | the spec ranges over every row of the box's declared values |
| `state`, `initial`, `transition` | box | `triz_dynamics`: escalation, invariance (each bounded by the horizon, and without `inputs` also `unbounded`, at every horizon), separation in time, `loops`; dynamics certificates; `triz_queue` compiles into them | `triz_dynamics` fails (`nothing-to-explore`) unless a target names a box |
| `feasibility`, `cost`, `budget` | box; box; model | `triz_feasibility` (with `trim`, each absorber's added resources), `uneven-development`, `triz_nine_windows` `system.verdicts.feasibility`, resource modes in `triz_implementations` and `triz_synthesize` | `undecided`: `missing-feasibility`, or `no-budget`, or `unbudgeted`; a box outside the solve adds only its `cost` |
| `levels` | carrier with `values` | amounts read as values: `levels` in `triz_feasibility` and `triz_abstraction`; `at_least`/`below` in every `acceptable` | no reading between amounts and values; a threshold fails (`invalid-threshold`) |
| `quantity` | carrier | `extensive`: in `triz_feasibility` an output's demands add up, an input fed by several functions fails closed (`extensive-fan-in`), and the `extensive-fan-out` lint; `triz_isomorphism` maps it unchanged | `intensive`: one shared level, so an output meets the largest demand |
| `loss` | carrier | the `defect-on-loss-carrier` lint, decided by the declaration: `true` raises it on an excessive or insufficient function of the carrier, `false` silences it. No verdict reads it, and `triz_isomorphism` does not compare it | the lint guesses from the words of the carrier id, its dimension, and the verbs, so renaming can raise or silence it |
| `flows` | model | `triz_flow`; adjacency for `merge`; `flows` in `triz_abstraction`; `flowsChanged` in `triz_nine_windows` | functions say only who acts on whom, not series order |
| `priors` or `joint_prior` | `triz_weakness` argument | `weightedAdmitted` and `byWeight`, or `jointAdmittedWeight`, `jointAdmittedProbability`, and `byJointPrior` | the uniform count, `byCount` |
| `weights`; `mpv_weights` | model; `triz_function_model` argument | a scalar ideality ratio; `comparison.mpv` | costs per dimension, never summed |
| `contradictions` | model | separation checks inside `triz_function_model` | — |

The chaining rules agents get wrong:

- **`box_map`.** `triz_transform` `segment` and `take_out` (of any box) return `boxMap`, part id →
  original id, and so does `cheap_copy` under a new `copy.id`. Pass it unchanged as `box_map`,
  with `compare_to`, to `triz_function_model` and to `triz_behavior` alike. Without it, a moved
  deliverable reads as lost (`concept-loses-functions`, or `changed` with `lost-deliverables`);
  `deliverableKeysChanged: true` says a product's deliverables moved. `box_map` needs
  `compare_to`, and `trim` refuses `compare_to`: to compare a trimmed concept, apply the trim with
  `triz_transform` and pass the result as `model`. Never pass a box map after `merge`: merged
  ports are renamed `<box>.<port>`, so no map recovers a merged product's deliverables. Merge
  non-product boxes, or compare the deliverables by hand. A rule application that reports
  `deliverableKeysChanged` moved a deliverable to another port or carrier, which no box map
  recovers either.
- **`levels`.** One carrier's `levels` link three tools. `triz_feasibility` reads each
  feasibility row of a box that also declares behaviour through them and reports the rows that
  disagree. `triz_abstraction` reads a detailed box's feasibility rows against its coarse image's
  behaviour. `triz_weakness` turns `at_least` and `below` into acceptable values, and so do
  `triz_adequacy`, `triz_nine_windows`, and the contracts of `triz_implementations`. A bound
  must be one of the carrier's thresholds, and every concept must read it as the same value
  (`levels-differ`). Give the carrier the same `levels` in every model the chain touches.
- **`weakest_spec` comes back `impossible`.** Read `reason` first.
  - `not-covered`: no relation of the box gives the target, producible or not (`uncovered`; for
    two boxes, `pairs` with each pair's first uncovered input). Changing what is producible
    cannot help; change another box, the wiring, or the target.
  - `infeasible`, one box: some relation would give the target, but none the box can produce.
    `requiredInfeasible` lists, per target pair the producible rows miss, the rows that deliver
    it; every relation that gives the target contains one row of each entry. Make one row per
    entry producible (another physical box, field, or resource), or change another box or the
    wiring, as the result's `note` says. Or treat it as a contradiction on the box: if the rows
    are needed under different conditions or at different stages, separate them
    (`triz_separate`; in time, with declared state, `triz_dynamics` `separation`). That leaves the
    single steady-state relation the spec is about, so check the new model again.
  - `infeasible`, two boxes: there is no `requiredInfeasible`. `wouldGive` lists the concepts over
    all rows that would cover the target; each holds a row that is not producible.
- **`scope`.** `triz_behavior` and `triz_weakness` default to `scope: "upstream"`, for
  compatibility: only the boxes
  that can reach a deliverable are composed, and every other box is assumed to accept whatever it
  receives (the result's `assumption`). `scope: "whole"` composes every box constraint:
  downstream boxes, disconnected ones, fan-in, and loops. `triz_adequacy` defaults to `"whole"`,
  and `triz_behavior_refinement` and the contracts always compose the whole model. A certificate
  encodes the scope requested. Pass `"whole"` before saying anything about the whole system, such
  as "the system behaves as before": the whole relates no more than the upstream part, and can
  relate strictly less. An empty `partialDownstream` does not show they are equal, since total
  downstream boxes can still rule out steady states through a loop or a disagreeing fan-in.
- **`priors` versus `joint_prior`.** Give one or neither; giving both fails with `invalid-prior`. `priors` weighs each
  situation input (box and port), or every input of a carrier, independently, with a
  nonnegative weight per declared value: an unlisted input or value counts 1, and 0 rules a value
  out. `joint_prior` weighs every complete situation explicitly, zero
  included, for correlated conditions. Either breaks ties between incomparable concepts; neither
  changes an inclusion or a pair.
- **Adequacy and implementations.** A relation comparison alone establishes neither. Use
  `triz_adequacy` to require a steady state with only acceptable outputs at every operating
  input, and `triz_implementations` to require one implementation to meet behaviour, harms, and
  budget together.

The finite assurance tools:

| Tool | Needs | Answers |
|---|---|---|
| `triz_adequacy` | `model` with behaviour, `acceptable`; optional `required_inputs` (complete situations; default every one) | whether each required situation has a steady state and only acceptable outputs |
| `triz_isomorphism` | `source`, `target`; optional `mapping`; `profile`: `behavior`, `dynamics`, `feasibility`, `flows`, or `all` | a bijection preserving the wiring and the profile's annotations, with value and state maps, checked or searched; past `max_steps`, `undecided` |
| `triz_behavior_refinement` | `detailed` and `coarse` whole models with behaviour; `inputs` and `outputs` value maps | equality or inclusion of the complete whole-model relations under the maps |
| `triz_subsystem_summary` | `model`, the stateless `boxes` of the subsystem | its exact boundary relation, fixed cost, and hidden harmful and excessive functions |
| `triz_implementations` | a `contract` (target model, `acceptable`, one shared `budget`, optional `required_inputs` and `allowed_harms`); named complete `alternatives`, each box with exactly one feasibility row asserted to support all its behaviour rows, plus envelope and evidence | which alternatives meet behaviour, adequacy, declared harms, and budget together |
| `triz_absorber_assignments` | `model`, `trim`, a `contract`, `implementation` metadata | every compatible absorber endpoint, and complete assignments checked together |
| `triz_synthesize` | a fixed `model`, a `contract`, `implementation` metadata, `holes`: per box, alternatives with full joint `behavior` rows and one `feasibility` row | complete tuples that meet the contract; impossibility holds only within the library and cap |
| `triz_global_separation` | `variables`, and `regions` with allowed tuples | one assignment satisfying every region, or none |
| `triz_queue` | per-slot `arrivals`, `service_capacity`, `storage_capacity`, `initial_backlog`, `schedule`, units | overflow or none within the declared slots, through the dynamics evaluator |
| `triz_conservation` | a `splitter` or `merge`, `quantity_kind`, `unit`, the amounts | whether the declared balance holds: extensive amounts sum, intensive levels take the max |
| `triz_rule_set` | `rules` | termination by a lexicographic box and wire count that every application decreases, or not shown |
| `triz_rewrite_pair` | `model`, two rewrites | whether the two occurrences commute |
| `triz_trim_rewrite` | `model`, `trim`, optional `absorb` | the applied trim as explicit deletion and gluing data, replayed |

## Protocol

1. **Model.** List the boxes, the carriers with their units, and every function with its rating.
   Call `triz_function_model`. On `ok: false`, fix every listed issue before going on: each
   names the input element at fault (`path`) and a fix (`hint`); see
   [Feedback for agents](#feedback-for-agents). Never reason over a model that does not
   type-check. Read the result's `warnings` too: they never change a verdict, but a
   `defect-on-loss-carrier` warning usually means a harm was rated excessive.

   When one system has two models, a detailed one (many boxes, costs, feasibility) and a coarse
   one (few boxes, declared behaviour), link them with `triz_abstraction` before you trust a
   verdict about the coarse one (see [Abstraction between models](#abstraction-between-models)).
   Give the carriers that both sides read `levels`, so that the detailed model's amounts read
   as the coarse model's values (see [Levels](#levels-numeric-to-qualitative)).

   When components sit in series along a flow, declare it in `flows`: functions say who acts on
   whom, not what a carrier passes through in order. Call `triz_flow` for its bottleneck,
   accumulation, and leak candidates (see [Flows](#flows)).
2. **Harm loops.** For each reported loop, name the causal mechanism and the evidence for every
   function in the witness cycle. A loop is a candidate to examine, not a finding. Useful-only
   feedback, such as a control loop, is not reported.

   When the loop may escalate over time, declare state on the boxes that hold it, such as a
   temperature, a queue length, or a balance. Call `triz_dynamics` with the unsafe set as
   `unsafe`. A `reachable` verdict comes with a shortest trace: the mechanism to substantiate,
   row by row. Model a damped concept and check that the set is `unreachable`, or pass a safe
   set to check invariance (see [Declared dynamics](#declared-dynamics)). The result's `loops`
   says whether the loop runs away into a trap, settles in one of several wells, or oscillates
   (see [Loop classification](#loop-classification)).
3. **Trim.** Call `triz_trim` with the boxes to remove. The output holds three things:
   - each orphaned function, which blocks the trim;
   - each absorber, ordered rule B (the object serves itself) and then rule C (another
     component, with supersystem resources last). Within a rule, boxes come in the order the
     model declares them, and the first listed is the absorber an applied trim takes by
     default;
   - one trimming problem per absorber of a useful function, and one level problem
     (`levelProblems`) per excessive or insufficient function: the object needs that flow at the
     right level, so no absorber is asked to take the defect over as it is. If no level of the
     flow is useful, the function is harmful and needs no absorber.

   Treat every trimming problem as a new problem to solve. Still generate at least three
   mechanisms (SKILL.md). Model the chosen concept and compare it with `compare_to`. A concept
   that drops a deliverable loses a function, whatever it saves.

   Then decide the trim, passing the same `trim` and `absorb`:
   - declared behaviour: `triz_behavior` ([Declared behaviour](#declared-behaviour)). A
     `preserved` verdict holds for the relations as declared; substantiate each, the absorber's
     first;
   - behaviour everywhere but the absorber, or the absorber and one new mediator: add
     `weakest_spec` ([Weakest box specification](#weakest-box-specification)). The specification
     is the trimming problem stated as a relation; it is still a problem to solve;
   - declared feasibility: `triz_feasibility`, for the remaining boxes' budget and each absorber's
     added resources ([Co-design feasibility](#co-design-feasibility)).
4. **Separate.** For a physical contradiction, give each demand its admissible values and the
   cells where it applies on each axis. Use `space`, `time`, `condition`, `direction`, and
   `level`, which are MATRIZ's five separation types; `condition` is MATRIZ's "relation
   (conditions)". The status drives the route:
   - `compatible`: a value meets both demands, so this is not a physical contradiction. Choose
     that value.
   - `separated`: the listed axes separate the demands. Assign the parameter piecewise. Each
     such pair carries `suggestions`: per separating axis, the operations that could build the
     piecewise system, with each demand's cells on that axis (table below).
   - `irreducible`: the demands overlap on every axis. Refine an axis, try another system level,
     or escalate to ARIZ.

   For a separation in time, the snapshot check says which value each stage needs. When the
   boxes declare state, `triz_dynamics` with `separation` says whether one run of the declared
   dynamics meets each demand within its time window.

   | Separating axis | Suggested operations |
   |---|---|
   | space | `triz_transform` `segment` (Principle 1) or `take_out` (Principle 2) the box that carries the parameter, one part per region |
   | time | `triz_transform` `standby` (Principle 11), or `triz_dynamics` `separation` with one timed demand per side (Principle 15, parametric) |
   | condition | `triz_transform` `rerate` (Principle 16), or a `rewrite` that changes the field the parameter responds to (Principle 28, analogy only) |
   | level | `triz_nine_windows`: the system operator (`system`), or its subsystem restriction (`subsystem`) |
   | direction | `triz_transform` `segment` the box by port direction (Principle 1) |

   Suggestions are hints, not verdicts. They carry no `basis`, and a suggestion that follows a
   parametric or analogy-only principle says so (`principle.classified`). Principle texts are
   looked up in `data/principles.json`. The kernel does not know which box carries the
   parameter, or the order of time cells, so the hint leaves both to you. Apply the move, then
   check the result against the baseline.

5. **Transform.** Use `triz_transform` to apply one structural move and get the new model back.
   Every result type-checks, or the call fails closed:
   - the principle constructions below: `segment`, `take_out`, `merge`, `standby`, `reverse`,
     `rerate`, `retarget`, `feedback`, `interpose`, and `cheap_copy`;
   - `trim`, which performs a trim `triz_trim` screened as typed-feasible: the trimmed boxes go,
     and each function they performed on a remaining box is re-attached to a chosen absorber;
   - `rewrite`, which deletes and adds boxes and wires directly.

   For a move that recurs, write a rule or use a built-in evolution-line rule with
   `triz_rule_apply` (see [Rules](#rules-double-pushout)). Without `match` it lists the
   occurrences. Pass one back as `match` to apply it. An occurrence marked not applicable names
   the condition it breaks.

   A transformation is a move to evaluate, not a result. Compare the new model with
   `triz_function_model` and `compare_to`; when the boxes that matter declare behaviour, decide it
   with `triz_behavior` and `compare_to` too
   ([Behaviour through the constructions](#behaviour-through-the-constructions)). After
   `segment`, `take_out`, or `cheap_copy` under a new id, pass the returned `boxMap` as `box_map`
   to both; after `merge`, no box map helps ([chaining rules](#fields-and-tool-dependencies)).

   When several modelled concepts are adequate, rank them with `triz_weakness` (see
   [Weakness ranking](#weakness-ranking)).

   When the main parameters of value are known ([workflow.md](workflow.md), MPV), pass them to
   `triz_function_model` as `mpv_weights` with `compare_to`: each MPV, a cost dimension or
   `harmful`, with your explicit weight. `comparison.mpv` compares the two models over those
   axes only, componentwise (`pareto`) and by the weighted sum, lower being better (`verdict`).
   `ignored` lists the axes outside the MPV set on which the models differ, so nothing the MPV
   view leaves out is hidden. A lost deliverable still decides (`concept-loses-functions`). The
   weights are never filled in, and they never make the model's scalar ratio computable, which
   still needs `weights` on every dimension.
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

   When the snapshots declare behaviour or feasibility, each time's system view also carries
   its verdicts (`system.verdicts`: behaviour decided or why not; the feasibility verdict and its
   minimal resource vectors), and each entry of `changes` says how they move from one time to
   the next (`changes[].verdicts`):
   - `behavior`: the later model compared with the earlier one, as `triz_behavior` with
     `compare_to` (preserved, changed with a counterexample, or undecided);
   - `weakness`: with `acceptable`, the two times ranked as concepts by the situations they
     admit; without it, a prompt;
   - `feasibility`: the verdict at both times. `changed` is claimed only when both are decided
     (feasible or infeasible), and `resourcesChanged` says whether the minimal vectors moved.

   These are computed on the system view only: restriction drops the budget and cuts the
   deliverables' suppliers, and the collapsed box declares no rows. A failure in one of them,
   such as different deliverables at two times, is reported there and never fails the grid.

   `derived` holds the model each transition produced, by the time it leads to: a derived
   future is that column's model, ready to pass on to another tool, and a reached present
   equals its snapshot up to order. On `ok: false` the grid also carries top-level `errors` and
   `issues`, collected from the invalid windows and transitions.
7. **Share.** Use `triz_export` for a DOT drawing, a Mermaid flowchart to paste into markdown,
   an SVG picture (format `svg`, on the stdio server), or the hypergraph form. With
   `compare_to`, `triz_function_model` also reports whether the two models have the same wiring
   shape. Use format `lean` for a certificate that Lean can check (see
   [Certificates](#certificates)); `triz_separate`, `triz_dynamics`, and `triz_weakness` return
   one with `certificate: true`.

## Feedback for agents

Every `ok: false` result keeps `errors: string[]` and adds `issues`, one per error and in the
same order:

```json
{ "code": "carrier-mismatch", "path": "$.model.wires[0].carrier",
  "message": "wire 'w-drive' from: carrier 'heat' does not match port 'motor.shaft-out' carrier 'torque'",
  "hint": "A wire carries its ports' carrier: set the wire's carrier to 'torque', or attach it to a port of carrier 'heat'." }
```

- `code` is a stable kebab-case id, listed in [error-codes.md](error-codes.md). Branch on it,
  not on the message.
- `path` is a JSON path into the call's own arguments: `$.model…`, `$.compare_to…`,
  `$.transformation.parts[1].ports[0]`, `$.transitions.present_to_future[2]`. A path that ends in
  a key the input lacks names what to add (`$.carriers` for an unbound carrier variable). When
  the fault lies in something the input does not hold, such as a transformation's result or a
  trim's remaining model, the path points at the input element that produced it.
- `hint` is a concrete fix, naming the ids, values, or ports to use.

The common slips get a pointed hint: a whole `triz_rule_apply` listing entry passed as `match`
(pass `matches[i].match`), `carriers` or `ids` while only listing, `box_map` without
`compare_to`, and `absorb` without `trim`. Arguments that do not parse fail in the MCP SDK
before the kernel runs, with zod's message and path; where a slip is known, the message carries
a hint, e.g. `Unrecognized keys: "match", "applicable", "violations" (hint: … pass
matches[i].match) at match`, a `'box.port'` string where an endpoint `{ box, port }` belongs, a
`ports` list on a box (inputs and outputs are separate lists), a bare box id where `trim` takes
an array, or an unknown transformation `op`.

`triz_function_model`, `triz_trim`, and `triz_behavior` also return `warnings`: lints of each
model that type-checks, in the same shape plus `severity` (`warning` or `info`). A lint never
changes a verdict; the next section lists them. The loss lexicon behind
`defect-on-loss-carrier` is a heuristic over carrier ids, dimensions, and verbs; a warning is a
prompt to check the rating, not a finding. It is the only lint that reads labels, so it is exempt
from label-blindness: renaming a carrier, its dimension, or a verb can raise or silence it, and
never moves a verdict. Declare `loss` on the carrier to decide it instead. `true` raises it and
`false` silences it whatever the words, and then the lint survives any renaming. Run lints on
the labelled model before renaming it.

## Issue and lint codes

Every issue already carries its `code`, `path`, `message`, and `hint`; correct the input at
`path` as the hint says. [error-codes.md](error-codes.md) lists every code with the tools that
raise it and what it means. Read it only when a hint is not enough.

The lints:

| Lint | Means | What to do |
|---|---|---|
| `defect-on-loss-carrier` | an excessive or insufficient function on a carrier declared `loss: true`, or, with no declaration, on a loss-like flow by its words (a pressure drop, leakage, noise, wear) | Rating it excessive says some level of the flow is wanted from the performer; if no level of it is useful, rate it harmful. If some level is wanted, declare `loss: false` |
| `trim-level-functions` | the trim removes excessive or insufficient functions, posed under `levelProblems` | Solve each as a level problem; no absorber takes the defect over |
| `product-without-deliverable` | a product box no non-harmful function acts on | Add the function it should receive, or change its role |
| `unused-carrier` (info) | a carrier that types nothing | Delete it, or type the port or wire meant to carry it |
| `unwired-port` (info) | a port with no wire | Nothing, if meant: an unwired input is a boundary input, the operating condition `triz_behavior` and `triz_dynamics` read; an unwired output is capacity `triz_trim` may offer as an absorber |
| `unbacked-producible-row` | a box declares `producible` and `feasibility`, and a producible row's output level is reached by no feasibility row of the box, read through the carriers' `levels` | Fix whichever is wrong: the producible row, the feasibility rows, or the levels |
| `extensive-fan-out` | an output port of a carrier declared `quantity: "extensive"` feeds several functions: `triz_feasibility` makes it supply their sum, but `triz_behavior` and `triz_dynamics` give each function the port's one value | If the shares matter, insert a splitter box with one output per function; if every function gets the same level, the carrier is intensive |

The ten slips agents make most often:

| Code | Fix |
|---|---|
| `carrier-mismatch` | A wire carries its ports' carrier: set the wire's `carrier` to the port's, or attach it to a port of the wire's carrier |
| `wrong-port-side` | A wire runs from an output port to an input port: swap the ends, or pick ports of the right side |
| `row-missing-value` | A `behavior` or `transition` row gives every port of its box a value: add the missing one |
| `no-declared-values` | Declare `values` on the carrier before any row, target, or check reads it |
| `box-map-without-compare-to` | Pass the baseline as `compare_to`; without a baseline, drop `box_map` |
| `absorb-without-trim` | Pass `trim` with the boxes to remove, or drop `absorb` |
| `trim-with-compare-to` | Drop `compare_to` to decide the model's own trim, or apply the trim with `triz_transform` and pass the result as `model` with `compare_to` |
| `weakest-spec-without-target` | Add `compare_to` (the baseline's relation is the target) or `trim` (the untrimmed model's is) |
| `listing-entry-as-match` | Pass `matches[i].match`, the inner object, not the whole listing entry |
| `apply-args-without-match` | List without `carriers` or `ids`; pass them only when applying, with `match` |

## Certificates

`triz_export` format `lean`, `triz_separate`, `triz_behavior`, `triz_dynamics`, and
`triz_weakness` with `certificate: true` return a certificate: finite source tables, precisely
stated verdicts, and a manifest that binds the request. Generating one is not checking it.
Unsupported cases return a reason, never a certificate for a different claim, and `certifies`
lists exactly which claims were proved.

| Verdict | What the certificate proves |
|---|---|
| `checkModel` ok | Every encoded function has endpoints of its carrier on the correct sides |
| A harm-loop witness | The selected negative function lies on the listed closed path; completeness is not certified |
| Separation | The finite compatibility, separation, conflict and gluing statements listed in `certifies` |
| Reachable dynamics escalation | An initial admitted trace reaches the unsafe target within its length |
| Supported state-only negative dynamics | An invariant contains initial states, is closed under `Sync.Step`, and excludes unsafe states or lies in the safe set |
| Saturated unreachable port target, within the horizon or past it (`unbounded`) | An invariant excludes every admitted unsafe configuration, and no run blocks in a state that meets the unsafe set's state conditions (`unreachable_of_holding_classes`) |
| Weakness strict order, equality or incomparability | The actual composed row relations have the stated admission inclusions or distinguishing admitted/rejected situations |
| `triz_behavior` comparison | The aligned finite relations are equal and nonempty, or an input/output pair belongs to just one of them |

A row-table certificate is decided over every valuation of the composed ports, but ports that a
chain of functions joins count once: the certificate carries these port classes with a witness
that Lean checks, and states its verdict over the raw ports. So a series of boxes adds one
variable per function, not two ports. Past the cap on table reads (2,000,000), generation fails
closed with `cap-exceeded`; the hint names what to shrink.

Behavior certificates support declared `box_map`, inputs read by only one model, and
concept-only gained deliverables outside the baseline interface. Residual specifications and
lost deliverables are not certified. Weakness prior masses are not certified. Negative dynamics
require no input schedule and checked closure: state-only certificates exclude unsafe states
regardless of admitted valuations; saturated port-target certificates exclude only admitted
unsafe configurations. When the bounded escalation is open (`unreachable-within-horizon` or
`undecided`) and `unbounded` is decided, the certificate states the unbounded verdict: the trace
past the horizon, or the unreachable invariant. Bounded-only negatives (an input schedule, or the
cap hit past the horizon), safe port-invariance claims, separation and loop classes remain
unsupported. A combined request can return only the supported escalation proof.
Blocked-state port uncertainty remains explicit.

Check the proof and its input binding with an explicit execution mode:

- **Locally**, the default: `lake env lean` against `theory/`, at the repo's Mathlib pin. If
  `theory/` is not built, the script stops and names both options; it never falls back to the
  network.
- **Remotely**, only with `--remote`: the certificate, which holds the model's ids and tables,
  leaves the machine. It goes with the theory to the AXLE service (environment `lean-4.32.2`, no
  key). The result then trusts AXLE. AXLE swaps in `import Mathlib` at its own revision, which
  may differ from the pin. The MCP server and the Worker never call AXLE.

```sh
node scripts/certify.mjs --local --tamper --request request.json result.lean
```

`--request` takes the exact request used for generation; see
[the request formats](../../../docs/categorical-assurance.md#certificates-and-source-correspondence).
A theorem holds for the encoded scope and declared rows; physical truth is not established by
proof checking. How the encoding, the checker, and `--tamper` work is in the
[theory map](../../../docs/theory-map.md#certificates).

## Declared behaviour

A carrier may list its finite `values`. A box may declare `behavior`: rows that each give every
input port and every output port one declared value. The rows are a relation, not a function:
an input tuple with no row cannot occur, and several rows for one input tuple are alternatives.
Every row is type-checked, and an undeclared port or value fails closed.

`triz_behavior` composes the declared relations:

- **Ports are variables.** A wire says its two ports carry the same value. A port fed by
  several wires therefore needs them all to agree. Model a sum or a merge as a box.
- **Interface.** The boundary inputs are the unwired input ports. The deliverables are the
  input ports of product boxes fed by a non-harmful function, as in the ideality profile.
- **Upstream only, by default.** Only the boxes that can reach a deliverable are composed, and
  each of them must declare behaviour. Every other box is assumed to accept whatever it receives.
  The output lists downstream boxes whose declared relation is partial (`partialDownstream`): in
  the full relational composite they would rule out steady states. Total downstream boxes can
  rule them out too, through a loop among them or a downstream port fed by several wires that
  disagree, and are not listed. An empty `partialDownstream` does not mean the whole model has
  the same relation. `scope: "whole"` composes every box instead.
- **Steady states.** A steady state is a valuation of the composed ports that every relation
  and every wire admits. The external relation is the set of steady states projected onto the
  inputs and the deliverables. A feedback loop composes by the relational trace: an input and an
  output are related iff some loop value is consistent. The output lists the steady states.
  Several steady states at one input are all kept. An input with no steady state is listed in
  `noSteadyState`, since it may signal a runaway loop.

With `compare_to`, `model` is the concept, as in `triz_function_model`, and the tool decides
whether it keeps the baseline's input→deliverable relation. The concept can be any model of the
same system, such as a `triz_transform` result. `trim` is shorthand: the trim is applied as
`triz_transform` does, and the result is the concept. The verdict is one of:

- `changed`, reason `lost-deliverables`: a baseline deliverable port has no non-harmful
  function in the concept. No behaviour is needed for this.
- `undecided`, reason `missing-behavior`: a box that can reach a deliverable, in the baseline
  or in the concept, declares no behaviour. The output names those boxes. Segmentation and
  Taking out give the parts behaviour only when the box's relation splits over them, and an
  Intermediary's mediator has behaviour only when you declare it (see
  [Behaviour through the constructions](#behaviour-through-the-constructions)). Merging builds a
  box without behaviour and lists the boxes whose behaviour it drops (`droppedBehavior`).
  `cheap_copy` keeps the box's behaviour, and `reverse` refuses to add a port to a box that
  declares behaviour.
- `undecided`, reason `no-steady-state`: neither model has a steady state at any compared
  input, so both relations are empty and their equality says nothing about the concept.
- `preserved`: the baseline and concept input→deliverable relations are equal, and at least
  one of them is non-empty.
- `changed`, reason `counterexample`: the relations differ. The output gives the first input
  where they differ, the outputs of each model there, and the `direction`: the concept's
  relation strictly contains the baseline's, the baseline's strictly contains it, or neither.

Each model is evaluated in its own box ids. `box_map` renames the concept's deliverables and
boundary inputs to the baseline box before matching
([chaining rules](#fields-and-tool-dependencies)). It fails closed when a key is not a concept
box, or a value not a baseline box (`box-map-unknown-box`); when a mapped box has an input port
its baseline box lacks (`box-map-port-mismatch`); or when two concept boxes land an input port on
the same baseline port (`box-map-ambiguous`). The comparison is over the baseline's deliverables; `gainedDeliverables` lists the
ones only the concept has, and they are not compared.

The two relations are compared over the union of their boundary inputs. A port that only one
model reads, such as an input the trim leaves unwired, ranges over every declared value in both
models (`inputsOnlyIn`). A port both read must have the same carrier and the same values in
both, or the call fails closed. A counterexample that sets such a port follows from the model, not
from the physics. The result counts, per model, the input valuations with no steady state
(`noSteadyState`), and the compared inputs where neither model has one (`emptyInBoth`). Two
relations that are empty everywhere read `undecided`, never `preserved`. When only some inputs
are empty in both, those inputs agree and are counted. `preserved` then also rests on the
inputs where both models have steady states. If one model has steady states at an input and
the other has none, the verdict is `changed`, and the counterexample says which side is empty.
Boundary valuations and search states are capped (`max_states`, at most 100000); past the cap
the call fails closed.

The semantics `triz_behavior` computes is defined in Lean and proved compositional (series,
parallel, feedback, monotonicity, a box left open); the evaluator is checked against it by a
brute-force cross-check, not extracted from it. See
[Compositional semantics](../../../docs/theory-map.md#compositional-semantics) in the theory map.

## Behaviour through the constructions

`triz_transform` carries declared behaviour into its results only where the result's relation
is fixed by what was declared:

- **Segmentation and Taking out.** When the box declares behaviour, its relation R is checked
  against the parts: is R the product of its projections onto each part's ports? Principle 1
  asks for "independent parts", and this is that independence for the declared relation
  (`behaviourallyIndependent`). If it holds, each part gets its projection as its behaviour, and
  the parts compose back to R. If not, no relations on the parts compose back to R
  (`eq_projections_prod_iff`, `eq_projections_pi_iff`): the parts get no behaviour, and
  `behavior.coupled` names each part whose ports are not independent of all the other parts
  together.
- **Coupling witness.** One part against the rest, R is the product of its projections iff it is
  a rectangle: whenever (x₁, x₂) and (y₁, y₂) are rows, so is (x₁, y₂)
  (`eq_projections_prod_iff_rectangle`, cited for both verdicts). For each coupled part,
  `behavior.witnesses` gives two rows x and y, each shown part by part, and their mix (`absent`):
  the part's values from x, the rest from y, which is not a row. Which pair is shown depends on
  value names and port order; whether a part is coupled does not.
- **Suggested partition.** Whichever parts are given, `behavior.finest` gives the finest
  partition of the box's ports over which R is the product of its block projections (`parts`,
  port ids in box order). A partition splits R iff each of its parts is a union of suggested
  blocks, so `behaviourallyIndependent` holds iff `cut`, the suggested blocks whose ports lie in
  several parts, is empty. When it is, `splitsFurther` names the parts that hold several blocks.
  Past a cap of 1000000 cells the suggestion is `decided: false` (reason `step-cap`), and the
  given split is still decided.
- **Which boxes split.** In a plain `triz_behavior` composition, `factorisations` lists each
  composed box whose relation splits into two or more groups of ports, with the groups, in the
  model's box order: segmenting the box into them, or unions of them, gives each part its
  projection. Each box has its own cap; a box past it is listed with `decided: false` and reason
  `step-cap`. The hint describes the declared rows, not a physical split, and it changes no
  verdict and no other field of the result.
- **Intermediary.** The mediator may declare `behavior`: rows over its ports `in` and `out`, or
  `identity`, one row per declared value of the wire's carrier with in = out. A relation equal
  to the identity cites Mathlib's `Relation.comp_eq` (r composed with equality is r): with the
  legs' ratings unchanged, the composite through it is the original relation.

Decide the result with `triz_behavior` and `compare_to`. Without declared behaviour, new boxes
stay undecided.

## Weakest box specification

`triz_behavior` with `weakest_spec` takes a concept in which one or two boxes that can reach a
deliverable declare no behaviour, and a target relation. The bullets up to **Re-check** are about
one box; **Two boxes** below is about two. The target is the relation of the
baseline given as `compare_to` (with `box_map` when a segmentation moved deliverables), or, with
`trim`, the untrimmed model's. With every other box fixed, the context `C` sends a relation `R`
for the box to the concept's input→deliverable relation `C[R]`. The concept is aligned with the
baseline as `compare_to` aligns it, and the relations are compared over the union of boundary
inputs.

- **Spec.** `W` is every row of the box, over its ports' declared values, whose composite stays
  inside the target at every input. A relation `R` keeps the composite inside the target iff
  `R ⊆ W` (`le_residual_iff`): `W` is the weakest box specification, the residual in Rel.
- **Covering.** The empty relation always stays inside the target (`map_empty`), so staying
  inside proves nothing. The verdict is `spec`, with `preserves: true`, only when `C[W]` covers
  the target. Declaring `W` then gives exactly the target, and every behaviour that does is
  contained in `W`. Otherwise the verdict is `impossible`: no behaviour of the box gives the
  target (`covers_iff_exists_eq`, `not_covers_iff`). `uncovered` gives an input and the target
  outputs `W` cannot deliver there. An empty `W` is always `impossible`.
- **Reading the spec.** `excluded` gives, for each excluded row, an input where its composite
  leaves the target. `unusedRows` counts rows that no steady state presents: they constrain
  nothing. `blockedInputs` lists input tuples of the box with no row in `W`. The box must rule
  out those steady states, and the physics must substantiate that.
- **Fail closed.**
  - A target deliverable the concept lacks gives `impossible` (`lost-deliverables`) before any
    search. A deliverable needs a function into it, which is wiring, not behaviour. Deliverables
    only the concept has are listed (`gainedDeliverables`) and not compared, as in
    `compare_to`.
  - Three or more boxes without behaviour give `undecided` (`several-holes`): no box has a single
    weakest choice, and the kernel computes nothing.
  - Missing baseline behaviour, and a target empty at every input (`no-steady-state`), give
    `undecided`.
  - The state cap gives `undecided` (`state-cap`). This includes more candidate rows than
    `max_states`.
  - A carrier of the box without `values` fails closed.
- **Producible rows.** The box to specify may declare `producible`: behaviour rows over its
  ports' declared values that it can physically produce, the set `F`. A box declares `behavior`
  or `producible`, not both, and the rows are typed like behaviour rows. The kernel cuts the
  residual down to them: the spec is `W ∩ F`. Some relation within `F` gives the target iff the
  composite of `W ∩ F` covers it (`covers_feasible_iff`). So the verdicts are:
  - `spec`, when `W ∩ F` covers the target. `producible.infeasible` lists the rows of `W` left out
    (`infeasibleRows` counts them); the target does not need them.
  - `impossible` with reason `infeasible`, when `W` covers the target and `W ∩ F` does not. No
    relation the box can produce gives the target (`not_covers_feasible_iff`), though one it
    cannot produce would. This is the residual contradiction. `requiredInfeasible` gives, for each
    target pair `W ∩ F` misses (an input and its outputs), the rows of `W` whose composite
    delivers it. None is producible, and every relation that gives the target contains at least
    one row of each entry (`required_row_of_eq`): one of them, not all.
  - `impossible` with reason `not-covered`, when `W` itself fails to cover the target, whatever is
    producible. `uncovered` is then the residual's witness.

  `excluded` keeps its meaning: rows whose composite leaves the target, producible or not. A
  transformation that adds a port to the box refuses, as it does for behaviour; `segment`,
  `take_out`, and `merge` drop `producible` from the boxes they replace.
- **Re-check.** The spec is re-checked against the target before the kernel answers.
- **Two boxes.** With exactly two boxes without behaviour, a pair of relations `(R₁, R₂)` stays
  inside the target iff every pair of rows, one of each box, does. A row pair is safe when its
  composite stays inside the target at every input. A row pair that no steady state uses is
  safe. `excluded` gives each unsafe pair with an input where it leaves the target.
  - **Maximal pairs.** The safe pairs of relations are the rectangles inside the safe row pairs.
    The maximal ones are exactly the formal concepts of that relation (`safe_iff_le_concept`,
    `concept_maximal`). `maximalPairs` counts them. Two distinct concepts are incomparable:
    allowing more rows of one box leaves fewer safe rows of the other.
  - **Covering.** The target is achievable iff some concept's composite covers it
    (`exists_eq₂_iff`). The verdict is `spec` when at least one does. `specs` lists those concepts,
    each with both boxes' rows. Declaring any of them gives exactly the target, and every pair of
    relations that gives the target lies inside one of them. With one, `weakest` is true: it is
    the weakest pair. With several, `weakest` is false: they are incomparable, no pair is the
    weakest, and the choice for one box constrains the other. When no concept covers the target,
    the verdict is `impossible` (`not-covered`): no pair of relations gives it. `pairs` lists each
    maximal pair with its first uncovered input. A typical cause is a target that is not a
    rectangle, such as two deliverables that must agree while each box sets one.
  - **Producible rows.** Each box's rows are cut to its `producible` rows first, and the same
    reading holds within the cut (`safe_feasible_iff`, `safe_feasible_iff_le_concept`,
    `concept_feasible_maximal`, `exists_eq₂_feasible_iff`). When no concept of the cut covers the
    target, the uncut rows give the reason:
    `infeasible` when some concept over all rows covers it (`wouldGive` lists those; each holds a
    row that is not producible), `not-covered` when none does. There is no `requiredInfeasible`
    for two boxes.
  - **Caps and re-check.** The candidate row pairs count against `max_states` before the search.
    The concepts can be exponentially many in the rows: past 10,000 the verdict is `undecided`
    (`concept-cap`). Each returned pair is re-checked against the target.

How the residual and the concepts are computed, and the lemmas behind them, are in the
[theory map](../../../docs/theory-map.md#weakest-box-specification).

## Weakness ranking

`triz_weakness` performs [weakness.md](weakness.md)'s steps 1–3 for concepts that declare
behaviour.

- **Situations.** A situation is a valuation of the concepts' boundary inputs over their
  carriers' declared values. This declared input space is weakness.md's list of operating
  situations, its measuring instrument. Boundary inputs are matched across concepts by box and
  port id. An input that several concepts read must range over the same values. Concepts that
  replace the component reading a condition would read it under different ids, which makes it
  two independent situations. Put each operating condition on an environment box with an unwired
  input, passing it on by an identity relation, under the same id in every concept.
  `readByOne` lists the inputs only one concept reads, and each concept's `reads` lists its own.
- **Admits.** A concept admits a situation when it has a steady state there and every
  deliverable output there is acceptable (`admits`). `acceptable` gives, per deliverable port,
  the acceptable values, and it is required. A situation with no steady state is not admitted,
  so having no behaviour never makes a concept weak.
- **Acceptable from a threshold.** An entry may name a carrier instead of a port, for every
  deliverable of that carrier; a port entry takes precedence. Instead of `values`, it may give a
  numeric requirement, `at_least` or `below` (or both, for a range), read through the carrier's
  `levels`: `at_least: x` accepts the values whose whole band is at least x, `below: x` those
  whose whole band is below x. Each bound must be a declared threshold, so the value set says
  exactly what the amount does (`level_gc`); a bound inside a band fails closed, and so do an
  empty set and concepts whose levels read the bound differently. The result lists each
  deliverable's derived values under `acceptable`. This is the MPV chain's last link
  ([workflow.md](workflow.md)): value driver, threshold, acceptable set.
- **Ranking.** Concepts are ranked by inclusion of what they admit (`AtLeastAsWeak`, a preorder).
  The output gives:
  - `weakest`: a concept that admits everything any other admits, if one exists;
  - `maximal`: the concepts no other strictly contains;
  - each pair as `equal`, `first-weaker`, `second-weaker`, or `incomparable`, with a situation
    only one of the two admits, each way. Inclusion is not total.
- **Count.** The count of admitted situations (`byCount`) is secondary. A strict inclusion gives
  a strictly larger count (`card_lt_of_strictly_weaker`), so the two never disagree there.
  Between incomparable concepts, the count depends on how finely the carriers' values are
  declared: splitting one value into two changes it. Bennett (2023, cited in weakness.md)
  measures weakness as that count, under a uniform distribution over tasks.
- **Prior.** `priors` or `joint_prior` replaces the uniform measure
  ([chaining rules](#fields-and-tool-dependencies)). Each concept then carries the total prior
  mass of what it admits (`weightedAdmitted`, ranked in `byWeight`; with `joint_prior`,
  `jointAdmittedWeight`, `jointAdmittedProbability`, and `byJointPrior`). The weights multiply
  into the count, so every inclusion, every pair, and `weakest` are exactly what they were.
  weakness.md's rule stands: a real prior beats the uniform assumption, and the uniform count is
  the default.
- **Fail closed.** The concepts must deliver the same ports. A concept that drops a deliverable
  has fewer outputs to be acceptable, so it would look weaker; the ranking refuses instead. Missing
  behaviour and the state cap give `undecided`.
- **Adequacy first.** Rank only concepts that resolve the contradiction; that check stays with
  you. For a safety, integrity, or authorisation decision, admitting more is the wrong direction
  (weakness.md).

## Declared dynamics

A box may declare `state`, the finite set of values it carries from one step to the next, its
`initial` states, and `transition` rows. A row gives a state, a value for every input port, a
next state, and a value for every output port. The rows are a relation: a state and inputs with
no row cannot occur, and several rows are alternatives. `state` and `transition` come together,
and a box declares `behavior` or `transition`, not both. Every row is type-checked, and an
undeclared state, port, or value fails closed.

Such a box is a nondeterministic Mealy machine, a map `S × I → P(S × O)`.

`triz_dynamics` composes the machines:

- **Synchronous steps.** Wires are instantaneous within a step, as in `triz_behavior`, and
  memory lives only in declared state. A step from a global state is a valuation of the composed
  ports that every box admits: a stateless box by its `behavior`, a stateful one by its rows at
  its current state. The rows picked name the next state. A loop through stateless boxes
  resolves within the step by the relational trace. To model a delay, declare it as state.
- **Configurations.** The configuration at time t is the global state and the valuation of the
  step taken at t. A state with no consistent valuation is a blocked configuration: it has no
  valuation and no successor. The result counts blocked runs and gives a shortest one. A target
  holds at a blocked configuration when its state conditions hold and it names no port. If it
  names a port, it is undetermined there, and a verdict it would decide is `undecided` (reason
  `blocked`), never safe.
- **Composed boxes.** Every box that declares `transition`, every box a target names, and every
  box upstream of them. Each must declare `behavior` or `transition`; otherwise the result is
  undecided and names the boxes. Every other box is assumed to accept whatever it receives, and
  `partialDownstream` lists those with partial rows.
- **Inputs.** Without `inputs`, every unwired input port takes every declared value at every
  step, and the system is time-invariant. With `inputs`, entry t lists the values allowed at
  time t, and the horizon defaults to its length minus one.
- **Search.** Runs are explored breadth first from the initial states, up to `horizon` steps
  (default 20, at most 1000). Every trace is a shortest one, and every trace returned is
  re-checked against the declared rows, independently of the search. Configurations and search
  states are capped (`max_states`, at most 100000); past the cap the call fails closed. Only the
  loop classification, which has no horizon, returns a partial result past the cap instead
  (`complete: false`; see [Loop classification](#loop-classification)).

A target set is a list of conditions that must all hold at one time: `{ box, state }` names
states of a stateful box, and `{ box, port, values }` names values of a port, such as
`{ box: "bearing", port: "friction", values: ["high"] }`. The verdicts:

- **Escalation** (`unsafe`): `reachable`, with a shortest trace from an initial state into the
  set; `unreachable`, when the reachable configurations stopped growing within the horizon, so
  no run reaches the set at any horizon; `unreachable-within-horizon`; or `undecided`, when a
  run blocks where the set is undetermined. With `inputs`,
  configurations are indexed by time, so the set never stops growing and the verdict stays
  within the horizon.
- **Invariance** (`safe`): `violated`, with a shortest trace out of the set; `invariant`;
  `invariant-within-horizon`; or `undecided`, on the same terms.
- **Without a horizon** (`unbounded`, inside `escalation` and `invariance`). Without `inputs`,
  the configurations are finite, so the search continues past the horizon, within the same
  `max_states`, until they stop growing. `unbounded.verdict` holds at every horizon:
  `reachable` or `violated`, with `time` and, when that is past the horizon, a shortest `trace`;
  `unreachable` or `invariant`, with `completeAfter`; or `undecided`, with reason `cap-exceeded`
  (the cap ran out past the horizon) or `blocked`. The bounded verdict beside it is unchanged, so
  read it when the horizon is itself the requirement, and `unbounded` for "ever". A clock that
  first reaches its unsafe state at step 25 reads `unreachable-within-horizon` at the default
  horizon and `unbounded: reachable` at time 25. With `inputs` there is no `unbounded`.
- **Separation in time** (`separation`): two to four demands, each a target set with an
  inclusive time window; the windows must not overlap. `realizable` means one run visits each
  target set at some time within its window; the trace and the visit times are the witness.
  `unrealizable` gives the reason: `demand-never-met`, when no run meets some demand within its
  window, or `not-in-one-run`, when each demand is met by some run but no single run meets them
  all. `undecided` means a blocked run might meet them all. The search tracks which demands each
  run has met, so it never mixes two runs. This
  extends Principle 15 and separation in time from snapshots to trajectories.

The result also lists the reached fixed points: configurations whose step can leave the state
unchanged. At a reached fixed point, the steps staying there are the steady states
`triz_behavior` finds with each stateful box frozen at that state (tested on the examples). The
agreement holds only at fixed points a run reaches. A run may never
settle: a delay in a negation loop oscillates. A steady state may never be reached from the
declared initial states. Nothing is claimed about convergence.

### Loop classification

Without `inputs`, `triz_dynamics` also classifies how the loops behave in the long run, in
`loops`. It works on the reachable state graph: the global states of the boxes that declare
`transition`, with an edge from s to s' when some step from s can move to s'. Steady-state
`behavior` rows are never read as transitions: a model whose composed boxes declare no
`transition` is not classified, and neither is one with `inputs`, whose runs vary with time.

- **Exploration.** Breadth first, without a horizon, up to the cap. It starts from the initial
  states and, when `safe` names states, from every state that meets the safe set's state
  conditions. Past the cap the result says `complete: false`: every closed component it lists is
  closed, but others may be missed. When the global states are too many to scan for safe ones,
  only the initial states are starts, and `safeStartsSkipped` says so. Listings stop at 50, with
  `closedCount` giving the total.
- **Closed components.** A strongly connected component is closed when no edge leaves it, so a
  run that enters it never leaves. Each closed component settles (it has a fixed point, a state
  that can step to itself), oscillates (a cycle and no fixed point), or blocks (one state with no
  step, which is not classified).
- **Classes.** Every class that applies is listed:
  - `bistable`: fixed points in two or more closed components;
  - `trapped`: a closed component every configuration of which is unsafe, an absorbing trap.
    Every run that enters it stays unsafe at every later step. A shortest trace from a start
    into it is the counterexample, and says whether it starts from an initial or a safe state;
  - `recurrent`: a closed component that meets the unsafe set and also holds a safe
    configuration (`safe` gives one). The run never leaves it, and from each of its states it
    can reach both (`recurrent_reach`): it can recover and escalate again. The trace is given as
    for `trapped`;
  - `oscillating`: a closed component with a cycle and no fixed point. The result gives one
    shortest cycle, whose length is at least two, and the period, the gcd of the cycle lengths.
    A period of 1 means cycles of coprime lengths, not a fixed point.

  `none` means no closed component was found within the cap. A model whose only closed
  component settles at one fixed point outside the unsafe set has no class. Each closed
  component that does not block reports `unsafe`, whether it meets the unsafe set, and
  `allUnsafe`, whether it lies inside it. Both are read on configurations: a target that names a
  port can hold at a state under one valuation and fail under another, and then the state is
  not inside the set. A blocked component is not classified. `harmLoops` lists
  the harm loops through the stateful boxes; the classification is of the composite they run in.

In `bearing-heat-dynamics.json` the shaft has a temperature state. From `cold`, the
heat → preload loop reaches `hot` in two steps, and `hot` is a trap: the loop is `trapped`. When
a part can leave the unsafe state again, the closed component that holds both is `recurrent`.

## Co-design feasibility

A box may declare `feasibility`: its minimal rows, after Censi (2015). A row gives a level
provided at each output port, against the levels required at each input port and an operating
cost per cost dimension. Levels are numbers in the carrier's `dimension`. Rows read
monotonically: a row also covers providing less, receiving more, and spending more. An omitted
port or dimension is 0. A row naming a port the box lacks fails closed, and so does a row that
another row of the box dominates.

`triz_feasibility` composes the rows:

- **Demand.** The product boxes' rows state what they require at their input ports.
- **Wires.** A non-harmful wire turns its input port's requirement into a demand on the output
  port that feeds it. How several demands on one output combine depends on the carrier's
  `quantity`:
  - `intensive`, the default: the port has one level, like a voltage or a temperature, and must
    meet the largest demand. An input port fed by several functions needs each of them to meet
    the requirement.
  - `extensive`: the amount divides, like a flow of water or a current, so the port must supply
    the sum of the demands. A pump providing 5 cannot feed two beds that need 4 each: the verdict
    is `infeasible`, `unprovidable`, with 8 demanded. An input port fed by several functions
    fails closed (`extensive-fan-in`): what each supplies is not declared, so model a merge box
    with one input per function. The `extensive-fan-out` lint flags the fan-out, because
    `triz_behavior` and `triz_dynamics` still give every function the port's one value.

  Declare `quantity` explicitly; it is never inferred from the layer. Harmful functions carry no
  demand, and a requirement on a port that only harmful functions feed fails closed.
- **Composed boxes.** The product boxes, the boxes that declare feasibility, and every box
  upstream of them along non-harmful wires are composed, and each must declare feasibility.
  So a box that declares feasibility joins the solve wherever it sits, even off the product's
  chain: one of its rows is chosen in every selection, so that row's demand and operating cost
  count in every minimal vector, an unsupplied requirement fails the call, and an unprovidable
  one makes the verdict `infeasible`. Every other box contributes only its fixed `cost`.
  Segmentation, Taking out, and Intermediary build new boxes without feasibility, as without
  behaviour.
- **Resources.** A resource vector is every box's fixed `cost` plus the operating cost of the
  rows chosen, per cost dimension. Dimensions are never summed together.
- **Least fixpoint.** A configuration is a demanded level per output port and a cost vector.
  Starting from nothing demanded, each step asks the boxes for rows that provide what a
  configuration demands, adds the demand those rows place upstream and their cost, and keeps the
  minimal results, an antichain: Kleene's ascent. Feedback loops need no special case: where the
  demands stop growing, the minimal configurations are exactly the minimal feasible ones
  (`kleene_lfp`, `kleeneStep_upperClosure`, `codesign_lfp`).

The verdict compares the minimal resource vectors with the model's `budget`. Each vector comes
with one witness: a row per composed box, and the level demanded per output port.

- `feasible`: some minimal vector is within budget on every dimension. Those vectors are
  listed first: `withinBudget` gives their positions in `minimal`, and `withinBudgetCount` how
  many there are. At most 50 vectors are listed; `minimalCount` gives the total.
- `infeasible`, reason `over-budget`: every minimal vector exceeds the budget somewhere.
  `binding` lists the dimensions that every one of them exceeds. It is empty when they exceed
  different dimensions; relaxing one dimension alone may then not help.
- `infeasible`, reason `unprovidable`: some box has no row for what is demanded of it, so the
  ascent ends empty, whatever the budget. The output names the box and the levels demanded of
  it together (`demanded`). `ports` lists each port no row reaches even alone, with the most any
  row provides there. It is empty when some row reaches each level but no row reaches them all.
- `undecided`: reason `missing-feasibility` (a composed box declares none), `no-budget` (the
  minimal vectors are listed), or `unbudgeted` (a vector fits every budgeted dimension but
  spends on one the budget does not name).

With `trim` and `absorb`, the input `triz_behavior` takes, the trim is applied as
`triz_transform` does. The verdict is the trimmed model's: can the remaining boxes provide what
the trim leaves them, within budget? The trimmed boxes need no feasibility. The baseline is
solved only to report each absorber's added resources: its chosen row's operating cost after the
trim minus before it. `added` is given when each side has one minimal vector. With several,
`trimmed` and `baseline` list the absorber's row per vector, and the pairing is the caller's.

In `bearing-heat-feasibility.json`, the shaft needs 2500 N of radial support. The bearing
provides 3000 N; the housing, as built, 400 N. Trimming the bearing re-attaches the support to the
housing, whose second row carries 3000 N for 22 USD and 1 service hour a year more. The trimmed
model needs 182 USD and 1 h/year against a budget of 200 and 4, so it is feasible, and the
housing adds `{ usd_unit: 22, service_h_year: 1 }`. With a budget of 180 USD it is infeasible,
and `usd_unit` binds.

`triz_behavior` asks which values flow, and solves a loop by its steady states; `triz_feasibility`
asks how much is needed, and solves a loop by iterating up to the least fixpoint. The
[theory map](../../../docs/theory-map.md#co-design-feasibility) says why each is right for its
question.

The antichain (`max_antichain`, at most 1000, checked at every insertion), the Kleene steps
(`max_iterations`, at most 1000), and the row selections tried (1,000,000 per solve) are capped.
Past a cap the call fails closed. The ascent always ends, but the antichains can grow
exponentially with the number of boxes and rows.

## Levels: numeric to qualitative

Feasibility rows speak in numbers (2500 N); behaviour rows speak in values (`supported`). A
carrier that declares `levels` links the two: each level is a declared value with a threshold
`from`, and an amount reads as the last value whose threshold it reaches. The list orders its
values from least to most; the `values` array need not. checkModel fails closed unless the
carrier declares `values`, names each value at most once, starts at 0 (every amount is
non-negative, so every amount reads as some value), and strictly increases. Those conditions
make the reading monotone (`level_monotone`) and a Galois connection: an amount reaches a
value's threshold exactly when it reads as that value or above (`level_gc`). Every amount lies
in the band of the value it reads as (`level_band`).

`triz_feasibility` then reads each feasibility row of a box that also declares behaviour
(`levels` in its result):

- Only the ports a row names, on carriers with levels, are read. A row is silent on the ports it
  omits: an omitted requirement needs nothing, and a harmful output such as friction heat is
  rarely a row's functionality.
- The matching behaviour rows are those whose values on the row's input ports are the values
  its required amounts read as. The row is consistent when one of them has, on the row's output
  ports, the values its provided amounts read as.
- `no-behavior-row`: no behaviour row has those input values, so the behaviour says the row's
  operating point cannot occur. `value-mismatch`: the matching rows give other output values,
  listed under `declared`.

Inconsistencies are reported, not failed closed: either side may be the one to fix, or the
thresholds. Take `bearing-heat-behavior.json`, add the feasibility rows of
`bearing-heat-feasibility.json`, and give radial-load the levels `unsupported` from 0 and
`supported` from 2500 N. Then `triz_feasibility` reads the shaft's 2500 N requirement and the
bearing's 3000 N as `supported`, consistent with their behaviour, but the housing's cheaper row,
400 N, reads as `unsupported` while the housing's behaviour declares its bore `supported`.
`triz_abstraction` runs the same check across a map (below), and `triz_weakness` turns a
threshold into an acceptable set (see [Weakness ranking](#weakness-ranking)).

The `unbacked-producible-row` lint reads a box's producible rows against its own feasibility
rows the same way, and monotonically, as `triz_feasibility` does: a row reaches an output value
when the amount it provides there reads as that value or above, at inputs where each amount it
requires reads as the producible row's value or below. It reads only the ports the feasibility
rows name.

## Abstraction between models

A detailed model (many boxes, costs, feasibility) and a coarse model (few boxes, declared
behaviour) of the same system say different things, and each tool reads one of them.
`triz_abstraction` checks that the coarse one is an abstraction of the detailed one under a
typed map:

- `boxes`: detailed box → coarse box. Several detailed boxes may share one coarse box, as a
  segment's parts share the box they came from. A detailed box left out is outside the
  abstraction: a restriction (`typed_restrict`).
- `ports`: per mapped box, detailed port → port of its coarse box. Default: the coarse box's port
  with the same id and side. A port with no image is internal.
- `carriers`: detailed carrier → coarse carrier. Default: the coarse carrier with the same id.

A detailed function between two mapped ports is mapped. A function whose ends map into one
coarse box is hidden inside it, unless the coarse box has an image function for it. A function
between two coarse boxes with an unmapped port is forgotten: the coarse model does not see it.
The polarity class is the partition harm loops read: negative (harmful or excessive) or not
(useful or insufficient). Four checks decide the verdict, `abstraction` or `not-an-abstraction`
with the failing checks:

1. **Total.** Every mapped port's carrier has an image, and every mapped function between two
   coarse boxes has an image: a coarse function with the mapped endpoints, the mapped carrier,
   and the same class.
2. **Typed.** Each mapped port lands on a port of the same side whose carrier is its own
   carrier's image, in the same layer (`typed_map`).
3. **Wires.** Every coarse function is the image of a mapped detailed function of its class.
4. **Harm loops.** Every coarse harm loop is the image of a detailed one. Each harmful or
   excessive coarse function on it needs a negative preimage whose object reaches its performer
   along mapped and hidden functions; then the detailed loop maps onto a coarse loop through it
   (`cycle_map`), and the detailed cycle is the witness. This check can
   fail where the other three pass: a segment that puts the friction on a part the preload never
   reaches has no detailed loop through the heat, but the coarse bearing closes one.

The result also lists the functions hidden, forgotten, and left out, harmful and excessive ones
apart; `detailedLoops`, each detailed harm loop as seen from the coarse model (`image`, `hidden`
inside one box, `forgotten`, `outside`, or `broken` by a forgotten function); and
`reachability`: when nothing is forgotten, whatever a mapped box reaches in the detailed model,
its image reaches in the coarse one (`reach_map`). A coarse model that forgets or hides a harm
says nothing about it, and the note names it.

Where a coarse box with behaviour has exactly one detailed preimage with feasibility, its rows
are read through the coarse carriers' levels and checked against the coarse behaviour, as in
[Levels](#levels-numeric-to-qualitative) (`levels`). With several preimages the rows would have
to be composed first, which this check does not do; the box is listed as skipped. Mapping
`bearing-heat-feasibility.json` onto `bearing-heat-behavior.json` box by box, with the radial-load
levels above on the coarse carrier, is an abstraction, and it reports the housing's 400 N row.

The map is checked as data. Whether the coarse boxes' rows are true of their preimages, and
whether forgetting a function is safe, stays with you.

## Flows

A function says that one box acts on another. It does not say that a carrier passes through
boxes one after the other: two valves in a line both act on the water, and neither acts on the
other. A model can declare `flows`. Each is an ordered `path` of box ids with the `carrier` that
moves along it, and optionally the `medium`, the box that stands for what flows when the boxes on
the path act on it rather than pass it on. A box may recur later in a path, which closes a loop,
but may not follow itself. The type check fails closed on an unknown carrier, box, or medium.

`triz_flow` reads each flow. Every item it returns is a structural candidate, not a finding:

- **Steps**: the consecutive pairs, each with the functions of the flow's carrier from one box
  to the next. `declaredOnly` counts the steps no function joins.
- **Where a function acts on the flow**: at its object, when it carries the flow's carrier and
  its object is on the path; or at its performer, when its object is the medium and its
  performer is on the path. The first reading fits boxes that pass the carrier on, such as the
  stages of a request path. The second fits boxes in series that each act on the medium, such as
  valves on the water.
- **Bottleneck candidates**: the performer of a function acting on the flow that is rated
  insufficient, excessive, or harmful: a resistance-like output on the flow, with the position
  where it acts.
- **Accumulation candidates**: a box where the steps of every flow of the carrier converge (at
  least two predecessors, and fewer successors than predecessors), or a last box inside the
  engineered system (role tool or mediator) that no flow of the carrier continues from.
- **Leak candidates**: a function on the carrier from a box on the path to an environment or
  supersystem box off it.
- **Loops**: a box that recurs on the path, with the cycle between two occurrences. Its first
  step and the rest of it form a cycle of the flow's step relation (`edge_on_cycle`). The harm
  loops that share a box with the path are listed too.

Every construction carries flows, so each result still type-checks. A trim closes a flow up over
the trimmed box and reports it; whether the flow can pass without that box is part of the trimming
problem. `segment` fails closed when no part keeps the box's id, since the ports do not say which
part the flow passes, and a rule or `rewrite` refuses to delete a box a flow passes unless the step
restates the flow. `triz_abstraction` matches detailed flows against coarse ones
(`flows.images`, `flows.unbacked`) without changing its verdict, and `triz_nine_windows` reports
`flowsChanged` and each time's flow candidates. What each construction does to a flow is in the
[theory map](../../../docs/theory-map.md#flows-through-the-constructions).

Under the adjacent reading, `merge` accepts a group joined by functions inside it or by steps of
a flow inside it. Boxes on one flow with a box outside the group between them are refused, with
the boxes between them named: merging them would close a loop in the flow. A merge joined by
functions can still close one; `flows.newlyLooped` lists those flows. Every box on the merged
flow is a box of the merged model, and a box outside the group that reached another one outside
it along a flow still reaches it along the merged flow (`flow_merge_typed`, `flow_merge_reach`).

## Principle constructions

A construction is listed here only when the principle's text, looked up in
`data/principles.json` (`triz_principle`), describes a move the kernel can make and check: a
structural one, or for Principle 15 a parametric one. Each row makes the structural part of the principle checkable. That does not show the
principle solves the problem. [All 40 principles](../../../docs/theory-map.md#all-40-principles)
in the theory map gives the class of each one and why.

| Principle | Text (`triz_principle`) | Construction | Checked |
|---|---|---|---|
| 1 Segmentation | "Divide an object into independent parts; make it sectional or modular." | `segment`: a box becomes parts whose ports partition its ports. Each wire follows its port, and each cost dimension goes wholly to one part. | The partition is exact and ids are fresh. The result reports whether the parts are independent, meaning no wire joins two parts, and, for a box that declares behaviour, whether its relation is the product of its projections onto the parts (`behaviourallyIndependent`), and the finest such partition of its ports as a suggestion (`behavior.finest`). For a box with no self-loop, collapsing the parts gives back a model isomorphic to the original. A self-loop instead ends up between parts, or in the collapse's `hidden` list. |
| 2 Taking out | "Separate an interfering part or isolate the only needed part." | `take_out`: split the given ports off into a new box. | Reading `interfering`: the split-off ports touch a harmful or excessive function. Reading `needed`: they carry every useful function, so the remainder is a trimming candidate. |
| 5 Merging | "Bring identical or adjacent operations together in space or time." | `merge`: `collapse` the boxes into one. | Reading `adjacent` (default): functions inside the group, or consecutive positions on a declared flow, join every box; boxes with a box between them on a flow are refused. Reading `identical`: the same role and the same carriers on each side; names and actions are labels and are not compared. Every path maps to a path (`reach_quotient`), and every flow passes the merged box (`flow_merge_typed`, `flow_merge_reach`), but a merge can close loops: harms newly on a harm loop are listed, as are flows newly looped, the hidden internal functions, and flows hidden inside the merged box. |
| 6 Universality | "Make an object perform multiple functions and eliminate other parts." | `trim` with every `absorb` choice on one box. No new operation. | As for `trim`: each re-attached function goes to a typed absorber. The result shows the box performing its own and the absorbed functions. |
| 11 Beforehand cushioning | "Prepare emergency means beforehand to offset low reliability." | `standby`: an unwired box with an output port for each port through which the box performs a useful function on another box. | Harm loops, deliverables, and every existing function are unchanged; only cost is added. Losing the box is modelled as trimming it: afterwards `triz_trim` lists the standby as an absorber of each such function, and `newlyCovered` lists those that had none. |
| 13 The other way round | "Invert the action; make movable parts fixed and fixed parts movable." | `reverse`: u → v becomes v → u with the same id, carrier, and rating. | Needs an output of the carrier on v and an input on u; a named port the box lacks is added (`typed_extend`), and none or several unnamed ones fail closed. The edge set changes by exactly that converse. The returned `undo`, a `rewrite`, gives back the original model, added ports included. |
| 15 Dynamics | "Allow characteristics to change so they are optimal at each stage." | `triz_separate` with `along: "time"`: the parameter as a function of time cells alone. | `dynamizable` only when every stage has an admissible value and no single value meets all stages. A constant that works is reported as `constant-suffices`, not as Principle 15. Values are admissible, not optimised. |
| 16 Partial or excessive action | "If the full action is difficult, do slightly less or slightly more." | `rerate`: a useful function becomes insufficient or excessive; `cost` may set the performer's new cost. | Deliverables are unchanged. Insufficient never creates a harm loop; excessive creates one exactly when the function is on a cycle that had no harmful or excessive function. Without a cost change, `compare_to` reports the concept worse on `defective`. |
| 22 Blessing in disguise | "Use a harmful factor to achieve a positive effect." | `retarget`: the harmful function's source port feeds a useful function at another input of the same carrier. | By default the factor is redirected: one harmful function fewer, one useful one more. With `keep_harm`, the harm stays and the useful function is added. The harm's own object port is refused, since rating it useful there is not using the factor elsewhere. |
| 23 Feedback | "Introduce feedback, or change the magnitude and influence of existing feedback." | `feedback` adds a function; `rerate` with `reading: "feedback"` changes the level of one. | `feedback`: the new function's object already reaches its performer, so it lies on the returned witness cycle (`edge_on_cycle`), reported as a control loop or a harm loop. `rerate`: the function is on a cycle, and the harm loops created and removed are listed. |
| 24 Intermediary | "Use an intermediary carrier or process, temporarily or permanently." | `interpose`: a function u → v becomes u → m → v through a new mediator box. | Both legs keep the carrier, and keep the rating unless it is overridden. Reachability among the original boxes is unchanged. With inherited ratings, harm-loop membership is unchanged too. The mediator may declare behaviour; an identity relation is reported (`behavior.identity`). "Temporarily" is not modelled. |
| 25 Self-service | "Make an object serve or repair itself and use waste resources." | `trim` with a rule-B absorber. No new operation. | As for `trim`; `chosen` reports rule B. |
| 26 Copying, 27 Cheap short-living objects | "Use inexpensive copies instead of an unavailable, expensive, or fragile original." "Replace an expensive durable object with inexpensive short-lived ones." | `cheap_copy`: a box with the same role, action, and ports, and a new cost. | The cost is no higher on any dimension and lower on at least one, so no total rises (`cheaper_part_lowers_cost`). Every function re-attaches with its rating, so the wiring shape is the original's. |

Trimming as a rewrite is the evolution-line move named in
[evolution-trends.md](evolution-trends.md): "the function remains, the component disappears".
`trim` builds that rewrite and checks it. It does not show that a trend applies to the system.
Three other lines are rules, and one is a detector; see below.

Of all 40 principles, 13 are structural, with a `triz_transform` operation: 1, 2, 5, 6, 11, 13,
16, 22, 23, 24, 25, 26, and 27. Seven are parametric, expressible only as a separation
(`triz_separate`) or a behaviour change: 3, 15, 19, 20, 32, 33, and 35. The other 20 are analogy
only: their text names geometry, materials, physics, speed, or the order of events, none of which
the model contains. Time cells are an unordered set, and every verdict ignores names, verbs, and
carrier layers and dimensions, so a move that changes only those cannot be told apart from the
original.

## Rules (double pushout)

A rule is data, defined by [rule.schema.json](../schemas/rule.schema.json). It has three
patterns: L, what must be present; K, what is kept; and R, what is there afterwards. K's
elements appear in L and R with the same ids. Pattern ports are typed by carrier variables. A
match binds the variables used in L; the caller binds those used only in R. A match instantiates
the rule: it binds the carrier variables, takes any role or rating the pattern leaves out from
the matched element, and resolves `like` copies. So a pattern box matches any box that has at
least the pattern's ports.

`triz_rule_apply` applies a rule at a match in steps that each fail closed:

1. The match must be a typed homomorphism.
2. No-identification: two pattern elements with the same image must both be kept.
3. No-dangling: every port of a deleted box must be in L, and every wire on a deleted port must
   be deleted. A declared flow is a hyperedge on boxes that no pattern names, so a deleted box
   may not lie on a flow or be one's medium.
4. Declared rows:
   - A kept box that declares `behavior` or `transition` must keep its ports, because its rows
     name every port once. A rule that adds or deletes one of its ports fails with
     `behaviour:`; restate or remove the rows first.
   - A kept box that declares `feasibility` may gain ports, where its rows provide and need 0,
     but must keep every port its rows name. A rule that deletes one fails with
     `feasibility:`; restate or remove the rows first.
   - A `like` copy copies none of these rows.
5. `distinct`: each listed pair of carrier variables must bind different carriers. It is an
   application condition, not part of the pushout, and it only refuses applications.
6. `forbid`: negative application conditions in the sense of Habel–Pennemann. Each pattern
   extends `left` by id with the same constraints and may add elements; a match is applicable
   only if it extends to no injective occurrence of any one of them over the model. The
   condition is decided by the same bounded search that lists matches (its own step budget);
   an undecided condition refuses the application, like the others. It is checked per match,
   in the listing and in `triz_rule_apply`, so it can name only carrier variables the left
   side binds.
7. The image of L \ K is deleted, and R \ K is glued on under fresh ids.
8. The result must pass the type check of `triz_function_model`.

The result lists in `fieldChanges` every created wire that is `like` a deleted wire on another
carrier, with both carriers' layer and dimension: the same function in another field. It reports
`deliverableKeysChanged` when a deliverable moved to another port or carrier, so `compare_to`
would read it as lost and regained.

The search is bounded. Past the step budget the list is `decided: false`, and past the match
limit it is `complete: false`. Every listed match is verified before it is returned.

## Evolution lines as rules

A line is encoded only where its text in [evolution-trends.md](evolution-trends.md) describes a
move on the wiring. The rule encodes that move and no more, and cites the line; a test checks
that the quoted text is on that line. A line whose text names a diagnosis rather than a move can
be a detector: it reports where the line points in the model and changes nothing.

| Line | Text | Decision |
|---|---|---|
| Transition to supersystem | "mono → bi → poly → system with its supersystem" | Rule `mono-bi`: a second performer of a matched function, with the performer's role, name, action, and cost, and the function's rating. Apply it again for poly. The supersystem step is not encoded. |
| Increasing controllability | "fixed → adjustable → self-adjusting with feedback" | Rule `feedback`: one useful function from the object back to the tool, on a carrier you bind; it adds no sensor or controller box. `triz_transform` `feedback` (Principle 23) adds one between boxes you name. |
| Increasing ideality | "function preserved while parts and cost vanish" | Trimming, already `triz_transform` `trim`. |
| Dynamization | "rigid → jointed → flexible → field" | Not encoded: the wiring does not represent how rigid a component is. |
| Increasing coordination | "parts synchronize rhythm and parameters" | Not encoded: it changes parameters, not structure. |
| Uneven development of subsystems | "one subsystem lags and becomes the limiter" | Detector `uneven-development` (`triz_rule_apply` with `rule_id`), not a rule: a box of the largest harm-loop region that is on a binding feasibility dimension or limits a deliverable. `lagging` with each box's reasons; `none` when feasibility is decided and no box qualifies; `undecided` with no harm loop, or when feasibility is undecided and no box limits a deliverable. |
| Transition to microlevel | "mechanism shrinks toward particle and field interactions" | Not encoded: scale is not in the wiring. |
| Decreasing human involvement | "human does → machine does → system decides" | Not encoded: no role tells a human from a machine. |
| Changing the working field | "mechanical → thermal → chemical → electric → magnetic → electromagnetic" | Rule `working-field`: the matched function re-made on a carrier you bind as `d`, other than the matched one; `fieldChanges` records both carriers' layer and dimension. The order of fields, whether `d` is a field, and whether it delivers the function are not checked. |

The reason for each decision, in full, is in the
[theory map](../../../docs/theory-map.md#evolution-lines-as-rules).

A rule application is a move to evaluate, not evidence that the trend applies.

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

## Limits of each verdict

What each verdict does not say, so a report does not overclaim. The complete list, with the
reasons, is [What is not claimed](../../../docs/theory-map.md#what-is-not-claimed) in the theory
map.

- **Typing and harm loops.** `harmLoops` is exhaustive for the model as written; it cannot find a
  back-reaction the model omits. A loop is a candidate to substantiate, not a finding.
- **Trim screen.** Typed-feasible is necessary, not sufficient: without declared behaviour, a
  carrier match does not show an absorber can do the job. Its new harms count only if declared,
  its added cost only where boxes declare feasibility.
- **Ideality.** A scalar ratio needs explicit `weights` on every cost dimension and `harmful`;
  otherwise costs stay per dimension. `mpv_weights` never fills in a weight.
- **Separation.** `separated` says a piecewise assignment exists, not that a suggested move
  builds it, that it is the best one, or that the cited principle applies. For overlapping
  regions, pairwise compatibility is not enough; `triz_global_separation` decides the whole.
- **Behaviour.** `preserved` holds for the declared rows only, and means equal relations, not an
  acceptable output at every input (`triz_adequacy`). Under `scope: "upstream"` downstream boxes
  are assumed to accept everything; `partialDownstream` is a diagnostic, not a proof.
- **Comparison.** `compare_to` compares the baseline's deliverables only, so a gained one can
  read `preserved`. `box_map` renames boxes; it does not say the parts are the box.
- **Weakest spec.** One or two boxes only. It says what the box must do, not that a physical box
  can, at what cost, or with what new harms. `producible` is declared, not derived, and
  `requiredInfeasible` does not say which row is cheapest to make producible.
- **Constructions.** A split or a suggested partition holds for the declared rows; an undeclared
  row can couple ports it separates. Constructions check structure only; an identity mediator's
  cost, delay, and harms are not modelled.
- **Weakness.** Holds for the declared values and the given `acceptable`; it does not check that
  a concept resolves the contradiction. A prior needs evidence, only breaks ties, and is not
  certified.
- **Dynamics.** Finite and discrete. `unreachable` holds for the rows and initial states as
  declared, and a `reachable` trace is a mechanism to substantiate. A `*-within-horizon` verdict
  says nothing past the horizon; read `unbounded` for that, which is `undecided` past the cap and
  absent under `inputs`. `trapped` and `recurrent`
  describe the declared state graph, not unbounded growth or how often a run returns.
- **Steady states.** Behaviour rows are never read as transitions, and nothing is claimed about
  convergence or which steady state the system reaches.
- **Feasibility.** Holds for the rows as declared, under a monotone reading. Losses and
  conservation must be in the rows. Shared levels take the max unless the carrier is declared
  `extensive`, where one output's demands add up; a mislabelled carrier gives the wrong sum, and
  a merge into an extensive input must be modelled as a box.
- **Levels.** They read amounts into values; they do not say the values mean what the behaviour
  rows assume.
- **Abstraction.** A verdict about the two models and the map as data. That a detailed loop is
  the same mechanism is your claim, and structural abstraction does not transfer behaviour.
- **Flows.** Declared, not inferred. A bottleneck or accumulation candidate measures nothing;
  rates, capacities, and delays are not modelled outside `triz_queue`'s declared slots.
- **Rewrites.** Double pushout is claimed for `triz_rule_apply` only. Failing `triz_rule_set`'s
  measure does not prove nontermination, and two occurrences that commute are not confluence.
- **Uneven development.** "Largest" counts boxes, not effect, and the lag is not measured.
- **Rules, lines, principles.** An applied rule or construction is a move to evaluate, not
  evidence that the trend or the principle applies.
- **9 windows.** Transitions are not inferred, the supersystem collapse is not checked against
  them, and nothing is claimed to be a fibration.
- **Label-blindness.** It shows the kernel ignores domain meaning, not that a solution transfers
  between domains. Isomorphic wiring can still get different behaviour, feasibility, dynamics,
  and flow verdicts. Tied witnesses (harm-loop cycles, absorber order, dynamics traces) follow
  declaration order: renaming that keeps every list's order shows the same witnesses, while
  reordering the boxes, or a symmetric model, can show another, never another verdict.
- **Certificates.** They prove the listed statements for the encoded scope and declared rows,
  within a cap on table reads; not the encoder, not the evaluator, not physical truth.
- **Trimming.** It is not framed as a Kan extension: a decided trim depends on the absorber
  chosen.
