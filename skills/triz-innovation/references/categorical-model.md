# Categorical function models

The finite assurance extensions, their exact implemented scope, and examples of the new APIs are
summarized in [categorical-assurance.md](../../../docs/categorical-assurance.md). Deferred work,
acceptance criteria and adopted suggestions are recorded separately in
[categorical-future-plan.md](../../../docs/categorical-future-plan.md). Literature is collected in
[theory/REFERENCES.md](../../../theory/REFERENCES.md).

`triz_behavior` defaults to `scope: "upstream"` for compatibility; `scope: "whole"` composes every
box constraint. Use `triz_adequacy` to require nonempty acceptable outputs at every operating
input, and `triz_implementations` to require one implementation to meet behavior, harms and budget
together. A relation comparison alone does not establish either claim.

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

## What each piece means

| TRIZ artifact | In the model | Check | Lean statement (`theory/`) |
|---|---|---|---|
| Component, supersystem element | box with `role` and typed ports | — | — |
| Flow (substance, energy, data, money) | carrier with `layer` and `dimension` | — | — |
| Function, rated useful (normal / insufficient / excessive) or harmful | wire from an output port to an input port, one carrier, one `polarity` | `triz_function_model`: endpoints exist, out→in, carriers agree | — |
| Back-reaction, vicious circle | a cycle through a harmful or excessive function | strongly connected regions with one witness cycle per such function | `edge_on_cycle` |
| Components in series along a flow; flow analysis | `flows`: an ordered path of the boxes a carrier passes through, optionally with the `medium` box that stands for what flows | `triz_flow`: bottleneck, accumulation, and leak candidates, loops; `merge` treats boxes consecutive on a flow as adjacent | `edge_on_cycle` (loops), `flow_merge_typed`, `flow_merge_reach`; definitions `flowStep`, `mergedStep`, `mergeInto` |
| Trimming rules A/B/C | delete the trimmed boxes; re-attach each function they performed on a remaining box to a typed absorber | `triz_trim`: carrier screen; `triz_transform` `trim` applies it | `typed_reroute` |
| Declared behaviour, steady state | carrier `values` and box `behavior` rows: each box a finite relation; the external relation from boundary inputs to deliverables, with feedback by the relational trace | `triz_behavior`; with `compare_to` (and `box_map`), decides whether a concept preserves that relation; `trim` is shorthand for the model's own trim | `Relation.comp_assoc` (Mathlib); sanity lemmas, never cited: `relation_comp_mono`, `relTrace_mono`, `relTrace_swap`, `loopStates_id`, `relTrace_not_loop`; the semantics the evaluator computes, never cited (`theory/Semantics.lean`): `steadyStates`, `external`, `external_glueAlong`, `external_seq`, `external_par`, `external_feedbackAlong`, `external_feedback`, `external_mono`, `semantics`; the upstream scope against the whole, never cited: `sub`, `restrict_mem_steadyStates_sub`, `external_sub_of_external`, `external_sub_iff_of_extends`, `external_sub_univ`, `extends_of_accepts` |
| What an absorber or other unknown box must do | the weakest box specification (residual in Rel): every row of the one box without behaviour whose composite stays inside a target relation; for two such boxes, the maximal pairs of relations that stay inside (formal concepts of the safe row pairs) and cover it | `triz_behavior` with `weakest_spec` and `compare_to` or `trim`: spec, impossible, or undecided | `le_residual_iff`, `covers_iff_exists_eq`, `not_covers_iff`, `map_empty`; with producible rows, `covers_feasible_iff`, `not_covers_feasible_iff`, `required_row_of_eq`; for two boxes, `safe_iff_le_concept`, `concept_maximal`, `exists_eq₂_iff`; for two boxes with producible rows, `safe_feasible_iff`, `safe_feasible_iff_le_concept`, `concept_feasible_maximal`, `exists_eq₂_feasible_iff`; never cited: `relation_comp_iSup_left`, `relation_comp_iSup_right`, `relTrace_iSup`, `gc_residual`, `map_residual_subset`, `subset_residual_of_eq`; for two boxes, never cited: `PreservesUnions₂.mono`, `le_safeRows_iff`, `concept_safe`, `PreservesUnions₂.cut`, `safeRows_cut` |
| Weakness of a concept ([weakness.md](weakness.md)) | the situations it admits: boundary-input valuations with a steady state and only acceptable deliverable outputs, ordered by inclusion | `triz_weakness` | `incomparable_of_witnesses`, `card_lt_of_strictly_weaker`; definitions `admits`, `AtLeastAsWeak`; never cited: `admits_incomparable`, `admits_bot`, `admits_mono_ok`, `atLeastAsWeak_refl`, `atLeastAsWeak_trans` |
| Dynamics: escalation, invariance, separation in time | box `state`, `initial`, and `transition` rows: a nondeterministic Mealy machine, which is a lens with a residual as its state; the synchronous composite's runs up to a horizon | `triz_dynamics`: escalation into an unsafe set (shortest trace), invariance of a safe set, separation in time along one run | `reachIn_iff_trace`, `reachWithin_iff_trace`, `reach_of_trace`, `reachIn_of_trace`, `reachWithin_saturated`, `mealyStep_mono`, `reachIn_mono`, `reachWithin_mono` |
| Loop behaviour: bistable, runaway, oscillating | closed strongly connected components of the reachable graph of declared states | `triz_dynamics` `loops`: bistable, trapped (inside the unsafe set) or recurrent (meets it, and holds a safe configuration), each with a shortest trace, oscillating (period and one cycle) | `fixed_on_cycle`, `closed_reachIn`, `trapped_reachIn`, `recurrent_reach`, `return_ge_two` |
| Absorber's added resources, co-design | box `feasibility` rows: each box a monotone feasibility relation; the composite by Kleene's ascent to the least fixpoint (Censi 2015) | `triz_feasibility`; with `trim`, decides whether the remaining boxes provide what the trim leaves them within budget | `feasibility_comp`, `feasibility_par`, `feasibility_trace`, `kleene_lfp`, `kleeneStep_upperClosure`, `codesign_lfp` |
| Numeric amount read as a qualitative value | carrier `levels`: a threshold per value, from 0, increasing; an amount reads as the last value whose threshold it reaches | checkModel (fail closed); `triz_feasibility` `levels`: each feasibility row against the box's behaviour rows; `triz_abstraction` across the map; `triz_weakness` `acceptable` by `at_least` or `below` | `level_monotone`, `level_gc`, `level_band` |
| A detailed and a coarse model of one system | an abstraction map: detailed box → coarse box (many to one), port → port per box, carrier → carrier | `triz_abstraction`: total, typed, every coarse function an image of its class, every coarse harm loop the image of a detailed one | `typed_map`, `reach_map`, `cycle_map`; definition `Wiring.map` |
| Ideality comparison | componentwise order on cost vectors | profile per dimension; baseline vs concept with `compare_to`; over the main parameters of value only with `mpv_weights`; `triz_trim`'s `costRelief` (`costBound`) | `trim_lowers_cost`, `pareto_incomparable`, `pareto_not_total` |
| Physical contradiction, separation | gluing a parameter assignment over a finite base | `triz_separate`, or embedded `contradictions` | `exists_section_iff`, `glue_of_disjoint_regions`, `no_section_of_overlap`, `separated_iff_axis`; sanity lemma, never cited: `separation_on_condition` |
| Same model in another domain | structural isomorphism: a bijection preserving roles, port sides, shared carriers, wiring, ratings, and costs | `triz_function_model` with `compare_to` (`comparison.isomorphism`); every wiring verdict is label-blind (property tests) | `typed_rename`, `transGen_equiv` |
| Drawing the model | Graphviz DOT (ports drawn), a Mermaid flowchart (ports named on edges), an SVG picture laid out by elkjs (ports drawn), or an open hypergraph: ports as carrier-typed vertices, boxes and functions as hyperedges, unwired ports as the interface | `triz_export`, golden outputs, lossless round trip | — |
| Certificate of one run | the model as finite Lean tables; each verdict a theorem about them | `triz_export` format `lean`, `triz_separate`, `triz_dynamics`, and `triz_weakness` with `certificate`; checked by Lean (`scripts/certify.mjs`) | `Wiring.Typed`, `Wiring.Acts`, `edge_on_cycle`, `exists_section_iff`, `glue_of_disjoint_regions`, `no_section_of_overlap`, `separated_iff_axis`; row tables `Sync.Step`, `Rows.relation` with `reach_of_trace`, `AtLeastAsWeak`, `card_lt_of_strictly_weaker` |
| Model transformation | a rewrite at an occurrence named by id: delete, check no-dangling, glue, type-check | `triz_transform` | `typed_delete`, `typed_glue`, `typed_reroute`, `typed_retarget`, `typed_reverse`, `typed_extend` |
| Reusable move, evolution-line step | a rule L ← K → R applied by double pushout at a match found by search | `triz_rule_apply`: matches, no-identification and no-dangling conditions, fresh ids, typed result | `typed_overlay`, `typed_dpo` |
| A subsystem that lags (uneven development) | a box of the largest harm-loop region that is on a binding feasibility dimension or limits a deliverable | `triz_rule_apply` `uneven-development`: lagging, none, or undecided | `edge_on_cycle`; the feasibility verdict's basis |
| Behaviour through a construction | segment: the box's relation splits over the parts iff it is the product of its projections, iff it is a rectangle (rows (a, b) and (c, d) give the row (a, d)); interpose: an identity mediator composes away | `triz_transform` segment and take_out (`behaviourallyIndependent`, coupling witnesses), interpose (`behavior.identity`) | `eq_projections_prod_iff_rectangle`, `eq_projections_prod_iff`, `eq_projections_pi_iff`, `Relation.comp_eq` (Mathlib) |
| Which ports of a box are independent | the finest partition of a box's ports over which its declared relation is the product of its block projections: unique, and a partition splits iff each part is a union of its blocks | `triz_transform` segment and take_out (`behavior.finest`), `triz_behavior` (`factorisations`) | `IsFinest.addPort`, `factors_split_iff`, `IsFinest.factors_iff`; never cited: `Factors.inf`, `Factors.mono`, `Factors.onPorts`, `exists_isFinest`, `IsFinest.unique`, `IsFinest.rel_iff`, `factors_bot_iff`, `factors_empty`, `isFinest_onPorts_empty` |
| System operator (9 windows), level axis | restriction to a subsystem, a presheaf on the poset of box sets; collapse of the system into one box | `triz_nine_windows` | `typed_restrict`; `supportedOn`, `typedOn`; used by those, never cited: `restrict_restrict`, `restrict_of_subset` |
| System operator, time axis | a transformation sequence from one time to the next, as one net rewrite step, and its part inside the subsystem; with declared rows, the verdicts per time and how they change | `triz_nine_windows` with `transitions`: each step type-checks and the sequence reaches the later snapshot; `system.verdicts` and `changes[].verdicts` | `restrict_rewrite`, `restrict_rewrite_of_inside`, `boundary_rewrite`; `restrictionGrid` |

Ratings follow the MATRIZ function definition. A function is useful or harmful. Only useful
functions have a performance level: normal, insufficient, or excessive. A back-reaction is
modelled as an ordinary wire in the reverse direction, so no separate "lens" flag is needed.

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
     component, with supersystem resources last);
   - one trimming problem per absorber of a useful function, and one level problem
     (`levelProblems`) per excessive or insufficient function: the object needs that flow at the
     right level, so no absorber is asked to take the defect over as it is. If no level of the
     flow is useful, the function is harmful and needs no absorber.

   Treat every trimming problem as a new problem to solve. Still generate at least three
   mechanisms (SKILL.md). Model the chosen concept and compare it with `compare_to`. A concept
   that drops a deliverable loses a function, whatever it saves.

   When the boxes that matter declare behaviour, call `triz_behavior` with the same `trim` and
   `absorb`. It decides whether the trim preserves the input→deliverable relation (see
   [Declared behaviour](#declared-behaviour)). A `preserved` verdict holds for the relations as
   declared; substantiate each of them, the absorber's first.

   When every box that matters declares behaviour except the absorber, add `weakest_spec`. The
   result is the absorber's weakest specification: what it must do for the trim to preserve the
   relation, and nothing more. With an absorber and one new mediator both unknown, it gives the
   maximal pairs of relations for the two instead. Or it says that no behaviour of the absorber can (see
   [Weakest box specification](#weakest-box-specification)). The specification is the trimming
   problem stated as a relation; it is still a problem to solve.

   When the boxes that matter declare feasibility, call `triz_feasibility` with the same `trim`
   and `absorb`. It decides whether the remaining boxes provide what the trim leaves them within
   budget, and reports each absorber's added resources (see
   [Co-design feasibility](#co-design-feasibility)).
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
   `triz_rule_apply` (see Rules below). Without `match` it lists the occurrences. Pass one back
   as `match` to apply it. An occurrence marked not applicable names the condition it breaks.

   A transformation is a move to evaluate, not a result. Compare the new model with
   `triz_function_model` and `compare_to`. Segmenting a product box, taking a part out of one, or
   copying one under a new id moves its deliverables to new box ids, and the result reports
   `deliverableKeysChanged`. Pass the returned `boxMap` as `box_map` so the comparison renames
   the parts back before matching deliverables. Without it, the moved deliverables read as lost
   and regained. `merge` renames the merged ports as well, so no box map recovers them. When the boxes
   that matter declare behaviour, decide the result with `triz_behavior` and `compare_to` (the
   same `box_map`); see [Behaviour through the constructions](#behaviour-through-the-constructions).

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
7. **Share.** Use `triz_export` for a DOT drawing, a Mermaid flowchart to paste into markdown, an
   SVG picture (format `svg`, on the stdio server), or the hypergraph form. With `compare_to`, `triz_function_model` also reports whether the two
   models have the same wiring shape. Use format `lean` for a certificate that Lean can check (see Certificates); `triz_separate`,
   `triz_dynamics`, and `triz_weakness` return one with `certificate: true`.

Each verdict cites in `basis` the theorem in `theory/CategoricalTriz.lean` its reasoning uses,
as in the last column above, or a Mathlib lemma a proof in that file uses. A test checks that
every cited name is a theorem in that file or such a lemma, which `lake build` then resolves.
That theorem proves the abstract fact. Tests check the TypeScript against it; nothing is
extracted from Lean. Typing, harm-loop witness, separation, reachable-escalation, and strict
weakness verdicts can also be certified per instance (see Certificates). A basis never means the TRIZ reading of a verdict is proved. A
verdict that needs no theorem, such as a compatible pair, cites none. A theorem is cited only
where its statement is exactly what the verdict uses. The table marks the others as never cited.
Most are semantic sanity lemmas: they pin the semantics down on the tests' own examples
(`loopStates_id`, `relTrace_not_loop`, `relTrace_swap`), or state a fact no check computes
(`relation_comp_mono` and `relTrace_mono`, since a trim does not widen one relation;
`separation_on_condition`, a Boolean split the condition axis does not use).
`restrict_restrict` and `restrict_of_subset` are the presheaf's functor laws, used to build
`supportedOn`; no view zooms inside a zoom, so no verdict uses them. The theorems of
`theory/Semantics.lean` define the semantics `triz_behavior` computes and prove it compositional
(see [Compositional semantics](#compositional-semantics)). No verdict cites them: a verdict is
about one model, and the evaluator is checked against that semantics by a brute-force cross-check,
not derived from it. `relation_comp_iSup_left`,
`relation_comp_iSup_right`, and `relTrace_iSup` say why a context built from composition and the
trace preserves unions, the hypothesis of the residual lemmas. `holeContext_preservesUnions` in
`theory/Semantics.lean` proves it for the semantics itself. That the kernel's join computes that
semantics is tested, not proved, so no verdict cites them. `gc_residual`, `map_residual_subset`,
`subset_residual_of_eq`, `admits_bot`, `admits_mono_ok`, and `AtLeastAsWeak`'s reflexivity and
transitivity serve the cited lemmas or the docs. So do the two-box helpers
`PreservesUnions₂.mono`, `le_safeRows_iff`, and `concept_safe`, which the cited two-box lemmas
use. The factorisation lemmas behind `IsFinest.addPort` (`Factors.inf`, `Factors.mono`,
`Factors.onPorts`, `exists_isFinest`, `isFinest_onPorts_empty`) serve its proof, and
`IsFinest.unique`, `IsFinest.rel_iff`, `factors_bot_iff`, and `factors_empty` the docs. The link
between dynamics and behaviour, `relTrace_mealyRel_iff` and `relTrace_mealyRel_fixed`, describes a
computation the kernel does not make: it reads no transition row as behaviour.

A test keeps all of these out of the citable list.

## Feedback for agents

Every `ok: false` result keeps `errors: string[]` and adds `issues`, one per error and in the
same order:

```json
{ "code": "carrier-mismatch", "path": "$.model.wires[0].carrier",
  "message": "wire 'w-drive' from: carrier 'heat' does not match port 'motor.shaft-out' carrier 'torque'",
  "hint": "A wire carries its ports' carrier: set the wire's carrier to 'torque', or attach it to a port of carrier 'heat'." }
```

- `code` is a stable kebab-case id from the table below. Branch on it, not on the message.
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
changes a verdict:

- `defect-on-loss-carrier`: an excessive or insufficient function on a loss-like flow (a
  pressure drop, leakage, noise, wear). Rating it excessive says some level of the flow is
  wanted from the performer; if no level of it is useful, rate it harmful.
- `trim-level-functions`: the trim removes excessive or insufficient functions, posed under
  `levelProblems`.
- `product-without-deliverable`: a product box no non-harmful function acts on.
- `unused-carrier` (info): a carrier that types nothing.
- `unwired-port` (info): a port with no wire. An unwired input is a boundary input, the
  operating condition `triz_behavior` and `triz_dynamics` read; an unwired output is capacity
  `triz_trim` may offer as an absorber.

The loss lexicon is a heuristic over carrier ids, dimensions, and verbs; a warning is a prompt
to check the rating, not a finding.

## Issue and lint codes

| Code | Raised by | Meaning |
|---|---|---|
| `duplicate-id` | every model check; `triz_separate`, `triz_dynamics`, `triz_weakness`, `triz_transform` rewrite, `triz_rule_apply` ids | Two elements of one kind share an id (carrier, box, wire, port, state, value, demand, concept) |
| `unknown-carrier` | every model check; `triz_rule_apply`, `triz_abstraction` map | A port or wire names a carrier the model does not declare |
| `unknown-box` | every model check; box-set arguments (`trim`, `subsystem`, targets, transformations), `triz_abstraction` map | An id names no box of the model |
| `unknown-port` | every model check; `triz_transform`, `triz_dynamics`, `triz_rule_apply`, `triz_abstraction` map | A box has no port with that id |
| `unknown-wire` | `triz_transform`, `triz_rule_apply` | An id names no wire of the model |
| `wrong-port-side` | every model check; `triz_transform` reverse | A wire leaves an input port or enters an output port |
| `carrier-mismatch` | every model check; `triz_transform` reverse | A wire's carrier differs from a port it is attached to |
| `incomplete-state-machine` | every model check | A box declares state, transition, or initial without the others it needs |
| `behavior-and-transition` | every model check | A box declares both behavior and transition |
| `undeclared-state` | every model check; `triz_dynamics` | A state is not among the box's declared states |
| `no-declared-values` | every model check; `triz_behavior`, `triz_dynamics`, `triz_transform` interpose | Rows or a check need a carrier's values, and the carrier declares none |
| `row-unknown-port` | every model check | A behavior, transition, or feasibility row names a port the box does not have |
| `row-missing-value` | every model check | A behavior or transition row gives no value for one of the box's ports |
| `undeclared-value` | every model check; `triz_dynamics`, `triz_weakness` | A value is not among the carrier's declared values |
| `dominated-row` | every model check | A feasibility row repeats or is dominated by another row of the box |
| `producible-with-rows` | every model check | A box declares producible together with behavior or transition |
| `invalid-levels` | every model check | A carrier's levels do not start at 0 or do not strictly increase |
| `flow-repeats-box` | every model check | A flow path lists a box directly after itself |
| `listed-twice` | `triz_trim`, `trim` arguments, `triz_transform`, `triz_dynamics` inputs, `triz_weakness` acceptable | An id appears twice in a set argument |
| `empty-set` | `trimCandidates`, nine-windows views, `triz_abstraction` map, mpv_weights | A set argument names nothing |
| `too-few-members` | `triz_transform` segment and merge, `triz_dynamics` separation | A construction needs at least two parts, boxes, or demands |
| `unknown-cost-dimension` | `triz_transform` segment and take_out, `triz_function_model` mpv_weights | A cost dimension is not one the box declares |
| `cap-exceeded` | `triz_separate`, `triz_behavior`, `triz_weakness`, `triz_dynamics`, `triz_feasibility`, certificates | A search or encoding passed its cap |
| `internal-error` | any tool | An invariant of the kernel failed; the input is not at fault |
| `format-unavailable` | `triz_export` format `svg` | The export format needs a layout engine this server does not have |
| `box-map-without-compare-to` | `triz_function_model`, `triz_behavior` | box_map was passed without compare_to |
| `absorb-without-trim` | `triz_behavior`, `triz_feasibility` | absorb was passed without trim |
| `trim-with-compare-to` | `triz_behavior` | trim and compare_to were passed together |
| `weakest-spec-without-target` | `triz_behavior` | weakest_spec was passed without compare_to or trim |
| `rule-or-rule-id` | `triz_rule_apply` | Neither or both of rule and rule_id were passed |
| `unknown-rule-id` | `triz_rule_apply` | rule_id names no built-in rule or detector |
| `detector-takes-model-only` | `triz_rule_apply` uneven-development | A detector rule_id was passed with at, match, carriers, ids, limit, or max_steps |
| `at-and-match` | `triz_rule_apply` | at and match were passed together |
| `apply-args-without-match` | `triz_rule_apply` | carriers or ids were passed while only listing matches |
| `listing-entry-as-match` | `triz_rule_apply` | A whole matches[i] entry was passed as match |
| `mpv-weights-without-compare-to` | `triz_function_model` | mpv_weights was passed without compare_to |
| `invalid-weight` | `triz_function_model` mpv_weights | An MPV weight is not positive |
| `undeclared-cell` | `triz_separate`, embedded contradictions | A demand names a cell the axis does not declare |
| `empty-axis` | `triz_separate` along | The axis to index by has no cells |
| `part-without-ports` | `triz_transform` segment | A segment part lists no ports |
| `port-assigned-twice` | `triz_transform` segment | A port is given to two parts |
| `port-unassigned` | `triz_transform` segment | A port of the segmented box is given to no part |
| `unknown-part` | `triz_transform` segment | cost_to names a part that is not listed |
| `take-out-reading` | `triz_transform` take_out | The taken ports do not fit the take_out reading |
| `not-adjacent` | `triz_transform` merge | Boxes to merge are not joined by functions inside the group or by consecutive positions on a flow |
| `not-identical` | `triz_transform` merge | Boxes to merge as identical differ in role or port carriers |
| `role-ambiguous` | `triz_transform` merge | The merged boxes have different roles and into.role is missing |
| `wrong-rating` | `triz_transform` rerate, retarget | The function's rating does not fit the operation |
| `already-rated` | `triz_transform` rerate | The function already has the requested rating |
| `not-on-cycle` | `triz_transform` rerate, feedback | The function lies on, or closes, no loop |
| `own-object-port` | `triz_transform` retarget | retarget points the harm at its own object port |
| `self-loop` | `triz_transform` reverse | The function acts on its own performer |
| `ambiguous-port` | `triz_transform` reverse | Several ports of the carrier fit; one must be named |
| `missing-port` | `triz_transform` reverse | No port of the carrier fits; one must be named |
| `declared-rows-block-change` | `triz_transform` reverse, `triz_rule_apply` | A box's declared rows would not name a port the change adds or deletes |
| `nothing-to-back-up` | `triz_transform` standby | The box performs no useful function on another box |
| `not-cheaper` | `triz_transform` cheap_copy | The copy is not cheaper than the box |
| `dangling-wire` | `triz_transform` rewrite, `triz_rule_apply` | A kept wire would touch a deleted box or port |
| `dangling-flow` | `triz_transform` rewrite, `triz_rule_apply` | A kept flow would pass a deleted box, or name it as its medium |
| `unknown-flow` | `triz_transform` rewrite | An id names no flow of the model |
| `flow-on-split-box` | `triz_transform` segment | Segmentation would leave a flow on a box that no part keeps |
| `id-not-fresh` | `triz_transform`, `triz_rule_apply` ids | A new element's id is already taken |
| `ill-typed-result` | `triz_transform` rewrite, `triz_rule_apply` | The step would produce a model that does not type-check |
| `trim-blocked` | `trim` in `triz_transform`, `triz_behavior`, `triz_feasibility` | A function of a trimmed box has no typed absorber |
| `not-an-absorbed-function` | `absorb` | absorb names a wire that is not a function the trimmed boxes perform on a remaining box |
| `not-a-typed-absorber` | `absorb` | absorb names a port that is not an output of the function's carrier on a remaining box |
| `rule-ill-typed` | `triz_rule_apply` | A rule pattern does not type-check, or a carrier variable is declared twice or never used |
| `rule-malformed` | `triz_rule_apply` | A rule's interface, created elements, or like references are inconsistent |
| `not-a-rule-element` | `triz_rule_apply` | A match, at, or ids key names nothing the rule has there |
| `match-incomplete` | `triz_rule_apply` | A left-side element is not mapped by the match |
| `match-not-homomorphic` | `triz_rule_apply` | The match does not preserve roles, sides, carriers, ratings, or incidences |
| `match-identifies` | `triz_rule_apply` | Two left-side elements match one model element and one would be deleted |
| `unbound-carrier-variable` | `triz_rule_apply` | A carrier variable used only on the right side is not bound |
| `not-right-only-variable` | `triz_rule_apply` | carriers binds a variable that is not used only on the right side |
| `distinct-carriers` | `triz_rule_apply` | Carrier variables the rule declares distinct bind the same carrier |
| `forbid-violated` | `triz_rule_apply` | A rule's `forbid` condition holds: the match extends to an occurrence of it, or the check could not be decided within its budget |
| `invalid-argument` | finite analysis APIs | An argument or cross-reference is invalid for the requested finite check |
| `prior-malformed` | `triz_weakness` joint_prior | A joint situation prior (a weight per complete situation) is invalid, duplicated, or incomplete |
| `required-input-malformed` | `triz_adequacy` | A required operating situation is invalid or duplicated |
| `no-deliverables` | `triz_behavior`, `triz_weakness` | No product box receives a non-harmful function |
| `box-map-unknown-box` | `triz_function_model`, `triz_behavior` | box_map names a box the concept or baseline does not have |
| `box-map-ambiguous` | `triz_behavior` | box_map lands two concept input ports on one baseline port |
| `box-map-port-mismatch` | `triz_behavior` | box_map maps a box to one without the same input port and carrier |
| `input-domain-mismatch` | `triz_behavior`, `triz_weakness` | An input read by several models ranges over different values |
| `nothing-to-specify` | `triz_behavior` weakest_spec | weakest_spec found no box without behaviour to specify |
| `deliverables-differ` | `triz_weakness` | The concepts deliver different ports |
| `acceptable-not-deliverable` | `triz_weakness` | acceptable names a port that is not a deliverable |
| `acceptable-missing` | `triz_weakness` | A deliverable has no acceptable values |
| `acceptable-entry-malformed` | `triz_weakness`, `triz_nine_windows` acceptable | An acceptable entry names neither or both of a port and a carrier, or of values and a threshold |
| `invalid-threshold` | `triz_weakness`, `triz_nine_windows` acceptable | A threshold cannot be read through the carrier's levels, or reads as no value |
| `levels-differ` | `triz_weakness`, `triz_nine_windows` acceptable | A threshold reads as different values in different concepts |
| `invalid-prior` | `triz_weakness` priors | A prior is malformed: names neither or both of a port and a carrier, an input that is not a situation input, an undeclared value, a duplicate, or a weight that is not a nonnegative number; or priors and joint_prior are both given |
| `unmapped-box` | `triz_abstraction` | map.ports names a box that map.boxes does not map |
| `no-state` | `triz_dynamics` | A target or initial names a box that declares no state |
| `uninitialised-state` | `triz_dynamics` | A stateful box has no initial states |
| `not-boundary-input` | `triz_dynamics` inputs | inputs names a port that is not an unwired input port |
| `window-invalid` | `triz_dynamics` separation | A separation window is inverted or ends after the horizon |
| `windows-overlap` | `triz_dynamics` separation | Two separation windows overlap |
| `horizon-inputs-mismatch` | `triz_dynamics` | inputs has fewer entries than the horizon needs |
| `horizon-out-of-range` | `triz_dynamics` | The horizon is not an integer from 0 to the maximum |
| `nothing-to-explore` | `triz_dynamics` | No box declares transition and no target names a box |
| `no-product` | `triz_feasibility` | The model has no product box |
| `unsupplied-requirement` | `triz_feasibility` | A feasibility row requires a level at an input no non-harmful function feeds |
| `ambiguous-port-name` | `triz_nine_windows`, `triz_transform` merge | Collapsing gives two kept ports the same name |
| `no-earlier-snapshot` | `triz_nine_windows` | A transition starts from a time with no snapshot |
| `snapshot-not-reached` | `triz_nine_windows` | A transition's result differs from the snapshot it must reach |
| `invalid-namespace` | certificates (library) | The certificate namespace is not a usable Lean identifier |
| `certificate-needs-unsafe` | `triz_dynamics` `certificate` | A dynamics certificate was asked for without an unsafe or safe target |
| `certificate-input-sequence` | `triz_dynamics` `certificate` | A dynamics certificate was asked for runs under an input sequence, which it does not encode |
| `not-certifiable` | `triz_dynamics`, `triz_weakness` `certificate` | The verdict has no certificate: an escalation that is not reachable or blocks, an undecided ranking, or no strictly ordered pair |
| `defect-on-loss-carrier` | lint: `triz_function_model`, `triz_trim`, `triz_behavior` | An excessive or insufficient function on a loss-like flow (pressure drop, leakage, noise, …) |
| `trim-level-functions` | lint: `triz_trim` | The trim removes excessive or insufficient functions, listed under levelProblems |
| `product-without-deliverable` | lint: `triz_function_model`, `triz_trim`, `triz_behavior` | A product box receives no non-harmful function |
| `unused-carrier` | lint (info) | A carrier types no port and no wire |
| `unwired-port` | lint (info) | A port has no wire |

## Certificates

A generated certificate contains finite source tables, precisely stated verdicts, and a manifest.
Generation is distinct from successful Lean checking. The manifest binds the complete authoritative
request and records scope, source SHA256, schema/generator/theory versions and toolchain pins.

| Verdict | What the certificate proves |
|---|---|
| `checkModel` ok | Every encoded function has endpoints of its carrier on the correct sides |
| A harm-loop witness | The selected negative function lies on the listed closed path; completeness is not certified |
| Separation | The finite compatibility, separation, conflict and gluing statements listed in `certifies` |
| Reachable dynamics escalation | An initial admitted trace reaches the unsafe target within its length |
| Supported state-only negative dynamics | An invariant contains initial states, is closed under `Sync.Step`, and excludes unsafe states or lies in the safe set |
| Saturated unreachable port target | An invariant excludes every admitted unsafe configuration; blocked-state port uncertainty is outside this theorem |
| Weakness strict order, equality or incomparability | The actual composed row relations have the stated admission inclusions or distinguishing admitted/rejected situations |
| `triz_behavior` comparison | The aligned finite relations are equal and nonempty, or an input/output pair belongs to just one of them |

`triz_export` format `lean`, `triz_separate`, `triz_behavior`, `triz_dynamics`, and `triz_weakness`
with `certificate: true` return supported certificates. Unsupported cases return a reason, never
a certificate for a different claim. Behavior certificates support declared `box_map`, inputs read
by only one model, and concept-only gained deliverables outside the baseline interface. Residual
specifications and lost deliverables are not certified. Weakness prior masses are not certified.
Negative dynamics require no input schedule and checked closure: state-only certificates exclude
unsafe states regardless of admitted valuations; saturated port-target certificates exclude only
admitted unsafe configurations. Bounded-only negatives, safe port-invariance claims, separation and loop
classes remain unsupported. A combined request can return only the supported escalation proof;
`certifies` lists exactly which claims were proved. Blocked-state port uncertainty remains explicit.

The `Rows` encoding says each box admits its port valuation and every wire equates its ends.
Weakness admission requires a nonempty output set and every output acceptable, so a favorable
output alone proves nothing universal. Behavior inequality includes membership and nonmembership
at one pair; it does not certify every separately reported containment direction. Negative dynamics
invariants contain all port valuations of each selected machine state, because `Sync.Step` constrains
successor machine states but not successor consistency. A BFS node list is not automatically closed.

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

The request records `kind` (`model`, `separation`, `behavior`, `weakness`, or `dynamics`) and all of
that generator's source options. The checker independently compares normalized source data with
literal finite tables and regenerates to detect staleness before Lean checking. This detects input
mismatches; it is not a proof that the encoder or optimized evaluator is correct on all inputs.
See [the request formats](../../../docs/categorical-assurance.md#certificates-and-source-correspondence).

The strict generated-file grammar, pinned theorem statements, no-warning/no-`sorry` requirement,
and axiom whitelist (`propext`, `Classical.choice`, `Quot.sound`) still apply. `--tamper` verifies
that relevant negated or altered copies fail. Source ids are escaped data, not Lean commands.
Per-instance work caps remain explicit. A theorem holds for the encoded scope and declared rows;
physical truth is not established by proof checking.

Local pinned checks are the merge evidence.

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
- **Upstream only.** Only the boxes that can reach a deliverable are composed, and each of them
  must declare behaviour. Every other box is assumed to accept whatever it receives. The output
  lists downstream boxes whose declared relation is partial (`partialDownstream`): in the full
  relational composite they would rule out steady states. Total downstream boxes can rule them
  out too, through a loop among them or a downstream port fed by several wires that disagree, and
  are not listed. An empty `partialDownstream` does not mean the whole model has the same
  relation.
- **Steady states.** A steady state is a valuation of the composed ports that every relation
  and every wire admits. The external relation is the set of steady states projected onto the
  inputs and the deliverables. A feedback loop composes by the relational trace: an input and an
  output are related iff some loop value is consistent. The output lists the steady states.
  Several steady states at one input are all kept. An input with no steady state is listed in
  `noSteadyState`, since it may signal a runaway loop. In `theory/`, `relTrace R a b` is, by
  definition, `(loopStates R a b).Nonempty`: a pair is related iff it has a steady state. The
  relation cites Mathlib's `Relation.comp_assoc`: composing the relations along the wiring does
  not depend on bracketing.

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

Each model is evaluated in its own box ids. A segment or take_out of the product moves its
deliverables to part ids. Pass the returned `boxMap` as `box_map`, and the concept's
deliverables and boundary inputs are renamed to the baseline box before matching. Without it,
the deliverables read as lost. The map fails closed when a key is not a concept box, or a value
not a baseline box. It also fails closed when a mapped box has an input port its baseline box
lacks (mismatch), or when two concept boxes land an input port on the same baseline port
(ambiguous). The comparison is over the baseline's deliverables; `gainedDeliverables` lists the
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

### Compositional semantics

`theory/Semantics.lean` defines the semantics above for an open diagram over values `V`. Ports
range over their carriers' declared values, a box admits a set of port valuations, a wire
equates its two ports, and the interface names input and output ports. `steadyStates` is the set
of valuations that every value set, box, and wire admits. `external` is its projection onto the
inputs and the outputs. A kernel box is `ofRows`: it admits a valuation iff its own ports read one
of its rows. Lean proves, with no `sorry`:

- **Series** (`external_glueAlong`). Glue two diagrams by cross wires. If the cross wires join
  exactly the matching interface ports, the glued external relation is Mathlib's `Relation.Comp`
  of the parts': each wire joins the first part's output j to the second's input j, and every j
  is joined. That is the hypothesis that the interface is fully exposed. A cross wire at a port
  that one part's relation hides breaks the equation, and so does an interface port left unjoined.
  `seq` glues along the interface, so `external_seq` holds with no hypothesis.
- **Parallel** (`external_par`). A disjoint union relates a pair of valuations iff each part
  relates its own components: the product relation.
- **Feedback** (`external_feedbackAlong`, `external_feedback`). Wire each loop output back to its
  loop input, and the external relation is `relTrace` of the open relation. That relation runs
  from (input, loop value) to (output, loop value). The hypothesis is the same as for series: the
  loop wires join exactly the loop ports.
- **Monotonicity** (`external_mono`). Widening any box's relation widens the external relation.
- **A box left open** (`holeContext_preservesUnions`). Add a hole to a diagram: a box declared
  by a relation from its input ports to its output ports (`withHole`). The external relation, as
  a function of the hole's relation, preserves unions, because a related pair needs exactly one
  row of the hole. That is the hypothesis of the residual lemmas behind the
  [weakest box specification](#weakest-box-specification), for every diagram, with the hole any
  box declared by rows over its own ports, as every kernel box is.
  With two holes it preserves unions in each (`holeContext₂_preservesUnions₂`). The same
  relation placed in two holes does not; `theory/SemanticsWitnesses.lean` has the
  counterexample.
- **Functor** (`semantics`). Objects are interfaces. Morphisms are open diagrams, two of them
  identified when their external relations agree. Composition is `seq`, and the identity is a
  diagram of bare interface ports. This is a category, and `semantics` is a faithful functor from
  it to Mathlib's `RelCat`. Its laws are `external_seq` and `external_id`. Faithfulness holds by
  construction, since the morphisms are diagrams up to their relations. Diagrams side by side map
  to the product of relations (`semantics_tensorHom`). That is the tensor on objects and
  morphisms only: no monoidal category is built, and associators, unitors, and coherence are not
  stated.

None of these restricts the diagram. Fan-in, fan-out, loops, and partial or several-valued
relations are covered, since a wire is an equality and a box is a set of valuations.
`theory/SemanticsWitnesses.lean` gives each theorem a concrete diagram with a non-empty
relation, and a counterexample for each hypothesis.

The evaluator is not extracted from these definitions. `tests/act-semantics.test.ts` transcribes
`steadyStates` and `external` into a brute-force reference, which enumerates every port valuation
and filters it. The test then checks that `externalBehavior` agrees with the reference:

- **What agrees.** The composed boxes, the deliverables, and the inputs. Every input valuation,
  with the same outputs and the same number of steady states. Each listed steady state, and the
  inputs with no steady state.
- **Which diagram.** The reference evaluates the upstream part. The test re-derives that part
  from the wires, independently of the evaluator.
- **Seeded models.** 400 random models: loops, fan-out, fan-in, partial and several-valued
  relations, inputs with no steady state, and boxes without behaviour, which must read
  undecided. The test asserts that each of these cases occurs.
- **Repository examples.** Every example. The bearing with declared behaviour has a decided
  relation, as given and trimmed. The others must read undecided, naming the same boxes.

The test also checks the whole model against the upstream part, and Lean states the restriction.
The upstream part is a part of the diagram (`sub`): its boxes and ports, with each wire whose two
ends it keeps. Every steady state of the whole model restricts to one of the upstream part
(`restrict_mem_steadyStates_sub`), so the whole model relates no more on the upstream inputs
(`external_sub_of_external`). The two are equal when every steady state of the part extends to one
of the whole (`external_sub_iff_of_extends`): when every box is upstream (`external_sub_univ`), or
when the downstream boxes and wires accept whatever the part does, as the upstream scope's
`assumption` says (`extends_of_accepts`). A downstream negation loop and a downstream fan-in show
that the whole model can relate strictly less while `partialDownstream` is empty. No verdict
compares the two scopes, so no verdict cites these theorems.

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
  together. A pairwise test would not do: in c = a xor b, any two ports range freely, yet no
  port splits off. Since R is always contained in the product of its projections, equality is
  decided by counting distinct rows, |R| = Π|πᵢR|, in about k·|R| steps for k parts, without
  enumerating the product.
- **Coupling witness.** One part against the rest, R is the product of its projections iff it is
  a rectangle: whenever (x₁, x₂) and (y₁, y₂) are rows, so is (x₁, y₂)
  (`eq_projections_prod_iff_rectangle`, cited for both verdicts). For each coupled part,
  `behavior.witnesses` gives two rows x and y, each shown part by part, and their mix (`absent`):
  the part's values from x, the rest from y, which is not a row. The witness is the first such
  pair with rows in lexicographic order of their values (ports in box order, inputs then
  outputs; values compared by code unit). That order is the one tie-break, and it reads value
  names and port order, so a witness is label-blind only up to it.
- **Suggested partition.** Whichever parts are given, `behavior.finest` gives the finest
  partition of the box's ports over which R is the product of its block projections (`parts`,
  port ids in box order). Lean proves that it exists and is unique, for a box with at least one
  port (`exists_isFinest`, `IsFinest.unique`): if R factors over two partitions, it factors over
  their common refinement (`Factors.inf`). A partition splits R iff each of its parts is a union
  of suggested blocks (`IsFinest.factors_iff`), so `behaviourallyIndependent` holds iff `cut`,
  the suggested blocks whose ports lie in several parts, is empty. When it is, `splitsFurther`
  names the parts that hold several blocks. Two ports share a block iff no split of the ports into two
  groups that R factors over separates them (`IsFinest.rel_iff`). The kernel adds the ports one
  at a time, in box order (inputs, then outputs). It keeps the finest blocks of R's projection
  onto the ports so far, and each new port joins exactly the blocks the rectangle test couples
  to the rest, on the projection onto the ports so far and the new one (`IsFinest.addPort`; the
  test is `factors_split_iff`, decided by counting as above). Testing each port against all the
  others instead would merge too much: for a = b and c = d, every port is coupled to the rest,
  yet {a, b} and {c, d} split (`theory/Witnesses.lean`). This reads about n³·|R|/2 cells for n
  ports and |R| distinct rows. Past a cap of 1000000 cells the suggestion is `decided: false`
  (reason `step-cap`), and the given split is still decided. The empty relation factors over
  single ports. Tests compare the result with a brute force over every partition of random
  boxes with up to five ports.
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
  inside the target at every input. Composition and the trace preserve unions
  (`relation_comp_iSup_left`, `relation_comp_iSup_right`, `relTrace_iSup`). The box occurs once
  in the join, so `C[R]` is the union of its rows' composites. Then `R ⊆ W` iff `C[R]` stays
  inside the target (`le_residual_iff`; `gc_residual`, a Galois connection). So `W` is the
  weakest box specification, the residual in Rel. One search finds every row's composite: the
  box admits every row, and each steady state is grouped by the row it uses.
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
  - Three or more boxes without behaviour give `undecided` (`several-holes`). The largest safe
    relation for one depends on the relations chosen for the others, so no box has a single
    weakest choice. Lean states nothing for three or more, and the kernel computes nothing.
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
- **Re-check.** The kernel declares the spec (`W`, or `W ∩ F`), recomputes the concept's relation,
  and compares it with the target before it answers.
- **Two boxes.** With exactly two boxes without behaviour, the context `C` sends a pair of
  relations `(R₁, R₂)` to `C[R₁, R₂]`. It preserves unions in each box
  (`holeContext₂_preservesUnions₂`), so a pair stays inside the target iff every pair of rows,
  one of each box, does (`le_safeRows_iff`). One search finds every row pair's composite: both
  boxes admit every row, and each steady state is grouped by the two rows it uses. A row pair is
  safe when its composite stays inside the target at every input. A row pair that no steady state
  uses is safe. `excluded` gives each unsafe pair with an input where it leaves the target.
  - **Maximal pairs.** The safe pairs of relations are the rectangles inside the safe row pairs.
    Each lies inside a formal concept of that relation (Mathlib's `Concept`), and the concepts are
    exactly the maximal safe pairs (`safe_iff_le_concept`, `concept_maximal`). The kernel
    enumerates them by intersection closure: each set of second-box rows is an intersection of the
    safe sets of first-box rows. `maximalPairs` counts them. Two distinct concepts are
    incomparable: allowing more rows of one box leaves fewer safe rows of the other.
  - **Covering.** The target is achievable iff some concept's composite covers it
    (`exists_eq₂_iff`). The verdict is `spec` when at least one does. `specs` lists those concepts,
    each with both boxes' rows. Declaring any of them gives exactly the target, and every pair of
    relations that gives the target lies inside one of them. With one, `weakest` is true: it is
    the weakest pair. With several, `weakest` is false: they are incomparable, no pair is the
    weakest, and the choice for one box constrains the other. When no concept covers the target,
    the verdict is `impossible` (`not-covered`): no pair of relations gives it. `pairs` lists each
    maximal pair with its first uncovered input. A typical cause is a target that is not a
    rectangle, such as two deliverables that must agree while each box sets one.
  - **Producible rows.** Each box's rows are cut to its `producible` rows first. The cut context
    still preserves unions in each box (`PreservesUnions₂.cut`), and a pair of producible relations
    stays inside the target iff its product lies inside the safe row pairs intersected with the
    producible ones (`safe_feasible_iff`). The concepts are those of that relation on the producible
    rows, and the same lemmas hold within the cut (`safe_feasible_iff_le_concept`,
    `concept_feasible_maximal`, `exists_eq₂_feasible_iff`). When no concept of the cut covers the
    target, the uncut rows give the reason:
    `infeasible` when some concept over all rows covers it (`wouldGive` lists those; each holds a
    row that is not producible), `not-covered` when none does. There is no `requiredInfeasible`
    for two boxes.
  - **Caps and re-check.** The candidate row pairs count against `max_states` before the search.
    The concepts can be exponentially many in the rows: past 10,000 the verdict is `undecided`
    (`concept-cap`). Each returned pair is re-checked: the kernel declares both relations,
    recomputes the concept's relation, and compares it with the target.

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
  the acceptable values, and it is required. A situation with no steady state is not admitted
  (`admits_bot`), so having no behaviour never makes a concept weak.
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
    only one of the two admits, each way. Inclusion is not total (`admits_incomparable`).
- **Count.** The count of admitted situations (`byCount`) is secondary. A strict inclusion gives
  a strictly larger count (`card_lt_of_strictly_weaker`), so the two never disagree there.
  Between incomparable concepts, the count depends on how finely the carriers' values are
  declared: splitting one value into two changes it. Bennett (2023, cited in weakness.md)
  measures weakness as that count, under a uniform distribution over tasks.
- **Prior.** `priors` replaces the uniform measure: per situation input (box and port), or per
  carrier for every input of it, a nonnegative weight per declared value; an unlisted input or
  value counts 1, and 0 rules a value out. Each concept then carries the total prior mass of
  what it admits (`weightedAdmitted`, ranked in `byWeight`). The weights multiply into the
  count, so every inclusion, every pair, and `weakest` are exactly what they were: a prior
  breaks ties between incomparable concepts, it never moves an inclusion. weakness.md's rule
  stands: a real prior beats the uniform assumption, and the uniform count is the default.
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

Such a box is a nondeterministic Mealy machine, a map `S × I → P(S × O)`. A lens or optic with a
residual is exactly such a machine, with the residual as its state. Only that identification is
claimed: no lens laws, no optic composition beyond the one below, no profunctor formula.

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
- **Separation in time** (`separation`): two to four demands, each a target set with an
  inclusive time window; the windows must not overlap. `realizable` means one run visits each
  target set at some time within its window; the trace and the visit times are the witness.
  `unrealizable` gives the reason: `demand-never-met`, when no run meets some demand within its
  window, or `not-in-one-run`, when each demand is met by some run but no single run meets them
  all. `undecided` means a blocked run might meet them all. The search tracks which demands each
  run has met, so it never mixes two runs. This
  extends Principle 15 and separation in time from snapshots to trajectories.

The result also lists the reached fixed points: configurations whose step can leave the state
unchanged. Tests check, on the examples, that the steps staying at a reached fixed point are
exactly the steady states `triz_behavior` finds when each stateful box is frozen at that state.
For stateless boxes every configuration is such a fixed point, and every step's valuations are
the steady states. The agreement holds only at fixed points a run reaches. A run may never
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

In `theory/`, `Closed` says no step leaves a set. Lean proves that a fixed point lies on a cycle
(`fixed_on_cycle`), that a closed set holds every run that enters it at any number of steps
(`closed_reachIn`), that from a closed set inside the unsafe set every reachable state is unsafe
(`trapped_reachIn`), that from every state a run reaches inside a closed set whose states reach
each other, a state of the unsafe set and a safe one both stay reachable when the set holds one of
each (`recurrent_reach`), and that without a fixed point every return takes at least two steps
(`return_ge_two`). `theory/Witnesses.lean` has a closed set that meets the unsafe set without
lying inside it and reaches a safe state: the recurrent case, which `trapped_reachIn` excludes.
It also shows that `recurrent_reach` needs each hypothesis.

In `bearing-heat-dynamics.json` the shaft has a temperature state. From `cold`, the
heat → preload loop reaches `hot` in two steps, and `hot` is a trap: the loop is `trapped`.
A two-state wear model in the tests makes the split concrete: when `thick` is absorbing it is
`trapped`; when a thick part can return to `thin`, thin and thick form one closed component that
is `recurrent`.
The tests also check a damped variant, where a warm shaft sheds the extra friction heat: there
`hot` is unreachable, `cold` or `warm` is invariant at any horizon, and the shaft settles warm.

In `theory/`, `mealyStep` is one step of a machine under the admissible inputs, and `reachIn`
and `reachWithin` are reachability in exactly and within n steps. Lean proves:

- `reachIn_iff_trace`, `reachWithin_iff_trace`: reachability is an existential over traces;
- `reach_of_trace`: a counterexample trace is sound;
- `reachIn_of_trace`: every point of one trace is reached at its own time;
- `reachWithin_saturated`: a layer that adds nothing completes the reachable set;
- `mealyStep_mono`, `reachIn_mono`, `reachWithin_mono`: more rows or inputs remove no step.

They hold for any step relation, so they cover the kernel's configuration graph. Lean does not
prove that the search computes that graph; tests check it.

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
  port that feeds it. An output port feeding several functions must meet the largest demand: a
  port has one level, like a voltage. An input port fed by several functions needs each of them
  to meet the requirement. Additive sharing, such as a current split between two consumers, is
  not modelled; model the split as a box. Harmful functions carry no demand, and a requirement
  on a port that only harmful functions feed fails closed.
- **Composed boxes.** The product boxes, the boxes that declare feasibility, and every box
  upstream of them along non-harmful wires are composed, and each must declare feasibility.
  So a box that declares feasibility joins the solve wherever it sits, even off the product's
  chain: one of its rows is chosen in every selection, so that row's demand and operating cost
  count in every minimal vector, an unsupplied requirement fails the call, and an unprovidable
  one makes the verdict `infeasible`. Every other box contributes only its fixed `cost`. Segmentation, Taking out, and Intermediary
  build new boxes without feasibility, as without behaviour.
- **Resources.** A resource vector is every box's fixed `cost` plus the operating cost of the
  rows chosen, per cost dimension. Dimensions are never summed together.
- **Least fixpoint.** A configuration is a demanded level per output port and a cost vector.
  Starting from nothing demanded, each step asks the boxes for rows that provide what a
  configuration demands, adds the demand those rows place upstream and their cost, and keeps the
  minimal results, an antichain. This is Kleene's ascent (Censi 2015, Def. 22, eq. 26). Feedback
  loops need no special case: demands only grow along the ascent, and where they stop growing,
  the minimal configurations are exactly the minimal feasible ones (`kleene_lfp`,
  `kleeneStep_upperClosure`, `codesign_lfp`). A test checks the result against every row
  selection of 300 random models.

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

Feasibility and behaviour answer different questions about a loop. `triz_behavior` asks which
values flow: a wire equates its ports' values, and values have no order. A loop is therefore
solved by its steady states, the trace, and not by iterating up from a least value.
`triz_feasibility` asks how much is needed: levels are ordered, and requirements are monotone.
Iterating up from nothing demanded therefore reaches the least fixpoint, and that is the answer.

The antichain (`max_antichain`, at most 1000, checked at every insertion), the Kleene steps
(`max_iterations`, at most 1000), and the row selections tried (1,000,000 per solve) are capped. Past a cap the call
fails closed. The ascent always ends, because every coordinate takes values in a finite set:
the declared levels, and the sums of one row per box closed under max. The antichains can still
grow exponentially with the number of boxes and rows. No polynomial bound is claimed. Censi
(2015, Prop. 5) bounds the work by the width of the loop's resource poset, the height of its
lattice of antichains, and the cost of one evaluation, not by the size of the model.

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
   carrier's image, in the same layer. Then the image of the detailed model's mapped part is
   typed (`typed_map`); the map need not be injective, so `typed_rename` would not do.
3. **Wires.** Every coarse function is the image of a mapped detailed function of its class.
4. **Harm loops.** Every coarse harm loop is the image of a detailed one. Each harmful or
   excessive coarse function on it needs a negative preimage whose object reaches its performer
   along mapped and hidden functions; then the detailed loop maps onto a coarse loop through it
   (`cycle_map`, from `reach_quotient`), and the detailed cycle is the witness. This check can
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

Every construction carries flows, so each result still type-checks:

| Construction | What happens to a flow |
|---|---|
| `merge`, and the supersystem `collapse` | Each box of the group becomes the merged box, and repeats in a row collapse into one step. A flow wholly inside the group is hidden and listed. |
| `trim` | The flow closes up over a trimmed box, from the box before it to the box after. A flow left with one box is dropped. Both are reported. Whether the flow can pass without the trimmed box is part of the trimming problem. |
| `cheap_copy` under a new id | The copy takes the box's place. |
| `segment`, `take_out` | The flow stays on the part that keeps the box's id (`take_out`'s remainder does). With no such part, `segment` fails closed: the ports do not say which part the flow passes. |
| `rewrite` | A flow may pass a deleted box only if the step adds a box with that id back. Otherwise the step must delete or restate the flow (`delete.flows`, `add.flows`). |
| Rules (`triz_rule_apply`) | A flow is a hyperedge on boxes that no pattern names, so deleting a box it passes is a dangling match, refused. |
| Subsystem view (`restrict`) | Each flow keeps its runs of consecutive boxes inside the subsystem; the flows that cross are listed in the boundary. A medium outside is dropped. |
| `triz_abstraction` | Each detailed flow's runs inside the mapped boxes pass through the box map as through a merge (`reach_quotient`) and are matched step by step against the coarse flows of the image carrier (`flows.images`); coarse flow steps no detailed step maps to are listed (`flows.unbacked`). Flows do not change the verdict. |
| `triz_nine_windows` | A transition must reach the snapshot's flows, and `flowsChanged` lists those it changes. Each system view carries every flow's candidates (`system.verdicts.flows`), and each change lists the flows added, removed, and re-routed and the candidates each gains or loses (`changes[].verdicts.flows`). |

Under the adjacent reading, `merge` accepts a group joined by functions inside it or by steps of
a flow inside it. Boxes on one flow with a box outside the group between them are refused, with
the boxes between them named: merging them would close a loop in the flow. A merge joined by
functions can still close one; `flows.newlyLooped` lists those flows.

`theory/` states two facts about a merge, for any group. `flow_merge_typed`: every box on the
merged flow, the mapped path with repeats in a row dropped, is a box of the merged model.
`flow_merge_reach`: a box outside the group that reached another one outside it along a flow
still reaches it along the merged flow, whose steps (`mergedStep`) are the images of the steps
whose ends land in different boxes. It rests on `reach_quotient`. A property test checks that
the kernel's merged paths have exactly those steps. Adjacency is not a hypothesis of either: it
is Principle 5's reading. What it buys is shown in `Witnesses.lean`: merging the adjacent boxes 1
and 2 of the flow 0 → 1 → 2 → 3 leaves no loop, and merging 1 and 3 closes the loop 1 → 2 → 1.

## Principle constructions

A construction is listed here only when the principle's text, looked up in
`data/principles.json` (`triz_principle`), describes a move the kernel can make and check: a
structural one, or for Principle 15 a parametric one. Each row makes the structural part of the principle checkable. That does not show the
principle solves the problem. [All 40 principles](#all-40-principles) gives the class of each
one and why.

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

The original design suggested "factor a function through a new sub-box" for Principle 2. The
looked-up text of Principle 2 does not describe that move; the text of Principle 24 does, so
that move is `interpose`.

Trimming as a rewrite is the evolution-line move named in
[evolution-trends.md](evolution-trends.md): "the function remains, the component disappears".
`trim` builds that rewrite and checks it. It does not show that a trend applies to the system.
Three other lines are rules, and one is a detector; see below.

### All 40 principles

Each principle's text, looked up with `triz_principle`, is classified against what the kernel
can make and check:

- **structural**: a move on boxes, ports, wires, carriers, ratings, cost dimensions, or
  separation cells that the kernel can make and type-check. Each has a `triz_transform`
  operation.
- **parametric**: expressible only as a separation (`triz_separate`) or a behaviour change.
  There is no wiring move to make.
- **analogy only**: everything else. The text names geometry, materials, physics, speed, or the
  order of events, none of which the model contains.

Two facts decide most borderline rows. Time cells are an unordered set, so "before", "in
advance", oscillation, and frequency cannot be stated. And every verdict ignores names, verbs,
and carrier layers and dimensions, so a move that changes only those cannot be told apart from
the original.

| # | Principle | Text (`triz_principle`) | Class | Construction, or why not |
|---|---|---|---|---|
| 1 | Segmentation | "Divide an object into independent parts; make it sectional or modular." | structural | `segment`: "Divide an object into independent parts" — the parts' ports partition the box's ports, and independence (no wire between parts) is reported; for a box that declares behaviour, the finest partition of its ports into independent groups is suggested. |
| 2 | Taking out / Extraction | "Separate an interfering part or isolate the only needed part." | structural | `take_out`: "an interfering part" touches a harmful or excessive function; "the only needed part" carries every useful one. |
| 3 | Local quality | "Make each part fulfill a different, locally optimal function." | parametric | "a different, locally optimal function" for "each part" reads as a parameter whose value differs by location: `triz_separate` with `along: "space"`, after `segment` makes the parts. "Optimal" is not checked. |
| 4 | Asymmetry | "Replace symmetric forms with asymmetric ones." | analogy only | "symmetric forms" are geometry; the model has none. |
| 5 | Merging / Consolidation | "Bring identical or adjacent operations together in space or time." | structural | `merge`, which is `collapse`: "identical" boxes share role and port carriers, "adjacent" ones are joined by functions or sit one after the other on a declared flow. "In space or time" is not modelled. |
| 6 | Universality | "Make an object perform multiple functions and eliminate other parts." | structural | `trim` with every `absorb` choice on one box: the trim does "eliminate other parts", and that box comes to "perform multiple functions". No new operation. |
| 7 | Nested doll / Nesting | "Place one object inside another; use layered containment." | analogy only | "Place one object inside another": the model has no containment. `collapse` is a view of a group, not a placement. |
| 8 | Anti-weight / Counterweight | "Compensate an object's weight by coupling it to a lifting force." | analogy only | "Compensate an object's weight": no forces or balance. Adding the lifting function is a plain `rewrite`, and nothing checks that it compensates. |
| 9 | Preliminary anti-action | "Preload an opposing action before a harmful one occurs." | analogy only | "before a harmful one occurs": time cells are unordered, and the model has no opposing actions. |
| 10 | Preliminary action / Prior action | "Perform a required change fully or partly in advance." | analogy only | "in advance": time cells are unordered, so "before" has no checkable content. |
| 11 | Beforehand cushioning | "Prepare emergency means beforehand to offset low reliability." | structural | `standby`: the "emergency means" is an unwired box that is a typed absorber of every useful function of the unreliable box, so losing that box (a trim) orphans none. Reliability and timing are not modelled. |
| 12 | Equipotentiality | "Remove the need to raise or lower in a potential field." | analogy only | "in a potential field": physics, not wiring. |
| 13 | The other way round / Inversion | "Invert the action; make movable parts fixed and fixed parts movable." | structural | `reverse`: "Invert the action" swaps the function's performer and object. "Movable" and "fixed" are not modelled. |
| 14 | Spheroidality / Curvature | "Use curves or rollers instead of straight lines or planes." | analogy only | "curves or rollers": geometry. |
| 15 | Dynamics | "Allow characteristics to change so they are optimal at each stage." | parametric | `triz_separate` with `along: "time"`: "optimal at each stage" is checked as an admissible value per time cell that no constant matches. |
| 16 | Partial or excessive action | "If the full action is difficult, do slightly less or slightly more." | structural | `rerate`: "slightly less or slightly more" is a useful function rated insufficient or excessive. |
| 17 | Another dimension | "Move into another dimension, tilt the object, or use multi-level arrangements." | analogy only | "another dimension, tilt": geometry. Its "multi-level arrangements" are spatial, not system levels. |
| 18 | Mechanical vibration / Oscillation | "Oscillate or increase the frequency of an action." | analogy only | "Oscillate or increase the frequency": time cells are unordered and have no duration. What remains, change along time, is Principle 15's check. |
| 19 | Periodic action | "Replace continuous action with periodic or pulsed action." | parametric | "continuous" versus "pulsed" is `triz_separate` with `along: "time"` on the action's level: `dynamizable` means no constant level meets every stage. "Periodic" is not modelled. |
| 20 | Continuity of useful action | "Work continuously and remove idle intervals." | parametric | "remove idle intervals": `triz_separate` with `along: "time"`. `constant-suffices` with the working value means no time cell needs idling. |
| 21 | Skipping / Rushing through | "Conduct a harmful or hazardous operation at very high speed." | analogy only | "at very high speed": the model has no speed or duration. |
| 22 | Blessing in disguise / Turn harm into benefit | "Use a harmful factor to achieve a positive effect." | structural | `retarget`: the "harmful factor" is the harmful function's source port, and the "positive effect" a useful function it feeds on another input of the same carrier, optionally keeping the harm. |
| 23 | Feedback | "Introduce feedback, or change the magnitude and influence of existing feedback." | structural | `feedback` ("Introduce feedback": the new function's object already reaches its performer) and `rerate` with `reading: "feedback"` ("change the magnitude": a level change on a cycle). "Influence" beyond the rating is not modelled. |
| 24 | Intermediary / Mediator | "Use an intermediary carrier or process, temporarily or permanently." | structural | `interpose`: "an intermediary carrier or process" is a new mediator box on the function. "Temporarily" is not modelled. |
| 25 | Self-service | "Make an object serve or repair itself and use waste resources." | structural | `trim` with a rule-B absorber, the trimming rule MATRIZ calls self-service: "Make an object serve … itself". "Repair" and "waste resources" are not modelled. No new operation. |
| 26 | Copying | "Use inexpensive copies instead of an unavailable, expensive, or fragile original." | structural | `cheap_copy`: "inexpensive copies instead of an … expensive … original" have the original's ports and a componentwise lower cost. "Unavailable" and "fragile" are not modelled. |
| 27 | Cheap short-living objects | "Replace an expensive durable object with inexpensive short-lived ones." | structural | `cheap_copy`, the same move: "expensive durable" to "inexpensive". "Durable", "short-lived", and the plural are not modelled. |
| 28 | Mechanics substitution | "Replace a mechanical means with a field, sensory, or other interaction." | analogy only | "mechanical means" to "field": a carrier change is a plain `rewrite`, and verdicts ignore carrier layer and dimension, so nothing tells a mechanical carrier from a field. |
| 29 | Pneumatics and hydraulics | "Use gas or liquid parts instead of solid parts." | analogy only | "gas or liquid parts": the model has no material phase. |
| 30 | Flexible shells and thin films | "Use flexible shells, thin films, or isolating membranes." | analogy only | "flexible shells, thin films": materials. An isolating mediator is Principle 24's move and checks nothing about membranes. |
| 31 | Porous materials | "Make an object porous or add porous elements." | analogy only | "porous": the model has no materials or pore structure. |
| 32 | Color changes | "Change the color or transparency of an object or its environment." | parametric | "Change the color or transparency" is a parameter's value: `triz_separate` decides whether one value meets every demand or the value must vary along an axis. |
| 33 | Homogeneity | "Make interacting objects of the same material or compatible behavior." | parametric | "compatible behavior" is what interacting boxes do: declared `behavior` relations, not wiring. `triz_behavior` composes them and lists inputs with no steady state (`noSteadyState`). "Same material" is not modelled. |
| 34 | Discarding and recovering | "Discard or modify used parts and restore consumables during operation." | analogy only | "during operation": discarding and restoring needs transitions between times; `triz_nine_windows` snapshots compute none. |
| 35 | Parameter changes | "Change physical state, concentration, flexibility, temperature, or another parameter." | parametric | "Change … another parameter" is a parameter's value, as for Principle 32. |
| 36 | Phase transitions | "Use phenomena accompanying phase transitions." | analogy only | "phenomena accompanying phase transitions": an effect. Look it up with `triz_effects`. |
| 37 | Thermal expansion | "Use thermal expansion or contraction of materials." | analogy only | "thermal expansion": an effect (`triz_effects`). |
| 38 | Strong oxidants / Boosted interactions | "Replace a normal medium with an enriched or activated one to intensify interaction." | analogy only | "enriched or activated" medium: verdicts are label-blind, so a medium swapped for a relabelled one is indistinguishable. |
| 39 | Inert atmosphere | "Replace a normal environment with an inert one." | analogy only | "inert" environment: deleting its harmful functions would stipulate the result, not check a move. |
| 40 | Composite materials | "Replace homogeneous materials with composite or multi-property ones." | analogy only | "composite" materials: the model has no materials. |

A test checks this table against `data/principles.json`: all 40 rows, each with the looked-up
name and text, and each structural row naming a `triz_transform` operation.

## Rules (double pushout)

A rule is data, defined by [rule.schema.json](../schemas/rule.schema.json). It has three
patterns: L, what must be present; K, what is kept; and R, what is there afterwards. K's
elements appear in L and R with the same ids. Pattern ports are typed by carrier variables. A
match binds the variables used in L; the caller binds those used only in R.

For matching, a model is read as a hypergraph in the sense of Bonchi et al. (2022, Def. 3.1).
Boxes and ports are vertices. Each port has a `port-of` hyperedge to its box, labelled by side
and carrier. Each wire is a hyperedge from its source port to its target port, labelled by
carrier and rating. A match instantiates the rule: it binds the carrier variables, takes any role
or rating the pattern leaves out from the matched element, and resolves `like` copies. On the
instantiated rule, the match is a label-preserving homomorphism, and the conditions below are
that rule's. So a pattern box matches any box that has at least the pattern's ports.

`triz_rule_apply` applies a rule at a match in steps that each fail closed:

1. The match must be a typed homomorphism.
2. No-identification: two pattern elements with the same image must both be kept.
3. No-dangling: every port of a deleted box must be in L, and every wire on a deleted port must
   be deleted. Bonchi et al. (2022, Def. 3.16 and Prop. 3.17) show that these two conditions
   are exactly what the pushout complement needs. A declared flow is a hyperedge on boxes that
   no pattern names, so a deleted box may not lie on a flow or be one's medium.
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

`typed_dpo` in `theory/` states that the result is typed when four things hold: the model is
typed, R is typed, no surviving wire touches a deleted box, and R gives no port a carrier other
than the model's. Rule validation checks R's typing. Step 1 and fresh box and port ids give the
carrier condition. The Lean statement leaves two things out:

- It types ports by partial maps, so it does not model deleting a port. The dangling check in
  step 3 covers that.
- Typing does not need no-identification, which is what makes the result a pushout. A witness
  in `Witnesses.lean` gives a typed result that breaks it.

A property test applies five rules at every match in 200 generated models. Every applicable
match gives a typed model. Every other match fails on a named condition, never at step 7. A
test on the bearing model with declared behaviour checks step 4.

The search is bounded. Past the step budget the list is `decided: false`, and past the match
limit it is `complete: false`. Every listed match is verified before it is returned.

## Evolution lines as rules

A line is encoded only where its text in [evolution-trends.md](evolution-trends.md) describes a
move on the wiring. The rule encodes that move and no more, and cites the line; a test checks
that the quoted text is on that line. A line whose text names a diagnosis rather than a move can
be a detector: it reports where the line points in the model and changes nothing.

| Line | Text | Decision |
|---|---|---|
| Transition to supersystem | "mono → bi → poly → system with its supersystem" | Rule `mono-bi`: a second performer of a matched function. The copy takes the performer's role, name, action, and cost, so its cost counts, and the function's rating. Apply it again for poly. The supersystem step is not encoded. |
| Increasing controllability | "fixed → adjustable → self-adjusting with feedback" | Rule `feedback`: one useful function from the object back to the tool, on a carrier the caller binds. The text names no sensor or controller, so the rule adds no box. The earlier steps are not encoded. `triz_transform` `feedback` (Principle 23) adds a function between boxes you name instead of searching for an occurrence. |
| Increasing ideality | "function preserved while parts and cost vanish" | Trimming, already `triz_transform` `trim`. |
| Dynamization | "rigid → jointed → flexible → field" | Not encoded: no structural reading holds. The steps change how rigid a component is, its degrees of freedom, which the wiring does not represent. "Jointed" resembles `segment` with a function between the parts, but that cannot tell a joint from any other contact between two parts. "Field" resembles the `working-field` rule, but that rule changes a function's carrier and cannot tell whether the tool itself has become a field. Neither is the line. |
| Increasing coordination | "parts synchronize rhythm and parameters" | Not encoded: it changes parameters, not structure. |
| Uneven development of subsystems | "one subsystem lags and becomes the limiter" | Detector `uneven-development` (`triz_rule_apply` with `rule_id`), not a rule: a diagnosis, not a move. The lagging subsystem is a box of the largest harm-loop region (the most boxes; every region of that size is searched) that is on a binding dimension (`triz_feasibility` finds the model over budget, and the box's fixed cost, or its row's operating cost in the witness of some minimal vector, is above 0 on a dimension every minimal vector exceeds; every minimal vector is read, not only the 50 `triz_feasibility` lists) or limits a deliverable (feasibility finds its rows unprovidable, or it performs an insufficient function on a product). Verdict `lagging` with each box's reasons; `none` when feasibility is decided and no box qualifies; `undecided` with no harm loop, or when feasibility is undecided and no box limits a deliverable. |
| Transition to microlevel | "mechanism shrinks toward particle and field interactions" | Not encoded: scale is not in the wiring. |
| Decreasing human involvement | "human does → machine does → system decides" | Not encoded: a machine performing the function in place of a human leaves the wiring as it was, and no role tells them apart. |
| Changing the working field | "mechanical → thermal → chemical → electric → magnetic → electromagnetic" | Rule `working-field`: the matched function and its two ports go, and a function of the same rating and verb comes on a carrier the caller binds as `d`, with a port of `d` on each box. `distinct` refuses `d` equal to the matched carrier. `fieldChanges` records both carriers' layer and dimension. Still unchecked: the order of fields, since the kernel reads a carrier's layer and dimension as labels and `Layer` puts mechanical and electric fields alike under `energy`; whether `d` is a field at all; and whether the new field delivers the function. A port that carries other functions too cannot go (dangling). A product's deliverable moves to the new port and carrier (`deliverableKeysChanged`). |

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

## What is not claimed

The implemented guarantees are separated from future work in
[categorical-assurance.md](../../../docs/categorical-assurance.md) and the cited
[categorical-future-plan.md](../../../docs/categorical-future-plan.md); the ranked backlog is
[FUTURE-PLANS.md](../../../docs/FUTURE-PLANS.md). The following limits remain.

- Trimming is not framed as a Kan extension of what remains. `theory/` once stated it
  (`Recoverable`, never decided), and the statement was removed for three reasons:
  - It took no absorber, but the decided trim depends on one. With the same box trimmed,
    `triz_behavior` returns `preserved` for one absorber and `changed` for another (test "the
    decided trim depends on the absorber, not only on the trimmed boxes"). No statement about
    the trimmed boxes alone can agree with that verdict.
  - It needed the trimmed model to include into the original. A trim that re-attaches a
    function (rules B and C) adds a wire the original lacks, so there is no inclusion. A trim
    by rule A alone is a restriction; there the statement would be well typed.
  - It needed a functor from function models, along trims, to a category of systems, and none
    was defined, so it constrained nothing the kernel computes. The functor that
    `theory/Semantics.lean` now defines (`semantics`) does not supply one. It goes from open
    diagrams, up to their steady-state relations, to relations. Its morphisms compose by gluing
    in series, and a trim is not one of them, so the statement stays removed. A trim still
    depends on its absorber, and rules B and C are still not inclusions.
  - `triz_trim_rewrite` returns an applied trim as explicit deletion and gluing data with its
    absorbers, and replays it. The replay is checked; it supplies no universal property.
- Nothing computes a Grothendieck fibration. The one optic computed is a lens with a residual
  read as a Mealy machine: its bounded runs ([Declared dynamics](#declared-dynamics)), and
  nothing else about optics.
  - The system operator is not claimed to be a fibration. What is proved is a functor from the
    time chain times the opposite poset of box sets to sets (`Wiring.restrictionGrid`). It
    covers the subsystem and system rows, not the supersystem collapse, and no Grothendieck
    construction is built.
- Sheaf cohomology is not computed, and none is needed on the base the separation check uses.
  That base is a finite set of cells with no further structure. On it, a global assignment
  exists exactly when every cell admits a value (`exists_section_iff`). So the only obstruction
  to gluing is a cell with no admissible value, and the cell scan finds every such cell. Nothing
  is claimed for a base whose regions carry more structure. `triz_global_separation` decides
  exact finite compatibility of overlapping local relations, a global assignment problem, not
  cohomology: pairwise compatible projections (`x=y`, `y=z`, `x!=z`) can still have no global
  assignment, and no minimal conflict core is returned.
- For models that declare behaviour, `triz_behavior` decides a finite relational question:
  whether a concept's input→deliverable relation, a trimmed model's or any other's, equals the
  baseline's. Series composition is Mathlib's `Relation.Comp`, and its associativity is
  Mathlib's `Relation.comp_assoc`. `theory/CategoricalTriz.lean` proves sanity lemmas: that
  composition and the trace are monotone, that the trace of a swap is the identity, that every
  value is a steady state of an identity loop, and that a negation loop has none.
  `theory/Semantics.lean` defines the steady-state semantics of an open diagram and proves it
  compositional ([Compositional semantics](#compositional-semantics)):
  - series gluing with the interface fully exposed is `Relation.Comp`;
  - a disjoint union is the product;
  - feedback is `relTrace`;
  - widening a box widens the relation;
  - diagrams up to their relations form a category with a faithful functor to `RelCat`.

  No verdict cites these theorems. The evaluator is not extracted from them. A brute-force
  transcription of the Lean definition agrees with it on 400 seeded random models and on the
  examples. That agreement is evidence on those models, not a proof about the evaluator. The
  agreement is with the semantics of the upstream part the evaluator composes. Lean relates that
  part to the whole model: the whole relates no more on the upstream inputs, and the same when the
  rest accepts whatever the part does (`external_sub_of_external`, `extends_of_accepts`).
  `scope: "whole"` composes every box instead (tested, not proved, against the same semantics).
  `preserved` and `changed` are certified per instance. The weakness and behaviour certificates
  restate composition from the declared rows (`Rows.relation`) and decide it there; they do not
  certify the evaluator either. Lean relates those row tables to open diagrams (`rowsDiagram`,
  `rows_steady_iff`, `rows_relation_iff_external`); that does not prove the TypeScript encoder.
- The weakest specification is decided for one or two boxes without behaviour. With three or
  more, none is computed: Lean states nothing for them, and n-adic concepts are not in Mathlib.
  - For two boxes, the safe relations are not a product of per-box residuals. Lean proves what
    the kernel computes. A pair of relations keeps the composite inside the target iff every row
    of the first forms a safe pair with every row of the second (`le_safeRows_iff`). Every safe
    pair lies inside a formal concept of the safe row pairs, Mathlib's `Concept`
    (`safe_iff_le_concept`), every concept is safe (`concept_safe`), and a safe pair containing a
    concept is that concept (`concept_maximal`): the maximal safe pairs are exactly the concepts.
    The target is achievable iff some concept's composite covers it (`exists_eq₂_iff`). Two
    concepts can be incomparable (`theory/Witnesses.lean`), so there may be no weakest pair.
  - That the kernel's search groups steady states into each row pair's composite, and that its
    intersection closure finds every concept, is tested, not proved. A brute force over every pair
    of relations the boxes could declare checks the verdict, the containment of every achieving
    pair, and each returned pair's maximality: a housing with an interposed sleeve, a correlated
    two-deliverable case, and producible cuts of both. The enumeration is capped, since the
    number of concepts can grow exponentially with the rows (`concept-cap`).
  - `triz_synthesize` is not a residual for several boxes. It checks complete tuples from finite
    component libraries on fixed wiring against one contract; it never substitutes independent
    projections for a correlated relation, does not search unlisted topologies, and its
    impossibility holds only within the declared library and cap.
  - It is the residual of the declared context. It says what the box must do for the concept's
    relation to equal the target. It does not say that a physical box can do it, at what cost,
    or with what new harms.
  - It is named for what it computes. It is not abduction, and it does not search for
    mechanisms.
  - `producible` is declared, not derived. The kernel does not check that a physical box can
    produce those rows and no others, and it does not read `feasibility` levels as rows.
    `requiredInfeasible` names the rows the target needs that the declaration excludes; it does
    not say which of them is cheapest to make producible.
- Lean proves the residual's properties for every context that preserves unions, and that
  composition and the trace preserve unions. The semantics of `theory/Semantics.lean`, with one
  box left open as a hole, is such a context for every diagram and every box declared by rows
  over its own ports, which every kernel box is (`holeContext_preservesUnions`). Lean does not prove that the kernel's join computes that
  semantics; the evaluator is not extracted from it. Two things are tested instead:
  - the grouping of steady states by the box's row, by a brute force over every relation the
    box could declare (the bearing's housing, and a correlated two-deliverable case), and for
    two boxes by the row pair, by a brute force over every pair of relations;
  - the result, by a re-check that declares the spec, or each returned pair.
- Behaviour rows stay steady-state relations, for the spec and for the ranking. They are not
  reread as one-step transitions.
- The weakness ranking holds for the declared values and the given `acceptable`. It does not
  check that a concept resolves the contradiction. Bennett's result assumes a uniform
  distribution over tasks; `priors` replaces that measure with a real one, and the inclusion
  ranking is the same under either, so the assumption bears only on the count and the weighted
  mass, not on what is compared. `joint_prior` does the same for correlated conditions, with an
  explicit weight for every complete situation and no independence assumption. Neither extends
  Bennett's uniform-task theorem, zero-mass extra situations can tie a strict inclusion, and the
  suitability of a prior needs evidence. Prior masses are not certified. Neither the spec nor the
  ranking makes a principle claim.
- Declared behaviour is steady-state semantics. The relational trace says nothing about
  dynamics, convergence, or which steady state the system reaches. Lean links the two readings
  at fixed points only. Read as behaviour, with its state fed back through the trace, a
  machine relates an input to an output iff some state stays fixed under that held input,
  emitting that output (`relTrace_mealyRel_iff`). Each such state is a self-loop of the step
  (`relTrace_mealyRel_fixed`). This says nothing about whether a run reaches such a state, and
  the kernel does not read transition rows as behaviour. Behaviour uses no least
  fixpoint: its values are unordered, so there is no least value to iterate from, and iterating
  from no value delivers nothing on an unseeded loop. Feasibility uses one because its levels are
  ordered and its relations monotone ([Co-design feasibility](#co-design-feasibility)).
  A greatest fixpoint over sets of complete valuations is a possible reformulation, not a reason
  to use local domain propagation as a complete global solver.
  `triz_dynamics` adds bounded runs only where state and initial states are declared.
- Dynamics are finite and discrete. Smooth dynamics (ODEs, tangent bundles), controller
  synthesis, double categories, and profunctor coend formulas are not adopted. A `reachable`
  trace is a candidate mechanism whose rows must be substantiated. `unreachable` holds for the
  rows and initial states as declared. A loop class describes the declared state graph:
  `trapped` means a closed component lies inside the unsafe set, and `recurrent` that one meets
  it and holds a safe configuration; neither says that a physical quantity grows without bound.
  `recurrent` says that from every state the run reaches inside the component, an unsafe and a
  safe state both stay reachable (`recurrent_reach`): the run can return to the unsafe set, and
  can recover. It does not say how often, or whether, a run does return; that needs a fairness
  assumption, which the kernel does not make.
  Dynamics verdicts are not covered by the label-blindness property tests, and traces break
  ties in declaration order. The extended metamorphic tests
  (`tests/act-extended-invariance.test.ts`) check reachable sets, loop classes, and shortest
  traces under renamed states, values, targets, and inputs, comparing a tied witness by validity
  and length, not identity.
- The dynamics, weakness, and behaviour certificates certify what a witness or an exhaustive
  decision supports, and nothing else:
  - of `triz_dynamics`, a reachable escalation, witnessed by one trace; for state-only targets,
    unreachability and invariance (`safetyInvariant`) at every horizon, witnessed by a closed
    invariant that holds every valuation of each selected state, with initial coverage; and for
    a saturated port target, an unreachable escalation witnessed by the reached global states as
    an inductive invariant. All are decided within the cap on table reads, so only small models
    are certified. Unreachability within the horizon only, safe port predicates, separation in
    time, and loop classes are not certified, and runs under an input sequence are not encoded;
  - a port-target unreachable certificate's target, like an escalation's, is the admitted
    configurations in the unsafe set (`Sync.target`). A run that blocks has no admitted
    configuration there, so the certificate also states the kernel's further check: every reached
    state admits a valuation or fails the unsafe set's state conditions, so no run blocks in them
    (`unreachable_of_holding`);
  - of `triz_weakness`, every pair: strict inclusions with the larger count, equality, and
    incomparability by a witness admitted by one concept and rejected by the other, each way
    (`incomparable_of_witnesses`), decided over every situation and valuation within the cap on
    table reads, so only small concepts are certified;
  - of `triz_behavior`, `preserved` (the two relations equal and not empty) and `changed` (an
    input and output in one relation and not the other), decided over every situation and
    valuation within the same cap. `undecided`, the weakest specification, and lost
    deliverables are not certified;
  - only the boxes composed in the certificate's scope are encoded. Under the default upstream
    scope each certificate holds under the kernel's stated `assumption`: every other box accepts
    whatever it receives; under `scope: "whole"` every box is encoded;
  - a manifest binds each certificate to its request, scope, and theory and schema pins.
    `scripts/certify.mjs --request` checks the source and table correspondence and regenerates
    the certificate; that detects staleness and encoding mismatches, and is not a proof of the
    encoder.
- `preserved` means equal relations, not equal non-empty outputs at every input. An input with
  no steady state in either model agrees vacuously; only relations empty everywhere are
  refused (`undecided`, `no-steady-state`).
- A `preserved` verdict holds for the relations as declared. Whether they are true, the
  absorber's above all, is outside the kernel, and so are the absorber's new harms. Its added
  cost is `triz_feasibility`'s question. Under the default upstream scope downstream boxes are
  not composed; see `partialDownstream`, which lists only the partial ones and is a diagnostic,
  not a proof. A total downstream box in a loop, or a downstream port fed by several wires, can
  also rule out steady states of the whole model; `scope: "whole"` composes them.
- Equal relations can be empty at some inputs. `triz_adequacy` separately requires a steady
  state and only acceptable outputs at every required operating situation, a complete
  assignment of the boundary inputs.
- `compare_to` compares the baseline's deliverables only. A concept that gains a deliverable
  can read `preserved`; `gainedDeliverables` lists them. `box_map` renames boxes; it does not
  say that the parts are the box, physically or economically.
- A segment's split is decided for the declared relation and the given partition. It holds for
  the parts' projections as composed by `triz_behavior`, where a part that cannot reach a
  deliverable is not composed. `behavior.coupled` tests each part against all the others. A
  coupling witness depends on value names and port order through its tie-break; whether a part
  is coupled does not.
- The suggested partition (`behavior.finest`, `factorisations`) is the finest one for the
  declared rows. Lean proves that it exists, is unique, and is what adding ports one at a time
  computes (`IsFinest.addPort`); the TypeScript is checked against that by a brute force over
  partitions, not extracted. Independence of ports is read off the rows as declared: an
  undeclared row can couple ports the suggestion separates. Whether the parts can be built
  apart, and what they cost, is outside the kernel. The proofs need finitely many ports and at
  least one; `theory/Witnesses.lean` shows that without either no finest partition need exist.
  Past the cap, nothing is suggested.
- An identity mediator is the identity on the declared values. Its cost, delay, and new harms
  are not modelled.
- A `triz_feasibility` verdict holds for the rows as declared. Whether they are true, the
  absorber's above all, is outside the kernel, and so are the absorber's new harms.
  - Monotone reading is an assumption. A box that works worse with more input, which an
    excessive function suggests, is outside it, and the ratings are not read.
  - A loop is feasible whenever its rows are consistent. Losses and conservation must be in the
    rows; the solver does not know physics.
  - Lean proves that series, parallel, and feedback composition keep monotonicity, that Kleene's
    ascent reaches the least fixpoint of a finite lattice, that a step can be computed on the
    antichain when requirements are monotone, and that the least fixpoint is the upward closure
    of the feasible configurations. The solver is checked against these by tests, including the
    brute-force comparison, not extracted from them.
  - Shared intensive levels use max; extensive consumption needs an explicit split or balance.
    `triz_conservation` checks the declared arithmetic of such a balance, not constitutive
    physics, and infers no units or mixing laws.
  - Feasibility verdicts are label-blind under the same property tests as the wiring verdicts
    (models with generated antichain rows, relabelled and permuted, ids mapped back; the
    unprovidable verdict names the first blocked box in model order, so only its counts are
    compared there).
- Double-pushout rewriting is claimed for `triz_rule_apply` only, in the hypergraph encoding
  above.
  - `triz_transform`'s moves are single rewrites at occurrences named by id. They check
    no-dangling; ids are injective, so no-identification holds trivially.
  - `forbid` is an application condition of one rule at one match. Nothing is claimed about
    sets of rules beyond `triz_rule_set`'s sufficient test: a lexicographic box and wire count
    that every application of a named subset decreases. Failing it does not prove
    nontermination. `triz_rewrite_pair` checks two named occurrences in both orders;
    interference is not nonconfluence, and commutation is not confluence. Complete
    interface-aware critical-pair coverage is not claimed.
  - The match search is exponential in the worst case. That is why it has a step budget, and
    each `forbid` condition its own.
- "Domain invariance" is claimed in one sense only: the structured verdicts are label-blind.
  They depend on the wiring shape, not on ids, names, verbs, domain, or carrier layer and
  dimension. This covers the verdicts of `checkModel`, `harmLoops`, `idealityProfile`,
  `trimCandidates`, `compareIdeality`, `separationCheck`, and `dynamize`. The isomorphism check
  (`comparison.isomorphism`) does not compare carrier values, declared behaviour, feasibility,
  dynamics, or flows, so isomorphic models can get different `triz_behavior`, `triz_feasibility`,
  `triz_dynamics`, and `triz_flow` verdicts. `triz_isomorphism` separately checks or searches
  maps that preserve those annotations, with value and state maps, within a budget; past it, the
  answer is undecided, never non-isomorphic.
  - Property tests check this over 200 seeded random models with every array permuted.
  - Excluded by design: free text, witness-cycle tie-breaks (which follow id order), absorber
    port tie-breaks (which follow port order), and the truncated conflict-cell list.
  - The bearing and connection-pool examples are isomorphic and get the same wiring
    verdicts. That shows the kernel ignores domain meaning. It does not show that a TRIZ
    solution transfers between domains.
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
  - A transition reaches a snapshot when boxes, wires, carriers, and flows agree by id and
    content, ignoring array order. Flow changes are listed in `flowsChanged`; the subsystem part
    of a step, like `restrict_rewrite`, concerns boxes and wires only. `domain`, `system`, `budget`, `weights`, and `contradictions` are not
    compared.
  - Lean wires have fixed endpoints, so a step never moves one. A function re-attached under the
    same id, as an applied trim does, counts as one function deleted and another glued.
    `reroute` alone does not commute with restriction when it moves an endpoint across the
    boundary; `theory/Witnesses.lean` has the counterexample.
  - Transitions are not inferred. Between snapshots given without one, only the box ids added
    and removed are listed. The supersystem collapse is not checked against transitions.
- Without declared behaviour, a carrier match is necessary for an absorber, not sufficient.
  Each absorber's new harms are not modelled unless declared. Its added cost is modelled only
  where the boxes declare feasibility (`triz_feasibility`). `triz_implementations` checks a named
  alternative's behaviour, adequacy, declared harms, and shared budget together; it requires
  exactly one explicit resource mode per box, including disconnected boxes and sinks, asserted
  to support all its behaviour rows. Several modes are separate named alternatives, so capable
  rows of one mode never combine with the cheap resources of another; the assertion and the
  declared evidence are not validated. `triz_absorber_assignments` evaluates complete
  assignments together; separate per-function successes do not establish joint sufficiency.
- `harmLoops` is exhaustive for the model as written. It cannot find a back-reaction the model
  omits.
- A scalar ideality is produced only from explicit `weights` covering every cost dimension and
  `harmful`. Otherwise, costs are reported per dimension and never summed. `mpv_weights` sums
  only the MPV axes the user weights, for the comparison; it never fills in a weight.
- An abstraction verdict is about the two models and the map as data. Lean proves that a typed
  map keeps typing (`typed_map`), that reachability passes along a map whose functions each stay
  in one coarse box or map to a coarse function (`reach_map`), and that a detailed cycle maps to
  a coarse one (`cycle_map`). The checks themselves are finite scans, tested (including a
  property test over collapses of random models), not extracted. A harm loop is backed when one
  detailed loop maps onto it; that the detailed loop is the same mechanism is your claim.
  Feasibility rows are not composed across several preimages. Structural abstraction alone does
  not transfer behaviour: `triz_behavior_refinement` checks complete whole-model relations under
  an explicit interface and value map, and `triz_subsystem_summary` composes a stateless
  subsystem's boundary relation and lists its hidden harms, which projection does not make safe.
  Dynamic simulation and commutation with supersystem transitions are not claimed.
- Levels read amounts into values; they do not say that the values mean what the behaviour rows
  assume. The consistency check compares a row's named ports only, at the exact values its
  amounts read as. It does not apply the monotone reading to behaviour rows, which have no order.
- Flows are declared, not inferred. A flow analysis item is a structural candidate: a bottleneck
  candidate does not measure a resistance, and an accumulation candidate does not show that
  anything piles up. Rates, capacities, and delays are not modelled, except in `triz_queue`'s
  narrow adapter: a declared discrete queue with explicit arrivals, service and storage
  capacity, and schedule, checked through the dynamics evaluator over its declared slots only;
  an upper bound above capacity does not show that overflow occurs. `triz_behavior`,
  `triz_dynamics`, and `triz_feasibility` ignore flows, and the per-instance Lean certificates do
  not cover them. A trim's flow bypass assumes the carrier can pass from the box before to the
  box after.
- The uneven-development detector reads structure and declared feasibility rows. It does not
  measure how far a subsystem lags; "largest" counts boxes, not effect.
- Not adopted: 9 windows as a fibration, evolution lines other than the four encoded as rules and
  the one read as a detector (the table gives each reason), and the principles classified
  parametric or analogy only above as transformations. The formal-methods analogies are
  recorded in [sources.md](sources.md); none is implemented.
- The principle constructions check structure only. They are label-blind under the same
  property tests: the same construction on a model and on its relabelling succeeds and fails
  together, and two successes give isomorphic results (wiring, roles, ratings, and costs;
  free-text notes and witness tie-breaks excepted, as for the wiring verdicts).
- `triz_separate`'s `suggestions` are hints. A separation verdict says a piecewise assignment
  exists; it does not say that the suggested move builds one, that the move is the best one, or
  that the cited principle applies.
