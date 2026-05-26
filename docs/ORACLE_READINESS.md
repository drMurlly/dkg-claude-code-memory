# Oracle Readiness Guide — OriginTrail DKG Verification

> **Document Version:** 1.0  
> **Last Updated:** 2026-01-15  
> **Project:** dkg-claude-code-memory  
> **Target:** OriginTrail DKG v10 Oracle Verification

---

## 1. What is OriginTrail Oracle Verification?

The OriginTrail Oracle is a verifiable AI oracle service that allows external systems to cryptographically verify the authenticity, provenance, and integrity of AI-generated content stored on the OriginTrail Decentralized Knowledge Graph (DKG). When artifacts are stored via this MCP server, they become part of the DKG Working Memory layer with full cryptographic provenance.

### Key Concepts

**Working Memory vs. Shared Memory:**
- **Working Memory:** Temporary, agent-specific artifacts with full provenance tracking. These are stored with SHA-256 content hashes and URN identifiers.
- **Shared Memory:** Promoted artifacts that have passed validation and can be shared across agents/sessions. Promotion requires status transition through the 7-status workflow (draft → reviewed → ready_to_share → shared).

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

Below is the complete field mapping table:

| ArtifactRecord Field | ClaimReview Schema Field | Type | Description |
|---------------------|-------------------------|------|-------------|
| `artifactId` | `@id` | URI | Unique identifier for the review artifact |
| `artifactType` | `@type` | Literal | Always "ClaimReview" for verified claims |
| `title` | `headline` | Literal | Title of the claim being reviewed |
| `content` | `reviewBody` | Literal | Full text of the claim/review content |
| `status` | `reviewAspect` | Literal | The aspect being reviewed (e.g., "security", "code-quality") |
| `author.id` | `author.@id` | URI | Author identifier (urn:author:{id}) |
| `author.name` | `author.name` | Literal | Human-readable author name |
| `agent.framework` | `publisher.name` | Literal | Agent framework (e.g., "Claude Code", "LangChain") |
| `agent.version` | `publisher.version` | Literal | Agent framework version |
| `provenance.createdAt` | `datePublished` | DateTime | ISO 8601 timestamp of creation |
| `provenance.modifiedAt` | `dateModified` | DateTime | ISO 8601 timestamp of last modification |
| `provenance.sessionId` | `reviewedBy.sessionId` | Literal | Original session identifier |
| `provenance.subAgentId` | `reviewedBy.subAgentId` | Literal | Sub-agent identifier if applicable |
| `provenance.toolCalls` | `reviewedBy.toolCalls` | Array | List of tool calls used in analysis |
| `provenance.filePaths` | `reviewedBy.citedSources` | Array | File paths referenced in the claim |
| `dkg.ual` | `claimReference` | URI | Universal Asset Locator for DKG verification |
| `contentHash` | `claimEvidence` | Literal | SHA-256 hash of the content for integrity |
| `dkg.assertionName` | `claimDataset` | Literal | DKG assertion name containing the claim |
| `dkg.contextGraph` | `claimContext` | Literal | Context graph identifier |

### JSON-LD Output Example

```json
{
  "@context": [
    "https://schema.org",
    "https://ontology.origintrail.io/dkg/wm#"
  ],
  "@id": "urn:artifact:abc123",
  "@type": "ClaimReview",
  "headline": "High Severity: distribute() Permanent DoS",
  "reviewBody": "The distribute() function can be permanently DoSed via challengeExit()...",
  "reviewAspect": "security-vulnerability",
  "author": {
    "@id": "urn:author:agent-b",
    "name": "Security Research Agent"
  },
  "publisher": {
    "name": "Claude Code",
    "version": "0.3.5"
  },
  "datePublished": "2026-01-15T10:30:00Z",
  "dateModified": "2026-01-15T14:45:00Z",
  "reviewedBy": {
    "sessionId": "sess-7f3a2b1c",
    "subAgentId": "agent-b-derive",
    "toolCalls": ["slither", "forge-test"],
    "citedSources": ["/home/selon/immunefi/immunefi_27_firedancer/src/RocketMegapoolDelegate.sol"]
  },
  "claimReference": "urn:ual:origintrail:abc123def456",
  "claimEvidence": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "claimDataset": "megapool-security-audit-v1",
  "claimContext": "fire-dancer-v1.4-saturn"
}
```

---

## 3. How to Submit a ClaimReview to OriginTrail

### Prerequisites

1. **DKG Node Access:** You must have access to an OriginTrail DKG v10 node with the Oracle service enabled.
2. **Artifact in Working Memory:** The artifact must already be stored with a valid content hash and UAL.
3. **Status Transition:** The artifact should have status `ready_to_share` or `shared` before Oracle submission.

### Submission Steps

**Step 1: Generate ClaimReview from Artifact**

Call the `toClaimReview()` serializer or manually construct the JSON-LD:

```typescript
import { toClaimReview } from './src/core/serializers.js';
import { getArtifact } from './src/core/storage.js';

const artifact = await getArtifact('urn:artifact:abc123');
const claimReview = toClaimReview(artifact);
```

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
  "tool": "store_artifact",
  "params": {
    "artifactType": "security-finding",
    "title": "Reentrancy in RocketMegapoolDelegate.distribute()",
    "content": "The distribute() function lacks reentrancy guard...",
    "sensitivity": "high",
    "status": "draft"
  }
}
```

Response includes artifact ID and content hash:

```json
{
  "artifactId": "urn:artifact:7f3a2b1c",
  "contentHash": "sha256:abc123...",
  "ual": "urn:ual:origintrail:pending"
}
```

**Step 3: Agent B Reviews and Promotes**

Agent B retrieves the artifact, verifies the finding, and updates status:

```json
{
  "tool": "update_artifact",
  "params": {
    "artifactId": "urn:artifact:7f3a2b1c",
    "status": "ready_to_share",
    "reviewNotes": "Verified via forge test on mainnet fork"
  }
}
```

**Step 4: Generate ClaimReview**

```typescript
const artifact = await getArtifact('urn:artifact:7f3a2b1c');
const claimReview = toClaimReview(artifact);
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
  "contentHash": "sha256:abc123...",
  "author": "urn:author:agent-a",
  "datePublished": "2026-01-15T10:30:00Z",
  "status": "shared"
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
- **Private Artifacts:** Artifacts with `sensitivity: private` should not be submitted to the Oracle.
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
