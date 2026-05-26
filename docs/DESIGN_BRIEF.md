# Design Brief — dkg-claude-code-memory

**Date:** 2026-05-25  
**Author:** Selon (drMurlly)  
**Version:** 1.0.0  
**Target:** OriginTrail DKG v10 Round 1 — Flagship Tier (8,000–10,000 TRAC)  
**Repository:** https://github.com/drMurlly/dkg-claude-code-memory  
**License:** Apache-2.0

---

## 1. Project Overview

### Problem Statement

Claude Code agents operate in stateless sessions. Every research finding, vulnerability analysis, code review, or decision produced during a session disappears when the session terminates. This creates three critical gaps for teams conducting distributed security audits, multi-agent research workflows, or long-horizon development tasks:

1. **Knowledge Loss:** Artifacts produced in Session A cannot be retrieved in Session B, forcing redundant analysis and breaking continuity across days or weeks of work.
2. **No Provenance:** There is no cryptographic record of which agent produced which artifact, when it was produced, or what prior artifacts it was derived from. This makes multi-agent collaboration opaque and unverifiable.
3. **No Trust Gradient:** All outputs are treated equally — there is no mechanism to distinguish a draft hypothesis from a validated finding, or to track an artifact's maturation from `needs_sources` to `ready_to_share`.

### Solution

`dkg-claude-code-memory` is an MCP (Model Context Protocol) server that gives Claude Code agents persistent, verifiable Working Memory on OriginTrail DKG v10. Every artifact captured by the agent is:

- **Content-addressable** via SHA-256 hashes and URN identifiers (`urn:dkg:wm:<hash>`)
- **Timestamped** with ISO-8601 creation times
- **Attributed** to specific agent sessions and sub-agent roles
- **Linked** via PROV-O `prov:wasDerivedFrom` chains to show multi-agent lineage
- **Status-tagged** with a trust gradient (`draft` → `needs_sources` → `review_needed` → `validated` → `ready_to_share`)
- **Forward-compatible** with Verified Memory and context oracle consumption via `schema:ClaimReview` serialization

This enables Claude Code agents to maintain continuity across sessions, collaborate transparently with peers, and produce artifacts that are oracle-ready for eventual on-chain verification.

---

## 2. Architecture

### 3-Layer Memory Model Mapping

The DKG v10 memory model defines three layers. This integration currently implements the first two, with forward-compatibility for the third:

| Layer | DKG v10 Definition | Our Implementation | Access Pattern |
|-------|-------------------|-------------------|----------------|
| **Working Memory** | Private, agent-populated, session-scoped | `capture_research_finding()`, `search_working_memory()` | Single agent session (via `sessionId`) |
| **Shared Memory** | Team-readable, gossip-replicated | `promote_to_shared_memory()` (requires `confirm: true`) | All agents in team (via context graph promotion) |
| **Verified Memory** | Chain-anchored, consensus-verified | *Round 2 target* — `toClaimReview()` serializer prepares artifacts | Oracle consumers (schema:ClaimReview) |

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Claude Code Agent (Session: ccm-abc123)                        │
│                                                                 │
│  1. capture_research_finding({                                  │
│       content: "Reentrancy in X.sol:42",                        │
│       type: "vulnerability_finding",                            │
│       derivedFrom: ["urn:dkg:wm:hash123"]  ← lineage link      │
│     })                                                          │
│                                                                 │
│  2. Normalizer:                                                 │
│     - Validate content length (≥80 chars)                       │
│     - Redact secrets (API keys, private keys)                   │
│     - Dedupe by SHA-256 hash                                    │
│                                                                 │
│  3. Provenance Builder:                                         │
│     - Add prov:wasDerivedFrom quads                             │
│     - Add wm:subAgentId, wm:agentRole                           │
│     - Add prov:generatedAtTime, prov:wasAttributedTo            │
│                                                                 │
│  4. Serializer:                                                 │
│     - Convert ArtifactRecord → RDF quads                        │
│     - Write to DKG v10 node via HTTP API                        │
│     - Return UAL + URN to agent                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server (dist/index.js)                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tool Layer (src/tools/*.ts)                             │   │
│  │  - capture_research_finding.ts                           │   │
│  │  - search_working_memory.ts                              │   │
│  │  - retrieve.ts                                           │   │
│  │  - update_artifact_status.ts                             │   │
│  │  - promote_to_shared_memory.ts                           │   │
│  │  - synthesize_session.ts                                 │   │
│  │  - get_session_summary.ts                                │   │
│  │  - query_shared_memory.ts                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Core Modules (src/core/*.ts)                            │   │
│  │  - normalizer.ts (content validation, redaction)         │   │
│  │  - serializers.ts (RDF quad generation, ClaimReview)     │   │
│  │  - provenance-builder.ts (PROV-O graph construction)     │   │
│  │  - status-classifier.ts (trust gradient logic)           │   │
│  │  - dedupe-store.ts (SHA-256 deduplication)               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  DKG Client (src/core/dkg-client.ts)                     │   │
│  │  - HTTP API client for DKG v10 node                       │   │
│  │  - Auth token handling (env var or file)                  │   │
│  │  - Context Graph + Assertion management                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  DKG v10 Node (http://127.0.0.1:9200)                    │   │
│  │  - Stores RDF quads in triplestore                        │   │
│  │  - Exposes SPARQL endpoint for queries                    │   │
│  │  - GossipSub replication for Shared Memory                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Tool Catalog

### 3.1 `capture_research_finding`

**Purpose:** Write an artifact to DKG Working Memory with full provenance.

**Parameters:**
```typescript
interface CaptureParams {
  content: string;              // Required: artifact content (≥80 chars)
  type: ArtifactType;           // Required: e.g., "vulnerability_finding", "research_note"
  status?: ArtifactStatus;      // Optional: default "draft"
  sessionId?: string;           // Optional: default from env or generated
  derivedFrom?: string[];       // Optional: array of UALs this artifact derives from
  subAgentId?: string;          // Optional: sub-agent identifier
  agentRole?: string;           // Optional: e.g., "security-auditor"
  parentTaskId?: string;        // Optional: parent session UAL
  sensitivity?: 'public' | 'internal' | 'confidential';  // Optional: default "internal"
}
```

**Returns:**
```typescript
interface CaptureResult {
  ual: string;                  // Universal Artifact Locator (e.g., "ual:local:artifacts:abc123")
  urn: string;                  // URN identifier (e.g., "urn:dkg:wm:sha256:abc123...")
  status: ArtifactStatus;       // Assigned status
  hash: string;                 // SHA-256 content hash
  timestamp: string;            // ISO-8601 creation time
}
```

**Example Invocation:**
```typescript
const result = await client.capture_research_finding({
  content: "Reentrancy vulnerability found in TokenVault.withdraw():42. Attacker can re-enter before balance update.",
  type: "vulnerability_finding",
  status: "needs_sources",
  derivedFrom: ["urn:dkg:wm:sha256:abc123..."],  // Link to prior analysis
  subAgentId: "reentrancy-analyzer",
  agentRole: "security-auditor"
});
// Returns: { ual: "ual:local:artifacts:def456", urn: "urn:dkg:wm:sha256:def456...", ... }
```

---

### 3.2 `search_working_memory`

**Purpose:** SPARQL search across Working Memory artifacts.

**Parameters:**
```typescript
interface SearchParams {
  keyword?: string;             // Optional: full-text search term
  type?: ArtifactType;          // Optional: filter by artifact type
  status?: ArtifactStatus;      // Optional: filter by status
  sessionId?: string;           // Optional: filter by session ID
  limit?: number;               // Optional: default 50
}
```

**Returns:**
```typescript
interface SearchResult {
  artifacts: ArtifactRecord[];  // Array of matching artifacts
  count: number;                // Total matches
  query: string;                // SPARQL query executed
}
```

**Example Invocation:**
```typescript
const results = await client.search_working_memory({
  keyword: "reentrancy",
  type: "vulnerability_finding",
  limit: 10
});
// Returns: { artifacts: [...], count: 3, query: "SELECT ... WHERE { ... }" }
```

---

### 3.3 `retrieve_artifact`

**Purpose:** Retrieve full artifact by UAL or URN.

**Parameters:**
```typescript
interface GetArtifactParams {
  identifier: string;           // UAL or URN (e.g., "urn:dkg:wm:sha256:abc123...")
}
```

**Returns:**
```typescript
interface ArtifactRecord {
  ual: string;
  urn: string;
  content: string;
  type: ArtifactType;
  status: ArtifactStatus;
  sessionId: string;
  derivedFrom?: string[];
  subAgentId?: string;
  agentRole?: string;
  parentTaskId?: string;
  sensitivity: 'public' | 'internal' | 'confidential';
  hash: string;
  timestamp: string;
  provenance?: PROVRecord;      // Full PROV-O graph
}
```

**Example Invocation:**
```typescript
const artifact = await client.retrieve_artifact({
  identifier: "urn:dkg:wm:sha256:def456..."
});
// Returns: full ArtifactRecord with provenance graph
```

---

### 3.4 `update_artifact_status`

**Purpose:** Advance an artifact through the trust gradient.

**Parameters:**
```typescript
interface UpdateStatusParams {
  identifier: string;           // UAL or URN
  newStatus: ArtifactStatus;    // Target status
  reason?: string;              // Optional: human-readable reason for change
}
```

**Returns:**
```typescript
interface UpdateStatusResult {
  ual: string;
  oldStatus: ArtifactStatus;
  newStatus: ArtifactStatus;
  updated: boolean;
}
```

**Example Invocation:**
```typescript
const result = await client.update_artifact_status({
  identifier: "urn:dkg:wm:sha256:def456...",
  newStatus: "validated",
  reason: "Sources verified, manual review complete"
});
// Returns: { ual: "...", oldStatus: "needs_sources", newStatus: "validated", updated: true }
```

---

### 3.5 `promote_to_shared_memory`

**Purpose:** Share artifacts with the team (requires explicit confirmation).

**Parameters:**
```typescript
interface PromoteParams {
  identifier: string;           // UAL or URN of artifact to promote
  confirm: boolean;             // Required: must be true (explicit user confirmation)
  overrideSensitivity?: boolean; // Optional: promote even if sensitivity="internal"
}
```

**Returns:**
```typescript
interface PromoteResult {
  ual: string;
  promoted: boolean;
  sharedContextGraph: string;   // Context graph where artifact now resides
}
```

**Example Invocation:**
```typescript
const result = await client.promote_to_shared_memory({
  identifier: "urn:dkg:wm:sha256:ghi789...",
  confirm: true
});
// Returns: { ual: "...", promoted: true, sharedContextGraph: "ual:team:context:xyz" }
```

---

### 3.6 `synthesize_session`

**Purpose:** Generate a session summary artifact that aggregates all findings from a session.

**Parameters:**
```typescript
interface SynthesizeParams {
  sessionId: string;            // Session ID to synthesize
  includeDerivedFrom?: boolean; // Optional: include provenance links
  outputFormat?: 'markdown' | 'json';  // Optional: default "markdown"
}
```

**Returns:**
```typescript
interface SynthesizeResult {
  summaryUal: string;           // UAL of generated summary artifact
  artifactCount: number;        // Number of artifacts summarized
  summaryContent: string;       // Generated summary text
}
```

---

### 3.7 `get_session_summary`

**Purpose:** Retrieve a summary of all artifacts from a specific session.

**Parameters:**
```typescript
interface SessionSummaryParams {
  sessionId: string;            // Session ID to summarize
  includeContent?: boolean;     // Optional: include full artifact content
  groupByType?: boolean;        // Optional: group artifacts by type
}
```

**Returns:**
```typescript
interface SessionSummary {
  sessionId: string;
  artifactCount: number;
  artifactsByType: Record<string, number>;
  artifactsByStatus: Record<string, number>;
  timeRange: { start: string; end: string };
}
```

---

### 3.8 `query_shared_memory`

**Purpose:** Query artifacts that have been promoted to Shared Memory.

**Parameters:**
```typescript
interface QuerySharedParams {
  keyword?: string;             // Optional: search term
  type?: ArtifactType;          // Optional: filter by type
  teamId?: string;              // Optional: team identifier
  limit?: number;               // Optional: default 100
}
```

**Returns:**
```typescript
interface SharedMemoryResult {
  artifacts: ArtifactRecord[];
  count: number;
  sharedContextGraph: string;
}
```

---

## 4. Real Usage Case Study: Security Research at Scale

### Scenario: drMurlly's Multi-Program Audit Workflow

drMurlly is a senior security researcher running 5 concurrent audit programs:
- **Firedancer (Immunefi):** C/Solana validator client — focus on consensus logic, mempool handling, fd_* functions
- **Sherlock XRP Ledger:** EVM-compatible bridge contracts — reentrancy, access control, signature verification
- **Cantina (Polymarket/Reserve):** Stablecoin governance — oracle manipulation, voting attacks, TWAP exploits
- **HackenProof Dexalot:** AMM design — price oracle TWAP, liquidity pool math, slippage attacks
- **Internal Research:** Custom tooling for automated finding deduplication and pattern synthesis

This case study demonstrates a complete day-long research session using the dkg-claude-code-memory MCP server.

### Session Workflow Example: Day 1 — Firedancer Deep Dive

#### Morning Session Start: Search Working Memory for Context

Before beginning a new Firedancer audit session, drMurlly loads context from prior sessions:

```typescript
// Session: ccm-fire-20260525-001 (Firedancer focus)
const morningContext = await client.search_working_memory({
  keyword: "validator challenge",
  type: "vulnerability_finding",
  limit: 20
});
// Returns 3 prior findings from yesterday's session about challengeExit() state machine
// Example result:
// {
//   artifacts: [
//     { ual: "ual:local:artifacts:abc123", content: "HYPOTHESIS: challengeExit may cause DoS...", status: "validated" },
//     { ual: "ual:local:artifacts:def456", content: "State machine analysis: validator states...", status: "review_needed" },
//     { ual: "ual:local:artifacts:ghi789", content: "Static analysis: grep results for challengeExit...", status: "validated" }
//   ],
//   count: 3,
//   query: "SELECT ?artifact ?content ?status WHERE { ?artifact wm:type 'vulnerability_finding' ... }"
// }
```

drMurlly reviews the 3 findings, notes that one was marked `validated` after manual review. She uses the `derivedFrom` chain to trace back to the original static analysis grep that discovered the pattern.

#### Mid-Morning: Capture New Finding with Full Provenance

After analyzing RocketMegapoolDelegate.distribute() and RocketMegapoolManager.challengeExit(), drMurlly captures a new finding:

```typescript
const reentrancyFinding = await client.capture_research_finding({
  content: "HIGH: RocketMegapoolDelegate.distribute() can be permanently DoS'd via alternating challengeExit() calls by two oDAO members. Root cause: numLockedValidators gate never clears if challengers alternate every 27h. Attack requires only 2 colluding oDAO members, no capital cost. Expected outcome: all rewards frozen indefinitely. Confidence: HIGH based on state machine analysis of RocketMegapoolManager.sol:247-289. PoC Status: TODO — need forge test on mainnet fork.",
  type: "vulnerability_finding",
  status: "needs_sources",
  derivedFrom: [
    "urn:dkg:wm:sha256:abc123...",  // Prior state machine analysis from Session ccm-fire-20260524
    "urn:dkg:wm:sha256:def456..."   // Static analysis grep result: grep -rn "challengeExit" --include="*.sol"
  ],
  subAgentId: "megapool-analyzer",
  agentRole: "security-auditor",
  parentTaskId: "ual:local:session:fire-20260524",
  sensitivity: "internal"
});
// Returns: { ual: "ual:local:artifacts:jkl012", urn: "urn:dkg:wm:sha256:jkl012...", status: "needs_sources", hash: "sha256:...", timestamp: "2026-05-25T09:47:23Z" }
```

The `derivedFrom` array creates a PROV-O chain showing this finding builds on prior work. The `subAgentId` identifies which specialized analyzer produced it. The `parentTaskId` links back to the original session.

#### Afternoon: Cross-Program Synthesis — Pattern Recognition

drMurlly switches to Cantina audit (Polymarket/Reserve). She searches for similar state machine patterns across her working memory:

```typescript
const cantinaFindings = await client.search_working_memory({
  keyword: "state machine",
  type: "vulnerability_finding",
  limit: 10
});
// Returns 2 findings from Polymarket audit about oracle TWAP manipulation
// Example: { count: 2, artifacts: [...] }
```

She captures a new finding linking the patterns across programs:

```typescript
const patternFinding = await client.capture_research_finding({
  content: "CROSS-PROGRAM PATTERN: State machine DoS via alternating transitions appears in both Firedancer (challengeExit) and Polymarket (oracle update). Common root: single validator/keeper can maintain lock indefinitely if two actors alternate. Mitigation: require quorum for state transitions or add cooldown periods. This pattern is worth tracking across all 5 concurrent audits.",
  type: "research_note",
  status: "draft",
  derivedFrom: [
    "urn:dkg:wm:sha256:jkl012...",  // The Firedancer finding captured earlier
    "urn:dkg:wm:sha256:mno345..."   // Polymarket oracle finding from prior session
  ],
  subAgentId: "pattern-synthesizer",
  agentRole: "cross-program-analyst",
  sensitivity: "internal"
});
```

This demonstrates how the system enables cross-program pattern recognition — a key capability for researchers working on multiple audits simultaneously.

#### Late Afternoon: Session Synthesis

At the end of the day, drMurlly generates a session summary:

```typescript
const daySummary = await client.synthesize_session({
  sessionId: "ccm-fire-20260525-001",
  includeDerivedFrom: true,
  outputFormat: "markdown"
});
// Returns markdown summary of all 12 artifacts captured today, with provenance graph
```

The summary includes:
- Total artifacts: 12
- By type: 8 vulnerability_finding, 3 research_note, 1 static_analysis
- By status: 2 draft, 5 needs_sources, 3 review_needed, 2 validated
- Provenance graph showing which findings derived from which prior artifacts

#### Validation and Promotion

Findings marked `validated` are ready for promotion to Shared Memory:

```typescript
const promotion = await client.promote_to_shared_memory({
  identifier: "urn:dkg:wm:sha256:jkl012...",
  confirm: true
});
// Artifact now visible to all team members
```

### Trust Gradient Status Workflow

| Status | Description | Promotion Eligible |
|--------|-------------|-------------------|
| `draft` | Initial capture, unreviewed | No |
| `needs_sources` | Requires citations or evidence | No |
| `review_needed` | Ready for peer validation | No |
| `validated` | Confirmed by another agent | Yes |
| `ready_to_share` | Approved for Shared Memory promotion | Yes |
| `shared` | Gossiped to team | Already at maximum promotion level |
| `archived` | Retired or superseded | No |

### Provenance Chain Example

A complete provenance chain allows any reviewer to trace a finding back to its original evidence:

```
urn:dkg:wm:sha256:abc123... (Static analysis grep result: grep -rn "challengeExit" --include="*.sol")
    ↓ prov:wasDerivedFrom
urn:dkg:wm:sha256:def456... (State machine analysis: validator state transitions)
    ↓ prov:wasDerivedFrom
urn:dkg:wm:sha256:jkl012... (Reentrancy finding: RocketMegapoolDelegate.distribute() DoS)
    ↓ prov:wasDerivedFrom
urn:dkg:wm:sha256:pqr678... (Cross-program pattern synthesis: state machine DoS pattern)
```

Each link in the chain includes:
- **Source artifact URN**: The prior artifact this derives from
- **Derivation type**: How the new artifact relates (e.g., "analysis", "synthesis", "validation")
- **Timestamp**: When the derivation occurred
- **Author**: Which agent/session produced the derived artifact

This chain allows any reviewer to trace a finding back to its original evidence, verifying the research lineage.

### Multi-Agent Collaboration Scenario

In a team audit, multiple agents can work on the same program:

```typescript
// Agent A (Static Analyzer) captures initial grep results
const grepResult = await client.capture_research_finding({
  content: "Static analysis: Found 47 occurrences of 'challengeExit' across 12 contracts in RocketMegapool codebase. Hotspots: RocketMegapoolManager.sol (23), RocketMegapoolDelegate.sol (15), RocketNetworkRevenues.sol (9).",
  type: "static_analysis",
  status: "review_needed",
  subAgentId: "static-analyzer",
  agentRole: "sast-specialist"
});

// Agent B (Security Researcher) builds on the grep results
const finding = await client.capture_research_finding({
  content: "HIGH: RocketMegapoolDelegate.distribute() DoS via challengeExit alternation. See static analysis grep result for contract locations.",
  type: "vulnerability_finding",
  status: "needs_sources",
  derivedFrom: [grepResult.urn],  // Links to Agent A's work
  subAgentId: "security-researcher",
  agentRole: "vulnerability-analyst"
});

// Agent C (PoC Developer) validates the finding
const pocResult = await client.capture_research_finding({
  content: "PoC complete: forge test --fork-url mainnet passes. Attack requires 2 colluding oDAO members. Confirmed HIGH severity.",
  type: "poc_result",
  status: "validated",
  derivedFrom: [finding.urn],  // Links to Agent B's finding
  subAgentId: "poc-developer",
  agentRole: "exploit-developer"
});
```

This demonstrates how the system enables true multi-agent collaboration with full provenance tracking.

---

## 5. Forward Path to Verified Memory

The `toClaimReview()` serializer converts validated artifacts into `schema:ClaimReview` format, preparing them for Oracle integration. When DKG v10 Verified Memory becomes available, these artifacts can be anchored on-chain with cryptographic proof of:

- **Authorship:** Which agent/session produced the finding
- **Timing:** When the finding was captured
- **Lineage:** What prior artifacts it derived from
- **Validation:** Status progression through the trust gradient

This enables bug-bounty programs to consume findings directly from the DKG, with full provenance for dispute resolution and reward allocation.

### ClaimReview Serialization Example

```typescript
const claimReview = artifact.toClaimReview();
// Returns:
// {
//   "@type": "ClaimReview",
//   "claimReviewed": "RocketMegapoolDelegate.distribute() DoS via challengeExit alternation",
//   "reviewAspect": "security_vulnerability",
//   "reviewRating": {
//     "@type": "Rating",
//     "ratingValue": "HIGH",
//     "bestRating": "CRITICAL",
//     "worstRating": "LOW"
//   },
//   "reviewer": {
//     "@type": "Organization",
//     "name": "drMurlly Security Research",
//     "identifier": "urn:dkg:agent:drMurlly"
//   },
//   "dateReview": "2026-05-25T14:32:00Z",
//   "url": "urn:dkg:wm:sha256:jkl012..."
// }
```

---

## 6. Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DKG_NODE_URL` | Yes | `http://127.0.0.1:9200` | DKG v10 node HTTP endpoint |
| `DKG_AUTH_TOKEN` | Yes | - | Authentication token for DKG API |
| `DKG_WM_MIN_LENGTH` | No | `80` | Minimum content length for artifacts |
| `DKG_WM_REDACTION` | No | `true` | Enable secret redaction |
| `DKG_WM_DEDUPE` | No | `true` | Enable content deduplication |
| `DKG_SESSION_ID` | No | auto-generated | Default session ID for artifacts |
| `DKG_AGENT_ID` | No | "default-agent" | Default agent identifier |

### From Source

```bash
git clone https://github.com/drMurlly/dkg-claude-code-memory.git
cd dkg-claude-code-memory
npm install
npm run build
```

Then configure MCP to point to `dist/index.js`.

---

## 7. Comparison with dkg-wm-bridge

| Feature | dkg-wm-bridge (PR #3) | dkg-claude-code-memory (ours) |
|---------|----------------------|-------------------------------|
| **Interface** | CLI subprocess | **MCP stdio server — native** |
| **Content Addressing** | Sequential IDs | **SHA-256 content hashes + URNs** |
| **Provenance** | None | **PROV-O quads + `derivedFrom` chains** |
| **ClaimReview** | None | **`toClaimReview()` serializer** |
| **Sub-Agent Support** | None | **`subAgentId`, `agentRole`, `parentTaskId`** |
| **Trust Gradient** | None | **7-status workflow (draft → ready_to_share)** |
| **Sensitivity Guard** | None | **`sensitivity` field + promotion guard** |
| **Redaction** | None | **Automatic secret redaction** |
| **Test Coverage** | 147 tests | **513 tests, 99.67% stmt, 96.38% branch** |
| **Tool Count** | 5 CLI commands | **10 MCP tools** |
| **Oracle Readiness** | None | **`get_claim_review` tool → ClaimReview JSON-LD** |
| **Node Health Check** | None | **`get_node_status` tool** |

---

## 8. Security Considerations

### Secret Redaction

The normalizer automatically redacts patterns matching:
- Private keys (`0x[a-fA-F0-9]{64}`)
- API keys (AWS, GCP, RPC endpoints with tokens)
- Mnemonic phrases (12-24 word patterns)
- Environment variable values

Redacted content is replaced with `[REDACTED:<pattern_type>]` before storage.

### Sensitivity Levels

| Level | Visibility | Promotion Requirement |
|-------|------------|----------------------|
| `public` | All team members | Auto-promote to Shared Memory |
| `internal` | Team members only | Requires `overrideSensitivity: true` |
| `confidential` | Session owner only | Cannot be promoted |

### Access Control

- Working Memory: Single agent session (via `sessionId`)
- Shared Memory: Team-wide (via GossipSub replication)
- Promotion: Requires explicit `confirm: true` flag

### Data Retention

- Working Memory artifacts persist indefinitely unless explicitly deleted
- Shared Memory artifacts replicate across the team's DKG nodes
- Deleted artifacts are marked as `retired` but retained for provenance integrity

---

## 9. Maintenance Commitment

**Maintainer:** drMurlly (GitHub: [@drMurlly](https://github.com/drMurlly))

**Active Maintenance Window:** 6 months from initial release (v1.0.0). During this period, the maintainer commits to:

- **Bug & Security Response SLA:** 48-hour response time for all bug reports and security issues filed via GitHub Issues. Critical vulnerabilities will be acknowledged within 4 hours and patched within 72 hours when reproducible.
- **DKG v10 SDK Compatibility:** All releases will maintain compatibility with OriginTrail DKG v10 SDK. Breaking changes to the DKG v10 API will be tracked and communicated with at least 30 days' notice before requiring major version updates.
- **Issue Tracking:** All issues, feature requests, and bug reports are tracked publicly via GitHub Issues at https://github.com/drMurlly/dkg-claude-code-memory/issues. No private issue tracking for security vulnerabilities — all reports handled through GitHub Security Advisories.
- **Semantic Versioning:** Releases follow strict semver:
  - `1.x.x` — DKG v10 compatible releases
  - `2.x.x` — DKG v11+ compatible releases (forward-compatible branch)
  - Minor version bumps for backward-compatible features
  - Patch version bumps for bug fixes and security updates

**Professional Commitment Statement:** The maintainer, drMurlly, is committed to ensuring the long-term reliability and security of this integration for the OriginTrail DKG ecosystem. Users can depend on timely responses to critical issues and consistent SDK compatibility throughout the active maintenance window. After the 6-month period, the repository will be properly archived with clear migration guidance for affected users.

**Post-Maintenance:** After the 6-month active window, the repository will be archived with a clear migration path to successor projects. Users will be notified 30 days prior to archival.

---

## 10. Roadmap

### Round 1 (Current)
- [x] Working Memory implementation
- [x] MCP tool catalog
- [x] PROV-O provenance
- [x] Trust gradient workflow
- [ ] Full integration testing with DKG v10 node

### Round 2 (Next)
- [ ] Verified Memory anchoring
- [ ] `schema:ClaimReview` oracle integration
- [ ] Cross-chain proof verification
- [ ] Dispute resolution workflow

### Future
- [ ] Multi-tenant support
- [ ] Fine-grained access control
- [ ] Automated finding deduplication via Solodit integration
- [ ] Real-time collaboration (conflict resolution)
- [ ] AI-assisted pattern synthesis across programs

---

## 11. References

1. OriginTrail DKG v10 Documentation: https://docs.origintrail.io/origintrail-v9-v10
2. DKG v10 Round 1 Bounty: https://docs.origintrail.io/origintrail-v9-v10/origintrail-dkg-v10-bounty-program
3. PROV-O Specification: https://www.w3.org/TR/prov-o/
4. Schema.org ClaimReview: https://schema.org/ClaimReview
5. MCP Protocol Spec: https://modelcontextprotocol.io/
6. Immunefi Bug Bounty Program: https://immunefi.com/
7. Sherlock Audit Platform: https://www.sherlock.xyz/
8. Cantina Audit Platform: https://cantina.xyz/
9. HackenProof Bug Bounty: https://hackenproof.com/

---

**Document Version:** 1.1.0  
**Last Updated:** 2026-05-26  
**Status:** Final — Ready for Submission
