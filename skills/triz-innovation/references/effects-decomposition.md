# Which effects to retain as compounds and which models to split

Assessment date: 2026-10-31, following the merge of PR #53. The 78 names and selected
contracts were screened for abstraction mismatches. Thirty-four nontrivial decisions are
recorded in `effects.json`: 15 retain-compound, six split-models and 13 retain-response.
The other 44 have no new detailed assessment. The original effect names, unary typings, assumptions and evidence records remain intact.
The implementation adds 18 multiport/stateful templates and 23 quantity types for the six split groups.

These are architectural judgments at the current engineering resolution. Sources support
the phenomena and distinctions; they do not prove our proposed decomposition. An effect's
`kind` describes its selected registered typing, while `model_assessment` reviews the whole
named function, which can include additional behavior. For example, entry 60 currently types
temperature change to mismatch stress; its name also refers to detachment, a compound goal.

## Decision rule

- **Split models** when the entry bundles different observable contracts: different input/output
  quantities, process direction, temporal behavior, state or system boundary. Preserve the
  umbrella name for discovery; do not create duplicate scalar arrows for temporal variants.
- **Retain a compound mechanism** when its useful function depends on geometry, simultaneous
  interactions, balances, contact conditions or feedback. Identify its parts, but retain the
  named search target. A list of parts is not an executable serial recipe.
- **Retain a coupled response** when a material or interaction model supplies the useful
  engineering abstraction. Shared microscopic physics does not eliminate calibration, material
  state or operating regimes. This decision does not claim fundamental irreducibility.

## Six entries needing distinct clause models

| Id / search umbrella | Keep these models distinct | What is currently typed |
|---|---|---|
| 16, photoluminescence and phosphorescence | Prompt fluorescence, triplet phosphorescence and separated-charge recombination implementations | Light → light only; no emission lifetime or state law is inferred. Phosphorescence is a subtype of photoluminescence, so the current name is an umbrella with a subtype, not two independent effects. [NIST](https://www.nist.gov/glossary-term/47276), [IUPAC fluorescence](https://goldbook.iupac.org/terms/view/F02453) |
| 20, polarization | Analyzer transmission versus stress-induced birefringence/retardance | Analyzer angle → irradiance. A photoelastic model needs material, optical-path and wavelength assumptions and its own stress/retardance boundary. [Polarization](https://openstax.org/books/university-physics-volume-3/pages/1-7-polarization), [original photoelasticity measurements](https://arxiv.org/abs/2208.00769) |
| 33, corona discharge and ionic wind | Electrical ionization/discharge current versus neutral-gas flow | Voltage → fluid velocity under supplied corona conditions. Keep ionic wind as a compound mechanism; ion generation and ion-neutral momentum exchange are distinct parts, not a ready-made unary chain. [Ionic-wind measurements](https://doi.org/10.1103/PhysRevFluids.3.063701), [electroaerodynamic aircraft](https://www.nature.com/articles/s41586-018-0707-9) |
| 35, superconductivity | DC transport versus magnetic/Meissner response | Current → current inside the superconducting envelope. The contracts should share a material-state model; zero DC resistance does not itself provide magnetic expulsion, pinning or levitation behavior. [Superconductors](https://openstax.org/books/university-physics-volume-2/pages/9-6-superconductors) |
| 46, sublimation and deposition | Solid → vapor versus vapor → solid process models | Heat → sublimated mass. Deposition needs its own inventory, mass-transfer and heat-rejection conditions; reversing an arrow or a sign is insufficient. [Phase transitions](https://openstax.org/books/chemistry-2e/pages/10-3-phase-transitions) |
| 47, molecular-sieve separation | Membrane permeation versus an adsorbent-bed cycle | Feed composition → membrane permeate composition. A bed needs uptake, breakthrough and regeneration state; adsorption 32 alone does not supply the complete bed. [DOE membrane example](https://www.energy.gov/science/bes/articles/traffic-cop-molecules), [DOE adsorption cycles](https://www.energy.gov/sites/default/files/2022-10/CCUS-Chap_5-030521.pdf) |

The six groups now have separate templates in `effects.json.models`. These are engineering
boundaries, not new independent physical primitives. Their source-backed conditions remain
hypotheses until an implementation supplies calibration, state transitions and resource rows.
The existing unary clauses remain usable. Fifteen assessed compounds remain named mechanisms.

Use `triz_component_catalogue` with `source: "knowledge"`, then pass the returned catalogue to
`triz_component_search`. This supports multi-input wiring, shared material state and explicit
finite dynamics without forcing a network into a serial recipe. See the
[setup contract](knowledge-packs.md#multiport-and-stateful-configurations) and
[patent comparison](../../../docs/effects-configurations.md). No Physlib import is required for
these finite typing/behavior checks; continuous constitutive-law proofs would need additional
formal models and evidence.

## Fifteen named functions to retain as compounds

| Entries | Why retain the mechanism | Boundary of the existing clause |
|---|---|---|
| 30, acoustic levitation | Radiation force, weight/other forces and spatial trapping must work together | A force response at a declared position is not a stability or levitation proof. |
| 40, sacrificial protection | Material consumption, galvanic/electrolyte coupling and protection potential must agree | Current → anode-consumption rate does not establish protection of the other structure. |
| 41, colorimetric assay | Chemical response, optical absorption and calibrated readout are coupled | Concentration → absorbance requires declared chemistry and calibration. |
| 49–56, wedge, lever, screw, gears, flexure, conic focus, cellular structures and origami | Geometry, boundary constraints and material/interaction laws define each implementation | Shared force, displacement or light interfaces preserve neither geometry nor actual behavior by themselves. |
| 57–58, vibration release and back-pulse cleaning | Excitation/flow, contact dynamics and adhesion determine release | The declared release clause does not establish a complete cleaning cycle. |
| 60, thermal-mismatch detachment | Expansion, constraint stress and fracture/adhesion are coupled | The selected stress output is not a detached-mass output. |
| 72, traveling-field dust transport | Phased drive, electrostatic/DEP forces, adhesion and particle dynamics form a mechanism | Force responses 59 and 71 act together; `[59,71]` is not a serial recipe. [NASA operating description](https://ntrs.nasa.gov/citations/20150016082) |

Do not replace these entries with generic names such as "conversion" or "force". That would
move their geometry and constitutive assumptions into hidden parameters and lose useful
discovery targets. A future checked realization can replace a generator while preserving its
name as a view, once its boundary behavior, state and conditions are justified.

## Coupled responses to retain at this resolution

- **Vaporization cooling (6), chemiluminescence (42) and photopolymerization (45):** keep their
  conditional phase-change or photochemical responses. Complete coolers/curing systems need
  transport and kinetics, but listing microscopic stages does not supply calibrated submodels.
  In particular, polymerization 39 alone does not provide a light-to-conversion contract.
- **Direct/converse piezoelectricity (2/75):** already separate sensing and actuation clauses.
  Retain both; an engineering transducer model may share material parameters without making
  the two arrows inverses.
- **Seebeck/Peltier (7/8):** retain distinct electrical and thermal boundaries. A coupled
  thermoelectric model is a useful later factorization, with heat rejection and losses explicit.
- **Shape memory/superelasticity (9/10):** retain thermal recovery and unloading-driven response
  separately, with phase/history state. Neither is supplied by a generic spring or expansion law.
- **Cavitation (31):** retain the bounded collapse response for a pre-existing bubble. Inception
  and growth need stateful fluid/phase models; a staged physical story does not provide serial
  interfaces or an independent collapse primitive.
- **Eddy currents (34):** retain the changing-excitation → current clause. `[34,64]` is a typed
  heating candidate under its circuit assumptions; braking additionally needs force, motion and
  feedback, so current generation alone does not certify braking.
- **Magnetocaloric/electrocaloric response (76/77):** retain separately typed field changes and
  material/branch calibration. Shared thermodynamic structure does not provide a material law.

## Using the assessments

```json
{"assessment": "split-models"}
```

Pass this to `triz_effects`; use `retain-compound` or `retain-response` for the other reviewed
groups. `triz_knowledge.taxonomy.model_assessments` lists the ids and the unassessed remainder.
These groups have the same all-installed-packs scope as the other taxonomy fields.

Each assessment names the selected clause, rationale, source and optional facets. A facet's
`effect` is a validated reference to an existing typed clause; it is not a substitution proof,
causal edge or recipe step. A facet may also list `models`, validated references to multiport templates linked to that
parent effect. Neither reference supplies a realization proof. Self and
reciprocal observational links are permitted; recipe-cycle rules do not apply to them.
Every assessment has `status: "assessment-only"`; no stronger verification status is accepted.

Tests ensure that removing all assessments yields the same typed library and setup results,
that assessment metadata never becomes a unary generator, and that the legacy compatibility snapshot still
passes. This audit leaves all 78 named cases and 70 interface declarations intact. The separate model registry adds explicit boundaries and setup; it proves no physical
equivalence or minimal-basis claim.
