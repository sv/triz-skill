# Modern TRIZ survey — coverage and gaps

**Method caveat.** This survey is written from the assistant's domain knowledge, not from a live
web pass (web search was unavailable during preparation). Names and structure follow MATRIZ's
public methodology; before building any of the recommendations below, verify current terminology
against the [MATRIZ Knowledge Base](https://wiki.matriz.org/knowledge-base/triz/) and recent
TRIZfest proceedings.

## What the repo covers today

The 34-tool catalog spans all three MATRIZ stages: problem identification (stakeholder
requirements, component/functional/flow analysis, cause-effect chains, resource analysis,
operating zone/time, system operator, trends, limits, function-cost), problem solving (technical
and physical contradictions, IFR, ARIZ, Su-Field, inventive standards, separation principles,
trimming, feature transfer, size-time-cost, FOS), and concept justification (experiment,
benchmark, prototype, pilot). Two extras sit beyond the classical toolkit: an OTSM Network of
Problems graph with a core-conflict (TOC) computation, and a DIKWP-style purpose/invariant layer
with verifier-backed gates. The eval corpus leans on published 2024–2025 MATRIZ cases, which
keeps the skill anchored to current practice rather than 1950s vocabulary.

That is a solid core. The gaps below are what a working modern practitioner would still reach
for and not find.

## Gaps, prioritized

### G1 — Main Parameters of Value (MPV) analysis. *High value, reference-only.*

MPV analysis — identifying the parameters customers actually pay for and ranking them — is a
pillar of MATRIZ's problem-identification stage and the main bridge from business strategy to
technical contradictions. The catalog has nothing for it. Cheapest fix: a reference section
(MPV → trend of evolution → contradiction chain, the canonical MATRIZ identification pipeline)
and routing entries in `tool-router.json` for the analysis stage. No new data needed.

### G2 — Effects database: listed as a tool, ships no data. *High value, data work.*

Tool #6 routes to "Effects database" but the server serves no effects. Effects (physical,
chemical, geometric) are where TRIZ synthesis gets concrete for engineering problems. A curated,
license-clean effects subset (even 50–100 well-sourced entries mapping function → effect) would
make `triz_route` honest and give synthesis real material. This is the largest data task on the
list; start by sourcing (e.g. public domain physics references), not by scraping commercial
databases.

### G3 — ARIZ depth: one catalog entry. *Medium-high, reference work.*

ARIZ-85C (the version modern MATRIZ teaches) has a defined part structure — problem analysis,
problem model, IFR and physical contradiction definition, Su-Field resources, application of
standards/principles/separation, review of the solution, analysis of how the IFR was violated —
plus the conflict-exacerbation step. `workflow.md` stops at contradiction templates. A compact
ARIZ-85C reference with the part ladder and entry criteria (when ARIZ is warranted vs. overkill)
would serve serious practitioners; keep it prose, not a fake executable.

### G4 — S-curve and lines-of-evolution detail. *Medium, reference work.*

"Trends of evolution" is one catalog row. Modern practice decomposes it into S-curve stage
analysis (which stage is this system on, and what does that imply about innovation strategy?)
plus specific evolution lines (dynamization/crookedness, transition to supersystem, increasing
coordination, uneven development of subsystems). A reference table mapping the commonly taught
lines to detection signals would slot into both the analysis and synthesis stages.

### G5 — Failure prediction (AFD). *Medium.*

Anticipatory Failure Determination (inverse TRIZ: "invent" failures systematically) and
SUBCE-field modeling are standard in reliability-driven industries. The catalog lists failure
analysis only as justification evidence. A routing entry plus a short reference on the inversion
step (existing inversion tool partially covers it) is cheap; full AFD methodology is a bigger
lift.

### G6 — Patent circumvention / IP-adjacent workflows. *Medium, practitioner-driven.*

A large share of industrial TRIZ use is around patents: circumvention design, freedom-to-operate
thinking, patent-based technology landscaping. Nothing in the catalog addresses it. A reference
on the standard circumvention approaches (trim a claim element, substitute a function carrier,
change the operating principle) would cover the common ask.

### G7 — Software and digital TRIZ adaptations. *Medium.*

The domain guides cover demand/supply/engagement/PR/service/process/organization, and there are
published software-architecture and UX TRIZ adaptations (contradictions over latency vs.
consistency, usability vs. security; Su-Field reads of API interactions). A software domain
guide would match the existing guide format. The existing caution stands: working translations,
not forced physical analogies.

### G8 — Modern matrix variants. *Low, optional.*

The repo ships the classical Altshuller matrix. Matrix 2003 (Mann) and later variants exist,
with different parameter sets for business/software. The importer already supports regeneration
from any 39×39-compatible source; a variant could ship as an alternate data file with its own
provenance block. Only worth doing if a license-clean machine-readable source is found.

### G9 — Integration recipes (Lean/Agile/DFSS). *Low.*

Practitioners usually run TRIZ inside an existing process (DFSS, Lean innovation sprints). A
short "where TRIZ plugs in" note in the domain guides is cheap and useful; anything deeper risks
diluting the core.

## What we already have that most TRIZ tooling lacks

Fail-closed deterministic lookup (no LLM recall of matrix cells), blinded published-case evals
with judge-only ground truth, a no-recall benchmark, verifier-backed purpose gates on the
problem graph, and a documented weakest-concept selection rule. The gaps above are additive;
none of them require touching these properties.

## Recommended order

1. **G1 MPV** and **G4 S-curve/lines** — reference + routing work only, immediate practitioner
   value, no licensing exposure.
2. **G3 ARIZ-85C reference** — prose work, closes the most common "this skill is shallow for
   hard problems" objection.
3. **G2 effects subset** — the only real data project; timebox sourcing before committing.
4. **G5/G6/G7** — as demand appears (each is a small reference + routing entry).
5. **G8/G9** — opportunistic.
