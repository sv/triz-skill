# Joint engineering synthesis design

Scope: reusable engine requirements, architecture and acceptance criteria. This note records
no case model, product dimensions, measured coefficients, prices, usage assumptions or rankings.

## Status and relationship to current work

The reference main revision is `68556e9`. It checks supplied finite behavior/resource models,
searches stateless component alternatives on fixed wiring, discovers bounded typed assemblies
from supplied catalogues, and solves declared maintenance models separately. Catalogue entries
can already carry concrete behavior, resource modes and costs; the installed general catalogue
contains abstract primitives rather than a calibrated physical component library.

The current worktree adds coupled backward residual filtering, propagation over component
choices and request-local exact boundary memoization to fixed-wiring synthesis. See
[search implementation and bounds](synthesis-search.md). These changes reduce repeated work
over declared alternatives. They do not add an objective, physical parameter generators,
automatic lifecycle composition or a calibrated physical catalogue. The symbolic tactic-based
summary work remains a prototype rather than an integrated runtime feature.

| Requirement | Existing foundation | Remaining implementation |
|---|---|---|
| Lifetime objectives | Declared costs, budgets, lifecycle gains and occupation-measure theorems | Compare one complete architecture/size/policy witness under a stated usage profile and horizon |
| Sizes as variables | Finite alternatives with coupled behavior/resource declarations | Parameter domains and generators deriving geometry, behavior, costs and state-transition/service models together |
| Physical assemblies and placement | Typed multi-input/shared topology discovery; concrete component schema | Calibrated domain entries, allowed physical regions, path order, geometry and packaging constraints |
| Composable physics | Quantity/SI typing, effect chains, relational composition | Executable constitutive models with applicability envelopes, bounds, parameter dependencies and evidence |
| Physical sanity constraints | Type/dimension checks, finite adequacy and structural energy checks | Numeric inequalities and validated bounds tied to operating conditions, loading, geometry and safety requirements |
| Principles to candidate implementations | Principle lookup and explicit checked transformations | Reviewed mappings to typed generative templates with parameters, guards and provenance |

This design develops E1/E2/E3/E6 and the scaling workstreams. Prioritization and status live
only in [the roadmap](FUTURE-PLANS.md#system-evolution-and-operating-boundaries).

## One coupled decision object

Search over `(architecture d, sizes θ, maintenance policy π)`. Declare the operating profile,
initial state distribution, time horizon, clock, costs and their units. A finite-horizon
objective can take the form

```
build_cost(d, θ)
  + E[sum over actions started before H of
        energy_cost + service_cost + replacement_cost + downtime_cost]
```

The components of that sum require explicit accounting conventions, including actions that
cross the horizon and any terminal value. A long-run average rate multiplied by a lifetime is
an approximation unless its transient, initial-state and time-normalization assumptions are
established. The existing scalar average-cost lifecycle solver is a foundation, not an exact
finite-lifetime objective evaluator.

Hard requirements remain predicates on the same witness: performance, operating coverage,
resource budgets, geometry, availability and any declared safety constraints. Different usage
profiles are external scenarios. A controller cannot select a more favorable external profile
or combine one design's performance with another design's service costs.

Preserve the multidimensional property vector alongside any explicitly monetized lifetime
objective. Retain nondominated alternatives where objectives conflict. Bounds and optimality
claims must state the finite parameter grid, topology library, policy class and usage scope.

## Stage 1: requirements and objective semantics

Add an explicit requirement-satisfaction mode alongside exact target preservation. Reuse
acceptable value/level predicates and required operating inputs. Under this mode:

- Every required input has at least one consistent outcome.
- Every possible outcome at that input meets the declared guarantees.
- Output correlations are retained; improvement directions are declared per property.

The current residual compiler encodes `R = T`: safety forbids outputs outside `T`, while
coverage requires every pair in `T`. Requirement satisfaction needs different coverage:
one admissible outcome per required input, rather than realization of every acceptable output.
Expanding `T` with better outputs while retaining exact coverage is not this feature.

First compare supplied complete design/size/policy witnesses with one objective definition.
Then place the policy solve inside the bounded outer design search. State/action models,
costs and occupancy must come from the same instantiated design and profile.

## Stage 2: parameterized components and lifecycle generation

Each physical component generator should declare:

- Parameter domains, units and any discrete structural choices.
- One joint relation or validated numerical model linking inputs and outputs.
- Geometry, usable space, path/pressure/resource effects and construction costs.
- Loading, degradation, service actions, service durations and replacement consequences.
- A versioned operating envelope, coefficient uncertainty and supporting evidence.

Instantiate a finite size grid first. Produce behavior and lifecycle declarations from a
shared parameter assignment; independent hand-edited behavior and service-rate tables can
become inconsistent. A size increase can consume packaging space while changing state
capacity, performance, power and service frequency simultaneously.

Model accumulated load through the system. Upstream capture/removal changes downstream load;
capture efficiency, retained capacity, release/re-entrainment and cleaning consequences are
separate functions. None can be inferred from a technology name or a single nominal
efficiency. State abstractions must retain the dependencies relevant to performance and cost.

Start with explicit uniform time steps. Variable operation and service durations require
elapsed-time accounting, such as a scoped semi-Markov extension. Availability is then uptime
divided by elapsed time, not automatically occupancy per decision epoch. Specify what state
and operating conditions the controller observes.

## Stage 3: calibrated physics, placement and candidate generators

Add a small physical library whose entries can be executed and checked. Quantity typing and
dimension consistency are necessary; constitutive laws, sufficient magnitude and empirical
coefficients are additional obligations. Each law needs an operating envelope and an explicit
way to handle uncertainty or refuse unsupported conditions.

Use cheap physical inequalities and geometry bounds before expensive lifecycle evaluation.
Distinguish gross and usable area/volume, collecting surfaces and total wetted surfaces,
steady and transient operating conditions, and a local velocity from a whole-device flow.
Material or surface properties do not establish service duration, drying time or safe reuse
of a complete assembly.

Begin placement with a finite set of allowed physical regions and path orderings. Typed wiring
can represent alternate interconnections, while port compatibility alone does not establish
that a component fits, is accessible, or has a suitable local operating environment. An
additive volume budget is only a packaging screen, not a shape/packing proof.

Principles should select reviewed generators or rewrite templates. Each template returns
typed component choices, parameter domains, preconditions and evidence obligations. Its
origin is a discovery hint; its benefit and physical feasibility require the same validation
as any other candidate. An absent physical model remains an explicit modelling/evidence gap.

## Where tactics and the new search reductions fit

The [symbolic-summary design](symbolic-summary-design.md) specifies the proposed recognizer,
exact composition, boundary-class search and dependency/bound checks behind this sequence.

1. Normalize recognized component expressions with proved composition laws and keep exact
   boundary summaries. Check a library entry's full declared semantics before attaching a
   primitive law; its name or tag is insufficient.
2. Derive interval or monotone bounds over parameter regions. Reject a region when even its
   best admissible performance fails, or when a certified cost lower bound exceeds an incumbent.
   Correlations and all theorem preconditions remain explicit.
3. Compile residual safety and the correct coverage obligations, then propagate component
   choices. Retain resource and parameter distinctions when behavioral summaries coincide.
4. Solve lifecycle policies only for surviving instantiations. Memoize policy solves with
   keys including the instantiated transition/cost model, durations, profile, initial state,
   horizon, objective and model/evidence versions. A behavior-cache key is insufficient here.
5. Check the complete witness and any generated certificate against the request-bound model.

Tactics can establish reusable algebraic rules, arithmetic pruning bounds and checker
soundness. They do not establish unmeasured coefficients, physical capacity, calibration or
applicability. Generic arbitrary finite models still need a bounded fallback.

## Calibration and decision-sensitive evidence

Bind each model to source/test provenance, units, parameter ranges and a version. Keep
nominal estimates distinct from conservative bounds and measured data. Validate calibrated
functions on held-out operating conditions and return unknown outside supported envelopes.

Report sensitivity or overlapping cost ranges when uncertainty can change the winner.
Choose new measurements by whether they distinguish competing complete designs: retained
capacity, loading-dependent performance, pressure/power, service time and byproduct emissions
may be independent decision drivers. A correction to one coefficient or geometry declaration
must trigger dependent sizing, lifecycle and ranking recomputation and invalidate stale caches.

## Acceptance and performance gates

- A superior deterministic output satisfies a lower-bound requirement; an inadmissible
  nondeterministic outcome or blocked required input does not.
- Two supplied designs exchange lifetime-cost order as the explicit horizon/profile changes.
  Every reported total reconciles to one design and its policy.
- A capacity choice trades construction/space cost against service frequency. Exhaustive
  finite-grid comparison and optimized search return the same feasible optima/frontier.
- A component that consumes usable packaging space changes the jointly selected sizes of
  the other components; it is not evaluated as an independent service-cost surcharge.
- A corrected calibration changes dependent transitions/costs and invalidates cached results.
  Unsupported physical conditions remain unknown.
- An invalid placement fails an explicit geometry/operating guard. A principle-derived
  candidate cannot bypass the normal engineering checks.
- Record generated size/topology candidates, physics evaluations, lifecycle solves, full
  validations, cache hits, bound/proof-check work and elapsed time. Compare each optimization
  against exhaustive bounded references; do not present synthetic results as physical validation.

Search caps remain explicit. The current 50-entry result display limit is separate from
enumeration work; result filtering/pagination and continuation remain useful delivery work.
They do not supply the objective, missing physical data or additional search completeness.
