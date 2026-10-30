# Issue and lint codes

Every `ok: false` result from a model tool carries `issues`, one per error: a stable kebab-case
`code`, a JSON `path` into the call's own arguments, the `message`, and a `hint` naming a concrete
fix. Lints come back under `warnings` in the same shape plus `severity`. The issue itself is
usually enough: correct the input at `path` as `hint` says and call again. This file lists every
code, for the cases where the hint is not enough or a code is new to you. How to read an issue,
the lints, and the slips agents make most often are in
[categorical-model.md](categorical-model.md#feedback-for-agents).

Branch on `code`, never on `message`. A test keeps this file equal to the codes the kernel
registers (`src/act-issues.ts`), each listed once.

## Model building, hierarchy, and row costs

Component discovery/insertion reuse `invalid-argument` for invalid catalogue, endpoint,
replacement, carrier-binding or contract/evidence requests; `hierarchy-substitution` for nested
components; and the rewrite engine's typing, freshness and dangling-flow codes. Search exhaustion
is an `undecided` result with `reason: "work-cap"`, not an input error.

Reusable catalogue errors also use `invalid-argument`: unbound parameters, unknown local types,
ambiguous/incompatible aliases, duplicate names, absent source/license fields and library limits.
Bind types explicitly or correct the portable catalogue schema.

Resource balances with no grounded selected witness are successful analyses with
`verdict: "undecided"` and `reason: "circular-resource-support"`; see `sourceSupport` and
`steadyState`. Flat source-support work exhaustion uses `cap-exceeded`. Subsystem contracts
report `resources.reason: "circular-resource-support"` or `"source-support-cap"` with overall
`status: "undecided"`; their independent `max_support_work` defaults to 100,000.
Holding-cost keys naming
unknown states use `undeclared-state`; negative/malformed amounts use schema validation codes.

| Code | Raised by | Meaning |
|---|---|---|
| `draft-model` | imported models | Ratings or assumptions remain unconfirmed inside the model; review every pending item before analysis |
| `invalid-import-provenance` | imported models | Source mappings or review coverage are malformed, incomplete, or name stale ids |
| `hierarchy-depth` | model checks | A cycle or more than eight nested levels; remove the cycle or flatten a level |
| `invalid-inner-model` | model checks | The inner declaration or model has an invalid shape |
| `hierarchy-summary` | model checks | A nested box also declares an unchecked outer behavior, producible, state, feasibility, or cost summary |
| `hierarchy-interface` | model checks | The interface omits or repeats an outer or exposed inner port |
| `hierarchy-binding` | model checks | A binding names the wrong side, carrier, or a wired inner input |
| `hierarchy-substitution` | expansion, transformations, semantic tools | The operation cannot preserve nested structure or annotations; expand supported nested boxes first |
| `invalid-joint-boxes` | weakest specification | joint_boxes must select every composed unknown box exactly once and requires weakest_spec with a target; declared or out-of-scope boxes are not joint holes |
| `invalid-row-costs` | weakest specification | Prices are missing, duplicated, malformed, irrelevant, or unsupported in the selected mode, including every result that computes no one-box residual (two or several boxes to specify, missing baseline behaviour, an empty target, a lost deliverable); use full_relation to discover extensionCandidates |
| `row-costs-without-weakest-spec` | behavior tool | row_costs needs weakest_spec; max_cost_search also needs row_costs |

## Model and row typing

Raised when a model is type-checked, by every tool that takes a model, and where noted by the
tools that check arguments against a model.

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

## Arguments and argument combinations

Set arguments, argument pairs a tool refuses, caps, and failures of the kernel itself.

| Code | Raised by | Meaning |
|---|---|---|
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
| `mpv-weights-without-compare-to` | `triz_function_model` | mpv_weights was passed without compare_to |
| `invalid-weight` | `triz_function_model` mpv_weights | An MPV weight is not positive |
| `invalid-argument` | finite analysis APIs | An argument or cross-reference is invalid for the requested finite check |

## Transformations and trims

`triz_transform` constructions, rewrites, and applied trims, and `absorb` wherever a trim is
applied.

| Code | Raised by | Meaning |
|---|---|---|
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

## Rules and double pushout

`triz_rule_apply`: its arguments, the rule itself, the match, and the application conditions.

| Code | Raised by | Meaning |
|---|---|---|
| `rule-or-rule-id` | `triz_rule_apply` | Neither or both of rule and rule_id were passed |
| `unknown-rule-id` | `triz_rule_apply` | rule_id names no built-in rule or detector |
| `detector-takes-model-only` | `triz_rule_apply` uneven-development | A detector rule_id was passed with at, match, carriers, ids, limit, or max_steps |
| `at-and-match` | `triz_rule_apply` | at and match were passed together |
| `apply-args-without-match` | `triz_rule_apply` | carriers or ids were passed while only listing matches |
| `listing-entry-as-match` | `triz_rule_apply` | A whole matches[i] entry was passed as match |
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

## Behaviour, weakness, feasibility, dynamics, and certificates

The verdict tools that read declared rows, and the certificates they return.

| Code | Raised by | Meaning |
|---|---|---|
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
| `extensive-fan-in` | `triz_feasibility` | An input port of an extensive carrier is fed by several non-harmful functions, so how the amount divides among them is undeclared; model a merge box |
| `invalid-namespace` | certificates (library) | The certificate namespace is not a usable Lean identifier |
| `certificate-needs-unsafe` | `triz_dynamics` `certificate` | A dynamics certificate was asked for without an unsafe or safe target |
| `certificate-input-sequence` | `triz_dynamics` `certificate` | A dynamics certificate was asked for runs under an input sequence, which it does not encode |
| `not-certifiable` | `triz_dynamics`, `triz_weakness` `certificate` | The verdict has no certificate: an escalation that is not reachable or blocks, an undecided ranking, or no strictly ordered pair |

## Separation, abstraction, and 9 windows

`triz_separate` and embedded contradictions, the `triz_abstraction` map, and `triz_nine_windows`.

| Code | Raised by | Meaning |
|---|---|---|
| `undeclared-cell` | `triz_separate`, embedded contradictions | A demand names a cell the axis does not declare |
| `empty-axis` | `triz_separate` along | The axis to index by has no cells |
| `unmapped-box` | `triz_abstraction` | map.ports names a box that map.boxes does not map |
| `ambiguous-port-name` | `triz_nine_windows`, `triz_transform` merge | Collapsing gives two kept ports the same name |
| `no-earlier-snapshot` | `triz_nine_windows` | A transition starts from a time with no snapshot |
| `snapshot-not-reached` | `triz_nine_windows` | A transition's result differs from the snapshot it must reach |

## Lints

Returned under `warnings` by `triz_function_model`, `triz_trim`, and `triz_behavior` for a model
that type-checks, with a `severity`. A lint never changes a verdict. Only
`defect-on-loss-carrier` reads labels, and only on a carrier without a declared `loss`.

| Code | Raised by | Meaning |
|---|---|---|
| `defect-on-loss-carrier` | lint: `triz_function_model`, `triz_trim`, `triz_behavior` | An excessive or insufficient function on a carrier declared `loss: true`, or, with no declaration, on a loss-like flow by the words of the carrier id, its dimension, or the verb (pressure drop, leakage, noise, …). That word list is the one place a lint reads labels, so it is exempt from label-blindness; a declared `loss` is not |
| `trim-level-functions` | lint: `triz_trim` | The trim removes excessive or insufficient functions, listed under levelProblems |
| `product-without-deliverable` | lint: `triz_function_model`, `triz_trim`, `triz_behavior` | A product box receives no non-harmful function |
| `unused-carrier` | lint (info) | A carrier types no port and no wire |
| `unwired-port` | lint (info) | A port has no wire |
| `unbacked-producible-row` | lint: `triz_function_model`, `triz_trim`, `triz_behavior` | A producible row's output level is reached by no feasibility row of its box, read through the carriers' levels |
| `extensive-fan-out` | lint: `triz_function_model`, `triz_trim`, `triz_behavior` | An output port of an extensive carrier feeds several functions: `triz_feasibility` makes it supply their sum, while behaviour and dynamics give each function the port's one value |


## Dimensions, lifecycle and energy structure

| Code | Raised by | Meaning |
|---|---|---|
| `dimension-mismatch` | builder; SI/level/map lints; bond typing | Explicit declarations disagree on SI dimensions; use matching dimensions or distinct carriers |
| `invalid-probability` | lifecycle | An enabled action lacks outcomes, or per-state/action probabilities are missing or do not sum exactly to one |
| `invalid-bond` | bond graph | Invalid energy pair, information bond, element arity, thermal approximation, or repeated/unconnected port |
| `causality-conflict` | bond graph findings | Exhaustive bounded assignment found no source/junction-compatible causality; not a physical impossibility proof |
| `derivative-causality` | bond graph findings | Storage needs derivative causality in the returned structural assignment |
| `algebraic-loop` | bond graph findings | Direct constitutive dependencies form a cycle requiring a simultaneous solve |
