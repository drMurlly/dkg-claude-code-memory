# DKG Claude Code Memory — MCP Demo Script

> **Scenario:** drMurlly is running a solo audit session against the Firedancer V1
> validator codebase (Immunefi contest, commit `2f4625e3`). The session covers a
> suspected out-of-bounds write in the shred parser, traces its provenance through
> a derived PoC hypothesis, promotes the validated finding to shared memory, and
> closes with a synthesized session report and an Oracle-ready ClaimReview.
>
> **Goal of this script:** Show every one of the 10 real MCP tools, with realistic
> parameters, realistic responses, and the full trust-gradient lifecycle
> (`draft` → `validated` → `ready_to_share`).

---

## Tool Reference (all 10)

| # | Tool | One-line purpose |
|---|------|-----------------|
| 1 | `capture_research_finding` | Write a new artifact into working memory |
| 2 | `search_working_memory` | Query artifacts in this session / shared memory |
| 3 | `retrieve_artifact` | Fetch the full content of one artifact by ID |
| 4 | `update_artifact_status` | Advance or retract an artifact's trust status |
| 5 | `promote_to_shared_memory` | Publish a `ready_to_share` artifact to the DKG |
| 6 | `synthesize_session` | Summarise all artifacts in a session into one report |
| 7 | `get_session_summary` | Pull the current session's lightweight summary |
| 8 | `query_shared_memory` | Semantic search over the persistent shared DKG |
| 9 | `get_claim_review` | Generate an Oracle-formatted ClaimReview for submission |
| 10 | `get_node_status` | Health-check the DKG node (connectivity, sync lag) |

---

## Session Context

```
Session ID  : fd-audit-2026-05-26-001
Auditor     : drMurlly
Target      : Firedancer V1 — fd_shred.c / fd_shred_parse.c
Commit      : 2f4625e3
Contest     : Immunefi Firedancer V1 Audit Competition
Deadline    : 2026-05-09 17:00 UTC
```

---

## Step 0 — Pre-flight: Check Node Status

Before starting any session, verify the DKG node is reachable and its
shared-memory index is fully synced.

### Tool call

```json
{
  "tool": "get_node_status",
  "params": {}
}
```

### Response

```json
{
  "success": true,
  "message": "DKG node online at http://127.0.0.1:9200 (42ms)",
  "status": "online",
  "nodeUrl": "http://127.0.0.1:9200",
  "latencyMs": 42
}
```

**Interpretation:** Node is healthy, index lag is 0 — safe to start the session.

---

## Step 1 — Capture Raw Observation (status: `draft`)

drMurlly reads `fd_shred_parse.c` and spots that `fd_shred_merkle_parse` copies
an untrusted `data_cnt` field from the wire packet into a stack-allocated array
without bounding the index against the declared allocation size.

### Tool call

```json
{
  "tool": "capture_research_finding",
  "params": {
    "content": "In fd_shred_parse.c, function fd_shred_merkle_parse() at approx line 387, the loop\n`for( ulong i=0; i<hdr->data_cnt; i++ ) merkle[i] = ...`\ncopies the Merkle proof hashes from the wire packet into a stack buffer declared as\n`uchar merkle[FD_SHRED_MERKLE_PROOF_DEPTH_MAX][FD_SHRED_MERKLE_NODE_SZ]`.\nFD_SHRED_MERKLE_PROOF_DEPTH_MAX is 20. The peer-controlled field `hdr->data_cnt` is a\nuint16_t, so values 21..65535 will write past the end of the stack buffer.\nNo bounds check on `hdr->data_cnt` precedes the loop.",
    "artifactType": "research_note",
    "title": "fd_shred_merkle_parse: missing bounds check on hdr->data_cnt (OOB stack write)",
    "status": "draft",
    "sensitivity": "confidential",
    "source": "tool",
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Artifact captured successfully",
  "artifactId": "urn:dkg:wm:7f3a2b1c9d0e4f56",
  "ual": "<dkg-node-ual>",
  "status": "draft",
  "contentHash": "sha256:7f3a2b1c9d0e4f56a2b3c4d5e6f70819..."
}
```

**Trust gradient position:** `draft` — raw observation, not yet reviewed. (`status` is auto-classified from the content unless you pass an explicit `status`.)

---

## Step 2 — Capture Supporting Observation (status: `draft`)

A second read confirms there is no sanitisation of `data_cnt` anywhere upstream
of the call to `fd_shred_merkle_parse`.

### Tool call

```json
{
  "tool": "capture_research_finding",
  "params": {
    "content": "Traced all callers of fd_shred_merkle_parse() in fd_shred.c. The call sites are:\n  1. fd_shred_parse_data() at fd_shred.c:621\n  2. fd_shred_parse_code() at fd_shred.c:694\nIn both callers, `hdr` is a direct cast of the incoming UDP payload:\n  `fd_shred_t const * hdr = (fd_shred_t const *)buf;`\nNo validation of `hdr->data_cnt` vs FD_SHRED_MERKLE_PROOF_DEPTH_MAX occurs in either\ncaller or in any function on the call stack between packet receipt and the parse.\nThe field is fully attacker-controlled over the network.",
    "artifactType": "research_note",
    "title": "fd_shred_merkle_parse callers pass raw peer data without sanitising data_cnt",
    "status": "draft",
    "sensitivity": "confidential",
    "source": "tool",
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Artifact captured successfully",
  "artifactId": "urn:dkg:wm:a17b93f0c2e4d518",
  "ual": "<dkg-node-ual>",
  "status": "draft",
  "contentHash": "sha256:a17b93f0c2e4d518b3c4d5e6f7081920..."
}
```

---

## Step 3 — Capture Vulnerability Hypothesis (status: `draft`, derivedFrom urn:dkg:wm:7f3a2b1c9d0e4f56 + urn:dkg:wm:a17b93f0c2e4d518)

With both observations captured, drMurlly writes the formal vulnerability
hypothesis and links it to its two source observations via `derivedFrom`.

### Tool call

```json
{
  "tool": "capture_research_finding",
  "params": {
    "content": "VULNERABILITY HYPOTHESIS\n\nTitle: OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt\n\nRoot cause:\n  fd_shred_merkle_parse() iterates `hdr->data_cnt` times writing 32-byte Merkle\n  nodes into a stack buffer of fixed depth FD_SHRED_MERKLE_PROOF_DEPTH_MAX (20).\n  Because `hdr->data_cnt` is a uint16_t read directly from a peer-supplied UDP\n  datagram with no prior bounds check, an attacker can supply data_cnt=255 and\n  cause 235 * 32 = 7520 bytes of controlled stack overwrite.\n\nAttacker model:\n  Any peer on the Turbine gossip network that can send a crafted shred packet\n  to a Firedancer validator's shred-receive port. No authentication required;\n  Turbine shreds are unauthenticated at the network layer before parsing.\n\nImpact (preconditions met):\n  Stack corruption in the shred receive thread. Depending on ASLR / stack-canary\n  configuration of the production build this may be:\n    - Validator crash / process death (DoS, loss of stake rewards) — HIGH\n    - Stack-canary bypass + RIP control if canaries are absent / weak — CRITICAL\n  Conservative severity: HIGH (crash). Escalation path to CRITICAL present.\n\nAffected harness: shred_parse (contest scope confirmed).\nAffected file: fd_shred_parse.c:387\nContest commit: 2f4625e3",
    "artifactType": "vulnerability_finding",
    "title": "[HIGH/CRITICAL] OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
    "status": "draft",
    "sensitivity": "confidential",
    "derivedFrom": ["urn:dkg:wm:7f3a2b1c9d0e4f56", "urn:dkg:wm:a17b93f0c2e4d518"],
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Artifact captured successfully",
  "artifactId": "urn:dkg:wm:c4e8d2f01a3b5c69",
  "ual": "<dkg-node-ual>",
  "status": "draft",
  "contentHash": "sha256:c4e8d2f01a3b5c69d4e5f60718293a4b...",
  "derivedFrom": ["urn:dkg:wm:7f3a2b1c9d0e4f56", "urn:dkg:wm:a17b93f0c2e4d518"]
}
```

The two `derivedFrom` URNs are written as `prov:wasDerivedFrom` quads on the new artifact, forming the provenance edges shown below.

**Provenance chain so far:**
```
urn:dkg:wm:7f3a2b1c9d0e4f56 (research_note)  ─┐
                                                ├─derives→  urn:dkg:wm:c4e8d2f01a3b5c69 (vulnerability_finding, draft)
urn:dkg:wm:a17b93f0c2e4d518 (research_note)  ─┘
```

---

## Step 4 — Search Working Memory Before Going Further

Before investing time on a PoC, drMurlly checks whether a similar shred-parser
OOB has already been captured in this session or promoted to shared memory.

### Tool call (session-scoped search)

```json
{
  "tool": "search_working_memory",
  "params": {
    "keyword": "shred parse OOB",
    "type": "vulnerability_finding",
    "sessionId": "fd-audit-2026-05-26-001",
    "limit": 10
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Found 1 artifacts",
  "count": 1,
  "artifacts": [
    {
      "id": "urn:dkg:wm:c4e8d2f01a3b5c69",
      "name": "[HIGH/CRITICAL] OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
      "text": "VULNERABILITY HYPOTHESIS\n\nTitle: OOB stack write in fd_shred_merkle_parse...",
      "type": "vulnerability_finding",
      "status": "draft",
      "contentHash": "sha256:c4e8d2f01a3b5c69d4e5f60718293a4b...",
      "capturedAt": "2026-05-26T08:18:44.000Z",
      "sessionId": "fd-audit-2026-05-26-001"
    }
  ]
}
```

Only one hit — the current finding. Now check shared memory for historical
Firedancer shred-parser findings from other sessions.

### Tool call (shared-memory search)

```json
{
  "tool": "query_shared_memory",
  "params": {
    "query": "Firedancer shred parse out-of-bounds stack buffer overflow data_cnt",
    "limit": 5
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Found 1 shared memory entry",
  "count": 1,
  "entries": [
    {
      "ual": "did:dkg:otp/0x5a7b9c3e1f2d4a8b/1/1",
      "title": "fd_shred_parse: integer truncation in code_cnt field (low severity, validated)",
      "snippet": "code_cnt truncated to uint8_t before use; max overread 1 entry only. Patched in commit a3f91b2c.",
      "type": "schema:DigitalDocument"
    }
  ]
}
```

**Interpretation:** The only related shared-memory artifact covers a previously
patched, low-impact `code_cnt` truncation — not `data_cnt`, and not a write.
The current finding is novel.

---

## Step 5 — Retrieve a Full Artifact to Verify Wording

drMurlly retrieves the first observation artifact in full to double-check the
file/line reference before writing the PoC.

### Tool call

```json
{
  "tool": "retrieve_artifact",
  "params": {
    "artifactId": "urn:dkg:wm:7f3a2b1c9d0e4f56"
  }
}
```

### Response

The artifact is returned as a flat map keyed by the local RDF predicate names
(`artifactType`, `name`, `text`, `status`, `accessMode`, `capturedAt`, …):

```json
{
  "success": true,
  "message": "Artifact retrieved successfully",
  "artifact": {
    "artifactType": "research_note",
    "name": "fd_shred_merkle_parse: missing bounds check on hdr->data_cnt (OOB stack write)",
    "text": "In fd_shred_parse.c, function fd_shred_merkle_parse() at approx line 387, the loop\n`for( ulong i=0; i<hdr->data_cnt; i++ ) merkle[i] = ...`\ncopies the Merkle proof hashes from the wire packet into a stack buffer declared as\n`uchar merkle[FD_SHRED_MERKLE_PROOF_DEPTH_MAX][FD_SHRED_MERKLE_NODE_SZ]`.\nFD_SHRED_MERKLE_PROOF_DEPTH_MAX is 20. The peer-controlled field `hdr->data_cnt` is a\nuint16_t, so values 21..65535 will write past the end of the stack buffer.\nNo bounds check on `hdr->data_cnt` precedes the loop.",
    "status": "draft",
    "accessMode": "confidential",
    "contentHash": "sha256:7f3a2b1c9d0e4f56a2b3c4d5e6f70819...",
    "source": "tool",
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor",
    "agentFramework": "claude-code",
    "capturedAt": "2026-05-26T08:04:31.000Z"
  }
}
```

File/line confirmed correct. Proceed to PoC.

---

## Step 6 — Capture PoC Harness Artifact (status: `draft`, derivedFrom urn:dkg:wm:c4e8d2f01a3b5c69)

drMurlly writes a minimal fuzzer seed / harness stub that exercises the
vulnerable path through the `shred_parse` contest harness.

### Tool call

```json
{
  "tool": "capture_research_finding",
  "params": {
    "content": "/* PoC harness — fd_shred_merkle_parse OOB stack write\n * Contest harness: shred_parse\n * Build: make -C src/disco/shred run_shred_parse_fuzzer\n *\n * Craft a data shred with data_cnt = 0x00FF (255).\n * Fields that must be valid to reach fd_shred_merkle_parse:\n *   - variant byte: FD_SHRED_TYPE_MERKLE_DATA (0xA0)\n *   - sz: sizeof(fd_shred_t) + 255 * FD_SHRED_MERKLE_NODE_SZ (255*32 = 8160 bytes)\n *   - The first sizeof(fd_shred_t) bytes = valid shred header; data_cnt = 0x00FF\n *   - Remaining 8160 bytes = 0x41 (filler), filling the Merkle proof slots\n *\n * Expected outcome (ASAN build):\n *   ==ERROR: AddressSanitizer: stack-buffer-overflow\n *   WRITE of size 32 at 0x... T0 pc 0x... bp 0x... sp 0x...\n *   #0 fd_shred_merkle_parse  fd_shred_parse.c:387\n *   #1 fd_shred_parse_data    fd_shred.c:621\n *\n * Seed file layout (hex):\n *   [shred header 88 bytes, data_cnt=0x00FF at offset 6]\n *   [8160 bytes of 0x41]\n */\n\n#include <stdint.h>\n#include <string.h>\n\nvoid build_poc_seed( uint8_t * buf, size_t * out_len ) {\n  memset( buf, 0, 88 + 8160 );\n  buf[0]  = 0xA0;          /* variant: MERKLE_DATA        */\n  buf[4]  = 0x00;          /* slot lo                     */\n  buf[5]  = 0x00;          /* slot hi                     */\n  buf[6]  = 0xFF;          /* data_cnt lo — 255           */\n  buf[7]  = 0x00;          /* data_cnt hi                 */\n  /* pad rest of header to 88 bytes, leave as zero         */\n  memset( buf + 88, 0x41, 8160 ); /* Merkle node filler   */\n  *out_len = 88 + 8160;\n}",
    "artifactType": "code_analysis",
    "title": "PoC seed: fd_shred_merkle_parse OOB write — data_cnt=255 triggers stack overflow",
    "status": "draft",
    "sensitivity": "confidential",
    "derivedFrom": ["urn:dkg:wm:c4e8d2f01a3b5c69"],
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Artifact captured successfully",
  "artifactId": "urn:dkg:wm:e5f1a3b7c2d08e94",
  "ual": "<dkg-node-ual>",
  "status": "draft",
  "contentHash": "sha256:e5f1a3b7c2d08e94f5061728394a5b6c...",
  "derivedFrom": ["urn:dkg:wm:c4e8d2f01a3b5c69"]
}
```

**Full provenance chain:**
```
urn:dkg:wm:7f3a2b1c9d0e4f56 (research_note)  ─┐
                                                ├─derives→  urn:dkg:wm:c4e8d2f01a3b5c69 (vulnerability_finding) ─derives→  urn:dkg:wm:e5f1a3b7c2d08e94 (code_analysis)
urn:dkg:wm:a17b93f0c2e4d518 (research_note)  ─┘
```

---

## Step 7 — Capture Fix Recommendation (status: `draft`, derivedFrom urn:dkg:wm:c4e8d2f01a3b5c69)

Alongside the PoC, capture a fix recommendation so the ClaimReview can include
it without needing to regenerate it later.

### Tool call

```json
{
  "tool": "capture_research_finding",
  "params": {
    "content": "FIX RECOMMENDATION\n\nAdd a bounds check on `hdr->data_cnt` before the Merkle-copy loop in\nfd_shred_merkle_parse(). Minimal patch:\n\n  // Before the loop at fd_shred_parse.c:385\n  if( FD_UNLIKELY( hdr->data_cnt > FD_SHRED_MERKLE_PROOF_DEPTH_MAX ) )\n    return FD_SHRED_PARSE_ERR_DATA_CNT;\n\nAlternatively, clamp and treat excess depth as a parse error:\n  ulong depth = fd_ulong_min( hdr->data_cnt, FD_SHRED_MERKLE_PROOF_DEPTH_MAX );\n  for( ulong i=0; i<depth; i++ ) merkle[i] = ...;\n  if( hdr->data_cnt != depth ) return FD_SHRED_PARSE_ERR_DATA_CNT;\n\nThe early-return approach is preferred: a shred with more Merkle nodes than the\nmaximum depth is definitionally malformed and should not be accepted.\n\nNote: the fix should be applied to fd_shred_merkle_parse() regardless of call\nsite — callers should not be expected to pre-validate internal size fields.",
    "artifactType": "audit_note",
    "title": "Fix: add data_cnt bounds check in fd_shred_merkle_parse before Merkle copy loop",
    "status": "draft",
    "sensitivity": "confidential",
    "derivedFrom": ["urn:dkg:wm:c4e8d2f01a3b5c69"],
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Artifact captured successfully",
  "artifactId": "urn:dkg:wm:b8d3e7a14f2c0951",
  "ual": "<dkg-node-ual>",
  "status": "draft",
  "contentHash": "sha256:b8d3e7a14f2c0951061728394a5b6c7d...",
  "derivedFrom": ["urn:dkg:wm:c4e8d2f01a3b5c69"]
}
```

---

## Step 8 — Advance Trust Gradient: `draft` → `validated`

drMurlly has manually reproduced the ASAN crash with the seed from
`urn:dkg:wm:e5f1a3b7c2d08e94` (the PoC artifact) against the contest harness.
The finding is now validated. Advance the core vulnerability artifact to `validated`.

### Tool call

```json
{
  "tool": "update_artifact_status",
  "params": {
    "artifactId": "urn:dkg:wm:c4e8d2f01a3b5c69",
    "newStatus": "validated"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Status updated to validated",
  "artifactId": "urn:dkg:wm:c4e8d2f01a3b5c69",
  "newStatus": "validated",
  "modifiedAt": "2026-05-26T09:14:03.000Z"
}
```

Also advance the PoC and fix recommendation:

### Tool call

```json
{
  "tool": "update_artifact_status",
  "params": {
    "artifactId": "urn:dkg:wm:e5f1a3b7c2d08e94",
    "newStatus": "validated"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Status updated to validated",
  "artifactId": "urn:dkg:wm:e5f1a3b7c2d08e94",
  "newStatus": "validated",
  "modifiedAt": "2026-05-26T09:14:21.000Z"
}
```

### Tool call

```json
{
  "tool": "update_artifact_status",
  "params": {
    "artifactId": "urn:dkg:wm:b8d3e7a14f2c0951",
    "newStatus": "validated"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Status updated to validated",
  "artifactId": "urn:dkg:wm:b8d3e7a14f2c0951",
  "newStatus": "validated",
  "modifiedAt": "2026-05-26T09:14:34.000Z"
}
```

---

## Step 9 — Advance Trust Gradient: `validated` → `ready_to_share`

The finding has been reproduced and reviewed. Mark it `ready_to_share` so it
can be promoted to the shared DKG (visible to team agents, persistent).

### Tool call

```json
{
  "tool": "update_artifact_status",
  "params": {
    "artifactId": "urn:dkg:wm:c4e8d2f01a3b5c69",
    "newStatus": "ready_to_share"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Status updated to ready_to_share",
  "artifactId": "urn:dkg:wm:c4e8d2f01a3b5c69",
  "newStatus": "ready_to_share",
  "modifiedAt": "2026-05-26T09:16:08.000Z"
}
```

---

## Step 10 — Promote to Shared Memory

Publish the validated vulnerability artifact to the persistent shared DKG so
other agents and future sessions can reference it.

### Tool call

```json
{
  "tool": "promote_to_shared_memory",
  "params": {
    "artifactId": "urn:dkg:wm:c4e8d2f01a3b5c69",
    "confirm": true
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Artifact promoted to shared memory successfully",
  "artifactId": "urn:dkg:wm:c4e8d2f01a3b5c69"
}
```

**What this did:**
- Moved the artifact out of session-scoped working memory into the persistent
  shared DKG context graph.
- Preserved all provenance edges to the two source observations.
- Artifact status remains `ready_to_share` — promotion is a Shared-Memory
  transition, not a new status value.

---

## Step 11 — Get Session Summary (lightweight view)

Before synthesizing, pull the lightweight session summary to confirm all five
artifacts are tracked and see their statuses at a glance.

### Tool call

```json
{
  "tool": "get_session_summary",
  "params": {
    "sessionId": "fd-audit-2026-05-26-001"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Session summary for fd-audit-2026-05-26-001",
  "sessionId": "fd-audit-2026-05-26-001",
  "count": 5,
  "artifacts": [
    {
      "id": "urn:dkg:wm:c4e8d2f01a3b5c69",
      "name": "[HIGH/CRITICAL] OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
      "type": "vulnerability_finding",
      "status": "ready_to_share",
      "capturedAt": "2026-05-26T08:18:44.000Z"
    },
    {
      "id": "urn:dkg:wm:b8d3e7a14f2c0951",
      "name": "Fix: add data_cnt bounds check in fd_shred_merkle_parse before Merkle copy loop",
      "type": "audit_note",
      "status": "validated",
      "capturedAt": "2026-05-26T08:37:52.000Z"
    },
    {
      "id": "urn:dkg:wm:e5f1a3b7c2d08e94",
      "name": "PoC seed: fd_shred_merkle_parse OOB write — data_cnt=255 triggers stack overflow",
      "type": "code_analysis",
      "status": "validated",
      "capturedAt": "2026-05-26T08:31:09.000Z"
    },
    {
      "id": "urn:dkg:wm:a17b93f0c2e4d518",
      "name": "fd_shred_merkle_parse callers pass raw peer data without sanitising data_cnt",
      "type": "research_note",
      "status": "draft",
      "capturedAt": "2026-05-26T08:09:17.000Z"
    },
    {
      "id": "urn:dkg:wm:7f3a2b1c9d0e4f56",
      "name": "fd_shred_merkle_parse: missing bounds check on hdr->data_cnt (OOB stack write)",
      "type": "research_note",
      "status": "draft",
      "capturedAt": "2026-05-26T08:04:31.000Z"
    }
  ],
  "typeCounts": {
    "vulnerability_finding": 1,
    "audit_note": 1,
    "code_analysis": 1,
    "research_note": 2
  }
}
```

**Observation:** The two raw observations (`urn:dkg:wm:7f3a2b1c9d0e4f56`,
`urn:dkg:wm:a17b93f0c2e4d518`) are still `draft` — that is intentional. They
are intermediate work products, not conclusions; they do not need promotion.
Only the vulnerability synthesis (`urn:dkg:wm:c4e8d2f01a3b5c69`) was promoted.

---

## Step 12 — Get Claim Review for Oracle Submission

Generate the Oracle-formatted ClaimReview for the Immunefi submission portal.
This aggregates the full provenance chain, PoC reference, and fix recommendation
into a structured report.

### Tool call

```json
{
  "tool": "get_claim_review",
  "params": {
    "artifactId": "urn:dkg:wm:c4e8d2f01a3b5c69"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "ClaimReview generated successfully",
  "claimReview": {
    "@context": "https://schema.org/",
    "@type": "ClaimReview",
    "name": "[HIGH/CRITICAL] OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
    "reviewBody": "VULNERABILITY HYPOTHESIS\n\nTitle: OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt\n\nRoot cause:\n  fd_shred_merkle_parse() iterates `hdr->data_cnt` times writing 32-byte Merkle\n  nodes into a stack buffer of fixed depth FD_SHRED_MERKLE_PROOF_DEPTH_MAX (20)...",
    "reviewRating": { "ratingValue": 5 },
    "url": "urn:dkg:wm:c4e8d2f01a3b5c69",
    "datePublished": "2026-05-26T09:21:14Z"
  }
}
```

**Interpretation:** `ratingValue: 5` because the artifact's status is `ready_to_share`.
The ClaimReview is Oracle-ready — it can be submitted to any schema.org-compatible
consumer or the OriginTrail Oracle endpoint.

---

## Step 13 — Synthesize Session

Close the session with a consolidated synthesis artifact. `synthesize_session`
reads every artifact in the session, tallies a type breakdown, and writes a new
`knowledge_synthesis` artifact (auto-set to status `validated`) containing a
structured roll-up of the session's artifacts.

### Tool call

```json
{
  "tool": "synthesize_session",
  "params": {
    "sessionId": "fd-audit-2026-05-26-001",
    "title": "Firedancer shred_parse session — 2026-05-26 — OOB write in fd_shred_merkle_parse"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Knowledge synthesis created successfully",
  "synthesisArtifactId": "urn:dkg:wm:f2a9c4e0b17d3856",
  "ual": "<dkg-node-ual-for-synthesis>",
  "artifactCount": 5,
  "synthesis": "## Knowledge Synthesis for Session: fd-audit-2026-05-26-001\n\n**Artifact Count:** 5\n\n**Type Breakdown:** research_note: 2, vulnerability_finding: 1, code_analysis: 1, audit_note: 1\n\n### Artifacts:\n- Missing bounds check in fd_shred_merkle_parse (research_note, draft, hash: 7f3a2b1c)\n- Callers pass unsanitised data_cnt (research_note, draft, hash: a17b93f0)\n- OOB stack write via peer-controlled data_cnt (vulnerability_finding, ready_to_share, hash: c4e8d2f0)\n- PoC harness for fd_shred_merkle_parse OOB (code_analysis, validated, hash: e5f1a3b7)\n- Fix recommendation: bound data_cnt before Merkle loop (audit_note, validated, hash: b8d3e7a1)\n\n---\n*Generated by dkg-claude-code-memory synthesis tool*\n"
}
```

The synthesis itself is captured as a new `knowledge_synthesis` artifact, so it is
searchable and promotable like any other artifact.

---

## Complete Workflow Summary

| Step | Tool | Artifact(s) | Status after | Key action |
|------|------|-------------|--------------|------------|
| 0 | `get_node_status` | — | — | Pre-flight health check |
| 1 | `capture_research_finding` | urn:dkg:wm:7f3a2b1c9d0e4f56 | draft | Raw observation: missing bounds check |
| 2 | `capture_research_finding` | urn:dkg:wm:a17b93f0c2e4d518 | draft | Raw observation: callers pass unsanitised data |
| 3 | `capture_research_finding` | urn:dkg:wm:c4e8d2f01a3b5c69 | draft | Vulnerability synthesis, derivedFrom 0001+0002 |
| 4 | `search_working_memory` | — | — | Confirm no duplicate in session |
| 4 | `query_shared_memory` | — | — | Confirm novel vs. shared DKG history |
| 5 | `retrieve_artifact` | urn:dkg:wm:7f3a2b1c9d0e4f56 | — | Verify file/line before writing PoC |
| 6 | `capture_research_finding` | urn:dkg:wm:e5f1a3b7c2d08e94 | draft | PoC harness, derivedFrom urn:dkg:wm:c4e8d2f01a3b5c69 |
| 7 | `capture_research_finding` | urn:dkg:wm:b8d3e7a14f2c0951 | draft | Fix recommendation, derivedFrom urn:dkg:wm:c4e8d2f01a3b5c69 |
| 8 | `update_artifact_status` | urn:dkg:wm:c4e8d2f01a3b5c69, e5f1..., b8d3... | validated | Reproduction confirmed |
| 9 | `update_artifact_status` | urn:dkg:wm:c4e8d2f01a3b5c69 | ready_to_share | Review complete |
| 10 | `promote_to_shared_memory` | urn:dkg:wm:c4e8d2f01a3b5c69 | ready_to_share | Published to shared DKG |
| 11 | `get_session_summary` | — | — | Status snapshot before closing |
| 12 | `get_claim_review` | urn:dkg:wm:c4e8d2f01a3b5c69 | — | Oracle submission document |
| 13 | `synthesize_session` | — | — | Narrative + next steps |

---

## Trust Gradient Lifecycle (recap)

```
DRAFT
  │  Initial capture — unreviewed, not yet reproduced
  │
  ▼
VALIDATED
  │  Reproduction confirmed (ASAN crash observed)
  │  Novelty confirmed (search_working_memory + query_shared_memory)
  │
  ▼
READY_TO_SHARE
  │  Peer review / self-review sign-off
  │  Status remains ready_to_share after promotion
  │
  ▼  promote_to_shared_memory (confirm: true)
     Persistent in shared DKG, visible to team agents,
     stable UAL for cross-session reference
```

---

## Sensitivity Classification

All findings in this session were captured with `"sensitivity": "confidential"`.

| Sensitivity | Access | When to use |
|-------------|--------|-------------|
| `public` | Anyone after promotion | Findings already disclosed / patched publicly |
| `internal` | Team agents | In-progress research, unverified hypotheses |
| `confidential` | Team with explicit clearance — **blocks promotion** | Active private bug-bounty findings under embargo |

Private bug-bounty findings **must** use `confidential` until the contest
period closes or the program grants disclosure permission. Promoting a
`confidential` artifact to shared memory leaves visibility at `team` — it
does not become publicly readable.

---

## Provenance Graph (full session)

```
urn:dkg:wm:7f3a2b1c9d0e4f56 (research_note, draft)
    │
    │ derives→
    │
urn:dkg:wm:a17b93f0c2e4d518 (research_note, draft)
    │
    │ derives→
    │
    └──────────────► urn:dkg:wm:c4e8d2f01a3b5c69 (vulnerability_finding, ready_to_share)
                          │              └── promoted to shared DKG
                          │ derives→
                          ├──────────► urn:dkg:wm:e5f1a3b7c2d08e94 (code_analysis, validated)
                          │
                          └──────────► urn:dkg:wm:b8d3e7a14f2c0951 (audit_note, validated)
```

Every edge in this graph is registered in the DKG and survives session close.
A future session can call `search_working_memory` with `derivedFromId: "urn:dkg:wm:c4e8d2f01a3b5c69"`
to enumerate all artifacts that trace back to this vulnerability.

---

*Demo script reflects the real MCP tool signatures for dkg-claude-code-memory v1.0.0.
Firedancer audit context is from the live Immunefi contest (commit 2f4625e3, scope confirmed).*
