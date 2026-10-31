# Classical parameter audit — 2026-10-31

All 39 entries in [parameters.json](../data/parameters.json) were checked against
[Prakash R. Apte's numbered list of classical TRIZ features](https://www.ee.iitb.ac.in/~apte/CV_PRA_TRIZ_INTRO.htm),
with the [MATRIZ matrix reference](https://wiki.matriz.org/docs/triz/problem-solving-tools-5890/contradictions/engineering-contradiction-5995/contradiction-matrix-6026/)
as the method reference. No ids were missing or duplicated. No category was added or removed.
All 1,248 recorded matrix cells still reference declared parameter ids.

## Cleanup

- Parameter 10 now uses **Force** as its preferred label. The former **Force / Intensity** label
  remains an alias. The ambiguous historical word does not turn every signal intensity into a
  mechanical quantity or supply an SI dimension.
- Every entry now includes repository-authored `clarification` and `distinguish_from` guidance.
  Alternate labels are recorded where useful. These are interpretation aids, not automatic
  mappings, literal historical definitions or engineering measurement contracts.
- The source URL now uses the current MATRIZ documentation path. Metadata records the
  numbering cross-check and modern metrology references.

## Apparent overlaps retained

| Parameters | Distinction to state in a problem |
|---|---|
| 1/2, 3/4, 5/6, 7/8, 15/16, 19/20 | Moving versus stationary object in the modeled operation; both ids remain necessary for matrix indexing |
| 10, 11, 14 | Applied load, stress/pressure and resistance to mechanical failure |
| 15/16, 25, 27 | Available operating duration, unwanted time consumption and successful operation under declared conditions |
| 19/20, 21, 22 | Energy consumed, energy-transfer rate and energy failing to serve the intended function |
| 23, 26 | Unwanted material loss versus the specified amount of material/items |
| 28, 29, 37 | Measurement result quality, manufactured output conformity and difficulty of detecting/measuring |
| 30, 31 | Harm entering the object versus harm produced by it, relative to the system boundary |
| 32, 33, 34 | Making, normally operating and repairing the object |
| 36, 37 | System complexity versus observation or measurement difficulty |
| 9, 25, 39 | Local speed, unwanted delay and useful output per unit time |

These categories may overlap in an actual problem; the links do not make them mutually exclusive.
State which measurable requirement is improving or worsening and justify its matrix mapping.

## Historical wording and modern use

The classical vocabulary is complete for this matrix. A modern metric absent from these labels
does not justify a new numeric row, merging a moving/stationary pair or substituting another
matrix's numbering. Put additional universal or domain quantity definitions in
[knowledge packs](knowledge-packs.md), with explicit evidence for any proposed matrix analogy.

In particular, the label *Manufacturing precision* is retained as a historical category.
Modern measurement accuracy and repeated-measurement precision are distinct concepts; see
[JCGM VIM 3, 2.13](https://jcgm.bipm.org/vim/en/2.13.html) and
[2.15](https://jcgm.bipm.org/vim/en/2.15.html). Parameters 28/29 now warn against conflating
sensor accuracy, repeated-reading agreement and conformity of a manufactured part.

No parameter automatically declares a quantity token, unit, optimization direction or acceptable
operating range. The [JSON schema](../schemas/parameters.schema.json) and runtime validation
require exactly one entry for every id 1–39 and reject duplicate names, invalid distinction links
and accidental additions. `pnpm knowledge:check` includes this validation alongside the packs.
The source cross-check verifies labels and numbering; it does not independently validate the
matrix's recommendations or any particular application's parameter mapping.
