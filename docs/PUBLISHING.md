# Publishing and distribution runbook

This repo ships two artifacts with different channels and gating: the **triz-mcp npm package**
(the MCP server plus the skill files) and the **triz-innovation skill** (distributed through
skill registries and harness skill dirs). The MCP Registry entry references the npm package, so
npm comes first.

## Prerequisites (one-time)

- npm account: run `npm login` locally (needed for the manual path) or store an access token as
  the `NPM_TOKEN` repo secret (needed for the Release workflow path). GitHub Actions billing
  must be active for the workflow path.
- The npm name `triz-mcp` is verified free; if you ever rename it, update `server.json`
  (`packages[0].identifier`) to match.
- `package.json` carries `mcpName: "io.github.sv/triz"` — the ownership marker the MCP Registry
  verifies inside the published package. It must match `server.json`'s `name` exactly, and
  the `io.github.<github-username>/` prefix must match the account that authenticates to the
  registry.

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

## 2. MCP Registry (registry.modelcontextprotocol.io)

The registry moved from PRs to an official CLI. The prepared entry is [`server.json`](../server.json)
at the repo root — current format: reverse-DNS name `io.github.sv/triz`, camelCase fields,
`transport` as an object, no tool list (the registry discovers tools at runtime).

Publish after the npm package is live (the registry reads `mcpName` from the published
package.json to verify ownership):

```bash
# one-time: install the CLI (or brew install mcp-publisher)
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher

mcp-publisher login github   # device flow: open https://github.com/login/device, enter the code
mcp-publisher publish        # reads ./server.json
```

Verify: `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.sv/triz"`.

Keep `server.json` version fields in lockstep with `package.json` on every release. If
validation fails, the current schema lives at the `$schema` URL in `server.json`.

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

1. npm publish → 2. MCP Registry (`mcp-publisher publish`) → 3. Smithery / Glama /
PulseMCP → 4. skills.sh + anthropics/skills + OpenAI → 5. benchmark numbers + demo.
