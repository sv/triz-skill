# Automatic component and assembly discovery

`triz_component_search` chooses components and their wiring from a caller-supplied finite
catalogue. It finds single components, chains, multi-input assemblies and shared components.
The caller supplies the desired interface and properties, without supplying component order or
internal connections. This is discovery within a declared catalogue.

Effect insertion verifies known curated effect ids against the installed catalogue's typing,
conditions and provenance before citing them. Other entries are marked `caller-declared`;
their supplied source text is an assertion. A replacement that changes a declared flow path
requires explicitly restated flows, including zero-effect replacements from another source box.

| Requirement | Declaration | Checked claim |
|---|---|---|
| Quantity/dimensions | Carriers with `effect_quantity`, optional `si`; catalogue ports reference carrier ids | Every connection uses one declared carrier type, including its SI |
| Resources | `resources: [{box,port}]`, retained outputs | Wiring draws from these and newly created outputs |
| Required outputs | `targets: [{box,port}]`, retained inputs | Every target and new component input is supplied |
| Desired function | Optional `contract.target` with finite values and full behavior rows | Whole-model relation equals the target's nonempty relation |
| Acceptable properties | `contract.acceptable`, finite allowed values or level thresholds, optional `required_inputs` | Operational adequacy for declared situations |
| Resource limits | `contract.budget`, one feasibility mode per component, explicit costs | The same complete assembly meets the shared budget |
| Evidence/side effects | `implementation` evidence, envelope and declared harms | Declarations retained; empirical truth is not proved |

Requests contain `model`, `resources`, `targets`, and
`catalogue: [{id,component,max_instances?}]`. Each component is a full box declaration using
carriers already in the model. `max_instances` defaults to one. New product boxes are refused
to preserve the required product interface; nested models must first be expanded. Prose names
and action descriptions never establish a property.

Supply both `contract` and `implementation` for property checks. Without them the result is
`candidates`, meaning typed wiring hypotheses. With them, `synthesized` means a complete assembly
meets the finite behavior, adequacy, harm and resource contract. Missing behavior or unbound
resource modes remain `undecided`. Resource and behavior modes cannot be chosen independently.

## Search and editing

### General, reusable catalogues

`triz_component_catalogue` returns the shared `general` catalogue. Its type parameter `T` can bind
to any explicitly declared model carrier. Add this selection to a search request:

```json
{"catalogues": [{"catalogue":"general", "bindings":{"T":"your-carrier-id"}}]}
```

Identity (`out = in`) and fan-out (`left = right = in`) are abstract mathematical relations.
Finite rows come only from the bound carrier's declared values. No physical implementation,
conservation law, feasibility mode or cost is inferred. Engineering contracts still require
substantiated concrete implementations. An instantiated identity has a checked Lean behavior
certificate and tamper variants.

Reusable libraries follow `component-catalogue.schema.json`: format/version, id, type parameters,
local carriers and entries with source/license declarations. Entries define expanded concrete
boxes or abstract primitives. Combine bundles with `catalogues: [{catalogue: bundle, bindings: {...}}]`.
Tags and domains organize entries without gating compatibility or ranking, so one library can
mix domains. Source/license assertions on supplied bundles remain unverified declarations.

Parameters require explicit bindings. Concrete local carriers reuse a unique compatible type
with the same explicit quantity, or import a fresh internal type. Ambiguity requires a binding.
Aliases preserve layer, quantity/SI, finite values, levels and resource-combination declarations;
SI alone does not establish the same quantity. Names never supply missing type declarations.
`carriersAdded`, `catalogueBindings` and each chosen component's `catalogueOrigin` retain imported
types, bindings and sources. Replay extends the original model with `carriersAdded` first.

Instantiation shares `max_work` with search; at most ten bundles and 100 combined entries are
admitted. Legacy request-local `catalogue` arrays remain supported. No external data is fetched.

The search works backward from unsupplied inputs. It tries compatible available outputs, then
creates compatible catalogue instances and adds their inputs as obligations. Created outputs
can be shared. Feedback is possible; contracts check the declared steady-state relation. Typing
alone establishes neither causal realizability nor stability.

`remove` explicitly selects existing boxes to replace. Their incident wires are deleted and
every retained consumer losing a supplier automatically becomes another obligation.
`replace_wires` opens already supplied inputs explicitly. Surviving components, annotations and
reviewed provenance are retained. `flows` can restate the complete flow list; otherwise deletion
of a box on a declared flow fails closed. New wires declare useful functions as construction
hypotheses, not inferred physical effects.

Bounds: `max_components` defaults to 4 (maximum 8), per-template instance bounds have maximum 8,
templates have at most 16 inputs/outputs, and `max_work` defaults to 100,000 (maximum 1,000,000).
Contract solvers share that allowance and use `max_states`. Every created component feeds a
target; unused disconnected additions are excluded. Equivalent construction traces are not
quotiented by graph isomorphism.

On complete search, candidates rank by component count, then declaration/construction order.
`limit` affects display only; the best candidates are retained across the entire search. A cap
returns `undecided`, `complete:false` and no ranked candidate list. `impossible-in-library`
requires complete enumeration and all candidates decided, and concerns only this bounded space.
Each candidate includes its checked model, template bindings and a replayable rewrite.

Candidates also list `unusedResources`, the requested resource outputs that feed no newly added
wire. `require_all_resources:true` filters these candidates and reports `unusedResourceRejected`.
This is an explicit connection constraint, not a physical consumption/conservation theorem.
Finite engineering contracts also require grounded resource support: a selected row may provide
its outputs only after its positive requirements have source-backed provision. Self-supplied
cycles without that witness are `undecided`, even when their declared behavior has a fixed point
and their steady-state resource equations balance. Typed-only candidates remain hypotheses.

## Inserting discovered effect chains

Pass a `triz_effect_chains` result's `effects` as `chain` to `triz_effect_insert`, with `model`,
source output `from` and destination input `to`. `replace_wire` explicitly names an existing
supplier. Quantity/SI matching is independently rechecked; both endpoints need `effect_quantity`.

Internal quantities reuse uniquely matching existing carriers. `intermediate_carriers` binds
particular declarations, including finite values/levels. Alternatively `intermediate_layers`
explicitly declares each new carrier's layer; fresh carriers use the effect's quantity/SI. Layers
and finite values are never guessed. Optional `declarations` supplies one implementation per
effect, with ports `in`/`out`; omitted behavior/resources remain unknown. Changed flow paths need
explicit flow restatement. Old polarity is retained unless overridden. An empty chain connects
only the same carrier.

Results contain the model, `carriersAdded`, `rewrite`, source bindings and unmet conditions.
Replay uses the original model extended by `carriersAdded`. Physical sufficiency, magnitude,
efficiency and resource sufficiency require separate substantiation.

## Lean automation

`certificate:true` returns existing request-bound typing and, with a contract, supported
whole-model behavior certificates for the first reported assembly. Insertion can return its
typing certificate. These retain the restricted grammar, `decide +kernel`, axiom audit, request
binding and local acceptance/tamper checker. Synthetic generated-network fixtures test acceptance
and tamper rejection in CI. They certify their finite claims, not search completeness,
resource/adequacy checks, catalogue truth or the entire engineering contract.

`theory/ComponentSearch.lean` uses `simp` and `grind` on Lean 4.35 to prove empty-chain identity,
composition over concatenation, and predicate preservation when every component relation
preserves that predicate. Component preservation premises must be supplied. These serial laws
do not verify the TypeScript enumerator or arbitrary multi-input networks.

Lean's [simplifier](https://lean-lang.org/doc/reference/4.35.0/The-Simplifier/) rewrites known
equalities; [grind](https://lean-lang.org/doc/reference/latest/The--grind--tactic/) combines
logical/equality/arithmetic reasoning and constructs proof terms. They help prove reusable
symbolic component laws. Finite certificates keep `decide +kernel`; missing physical declarations
are never tactic assumptions. The hosted search runs no Lean process or external service.
Open-world discovery and dynamic/continuous-property synthesis remain outside this implementation.
