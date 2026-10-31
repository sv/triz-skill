# Checked symbolic summaries: proposed engine changes

Status: design proposal, checked against the local search implementation on 2026-10-31.
This note develops roadmap S6 with C6/S1/S3/S4; priorities remain in the
[roadmap](FUTURE-PLANS.md). The [shared finite relation foundation](shared-relations.md) is
implemented in the local PR #52 changes; the symbolic compiler and equivalence-class search
below remain proposals.

The strongest next step is a small, checked relation language with exact composition and
search over equivalent boundary summaries. Dependency-based reuse and certified parameter
bounds follow. The Russian/Chinese papers offer useful representation and change-propagation
ideas; the pruning and completeness arguments below are additional engine obligations.

## Which literature is useful

| Source and inspected scope | Borrow | Required qualification |
|---|---|---|
| Ge/Yang 2021, [quantitative effects](https://html.rhhz.net/GDGYDXXB/html/1636452043221-421788683.htm), §§1–2.8; R133 | Represent an effect by affected properties, dependency structure and quantitative relations | The seven examples include coefficient definitions and history-dependent effects, not a ready-made library of total stateless functions |
| Liao/Yang 2024, [compound-element propagation](https://html.rhhz.net/GDGYDXXB/html/1717584627093-1727027999.htm), §§1–2; R134 | Propagate an edit through shared/dependent properties; leave unrelated compounds unaffected | Its independence premises must be checked from our complete semantics before reuse |
| Li et al. 2019, [relation transformations](https://html.rhhz.net/tis/html/201811027.htm), §§1–2; R129 | Explicit functional dependencies and edits to them | Local finite-difference signs and derivative influence comparisons do not establish global monotonicity |
| Zhang et al. 2019, [functional basic elements](https://html.rhhz.net/GDGYDXXB/html/20190102.htm), §1, and Khomenko's [ENV model](https://otsm-triz.org/content/models_otsm-triz_ru), ENV discussion; R127/R126 | Typed references to entities, properties and values | Structured descriptions need an executable relation before they can justify pruning |
| Chen et al. 2022, [substance–field transformations](https://html.rhhz.net/GDGYDXXB/html/1648878253628-1800685755.htm), §§1–2; R128 | Typed transformation templates and explicit changed dependencies | Candidate generation is useful; changing an “insufficient” label to “effective” is not a checked performance improvement |

The 2011 principle-mapping paper and 2010 lattice-ideality paper (R130/R131) remain prior-art
leads: only their records and the later book description were accessible in this review.
Do not base a pruning theorem on unread mappings. Revyakin's logical indexing (R124) and the
Russian ontology (R125) are useful for rule retrieval/schema organization, with less immediate
search benefit. An ontology match supplies neither relation equivalence nor physical adequacy.
Full citations and reading limits are in the [research note](formal-triz-literature.md).

## What the current engine still computes

- [The residual compiler](../src/act-synthesis-pruning.ts) uses the shared relation adapter and
  indexed join, unions library rows and enumerates
  consistent internal traces before forming unsafe/coverage rectangles. This can be expensive
  even when many implementations have simple, equivalent behavior.
- [Synthesis](../src/act-synthesis.ts) still visits surviving concrete tuples. The
  [boundary cache](../src/act-behavior.ts) avoids repeated exact evaluation of identical models;
  it does not quotient partial assemblies by their external semantics.
- [Subsystem summaries](../src/act-refinement.ts) are exact finite relations with maps back to
  ports. The current [contract checker](../src/act-subsystem-contract.ts) checks single-mode
  stateless declarations by recomputing their finite behavior.

Shared tuple indexes now reduce bound-input join candidates and replace quadratic complete-row
overlap checks during correlation propagation. Connected-factor evaluation avoids materializing
independent internal products. These improvements do not
merge equivalent component-choice prefixes or eliminate variables across connected separators.

The proposed gain is to avoid materializing internal traces and repeatedly exploring equivalent
prefixes. It cannot eliminate the cost of reading input tables, distinct resource problems,
large separator relations, or explicitly listing every concrete answer.

## 1. Add a checked relation language

Start internally, without requiring users to rewrite catalogue entries. Each recognized component
gets an expression, a typed interface, complete domain guards and a reconstruction map:

For later quantitative catalogue entries, resolve each entity/property/value reference to an
actual typed port, parameter or state coordinate. A law record names its inputs/outputs,
parameter bindings, applicability guard and relation. Reuse `effect_quantity`/SI typing;
do not introduce a second ontology-driven notion of type compatibility. Law metadata can
suggest a recognizer, while the declared semantics remains authoritative.

```text
ExactSummary = {
  interface, relation_expression, domain_guards,
  source_binding, checker_version, reconstruction
}

relation_expression = equality / constant / permutation / product /
                      composition / feedback / finite_table
```

Keep the relation over the entire interface. A copy relation `left = right = in` is not two
independent output domains. Relational copying also does not authorize duplicating an extensive
physical resource: original feasibility and conservation obligations remain separate.

Add Boolean affine constraints (`A x = b` over GF(2)) after the first primitives. Equality,
negation, XOR, correlated fan-out and inconsistent Boolean feedback fit this representation.
Scalar rational affine laws and piecewise guards are a later extension with explicit numeric
interpretations. `Carrier.levels[].from` is a threshold, not the exact magnitude of a value;
it cannot be used as an exact numeric sample when fitting a law.

**Recognition checks equality, not row inclusion.** All declared rows must satisfy the primitive,
and every primitive row over the declared domain must be present. Missing rows, extra outcomes,
partial domains and cross-output correlations must be accounted for. For a total deterministic
primitive, unique input coverage plus the expected domain cardinality can establish completeness
without enumerating a second Cartesian table. Charge the checking work and refuse on a cap.

A catalogue law/hint may select a checker, never assert successful recognition. Validate every
original alternative before pruning, as the current synthesis path does. Use the table fallback
for unsupported relations. Initial primitives may be recognized over arbitrary finite carrier
types; numeric and Boolean backends require explicit interpretations and checked value maps.

## 2. Compose exact summaries before enumerating traces

Normalize identities, permutations and products, then eliminate internal variables while
retaining all domain constraints. Existing mathematical foundations are
`external_seq`, `external_par`, `external_feedback` and `external_mono` in
[Semantics.lean](../theory/Semantics.lean), plus `external_substituteWired` in
[Hierarchy.lean](../theory/Hierarchy.lean). They prove abstract laws, not a new runtime compiler.

For equality constraints use variable identification; for Boolean affine constraints use checked
row reduction. Feedback adds wire equalities and projects existential internal variables. It
must detect inconsistent systems, not treat a loop as an executable forward function. Mixed or
unsupported regions keep finite tables and use bounded elimination/join at their interfaces.

Domain guards cannot disappear during normalization. For example, let every port have numeric
domain `{0,1}`. The guarded chain `z=x+1; y=z-1` admits only `(x,y)=(0,0)`. Replacing the chain
by the unguarded equation `y=x` incorrectly admits `(1,1)`. Preserve the intermediate-domain
preimage or refuse that simplification.

Return enough back-substitution data to reconstruct a concrete internal witness. If an existing
diagnostic requires counts or every internal valuation that the summary does not retain, use
the finite evaluator for that diagnostic. Exact boundary equivalence alone does not preserve
internal-state counts or observation interfaces naming hidden ports.

## 3. Search boundary classes, retaining implementation members

Choose a separator exposing every connection between a completed subassembly and the remaining
context. Compose a partial choice into a canonical boundary relation and memoize that result.
Equal boundary relations with compatible interfaces share subsequent behavioral work. This
extends the current post-evaluation cache into dynamic programming over partial assemblies.

The memo state must include the separator, remaining-library position, complete boundary
relation/guards and any pending coordination constraints. A final-output relation alone is not
sufficient while unobserved ports still connect to the remainder. Closed inconsistent factors
must still make the whole relation empty; disconnected boxes cannot simply be dropped.

Each behavior class retains its concrete implementation members, multiplicities and witness
recipes. Costs, numeric modes, source support, harms, evidence/applicability and geometry are
not erased by behavioral equivalence. Use a second full validation signature for these fields.
Share a full verdict only when every field it reads is identical or covered by a proved transport.
The same member supplies behavior and resources; no cross-member splicing is permitted.

This distinction matters for the current API: it returns `satisfyingCount`, concrete choices
and a bounded list, not merely existence of one design. If members have different resource
problems, behavior sharing alone does not avoid those validations. Preserve member order for
the first witness and expand counts only from a checked member partition. Do not call merged
feasible members “rejected/pruned.” Add separate represented/merged and rejected counters.

For a future explicit `witness` or `pareto` result mode, resource antichains can remove dominated
members after proving context-compatible dominance. Enumeration/counting mode must retain them.
Initially permit cost dominance only for equal behavior, equal non-cost constraints/resource
modes, and explicitly additive nonnegative fixed costs. Stronger provisions, different policies,
probabilistic costs and arbitrary aggregation require additional theorems.

**Illustration, not an engine benchmark:** eight Boolean stages, each with two identity variants
and two negation variants, give 65,536 concrete tuples. With otherwise identical validation
metadata, there are 256 behavior-class tuples but only two parity summaries at each nonempty
prefix. A small independent exhaustive calculation agreed with a multiplicity-preserving DP:
17 states including the root, 30 class transitions, and 32,768 concrete implementations per
final parity. For `n ≥ 1`, these counts are `1+2n` states, `2+4(n−1)` transitions and `4^n/2`
members per final parity. Resource-distinct variants can restore a large second-stage search.

## 4. Check dependency footprints and reuse only unaffected summaries

Derive property reads, guards and writes from the executable expression, not component names
or a user-maintained `depends_on` tag. For a finite total function, validate support by comparing
inputs that agree on the proposed support and checking that their outputs agree. For partial
or relational models, include definedness and the full correlated relation. Agreement of unary
output marginals does not establish independence.

Use these footprints for:

- Recomputing only summaries whose semantic dependencies changed.
- Re-running only residual constraints watching a changed choice domain.
- Factoring a relation after checking independence across the proposed partition.
- Reusing an unchanged region after a model edit.

The frame obligation is: changing fields outside a complete dependency footprint leaves the
summary unchanged. Include shared parameters, budgets, domain guards, observation maps and
envelope/evidence versions in the appropriate dependency graph. A declared missing edge is not
evidence of independence. Shrinking search domains permits incremental propagation; widening
them or editing a model requires invalidating prior removals/supports.

Start with request-local reuse. Cross-request reuse requires content/version binding and a
checked certificate or recomputation; callers cannot supply a trusted “already checked” flag.

## 5. Add certified bounds with separate exact/bounded types

Use relation or numeric bounds when exact normalization is too expensive. For a partial choice
`P`, establish for **every** remaining completion `c`:

```text
R_must(P) ⊆ R(c) ⊆ R_may(P)
```

For the current exact target `T`, a branch can be rejected if `T` contains a pair absent from
`R_may`, or `R_must` contains a pair forbidden by `T`. An unsafe pair in `R_may` alone does not
justify rejection: it might occur only in a completion that can be avoided. Preserve the
existing coupled choice constraints where bounds are insufficient.

Under a future requirement-satisfaction mode, reject a branch when some required input has no
possible output in `R_may`, or an unavoidable output in `R_must` violates its allowed predicate.
Safety of `R_may` plus nonblocking coverage of `R_must` can establish behavioral acceptability
for all completions. Resources, harms and applicability still need their own checks.

For finite size grids, checked monotonicity/interval laws can reject parameter regions when an
optimistic performance bound fails a requirement, or a cost lower bound exceeds a hard budget.
Global cost-incumbent pruning needs an explicit optimization mode and correct objective order.
Prove bounds over the whole region, retaining units, parameter sharing and physical envelopes.
Local derivatives or a sample trend cannot supply this premise. Start with exact rationals;
numerical uncertainty must widen an enclosure or produce `unknown`, never a guessed exclusion.

## Candidate generation and objectives

Use substance–field/principle transformations to propose typed rewrite templates with
preconditions, parameter domains, changed properties and evidence obligations. Index templates
by their required/provided types and relational guards. Exact checks can reject incompatible
matches; a heuristic score can order the remaining matches without eliminating them.

A template-restricted generator searches a different declared candidate space unless coverage
of the original catalogue space is proved. Keep that scope visible. This is a valuable later
discovery feature, with less immediate benefit for fixed-wiring summary compilation.

Order-based ideality motivates explicit property vectors and Pareto fronts. It does not make
“more output” an improvement under exact relation equality, justify arbitrary scalar scores,
or guarantee that feasible designs form a lattice. Requirement orders and objective modes are
separate E1/E2 changes.

## Concrete implementation slices

| Slice | Proposed changes | Evidence needed before default use |
|---|---|---|
| A: recognize and compose | New `src/act-symbolic-summary.ts`; integrate a fast path into `act-behavior.ts`, `act-refinement.ts` and the residual compiler | Complete-row recognizer checks, domain-preserving composition, witness reconstruction; exhaustive differential tests and explicit fallback |
| B: quotient search | New `src/act-synthesis-summary-dp.ts`; integrate partial-summary states into `act-synthesis.ts` | Separator completeness, member partition/count reconstruction and unchanged resource/harms results |
| C: dependency reuse | Shared footprints in the summary module; watched constraints in `act-synthesis-pruning.ts` | Frame/support checks, fresh-versus-incremental comparison including widened domains and hidden guards |
| D: bounded parameter reasoning | Separate bound-summary type and finite parameter-domain adapter | Sound may/must or numeric enclosures, explicit property orders, applicability and objective semantics |
| Later: discovery templates | Extend catalogue/discovery through reviewed typed generators | Declared search grammar, coverage scope and full validation of generated parts |

Begin A with equality/permutation/fan-out and exact table fallback; add Boolean affine regions
next. B can then address the coupled copy/flip and interchangeable-component workloads in the
[existing benchmark](../benchmarks/synthesis/latest.md). C and D build on the same expressions.
These are slices within S6/scaling, not a second project backlog.

Add optional ablation controls for symbolic summaries and summary DP beside the current
`optimizations` flags. `strategy: "exhaustive"` remains independent. Charge recognition,
normalization, equality checking, projection, member reconstruction and failed attempts to the
shared work budget. A cap abandons incomplete conclusions and falls back within the remaining
budget, or reports `undecided`; preprocessing has no free unbounded allowance.

## Proof and verification obligations

A new `theory/SymbolicSummary.lean` should prove recognition soundness, expression normalization,
composition and projection correctness against the existing relational semantics. Add a frame
lemma for footprints, a may/must pruning lemma, and a separate reconstruction/counting argument
for merged choices. Proving the algebra does not prove its JSON encoder or the TypeScript
algorithm; keep runtime checks, source correspondence and generated certificates distinct.

Use tactics to discharge these reusable obligations: simplification for wiring laws, finite
reflection for small recognizers, algebra for affine composition, and arithmetic reasoning for
scoped rational/integer bounds. A heuristic may propose an expression/elimination order; a
checker validates its result. Do not run unrestricted proof search for every candidate or import
new trusted axioms to turn a heuristic failure into a guarantee.

Differential checks must include partial functions, missing/extra rows, nondeterministic harms,
correlated outputs, equality/negation feedback, inconsistent disconnected factors, intermediate
domain guards, extensive quantities, equal behavior with different costs/modes, renamed twins,
member counts/order, and tiny work caps. Check skipped branches as well as accepted witnesses.

Benchmark exhaustive search, today's optimized search, and each new ablation on the same
requests. Add long recognized chains, reconverging XOR networks, many duplicate semantics,
guarded affine chains, correlated near-matches and deliberately unrecognized tables. Record
input rows checked, internal traces materialized, distinct boundary classes, represented versus
rejected tuples, resource evaluations, checker/proof work, peak memory and end-to-end time.
All counts/verdicts must match complete exhaustive references; no speedup is claimed by this
proposal or by the small parity illustration.
