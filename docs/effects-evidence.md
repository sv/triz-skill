# Effects: measured catalogue coverage, patent patterns and recent research

Research date: 2026-10-31. This is a targeted survey and a reproducible finite-model comparison,
not an exhaustive patent or scientific literature search. Dates below distinguish early papers
from later developments. Proposed signatures and engineering priorities are our interpretations.
The installed catalogue has 78 conditional entries, including four response clauses added by the
recent-publication audit. Other experimental patterns below remain example component catalogues
with explicitly supplied finite semantics.

## What adding effects actually changes

A sourced name improves retrieval. A typed contract also lets search connect mechanisms and
lets setup construct consistent quantity/SI/layer declarations. Explicit implementation relations
or transitions then allow behavior comparison, counterexamples and supported Lean certificates.
These are separate capabilities: more entries alone do not supply numerical behavior, establish
feasibility, optimize a design, or improve a physical device. The checker and most composition
machinery already existed before this PR; the registry makes that machinery usable from reusable
knowledge rather than repeatedly hand-authoring each model.

For example, three registered ids `[66,74,64]` instantiate photovoltaic voltage → Ohmic current →
Joule heat flow, with four quantity declarations, five boxes including the boundaries, and four
wires. Without implementation rows its behavior is undecided. Adding synthetic off/on rows makes
finite behavior decidable, while eight operating assumptions still remain undischarged by the proof.

## Reproduce the comparison

```sh
pnpm example:effects-compare
node --import tsx examples/assurance/effects-comparison.mjs --cert-dir /tmp/effects-comparison
node scripts/certify.mjs --local --tamper /tmp/effects-comparison/*.lean
```

The script asserts every reported outcome, rechecks temporal traces, checks a recent speculative
sampler with exact rational probabilities, and emits six certificates for the classical models:
three model typings, two nonempty behavior equivalences and a deadband invariant. Four concern
the original patent-inspired models; two check recipe expansion against its explicit chain.
Local Lean checks every file and rejects applicable altered copies. CI runs both the comparison and certificate checks.

### Catalogue ablation

All three libraries use the **same current search implementation**, resource types, required
quantity tokens, `min_length:1` and listed depth bounds. Thus this measures the effect of catalogue
coverage, not differences between historical runtimes or their performance. The six-entry baseline
is an exact typed projection of commit `68556e9a1d4187c8e19cd32a980ef7fcf390b644`, committed as an
example fixture. The 37-entry library selects the original PR's typed ids from the current library;
those contracts were preserved by the subsequent extensions through 78 entries.

| Selected task | Max effects | Before PR: 6 typed | First PR: 37 typed | Current PR: 78 typed |
|---|---:|---:|---:|---:|
| Temperature difference → voltage (retained control) | 1 | 1 chain | 1 | 1 |
| Light → heating power | 3 | 0 | 3 | 11 |
| Reaction extent → displacement | 3 | 0 | 0 | 3 |
| Mechanical stress → superelastic strain | 1 | 0 | 0 | 1 |
| Acoustic pressure amplitude → detached mass | 2 | 0 | 0 | 1 |
| Force → force, requiring a nonempty mechanism | 1 | 0 | 0 | 2 |
| Heating power → temperature change, without accumulation | 2 | 0 | 0 | 0 |

Coverage of the six positive cases is 1/6 → 2/6 → 6/6; the negative control remains rejected.
These deliberately selected examples demonstrate newly covered functions, not estimated general
accuracy or design quality. More chains can include alternative paths and same-type optical
stages; a larger count does not imply better performance. Example new routes are `[37,73,1]`
(exothermic reaction → sensible heating → thermal expansion) and `[29,57]` (ultrasonic displacement
→ vibration-assisted release). Their physical assumptions still need validation.

The new actuation clause also admits `[42,66,75]` (chemiluminescence → photovoltaic voltage →
piezoelectric actuation). This is an additional typed route to displacement, not a demonstrated
power budget or actuator performance result.

### Implementation comparisons

| Experiment | Before | After | Cost or boundary |
|---|---|---|---|
| Identical 11-step input alternating around a single threshold, with one high excursion and final low input | Memoryless threshold switches 8 times | Two-threshold stateful component switches 2 times | Explicit thresholds, initial state and transition rows; no measured hardware noise |
| Deadband-only input, initially off | A memoryless threshold can assert on | Stateful component cannot reach on | Lean proves the declared invariant; starting on gives a counterexample to the same negative claim |
| Binary transmission, every single-bit corruption | Uncoded transmission recovers 0/2 flipped messages | Repetition + majority recovers 6/6 single-bit faults across three positions | Three transmitted bits per one message bit; allowing two faults changes the relation and breaks the guarantee |

For coding, the full composed encoder/channel/decoder relation equals the identity requirement
under the declared at-most-one-bit fault relation. The uncoded relation differs and supplies a
counterexample. This is a classical two-message repetition code, not an implementation or proof
of the Hamming patent's circuit, a quantum code, or a measured reliability improvement. No fault
probabilities were supplied, so no probabilistic reliability number is inferred.

### A recent construction: exact speculative sampling

The one-step sampler from [Leviathan et al., ICML 2023](https://proceedings.mlr.press/v202/leviathan23a.html)
uses a cheap draft distribution and a target distribution, accepts a draft token with the specified
probability ratio, and corrects rejection using the normalized positive part of target minus draft.
The example evaluates this construction with exact rationals:

| Two-token distribution | Token A | Token B |
|---|---:|---:|
| Target / direct sampling requirement | 3/4 | 1/4 |
| Unverified cheap draft | 1/4 | 3/4 |
| Verified and correctly adjusted output | 3/4 | 1/4 |
| Incorrect replacement using the target distribution after rejection | 5/8 | 3/8 |

All 25 pairs of two-token distributions on the quarter-probability grid, including zero-mass
edge cases, preserve the target under the correct construction. The naive fallback has the same
nonzero support but the wrong probabilities: unweighted relation equality would miss this bias.
These checks demonstrate a useful modern contract and a limitation of the present relational
checker. They are finite exact arithmetic tests, not a new Lean theorem for arbitrary probability
kernels, an executed language-model benchmark, or evidence of a particular GPU speedup.

The scheduled hysteresis trace is checked by the runtime. Its Lean certificate concerns the
separate unscheduled deadband invariant, not the supplied time schedule, which the current
certificate generator does not support.

## Reducing predefined declarations without discarding named cases

The installed pack factors 22 named cases into eight shared families with 14 signatures.
Together with 56 direct declarations, this gives 70 independently stated interfaces for 78
searchable entries. A frozen snapshot protects the previous 74 names, ids, types, texts,
assumptions, attribution, limitations and order; four new clauses have separate source evidence.

The families cover reaction enthalpy, geometric transmission, elastic compliance, heat transfer,
optical-to-electrical response, optical signal response, piezoelectric coupling and caloric response.
Interface sharing does not merge independent constitutive laws or provide a physical equivalence
proof. This is a reduction in repeated declarations, not a claim that physical phenomena have
been explained away. The compiler exposes both definition counts and searchable-entry counts.

The comparison also creates a temporary recipe for `[66,74,64]`. Its external types and hypotheses
are derived; setup expands it into the identical model generated by the explicit chain. Adding
such a serial mechanism therefore needs no new opaque generator. Nested recipe source metadata,
quantity boundaries and explicit per-step implementation rows remain visible. The installed
78-entry catalogue retains those constituent contracts; the temporary recipe is only an example.

## Product and patent validation

The follow-up [compound/clause audit](../skills/triz-innovation/references/effects-decomposition.md)
records 34 detailed decisions without changing these executable contracts: 15 retain-compound,
six split-models and 13 retain-response. Assessments review the full named function, while its
registered typing can cover only one selected clause. Missing facets are not generators, and a
recommended decomposition supplies neither an executable recipe nor a physical equivalence proof.

`pnpm example:effects-products` checks three selected real cases using a frozen, source-linked
[fixture](../examples/assurance/fixtures/product-patent-cases.json). It checks the contracts before
and after the field/mechanism cleanup, while the separate compatibility snapshot protects all
74 entry contracts, descriptions, assumptions and evidence. The baseline reconstruction restricts
the library to those original ids and restores entry 72's previous role using current family
storage; it is not a second independent catalogue audit or a historical runtime comparison.

The cleanup changes entry 72 from a response to a mechanism. It exposes role counts and field
groups separately through `triz_knowledge`: currently 69 selected responses, nine mechanisms,
78 named entries, and 70 independently declared interfaces. The numbers describe different things;
none counts irreducible physical laws. No named case or response contract is removed.

| Source-backed case | Executed check | What it supports and what remains open |
|---|---|---|
| [H2W VCS20-020-CR-001-XY](https://cdn.h2wtech.com/product/voice-coil-stages/VCS20-020-CR-001-XY) | Discover and set up Ohmic conduction → magnetic force `[74,65]` and Ohmic conduction → Joule heating `[74,64]`. Compose an exact finite DC force model. | Keep the current-to-force response under the magnetic field classification. The product's 3.5 ohm resistance and 6.1 N/A force constant give 6.1 N and 3.5 W at a selected 1 A / 3.5 V operating point. These are calculations at fixed temperature and zero motion, not measured performance or a controller model. |
| [LG refrigerator, US11300331B2](https://patents.google.com/patent/US11300331B2/en), with [Ferrotec's heat-sink guide](https://thermal.ferrotec.com/technology/thermoelectric-reference-guide/thermalref05/) | Retrieve and set up Peltier transfer, conduction, convection and Joule heating. Reject `[8,61]`, `[61,62]` and the power-to-energy shortcut `[64,73]`. | Multiple responses remain necessary. Coupled thermal balances and explicit time conversion are needed to relate these unary contracts. Gasket geometry, recirculation control and complete cooling performance are outside this check. |
| [Electrodynamic screen, US9433336B2](https://patents.google.com/patent/US9433336B2/en), supported by [NASA's EDS operating description](https://ntrs.nasa.gov/citations/20150016082) | Retrieve electrostatic force, dielectrophoresis and traveling-field transport. Reject the serial substitutions `[59,71]` and `[71,72]`. | Classify traveling-field transport as a mechanism using force responses. Its electrode drive, simultaneous forces, adhesion and particle dynamics prevent replacing it with these serial chains. The patent and NASA mechanism are separate sources, not an assertion of product identity. |

All nine selected paths remain discoverable and generate identical models across the cleanup;
all six invalid serial substitutions are rejected. Removing response contracts and retaining
only field classifications finds none of the nine nonempty paths. These deliberately selected
cases demonstrate preserved coverage, not a general retrieval-quality benchmark.

Without implementation rows, behavior remains undecided for every path. For the voice coil,
the script derives explicit rows at -1, 0 and +1 A from the published coefficients and checks
that composed voltage → current → force behavior equals the direct finite force contract.
It checks input/output correlations, including force reversal; it does not infer dynamics.
Nine typing certificates and one finite behavior certificate can be checked independently:

```sh
node --import tsx examples/assurance/effects-products.mjs --cert-dir /tmp/triz-products
node scripts/certify.mjs --local --tamper /tmp/triz-products/*.lean
```

The sources establish that the selected mechanisms appear in actual engineering systems.
The executable checks establish catalogue coverage, valid wiring and the supplied finite DC
calculation. They do not reproduce the complete products, validate patent claims, or establish
measured dust removal or refrigeration performance.

## Recent patent validation

`pnpm example:effects-recent-patents` checks nine selected publications between 2025-01-01 and
2026-10-31. The [fixture](../examples/assurance/fixtures/recent-patent-cases.json) records exact
publication/priority dates, document kind and source locations. Seven are applications; two are
grant publications with older priorities. This is a purposeful cross-domain sample, not a
representative patent corpus, a novelty search or a test of every claim.

| Publication | Source-grounded finding |
|---|---|
| [US20250143383A1](https://patents.google.com/patent/US20250143383A1/en), electroadhesive apparel | Electrostatic attraction is present. Clutch contact, friction and control are a mechanism/coupling problem, not grounds for another primitive force response. |
| [WO2026094397A1](https://patents.google.com/patent/WO2026094397A1/en), radiative cooling | Conduction and thermal radiation are present. Geometry, spectra and heat balances remain necessary to support any cooling-performance conclusion. |
| [US20260029171A1](https://patents.google.com/patent/US20260029171A1/en), magnetic refrigeration | Add the missing magnetocaloric field-change → temperature-change clause (76); Curie switching does not supply its inverse. |
| [WO2026087545A1](https://patents.google.com/patent/WO2026087545A1/en), polymer electrocaloric element | Add the missing electrocaloric clause (77), with explicit field endpoints and approximately adiabatic conditions. |
| [EP4053471B1](https://patents.google.com/patent/EP4053471B1/en), ceramic electrocaloric element | Reuse clause 77 for another material implementation; material calibration and manufacturing evidence remain distinct. |
| [US20250161559A1](https://patents.google.com/patent/US20250161559A1/en), piezoelectric micropump | Add converse actuation (75). Existing stress → voltage sensing cannot be inverted automatically to supply it. Pumping and power-loss closure need additional models. |
| [EP3842087B1](https://patents.google.com/patent/EP3842087B1/en), electroosmotic pump | Add liquid electroosmosis (78). Gas-phase ionic wind and osmotic pressure are different responses; the larger delivery arrangement remains outside this clause. |
| [US20250348727A1](https://patents.google.com/patent/US20250348727A1/en), memristor crossbar | Fixed-conductance readout is only a subclause. Stored weights, programming history, multi-input accumulation and training remain explicit modeling requirements. |
| [US20250356258A1](https://patents.google.com/patent/US20250356258A1/en), selective speculative decoding | Model selection, drafting and verification are an algorithmic construction. Probability preservation cannot be concluded from equal unweighted input/output support. |

For nine selected physical subclauses across these documents, exact requested paths are available
in 4/9 cases before the extension and 9/9 after it. These tests use the current engine and common
quantity vocabulary; the baseline excludes ids 75–78. This measures selected clause coverage,
not complete patent coverage or the absence of alternate engineering solutions. All previously
available paths produce the same models and assumptions. Seven invalid serial substitutions fail.
Three additional conditional compositions also check: Seebeck → piezo actuation `[7,75]`,
magnetocaloric → thermal expansion `[76,1]`, and electrocaloric → thermal expansion `[77,1]`.
Operating conditions remain hypotheses, including loading and thermal/mechanical coupling.

The new clauses share piezoelectric/caloric families. Separately, three repeated declarations
are removed: optical current generation (15/67), optical signal transfer (16/17), and angular-to-
linear geometric transfer (51/56). Other optical voltage conversion uses the same electrical
response family. The calculation is **69 previous interfaces + 4 new clauses - 3 repetitions =
70 interfaces**, with 78 named entries. A scan finds no further identical declared
`(role, field, input quantity, output quantity)` interfaces stored independently. That criterion
does not establish a minimal basis of physics or imply equivalence of the retained case laws.

Two controls make the remaining semantics gaps executable. A temporary synthetic programmed-
conductance component gives a different current for the same read voltage after a write pulse;
the stateful model reaches that condition at tick 2, while a fixed-resistance model cannot. Its
trace is rechecked and certified using the existing dynamics kernel. It is not a calibrated
memristor or trained crossbar. A selected binary similarity gate then runs exact corrected
sampling or ordinary target sampling over 25 rational distribution pairs: 13 enable speculation,
12 disable it, and every resulting distribution equals its target. The metric and finite values
are authored examples; no arbitrary probabilistic theorem or measured inference speed is claimed.
Neither construction is installed as a new primitive effect.

The script emits 12 typing certificates and one dynamics certificate. CI checks them and altered
variants independently:

```sh
node --import tsx examples/assurance/effects-recent-patents.mjs --cert-dir /tmp/triz-recent
node scripts/certify.mjs --local --tamper /tmp/triz-recent/*.lean
```

Remaining priorities are calibrated multi-input thermal/fluid/contact models, explicit material
state/history, and stronger probabilistic semantics. More predefined names alone do not fill
those gaps. A schema-valid clause or a granted patent is not empirical validation of a device.

## Reusable patterns identified in patent disclosures

The abstraction column is our interpretation of the disclosed construction. A patent disclosure
is evidence of a described implementation, not proof of every generalized engineering property.
The summaries and example rows are authored here; patent text and diagrams are not reproduced.

| Candidate family | Representative disclosure | Suitable formal representation | Required evidence |
|---|---|---|---|
| Hysteretic switching | [EP0041363A1, Schmitt trigger](https://patents.google.com/patent/EP0041363A1/en) | Stateful component with two guards and a retained state | Threshold order, initialization, admissible inputs; example tested above |
| Feedback regulation | [US2102671A, wave translation system](https://patents.google.com/patent/US2102671A/en) | Controller/plant/sensor wiring with a feedback connection | Loop sign, gain, delays and a stability argument; steady-state consistency alone is insufficient |
| Direction-dependent transport | [US1329559A, valvular conduit](https://patents.google.com/patent/US1329559A/en) | Multiport flow relation with direction-dependent resistance | Geometry, fluid and flow regime; reverse leakage remains possible |
| Redundancy and correction | [US2552629A, error detecting/correcting](https://patents.google.com/patent/US2552629A/en), [EP4576465A1, majority detection](https://patents.google.com/patent/EP4576465A1/en) | Encoder ∘ declared fault channel ∘ decoder, compared with a reference | Error budget, voter behavior and redundancy cost; information copying does not establish material/energy copying |
| Lossless encoding | [US4558302A, compression/decompression](https://patents.google.com/patent/US4558302A/en) | Encode/decode maps with a round-trip contract | Valid domain, dictionary/state synchronization; size reduction depends on the source |
| Reference-based detection | [US3764924A, synchronous detection](https://patents.google.com/patent/US3764924A/en) | Signal + phase reference → mixing/filtering → estimate | Reference coherence, filtering interval and noise assumptions |
| Countercurrent exchange | [EP3428564B1, exchanger/reactor](https://data.epo.org/publication-server/rest/v1.0/publication-dates/20200527/patents/EP3428564NWB1/document.pdf) | Coupled streams with opposed paths and exchange components | Energy/material balances, conductances, capacities and boundary conditions |

These families belong in parameterized component catalogues or explicit wiring constructions when
they have several inputs, outputs or state. The existing `ComponentCatalogue` supports such
interfaces and explicit type bindings; the prototypes exercise it. A universal unary `thing → thing`
type would discard the structure that makes these patterns useful.

## Recent results: distinguish response classes, realizations and constructions

The following is a shortlist, not a ranking of scientific importance. Mathematical and computing
entries are constructions/theorems or algorithms, rather than empirical physical effects. Every
row needs a precise interpretation and its own evidence before becoming an engineering generator.

| Result and dates | Architectural opportunity | Candidate contract and current limit |
|---|---|---|
| [Odd elasticity](https://www.nature.com/articles/s41567-020-0795-y), preprint 2019 / paper 2020 | Active mechanical materials with nonconservative, nonreciprocal elastic response | Multi-axis strain → stress, with active supply and work accounting; research constitutive model, not passive free energy |
| [Temporal reflection and frequency translation](https://www.nature.com/articles/s41567-023-01975-y), new photonic realization published 2023; theoretical ancestry 1958 | Control waveforms by switching a medium in time, adding a temporal design degree of freedom | Wave + switching/pump protocol → transformed wave; demonstrated in a switched transmission-line metamaterial, not a general arbitrary-frequency device |
| [Altermagnetic spin splitting](https://www.nature.com/articles/s41586-023-06907-7), 2024 experiment | Candidate spin-selective components without ferromagnetic net magnetization | Magnetic order, momentum and material → spin-resolved response; observed band structure, with device use requiring further evidence |
| [Good quantum LDPC codes](https://arxiv.org/abs/2111.03654), 2021 / STOC 2022; [radial single-shot codes](https://journals.aps.org/prxquantum/abstract/10.1103/67xf-zdjb), April 2026 | Alternative protected quantum memories and different qubit/measurement overheads | Encode → specified quantum noise → syndrome/decoder → recovery; the 2026 performance is numerical. Classical finite relations cannot certify quantum-channel correctness |
| [Almost-linear max/min-cost flow](https://arxiv.org/abs/2203.00671), 2022; [deterministic version](https://arxiv.org/abs/2309.16629), 2023 | New asymptotic options for large constrained routing and resource allocation | Integral capacitated graph → feasible optimal flow; distinguish a checkable flow/optimality witness from implementation complexity and practical speed |
| [Speculative decoding](https://proceedings.mlr.press/v202/leviathan23a.html), 2023 | Cheap proposal computation followed by parallel verification and correction | Draft + target probability kernels → samples with the target law; distribution preservation needs probabilistic semantics beyond the present relational checker |
| [Nova](https://crypto.iacr.org/2022/papers/538806_1_En_13_Chapter_OnlinePDF.pdf), 2022; [MicroNova](https://eprint.iacr.org/2024/2099), preprint 2024 / publication 2025 | Incrementally verifiable computation with proof size/verification independent of the number of accumulated steps under the stated scheme | Prior accumulator + next constrained step → updated accumulator/proof; cryptographic soundness/setup assumptions are distinct from existing Lean model certificates |
| [FlashAttention](https://arxiv.org/abs/2205.14135), 2022; [FA3](https://arxiv.org/abs/2407.08608), 2024; [FA4](https://arxiv.org/abs/2603.05451), March 2026 preprint | More capable tensor workloads by reorganizing data movement, recomputation and hardware pipelines | Same real-arithmetic operation with a different resource schedule; floating-point tolerance and hardware-specific cost models require separate contracts |
| [Selective state spaces / Mamba](https://arxiv.org/abs/2312.00752), 2023 | Input-dependent retained state as an alternative sequence-model architecture | State + input → next state + output; linear sequence scaling does not establish equal predictive quality to another architecture |

Twist-controlled moiré materials are another important family: the [2018 magic-angle graphene
experiment](https://www.nature.com/articles/nature26160) showed tunable correlated and superconducting
states. The useful new design control is stack geometry/twist and carrier density; recording only
another `current → current` entry would hide that capability.

## Novelty audit: which are new effects and which are compositions?

The shortlist does not establish any new fundamental interaction. “New to our catalogue,” “newly
identified effective response,” “first demonstrated implementation,” and “new construction with a
stronger guarantee” must be recorded separately. Most computing examples are constructions or
architectures composed from existing operations. Their importance can be a new preservation
property or an improved resource bound rather than a new observable physical mechanism.

| Example | Classification | What is actually new |
|---|---|---|
| Odd elasticity | Newly characterized effective constitutive response / theoretical framework | An active stress–strain response with additional nonconservative moduli; realizations use interacting active elements |
| Altermagnetic spin splitting | Newly identified magnetic symmetry/response class, experimentally confirmed | A spin-splitting mechanism compatible with vanishing net magnetization in the specified material symmetry class |
| Temporal reflection demonstration | New realization of an older predicted effect | The photonic implementation overcomes rapid spatially uniform switching constraints; its [paper](https://arxiv.org/pdf/2208.07236) cites Morgenthaler’s [1958 work](https://doi.org/10.1109/TMTT.1958.1124533) as foundational |
| Quantum LDPC/radial codes | Mathematical code constructions and guarantees | Different achievable rate, distance, locality and decoding properties under stated assumptions |
| Almost-linear min-cost flow | Algorithm with a new complexity guarantee | A composed optimization/data-structure method with an improved asymptotic bound |
| Speculative decoding | Algorithmic composition with a distribution-preservation guarantee | Cheap proposal + parallel target evaluation + probability-correct rejection/replacement; ordinary speculation predates it |
| Nova/MicroNova | Cryptographic construction | Folding/accumulation with a specified soundness and verification-cost contract |
| FlashAttention | Algorithm and hardware schedule | Tiling, online normalization and recomputation organized to reduce data movement; later versions adapt pipelines to hardware |
| Mamba | Model architecture | Selective state updates integrated with an efficient execution algorithm |

A precise composition may still unlock a system that was previously impractical. The useful
comparison is its externally visible contract and resource budget against the stated baseline.
The number of constituent techniques is not a measure of novelty. Our hysteresis and repetition
examples demonstrate the value of modeling known compositions; they are not discoveries.

For a future database extension, physical response generators remain distinct from
reusable composite implementations. A composite should carry its component/wiring graph,
assumptions, semantic contract and resource costs; any claimed new guarantee should identify its
proof or experimental evidence. Candidate metadata should distinguish `response-class`,
`realization`, `construction`, and `resource-improvement`, with separate prediction and
demonstration dates. The schema now implements modeling kind, shared interface specializations and executable
serial recipes. Scientific-novelty labels and separate discovery/demonstration dates remain
proposed metadata. No candidate in this report has been silently promoted to a new primitive.

## How to make future entries useful

Expert contributions should distinguish (1) the newly available control or resource, (2) the
transformation or network it enables, (3) the property guaranteed or observed, (4) its assumptions,
(5) its resource cost, and (6) its evidence maturity: theorem, simulation, experiment or operational
implementation. Discovery date and latest evidence date should be separate.

A recent material instance can specialize an existing effect family; a new architecture can
instead require a multiport component, a stateful operation or a wiring constructor. The proposed
catalogue architecture should distinguish these from theorem-backed constraints. Quantum channels,
probabilistic distribution equality, continuous stability and asymptotic complexity need additional
semantics and proofs; the current finite typing/behavior certificates do not establish them.

My implementation priority is reusable contracts for hysteresis, coding/correction and
proposal/verification, followed by quantitative resource and probability contracts. Physical
frontier mechanisms should enter expert-curated draft packs with their operating regime and
controlling inputs preserved. Their engineering value should be tested through a specified
before/after task and a negative control, as in the examples above.
