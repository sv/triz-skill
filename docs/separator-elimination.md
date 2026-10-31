# Separator-based finite variable elimination

The local changes in PR #52 extend the [shared relation evaluator](shared-relations.md) with
exact bucket elimination for finite behavior projection. It applies to declared relations in any
domain, including nondeterminism, feedback and cyclic constraint graphs. Component names and
physical interpretations do not select algebraic laws.

## Summaries and composition

Boundary inputs and observed variables are pinned. A min-fill heuristic selects an internal
variable, preferring fewer new graph edges and then a smaller estimated separator domain. Its
bucket contains every current factor mentioning that variable. The shared indexed evaluator
joins the bucket, removes the variable and aggregates equal remaining tuples into a message.
The separator is the variable's neighborhood in the evolving primal constraint graph.

A message row retains its full separator tuple, a `bigint` count and up to ten partial state
samples. Counts multiply when factors join and add across assignments of a removed variable.
Each current factor owns a disjoint set of eliminated variables, so these products count full
assignments exactly once. Complete normalized input rows are deduplicated. Correlations across
all remaining ports survive; marginal domains are insufficient for this operation.

Partial samples carry assignments of the removed variables. Their bounded Cartesian products
reconstruct valid distinct complete samples without expanding the internal state product.
The final join keeps all remaining constraints and boundary situations, including blocked ones.
Repeated observations and boundary-only observations retain their original positions.

Counts stay exact internally even above JavaScript's safe integer range. Only completed boundary
counts are checked for numeric reporting; an empty factor still annihilates the relation. A
complete count outside the safe range returns the existing incomplete/capped result.

## Selection and limits

Automatic selection requires a connected factor containing at least eight tables and at least
four hidden variables overall. A uniform-density estimate must predict at least 256 states per
boundary situation. This estimate only selects an evaluation algorithm; it never prunes a design
or proves a result. Small models, deterministic chains and independently factored small tables
normally keep their existing streaming paths.

The default attempt limits are 100,000 work units, 200,000 cumulative estimated allocated cells
and twelve variables per separator. Normalization/domain guards, graph construction, min-fill
planning, indexed joins, message construction and sample reconstruction consume the attempt's
allowance. Message/index construction also uses the shared join's index limits. A wide separator
or exhausted allowance discards every message and falls back to the original finite evaluator.
Sparse rows also fall back; `project` retains its existing complete-row precondition, while
row-selection enumeration continues to support sparse wildcards.

Like domain propagation, elimination has a separate bounded preprocessing allowance. Failed
attempts do not consume the subsequent behavior state allowance; their work and attempted join
states remain visible in `relationStats.elimination`. If an outer `RelationBudget.spend` is
provided, all attempt work is also charged there and its exceptions propagate. Successful
elimination charges its join visits to `statesExplored`. These are accounting units, not CPU
time or a count of all represented states. Explicit output enumeration remains bounded and
output-sensitive. Complexity can still grow exponentially with separator width.

`triz_synthesize.optimizations.separator_elimination: false` disables the new path;
`strategy: "exhaustive"` disables it with the other optimizations. Internal relation options
support `elimination: "auto" | "always" | "off"` and the three attempt limits above for tests
and ablations. `"always"` forces checks on small finite instances; it does not bypass limits
or completeness/domain checks.

## Consumers and boundaries

Behavior projection, adequacy and synthesis boundary evaluation use the same implementation.
Memoized behavior results retain exact counts and samples. Summaries count internal states,
never component implementations: resource costs, harms and whole-design validation still run
for each surviving concrete component choice.

The residual compiler still enumerates complete traces because its coupled choice constraints
need their provenance. Global-separation witness search keeps its current indexed factor solver.
This slice adds no symbolic primitive recognition, cost semiring, lifecycle optimization or
boundary-equivalence search over partial assemblies.

## Verification and measurements

[Differential tests](../tests/act-elimination.test.ts) force elimination on 400 seeded finite
networks across index/decomposition ablations and compare with independent literal valuations.
They check relations, exact counts, blocked situations, correlated/repeated observations,
unconstrained variables and bounded distinct valid samples. Further cases cover connected chains,
stars and cycles, zero-port contradictions, large counts, conflicting repeated variables,
duplicate normalization, sparse fallback, output caps, outer work limits and rollback of all
messages after work/storage/width exhaustion. A synthesis fixture verifies that equal behavior
with three different resource costs still yields exactly two satisfying implementations.

Run `pnpm bench:elimination` for the [incremental before/after report](../benchmarks/elimination/latest.md)
against commit `a39b48d`. It compares whole calls, including model checking, propagation, planning
and output construction, and retains all four small synthesis controls. Kernel ablations disable
elimination explicitly before measuring the new variant. Raw samples, work/cell/width counters
and source hashes are in `latest.json`; timings have no pass/fail threshold.

The implementation uses finite sum/product identities and exact joins. Its TypeScript code is
differentially tested, not extracted from Lean or claimed as a new machine-checked proof.
