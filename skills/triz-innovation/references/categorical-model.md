# Categorical function models

Write the function model as typed data and let the `triz` MCP server check it, instead of
drawing an informal diagram and reasoning over it by eye. The model is an open wiring diagram:
boxes (components) with typed input and output ports, joined by wires (TRIZ functions) that
carry one flow type and a rating. The checks are finite and deterministic, and they fail closed.

Schema: [function-model.schema.json](../schemas/function-model.schema.json). The repository's
`examples/function-models/` holds worked models of a bearing, a cached API read path, a
marketplace, and a connection pool. The connection pool has the bearing's wiring shape.
`bearing-heat-behavior.json` is the bearing with declared behaviour, and
`bearing-heat-feasibility.json` the bearing with declared feasibility.

## What each piece means

| TRIZ artifact | In the model | Check | Lean statement (`theory/`) |
|---|---|---|---|
| Component, supersystem element | box with `role` and typed ports | — | — |
| Flow (substance, energy, data, money) | carrier with `layer` and `dimension` | — | — |
| Function, rated useful (normal / insufficient / excessive) or harmful | wire from an output port to an input port, one carrier, one `polarity` | `triz_function_model`: endpoints exist, out→in, carriers agree | — |
| Back-reaction, vicious circle | a cycle through a harmful or excessive function | strongly connected regions with one witness cycle per such function | `edge_on_cycle` |
| Trimming rules A/B/C | the system recovered from what remains (left Kan extension of the restriction) | `triz_trim`: carrier screen only | `Recoverable` stated, `recoverable_id`; not decided |
| Declared behaviour, steady state | carrier `values` and box `behavior` rows: each box a finite relation; the external relation from boundary inputs to deliverables, with feedback by the relational trace | `triz_behavior`; with `trim`, decides whether the trim preserves that relation | `Relation.comp_assoc` (Mathlib), `relation_comp_mono`, `relTrace_mono`, `relTrace_swap`, `loopStates_id`, `relTrace_not_loop` |
| Absorber's added resources, co-design | box `feasibility` rows: each box a monotone feasibility relation; the composite by Kleene's ascent to the least fixpoint (Censi 2015) | `triz_feasibility`; with `trim`, decides whether the remaining boxes provide what the trim leaves them within budget | `feasibility_comp`, `feasibility_par`, `feasibility_trace`, `kleene_lfp`, `kleeneStep_upperClosure`, `codesign_lfp` |
| Ideality comparison | componentwise order on cost vectors | profile per dimension; baseline vs concept with `compare_to` | `trim_lowers_cost`, `pareto_incomparable`, `pareto_not_total` |
| Physical contradiction, separation | gluing a parameter assignment over a finite base | `triz_separate`, or embedded `contradictions` | `exists_section_iff`, `glue_of_disjoint_regions`, `no_section_of_overlap`, `separated_iff_axis`, `separation_on_condition` |
| Same model in another domain | structural isomorphism: a bijection preserving roles, port sides, shared carriers, wiring, ratings, and costs | `triz_function_model` with `compare_to` (`comparison.isomorphism`); every wiring verdict is label-blind (property tests) | `typed_rename`, `transGen_equiv` |
| Drawing the model | Graphviz DOT, or an open hypergraph: ports as carrier-typed vertices, boxes and functions as hyperedges, unwired ports as the interface | `triz_export`, golden outputs, lossless round trip | — |
| Model transformation | a rewrite at an occurrence named by id: delete, check no-dangling, glue, type-check | `triz_transform` | `typed_delete`, `typed_glue`, `typed_reroute` |
| System operator (9 windows), level axis | restriction to a subsystem; collapse of the system into one box | `triz_nine_windows` | `typed_restrict`, `restrict_restrict`, `restrict_of_subset` |

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
  Taking out, and Intermediary build new boxes without behaviour, so their results stay
  undecided until you declare it.
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
  Every other box contributes only its fixed `cost`.
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

- `feasible`: some minimal vector is within budget on every dimension (`withinBudget`).
- `infeasible`, reason `over-budget`: every minimal vector exceeds the budget somewhere.
  `binding` lists the dimensions that every one of them exceeds. It is empty when they exceed
  different dimensions; relaxing one dimension alone may then not help.
- `infeasible`, reason `unprovidable`: some box has no row for what is demanded of it, so the
  ascent ends empty, whatever the budget. The output names the box, the port, the level
  demanded, and the most any row provides.
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

The antichain per step (`max_antichain`, at most 1000), the Kleene steps (`max_iterations`, at
most 1000), and the row selections tried (1,000,000 per solve) are capped. Past a cap the call
fails closed. The ascent always ends, because every coordinate takes values in a finite set:
the declared levels, and the sums of one row per box closed under max. The antichains can still
grow exponentially with the number of boxes and rows. No polynomial bound is claimed; Censi
(2015, Prop. 5) bounds the work by the width and height of the resource poset, not by the size
of the model.

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

- Nothing computes a Kan extension, an optic or lens, sheaf cohomology, or a Grothendieck
  fibration. The categorical names identify the structure each check is a necessary condition
  of. Of those statements, only the trimming one is stated in Lean, and it is not decided.
- For models that declare behaviour, `triz_behavior` decides a finite relational question
  instead: whether the trimmed model's input→deliverable relation equals the baseline's. It is
  not proved equivalent to `Recoverable`. Series composition is Mathlib's `Relation.Comp`, and
  its associativity is Mathlib's `Relation.comp_assoc`. Lean proves only that it is monotone,
  that the trace is monotone, that the trace of a swap is the identity, that every value is a
  steady state of an identity loop, and that a negation loop has none. The evaluator is checked
  by tests, not extracted from these statements.
- Declared behaviour is steady-state semantics. The relational trace says nothing about
  dynamics, convergence, or which steady state the system reaches. Behaviour uses no least
  fixpoint: its values are unordered, so there is no least value to iterate from, and iterating
  from no value delivers nothing on an unseeded loop. Feasibility uses one because its levels are
  ordered and its relations monotone ([Co-design feasibility](#co-design-feasibility)).
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
  `trimCandidates`, `compareIdeality`, `separationCheck`, and `dynamize`. The isomorphism check
  (`comparison.isomorphism`) does not compare carrier values, declared behaviour, or
  feasibility, so isomorphic models can get different `triz_behavior` and `triz_feasibility`
  verdicts.
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
- The 9-windows time axis is the snapshots the caller writes; no transition between times is
  computed. The system operator as a fibration stays an analogy.
- Without declared behaviour, a carrier match is necessary for an absorber, not sufficient.
  Each absorber's new harms are not modelled. Its added cost is modelled only where the boxes
  declare feasibility (`triz_feasibility`).
- `harmLoops` is exhaustive for the model as written. It cannot find a back-reaction the model
  omits.
- A scalar ideality is produced only from explicit `weights` covering every cost dimension and
  `harmful`. Otherwise, costs are reported per dimension and never summed.
- Not adopted: 9 windows as a fibration, evolution trends other than trimming as rewrite rules,
  and principles other than 1, 2, 15, and 24 as transformations. The analogies are recorded in
  [sources.md](sources.md); none is implemented.
