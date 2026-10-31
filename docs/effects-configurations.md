# Decomposed patent configurations

The six split groups now expose 18 separate multiport/stateful model templates. The 78 named
effect lookups retain their selected boundaries; 69 unary interfaces remain independent and
entry 33 is now a derived named composition; the 15 assessed compound mechanisms
remain discovery targets. These additions provide explicit connections and state boundaries,
not 18 new physical laws or a minimal basis. The physical pack has 88 quantity declarations;
with three universal quantities the registry has 91.

Run `pnpm example:effects-configurations` for the eight-case comparison. The
[fixtures](../examples/assurance/fixtures/decomposed-patent-cases.json) record publication dates,
priority dates where verified (filing date for the photoelectron case), source locators, scope,
resources, targets and expected components. Recent publication does not imply recent discovery.
All source descriptions and templates are repository-authored abstractions, not copied patent text.

## Method and result

An analyst reads each disclosure and extracts resource types, required outputs, state/history,
operating regime and topology. There is no automatic patent parser. Search receives these typed
boundaries with component identifiers and names blinded; no patent title, query text or expected
component list is supplied. State-specific cases restrict permitted internal state meanings,
while stateless alternatives remain candidates. Expected components are checked only afterwards.

Both runs use the current bounded configuration engine, the same vocabulary (including newly
declared quantities), the unary implementation entries (77 after removal of the opaque entry 33), five components maximum, one instance per template,
all listed resources required, a million work units and up to 100 results. The extended run
also has the registered models. No search hit is a proof that the complete device works.

| Disclosed subsystem | Decomposition recovered | Unary library | Extended library |
|---|---|---|---|
| [US20260220288A1](https://patents.google.com/patent/US20260220288A1/en), 2026-07-30, Figs. 17A–17D | Principal stress difference → retardance; retardance + illumination → transmitted irradiance | Absent | 2 components |
| [US20240369052A1](https://patents.google.com/patent/US20240369052A1/en), 2024-11-07, Fig. 1 ice layer | Condensable vapor flow + available heat rejection → solid capture rate | Absent | 1 component |
| [US12590245B2](https://patents.google.com/patent/US12590245B2/en), 2026-03-31, donor/acceptor transfer description | Excitation → emission with separated-charge history | Absent | Stateful component; prompt alternative needs temporal rejection |
| [US12352634B1](https://patents.google.com/patent/US12352634B1/en), 2025-07-08, Figs. 1A–1D | Temperature/field/current → shared phase → local magnetic response | Absent | 2 components |
| [WO2026017232A1](https://patents.google.com/patent/WO2026017232A1/en), 2026-01-22, electrode description | Corona → ion-neutral force → flow, alongside particle charge + field → particle force; both assist release | Absent | 5 components |
| [US20260237975A1](https://patents.justia.com/patent/20260237975), 2026-08-13, exit window and accelerating electrode | Electron beam + accelerating voltage + gas pressure → ions; reuse force and flow | Absent | 3 components |
| [US20260002524A1](https://patents.justia.com/patent/20260002524), 2026-01-01, low-work-function emitter description | Existing photoelectric effect 15 → photoelectron gas charging → ion-neutral force → flow | Absent | 4 components |
| [US12528043B2](https://patents.google.com/patent/US12528043B2/en), 2026-01-20, Fig. 3 purge stages | Purge flow + temperature → regeneration capability; feed/flow/command + capability → stateful bed product/loading | Absent | 2 components |

The result is **0/8 → 8/8 selected, resource-complete configurations**. This is a deliberately
selected regression set, not a recall estimate across patents. Several queries introduce
boundaries the unary catalogue could not express. The result measures that additional modeling
capability; it does not imply the old catalogue could not find the original broad effects.

All three ionic-wind cases share downstream force/flow templates. Their source mechanisms differ:
a beam window, a light-driven surface emitter and a corona electrode are not synonyms. Stored-charge
afterglow likewise remains distinct from triplet phosphorescence. The hybrid panel cleaner retains
its coupled release model and is not identified with traveling-wave electrodynamic shielding.

The cryopanel case covers solid capture, not hydrogen adsorption or sputter-plasma generation.
The superconducting case stops at local magnetic response, not integrated coil flux/SQUID output.
The adsorption case covers a scheduled bed and heated purge, not the patent's complete split-feed,
multi-bed cooling process or an undisclosed sensor feedback loop. Each fixture records these limits.

## Behavioral controls and formal scope

[Regression tests](../tests/knowledge-models.test.ts) separately declare finite implementations:

- A chosen gelatin stress-optic coefficient, path length and wavelength produce a three-point
  retardance/intensity relation. Two stresses produce the same intensity, preventing an assumed
  unique inverse. The coefficient comes from [the original measurements](https://arxiv.org/abs/2208.00769);
  the path, wavelength and finite operating points are example choices, not patent calibration.
- Excitation charges a finite store. Emission after excitation stops is reachable for the stored-charge
  model and absent for the prompt approximation. An exhausted store cannot emit indefinitely.
- Electrical and magnetic responses consume one shared phase producer. Normal, partial-transition
  and Meissner labels have explicitly declared readouts; normal material cannot expel the field in
  that finite model. This does not supply a continuous transition curve or vortex physics.
- A finite bed produces clean product, breaks through, interrupts feed for purge and recovers.
  Removing the declared purge heat prevents recovery. The abstraction does not claim calibrated
  capacity, kinetics, purity or efficiency.
- Deposition cannot be wired without cooling capacity. Supplied heat flow cannot substitute for
  heat-rejection capacity merely because both have SI dimensions of power. Conditions and limits
  survive catalogue import into candidate provenance.

The example emits eight Lean typing certificates with `--cert-dir DIR`; CI accepts them and
rejects tampered copies. The focused tests also check five configured certificates: two typing,
a stored-charge trace, a shared-phase invariant and a regenerated-bed trace. The full no-heat bed
invariant exceeds the existing certificate valuation cap; the bounded JavaScript dynamics check
rejects recovery, and only its typing is certified. No physical or whole-patent equivalence is
asserted. No Physlib dependency is needed for these finite checks.

For an expert contribution, add or split a model when a disclosed boundary/state/regime is
missing. Retain a compound when its function requires simultaneous interactions or geometry.
Before removal, run the old compatibility snapshots, the original product/patent examples and
this configuration suite. Equal units or a shared field classification alone never justify a merge.

## Named-composition reduction

`pnpm example:effects-reduction` compares the catalogue immediately before this reduction
(commit `d73b26887ce99d589a830d3dc062e4f918c7f0fd`) with the current version. The prior entry 33 is
frozen as a reconstruction fixture; other pack contents are identical on both sides.

**Entry 33, corona discharge and ionic wind, is converted from an independently declared unary
implementation to a named composition:** corona ionization → ion-neutral momentum transfer → gas
flow. The compiler derives voltage → fluid velocity from primary ports. Pressure and drift field
are exposed context resources, and constituent assumptions/provenance remain visible. No new
models or quantity definitions are added for this reduction. Named effect count stays **78**;
direct unary definitions fall **56 → 55**, and independent unary interfaces **70 → 69**.

The name remains a conditional summary for text and effect-chain discovery. Setup expands all
three boxes; opaque insertion is rejected. No component-search catalogue contains a one-box
entry 33 after the reduction. This is removal of an independent implementation, not removal of
the named discovery target or a claim of physical equivalence without conditions.

Validation compares:

- **386 ranked text queries**, covering every effect name, function and hint: identical ordered ids.
- **78 typed queries**, one/two-step chains at each old selected boundary: identical ordered paths.
- **Eight modern-patent subsystems**, with the same bounds and component names blinded:
  identical complete candidate wiring sets, **54 candidates before and 54 after**. The fixture
  checks no truncation and compares canonical component/port connections, not just totals or one
  expected path. Beam and photoelectron ion sources keep their shared downstream configurations.
- A selected finite voltage-to-velocity relation with explicitly fixed pressure/field: composition
  preserves the declared reference relation. Altering the force-to-flow relation is detected;
  missing context availability is rejected. Two Lean certificates cover expanded typing and this
  finite equivalence, with tampered copies rejected. These rows are example declarations, not
  measured patent performance or a proof of continuous electrohydrodynamics.

Further old clauses are retained because the installed models do not exactly realize them:

| Old clause | Why retained |
|---|---|
| 16, light → light | Temporal models emit the refined emitted-light type; alternatives also require mechanism/state selection. An automatic coarse projection would hide that choice. |
| 20, analyzer angle → irradiance | Retardance readout varies a different optical input; it does not supply the analyzer-angle clause. |
| 35, current → current | The new transport output is explicitly transmitted DC current and depends on shared phase. No unverified coarse-type projection or phase omission is introduced. |
| 46, heat → sublimated mass | Cold-surface deposition has a different direction, rate boundary and heat-rejection resource. |
| 47, feed → membrane permeate composition | A cyclic bed has different output, loading, feed interruption and regeneration requirements. |
| 59, field → force | Charged-particle force has a refined parameter and explicit charge input. Equal newtons do not authorize retagging it as an arbitrary force. |

The [setup contract](../skills/triz-innovation/references/knowledge-packs.md#named-compositions-instead-of-redundant-effect-generators)
explains how experts can contribute further exact realizations. Passing these regressions
establishes bounded preservation on this chosen suite, not universal discovery quality.
