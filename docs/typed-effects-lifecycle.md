# Typed effects and lifecycle checks

All new searches are finite and bounded. A cap returns `undecided`, without an optimum or a
negative existence claim based on a prefix. Declaration order breaks witness and ranking ties.
The kernel checks declarations; it does not supply physical or empirical data.

## Dimensions (T2)

A carrier may declare `si: {L:1,M:1,T:-2}` or `si: "kg·m·s^-2"`. The seven keys are
L, M, T, I, Θ, N, J; omitted exponents mean zero. Integers must be safe integers. `unit` is
display text and the old required `dimension` remains free text. The parser accepts only the
seven base-unit symbols m, kg, s, A, K, mol, cd, multiplication (`·`, `*`, whitespace), one
optional denominator, integer powers, and `1`. It deliberately rejects prefixes and a derived
unit dictionary. `sameDimension` compares normalized vectors; missing matches only missing.

`sameCarrier` includes SI declarations, so builder and hierarchy bindings reject conflicting
dimensions. A builder conflict uses `dimension-mismatch`. Model lints compare a parsable display
unit, each optional `levels[].unit`, and `feasibility[].units[port]` with the carrier's SI.
Abstraction maps warn on conflicting SI before their level readings are interpreted. Structural
isomorphism keeps SI while ignoring free dimension/unit labels. No unit conversion or inference
from a quantity name, layer, or label is performed. Unknown display-unit text is opaque.

## Costed dynamics (T3)

Declare `cost: {resource: 0.25}` on transition rows. Costs are nonnegative finite decimal
numbers or explicit rational strings such as `"1/3"`; negative costs are rejected. Missing dimensions cost zero. All costs incurred by the
synchronous stateful boxes are added per step with exact rational arithmetic on the declared
decimal values; fixed box construction costs are not recurring step costs.

Each nonblocking closed recurrent component of `triz_dynamics` now has `meanCost` when transition
costs are declared. `meanCost.values` lists each dimension separately, with numeric min/max,
authoritative rational `exact.min`/`exact.max`, rechecked row-indexed `minCycle`/`maxCycle`, and
rational potentials. Karp's dynamic program computes the minimum, and negating costs computes
the maximum. Parallel rows with the same next state retain their different costs. The complete
component is used even when its displayed states are truncated. `max_cost_work` bounds cost
edge construction and the mean-cost calculation; caps return an undecided `meanCost`. A blocked
state has no cycle mean. Under a time-varying input sequence recurrent analysis remains absent.

These are the extrema over cycles in the declared nondeterministic graph, not controller versus
environment policies. There are no probabilities, continuous-time durations, or discount factors.
`mean_cost_certificate: {component:0,dimension:"resource"}` requests rational potential and closed
achieving-cycle checks. These prove finite bounds and equality witnesses, not Karp's implementation
or physical costs. Local checking is `node scripts/certify.mjs --local --tamper <file.lean>`.

## Typed effects (T1)

[Component discovery](component-discovery.md) searches component instances and wiring beyond
fixed-wiring synthesis. `triz_effect_insert` inserts discovered chains into an existing model.

Typed entries add `input`, `output` (each quantity and optional SI), `field`, `conditions`,
`source`, and `typed_from`. `triz_effects` keeps its text query/category filters and adds exact
`input`, `output`, `field`, and output `si` filters. The nine field values are mechanical,
acoustic, thermal, chemical, electric, magnetic, optical, gravitational, and information.
Six existing entries have typings derived from their recorded statement or function fields,
identified in `source`. Field-change and current tokens use an explicit shared vocabulary;
the induction typing covers the changing-field clause only. Other entries stay
untyped. No redistributable external input/output catalogue was verified; this remains a data gap.
See the checked source and rights notes in the agent reference's `sources.md`.

`triz_effect_chains` accepts `resources: [{quantity,si?}]` or a `model`, `output: {quantity,si?}`,
optional explicit typed `effects`, `conditions` met, `k` (default 4, maximum 12), `max_steps`, and
`limit`. A zero-length identity chain is returned when an available resource already has the required type, including with `k:0`. A model resource needs the explicit `carrier.effect_quantity` type; free `dimension`
labels are never used as quantities. Effects match the quantity type and every requested SI
constraint. Empty resource declarations fail closed. A chain cannot reuse an effect id.
Inferred weakest-spec hints apply only to unknown tools/mediators, use their declared input
quantities, exclude the output being explained and share one 20,000-step budget.
Returned chains are wiring diagrams rechecked through `checkModel`, with each
connection using the matched carrier. Ranking is length, conditions met (descending), field
changes, declaration order. The full bounded search decides and ranks before display truncation;
a cap returns no ranked prefix. Conditions not declared met remain visible as unmet hypotheses.

With `weakest_spec`, `triz_behavior` can add `effect_hints: {resources,output,k?}` or derive hints
for unknown boxes' output carriers with `effect_quantity`. Hints never alter the residual verdict.
There is no claim of physical sufficiency, magnitude, efficiency, or scale. Quantity names and
conditions are explicit type tokens; renaming their tokens consistently preserves matching.

## Lifecycle policies (T4)

Optional `lifecycle.holding_cost` maps model-level states to nonnegative per-step cost vectors;
for a selected box use `box.holding_cost`. Example: `{"blocked":{"downtime":5}}` explicitly
penalizes occupying `blocked`. Numbers and nonnegative rational strings are accepted. Each step
cost is **source-state holding cost + action cost + outcome cost**, with the holding charge
applied once, independently of how many outcomes an action has. It is included in exact gains,
policy selection, nondeterministic ranges and finite certificates. A selected box uses only its
own holding costs. Unknown state keys fail closed. These are costs per decision epoch, not
continuous-time rates; `acceptable` controls reported availability and adds no implicit penalty.

At model level declare `lifecycle: {states,acceptable?,situations?}` and `actions`; alternatively
select a stateful box with `box` and declare its `actions`. Each action is
`{id,guard:[state],cost?,transitions:[{state,next,probability?,cost?}]}`. A transition's cost is
added to its action's cost. Probabilities accept decimals or rational strings such as `"1/3"`,
and must sum exactly to one for each enabled state/action. Every state needs an enabled action.
An explicit model-level state may represent a global configuration. The tool does not infer a
synchronized product MDP from independently controlled wired boxes.

For a box-local call, pass `acceptable: [state, ...]` explicitly to report availability; its
default is an empty list. Global `lifecycle.acceptable` applies only to model-level calls.
Adding another lifecycle cannot change a selected box's availability or invalidate its states,
even when global and local state names collide.

`triz_lifecycle` uses exact rational policy evaluation and strict policy improvement, with bounded
policy enumeration as a fallback for singular starting policies. It returns one solution per
cost dimension unless explicit `weights` name every cost dimension. Each solution reports the
policy, gain per dimension, objective gain, bias, stationary occupancy, and availability.
Availability is the stationary mass of acceptable states. A gain/bias certificate must satisfy
all enabled actions' Bellman inequalities. Distinct transition choices tied at the optimum
return `undecided` (`tied-optimal-policies`): their optimal cost is reported, but occupancy,
availability and derived priors are not claimed unique. This test is conservative; transient
action ties can also require a separate occupancy analysis.
The selected policy satisfies equality. Occupancy must
be nonnegative, sum to one, and satisfy πP=π. A unique stationary distribution and a scalar
gain/bias witness are required. General multichain, state-dependent-gain cases are undecided.
At most 64 states and `max_steps` work are admitted. Missing probabilities return T3's
nondeterministic outcome range, not a stochastic policy or a mean-payoff game.

`certificate:true` returns one finite rational certificate per solved objective, including
stochastic rows, selected actions, stationary occupancy, and optimality equations. Lean proves
optimality against stationary competitors. The bridge to `Kernel.Invariant` states explicit
mass/pushforward encoding compatibility; TypeScript evaluation is tested rather than extracted.
There is no ergodic theorem, sample-path frequency theorem, probability estimation, discounting,
or continuous-time model. Probabilities and action consequences are declared data to substantiate.

`derive_prior:true` aggregates occupancy through `lifecycle.situations[state]` into `joint_prior`.
Undeclared probabilities with this option return `undecided` (`probabilities-undeclared`);
cost dimensions and weights are validated before the nondeterministic fallback. Lifecycle-prior
ranking sums the rational occupancy over complete admitted situations and compares exact
fractions (`admittedProbabilityExact`); floating-point prior weights are display/compatibility data.
Every state must map to a complete operating situation, including zero-occupancy states. Pass
this table to `triz_weakness`, which checks full situation coverage. Alternatively opt into
`triz_weakness.lifecycle_priors`: one `{concept,objective,box?,weights?,max_steps?}` per concept.
Each concept then uses its own dynamics/policy/occupancy. `lifecyclePriors` reports that separate
probability order; inclusion, weakest/maximal, and count orders are unchanged. Different concepts'
probabilities refer to their own declared operating distributions. They are not a shared external
prior and are not certified by weakness inclusion certificates.

## Energy structure (T5)

Read [bond-graphs.md](bond-graphs.md), written before implementation, for the mapping and scope.
`carrier.energy` supplies a domain name, `kind` (`energy` or `thermal-approximation`), effort/flow
quantity/SI pairs, declared `power_si`, and any thermal `approximation`. No domain catalogue is
installed. Information carriers are refused. `box.bond` declares `element` and `parameters`.

`triz_bond_graph` checks arities, one bond per energy port, energy pairs and junction typing,
then assigns effort/flow causality by source/storage priority, propagation and bounded search.
Only after integral preference is exhausted can it report derivative storage. The returned derivative assignment does not claim a minimum number of derivative storage elements. A complete
assignment is rechecked. `causality-conflict`, `derivative-causality`, and `algebraic-loop` are
structural findings, with paths and hints; an algebraic loop requests a simultaneous constitutive
solve rather than asserting numerical inconsistency. `equationStructure` exports storage state
candidates, element constraints, and causal dependencies. No numerical simulation, parameter-unit
validation, physical accuracy, chemical model, or automatic TRIZ contradiction is claimed.
