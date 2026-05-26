# Oracle Readiness Guide — OriginTrail DKG Verification

> **Document Version:** 1.1  
> **Last Updated:** 2026-05-26  
> **Project:** dkg-claude-code-memory  
> **Target:** OriginTrail DKG v10 Oracle Verification

---

## 1. What is OriginTrail Oracle Verification?

The OriginTrail Oracle is a verifiable AI oracle service that allows external systems to cryptographically verify the authenticity, provenance, and integrity of AI-generated content stored on the OriginTrail Decentralized Knowledge Graph (DKG). When artifacts are stored via this MCP server, they become part of the DKG Working Memory layer with full cryptographic provenance.

### Key Concepts

**Working Memory vs. Shared Memory:**
- **Working Memory:** Temporary, agent-specific artifacts with full provenance tracking. These are stored with SHA-256 content hashes and URN identifiers.
- **Shared Memory:** Promoted artifacts that have passed validation and can be shared across agents/sessions. Promotion requires status transition through the trust gradient: `draft → needs_sources → review_needed → validated → ready_to_share`.

**Cryptographic Provenance:**
Each artifact is serialized into RDF quads using the `serializeToQuads()` function in `src/core/serializers.ts`. The quads include:
- Content hash for integrity verification
- Agent and author identifiers
- Session and conversation tracking
- Tool call and file path provenance
- DKG-specific metadata (UAL, context graph, assertion name)

**Verification Flow:**
1. Artifact is written to Working Memory with content hash
2. DKG daemon stores the RDF quads on the blockchain
3. Oracle can verify the artifact's existence and integrity via on-chain queries
4. ClaimReview schema allows external auditors to verify AI-generated claims

---

## 2. toClaimReview() Output Format and Field Mapping

The `toClaimReview()` serializer converts an `ArtifactRecord` into the schema.org/ClaimReview format expected by the OriginTrail Oracle. It is implemented in `src/core/serializers.ts`, exported from `dist/index.js`, and covered by 10 unit tests.

```typescript
// toClaimReview() — implemented in src/core/serializers.ts, exported from dist/index.js
import { toClaimReview } from 'dkg-claude-code-memory';

const claimReview = toClaimReview(artifactRecord);
// Returns:
// {
//   '@context': 'https://schema.org/',
//   '@type': 'ClaimReview',
//   name: artifactRecord.title,
//   reviewBody: artifactRecord.content,
//   reviewRating: { ratingValue: 4 },  // validated → 4, ready_to_share → 5, etc.
//   url: artifactRecord.artifactId,    // urn:dkg:wm:<sha256-prefix>
//   datePublished: artifactRecord.provenance.capturedAt
// }
```

The complete field mapping (the output contains exactly these keys — nothing more):

| ArtifactRecord Field | ClaimReview Field | Type | Description |
|---------------------|-------------------|------|-------------|
| *(constant)* | `@context` | URI | Always `"https://schema.org/"` |
| *(constant)* | `@type` | Literal | Always `"ClaimReview"` |
| `title` | `name` | Literal | Title of the claim being reviewed |
| `content` | `reviewBody` | Literal | Full text of the claim/review content |
| `status` | `reviewRating.ratingValue` | Integer (1–5) | Trust-gradient status mapped to a confidence rating (see table below) |
| `artifactId` | `url` | URI | Artifact URN (`urn:dkg:wm:<16-hex-sha256-prefix>`) |
| `provenance.capturedAt` | `datePublished` | DateTime | ISO 8601 capture timestamp |

**Status → `ratingValue` mapping** (`statusToRatingValue` in `src/core/serializers.ts`):

| Status | ratingValue |
|---|---|
| `ready_to_share` | 5 |
| `validated` | 4 |
| `review_needed` | 3 |
| `needs_sources` | 2 |
| `draft` / `deprecated` / `discarded` | 1 |

### JSON-LD Output Example

```json
{
  "@context": "https://schema.org/",
  "@type": "ClaimReview",
  "name": "High Severity: distribute() Permanent DoS",
  "reviewBody": "The distribute() function can be permanently DoSed via challengeExit()...",
  "reviewRating": { "ratingValue": 4 },
  "url": "urn:dkg:wm:7f3a2b1c9d0e4f56",
  "datePublished": "2026-05-25T10:30:00.000Z"
}
```

> The current serializer keeps the ClaimReview deliberately minimal — the five mapped fields plus the two constants. Richer provenance (author, agent framework, tool calls, content hash, UAL) is already stored on the artifact's RDF quads and can be joined in by an Oracle consumer; extending `toClaimReview()` to embed them inline is tracked under *Future Enhancements* below.

---

## 3. How to Submit a ClaimReview to OriginTrail

> **Scope note:** This server generates Oracle-ready ClaimReview JSON-LD via `get_claim_review`, but does **not** itself submit to the Oracle. The signing/submission flow below is illustrative — it shows how a downstream consumer would push the JSON-LD on-chain. A dedicated `submit_to_oracle` tool is tracked under *Future Enhancements* (Section 5). Endpoint URLs and transaction shapes shown here are representative, not a stable API contract.

### Prerequisites

1. **DKG Node Access:** You must have access to an OriginTrail DKG v10 node with the Oracle service enabled.
2. **Artifact in Working Memory:** The artifact must already be stored with a valid content hash and UAL.
3. **Status Transition:** The artifact should have reached status `ready_to_share` (the top of the trust gradient) before Oracle submission.

### Submission Steps

**Step 1: Generate ClaimReview from Artifact**

Call the `get_claim_review` MCP tool — it fetches the artifact by ID and runs `toClaimReview()` for you, returning the JSON-LD in `result.claimReview`:

```json
{
  "tool": "get_claim_review",
  "arguments": { "artifactId": "urn:dkg:wm:abc1230def456789" }
}
```

(Internally this fetches the artifact via `DkgClient.querySparql()` and serializes it with `toClaimReview()` from `src/core/serializers.ts`.)

**Step 2: Sign the ClaimReview**

The ClaimReview must be cryptographically signed by the submitting agent:

```bash
# Using cast (Foundry)
cast sign --private-key <KEY> --data "$(jq -c . claim-review.json)"
```

**Step 3: Submit to Oracle Endpoint**

```bash
curl -X POST https://oracle.origintrail.io/v1/claim-review \
  -H "Content-Type: application/ld+json" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -d @claim-review.json
```

**Step 4: Verify Submission**

The Oracle will return a verification transaction hash:

```json
{
  "status": "submitted",
  "verificationTx": "0x1234abcd...",
  "ual": "urn:ual:origintrail:abc123def456",
  "estimatedConfirmationTime": "2026-01-15T15:00:00Z"
}
```

**Step 5: On-Chain Verification**

After confirmation, verify via the DKG explorer:

```
https://explorer.origintrail.io/ual/urn:ual:origintrail:abc123def456
```

---

## 4. End-to-End Example: Research Finding to Oracle Verification

### Scenario

Agent A discovers a security vulnerability in a smart contract and stores it as Working Memory. Agent B reviews and promotes it to Shared Memory. The finding is then submitted to the Oracle for public verification.

### Step-by-Step Workflow

**Step 1: Agent A Discovers Vulnerability**

Agent A runs slither analysis and finds a reentrancy vulnerability:

```bash
slither /home/selon/immunefi/immunefi_27_firedancer/src \
  --filter-paths 'test|mock' \
  --check-list 'reentrancy-benign'
```

**Step 2: Store as Working Memory**

Agent A calls the MCP tool to store the finding:

```json
{
  "tool": "capture_research_finding",
  "arguments": {
    "type": "vulnerability_finding",
    "title": "Reentrancy in RocketMegapoolDelegate.distribute()",
    "content": "The distribute() function lacks reentrancy guard...",
    "sensitivity": "confidential"
  }
}
```

Response includes artifact ID and content hash:

```json
{
  "success": true,
  "artifactId": "urn:dkg:wm:7f3a2b1c9d0e4f56",
  "contentHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "status": "draft"
}
```

**Step 3: Agent B Reviews and Promotes**

Agent B retrieves the artifact, verifies the finding, and advances its status (the status param is named `newStatus`):

```json
{
  "tool": "update_artifact_status",
  "arguments": {
    "artifactId": "urn:dkg:wm:7f3a2b1c9d0e4f56",
    "newStatus": "ready_to_share"
  }
}
```

**Step 4: Generate ClaimReview**

```json
{
  "tool": "get_claim_review",
  "arguments": { "artifactId": "urn:dkg:wm:7f3a2b1c9d0e4f56" }
}
```

**Step 5: Submit to Oracle**

Submit the ClaimReview to the OriginTrail Oracle endpoint (as described in Section 3).

**Step 6: Verify via Oracle**

After on-chain confirmation, anyone can verify the finding's authenticity:

```bash
curl https://oracle.origintrail.io/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"ual": "urn:ual:origintrail:abc123def456"}'
```

Response:

```json
{
  "verified": true,
  "contentHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "author": "urn:author:agent-a",
  "datePublished": "2026-05-25T10:30:00.000Z",
  "status": "ready_to_share"
}
```

---

## 5. Limitations and Scope

### Current Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| `toClaimReview()` ✅ Implemented in src/core/serializers.ts | Automatic JSON-LD generation available | Import from `dkg-claude-code-memory` |
| Oracle API access requires API token | Not all users can submit | Coordinate with OriginTrail for API access |
| DKG v10 required | DKG v9 artifacts not compatible | Ensure DKG v10 daemon is running |
| Content hash verification only | Does not verify semantic correctness | Human review still required |
| Working Memory only | Shared Memory promotion is manual | Implement automated promotion rules |

### Out of Scope

- **AI Model Verification:** The Oracle verifies artifact provenance, not the underlying AI model's reasoning quality.
- **Off-Chain Content:** Only artifacts stored on DKG Working Memory can be verified. Local files without DKG registration are not verifiable.
- **Confidential Artifacts:** Artifacts with `sensitivity: confidential` should not be submitted to the Oracle without explicit confirmation. The `promote_to_shared_memory` tool enforces this guard automatically.
- **Real-Time Verification:** On-chain confirmation takes time (typically 10-30 minutes on mainnet).

### Security Considerations

1. **Secret Redaction:** Ensure `DKG_WM_REDACTION=true` is set to automatically redact API keys and private data before storage.
2. **Access Control:** Only agents with `ready_to_share` status should generate ClaimReview submissions.
3. **Content Hash Integrity:** Any modification to the content after storage invalidates the content hash verification.
4. **Agent Identity:** Verify agent signatures before accepting ClaimReview submissions from unknown agents.

### Future Enhancements

- Oracle submission MCP tool (`submit_to_oracle`)
- Automatic status promotion based on tool verification results
- Batch ClaimReview submission for multiple artifacts
- Oracle verification cache to reduce redundant on-chain queries

---

## References

- [OriginTrail DKG v10 Documentation](https://docs.origintrail.io/general-faqs/dkg-v6-upcoming-features/verifiable-ai-oracle)
- [schema.org/ClaimReview](https://schema.org/ClaimReview)
- [DKG v10 Round 1 Integrations Bounty](https://docs.origintrail.io/origintrail-v9-v10/origintrail-dkg-v10-bounty-program)
- Project README: `/home/selon/dkg-claude-code-memory/README.md`
