# Phase 6: Documentation — `dkg-claude-code-memory`

**Duration:** ~4 hours  
**Goal:** Complete docs/ folder, README finalized, DEMO_SCRIPT ready for recording.

---

## File: `docs/DESIGN_BRIEF.md`

This is a mandatory submission document. Must be 1–3 pages. Every section is required by the bounty spec (Official_Docs.md §8).

---

```markdown
# Design Brief: Claude Code Research Memory for DKG v10

**Integration:** `dkg-claude-code-memory`  
**Registry slug:** `claude-code-memory`  
**Version:** 1.0.0  
**Maintainer:** @drMurlly  
**License:** Apache-2.0

---

## 1. Problem

Claude Code agents are stateless across sessions. Every new session starts with a blank slate. Research completed yesterday — vulnerability findings, architectural decisions, competitive analyses — is inaccessible today unless manually re-provided in the system prompt.

This is the inverse of how researchers actually work. A human security auditor carries years of pattern recognition across every engagement. A human researcher builds on prior notes. The value of Claude Code as a research partner is limited by the size of its context window, not by what it has ever learned or discovered.

The second problem is sub-agent opacity. When Claude Code orchestrates research via sub-agents (using the Agent tool), each sub-agent produces findings that are returned to the parent as plain text. Those findings are progressively compacted and eventually lost. There is no persistent, queryable record of what each sub-agent found, which agent found it, or how findings relate across agents.

**This integration solves both problems.** DKG v10 Working Memory becomes the persistent knowledge substrate for Claude Code research — a personal, verifiable, agent-legible wiki that every Claude Code session reads from and writes to.

---

## 2. Target User

**Primary:** Security researchers and code auditors running multi-session, multi-agent analysis workflows in Claude Code. The credible first user is drMurlly's bug bounty research workflow, where Claude Code routinely analyzes smart contracts, finds vulnerabilities, and produces audit notes that need to persist across sessions.

**Secondary:** AI developers, competitive analysts, and academic researchers using Claude Code for long-horizon research tasks that benefit from accumulated context.

**Why this user?** Security research is a high-value, artifact-dense workflow where provenance and status tracking (draft → validated → ready_to_share) map directly onto real audit processes. A finding that starts as a draft becomes validated after reproduction, and ready_to_share after the client is notified.

---

## 3. Memory Layers Touched

| Layer | Role in this integration |
|---|---|
| **Working Memory (WM)** | Primary layer. Every captured artifact enters WM as a private, agent-populated draft. All 7 MCP tools operate on WM by default. |
| **Shared Working Memory (SWM)** | Secondary layer. The `promote_to_shared_memory` tool moves validated findings to SWM for team visibility. Requires explicit user confirmation — never triggered autonomously. |
| **Verified Memory (VM)** | Not touched in Round 1. Explicitly anticipated in Round 2. See §7. |

---

## 4. V10 Primitives Used

| Primitive | Usage |
|---|---|
| **Context Graph** | `ccm-research` — scoped knowledge domain for all captured research artifacts |
| **Assertion** | `artifacts` — named RDF graph within the Context Graph; all quads written here |
| **UAL** | Returned by the DKG node after every write; stored in each artifact record for oracle reference |
| **Integration** | This MCP server, registered in the DKG v10 integrations registry |
| **Curator** | SHARE authority respected strictly — `promote_to_shared_memory` requires `confirm: true` and is never called without explicit user intent |

---

## 5. LLM-Wiki / Autoresearch Mapping

The Karpathy LLM-Wiki vision: a knowledge substrate natively legible to language models, continuously curated by a mixture of humans and agents. Every research session contributes to a growing wiki. Agents read from it, write to it, and refine it over time.

**Claude Code IS the autoresearch agent. DKG WM IS the wiki.**

The mapping is direct:

| LLM-Wiki concept | This integration |
|---|---|
| Agent writes to wiki | `capture_research_finding` — every significant analysis goes to DKG WM |
| Agent reads from wiki | `search_working_memory` — SPARQL-backed retrieval at session start |
| Multi-agent collaboration | Sub-agent provenance chains — each agent's contribution is attributed and queryable |
| Knowledge matures over time | Status lifecycle: draft → validated → ready_to_share |
| Collaborative knowledge | `promote_to_shared_memory` — team gossip via SWM |
| Verifiable provenance | SHA-256 content hash, agent attribution, session lineage |

The sub-agent provenance chain is the critical LLM-Wiki enabler: when multiple Claude Code sub-agents research different aspects of a codebase, their individual findings accumulate in DKG WM with full lineage. The parent agent — and future sessions — can reconstruct the entire research run via SPARQL.

---

## 6. Promotion Path

```
[draft]         — Auto-assigned on capture. Artifact is agent-populated, private.
    ↓
[needs_sources] — Auto-assigned by status classifier if content lacks citations.
    ↓
[review_needed] — Auto-assigned for plans/specs. Signals human review required.
    ↓
[validated]     — Agent upgrades after verification. Still in WM (private).
    ↓
[ready_to_share]— Agent upgrades when approved. Precursor to SWM promotion.
    ↓
[SWM]           — Explicit user action: "share this with the team"
                  → agent calls promote_to_shared_memory(confirm=true)
                  → artifact enters Shared Working Memory
                  → team peers can see and build on it
    ↓ (Round 2)
[VM]            — Endorsement + consensus-verification → on-chain anchoring
                  Oracle-consumable artifact with full provenance chain
```

Status transitions are performed via `update_artifact_status` (conversational, not UI). Promotion to SWM is gated by `confirm: true` and can only be triggered by explicit user intent.

---

## 7. Oracle-Readiness and Forward-Compatibility with Verified Memory

Every artifact produced by this integration is structured for oracle consumption from day one.

**Data structure guarantees:**

| Property | Oracle value |
|---|---|
| Stable URN (`urn:dkg:wm:{sha256-prefix}`) | Permanent identifier; oracle can reference across layers |
| UAL stored in artifact record | Direct DKG lookup without re-querying |
| SHA-256 content hash | Oracle integrity verification |
| `wm:status` as RDF predicate | Oracle can filter by `validated` or `ready_to_share` without schema changes |
| JSON-LD with `schema:` + `wm:` ontologies | Standard vocabularies; oracle-legible without custom parsers |

**SPARQL that works unchanged across WM → SWM → VM:**

```sparql
PREFIX wm: <https://ontology.origintrail.io/dkg/wm#>
PREFIX schema: <https://schema.org/>

SELECT ?id ?ual ?status ?name ?type ?capturedAt WHERE {
  ?id a wm:WorkingMemoryArtifact ;
      wm:status ?status ;
      wm:ual ?ual ;
      schema:name ?name ;
      wm:artifactType ?type ;
      wm:provenance [ wm:capturedAt ?capturedAt ] .
  FILTER(?status IN ("validated", "ready_to_share"))
}
ORDER BY DESC(?capturedAt)
```

This query is valid against WM artifacts today. In Round 2, when promoted artifacts live in SWM or VM, the same query returns them — no rewrite required. A context oracle can execute this query against any layer and receive structured, provenance-attested results.

**Round 2 readiness:** The sub-agent provenance chain (`wm:parentTaskId`, `wm:subAgentId`) becomes a natural input for endorsement workflows. An endorser can query "all findings by sub-agents of session X" and endorse them as a batch. The data is already shaped for this workflow.

---

## 8. Differentiation from `cursor-mcp-dkg`

The existing first-party `cursor-mcp-dkg` is a generic DKG read/write MCP server. This integration is purpose-built for research workflows.

| Capability | `cursor-mcp-dkg` | `dkg-claude-code-memory` |
|---|---|---|
| Artifact taxonomy | Generic text | 14 research-specific types |
| Status lifecycle | None | 7-status trust gradient |
| Sub-agent provenance | Not tracked | Full parentTaskId + subAgentId chains |
| Content-hash dedup | None | Cross-session SHA-256 dedup |
| Secret/credential redaction | None | Strips keys, tokens, PEM blocks before write |
| Session-scoped retrieval | None | `sessionId` filter on all queries |
| Knowledge synthesis | None | `synthesize_session` aggregates runs |
| Auto-capture system prompt | None | Injected via MCP `prompts/list` |
| Capture model | Pull (user invokes) | Push+pull (tools + system prompt guide agent) |
| Target user | Individual developer | Multi-agent research teams |

These are not configuration differences — they are architectural. Both integrations coexist; neither replaces the other.

---

## 9. Terminology

All v10 terminology used as specified. No deviations. Terms used exactly:
Context Graph, Assertion, UAL, Integration, Curator, Working Memory, Shared Working Memory, Verified Memory, SHARE, PUBLISH, Knowledge Asset, Knowledge Collection.

---

## 10. Maintenance Commitment

Maintainer: @drMurlly  
Support window: 12 months post-merge (double the required 6-month minimum).  
Issue tracker: https://github.com/drMurlly/dkg-claude-code-memory/issues
```

---

## File: `README.md`

```markdown
# dkg-claude-code-memory

MCP server giving Claude Code agents persistent, verifiable Working Memory on DKG v10.

Every research finding, vulnerability, architectural decision, and analysis produced during
a Claude Code session is automatically persisted to DKG v10 Working Memory — searchable
via SPARQL, promotable to Shared Working Memory, and forward-compatible with Verified Memory.

## Install

```bash
npm install -g dkg-claude-code-memory
```

## Configure Claude Code

Add to your Claude Code MCP settings (`.claude/settings.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dkg-research-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_AUTH_TOKEN": "your-token-here",
        "DKG_DAEMON_URL": "http://127.0.0.1:9200"
      }
    }
  }
}
```

See `CLAUDE_CONFIG_EXAMPLE.json` in this repo for full configuration options.

## Tools

| Tool | When Claude calls it |
|---|---|
| `capture_research_finding` | After completing any significant analysis or finding |
| `search_working_memory` | At task start, to retrieve relevant prior context |
| `get_artifact_content` | To retrieve full content of a specific artifact |
| `update_artifact_status` | To promote a finding through the trust gradient |
| `promote_to_shared_memory` | When user explicitly asks to share with team |
| `synthesize_session` | At end of a research session to create a summary |
| `get_session_summary` | To list all artifacts from a session |

## Sub-Agent Provenance

When you spawn sub-agents via Claude Code's Agent tool, configure them to pass their
`subAgentId` and `parentTaskId` to `capture_research_finding`. The parent session can
then retrieve all sub-agent findings:

```
# In parent session:
search_working_memory(sessionId: "session-abc123")
# Returns all findings from parent + all sub-agents
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DKG_AUTH_TOKEN` | (required) | DKG bearer token |
| `DKG_DAEMON_URL` | `http://127.0.0.1:9200` | DKG node URL |
| `DKG_WM_CONTEXT_GRAPH` | `ccm-research` | Context Graph name |
| `DKG_WM_ASSERTION_NAME` | `artifacts` | Assertion name |
| `DKG_CCM_STATE_DIR` | `~/.dkg/ccm-state` | Local dedup state directory |
| `DKG_WM_MIN_LENGTH` | `80` | Minimum content length to capture |
| `DKG_WM_REDACTION` | `true` | Set to `false` to disable secret redaction |

## License

Apache-2.0
```

---

## File: `docs/DEMO_SCRIPT.md`

Step-by-step guide for recording the 3–5 minute demo video.

```markdown
# Demo Recording Script

**Target length:** 3–5 minutes  
**Tool:** Screen recorder (OBS, Loom, QuickTime)  
**Narration:** Optional — title cards can substitute

## Prerequisites

- DKG v10 node running at 127.0.0.1:9200
- `dkg-claude-code-memory` installed and configured in Claude Code
- A sample Solidity contract file (use any public DeFi contract)
- Terminal visible alongside Claude Code

## Scene 1: Session Start (0:00–0:30)

Open Claude Code. Show the MCP server is connected (MCP indicator in UI).

Start a new session. Say/type:
> "I'm going to audit the Vault.sol contract for vulnerabilities.
>  First, search my working memory for any prior analysis."

Claude calls `search_working_memory()`. Show the response (empty on first run,
or showing prior findings if re-running).

## Scene 2: Research with Sub-Agents (0:30–2:00)

Ask Claude to run a deep analysis using sub-agents:
> "Analyze Vault.sol for reentrancy, access control, and integer overflow.
>  Spawn sub-agents for each vulnerability class."

Show Claude spawning sub-agents. As each sub-agent completes, it calls
`capture_research_finding` with its type (`vulnerability_finding`),
`parentTaskId` (parent session), and `subAgentId`.

The terminal shows DKG write confirmations with UALs returned.

## Scene 3: Retrieve Cross-Agent Context (2:00–3:00)

Parent agent aggregates results. Show Claude calling:
`search_working_memory(sessionId: "session-XYZ")`

All sub-agent findings appear in results. Highlight that findings from
different sub-agents are attributed separately but queryable together.

Ask: "Show me everything found about reentrancy."
Claude calls `search_working_memory(type: "vulnerability_finding", query: "reentrancy")`.

## Scene 4: Status Update + Synthesis (3:00–4:00)

> "The reentrancy finding is confirmed. Mark it as validated."

Claude calls `update_artifact_status(artifactId: "...", newStatus: "validated")`.

> "Synthesize all findings from this session."

Claude calls `synthesize_session(sessionId: "session-XYZ")`.
Show the synthesis artifact being written to DKG WM.

## Scene 5: Next Session — Memory Persists (4:00–4:30)

Start a NEW Claude Code session (show new chat window).

Ask: "Have I audited any Vault contracts before?"

Claude calls `search_working_memory(query: "Vault")`.
Prior session findings appear — including the synthesis artifact.

This is the LLM-Wiki in action: knowledge persists across sessions.

## Scene 6: Team Sharing (4:30–5:00, optional)

> "Share the reentrancy finding with my team."

Claude confirms intent. User confirms. Claude calls
`promote_to_shared_memory(artifactId: "...", confirm: true)`.

Show DKG assertion history in terminal confirming the promotion write.

## Post-Recording

Upload to YouTube as unlisted. Copy URL into REGISTRY_ENTRY.json `demo` field.
```

---

## Checklist Before Phase 7

- [ ] `docs/DESIGN_BRIEF.md` exists with all 10 sections filled
- [ ] `README.md` has install instructions, tool table, env var table
- [ ] `CLAUDE_CONFIG_EXAMPLE.json` is accurate and tested
- [ ] `docs/DEMO_SCRIPT.md` is step-by-step and matches the actual build
- [ ] All internal links in README resolve correctly
- [ ] License year and author are correct in `LICENSE`
