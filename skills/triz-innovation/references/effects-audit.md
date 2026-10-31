# Physical effects catalogue audit — 2026-10-31

All original 60 entries were screened for obvious conflation, misleading guarantees,
classification errors and missing retrieval targets. Targeted primary/reference checks support
the changes below. This is repository curation, not a comprehensive expert validation of every
application hint. All original ids are retained; 14 entries are added, for 74 total.

## Corrections

| Entries | Change and reason | Reference |
|---|---|---|
| 4, resonance | Bound the response by damping, tuning and allowable operation | [OpenStax, forced oscillations](https://openstax.org/books/university-physics-volume-1/pages/15-6-forced-oscillations) |
| 5, phase transition; 46, sublimation | Qualify constant-temperature behavior; classify sublimation/deposition as physical | [OpenStax, phase transitions](https://openstax.org/books/chemistry-2e/pages/10-3-phase-transitions) |
| 7, Seebeck | Replace universal proportionality with a material- and temperature-dependent voltage response | [NIST thermocouple reference functions](https://www.nist.gov/publications/temperature-electromotive-force-reference-functions-and-tables-letter-designated) |
| 10, superelasticity | Remove promises of exact strain recovery and describe the required material regime | [Illinois Shape Memory and Structures group](https://publish.illinois.edu/shape-memory-structures/shape-memory-alloys/) |
| 15, photoelectric emission | Distinguish surface electron emission and collection from photovoltaic power and reverse-biased photodetection; update its typed provenance and conditions | [OpenStax, photoelectric effect](https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect) |
| 20, polarization | Describe stress-induced birefringence and relative phase instead of simple polarization rotation | [Original photoelasticity measurements](https://arxiv.org/abs/2208.00769) |
| 21, Doppler; 23, gyroscope | Qualify motion/frequency claims and replace absolute resistance to tilt with angular-momentum response | [NASA spectroscopy explanation](https://science.nasa.gov/mission/webb/science-overview/science-explainers/spectroscopy-101-beyond-temperature-and-composition/), [gyroscope precession](https://openstax.org/books/university-physics-volume-1/pages/11-4-precession-of-a-gyroscope) |
| 24, Bernoulli | State the streamline and ideal-flow assumptions behind the speed/pressure relation | [NASA Glenn, Bernoulli's equation](https://www.grc.nasa.gov/www/k-12/VirtualAero/BottleRocket/airplane/bern.html) |
| 26, capillarity | Include wetting/contact angle and a finite pressure head | [OpenStax, capillary action](https://openstax.org/books/college-physics-2e/pages/11-8-cohesion-and-adhesion-in-liquids-surface-tension-and-capillary-action) |
| 27, osmosis | Explain that reverse-osmosis purification requires applied pressure | [OpenStax, colligative properties](https://openstax.org/books/chemistry-2e/pages/11-4-colligative-properties) |
| 35, superconductivity | Limit zero-resistance wording to DC behavior within critical operating limits | [OpenStax, superconductors](https://openstax.org/books/university-physics-volume-2/pages/9-6-superconductors) |
| 47, molecular sieving | Classify physical separation and retain affinity/transport selectivity | [DOE, molecular sieves](https://www.energy.gov/science/bes/articles/traffic-cop-molecules) |
| 48, combustion | Remove guaranteed gas expansion; products and operating arrangement matter | [OpenStax, enthalpy and expansion work](https://openstax.org/books/chemistry-2e/pages/5-3-enthalpy) |
| 51, screw | Make self-locking conditional on friction and lead angle | [Penn State Mechanics Map, power screws](https://adaptivemap.ma.psu.edu/websites/7_friction/7-4_screws/screws.html) |
| 52, gears | Separate tooth-count speed ratio from efficiency-dependent torque | [MIT gear lecture](https://ocw.mit.edu/courses/2-00aj-exploring-sea-space-earth-fundamentals-of-engineering-design-spring-2009/e8c25391a19f4a1ef3c427017307f509_MIT2_00AJs09_lec07.pdf) |
| 53, flexures | Replace ideal motion guarantees with bounded travel, stiffness and parasitic-motion limits | [Original compound-flexure research](https://scholarsarchive.byu.edu/facpub/9637/) |
| 55, cellular structures | Remove the universal stiffness optimum | [NASA, structures and materials](https://www.nasa.gov/smallsat-institute/sst-soa/structures-materials-and-mechanisms/) |
| 59, electrostatic repulsion | Require sufficient lift relative to adhesion; move the electrodynamic-screen example to its own mechanism | [Original electrostatic dust-lift research](https://arxiv.org/abs/2301.11609), [NASA electrodynamic shield report](https://ntrs.nasa.gov/citations/20150016082) |
| 60, expansion mismatch | Qualify detachment as a possible outcome of thermal stress, rather than guaranteed release | [OpenStax, thermal expansion and stress](https://openstax.org/books/university-physics-volume-2/pages/1-3-thermal-expansion) |

Entry 57's existing inertial-release explanation is also softened: a mass-times-acceleration
estimate is a screening hypothesis rather than a universal detachment rule. This editorial
qualification does not add independent application evidence to that legacy entry.

## Overlap retained deliberately

Evaporative cooling specializes phase-change heat transfer (6 → 5); eddy currents specialize
induction (34 → 3); light-initiated curing specializes polymerization (45 → 39). Screw geometry
uses an inclined plane (51 → 49); thermal-mismatch detachment uses expansion (60 → 1).
General vibration release is related to ultrasonic processing (57 ↔ 29) but need not be ultrasonic.
These links are explicit data, preserving useful search targets without claiming duplicate entries.
Shape memory and superelasticity also remain distinct: thermal recovery and unloading-driven
recovery have different triggers. No phenomenon was removed as obsolete.

## Missing fundamentals added

| Ids | Added mechanisms | References |
|---|---|---|
| 61–63 | Conduction, convection, thermal radiation | [OpenStax, heat transfer](https://openstax.org/books/university-physics-volume-2/pages/1-6-mechanisms-of-heat-transfer) |
| 64–65 | Joule heating, magnetic force on a current-carrying conductor | [Electrical power](https://openstax.org/books/university-physics-volume-2/pages/9-5-electrical-energy-and-power), [magnetic force](https://openstax.org/books/university-physics-volume-2/pages/11-4-magnetic-force-on-a-current-carrying-conductor) |
| 66–67 | Photovoltaic conversion, photoconductive detection | [DOE, PV cell basics](https://www.energy.gov/cmei/systems/solar-photovoltaic-cell-basics), [Thorlabs, photodiode operating modes](https://www.thorlabs.de/newgrouppage9.cfm?objectgroup_id=285&pn=FDBS25) |
| 68–70 | Elastic energy storage, viscous damping, buoyancy | [McGill, spring energy](https://www.physics.mcgill.ca/~hilke/232/232.html), [damped oscillations](https://openstax.org/books/university-physics-volume-1/pages/15-5-damped-oscillations), [buoyancy](https://openstax.org/books/university-physics-volume-1/pages/14-4-archimedes-principle-and-buoyancy) |
| 71–72 | Dielectrophoresis, traveling-field electrodynamic transport | [NASA electrodynamic shield report](https://ntrs.nasa.gov/citations/20150016082) |
| 73–74 | Sensible heating, Ohmic conduction; additional bridges for thermal/electrical composition | [Calorimetry](https://openstax.org/books/university-physics-volume-2/pages/1-4-heat-transfer-specific-heat-and-calorimetry), [Ohm's law](https://openstax.org/books/university-physics-volume-2/pages/9-4-ohms-law) |

New entries include specific references, conditions and limitations. Their summaries are authored
for this repository; referenced text is not copied. 37 entries now have selected input/output
clauses with explicit parameter references and conditions, using 35 physical quantity definitions.
SI dimensions are explicit declarations checked against [NIST SP 811](https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-4-two-classes-si-units-and-si-prefixes);
they are not inferred from labels. Typing does not establish a quantitative operating envelope.
Most unchanged legacy entries still have only general textbook provenance. Domain packs and expert
review can address that evidence gap. [Model setup](knowledge-packs.md#set-up-a-categorical-model)
connects the catalogue to the existing categorical checks without inventing behavior or resources.
