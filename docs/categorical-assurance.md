# Categorical assurance and finite analysis

This change implements bounded capabilities across the eight workstreams in the reviewed plan.
It does not remove a limitation merely because a related theorem exists. The remaining work and
acceptance criteria are in [the separate future plan](categorical-future-plan.md); the bibliography
is in [theory/REFERENCES.md](../theory/REFERENCES.md).
The research baseline was commit `82d87a6a7a124481afa33194679807561bb6358c`.

## Delivered scope

| Workstream | Delivered interface | What a successful result establishes |
|---|---|---|
| 1. Claim scope and input binding | `scope`, certificate `manifest`; `certify.mjs --request` | The requested source tables correspond to the encoded data and the certificate is fresh for the authoritative request. Lean validation remains a separate check. |
| 2. Invariance and semantic comparison | `triz_isomorphism`, extended metamorphic tests | A supplied or bounded-search bijection preserves the selected annotations; arbitrary renaming and permutations preserve the complete tested verdicts. |
| 3. Finite certificates | `triz_behavior`, `triz_weakness`, `triz_dynamics` with `certificate` | Supported finite equality/inequality and all weakness pair outcomes; reachable escalation and supported state-only inductive safety, independently checked by Lean. |
| 4. Whole-system semantics and adequacy | `triz_behavior` with `scope: "whole"`; `triz_adequacy` | Every box constraint participates in the declared relation. Required inputs have an output and every output meets `acceptable`. |
| 5. Common implementation witness | `triz_implementations`, `triz_absorber_assignments`; `triz_weakness` with `prior` | One complete named alternative meets behavior, adequacy, declared-harm and shared-budget conditions together; operating probability mass is reported separately from inclusion. |
| 6. Joint synthesis and abstraction | `triz_synthesize`, `triz_behavior_refinement`, `triz_subsystem_summary` | A complete tuple from the finite fixed-wiring library satisfies the contract; or complete whole-model relations satisfy the stated interface/value inclusion; or a stateless subsystem has an exact boundary summary. |
| 7. Engineering and structured separation | `triz_queue`, `triz_conservation`, `triz_global_separation` | A declared finite queue schedule reaches overflow or avoids it within its horizon; a declared quantity balance holds; or one assignment satisfies every overlapping local relation. |
| 8. Restricted rewrite guarantees | `triz_rule_set`, `triz_rewrite_pair`, `triz_trim_rewrite` | A sufficient natural-number measure decreases for the named rules; two named rewrites commute; or an explicit absorber-aware trim rewrite replays exactly. |

These checks share typed models, strict request validation, and explicit work caps. A cap is an
incomplete decision, never proof of infeasibility, non-isomorphism, or nonconfluence. Search
results state the candidate space and distinguish display truncation from search completeness.

## Relationship to merged and companion work

[PR #32](https://github.com/sv/triz-skill/pull/32) proposes general one/two-hole union preservation,
two-hole safe-pair theory via formal concepts, Mealy fixed-point statements, and recurrent
reachability. This PR keeps its distinct row/OpenDiagram adapters and certificate lemmas, and
removes its unused overlapping one-hole theorem layer. The runtime and certificate APIs remain
independent of that open PR; no unmerged theory is imported or claimed as delivered here.

Merged [PR #39](https://github.com/sv/triz-skill/pull/39) supplies preserved-behavior and
unreachable-escalation certificates, including comparison mappings and one-sided inputs. This
branch extends that shared implementation with request binding, whole scope, changed comparisons,
all weakness pair outcomes and stronger state-only safety. The duplicate generic invariant lemma
was removed in favor of `unreachable_of_invariant`; both certificate target meanings remain explicit.

## Behavioral scope and adequacy

The default `triz_behavior` scope remains `upstream` for compatibility. It assumes omitted boxes
accept everything received. `scope: "whole"` composes every declared box, including product/sink
constraints, downstream feedback, disconnected cycles, and fan-in equalities. Missing behavior
returns an unresolved result. Neither mode turns transition rows into steady-state relations.

`full_relation: true` returns every boundary row within the search cap; default summaries may
be display-truncated. `triz_behavior_refinement` always uses complete whole-model relations.
Semantic isomorphism returns mappings as entry lists, preserving arbitrary IDs such as `__proto__` across JSON/schema parsing; ordinary record input is also accepted for normal keys. Refinement value maps likewise accept entry lists.
Its input and output maps explicitly map each detailed value into a coarse value; identification
of several detailed endpoints must agree on every admitted detailed pair.

`preserved` remains equality of relations. `triz_adequacy` is the separate test that every required
operating situation has a steady state and all its deliverable outputs are acceptable. The
required situations are complete assignments of boundary inputs. With no explicit list, all
situations are required. Equal partial relations can fail adequacy.

Subsystem summaries expose input/output maps, compose internal constraints, sum fixed costs, and
list hidden harmful/excessive functions. They do not infer operating feasibility or dynamics.
An empty relation is reported as `empty-relation`; a missing behavior declaration must never be
used as an implementation of that empty relation.

## Certificates and source correspondence

A generated certificate is not yet a checked certificate. Each successful generation has a
manifest containing source-request SHA256, scope, generator/schema/theory identifiers, and the
Lean/Mathlib pins. The complete authoritative request includes the unsafe/safe predicates,
initial states, acceptable outputs, comparison models and scope as applicable.

```sh
node scripts/certify.mjs --local --tamper --request request.json result.lean
```

Without a built local theory, the checker stops. Only explicit `--remote` sends the certificate
and its model data to AXLE, whose execution and Mathlib revision are then trusted.

The request is a certificate request record: `kind: "model"` with `model`;
`kind: "separation"` with `contradiction`; `kind: "dynamics"` with `model` and `spec`;
`kind: "weakness"` with `concepts`, `acceptable` and optional `scope`/`maxStates`;
or `kind: "behavior"` with `baseline`, `concept` and optional `scope`/`maxStates`/`boxMap`.
Use the exact request used for generation. Internal `spec` options use camelCase, as the
library does, rather than MCP's snake_case wrapper.

The checker compares source data and finite tables using an independent correspondence pass,
regenerates to check freshness, and then checks the pinned theorem statements. Repeating the same
generator alone would not detect a common encoding bug. This is correspondence checking and
translation validation, not a general correctness proof of the TypeScript encoder or evaluator.
The grammar/axiom checks and tampered-certificate rejection still apply.

Behavior certificates use the declared `boxMap` to align interfaces, include inputs read by only
one model, and compare the baseline deliverables; gained deliverables stay outside that comparison.
Equality also proves the relation has at least one pair, without establishing adequacy at every input.
Missing declarations, residual queries and lost deliverables give an explicit reason rather than
a misleading certificate. Weakness certificates cover strict order, equality and incomparability;
prior probability mass is not certified. A distinguishing situation includes proof of admission
(existence and universal acceptable outputs) or rejection (an unacceptable output or no output).

State-only negative dynamics certificates require a genuinely closed invariant and cover unsafe
states regardless of whether a valuation is admitted. They contain every valuation for each
selected state, matching the successor-valuation semantics of `Sync.Step`; a visited list of
consistent configurations would not automatically be closed. Saturated unreachable port-target
certificates instead exclude admitted unsafe configurations (`Sync.target`); they do not certify
the absence of unsafe blocked states, whose port values are unknown. Input schedules, bounded-only
negatives, safe port-invariance claims and loop-class certificates remain unsupported. A combined
request can return only the supported escalation proof. A generated proof certifies only the
statements listed in `certifies` under its scope.

## Implementations, resources and evidence

`triz_implementations` takes a common contract and named complete models. Each alternative names
an operating envelope, evidence sources and declared harms. For the implemented joint check,
every box, including disconnected boxes and sinks, has exactly one explicit feasibility row, asserted to support all its behavior rows in that
envelope. A missing resource mode returns undecided; contradictions between declared numeric levels and behavior reject with diagnostics. Multiple resource modes must be represented as separate named alternatives; otherwise
the result is undecided. This deliberately prevents selecting capable behavior from one mode and
cheap resources from an incompatible mode.

Evidence is user-declared provenance. A successful contract result does not verify an experiment,
manufacturer claim or operating envelope. Harm acceptance is explicit; omitted known negative
wires are reported. Undiscovered physical harms remain outside the model.

Absorber search enumerates every compatible output endpoint, including multiple ports on one
box, and evaluates complete assignments together. Fixed-wiring synthesis substitutes complete
joint behavior rows and a coupled resource mode for each hole. It never substitutes independent
projections for a correlated relation. Exhaustive failure is only impossibility within the
specified finite library, not impossibility of invention.

An explicit weakness `prior` is a complete joint table of `{input: [{box, port, value}], weight}`
rows, including zero masses. It yields `byPrior` operating coverage while keeping set inclusion,
maximal concepts and `byCount` separate. Strict inclusion can tie under a prior assigning zero
mass to the additional situations. No independence assumption or extension of Bennett's
uniform-task theorem is made.

## Engineering and rewrite boundaries

The queue adapter declares arrival alternatives per slot, service/storage capacities, initial
backlog, units and an explicit arrival/service schedule. It compiles transition rows and uses
the dynamics evaluator. A bounded non-overflow result covers only the declared slots. The
conservation checker sums extensive amounts and compares intensive minimum levels under the
explicit declared interpretation; it does not infer units, mixing laws or constitutive physics.

Structured separation solves a finite global assignment problem. `x=y`, `y=z`, `x!=z` can have
compatible nonempty pairwise projections and still no global assignment. No sheaf cohomology
or minimal conflict core is claimed.

Rule termination uses lexicographic box/wire counts, and is a sufficient test for exactly the
validated named subset. Failure to find this measure does not prove nontermination. Commutation
checks concern two named occurrences and their two orders. They do not establish global
confluence. Trim replay records the absorber and rerouted wires explicitly; no Kan-extension,
AGREE, PBPO+ or physical-realizability claim follows from replay.

## Runnable examples

[requests.json](../examples/assurance/requests.json) contains complete synthetic requests through
the shared MCP interfaces. Run them offline with:

```sh
node --import tsx scripts/assurance-demo.mjs
```

The built-server smoke test also executes these requests through an actual MCP stdio client.
The example evidence identifies synthetic declarations rather than pretending to be measurements.

## Validation

Focused regression suites accompany the behavior/scope/prior, certificates, semantic
isomorphism, refinement/summary, contracts, synthesis, structured separation, queue/conservation,
rewrite analysis and extended invariance capabilities. Existing regression suites remain part of
`pnpm test`. Run the schema, build, typecheck, MCP handshake, Lean build and certificate tamper
checks before merging. Refer to the PR for the actual execution results rather than treating
this checklist as evidence that a command was run.
