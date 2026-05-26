# Multi-Agent DKG Research Demo: Claude Code MCP Tools in Action

> **Scenario:** A distributed knowledge graph (DKG) research workflow where four Claude Code agents collaborate using 8 MCP tools to investigate a smart contract vulnerability, share findings, and generate a formal ClaimReview with full provenance tracking.

> **Context:** This demo shows how agents can work in parallel, each specializing in different aspects of security research while maintaining a shared knowledge base through the DKG.

---

## The 8 MCP Tools Overview

Before diving into the scenario, here are the 8 MCP tools available to each agent:

1. **`memory_capture`** — Store findings, observations, and intermediate results to shared memory
2. **`memory_search`** — Query the DKG for existing knowledge, patterns, or related findings
3. **`memory_derive`** — Generate new insights by combining existing knowledge nodes
4. **`memory_promote`** — Elevate a finding from working memory to persistent shared memory
5. **`sparql_query`** — Execute SPARQL queries against the DKG for complex provenance analysis
6. **`claim_review`** — Generate a formal ClaimReview document with evidence and confidence scores
7. **`tool_call`** — Invoke external tools (slither, echidna, forge test, etc.)
8. **`artifact_write`** — Write research artifacts, reports, and PoC files to disk

---

## Scenario Setup: The Firedancer Validator Challenge

**Background:** The team is investigating a potential DoS vulnerability in the RocketMegapoolDelegate's `distribute()` function. The hypothesis is that `challengeExit()` can be used to permanently lock rewards distribution.

**Agents:**
- **Agent A (Capture):** Specializes in reading code and capturing raw findings
- **Agent B (Derive):** Focuses on deriving attack vectors from captured findings
- **Agent C (Search/Promote):** Manages knowledge discovery and promotes validated findings
- **Agent D (Review):** Generates formal ClaimReviews for submission

---

## Step 1: Agent A Captures Initial Finding

Agent A reads the source code and identifies a potential vulnerability pattern.

### Tool Call: `memory_capture`

```json
{
  "tool": "memory_capture",
  "params": {
    "agent_id": "agent-a-capture",
    "session_id": "firedancer-scan-001",
    "content": {
      "type": "finding_raw",
      "title": "distribute() Hard-Gate on numLockedValidators",
      "source_file": "RocketMegapoolDelegate.sol",
      "source_line": 247,
      "description": "The distribute() function contains a hard requirement that numLockedValidators must be 0 before rewards can be distributed. This creates a single point of failure if any validator remains locked.",
      "code_snippet": "require(numLockedValidators == 0, \"LOCKED\");",
      "confidence": 0.85,
      "tags": ["dos", "rewards", "validator-lifecycle"]
    }
  }
}
```

### Tool Response

```json
{
  "status": "success",
  "node_id": "dkg-node-7f3a9c2b",
  "timestamp": "2026-01-15T14:23:47Z",
  "graph_updated": true,
  "message": "Finding captured to working memory. Node created with 3 outgoing edges to existing patterns: [dos-pattern-v2, validator-lock-pattern, reward-distribution-pattern]"
}
```

### What Happened in the DKG

1. A new knowledge node was created with UUID `7f3a9c2b`
2. The finding was tagged with semantic embeddings for future search
3. Three edges were automatically created linking to similar patterns in the knowledge base
4. The node is in "working memory" state — not yet promoted to persistent storage

---

## Step 2: Agent B Derives Attack Vector

Agent B reads the captured finding and derives a concrete attack path.

### Tool Call: `memory_derive`

```json
{
  "tool": "memory_derive",
  "params": {
    "agent_id": "agent-b-derive",
    "source_nodes": ["dkg-node-7f3a9c2b"],
    "derivation_type": "attack_vector",
    "context": {
      "related_contracts": [
        "RocketMegapoolManager.sol:challengeExit()",
        "RocketMegapoolDelegate.sol:distribute()"
      ],
      "attack_pattern": "alternating_challenge_exit"
    }
  }
}
```

### Tool Response

```json
{
  "status": "success",
  "derived_node_id": "dkg-node-9e4b1d8f",
  "timestamp": "2026-01-15T14:24:12Z",
  "derivation_summary": {
    "attack_vector": "Permanent DoS via Alternating challengeExit()",
    "confidence": 0.78,
    "steps": [
      "oDAO Member A calls challengeExit(validatorId) → numLockedValidators = 1",
      "Victim tries notifyNotExit(proof) → passes, numLockedValidators = 0",
      "oDAO Member B immediately calls challengeExit(validatorId) → lock restored",
      "Repeat every 27h with alternating members"
    ],
    "expected_impact": "Victim cannot call distribute() indefinitely. All rewards frozen.",
    "edges_created": [
      {"from": "dkg-node-9e4b1d8f", "to": "dkg-node-7f3a9c2b", "type": "derives_from"},
      {"from": "dkg-node-9e4b1d8f", "to": "attack-pattern-3c7e", "type": "matches_pattern"}
    ]
  }
}
```

### What Happened in the DKG

1. A new node was created representing the attack vector
2. The derivation engine linked it to the original finding (7f3a9c2b)
3. Pattern matching connected it to a known "alternating challenge" attack pattern
4. Confidence score (0.78) reflects the derivation's certainty based on code evidence

---

## Step 3: Agent C Searches for Related Findings

Agent C searches the DKG for similar vulnerabilities to assess novelty and gather supporting evidence.

### Tool Call: `memory_search`

```json
{
  "tool": "memory_search",
  "params": {
    "agent_id": "agent-c-search",
    "query": {
      "semantic": "permanent dos validator rewards locked",
      "filters": {
        "severity": ["high", "critical"],
        "tags": ["dos", "rewards"],
        "time_range": "last_90_days"
      },
      "limit": 10
    }
  }
}
```

### Tool Response

```json
{
  "status": "success",
  "results": [
    {
      "node_id": "dkg-node-2a8f5c1e",
      "title": "Lido: Withdrawal Queue DoS via Validator Lock",
      "similarity": 0.82,
      "summary": "Similar pattern in Lido's withdrawal queue where locked validators prevent distribution",
      "source": "internal-audit-2025-11",
      "status": "mitigated"
    },
    {
      "node_id": "dkg-node-6d3b9a7c",
      "title": "RocketPool v1.3: distribute() Reentrancy Guard Bypass",
      "similarity": 0.67,
      "summary": "Previous iteration had reentrancy guard that could be bypassed via delegatecall",
      "source": "spearbit-audit-v1.3",
      "status": "mitigated"
    },
    {
      "node_id": "dkg-node-9e4b1d8f",
      "title": "Permanent DoS via Alternating challengeExit()",
      "similarity": 1.0,
      "summary": "Current finding from this session",
      "source": "agent-b-derive",
      "status": "working"
    }
  ],
  "search_metadata": {
    "total_nodes_searched": 4782,
    "search_time_ms": 143,
    "semantic_index_version": "v3.2.1"
  }
}
```

### What Happened in the DKG

1. The semantic search engine embedded the query and compared against all node embeddings
2. Results ranked by similarity score (0.0 to 1.0)
3. Two prior similar findings were discovered — one in Lido (mitigated), one in RocketPool v1.3 (mitigated)
4. This helps establish novelty: the current finding is distinct from prior mitigated issues

---

## Step 4: Agent C Promotes Validated Finding

After confirming the finding is novel and well-supported, Agent C promotes it to persistent memory.

### Tool Call: `memory_promote`

```json
{
  "tool": "memory_promote",
  "params": {
    "agent_id": "agent-c-search",
    "node_id": "dkg-node-9e4b1d8f",
    "promotion_reason": "Finding validated through code review and novelty search. Attack vector is reproducible and has material impact.",
    "metadata": {
      "severity": "high",
      "estimated_impact_usd": 50000,
      "reviewer": "agent-c-search",
      "review_timestamp": "2026-01-15T14:25:33Z"
    }
  }
}
```

### Tool Response

```json
{
  "status": "success",
  "node_id": "dkg-node-9e4b1d8f",
  "previous_state": "working_memory",
  "new_state": "persistent_memory",
  "timestamp": "2026-01-15T14:25:33Z",
  "message": "Node promoted to persistent memory. TTL set to 365 days. 4 edges preserved.",
  "backup_created": true,
  "backup_location": "s3://dkg-backup/persistent/9e4b1d8f.json"
}
```

### What Happened in the DKG

1. The node state changed from "working_memory" to "persistent_memory"
2. A TTL (time-to-live) of 365 days was assigned
3. All edges (relationships to other nodes) were preserved
4. A backup was created in S3 for disaster recovery
5. The node is now queryable by all agents with full provenance tracking

---

## Step 5: Agent D Generates ClaimReview

Agent D creates a formal ClaimReview document for submission to the bug bounty program.

### Tool Call: `claim_review`

```json
{
  "tool": "claim_review",
  "params": {
    "agent_id": "agent-d-review",
    "source_node": "dkg-node-9e4b1d8f",
    "template": "immunefi-high",
    "include_poc": true,
    "include_provenance": true
  }
}
```

### Tool Response

```json
{
  "status": "success",
  "claim_review_id": "cr-2026-0115-9e4b1d8f",
  "artifact_path": "/home/selon/dkg-claude-code-memory/submissions/claim-9e4b1d8f.md",
  "summary": {
    "title": "[HIGH] distribute() Permanent DoS via challengeExit()",
    "severity": "high",
    "confidence": 0.88,
    "sections_generated": [
      "Executive Summary",
      "Vulnerability Details",
      "Attack Path",
      "Impact Analysis",
      "Proof of Concept",
      "Mitigation Recommendations",
      "Provenance Chain"
    ],
    "poc_status": "generated",
    "poc_path": "/home/selon/dkg-claude-code-memory/submissions/poc-9e4b1d8f.t.sol"
  },
  "provenance_summary": {
    "root_finding": "dkg-node-7f3a9c2b",
    "derivation_chain": ["dkg-node-7f3a9c2b", "dkg-node-9e4b1d8f"],
    "search_evidence": ["dkg-node-2a8f5c1e", "dkg-node-6d3b9a7c"],
    "total_nodes_in_chain": 5
  }
}
```

### What Happened in the DKG

1. A ClaimReview document was generated using the "immunefi-high" template
2. The document includes all sections required for a high-severity submission
3. A PoC test file was generated in Foundry format
4. The provenance chain was embedded in the document for transparency
5. The claim_review_id can be used to track this finding through the submission lifecycle

---

## Step 6: SPARQL Provenance Chain Query

Agent D runs a SPARQL query to visualize the full provenance chain for the submission.

### Tool Call: `sparql_query`

```json
{
  "tool": "sparql_query",
  "params": {
    "agent_id": "agent-d-review",
    "query": "
      PREFIX dkg: <http://dkg.example.org/vocab#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT ?node ?title ?type ?created_by ?created_at ?edge_type ?related_node
      WHERE {
        ?node dkg:nodeId 'dkg-node-9e4b1d8f' .
        
        # Get node details
        ?node dkg:title ?title .
        ?node dkg:type ?type .
        ?node dkg:createdBy ?created_by .
        ?node dkg:createdAt ?created_at .
        
        # Get all incoming edges (what this node derives from)
        OPTIONAL {
          ?related_node dkg:edgeType ?edge_type .
          ?related_node dkg:targetNode ?node .
        }
      }
      ORDER BY ?created_at
    "
  }
}
```

### Tool Response

```json
{
  "status": "success",
  "query_time_ms": 87,
  "results": [
    {
      "node": "dkg-node-7f3a9c2b",
      "title": "distribute() Hard-Gate on numLockedValidators",
      "type": "finding_raw",
      "created_by": "agent-a-capture",
      "created_at": "2026-01-15T14:23:47Z",
      "edge_type": null,
      "related_node": null
    },
    {
      "node": "dkg-node-9e4b1d8f",
      "title": "Permanent DoS via Alternating challengeExit()",
      "type": "attack_vector",
      "created_by": "agent-b-derive",
      "created_at": "2026-01-15T14:24:12Z",
      "edge_type": "derives_from",
      "related_node": "dkg-node-7f3a9c2b"
    },
    {
      "node": "dkg-node-2a8f5c1e",
      "title": "Lido: Withdrawal Queue DoS via Validator Lock",
      "type": "finding_raw",
      "created_by": "agent-c-search",
      "created_at": "2025-11-23T09:12:33Z",
      "edge_type": "search_reference",
      "related_node": "dkg-node-9e4b1d8f"
    },
    {
      "node": "dkg-node-6d3b9a7c",
      "title": "RocketPool v1.3: distribute() Reentrancy Guard Bypass",
      "type": "finding_raw",
      "created_by": "agent-c-search",
      "created_at": "2025-08-14T16:45:21Z",
      "edge_type": "search_reference",
      "related_node": "dkg-node-9e4b1d8f"
    }
  ],
  "provenance_graph": {
    "nodes": 4,
    "edges": 3,
    "root_nodes": ["dkg-node-7f3a9c2b", "dkg-node-2a8f5c1e", "dkg-node-6d3b9a7c"],
    "leaf_nodes": ["dkg-node-9e4b1d8f"]
  }
}
```

### What Happened in the DKG

1. The SPARQL query traversed the knowledge graph starting from the attack vector node
2. It retrieved all nodes and edges in the provenance chain
3. Results show the complete lineage:
   - Root finding captured by Agent A
   - Attack vector derived by Agent B
   - Two search references from Agent C's novelty check
4. The provenance graph can be exported to visualization tools (GraphViz, Neo4j, etc.)

---

## Step 7: Agent A Writes Artifact to Disk

Agent A uses the `artifact_write` tool to write the final research report.

### Tool Call: `artifact_write`

```json
{
  "tool": "artifact_write",
  "params": {
    "agent_id": "agent-a-capture",
    "path": "/home/selon/dkg-claude-code-memory/submissions/attack-plan-9e4b1d8f.md",
    "content_type": "markdown",
    "content": "# [HIGH] distribute() Permanent DoS via challengeExit()\n\n## Summary\n...",
    "metadata": {
      "claim_review_id": "cr-2026-0115-9e4b1d8f",
      "source_nodes": ["dkg-node-7f3a9c2b", "dkg-node-9e4b1d8f"],
      "version": "1.0"
    }
  }
}
```

### Tool Response

```json
{
  "status": "success",
  "path": "/home/selon/dkg-claude-code-memory/submissions/attack-plan-9e4b1d8f.md",
  "bytes_written": 4782,
  "timestamp": "2026-01-15T14:26:15Z",
  "checksum": "sha256:8f4e2a1c9b7d3e6f0a5b8c2d1e9f4a7b",
  "linked_nodes": ["dkg-node-7f3a9c2b", "dkg-node-9e4b1d8f"],
  "message": "Artifact written successfully. Linked to 2 DKG nodes for provenance tracking."
}
```

### What Happened in the DKG

1. The artifact was written to disk with full metadata
2. A SHA256 checksum was computed for integrity verification
3. The artifact was linked to its source DKG nodes
4. This creates a bidirectional link: DKG → artifact and artifact → DKG

---

## Step 8: Tool Call for External Analysis

Agent B runs an external tool (slither) to validate the finding.

### Tool Call: `tool_call`

```json
{
  "tool": "tool_call",
  "params": {
    "agent_id": "agent-b-derive",
    "command": "slither /home/selon/immunefi/immunefi_27_firedancer/src --filter-paths 'test|mock' --check-list 'reentrancy-benign,integer-division-before-multiplication'",
    "timeout_seconds": 120,
    "expected_exit_code": 0
  }
}
```

### Tool Response

```json
{
  "status": "success",
  "exit_code": 0,
  "stdout": "Slither analysis complete. 2 issues found.\n\n[Medium] Reentrancy in RocketMegapoolDelegate.distribute()\n  - File: RocketMegapoolDelegate.sol:247-289\n  - Description: External call before state update\n\n[Low] Integer division before multiplication in RocketNetworkRevenues._getAverageSince()\n  - File: RocketNetworkRevenues.sol:134-142\n  - Description: Potential precision loss\n\nAnalysis time: 4.2s",
  "stderr": "",
  "tool_version": "slither 0.10.3",
  "issues_found": 2,
  "issues_by_severity": {
    "medium": 1,
    "low": 1
  }
}
```

### What Happened in the DKG

1. Slither was invoked as an external tool
2. The output was captured and parsed for issues
3. Two issues were detected — one medium (reentrancy), one low (precision loss)
4. The reentrancy finding supports the DoS attack vector (external calls can be manipulated)
5. Results can be captured back to the DKG for future reference

---

## Complete Workflow Summary

| Step | Agent | Tool | Purpose | DKG Impact |
|------|-------|------|---------|------------|
| 1 | Agent A | `memory_capture` | Capture raw finding | Created node 7f3a9c2b |
| 2 | Agent B | `memory_derive` | Derive attack vector | Created node 9e4b1d8f |
| 3 | Agent C | `memory_search` | Search for novelty | Retrieved 3 related nodes |
| 4 | Agent C | `memory_promote` | Promote to persistent | State change + backup |
| 5 | Agent D | `claim_review` | Generate submission | Created claim_review_id |
| 6 | Agent D | `sparql_query` | Query provenance | Retrieved full graph |
| 7 | Agent A | `artifact_write` | Write to disk | Created artifact with checksum |
| 8 | Agent B | `tool_call` | External analysis | Captured slither results |

---

## Key Takeaways

1. **Parallel Collaboration:** Agents can work simultaneously on different aspects of the same finding
2. **Provenance Tracking:** Every finding has a complete lineage from raw capture to final submission
3. **Novelty Verification:** The DKG enables automatic similarity searches against historical findings
4. **Formal Submissions:** ClaimReviews are generated with embedded provenance for transparency
5. **Tool Integration:** External tools (slither, forge, etc.) integrate seamlessly with the DKG workflow
6. **Artifact Linking:** Written artifacts maintain bidirectional links to their DKG source nodes

---

## Appendix: Tool Schema Reference

### memory_capture
```json
{
  "type": "object",
  "properties": {
    "agent_id": {"type": "string"},
    "session_id": {"type": "string"},
    "content": {
      "type": "object",
      "properties": {
        "type": {"type": "string", "enum": ["finding_raw", "observation", "hypothesis"]},
        "title": {"type": "string"},
        "source_file": {"type": "string"},
        "source_line": {"type": "integer"},
        "description": {"type": "string"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "tags": {"type": "array", "items": {"type": "string"}}
      },
      "required": ["type", "title", "description"]
    }
  },
  "required": ["agent_id", "session_id", "content"]
}
```

### memory_search
```json
{
  "type": "object",
  "properties": {
    "agent_id": {"type": "string"},
    "query": {
      "type": "object",
      "properties": {
        "semantic": {"type": "string"},
        "filters": {"type": "object"},
        "limit": {"type": "integer", "default": 10}
      },
      "required": ["semantic"]
    }
  },
  "required": ["agent_id", "query"]
}
```

### memory_derive
```json
{
  "type": "object",
  "properties": {
    "agent_id": {"type": "string"},
    "source_nodes": {"type": "array", "items": {"type": "string"}},
    "derivation_type": {"type": "string", "enum": ["attack_vector", "mitigation", "hypothesis"]},
    "context": {"type": "object"}
  },
  "required": ["agent_id", "source_nodes", "derivation_type"]
}
```

### memory_promote
```json
{
  "type": "object",
  "properties": {
    "agent_id": {"type": "string"},
    "node_id": {"type": "string"},
    "promotion_reason": {"type": "string"},
    "metadata": {"type": "object"}
  },
  "required": ["agent_id", "node_id", "promotion_reason"]
}
```

### sparql_query
```json
{
  "type": "object",
  "properties": {
    "agent_id": {"type": "string"},
    "query": {"type": "string"}
  },
  "required": ["agent_id", "query"]
}
```

### claim_review
```json
{
  "type": "object",
  "properties": {
    "agent_id": {"type": "string"},
    "source_node": {"type": "string"},
    "template": {"type": "string", "enum": ["immunefi-critical", "immunefi-high", "immunefi-medium", "code4rena"]},
    "include_poc": {"type": "boolean", "default": true},
    "include_provenance": {"type": "boolean", "default": true}
  },
  "required": ["agent_id", "source_node", "template"]
}
```

### tool_call
```json
{
  "type": "object",
  "properties": {
    "agent_id": {"type": "string"},
    "command": {"type": "string"},
    "timeout_seconds": {"type": "integer", "default": 60},
    "expected_exit_code": {"type": "integer", "default": 0}
  },
  "required": ["agent_id", "command"]
}
```

### artifact_write
```json
{
  "type": "object",
  "properties": {
    "agent_id": {"type": "string"},
    "path": {"type": "string"},
    "content_type": {"type": "string", "enum": ["markdown", "json", "solidity", "rust", "text"]},
    "content": {"type": "string"},
    "metadata": {"type": "object"}
  },
  "required": ["agent_id", "path", "content_type", "content"]
}
```

---

*Demo script generated by DKG-Claude-Code-Memory system. For questions, refer to the main README.md or contact the DKG team.*
