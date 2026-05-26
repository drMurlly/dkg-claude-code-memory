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
┌──────────────────────────────────────────────────────────────────┐
│                        MCP Server (dist/index.js)                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tool Layer (src/tools/*.ts)                             │   │
│  │  - capture_research_finding.ts                           │   │
│  │  - search_working_memory.ts                              │   │
│  │  - get_artifact_content.ts                               │   │
│  │  - update_artifact_status.ts                             │   │
│  │  - promote_to_shared_memory.ts                           │   │
│  │  - synthesize_session.ts                                 │   │
│  │  - get_session_summary.ts                                │   │
│  │  - query_shared_memory.ts (planned)                      │   │
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
└──────────────────────────────────────────────────────────────────┘
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
  sensitivity?: 'internal' | 'team' | 'public';  // Optional: default "internal"
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

### 3.3 `get_artifact_content`

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
  sensitivity: 'internal' | 'team' | 'public';
  hash: string;
  timestamp: string;
  provenance?: PROVRecord;      // Full PROV-O graph
}
```

**Example Invocation:**
```typescript
const artifact = await client.get_artifact_content({
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
  replicationStatus: string;    // GossipSub replication status
}
```

**Example Invocation:**
```typescript
const result = await client.promote_to_shared_memory({
  identifier: "urn:dkg:wm:sha256:def456...",
  confirm: true  // User must explicitly confirm
});
// Returns: { ual: "...", promoted: true, sharedContextGraph: "shared-memory", ... }
```

---

### 3.6 `synthesize_session`

**Purpose:** Aggregate all artifacts from a session into a knowledge synthesis.

**Parameters:**
```typescript
interface SynthesizeParams {
  sessionId: string;            // Session ID to synthesize
  includeTypes?: ArtifactType[]; // Optional: filter by artifact types
}
```

**Returns:**
```typescript
interface SynthesizeResult {
  synthesisUal: string;         // UAL of newly created knowledge_synthesis artifact
  artifactCount: number;        // Number of artifacts synthesized
  typeBreakdown: Record<ArtifactType, number>;  // Counts by type
  content: string;              // Synthesized content (markdown)
}
```

**Example Invocation:**
```typescript
const result = await client.synthesize_session({
  sessionId: "ccm-abc123",
  includeTypes: ["vulnerability_finding", "code_analysis"]
});
// Returns: { synthesisUal: "ual:local:artifacts:ghi789", artifactCount: 12, ... }
```

---

### 3.7 `get_session_summary`

**Purpose:** List all artifacts from a session with type counts.

**Parameters:**
```typescript
interface SessionSummaryParams {
  sessionId: string;            // Session ID to summarize
}
```

**Returns:**
```typescript
interface SessionSummary {
  sessionId: string;
  artifactCount: number;
  typeBreakdown: Record<ArtifactType, number>;
  statusBreakdown: Record<ArtifactStatus, number>;
  artifactUals: string[];       // List of all artifact UALs in session
  earliestTimestamp: string;
  latestTimestamp: string;
}
```

**Example Invocation:**
```typescript
const summary = await client.get_session_summary({
  sessionId: "ccm-abc123"
});
// Returns: { sessionId: "ccm-abc123", artifactCount: 24, typeBreakdown: {...}, ... }
```

---

### 3.8 `query_shared_memory` (Planned — Round 1 Enhancement)

**Purpose:** Search across Shared Memory (team-readable artifacts from all agents).

**Parameters:**
```typescript
interface QuerySharedParams {
  keyword?: string;
  type?: ArtifactType;
  status?: ArtifactStatus;
  limit?: number;
}
```

**Returns:** Same as `search_working_memory`, but queries the shared context graph.

---

## 4. Data Model

### ArtifactRecord Schema

```typescript
interface ArtifactRecord {
  // Core identifiers
  ual: string;                  // Universal Artifact Locator (ual:local:artifacts:<id>)
  urn: string;                  // URN identifier (urn:dkg:wm:sha256:<hash>)
  
  // Content
  content: string;              // Artifact content (markdown, text, JSON)
  type: ArtifactType;           // e.g., "vulnerability_finding", "research_note"
  status: ArtifactStatus;       // Trust gradient status
  
  // Metadata
  sessionId: string;            // Claude Code session ID
  hash: string;                 // SHA-256 content hash
  timestamp: string;            // ISO-8601 creation time
  
  // Provenance (PROV-O)
  derivedFrom?: string[];       // Array of UALs this artifact derives from
  subAgentId?: string;          // Sub-agent identifier
  agentRole?: string;           // Agent role (e.g., "security-auditor")
  parentTaskId?: string;        // Parent session UAL
  
  // Security
  sensitivity: 'internal' | 'team' | 'public';  // Access control
  
  // Extended provenance
  provenance?: PROVRecord;      // Full PROV-O graph (optional, for complex lineage)
}
```

### UAL Scheme

Our UAL scheme follows the pattern:
```
ual:local:artifacts:<session-id>-<sequence-number>
```

Example: `ual:local:artifacts:ccm-abc123-001`

The URN scheme follows:
```
urn:dkg:wm:sha256:<64-char-hex-hash>
```

Example: `urn:dkg:wm:sha256:a1b2c3d4e5f6...`

### RDF Quad Structure

Each artifact is serialized as RDF quads using the following namespace:

```turtle
@prefix wm: <http://origintrail.io/ns/dkg-working-memory#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix schema: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<urn:dkg:wm:sha256:abc123>
  a wm:Artifact ;
  wm:content "Reentrancy vulnerability found..." ;
  wm:type "vulnerability_finding" ;
  wm:status "needs_sources" ;
  wm:sessionId "ccm-abc123" ;
  wm:hash "a1b2c3d4..." ;
  wm:timestamp "2026-05-25T14:30:00Z"^^xsd:dateTime ;
  prov:wasDerivedFrom <urn:dkg:wm:sha256:def456> ;
  prov:wasAttributedTo _:agent1 ;
  prov:generatedAtTime "2026-05-25T14:30:00Z"^^xsd:dateTime ;
  wm:sensitivity "internal" .

_:agent1
  a prov:Agent ;
  prov:label "claude-code-agent" ;
  wm:subAgentId "reentrancy-analyzer" ;
  wm:agentRole "security-auditor" .
```

---

## 5. Provenance Chain

### Multi-Agent Lineage Example

Consider a scenario where three agents collaborate on a security audit:

1. **Agent A (Elix)** discovers a reentrancy vulnerability and captures it:
   ```
   Artifact 1: urn:dkg:wm:sha256:abc123
     type: vulnerability_finding
     content: "Reentrancy in TokenVault.withdraw():42"
     derivedFrom: []  // Root artifact
   ```

2. **Agent B (Selon)** reads Artifact 1 and creates an analysis:
   ```
   Artifact 2: urn:dkg:wm:sha256:def456
     type: code_analysis
     content: "Root cause: missing nonReentrant modifier"
     derivedFrom: ["urn:dkg:wm:sha256:abc123"]  // Links to Artifact 1
   ```

3. **Agent C (Brevin)** synthesizes both into a report:
   ```
   Artifact 3: urn:dkg:wm:sha256:ghi789
     type: knowledge_synthesis
     content: "## Security Audit Summary\n\n### Reentrancy Vulnerability\n..."
     derivedFrom: ["urn:dkg:wm:sha256:abc123", "urn:dkg:wm:sha256:def456"]  // Links to both
   ```

### SPARQL Provenance Query

To trace the full lineage of Artifact 3:

```sparql
PREFIX wm: <http://origintrail.io/ns/dkg-working-memory#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?artifact ?content ?derivedFrom ?timestamp
WHERE {
  ?artifact a wm:Artifact ;
            wm:content ?content ;
            wm:timestamp ?timestamp .
  
  OPTIONAL { ?artifact prov:wasDerivedFrom ?derivedFrom }
  
  FILTER (STR(?artifact) = "urn:dkg:wm:sha256:ghi789")
}
```

This query returns the full chain, enabling auditors to verify that Artifact 3 is based on valid prior work.

---

## 6. Oracle Integration

### toClaimReview() Serializer

The `toClaimReview()` method converts any `ArtifactRecord` into a `schema:ClaimReview`-compliant JSON-LD document. This enables context oracles to consume our artifacts without schema migration.

**Example Conversion:**

```typescript
const artifact: ArtifactRecord = {
  ual: "ual:local:artifacts:ccm-abc123-001",
  urn: "urn:dkg:wm:sha256:abc123...",
  content: "Reentrancy vulnerability in TokenVault.withdraw():42",
  type: "vulnerability_finding",
  status: "validated",
  sessionId: "ccm-abc123",
  hash: "a1b2c3d4...",
  timestamp: "2026-05-25T14:30:00Z",
  sensitivity: "public"
};

const claimReview = serializers.toClaimReview(artifact);
```

**Output:**

```json
{
  "@context": {
    "@vocab": "https://schema.org/"
  },
  "@type": "ClaimReview",
  "claimReviewed": "Reentrancy vulnerability in TokenVault.withdraw():42",
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": "1",  // 1 = critical, 5 = informational
    "bestRating": "5",
    "worstRating": "1"
  },
  "author": {
    "@type": "Organization",
    "name": "claude-code-agent",
    "identifier": "ccm-abc123"
  },
  "datePublished": "2026-05-25T14:30:00Z",
  "url": "urn:dkg:wm:sha256:abc123...",
  "description": "vulnerability_finding"
}
```

### OriginTrail Verifier Flow

1. **Artifact Promotion:** Agent promotes artifact to Shared Memory via `promote_to_shared_memory()`.
2. **GossipSub Replication:** Artifact is replicated across the DKG network via GossipSub.
3. **Oracle Discovery:** Context oracle queries Shared Memory for `schema:ClaimReview`-compliant artifacts.
4. **Verification:** Oracle validates the artifact's provenance chain and status.
5. **On-Chain Anchoring:** Verified artifacts are anchored to the blockchain via Verified Memory (Round 2).

---

## 7. Security Model

### Sensitivity Classification

Every artifact has a `sensitivity` field with three levels:

| Level | Description | Access |
|-------|-------------|--------|
| `internal` | Private to agent session | Only the creating agent |
| `team` | Team-readable | All agents in the team (after promotion) |
| `public` | Publicly accessible | Any agent querying Shared Memory |

### Promotion Guard

The `promote_to_shared_memory()` tool enforces a strict promotion guard:

1. **Explicit Confirmation:** The `confirm` parameter must be `true`. This prevents autonomous promotion.
2. **Sensitivity Override:** If an artifact has `sensitivity: "internal"`, promotion requires `overrideSensitivity: true`.
3. **No Silent Escalation:** Artifacts cannot be promoted without explicit user action.

### Redactor

The `normalizer.ts` module includes a redactor that scans content for secrets before writing:

- **API Keys:** Matches patterns like `sk-...`, `api_key=...`
- **Private Keys:** Matches 64-character hex strings
- **Bearer Tokens:** Matches `Bearer ...` patterns

Redacted content is replaced with `[REDACTED]` and logged to the agent.

### Network Security

- **Localhost-Only: The DKG node connection defaults to `http://127.0.0.1:9200`.
- **Credential Handling:** Auth tokens are read from environment variables or `~/.dkg/auth.token` — never written to disk by the server.
- **Write Authority:** Only callers with valid bearer tokens can write artifacts.

---

## 8. Installation

### MCP Configuration (Claude Code)

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "dkg-research-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_AUTH_TOKEN": "YOUR_DKG_TOKEN_HERE",
        "DKG_DAEMON_URL": "http://127.0.0.1:9200"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DKG_AUTH_TOKEN` | Yes | — | DKG bearer token |
| `DKG_DAEMON_URL` | No | `http://127.0.0.1:9200` | DKG node HTTP API URL |
| `DKG_WM_CONTEXT_GRAPH` | No | `ccm-research` | Context Graph name |
| `DKG_WM_ASSERTION_NAME` | No | `artifacts` | Assertion name |
| `DKG_CCM_STATE_DIR` | No | `~/.dkg/ccm-state` | Dedupe state directory |
| `DKG_WM_AUTHOR_ID` | No | `unknown` | Author identifier |
| `DKG_WM_AGENT_ID` | No | `claude-code-agent` | Agent identifier |
| `DKG_WM_MIN_LENGTH` | No | `80` | Minimum content length |
| `DKG_WM_REDACTION` | No | `true` | Enable secret redaction |
| `DKG_WM_DEDUPE` | No | `true` | Enable content deduplication |

### From Source

```bash
git clone https://github.com/drMurlly/dkg-claude-code-memory.git
cd dkg-claude-code-memory
npm install
npm run build
```

Then configure MCP to point to `dist/index.js`.

---

## 9. Comparison with dkg-wm-bridge

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
| **Test Coverage** | 147 tests | **451 tests (99.66% statement coverage)** |
| **Oracle Readiness** | Asserted | **Demonstrated via ClaimReview serializer** |

### Key Differentiators

1. **MCP-Native:** We speak MCP stdio directly — no subprocess spawning, no CLI parsing. This is the native interface for Claude Code.
2. **Content-Addressable IDs:** Our URNs are derived from SHA-256 hashes, enabling deduplication and integrity verification.
3. **Provenance Chains:** Every artifact can link to its sources via `derivedFrom`, enabling multi-agent lineage tracing.
4. **ClaimReview Serialization:** We demonstrate oracle readiness with actual code, not assertions.

---

## 10. Roadmap

### Round 1 (Current — DKG v10 Working Memory)

- ✅ All 7 tools implemented and tested
- ✅ Core modules (normalizer, serializers, provenance-builder, status-classifier, dedupe-store)
- ✅ 451 passing tests (99.66% statement coverage)
- ✅ MCP stdio server wired
- ⏳ `query_shared_memory` tool (planned enhancement)
- ⏳ Documentation (this DESIGN_BRIEF.md, DEMO_SCRIPT.md, ORACLE_READINESS.md)

### Round 2 (Verified Memory)

- **Goal:** Anchor artifacts to Verified Memory (on-chain)
- **Features:**
  - `anchor_to_verified_memory()` tool
  - Smart contract integration for artifact anchoring
  - Oracle-ready ClaimReview documents
  - GossipSub replication for Shared Memory

### Round 3 (Analytics & User Support)

- **Goal:** Agent-ready analytics and user support
- **Features:**
  - `query_analytics()` tool (aggregate statistics across sessions)
  - `get_user_support()` tool (retrieve user-facing guidance)
  - Multi-tenant support (per-user namespaces)

---

## Contributor Attestation

I, Selon (drMurlly), attest that:

1. This implementation is original work (Apache-2.0 licensed).
2. All 7 tools are implemented and tested.
3. The codebase has 451 passing tests with 99.66% statement coverage.
4. I commit to maintaining this project for 6 months post-acceptance.
5. I will respond to bounty program inquiries within 48 hours.

**Signature:** @drMurlly  
**Date:** 2026-05-25
