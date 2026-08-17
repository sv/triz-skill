# Publishing and distribution runbook

This repo ships two artifacts with different channels and gating: the **triz-mcp npm package**
(the MCP server plus the skill files) and the **triz-innovation skill** (distributed through
skill registries and harness skill dirs). The MCP Registry entry references the npm package, so
npm comes first.

## Prerequisites (one-time)

- Confirm the matrix data provenance note in README "Data provenance and licensing" still reads
  correctly before each release. The table is Altshuller's and widely republished; regenerate
  from a source of your choosing with `npx tsx scripts/import-matrix.mjs <url|file> [--format csv|json]`.
- npm account with an access token stored as the `NPM_TOKEN` repo secret.
- Check the `triz` name is free on npm; rename the package to `triz-mcp` (or another choice)
  if not — `registry/triz.json` must be updated to match.

## 1. npm (public registry, primary)

`package.json` is already publish-ready: `dist` bin with `#!/usr/bin/env node` shebang,
`files` whitelist (`dist`, `skills`, `docs`, meta), `engines`, repository metadata,
`prepublishOnly` gate (build + typecheck + tests + MCP handshake smoke).

Release flow:

```bash
# 1. land changes on main, update CHANGELOG.md
# 2. tag
git tag v0.2.0 && git push origin v0.2.0
# 3. the Release workflow verifies (version==tag, typecheck, build, tests, smoke) and publishes
#    with --provenance, then creates the GitHub release
```

Manual fallback: `npm publish --provenance --access public` after running the same gates
locally (`pnpm build && pnpm typecheck && pnpm test && node scripts/smoke-mcp.mjs dist/server.js`).

Consumers then get the one-liner: `npx -y triz-mcp`.

Why not GitHub Packages (`npm.pkg.github.com`) as primary: it exists and hosts npm packages,
but it requires authentication even to *install* public packages — fine for org-internal
distribution, wrong for a public CLI. Re-verify this constraint before relying on it; GitHub has
discussed relaxing it.

## 2. MCP Registry (official, github.com/modelcontextprotocol/registry)

`registry/triz.json` is the prepared entry (npm stdio package, env vars, all nine tools,
repository, MIT license). Submit after the npm package is live:

1. Fork [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry).
2. Copy `registry/triz.json` to `data/servers/triz.json` in the fork; set the package
   `version` to the released npm version exactly.
3. Open a PR; registry CI validates against the server schema. Check the `triz` name is
   available there too — fall back to `triz-mcp` if taken.
4. After merge the server is listed and installable through registry-aware MCP clients.

The schema evolves; if validation fails, diff against the
[schema](https://github.com/modelcontextprotocol/registry/blob/main/schema/server.schema.json)
and other entries under `data/servers/`.

## 3. Other MCP directories (low effort, broadens discovery)

- **Smithery** — `smithery.yaml` manifest included; submit at smithery.ai. Verify the manifest
  format against current docs first (flagged inline).
- **Glama.ai** and **PulseMCP** — submit-the-form directories; reuse the README description and
  the `npx -y triz-mcp` install line.

## 4. Skill registries and harness dirs

The skill lives at `skills/triz-innovation/` (frontmatter now carries `license: MIT` and a
`metadata` block, which registries expect; the SKILL.md references the `triz` MCP server —
skill and server reinforce each other).

- **skills.sh (Vercel registry)** — after the frontmatter license is in place, submit the repo;
  install becomes `npx skills add sv/triz-skill`.
- **anthropics/skills** — PR the skill directory into the curated repo once polished; strong
  credibility signal.
- **OpenAI** — `skills/triz-innovation/agents/openai.yaml` already describes the interface;
  submit through OpenAI's skills channel when open.
- **Manual install** — copy or symlink `skills/triz-innovation/` into the harness skill dir:
  `.claude/skills/`, `.agents/skills/`, `.codex/skills/`, or a `$SKILLS_DIR` your harness reads.
- **npm side-channel** — the npm package ships `skills/`, so server consumers always get the
  skill files too.

## 5. Promotion

- Run `pnpm evals -- --suite no-recall --limit 40` with a key and publish the table:
  from-memory citation accuracy vs. the fail-closed server (0 fabrication by construction).
  That number is the product pitch.
- Record a short demo of an agent solving one published MATRIZ case with skill + server.
- Audiences: Show HN, r/TRIZ, LinkedIn TRIZ circles, MCP Discord / awesome-mcp-servers, and —
  since the eval corpus is built from their CC BY proceedings — a TRIZ Review article or
  TRIZfest talk proposal.

## Order of operations

1. matrix license resolved → 2. npm publish → 3. MCP Registry PR → 4. Smithery / Glama /
PulseMCP → 5. skills.sh + anthropics/skills + OpenAI → 6. benchmark numbers + demo.
