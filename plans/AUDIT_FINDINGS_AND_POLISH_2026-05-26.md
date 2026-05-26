# Audit Findings & Polish Plan — dkg-claude-code-memory

**Date:** 2026-05-26
**Author:** Selon (Claude Code TUI)
**Status:** PLANNING — execute next session. This is an audit + plan only; nothing here was implemented.
**Basis:** Full E2E read of `src/`, `tests/`, `docs/`, `REGISTRY_ENTRY.json`, `server.ts` MCP schemas, CI workflows, and `npm pack` output, cross-checked against the actual code as source of truth.

---

## 0. Health snapshot (verified this audit)

| Signal | State |
|---|---|
| `npm run build` | ✅ 0 TS errors (strict mode) |
| `npm test` | ✅ 513 passing / 17 files |
| `npm run test:coverage` | ✅ 99.67% stmts, 96.38% branches |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| CI (`ci.yml` build+test+audit) | ✅ green on `main` (actions on @v5) |
| `npm pack --dry-run` | ✅ ships only `dist/`, `README.md`, `LICENSE` |
| Docs accuracy (README + 4 docs) | ✅ corrected last session; DESIGN_BRIEF has all §8 sections (Forward Path, Maintenance, Case Study) |
| TODO/FIXME/`as any`/`@ts-ignore` in src | ✅ none |

The build, tests, CI, and prose docs are in good shape. The remaining work is **functional bugs in two tools, misleading tool descriptions, dead code that contradicts the real implementation, and unverified live behavior** — plus the human-only submission steps.

The prior plan `FLAGSHIP_PLAN_2026-05-26.md` is essentially **done** (tools 9–10 added, CI added, doc accuracy fixed, registry mostly rewritten). This document supersedes it for what remains.

---

## P0 — Functional bugs (advertised features that don't work)

These are the most important. Each is a feature we market that does not behave as documented. A judge running the tools against a live node would catch them.

### P0-1 — `query_shared_memory` queries the wrong artifact shape (returns nothing for our own data)
**File:** `src/tools/query-shared-memory.ts:35-59`
**Problem:** The SPARQL requires `?s dkg:ual ?ual` and filters `dkg:type IN (schema:DigitalDocument, schema:CreativeWork, schema:Article)` inside `GRAPH ?g {}`. But everything `capture_research_finding` writes (`src/core/serializers.ts:47-116`) is typed `wm:WorkingMemoryArtifact` with `wm:artifactType`, `schema:name`, `schema:text`, and `wm:ual` (note: **`wm:ual`, not `dkg:ual`**), and emits **no** `dkg:type` and **no** `schema:description`. So the required triple pattern never matches an artifact this server produced ⇒ `query_shared_memory` returns 0 results for anything captured or promoted here.
**Decision needed (pick one):**
- **(A, recommended)** Rewrite the query to match the real shape: `?id a wm:WorkingMemoryArtifact ; wm:artifactType ?type ; schema:name ?name ; schema:text ?text ; wm:status ?status` with a `CONTAINS` keyword filter over `?name`/`?text`, scoped to `config.contextGraph`. Mirror `search.ts`. Keep it a keyword search but make it actually return promoted artifacts.
- **(B)** Make it genuinely execute a user-supplied read-only SPARQL `SELECT` (validate it starts with `SELECT/ASK`, reject `INSERT/DELETE/LOAD/DROP`, pass through `querySparql`). More powerful, matches the current "custom SPARQL" description, but needs careful injection/read-only handling.
**Acceptance:** A unit test that feeds the real `serializeToQuads` output shape and asserts the tool returns the row. Whatever option is chosen, the server.ts + REGISTRY descriptions (see P1-1) must match it.

### P0-2 — `promote_to_shared_memory` promotes the whole assertion, not the named artifact
**Files:** `src/tools/promote.ts:59-62`, `src/core/dkg-client.ts:243-248`
**Problem:** `handlePromote(artifactId, …)` calls `promoteAssertion(contextGraph, assertionName)` which POSTs `/api/assertion/{name}/promote` — it promotes the **entire** named assertion. The `artifactId` argument is never used to scope the promotion (it's only read by the inert guard in P0-3). So "promote this one finding" actually shares every artifact in the assertion.
**Decision needed:** Either (a) document/accept assertion-level promotion honestly (rename/redescribe the tool and its docs to "promote the working-memory assertion to Shared Memory"), or (b) implement artifact-scoped promotion if the DKG v10 API supports per-asset SHARE. Confirm what `/api/assertion/{name}/promote` actually does against a live node before deciding.
**Acceptance:** Tool behavior and description agree; a test documents the chosen semantics.

### P0-3 — Confidential-promotion guard is inert in production
**File:** `src/tools/promote.ts:45-57`
**Problem:** The `sensitivity === 'confidential'` block only runs `if (typeof extClient.getArtifact === 'function')`. The base `DkgClient` (`src/core/dkg-client.ts`) has **no** `getArtifact` method (only tests inject one). So in real use the guard is skipped and confidential artifacts **can** be promoted — yet `README.md` ("Never eligible for promotion"), `REGISTRY_ENTRY.json` ("Blocks confidential artifacts"), and the capture tool schema all promise it blocks them.
**Fix:** Implement a real lookup before promotion — add a lightweight `getArtifactSensitivity(artifactId)` (SPARQL `SELECT ?accessMode WHERE { <id> schema:accessMode ?accessMode }`, reusing the pattern in `retrieve.ts`/`get-claim-review.ts`) and call it unconditionally in `handlePromote`. Then the existing tests stay green and the guard actually fires.
**Acceptance:** With the base client, promoting a `confidential` artifact returns `{success:false}` and never calls `promoteAssertion`. Add an integration-style unit test that does NOT inject `getArtifact`.

---

## P1 — Correctness / accuracy (misleading, but not crashing)

### P1-1 — `query_shared_memory` is described as "custom SPARQL" but is a keyword search
**Files:** `src/server.ts:172-184` (tool description + `query: 'SPARQL query to execute'`), `src/server.ts:231-235` (system-prompt bullet "Query with custom SPARQL patterns"), `REGISTRY_ENTRY.json` (`query_shared_memory` description: "Execute custom SPARQL queries…").
**Problem:** Implementation does `CONTAINS` keyword matching, not raw SPARQL. The agent will be told it can pass SPARQL and will pass SPARQL that gets escaped into a literal. Must be reconciled with whatever P0-1 decides.
**Fix:** Align all three descriptions to the chosen behavior (keyword search, or genuine read-only SPARQL).

### P1-2 — `REGISTRY_ENTRY.json` env default wrong: `DKG_WM_CONTEXT_GRAPH`
**File:** `REGISTRY_ENTRY.json` (install.env.DKG_WM_CONTEXT_GRAPH description "default: working-memory").
**Problem:** Real default is `ccm-research` (`src/config.ts:13`). Same `working-memory` vs `ccm-research` bug that was fixed in the docs last session — still present here.
**Fix:** Change to `ccm-research`.

### P1-3 — `REGISTRY_ENTRY.json` minor inaccuracies
**File:** `REGISTRY_ENTRY.json`.
- `synthesize_session` / `get_session_summary` descriptions say "status breakdown" — actual output has **type** counts only (`typeCounts`), no status breakdown (`src/tools/synthesize.ts`, `src/tools/session-summary.ts:56-69`). Drop "status breakdown".
- `networkEgress[0].protocol: "https"` — default `DKG_DAEMON_URL` is `http://127.0.0.1:9200` (http). Say "http/https (configurable)".
- `DKG_WM_AGENT_ID` description claims "prov:wasAttributedTo quads" — the serializer emits `wm:agent` / `wm:framework`, not `prov:wasAttributedTo` (`src/core/serializers.ts:70-73`). Reword.
- `writeAuthority` says writes go "to the OriginTrail DKG v10 blockchain … reversible: false" — Working Memory writes are not chain-anchored (that's Verified Memory, Round 2). Soften to "writes to the DKG node's Working/Shared Memory layers".

### P1-4 — `get_node_status` doesn't use the node's status endpoint
**File:** `src/tools/get-node-status.ts:34-37`
**Problem:** Does a raw `fetch(nodeUrl)` GET on the base URL and calls any HTTP response "online". `DkgClient.getStatus()` (`src/core/dkg-client.ts:268`) already exists and hits the real status endpoint.
**Fix (low effort):** Call `deps.client.getStatus()` (or the node's documented health path) so "online" means the DKG API actually answered, not just that the port is open. Keep the latency measurement.

---

## P2 — Code quality / dead code (Flagship-review liability)

### P2-1 — `src/types/mcp.ts` is ~90% dead code, and the dead parts contradict the real implementation
**File:** `src/types/mcp.ts` (only `McpConfig` is imported anywhere — verified by grep across `src/` and `tests/`).
**Dead, and WRONG, exports that a source reviewer will see:**
- `MCP_DEFAULTS` → `daemonUrl: 'http://localhost:8080'`, `contextGraph: 'default-context'`, `redactionEnabled: false` — all wrong vs `src/config.ts`.
- `MCP_ENV_VARS` → `DKG_CONTEXT_GRAPH`, `DKG_STATE_DIR`, `DKG_AUTHOR_ID`, … — wrong names (real ones are `DKG_WM_*`).
- `ArtifactStatuses` → `{DRAFT, NEEDS_SOURCES, VALIDATED, ARCHIVED, DELETED}` — directly contradicts the real 7 statuses in `src/types/artifact.ts` (no `archived`/`deleted`).
- `ArtifactTypes` / `ArtifactSources` → conflate the 14 artifact types with the 5 sources.
- `loadMcpConfigFromEnv`, `validateMcpConfig`, `mergeMcpConfig`, `isMcpConfig`, `MigrationGuide`, `MigrationNotes`, `MigrationGuideDoc`, `MigrationChange`, `CaptureErrorCodes`, `LogLevels`, `MCP_CONFIG_SCHEMA`, `MCP_TYPES_VERSION`, `MCP_TYPES_BUILD` — all unused.
**Fix:** Reduce `src/types/mcp.ts` to just the `McpConfig` interface (the only thing imported). Delete the rest. Re-run build + tests (should stay green since nothing imports them). This removes self-contradicting landmines and tightens the file from ~510 lines to ~30.
**Acceptance:** `grep -rn "from '.*types/mcp" src/` shows only `McpConfig` imports; build + 513 tests still pass.

### P2-2 — Orphan root-level `types/mcp.ts` tracked in git
**File:** `types/mcp.ts` (repo root — a re-export shim pointing at `../src/types/mcp.js` with `Legacy*` aliases).
**Problem:** It's outside `tsconfig.json`'s `include: ["src/**/*"]`, so it's never compiled, never imported, never shipped. It's pure confusion and references `Legacy*` symbols. Likely a leftover from an earlier refactor.
**Fix:** `git rm types/mcp.ts` (and remove the empty `types/` dir). Confirm nothing references the root path.

### P2-3 — Leftover build artifact in working tree
**File:** `dkg-claude-code-memory-1.0.0.tgz` (present locally, now gitignored via `*.tgz`).
**Fix:** Delete it (`rm`/`trash`). Housekeeping only.

---

## P3 — Verification & live behavior (do before recording the demo)

### P3-1 — The real DKG HTTP path has never been exercised
**Problem:** All 513 unit tests mock `DkgClient`, so the **real** API contract is unverified: endpoint paths (`/api/assertion/...`, `/api/...query`), payload/quad serialization the node actually accepts, the SPARQL dialect the node runs, and what `promote` actually does (see P0-2). `tests/live-integration.test.ts` is correctly gated on `DKG_INTEGRATION_TEST=1` (`describe.skipIf`) but presumably has never run against a node.
**Action:** Stand up / point at a real DKG v10 node (`127.0.0.1:9200` + `~/.dkg/auth.token`) and run `DKG_INTEGRATION_TEST=1 npm run test:live`. Fix whatever the real node rejects. This is the gate that surfaces P0-1/P0-2 for real.

### P3-2 — Submission deliverables (human / drMurlly actions — not codeable here)
- [ ] `npm publish --provenance` via the `v*` tag workflow (`publish.yml`) once `NPM_TOKEN` secret is set.
- [ ] `git tag v1.0.0 && git push --tags` to trigger the publish workflow.
- [ ] Record the 3–5 min demo walkthrough following `docs/DEMO_SCRIPT.md` (bounty requires a recorded video, not screenshots) — only after P0/P1 fixes so the tool outputs match the script.
- [ ] Open PR against `OriginTrail/dkg-integrations` with label `cfi-dkgv10-r1`; fill `REGISTRY_ENTRY.json` commit/demo fields.

---

## P4 — Housekeeping (low priority)

- **P4-1** Archive superseded plans to reduce confusion: `plans/PHASE1_SETUP.md`…`PHASE7_SUBMIT.md` (original build, done) and `plans/FLAGSHIP_PLAN_2026-05-25.md` + `FLAGSHIP_PLAN_2026-05-26.md` (executed). Move to `plans/archive/` or delete. Keep this file + `DESIGN_BRIEF.md`.
- **P4-2** Consider a top-level `CHANGELOG.md` (semver releases were promised in the Maintenance Commitment section).

---

## Recommended execution order (next session)

1. **P0-3** (confidential guard) — small, restores an advertised security feature, no API unknowns.
2. **P0-1** (`query_shared_memory` shape) — pick option A, mirror `search.ts`; add a test on the real quad shape.
3. **P1-1 / P1-2 / P1-3** (descriptions + registry) — fast, mechanical, do alongside P0-1.
4. **P2-1 / P2-2 / P2-3** (delete dead code + orphan file + tgz) — fast, big code-quality win; rebuild+retest.
5. **P1-4** (`get_node_status` → `getStatus()`) — small.
6. **P0-2** (promote semantics) — needs the live node (P3-1) to confirm API behavior; do during/after P3-1.
7. **P3-1** (live integration run) — gates the demo; surfaces anything the mocks hid.
8. **P3-2 / P4** — submission + housekeeping once green against a real node.

**Delegation note:** P0-1, P0-3, P1-*, P2-* are well-scoped coding tasks suitable for Brevin (each has exact file:line + acceptance criteria above). P0-2 and P3-1 need a live DKG node and a judgment call — keep those with Selon/drMurlly. After any code change, the bar is unchanged: `npm run build` + `npm test` (≥513) + `npm run test:coverage` (>95%) + `npm audit` all green, then CI green on push.

## Definition of done for this round
- [ ] `query_shared_memory` returns real promoted artifacts (test proves it) and its description matches behavior everywhere (server.ts + registry).
- [ ] Confidential artifacts are actually blocked from promotion with the base client (test proves it).
- [ ] `promote_to_shared_memory` semantics confirmed against a live node and documented honestly.
- [ ] `src/types/mcp.ts` trimmed to `McpConfig`; orphan root `types/mcp.ts` removed; build + 513 tests green.
- [ ] `REGISTRY_ENTRY.json` env defaults and tool descriptions match the code.
- [ ] `DKG_INTEGRATION_TEST=1 npm run test:live` passes against a real node.
- [ ] Demo recorded, package published with provenance, PR opened with `cfi-dkgv10-r1`.
