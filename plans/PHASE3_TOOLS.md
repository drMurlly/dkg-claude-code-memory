# Phase 3: MCP Tools — `dkg-claude-code-memory`

**Duration:** ~4 hours  
**Goal:** All 7 tools implemented, manually testable.

Each tool exports a single async function: `handleToolName(params, deps) → Promise<ToolResult>`.
The MCP server in Phase 4 wraps these in `server.tool()` calls.

---

## Shared: Tool Dependencies Interface

```typescript
// src/tools/types.ts
export interface ToolDeps {
  client: DkgWmClient;
  dedupeStore: DedupeStore;
  config: McpConfig;
}

export interface ToolResult {
  success: boolean;
  message: string;
  [key: string]: unknown;
}
```

---

## Tool 1: `capture_research_finding` (src/tools/capture.ts)

**Purpose:** Main write path. Normalizes → serializes → writes to DKG WM.

```typescript
export async function handleCapture(
  params: CaptureParams,
  deps: ToolDeps,
): Promise<ToolResult>
```

**Flow:**
1. Validate `params.type` is in ARTIFACT_TYPES (14 values). If invalid, return error.
2. Call `normalizeArtifact({ content: params.content, artifactType: params.type, title: params.title, status: params.status, sessionId: params.sessionId, subAgent: { subAgentId: params.subAgentId, parentTaskId: params.parentTaskId, agentRole: params.agentRole } }, deps.config)`
3. If null (content too short or empty), return `{ success: false, message: 'Content too short...' }`
4. Check `deps.dedupeStore.has(artifact.contentHash)` → if true, return `{ success: true, deduplicated: true, artifactId: existing.ual }`
5. Build quads: `serializeToQuads(artifact)`
6. Call `deps.client.createOrWriteAssertion({ contextGraphId: config.contextGraph, name: config.assertionName, quads, assertionExists: deps.dedupeStore.isAssertionCreated() })`
7. If assertion was just created: `deps.dedupeStore.markAssertionCreated()`
8. Update `artifact.dkg.ual` with returned UAL
9. `deps.dedupeStore.add(artifact.contentHash, ual)` → `await deps.dedupeStore.save()`
10. Return `{ success: true, artifactId: artifact.artifactId, ual, status: artifact.status, contextGraph, assertionName, message }`

**Error handling:** Catch `DkgUnavailableError` → return `{ success: false, message: 'DKG node unavailable...' }`

---

## Tool 2: `search_working_memory` (src/tools/search.ts)

**Purpose:** SPARQL-backed search. Adapts the OpenClaw search tool + adds sessionId filter.

```typescript
export async function handleSearch(
  params: SearchParams,
  deps: ToolDeps,
): Promise<ToolResult>
```

**SPARQL Template:**

```sparql
PREFIX wm: <https://ontology.origintrail.io/dkg/wm#>
PREFIX schema: <https://schema.org/>

SELECT ?id ?name ?type ?status ?contentHash ?capturedAt ?sessionId WHERE {
  ?id a wm:WorkingMemoryArtifact ;
      wm:status ?status ;
      wm:artifactType ?type ;
      wm:contentHash ?contentHash ;
      schema:name ?name ;
      wm:provenance ?prov .
  ?prov wm:capturedAt ?capturedAt .
  OPTIONAL { ?prov wm:sessionId ?sessionId }
  OPTIONAL { ?id schema:text ?content }
  {FILTERS}
}
ORDER BY DESC(?capturedAt)
LIMIT {limit}
```

**Filters to inject:**
- Status: `FILTER(?status = "{escaped}")`
- Type: `FILTER(?type = "{escaped}")`
- Keyword: `FILTER(CONTAINS(LCASE(STR(?content)), LCASE("{escaped}")) || CONTAINS(LCASE(STR(?name)), LCASE("{escaped}")))`
- **SessionId (NEW):** `FILTER(?sessionId = "{escaped}")`

**Post-processing:** Deduplicate by `?id`, keeping highest-priority status (same logic as OpenClaw version).

**Return:**
```typescript
{
  success: true,
  query: params.query ?? '(all)',
  count: artifacts.length,
  artifacts: [{ id, name, type, status, contentHash, capturedAt, sessionId }],
  message: `Found ${n} artifacts`
}
```

---

## Tool 3: `get_artifact_content` (src/tools/retrieve.ts)

**Purpose:** Retrieve full artifact by artifactId (UAL or URN).

```typescript
export async function handleRetrieve(
  params: RetrieveParams,
  deps: ToolDeps,
): Promise<ToolResult>
```

**Flow:**
1. Validate `params.artifactId` is non-empty
2. Escape for SPARQL: `sparqlEscape(params.artifactId)`
3. Run SPARQL:

```sparql
PREFIX wm: <https://ontology.origintrail.io/dkg/wm#>
PREFIX schema: <https://schema.org/>

SELECT ?pred ?obj WHERE {
  <{artifactId}> ?pred ?obj .
}
```

4. Parse result into a flat object: `{ type, status, contentHash, name, text, capturedAt, sessionId, subAgentId, parentTaskId, agentRole, ... }`
5. Return `{ success: true, artifact: { id, ...fields }, message }`
6. If zero results: `{ success: false, message: 'Artifact not found' }`

---

## Tool 4: `update_artifact_status` (src/tools/update-status.ts)

**Purpose:** Change status of an artifact. Direct copy from OpenClaw project.

```typescript
export async function handleUpdateStatus(
  params: UpdateStatusParams,
  deps: ToolDeps,
): Promise<ToolResult>
```

**Flow:** (identical to OpenClaw update-status-tool.ts)
1. Validate `params.artifactId` (must be non-empty string)
2. Validate `params.newStatus` is in ARTIFACT_STATUSES
3. Generate 2 quads via `serializeStatusUpdateQuads(artifactId, newStatus, new Date().toISOString())`
4. Call `deps.client.writeAssertion(config.contextGraph, config.assertionName, quads)`
5. Return `{ success: true, artifactId, newStatus, message }`

---

## Tool 5: `promote_to_shared_memory` (src/tools/promote.ts)

**Purpose:** Curator-gated promotion. Requires `confirm: true`. Direct copy from OpenClaw promote-tool.

```typescript
export async function handlePromote(
  params: PromoteParams,
  deps: ToolDeps,
): Promise<ToolResult>
```

**Security guard (CRITICAL):**
```typescript
if (params.confirm !== true) {
  return {
    success: false,
    message: 'Set confirm=true only after the user has explicitly said they want to share this artifact with the team.',
  };
}
```

**Flow:**
1. Security guard check
2. Call `deps.client.promoteAssertion(config.contextGraph, config.assertionName)`
3. Return `{ success: true, artifactId, message: 'Promoted to Shared Working Memory' }`

---

## Tool 6: `synthesize_session` (src/tools/synthesize.ts)

**Purpose:** Aggregate all artifacts from a session into a `knowledge_synthesis` artifact. NEW.

```typescript
export async function handleSynthesize(
  params: SynthesizeParams,
  deps: ToolDeps,
): Promise<ToolResult>
```

**Flow:**
1. Validate `params.sessionId` is non-empty
2. Run SPARQL to get all artifacts for session (reuse search logic with sessionId filter, no limit)
3. If 0 artifacts found: return `{ success: false, message: 'No artifacts found for session' }`
4. Build synthesis content:

```
Session Synthesis: {title or sessionId}
Generated: {timestamp}

{count} artifacts captured during this session:

{for each artifact:}
[{index}] {name} ({type}, {status})
  Hash: {contentHash}
  Captured: {capturedAt}

Key findings by type:
- vulnerability_finding: {count}
- code_analysis: {count}
- research_note: {count}
...
```

5. Call `handleCapture` with:
   - `content`: synthesis text above
   - `type`: `'knowledge_synthesis'`
   - `title`: `params.title ?? 'Session Synthesis: ' + params.sessionId`
   - `status`: `'validated'` (synthesis is auto-validated)
   - `sessionId`: `params.sessionId`
   - `parentTaskId`: `params.sessionId` (self-referential — this synthesizes the session)

6. Return `{ success: true, synthesisArtifactId, ual, artifactCount, message }`

---

## Tool 7: `get_session_summary` (src/tools/session-summary.ts)

**Purpose:** List all artifacts from a session (lightweight, no full content).

```typescript
export async function handleSessionSummary(
  params: SessionSummaryParams,
  deps: ToolDeps,
): Promise<ToolResult>
```

**Flow:**
1. `sessionId` defaults to `'unknown'` if not provided
2. SPARQL (same as search but with mandatory sessionId filter, larger limit of 200):

```sparql
SELECT ?id ?name ?type ?status ?capturedAt WHERE {
  ?id a wm:WorkingMemoryArtifact ;
      wm:status ?status ;
      wm:artifactType ?type ;
      schema:name ?name ;
      wm:provenance ?prov .
  ?prov wm:capturedAt ?capturedAt ;
        wm:sessionId "{escaped_sessionId}" .
}
ORDER BY DESC(?capturedAt)
LIMIT 200
```

3. Return:
```typescript
{
  success: true,
  sessionId,
  count: artifacts.length,
  artifacts: [{ id, name, type, status, capturedAt }],
  typeCounts: { vulnerability_finding: N, code_analysis: N, ... },
  message: `${n} artifacts in session ${sessionId}`
}
```

---

## SPARQL Injection Prevention (apply to all tools)

All user-supplied strings used in SPARQL must be escaped:

```typescript
function sparqlEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
```

Status/type values: validate against enum before interpolation. Invalid values rejected with error message, not silently dropped.

---

## Shared SPARQL Context Graph Scoping

All SPARQL queries should scope to the configured context graph:

```typescript
await deps.client.querySparql(sparql, {
  contextGraphId: deps.config.contextGraph,
  assertionName: deps.config.assertionName,
});
```

---

## Deliverable Check

Each tool should be manually invokable via a test script:

```typescript
// test-manual.ts (not committed)
import { handleCapture } from './src/tools/capture.js';
const result = await handleCapture(
  { content: 'Test finding about reentrancy in Contract.sol', type: 'vulnerability_finding', sessionId: 'test-001' },
  { client, dedupeStore, config }
);
console.log(JSON.stringify(result, null, 2));
```
