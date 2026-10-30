# Future plans

The ranked backlog of the categorical-model work. It is weighted by what serious TRIZ practice
actually uses — function analysis, trimming, physical contradictions and separation, concept
selection, evolution trends as rules, and the 9 windows — because that is where formal work pays.
The contradiction matrix and the 76 standards stay data lookups: Altshuller himself had moved
away from them by the late 1980s (ARIZ-85 drops the matrix from the algorithm), and no
formalization effort is planned for them.

Items 3–5 extend the per-instance Lean certificates and the label-blindness tests to the verdicts
they do not cover; item 6 upgrades a tested property to a proved one; item 7 collects the larger
categorical closures. Items 1, 2, 3, and 6 have landed, and parts of 4 and 7. Effort is a focused
PR (S), a few PRs (M), or a small project (L). The per-workstream acceptance criteria of the
assurance extension (#35) are in [categorical-future-plan.md](categorical-future-plan.md), and
what it delivered in [categorical-assurance.md](categorical-assurance.md). "What is not claimed",
which the items close, is in the [theory map](theory-map.md#what-is-not-claimed).

Later sections add open items. C1–C8 come from a scan for natural constraints on the kernel's
objects: properties the objects already have, or could declare, that the kernel ignores. C1, C5,
and the carrier half of C2 have landed in #42. Q1–Q6 come from applied
category theory. Their sources were checked, and the notes below keep the corrections and
cautions from that check. B1–B2 build models from interaction tables and source documents, and
S1–S5 take the semantic analyses to large models. N1–N6 propose a
[neutral mode for models](#neutral-mode-for-models), so the agent reasons less from domain
names. [Next priorities](#next-priorities) ranks the
open items by leverage and gives the build order. Literature ids (R…) refer to
[theory/REFERENCES.md](../theory/REFERENCES.md).

| # | Item | Status | Closes or adds ("What is not claimed" in the theory map) | Effort |
|---|---|---|---|---|
| 1 | Certify unreachability and invariance | **Landed in #39** | Closed | — |
| 2 | Certify `triz_behavior` `preserved`/`changed` | **Landed in #39** (`preserved`; `changed` keeps its counterexample and needs no proof) | Closed | — |
| 3 | Incomparability witnesses in weakness certificates | **Landed in #35** (equal pairs too) | Closed | — |
| 4 | Canonical dynamics tie-breaks, then their label-blindness tests | Partly landed: witnesses of the wiring checks now break ties in declaration order, as dynamics traces do, and renamed-twin tests cover them; canonical witnesses under permutation and symmetry stay open | "Dynamics verdicts are not covered by the label-blindness property tests, and traces break ties in declaration order" | S–M |
| 5 | Naturality of the verdicts in Lean | Partly implemented: indices, values, hole coordinates, weakness and operational adequacy transport; remaining verdicts open | Nothing is claimed today; upgrades every label-blindness property test to a theorem | M, Lean |
| 6 | The grouping/join lemma for steady states | **Landed in #32** (`holeContext_preservesUnions`) | Closed for the Lean semantics; the TypeScript join stays tested | — |
| 7 | Joint residuals, the discrete fibration, trim as controlled embedding, whole-model gfp | Merged-hole residual, controlled trim, whole-model gfp, grid lifting and conditional descent implemented; general categorical completion open | Bullets 5 (first part), 2 (system operator), 1 (reframed), 13 (downstream composition) | L |
| C1 | Quotient the row-table certificates by wires | **Landed** in #42 | Adds: certificates for larger models within the same table-read cap | — |
| C2 | Quantity kind: extensive or intensive carriers, and how cost dimensions aggregate | Carriers **landed** in #42; cost `aggregate` (sum, max, path) open | Adds: no false `feasible` when one output feeds several consumers of an extensive quantity; peak and path costs | S (sum/max); M (path) |
| C3 | Level-monotone behaviour: signed loops and the least steady state | Open | Narrows "does not apply the monotone reading to behaviour rows" for declared orders; better `noSteadyState` notes | M; L with lattice reporting |
| C4 | Product structure of the composed diagram | Open | Adds: caps on the sum over components, not the product; `noSteadyState` per component | S–M |
| C5 | Decide time-invariant dynamics without a horizon | **Landed** in #42 | Narrowed: "Unreachability within the horizon only … not certified" now holds only under input sequences or past the cap | — |
| C6 | Functional behaviour rows and a feedback cut | Open | Adds: smaller certificate exponents; a classified cause for no steady state | M |
| C7 | Acyclic overlaps in `triz_global_separation` | Open | Adds: polynomial decision and localised conflicts on join trees | M |
| C8 | Totality and input-enabledness lint | Open; overlaps #35's §4 deadlock-freedom ([categorical-future-plan.md](categorical-future-plan.md)) | Adds: a static condition under which no run blocks | S–M |
| Q1 | Graded relations over a commutative quantale, staged | Stage 1 implemented in this checkout; stage 2 open | "`requiredInfeasible` … does not say which of them is cheapest to make producible"; the general form of item 7's joint residual | M (stage 1); L (stage 2) |
| Q2 | Complexity estimate before the feasibility search | Open | Adds: predicted cost and pointed `cap-exceeded` hints | S |
| Q3 | Cross-check `triz_feasibility` against an independent co-design solver | Open; dev only | Adds: a second oracle beside the brute-force tests | S–M |
| Q4 | Supersystem constraints as design problems | Open; docs | Adds: workflow guidance | S |
| Q5 | Hierarchical boxes through operad substitution | Explicit checked routes and opt-in policy composition implemented; resource/dynamic theorem scope remains limited | Adds: checked zoom in and out between box and inner model | M–L |
| Q6 | Minimal base refinement when no global section exists | Open | Adds: a concrete next move after `irreducible` | M |
| B1 | A model builder from an interaction table | Implemented in this checkout | Adds: a typed `FunctionModel` from components and interaction triples, with a completeness report | S–M |
| B2 | Pluggable importers that draft B1's interaction table | Local BOM/OpenAPI/code and Julia export adapters implemented; broader formats open | Adds: draft tables with provenance from a BOM, OpenAPI, SysML v2, or a document | M per importer |
| S1 | Steady states by variable elimination along a tree decomposition | Open; needs C1 (landed) | Adds: behaviour cost exponential in treewidth, not in the boundary inputs | M–L |
| S2 | Generalized arc consistency before enumeration | Implemented in this checkout, bounded preprocessing with safe fallback | Adds: values and rows pruned before the steady-state search | S–M |
| S3 | Per-subsystem interface contracts | Declared/checked stateless single-mode contracts implemented; local residual synthesis open | Adds: residuals and weakest specifications against local targets | M–L |
| S4 | Incremental use without server state | Open | Adds: warm starts and hash-keyed subsystem summaries | M |
| S5 | Compositional dynamics | Open; pairs with C5 (landed) and Q5 | Adds: components minimised by bisimulation before the product | M |
| N1 | Three registers per element: structural ids, a plain gloss, domain labels | Open | Adds: an ideation register free of use words, beside the names that checks read | S; M with N6 |
| N2 | What to gloss and what to keep, by role | Open | Adds: glossed tool, mediator, environment, and supersystem names; verbs as parameter changes; constraints untouched | S |
| N3 | The kernel computes; the LLM translates, never reasoning over bare ids | Open | Adds: a rule for the skill | S |
| N4 | Re-concretise at ARIZ's checkpoints (4.1(в), 6.1, Part 7) | Open | Adds: labelled checks with declared behaviour, feasibility, and dynamics rows before any claim | S |
| N5 | Renamed-twin tests and an agent comprehension check | Kernel half landed (`tests/support/twin.ts`); agent half open | Adds: metamorphic tests of the agent | M |
| N6 | `triz_neutralize`: the neutral register with a stable mapping | Open | Adds: an order-preserving renaming and the map back | M |

## Typed effects and lifecycle batch

| Item | Status | Implemented scope and remaining limits |
|---|---|---|
| T2 Dimensions | Implemented in [#51](https://github.com/sv/triz-skill/pull/51), pending merge | Explicit SI vectors/base-unit parsing, shared equality and dimension lints; no conversions/inference |
| T3 Costed dynamics | Implemented in [#51](https://github.com/sv/triz-skill/pull/51), pending merge | Exact Karp cycle ranges, potentials and achieving-cycle certificates; no probabilities/continuous time |
| T1 Typed effects | Implemented in [#51](https://github.com/sv/triz-skill/pull/51), pending merge | Typed filters, capped checked chains and weakest-spec hints; six statement-derived entries; external catalogue rights gap remains |
| T4 Lifecycle MDP | Implemented in [#51](https://github.com/sv/triz-skill/pull/51), pending merge | Exact scalar-gain policy iteration, stationary occupancy/availability, certificates and concept-specific priors; general multichain/product-MDP/game scope remains open |
| T5 Bond graphs | Design and first structural implementation in [#51](https://github.com/sv/triz-skill/pull/51), pending merge | Explicit effort/flow typing, capped causality and equation structure; no numerical simulation/chemistry |

The requested build order was T2 → T3 → T1 → T4 → T5, consolidated into one PR at the user's
request. Lean/Mathlib were upgraded to 4.35.0 at the user's subsequent request. Follow-up
mathematical connections and compatible library tags are in [math-connections.md](math-connections.md).

[#51](https://github.com/sv/triz-skill/pull/51) also adds direct effect-chain insertion and automatic
component/wiring discovery from a finite catalogue, including multi-input/shared assemblies,
explicit replacement and optional whole-model finite contracts. See
[component discovery](component-discovery.md) for catalogue, component and work bounds.

The same PR adds reusable domain-independent bundles, explicit type bindings and shared
polymorphic identity/fan-out relations. Domain tags organize entries without limiting composition.
Empirical component specifications remain separately sourced inputs.

## Current implementation batch

Implemented in this checkout, with the remaining scope kept explicit:

- **Q1 stage 1:** `theory/Graded.lean` defines graded relation contexts and proves their residual
  adjunction over a commutative quantale, recovers the Boolean residual, and gives min-plus ℕ∞
  context instances. The separate finite `row_costs` advisor searches exactly for the cheapest
  set of additional producible rows. Default Boolean verdicts are unchanged; caps refuse an
  optimum claim. This cover optimizer is tested, not proved by the quantale theorem. Stage 2
  concepts and graded weakness remain open.
- **B1:** `triz_build_model` builds typed models from explicit interaction tables, with stable
  ids, lints, and bounded completeness reporting. B2 adds local BOM CSV/JSON, OpenAPI JSON,
  partial Quint/Lean/Julia source outlines and versioned ModelingToolkit/Agents exports. Source
  locations and containment survive B1 and explicit review inside the model; unconfirmed drafts
  cannot enter analysis by dropping an output envelope. SysML and free text remain open. See
  [importing models](importing-models.md).
- **Q5:** checked `inner` interfaces, explicit `triz_expand_hierarchy`, and inner subsystem
  windows. Expansion now retains box costs, feasibility, states, initial states and transitions,
  standalone inner flows, and parent budgets/weights; fresh box/wire/flow maps are returned.
  Parent flow crossings now require caller-supplied occurrence routes, checked same-carrier steps
  and boundary wires; media need explicit mappings. Inner policies require opt-in global budget
  intersection, compatible weight merge or independently renamed contradictions. Global budget
  hoisting may strengthen a local bound. Product identity changes remain refused. `external_substituteWired` proves static
  arbitrary-context wired substitution including feedback; resource/dynamic preservation is
  tested against manually flattened models, not claimed by that theorem.
- **S3 stage 1:** `triz_subsystem_contract` distinguishes declared summaries from checked exact,
  nonblocking whole-inner stateless behavior over explicit assumptions. A single declared resource
  mode is checked against carrier levels, consumption and both contract and inner budgets.
  Resource/behavior coupling remains an empirical declaration. Missing data, multiple modes,
  nested inners and caps remain undecided; dynamic contracts and local residual synthesis are open.
- **Item 7, restriction part:** `theory/Restriction.lean` proves unique forward lifts for
  Mathlib’s category of elements of `restrictionGrid` (a discrete opfibration), with incoming
  lifts in the opposite categories (the discrete fibration orientation). `residual_descends`
  needs a context projection square uniform in the hole relation **and target saturation**.
  `external_sub_project_of_extends` supplies each instance of the square under extension.
  A counterexample proves extension without target saturation insufficient. Concept lattices
  and unrestricted descent remain open.
- **Item 7, closure slice:** `joint_boxes` opts into a single residual over all selected unknown
  boxes, with exact target coverage, per-box producibility cuts and a warning/counterexample when
  independent projections are unsafe. `JointResidual.lean` proves the sigma-port context preserves
  unions and inherits the residual coverage theorem, with a concrete three-hole nonfactorization
  witness. `ControlledTrim.lean` records absorber reattachment as typed rule data and proves
  retained-interface preservation, plus a two-absorber semantic counterexample. `SteadyStateGfp.lean`
  characterizes whole-diagram steady states as the greatest fixed point of complete-valuation
  constraint filtering. From the full valuation set this takes one filter pass; it is not a
  local propagation algorithm or a proof of the TypeScript evaluator.
- **Item 5:** `theory/Naturality.lean` now transports value labels and hole input/output
  coordinates as well as diagram indices. Concrete hole-context and residual transport are
  proved from steady valuations; weakness inclusion, equality, strict inclusion, incomparability,
  and operational adequacy (nonblocking and all outputs acceptable) transport as well. This
  does not prove every remaining kernel verdict natural, capped TypeScript search correct,
  or a selected tied witness invariant.
- **S2:** bounded generalized arc consistency prunes rows and unary domains before the exact
  steady-state join, with unchanged boundary rows and a separate cap that falls back to the
  original join. A constrained 12-box chain fits a 25-node search budget that the old join
  exceeds. Exhaustive tests cover sparse rows, wired equalities, cyclic inconsistency and cap
  rollback. `Propagation.solution_iff_pruned` proves an abstract local support pass over total
  row functions, not the TypeScript sequential fixed-point implementation.

## Next priorities

The initial Q1, B1, Q5 and restriction/descent scopes are implemented above, as are S2,
the value/hole-coordinate portion of item 5, B2's local input foundation and S3's first contract
checker. The next useful slices are:

1. **Item 7: the remaining categorical closures.** Joint residuals for three or more holes,
   controlled trim embeddings and the whole-model greatest-fixpoint characterization landed in
   #49; the restriction-grid lifting and target-saturated conditional descent are proved. Concept
   lattices and unrestricted descent remain outside these results.
2. **Item 5: remaining verdict naturality.** Extend the current concrete diagram, residual,
   weakness and operational-adequacy transport to finite counts, resource dimensions and the
   remaining dynamic verdict families. Capped TypeScript search and identity of selected tied
   witnesses are separate obligations; symmetric ties do not supply a canonical single witness.
3. **Q2 and the scaling path.** Add pointed feasibility-complexity estimates, then S1 variable
   elimination, S3 local residual synthesis and S5 compositional dynamics as their prerequisites
   are met. S2 unary-domain propagation is implemented and does not replace global consistency.
   S3's current contract checker (#46) supports stateless single-mode contracts; multiple resource
   modes need an explicit coupling.
4. **B2 breadth and hierarchy follow-through.** Add requested source formats beyond the current
   adapters (SysML/free text), richer compiler-backed Quint/Lean extraction, and explicitly
   reviewed mappings from source containment to typed nested interfaces. Julia export metadata
   is preferred to source parsing; Agents snapshots do not export imperative step behavior.

Explicit flow routes, subsystem contracts and local importers with draft provenance landed in
#46. Item 7's merged-hole, controlled-trim and whole-model gfp slice landed in #49; general concept
lattices, unrestricted descent and a universal Kan characterization of supersystem collapse remain
outside it.

Q4 remains documentation-only. Dynamic simulation relations are tracked separately in
[categorical-future-plan.md](categorical-future-plan.md) §6. Q1 stage 2 remains conditional on
an actual use case rather than being the next automatic enrichment.

## Landed

- **#42** — C1 (row-table certificates over wired port classes), the
  carrier half of C2 (`Carrier.quantity`, summed extensive demands, `extensive-fan-in`,
  `extensive-fan-out`), and C5 (`unbounded` dynamics verdicts, certified when decided). Each entry
  below records what was measured and what stays open.
- **#39** `feat(certify): certify unreachable escalations and preserved behaviour` — items 1 and
  2. An unreachable escalation is certified by an inductive invariant exactly as planned: the
  global states the search reached, closed under `Sync.Step` and disjoint from the unsafe set,
  decided by `unreachable_of_invariant` through `Sync.holding`. A `preserved` verdict is
  certified as equality of the two `Rows` relations over every situation and valuation.

- **#32** `feat(theory): narrow four "What is not claimed" gaps` — item 6 (hole union
  preservation, `holeContext_preservesUnions`), part of item 7 (the two-box weakest
  specification via Mathlib's `Concept`; #36 was merged into #32's branch), Mealy fixed points,
  and recurrent reachability (`recurrent_reach`, cited by the `recurrent` loop class; loop
  classes are still not certified).
- **#38** `feat: suggest the finest segmentation of a box's declared relation (Lean-proved)` —
  the group-split search that "What is not claimed" records under segment split.
- **#35** `feat: add finite assurance across eight categorical TRIZ workstreams` — item 3, with
  equal pairs as well (`incomparable_of_witnesses`; every weakness pair is certified), and
  `changed` behaviour and state-only safety certificates. For item 7, `scope: "whole"` composes
  every box by exact finite search; the gfp characterization is not proved. For item 4, its
  metamorphic tests (tests/act-extended-invariance.test.ts) cover dynamics, comparing tied
  witnesses by validity and length, so the canonical tie-break is still open. Its
  `triz_synthesize` searches finite libraries for several holes; it is not the joint residual.

## 3. Incomparability witnesses in weakness certificates

Landed in #35, which also certifies equal pairs. As planned:

`triz_weakness` certified strict inclusions only. An incomparable pair is witnessed by two
situations, one admitted each way; the lemma exists and is uncited (`admits_incomparable`). The
witnesses are already in the ranking output (`pairs.onlyFirst`/`onlySecond`), so this is
plumbing. Equality of admitted sets stays uncertified: deciding it over every valuation is what
the table-read cap refuses, and that limit is documented, not worked around.

## 4. Canonical dynamics tie-breaks, then their label-blindness tests

**Status.** Partly landed in #43. Every tie between
witnesses that the wiring checks break now follows declaration order, as dynamics traces already
did: a harm loop's witness cycle among equally short ones (`actsOn` in `src/act.ts`, also read by
`rerate`, `feedback`, and `triz_abstraction`), and the absorbers within one trim rule, whose first
is an applied trim's default. Before, both followed id order. A renaming that keeps every
array's order therefore shows the same witnesses, mapped back. `tests/act-invariance.test.ts`
checks this with renamed twins (`tests/support/twin.ts`) of the examples and 200 generated
models, whose new ids sort the other way, and for the bearing's escalation trace. No certificate
theorem changed.

**Open.** Declaration order is not canonical. Permuting the declarations can change the witness
shown, and a symmetric model has no canonical witness: two equally short cycles that an
automorphism swaps cannot be told apart by structure. Sorting by id, the old tie-break, is no
fix: it moves under renaming. A canonical tie-break needs a canonical labelling up to
automorphism, for example the individualisation-refinement order `findIsomorphism` already
computes, with a fixed choice within each orbit. Then extend
tests/act-invariance-rows.test.ts to `triz_dynamics` as the wiring verdicts are covered, and drop
the validity-and-length comparison of tied witnesses. Other id-ordered choices stay: rule
matching (`matchRule` tries elements in id order), the truncated conflict-cell list, and the
coupling witness, which reads value names and port order.

## 5. Naturality of the verdicts in Lean

The label-blindness property tests check, per seed, that every verdict is invariant under
renaming and permutation. The theorem-shaped statement is that each verdict and construction is
a functor (natural construction) on the groupoid of models and renamings — `Wiring.rename` and
`transGen_equiv` are the ingredients. Proving it makes the invariance discipline a theorem
instead of a tested property. Requires a Mathlib build session (`lake build`, the cache is
several GB); `--wfail` and the no-`sorry` rule apply as everywhere in theory/.

## 6. The grouping/join lemma for steady states

Landed in #32, as `holeContext_preservesUnions` (and `holeContext₂_preservesUnions₂` for two
holes) rather than an iSup lemma. As planned:

The residual theorems hold for every union-preserving context, and the kernel's evaluator groups
steady states by the box's row — tested against a brute force, not proved to be such a context.
The lemma that closes the gap is an iSup version of `mem_steadyStates_glueAlong`
(theory/Semantics.lean): steady states of a composite distribute over the glued box's rows.
This proves the property for the Lean semantics; the TypeScript evaluator stays tested, as the
feasibility solver is.

## 7. The larger categorical closures

- **Multi-box joint weakest specification — implemented.** `triz_behavior` with
  `weakest_spec`, a target and `joint_boxes` computes one coupled relation over the selected
  unknown boxes' combined ports. It preserves internal wires, handles declared producibility,
  and checks both safety and exact target coverage. Independent per-box projections can be unsafe;
  the result reports that and gives a mixed-row counterexample. Existing one/two-box modes stay
  the default. `JointResidual.lean` proves joint-context union preservation and residual coverage,
  including feasible cuts, and a three-hole residual that does not factor. This uses the existing
  residual theorem without claiming a new Mathlib Rel quantale instance or n-adic concept lattice.
- **9 windows as a discrete fibration — lifting implemented.** Mathlib's
  `CategoryTheory.Functor.Elements` supplies the category used by the unique-lifting results.
  Covariant `restrictionGrid` gives an opfibration; taking the appropriate opposites gives the
  fibration orientation. Residual descent requires the proved context square and saturated target.
  A left Kan universal property for supersystem collapse and unrestricted descent remain open.
- **Trim as controlled embedding — structural slice implemented.** Absorber reattachment is
  explicit deletion/gluing rule data, following ordinary DPO's structural basis
  ([R14](../theory/REFERENCES.md#r14)). `ControlledTrim.lean` states the outgoing cut boundary,
  retained absorber/interface and retained wiring conditions, and proves typing and preservation
  of that retained structure. Its concrete two-absorber counterexample shows different behavior
  despite carrier compatibility. AGREE and PBPO+ provide related context-control ideas
  ([R15](../theory/REFERENCES.md#r15), [R16](../theory/REFERENCES.md#r16)); neither formalism nor a
  Kan universal property is implemented by this result.
- **Whole-model steady states — characterization implemented.** `scope: "whole"` already
  computes exact finite steady states. `Semantics.OpenDiagram.steadyStates_gfp` identifies those
  states with Mathlib's greatest fixed point of a filter built
  from all port-domain, box-relation and wire-equality constraints. Filtering complete valuations
  from the full set reaches it in one pass, including for infinite diagrams. Materializing that
  set may be exponential; this is not a local propagation algorithm, an optimization, or a proof
  of the TypeScript search. Identity/negation feedback and strict downstream witnesses make the
  scope explicit.

## From natural constraints

A scan of the kernel's objects (main at `5179b99`, re-checked on this branch) for constraints they
satisfy or could declare, ranked by payoff against effort. C1, C5, and the carrier half of C2
have landed; cost aggregation (C2) and C3, C4, C6–C8 are open. Evidence names symbols rather than
line numbers.

### C1. Quotient the row-table certificates by wires

- **Status.** Landed in #42. The classes come from the encoded functions
  (a breadth-first forest per class), not from `portVariables`, so they are exactly the wires Lean
  sees. Measured: the bearing's trim certificate reads 4,550 table entries instead of 69,376 (the
  scan's 2,240 assumed the row reads also drop to classes; they stay over raw ports). A chain of
  binary mediators certifies up to 9 mediators (11 boxes) instead of 4; 8 mediators read
  368,050,176 entries over ports. Lean: `WireClasses.Ok`, `Rows.exists_steady_iff_classes`,
  `Rows.relation_eq_classes`, `Sync.unreachable_of_holding_classes`, `Sync.closed_of_classes`,
  `admitted_ssubset`. `scripts/certify.mjs` gained the new data lines and a "port classes merged"
  tamper; the pinned statements are unchanged. **Effort:** S–M.
- **Constraint.** A wire is an equality, so the ports it joins form one variable. Encode and
  decide over the classes of that quotient.
- **Today.** It holds by construction, and the certificates ignore it. The evaluator merges wired
  ports (`portVariables`, `src/act-behavior.ts`). The certificate encoder lists raw ports
  (`encodedPorts`, `src/act-cert.ts`), and the wires stay equalities in `Rows` (`theory/CategoricalTriz.lean`).
  Each decision enumerates every port valuation: the `rowWork` estimates in `src/act-cert.ts` raise
  the value count to the number of ports, against `MAX_CERT_ROWS` = 2,000,000.
- **Adds.** The scan estimates that the bearing's table reads fall from 68,608 to 2,240 per model,
  and that a chain of binary mediators certifies 10 boxes instead of 5. Dynamics invariant
  certificates gain the same.
- **Plan.** Compute port classes with the union-find `portVariables` already uses, and emit them as
  checked proof data: a class map and a spanning-forest witness (a `link` wire and a rank per port).
  Keep the certified statements over raw ports. A lemma with decidable hypotheses,
  `Rows.exists_steady_iff_classes`, rewrites each proof to a decision over class valuations. Change
  the `rowWork` exponent to the class count. `scripts/certify.mjs` and the pinned statements need no
  change, since a wrong witness fails the proof.
- **Tests.** The work estimate on `bearing-heat-behavior`; a mediator chain that is `cap-exceeded`
  today and certifies after, with every tampered copy still rejected; a corrupted class map that
  joins two unwired ports and makes the proof fail.
- **Risks.** Low. The statements and the checker stay as they are.

### C2. Quantity kind: extensive or intensive carriers, and cost aggregation

- **Status.** The carrier half landed in #42: `Carrier.quantity`, summed
  demands on extensive outputs, `extensive-fan-in` (an extensive input fed by several functions
  fails closed), the `extensive-fan-out` lint, and in Lean `selection_mono` and
  `extensive_demand_mono`. The test case reads as planned: 5 feeding 4 + 4 is `feasible` intensive
  and `infeasible` (`unprovidable`, 8 demanded) extensive, and the brute-force comparison also runs
  with every carrier extensive. Open: `FunctionModel.aggregate` (`"sum"` / `"max"`, then
  `"path"`), `trim_lowers_peak`, and the conservation lint. `aggregate` was left whole rather than
  half done: it must reach `sumCosts` (ideality, trim cost relief), the feasibility fixed and
  operating costs and their total, `act-windows.ts`, `act-refinement.ts`, and the dimension maps
  of both isomorphism checks. **Effort:** S for sum and max; M for path costs.
- **Constraint.** Each carrier and each cost dimension declares how amounts combine: extensive
  (they sum) or intensive and shared (the max). A cost dimension can later also be path-wise: a sum
  along a flow, the max across flows.
- **Today.** For carriers, an assumption that is documented but unchecked. An output port's demand
  is the max over the functions it feeds (`expand`, `src/act-feasibility.ts`), and the agent
  reference says so; no lint catches an extensive flow fanned out without a splitter. For costs,
  an assumption that is silent: `sumCosts` (`src/act.ts`) and the feasibility solver add every box.
  Only the standalone `triz_conservation` meets the extensive case
  (`src/act-quantitative.ts`), not the solver.
- **Adds.** No false `feasible` when one output feeds two consumers of an extensive carrier: today
  5 units supply 4 + 4. Peak dimensions take `"max"`. Latency needs `"path"` (a sum in series, the
  max across parallel branches); `"max"` over boxes does not fix it. A conservation lint: a row on
  an extensive carrier that provides more than it requires, with no declared conversion.
- **Plan.** `Carrier.quantity?: "intensive" | "extensive"`, defaulting to today's intensive rule;
  `expand` sums for extensive ports and fails closed, naming a merge box, when several wires feed
  one extensive input. `FunctionModel.aggregate?: Record<Dim, "sum" | "max">`, defaulting to sum,
  read by `sumCosts`, the feasibility costs, and `compareIdeality`; `"path"` later. Lint
  `extensive-fan-out`. In Lean, the solver theorems are generic in the step and need only its
  monotonicity, which a selection-shaped step keeps whether demands sum or take the max; record
  that as a one-line lemma, and add `trim_lowers_peak` beside `trim_lowers_cost`.
- **Tests.** A source providing 5 that feeds two consumers requiring 4: `infeasible`
  (`unprovidable`, 8 demanded) with `extensive`, `feasible` with `intensive`. Path latency on
  `software-cache` with a parallel replica.
- **Risks.** Kinds can be mislabelled. Information copies freely. Percentiles do not compose
  exactly, so this is a declared aggregation, not a correction. Defaulting from `layer` would
  break label-blindness, so the kind must be explicit, with today's behaviour as the default.
- **Overlap.** Partly planned: categorical-future-plan.md §7 names adapters for conversion and
  conservation, with the acceptance case that five consumptive units cannot supply two
  simultaneous four-unit branches. Cost aggregation is not planned anywhere.

### C3. Level-monotone behaviour: signed loops and the least steady state

- **Status.** Open. **Effort:** M for the sign classification; L with lattice reporting.
- **Constraint.** For each input and output port pair, a box is monotone, antitone, or neither in
  the `levels` order. Each strongly connected component of the port-level signed graph is then
  balanced (reinforcing) or unbalanced (balancing).
- **Today.** Ignored, and disclaimed: the levels check "does not apply the monotone reading to
  behaviour rows, which have no order", and behaviour uses no least fixpoint because its values
  are unordered. Order exists only through `levels` (`levelIssues`, `src/act.ts`). Harm loops read
  polarity only. `triz_behavior`'s note says an input with no steady state "may signal a runaway
  loop".
- **Adds.** By Knaster–Tarski, a balanced loop of total, functional, monotone boxes with no fan-in
  always has steady states: a lattice of them, with a least and a greatest. "Reached from rest"
  (`kleene_lfp`) holds only under a declared delay reading, or when the loop passes through a
  stateful box whose transitions are that map. Under the same conditions, no steady state needs an
  unbalanced component, a negative cycle: an oscillation candidate, not a runaway. A runaway shows
  as a partial box falling off its declared scale, or as an upper steady state. A non-monotone box
  is a contradiction hint.
- **Plan.** `Carrier.ordered?: true` declares that `values` run from least to most; `levels`
  implies an order. Sign each (input, output) pair from the rows (`+`, `−`, constant, or none) and
  classify per strongly connected component, not per harm-loop witness: a witness cycle is
  box-level, and one component can hold cycles of both signs. A component is balanced when its
  ports 2-colour so that `+` edges stay within a colour and `−` edges cross (Harary), a
  linear-time check. Replace the runaway note with the cause, and report the least and greatest
  steady states of balanced components. In Lean, a least fixed point gives a steady state of a
  loop of a total, functional, monotone box (`OrderHom.lfp`, as `codesign_lfp` uses it); `gfp`
  gives the greatest; `relTrace_not_loop` is the negative-cycle counterpart.
- **Tests.** The bearing with ordered heat and preload: balanced, two steady states, no runaway
  note. An antitone expansion: unbalanced, an oscillation-candidate note, and the `oscillating`
  loop class for a stateful variant. Random balanced loops without fan-in never report
  `noSteadyState`, against the brute force in `tests/act-semantics.test.ts`.
- **Risks.** No example declares an order on behaviour carriers yet. Excessive functions are
  non-monotone by nature. The lattice claim needs functional, total boxes and no fan-in onto loop
  variables. Behaviour rows are not one-step transitions, so no dynamics claim follows without a
  declared delay.
- **Distinct from** the `unbacked-producible-row` lint, which reads producible rows against
  feasibility amounts, not behaviour rows against an order.

### C4. Product structure of the composed diagram

- **Status.** Open. **Effort:** S–M.
- **Constraint.** The connected components of the box–variable graph compose in parallel; joins
  can use the finest factorisation by default.
- **Today.** Proved in Lean and ignored by the kernel. `external_par` and `mem_steadyStates_par`
  (`theory/Semantics.lean`) and `Factors` (`theory/CategoricalTriz.lean`) state it. The kernel
  enumerates every boundary valuation jointly, under one cap, and joins all composed boxes at
  once (`src/act-behavior.ts`); factorisation is used only as the `factorisations` hint.
- **Adds.** Caps apply to the sum over components instead of the product. Weakness counts and
  admitted sets become products. Certificates are encoded per component. `noSteadyState` is
  attributed to a component.
- **Risks.** Under `scope: "whole"` an inconsistent component still empties the relation; the
  product keeps that only if no component is dropped. Comparing two models needs a common
  coarsening of their partitions.

### C5. Decide time-invariant dynamics without a horizon

- **Status.** Landed in #42. `escalation.unbounded` and
  `invariance.unbounded` sit beside the bounded verdicts, absent under `inputs`. The continuation
  runs after separation and loops, on a budget and sets of its own that start where the horizon's
  search stopped, so no existing field moves; past the cap only `unbounded` is `undecided`
  (`cap-exceeded`). Certificates state a decided `unbounded` verdict when the bounded one is open:
  a trace past the horizon, or `unreachable_of_holding_classes` for a port target. That flips two
  former refusals (bearing at `horizon: 1` now certifies the trace to time 2); the refusal remains
  past the cap. **Effort:** S.
- **Constraint.** The configuration space is finite: the product of the state sets and the
  valuations. With time-invariant inputs the breadth-first search always saturates, so the horizon
  is not needed to decide.
- **Today.** Ignored by the verdict. The search stops at the horizon (`DEFAULT_HORIZON` = 20,
  `src/act-dynamics.ts`), reports saturation only if the frontier empties, and otherwise answers
  `*-within-horizon`. Yet the reached states and `loops` already explore without a horizon, and
  the invariant certificate re-closes without one and refuses bounded-only claims.
- **Adds.** A decided `unreachable` or `invariant` at every horizon, or a later `reachable` with a
  shortest trace, within the same state cap, certifiable through the existing
  `unreachable_of_invariant`. It closes "Unreachability within the horizon only … not certified"
  for time-invariant inputs.
- **Risks.** Some users mean the horizon as a requirement: keep the bounded verdict and add the
  unbounded one beside it. No regression: if the cap is hit after the horizon, keep today's bounded
  verdict and mark only the unbounded one undecided; never return `cap-exceeded` where a verdict is
  decided today. Input schedules cannot saturate and stay bounded.

### C6. Functional behaviour rows and a feedback cut

- **Status.** Open. **Effort:** M.
- **Constraint.** A box's outputs are a function of its inputs. Given a feedback cut, the steady
  states are determined by the boundary inputs and the cut values.
- **Today.** Allowed, not recognised. Rows may be partial and several-valued. Every behaviour box
  in the examples is functional and total (motor, shaft, bearing, and housing in
  `bearing-heat-behavior`). `joinRows` (`src/act-behavior.ts`) scans every row at every node, and
  `severalSteadyStates` is counted but not explained.
- **Adds.** The certificate exponent falls from all variables to the situations plus the cut; the
  bearing's cut is {preload}, one binary variable. Evaluation becomes indexed propagation. The
  cause of no steady state is classified: a partial box, a fan-in conflict, or a loop.
- **Risks.** Nondeterminism legitimately models uncertainty: recognise functional rows, never
  require them. The choice of cut is a heuristic.

### C7. Acyclic overlaps in `triz_global_separation`

- **Status.** Open. **Effort:** M.
- **Constraint.** The overlap hypergraph of the regions is α-acyclic (a join tree).
- **Today.** Ignored. Plain backtracking re-scans every region at every node
  (`globalSeparation`, `src/act-global.ts`) under a 100,000 work cap. The theory map records the
  triangle `x=y`, `y=z`, `x!=z`, and arc consistency is documented as insufficient
  ([R25](../theory/REFERENCES.md#r25)).
- **Adds.** On a join tree, pairwise (semijoin) consistency is equivalent to global consistency
  (Beeri, Fagin, Maier and Yannakakis, JACM 1983), decided by a polynomial full reducer. A conflict
  is localised to join-tree edges. The triangle stays the minimal cyclic case.
- **Risks.** Space × time grids of regions are cyclic and fall back to search; only chain and tree
  covers gain.
- **Overlap.** Partly planned: categorical-future-plan.md §7 asks for small checked conflict
  cores. Acyclicity is not planned.

### C8. Totality and input-enabledness

- **Status.** Open. **Effort:** S–M. **Overlaps** #35's §4 deadlock-freedom
  ([categorical-future-plan.md](categorical-future-plan.md)): this is a sufficient condition for
  it.
- **Constraint.** Every input tuple, or every (state, inputs) pair, has a row; no input port is fed
  by several wires; and the instantaneous loops are causal, or balanced and monotone as in C3.
  Together these mean no configuration blocks.
- **Today.** Partly checked. Totality is checked for downstream boxes only (`partialDownstream`,
  `src/act-dynamics.ts` and `src/act-behavior.ts`). A blocked state makes a port-target verdict
  `undecided` (reason `blocked`).
- **Adds.** A static lint that empties `blocked`, so `undecided (blocked)` disappears where it
  holds. The blocked-run conjunct that port-target unreachable certificates now state
  (`unreachable_of_holding`) then holds vacuously. The existence half of adequacy follows.
- **Risks.** Partial rows deliberately mean "cannot occur", so this stays a lint, not a
  requirement.

### Considered in the same scan and not planned

- Polarity as a sign or semiring algebra: a MATRIZ rating is evaluative, not causal, and a harmful
  function is usually a positive influence (friction raises heat). Kept in derived form as C3.
- Requiring determinism, of behaviour rows or Mealy machines: nondeterminism models the
  environment and uncertainty. Functional rows are kept only as a recognised class (C6).
- Acyclicity as a requirement: harm loops are the point of function analysis. Acyclic parts are
  used through C6's cut and C7 instead.
- A carrier subtyping lattice: rules already match carriers through variables, abstraction maps
  already coarsen carriers (`typed_map`), a looser trim screen only weakens a necessary-only check,
  and the typing lemmas would all need re-proving.
- The monotone reading in the levels consistency check: the exact match deliberately pins one
  resource mode (the housing's 400 N row), and multi-mode coupling is categorical-future-plan.md §5.
- Quantale, Markov, or interval enrichment as a constraint: Rel as a residuated quantale is item 7
  and Q1; probabilities need evidence; intervals are §5's uncertainty envelopes, and `levels`
  already give bands.
- Symmetry reduction of replicated components: it needs item 4's canonical tie-breaks first, is L
  effort, and exact replicas are rare.
- Rule idempotence, termination, and commutation: the termination measure and pairwise
  commutation landed in #35; critical pairs are categorical-future-plan.md §8.
- A sheaf condition for the 9-windows presheaf on wire covers: a short proof that no verdict
  consumes; `boundary_rewrite` already accounts for crossing wires.
- Path-lifting abstraction maps that reflect reachability: planned as §6's dynamic simulation
  relations.
- A joint residual for three or more boxes under pairwise-decomposable safety: item 7.
- An acyclic shortcut for the feasibility ascent: on acyclic parts the ascent already stops after
  depth-many steps.
- General Markov kernels for weakness priors: [#51](https://github.com/sv/triz-skill/pull/51)
  adds opt-in concept-specific priors from finite lifecycle stationary occupancy; arbitrary
  kernels and nonstationary operating distributions remain open. `joint_prior` still covers
  declared correlated conditions, and Bennett's uniform-task caveat stays.

## From applied category theory

Suggestions from applied category theory, corrected against the kernel. Every source was checked
to exist; the entries say how far each check went. Corrections that shape the entries:

- **Harm loops are not where Censi's bound applies.** In `triz_feasibility` harmful functions carry
  no demand; only non-harmful wires do. What applies is a feedback arc set over the non-harmful
  wires among the composed boxes, with Censi's width and height bound (Q2).
- **The two-box concept lattice does not become an arbitrary quantale.** With graded relations it
  generalises to fuzzy concept lattices over a complete residuated lattice
  ([R96](../theory/REFERENCES.md#r96)): a commutative, integral quantale with residuation (Q1).
- **"Agree on overlaps iff a global section exists" holds for a chosen family of local sections,
  not for local solution sets.** Pairwise compatible solution sets can still have no global
  choice: the triangle case. `triz_global_separation` already decides the exact global question by
  search; polynomial cases need an acyclic overlap structure (C7).
- **The operad does not turn the 9-windows restriction grid into anything by itself.** Restriction
  forgets the outside (a presheaf); operad substitution zooms into a box (a hierarchy). They are
  complementary, and the new piece is substitution (Q5).
- **Feasibility is already partly beyond Boolean.** `triz_feasibility` returns antichains of
  minimal cost vectors, the upper-set structure over costs. Behaviour, the weakest specification,
  the two-box specification, and weakness are the Boolean parts.

### Q1. Graded relations over a commutative quantale, staged

- **Status.** Stage 1 implemented in this checkout; stage 2 open. **Effort:** M for stage 1; L for stage 2.
- **Change.** In Lean, relations valued in a commutative quantale (Mathlib's `Quantale`,
  [R49](../theory/REFERENCES.md#r49)), with series, parallel, trace, and residual; the Boolean
  case (`Prop`) recovers today's theorems as instances.
  - **Stage 1.** A generic residual, instantiated at `Prop` (today) and at the cost quantale
    (ℕ∞, min, +). The one-hole `weakest_spec` cheapest producible extension uses a separate
    exact finite cover search: rows have one-time acquisition costs, not min-plus path costs.
  - **Stage 2**, only if a use case appears: graded two-box concepts over residuated lattices, and
    graded weakness.
- **Closes or adds.** "`requiredInfeasible` names the rows the target needs that the declaration
  excludes; it does not say which of them is cheapest to make producible." It is the general form
  of item 7's joint residual (Rel as a residuated quantale). Heterogeneous change of base would
  couple Boolean behaviour with cost feasibility, which #35's coupled contracts do by search today.
- **Risks.** Boolean stays the default and the certified core, recovered by the `Prop` instance.
  A support map needs its own preservation theorem; it need not preserve residuals. Certificates never use real-valued weights, since `decide` needs finite or
  discrete carriers. Probabilities stay with `priors` and `joint_prior`: summing probabilities is
  not an idempotent join, so they are not a quantale of this kind. Graded weakness overlaps
  `priors` and `joint_prior`: unify, do not duplicate.
- **Evidence.** Riess et al. 2026 ([R91](../theory/REFERENCES.md#r91)); only the abstract has
  been read, which states monotone co-design generalised to quantales, covering cost, confidence,
  and implementation sets, with heterogeneous composition by change of base. Bělohlávek 2004
  ([R96](../theory/REFERENCES.md#r96)) for the two-box case.

### Q2. Complexity estimate before the feasibility search

- **Status.** Open. **Effort:** S.
- **Change.** Before solving, `triz_feasibility` reports the feedback arc set over the non-harmful
  wires among the composed boxes, and Censi's bounds on the Kleene steps (the height) and the
  antichain size (the width). Cap hints then point at the loop to cut.
- **Adds.** A predicted cost and better `cap-exceeded` hints.
- **Risks.** It concerns the non-harmful wires, not harm loops (see the corrections above).
- **Evidence.** Censi, *A Mathematical Theory of Co-Design* ([R5](../theory/REFERENCES.md#r5)):
  the number of Kleene iterations is bounded by the height of the antichain poset, and the total
  work by width × height × the cost of one step; the width of the resource poset is the design
  complexity; feedback is chosen through an arc feedback set of the co-design graph. The paper
  does not use the word "thickness".

### Q3. Cross-check against an independent co-design solver

- **Status.** Open; development only. **Effort:** S–M.
- **Change.** Differential tests of `triz_feasibility` against codesign-mcdp's antichain and
  Kleene core on generated monotone models, as an optional development dependency that CI skips
  when Python is absent.
- **Adds.** A second, independent oracle beside the brute-force tests.
- **Risks.** Use only the library's core. An automated review notes that it does not verify
  user-supplied monotonicity, and that its newer sections rest on unproven theorems. Optional.
- **Evidence.** Briat 2026 ([R92](../theory/REFERENCES.md#r92)), reference manual v0.2.1, MIT
  licence: the antichain calculus, series, parallel, and feedback composition, a Kleene solver, and
  declarative and modular builders.

### Q4. Supersystem constraints as design problems

- **Status.** Open; documentation. **Effort:** S.
- **Change.** Guidance in workflow.md: model regulations, community or policy limits as
  supersystem boxes with `feasibility` rows, then compare the Pareto fronts with and without them.
- **Adds.** It makes visible the Pareto shift that the co-design case studies report.
- **Risks.** Documentation only; no kernel change.
- **Evidence.** Zardini et al. 2021 ([R93](../theory/REFERENCES.md#r93)): co-design of the full
  hardware and software stack of a self-driving vehicle; later talks extend it to mobility
  systems, from city policy down to vehicle autonomy.

### Q5. Hierarchical boxes through operad substitution

- **Status.** Explicit checked routes and opt-in policy composition implemented; resource/dynamic theorem scope remains limited. **Effort:** M–L.
- **Change.** Schema: an optional `inner` model on a box, with matching interface ports. Lean: a
  substitution lemma, that the external relation of the substituted diagram equals the composite
  through the box's external relation. It builds on `glueAlong`, `seq`, `par`, and `feedback` in
  `theory/Semantics.lean`, which makes the semantics an algebra for substitution. Kernel: the
  9-windows subsystem row reads a box's inner model.
- **Adds.** Native subsystem-of-subsystem models: zooming in and out becomes checked composition,
  not a separate model.
- **Risks.** The lens and optics view of dynamics is not needed for any verdict; do not plan it.
  Restriction and substitution are complementary (see the corrections above).
- **Evidence.** Spivak 2013 ([R27](../theory/REFERENCES.md#r27)); Vagner, Spivak and Lerman 2015
  ([R94](../theory/REFERENCES.md#r94)).

### Q6. Minimal base refinement when no global section exists

- **Status.** Open. **Effort:** M.
- **Change.** When a separation or global-separation check is irreducible, compute the smallest
  refinement of the base, splitting one cell or adding one axis value, after which a compatible
  family exists. Report it as a resource to create: a time slot, a region, or a condition.
- **Adds.** It turns `irreducible` into a concrete next design move.
- **Risks.** Acyclic covers (C7) make the check polynomial; cyclic ones need search.
- **Evidence.** Le Masson, Hatchuel and Weil 2023 ([R95](../theory/REFERENCES.md#r95)), as
  motivation and analogy only: its C-K/topos model treats the knowledge base as a topos and
  sheafification as preserving existing knowledge while expanding it. It is not a basis for any
  kernel theorem.

## Building models

Every verdict starts from a typed `FunctionModel`, and writing one by hand is where most analyses
stall. B1 builds the model from the table an analyst already keeps; B2 drafts that table from
documents the project already has. Neither decides a rating: those stay the analyst's.

### B1. A model builder from an interaction table

- **Status.** Implemented in this checkout. **Effort:** S–M.
- **Change.** A new tool, for example `triz_build_model`, takes:
  - components: id, name, and role;
  - interactions as triples: subject, action, object, a carrier with its layer and dimension, and
    a polarity (useful, insufficient, excessive, or harmful);
  - optional flows.

  It returns a typed `FunctionModel`: the carriers, the ports (an input port per interaction on
  its object, so no input port is fed twice, and an output port per subject and carrier), and
  the wires.
- **Deterministic.** Ids are stable, so re-running after an edit gives the same ids. The result
  goes through the existing typing and lints, and errors carry a code, a path, and a hint.
- **Completeness report.** Pairs of components that touch through no interaction (gaps in the
  interaction matrix), isolated components, and whether the product is reached.
- **Risks.** It never invents a polarity or a behaviour: ratings come from the caller, and boxes
  get no rows. Stable ids must survive renaming a component, or an edit reads as a new model.

### B2. Pluggable importers

- **Status.** Local import foundation and adapters implemented; SysML and free text open. **Effort:** M per importer.
- **Change.** An `Importer` interface: a source document goes in, and a draft interaction table
  comes out for B1, never a finished model. Every triple carries its provenance: the source file
  and the location in it.
- **Constraints.** Importers run locally, on the stdio server or as a CLI, and fetch nothing over
  the network by default. They parse the data they are given and never recall facts, following
  the repository's no-recall rule. Polarity defaults to useful and is flagged for the analyst to
  confirm.
- **Implemented inputs and remaining plugins.**
  - **BOM** (CSV or JSON, parent and child): components and reviewed containment metadata; constructing Q5's typed `inner` interface remains explicit.
  - **OpenAPI JSON 3.0/3.1:** operations and explicit client/payload references; no inferred
    interservice calls. External references are diagnosed, never fetched.
  - **Quint/Lean/Julia source:** partial static declarations and references with pending meaning;
    no compiler or source execution. Julia covers FLOP's explicit ModelingToolkit-style syntax.
  - **Julia exports:** versioned JSON from instantiated ModelingToolkit systems or Agents
    snapshots. Symbolic metadata and current structure remain drafts; no full behavior extraction.
    [Importing models](importing-models.md) documents the trusted exporter and review path.
  - **SysML v2:** parts and blocks as boxes; ports, connectors, and item flows as wires. The
    mapping is close to one-to-one, but SysML has no harmful or insufficient ratings, so those
    stay the analyst's. SysML v2 was formally adopted by the OMG in 2025, with a textual notation
    and a standard Systems Modeling API ([OMG SysML](https://www.omg.org/spec/SysML)).
  - **Free-text documents:** an LLM-assisted extractor with citations, whose output is always a
    draft for confirmation.
- **Risks.** A draft read as a model would carry unconfirmed ratings into every verdict; the
  draft flag and the provenance must reach B1's output.

## Scaling to large models

The structural analyses (typing, harm loops, trims, flows, rules) already scale: about 80 ms on a
generated model of 3,000 boxes and 600 harm loops, measured on main at `b881d8d`. The limits are
in the semantic analyses: `MAX_STATES` (100,000 boundary valuations), `MAX_CONCEPTS` (10,000),
`MAX_CANDIDATES` (1,000,000) and `MAX_ANTICHAIN` (1,000) in feasibility, `MAX_CERT_ROWS`
(2,000,000), the dynamics state cap and horizon, and global separation's work cap of 100,000.
Flat models of 1,000 boxes or more with dense feedback stay out of reach for behaviour and
feasibility. The route is hierarchy plus contracts.

### S1. Steady states by variable elimination along a tree decomposition

- **Status.** Open; depends on C1, which has landed. **Effort:** M–L.
- **Change.** Eliminate variables along a tree decomposition of the port graph, over C1's wired
  port classes, with a min-fill ordering.
- **Adds.** The cost becomes exponential in the treewidth, not in the number of boundary inputs.
  It generalises C7, which covers only separation regions.
- **Risks.** Dense feedback keeps the treewidth high; the cap then still decides.

### S2. Generalized arc consistency before enumeration

- **Status.** Implemented in this checkout. **Effort:** S–M.
- **Change.** Before the search starts, prune the values and rows that cannot extend to a steady
  state.
- **Soundness.** Unsupported values and rows cannot occur in a satisfying assignment.
  `theory/Propagation.lean` proves one abstract scoped support pass preserves exactly the
  solution set. The TypeScript loop, wildcard representation and wire translation are checked
  independently against exhaustive valuations, not extracted from that theorem. Preprocessing
  has its own work cap and discards partial pruning on exhaustion.
- **Risks.** Arc consistency is not global consistency (the triangle case in C7), so it only
  shrinks the search, never replaces it.

### S3. Per-subsystem interface contracts

- **Status.** Declared/checked stateless single-mode contracts implemented; local residual and dynamic scope open. **Effort:** M–L.
- **Change.** Each subsystem gets an assume/guarantee contract, so residuals and weakest
  specifications can be computed against local targets instead of the global deliverables. A
  global target pushed down to a neighbourhood is otherwise itself a residual of the rest.
- **Depends.** It builds on Q5 (`inner` models) and #35's contracts. Descent for residuals (item
  7) is the theory side.
- **Risks.** #41's exchange condition makes a contract sound but does not produce one: the
  contract is declared, and checked.

### S4. Incremental use without server state

- **Status.** Open. **Effort:** M.
- **Change.** Tools accept a previous result as a warm start: a feasibility antichain, or the
  steady-state relations of unchanged subsystems. Alternatively, subsystem summaries are keyed by
  a content hash, so an edit recomputes only the changed part.
- **Risks.** The MCP server stays stateless, so a warm start is caller data and must be checked,
  not trusted.

### S5. Compositional dynamics

- **Status.** Open; pairs with C5 and Q5. **Effort:** M.
- **Change.** Minimise each stateful component or subsystem by bisimulation (partition
  refinement) before forming the product, then compose hierarchically with Q5.
- **Adds.** Smaller products for C5's horizon-free verdicts.
- **Risks.** Minimisation must keep the states and ports the targets name observable.

## Neutral mode for models

A proposal from a literature review of how domain terms affect reasoning over abstract models.
The kernel already separates a structural core (ids, roles, ports typed by carrier, wiring,
ratings, costs) from a label layer (box `name` and `action`, wire `verb`, port `label`, flow
`name`, the model's `domain` and `system`), and its verdicts read only the core. What is missing
is discipline in the label layer and in the agent. The kernel half has started on
#43: a declared `Carrier.loss` keeps the `defect-on-loss-carrier` lint
through a renaming, and witness tie-breaks follow declaration order (item 4). N1–N6 are the
rest.

**The limit.** No study tests neutral renaming inside TRIZ or function modelling, and TRIZ's own
support for plain words is practice wisdom ([R97](../theory/REFERENCES.md#r97)). Every rule
below is an inference from neighbouring evidence: design fixation, analogical transfer, program
comprehension, and LLM planning over renamed symbols. Most of the LLM numbers come from
2023–2024 models. Whether a neutral mode gives better solutions is untested; N5 names the
experiment that would decide it.

### N1. Three registers per element

- **Status.** Open. **Effort:** S for the schema; M with N6.
- **Change.** Each element carries three registers, never merged:
  - the structural ids the kernel computes on;
  - a plain gloss for the agent's ideation: what the element is made of, its shape and state,
    and the parameter it acts on, with no word that states a use or a mechanism;
  - the domain labels, for people, lints, and checks.

  An optional `gloss` on boxes, wires, ports, and flows, or a separate mapping file. In neutral
  mode the agent sees glosses in place of `name`, `action`, `verb`, and `label`, and `domain`
  and `system` are hidden while it generates ideas.
- **Adds.** Ideas come from words that do not cue the domain's usual answer, while people and
  lints keep the names.
- **Evidence.** Describing parts by material and shape instead of by use raised the
  functional-fixedness problems solved by 67% on average in one study
  ([R101](../theory/REFERENCES.md#r101); abstract only, no independent replication found). Names
  help checking: identifiers written as words were comprehended 19% faster than letters or
  abbreviations by 72 professional developers finding defects
  ([R108](../theory/REFERENCES.md#r108)). So discovery and checking may need different
  registers.
- **Risks.** A gloss that drops a property misleads. ARIZ's formwork example adds one, an iron
  wall ([R97](../theory/REFERENCES.md#r97)). A lint can check that a gloss repeats neither the
  name nor the action it replaces.

### N2. What to gloss and what to keep

- **Status.** Open; skill text and a lint. **Effort:** S.
- **Rule.** `role` selects what to gloss:
  - Gloss the names of `tool`, `mediator`, `environment`, and `supersystem` boxes, and port
    labels and flow names. ARIZ note 4 names only the tool's and the external environment's
    terms ([R97](../theory/REFERENCES.md#r97)); the other two roles follow by this proposal's
    reading.
  - Keep the product's name, adding any property the term hides.
  - Write every `action` and `verb` as a change, or a hold, of one named parameter of the
    target, as MATRIZ defines a function ([R61](../theory/REFERENCES.md#r61)). Never delete one,
    and never name a mechanism.
  - Never neutralise units, values, `levels`, costs, budgets, feasibility rows, contradiction
    parameters, or any other constraint.
  - Keep carrier ids that name a quantity. Rename, keeping their order, those that name a
    mechanism or tell the harm's story.
- **Evidence.** Gloss hardest where a name cues a familiar answer that is good enough: chess
  masters shown a familiar but longer mate performed like players about three standard
  deviations weaker ([R102](../theory/REFERENCES.md#r102)). Keep constraints concrete:
  abstracting and re-representing raised originality, but not all the added ideas fit the
  problem's constraints ([R109](../theory/REFERENCES.md#r109)). Keep relations named: LLM
  planning collapsed when action and predicate names were replaced (N3).
- **Risks.** Socio-technical models stretch the gloss furthest, since relations between people
  are intentional; the skill already declines conflicts between people.

### N3. The kernel computes; the LLM translates

- **Status.** Open; skill text. **Effort:** S.
- **Rule.** The kernel computes every structural verdict. The LLM translates into the model and
  out of it, and never reasons over bare ids: a model shown to it carries glosses, and it cites
  each verdict's `basis` instead of re-deriving loops or reachability by eye.
- **Evidence.**
  - With Blocksworld's actions and predicates renamed, GPT-4's zero-shot plans fell from 210
    valid of 600 to 1 ([R104](../theory/REFERENCES.md#r104)).
  - With the translation back to Blocksworld supplied in the prompt, GPT-4 still reached only
    10% ([R105](../theory/REFERENCES.md#r105)).
  - 2025–26 reasoning models solved about 6–41% fewer planning tasks when every name was
    replaced by a random string, and the strongest often recognised the domain from structure
    alone ([R106](../theory/REFERENCES.md#r106); venue not confirmed).
  - An LLM that writes a formulation for a symbolic solver gained 39.2% on average over standard
    prompting ([R107](../theory/REFERENCES.md#r107); abstract only).
- **Risks.** Renaming hides vocabulary, not structure. A model that recognises a memorised
  problem shape still recalls its answer, so neutral mode can lower fixation on the domain's
  default solution but cannot prevent recall.

### N4. Re-concretise at ARIZ's checkpoints

- **Status.** Open; skill text. **Effort:** S.
- **Rule.** Restore the domain labels after a candidate is picked, before any feasibility or
  constraint claim, and before the report. ARIZ comes back down at fixed steps
  ([R97](../theory/REFERENCES.md#r97)):
  - step 4.1(в) turns the little-people picture into a technical scheme;
  - step 6.1 turns the physical answer into a technical one;
  - Part 7 checks the answer against the resources, and asks whether a solution found for one
    cycle survives many.

  Check each candidate on the labelled target with declared rows: `triz_behavior` for behaviour,
  `triz_feasibility` for resources, and `triz_dynamics` for Part 7's multi-cycle question. The
  Substantiate step reads only re-concretised models, and a new solution gets a new name, not
  the name of the component it replaces.
- **Evidence.** Abstraction on its own goes unused: given only a diagram of the principle, 7% of
  subjects solved the problem before a hint, while two compared analogues plus the principle or
  the diagram lifted unprompted transfer to 57–62% ([R103](../theory/REFERENCES.md#r103)).
  Abstraction can break constraints, so generate first and prune against the concrete problem
  ([R109](../theory/REFERENCES.md#r109)).
- **Risks.** Isomorphic wiring can still get different behaviour, feasibility, and dynamics
  verdicts, so a cross-domain idea stays a hypothesis until the target declares those rows.

### N5. Testing

- **Status.** The kernel half landed with the renamed-twin tests (`tests/support/twin.ts`); the
  agent half is open. **Effort:** M.
- **Kernel.** A model and its renamed twin, every id mapped to a neutral token in declaration
  order, get the same verdicts after mapping back, and the same lints except
  `defect-on-loss-carrier` on a carrier without a declared `loss`. They show the same harm-loop
  cycles, absorbers in order, default trim, `rerate` cycles, and the bearing's escalation trace.
  Rule matches and the truncated conflict-cell list still follow id order and are not covered.
- **Agent.**
  - Before ideation, a comprehension check on the renamed model: simple questions, such as which
    box a wire leaves or which carrier a port takes, answered correctly before the agent
    reasons.
  - A metamorphic test of the agent: give it a model and its renamed twin, and compare the
    structural claims it makes (loops, absorbers, the verdicts it cites), ignoring free text.
  - The deciding experiment: run the skill on fresh problems in both modes, and score solution
    quality and constraint violations, not idea counts.
- **Risks.** Frontier models recognise renamed structure ([R106](../theory/REFERENCES.md#r106)),
  so a passing twin test shows consistency, not freedom from recall.

### N6. `triz_neutralize`: the neutral register as a tool

- **Status.** Open. **Effort:** M.
- **Change.** A tool, or a `triz_export` option, that produces the neutral register with a
  stable mapping and maps results back:
  - ids map to tokens that keep declaration order, so witnesses map back (item 4);
  - while rule matching and the conflict-cell list stay id-ordered, the tokens must also sort
    like the originals;
  - lints run on the labelled model first and their warnings carry across, or every carrier
    declares `loss`;
  - glosses come from the caller (N1), and the tool never invents one.
- **Note.** The example ids are themselves domain words (`motor`, `bearing`, `w-drive`), so an
  LLM reading only the structural core still reads the domain. Renaming ids is part of the job,
  not only names and verbs.
- **Risks.** A mapping that is not a bijection, or that reorders declarations, changes what
  comes back; the tool checks both and fails closed.

## Deliberately not planned

- **Formal concept analysis of the contradiction matrix.** It would formalize an artifact the
  tradition itself deprecated; the matrix stays a lookup.
- **Result-side `forbid` post-conditions.** Context conditions (shipped) cover the rule-level
  need; created harms are declared data in the right-hand side and visible statically. Revisit
  only if a trim-rule use case appears.
- **The irreducible not-claims.** Physical truth of declared rows, back-reactions the model
  omits, smooth dynamics and controller synthesis, cross-domain transfer of solutions, and the
  semantic half of analogy stay outside the kernel by design; see "What is not claimed" in
  the [theory map](theory-map.md#what-is-not-claimed).
