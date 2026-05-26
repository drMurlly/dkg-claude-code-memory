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
  "status": "ok",
  "node_id": "dkg-node-prod-03",
  "version": "0.9.4",
  "uptime_seconds": 432871,
  "shared_memory": {
    "artifact_count": 1847,
    "index_lag_seconds": 0,
    "last_sync": "2026-05-26T08:01:13Z"
  },
  "working_memory": {
    "active_sessions": 3,
    "artifact_count": 41
  },
  "storage_backend": "neo4j+redis",
  "message": "Node healthy. Shared memory index is current."
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
    "type": "observation",
    "title": "fd_shred_merkle_parse: missing bounds check on hdr->data_cnt (OOB stack write)",
    "status": "draft",
    "sensitivity": "confidential",
    "source": "fd_shred_parse.c:387 (commit 2f4625e3)",
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0001",
  "status": "draft",
  "type": "observation",
  "title": "fd_shred_merkle_parse: missing bounds check on hdr->data_cnt (OOB stack write)",
  "sensitivity": "confidential",
  "sessionId": "fd-audit-2026-05-26-001",
  "createdAt": "2026-05-26T08:04:31Z",
  "message": "Artifact created in working memory."
}
```

**Trust gradient position:** `draft` — raw observation, not yet reviewed.

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
    "type": "observation",
    "title": "fd_shred_merkle_parse callers pass raw peer data without sanitising data_cnt",
    "status": "draft",
    "sensitivity": "confidential",
    "source": "fd_shred.c:621,694 (commit 2f4625e3)",
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0002",
  "status": "draft",
  "type": "observation",
  "title": "fd_shred_merkle_parse callers pass raw peer data without sanitising data_cnt",
  "sensitivity": "confidential",
  "sessionId": "fd-audit-2026-05-26-001",
  "createdAt": "2026-05-26T08:09:17Z",
  "message": "Artifact created in working memory."
}
```

---

## Step 3 — Capture Vulnerability Hypothesis (status: `draft`, derivedFrom art-fd-0001 + art-fd-0002)

With both observations captured, drMurlly writes the formal vulnerability
hypothesis and links it to its two source observations via `derivedFrom`.

### Tool call

```json
{
  "tool": "capture_research_finding",
  "params": {
    "content": "VULNERABILITY HYPOTHESIS\n\nTitle: OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt\n\nRoot cause:\n  fd_shred_merkle_parse() iterates `hdr->data_cnt` times writing 32-byte Merkle\n  nodes into a stack buffer of fixed depth FD_SHRED_MERKLE_PROOF_DEPTH_MAX (20).\n  Because `hdr->data_cnt` is a uint16_t read directly from a peer-supplied UDP\n  datagram with no prior bounds check, an attacker can supply data_cnt=255 and\n  cause 235 * 32 = 7520 bytes of controlled stack overwrite.\n\nAttacker model:\n  Any peer on the Turbine gossip network that can send a crafted shred packet\n  to a Firedancer validator's shred-receive port. No authentication required;\n  Turbine shreds are unauthenticated at the network layer before parsing.\n\nImpact (preconditions met):\n  Stack corruption in the shred receive thread. Depending on ASLR / stack-canary\n  configuration of the production build this may be:\n    - Validator crash / process death (DoS, loss of stake rewards) — HIGH\n    - Stack-canary bypass + RIP control if canaries are absent / weak — CRITICAL\n  Conservative severity: HIGH (crash). Escalation path to CRITICAL present.\n\nAffected harness: shred_parse (contest scope confirmed).\nAffected file: fd_shred_parse.c:387\nContest commit: 2f4625e3",
    "type": "vulnerability",
    "title": "[HIGH/CRITICAL] OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
    "status": "draft",
    "sensitivity": "confidential",
    "derivedFrom": ["art-fd-0001", "art-fd-0002"],
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0003",
  "status": "draft",
  "type": "vulnerability",
  "title": "[HIGH/CRITICAL] OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
  "sensitivity": "confidential",
  "derivedFrom": ["art-fd-0001", "art-fd-0002"],
  "sessionId": "fd-audit-2026-05-26-001",
  "createdAt": "2026-05-26T08:18:44Z",
  "message": "Artifact created. Provenance edges registered: art-fd-0003 → art-fd-0001, art-fd-0003 → art-fd-0002."
}
```

**Provenance chain so far:**
```
art-fd-0001 (observation)  ─┐
                             ├─derives→  art-fd-0003 (vulnerability, draft)
art-fd-0002 (observation)  ─┘
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
    "type": "vulnerability",
    "sessionId": "fd-audit-2026-05-26-001",
    "limit": 10
  }
}
```

### Response

```json
{
  "results": [
    {
      "artifactId": "art-fd-0003",
      "title": "[HIGH/CRITICAL] OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
      "type": "vulnerability",
      "status": "draft",
      "sensitivity": "confidential",
      "createdAt": "2026-05-26T08:18:44Z",
      "matchedOn": ["keyword: shred", "keyword: OOB", "type: vulnerability"]
    }
  ],
  "total": 1,
  "sessionId": "fd-audit-2026-05-26-001"
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
  "results": [
    {
      "artifactId": "shared-firedancer-0041",
      "title": "fd_shred_parse: integer truncation in code_cnt field (low severity, mitigated)",
      "type": "vulnerability",
      "status": "mitigated",
      "sensitivity": "public",
      "similarity": 0.61,
      "promotedAt": "2026-04-15T11:22:00Z",
      "summary": "code_cnt truncated to uint8_t before use; max overread 1 entry only. Patched in commit a3f91b2c."
    }
  ],
  "total": 1,
  "query": "Firedancer shred parse out-of-bounds stack buffer overflow data_cnt"
}
```

**Interpretation:** The only related shared-memory artifact covers a previously
mitigated, low-impact `code_cnt` truncation — not `data_cnt`, and not a write.
The current finding is novel.

---

## Step 5 — Retrieve a Full Artifact to Verify Wording

drMurlly retrieves `art-fd-0001` in full to double-check the file/line reference
before writing the PoC.

### Tool call

```json
{
  "tool": "retrieve_artifact",
  "params": {
    "artifactId": "art-fd-0001"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0001",
  "type": "observation",
  "title": "fd_shred_merkle_parse: missing bounds check on hdr->data_cnt (OOB stack write)",
  "status": "draft",
  "sensitivity": "confidential",
  "source": "fd_shred_parse.c:387 (commit 2f4625e3)",
  "sessionId": "fd-audit-2026-05-26-001",
  "agentRole": "auditor",
  "createdAt": "2026-05-26T08:04:31Z",
  "content": "In fd_shred_parse.c, function fd_shred_merkle_parse() at approx line 387, the loop\n`for( ulong i=0; i<hdr->data_cnt; i++ ) merkle[i] = ...`\ncopies the Merkle proof hashes from the wire packet into a stack buffer declared as\n`uchar merkle[FD_SHRED_MERKLE_PROOF_DEPTH_MAX][FD_SHRED_MERKLE_NODE_SZ]`.\nFD_SHRED_MERKLE_PROOF_DEPTH_MAX is 20. The peer-controlled field `hdr->data_cnt` is a\nuint16_t, so values 21..65535 will write past the end of the stack buffer.\nNo bounds check on `hdr->data_cnt` precedes the loop."
}
```

File/line confirmed correct. Proceed to PoC.

---

## Step 6 — Capture PoC Harness Artifact (status: `draft`, derivedFrom art-fd-0003)

drMurlly writes a minimal fuzzer seed / harness stub that exercises the
vulnerable path through the `shred_parse` contest harness.

### Tool call

```json
{
  "tool": "capture_research_finding",
  "params": {
    "content": "/* PoC harness — fd_shred_merkle_parse OOB stack write\n * Contest harness: shred_parse\n * Build: make -C src/disco/shred run_shred_parse_fuzzer\n *\n * Craft a data shred with data_cnt = 0x00FF (255).\n * Fields that must be valid to reach fd_shred_merkle_parse:\n *   - variant byte: FD_SHRED_TYPE_MERKLE_DATA (0xA0)\n *   - sz: sizeof(fd_shred_t) + 255 * FD_SHRED_MERKLE_NODE_SZ (255*32 = 8160 bytes)\n *   - The first sizeof(fd_shred_t) bytes = valid shred header; data_cnt = 0x00FF\n *   - Remaining 8160 bytes = 0x41 (filler), filling the Merkle proof slots\n *\n * Expected outcome (ASAN build):\n *   ==ERROR: AddressSanitizer: stack-buffer-overflow\n *   WRITE of size 32 at 0x... T0 pc 0x... bp 0x... sp 0x...\n *   #0 fd_shred_merkle_parse  fd_shred_parse.c:387\n *   #1 fd_shred_parse_data    fd_shred.c:621\n *\n * Seed file layout (hex):\n *   [shred header 88 bytes, data_cnt=0x00FF at offset 6]\n *   [8160 bytes of 0x41]\n */\n\n#include <stdint.h>\n#include <string.h>\n\nvoid build_poc_seed( uint8_t * buf, size_t * out_len ) {\n  memset( buf, 0, 88 + 8160 );\n  buf[0]  = 0xA0;          /* variant: MERKLE_DATA        */\n  buf[4]  = 0x00;          /* slot lo                     */\n  buf[5]  = 0x00;          /* slot hi                     */\n  buf[6]  = 0xFF;          /* data_cnt lo — 255           */\n  buf[7]  = 0x00;          /* data_cnt hi                 */\n  /* pad rest of header to 88 bytes, leave as zero         */\n  memset( buf + 88, 0x41, 8160 ); /* Merkle node filler   */\n  *out_len = 88 + 8160;\n}",
    "type": "poc",
    "title": "PoC seed: fd_shred_merkle_parse OOB write — data_cnt=255 triggers stack overflow",
    "status": "draft",
    "sensitivity": "confidential",
    "derivedFrom": ["art-fd-0003"],
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0004",
  "status": "draft",
  "type": "poc",
  "title": "PoC seed: fd_shred_merkle_parse OOB write — data_cnt=255 triggers stack overflow",
  "sensitivity": "confidential",
  "derivedFrom": ["art-fd-0003"],
  "sessionId": "fd-audit-2026-05-26-001",
  "createdAt": "2026-05-26T08:31:09Z",
  "message": "Artifact created. Provenance edge: art-fd-0004 → art-fd-0003."
}
```

**Full provenance chain:**
```
art-fd-0001 (observation)  ─┐
                             ├─derives→  art-fd-0003 (vulnerability) ─derives→  art-fd-0004 (poc)
art-fd-0002 (observation)  ─┘
```

---

## Step 7 — Capture Fix Recommendation (status: `draft`, derivedFrom art-fd-0003)

Alongside the PoC, capture a fix recommendation so the ClaimReview can include
it without needing to regenerate it later.

### Tool call

```json
{
  "tool": "capture_research_finding",
  "params": {
    "content": "FIX RECOMMENDATION\n\nAdd a bounds check on `hdr->data_cnt` before the Merkle-copy loop in\nfd_shred_merkle_parse(). Minimal patch:\n\n  // Before the loop at fd_shred_parse.c:385\n  if( FD_UNLIKELY( hdr->data_cnt > FD_SHRED_MERKLE_PROOF_DEPTH_MAX ) )\n    return FD_SHRED_PARSE_ERR_DATA_CNT;\n\nAlternatively, clamp and treat excess depth as a parse error:\n  ulong depth = fd_ulong_min( hdr->data_cnt, FD_SHRED_MERKLE_PROOF_DEPTH_MAX );\n  for( ulong i=0; i<depth; i++ ) merkle[i] = ...;\n  if( hdr->data_cnt != depth ) return FD_SHRED_PARSE_ERR_DATA_CNT;\n\nThe early-return approach is preferred: a shred with more Merkle nodes than the\nmaximum depth is definitionally malformed and should not be accepted.\n\nNote: the fix should be applied to fd_shred_merkle_parse() regardless of call\nsite — callers should not be expected to pre-validate internal size fields.",
    "type": "fix_recommendation",
    "title": "Fix: add data_cnt bounds check in fd_shred_merkle_parse before Merkle copy loop",
    "status": "draft",
    "sensitivity": "confidential",
    "derivedFrom": ["art-fd-0003"],
    "sessionId": "fd-audit-2026-05-26-001",
    "agentRole": "auditor"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0005",
  "status": "draft",
  "type": "fix_recommendation",
  "title": "Fix: add data_cnt bounds check in fd_shred_merkle_parse before Merkle copy loop",
  "sensitivity": "confidential",
  "derivedFrom": ["art-fd-0003"],
  "sessionId": "fd-audit-2026-05-26-001",
  "createdAt": "2026-05-26T08:37:52Z",
  "message": "Artifact created. Provenance edge: art-fd-0005 → art-fd-0003."
}
```

---

## Step 8 — Advance Trust Gradient: `draft` → `validated`

drMurlly has manually reproduced the ASAN crash with the seed from `art-fd-0004`
against the contest harness. The finding is now validated. Advance the core
vulnerability artifact to `validated`.

### Tool call

```json
{
  "tool": "update_artifact_status",
  "params": {
    "artifactId": "art-fd-0003",
    "newStatus": "validated"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0003",
  "previousStatus": "draft",
  "newStatus": "validated",
  "updatedAt": "2026-05-26T09:14:03Z",
  "message": "Status updated. Artifact is now eligible for promotion review."
}
```

Also advance the PoC and fix recommendation:

### Tool call

```json
{
  "tool": "update_artifact_status",
  "params": {
    "artifactId": "art-fd-0004",
    "newStatus": "validated"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0004",
  "previousStatus": "draft",
  "newStatus": "validated",
  "updatedAt": "2026-05-26T09:14:21Z",
  "message": "Status updated."
}
```

### Tool call

```json
{
  "tool": "update_artifact_status",
  "params": {
    "artifactId": "art-fd-0005",
    "newStatus": "validated"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0005",
  "previousStatus": "draft",
  "newStatus": "validated",
  "updatedAt": "2026-05-26T09:14:34Z",
  "message": "Status updated."
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
    "artifactId": "art-fd-0003",
    "newStatus": "ready_to_share"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0003",
  "previousStatus": "validated",
  "newStatus": "ready_to_share",
  "updatedAt": "2026-05-26T09:16:08Z",
  "message": "Status updated. Artifact is ready for promote_to_shared_memory."
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
    "artifactId": "art-fd-0003",
    "confirm": true
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0003",
  "sharedMemoryId": "shared-firedancer-0198",
  "status": "promoted",
  "promotedAt": "2026-05-26T09:16:55Z",
  "visibility": "team",
  "sensitivity": "confidential",
  "message": "Artifact promoted to shared memory. Accessible to team agents with clearance >= confidential. Provenance edges to art-fd-0001 and art-fd-0002 preserved in shared graph.",
  "dkgNodeUri": "dkg://firedancer-audit/shared-firedancer-0198"
}
```

**What this did:**
- Moved the artifact out of session-scoped working memory into the persistent
  shared DKG.
- Preserved all provenance edges to the two source observations.
- Set visibility to `team` (not public) because sensitivity is `confidential`.
- Assigned a stable `sharedMemoryId` (`shared-firedancer-0198`) that can be
  referenced in future sessions.

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
  "sessionId": "fd-audit-2026-05-26-001",
  "startedAt": "2026-05-26T08:04:31Z",
  "lastActivityAt": "2026-05-26T09:16:55Z",
  "artifactCount": 5,
  "artifacts": [
    {
      "artifactId": "art-fd-0001",
      "title": "fd_shred_merkle_parse: missing bounds check on hdr->data_cnt (OOB stack write)",
      "type": "observation",
      "status": "draft"
    },
    {
      "artifactId": "art-fd-0002",
      "title": "fd_shred_merkle_parse callers pass raw peer data without sanitising data_cnt",
      "type": "observation",
      "status": "draft"
    },
    {
      "artifactId": "art-fd-0003",
      "title": "[HIGH/CRITICAL] OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
      "type": "vulnerability",
      "status": "ready_to_share",
      "sharedMemoryId": "shared-firedancer-0198"
    },
    {
      "artifactId": "art-fd-0004",
      "title": "PoC seed: fd_shred_merkle_parse OOB write — data_cnt=255 triggers stack overflow",
      "type": "poc",
      "status": "validated"
    },
    {
      "artifactId": "art-fd-0005",
      "title": "Fix: add data_cnt bounds check in fd_shred_merkle_parse before Merkle copy loop",
      "type": "fix_recommendation",
      "status": "validated"
    }
  ],
  "typeBreakdown": {
    "observation": 2,
    "vulnerability": 1,
    "poc": 1,
    "fix_recommendation": 1
  },
  "statusBreakdown": {
    "draft": 2,
    "validated": 2,
    "ready_to_share": 1
  }
}
```

**Observation:** The two raw observations (`art-fd-0001`, `art-fd-0002`) are
still `draft` — that is intentional. They are intermediate work products, not
conclusions; they do not need promotion. Only the vulnerability synthesis
(`art-fd-0003`) was promoted.

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
    "artifactId": "art-fd-0003"
  }
}
```

### Response

```json
{
  "artifactId": "art-fd-0003",
  "claimReviewId": "cr-fd-2026-0526-0003",
  "generatedAt": "2026-05-26T09:21:14Z",
  "claimReview": {
    "title": "[HIGH/CRITICAL] OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
    "severity": "HIGH",
    "escalationPath": "CRITICAL (if stack canaries absent)",
    "contestCommit": "2f4625e3",
    "affectedFile": "fd_shred_parse.c",
    "affectedFunction": "fd_shred_merkle_parse",
    "affectedLine": 387,
    "contestHarness": "shred_parse",
    "confidence": 0.94,
    "sections": {
      "summary": "An attacker-controlled uint16_t field `data_cnt` in a Merkle shred header is used as the loop bound when copying 32-byte Merkle proof nodes into a fixed-depth stack buffer of size FD_SHRED_MERKLE_PROOF_DEPTH_MAX (20). Supplying data_cnt > 20 causes an out-of-bounds write on the shred receive thread's stack. Reproducible via the shred_parse contest harness.",
      "rootCause": "Missing upper-bound check: `hdr->data_cnt` is a peer-supplied uint16_t (range 0..65535) and is used directly as the loop count against a stack array of depth 20. No sanitisation occurs in fd_shred_merkle_parse() or in either of its two callers.",
      "attackerModel": "Any peer that can send a UDP datagram to the Firedancer validator's Turbine shred-receive port. No authentication is required for shred packets prior to parsing.",
      "impactDetails": "Minimum: controlled stack corruption → validator process crash → DoS, loss of stake rewards. Escalated: stack canary bypass + instruction pointer control → remote code execution.",
      "provenanceChain": [
        {"artifactId": "art-fd-0001", "role": "source observation", "title": "Missing bounds check on hdr->data_cnt"},
        {"artifactId": "art-fd-0002", "role": "source observation", "title": "Callers pass raw peer data without sanitising data_cnt"},
        {"artifactId": "art-fd-0003", "role": "vulnerability synthesis", "title": "OOB stack write"},
        {"artifactId": "art-fd-0004", "role": "poc", "title": "data_cnt=255 seed triggers ASAN stack-buffer-overflow"},
        {"artifactId": "art-fd-0005", "role": "fix_recommendation", "title": "Add data_cnt bounds check before Merkle copy loop"}
      ],
      "reproductionSteps": "1. Build Firedancer shred_parse harness with ASAN.\n2. Use seed from art-fd-0004 (88-byte header with data_cnt=0x00FF, followed by 8160 bytes of 0x41).\n3. Run: ./shred_parse_fuzzer seed_file\n4. Expected: ASAN stack-buffer-overflow WRITE at fd_shred_merkle_parse+0x...",
      "fixRecommendation": "Add `if( FD_UNLIKELY( hdr->data_cnt > FD_SHRED_MERKLE_PROOF_DEPTH_MAX ) ) return FD_SHRED_PARSE_ERR_DATA_CNT;` immediately before the Merkle copy loop in fd_shred_merkle_parse() (fd_shred_parse.c:~385)."
    }
  },
  "sensitivity": "confidential",
  "message": "ClaimReview generated. Ready for Immunefi submission portal."
}
```

**This ClaimReview is submission-ready.** It includes the full provenance chain
(five artifacts), concrete reproduction steps, and the recommended fix. The
`confidence` score (0.94) reflects: vulnerability reproduced, scope confirmed,
novelty confirmed against shared memory.

---

## Step 13 — Synthesize Session

Close the session with a consolidated synthesis artifact. `synthesize_session`
reads all artifacts in the session and produces a narrative summary with key
findings, open questions, and recommended next steps.

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
  "synthesisId": "synth-fd-2026-0526-001",
  "sessionId": "fd-audit-2026-05-26-001",
  "title": "Firedancer shred_parse session — 2026-05-26 — OOB write in fd_shred_merkle_parse",
  "generatedAt": "2026-05-26T09:28:41Z",
  "synthesis": {
    "narrative": "Session focused on the shred_parse harness (contest scope confirmed). A single high-confidence finding was developed end-to-end: an OOB stack write in fd_shred_merkle_parse() reachable from any unauthenticated network peer via a crafted Merkle data shred with data_cnt > FD_SHRED_MERKLE_PROOF_DEPTH_MAX. The finding was reproduced with ASAN, linked to a minimal PoC seed, and a fix recommendation was captured. The vulnerability artifact was promoted to shared memory (shared-firedancer-0198) and a ClaimReview was generated (cr-fd-2026-0526-0003).",
    "keyFindings": [
      {
        "artifactId": "art-fd-0003",
        "sharedMemoryId": "shared-firedancer-0198",
        "severity": "HIGH/CRITICAL",
        "title": "OOB stack write in fd_shred_merkle_parse via peer-controlled data_cnt",
        "claimReviewId": "cr-fd-2026-0526-0003",
        "status": "ready_to_share"
      }
    ],
    "openQuestions": [
      "Does the production Firedancer build enable stack canaries? If not, the escalation path from crash to RCE is shorter.",
      "Are there analogous missing bounds checks on code_cnt, resigned_cnt, or other peer-controlled array-index fields in fd_shred_parse.c?",
      "Does the same pattern appear in fd_shred_parse for code shreds (fd_shred_parse_code at fd_shred.c:694)?"
    ],
    "recommendedNextSteps": [
      "Submit art-fd-0003 via ClaimReview cr-fd-2026-0526-0003 to Immunefi portal before 2026-05-09 17:00 UTC.",
      "Audit code_cnt and other uint16_t header fields in fd_shred_parse.c for similar missing bounds checks.",
      "Check fd_shred_tile.c for any secondary validation that might mitigate the issue at the tile boundary (affects severity assessment)."
    ],
    "artifactsSummary": {
      "total": 5,
      "promoted": 1,
      "validated": 2,
      "draft": 2
    },
    "sessionDurationMinutes": 84
  },
  "message": "Session synthesized. Synthesis artifact stored in working memory as synth-fd-2026-0526-001."
}
```

---

## Complete Workflow Summary

| Step | Tool | Artifact(s) | Status after | Key action |
|------|------|-------------|--------------|------------|
| 0 | `get_node_status` | — | — | Pre-flight health check |
| 1 | `capture_research_finding` | art-fd-0001 | draft | Raw observation: missing bounds check |
| 2 | `capture_research_finding` | art-fd-0002 | draft | Raw observation: callers pass unsanitised data |
| 3 | `capture_research_finding` | art-fd-0003 | draft | Vulnerability synthesis, derivedFrom 0001+0002 |
| 4 | `search_working_memory` | — | — | Confirm no duplicate in session |
| 4 | `query_shared_memory` | — | — | Confirm novel vs. shared DKG history |
| 5 | `retrieve_artifact` | art-fd-0001 | — | Verify file/line before writing PoC |
| 6 | `capture_research_finding` | art-fd-0004 | draft | PoC harness, derivedFrom art-fd-0003 |
| 7 | `capture_research_finding` | art-fd-0005 | draft | Fix recommendation, derivedFrom art-fd-0003 |
| 8 | `update_artifact_status` | art-fd-0003,0004,0005 | validated | Reproduction confirmed |
| 9 | `update_artifact_status` | art-fd-0003 | ready_to_share | Review complete |
| 10 | `promote_to_shared_memory` | art-fd-0003 | promoted | Published to shared DKG |
| 11 | `get_session_summary` | — | — | Status snapshot before closing |
| 12 | `get_claim_review` | art-fd-0003 | — | Oracle submission document |
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
  │
  ▼
PROMOTED  (via promote_to_shared_memory)
     Persistent in shared DKG, visible to team agents,
     stable sharedMemoryId for cross-session reference
```

---

## Sensitivity Classification

All findings in this session were captured with `"sensitivity": "confidential"`.

| Sensitivity | Who can read | When to use |
|-------------|--------------|-------------|
| `public` | Anyone | Findings already disclosed / patched publicly |
| `confidential` | Team agents with clearance | Active private bug-bounty findings (this session) |
| `restricted` | Named agents only | Findings under coordinated disclosure embargo |

Private bug-bounty findings **must** use `confidential` until the contest
period closes or the program grants disclosure permission. Promoting a
`confidential` artifact to shared memory leaves visibility at `team` — it
does not become publicly readable.

---

## Provenance Graph (full session)

```
art-fd-0001 (observation, draft)
    │
    │ derives→
    │
art-fd-0002 (observation, draft)
    │
    │ derives→
    │
    └──────────────► art-fd-0003 (vulnerability, ready_to_share)
                          │              └── promoted → shared-firedancer-0198
                          │ derives→
                          ├──────────► art-fd-0004 (poc, validated)
                          │
                          └──────────► art-fd-0005 (fix_recommendation, validated)
```

Every edge in this graph is registered in the DKG and survives session close.
A future session can call `search_working_memory` with `derivedFromId: "art-fd-0003"`
to enumerate all artifacts that trace back to this vulnerability.

---

*Demo script reflects the real MCP tool signatures for dkg-claude-code-memory v0.9.x.
Firedancer audit context is from the live Immunefi contest (commit 2f4625e3, scope confirmed).*
