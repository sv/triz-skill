# Checked symbolic synthesis

`triz_synthesize` accepts `strategy: "symbolic"` alongside `"optimized"` (the default)
and `"exhaustive"` (the reference). Symbolic compilation runs **before** the existing
union-relation trace compiler. It reduces what that compiler enumerates, rather than
running its original enumeration under a proof tactic.

```json
{
  "strategy": "symbolic",
  "max_symbolic_work": 100000,
  "max_symbolic_cells": 200000,
  "max_pruning_work": 100000,
  "include_symbolic_certificate": true
}
```

These options supplement the existing model, contract, libraries, `max_work`, `max_states`
and individual optimization switches. `include_symbolic_certificate` is optional; checking
runs regardless. The optimized default is retained because small or poorly sharing problems
can become slower with symbolic preprocessing.

## Supported regions and recognition

A recognized primitive is a stateless, non-product box with exactly one input and one output,
finite declared carrier domains, and a **complete total deterministic joint behavior relation**.
All alternatives at a hole must qualify to include that box. Duplicate identical rows do not
change the relation. Partial relations, nondeterministic outputs, state machines, missing
behavior and multi-port boxes remain with the existing relational solver.

The compiler uses explicit input/output port identities, carrier ids, value arrays and every
declared joint row. Names, tags, domain labels, dimensions, units and the spelling of values
provide no semantic evidence. An identity, permutation, constant map, non-injective map or
two-value involution is recognized by its table. A converter between distinct carriers is an
explicit map between their values, never an inferred bijection from equal domain sizes.
Composition requires the exact intermediate carrier id and value domain, not just cardinality.

Maximal paths connect recognized boxes only across a single outgoing/single incoming wire.
A region contains at least two boxes and at least one hole. It can include fixed recognized
boxes. Product observations and all external contacts are preserved; no interior port has an
additional external wire. Cycles without a serial head stay in the relational solver. Fan-in,
fan-out, feedback, disconnected components and multi-port correlations outside a region remain
in the context, even if part of a surrounding network can be summarized.

Before using a region, an independent checker binds its encoding back to the original full
row declarations, domains, port types, hole indices and serial wiring. Sparse arrays and non-integer indices are rejected;
every declared index must contain an actual value. Every library declaration
is validated before any pruning can hide it. Existing hierarchy, stateful-hole, harm metadata,
resource-mode and whole-model checks are retained.

## Maps and compact choice supports

A prefix state is the explicit map from the region's initial carrier to its current carrier.
Composition computes the next map and interns extensionally identical maps within that prefix.
A layered DAG records transitions with the **original alternative indices** as labels. Several
choices can share an edge; different histories can share a state. No list of full concrete
implementations or their internal valuations is constructed to represent those supports.

Each original choice still refers to its complete alternative and owning model: fixed costs,
feasibility modes, operating-envelope assertions, evidence and provenance retain their existing
meaning. Grouping behavior does not group engineering outcomes. A label counts as a separate
choice even when its behavior matches another label exactly.

At the region boundary, terminal maps become virtual alternatives for the existing coupled
residual compiler. An independent substitution checker first verifies that every retained box, original wire,
metadata/resource declaration, and virtual map matches the original context and checked regions.
That compiler then enumerates the **reduced whole context**, including constraints
outside the region. For each search branch:

1. A forward DAG pass computes terminal maps reachable under the current concrete choice domains.
2. The coupled residual removes impossible virtual choices using whole-context safety/coverage.
3. A backward DAG pass removes concrete alternatives without a path to a surviving terminal map.

This propagates target requirements without expanding a terminal map's supports into all
concrete choice combinations or all original union traces. Multiple regions remain coupled by
the context's residual constraints. The pruning is necessary, not a claim that every surviving
partial choice extends to a satisfying implementation.

Surviving complete implementations go through the original behavior, adequacy, level, harm and
resource validator. Resources are checked on the **original wiring**, not on a resource-erased
summary. Counts and the declaration-order first satisfying witness agree with exhaustive search
when both searches complete. `results` lists the first 50 evaluated tuples; pruned rejections
are absent. `witness.model` is a concrete original implementation.

The optional `symbolicCertificates` retains the DAG, stage-to-hole references, primitive rows,
explicit domains and prefix maps. `countSummarySupports` computes exact per-terminal **behavior
support** multiplicities as big integers; it does not count resource-satisfying implementations.
`summaryForChoices` follows a concrete assignment through a checked DAG. The search's
`satisfyingCount` still counts fully validated engineering choices. Large engineering searches
can exhaust the global budget even when their behavior DAG is tiny.

Boundary-equivalent choices may have different internal values. Symbolic DAGs store no internal
steady-state diagnostics. The existing request-local evaluation cache keys original boxes,
ports, rows and wires, so internal diagnostics are shared only for identical original semantics;
a copy/copy implementation cannot inherit the internal valuations of an involution/involution
implementation merely because both have the same boundary map.

## Proof coverage and checking

[Symbolic.lean](../theory/Symbolic.lean) is a default Lake target and depends only on `Std`.
Its reusable proofs use structural induction, `simp`, explicit witnesses and selected lemmas:

| Obligation | Lean statements |
|---|---|
| Recognition against complete finite relations | `recognition_correct`, `checked_recognition`, `checked_total`, `checked_deterministic` |
| Composition with an explicit intermediate type | `typed_composition`, `checked_composition`, `checked_composition_relation` |
| Boundary substitution in an arbitrary constrained context | `boundary_substitution` |
| Complete layered regions and unique concrete hole references | `regionOK`, `checked_region_stage` |
| Grouped labels retain concrete supports | `grouped_supports_correct`, `checked_supports`, `checked_edge_relation` |
| Backward pruning preserves accepted words and engineering predicates | `backward_pruning_correct`, `engineering_preserved`, `accepted_words_preserved` |
| Copy/involution chains have at most two maps | `toggle_comp`, `chain_parity`, `chain_two_maps`, `two_maps_distinct` |

There are two distinct checking stages:

- **Every request:** `act-symbolic-certificate.ts`, independent of the compiler/join/pruning
  implementation, checks the original declarations, complete primitive graphs, typed composition
  equations, map validity, state uniqueness, edge label equivalence, coverage of every
  prefix/choice pair exactly once, reachability of every retained next state, and exact preservation of the whole reduced context. Its time and
  work are included in synthesis measurements. Check failure or exhaustion discards compilation.
- **Build/offline:** `pnpm check:symbolic` compiles the reusable laws once, generates certificates
  from actual TypeScript synthesis output and checks complete regions, including primitive relations, prefix maps, stage/layer counts,
  unique box/hole references, choice counts and support transitions in the local Lean kernel using `decide +kernel`. It separately audits every
  theorem's axioms by exact declaration identity and rejects altered relations, maps, carrier
  identities, supports, missing stages, extra layers and repeated holes. A process failure,
  timeout, resource error or missing audit is not accepted as evidence of rejection. CI runs
  this in addition to the full theory build. For a local request file use
  `node --import tsx scripts/check-symbolic.mjs --input /absolute/request.json`.

The numeric Lean encoding preserves all carrier/value strings as UTF-16 code-unit lists and
keeps value indices local to each declared carrier. Arbitrary labels cannot become Lean syntax.
The generated checks cover complete **region certificates**, not just independent stages or
an illustrative parity law.
No project or case data is sent to a theorem-proving service. This checker never invokes the
repository's optional remote certificate service.

The standard-axiom policy remains `propext`, `Classical.choice`, `Quot.sound`; no `sorry`, new
axiom, `native_decide`, or `bv_decide` is introduced. Warnings are errors. The audit refuses
missing theorem audit output or any additional axiom.

**Remaining trust boundary:** this is not a verified TypeScript implementation. The runtime
checker, declaration normalization, region discovery/substitution code, virtual residual bridge,
budget/cache accounting, DAG traversal/count routine, engineering validator, JavaScript runtime,
and the offline data encoder remain executable trust boundaries. The Lean checks establish
properties of the supplied normalized finite relations/maps/edges; they do not independently
parse the original FunctionModel or certify its topology, empirical premises, final verdict,
resource arithmetic or the TypeScript pruning implementation. Runtime declaration binding,
tamper checks and independent differential/oracle tests cover that gap operationally. A request
is not described as Lean-verified unless its own generated encoding is checked locally; ordinary
requests receive the independent TypeScript checks. Generic laws alone are not verification of
the compiler.

## Bounds and fallback

Symbolic construction and each backward pass have an allowance of at most `max_symbolic_work`
and one quarter of the then-remaining global work. Residual compilation/propagation separately
obey `max_pruning_work` and the same quarter-reservation rule. Failed speculative work remains
charged. Construction failure discards every partial region and invokes the current optimized
compiler; backward-pass exhaustion returns the original choice domains atomically.

`max_symbolic_cells` bounds the serialized retained region certificates in characters. The
existing boundary cache remains capped at 128 entries and 200,000 cells/key characters. These
are logical storage bounds, not measured JavaScript heap byte limits. Transient construction
is also limited by work accounting. An overall cap returns `undecided`, `complete:false`;
it never establishes impossibility.

`searchStats.symbolic` reports fallback reasons, construction/check/backward times, work,
certificate work, states, grouped transitions, prefix widths, support multiplicities, state
interning hits, retained encoding size and pass rollbacks. `pruning.contextStates` counts
union traces actually emitted, including attempts discarded on fallback; `targetStates` counts
target traces. `boundarySummaries.behaviorTraces` counts emitted validation traces, including
partial searches that subsequently hit a cap. Boundary cache hits avoid enumeration and are
reported separately. Failed row scans and joins consume work even when no trace is emitted.

## Tests and measurements

Run `pnpm typecheck`, `pnpm test`, `pnpm check:symbolic`, and `pnpm bench:synthesis`.
Full Lean-dependent legacy tests additionally need the pinned Mathlib oleans and a built theory;
`TRIZ_REQUIRE_LEAN=1 pnpm test` requires them rather than skipping them.

The suites compare exhaustive, optimized and symbolic strategies on complete small satisfying
choice sets, counts, verdicts, uncertainty, first witnesses and original resource outcomes.
They cover typed converters and renamed labels, partial/nondeterministic relations, non-injective
maps, compensating permutations, distinct engineering modes, multiple regions, multi-port
correlations, fan-in/feedback, disconnected inconsistent loops, malformed declarations, smaller
state allowances, memory/work caps, atomic rollback, sparse-certificate tampering and different internal diagnostics.
Backward pruning is additionally checked against literal whole-port solutions under all 343
nonempty partial choice domains in each of two contexts, including one with restricted inputs.
The existing whole-port oracle retains its own literal port-valuation enumeration; it imports
no symbolic recognition, composition, certificates or DAG logic. Its 80 seeded cases now compare
both optimized and symbolic search against exhaustive search and that independent oracle.

[Measured results](../benchmarks/synthesis/latest.md) and [raw samples](../benchmarks/synthesis/latest.json)
include seven rotated samples, ablations, all emitted trace counts, full validations, cache hits,
DAG sizes, work/storage bounds, phase/heap observations, source hashes and separate offline
proof costs. A binary copy/involution chain retains exactly two maps after each hole prefix
when both choices are available and the involution is nontrivial. Tests count `100^10` labeled
implementations with 21 states and 38 grouped edges, without expanding those implementations.

The recorded ten-hole chain reduces union traces from 2,048 to 4 and full validations from
1,024 to 512 against current optimized search. Optimized compilation exhausts its allowance on
that case; symbolic compilation stays within it. Both find all 512 satisfying choices. The
benchmark report gives current median timings including the additional checks. Distinct-summary
cases enumerate the same union traces and can become slower; small chains and repeated identical
implementations also often pay more preprocessing than they save. These observations support
opting into this path for sharing-heavy regions rather than changing the optimized default.

This is a bounded symbolic synthesis improvement. Distinct disjoint transpositions demonstrate
exponentially many prefix maps, and full engineering validation can remain exponential even
with only two maps. No universal polynomial behavior is claimed for arbitrary finite maps or
relations. Lifetime objectives, physical calibration and continuous sizing remain separate work.
