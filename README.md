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
`.claude/skills/`, `.agents/skills/`, or a `$SKILLS_DIR` your harness reads:

```bash
git clone https://github.com/sv/triz-skill.git
ln -s "$PWD/triz-skill/skills/triz-innovation" ~/.claude/skills/triz-innovation
```

The skill works standalone. The MCP server is what removes recall from the loop.

## Run the MCP server

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
| `triz_resolve` | Retrieve a cell and expand its parameters and principles |
| `triz_tool_catalog` | List the 34 routed TRIZ tools, optionally by stage |
| `triz_route` | Select candidate tools by stage and observed problem signals |
| `triz_evals` | Return the neutral lookup and reasoning evaluation suites |
| `triz_graph` | Optional: analyse a project's OTSM Network of Problems (see below) |
| `triz_purpose` | Optional: inspect the invariant and purpose gate of one graph node |

## Optional: your own network of problems

`triz_graph` and `triz_purpose` reason over a *project* contradiction graph — they ship with no
data. The graph is an OTSM Network of Problems with a DIKWP purpose layer:

- nodes are open contradictions; edges are `couples`, `blocks`, or `dissolves`;
- the **core conflict** is the node with the most outgoing `dissolves` edges — resolving it removes
  the most others (the Theory-of-Constraints step);
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

## Data provenance and licensing

- The 39 parameters, 40 principles, and the 34-tool catalog are classical TRIZ vocabulary.
- `matrix.json` was imported from a machine-readable workbook. The underlying table is Altshuller's
  and widely republished. To regenerate the file from a source of your own choosing:

  ```bash
  npx tsx scripts/import-matrix.mjs <url|file.csv|file.json> [--format csv|json]
  ```

- Published case benchmarks are concise attributed paraphrases of CC BY publications; sources,
  authors, and pages are recorded per case in `published-case-evals.json`.
- The code in this repository is MIT licensed (`LICENSE`). That license covers the code and the
  original prose, not third-party data noted above.
