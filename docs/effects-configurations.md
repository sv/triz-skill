# Decomposed patent configurations

The physical pack exposes 19 multiport/stateful templates for six split groups. All 78 names
and selected discovery signatures remain; four entries (20/33/35/59) now derive from named
configurations, leaving 66 independent unary interfaces. The registry has 91 quantity/state
definitions (88 physical, three universal). These counts do not establish a minimal physical basis.

Run `pnpm example:effects-configurations` and `pnpm example:effects-reduction`.
The [configuration fixtures](../examples/assurance/fixtures/decomposed-patent-cases.json) and
[boundary fixtures](../examples/assurance/fixtures/boundary-patent-cases.json) retain publication/
priority dates, source locators, exact resources/targets and exclusions. Recent publication does
not imply newly discovered physics; all descriptions are repository-authored abstractions.

## Method and result

An analyst extracts typed resources, outputs, state/history, operating regime and topology from
each disclosure; there is no automatic patent parser. Search receives anonymous component ids/
names, with tags/domains omitted, and no title query or expected components. Expected mechanisms
are asserted afterwards. Disclosed state meanings restrict stateful candidates while allowing
stateless alternatives. Conditions and finite implementation behavior are separate checks.

Both runs use the same vocabulary, 74 unary entries after the four conversions, five components
maximum, one instance per template, all resources required, a million work units and 100 results.
The extended run also includes the registered models. The selected regression result is
**0/8 → 8/8 resource-complete configurations**, not a patent-wide recall or performance estimate.
Several queries introduce boundaries that unary discovery cannot express; broad effect-name
retrieval already worked before this extension.

| Disclosed subsystem | Recovered decomposition | Components |
|---|---|---|
| [US20260220288A1](https://patents.google.com/patent/US20260220288A1/en), Figs. 17A–17D | Stress difference → retardance; retardance + illumination → irradiance | 2 |
| [US20240369052A1](https://patents.google.com/patent/US20240369052A1/en), Fig. 1 ice layer | Vapor flow + heat rejection → solid capture rate | 1 |
| [US12590245B2](https://patents.google.com/patent/US12590245B2/en), donor/acceptor transfer | Excitation → emission with separated-charge history | 1 stateful |
| [US12352634B1](https://patents.google.com/patent/US12352634B1/en), Figs. 1A–1D | Temperature/field/current → shared phase → magnetic response | 2 |
| [WO2026017232A1](https://patents.google.com/patent/WO2026017232A1/en), electrode description | Corona → ion-neutral force → flow, alongside particle charge + field → force; both assist release | 5 |
| [US20260237975A1](https://patents.justia.com/patent/20260237975), exit window/electrode | Beam + voltage + pressure → ions; reuse force and flow | 3 |
| [US20260002524A1](https://patents.justia.com/patent/20260002524), emitter description | Photoelectric effect 15 → gas charging → ion-neutral force → flow | 4 |
| [US12528043B2](https://patents.google.com/patent/US12528043B2/en), Fig. 3 purge stages | Heated purge → regeneration capability; feed/flow/command + capability → stateful bed | 2 |

The three ionic-wind sources share downstream templates, not an ion-generation law. Stored-charge
afterglow remains distinct from triplet phosphorescence, and hybrid panel cleaning from traveling-
wave shielding. Fixtures exclude whole-device claims: cryopanel hydrogen adsorption, integrated
SQUID readout, complete multi-bed processing and undisclosed feedback are outside these queries.

## Named-composition reduction

| Named view | Expanded implementation | Change |
|---|---|---|
| 20, polarization | Analyzer angle + incident irradiance → transmitted irradiance | One lifted analyzer model replaces the old scalar clause. |
| 33, ionic wind | Corona → ion-neutral force → gas flow | Existing models; pressure and drift field stay explicit. |
| 35, superconductivity | Shared phase → qualified DC transport → current observation | Reuses existing models. |
| 59, electrostatic repulsion | Charged-particle force → force observation | Reuses the existing qE model. |

The two observations preserve the same physical value and encoding while forgetting qualifiers.
Their [mapping/setup contract](../skills/triz-innovation/references/knowledge-packs.md#named-compositions-instead-of-redundant-effect-generators)
requires explicit path/population, frame/component, interval and compatible finite domains.
They supply no inverse, unit cast, net-force sum or zero-loss inference from I → I.

Independent unary interfaces fall **70 → 69 → 66**; unary interfaces plus templates fall
**87 → 85** in the latest conversion (18 → 19 templates, no new quantities). Observations are
counted separately. Frozen pre-conversion records establish identical ordered results for
**386 name/function/hint queries** and **78 one/two-step typed-chain queries**. All intended
mechanisms and **51 fully expressed patent candidate topologies** survive. Three former
opaque current-to-current shortcuts disappear (one magnetic-readout and two photoelectron-wind
candidates), so the total **54 → 51** is reported separately from preservation. No other old
wiring is lost under the same bounds. Summaries require expansion; opaque insertion is rejected.

## Additional patent boundary cases

These resource-complete queries also blind names, choose observations from target types and
assert expected components only afterwards. All three are absent before the latest conversion
and found afterwards, giving **11 selected subsystems across 10 publications**.

| Publication and locator | Selected clause |
|---|---|
| [EP4370907B1](https://patents.google.com/patent/EP4370907B1/en), polarizer 43, Malus equation, Fig. 4, claims 1/2/5/9 | Angle + incident irradiance → analyzer output |
| [US20250140461A1](https://patents.google.com/patent/US20250140461A1/en), persistent-mode wire/current | Current/temperature/field → shared phase → observed current |
| [WO2026017232A1](https://patents.google.com/patent/WO2026017232A1/en), static electrode | Charge + field → selected particle force → force observation |

## Behavioral controls and formal scope

[Model tests](../tests/knowledge-models.test.ts) and the reduction runners check declared finite
implementations: ambiguous photoelastic intensity inversion using a sourced gelatin coefficient
([measurements](https://arxiv.org/abs/2208.00769)); stored-charge emission after excitation stops
and exhaustion; one shared superconducting phase with normal/transition/Meissner readouts;
finite bed breakthrough and heated-purge recovery; and rejection of missing cooling or same-SI
substitutions. Boundary controls cover Malus points at 0°/45°/90° and zero illumination, signed
qE and sign corruption, incompatible/reversed observations, and unsupported SC envelopes.
The steady SC comparison fixes phase; the configured model retains a separate stateful trace.

Setup uses the same checked hierarchy substitution as other open diagrams; scalar and named
effects share one assembly path. The Lean foundations are `external_seq` and
`external_substituteWired` in [Semantics](../theory/Semantics.lean) and [Hierarchy](../theory/Hierarchy.lean).
The TypeScript lowering is regression-tested, not extracted from Lean. After merging #52, the
boundary checks also compare indexed/factored evaluation with the shared engine's scan fallback
and reuse its bounded request-local summaries; corruptions still invalidate those summaries.

The subsystem-summary flow now shares #54's serial-map compiler: the declared ionic momentum/flow
pair and particle-force/observation pair each become one checked static boundary map. Their joint
context inputs and exact finite relations match the finite fallback. Analyzer readout and the
explicitly fixed-phase SC relation use finite projection; the full stateful SC model stays unknown
to static summarization. No discovery entry is replaced. `pnpm check:symbolic` also audits these
two fixed effect certificates and ten corrupted encodings of each, alongside its synthesis cases.

The configuration and reduction runners validate typing, selected finite equivalences and
retained-state behavior directly. Per-instance verdict/typing Lean certificate generation is
removed; the no-heat bed control remains a bounded JavaScript check of recovery rejection.
The independent symbolic map audit above continues to check its encodings locally.

These checks establish declared finite claims, not measured patent performance, continuous laws,
whole-device equivalence or calibration. No Physlib dependency is added. Photoluminescence still
needs mechanism selection; deposition does not replace sublimation, nor a bed a membrane.
Further reductions require sourced boundaries/regimes and preserved discovery, not copied
scalar wrappers or a shared field/unit. See the [assessment policy](../skills/triz-innovation/references/effects-decomposition.md)
and [calibration backlog](FUTURE-PLANS.md).
