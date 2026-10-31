# Pruning finite configuration searches

`triz_synthesize` defaults to `strategy: "optimized"`. It compiles the declared fixed wiring
and finite component libraries into coupled constraints, then checks surviving complete
implementations with the existing behavior, adequacy, harm and resource validator.
`strategy: "exhaustive"` retains the Cartesian reference search. Component/topology discovery
and lifecycle policy search do not use this optimization yet.

Behavior evaluation, residual compilation and global separation now share a
[finite relation layer](shared-relations.md). Indexed joins reduce row scanning; connected-factor
behavior evaluation avoids expanding independent internal products. The residual compiler still
needs complete traces for coupled choice supports. The optional `strategy: "symbolic"` front end checks and composes serial finite maps before
this shared residual evaluator runs; see [scope and proof boundary](symbolic-synthesis.md).

## What is computed

The compiler unions the alternatives' behavior rows at each hole and enumerates consistent
relational traces through the whole model, including disconnected constraints, fan-in and
feedback. This enumerates behavior states rather than combinations of implementation ids.
For each trace, it records which alternatives contain the complete local row at each hole.

If those alternative sets are `S₁, …, Sₙ`, that trace exists in exactly the choice combinations
in the rectangle `S₁ × … × Sₙ`. For a target boundary relation `T`:

- A trace outside `T` forbids its entire rectangle. This is the backward safety residual,
  compiled into constraints on whole alternatives rather than independent port projections.
- Every pair in `T` must have at least one enabled supporting rectangle. Supports for every
  target pair must agree on one alternative per hole; a different implementation cannot be
  selected for each situation.

Forbidden rectangles propagate when all but one choice are forced to support an unsafe trace.
Coverage constraints retain alternatives supported by a viable trace at every target pair.
Propagation repeats to a fixed point and runs again as choices are assigned. Child branches
inherit only still-relevant constraints: impossible unsafe traces and already-guaranteed
coverage obligations are dropped. Rectangles equal in all coordinates except one are merged
by taking the union in that coordinate, an exact union operation.

The exact characterization is:

```
R(choice) ⊆ T  iff no unsafe rectangle contains choice
T ⊆ R(choice) iff each target pair has a supporting rectangle containing choice
```

Consequently every pruned combination fails exact target equality. Full alternatives retain
all their rows, including unwanted nondeterministic outcomes. Surviving combinations still
undergo the complete engineering checks; behavior equality alone cannot establish adequacy,
resource grounding, budget compliance, or the truth of empirical declarations.

## Boundary summaries

Each synthesis request owns a bounded cache of complete steady-state boundary evaluations.
The target can be reused between candidates; identical behavior with different resource costs
can share an evaluation; adequacy can reuse the behavior comparison's evaluation. Resource
modes, construction costs, harms and acceptance predicates are still checked separately.

Keys contain carrier value domains, ordered composed boxes/ports/behavior rows, wires and the
joint observed interface. The cache retains internal valuations for existing diagnostics and
respects smaller state allowances. Failed or incomplete evaluations are never cached. It
stores at most 128 entries within a 200,000-cell/key-character allowance and is discarded at
the end of the request. This is reuse of exact whole-model boundary summaries, not a general
tree-decomposition or hierarchical subsystem solver.

## Controls and reporting

```json
{
  "strategy": "optimized",
  "optimizations": {
    "indexed_relations": true,
    "connected_factors": true,
    "separator_elimination": true,
    "backward_residual": true,
    "choice_propagation": true,
    "memoize_boundaries": true
  },
  "max_pruning_work": 100000
}
```

These fields supplement the existing model, contract, libraries and work/state limits.
Individual switches support ablation and debugging. `max_pruning_work: 0` disables compilation
through the normal fallback while allowing boundary memoization.

`separator_elimination` controls the shared [separator evaluator](separator-elimination.md).
It counts hidden states and preserves joint boundary behavior; it never merges resource modes
or changes the satisfying-design count. Its separately bounded preprocessing work is reported
in the behavior result's `relationStats.elimination`.

- `candidateSpace.size` is the original Cartesian space (`sizeExact` is its integer string).
- `enumerated` counts complete implementations passed to the engineering validator.
- `pruned`/`prunedExact` count combinations excluded by sound safety/coverage constraints.
- `accountedFor` is evaluated plus pruned; on a complete search it equals the original size.
  Numbers exceeding JavaScript's safe integer range are reported as null.
- `searchStats` reports search nodes, full evaluations, pruning work/fallbacks, choice-removal
  events and boundary computations/cache hits. Choice-removal events can repeat across branches.
- `results` retains the first 50 **evaluated** tuples, so rejected tuples removed by pruning
  are absent. `satisfyingCount` counts all satisfying tuples, and the first satisfying witness
  follows the same declaration order as exhaustive search.

## Bounds and fallback

Compilation and each propagation pass share `max_work` and receive at most one quarter of the
then-remaining allowance, capped by `max_pruning_work`. Compilation exhaustion discards all
compiled constraints; propagation exhaustion rolls back that pass's domain reductions.
The ordinary search then continues with the remaining work. An overall cap remains
`undecided`/`complete:false`, never a negative existence claim.

Missing fixed resource modes or malformed shared harm metadata defer to the ordinary
validator. Missing behavior, an empty target relation, or different target/concept boundary
inputs disable compilation. All component alternative declarations are validated before
pruning can hide an invalid row or mode.

Union behavior can itself be large, and tightly coupled choice constraints can make
preprocessing more expensive than direct enumeration. These bounds are part of the design;
types alone do not guarantee a small problem. No new Lean certificate for the compiler or
cache is claimed for that underlying solver. The symbolic front end has separate checked
finite-map certificates; it is not a verified TypeScript implementation.

## Verification and benchmarks

The differential suite compares complete satisfying-choice sets, counts, verdicts, uncertainty
and first witnesses against exhaustive search on 80 seeded partial/nondeterministic networks,
including feedback and fan-in. A separate oracle enumerates every original port valuation,
checks literal row membership and wire equality, and verifies boundary equality/nonblocking
without sharing the engine's port quotient, joins or propagation. Dedicated cases exercise
multi-port correlations, compensating choices, disconnected loops, resource differences,
invalid declarations, state allowances and cap rollback.

Run:

```sh
node --import tsx --test tests/act-synthesis.test.ts tests/act-synthesis-pruning.test.ts
node --import tsx scripts/benchmark-synthesis.mjs
# Equivalent package script: pnpm bench:synthesis
```

The benchmark runs exhaustive, memoization-only, residual-only, propagation-only, pruning
without memoization, index-only, factor-only, separator-only, fully optimized and symbolic variants. All must finish under identical limits
and match exhaustive verdicts, satisfying counts and first witnesses. Timings include
preprocessing and request-local cache construction, with one warmup and seven rotated samples
per variant. No timing threshold is used as a correctness test.

See [the compact before/after and ablation report](../benchmarks/synthesis/latest.md).
Full raw samples, counters and source hashes are generated locally into git-ignored
`benchmarks/synthesis/latest.json`.
The fixtures are synthetic algorithm exercises; motor/cyclone case-study data is not included.
