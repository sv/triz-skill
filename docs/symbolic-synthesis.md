# Checked symbolic synthesis

This implements the bounded serial slice of [roadmap S6](FUTURE-PLANS.md#scaling-to-large-models).
The [broader design](symbolic-summary-design.md) records remaining extensions. Reduced-context
filtering and concrete validation both use the shared relation kernel from merged #52.

`triz_synthesize` accepts `strategy: "symbolic"` alongside `"optimized"` (the default)
and `"exhaustive"` (the reference). Symbolic compilation composes finite maps **before**
the optimized solver enumerates union behavior traces. It is opt-in because preprocessing
and checking can cost more than the enumeration they save.

A cost guard sends requests with at most 32 concrete combinations and 512 input-encoding
work units directly to optimized search, reporting `symbolic.reason: "small-context"`.
This heuristic makes no semantic inference or pruning claim. Larger requests can still pay
more than they save. `include_symbolic_certificate: true` explicitly attempts compilation
even for small requests, so certificate audits exercise the full checked path.

```json
{
  "strategy": "symbolic",
  "max_symbolic_work": 100000,
  "max_symbolic_cells": 200000,
  "max_pruning_work": 100000,
  "include_symbolic_certificate": true,
  "optimizations": { "memoize_symbolic": true }
}
```

## Supported scope

Recognized primitives are stateless, non-product boxes with complete declared joint rows
defining total deterministic maps over bounded products of explicit carrier domains. This
includes identities, permutations, involutions, constants, non-injective and arity-changing
maps. Zero ports have the unit domain `[[]]`. Duplicate identical rows are allowed; partial
or nondeterministic tables, state machines and missing/oversized domains are unsupported.
Completeness concerns joint tuples, not independent per-port projections.

Types use ordered carrier-id lists and explicit value tuples. Names, tags, units and domain
labels supply no semantics; equal cardinalities do not establish compatibility. A serial
connection must explicitly wire every preceding output bijectively to every following input.
Wiring is screened before carrier products are built; boxes without a possible serial contact
stay in the residual context. The compiler reindexes joint tuples by the wire permutation. A region contains at
least two boxes and one hole, possibly including fixed boxes. Products remain outside.
Fan-in, fan-out, feedback and disconnected constraints remain in the residual context;
cycles without a serial head are not summarized. Existing hierarchy/stateful-hole rejection
and declaration, resource-mode and harm checks still apply.

`triz_subsystem_summary` reuses this compiler for fixed, fully declared serial regions without
choice holes. It checks the complete selected interface and binds the certificate back to the
original rows before returning a static map. Unsupported shapes use shared finite projection;
missing behavior and state remain uncollapsed. The original model retains engineering obligations.

## Composition and choice supports

Each prefix state is its typed boundary map. Equal primitive maps are grouped before
composition, and equal prefix maps are interned. A layered DAG retains all original alternative
indices on its edges without expanding concrete words or internal valuations. Behavioral
equivalence retains separate costs, feasibility modes, applicability, provenance and evidence.

Terminal maps become virtual choices in the reduced **whole** model. Each search branch:

1. Finds reachable terminal maps under the original concrete choice domains.
2. Runs coupled safety/coverage filtering on the reduced whole context.
3. Traverses the DAG backward, removing choices with no surviving boundary support.

Edge masks are precomputed. A request-local cache keys completed residual results by every
region's reachable terminal-map set **and every uncovered choice domain**. Arrays are copied;
backward propagation reruns on concrete domains. Capped passes are not cached. A full cache
continues uncached; `optimizations.memoize_symbolic: false` disables it for comparison.
Disabling both `backward_residual` and `choice_propagation` reports symbolic status `disabled`
with reason `pruning-disabled`.
When choosing an already-forced singleton leaves the entire domain vector unchanged, search
inherits the parent's necessary constraints instead of filtering again. This also holds after
rollback: inherited domains remain a sound superset. Every concrete leaf is still validated.

Surviving concrete implementations receive the original behavior, adequacy, levels, harm and
resource checks on their original wiring. Pruning supplies necessary conditions only. Counts
and declaration-order first witnesses match exhaustive search when both complete. `results`
contains the first 50 evaluated tuples; `witness.model` is a concrete original implementation.
Boundary-equivalent choices can have different internal valuations: the symbolic cache stores
no internal diagnostics, and the existing evaluation cache keys original semantics.

Optional `symbolicCertificates` exposes the checked DAG. `countSummarySupports` counts exact
per-terminal behavior supports with big integers; `summaryForChoices` follows a concrete
assignment. These supports do not count resource-satisfying implementations. Full engineering
search can remain exponential despite a tiny behavior DAG.

## Checks, proofs and trust boundary

The independent runtime checker binds complete primitive relations to raw rows, explicit
carrier products, port order, holes and serial wiring. It checks dense arrays, valid indices,
typed composition, unique states, exactly one successor per prefix/choice, and complete support
coverage. A separate substitution check compares every retained box, outside wire, resource
and metadata declaration with the original context and verifies each virtual map. Failure
or allowance exhaustion discards compilation before residual enumeration.

[Symbolic.lean](../theory/Symbolic.lean) depends only on `Std` and proves:

| Obligation | Main statements |
|---|---|
| Complete-relation recognition | `recognition_correct`, `checked_recognition`, `checked_total`, `checked_deterministic` |
| Typed composition/reindexing | `typed_composition`, `typed_reindex_composition`, `checked_composition`, `checked_composition_relation` |
| Arbitrary-context substitution | `boundary_substitution` |
| Complete region and grouped supports | `regionOK`, `checked_region_stage`, `grouped_supports_correct`, `checked_supports`, `checked_edge_relation` |
| Backward pruning/engineering preservation | `backward_pruning_correct`, `engineering_preserved`, `accepted_words_preserved`, `boundary_pruning_pullback` |
| Boundary-filter reuse | `boundary_filter_reuse` |
| Two-summary involution chains | `toggle_comp`, `chain_parity`, `chain_two_maps`, `two_maps_distinct` |

`pnpm check:symbolic` compiles/audits reusable laws, exports actual whole-region certificates
and checks them locally using `decide +kernel`. The encoding includes UTF-16 carrier/port
identities, full value tuples, primitive relations, stage/layer counts, unique box/hole
references, tuple/port arities, choice counts and all support transitions. Tamper tests require
a kernel-proved false proposition for each corruption of each region; process errors/timeouts
are not rejection evidence. CI runs
these checks and `lake build --wfail`. For a private request:

```sh
node --import tsx scripts/check-symbolic.mjs --input /absolute/request.json
```

Proofs use structural induction, `simp` and selected lemmas. Exact theorem-identity audits
allow only `propext`, `Classical.choice`, `Quot.sound`; no `sorry`, additional axiom,
`native_decide` or `bv_decide` is introduced. No remote proving service is called.

**This does not verify TypeScript.** Lean proves properties of supplied normalized encodings;
it does not independently parse FunctionModel topology or verify the runtime checker, compiler,
substitution, residual bridge, shared relation evaluation, cache/budget accounting, DAG traversal, JavaScript runtime,
engineering arithmetic or empirical premises. The offline encoder also remains trusted.
Raw-declaration binding and independent oracle/differential tests check that gap operationally.
Ordinary requests get runtime checks; only requests whose encodings are checked locally get
kernel certificate evidence. Generic theorems alone are not implementation verification.

## Bounds and validation

Compilation and each backward pass receive at most `max_symbolic_work` and one quarter of
remaining global work. Residual passes separately obey `max_pruning_work` and the same quarter
rule. Cartesian work is reserved before allocation. Failed speculative work stays charged;
compilation falls back to optimized search, while capped propagation rolls back atomically.
A global cap returns `undecided`, `complete:false`, never impossibility.

`max_symbolic_cells` bounds retained certificate, mask and residual-cache characters together;
the residual cache also has a 128-entry cap. The existing evaluation cache has 128 entries /
200,000 cells/key characters. These are logical bounds, not measured heap byte limits.
`searchStats.symbolic` reports construction/check/backward times, work, fallbacks, states,
transitions, prefix widths, support counts, primitive compositions and cache counters.
`searchStats.unchangedDomainPasses` counts inherited passes skipped by search.
`pruning.contextStates` counts emitted union traces, including discarded attempts; `targetStates`
and `boundarySummaries.behaviorTraces` count target traces and complete validation valuations
actually emitted or reconstructed, including failed attempts. Factor/separator logical counts
are not enumeration: their intermediate work is reported in `relationStats`. Failed scans/joins
consume work even when no trace is emitted.

Run `pnpm typecheck`, `pnpm test`, `pnpm check:symbolic`, `pnpm bench:synthesis`.
`TRIZ_REQUIRE_LEAN=1 pnpm test` additionally requires the built theory and pinned Mathlib oleans.
Tests compare complete small satisfying-choice sets, verdicts, counts, first witnesses,
resources and diagnostics against exhaustive search and independent literal whole-port oracles.
They cover 80 seeded networks, all 343 partial choice domains in each of two contexts and all
49 partial joint domains with caching on/off, plus malformed declarations/certificates, carrier
renaming, compensating maps, correlations, fan-in/feedback, disconnected constraints,
resource distinctions, cache saturation, product bounds and rollback.

[Benchmark results](../benchmarks/synthesis/latest.md) include end-to-end checks and separate
build-time proof costs. Full ablations, phase/heap samples and source hashes are generated
locally into git-ignored `benchmarks/synthesis/latest.json`. The fixtures are synthetic;
smaller or poorly sharing cases can be slower. Copy/nontrivial-involution prefixes retain two
maps when both choices are available; a test retains `100^10` labeled supports with 21 states,
38 edges and 38 compositions instead of 1,900. Distinct maps and full engineering validation
can still grow exponentially. No production-model speedup or universal polynomial bound is
established. Lifetime objectives, physical calibration and continuous sizing remain separate.

The suite also reads the existing synthesis request in `examples/assurance/requests.json`
without changing its wiring, rows, library or resource contract. Pass
`--baseline /path/to/baseline-checkout` to the benchmark for a repeated end-to-end comparison
against another local version (1,000 warmups, 31 rotated batches of 20 requests per variant).
This measures a shipped finite regression example, not a production system or calibrated device.
