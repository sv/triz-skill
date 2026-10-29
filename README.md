# triz-skill

An agent skill that applies TRIZ to real problems — products, services, processes, organizations,
markets, and technical systems — plus a deterministic MCP server so the agent can only cite
principles and matrix cells it has **looked up**, never ones it recalled.

Two parts, usable separately:

| Part | Path | What it is |
|---|---|---|
| `triz-innovation` skill | `skills/triz-innovation/` | `SKILL.md`, references, and the canonical JSON knowledge base |
| `triz` MCP server | `src/` | Read-only stdio MCP server over the same JSON |

## Why

An LLM asked for "the TRIZ principles for this contradiction" will produce plausible principle
numbers from memory. The matrix is a lookup table, not a reasoning step, so recall is the wrong
mechanism for it — and a wrong cell silently poisons everything downstream. This repo makes the
lookup deterministic and **fail-closed**: a blank or diagonal cell returns `covered: false` with a
pointer to the canonical reference, never a guess.

The skill itself is method, not vocabulary: frame → diagnose → model → synthesize → substantiate,
with the matrix used only where both sides of a contradiction credibly map to engineering
parameters.

## Install the skill

Copy or symlink `skills/triz-innovation/` into wherever your agent loads skills from — e.g.
`.claude/skills/`, `.agents/skills/`, `.codex/skills/`, or a `$SKILLS_DIR` your harness reads:

```bash
git clone https://github.com/sv/triz-skill.git
ln -s "$PWD/triz-skill/skills/triz-innovation" ~/.claude/skills/triz-innovation
```

Once the repo is listed on [skills.sh](https://skills.sh) the shorthand becomes
`npx skills add sv/triz-skill`.

The skill works standalone. The MCP server is what removes recall from the loop.

## Run the MCP server

Published package (preferred once released):

```bash
npx -y triz-mcp     # stdio server, no checkout needed
```

From a checkout:

```bash
pnpm install
pnpm start          # stdio server
pnpm test           # deterministic lookup regressions
pnpm typecheck
```

Register it (`.mcp.json` in this repo is a working example):

```json
{
  "mcpServers": {
    "triz": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/triz-skill/src/server.ts"],
      "env": { "TRIZ_DATA_DIR": "/path/to/triz-skill/skills/triz-innovation/data" }
    }
  }
}
```

`TRIZ_DATA_DIR` is only needed when the server runs outside this repo's layout; otherwise the data
dir is resolved relative to the repo root and the server fails closed with a clear message if it is
missing.

### Tools

| Tool | Purpose |
|---|---|
| `triz_parameter` | Get one of the 39 engineering parameters; omit `id` to list all |
| `triz_principle` | Get one of the 40 inventive principles; omit `id` to list all |
| `triz_matrix` | Retrieve a canonical contradiction-matrix cell; blank cells fail closed |
| `triz_matrix_multi` | Every (improving × worsening) cell for multi-parameter conflicts, aggregated by recommendation frequency |
| `triz_resolve` | Retrieve a cell and expand its parameters and principles |
| `triz_tool_catalog` | List the routed TRIZ tool catalog, optionally by stage; entries name the MCP tools (`mcp_tools`) that carry out their method |
| `triz_effects` | Search the curated effects database by required function or category |
| `triz_route` | Select candidate tools by stage and observed problem signals |
| `triz_evals` | Return the neutral lookup and reasoning evaluation suites |
| `triz_function_model` | Type-check a TRIZ function model (typed wiring diagram); harm loops, ideality per dimension, separation, baseline comparison with an isomorphism check |
| `triz_trim` | Screen trimming by MATRIZ rules A/B/C; carrier-typed absorbers and trimming problems |
| `triz_separate` | Decide whether a physical contradiction separates over space, time, condition, direction, or system level; optionally index it by one axis (Principle 15 along time); each separated pair gets suggested operations that could build the separation (hints, not verdicts) |
| `triz_transform` | Apply one typed move — a construction for one of 13 principles, an applied trim, or a rewrite; fails closed |
| `triz_rule_apply` | Double-pushout rewriting with rules as data: list a rule's matches, apply one; built-in evolution-line rules (mono → bi, self-adjusting feedback) |
| `triz_nine_windows` | System-operator views: subsystem restriction, system, supersystem collapse, per time; transitions between times as checked `triz_transform` sequences |
| `triz_export` | Export a model that type-checks as Graphviz DOT, an open hypergraph, or a Lean certificate of its verdicts |
| `triz_behavior` | Compose declared box behaviour into the input→deliverable relation (steady states, relational trace); with `compare_to` (and `box_map`), decide whether a concept such as a transform result preserves it; `trim` is shorthand |
| `triz_weakness` | Rank modelled concepts by the situations they admit, by inclusion, with incomparable pairs; counts second |
| `triz_dynamics` | Bounded runs of boxes with declared state (nondeterministic Mealy machines): escalation into an unsafe set with a shortest trace, invariance of a safe set, separation in time along one run; loops classified as bistable, trapped (inside the unsafe set), recurrent (meets it but can recover), or oscillating |
| `triz_feasibility` | Monotone co-design (Censi 2015): minimal resource vectors from declared box feasibility, by Kleene's ascent to the least fixpoint; with `trim`, decide whether the remaining boxes provide what the trim leaves them within budget, and the absorber's added resources |
| `triz_graph` | Optional: analyse a project's OTSM Network of Problems (see below) |
| `triz_purpose` | Optional: inspect the invariant, purpose gate, and separation check of one graph node |

## Function models as typed data

`triz_function_model`, `triz_trim`, and `triz_separate` run deterministic checks over a function
model written as an open wiring diagram, defined by
[`function-model.schema.json`](skills/triz-innovation/schemas/function-model.schema.json):

- boxes are components with typed ports;
- wires are functions rated useful, insufficient, excessive, or harmful;
- carriers name what flows and in what unit.

Any dangling, mis-directed, or mistyped wire fails closed. The checks cover:

- harm loops;
- trimming by rules A/B/C;
- ideality compared per dimension and never summed;
- physical-contradiction separation as a gluing problem.

Every loop and absorber they return is a hypothesis to substantiate. `triz_transform` applies
typed moves. Each returns a model that type-checks, or fails closed:

- constructions for the 13 principles whose looked-up text describes a structural move, such
  as Segmentation, Merging, Inversion, Feedback, and Intermediary; categorical-model.md
  classifies all 40 and says why the others are parametric or analogies;
- an applied trim;
- a raw rewrite.

`triz_rule_apply` takes a rule as data, a span L ← K → R of patterns
([`rule.schema.json`](skills/triz-innovation/schemas/rule.schema.json)). It lists the rule's
matches in a model, then applies one by double pushout after checking the no-identification and
no-dangling conditions. Two built-in rules encode evolution lines whose text describes a
structural move: mono → bi, and self-adjusting feedback.

When boxes declare behaviour (finite carrier `values` and relation rows), `triz_behavior`
decides a concept against a baseline instead of only screening it: `preserved`, `changed` with
a counterexample input, or `undecided` (boxes that need behaviour, or no steady state in either
model). The concept can be a trim or any `triz_transform` result; a segment's `boxMap` maps its
parts back. Segmentation gives each part its projection of the box's relation when that relation
is the product of the projections, and Intermediary's mediator can declare an identity relation.
The semantics is steady state; it says nothing about dynamics. With `weakest_spec`, it gives the
weakest specification for the one box without behaviour, such as an absorber: every row that
keeps the relation inside the target. The verdict is `spec` when that specification also covers
the target, and `impossible` when no behaviour of the box can. When the box declares the rows it
can physically produce (`producible`), the specification is cut down to them, and a target only
unproducible rows reach is `impossible` with reason `infeasible`, naming those rows. `triz_weakness` ranks modelled
concepts by the situations they admit (references/weakness.md).

When boxes declare feasibility (minimal rows of levels provided against levels required and
operating cost), `triz_feasibility` finds the minimal resource vectors by Kleene's ascent to the
least fixpoint, loops included, and judges them against the budget: `feasible`, `infeasible`
(over budget with the binding dimension, or a level no row provides), or `undecided`. With
`trim`, it decides whether the remaining boxes provide what the trim leaves them within budget,
and reports each absorber's added resources. No polynomial bound is claimed; past its caps the
call fails closed.

When boxes declare state (`state`, `initial`, and `transition` rows), `triz_dynamics` explores
every run up to a horizon. It decides whether a harm loop escalates into an unsafe set, with a
shortest trace, and whether a safe set is invariant. It also decides whether one run meets
time-separated demands within their windows. It classifies the loops' long-run behaviour as
bistable, trapped (a closed component inside the unsafe set), recurrent (one that meets it and
can recover), or oscillating. Only finite, discrete dynamics are covered.

`triz_nine_windows` builds system-operator views, and `triz_export` draws a model or encodes it
as an open hypergraph. Given `compare_to`, `triz_function_model` also reports whether the two
models share a wiring shape. Each verdict names in `basis` the theorem in `theory/` it relies
on; a test checks that every cited name is a theorem there. Typing, harm-loop witness, and
separation verdicts can also be certified per instance: `triz_export` format `lean` (or
`triz_separate` with `certificate: true`) writes a Lean file that states them about the model
and proves them, and `node scripts/certify.mjs` checks it with local Lean or, failing that, the
AXLE service. Nothing is extracted from Lean. The structured verdicts of the
checks are label-blind: renaming ids or
changing the domain does not change them. Property tests check this, with the exclusions listed
in categorical-model.md. That shows the kernel reads only the wiring shape, not that solutions
transfer between domains.
[categorical-model.md](skills/triz-innovation/references/categorical-model.md) states exactly
what is and is not claimed. `examples/function-models/` holds a physical, a business, and two
software models. One software model has the physical model's wiring shape. Three copies of
the physical model declare box behaviour, box feasibility, and a shaft temperature, so their
trims can be decided and their heat loop's escalation classified.

`theory/` is a Lean 4 / Mathlib package that states and proves the facts the checks rely on,
with no `sorry`:

- gluing iff every cell is satisfiable;
- an edge in a strongly connected region lies on a cycle;
- the componentwise order is not total;
- typing survives relabelling, deletion under the no-dangling condition, gluing, and
  re-attachment to a same-carrier port;
- restriction composes, and makes typed diagrams a presheaf on the poset of box sets;
- restriction commutes with every rewrite step restricted to the subsystem, so the subsystem
  and system rows of the 9 windows, with two steps, form a functor from time × (box sets)ᵒᵖ to
  sets;
- series composition of relations (Mathlib's `Relation.Comp`) is monotone, and the relational
  trace is monotone and yanks a swap to the identity;
- a relation is the product of its projections iff it is a product at all, for two parts and
  for any family of parts, and for two parts iff it is a rectangle: rows (a, b) and (c, d) give
  the row (a, d);
- series composition and the trace preserve unions, so for one unknown box the rows that keep a
  composite inside a target form the weakest specification (a Galois connection), and the target
  is reachable iff that specification's composite covers it; within the rows the box can
  produce, iff the specification cut down to them covers it, and a relation that reaches the
  target holds, for each target pair, a row of the specification that delivers it;
- concepts are ordered by inclusion of the situations they admit, and a strict inclusion gives a
  strictly larger count;
- reachability within n steps is an existential over traces, a counterexample trace is sound, a
  layer that adds nothing completes the reachable set, reachability is monotone in the
  transition rows, a closed set holds every run that enters it, from a closed set inside the
  unsafe set every reachable state is unsafe, and without a fixed point every return takes two
  steps or more;
- series, parallel, and feedback composition keep feasibility monotone, Kleene's ascent reaches
  the least fixpoint of a finite lattice, and the co-design fixpoint is the upward closure of the
  feasible configurations.

Verdicts cite only the statements they use exactly; categorical-model.md marks the others as
never cited, and why.

`theory/Witnesses.lean` checks that none of the typing, restriction, rewrite,
behaviour-monotonicity, residual, weakness, co-design, or dynamics lemmas is vacuous. For each, a
concrete diagram, relation, or step relation meets all its hypotheses, and a counterexample shows
each hypothesis is needed.

Trimming is decided only for models that declare behaviour, by `triz_behavior`'s finite
relational check, and its verdict depends on the absorber chosen. `theory/` does not state
trimming as a Kan extension; categorical-model.md says why.

```bash
pnpm schema                       # regenerate the JSON Schema from src/act.ts
(cd theory && lake exe cache get && lake build --wfail)
node scripts/certify.mjs --local --tamper theory/Certificates/*.lean   # tampered copies must fail
```

## Optional: your own network of problems

`triz_graph` and `triz_purpose` reason over a *project* contradiction graph — they ship with no
data. The graph is an OTSM Network of Problems with a DIKWP purpose layer:

- nodes are open contradictions; edges are `couples`, `blocks`, or `dissolves`;
- the **core conflict** is the node with the most outgoing `dissolves` edges — resolving it removes
  the most others (the Theory-of-Constraints step);
- a node may carry a `contradiction` in the function-model schema's PhysicalContradiction form.
  `triz_graph` checks it and reports `irreducible`, `separable`, `no-contradiction`, or
  `invalid`; an invalid one fails closed for that node only, with its errors.
  - Ties on `dissolves` go first to irreducible nodes, then to unmodelled or invalid nodes, then
    to separable nodes, and last to nodes that are not contradictions.
  - `dissolves` stays the primary key. A node that already separates keeps its place but is
    flagged, because separation already gives it a resolution route;
- each node's `purpose` names the invariant it serves, and counts as **secured** only when a
  `verified_by` record exists on the node or on a linked registry entry. No verifier, no gate — it
  fails closed.

`examples/problem-graph.json` and `examples/triz-registry.json` show the expected shape:

```bash
TRIZ_GRAPH=examples/problem-graph.json \
TRIZ_REGISTRY=examples/triz-registry.json \
npx tsx scripts/graph-report.mjs report.md
```

Point `TRIZ_GRAPH` / `TRIZ_REGISTRY` at your own files, or place them at `data/problem-graph.json`
and `data/triz-registry.json`.

## Evaluations

`skills/triz-innovation/data/` carries three suites:

- `evals.json` — hard lookup assertions (run by `pnpm test`) plus synthetic reasoning cases;
- `published-case-evals.json` — six problems reconstructed from CC BY MATRIZ publications. Solver
  prompts contain only pre-solution facts; reported diagnoses and outcomes stay in judge-only
  fields and are never returned by `triz_evals`.

Scoring does not require reproducing the published solution — a causally stronger, testable
alternative earns full credit.

### Running the suites (bring your own key)

The suites ship as data; nothing calls an LLM by default. `scripts/run-evals.mjs` runs them
against any OpenAI-compatible endpoint and is **fail-closed on a key** — without
`TRIZ_EVAL_API_KEY` (or `OPENAI_API_KEY`) it exits before any network call. CI exercises it in
`--dry-run` mode only, which is offline and keyless. Results land in `evals/results/` (gitignored)
as JSON plus a markdown report:

```bash
pnpm evals -- --suite no-recall --limit 40        # matrix-recall citation benchmark
pnpm evals -- --suite reasoning                   # synthetic cross-domain cases, LLM judge
pnpm evals -- --suite published --variant solver  # blinded MATRIZ cases, structured variant
pnpm evals -- --dry-run --suite published         # plan a run: no key, no network
```

`TRIZ_EVAL_BASE_URL` and `TRIZ_EVAL_MODEL` select the endpoint and model (any
OpenAI-compatible API). `no-recall` is the benchmark that justifies the server: a model asked
for matrix cells from memory is scored against the canonical table, and fabricated citations are
counted. With the server in the loop, the same citations are lookups — fabrication is zero by
construction.

## Data provenance and licensing

- The 39 parameters, 40 principles, and the core tool catalog are classical TRIZ vocabulary;
  the effects starter database (56 entries) is curated from textbook physics, chemistry, and
  geometry.
- `matrix.json` was imported from a machine-readable workbook. The underlying table is Altshuller's
  and widely republished. To regenerate the file from a source of your own choosing:

  ```bash
  npx tsx scripts/import-matrix.mjs <url|file.csv|file.json> [--format csv|json]
  ```

- Published case benchmarks are concise attributed paraphrases of CC BY publications; sources,
  authors, and pages are recorded per case in `published-case-evals.json`.
- The code in this repository is MIT licensed (`LICENSE`). That license covers the code and the
  original prose, not third-party data noted above.


## Publishing and distribution

The full runbook — npm release flow, the MCP Registry PR, Smithery/Glama/PulseMCP, skill
registries (skills.sh, anthropics/skills, OpenAI), and promotion — lives in
[docs/PUBLISHING.md](docs/PUBLISHING.md).

## Registries

**MCP Registry.** [`server.json`](server.json) holds the prepared entry (name
`io.github.sv/triz`) for the official registry at
[registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io). Listing goes
through the official `mcp-publisher` CLI — not a PR: publish the npm package first (the registry
verifies the `mcpName` field inside the published package.json), then
`mcp-publisher login github` (device flow) and `mcp-publisher publish`. Full steps in
[docs/PUBLISHING.md](docs/PUBLISHING.md).

**npm.** Publish to the public npm registry (`npm publish`) so `npx -y triz-mcp` works without a
checkout. GitHub Packages also hosts npm packages (`npm.pkg.github.com`), but it requires
authentication even to install public packages, so it suits private or org-internal distribution
— not a public CLI.
