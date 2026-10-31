# Which effects to retain as compounds and which models to split

Assessment date: 2026-10-31. `effects.json` records 34 sourced decisions: 15 retain-compound,
six split-models and 13 retain-response; 44 entries remain unassessed. All 78 names and selected
discovery contracts/evidence remain available. Four implementations now derive from named
configurations; 19 multiport/stateful templates and two forward observations support composition.

## Decision rule

- **Split models** for different quantities, directions, state/history or system boundaries.
  Preserve the umbrella search name; temporal variants need state, not duplicate scalar arrows.
- **Retain compounds** whose useful function needs geometry, simultaneous interactions,
  balances, contact or feedback. A list of parts is not an executable serial recipe.
- **Retain responses** where a material/interaction law is the useful engineering abstraction.
  Common microscopic physics does not remove calibration, regimes or history.

These are architectural assessments, not irreducibility or equivalence proofs. `kind` describes
the selected typing; `model_assessment` reviews the broader named function. Entry 60, for example,
types mismatch stress while detachment additionally needs adhesion/fracture behavior.

## Six split groups

| Id / umbrella | Separate models and retained scope |
|---|---|
| 16, photoluminescence | Prompt fluorescence, triplet phosphorescence and separated-charge recombination differ in history. Light → light supplies no lifetime law. |
| 20, polarization | Analyzer transmission differs from stress-induced retardance. Photoelasticity needs material, path and wavelength; the analyzer now has explicit illumination. |
| 33, corona/ionic wind | Charge generation, ion-neutral force and gas flow compose with explicit pressure/field. Beam, photoelectron and corona sources remain distinct. |
| 35, superconductivity | DC transport and magnetic response share phase. Zero DC resistance supplies neither Meissner/levitation behavior nor zero system losses. |
| 46, sublimation/deposition | Heat → sublimated mass differs from vapor capture with heat rejection. Reversing an arrow or sign is insufficient. |
| 47, molecular sieves | Membrane permeation differs from cyclic-bed uptake, breakthrough and regeneration. Adsorption 32 does not supply a complete bed. |

Each template/facet retains its sources and limitations in [effects.json](../data/effects.json).
Entry 33 expands into three models; 20 replaces its scalar clause with an illuminated analyzer;
35/59 reuse existing models with sourced current/force observations. Independent unary interfaces
fall to 66. These engineering boundaries and 23 added quantity/state types are not new physical laws.

## Retained functions

| Decision | Entries and reason |
|---|---|
| Retain compound | 30 levitation; 40 sacrificial protection; 41 colorimetric assay; 49–56 geometric mechanisms; 57/58 release and cleaning; 60 mismatch detachment; 72 traveling-field transport. Their selected responses alone do not establish the full function. |
| Retain response | 6 vaporization cooling, 42 chemiluminescence and 45 photopolymerization retain their conditional phase/chemical laws. Generic transport or polymerization 39 cannot replace them. |
| Retain paired clauses | 2/75 piezoelectric sensing/actuation, 7/8 Seebeck/Peltier, 9/10 shape memory/superelasticity and 76/77 caloric responses retain distinct boundaries, material/branch calibration and history. The pairs are not inferred inverses. |
| Retain bounded response | 31 covers collapse of an existing bubble, not inception/growth. 34 covers induced current; `[34,64]` may heat, but braking also needs motion/force/feedback. |

Do not replace geometry or constitutive laws with generic “force”/“conversion” names and hidden
parameters. In particular, `[59,71]` is not a serial recipe for traveling-field dust transport.

## Use and validation

`triz_effects` accepts `assessment: "split-models"`, `"retain-compound"` or `"retain-response"`;
`triz_knowledge.taxonomy.model_assessments` includes unassessed ids across all installed packs.
Every assessment has `status: "assessment-only"`. Facet `effect` references must be typed;
`models` references must belong to the parent. Self/reciprocal observational links are allowed,
but neither kind of link becomes a generator, recipe, substitution or equivalence proof.

Tests remove assessments and verify unchanged discovery/setup, preserve legacy contract hashes,
and reject invalid references. Use the [catalogue/setup contract](knowledge-packs.md#multiport-and-stateful-configurations)
for explicit wiring and state. The [patent comparisons](../../../docs/effects-configurations.md)
check preserved names, resource-complete configurations and finite behavior. Further removals
require those checks and sourced boundary/regime justification. Equal units or fields alone do
not justify a merge; continuous constitutive-law proofs need additional models beyond finite Lean checks.
