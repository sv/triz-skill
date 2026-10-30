# Theory map

The audit companion to the skill's agent reference,
[categorical-model.md](../skills/triz-innovation/references/categorical-model.md). That file says
what each verdict means and how to act on it. This one holds what does not change what an agent
does or says: every Lean statement behind the function-model tools, cited or never cited; which
verdict cites which statement; how the compositional semantics, the verdicts, and the
certificates work inside; the classification of all 40 principles; and the complete list of what
is not claimed. Read it to audit a verdict, not to run a TRIZ session.

The Lean package is `theory/`. The literature is in [theory/REFERENCES.md](../theory/REFERENCES.md),
the implemented assurance scope in [categorical-assurance.md](categorical-assurance.md), its
acceptance criteria in [categorical-future-plan.md](categorical-future-plan.md), and the ranked
backlog in [FUTURE-PLANS.md](FUTURE-PLANS.md). Every issue and lint code is in
[error-codes.md](../skills/triz-innovation/references/error-codes.md).

## How a verdict cites Lean

Each verdict cites in `basis` the theorem in `theory/CategoricalTriz.lean` its reasoning uses,
as in the inventory below, or a Mathlib lemma a proof in that file uses. A test checks that
every cited name is a theorem in that file or such a lemma, which `lake build` then resolves.
That theorem proves the abstract fact. Tests check the TypeScript against it; nothing is
extracted from Lean. Typing, harm-loop witness, separation, reachable- and unreachable-escalation, state-only
safety, every weakness pair (strict, equal, incomparable), and preserved- and changed-behaviour
verdicts can also be certified per instance (see [Certificates](#certificates)). A basis never means the TRIZ reading of a verdict is proved. A
verdict that needs no theorem, such as a compatible pair, cites none. A theorem is cited only
where its statement is exactly what the verdict uses. The inventory marks the others as never cited.
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

`src/act-basis.ts` lists every citable name (`THEOREMS`, and `MATHLIB_THEOREMS` for Mathlib).
`tests/act-basis.test.ts` checks that each is proved, that every `basis` any tool returns names
one of them, and that the never-cited lemmas below are proved and not listed. One listed name is
emitted by no verdict: `typed_overlay`, the step of `typed_dpo`'s proof that glues the right side
on.

## Theorem inventory

Every Lean statement behind each piece of the model, per piece. "Cited" means some verdict names
it in `basis`; [Which verdict cites what](#which-verdict-cites-what) gives the verdict. Unless a
row says otherwise, the statements are in `theory/CategoricalTriz.lean`.

| Piece | Tool | Cited in `basis` | Proved, never cited | Definitions |
|---|---|---|---|---|
| Component, flow, function | `triz_function_model` | — | — | — |
| Back-reaction, vicious circle | harm loops | `edge_on_cycle` | — | — |
| Components in series along a flow | `triz_flow`; `merge` | `edge_on_cycle` (loops), `flow_merge_typed`, `flow_merge_reach` | — | `flowStep`, `mergedStep`, `mergeInto` |
| Trimming rules A/B/C | `triz_trim`; `triz_transform` `trim` | `typed_reroute`; `trim_lowers_cost` for the cost relief | — | — |
| Declared behaviour, steady state | `triz_behavior` | `Relation.comp_assoc` (Mathlib) | sanity lemmas: `relation_comp_mono`, `relTrace_mono`, `relTrace_swap`, `loopStates_id`, `relTrace_not_loop`; the semantics the evaluator computes (`theory/Semantics.lean`): `steadyStates`, `external`, `external_glueAlong`, `external_seq`, `external_par`, `external_feedbackAlong`, `external_feedback`, `external_mono`, `semantics`; the upstream scope against the whole (`theory/Semantics.lean`): `sub`, `restrict_mem_steadyStates_sub`, `external_sub_of_external`, `external_sub_iff_of_extends`, `external_sub_univ`, `extends_of_accepts` | `relTrace`, `loopStates` |
| What an unknown box must do, one box | `triz_behavior` `weakest_spec` | `le_residual_iff`, `covers_iff_exists_eq`, `not_covers_iff`, `map_empty`; with producible rows, `covers_feasible_iff`, `not_covers_feasible_iff`, `required_row_of_eq` | `relation_comp_iSup_left`, `relation_comp_iSup_right`, `relTrace_iSup`, `gc_residual`, `map_residual_subset`, `subset_residual_of_eq`; `holeContext_preservesUnions` (`theory/Semantics.lean`) | `residual` |
| What two unknown boxes must do | `triz_behavior` `weakest_spec` | `safe_iff_le_concept`, `concept_maximal`, `exists_eq₂_iff`; with producible rows, `safe_feasible_iff`, `safe_feasible_iff_le_concept`, `concept_feasible_maximal`, `exists_eq₂_feasible_iff` | `PreservesUnions₂.mono`, `le_safeRows_iff`, `concept_safe`, `PreservesUnions₂.cut`, `safeRows_cut`; `holeContext₂_preservesUnions₂` (`theory/Semantics.lean`) | Mathlib's `Concept` |
| Weakness of a concept | `triz_weakness` | `incomparable_of_witnesses`, `card_lt_of_strictly_weaker`; `level_gc` for a threshold | `admits_incomparable`, `admits_bot`, `admits_mono_ok`, `atLeastAsWeak_refl`, `atLeastAsWeak_trans` | `admits`, `AtLeastAsWeak` |
| Dynamics: escalation, invariance, separation in time | `triz_dynamics` | `reachIn_iff_trace`, `reachWithin_iff_trace`, `reach_of_trace`, `reachIn_of_trace`, `reachWithin_saturated`, `unreachable_of_invariant` | `mealyStep_mono`, `reachIn_mono`, `reachWithin_mono`; dynamics read as behaviour, which the kernel does not compute: `relTrace_mealyRel_iff`, `relTrace_mealyRel_fixed` | `mealyStep`, `reachIn`, `reachWithin` |
| Loop behaviour | `triz_dynamics` `loops` | `fixed_on_cycle`, `closed_reachIn`, `trapped_reachIn`, `recurrent_reach`, `return_ge_two` | — | `Closed` |
| Co-design feasibility | `triz_feasibility` | `kleene_lfp`, `kleeneStep_upperClosure`, `codesign_lfp` | `feasibility_comp`, `feasibility_par`, `feasibility_trace`; for extensive carriers, `selection_mono`, `extensive_demand_mono` | — |
| Levels | `triz_feasibility`, `triz_abstraction`, `triz_weakness` | `level_monotone`, `level_gc`, `level_band` | — | — |
| Abstraction | `triz_abstraction` | `typed_restrict` and `typed_map` (typed), `reach_map`, `cycle_map`, `reach_quotient` (flows) | — | `Wiring.map` |
| Ideality comparison | `triz_function_model`, `triz_trim` | `trim_lowers_cost`, `pareto_incomparable`, `pareto_not_total` | — | — |
| Physical contradiction, separation | `triz_separate` | `exists_section_iff`, `glue_of_disjoint_regions`, `no_section_of_overlap`, `separated_iff_axis` | `separation_on_condition` | — |
| Same model in another domain | `comparison.isomorphism` | `typed_rename`, `transGen_equiv` | — | — |
| Certificate of one run | `scripts/certify.mjs` | none: a certificate proves its own statements; see [Certificates](#certificates) | used by the proofs, never cited: `WireClasses.eq_root`, `WireClasses.exists_eq_comp`, `WireClasses.comp_respects`, `Rows.exists_steady_iff_classes`, `Rows.relation_eq_classes`, `Sync.unreachable_of_holding_classes`, `Sync.closed_of_classes`, `admitted_ssubset` | `Wiring.Typed`, `Wiring.Acts`; row tables `Sync.Step`, `Rows.relation`, `Rows.classRelation`; port classes `WireClasses`, `WireClasses.Ok` |
| Model transformation | `triz_transform` | `typed_delete`, `typed_glue`, `typed_reroute`, `typed_retarget`, `typed_reverse`, `typed_extend`; per construction, `reach_quotient`, `flow_merge_typed`, `flow_merge_reach`, `edge_on_cycle`, `typed_rename`, `cheaper_part_lowers_cost` | — | — |
| Reusable move, evolution-line step | `triz_rule_apply` | `typed_dpo` | `typed_overlay` (listed as citable, emitted by no verdict) | — |
| A subsystem that lags | `uneven-development` | `edge_on_cycle`; the feasibility verdict's basis | — | — |
| Behaviour through a construction | `triz_transform` segment, take_out, interpose | `eq_projections_prod_iff_rectangle`, `eq_projections_prod_iff`, `eq_projections_pi_iff`, `Relation.comp_eq` (Mathlib) | — | — |
| Which ports of a box are independent | `behavior.finest`, `factorisations` | `IsFinest.addPort`, `factors_split_iff`, `IsFinest.factors_iff` | `Factors.inf`, `Factors.mono`, `Factors.onPorts`, `exists_isFinest`, `IsFinest.unique`, `IsFinest.rel_iff`, `factors_bot_iff`, `factors_empty`, `isFinest_onPorts_empty` | `Factors`, `IsFinest` |
| System operator, level axis | `triz_nine_windows` | `typed_restrict` | used by `supportedOn`, never cited: `restrict_restrict`, `restrict_of_subset` | `supportedOn`, `typedOn` |
| System operator, time axis | `triz_nine_windows` `transitions` | `restrict_rewrite`, `restrict_rewrite_of_inside`, `boundary_rewrite` | — | `restrictionGrid` |

The certificate statements use `edge_on_cycle`, `exists_section_iff`, `glue_of_disjoint_regions`,
`no_section_of_overlap`, and `separated_iff_axis` over `Wiring.Typed` and `Wiring.Acts`, and
`reach_of_trace`, `unreachable_of_invariant`, `unreachable_of_holding_classes`, `closed_of_classes`,
`AtLeastAsWeak`, `admitted_ssubset`, `card_lt_of_strictly_weaker`, and `incomparable_of_witnesses`
over the row tables `Sync.Step` and `Rows.relation`, read through the port classes
(`relation_eq_classes`) where a proof enumerates valuations (`theory/Certificates/`).

## Which verdict cites what

| Tool | Verdict or field | `basis` |
|---|---|---|
| `triz_function_model` | each harm loop | `edge_on_cycle` |
| `triz_function_model` | a scalar ratio refused for lack of weights | `pareto_not_total` |
| `triz_function_model` | a `trade-off` comparison | `pareto_incomparable` |
| `triz_function_model` | `comparison.isomorphism`, when isomorphic | `typed_rename`, `transGen_equiv` |
| `triz_separate`, embedded separation | the whole check; `along` | `exists_section_iff` |
| `triz_separate` | a `separated` pair | `separated_iff_axis`, `glue_of_disjoint_regions` |
| `triz_separate` | an `irreducible` pair | `separated_iff_axis`, `no_section_of_overlap` |
| `triz_trim` | each function with an absorber | `typed_reroute` |
| `triz_trim` | `costBound`, when a trimmed box declares a cost | `trim_lowers_cost` |
| `triz_transform` | every rewrite step | `typed_delete`, `typed_glue` |
| `triz_transform` | `trim`, `standby` | adds `typed_reroute` |
| `triz_transform` | `merge` | adds `reach_quotient`; with flows, `flows` cites `flow_merge_typed`, `flow_merge_reach` |
| `triz_transform` | `feedback`; `rerate` on a cycle | adds `edge_on_cycle` |
| `triz_transform` | `retarget` (without `keep_harm`) | adds `typed_retarget` |
| `triz_transform` | `reverse` | adds `typed_reverse`, and `typed_extend` when a port is added |
| `triz_transform` | `cheap_copy` | adds `cheaper_part_lowers_cost`, and `typed_rename` under a new id |
| `triz_transform` | segment/take_out `behavior`: independent | `eq_projections_prod_iff_rectangle` (two parts) or `eq_projections_pi_iff` |
| `triz_transform` | segment/take_out `behavior`: coupled | `eq_projections_prod_iff_rectangle` with `eq_projections_prod_iff` (two parts) or `eq_projections_pi_iff` |
| `triz_transform`, `triz_behavior` | `behavior.finest`, `factorisations` | `IsFinest.addPort`, `factors_split_iff`, `IsFinest.factors_iff` |
| `triz_transform` | `interpose` with an identity mediator | `Relation.comp_eq` |
| `triz_rule_apply` | an applied rule | `typed_dpo` |
| `triz_rule_apply` `uneven-development` | each harm-loop region | `edge_on_cycle` |
| `triz_flow` | each loop; each harm loop it meets | `edge_on_cycle` |
| `triz_nine_windows` | subsystem view | `typed_restrict` |
| `triz_nine_windows` | supersystem view | `typed_delete`, `typed_glue` |
| `triz_nine_windows` | a transition's subsystem step | `restrict_rewrite`, `boundary_rewrite`; with `withinSubsystem`, also `restrict_rewrite_of_inside` |
| `triz_behavior` | the composed relation | `Relation.comp_assoc` |
| `triz_behavior` `weakest_spec`, one box | `spec` | `le_residual_iff`, and `covers_iff_exists_eq`, or `covers_feasible_iff` with producible rows |
| `triz_behavior` `weakest_spec`, one box | `impossible`, `not-covered` | `not_covers_iff`, and `map_empty` when the spec is empty |
| `triz_behavior` `weakest_spec`, one box | `impossible`, `infeasible` | `not_covers_feasible_iff`, `required_row_of_eq`, and `map_empty` when the cut spec is empty |
| `triz_behavior` `weakest_spec`, two boxes | `spec` | `safe_iff_le_concept`, `concept_maximal`, `exists_eq₂_iff`; with producible rows, `safe_feasible_iff`, `safe_feasible_iff_le_concept`, `concept_feasible_maximal`, `exists_eq₂_feasible_iff` |
| `triz_behavior` `weakest_spec`, two boxes | `impossible`, `infeasible` | `exists_eq₂_feasible_iff`, `exists_eq₂_iff` |
| `triz_behavior` `weakest_spec`, two boxes | `impossible`, `not-covered` | `exists_eq₂_iff` |
| `triz_weakness` | a strict pair | `card_lt_of_strictly_weaker` |
| `triz_weakness` | an incomparable pair | `incomparable_of_witnesses` |
| `triz_weakness`, `triz_nine_windows` | an acceptable set derived from a threshold | `level_gc` |
| `triz_dynamics` | `reachable`, `violated` | `reach_of_trace` |
| `triz_dynamics` | `unreachable` | `reachWithin_iff_trace`, `reachWithin_saturated`, `unreachable_of_invariant` |
| `triz_dynamics` | `invariant` | `reachWithin_iff_trace`, `reachWithin_saturated` |
| `triz_dynamics` | `unreachable-within-horizon`, `invariant-within-horizon` | `reachWithin_iff_trace` |
| `triz_dynamics` | separation `realizable` | `reachIn_of_trace` |
| `triz_dynamics` | separation `unrealizable` | `reachIn_iff_trace` |
| `triz_dynamics` `loops` | `bistable` | `fixed_on_cycle`, `closed_reachIn` |
| `triz_dynamics` `loops` | `trapped` | `trapped_reachIn`, `reach_of_trace` |
| `triz_dynamics` `loops` | `recurrent` | `closed_reachIn`, `recurrent_reach`, `reach_of_trace` |
| `triz_dynamics` `loops` | `oscillating` | `closed_reachIn`, `return_ge_two` |
| `triz_feasibility` | the solution, and the `binding` and `unprovidable` findings | `kleene_lfp`, `kleeneStep_upperClosure`, `codesign_lfp` |
| `triz_feasibility`, `triz_abstraction` | `levels` | `level_monotone`, `level_gc`, `level_band` |
| `triz_abstraction` | `typed` | `typed_restrict`, `typed_map` |
| `triz_abstraction` | `reachability`, when nothing is forgotten | `reach_map` |
| `triz_abstraction` | each backed coarse harm loop; each detailed loop's `image` | `cycle_map` |
| `triz_abstraction` | `flows` | `reach_quotient` |

The constants live beside the code that emits them: `src/act-basis.ts`, `src/act-behavior.ts`,
`src/act-dynamics.ts`, `src/act-feasibility.ts`, `src/act-levels.ts`, `src/act-abstraction.ts`,
`src/act-rewrite.ts`, `src/act-principles.ts`, `src/act-windows.ts`, `src/act-flow.ts`, and
`src/act-rule.ts`. `tests/act-basis.test.ts` pins the citations above on the examples.

## Compositional semantics

`theory/Semantics.lean` defines the semantics `triz_behavior` computes
([Declared behaviour](../skills/triz-innovation/references/categorical-model.md#declared-behaviour))
for an open diagram over values `V`. Ports
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
  [weakest box specification](../skills/triz-innovation/references/categorical-model.md#weakest-box-specification), for every diagram, with the hole any
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
relation (`restrict_mem_steadyStates_sub` only through `external_sub_of_external`, whose proof
uses it). It gives a counterexample for each hypothesis of series, feedback, and monotonicity
(`hc`, `hj`, `hu`, `h`), and for what `holeContext_preservesUnions` assumes of the hole, that it
occurs once. For the part of a diagram (`sub`) only the extension hypothesis has one: a
downstream box that rules out a pair the upstream part relates shows that
`external_sub_iff_of_extends` needs it, and that `extends_of_accepts` needs `hrest`. The
interface hypotheses `hI` and `hO`, and the locality hypothesis `hloc`, have none.

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

The steady-state reading of a loop (`triz_behavior`, "Steady states"): in `theory/`,
`relTrace R a b` is, by definition, `(loopStates R a b).Nonempty`: a pair is related iff it has a
steady state. The relation cites Mathlib's `Relation.comp_assoc`: composing the relations along the
wiring does not depend on bracketing.

## Inside the verdicts

What each verdict computes and how it is checked, beyond what the agent reference needs.

### Behaviour through the constructions

- **Deciding a split.** Since R is always contained in the product of its projections, equality
  is decided by counting distinct rows, |R| = Π|πᵢR|, in about k·|R| steps for k parts, without
  enumerating the product. A pairwise test would not do: in c = a xor b, any two ports range
  freely, yet no port splits off.
- **The coupling witness's order.** The witness is the first such pair with rows in
  lexicographic order of their values (ports in box order, inputs then outputs; values compared
  by code unit). That order is the one tie-break, and it reads value names and port order, so a
  witness is label-blind only up to it.
- **The suggested partition.** Lean proves that it exists and is unique, for a box with at least
  one port (`exists_isFinest`, `IsFinest.unique`): if R factors over two partitions, it factors
  over their common refinement (`Factors.inf`). A partition splits R iff each of its parts is a
  union of suggested blocks (`IsFinest.factors_iff`). Two ports share a block iff no split of the
  ports into two groups that R factors over separates them (`IsFinest.rel_iff`). The kernel adds
  the ports one at a time, in box order (inputs, then outputs). It keeps the finest blocks of R's
  projection onto the ports so far, and each new port joins exactly the blocks the rectangle test
  couples to the rest, on the projection onto the ports so far and the new one
  (`IsFinest.addPort`; the test is `factors_split_iff`, decided by counting as above). Testing
  each port against all the others instead would merge too much: for a = b and c = d, every port
  is coupled to the rest, yet {a, b} and {c, d} split (`theory/Witnesses.lean`). This reads about
  n³·|R|/2 cells for n ports and |R| distinct rows. The empty relation factors over single ports.
  Tests compare the result with a brute force over every partition of random boxes with up to
  five ports.

### Weakest box specification

- **One box.** Composition and the trace preserve unions (`relation_comp_iSup_left`,
  `relation_comp_iSup_right`, `relTrace_iSup`). The box occurs once in the join, so `C[R]` is the
  union of its rows' composites. Then `R ⊆ W` iff `C[R]` stays inside the target
  (`le_residual_iff`; `gc_residual`, a Galois connection). So `W` is the weakest box
  specification, the residual in Rel. One search finds every row's composite: the box admits
  every row, and each steady state is grouped by the row it uses. With three or more boxes
  without behaviour, the largest safe relation for one depends on the relations chosen for the
  others, so no box has a single weakest choice. Lean states nothing for three or more, and the
  kernel computes nothing.
- **Two boxes.** The context `C` sends a pair of relations `(R₁, R₂)` to `C[R₁, R₂]`. It
  preserves unions in each box (`holeContext₂_preservesUnions₂`), so a pair stays inside the
  target iff every pair of rows, one of each box, does (`le_safeRows_iff`). One search finds
  every row pair's composite: both boxes admit every row, and each steady state is grouped by the
  two rows it uses. The safe pairs of relations are the rectangles inside the safe row pairs.
  Each lies inside a formal concept of that relation (Mathlib's `Concept`), and the concepts are
  exactly the maximal safe pairs (`safe_iff_le_concept`, `concept_maximal`). The kernel
  enumerates them by intersection closure: each set of second-box rows is an intersection of the
  safe sets of first-box rows.
- **Two boxes within producible rows.** Each box's rows are cut to its `producible` rows first.
  The cut context still preserves unions in each box (`PreservesUnions₂.cut`), and a pair of
  producible relations stays inside the target iff its product lies inside the safe row pairs
  intersected with the producible ones (`safe_feasible_iff`). The concepts are those of that
  relation on the producible rows, and the same lemmas hold within the cut
  (`safe_feasible_iff_le_concept`, `concept_feasible_maximal`, `exists_eq₂_feasible_iff`).
- **Re-check.** For one box, the kernel declares the spec (`W`, or `W ∩ F`), recomputes the
  concept's relation, and compares it with the target before it answers. For two boxes, each
  returned pair is re-checked: the kernel declares both relations, recomputes the concept's
  relation, and compares it with the target.

### Weakness ranking

A situation with no steady state is not admitted (`admits_bot`), so having no behaviour never
makes a concept weak. Concepts are ranked by inclusion of what they admit (`AtLeastAsWeak`, a
preorder: `atLeastAsWeak_refl`, `atLeastAsWeak_trans`). Inclusion is not total
(`admits_incomparable`). A more permissive acceptability predicate never removes an admitted
situation (`admits_mono_ok`).

### Declared dynamics

Such a box is a nondeterministic Mealy machine, a map `S × I → P(S × O)`. A lens or optic with a
residual is exactly such a machine, with the residual as its state. Only that identification is
claimed: no lens laws, no optic composition beyond the synchronous composition `triz_dynamics`
computes, no profunctor formula.

In `theory/`, `mealyStep` is one step of a machine under the admissible inputs, and `reachIn`
and `reachWithin` are reachability in exactly and within n steps. Lean proves:

- `reachIn_iff_trace`, `reachWithin_iff_trace`: reachability is an existential over traces;
- `reach_of_trace`: a counterexample trace is sound;
- `reachIn_of_trace`: every point of one trace is reached at its own time;
- `reachWithin_saturated`: a layer that adds nothing completes the reachable set;
- `mealyStep_mono`, `reachIn_mono`, `reachWithin_mono`: more rows or inputs remove no step.

They hold for any step relation, so they cover the kernel's configuration graph. Lean does not
prove that the search computes that graph; tests check it.

The reached fixed points are checked by tests, on the examples: the steps staying at a reached
fixed point are exactly the steady states `triz_behavior` finds when each stateful box is frozen
at that state. For stateless boxes every configuration is such a fixed point, and every step's
valuations are the steady states.

### Loop classification

In `theory/`, `Closed` says no step leaves a set. Lean proves that a fixed point lies on a cycle
(`fixed_on_cycle`), that a closed set holds every run that enters it at any number of steps
(`closed_reachIn`), that from a closed set inside the unsafe set every reachable state is unsafe
(`trapped_reachIn`), that from every state a run reaches inside a closed set whose states reach
each other, a state of the unsafe set and a safe one both stay reachable when the set holds one of
each (`recurrent_reach`), and that without a fixed point every return takes at least two steps
(`return_ge_two`). `theory/Witnesses.lean` has a closed set that meets the unsafe set without
lying inside it and reaches a safe state: the recurrent case, which `trapped_reachIn` excludes.
It also shows that `recurrent_reach` needs each hypothesis.

### Co-design feasibility

The ascent is Kleene's (Censi 2015, Def. 22, eq. 26). Feedback loops need no special case:
demands only grow along the ascent, and where they stop growing, the minimal configurations are
exactly the minimal feasible ones (`kleene_lfp`, `kleeneStep_upperClosure`, `codesign_lfp`). A
test checks the result against every row selection of 300 random models. Lean also proves that
series, parallel, and feedback composition keep monotonicity (`feasibility_comp`,
`feasibility_par`, `feasibility_trace`); no verdict cites these.

**Extensive and intensive carriers.** Several demands on one output port take their maximum on an
intensive carrier (the default: one shared level) and their sum on a carrier declared
`quantity: "extensive"` (an amount that divides). The step keeps its selection shape either way:
the demand a selection places depends on the rows chosen, not on the configuration it serves, so
`kleeneStep_upperClosure`'s hypothesis holds as soon as a smaller demand admits every selection a
larger one does (`selection_mono`). The sum is monotone in each consumer's demand, as the maximum
is (`extensive_demand_mono`), so dropping a dominated partial selection after each box stays
sound. Neither lemma is cited in `basis`, which is unchanged. The brute-force test runs again with
every carrier extensive: each output must supply the sum of what its functions' targets require.
An extensive input fed by several functions fails closed (`extensive-fan-in`): how the amount
divides among the feeders is not declared, and the solver does not choose a split.

The ascent always ends, because every coordinate takes values in a finite set: the declared
levels and, on an extensive port, their sums over the consumers, and the sums of one row per box,
closed under max. The antichains can still grow
exponentially with the number of boxes and rows. No polynomial bound is claimed. Censi (2015,
Prop. 5) bounds the work by the width of the loop's resource poset, the height of its lattice of
antichains, and the cost of one evaluation, not by the size of the model.

Feasibility and behaviour answer different questions about a loop. `triz_behavior` asks which
values flow: a wire equates its ports' values, and values have no order. A loop is therefore
solved by its steady states, the trace, and not by iterating up from a least value.
`triz_feasibility` asks how much is needed: levels are ordered, and requirements are monotone.
Iterating up from nothing demanded therefore reaches the least fixpoint, and that is the answer.

### Abstraction between models

The typed check: each mapped port lands on a port of the same side whose carrier is its own
carrier's image, in the same layer. Then the image of the detailed model's mapped part is typed
(`typed_map`); the map need not be injective, so `typed_rename` would not do. The harm-loop
check maps the detailed loop onto a coarse loop through each harmful or excessive coarse
function (`cycle_map`, from `reach_quotient`).

### Flows

`theory/` states two facts about a merge, for any group. `flow_merge_typed`: every box on the
merged flow, the mapped path with repeats in a row dropped, is a box of the merged model.
`flow_merge_reach`: a box outside the group that reached another one outside it along a flow
still reaches it along the merged flow, whose steps (`mergedStep`) are the images of the steps
whose ends land in different boxes. It rests on `reach_quotient`. A property test checks that
the kernel's merged paths have exactly those steps. Adjacency is not a hypothesis of either: it
is Principle 5's reading. What it buys is shown in `Witnesses.lean`: merging the adjacent boxes 1
and 2 of the flow 0 → 1 → 2 → 3 leaves no loop, and merging 1 and 3 closes the loop 1 → 2 → 1.

### Rules (double pushout)

The steps named here are the application steps in the agent reference's
[Rules](../skills/triz-innovation/references/categorical-model.md#rules-double-pushout).

For matching, a model is read as a hypergraph in the sense of Bonchi et al. (2022, Def. 3.1).
Boxes and ports are vertices. Each port has a `port-of` hyperedge to its box, labelled by side
and carrier. Each wire is a hyperedge from its source port to its target port, labelled by
carrier and rating. A match instantiates the rule: it binds the carrier variables, takes any role
or rating the pattern leaves out from the matched element, and resolves `like` copies. On the
instantiated rule, the match is a label-preserving homomorphism, and the application conditions
are that rule's. So a pattern box matches any box that has at least the pattern's ports.

The no-identification and no-dangling conditions: Bonchi et al. (2022, Def. 3.16 and
Prop. 3.17) show that these two conditions are exactly what the pushout complement needs.

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

## Certificates

A generated certificate contains finite source tables, precisely stated verdicts, and a manifest.
Generation is distinct from successful Lean checking. The manifest binds the complete authoritative
request and records scope, source SHA256, schema/generator/theory versions and toolchain pins.

What each kind of certificate proves, and which cases are unsupported, is tabulated in the agent
reference's [Certificates](../skills/triz-innovation/references/categorical-model.md#certificates).

The `Rows` encoding says each box admits its port valuation and every wire equates its ends.
Weakness admission requires a nonempty output set and every output acceptable, so a favorable
output alone proves nothing universal. Behavior inequality includes membership and nonmembership
at one pair; it does not certify every separately reported containment direction. Negative dynamics
invariants contain all port valuations of each selected machine state, because `Sync.Step` constrains
successor machine states but not successor consistency. A BFS node list is not automatically closed.

**Port classes.** A function says its two ports carry one value, so the ports a chain of functions
joins are one variable. A certificate that enumerates valuations (behaviour, weakness, a state-only
invariant's closure, a saturated port target) carries the classes as proof data: `portClass`, a
`classRoot` per class, and a spanning forest, `portLink` (the function each port was reached by) and
`portRank`. `WireClasses.Ok` checks it: every function joins two ports of one class, and from every
port the links lead to its class's root, the rank falling at each step. A class map that joins two
ports no path of functions joins fails that check, and so does every verdict whose proof reads it
(`--tamper`'s "port classes merged"). Given the check, a valuation every function respects is a
valuation of the classes read through `portClass` (`WireClasses.eq_root`, `exists_eq_comp`). So:

- `Rows.exists_steady_iff_classes`: a steady state exists exactly when one exists through the
  classes, and `Rows.relation_eq_classes` rewrites `rows.relation` to `rows.classRelation`, which
  `decide` evaluates over a value per class;
- `Sync.unreachable_of_holding_classes` is `unreachable_of_holding` with its three valuation checks
  over the classes, and `Sync.closed_of_classes` decides a state set's closure the same way;
- `admitted_ssubset` gives a strict count from the two inclusions, each decided on its own.

The certified statements stay over raw ports, and the checker pins them as before; only the
proofs, and the tables they read, change. Initial coverage, unsafe exclusion, and safe containment
of a state-only invariant read no valuation at all, so their proofs quantify over the global states
only. The work estimate (`tableReads` on a generated certificate, capped at `MAX_CERT_ROWS`) raises
the value count to the number of classes, not of ports: for `bearing-heat-behavior`'s trim, 4,550
table reads instead of 69,376, and a chain of eight binary mediators (18 ports, 9 classes), which
read 368,050,176 over its ports, now fits. A trace certificate checks one valuation per step and
carries no classes.

The request records `kind` (`model`, `separation`, `behavior`, `weakness`, or `dynamics`) and all of
that generator's source options. The checker independently compares normalized source data with
literal finite tables and regenerates to detect staleness before Lean checking. This detects input
mismatches; it is not a proof that the encoder or optimized evaluator is correct on all inputs.
See [the request formats](categorical-assurance.md#certificates-and-source-correspondence).

The strict generated-file grammar, pinned theorem statements, no-warning/no-`sorry` requirement,
and axiom whitelist (`propext`, `Classical.choice`, `Quot.sound`) still apply. `--tamper` verifies
that relevant negated or altered copies fail. Source ids are escaped data, not Lean commands.
Per-instance work caps remain explicit. A theorem holds for the encoded scope and declared rows;
physical truth is not established by proof checking.

Local pinned checks are the merge evidence.

## Principle 2 and `interpose`

The original design suggested "factor a function through a new sub-box" for Principle 2. The
looked-up text of Principle 2 does not describe that move; the text of Principle 24 does, so
that move is `interpose`.

## The agent reference's tables in full

The agent reference shortens two of its tables and one set of examples. Here they are whole.

### Evolution lines as rules

A line is encoded only where its text in
[evolution-trends.md](../skills/triz-innovation/references/evolution-trends.md) describes a move
on the wiring. The rule encodes that move and no more, and cites the line; a test checks that the
quoted text is on that line. A line whose text names a diagnosis rather than a move can be a
detector: it reports where the line points in the model and changes nothing.

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

### Flows through the constructions

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

### Loop classes on the examples

In `bearing-heat-dynamics.json` the shaft has a temperature state. From `cold`, the
heat → preload loop reaches `hot` in two steps, and `hot` is a trap: the loop is `trapped`.
A two-state wear model in the tests makes the split concrete: when `thick` is absorbing it is
`trapped`; when a thick part can return to `thin`, thin and thick form one closed component that
is `recurrent`.
The tests also check a damped variant, where a warm shaft sheds the extra friction heat: there
`hot` is unreachable, `cold` or `warm` is invariant at any horizon, and the shaft settles warm.

## All 40 principles

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

## What is not claimed

The implemented guarantees are separated from future work in
[categorical-assurance.md](categorical-assurance.md) and the cited
[categorical-future-plan.md](categorical-future-plan.md); the ranked backlog is
[FUTURE-PLANS.md](FUTURE-PLANS.md). The following limits remain.

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
  read as a Mealy machine: its bounded runs ([Declared dynamics](../skills/triz-innovation/references/categorical-model.md#declared-dynamics)), and
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
    produce those rows and no others. Where the box also declares `feasibility` and its carriers
    `levels`, the `unbacked-producible-row` lint names each producible row whose output level no
    feasibility row reaches; it changes no verdict. It does not check the other way: a level the
    feasibility rows reach that no producible row lists is not flagged, and producible rows are
    never derived from feasibility rows. Ports on carriers without levels, values without a level,
    and ports no feasibility row provides at are not read. `requiredInfeasible` names the rows the
    target needs that the declaration excludes; it does not say which of them is cheapest to make
    producible.
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
  ordered and its relations monotone ([Co-design feasibility](../skills/triz-innovation/references/categorical-model.md#co-design-feasibility)).
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
  - Shared intensive levels use max, and a carrier declared extensive sums the demands on one
    output. The kind is declared, not checked: a mislabelled carrier gives the wrong sum, and
    an extensive merge (several functions into one input) needs an explicit merge box.
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
  recorded in [sources.md](../skills/triz-innovation/references/sources.md); none is implemented.
- The principle constructions check structure only. They are label-blind under the same
  property tests: the same construction on a model and on its relabelling succeeds and fails
  together, and two successes give isomorphic results (wiring, roles, ratings, and costs;
  free-text notes and witness tie-breaks excepted, as for the wiring verdicts).
- `triz_separate`'s `suggestions` are hints. A separation verdict says a piecewise assignment
  exists; it does not say that the suggested move builds one, that the move is the best one, or
  that the cited principle applies.
