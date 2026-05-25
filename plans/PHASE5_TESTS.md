# Phase 5: Tests — `dkg-claude-code-memory`

**Duration:** ~5 hours  
**Target:** 150+ tests, >95% statement coverage, 0 failures.

---

## Test Architecture

```
tests/
├── unit/
│   ├── core/
│   │   ├── dkg-client.test.ts         ~40 tests  (copy from openclaw, adapt imports)
│   │   ├── serializers.test.ts        ~35 tests  (copy + 10 new for subAgent quads)
│   │   ├── redactor.test.ts           ~20 tests  (copy verbatim)
│   │   ├── normalizer.test.ts         ~20 tests  (copy + adapt McpConfig)
│   │   └── status-classifier.test.ts ~18 tests  (copy + 5 new types)
│   └── tools/
│       ├── capture.test.ts            ~25 tests  (new)
│       ├── search.test.ts             ~18 tests  (copy + adapt + sessionId tests)
│       ├── retrieve.test.ts           ~10 tests  (new)
│       ├── update-status.test.ts      ~12 tests  (copy from openclaw)
│       ├── promote.test.ts            ~10 tests  (copy from openclaw)
│       ├── synthesize.test.ts         ~18 tests  (new)
│       └── session-summary.test.ts   ~12 tests  (new)
├── integration.test.ts                ~15 tests  (new, mocked fetch)
└── live-integration.test.ts           ~8 tests   (new, real DKG node)
```

**Total target: ~261 test cases** (well above the 150 minimum).

---

## Mocking Strategy

All unit tests mock `DkgWmClient` and `DedupeStore` using Vitest's `vi.fn()`.

```typescript
// tests/unit/helpers.ts
import { vi } from 'vitest';
import type { McpConfig } from '../../src/types/mcp.js';

export function makeMockClient() {
  return {
    createContextGraph: vi.fn().mockResolvedValue(undefined),
    ensureContextGraph: vi.fn().mockResolvedValue(undefined),
    createOrWriteAssertion: vi.fn().mockResolvedValue({ ual: 'ual:test:123', written: 5 }),
    writeAssertion: vi.fn().mockResolvedValue({ written: 2 }),
    querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] } }),
    queryAssertion: vi.fn().mockResolvedValue({ quads: [], count: 0 }),
    promoteAssertion: vi.fn().mockResolvedValue(undefined),
    getAssertionHistory: vi.fn().mockResolvedValue([]),
  };
}

export function makeMockDedupeStore() {
  return {
    has: vi.fn().mockReturnValue(false),
    add: vi.fn(),
    getRecord: vi.fn().mockReturnValue(undefined),
    size: vi.fn().mockReturnValue(0),
    isAssertionCreated: vi.fn().mockReturnValue(false),
    markAssertionCreated: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

export const testConfig: McpConfig = {
  daemonUrl: 'http://127.0.0.1:9200',
  authToken: 'test-token',
  contextGraph: 'ccm-research',
  assertionName: 'artifacts',
  stateDir: '/tmp/ccm-test-state',
  authorId: 'test-author',
  agentId: 'claude-code-agent',
  minContentLength: 80,
  redactionEnabled: true,
  dedupeEnabled: true,
};
```

---

## `tests/unit/core/dkg-client.test.ts` (~40 tests)

**Source:** Copy from `/home/selon/dkg-openclaw-working-memory/tests/dkg-wm-client.test.ts`  
**Changes:** Update import path to `../../src/core/dkg-client.js`

Test groups (copy these exactly):
- Constructor and configuration validation
- `getAgentAddress()` — success, 401, 503, network error
- `createContextGraph()` — success, conflict (409), auth error
- `ensureContextGraph()` — idempotent on 409/400
- `createAssertion()` — success, already-exists
- `writeAssertion()` — success, auth error, unavailable with retries
- `createOrWriteAssertion()` — first write (create), subsequent write
- `querySparql()` — success, empty result, malformed response
- `promoteAssertion()` — success, auth error
- Retry logic: exponential backoff on 503, max 3 retries, no retry on 401

---

## `tests/unit/core/serializers.test.ts` (~35 tests)

**Source:** Copy from openclaw `jsonld-serializer.test.ts`  
**Changes:** Import path, then add 10 new tests for sub-agent quads.

**New tests to add:**
```typescript
describe('sub-agent quad generation', () => {
  it('includes wm:subAgentId quad when subAgentId present', () => {
    const artifact = makeArtifact({ provenance: { subAgentId: 'agent-abc' } });
    const quads = serializeToQuads(artifact);
    const subAgentQuad = quads.find(q => q.predicate.includes('subAgentId'));
    expect(subAgentQuad?.object).toBe('"agent-abc"');
  });

  it('includes wm:parentTaskId quad when parentTaskId present', () => { ... });

  it('includes wm:agentRole quad when agentRole present', () => { ... });

  it('always includes wm:agentFramework quad as "claude-code"', () => {
    const quads = serializeToQuads(makeArtifact());
    const fwQuad = quads.find(q => q.predicate.includes('agentFramework'));
    expect(fwQuad?.object).toBe('"claude-code"');
  });

  it('omits sub-agent quads when fields are undefined', () => {
    const artifact = makeArtifact({ provenance: {} });
    const quads = serializeToQuads(artifact);
    expect(quads.find(q => q.predicate.includes('subAgentId'))).toBeUndefined();
    expect(quads.find(q => q.predicate.includes('parentTaskId'))).toBeUndefined();
  });

  it('JSON-LD output includes agentFramework', () => {
    const jsonld = serializeToJsonLd(makeArtifact());
    expect(jsonld['wm:provenance']?.['wm:agentFramework']).toBe('claude-code');
  });

  // Existing: string escaping, RDF literal format, all standard predicates
});
```

---

## `tests/unit/core/normalizer.test.ts` (~20 tests)

**Source:** Copy from openclaw `artifact-normalizer.test.ts`  
**Changes:** Replace `PluginConfig` with `McpConfig`, update config field paths.

Key test cases:
- Returns null for content shorter than `minContentLength`
- Returns null for content exceeding 500KB
- Redacts secrets when `redactionEnabled: true`
- Does NOT redact when `redactionEnabled: false`
- Sets correct `agentFramework: 'claude-code'`
- Passes `subAgentId`, `parentTaskId`, `agentRole` through to provenance
- Type inference: source-based defaults
- Status override: explicit status wins over classifier
- Title auto-generation: first 60 chars at word boundary

---

## `tests/unit/core/status-classifier.test.ts` (~18 tests)

**Source:** Copy from openclaw `status-classifier.test.ts`  
**Changes:** Add 5 tests for new types.

**New tests:**
```typescript
it('knowledge_synthesis always returns validated', () => {
  expect(classifyStatus('anything', 'knowledge_synthesis')).toBe('validated');
});

it('competitive_analysis defaults to needs_sources', () => {
  expect(classifyStatus('market analysis without citations', 'competitive_analysis')).toBe('needs_sources');
});

it('competitive_analysis with sources returns draft', () => {
  expect(classifyStatus('analysis https://example.com', 'competitive_analysis')).toBe('draft');
});

it('raw_capture always returns draft', () => {
  expect(classifyStatus('anything', 'raw_capture')).toBe('draft');
});

it('override wins over type rule', () => {
  expect(classifyStatus('anything', 'knowledge_synthesis', 'draft')).toBe('draft');
});
```

---

## `tests/unit/tools/capture.test.ts` (~25 tests)

**New file.** Tests the full capture pipeline.

```typescript
describe('handleCapture', () => {
  it('returns success with artifactId and UAL on valid input', async () => {
    const result = await handleCapture(
      { content: 'A'.repeat(100), type: 'research_note' },
      { client: mockClient, dedupeStore: mockStore, config: testConfig }
    );
    expect(result.success).toBe(true);
    expect(result.artifactId).toMatch(/^urn:dkg:wm:/);
    expect(result.ual).toBe('ual:test:123');
  });

  it('returns error for content below minContentLength', async () => {
    const result = await handleCapture({ content: 'short', type: 'research_note' }, deps);
    expect(result.success).toBe(false);
    expect(result.message).toContain('too short');
  });

  it('returns deduplicated=true when content hash already seen', async () => {
    mockStore.has.mockReturnValue(true);
    const result = await handleCapture({ content: 'A'.repeat(100), type: 'research_note' }, deps);
    expect(result.success).toBe(true);
    expect(result.deduplicated).toBe(true);
    expect(mockClient.createOrWriteAssertion).not.toHaveBeenCalled();
  });

  it('writes sub-agent fields to provenance when provided', async () => {
    await handleCapture({
      content: 'A'.repeat(100),
      type: 'vulnerability_finding',
      subAgentId: 'agent-security',
      parentTaskId: 'session-parent',
      agentRole: 'security-auditor',
    }, deps);
    const call = mockClient.createOrWriteAssertion.mock.calls[0];
    const quads = call[0].quads;
    expect(quads.some(q => q.object === '"agent-security"')).toBe(true);
    expect(quads.some(q => q.object === '"session-parent"')).toBe(true);
    expect(quads.some(q => q.object === '"security-auditor"')).toBe(true);
  });

  it('marks assertion created in dedupeStore after first write', async () => {
    mockStore.isAssertionCreated.mockReturnValue(false);
    await handleCapture({ content: 'A'.repeat(100), type: 'research_note' }, deps);
    expect(mockStore.markAssertionCreated).toHaveBeenCalled();
  });

  it('does NOT call markAssertionCreated if assertion already exists', async () => {
    mockStore.isAssertionCreated.mockReturnValue(true);
    await handleCapture({ content: 'A'.repeat(100), type: 'research_note' }, deps);
    expect(mockStore.markAssertionCreated).not.toHaveBeenCalled();
  });

  it('returns error on DgkUnavailableError', async () => {
    mockClient.createOrWriteAssertion.mockRejectedValue(new DkgUnavailableError('down'));
    const result = await handleCapture({ content: 'A'.repeat(100), type: 'research_note' }, deps);
    expect(result.success).toBe(false);
    expect(result.message).toContain('unavailable');
  });

  it('rejects unknown artifact type', async () => {
    const result = await handleCapture({ content: 'A'.repeat(100), type: 'INVALID' }, deps);
    expect(result.success).toBe(false);
  });

  it('auto-generates title when omitted', async () => {
    const content = 'This is a research note about reentrancy vulnerabilities in DeFi protocols';
    await handleCapture({ content, type: 'research_note' }, deps);
    // Title should be first ~60 chars of content
    const quads = mockClient.createOrWriteAssertion.mock.calls[0][0].quads;
    const nameQuad = quads.find(q => q.predicate.includes('schema.org') && q.predicate.includes('name'));
    expect(nameQuad?.object).toContain('This is a research note');
  });

  it('saves dedupeStore to disk after successful write', async () => {
    await handleCapture({ content: 'A'.repeat(100), type: 'research_note' }, deps);
    expect(mockStore.save).toHaveBeenCalled();
  });

  // Edge cases: content exactly at minContentLength, content at 500KB limit, etc.
});
```

---

## `tests/unit/tools/search.test.ts` (~18 tests)

**Source:** Copy from openclaw `search-tool.test.ts`  
**Changes:** Add `sessionId` filter tests.

**New tests:**
```typescript
it('adds sessionId filter when provided', async () => {
  await handleSearch({ sessionId: 'session-abc' }, deps);
  const sparql = mockClient.querySparql.mock.calls[0][0];
  expect(sparql).toContain('session-abc');
  expect(sparql).toContain('wm:sessionId');
});

it('escapes malicious sessionId input', async () => {
  await handleSearch({ sessionId: 'x"; DROP TABLE--' }, deps);
  const sparql = mockClient.querySparql.mock.calls[0][0];
  expect(sparql).not.toContain('DROP TABLE');
});

it('works with no filters (returns all)', async () => {
  mockClient.querySparql.mockResolvedValue({ result: { bindings: [] } });
  const result = await handleSearch({}, deps);
  expect(result.success).toBe(true);
  expect(result.count).toBe(0);
});
```

---

## `tests/unit/tools/synthesize.test.ts` (~18 tests)

**New file.** Tests the synthesis aggregation logic.

```typescript
describe('handleSynthesize', () => {
  it('returns error when sessionId is empty', async () => {
    const result = await handleSynthesize({ sessionId: '' }, deps);
    expect(result.success).toBe(false);
  });

  it('returns error when no artifacts found for session', async () => {
    mockClient.querySparql.mockResolvedValue({ result: { bindings: [] } });
    const result = await handleSynthesize({ sessionId: 'empty-session' }, deps);
    expect(result.success).toBe(false);
    expect(result.message).toContain('No artifacts');
  });

  it('creates a knowledge_synthesis artifact containing all session artifact names', async () => {
    mockClient.querySparql.mockResolvedValueOnce({
      result: {
        bindings: [
          { id: { value: 'urn:dkg:wm:a1' }, name: { value: 'Finding 1' }, type: { value: 'vulnerability_finding' }, status: { value: 'validated' }, capturedAt: { value: '2026-05-25T10:00:00Z' } },
          { id: { value: 'urn:dkg:wm:a2' }, name: { value: 'Analysis 1' }, type: { value: 'code_analysis' }, status: { value: 'draft' }, capturedAt: { value: '2026-05-25T10:05:00Z' } },
        ],
      },
    });
    mockClient.createOrWriteAssertion.mockResolvedValue({ ual: 'ual:synthesis:1' });
    
    const result = await handleSynthesize({ sessionId: 'session-123', title: 'Test Synthesis' }, deps);
    expect(result.success).toBe(true);
    expect(result.artifactCount).toBe(2);
    
    // The synthesis artifact content should mention both findings
    const quads = mockClient.createOrWriteAssertion.mock.calls[0][0].quads;
    const textQuad = quads.find(q => q.predicate.includes('schema.org') && q.predicate.includes('text'));
    expect(textQuad?.object).toContain('Finding 1');
    expect(textQuad?.object).toContain('Analysis 1');
  });

  it('synthesis artifact has type knowledge_synthesis and status validated', async () => { ... });
  it('synthesis artifact references the parent sessionId', async () => { ... });
  it('uses default title when title omitted', async () => { ... });
  it('includes type count breakdown in synthesis content', async () => { ... });
});
```

---

## `tests/unit/tools/session-summary.test.ts` (~12 tests)

```typescript
describe('handleSessionSummary', () => {
  it('returns count and artifact list for a session', async () => { ... });
  it('defaults sessionId to unknown when not provided', async () => { ... });
  it('includes typeCounts in response', async () => { ... });
  it('handles empty session gracefully', async () => { ... });
  it('limits results to 200', async () => { ... });
});
```

---

## `tests/integration.test.ts` — E2E with Mocked Fetch

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('full capture → search → status update flow', () => {
  let capturedQuads: unknown[] = [];
  
  beforeEach(() => {
    // Mock global fetch to capture DKG API calls
    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string);
      
      if (url.includes('/api/assertion/create')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/api/assertion/') && url.includes('/write')) {
        capturedQuads = body.quads ?? [];
        return new Response(JSON.stringify({ ual: 'ual:integration:001', written: capturedQuads.length }), { status: 200 });
      }
      if (url.includes('/api/query')) {
        // Return the previously captured quads as SPARQL bindings
        return new Response(JSON.stringify({ result: { bindings: [] } }), { status: 200 });
      }
      if (url.includes('/api/context-graph/create')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  it('capture stores artifact and returns UAL', async () => {
    const { handleCapture } = await import('../src/tools/capture.js');
    const result = await handleCapture(
      { content: 'A reentrancy vulnerability was found in the withdraw() function', type: 'vulnerability_finding' },
      deps
    );
    expect(result.success).toBe(true);
    expect(result.ual).toBe('ual:integration:001');
  });

  it('captured artifact includes wm:agentFramework = claude-code quad', async () => {
    await handleCapture({ content: 'A'.repeat(100), type: 'research_note' }, deps);
    expect(capturedQuads.some(q => (q as any).object === '"claude-code"')).toBe(true);
  });

  it('promote is blocked without confirm=true', async () => {
    const result = await handlePromote({ artifactId: 'urn:dkg:wm:abc', confirm: false }, deps);
    expect(result.success).toBe(false);
    expect((global.fetch as any).mock.calls.some(c => c[0].includes('/promote'))).toBe(false);
  });

  it('promote calls /promote endpoint when confirm=true', async () => {
    (global.fetch as any).mockImplementationOnce(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    const result = await handlePromote({ artifactId: 'urn:dkg:wm:abc', confirm: true }, deps);
    expect(result.success).toBe(true);
  });
});
```

---

## `tests/live-integration.test.ts` — Real DKG Node

Run only when `DKG_INTEGRATION_TEST=1`. Requires DKG node at `127.0.0.1:9200`.

```typescript
import { describe, it, expect, beforeAll } from 'vitest';

const LIVE = process.env['DKG_INTEGRATION_TEST'] === '1';

describe.skipIf(!LIVE)('live DKG node integration', () => {
  let capturedUAL: string;
  let capturedArtifactId: string;

  it('captures a vulnerability_finding and returns a UAL', async () => {
    const result = await handleCapture({
      content: 'Live test: reentrancy found in withdraw() at line 42. Impact: HIGH. Recommended fix: checks-effects-interactions pattern.',
      type: 'vulnerability_finding',
      sessionId: 'live-test-session',
      title: 'Live Integration Test Finding',
    }, realDeps);

    expect(result.success).toBe(true);
    expect(typeof result.ual).toBe('string');
    expect(result.ual).toMatch(/^ual:/);
    capturedUAL = result.ual as string;
    capturedArtifactId = result.artifactId as string;
  });

  it('search_working_memory retrieves the captured artifact', async () => {
    const result = await handleSearch({ sessionId: 'live-test-session' }, realDeps);
    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    const found = result.artifacts.find(a => a.id === capturedArtifactId);
    expect(found).toBeDefined();
  });

  it('update_artifact_status to validated persists', async () => {
    const updateResult = await handleUpdateStatus(
      { artifactId: capturedArtifactId, newStatus: 'validated' },
      realDeps
    );
    expect(updateResult.success).toBe(true);

    // Re-search and confirm status
    const searchResult = await handleSearch({ sessionId: 'live-test-session', status: 'validated' }, realDeps);
    const updated = searchResult.artifacts.find(a => a.id === capturedArtifactId);
    expect(updated?.status).toBe('validated');
  });

  it('get_session_summary lists artifacts from live-test-session', async () => {
    const result = await handleSessionSummary({ sessionId: 'live-test-session' }, realDeps);
    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });

  it('synthesize_session creates a knowledge_synthesis artifact', async () => {
    const result = await handleSynthesize({ sessionId: 'live-test-session', title: 'Live Test Synthesis' }, realDeps);
    expect(result.success).toBe(true);
    expect(result.artifactCount).toBeGreaterThan(0);
    expect(typeof result.synthesisArtifactId).toBe('string');
  });

  it('promote_to_shared_memory is blocked without confirm=true', async () => {
    const result = await handlePromote({ artifactId: capturedArtifactId, confirm: false }, realDeps);
    expect(result.success).toBe(false);
  });

  it('promote_to_shared_memory succeeds with confirm=true', async () => {
    const result = await handlePromote({ artifactId: capturedArtifactId, confirm: true }, realDeps);
    expect(result.success).toBe(true);
  });
});
```

---

## Running Tests

```bash
# Unit + integration tests (no DKG node needed):
npm test

# With coverage report:
npm run test:coverage

# Live integration (requires DKG node at 127.0.0.1:9200 + token in ~/.dkg/auth.token):
DKG_INTEGRATION_TEST=1 npm run test:live

# All tests including live:
DKG_INTEGRATION_TEST=1 npx vitest run
```

---

## Coverage Targets

| Module | Target |
|---|---|
| `src/core/dkg-client.ts` | >95% |
| `src/core/serializers.ts` | >95% |
| `src/core/redactor.ts` | 100% |
| `src/core/normalizer.ts` | >95% |
| `src/core/status-classifier.ts` | 100% |
| `src/core/provenance-builder.ts` | >95% |
| `src/core/dedupe-store.ts` | >90% |
| `src/tools/capture.ts` | >95% |
| `src/tools/search.ts` | >95% |
| `src/tools/synthesize.ts` | >90% |
| `src/tools/session-summary.ts` | >90% |
| **Overall** | **>95%** |
