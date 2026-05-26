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
    "dkg-working-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_CONTEXT_GRAPH": "working-memory",
        "DKG_AUTHOR_ID": "your-name",
        "DKG_AGENT_ID": "agent-alpha"
      }
    }
  }
}
```

### Multi-Agent Team Setup

For a 3-agent research team (e.g., `agent-alpha`, `agent-beta`, `agent-gamma`), each agent gets its own config file with a unique `DKG_AGENT_ID` but the same `DKG_DAEMON_URL`:

```json
{
  "mcpServers": {
    "dkg-working-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_CONTEXT_GRAPH": "working-memory",
        "DKG_AUTHOR_ID": "your-name",
        "DKG_AGENT_ID": "agent-alpha"
      }
    }
  }
}
```

**Key Principle:** The `DKG_AGENT_ID` identifies who created each memory entry. The `DKG_DAEMON_URL` is shared across all team members.

---

## 3) Capture with Provenance: Chaining Work via `derivedFrom`

The core innovation of DKG Working Memory is **provenance tracking**. Every new finding can reference earlier findings using the `derivedFrom` field, creating an auditable research chain.

### Basic Usage

When recording a new finding, include the `derivedFrom` field with the hash of the parent finding:

```typescript
// Agent Alpha records initial finding
const findingAlpha = await client.createMemory({
  type: "vulnerability-discovery",
  content: "Reentrancy vulnerability in withdraw() function",
  contract: "Vault.sol:234",
  severity: "high",
  agentId: "agent-alpha"
});
// Returns: { hash: "0xabc123...", timestamp: "2026-01-15T10:30:00Z" }

// Agent Beta builds on Alpha's finding
const findingBeta = await client.createMemory({
  type: "exploit-poc",
  content: "PoC demonstrating 50% fund drain via reentrancy",
  derivedFrom: "0xabc123...",  // ← Links to Alpha's finding
  contract: "Vault.sol:234",
  agentId: "agent-beta"
});
```

### Provenance Chain Example

A typical research chain might look like:

1. **Agent Alpha** discovers a potential integer overflow in `calculateRewards()`
   - Hash: `0xabc123...`
   - Type: `static-analysis-finding`

2. **Agent Beta** writes a fuzz test that triggers the overflow
   - Hash: `0xdef456...`
   - Type: `poc-test`
   - `derivedFrom`: `0xabc123...`

3. **Agent Gamma** analyzes the economic impact and calculates max loss
   - Hash: `0xghi789...`
   - Type: `economic-impact-analysis`
   - `derivedFrom`: `0xdef456...`

4. **Agent Alpha** (second session) writes the formal submission
   - Hash: `0xjkl012...`
   - Type: `bug-bounty-submission`
   - `derivedFrom`: `0xghi789...`

**Querying the Chain:** To retrieve the full chain, use `search_working_memory` with the parent hash as a filter, then recursively query each child.

---

## 4) Search and Discover: Finding Relevant Work

Agents need to discover existing findings before starting new work. The DKG provides two primary search mechanisms:

### `search_working_memory`

Searches the agent's local working memory scope. Best for finding recent work by your team.

```typescript
// Find all findings related to a specific contract
const results = await client.searchWorkingMemory({
  query: "Vault.sol",
  filters: {
    type: "vulnerability-discovery",
    since: "2026-01-01T00:00:00Z"
  }
});

// Find findings derived from a specific parent
const children = await client.searchWorkingMemory({
  query: "",
  filters: {
    derivedFrom: "0xabc123..."
  }
});
```

### `query_shared_memory`

Queries the broader shared memory pool, including findings from other agent clusters that have been promoted. This is useful for:

- Discovering similar vulnerabilities in other protocols
- Finding patterns that might apply to your current target
- Avoiding duplicate submissions

```typescript
// Search for similar reentrancy patterns across protocols
const similar = await client.querySharedMemory({
  query: "reentrancy withdraw() external payable",
  filters: {
    severity: "high",
    type: "vulnerability-discovery"
  }
});
```

### Search Best Practices

1. **Always search before starting new work** — Check if someone already discovered what you're about to find.
2. **Use specific queries** — Include contract names, function signatures, and vulnerability types.
3. **Filter by type** — Narrow results to `vulnerability-discovery`, `poc-test`, `economic-impact-analysis`, etc.
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

```typescript
// Promote a verified finding to shared memory
const sharedHash = await client.promoteToSharedMemory({
  workingMemoryHash: "0xjkl012...",
  visibility: "public",  // or "team-only" for internal findings
  tags: ["reentrancy", "high-severity", "vault-protocol"]
});
```

### Shared Memory Query

Once promoted, the finding becomes queryable by any agent with access to the shared memory pool:

```typescript
// Any agent can now discover this finding
const discovery = await client.querySharedMemory({
  query: "Vault.sol reentrancy",
  filters: {
    promotedAfter: "2026-01-15T00:00:00Z"
  }
});
```

**Note:** Promotion is irreversible. Ensure findings are accurate and complete before promoting.

---

## 6) Sensitivity Controls: Keeping Internal Work Private

Not all work should be shared. The DKG supports sensitivity controls to keep internal research private while still benefiting from team collaboration.

### Memory Scopes

1. **Working Memory (default):** Visible to agents in your team cluster. Private from external agents.
2. **Shared Memory (promoted):** Visible to all agents with access to the shared pool.
3. **Private Memory (agent-local):** Visible only to the creating agent. Not synced to DKG.

### Setting Sensitivity Levels

```typescript
// Create a finding with restricted visibility
const internalFinding = await client.createMemory({
  type: "draft-analysis",
  content: "Initial thoughts on potential issue — needs verification",
  sensitivity: "internal",  // Only visible to this agent's working memory
  agentId: "agent-alpha"
});

// Create a finding ready for broader review
const publicFinding = await client.createMemory({
  type: "vulnerability-discovery",
  content: "Confirmed reentrancy in withdraw()",
  sensitivity: "public",  // Visible to all agents after promotion
  agentId: "agent-alpha"
});
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

```typescript
// At the end of each session
await client.createMemory({
  type: "session-summary",
  content: {
    sessionId: "2026-01-15-agent-alpha-001",
    startTime: "2026-01-15T09:00:00Z",
    endTime: "2026-01-15T17:30:00Z",
    findingsCreated: ["0xabc123...", "0xdef456..."],
    findingsUpdated: ["0xghi789..."],
    findingsRead: ["0xjkl012..."],
    keyDecisions: [
      "Decided to focus on Vault.sol over Token.sol due to higher TVL",
      "Confirmed reentrancy via fuzz test, proceeding to economic analysis"
    ],
    nextSteps: [
      "Agent Beta to write formal PoC",
      "Agent Gamma to calculate max economic impact"
    ]
  },
  agentId: "agent-alpha"
});
```

### Retrieving Session History

```typescript
// Get all sessions for an agent
const sessions = await client.searchWorkingMemory({
  query: "",
  filters: {
    type: "session-summary",
    agentId: "agent-alpha"
  }
});

// Get sessions in date range
const recentSessions = await client.searchWorkingMemory({
  query: "",
  filters: {
    type: "session-summary",
    since: "2026-01-01T00:00:00Z"
  }
});
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

All agents use the same DKG node URL with unique `DKG_AGENT_ID` values:

```json
{
  "mcpServers": {
    "dkg-working-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_CONTEXT_GRAPH": "working-memory",
        "DKG_AUTHOR_ID": "your-name",
        "DKG_AGENT_ID": "agent-alpha"
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
    "dkg-working-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_CONTEXT_GRAPH": "working-memory",
        "DKG_AUTHOR_ID": "your-name",
        "DKG_AGENT_ID": "agent-alpha"
      }
    }
  }
}
```

### agent-beta (poc-development)

```json
{
  "mcpServers": {
    "dkg-working-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_CONTEXT_GRAPH": "working-memory",
        "DKG_AUTHOR_ID": "your-name",
        "DKG_AGENT_ID": "agent-beta"
      }
    }
  }
}
```

### agent-gamma (economic-analysis)

```json
{
  "mcpServers": {
    "dkg-working-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_DAEMON_URL": "http://127.0.0.1:9200",
        "DKG_AUTH_TOKEN": "your-bearer-token",
        "DKG_CONTEXT_GRAPH": "working-memory",
        "DKG_AUTHOR_ID": "your-name",
        "DKG_AGENT_ID": "agent-gamma"
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

- `create_memory`: Record new findings with provenance
- `search_working_memory`: Find team findings
- `query_shared_memory`: Discover external findings
- `promote_to_shared_memory`: Make findings public
- `get_memory`: Retrieve specific finding by hash
- `update_memory`: Amend existing findings
- `create_session_summary`: End-of-session checkpoint
- `query_provenance_chain`: Trace finding ancestry
````

---

## Summary

This guide covers the essential patterns for multi-agent collaboration using DKG Working Memory:

1. **Problem:** Stateless sessions create data silos and lose provenance
2. **Setup:** Shared DKG node URL (`DKG_DAEMON_URL`) with unique `DKG_AGENT_ID` per agent
3. **Provenance:** Use `derivedFrom` to chain findings into auditable research chains
4. **Discovery:** Search working memory before starting new work
5. **Promotion:** Move verified findings to shared memory for broader access
6. **Sensitivity:** Control visibility with private/team/public scopes
7. **Session Summaries:** Create checkpoints for continuity and handoffs
8. **Configuration:** Ready-to-use CLAUDE.md snippet for 3-agent teams

By following these patterns, your team can build cumulative, verifiable knowledge that persists across sessions and agents — turning individual research efforts into a coordinated, traceable body of work.

---

> **Reference:** See `README.md` for installation and `docs/DEMO_SCRIPT.md` for a complete multi-agent scenario walkthrough.
