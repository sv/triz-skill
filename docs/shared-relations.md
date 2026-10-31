# Shared finite relation evaluation

The local changes in PR #52 add a common finite relation representation and evaluator for
behavior, synthesis residual compilation and global separation. This is the table-based
foundation for the [symbolic-summary design](symbolic-summary-design.md); symbolic primitive
recognition, boundary-equivalence search and numeric parameter bounds remain future work.

## Representation and consumers

[act-relations.ts](../src/act-relations.ts) represents a relation by a variable scope and rows
of variable/value bindings. Row entries are conjunctive and table rows are alternatives.
Repeated variables impose equality; conflicting repetitions cannot participate in a join.
Sparse rows are wildcards during row-selection enumeration. The projection collector requires
complete, domain-valid, deduplicated rows, as supplied by the model adapter.

[act-relation-model.ts](../src/act-relation-model.ts) owns the model-to-relation adapter:
wire equivalence classes, typed variable domains, complete correlated box rows and duplicate
removal. Existing imports of `bindRow` and `portVariables` through `act-behavior.ts` continue
to work. [Propagation](../src/act-propagation.ts) uses the same binding/scope types.

The behavior evaluator retains its existing domain/semijoin preprocessing and uses the shared
plan for exact projection. Synthesis residual compilation uses the same adapter and indexed
join, but still observes complete traces to preserve coupled component-choice support.
Global separation compiles local tables and explicit variable-domain tables into the same plan,
then solves each independent factor for a witness.

## Indexed evaluation

A query plan builds bounded tuple indexes on demand for bound variables. Several bound ports
use a joint key, preserving their correlation instead of scanning a single-column bucket and
discarding the mismatches. Single-column indexes remain available when the joint key cannot
fit the storage allowance. Every candidate's remaining equalities are checked; wildcard candidates
stay in declaration order. This also applies to partial and nondeterministic complete relations,
without assuming that every relation is a function.
The join planner prioritizes bound overlaps and then smaller tables; declaration order breaks
remaining ties. The legacy scan wrapper retains its earlier declaration-order planning for
independent reference checks.

Tables with fewer than eight rows use scanning; building a hash index costs more on these small
queries. Index storage has a 200,000-cell default allowance. Exhausting that allowance uses the
scan path, with identical semantics. Indexes and query orders are request-local.

[act-relation-index.ts](../src/act-relation-index.ts) supplies the same exact tuple buckets to
evaluation and correlation propagation. Keys encode whole string tuples, including empty values,
punctuation and prototype names. The normalized maps are retained only for tables large enough
to use an index; tiny/scan tables retain array rows for the ordinary join loop.

This is indexed finite-table evaluation. No identity/XOR/affine law is inferred from labels,
numeric levels or a sample of rows.

## Indexed correlation propagation

Pairwise semijoins restrict each table to rows supported by its neighbors on their shared
variables. On complete rows, a hash lookup of the entire overlap replaces a nested comparison
of each row pair: building and probing an index takes work linear in the two row counts times
the overlap width. Correlations survive because a support must match the whole tuple.

The existing worklist still revisits only affected neighbors. An index is shared by revisions
that query the same supporting table and overlap, and discarded whenever that table shrinks.
Removed rows therefore cannot supply stale support. A partial query scans instead; sparse
support rows stay in the candidate list and undergo the ordinary compatibility check.

The pass bounds cumulative index allocations at 200,000 estimated cells, including rebuilt
indexes, and charges construction, probes and candidate checks to its propagation allowance.
Storage exhaustion scans; work exhaustion discards the entire pass. Cyclic networks still need
the exact join: even a complete semijoin fixed point need not have a global solution.

## Connected-factor decomposition

The plan finds connected components of the table-variable incidence graph after wire
identification. Scopes include correlated ports even when they happen to have equal values.
Zero-port constraints remain factors; an empty or inconsistent disconnected factor empties the
whole relation. Acyclic wiring is not assumed.

Each factor is evaluated once per assignment of its own boundary inputs. Global boundary rows
still cover every original situation, including blocked situations. Independent internal-state
counts multiply; output relations combine only at the observed boundary. Up to ten valid global
state samples are reconstructed without materializing the entire internal product.

Explicit boundary output products still consume the state allowance. Counts outside JavaScript's
safe integer range return an incomplete/capped result instead of a rounded count. Factorization
can change which tied internal samples are shown; their validity, distinctness and reported total
are preserved. These static summaries do not establish dynamic or resource equivalence.

Connected queries use a direct streaming collector to avoid factor-cache/reconstruction overhead.
Larger branching queries can now use [separator elimination](separator-elimination.md) before
this fallback. It summarizes internal assignments across connected separators; join-tree
completeness checking and symbolic primitive recognition remain separate work.

## Controls, counters and budgets

`triz_synthesize.optimizations` adds `indexed_relations` and `connected_factors`. Set either to
`false` for an ablation. `strategy: "exhaustive"` disables the new paths as well as component-choice
pruning and boundary memoization. Internal behavior/global-separation APIs accept relation-plan
options for tests; these do not add caller-supplied checked summaries to the public model schema.
`indexed_relations: false` also selects the scan semijoin implementation. The internal
`compoundIndexes: false` option isolates single-column join indexing for benchmarks.
`separator_elimination: false` disables separator summaries; exhaustive mode disables them too.

Successful behavior summaries and global-separation results include `relationStats`: input rows,
row candidates, index lookups/storage/fallbacks, factor evaluations/cache hits, output combinations
and count-overflow status. `statesExplored` still measures search states; it is not a CPU or
allocation counter. Indexing can reduce row candidates without changing the visited states.
Behavior's `propagation.semijoin` reports support row comparisons, index builds, probes, cells
and storage fallbacks separately from the subsequent join counters.

Behavior keeps its existing separate propagation allowance and state limit. Synthesis compilation
and global separation charge shared-plan setup, index construction and row checking to their work
limits. New work totals therefore differ from the earlier accounting. Failed preprocessing cannot
produce a speculative rejection. Costs, resource grounding, harms and implementation coupling
continue through the complete engineering validator.

## Verification and benchmarks

[Independent exhaustive tests](../tests/act-relations.test.ts) compare all index/decomposition
ablations on 300 small finite networks. They check relations, state counts, samples and witnesses,
including disconnected and zero-port contradictions, repeated variables, wildcard rows, isolated
variables, correlated observations and caps. Existing whole-port semantic tests and synthesis
oracles exercise the model adapters; synthesis tests also compare all new ablations with exhaustive
component choices. MCP smoke exercises the new options across the protocol boundary.
An additional 300 larger propagation cases compare indexed and scan results against independent
finite valuations; 200 larger multi-input projection cases check counts, correlated observations
and samples. Tests cover invalidation while eight or more rows survive, wildcard/partial
queries, whole-pass rollback and insufficient index storage.

The mathematical basis includes `external_par` and `mem_steadyStates_par` in
[Semantics.lean](../theory/Semantics.lean). These results justify the abstract product structure;
the new TypeScript implementation is differentially tested, not extracted or formally verified.

Run `pnpm bench:relations` for the [before/after report](../benchmarks/relations/latest.md).
It extracts the committed pre-refactor engine (`d7184d9`) locally and compares whole API calls,
then measures scan/index/factor ablations of the shared kernel. Raw samples and source hashes
are retained. Synthetic cases include small connected controls and the existing synthesis
workloads, so the report includes overhead and regressions. Full output enumeration remains
output-sensitive, and connected dense constraints can still be expensive.

The [incremental tuple-index report](../benchmarks/tuple-index/latest.md) compares against
`3178d4b`, the first shared-relation implementation. It includes multi-input chains and overlap
contradictions at three table sizes, complete-pass scan controls and the existing small synthesis
cases. The 1,024-row contradiction exhausts the old default propagation allowance; indexed
propagation finishes and avoids the unpruned join. Exact outputs and counts match in every run.
