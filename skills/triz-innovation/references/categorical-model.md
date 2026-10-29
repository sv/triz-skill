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

## What each piece means

| TRIZ artifact | In the model | Check | Lean statement (`theory/`) |
|---|---|---|---|
| Component, supersystem element | box with `role` and typed ports | — | — |
| Flow (substance, energy, data, money) | carrier with `layer` and `dimension` | — | — |
| Function, rated useful (normal / insufficient / excessive) or harmful | wire from an output port to an input port, one carrier, one `polarity` | `triz_function_model`: endpoints exist, out→in, carriers agree | — |
| Back-reaction, vicious circle | a cycle through a harmful or excessive function | strongly connected regions with one witness cycle per such function | `edge_on_cycle` |
| Trimming rules A/B/C | delete the trimmed boxes; re-attach each function they performed on a remaining box to a typed absorber | `triz_trim`: carrier screen; `triz_transform` `trim` applies it | `typed_reroute` |
| Declared behaviour, steady state | carrier `values` and box `behavior` rows: each box a finite relation; the external relation from boundary inputs to deliverables, with feedback by the relational trace | `triz_behavior`; with `trim`, decides whether the trim preserves that relation | `Relation.comp_assoc` (Mathlib), `relation_comp_mono`, `relTrace_mono`, `relTrace_swap`, `loopStates_id`, `relTrace_not_loop` |
| Dynamics: escalation, invariance, separation in time | box `state`, `initial`, and `transition` rows: a nondeterministic Mealy machine, which is a lens with a residual as its state; the synchronous composite's runs up to a horizon | `triz_dynamics`: escalation into an unsafe set (shortest trace), invariance of a safe set, separation in time along one run | `reachIn_iff_trace`, `reachWithin_iff_trace`, `reach_of_trace`, `reachIn_of_trace`, `reachWithin_saturated`, `mealyStep_mono`, `reachIn_mono`, `reachWithin_mono` |
| Loop behaviour: bistable, runaway, oscillating | closed strongly connected components of the reachable graph of declared states | `triz_dynamics` `loops`: bistable, escalating (a trap, with a shortest trace), oscillating (period and one cycle) | `fixed_on_cycle`, `closed_reachIn`, `return_ge_two` |
| Absorber's added resources, co-design | box `feasibility` rows: each box a monotone feasibility relation; the composite by Kleene's ascent to the least fixpoint (Censi 2015) | `triz_feasibility`; with `trim`, decides whether the remaining boxes provide what the trim leaves them within budget | `feasibility_comp`, `feasibility_par`, `feasibility_trace`, `kleene_lfp`, `kleeneStep_upperClosure`, `codesign_lfp` |
| Ideality comparison | componentwise order on cost vectors | profile per dimension; baseline vs concept with `compare_to` | `trim_lowers_cost`, `pareto_incomparable`, `pareto_not_total` |
| Physical contradiction, separation | gluing a parameter assignment over a finite base | `triz_separate`, or embedded `contradictions` | `exists_section_iff`, `glue_of_disjoint_regions`, `no_section_of_overlap`, `separated_iff_axis`, `separation_on_condition` |
| Same model in another domain | structural isomorphism: a bijection preserving roles, port sides, shared carriers, wiring, ratings, and costs | `triz_function_model` with `compare_to` (`comparison.isomorphism`); every wiring verdict is label-blind (property tests) | `typed_rename`, `transGen_equiv` |
| Drawing the model | Graphviz DOT, or an open hypergraph: ports as carrier-typed vertices, boxes and functions as hyperedges, unwired ports as the interface | `triz_export`, golden outputs, lossless round trip | — |
| Model transformation | a rewrite at an occurrence named by id: delete, check no-dangling, glue, type-check | `triz_transform` | `typed_delete`, `typed_glue`, `typed_reroute`, `typed_retarget`, `typed_reverse`, `typed_extend` |
| Reusable move, evolution-line step | a rule L ← K → R applied by double pushout at a match found by search | `triz_rule_apply`: matches, no-identification and no-dangling conditions, fresh ids, typed result | `typed_overlay`, `typed_dpo` |
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
   - one trimming problem per absorber.

   Treat every trimming problem as a new problem to solve. Still generate at least three
   mechanisms (SKILL.md). Model the chosen concept and compare it with `compare_to`. A concept
   that drops a deliverable loses a function, whatever it saves.

   When the boxes that matter declare behaviour, call `triz_behavior` with the same `trim` and
   `absorb`. It decides whether the trim preserves the input→deliverable relation (see
   [Declared behaviour](#declared-behaviour)). A `preserved` verdict holds for the relations as
   declared; substantiate each of them, the absorber's first.

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
   - `separated`: the listed axes separate the demands. Assign the parameter piecewise.
   - `irreducible`: the demands overlap on every axis. Refine an axis, try another system level,
     or escalate to ARIZ.

   For a separation in time, the snapshot check says which value each stage needs. When the
   boxes declare state, `triz_dynamics` with `separation` says whether one run of the declared
   dynamics meets each demand within its time window.

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
   and regained. `merge` renames the merged ports as well, so no box map recovers them.
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
needs no theorem, such as a compatible pair, cites none.

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

With `trim`, the trim is applied as `triz_transform` does, and the verdict is one of:

- `changed`, reason `lost-deliverables`: a deliverable port has no non-harmful function after
  the trim. No behaviour is needed for this.
- `undecided`, reason `missing-behavior`: a box that can reach a deliverable, in the baseline
  or in the trimmed model, declares no behaviour. The output names those boxes. Segmentation,
  Taking out, Intermediary, and Merging build new boxes without behaviour, so their results stay
  undecided until you declare it; `merge` lists the boxes whose behaviour it drops
  (`droppedBehavior`). `cheap_copy` keeps the box's behaviour, and `reverse` refuses to add a
  port to a box that declares behaviour.
- `undecided`, reason `no-steady-state`: neither model has a steady state at any compared
  input, so both relations are empty and their equality says nothing about the trim.
- `preserved`: the baseline and trimmed input→deliverable relations are equal, and at least
  one of them is non-empty.
- `changed`, reason `counterexample`: the relations differ. The output gives the first input
  where they differ, the outputs of each model there, and the `direction`: the trimmed relation
  strictly contains the baseline, the baseline strictly contains it, or neither.

The two relations are compared over the union of their boundary inputs. A port that only one
model reads, such as an input the trim leaves unwired, ranges over every declared value in both
models (`inputsOnlyIn`). A counterexample that sets such a port follows from the model, not
from the physics. The result counts, per model, the input valuations with no steady state
(`noSteadyState`), and the compared inputs where neither model has one (`emptyInBoth`). Two
relations that are empty everywhere read `undecided`, never `preserved`. When only some inputs
are empty in both, those inputs agree and are counted. `preserved` then also rests on the
inputs where both models have steady states. If one model has steady states at an input and
the other has none, the verdict is `changed`, and the counterexample says which side is empty.
Boundary valuations and search states are capped (`max_states`, at most 100000); past the cap
the call fails closed.

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
  - `escalating`: a closed component meets the unsafe set, a trap. A shortest trace from a start
    into it is the counterexample, and says whether it starts from an initial or a safe state;
  - `oscillating`: a closed component with a cycle and no fixed point. The result gives one
    shortest cycle, whose length is at least two, and the period, the gcd of the cycle lengths.
    A period of 1 means cycles of coprime lengths, not a fixed point.

  `none` means no closed component was found within the cap. A model whose only closed
  component settles at one fixed point outside the unsafe set has no class. `harmLoops` lists
  the harm loops through the stateful boxes; the classification is of the composite they run in.

In `theory/`, `Closed` says no step leaves a set. Lean proves that a fixed point lies on a cycle
(`fixed_on_cycle`), that a closed set holds every run that enters it at any number of steps
(`closed_reachIn`), and that without a fixed point every return takes at least two steps
(`return_ge_two`).

In `bearing-heat-dynamics.json` the shaft has a temperature state. From `cold`, the
heat → preload loop reaches `hot` in two steps, and `hot` is a trap: the loop is `escalating`.
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
  Every other box contributes only its fixed `cost`. Segmentation, Taking out, and Intermediary
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

## Principle constructions

A construction is listed here only when the principle's text, looked up in
`data/principles.json` (`triz_principle`), describes a move the kernel can make and check: a
structural one, or for Principle 15 a parametric one. Each row makes the structural part of the principle checkable. That does not show the
principle solves the problem. [All 40 principles](#all-40-principles) gives the class of each
one and why.

| Principle | Text (`triz_principle`) | Construction | Checked |
|---|---|---|---|
| 1 Segmentation | "Divide an object into independent parts; make it sectional or modular." | `segment`: a box becomes parts whose ports partition its ports. Each wire follows its port, and each cost dimension goes wholly to one part. | The partition is exact and ids are fresh. The result reports whether the parts are independent, meaning no wire joins two parts. For a box with no self-loop, collapsing the parts gives back a model isomorphic to the original. A self-loop instead ends up between parts, or in the collapse's `hidden` list. |
| 2 Taking out | "Separate an interfering part or isolate the only needed part." | `take_out`: split the given ports off into a new box. | Reading `interfering`: the split-off ports touch a harmful or excessive function. Reading `needed`: they carry every useful function, so the remainder is a trimming candidate. |
| 5 Merging | "Bring identical or adjacent operations together in space or time." | `merge`: `collapse` the boxes into one. | Reading `adjacent` (default): functions inside the group join every box. Reading `identical`: the same role and the same carriers on each side; names and actions are labels and are not compared. Every path maps to a path (`reach_quotient`), but a merge can close loops: harms newly on a harm loop are listed, as are the hidden internal functions. |
| 6 Universality | "Make an object perform multiple functions and eliminate other parts." | `trim` with every `absorb` choice on one box. No new operation. | As for `trim`: each re-attached function goes to a typed absorber. The result shows the box performing its own and the absorbed functions. |
| 11 Beforehand cushioning | "Prepare emergency means beforehand to offset low reliability." | `standby`: an unwired box with an output port for each port through which the box performs a useful function on another box. | Harm loops, deliverables, and every existing function are unchanged; only cost is added. Losing the box is modelled as trimming it: afterwards `triz_trim` lists the standby as an absorber of each such function, and `newlyCovered` lists those that had none. |
| 13 The other way round | "Invert the action; make movable parts fixed and fixed parts movable." | `reverse`: u → v becomes v → u with the same id, carrier, and rating. | Needs an output of the carrier on v and an input on u; a named port the box lacks is added (`typed_extend`), and none or several unnamed ones fail closed. The edge set changes by exactly that converse. The returned `undo`, a `rewrite`, gives back the original model, added ports included. |
| 15 Dynamics | "Allow characteristics to change so they are optimal at each stage." | `triz_separate` with `along: "time"`: the parameter as a function of time cells alone. | `dynamizable` only when every stage has an admissible value and no single value meets all stages. A constant that works is reported as `constant-suffices`, not as Principle 15. Values are admissible, not optimised. |
| 16 Partial or excessive action | "If the full action is difficult, do slightly less or slightly more." | `rerate`: a useful function becomes insufficient or excessive; `cost` may set the performer's new cost. | Deliverables are unchanged. Insufficient never creates a harm loop; excessive creates one exactly when the function is on a cycle that had no harmful or excessive function. Without a cost change, `compare_to` reports the concept worse on `defective`. |
| 22 Blessing in disguise | "Use a harmful factor to achieve a positive effect." | `retarget`: the harmful function's source port feeds a useful function at another input of the same carrier. | By default the factor is redirected: one harmful function fewer, one useful one more. With `keep_harm`, the harm stays and the useful function is added. The harm's own object port is refused, since rating it useful there is not using the factor elsewhere. |
| 23 Feedback | "Introduce feedback, or change the magnitude and influence of existing feedback." | `feedback` adds a function; `rerate` with `reading: "feedback"` changes the level of one. | `feedback`: the new function's object already reaches its performer, so it lies on the returned witness cycle (`edge_on_cycle`), reported as a control loop or a harm loop. `rerate`: the function is on a cycle, and the harm loops created and removed are listed. |
| 24 Intermediary | "Use an intermediary carrier or process, temporarily or permanently." | `interpose`: a function u → v becomes u → m → v through a new mediator box. | Both legs keep the carrier, and keep the rating unless it is overridden. Reachability among the original boxes is unchanged. With inherited ratings, harm-loop membership is unchanged too. "Temporarily" is not modelled. |
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
4. Declared rows:
   - A kept box that declares `behavior` or `transition` must keep its ports, because its rows
     name every port once. A rule that adds or deletes one of its ports fails with
     `behaviour:`; restate or remove the rows first.
   - A kept box that declares `feasibility` may gain ports, where its rows provide and need 0,
     but must keep every port its rows name. A rule that deletes one fails with
     `feasibility:`; restate or remove the rows first.
   - A `like` copy copies none of these rows.
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
  is claimed for a base whose regions carry more structure.
- For models that declare behaviour, `triz_behavior` decides a finite relational question:
  whether the trimmed model's input→deliverable relation equals the baseline's. Series composition is Mathlib's `Relation.Comp`, and
  its associativity is Mathlib's `Relation.comp_assoc`. Lean proves only that it is monotone,
  that the trace is monotone, that the trace of a swap is the identity, that every value is a
  steady state of an identity loop, and that a negation loop has none. The evaluator is checked
  by tests, not extracted from these statements.
- Declared behaviour is steady-state semantics. The relational trace says nothing about
  dynamics, convergence, or which steady state the system reaches. Behaviour uses no least
  fixpoint: its values are unordered, so there is no least value to iterate from, and iterating
  from no value delivers nothing on an unseeded loop. Feasibility uses one because its levels are
  ordered and its relations monotone ([Co-design feasibility](#co-design-feasibility)).
  `triz_dynamics` adds bounded runs only where state and initial states are declared.
- Dynamics are finite and discrete. Smooth dynamics (ODEs, tangent bundles), controller
  synthesis, double categories, and profunctor coend formulas are not adopted. A `reachable`
  trace is a candidate mechanism whose rows must be substantiated. `unreachable` holds for the
  rows and initial states as declared. A loop class describes the declared state graph:
  `escalating` means a closed component meets the unsafe set, not that a physical quantity
  grows without bound. Dynamics verdicts are not covered by the label-blindness
  property tests, and traces break ties in declaration order.
- `preserved` means equal relations, not equal non-empty outputs at every input. An input with
  no steady state in either model agrees vacuously; only relations empty everywhere are
  refused (`undecided`, `no-steady-state`).
- A `preserved` verdict holds for the relations as declared. Whether they are true, the
  absorber's above all, is outside the kernel, and so are the absorber's new harms. Its added
  cost is `triz_feasibility`'s question. Downstream boxes are not composed; see
  `partialDownstream`.
- A `triz_feasibility` verdict holds for the rows as declared. Whether they are true, the
  absorber's above all, is outside the kernel, and so are the absorber's new harms.
  - Monotone reading is an assumption. A box that works worse with more input, which an
    excessive function suggests, is outside it, and the ratings are not read.
  - A loop is feasible whenever its rows are consistent. Losses and conservation must be in the
    rows; the solver does not know physics.
  - Lean proves that series, parallel, and feedback composition keep monotonicity, that Kleene's
    ascent reaches the least fixpoint of a finite lattice, that a step can be computed on the
    antichain when requirements are monotone, and that the least fixpoint is the upward closure
    of the feasible configurations. The solver is checked against these by tests, including
    the brute-force comparison, not extracted from them.
  - Feasibility verdicts are not covered by the label-blindness property tests.
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
  (`comparison.isomorphism`) does not compare carrier values, declared behaviour, feasibility,
  or dynamics, so isomorphic models can get different `triz_behavior`, `triz_feasibility`, and
  `triz_dynamics` verdicts.
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
  Each absorber's new harms are not modelled. Its added cost is modelled only where the boxes
  declare feasibility (`triz_feasibility`).
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
