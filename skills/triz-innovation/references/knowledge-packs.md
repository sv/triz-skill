# Effects and parameter knowledge packs

Use this reference when looking up effects across domains or contributing expert knowledge.

The registry is [data/knowledge.json](../data/knowledge.json). It lists every installed pack;
lookup and typed-chain discovery use their complete union by default. A domain label never
limits compatibility or establishes applicability. `triz_effects` accepts optional `domain`
(that domain plus universal effects), `pack` (exact), category and typed filters.
`triz_knowledge` lists pack provenance, review status, searchable quantity definitions, shared
interface families and definition counts. Its counts describe all installed packs.

## Three distinct kinds of parameters

| Definition | Purpose | Identity |
|---|---|---|
| `data/parameters.json` | The canonical contradiction matrix's 39 engineering parameters | Existing numeric ids 1–39 |
| Universal pack parameters | Shared measurement vocabulary, currently duration, count and fraction | `universal:duration`, etc. |
| Domain pack parameters | Explicit quantity types used by domain effects | Pack-qualified ids, such as `physical:current` |

Knowledge parameters declare `name`, `description`, the exact `quantity` token and optional
SI dimensions. Effects reference their input/output parameter ids and repeat the corresponding
port types; the validator checks agreement. Existing physical tokens remain unchanged.
New domain quantities should use qualified tokens when an unqualified word would be ambiguous.
Reuse an existing parameter id for a shared meaning. Equal SI dimensions alone do not make
two quantities interchangeable. No aliases, unit conversions or semantic mappings are inferred.

The physical pack has 88 quantity declarations (65 original and 23 model-boundary/state types) and 78 searchable typed entries: 69 selected
responses and nine mechanisms. These modeling roles do not count independent physical laws.
`triz_knowledge.taxonomy` reports roles separately from field groups and links each field to its
entry ids. Counts and taxonomy have the documented all-installed-packs scope, including when
the parameter list is filtered. A field such as `magnetic` classifies responses; it does not
supply a current-to-force contract or replace induction, Hall sensing or magnetostriction.
The pack stores
52 direct declarations and 22 named specializations of eight families with 14 signatures: 66
independently declared unary interfaces, plus four derived named configurations (20/33/35/59). This reduces duplicate interface declarations;
independent physical evidence and constitutive laws remain on each named case.
SI declarations distinguish energy from power and temperature change from a spatial temperature
difference. Optical and nonuniform-field excitation tokens intentionally remain opaque where a
single quantitative interpretation has not been selected. Typings select a specific clause of
an effect, with other resources and operating assumptions recorded as conditions.
The original six quantity tokens are retained, but their new explicit SI declarations tighten
matching: hand-authored resources/carriers must include the retrieved SI where required.
`triz_effect_setup` copies those declarations directly and avoids reconstructing them from names.

For compound-versus-split decisions, see [effects decomposition](effects-decomposition.md).
`triz_effects` accepts `assessment: "retain-response" | "retain-compound" | "split-models"`;
`triz_knowledge.taxonomy.model_assessments` groups the reviewed and unassessed ids. Optional
`model_assessment` metadata reviews the whole named function and explicitly scopes the current
typing. Its facets may reference unary `effect` clauses and multiport `models`; neither is
an inferred generator, executable recipe or physical equivalence proof.

## Multiport and stateful configurations

`KnowledgePack.models` is optional and defaults to empty. Each sourced template declares `id`,
`name`, `description`, `parents`, named `inputs`/`outputs` referencing registered parameters,
`conditions`, `provenance`, `limitations`, optional `review`, and optional `state_parameter`.
The compiler checks namespaces, unique ids/ports and every parameter, parent and assessment
reference. These 19 templates are separate from the 78 selected-clause lookups and 66 independently
declared unary interfaces plus four derived named configurations; do not add them together as a count of physical laws.
`triz_knowledge.models` exposes templates; `model_count` has all-installed-packs scope.
Pack metadata also reports its own model count.

Get a portable catalogue:

```json
{"source":"knowledge","parent":20}
```

Call `triz_component_catalogue` with that request. Omit `parent` to use all registered models.
Optional `models`/`query` narrow selection. `effects: [33]` selects a named configuration
and returns its constituent catalogue entries plus `named_configurations` wiring metadata;
it never inserts an additional opaque component into the catalogue. For mechanism-specific discovery, `state_parameters`
is an allowlist of internal state meanings; stateless candidates remain. For example,
`["physical:separated-charge-state"]` permits the stored-charge emitter while excluding triplet
phosphorescence. State meaning comes from decomposition of the evidence, never the device name.

`bindings[parameter_id]` supplies finite `values`, `levels`, `layer` or intensive/extensive
allocation. Quantity tokens and SI cannot be overridden. `declarations[model_id]` supplies
behavior, state/initial/transition, feasibility and cost rows using the template's named ports.
A configured stateful model requires **state, initial and transition**; a memoryless behavior
relation cannot stand in for history. Templates without `state_parameter` reject internal state.
Without rows the catalogue remains available for typed discovery and behavior stays undecided.

Pass the returned `catalogue` object as `triz_component_search.catalogues[0].catalogue`.
Supply a retained model with resource outputs and target inputs and set `require_all_resources`
when all listed resources must participate. Search imports intermediate carriers and constructs
component choices and wiring; it supports simultaneous inputs and shared outputs. Bind existing
carrier ids explicitly if several compatible declarations exist. Finite values must agree too.
The existing search bounds still apply: at most eight components, 100 entries, and capped work.

`models[].unmetConditions` reports assumptions not supplied by the caller. The portable entries
retain all conditions and limitations in discovered `catalogueOrigin` records. Supplying a
condition string is an assertion, not evidence. Inspect these before interpreting any candidate.
Use `triz_dynamics` for observation-step protocols and `triz_behavior`/`triz_feasibility` for
finite relations and budgets. Typing and Lean certificates cover the declared finite model;
they do not establish continuous physics, empirical performance or a whole patent's claims.

For patent validation, first extract resources, output quantities, state/history, operating
regime and topology from the disclosure. Emerging terminology is not a reason to register a new
primitive. Compare the same resource-complete query with and without the proposed models, retain
old lookups, and test missing resources, regimes and temporal alternatives. The executable
[eight-patent comparison](../../../docs/effects-configurations.md) demonstrates this workflow.

## Named compositions instead of redundant effect generators

Entry **33** is stored as `kind: "configuration"`, with `role: "response"` retaining its selected
modeling role. `configuration` declares named `nodes` referencing models, exact typed `wires`,
external `inputs` with one or more `targets`, and `outputs` with a `from` endpoint. Exactly one
input and output are `primary`; the compiler derives the selected unary discovery signature from
them. Every node input must have exactly one supplier. Unknown ports/models, duplicate supplies,
unused nodes and same-SI quantity casts are rejected. Nodes reference model templates, not effects,
so this does not introduce recursive recipe aliases.

Ionic wind composes corona charge generation → ion-neutral force → gas flow. Voltage is primary;
gas pressure and drift electric field are explicit context inputs. All 78 names, ids, hints,
selected parameter pairs and historical evidence remain available. `triz_effects` can filter
`form: "configuration"`; counts distinguish 66 independent unary declarations from the four derived views.

`triz_effect_chains` keeps this conditional discovery summary, marks `requiresExpansion`, and
includes constituent model assumptions in unmet conditions. `triz_effect_insert` rejects it as an
opaque generator, including a client copy with the summary marker removed. Use:

```json
{"chain":[33],"domain":"physical","certificate":true}
```

`triz_effect_setup` creates three constituent boxes and exposes pressure/field on the resource
boundary. They are required hypotheses, not assertions of available pressure or an established
field. No physical state, behavior or budgets are inferred. `setup.context_inputs` names them;
`setup.model_sources` retains constituent sources, review status, conditions and limitations.

Use `node_declarations["0/ionize"]`, `["0/momentum"]`, `["0/flow"]` for implementation rows.
The number is the zero-based expanded effect step, including steps inside serial recipes.
`bindings` covers all constituent quantities. An ordinary `declarations[0]` cannot replace the
composition with a hidden scalar relation. With finite `boundary`, also declare
`context_values: {"0/pressure":[...], "0/field":[...]}`; otherwise setup refuses to assume context
availability. Context values must belong to their explicitly bound finite carrier domains.
Serial recipes can contain a named configuration, retain integration hypotheses/provenance,
and expand to at most 12 actual model/effect boxes.

Entries **20, 35 and 59** also derive named views. Entry 20 lifts its existing analyzer law
into `linear-analyzer-transmission`, with illumination explicit; the old scalar implementation
is removed. Entry 35 shares the superconducting phase and DC transport models. Entry 59 uses
the existing charged-particle force model. Neither adds a duplicate physical response model.

`KnowledgePack.boundary_mappings` is optional. Each mapping has a qualified `id`, `name`,
`description`, `input_parameter`, `output_parameter`, `relation: "forget-refinement"`, semantic
`rationale`, conditions, limitations, provenance and optional review. The compiler requires a
non-identity forward mapping between registered quantities with the same dimensions and layer.
Dimensions alone never select a mapping; its semantic refinement is a sourced assertion.
Current mappings observe **transmitted DC current as current** and **electric force on the
specified particles as force**. They forget qualifiers, preserving the physical value, terminal
or particle population, reference frame/component and observation interval. They supply no
inverse, net-force calculation, unit conversion or constitutive-law equivalence.

A configuration output may name `mapping`; its observed parameter is derived from the mapping.
The original model parameter stays visible as `model_parameter`. Internal configuration wires
still require exact parameter identity and accept no mapping field. Setup materializes a separate
observation box at that named output. Mapping provenance, review and conditions appear in
`setup.boundary_mappings`. This box is an observation, not a new physical response primitive.

With finite bindings, both parameters must explicitly declare the same value encoding, level
thresholds and intensive/extensive allocation semantics. Layer overrides must agree too. Only
then is the value-preserving finite observation relation derived. A missing or differently
encoded domain fails rather than guessing a label conversion. Without finite domains, the
observation is available for typing and its behavior remains unknown.

`triz_knowledge.boundary_mappings` lists definitions; `boundary_mapping_count` has the same
all-installed-packs scope as model counts. `triz_component_catalogue` includes observations only
when named configurations are explicitly selected with `effects`, or ids are requested through
`mappings`. They are explicit directed components, never global aliases. Default catalogues keep
refined internal quantities. `named_configurations[].catalogue_complete` reports whether required
observation entries are present; select `effects:[35]` to obtain phase, transport and observation.

Deposition still does not replace sublimation, a bed does not replace a membrane, and the
emission umbrella still requires a temporal mechanism choice. No unrelated force or current can
be promoted into a refined quantity. The expanded patent suite measures intended coverage and
fully expressed wiring preservation, while separately reporting removed opaque shortcuts.

`pnpm example:effects-reduction` compares ranked lookups, typed chains, all eight patent candidate
sets and a declared finite boundary relation. It emits typing, finite behavior and a retained-state trace certificate with
`--cert-dir DIR`. The [validation report](../../../docs/effects-configurations.md#named-composition-reduction)
records what this establishes and what remains unproved.

## Set up a categorical model

Call `triz_effect_setup` with registered effect ids in order and an explicit model domain:

```json
{"chain": [66, 74, 64], "domain": "physical", "certificate": true}
```

This builds photovoltaic voltage → Ohmic current → Joule heat flow. Carriers retain registered
quantity tokens, SI dimensions and declared layers. All installed packs can contribute generators.
If a parameter has no layer, supply it in `bindings[parameter_id].layer`. Neither the domain nor
SI dimension is used to guess one. Unsupported type composition fails even when dimensions agree.

`bindings[parameter_id]` may also supply `values`, `levels` and intensive/extensive allocation
semantics. `boundary: {source_values, accepted_values}` declares finite resource availability
and product acceptance; these values must already belong to the corresponding carrier bindings.
`declarations` is one optional implementation declaration per effect, using ports `in` and `out`.
Choose finite `behavior` rows or explicit `state`, `initial` and `transition` rows, optionally with
`producible`, `feasibility` and `cost`. The same declaration schema is used by `triz_effect_insert`.
Stateful rows are checked by the existing model validator, retained in the replayable rewrite,
and compose synchronously through `triz_dynamics`; behavior rows are never read as transitions.
No rows, memory, resource amounts or thresholds are inferred from an effect description.
Without those declarations, model typing can succeed while behavior remains undecided.

| Data | Categorical use | Existing checks |
|---|---|---|
| Registered quantity and SI | Explicit port/object type in the wiring syntax | Reference and dimension agreement |
| Completely typed effect | Generator between its declared input/output types | Chain compatibility and model typing |
| Selected chain | Serial wiring composition | `typed_delete`, `typed_glue` and the finite Lean typing certificate |
| Explicit finite values and behavior rows | A relation interpreting each generator | `triz_behavior` composition/comparison and finite behavior certificates |
| Explicit state, initial states and transitions | Stateful generator interpretation | `triz_dynamics`, trace rechecking and supported finite dynamics certificates |
| Explicit feasibility rows | Resource/functionality interpretation | Existing co-design checks; never inferred from wiring |

The runtime compiler and search are tested implementations, not extracted Lean programs.
Generated certificates check the encoded finite instances. `related_effects`, parameter
`distinguish_from` links and canonical matrix analogies do not declare categorical morphisms
or functors. Conditions stay visible as hypotheses; a typing or behavior certificate does not
discharge them or prove empirical physical performance.

Before reducing a named mechanism, check an actual product specification or patent disclosure:
retain each response's types and conditions, identify simultaneous interactions and state, and
only use a serial recipe when the constituent quantity boundaries actually compose. Entry 72,
traveling-field electrodynamic transport, is a mechanism using force responses 59 and 71; those
forces do not form a serial chain. Its selected response contract remains available, with the
electrode arrangement and transport regime as hypotheses. Run `pnpm example:effects-products`
for three source-backed cases, preserved discovery and rejected decompositions; see the
[validation scope and results](../../../docs/effects-evidence.md#product-and-patent-validation).

The [recent-publication audit](../../../docs/effects-evidence.md#recent-patent-validation) adds
separate clauses for inverse piezoelectric actuation, magnetocaloric and electrocaloric
temperature changes, and electroosmotic flow (75–78). Field-change endpoints are distinct
quantity types; direct piezo sensing is not automatically inverted. Optical-to-electrical,
optical-signal and geometric interface sharing removes three further repeated declarations
without identifying case-specific laws or physical behavior.

Same-type mechanisms such as optical guidance, superconducting transmission, wedges, levers
and gears are generators between equal object types; that does not identify them with the
identity arrow. `triz_effect_chains` defaults to allowing a zero-length identity. Supply
`min_length: 1` to discover nonempty mechanisms, or a higher minimum up to `k` for longer chains:

```json
{"resources": [{"quantity": "light"}], "output": {"quantity": "light"}, "min_length": 1, "k": 1}
```

New quantity declarations keep strain separate from length change, concentration gradient from
concentration difference, reaction extent from its rate, and absorbed heat from released heat.
Feed and permeate composition, deposited metal rate and sacrificial consumption rate also retain
separate meanings even when SI dimensions coincide. Opaque light ports do not guarantee
compatible spectra; stateful and quantitative implementations must supply those assumptions.

In a checkout, `pnpm example:effects` runs the photovoltaic/Ohmic/Joule setup, a synthetic
off/on behavior comparison, nonempty optical discovery, and a declared one-tick excitation
memory → TIR → photovoltaic chain. Its state transitions are synthetic, not measured lifetimes.
To generate and check its certificates locally:

```sh
node --import tsx examples/assurance/effects-flow.mjs --cert-dir /tmp/triz-effects
node scripts/certify.mjs --local --tamper /tmp/triz-effects/*.lean
```

`tests/knowledge-setup.test.ts` checks setup for every shipped typed generator and a composed
physical example; `tests/knowledge.test.ts` checks cross-pack composition. Lean CI also checks
all 78 generator typing certificates, composed stateful typing/dynamics certificates and
behavior certificates, and rejects altered copies of the composed certificates. See the
[theory map](../../../docs/theory-map.md) for the theorem inventory and assurance scope.

Optional `canonical_mappings: [{id, relation, rationale}]` record an analyst's equivalence or
analogy to a canonical parameter. They do not add matrix rows or trigger matrix lookups.
Matrix use still needs an application-specific justification.

The [classical parameter audit](parameters-audit.md) records why all 39 matrix categories remain,
the preferred Force label and distinctions added to prevent ambiguous mappings. These entries
have their own [schema](../schemas/parameters.schema.json); runtime loading and
`pnpm knowledge:check` reject missing, duplicate or extra canonical ids.

## Contribute a domain pack

In a repository checkout, add `data/knowledge/<pack>.json` under this skill and list it in
`data/knowledge.json`. A pack has its own id and domain; multiple packs may share a domain.
For example, this **synthetic, draft** software relation demonstrates the format:

```json
{
  "format": "triz-knowledge-pack-v1",
  "id": "software",
  "domain": "software",
  "title": "Synthetic software example",
  "source": {
    "citation": "This example's declared relation; no implementation evidence",
    "license": "MIT"
  },
  "review": {
    "status": "draft",
    "note": "Schema example only; requires domain evidence before engineering use"
  },
  "limitations": ["No performance or correctness claim is established"],
  "parameters": [
    {
      "id": "software:request",
      "name": "Request",
      "quantity": "software:request",
      "description": "An explicitly defined request token"
    },
    {
      "id": "software:response",
      "name": "Response",
      "quantity": "software:response",
      "description": "An explicitly defined response token"
    }
  ],
  "effects": [
    {
      "id": "software:response-lookup",
      "name": "Synthetic response lookup",
      "category": "algorithmic",
      "function": "retrieve a declared response to a request",
      "statement": "The example assumes a valid request-to-response mapping",
      "hints": ["finite response table"],
      "input_parameter": "software:request",
      "output_parameter": "software:response",
      "input": {"quantity": "software:request"},
      "output": {"quantity": "software:response"},
      "field": "information",
      "conditions": ["a valid response mapping is available"],
      "source": "This example's explicit statement",
      "typed_from": "statement"
    }
  ]
}
```

Each parameter/effect id uses its pack's namespace. The original physical starter pack retains
numeric effect ids for compatibility. Files, pack ids, parameter ids, quantity tokens and effect
ids cannot collide. Manifest order determines deterministic declaration order; a later pack
cannot override an earlier one. Missing or invalid installed packs fail the complete load.

## Separate definitions, named cases and recipes

Direct entries may declare `kind: "response"` or `kind: "mechanism"`. This is a modeling role,
not a scientific novelty or irreducibility claim. Old inline entries remain accepted.

A pack's optional `families` array defines explicit reusable interfaces. Each family has a
namespaced id, name, kind, description, provenance, limitations, and `signatures` of this form:

```json
{"id": "release", "input_parameter": "physical:reaction-extent", "output_parameter": "physical:heat", "field": "chemical"}
```

A named effect can instead use `kind: "specialization"`, `family: "physical:reaction-enthalpy"`
and `signature: "release"`. It retains its id, name, category, function, statement, hints,
conditions, source, `typed_from`, provenance, review and limitations. Its ports are derived from
the referenced parameter definitions. Inline port overrides and missing evidence fail closed.
Family attribution/review is visible separately and does not upgrade a specialization's evidence.
Sharing an interface does not establish equal behavior or a common quantitative implementation.

A composite entry uses `kind: "composite"` and `steps` instead of restating a new input/output
contract. For example, an expert may add this **integration hypothesis** to the physical pack:

```json
{
  "id": "physical:photovoltaic-heater",
  "name": "Photovoltaic heater recipe",
  "kind": "composite",
  "category": "integration",
  "function": "deliver heat-transfer rate from illumination",
  "statement": "Compose the selected photovoltaic, Ohmic and Joule clauses",
  "hints": ["evaluate a specified illuminated device and load"],
  "steps": [66, 74, 64],
  "conditions": ["specified optical, electrical and load integration"],
  "source": "Repository-authored serial integration hypothesis; constituent sources remain authoritative"
}
```

Recipes derive their external types from the first and last steps and retain every constituent
condition and limitation. They may reference other recipes and other installed packs. Missing
references, untyped steps, incompatible quantity ids, cycles, excessive nesting and expansion
beyond 12 steps fail closed. Equal SI dimensions are insufficient for a connection.

`triz_effect_setup` accepts the recipe id and expands it before typed rewriting. Supply one
implementation declaration per **expanded** effect, including any explicit state/transition rows.
Returned metadata includes requested ids, expanded ids, and sources for nested recipes and leaves.
No composite behavior, costs or resource feasibility is inferred. Chain search uses constituents,
so recipes do not become opaque one-step shortcuts and `k` counts constituent effects.

`triz_effects` can filter `kind` (`response`, `mechanism`, `composite`) and `form` (`direct`,
`specialization`, `composite`). Raw pack entries may reference signatures or recipes: consumers
must call `compileKnowledge` before reading their resolved port contracts. Filesystem and hosted
runtimes both do this. Adding a new serial recipe requires no new independently asserted generator.
Use the existing `ComponentCatalogue` for multiport or branching constructions.

Compatibility tests snapshot all 74 previous contracts, text, assumptions, attribution, limitations
and order. The runnable comparison also expands a recipe and checks the same model and nonempty
behavior as its explicit chain; Lean checks both instances and rejects altered certificates.

An effect can remain untyped and searchable. Complete typing requires both parameter references,
both ports, field, conditions, source and `typed_from`; partial typing is rejected. Untyped effects
can still declare conditions and limitations. The universal pack currently supplies measurement
definitions only, with no claim of a universal empirical mechanism.

Sources and reviews default to the pack and can be overridden per parameter/effect. Record a
specific reference and the rights of the contributed summary. `curated` means repository
curation, not independent expert endorsement. `expert-reviewed` requires named reviewers,
their expertise and `reviewed_on`. These are attributed declarations, not verified credentials.
Review status remains visible during lookup; draft effects are still searchable hypotheses.

Use `related_effects: [{id, relation}]` to record `specializes`, `uses` or `related` links rather
than duplicating a mechanism with a new name. References must resolve across the installed
union. Such links organize retrieval; they do not create new chain edges or prove applicability.

From the repository root:

```sh
pnpm knowledge        # validate the whole union and regenerate hosted static imports
pnpm knowledge:check  # validate and reject stale hosted imports without writing
pnpm schema           # regenerate schemas after a schema change
pnpm typecheck
pnpm test
```

The [pack schema](../schemas/knowledge-pack.schema.json) and
[manifest schema](../schemas/knowledge-manifest.schema.json) support editor validation.
Cross-pack references, namespaces, quantity agreement, complete typings and expert-review
attribution are checked by the runtime validator beyond what JSON Schema expresses.
Builds regenerate static imports from the same manifest, so hosted and filesystem runtimes
receive the same packs without manual changes to server code. Custom `TRIZ_DATA_DIR` providers
must include the manifest and its versioned packs; legacy unversioned effects files need migration.

See [effects-audit.md](effects-audit.md) for the starter catalogue cleanup and remaining gaps.
For measured catalogue coverage, patent-inspired finite comparisons and a dated research shortlist,
see [effects evidence](../../../docs/effects-evidence.md). Its experimental component catalogues
are examples, not additional installed effects or validated physical implementations.
