# Multi-Agent DKG Working Memory Guide

> **Purpose:** A practical guide for teams deploying multiple Claude Code agents that share a Distributed Knowledge Graph (DKG) Working Memory. This enables agents to build on each other's work without data silos, with full cryptographic provenance.

---

## 1) Problem: Agents Need to Build on Each Other's Work

Claude Code sessions are stateless by default. When an agent completes a task, its findings, code analysis, and research decisions disappear when the session ends. In a multi-agent team, this creates three critical problems:

**Data Silos:** Agent A discovers a vulnerability pattern in Contract X. Agent B starts working on Contract X the next day but has no knowledge of Agent A's findings. Both agents waste time rediscovering the same patterns.

**No Provenance:** When Agent C publishes a finding, there's no way to trace which earlier work informed it. Reviewers cannot verify the research chain, and the team cannot build cumulative knowledge.

**Session Fragmentation:** Long-horizon research tasks (e.g., auditing a full protocol) require multiple sessions. Without shared memory, each session starts from scratch, losing context and continuity.

**The DKG Solution:** This MCP server gives every Claude Code agent persistent, verifiable Working Memory on OriginTrail DKG v10. Every finding is deposited with cryptographic provenance and can be retrieved, updated, and promoted across sessions and agent clusters.

---

## 2) Setup: Shared DKG Node Configuration

Each agent in your team gets the **same MCP server config** pointing to a shared DKG node. This creates a unified knowledge base while allowing agents to specialize.

### Basic Configuration

Create a `claude_desktop_config.json` (or equivalent MCP config) with the following structure:

```json
{
  "mcpServers": {
    "dkg-claude-code-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_WM_CONTEXT_GRAPH": "ccm-research",
        "DKG_WM_AUTHOR_ID": "your-name",
        "DKG_WM_AGENT_ID": "agent-alpha"
      }
    }
  }
}
```

### Multi-Agent Team Setup

For a 3-agent research team (e.g., `agent-alpha`, `agent-beta`, `agent-gamma`), each agent gets its own config file with a unique `DKG_WM_AGENT_ID` but the same `DKG_DAEMON_URL`:

```json
{
  "mcpServers": {
    "dkg-claude-code-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_WM_CONTEXT_GRAPH": "ccm-research",
        "DKG_WM_AUTHOR_ID": "your-name",
        "DKG_WM_AGENT_ID": "agent-alpha"
      }
    }
  }
}
```

**Key Principle:** The `DKG_WM_AGENT_ID` identifies who created each memory entry. The `DKG_DAEMON_URL` is shared across all team members.

---

## 3) Capture with Provenance: Chaining Work via `derivedFrom`

The core innovation of DKG Working Memory is **provenance tracking**. Every new finding can reference earlier findings using the `derivedFrom` field, creating an auditable research chain.

### Basic Usage

When recording a new finding, include the `derivedFrom` field with the URN of the parent artifact, creating an auditable research chain:

```json
// Agent Alpha records initial finding via capture_research_finding MCP tool
{
  "tool": "capture_research_finding",
  "arguments": {
    "content": "Reentrancy vulnerability in Vault.sol:withdraw() at line 234 — missing reentrancy guard allows recursive calls before balance update",
    "artifactType": "vulnerability_finding",
    "title": "Reentrancy in Vault.withdraw()",
    "sensitivity": "internal"
  }
}
// Returns: { artifactId: "urn:dkg:wm:7f3a2b1c9d0e4f56", contentHash: "sha256:...", success: true }

// Agent Beta builds on Alpha's finding — derivedFrom creates the prov:wasDerivedFrom chain
{
  "tool": "capture_research_finding",
  "arguments": {
    "content": "PoC demonstrating 50% fund drain via reentrancy in Vault.withdraw(). forge test passes on mainnet fork block 21500000.",
    "artifactType": "code_analysis",
    "title": "PoC: Vault.withdraw() reentrancy drain",
    "derivedFrom": ["urn:dkg:wm:7f3a2b1c9d0e4f56"],
    "sensitivity": "confidential"
  }
}
```

### Provenance Chain Example

A typical research chain might look like:

1. **Agent Alpha** discovers a potential integer overflow in `calculateRewards()`
   - Hash: `0xabc123...`
   - Type: `code_analysis`

2. **Agent Beta** writes a fuzz test that triggers the overflow
   - Hash: `0xdef456...`
   - Type: `code_analysis`
   - `derivedFrom`: `0xabc123...`

3. **Agent Gamma** analyzes the economic impact and calculates max loss
   - Hash: `0xghi789...`
   - Type: `competitive_analysis`
   - `derivedFrom`: `0xdef456...`

4. **Agent Alpha** (second session) writes the formal submission
   - Hash: `0xjkl012...`
   - Type: `audit_note`
   - `derivedFrom`: `0xghi789...`

**Querying the Chain:** To retrieve the full chain, use `search_working_memory` with the parent hash as a filter, then recursively query each child.

---

## 4) Search and Discover: Finding Relevant Work

Agents need to discover existing findings before starting new work. The DKG provides two primary search mechanisms:

### `search_working_memory`

Searches the agent's local working memory scope. Best for finding recent work by your team.

```json
// Find all findings related to a specific contract
{
  "tool": "search_working_memory",
  "arguments": {
    "keyword": "Vault.sol",
    "type": "vulnerability_finding",
    "limit": 20
  }
}

// Find findings derived from a specific parent artifact
{
  "tool": "search_working_memory",
  "arguments": {
    "derivedFromId": "urn:dkg:wm:abc123...",
    "limit": 50
  }
}
```

### `query_shared_memory`

Queries the broader Shared Memory pool — findings that have been promoted. Accepts a keyword/text search string; the server performs a CONTAINS keyword filter (over title and text) against promoted Working Memory artifacts in the Shared (Working) Memory view and returns `{id, ual, title, snippet, type, status}` results — pass `id` to `retrieve_artifact` to fetch the full artifact. It is NOT a raw SPARQL query.

```json
// Search for similar reentrancy patterns in Shared Memory
{
  "tool": "query_shared_memory",
  "arguments": {
    "query": "reentrancy vault withdraw",
    "limit": 10
  }
}
```

### Search Best Practices

1. **Always search before starting new work** — Check if someone already discovered what you're about to find.
2. **Use specific queries** — Include contract names, function signatures, and vulnerability types.
3. **Filter by type** — Narrow results to `vulnerability_finding`, `code_analysis`, `competitive_analysis`, etc.
4. **Track provenance** — When you build on someone else's finding, always use `derivedFrom`.

---

## 5) Promote to Shared Memory: Cross-Cluster Knowledge

Working Memory is scoped to your agent cluster. To make findings available to the broader community (or other teams), you must **promote** them to Shared Memory.

### When to Promote

Promote a finding when:
- The finding has been verified (PoC passes on mainnet fork)
- The finding is complete (includes impact analysis, remediation suggestions)
- The finding is novel (checked against Solodit/Cyfrin DB for prior art)
- You want other teams to benefit from your research

### Promotion Process

```json
// First advance status to ready_to_share
{
  "tool": "update_artifact_status",
  "arguments": {
    "artifactId": "urn:dkg:wm:jkl012...",
    "newStatus": "ready_to_share"
  }
}

// Then promote — requires confirm: true and sensitivity must not be "confidential"
{
  "tool": "promote_to_shared_memory",
  "arguments": {
    "artifactId": "urn:dkg:wm:jkl012...",
    "confirm": true
  }
}
```

### Shared Memory Query

Once promoted, the finding becomes queryable by any agent with access to the shared memory pool via keyword search:

```json
{
  "tool": "query_shared_memory",
  "arguments": {
    "query": "reentrancy vault",
    "limit": 5
  }
}
```

**Note:** Promotion is irreversible. Ensure findings are accurate and complete before promoting.

---

## 6) Sensitivity Controls: Keeping Internal Work Private

Not all work should be shared. The DKG supports sensitivity controls to keep internal research private while still benefiting from team collaboration.

### Memory Scopes

1. **Working Memory (default):** Visible to agents in your team cluster. Private from external agents.
2. **Shared Memory (promoted):** Visible to all agents with access to the shared pool.

### Setting Sensitivity Levels

```json
// Draft with internal sensitivity — blocked from promotion until reviewed
{
  "tool": "capture_research_finding",
  "arguments": {
    "content": "Initial thoughts on potential issue — needs PoC verification before sharing",
    "artifactType": "research_note",
    "title": "Draft: possible price manipulation in Vault",
    "sensitivity": "internal"
  }
}

// Confidential — promotion guard enforced: cannot be promoted to Shared Memory
{
  "tool": "capture_research_finding",
  "arguments": {
    "content": "Confirmed reentrancy via forge test on block 21500000. Attacker can drain 50% of TVL.",
    "artifactType": "vulnerability_finding",
    "title": "CONFIRMED: Vault.withdraw() reentrancy",
    "sensitivity": "confidential"
  }
}
```

Valid sensitivity values: `'public' | 'internal' | 'confidential'`

### Best Practices

- Use `internal` for drafts, hypotheses, and unverified findings
- Use `confidential` for sensitive findings requiring explicit approval before sharing
- Use `public` (via promotion) only for verified, novel, complete findings
- When in doubt, start `internal` and promote later

---

## 7) Session Summaries: End-of-Session Captures

Each agent should generate a `session-summary` at the end of every session. This creates a checkpoint that can be referenced in future sessions and provides a high-level view of the agent's contributions.

### Session Summary Format

Use `synthesize_session` at the end of each session to aggregate all artifacts into a structured `knowledge_synthesis` record:

```json
// At the end of each session — synthesize_session aggregates all artifacts automatically
{
  "tool": "synthesize_session",
  "arguments": {
    "sessionId": "2026-01-15-agent-alpha-001",
    "title": "Vault.sol audit session — Agent Alpha recon"
  }
}
// Returns: knowledge_synthesis artifact with type counts, status breakdown, consolidated content

// Check session state before synthesizing
{
  "tool": "get_session_summary",
  "arguments": {
    "sessionId": "2026-01-15-agent-alpha-001"
  }
}
```

### Retrieving Session History

```json
// Search for synthesis artifacts from past sessions
{
  "tool": "search_working_memory",
  "arguments": {
    "type": "knowledge_synthesis",
    "limit": 10
  }
}

// Retrieve a specific synthesis artifact by ID
{
  "tool": "retrieve_artifact",
  "arguments": {
    "artifactId": "urn:dkg:wm:synthesis-abc123..."
  }
}
```

**Why Session Summaries Matter:**
- Provide context for the next session
- Enable handoffs between agents
- Create audit trails for research decisions
- Help identify bottlenecks and workflow improvements

---

## 8) Complete CLAUDE.md Snippet for Multi-Agent Setup

Below is a ready-to-use `CLAUDE.md` configuration snippet for a 3-agent security research team:

```markdown
# Multi-Agent DKG Configuration

## Team Structure

- **agent-alpha**: Static analysis and vulnerability discovery
- **agent-beta**: PoC development and fuzz testing
- **agent-gamma**: Economic impact analysis and submission drafting

## Shared Configuration

All agents use the same DKG node URL with unique `DKG_WM_AGENT_ID` values:

```json
{
  "mcpServers": {
    "dkg-claude-code-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_WM_CONTEXT_GRAPH": "ccm-research",
        "DKG_WM_AUTHOR_ID": "your-name",
        "DKG_WM_AGENT_ID": "agent-alpha"
      }
    }
  }
}
```

## Agent-Specific Configs

### agent-alpha (static-analysis)

```json
{
  "mcpServers": {
    "dkg-claude-code-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_WM_CONTEXT_GRAPH": "ccm-research",
        "DKG_WM_AUTHOR_ID": "your-name",
        "DKG_WM_AGENT_ID": "agent-alpha"
      }
    }
  }
}
```

### agent-beta (poc-development)

```json
{
  "mcpServers": {
    "dkg-claude-code-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_WM_CONTEXT_GRAPH": "ccm-research",
        "DKG_WM_AUTHOR_ID": "your-name",
        "DKG_WM_AGENT_ID": "agent-beta"
      }
    }
  }
}
```

### agent-gamma (economic-analysis)

```json
{
  "mcpServers": {
    "dkg-claude-code-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_WM_CONTEXT_GRAPH": "ccm-research",
        "DKG_WM_AUTHOR_ID": "your-name",
        "DKG_WM_AGENT_ID": "agent-gamma"
      }
    }
  }
}
```

## Workflow

1. **agent-alpha** discovers vulnerability → creates finding with `sensitivity: "internal"`
2. **agent-beta** reads finding via `search_working_memory` → writes PoC with `derivedFrom`
3. **agent-gamma** reads PoC → calculates economic impact with `derivedFrom`
4. **agent-alpha** (next session) reads all findings → drafts submission
5. **agent-gamma** promotes verified finding to `shared memory`

## Tools Available to Each Agent

- `capture_research_finding`: Record new findings with provenance, derivedFrom, and sensitivity
- `search_working_memory`: Find past artifacts by keyword, type, status, or provenance chain
- `retrieve_artifact`: Retrieve full content of a specific artifact by URN
- `update_artifact_status`: Advance artifact through trust gradient (draft → validated → ready_to_share)
- `promote_to_shared_memory`: Move verified artifact to Shared Memory (requires `confirm: true`)
- `synthesize_session`: Aggregate all session artifacts into a knowledge_synthesis record
- `get_session_summary`: List artifacts in a session with type counts and status breakdown
- `query_shared_memory`: Keyword/text search over Shared Memory (returns matching promoted artifacts)
- `get_claim_review`: Generate schema.org ClaimReview JSON-LD from any artifact
- `get_node_status`: Check DKG node health and connection latency
````

---

## Summary

This guide covers the essential patterns for multi-agent collaboration using DKG Working Memory:

1. **Problem:** Stateless sessions create data silos and lose provenance
2. **Setup:** Shared DKG node URL (`DKG_DAEMON_URL`) with unique `DKG_WM_AGENT_ID` per agent
3. **Provenance:** Use `derivedFrom` to chain findings into auditable research chains
4. **Discovery:** Search working memory before starting new work
5. **Promotion:** Move verified findings to shared memory for broader access
6. **Sensitivity:** Three-tier access control (`public` / `internal` / `confidential`) with promotion guard
7. **Session Summaries:** Create checkpoints for continuity and handoffs
8. **Configuration:** Ready-to-use CLAUDE.md snippet for 3-agent teams

By following these patterns, your team can build cumulative, verifiable knowledge that persists across sessions and agents — turning individual research efforts into a coordinated, traceable body of work.

---

> **Reference:** See `README.md` for installation and `docs/DEMO_SCRIPT.md` for a complete multi-agent scenario walkthrough.
