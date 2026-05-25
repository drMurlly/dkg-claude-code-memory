# Phase 2: Core Module Adaptation — `dkg-claude-code-memory`

**Duration:** ~3 hours  
**Goal:** All core modules compile and pass unit tests.

---

## 1. `src/types/artifact.ts` — Extend Type Definitions

Add 3 new ArtifactTypes to the existing 11 (from OpenClaw project):

```typescript
// NEW types to add to ArtifactType union:
| 'competitive_analysis'   // Market/protocol comparison
| 'knowledge_synthesis'    // Output of synthesize_session tool
| 'raw_capture'            // Catch-all

// NEW fields to add to ProvenanceRecord interface:
subAgentId?: string;       // ID of the sub-agent that produced this artifact
parentTaskId?: string;     // Session/task ID of the parent Claude Code session
agentRole?: string;        // Role description (e.g., "security-auditor", "code-reviewer")
agentFramework: string;    // Always "claude-code" for this integration
```

Full ArtifactType union (14 types total):
```typescript
export type ArtifactType =
  | 'chat'
  | 'research_note'
  | 'code_analysis'
  | 'markdown'
  | 'plan'
  | 'summary'
  | 'design_note'
  | 'implementation_log'
  | 'vulnerability_finding'
  | 'audit_note'
  | 'competitive_analysis'    // NEW
  | 'knowledge_synthesis'     // NEW
  | 'raw_capture'             // NEW
  | 'other';
```

## 2. `src/types/mcp.ts` — New File: MCP Tool Parameter Types

```typescript
export interface McpConfig {
  daemonUrl: string;          // Default: http://127.0.0.1:9200
  authToken: string;          // From DKG_AUTH_TOKEN or ~/.dkg/auth.token
  contextGraph: string;       // Default: ccm-research
  assertionName: string;      // Default: artifacts
  stateDir: string;           // Default: ~/.dkg/ccm-state
  authorId: string;           // Default: unknown
  agentId: string;            // Default: claude-code-agent
  minContentLength: number;   // Default: 80 (lower than OpenClaw's 120)
  redactionEnabled: boolean;  // Default: true
  dedupeEnabled: boolean;     // Default: true
}

export interface CaptureParams {
  content: string;
  type: string;
  title?: string;
  status?: string;
  parentTaskId?: string;
  subAgentId?: string;
  agentRole?: string;
  sessionId?: string;
}

export interface SearchParams {
  query?: string;
  type?: string;
  status?: string;
  limit?: number;
  sessionId?: string;         // NEW: filter by session
}

export interface RetrieveParams {
  artifactId: string;         // UAL (ual:...) or URN (urn:dkg:wm:...)
}

export interface UpdateStatusParams {
  artifactId: string;
  newStatus: string;
}

export interface PromoteParams {
  artifactId: string;
  confirm: boolean;
}

export interface SynthesizeParams {
  sessionId: string;
  title?: string;
}

export interface SessionSummaryParams {
  sessionId?: string;
}
```

## 3. `src/core/serializers.ts` — Extend for Sub-Agent Quads

Based on the copied `jsonld-serializer.ts`. Add 3 new predicates:

```typescript
// New predicate constants to add:
const WM_SUB_AGENT_ID = `${WM}subAgentId`;
const WM_PARENT_TASK_ID = `${WM}parentTaskId`;
const WM_AGENT_ROLE = `${WM}agentRole`;
const WM_AGENT_FRAMEWORK = `${WM}agentFramework`;
```

In `serializeToQuads(artifact: ArtifactRecord): RdfQuad[]`, add these quads if the fields are present:

```typescript
// After existing provenance quads:
if (artifact.provenance.subAgentId) {
  quads.push({ subject: provId, predicate: WM_SUB_AGENT_ID, object: lit(artifact.provenance.subAgentId) });
}
if (artifact.provenance.parentTaskId) {
  quads.push({ subject: provId, predicate: WM_PARENT_TASK_ID, object: lit(artifact.provenance.parentTaskId) });
}
if (artifact.provenance.agentRole) {
  quads.push({ subject: provId, predicate: WM_AGENT_ROLE, object: lit(artifact.provenance.agentRole) });
}
// agentFramework is always present:
quads.push({ subject: provId, predicate: WM_AGENT_FRAMEWORK, object: lit(artifact.provenance.agentFramework) });
```

Also update `serializeToJsonLd()` to include these fields in the provenance block.

## 4. `src/core/provenance-builder.ts` — Add Sub-Agent Fields

Extend `buildProvenance()` to accept and include sub-agent fields:

```typescript
export interface SubAgentContext {
  subAgentId?: string;
  parentTaskId?: string;
  agentRole?: string;
}

export function buildProvenance(
  content: string,
  raw: { source?: string; sessionId?: string; subAgent?: SubAgentContext },
  _config: McpConfig,
): ProvenanceResult {
  // ... existing hash + URN logic ...

  return {
    contentHash,
    artifactId,
    provenance: {
      source: raw.source ?? 'api',
      sessionId: raw.sessionId ?? 'unknown',
      agentFramework: 'claude-code',
      subAgentId: raw.subAgent?.subAgentId,
      parentTaskId: raw.subAgent?.parentTaskId,
      agentRole: raw.subAgent?.agentRole,
      createdAt: new Date().toISOString(),
      capturedAt: new Date().toISOString(),
    },
  };
}
```

## 5. `src/core/normalizer.ts` — Swap PluginConfig → McpConfig

Replace all `PluginConfig` references with `McpConfig`.

Key changes:
- `minContentLength` source: `config.minContentLength` (not `config.capture.minContentLength`)
- `redactionEnabled` source: `config.redactionEnabled` (not `config.redaction.enabled`)
- `dedupeEnabled`: `config.dedupeEnabled`
- Pass `subAgent` from `raw` through to `buildProvenance()`

```typescript
export function normalizeArtifact(
  raw: {
    content: string;
    artifactType?: string;
    title?: string;
    status?: string;
    sessionId?: string;
    subAgent?: SubAgentContext;
  },
  config: McpConfig,
): ArtifactRecord | null {
  // ... same logic, adapted config paths ...
}
```

## 6. `src/core/status-classifier.ts` — Add New Types

Extend classification:

```typescript
// knowledge_synthesis is always 'validated' (it's a curated summary)
if (type === 'knowledge_synthesis') return 'validated';

// competitive_analysis defaults to 'needs_sources' (needs citations)
if (type === 'competitive_analysis') return 'needs_sources';

// raw_capture is always 'draft'
if (type === 'raw_capture') return 'draft';
```

## 7. `src/core/dedupe-store.ts` — Change Default State Dir

Update default path:
```typescript
// Default: ~/.dkg/ccm-state/dedupe.json
// (instead of OpenClaw's OpenClaw workspace state dir)
```

The `stateDir` now comes from `McpConfig.stateDir`.

## 8. `src/core/dkg-client.ts` — No Changes

Copy verbatim. It has zero OpenClaw dependencies — pure HTTP client.

## 9. `src/core/redactor.ts` — No Changes

Copy verbatim. Pure string transformation.

---

## SPARQL Extension: Search by SessionId

The `search_working_memory` tool needs to filter by `sessionId`. Update the SPARQL template in `src/core/serializers.ts` (or document for Phase 3 search tool):

```sparql
# SessionId filter to add when sessionId is provided:
FILTER(?sessionId = "{escaped_sessionId}")

# Additional binding needed in SELECT + WHERE:
?id wm:provenance [ wm:sessionId ?sessionId ] .
```

---

## Deliverable Check

```bash
npm run build  # Zero TypeScript errors
npm test       # All copied unit tests pass (adapt imports as needed)
```

Key things to fix in copied tests:
- Import paths: `../src/modules/X` → `../src/core/X`
- Config shape: `PluginConfig` → `McpConfig`
- Any OpenClaw-specific test fixtures
