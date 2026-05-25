# dkg-claude-code-memory

An MCP server that gives Claude Code agents persistent, verifiable Working Memory on [OriginTrail DKG v10](https://origintrail.io). Every research finding, vulnerability, code analysis, or decision a Claude Code agent produces is deposited into DKG Working Memory with cryptographic provenance — and can be retrieved, updated, and promoted toward Shared Memory across sessions and sub-agents.

Built for the [DKG v10 Round 1 Integrations Bounty](https://origintrail.io) — theme: *LLM-Wiki & Autoresearch Agents*.

---

## What it does

Claude Code sessions are stateless by default. Work disappears when the session ends. This server changes that:

- **Captures** research notes, vulnerability findings, code analyses, plans, and other artifacts into DKG v10 Working Memory with SHA-256 content hashes, timestamps, and agent provenance.
- **Retrieves** past artifacts via SPARQL — search by keyword, type, status, or session ID.
- **Tracks the trust gradient** — artifacts mature from `draft` → `needs_sources` → `review_needed` → `validated` → `ready_to_share`, reflecting the DKG v10 memory model.
- **Promotes** validated artifacts to Shared Working Memory for team peers to see (requires explicit user confirmation — never autonomous).
- **Synthesizes** all findings from a session into a structured `knowledge_synthesis` artifact at session end.
- **Attributes sub-agents** — provenance chains across parent/child Claude Code agent hierarchies are preserved with `subAgentId`, `parentTaskId`, and `agentRole` fields.

---

## Tools

| Tool | Description |
|---|---|
| `capture_research_finding` | Write an artifact to DKG Working Memory |
| `search_working_memory` | SPARQL search by keyword, type, status, or session |
| `get_artifact_content` | Retrieve full artifact by UAL or URN |
| `update_artifact_status` | Advance an artifact through the trust gradient |
| `promote_to_shared_memory` | Share artifacts with the team (requires `confirm: true`) |
| `synthesize_session` | Aggregate a session's artifacts into a knowledge synthesis |
| `get_session_summary` | List all artifacts from a session with type counts |

---

## Requirements

- Node.js ≥ 22
- A running DKG v10 node (default: `http://127.0.0.1:9200`)
- A DKG auth token

---

## Installation

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

```
capture_research_finding({
  content: "...",
  type: "vulnerability_finding",
  parentTaskId: "ccm-<parent-session-id>",
  subAgentId: "reentrancy-analyzer",
  agentRole: "security-auditor"
})
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
