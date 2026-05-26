# dkg-claude-code-memory

[![CI](https://github.com/drMurlly/dkg-claude-code-memory/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/drMurlly/dkg-claude-code-memory/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dkg-claude-code-memory)](https://www.npmjs.com/package/dkg-claude-code-memory)
[![Demo](https://img.shields.io/badge/demo-asciinema-orange)](https://asciinema.org/a/2Fr7yXvOQvT6h2Ft)

An MCP server that gives Claude Code agents persistent, verifiable Working Memory on [OriginTrail DKG v10](https://origintrail.io). Every research finding, vulnerability analysis, code review, or decision a Claude Code agent produces is deposited into DKG Working Memory with cryptographic provenance — and can be retrieved, updated, and promoted toward Shared Memory across sessions and sub-agents.

Built for the [DKG v10 Round 1 Integrations Bounty](https://docs.origintrail.io/origintrail-v9-v10/origintrail-dkg-v10-bounty-program) — theme: *LLM-Wiki & Autoresearch Agents*.

---

## What it does

Claude Code sessions are stateless by default. Work disappears when the session ends. This server changes that:

- **Captures** research notes, vulnerability findings, code analyses, plans, and other artifacts into DKG v10 Working Memory with SHA-256 content hashes, timestamps, and agent provenance.
- **Retrieves** past artifacts via SPARQL — search by keyword, type, status, or session ID.
- **Tracks the trust gradient** — artifacts mature from `draft` → `needs_sources` → `review_needed` → `validated` → `ready_to_share`, reflecting the DKG v10 memory model.
- **Promotes** validated artifacts to Shared Working Memory for team peers to see (requires explicit user confirmation — never autonomous).
- **Synthesizes** all findings from a session into a structured `knowledge_synthesis` artifact at session end.
- **Attributes sub-agents** — provenance chains across parent/child Claude Code agent hierarchies are preserved with `subAgentId`, `parentTaskId`, and `agentRole` fields.
- **Queries shared memory** — retrieve artifacts shared by team peers across sessions.

---

## Tools

| Tool | Description |
|---|-|
| `capture_research_finding` | Write an artifact to DKG Working Memory with SHA-256 content hash, timestamp, and agent provenance |
| `search_working_memory` | SPARQL search by keyword, type, status, or session ID |
| `retrieve_artifact` | Retrieve full artifact content by UAL or URN reference |
| `update_artifact_status` | Advance an artifact through the trust gradient (draft → needs_sources → review_needed → validated → ready_to_share) |
| `promote_to_shared_memory` | Share validated artifacts with team peers (requires explicit user confirmation) |
| `synthesize_session` | Aggregate all artifacts from a session into a structured knowledge_synthesis artifact |
| `get_session_summary` | List all artifacts from a session with type counts and status breakdown |
| `query_shared_memory` | Query team-shared artifacts across peer sessions for collaborative research |
| `get_claim_review` | Generate a schema.org ClaimReview JSON-LD for an artifact — enables OriginTrail Oracle integration |
| `get_node_status` | Check DKG node reachability and measure latency |

---

## Sensitivity Field

Artifacts can be classified with a `sensitivity` level to control sharing behavior:

```typescript
capture_research_finding({
  content: "Private key handling vulnerability in withdraw()...",
  type: "vulnerability_finding",
  sensitivity: "confidential",  // Options: 'public' | 'internal' | 'confidential'
  status: "draft"
});
```

**Sensitivity Levels:**
- `public` — Safe for team sharing, no restrictions
- `internal` — Team members only, requires promotion
- `confidential` — Never eligible for promotion to Shared Memory

The level is stored on the artifact as `schema:accessMode`. The `promote_to_shared_memory` guard rejects any artifact tagged `confidential`, preventing accidental exposure of sensitive findings.

---

## derivedFrom Provenance Chain

Artifacts can reference parent artifacts to build verifiable provenance chains:

```typescript
capture_research_finding({
  content: "Reentrancy vulnerability in withdraw() allows recursive calls...",
  type: "vulnerability_finding",
  derivedFrom: [
    "urn:dkg:wm:d82c6a1b9f3e4c7d",  // Initial analysis
    "urn:dkg:wm:a17b93f0c2e4d518"   // Code review
  ],
  parentTaskId: "ccm-parent-session-id",
  subAgentId: "reentrancy-analyzer",
  agentRole: "security-auditor"
});
```

Each `derivedFrom` entry is an artifact URN (format `urn:dkg:wm:<16-hex-sha256-prefix>`). Each becomes a `prov:wasDerivedFrom` quad, creating a verifiable chain of custody that `search_working_memory` can trace forward via its `derivedFromId` filter.

---

## ClaimReview JSON-LD (Oracle-ready)

The `get_claim_review` tool fetches an artifact by ID and serializes it to a schema.org [ClaimReview](https://schema.org/ClaimReview) JSON-LD object, suitable for OriginTrail Oracle consumers. The serializer (`toClaimReview()` in `src/core/serializers.ts`) maps the artifact's trust-gradient status to a 1–5 `ratingValue`:

```typescript
get_claim_review({ artifactId: "urn:dkg:wm:d82c6a1b9f3e4c7d" });
// → result.claimReview:
// {
//   "@context": "https://schema.org/",
//   "@type": "ClaimReview",
//   "name": "Reentrancy in withdraw()",
//   "reviewBody": "The withdraw() function allows recursive calls before the balance is zeroed...",
//   "reviewRating": { "ratingValue": 4 },
//   "url": "urn:dkg:wm:d82c6a1b9f3e4c7d",
//   "datePublished": "2026-05-25T14:30:00.000Z"
// }
```

**Status → `ratingValue` mapping:**

| Status | ratingValue |
|---|---|
| `ready_to_share` | 5 |
| `validated` | 4 |
| `review_needed` | 3 |
| `needs_sources` | 2 |
| `draft` / `deprecated` / `discarded` | 1 |

- `name` ← artifact title
- `reviewBody` ← artifact content
- `url` ← artifact URN (`urn:dkg:wm:<16-hex-sha256-prefix>`)
- `datePublished` ← capture timestamp

---

## Requirements

- Node.js ≥ 22
- A running DKG v10 node (default: `http://127.0.0.1:9200`)
- A DKG auth token

---

## Installation

### OriginTrail Registry (install.kind='mcp')

```json
{
  "mcpServers": {
    "dkg-research-memory": {
      "install": {
        "kind": "mcp",
        "registry": "origintrail-dkg-v10",
        "package": "dkg-claude-code-memory",
        "version": "1.0.0"
      },
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

The `install.kind='mcp'` field signals OriginTrail registry compatibility for automated installation and version management.

### Via npx (no install)

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

Add this to your Claude Code MCP settings (`~/.claude/settings.json` → `mcpServers`).

### From source

```bash
git clone https://github.com/drMurlly/dkg-claude-code-memory.git
cd dkg-claude-code-memory
npm install
npm run build
```

```json
{
  "mcpServers": {
    "dkg-research-memory": {
      "command": "node",
      "args": ["/path/to/dkg-claude-code-memory/dist/index.js"],
      "env": {
        "DKG_AUTH_TOKEN": "YOUR_DKG_TOKEN_HERE"
      }
    }
  }
}
```

### Auth token

Set via env var or file:

```bash
# Option 1: env var
export DKG_AUTH_TOKEN=your-token

# Option 2: token file
echo "your-token" > ~/.dkg/auth.token
```

---

## Configuration

All settings are optional — defaults work for a local DKG v10 node.

| Env var | Default | Description |
|---|---|---|
| `DKG_AUTH_TOKEN` | required | DKG bearer token |
| `DKG_DAEMON_URL` | `http://127.0.0.1:9200` | DKG node HTTP API base URL |
| `DKG_WM_CONTEXT_GRAPH` | `ccm-research` | Context Graph name for artifacts |
| `DKG_WM_ASSERTION_NAME` | `artifacts` | Assertion name within the Context Graph |
| `DKG_CCM_STATE_DIR` | `~/.dkg/ccm-state` | Directory for deduplication state |
| `DKG_WM_AUTHOR_ID` | `unknown` | Author identifier written to provenance |
| `DKG_WM_AGENT_ID` | `claude-code-agent` | Agent identifier written to provenance |
| `DKG_WM_MIN_LENGTH` | `80` | Minimum content length to capture (chars) |
| `DKG_WM_REDACTION` | `true` | Redact secrets before writing (`false` to disable) |
| `DKG_WM_DEDUPE` | `true` | Skip duplicate content hashes (`false` to disable) |

---

## Artifact types

`chat` · `research_note` · `code_analysis` · `markdown` · `plan` · `summary` · `design_note` · `implementation_log` · `vulnerability_finding` · `audit_note` · `competitive_analysis` · `knowledge_synthesis` · `raw_capture` · `other`

## Artifact statuses (trust gradient)

`draft` → `needs_sources` → `review_needed` → `validated` → `ready_to_share` · `deprecated` · `discarded`

---

## Sub-agent attribution

When used with Claude Code Agent Teams, sub-agents can tag their artifacts with a provenance chain back to the parent session:

```typescript
capture_research_finding({
  content: "...",
  type: "vulnerability_finding",
  parentTaskId: "ccm-<parent-session-id>",
  subAgentId: "reentrancy-analyzer",
  agentRole: "security-auditor"
});
```

This creates a verifiable provenance chain across the full agent hierarchy, queryable via SPARQL.

---

## Development

```bash
npm run build           # Compile TypeScript
npm test                # Unit + integration tests (no DKG node needed)
npm run test:coverage   # Coverage report

# Live tests against a real DKG node:
DKG_INTEGRATION_TEST=1 npm run test:live
```

---

## DKG v10 memory model

This integration operates on the first two layers of the v10 trust gradient:

```
Working Memory   (private, agent-populated)      ← this integration
     ↓
Shared Memory    (team-readable, gossip-replicated)  ← promote_to_shared_memory
     ↓
Verified Memory  (chain-anchored, consensus-verified)   ← Round 2
```

All artifacts are shaped for forward-compatibility with Verified Memory and context oracle consumption: UAL references, status tags, and provenance records are structured so promotion to Verified Memory is a natural next step.

---

## License

Apache-2.0 — see [LICENSE](LICENSE).

---

## Acknowledgements

Built on [OriginTrail DKG v10](https://origintrail.io) and the [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk). Submitted under the DKG v10 Round 1 Integrations Bounty (`cfi-dkgv10-r1`).
