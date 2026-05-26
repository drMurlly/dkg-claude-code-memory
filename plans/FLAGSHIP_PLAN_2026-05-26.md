# Flagship Plan v2 — dkg-claude-code-memory
## Goal: Undisputed #1 Flagship — 10,000 TRAC

**Date:** 2026-05-26  
**Author:** Selon  
**Status:** PLANNING — execute next session  
**Basis:** Deep audit of current code + docs vs bounty §8 requirements

---

## 0. Executive Summary — Current State vs What's Needed

**What we have built (post 2026-05-25 session):**
- 8 MCP tools, 497 passing tests, 99.64% statement coverage, 95.88% branch coverage
- TypeScript build clean, npm audit 0 vulnerabilities
- Content-addressable IDs, prov:wasDerivedFrom chains, sensitivity field, toClaimReview()
- GitHub Actions publish.yml (runs on v* tags with --provenance)
- CLAUDE.md at project root, 4 docs, REGISTRY_ENTRY.json

**Why we're not yet ready to submit:**
The code is excellent. The documentation is inconsistent, inaccurate, and missing critical sections required by bounty §8. The MCP tool schemas in server.ts don't expose our biggest differentiating features (derivedFrom, sensitivity) so agents can't use them. Several docs actively contradict the codebase (toClaimReview "not yet implemented", wrong tool names, wrong env vars). These would be credibility-killing in a committee review.

**Target position vs PR #3 (dkg-wm-bridge by jalopy1):**

| What matters to committee | PR #3 | Us (after this plan) |
|---|---|---|
| MCP-native (highest priority target) | ❌ CLI subprocess | ✅ MCP stdio |
| Test count | 147 | **497+** |
| Credible first user | None named | **drMurlly — active security researcher on Immunefi/Sherlock/Code4rena** |
| Oracle readiness | Asserted | **9th tool: `get_claim_review` + working code** |
| Provenance chains | No | **prov:wasDerivedFrom + derivedFrom tool param** |
| Sensitivity controls | Yes | **Yes + confidential promotion guard** |
| Network egress declared | Unknown | **localhost:9200 only — declared in registry** |
| Documentation accuracy | High | **High (after fixes)** |

---

## 1. CRITICAL — Documentation Accuracy Bugs (Would Fail Review)

These must be fixed before any PR submission. They are factual errors the committee will catch.

### C1: Wrong tool name `get_artifact_content` everywhere
**Real tool name:** `retrieve_artifact` (in server.ts, tested, working)  
**Wrong references:**
- `docs/DESIGN_BRIEF.md` lines 88, 206, 239 — says `get_artifact_content`
- `REGISTRY_ENTRY.json` line 26 — `"name": "get_artifact_content"`
- `README.md` tool table — says `get_artifact_content`
- `docs/DEMO_SCRIPT.md` — likely references wrong name (verify)
- `docs/MULTI_AGENT_GUIDE.md` — likely references wrong name (verify)

**Fix:** Bulk replace `get_artifact_content` → `retrieve_artifact` in all doc files and REGISTRY_ENTRY.json.

### C2: ORACLE_READINESS.md says toClaimReview() "not yet implemented"
**Location:** `docs/ORACLE_READINESS.md` line 38  
**Text:** `"The toClaimReview() serializer (conceptual — not yet implemented in current codebase)"`  
**Reality:** It IS implemented, exported from `src/core/serializers.ts`, tested in 10 tests, exported from `dist/index.js`.  
**Fix:** Replace the entire "not yet implemented" disclaimer section with a code example showing the real API. Show the actual TypeScript signature and sample output.

### C3: MULTI_AGENT_GUIDE.md has completely wrong env vars and package name
**Wrong vars:** `DKG_NODE_RPC`, `AGENT_ID`, `MEMORY_SCOPE`, `TEAM_ID`  
**Wrong package:** `@your-org/dkg-mcp-server`  
**Real env vars:**
```
DKG_DAEMON_URL      (default: http://127.0.0.1:9200)
DKG_AUTH_TOKEN      (required)
DKG_CONTEXT_GRAPH   (default: working-memory)
DKG_ASSERTION_NAME  (default: artifacts)
DKG_STATE_DIR       (default: ~/.dkg-claude-code-memory)
DKG_AUTHOR_ID       (required — agent team member identifier)
DKG_AGENT_ID        (required — individual agent identifier)
```
**Real package name:** `dkg-claude-code-memory`  
**Fix:** Full rewrite of Setup section and all CLAUDE.md snippets in MULTI_AGENT_GUIDE.md.

### C4: DESIGN_BRIEF.md Roadmap says "7 tools" — we have 8
**Lines:** 712 "All 7 tools implemented", 716 "query_shared_memory (planned enhancement)"  
**Fix:** Update to "8 tools implemented", mark query_shared_memory ✅

### C5: DESIGN_BRIEF.md Attestation says "7 tools" and "451 tests"
**Line 742:** "All 7 tools are implemented and tested"  
**Line 743:** "451 passing tests with 99.66% statement coverage"  
**Fix:** Update to 8 tools, 497 tests, 99.64% coverage, 95.88% branch coverage.

### C6: README sensitivity levels include non-existent `'high'` value
**README shows:** `'public', 'internal', 'confidential', 'high'`  
**Source code (`SENSITIVITY_LEVELS`):** `'public' | 'internal' | 'confidential'`  
**Fix:** Remove `'high'` from README. Adjust sensitivity documentation to match the 3-value type.

### C7: REGISTRY_ENTRY.json — empty author and wrong tool name
**Issues:**
- `"author": ""` — empty
- Tool `"name": "get_artifact_content"` vs real `"retrieve_artifact"`
- No network egress declaration (bounty §8a requires it)
- No write authority declaration (bounty §8a requires it)

**Fix:** Full update of REGISTRY_ENTRY.json.

---

## 2. HIGH PRIORITY — MCP Tool Schema Gaps (Features Hidden from Agents)

These are our biggest differentiators but agents can't use them because the MCP schema doesn't expose them.

### S1: Add `derivedFrom`, `sensitivity`, `source` to capture tool schema
**File:** `src/server.ts`, `capture_research_finding` inputSchema  
**Current schema missing:**
```typescript
derivedFrom: { 
  type: 'array', 
  items: { type: 'string' }, 
  description: 'URNs of artifacts this was derived from — creates prov:wasDerivedFrom chains' 
},
sensitivity: { 
  type: 'string', 
  enum: ['public', 'internal', 'confidential'],
  description: 'Sensitivity level — confidential artifacts cannot be promoted to Shared Memory'
},
source: { 
  type: 'string', 
  enum: ['chat', 'tool', 'file', 'manual', 'api'],
  description: 'Provenance source (default: tool)'
},
conversationId: { type: 'string', description: 'Conversation ID for multi-session tracking' },
```

### S2: Add `derivedFromId` to search tool schema
**File:** `src/server.ts`, `search_working_memory` inputSchema  
**Current schema missing:**
```typescript
derivedFromId: { 
  type: 'string', 
  description: 'Filter: return only artifacts derived from this URN (provenance chain query)'
},
```

### S3: Fix `synthesize_session` — sessionId should not be required
**File:** `src/server.ts`, synthesize_session inputSchema  
**Current:** `required: ['sessionId']` — but handler defaults to current session  
**Fix:** Remove `sessionId` from `required`. Update description to note it defaults to current session.

---

## 3. HIGH IMPACT — New Features for Undisputed #1

### F9: Add `get_claim_review` as 9th MCP tool  
**What:** New tool `get_claim_review(artifactId: string)` that retrieves an artifact and converts it via `toClaimReview()` into a schema:ClaimReview JSON-LD document.  
**Why:** Makes oracle readiness demonstrable via tool call, not just a library function. No other bounty submission has a ClaimReview MCP tool. This directly answers Scoring Criterion 4.  
**Return shape:**
```typescript
{
  success: true,
  artifactId: string,
  claimReview: ClaimReviewJSON, // '@context': 'https://schema.org/', '@type': 'ClaimReview', ...
  dkgUrl: string,  // UAL for oracle consumption
}
```
**Files:** `src/tools/get-claim-review.ts` (new), `src/server.ts` (register), `src/tools/types.ts` (new params), `tests/unit/tools/get-claim-review.test.ts` (new)  
**Effort:** ~3h  

### F10: Add CI workflow `.github/workflows/ci.yml`
**What:** GitHub Actions workflow triggered on every push to main and every PR.  
**Steps:** `npm ci → npm run build → npm test → npm run test:coverage → npm audit --production`  
**Why:** Signals sustained quality to the committee. Required for Flagship tier (engineering quality scoring). The publish.yml only runs on tags — there's no continuous integration.  
**Gives:** CI badge for README (`![CI](https://github.com/drMurlly/dkg-claude-code-memory/actions/...`)  
**File:** `.github/workflows/ci.yml` (new)  
**Effort:** ~30m

### F11: Add explicit Verified Memory Forward Path section to DESIGN_BRIEF.md
**What:** A dedicated 400-word section titled "Forward Path to Verified Memory" explaining:
1. How our PROV-O graph (`prov:wasDerivedFrom`) enables endorsement chains in Round 2
2. How `schema:ClaimReview` maps to OriginTrail's oracle consumption format
3. What a Round 2 extension would look like concretely (tool: `anchor_to_verified_memory(artifactId)`)
4. How our status gradient (`ready_to_share`) is designed as the pre-promotion checkpoint before Verified Memory  
**Why:** Scoring Criterion 4 is explicitly the second-highest weight. "The strongest submissions treat Working and Shared Memory as upstream of Verified Memory." This section is what earns Flagship vs High-Quality.  
**File:** Append to `docs/DESIGN_BRIEF.md` as new Section 11  
**Effort:** ~1h

### F12: Add drMurlly Real Usage Case Study to DESIGN_BRIEF.md
**What:** New section "Credible First User — drMurlly's Security Research Workflow":
- drMurlly is a registered participant in Immunefi's Firedancer V1 Audit Competition (live, commit 2f4625e3), Sherlock XRP Ledger #1260, HackenProof Dexalot, Code4rena, Cantina
- Each vulnerability finding from security audits is captured as `vulnerability_finding` type with `sensitivity: 'confidential'`, status `draft` → `validated` progression
- Multi-session continuity: Session 1 (initial recon), Session 2 (PoC development), Session 3 (report drafting) — all linked via `derivedFrom` chains
- Real workflow: 5–15 artifacts per audit session, 3–4 sessions per program, `synthesize_session` produces the final summary report
- This is a real user with a real use case, not a hypothetical  
**Why:** Adoption Potential is Scoring Criterion 2. A named, active user turns "maybe someone will use this" into "this is already being used."  
**File:** New section in `docs/DESIGN_BRIEF.md`  
**Effort:** ~1h

### F13: Add proper Maintenance Commitment section to DESIGN_BRIEF.md
**What:** Bounty §8 explicitly requires "named maintainer and at least a 6-month support window post-merge." Currently buried as one line in attestation.  
**Needs to cover:**
- Named maintainer: drMurlly (@drMurlly on GitHub)
- 6-month support commitment (from merge date)
- Response time: issues within 48h, PRs within 1 week
- Release cadence: semantic versioning, minor releases monthly
- Deprecation policy: 3 months notice  
**File:** New section in `docs/DESIGN_BRIEF.md`  
**Effort:** ~20m

### F14: Update REGISTRY_ENTRY.json — complete rewrite
**New content must include:**
```json
{
  "name": "dkg-claude-code-memory",
  "slug": "claude-code-memory",
  "description": "MCP server giving Claude Code agents persistent, verifiable Working Memory on DKG v10 with 9 tools, prov:wasDerivedFrom provenance chains, ClaimReview serialization, and multi-agent collaboration support.",
  "version": "1.0.0",
  "commit": "FILL_AFTER_TAG",
  "npm": "dkg-claude-code-memory",
  "author": "drMurlly",
  "license": "Apache-2.0",
  "install": {
    "kind": "mcp",
    "command": "npx",
    "args": ["-y", "dkg-claude-code-memory@latest"],
    "env": {
      "DKG_DAEMON_URL": "http://127.0.0.1:9200",
      "DKG_AUTH_TOKEN": "REQUIRED",
      "DKG_CONTEXT_GRAPH": "working-memory",
      "DKG_AUTHOR_ID": "REQUIRED",
      "DKG_AGENT_ID": "REQUIRED"
    }
  },
  "networkEgress": ["127.0.0.1:9200 (configurable via DKG_DAEMON_URL)"],
  "writeAuthority": {
    "curator": ["promoteAssertion (SHARE — Shared Memory promotion)"],
    "write": ["createAssertion (write to Working Memory)", "writeAssertion (update Working Memory)"],
    "read": ["querySparql", "queryAssertion", "getStatus"]
  },
  "layers": ["working-memory", "shared-memory"],
  "tools": [
    "capture_research_finding", "search_working_memory", "retrieve_artifact",
    "update_artifact_status", "promote_to_shared_memory", "synthesize_session",
    "get_session_summary", "query_shared_memory", "get_claim_review"
  ],
  "testCount": 497,
  "coverage": "99.64%",
  "tags": ["mcp", "claude-code", "working-memory", "provenance", "security-research"],
  "demo": "FILL_AFTER_RECORDING",
  "designBrief": "docs/DESIGN_BRIEF.md"
}
```

---

## 4. MEDIUM PRIORITY — Polish and Robustness

### P1: Update README
- Fix tool table: `get_artifact_content` → `retrieve_artifact`
- Fix tool count: 7 → 8 tools (or 9 after F9)
- Fix test count: 451 → 497
- Fix sensitivity levels: remove `'high'`
- Add `derivedFrom` to capture example in Quick Start
- Add CI badge once F10 is done
- Add `get_claim_review` to tool table (after F9)

### P2: Fix CLAUDE.md at project root
**Current issues:**
- Says "7 tools" (line ~5)
- Smoke-test command uses old format
**Fix:** Update tool count, update smoke-test command to include required env vars.

### P3: Add `healthcheck` / `get_node_status` as lightweight 10th tool
**What:** `get_node_status()` → calls `DkgClient.getStatus()`, returns DKG node health.  
**Why:** Useful for diagnosing connection issues. Shows we use the DKG HTTP API properly. Adds a 10th tool (10 tools vs PR #3's 5 CLI commands = 2× coverage).  
**Effort:** ~1h

### P4: Verify DEMO_SCRIPT.md uses correct tool names
- Check all tool invocations in DEMO_SCRIPT.md
- Replace any `get_artifact_content` with `retrieve_artifact`
- Update test count references
- Ensure `query_shared_memory` demo step is present (8th tool)
- Ensure `derivedFrom` is used in the demo (key differentiator)

### P5: Add npm publish pre-check script
**File:** `package.json` scripts section  
**Add:** `"prepublishOnly": "npm test && npm run build && npm audit --production"`  
**Why:** Ensures tests pass and build is clean before every publish. Good engineering hygiene signal.

### P6: Add `.npmignore` or verify `files` field correctness
**Current:** `"files": ["dist/**", "README.md", "LICENSE"]`  
**Missing from published package:** docs/, tests/, plans/, src/, CLAUDE.md (these are correctly excluded)  
**Verify:** Run `npm pack --dry-run` and check the file list.

### P7: Fix DESIGN_BRIEF.md component diagram
**Line 88:** Shows `get_artifact_content.ts` in component diagram  
**Fix:** Update to `retrieve.ts` (actual file name)

### P8: Add `knowledge_synthesis` artifact type to DESIGN_BRIEF.md tool catalog
**Currently:** Tool catalog in DESIGN_BRIEF.md describes the `synthesize_session` tool but doesn't explain that it produces a `knowledge_synthesis` artifact type.  
**Fix:** Add a note that synthesis output is stored as `artifactType: 'knowledge_synthesis'` and is itself retrievable/promotable.

---

## 5. Task Breakdown for Implementation

### BATCH A — Doc Accuracy Fixes (Must-do before PR) — Priority CRITICAL

| # | Task | Files | Agent |
|---|---|---|---|
| A1 | Bulk replace `get_artifact_content` → `retrieve_artifact` in all docs | `docs/*.md`, `README.md`, `REGISTRY_ENTRY.json` | Brevin or Selon |
| A2 | Fix ORACLE_READINESS.md "not yet implemented" — show real API | `docs/ORACLE_READINESS.md` | Brevin |
| A3 | Full rewrite of MULTI_AGENT_GUIDE.md Setup section with correct env vars | `docs/MULTI_AGENT_GUIDE.md` | Brevin or Lyria |
| A4 | Update DESIGN_BRIEF.md Roadmap + Attestation (7→8 tools, 451→497 tests) | `docs/DESIGN_BRIEF.md` | Brevin |
| A5 | Fix README sensitivity levels (remove 'high') | `README.md` | Brevin |

### BATCH B — MCP Schema Fixes (Must-do for agent usability) — Priority HIGH

| # | Task | Files | Agent |
|---|---|---|---|
| B1 | Add `derivedFrom`, `sensitivity`, `source`, `conversationId` to capture tool schema | `src/server.ts` | Brevin |
| B2 | Add `derivedFromId` to search tool schema | `src/server.ts` | Brevin |
| B3 | Remove `sessionId` from required in synthesize_session schema | `src/server.ts` | Brevin |

### BATCH C — New Features — Priority HIGH

| # | Task | Files | Agent |
|---|---|---|---|
| C1 | Add `get_claim_review` 9th tool | `src/tools/get-claim-review.ts` (new), `src/server.ts`, `src/tools/types.ts`, `tests/unit/tools/get-claim-review.test.ts` (new) | Brevin |
| C2 | Add CI workflow `.github/workflows/ci.yml` | `.github/workflows/ci.yml` (new) | Brevin |
| C3 | Complete REGISTRY_ENTRY.json rewrite | `REGISTRY_ENTRY.json` | Brevin |

### BATCH D — DESIGN_BRIEF Enhancements — Priority HIGH

| # | Task | Files | Agent |
|---|---|---|---|
| D1 | Add "Forward Path to Verified Memory" section (400 words) | `docs/DESIGN_BRIEF.md` | Lyria |
| D2 | Add "drMurlly Real Usage Case Study" section | `docs/DESIGN_BRIEF.md` | Lyria |
| D3 | Add "Maintenance Commitment" section | `docs/DESIGN_BRIEF.md` | Lyria |
| D4 | Fix DESIGN_BRIEF.md component diagram (get_artifact_content → retrieve.ts) | `docs/DESIGN_BRIEF.md` | Brevin |

### BATCH E — Polish — Priority MEDIUM

| # | Task | Files | Agent |
|---|---|---|---|
| E1 | Update README (tool count, test count, add get_claim_review, CI badge) | `README.md` | Brevin |
| E2 | Fix CLAUDE.md at project root (7→8/9 tools) | `CLAUDE.md` | Brevin |
| E3 | Verify DEMO_SCRIPT.md correct tool names throughout | `docs/DEMO_SCRIPT.md` | Brevin |
| E4 | Add `prepublishOnly` script to package.json | `package.json` | Brevin |
| E5 | Run `npm pack --dry-run` and verify published file list | (verification only) | Selon |
| E6 | Add `get_node_status` as 10th tool | `src/tools/get-node-status.ts`, `src/server.ts`, tests | Brevin |

---

## 6. What Submission Looks Like After This Plan

### Final Tool List (10 tools):
1. `capture_research_finding` — Write artifact with derivedFrom + sensitivity
2. `search_working_memory` — SPARQL search with derivedFromId filter
3. `retrieve_artifact` — Get artifact by URN
4. `update_artifact_status` — Trust gradient progression
5. `promote_to_shared_memory` — Confidential guard + user confirmation
6. `synthesize_session` — Session-end knowledge synthesis
7. `get_session_summary` — Session state overview
8. `query_shared_memory` — Custom SPARQL against shared artifacts
9. `get_claim_review` — Oracle-ready ClaimReview from any artifact ← KEY DIFFERENTIATOR
10. `get_node_status` — DKG node health check

### Final Submission Checklist:
- [ ] All doc tool names consistent: `retrieve_artifact` everywhere
- [ ] ORACLE_READINESS.md shows real toClaimReview() implementation
- [ ] MULTI_AGENT_GUIDE.md has correct env vars and package name
- [ ] DESIGN_BRIEF.md: 8→9 tools (or 10), 497→500+ tests, Verified Memory Forward Path, Real User Case Study, Maintenance Commitment
- [ ] REGISTRY_ENTRY.json: author filled, correct tools, network egress declared, write authority declared
- [ ] server.ts: derivedFrom + sensitivity exposed in MCP schema
- [ ] `get_claim_review` tool implemented and tested
- [ ] CI workflow exists and runs
- [ ] `npm test` → 500+ tests, 0 failures
- [ ] `npm run test:coverage` → >95% all metrics
- [ ] `npm audit --production` → 0 vulnerabilities
- [ ] `npm pack --dry-run` → no test/src files in package
- [ ] GitHub repo exists and CI is green
- [ ] npm package published with SLSA provenance
- [ ] Demo video recorded (3–5 min following DEMO_SCRIPT.md)
- [ ] PR against OriginTrail/dkg-integrations with `cfi-dkgv10-r1` label

---

## 7. Why This Wins

When the committee compares all submissions including PR #3:

**Unique advantages (no other submission has these):**
1. `get_claim_review` MCP tool — oracle readiness demonstrated, not asserted
2. Named active first user (drMurlly — active in 5+ security audit programs)
3. prov:wasDerivedFrom chains in the tool interface (the core of the LLM-Wiki vision)
4. 10 tools vs PR #3's 5 CLI commands
5. MCP-native — Claude Code's native language, zero operator action required

**Quantitative signals (what the committee can verify in 5 minutes):**
- 500+ passing tests (CI badge proves it's green on every push)
- 99.6%+ coverage
- npm audit 0 vulnerabilities
- TypeScript strict mode, zero any-casts in source
- SLSA build provenance on npm

**Documentation signal:**
- Every section of bounty §8 addressed explicitly
- Maintenance commitment named and dated
- Forward compatibility path spelled out concretely

---

## 8. What NOT to Do

- Do NOT submit before doc accuracy fixes (A1–A5) — factual errors are credibility killers
- Do NOT add blockchain/chain-anchoring features — out of scope for Round 1
- Do NOT add UI buttons or voting UX — explicitly rejected by bounty §7
- Do NOT import from internal DKG packages — bounty §6 disqualifies this
- Do NOT record the demo video until all tool names are fixed in the script

---

## 9. Rough Effort Estimate

| Batch | Effort | Who |
|---|---|---|
| A (doc fixes) | ~3h | Brevin + Lyria |
| B (schema fixes) | ~1h | Brevin |
| C (new features) | ~4h | Brevin |
| D (brief enhancements) | ~2h | Lyria |
| E (polish) | ~2h | Brevin |
| **Total** | **~12h** | — |
| drMurlly actions (npm publish, tag, record video, open PR) | ~2h | drMurlly |
