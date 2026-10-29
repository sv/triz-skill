# Categorical function models

Write the function model as typed data and let the `triz` MCP server check it, instead of
drawing an informal diagram and reasoning over it by eye. The model is an open wiring diagram:
boxes (components) with typed input and output ports, joined by wires (TRIZ functions) that
carry one flow type and a rating. The checks are finite and deterministic, and they fail closed.

Schema: [function-model.schema.json](../schemas/function-model.schema.json). The repository's
`examples/function-models/` holds worked models of a bearing, a cached API read path, a
marketplace, and a connection pool. The connection pool has the bearing's wiring shape.
`bearing-heat-behavior.json` is the bearing with declared behaviour.

## What each piece means

| TRIZ artifact | In the model | Check | Lean statement (`theory/`) |
|---|---|---|---|
| Component, supersystem element | box with `role` and typed ports | — | — |
| Flow (substance, energy, data, money) | carrier with `layer` and `dimension` | — | — |
| Function, rated useful (normal / insufficient / excessive) or harmful | wire from an output port to an input port, one carrier, one `polarity` | `triz_function_model`: endpoints exist, out→in, carriers agree | — |
| Back-reaction, vicious circle | a cycle through a harmful or excessive function | strongly connected regions with one witness cycle per such function | `edge_on_cycle` |
| Trimming rules A/B/C | delete the trimmed boxes; re-attach each function they performed on a remaining box to a typed absorber | `triz_trim`: carrier screen; `triz_transform` `trim` applies it | `typed_reroute` |
| Declared behaviour, steady state | carrier `values` and box `behavior` rows: each box a finite relation; the external relation from boundary inputs to deliverables, with feedback by the relational trace | `triz_behavior`; with `compare_to` (and `box_map`), decides whether a concept preserves that relation; `trim` is shorthand for the model's own trim | `Relation.comp_assoc` (Mathlib); sanity lemmas, never cited: `relation_comp_mono`, `relTrace_mono`, `relTrace_swap`, `loopStates_id`, `relTrace_not_loop` |
| Ideality comparison | componentwise order on cost vectors | profile per dimension; baseline vs concept with `compare_to`; `triz_trim`'s `costRelief` (`costBound`) | `trim_lowers_cost`, `pareto_incomparable`, `pareto_not_total` |
| Physical contradiction, separation | gluing a parameter assignment over a finite base | `triz_separate`, or embedded `contradictions` | `exists_section_iff`, `glue_of_disjoint_regions`, `no_section_of_overlap`, `separated_iff_axis`; sanity lemma, never cited: `separation_on_condition` |
| Same model in another domain | structural isomorphism: a bijection preserving roles, port sides, shared carriers, wiring, ratings, and costs | `triz_function_model` with `compare_to` (`comparison.isomorphism`); every wiring verdict is label-blind (property tests) | `typed_rename`, `transGen_equiv` |
| Drawing the model | Graphviz DOT, or an open hypergraph: ports as carrier-typed vertices, boxes and functions as hyperedges, unwired ports as the interface | `triz_export`, golden outputs, lossless round trip | — |
| Model transformation | a rewrite at an occurrence named by id: delete, check no-dangling, glue, type-check | `triz_transform` | `typed_delete`, `typed_glue`, `typed_reroute`, `typed_retarget`, `typed_reverse`, `typed_extend` |
| Reusable move, evolution-line step | a rule L ← K → R applied by double pushout at a match found by search | `triz_rule_apply`: matches, no-identification and no-dangling conditions, fresh ids, typed result | `typed_overlay`, `typed_dpo` |
| Behaviour through a construction | segment: the box's relation splits over the parts iff it is the product of its projections; interpose: an identity mediator composes away | `triz_transform` segment and take_out (`behaviourallyIndependent`), interpose (`behavior.identity`) | `eq_projections_prod_iff`, `eq_projections_pi_iff`, `Relation.comp_eq` (Mathlib) |
| System operator (9 windows), level axis | restriction to a subsystem, a presheaf on the poset of box sets; collapse of the system into one box | `triz_nine_windows` | `typed_restrict`; `supportedOn`, `typedOn`; used by those, never cited: `restrict_restrict`, `restrict_of_subset` |
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

   When the boxes that matter declare behaviour, call `triz_behavior` with the same `trim` and
   `absorb`. It decides whether the trim preserves the input→deliverable relation (see
   [Declared behaviour](#declared-behaviour)). A `preserved` verdict holds for the relations as
   declared; substantiate each of them, the absorber's first.
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
as in the last column above, or a Mathlib lemma a proof in that file uses. A test checks that
every cited name is a theorem in that file or such a lemma, which `lake build` then resolves.
That theorem proves the abstract fact. Tests check the TypeScript against it; nothing is
extracted from Lean. A basis never means the TRIZ reading of a verdict is proved. A verdict that
needs no theorem, such as a compatible pair, cites none. A theorem is cited only where its
statement is exactly what the verdict uses. The table marks the others as never cited. Most are
semantic sanity lemmas: they pin the semantics down on the tests' own examples
(`loopStates_id`, `relTrace_not_loop`, `relTrace_swap`), or state a fact no check computes
(`relation_comp_mono` and `relTrace_mono`, since a trim does not widen one relation;
`separation_on_condition`, a Boolean split the condition axis does not use).
`restrict_restrict` and `restrict_of_subset` are the presheaf's functor laws, used to build
`supportedOn`; no view zooms inside a zoom, so no verdict uses them. A test keeps all of these
out of the citable list.

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
  relational composite they would rule out steady states.
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

## Behaviour through the constructions

`triz_transform` carries declared behaviour into its results only where the result's relation
is fixed by what was declared:

- **Segmentation and Taking out.** When the box declares behaviour, its relation R is checked
  against the parts: is R the product of its projections onto each part's ports? Principle 1
  asks for "independent parts", and this is that independence for the declared relation
  (`behaviourallyIndependent`). If it holds, each part gets its projection as its behaviour, and
  the parts compose back to R. If not, no relations on the parts compose back to R
  (`eq_projections_prod_iff`, `eq_projections_pi_iff`): the parts get no behaviour, and
  `behaviour.coupled` names each part whose ports are not independent of all the other parts
  together. A pairwise test would not do: in c = a xor b, any two ports range freely, yet no
  port splits off. Since R is always contained in the product of its projections, equality is
  decided by counting distinct rows, |R| = Π|πᵢR|, in about k·|R| steps for k parts, without
  enumerating the product.
- **Intermediary.** The mediator may declare `behavior`: rows over its ports `in` and `out`, or
  `identity`, one row per declared value of the wire's carrier with in = out. A relation equal
  to the identity cites Mathlib's `Relation.comp_eq` (r composed with equality is r): with the
  legs' ratings unchanged, the composite through it is the original relation.

Decide the result with `triz_behavior` and `compare_to`. Without declared behaviour, new boxes
stay undecided.

## Principle constructions

A construction is listed here only when the principle's text, looked up in
`data/principles.json` (`triz_principle`), describes a move the kernel can make and check: a
structural one, or for Principle 15 a parametric one. Each row makes the structural part of the principle checkable. That does not show the
principle solves the problem. [All 40 principles](#all-40-principles) gives the class of each
one and why.

| Principle | Text (`triz_principle`) | Construction | Checked |
|---|---|---|---|
| 1 Segmentation | "Divide an object into independent parts; make it sectional or modular." | `segment`: a box becomes parts whose ports partition its ports. Each wire follows its port, and each cost dimension goes wholly to one part. | The partition is exact and ids are fresh. The result reports whether the parts are independent, meaning no wire joins two parts, and, for a box that declares behaviour, whether its relation is the product of its projections onto the parts (`behaviourallyIndependent`). For a box with no self-loop, collapsing the parts gives back a model isomorphic to the original. A self-loop instead ends up between parts, or in the collapse's `hidden` list. |
| 2 Taking out | "Separate an interfering part or isolate the only needed part." | `take_out`: split the given ports off into a new box. | Reading `interfering`: the split-off ports touch a harmful or excessive function. Reading `needed`: they carry every useful function, so the remainder is a trimming candidate. |
| 5 Merging | "Bring identical or adjacent operations together in space or time." | `merge`: `collapse` the boxes into one. | Reading `adjacent` (default): functions inside the group join every box. Reading `identical`: the same role and the same carriers on each side; names and actions are labels and are not compared. Every path maps to a path (`reach_quotient`), but a merge can close loops: harms newly on a harm loop are listed, as are the hidden internal functions. |
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
Two other lines are rules; see below.

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
| 1 | Segmentation | "Divide an object into independent parts; make it sectional or modular." | structural | `segment`: "Divide an object into independent parts" — the parts' ports partition the box's ports, and independence (no wire between parts) is reported. |
| 2 | Taking out / Extraction | "Separate an interfering part or isolate the only needed part." | structural | `take_out`: "an interfering part" touches a harmful or excessive function; "the only needed part" carries every useful one. |
| 3 | Local quality | "Make each part fulfill a different, locally optimal function." | parametric | "a different, locally optimal function" for "each part" reads as a parameter whose value differs by location: `triz_separate` with `along: "space"`, after `segment` makes the parts. "Optimal" is not checked. |
| 4 | Asymmetry | "Replace symmetric forms with asymmetric ones." | analogy only | "symmetric forms" are geometry; the model has none. |
| 5 | Merging / Consolidation | "Bring identical or adjacent operations together in space or time." | structural | `merge`, which is `collapse`: "identical" boxes share role and port carriers, "adjacent" ones are joined by functions. "In space or time" is not modelled. |
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
   are exactly what the pushout complement needs.
4. Behaviour: a kept box that declares `behavior` must keep its ports, because its rows name
   every port once. A rule that adds or deletes one of its ports fails with `behaviour:`; restate
   or remove the behaviour first. A `like` copy does not copy behaviour.
5. The image of L \ K is deleted, and R \ K is glued on under fresh ids.
6. The result must pass the type check of `triz_function_model`.

`typed_dpo` in `theory/` states that the result is typed when four things hold: the model is
typed, R is typed, no surviving wire touches a deleted box, and R gives no port a carrier other
than the model's. Rule validation checks R's typing. Step 1 and fresh box and port ids give the
carrier condition. The Lean statement leaves two things out:

- It types ports by partial maps, so it does not model deleting a port. The dangling check in
  step 3 covers that.
- Typing does not need no-identification, which is what makes the result a pushout. A witness
  in `Witnesses.lean` gives a typed result that breaks it.

A property test applies four rules at every match in 200 generated models. Every applicable
match gives a typed model. Every other match fails on a named condition, never at step 6. A
test on the bearing model with declared behaviour checks step 4.

The search is bounded. Past the step budget the list is `decided: false`, and past the match
limit it is `complete: false`. Every listed match is verified before it is returned.

## Evolution lines as rules

A line is encoded only where its text in [evolution-trends.md](evolution-trends.md) describes a
move on the wiring. The rule encodes that move and no more, and cites the line; a test checks
that the quoted text is on that line.

| Line | Text | Decision |
|---|---|---|
| Transition to supersystem | "mono → bi → poly → system with its supersystem" | Rule `mono-bi`: a second performer of a matched function. The copy takes the performer's role, name, action, and cost, so its cost counts, and the function's rating. Apply it again for poly. The supersystem step is not encoded. |
| Increasing controllability | "fixed → adjustable → self-adjusting with feedback" | Rule `feedback`: one useful function from the object back to the tool, on a carrier the caller binds. The text names no sensor or controller, so the rule adds no box. The earlier steps are not encoded. `triz_transform` `feedback` (Principle 23) adds a function between boxes you name instead of searching for an occurrence. |
| Increasing ideality | "function preserved while parts and cost vanish" | Trimming, already `triz_transform` `trim`. |
| Dynamization | "rigid → jointed → flexible → field" | Not encoded: the steps change how rigid a component is, which the wiring does not represent. |
| Increasing coordination | "parts synchronize rhythm and parameters" | Not encoded: it changes parameters, not structure. |
| Uneven development of subsystems | "one subsystem lags and becomes the limiter" | Not encoded: a diagnosis, not a move. |
| Transition to microlevel | "mechanism shrinks toward particle and field interactions" | Not encoded: scale is not in the wiring. |
| Decreasing human involvement | "human does → machine does → system decides" | Not encoded: a machine performing the function in place of a human leaves the wiring as it was, and no role tells them apart. |
| Changing the working field | "mechanical → thermal → chemical → electric → magnetic → electromagnetic" | Not encoded. A field would be a carrier, but the kernel reads a carrier's layer and dimension as labels, so it cannot order fields. It also identifies a delivered function by its carrier, so "the same function in another field" has no structural reading. |

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

- Trimming is not framed as a Kan extension of what remains. `theory/` once stated it
  (`Recoverable`, never decided), and the statement was removed for three reasons:
  - It took no absorber, but the decided trim depends on one. With the same box trimmed,
    `triz_behavior` returns `preserved` for one absorber and `changed` for another (test "the
    decided trim depends on the absorber, not only on the trimmed boxes"). No statement about
    the trimmed boxes alone can agree with that verdict.
  - It needed the trimmed model to include into the original. A trim that re-attaches a
    function (rules B and C) adds a wire the original lacks, so there is no inclusion. A trim
    by rule A alone is a restriction; there the statement would be well typed.
  - No functor from a function model to a category of systems was ever defined, so it
    constrained nothing the kernel computes.
- Nothing computes an optic or lens, or a Grothendieck fibration.
  - The system operator is not claimed to be a fibration. What is proved is a functor from the
    time chain times the opposite poset of box sets to sets (`Wiring.restrictionGrid`). It
    covers the subsystem and system rows, not the supersystem collapse, and no Grothendieck
    construction is built.
- Sheaf cohomology is not computed, and none is needed on the base the separation check uses.
  That base is a finite set of cells with no further structure. On it, a global assignment
  exists exactly when every cell admits a value (`exists_section_iff`). So the only obstruction
  to gluing is a cell with no admissible value, and the cell scan finds every such cell. Nothing
  is claimed for a base whose regions carry more structure.
- For models that declare behaviour, `triz_behavior` decides a finite relational question:
  whether a concept's input→deliverable relation, a trimmed model's or any other's, equals the
  baseline's. Series composition is Mathlib's `Relation.Comp`, and its associativity is
  Mathlib's `Relation.comp_assoc`. Lean proves only that it is monotone,
  that the trace is monotone, that the trace of a swap is the identity, that every value is a
  steady state of an identity loop, and that a negation loop has none. These are semantic sanity
  lemmas; no verdict cites them. The evaluator is checked by tests, not extracted from these
  statements.
- Declared behaviour is steady-state semantics. The relational trace says nothing about
  dynamics, convergence, or which steady state the system reaches. A least fixpoint (iteration
  from no value) is not used: it needs initial loop values the model does not declare, and on an
  unseeded loop it delivers nothing.
- `preserved` means equal relations, not equal non-empty outputs at every input. An input with
  no steady state in either model agrees vacuously; only relations empty everywhere are
  refused (`undecided`, `no-steady-state`).
- A `preserved` verdict holds for the relations as declared. Whether they are true, the
  absorber's above all, is outside the kernel, and so are the absorber's added cost and new
  harms. Downstream boxes are not composed; see `partialDownstream`.
- `compare_to` compares the baseline's deliverables only. A concept that gains a deliverable
  can read `preserved`; `gainedDeliverables` lists them. `box_map` renames boxes; it does not
  say that the parts are the box, physically or economically.
- A segment's split is decided for the declared relation and the given partition. It holds for
  the parts' projections as composed by `triz_behavior`, where a part that cannot reach a
  deliverable is not composed. `behaviour.coupled` tests each part against all the others; it
  does not search for groups of parts that split from each other.
- An identity mediator is the identity on the declared values. Its cost, delay, and new harms
  are not modelled.
- Double-pushout rewriting is claimed for `triz_rule_apply` only, in the hypergraph encoding
  above.
  - `triz_transform`'s moves are single rewrites at occurrences named by id. They check
    no-dangling; ids are injective, so no-identification holds trivially.
  - Nothing is claimed about sets of rules: neither confluence nor termination.
  - The match search is exponential in the worst case. That is why it has a step budget.
- "Domain invariance" is claimed in one sense only: the structured verdicts are label-blind.
  They depend on the wiring shape, not on ids, names, verbs, domain, or carrier layer and
  dimension. This covers the verdicts of `checkModel`, `harmLoops`, `idealityProfile`,
  `trimCandidates`, `compareIdeality`, `separationCheck`, and `dynamize`. The isomorphism check
  (`comparison.isomorphism`) does not compare carrier values or declared behaviour, so
  isomorphic models can get different `triz_behavior` verdicts.
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
  - A transition reaches a snapshot when boxes, wires, and carriers agree by id and content,
    ignoring array order. `domain`, `system`, `budget`, `weights`, and `contradictions` are not
    compared.
  - Lean wires have fixed endpoints, so a step never moves one. A function re-attached under the
    same id, as an applied trim does, counts as one function deleted and another glued.
    `reroute` alone does not commute with restriction when it moves an endpoint across the
    boundary; `theory/Witnesses.lean` has the counterexample.
  - Transitions are not inferred. Between snapshots given without one, only the box ids added
    and removed are listed. The supersystem collapse is not checked against transitions.
- Without declared behaviour, a carrier match is necessary for an absorber, not sufficient.
  Each absorber's added cost and its new harms are not modelled.
- `harmLoops` is exhaustive for the model as written. It cannot find a back-reaction the model
  omits.
- A scalar ideality is produced only from explicit `weights` covering every cost dimension and
  `harmful`. Otherwise, costs are reported per dimension and never summed.
- Not adopted: 9 windows as a fibration, evolution lines other than the three above as rules
  (the table gives each reason), and the principles classified parametric or analogy only above
  as transformations. The formal-methods analogies are recorded in [sources.md](sources.md);
  none is implemented.
- The principle constructions check structure only. The label-blindness property tests do not
  cover them.
