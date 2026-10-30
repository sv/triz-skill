# Importing local models

The local stdio server and the `triz` command line expose `triz_import_source` and
`triz_review_import` (for example `triz call triz_import_source args.json`). The public hosted
endpoint does not register these tools. Importers consume supplied text: they do not fetch URLs,
resolve external files, run source code, load Julia checkpoints, or call API endpoints.

Build the CLI with `pnpm build`, then run:

```sh
node dist/import-source.js --format bom-csv ./parts.csv
node dist/import-source.js --format openapi-json ./openapi.json
node dist/import-source.js --format modelingtoolkit-json ./system.json
node dist/import-source.js --help
```

The CLI reads one regular UTF-8 file, at most 1,000,000 bytes. Each importer has bounded item and
review counts; oversized inputs fail with a diagnostic rather than a partial accepted model.
The MCP equivalent is `{format, source: {id, text}}`. `id` is a source label, not a path to open.

## Supported inputs

| Format | Drafted information | Limits |
|---|---|---|
| `bom-csv`, `bom-json` | Components and explicit parent/child containment | No interactions invented from containment |
| `openapi-json` | OpenAPI 3.0/3.1 operations, client and payload references | JSON only; local references; no inferred interservice calls |
| `modelingtoolkit-json` | Unknowns, parameters, equations, observed equations, symbolic references and explicit subsystem paths from an instantiated system | Versioned TRIZ interchange; no runnable dynamics or TRIZ ratings |
| `agents-json` | Currently observed agent types, counts and field names | Structural snapshot; no step rules, schedules or inferred interactions |
| `quint`, `lean` | Partial declaration outlines and syntactic references | No compiler, proof or behavior extraction |
| `julia` | Partial ModelingToolkit-style source outline, including explicit `ODESystem` declarations | Static fallback; branches, reassignments and helpers can remain unresolved; no imperative Agents behavior extraction |

BOM CSV columns are `id,name,parent_id` (`parent_id` optional). JSON accepts an array of items or
`{"items": [...]}` with the same fields. Parents must exist, and containment must be acyclic
with at most one parent per child. OpenAPI YAML can first be converted to JSON using a trusted
local parser; provenance then points to the converted JSON, not original YAML line numbers.

## Drafts and review

The result contains a B1 `draft` table, a structurally built `model`, and diagnostics. Source
locations are one-based `line` numbers for text/CSV, or RFC 6901 `pointer`s for JSON. Proposed
roles, carriers, actions and polarities are pending review; a placeholder `useful` rating is not
an analyst finding. Unsupported constructs also become pending assumptions.

The model embeds `provenance` with component, interaction and containment sources and every
pending review item. B1 retains these fields. Extracting `result.model` and dropping the response
envelope leaves it a draft: analysis and export return `draft-model`. Containment is source
metadata, not automatically a nested `inner` interface or a physical function.

Inspect the table and diagnostics, correct proposed meanings, then supply one explicit decision
for each pending id to `triz_review_import`:

```json
{"model": "<edited draft model>", "decisions": [
  {"id": "<pending item id>", "decision": "confirm", "note": "<basis for this judgment>"}
]}
```

The tool rejects incomplete, duplicate or extra decisions and invalid source mappings. The
returned model is `reviewed` and retains locations. This records an analyst assertion, not proof
of the imported source, physical truth, executable behavior, or causal meaning. Provenance is
ordinary model data, not a cryptographic attestation against intentional deletion or fabrication.

A reviewed model works with every analysis and transformation tool. A transformation, rule
application or nine-windows view keeps the sources and containment links of the boxes and wires
that survive and drops those of removed ones; elements it adds stay unsourced, since no source is
invented. A reviewed model's provenance may therefore cover only part of the model, but it must
not name a box or wire the model no longer has. A draft must source every element.

An additional importer implements `Importer = {format, parse(source)}` from `src/act-import.ts`.
It returns a bounded `DraftTable` and diagnostics. Register it in `src/act-import-registry.ts` to
make it available to the local tool and CLI. Keep ambiguous meanings pending rather than silently
promoting extracted text to a confirmed model.

## Julia: export the constructed model

FLOP's macro simulator constructs a ModelingToolkit `ODESystem`; its micro simulator uses
Agents.jl with imperative stepping functions. The preferred input is metadata from the actual
constructed object for a named profile. This accounts for construction-time branches that a
source outline cannot resolve. It still cannot recover symbols eliminated by simplification.

Agents.jl supports data/checkpoint I/O, but checkpoints omit functions, including stepping and
scheduling functions. They do not supply a complete behavior model for this importer.
See the [Agents I/O API](https://juliadynamics.github.io/Agents.jl/stable/api/#Save,-Load,-Checkpoints).
ModelingToolkit exposes symbolic system metadata through its
[system API](https://docs.sciml.ai/ModelingToolkit/v10.14/API/System/). The helper below exports that
metadata as **TRIZ-specific JSON version 1**; this is not a universal Julia model standard or an
FMU/SBML export.

In the trusted Julia process where `sys` is already instantiated:

```julia
include("/path/to/triz-skill/scripts/export-julia-model.jl")
metadata = export_modelingtoolkit(sys; model_id="my-system", profile_id="nominal")
open("system.json", "w") do io
    write_triz_json(io, metadata)
end
```

For an already instantiated Agents model:

```julia
using Agents
metadata = export_agents_snapshot(model; model_id="my-agents",
    profile_id="initial-seed-42", allagents=Agents.allagents)
open("agents.json", "w") do io
    write_triz_json(io, metadata)
end
```

The helper uses ModelingToolkit and therefore requires it in the caller's Julia environment,
including when exporting an Agents snapshot. It does not install packages, include model files,
solve equations or step agents. The caller is responsible for trusted model construction and
profile selection. No checkpoint is deserialized by the TypeScript importer.

`triz-modelingtoolkit` JSON contains `version`, `model_id`, `profile_id`, `unknowns`, `parameters`,
`equations`, `observed`, `subsystems` and `diagnostics`. Each equation has `lhs`, `rhs`, `lhs_refs`
and `rhs_refs`; references come from symbolic expression traversal, not a regular expression over
printed equations. Subsystems contain explicit relative `path` arrays. Symbol ownership is not
guessed from names. Unresolved references stay diagnostics. Every reference occurrence retains
its JSON pointer, including a symbol that occurs on both equation sides.

`triz-agents-snapshot` JSON contains `version`, `model_id`, `profile_id`, `agent_types` and
`diagnostics`. Each observed type has `name`, positive `count` and unique `fields`. It exports no
individual agent values or execution rules. Both schemas are strict and versioned in
`src/act-import-julia-export.ts`.

Synthetic runtime checks can be run in a Julia environment with ModelingToolkit and Agents:

```sh
julia --project=/path/to/julia-env tests/fixtures/julia/synthetic-export.jl
julia --project=/path/to/julia-env tests/fixtures/julia/synthetic-agents-export.jl
```

Real project integration checks should keep sources, exports and reports outside this repository.
Only synthetic models are committed as fixtures.
