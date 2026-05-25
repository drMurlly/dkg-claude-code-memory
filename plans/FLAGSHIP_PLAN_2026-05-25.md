# Flagship Plan — dkg-claude-code-memory
## Goal: 10,000 TRAC — Top of Flagship Tier

**Date:** 2026-05-25  
**Author:** Selon (orchestrator)  
**Target:** OriginTrail DKG v10 Round 1 — Phase 1 bounty, Flagship tier (8K–10K TRAC)

---

## 0. Current State — Honest Assessment

### What's Done (Phases 1–5 complete)

| Phase | Status | Notes |
|---|---|---|
| Phase 1: Setup | ✅ COMPLETE | package.json, tsconfig, CI/CD skeleton |
| Phase 2: Core modules | ✅ COMPLETE | dkg-client, normalizer, serializers, redactor, dedupe-store, status-classifier, provenance-builder |
| Phase 3: All 7 tools | ✅ COMPLETE (with bugs — see §2) | capture, search, retrieve, update-status, promote, synthesize, session-summary |
| Phase 4: Server | ✅ COMPLETE | MCP stdio server wired, all tools registered |
| Phase 5a: Core unit tests | ✅ COMPLETE | 246 tests across 6 core modules |
| Phase 5b: Tool unit tests | ✅ COMPLETE (fixed 2026-05-25) | 85 tests, 7 tool files; vitest `fileParallelism: false` fix |
| Phase 5c: Integration tests | ✅ COMPLETE | 16 integration tests + 13 live tests (gated DKG_INTEGRATION_TEST=1) |
| **TOTAL tests** | **451 passing** | 99.66% statement coverage, 95.35% branch coverage |
| Phase 6: Documentation | ❌ EMPTY | docs/ directory has zero files — **BLOCKING for submission** |
| Phase 7: Submit | ❌ NOT STARTED | npm unpublished, no registry entry, no PR |

### Why We Beat PR #3 (dkg-wm-bridge by jalopy1)

PR #3 is the current strongest flagship candidate. It has excellent engineering quality (147 tests, zero deps, 26-pattern security scanner, build provenance). **Our MCP-native architecture is its single largest gap:**

| Criterion | dkg-wm-bridge (PR #3) | dkg-claude-code-memory (ours) |
|---|---|---|
| Interface | CLI subprocess | **MCP stdio server — native** |
| Claude Code integration | Manual operator invocation | **Native tool calls, zero operator action** |
| Cursor / Claude Desktop | Not supported | **Supported (any MCP client)** |
| Real first user | None named | **drMurlly's active bug bounty workflow** |
| Install kind | `exec` | **`mcp`** — discoverable by DKG integration registry |
| Agent autonomy | Operator must run CLI | **Agent autonomously calls tools per session** |
| Test count | 147 | **451** |
| Content search | `--format json` | 7 dedicated tools |

**We are Level 1 already superior to PR #3 on the dimensions that matter most (MCP interface, adoption surface, credible first user, test count).** This plan gets us to Level 2 — the tier that earns first-party documentation consideration.

---

## 1. Critical Bugs to Fix BEFORE Documentation/Submission

These are functional correctness issues that would fail a code review or live demo.

### Bug 1: `capture.ts` bypasses `core/normalizer.ts` (dead code)
**Location:** `src/tools/capture.ts` lines ~30–90  
**Problem:** The normalizer module (`core/normalizer.ts`) is fully implemented and tested (54 tests), but `capture.ts` reimplements normalization inline with a different artifact ID scheme:
- **Normalizer:** `urn:dkg:wm:{first-16-chars-of-sha256-of-content}` — deterministic, content-addressable
- **Capture.ts:** `urn:artifact:{random-hash-from-timestamp+random}` — non-deterministic, collision-prone

This breaks the fundamental content-addressable URN scheme documented everywhere and makes deduplication partially ineffective (same content gets a different ID every call).  
**Fix:** Replace the inline normalization in `capture.ts` with a call to `normalizeArtifact()` from `core/normalizer.ts`. Delete the duplicated logic.  
**File:** `src/tools/capture.ts` — estimated 40 lines changed.

### Bug 2: Tool name mismatch — `retrieve_artifact` vs `get_artifact_content`
**Location:** `src/server.ts` (registers `retrieve_artifact`) vs README.md, plans, design brief (document `get_artifact_content`)  
**Problem:** README describes `get_artifact_content` but the server exposes `retrieve_artifact`. Any user following the README or design brief gets `tool not found`.  
**Fix:** Standardize on `retrieve_artifact` everywhere (server already uses it; update README, design brief). Do NOT rename the server registration — MCP clients may already use `retrieve_artifact`.  
**Files:** `README.md`, `docs/DESIGN_BRIEF.md` (when written).

### Bug 3: Keyword search only matches on title (`schema:name`), not content (`schema:text`)
**Location:** `src/tools/search.ts` — the SPARQL FILTER for keyword  
**Problem:** `search_working_memory` with a keyword only matches artifact titles. A user searching for "reentrancy" in their captured vulnerability analysis won't find it unless they titled the artifact "reentrancy".  
**Fix:** Expand the SPARQL FILTER to match on BOTH `schema:name` and `schema:text` (artifact body). Use `CONTAINS(LCASE(?name), ...) || CONTAINS(LCASE(?text), ...)` pattern.  
**File:** `src/tools/search.ts` — estimated 15 lines changed. Update tests in `tests/unit/tools/search.test.ts`.

### Bug 4: Empty-string quads for undefined sub-agent fields
**Location:** `src/core/serializers.ts`  
**Problem:** `serializeToQuads()` always writes `wm:subAgentId`, `wm:parentTaskId`, `wm:agentRole` quads even when the values are undefined/empty. This pollutes every normal capture artifact with three empty-literal triples: `<urn:dkg:wm:xyz> wm:subAgentId ""`.  
**Fix:** Wrap each sub-agent quad in a guard: `if (prov.subAgentId) { quads.push(...) }`.  
**File:** `src/core/serializers.ts` — estimated 10 lines changed.

### Bug 5: `SynthesizeParams` missing `title` field
**Location:** `src/tools/types.ts` — `SynthesizeParams` interface  
**Problem:** The plan spec'd a `title` parameter for custom synthesis names, but the interface only has `sessionId`. The synthesize tool hardcodes a generated title.  
**Fix:** Add optional `title?: string` to `SynthesizeParams` and thread it through `handleSynthesize` → `handleCapture`.  
**File:** `src/tools/types.ts` (1 line), `src/tools/synthesize.ts` (~3 lines).

### Bug 6: `types/mcp.ts` dead code with inconsistent interfaces
**Location:** `src/types/mcp.ts`  
**Problem:** Contains a second set of tool param interfaces (`PromoteParams` with `targetContextGraph`, `SynthesizeParams` with `artifactIds[]`) that are inconsistent with the real interfaces in `src/tools/types.ts`. These are NOT imported at runtime but confuse any developer reading the codebase. `PromoteParams.targetContextGraph` doesn't exist in the tool; `SynthesizeParams.artifactIds[]` was superseded by `sessionId`.  
**Fix:** Delete the duplicate interfaces from `src/types/mcp.ts` or move the McpConfig and shared types to a clean re-export. The `tools/types.ts` file is canonical.  
**File:** `src/types/mcp.ts` — prune ~40 lines of dead interfaces.

### Bug 7: License mismatch — MIT in package.json, Apache-2.0 in source/plans
**Location:** `package.json` → `"license": "MIT"`  
**Fix:** Change to `"license": "Apache-2.0"`. The `LICENSE` file at root should be Apache-2.0 text.  
**File:** `package.json` (1 line).

### Bug 8: package.json missing `engines`, `files`, `exports` fields
**Location:** `package.json`  
**Problem:** Missing `"engines": { "node": ">=22.0.0" }`, `"files": ["dist/**", "README.md", "LICENSE"]`, and `"exports"` map. Without `files`, npm pack includes test files and source in the published package (wrong). Without `exports`, the package has no explicit entry-point contract.  
**Fix:** Add all three fields.  
**File:** `package.json` — estimated 15 lines added.

---

## 2. Feature Enhancements — Level 2 Differentiators

These go beyond bug fixes and make us categorically better than any current submission.

### Enhancement A: `derived_from` linking in capture tool (CRITICAL for flagship)
**What:** Add optional `derivedFrom?: string[]` (array of UALs) to `CaptureParams`. When provided, serialize additional `prov:wasDerivedFrom` quads linking the new artifact to its sources.  
**Why:** Enables the multi-agent collaboration provenance chain (Agent A writes finding → Agent B cites it via `derivedFrom` → SPARQL trace shows full lineage). This is the primary differentiator vs PR #3 and The Triad (#15) and directly addresses Scoring Criterion 1 (LLM-Wiki vision) and 4 (oracle readiness via PROV-O graph).  
**Files:** `src/tools/types.ts`, `src/tools/capture.ts`, `src/core/serializers.ts` (~30 lines), tests.

### Enhancement B: `query_shared_memory` tool — 8th tool
**What:** A new tool that searches across SHARED Memory (not just the agent's Working Memory). Uses `contextGraphId = "shared-memory"` or the node's global context. Returns artifacts from all agents that have been promoted.  
**Why:** Makes multi-agent collaboration visible. An agent can ask "what has any other agent found about protocol X?" rather than only seeing its own session.  
**Files:** `src/tools/query-shared.ts` (new, ~80 lines), `src/server.ts` (register new tool), `src/tools/types.ts` (new params interface), tests.

### Enhancement C: Cross-session lineage query
**What:** Extend `search_working_memory` with a `derivedFromId?: string` parameter — returns all artifacts that cite a specific UAL via `prov:wasDerivedFrom`. Enables "show me everything built on top of this finding."  
**Files:** `src/tools/search.ts` (~20 lines added), tests.

### Enhancement D: Sensitivity classification + promotion guard
**What:** Add a `sensitivity` field to `ArtifactRecord` (values: `'internal' | 'team' | 'public'`). Default: `'internal'`. The `promote_to_shared_memory` tool refuses to promote `'internal'` artifacts without an explicit `overrideSensitivity: true` flag.  
**Why:** PR #3's biggest demonstrated feature is its sensitivity-based promotion guard. We need at least parity, ideally we match their concept but integrate it better into the 7-status workflow.  
**Files:** `src/types/artifact.ts`, `src/tools/promote.ts`, `src/core/normalizer.ts` (~25 lines), tests.

### Enhancement E: Oracle-readiness `toClaimReview()` serializer
**What:** Add a method to `serializers.ts` that converts any ArtifactRecord into a `schema:ClaimReview`-compliant JSON-LD document. This is used to demonstrate forward-compatibility with context oracles.  
**Why:** Scoring Criterion 4 (forward-compatibility with Verified Memory and context oracles) is explicitly the second-highest weighted criterion. PR #3 asserts oracle readiness; we demonstrate it with actual code.  
**Files:** `src/core/serializers.ts` (~40 lines), `docs/ORACLE_READINESS.md` (schema mapping doc), tests.

---

## 3. Documentation — Phase 6 (BLOCKING for submission)

The `docs/` directory is completely empty. **The `DESIGN_BRIEF.md` is a mandatory submission document** — no brief = no PR review. This is the single highest priority item.

### 3a. `docs/DESIGN_BRIEF.md` (BLOCKING — write first)
The plan file `plans/PHASE6_DOCS.md` already contains the full template text. It needs:
- Section 3: Memory Layers table (fill in rows for WM, SWM, and planned VM)
- Section 4: Why DKG v10 (not just any database) — content-addressable UALs, Curator model, GossipSub replication, oracle path
- Section 5: Architecture diagram (ASCII or Mermaid)
- Section 6: Security model (network egress=localhost only, credential handling=env var, write authority=bearer token per agent)
- Section 7: Maintenance commitment (named maintainer=@drMurlly, 6-month support window)
- Section 8: Verified Memory forward path (how our UALs, PROV-O quads, and ClaimReview serializer position artifacts for VM promotion)
- Section 9: Multi-agent workflow (sub-agent attribution via `wm:subAgentId`, cross-agent `prov:wasDerivedFrom` chains)
- Section 10: Contributor attestation (sign-off block)

**This document must be 1–3 pages.** Every section in the bounty spec §8 must be present.

### 3b. `docs/DEMO_SCRIPT.md` (needed before recording)
Step-by-step recording script. 3–5 minute video showing:
1. Claude Code session starts, agent calls `capture_research_finding` with a vulnerability note
2. Second capture with `derived_from` pointing to first artifact's UAL
3. `search_working_memory` with keyword = "reentrancy" — finds both artifacts
4. `synthesize_session` — produces knowledge synthesis, writes it back
5. New Claude Code session starts (DIFFERENT SESSION_ID) — shows prior artifacts persist
6. `promote_to_shared_memory` — artifact promoted
7. `query_shared_memory` (new tool) — confirms promoted artifact visible
8. SPARQL terminal view: show the actual RDF quads on the node

### 3c. `docs/ORACLE_READINESS.md`
Schema mapping: our `ArtifactRecord` fields → `schema:ClaimReview` fields. 1-page document demonstrating concretely that oracle consumption of our promoted artifacts is possible without a schema migration.

### 3d. `docs/MULTI_AGENT_GUIDE.md`
Shows two Claude Code sessions collaborating:
- Session 1 (Elix persona): captures 3 findings during a security audit, synthesizes them
- Session 2 (Selon persona): reads from Session 1's working memory via `search_working_memory`, creates a new artifact with `derived_from` pointing to Session 1's synthesis
- SPARQL provenance trace showing the full cross-agent lineage

### 3e. README updates
- Fix tool name: `retrieve_artifact` (not `get_artifact_content`)
- Add `query_shared_memory` to the tool table
- Add the `derived_from` parameter to capture examples
- Add multi-agent example in the Quick Start section
- Badge: test count (451 tests passing)

---

## 4. Submission Pipeline — Phase 7

### 4a. Pre-publish checklist
```bash
npm test                    # 451/451 must pass
npm audit --production      # 0 vulnerabilities
npm run build               # 0 TypeScript errors
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js  # 8 tools listed
```

### 4b. Publish with SLSA provenance
The GitHub Actions `publish.yml` already exists. Steps:
1. Create a GitHub repo: `drMurlly/dkg-claude-code-memory`
2. Push code: `git remote add origin ... && git push -u origin main`
3. Tag: `git tag v1.0.0 && git push origin v1.0.0`
4. GitHub Actions runs automatically and publishes to npm with build provenance
5. Verify: `npm info dkg-claude-code-memory` shows `"dist.integrity"` field

### 4c. `REGISTRY_ENTRY.json`
```json
{
  "slug": "claude-code-memory",
  "name": "Claude Code Research Memory",
  "description": "MCP server giving Claude Code agents persistent, verifiable Working Memory on DKG v10. 7 tools for capturing, searching, promoting, and synthesizing research artifacts across sessions and sub-agents.",
  "version": "1.0.0",
  "commit": "FILL_AFTER_PUBLISH",
  "npm": "dkg-claude-code-memory",
  "license": "Apache-2.0",
  "maintainer": "drMurlly",
  "install": {
    "kind": "mcp",
    "command": "npx",
    "args": ["dkg-claude-code-memory"],
    "env": {
      "DKG_DAEMON_URL": "http://localhost:9200",
      "DKG_TOKEN": "YOUR_BEARER_TOKEN",
      "DKG_CONTEXT_GRAPH": "ccm-research"
    }
  },
  "layers": ["working-memory", "shared-memory"],
  "tags": ["claude-code", "mcp", "security-research", "working-memory", "multi-agent"],
  "demo": "FILL_AFTER_RECORDING",
  "design_brief": "docs/DESIGN_BRIEF.md",
  "test_count": 451,
  "coverage": "99.66%"
}
```

### 4d. PR against OriginTrail/dkg-integrations
- Title: `[cfi-dkgv10-r1] Add claude-code-memory: MCP Working Memory server for Claude Code (451 tests, 99.7% coverage)`
- Body: paste DESIGN_BRIEF.md + demo link + contributor attestation
- Label: `cfi-dkgv10-r1`

---

## 5. Task Breakdown for Brevin (builder)

Ordered by priority. All tasks should be given to Brevin one at a time (he executes better with specific focused tasks).

### BATCH 1 — Bug fixes (must complete before docs)

| # | Task | Files | Effort |
|---|---|---|---|
| B1 | Fix `capture.ts` to call `normalizeArtifact()` from normalizer | `src/tools/capture.ts`, `src/core/normalizer.ts` | ~2h |
| B2 | Expand keyword search to match `schema:text` (content) | `src/tools/search.ts`, `tests/unit/tools/search.test.ts` | ~1h |
| B3 | Fix empty-string sub-agent quads (omit if undefined) | `src/core/serializers.ts`, `tests/unit/core/serializers.test.ts` | ~30m |
| B4 | Add `title` to `SynthesizeParams` | `src/tools/types.ts`, `src/tools/synthesize.ts`, tests | ~30m |
| B5 | Clean up `types/mcp.ts` dead interfaces | `src/types/mcp.ts` | ~20m |
| B6 | Fix license: MIT → Apache-2.0 | `package.json`, `LICENSE` file | ~5m |
| B7 | Fix `package.json`: add `engines`, `files`, `exports` | `package.json` | ~10m |

### BATCH 2 — Feature enhancements

| # | Task | Files | Effort |
|---|---|---|---|
| F1 | Add `derivedFrom?: string[]` to CaptureParams + serializer | `src/tools/types.ts`, `src/tools/capture.ts`, `src/core/serializers.ts`, tests | ~3h |
| F2 | Add `query_shared_memory` tool (8th tool) | `src/tools/query-shared.ts` (new), `src/server.ts`, `src/tools/types.ts`, tests | ~2h |
| F3 | Add `derivedFromId` filter to `search_working_memory` | `src/tools/search.ts`, tests | ~1h |
| F4 | Add `sensitivity` field + promotion guard | `src/types/artifact.ts`, `src/tools/promote.ts`, `src/core/normalizer.ts`, tests | ~2h |
| F5 | Add `toClaimReview()` serializer | `src/core/serializers.ts`, tests | ~2h |

### BATCH 3 — Documentation

| # | Task | Files | Effort |
|---|---|---|---|
| D1 | Write `docs/DESIGN_BRIEF.md` | `docs/DESIGN_BRIEF.md` (use PHASE6_DOCS.md template) | ~2h |
| D2 | Write `docs/DEMO_SCRIPT.md` | `docs/DEMO_SCRIPT.md` | ~1h |
| D3 | Write `docs/ORACLE_READINESS.md` | `docs/ORACLE_READINESS.md` | ~1h |
| D4 | Write `docs/MULTI_AGENT_GUIDE.md` | `docs/MULTI_AGENT_GUIDE.md` | ~1h |
| D5 | Update README (tool name fix, new tools, multi-agent example) | `README.md` | ~1h |

### BATCH 4 — Submission

| # | Task | Who | Notes |
|---|---|---|---|
| S1 | Create `REGISTRY_ENTRY.json` | Brevin | Use template in §4c |
| S2 | Create GitHub repo + push code | drMurlly action | Needs drMurlly's GitHub creds |
| S3 | Tag v1.0.0 → triggers npm publish via CI | drMurlly action | After S2 |
| S4 | Record demo video (3–5 min) | drMurlly action | Follow DEMO_SCRIPT.md |
| S5 | Open PR against OriginTrail/dkg-integrations | drMurlly action | After npm published |

---

## 6. What the Final Submission Demonstrates (vs PR #3)

When the committee reviews our PR alongside PR #3, here is what they see:

| Evaluation Criterion | PR #3 (dkg-wm-bridge) | Our submission |
|---|---|---|
| **1. LLM-Wiki fit** | CLI tool, operator-mediated | MCP server — **agent calls tools directly, no operator** |
| **2. Adoption (credible first user)** | No named user | **drMurlly's active bug bounty workflow on Immunefi/Code4rena/Sherlock** |
| **3. v10 model faithfulness** | Excellent | Excellent + **8 tools vs 5 commands** |
| **4. Oracle/VM readiness** | Asserted, no schema | **`toClaimReview()` serializer + ORACLE_READINESS.md mapping** |
| **5. Agent surface quality** | Operator-invoked CLI | **Agent-native, sensible defaults, `derived_from` for provenance chains** |
| **6. Engineering quality** | 147 tests | **451 tests, 99.7% coverage, zero-dep tools** |
| **7. Documentation** | Design brief, 3 asciinema demos | **Design brief + Oracle readiness + Multi-agent guide + Demo script + video** |
| **MCP support** | ❌ CLI only | ✅ Native MCP (the highest-priority integration target) |
| **Multi-agent provenance** | One-directional write | **Bidirectional: `derived_from` chains + Shared Memory query** |

This is not incremental improvement — it is a structurally different architecture that directly addresses the committee's highest-priority integration targets.

---

## 7. Notes on Task 5b (Phase 5b — Tool Unit Tests)

**Status: COMPLETE as of 2026-05-25 (fixed by Selon this session).**

The root cause was concurrent worker timeout in vitest. When 14 test files ran in parallel, multiple workers competed for the Vite SSR module transform server. Some requests exceeded the 10-second internal timeout, causing 3–6 files to fail with `Timeout calling "fetch"`.

**Fix applied:** Added `fileParallelism: false` to `vitest.config.ts`. Files now run serially. Total run: 7.1 seconds, 451/451 tests pass.

No further action needed on Phase 5b.

---

## 8. Success Criteria

The submission is ready to file when ALL of the following are true:

- [ ] `npm test` → 451+ tests, 0 failures (currently passing)
- [ ] `npm run test:coverage` → >95% statements and branches on all `src/tools/*.ts` (currently 99.66% / 95.35%)
- [ ] `npm audit --production` → 0 vulnerabilities
- [ ] `npm run build` → 0 TypeScript errors
- [ ] `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js` → lists 8 tools
- [ ] `docs/DESIGN_BRIEF.md` exists with all 10 required sections
- [ ] `docs/ORACLE_READINESS.md` exists with ClaimReview field mapping
- [ ] `docs/MULTI_AGENT_GUIDE.md` exists with provenance chain walkthrough
- [ ] `REGISTRY_ENTRY.json` exists with real commit SHA and demo URL
- [ ] npm package published with SLSA provenance (`dist.integrity` visible on `npm info`)
- [ ] Demo video ≥3 min showing real DKG writes, cross-session persistence, sub-agent attribution
- [ ] PR open against OriginTrail/dkg-integrations with `cfi-dkgv10-r1` label
