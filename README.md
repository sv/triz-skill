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
| `triz_separate` | Decide whether a physical contradiction separates over space, time, condition, direction, or system level; optionally index it by one axis (Principle 15 along time) |
| `triz_transform` | Apply one typed move — segment, take out, interpose (Principles 1, 2, 24), an applied trim, or a rewrite; fails closed |
| `triz_nine_windows` | System-operator views: subsystem restriction, system, supersystem collapse, per time; transitions between times as checked `triz_transform` sequences |
| `triz_export` | Export a model that type-checks as Graphviz DOT or an open hypergraph |
| `triz_behavior` | Compose declared box behaviour into the input→deliverable relation (steady states, relational trace); with `trim`, decide whether the trim preserves it |
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

- Segmentation, Taking out, and Intermediary, each matched to its principle text;
- an applied trim;
- a raw rewrite.

When boxes declare behaviour (finite carrier `values` and relation rows), `triz_behavior`
decides a trim instead of only screening it: `preserved`, `changed` with a counterexample input,
or `undecided` (boxes that need behaviour, or no steady state in either model). The semantics
is steady state; it says nothing about dynamics.

`triz_nine_windows` builds system-operator views, and `triz_export` draws a model or encodes it
as an open hypergraph. Given `compare_to`, `triz_function_model` also reports whether the two
models share a wiring shape. Each verdict names in `basis` the theorem in `theory/` it relies
on; a test checks that every cited name is a theorem there. The structured verdicts of the
checks are label-blind: renaming ids or
changing the domain does not change them. Property tests check this, with the exclusions listed
in categorical-model.md. That shows the kernel reads only the wiring shape, not that solutions
transfer between domains.
[categorical-model.md](skills/triz-innovation/references/categorical-model.md) states exactly
what is and is not claimed. `examples/function-models/` holds a physical, a business, and two
software models. One software model has the physical model's wiring shape. A copy of the
physical model declares box behaviour, so its trim can be decided.

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
  trace is monotone and yanks a swap to the identity.

`theory/Witnesses.lean` checks that none of the typing, restriction, rewrite, or
behaviour-monotonicity lemmas is vacuous. For each, a concrete diagram or relation meets all its
hypotheses, and a counterexample shows each hypothesis is needed.

It also states trimming as a left Kan extension. No theorem links that statement to the
kernel, and nothing decides it. `triz_behavior` decides a finite relational question instead,
which is not proved equivalent.

```bash
pnpm schema                       # regenerate the JSON Schema from src/act.ts
cd theory && lake exe cache get && lake build --wfail
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
