# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`dkg-claude-code-memory` is an MCP server that gives Claude Code agents persistent, verifiable Working Memory on OriginTrail DKG v10. It is a **bounty submission** for the DKG v10 Round 1 integrations program (target: Flagship tier, 8,000–10,000 TRAC). The server exposes 10 tools over MCP stdio transport and writes knowledge artifacts to a DKG v10 node via its HTTP API.

## Build & test commands

```bash
npm install
npm run build           # TypeScript compile → dist/
npm test                # Vitest unit + integration (no DKG node needed)
npm run test:coverage   # Same with v8 coverage report

# Live integration (requires DKG node at 127.0.0.1:9200 and ~/.dkg/auth.token):
DKG_INTEGRATION_TEST=1 npm run test:live

# Smoke-test the compiled server:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | DKG_AUTH_TOKEN=test node dist/index.js

# Single test file:
npx vitest run tests/unit/tools/capture.test.ts
```

**No postinstall/preinstall scripts allowed** — the bounty CI fails submissions that have them.

## Architecture

```
src/
├── index.ts              CLI entry point (shebang, calls startServer)
├── server.ts             MCP server: registers all 10 tools + prompts handler
├── config.ts             Reads McpConfig from env vars; loads auth token from
│                         DKG_AUTH_TOKEN or ~/.dkg/auth.token
├── types/
│   ├── artifact.ts       ArtifactType union (14 types), ARTIFACT_TYPES/STATUSES arrays
│   └── mcp.ts            McpConfig, all tool parameter interfaces (CaptureParams, etc.)
├── core/
│   ├── dkg-client.ts     HTTP client for DKG v10 node API (ported from dkg-openclaw-working-memory)
│   ├── dedupe-store.ts   JSON-file-backed content-hash deduplication
│   ├── serializers.ts    RDF quad + JSON-LD serialization; SPARQL query builder
│   ├── redactor.ts       Secret/credential redaction before DKG write
│   ├── normalizer.ts     Orchestrates redaction → provenance → type inference
│   ├── status-classifier.ts  Classifies artifact status from content signals
│   └── provenance-builder.ts SHA-256 content hash, URN generation, sub-agent fields
└── tools/
    ├── types.ts           ToolDeps interface (client, dedupeStore, config) + ToolResult
    ├── capture.ts         Tool 1: normalize → serialize → DKG write
    ├── search.ts          Tool 2: SPARQL keyword/type/status/sessionId search
    ├── retrieve.ts        Tool 3: fetch full artifact by UAL or URN
    ├── update-status.ts   Tool 4: update artifact status quad
    ├── promote.ts         Tool 5: Curator-gated promote to Shared Memory (confirm=true guard)
    ├── synthesize.ts      Tool 6: aggregate session artifacts into knowledge_synthesis
    ├── session-summary.ts Tool 7: list artifacts for a session with type counts
    ├── query-shared-memory.ts Tool 8: custom SPARQL queries against Shared Memory
    ├── get-claim-review.ts   Tool 9: ClaimReview JSON-LD via toClaimReview() for Oracle integration
    └── get-node-status.ts    Tool 10: DKG node health check and latency measurement
```

The `server.ts` generates a per-process `SESSION_ID` (`ccm-<uuid8>`) that is injected as the default `sessionId` on every tool call, linking all artifacts from one Claude Code session.

## Key design constraints

**SPARQL injection prevention** — every user-supplied string interpolated into SPARQL must go through `sparqlEscape()` in `serializers.ts`. Status/type values are enum-validated before interpolation.

**promote_to_shared_memory security guard** — `confirm` must be `true` or the tool returns an error without calling the DKG. This is intentional per v10 design principles (conversational consensus, no autonomous team sharing).

**No monorepo imports** — the bounty explicitly bans importing from `@origintrail-official/dkg-*` internal packages. Use the DKG HTTP API only.

**McpConfig vs PluginConfig** — core modules were ported from `dkg-openclaw-working-memory`. That project uses `PluginConfig`; this project uses `McpConfig` with flat fields (`minContentLength`, `redactionEnabled`, `dedupeEnabled`). When porting code, always translate these field paths.

**agentFramework is always `"claude-code"`** — hardcoded in `provenance-builder.ts`.

## DKG v10 vocabulary (use exactly)

`Context Graph`, `Integration`, `Curator`, `Entity`, `Knowledge Asset`, `Knowledge Collection`, `SHARE`, `PUBLISH`, `Working Memory`, `Shared Memory`. Deviations need justification in the design brief.

## Config (env vars)

| Var | Default |
|---|---|
| `DKG_AUTH_TOKEN` | required (or `~/.dkg/auth.token`) |
| `DKG_DAEMON_URL` | `http://127.0.0.1:9200` |
| `DKG_WM_CONTEXT_GRAPH` | `ccm-research` |
| `DKG_WM_ASSERTION_NAME` | `artifacts` |
| `DKG_CCM_STATE_DIR` | `~/.dkg/ccm-state` |
| `DKG_WM_AUTHOR_ID` | `unknown` |
| `DKG_WM_AGENT_ID` | `claude-code-agent` |
| `DKG_WM_MIN_LENGTH` | `80` |
| `DKG_WM_REDACTION` | `true` (set to `false` to disable) |
| `DKG_WM_DEDUPE` | `true` (set to `false` to disable) |

## Test architecture

Unit tests mock `DkgWmClient` and `DedupeStore` via `vi.fn()`. Shared fixtures live in `tests/unit/helpers.ts` (`makeMockClient`, `makeMockDedupeStore`, `testConfig`). Live integration tests are gated on `DKG_INTEGRATION_TEST=1` and skipped otherwise. Coverage target is >95% overall.

## Submission context

- GitHub: `drMurlly/dkg-claude-code-memory`
- Registry: PR against `OriginTrail/dkg-integrations`, tag `cfi-dkgv10-r1`
- npm publish requires `--provenance` (via GitHub Actions on `v*` tags)
- Design brief: `docs/DESIGN_BRIEF.md`; demo: recorded walkthrough required (screenshots not sufficient)
