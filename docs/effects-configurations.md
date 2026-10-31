# Decomposed patent configurations

The six split groups now expose 19 separate multiport/stateful model templates. The 78 named
effect lookups retain their selected boundaries; 66 unary interfaces remain independent and
entries 20/33/35/59 are derived named configurations; the 15 assessed compound mechanisms
remain discovery targets. These additions provide explicit connections and state boundaries,
not a count of new physical laws or a minimal basis. The physical pack has 88 quantity declarations;
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
declared quantities), the unary implementation entries (74 after four named conversions), five components maximum, one instance per template,
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

The first conversion replaced entry 33 with ionization → momentum transfer → gas flow, reducing
independently stored unary interfaces **70 → 69**. This update converts **20, 35 and 59** too,
reducing that count **69 → 66**. Names, ids, original selected boundaries and evidence remain
available for all **78** entries.

| Named view | Implementation | What was added |
|---|---|---|
| 20, polarization | Analyzer angle + incident irradiance → transmitted irradiance | One multi-input lifting of the existing Malus-law clause; its old scalar implementation is removed. |
| 33, ionic wind | Corona generation → ion-neutral force → gas flow | Existing three-model composition with explicit gas pressure and drift field. |
| 35, superconductivity | Shared material phase → phase-qualified DC transport → current observation | Reuse of two existing models and a forward observation of the same terminal current. |
| 59, electrostatic repulsion | Charged-particle force → force observation | Reuse of the existing qE model and a forward observation of the same force component. |

The two boundary observations forget qualifiers; they do not rescale values, add forces, reverse
refinements or establish zero resistance from current transmission. Their source/target must
identify the same path or particle population, frame/component and observation interval. Finite
value domains, thresholds, layer and resource-allocation semantics must agree explicitly.
Configuration internal wires still use exact parameter identity. Observation components enter a
search catalogue only through an explicit request, never as global type aliases.

There are **19 physical model templates**, up from 18, and two separately registered semantic
observations. Independent unary declarations plus multi-input model templates fall **87 → 85**;
this counts stored physical response interfaces, not irreducible laws. No quantity definitions
are added. Copying all remaining scalar clauses into model wrappers would not provide this
reduction and is not done.

`pnpm example:effects-reduction` reconstructs the original pre-reduction effect records and the
previous PR version from frozen fixtures. It compares **386 ranked text queries** covering every
name/function/hint and **78 one/two-step typed-chain queries**. Ordered lookup ids and chain paths
remain identical. Named configuration summaries are marked for expansion, and opaque insertion
is rejected. Setup expands physical model nodes, context inputs and explicit observations.

For the original eight patent subsystems, all intended mechanisms and all **51 fully expressed
candidate topologies** survive. The prior library also had three extra topologies containing the
opaque current-to-current entry 35: one magnetic-readout candidate and two photoelectron-wind
candidates. Those shortcuts are removed because transport now needs a shared phase and explicit
material context. They are reported separately, rather than calling the total **54 → 51**
universal retrieval preservation. No other former candidate wiring is lost under the same bounds.

## Additional patent boundary cases

Three stronger, resource-complete boundary queries are tested with blinded component names.
Observation selection follows the requested output parameter; the expected component list is
only checked after search. A state-meaning restriction comes from the disclosed material mechanism.

| Publication and locator | Validated selected clause | Before this update | After |
|---|---|---|---|
| [EP4370907B1](https://patents.google.com/patent/EP4370907B1/en), 2026-02-18, polarizer 43, Malus equation, Fig. 4 and claims 1/2/5/9 | Angle and incident irradiance to analyzer output | Absent | Found |
| [US20250140461A1](https://patents.google.com/patent/US20250140461A1/en), 2025-05-01, persistent-mode wire/current description | Current, temperature and field through a shared superconducting phase to a current observation | Absent | Found |
| [WO2026017232A1](https://patents.google.com/patent/WO2026017232A1/en), 2026-01-22, separate static electrode | Charge and field to the selected particle-force component observed as force | Absent | Found |

This is **11 subsystem cases across 10 publications**, including the original eight. The three
new queries require every listed resource to participate; their absence before the update does
not mean the original broad names could not be retrieved. Scopes exclude defect-image analysis,
complete superconducting switch design, net detachment force and empirical device performance.
Recent publication dates do not imply newly discovered physics.

Selected finite controls compare expanded views with declared legacy references:

- Malus-law points at 0°, 45° and 90°, with explicit incident irradiance. Zero illumination yields
  zero transmitted irradiance.
- Signed qE force points at a selected charge, with the same force values across the observation.
  A sign-changing observation fails comparison.
- A superconducting DC branch with its phase explicitly fixed for the steady comparison. The
  full configured model retains state and has a separately checked trace. Outside that selected
  phase/temperature envelope the finite SC clause has no supported relation; this does not assert
  that normal conductors cannot carry current. Zero loss is not inferred from I → I.

The reduction runner emits **nine Lean certificates**: four typings, four selected finite
boundary equivalences (including the original ionic wind), and a retained-state current trace.
Lean acceptance and tamper checks cover these declared finite models. They do not prove
continuous constitutive laws or patent-wide performance.

Photoluminescence still needs explicit mechanism selection before its refined emission can be
exposed through a broader optical interface. Sublimation and membrane permeation remain distinct
from deposition and cyclic adsorption. Further conversions need independent boundary and regime
justification, not same-dimensional casts or wrappers around copied primitives.

See the [mapping/setup contract](../skills/triz-innovation/references/knowledge-packs.md#named-compositions-instead-of-redundant-effect-generators).
