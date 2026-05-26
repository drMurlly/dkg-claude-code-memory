/**
 * Integration Tests — Mocked DKG Node
 * 
 * Tests the full capture → search → status-update → promote flow
 * with mocked global fetch. No real DKG node required.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock global fetch before importing tools
const originalFetch = global.fetch;

describe('integration tests (mocked fetch)', () => {
  let capturedQuads: any[] = [];
  let capturedBody: any = null;

  beforeEach(() => {
    capturedQuads = [];
    capturedBody = null;

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, opts?: any) => {
      const urlString = url.toString();
      const bodyText = opts?.body ? String(opts.body) : '';
      capturedBody = bodyText;

      // Parse body as JSON if present
      let bodyJson: any = {};
      try {
        if (bodyText) {
          bodyJson = JSON.parse(bodyText);
        }
      } catch {
        bodyJson = {};
      }

      // Route responses based on endpoint
      if (urlString.includes('/api/context-graph/create')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (urlString.includes('/api/assertion/create')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (urlString.includes('/api/assertion/') && urlString.includes('/write')) {
        // Capture quads from the write request
        capturedQuads = bodyJson.quads ?? [];
        return new Response(
          JSON.stringify({ ual: 'ual:integration:001', written: capturedQuads.length }),
          { status: 200 }
        );
      }

      if (urlString.includes('/api/query')) {
        // Return empty bindings for search queries
        return new Response(
          JSON.stringify({ result: { bindings: [] }, count: 0 }),
          { status: 200 }
        );
      }

      if (urlString.includes('/api/artifact/') && urlString.includes('/status')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (urlString.includes('/api/promote')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (urlString.includes('/api/session/')) {
        return new Response(JSON.stringify({ artifacts: [], count: 0 }), { status: 200 });
      }

      if (urlString.includes('/api/synthesize')) {
        return new Response(
          JSON.stringify({ success: true, synthesisArtifactId: 'urn:dkg:wm:synth:001' }),
          { status: 200 }
        );
      }

      // Default response
      return new Response(JSON.stringify({}), { status: 200 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  describe('capture flow', () => {
    it('captures a vulnerability_finding and returns a UAL', async () => {
      const { handleCapture } = await import('../src/tools/capture.js');
      const result = await handleCapture(
        {
          content: 'A reentrancy vulnerability was found in the withdraw() function at line 42. Impact: HIGH. Recommended fix: checks-effects-interactions pattern.',
          type: 'vulnerability_finding',
        },
        {
          config: {
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
          },
          client: {
            createContextGraph: vi.fn().mockResolvedValue(undefined),
            createOrWriteAssertion: vi.fn().mockResolvedValue({ ual: 'ual:integration:001', written: 5 }),
            writeAssertion: vi.fn().mockResolvedValue({ written: 2 }),
            querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] } }),
            queryAssertion: vi.fn().mockResolvedValue({ quads: [], count: 0 }),
            promoteAssertion: vi.fn().mockResolvedValue(undefined),
            getAssertionHistory: vi.fn().mockResolvedValue([]),
            ensureContextGraph: vi.fn().mockResolvedValue(undefined),
          },
          dedupeStore: {
            has: vi.fn().mockReturnValue(false),
            add: vi.fn(),
            getRecord: vi.fn().mockReturnValue(undefined),
            size: vi.fn().mockReturnValue(0),
            isAssertionCreated: vi.fn().mockReturnValue(false),
            markAssertionCreated: vi.fn(),
            load: vi.fn().mockResolvedValue(undefined),
            save: vi.fn().mockResolvedValue(undefined),
          },
        }
      );
      expect(result.success).toBe(true);
      expect(result.ual).toBe('ual:integration:001');
    });

    it('captures a research_note and returns a UAL', async () => {
      const { handleCapture } = await import('../src/tools/capture.js');
      const result = await handleCapture(
        {
          content: 'Research note: reviewing the DKG v10 Working Memory API for integration patterns.',
          type: 'research_note',
        },
        {
          config: {
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
          },
          client: {
            createContextGraph: vi.fn().mockResolvedValue(undefined),
            createOrWriteAssertion: vi.fn().mockResolvedValue({ ual: 'ual:integration:002', written: 4 }),
            writeAssertion: vi.fn().mockResolvedValue({ written: 2 }),
            querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] } }),
            queryAssertion: vi.fn().mockResolvedValue({ quads: [], count: 0 }),
            promoteAssertion: vi.fn().mockResolvedValue(undefined),
            getAssertionHistory: vi.fn().mockResolvedValue([]),
            ensureContextGraph: vi.fn().mockResolvedValue(undefined),
          },
          dedupeStore: {
            has: vi.fn().mockReturnValue(false),
            add: vi.fn(),
            getRecord: vi.fn().mockReturnValue(undefined),
            size: vi.fn().mockReturnValue(0),
            isAssertionCreated: vi.fn().mockReturnValue(false),
            markAssertionCreated: vi.fn(),
            load: vi.fn().mockResolvedValue(undefined),
            save: vi.fn().mockResolvedValue(undefined),
          },
        }
      );
      expect(result.success).toBe(true);
      expect(result.ual).toBe('ual:integration:002');
    });

    it('returns error for content below minContentLength', async () => {
      const { handleCapture } = await import('../src/tools/capture.js');
      const result = await handleCapture(
        { content: 'short', type: 'research_note' },
        {
          config: {
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
          },
          client: {} as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('too short');
    });

    it('returns deduplicated=true when content hash already seen', async () => {
      const { handleCapture } = await import('../src/tools/capture.js');
      const mockStore = {
        has: vi.fn().mockReturnValue(true),
        add: vi.fn(),
        getRecord: vi.fn().mockReturnValue({ ual: 'ual:existing:123' }),
        size: vi.fn().mockReturnValue(0),
        isAssertionCreated: vi.fn().mockReturnValue(false),
        markAssertionCreated: vi.fn(),
        load: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockResolvedValue(undefined),
      };
      const result = await handleCapture(
        { content: 'A'.repeat(100), type: 'research_note' },
        {
          config: {
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
          },
          client: {} as any,
          dedupeStore: mockStore,
        }
      );
      expect(result.success).toBe(true);
      expect(result.dedupeStatus).toBe('deduplicated');
    });
  });

  describe('search flow', () => {
    it('search_working_memory returns artifacts for a session', async () => {
      const { handleSearch } = await import('../src/tools/search.js');
      const mockClient = {
        querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] }, count: 0 }),
      };
      const result = await handleSearch(
        { sessionId: 'test-session' },
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('search filters by status when provided', async () => {
      const { handleSearch } = await import('../src/tools/search.js');
      const mockClient = {
        querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] }, count: 0 }),
      };
      const result = await handleSearch(
        { sessionId: 'test-session', status: 'validated' },
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(true);
      expect(mockClient.querySparql).toHaveBeenCalled();
    });

    it('search filters by type when provided', async () => {
      const { handleSearch } = await import('../src/tools/search.js');
      const mockClient = {
        querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] }, count: 0 }),
      };
      const result = await handleSearch(
        { sessionId: 'test-session', type: 'vulnerability_finding' },
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(true);
      expect(mockClient.querySparql).toHaveBeenCalled();
    });
  });

  describe('status update flow', () => {
    it('update_artifact_status persists new status', async () => {
      const { handleUpdateStatus } = await import('../src/tools/update-status.js');
      const mockClient = {
        writeAssertion: vi.fn().mockResolvedValue({ written: 1 }),
      };
      const result = await handleUpdateStatus(
        { artifactId: 'urn:dkg:wm:test:123', newStatus: 'validated' },
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(true);
      expect(mockClient.writeAssertion).toHaveBeenCalled();
    });

    it('update_artifact_status returns error for invalid status', async () => {
      const { handleUpdateStatus } = await import('../src/tools/update-status.js');
      const result = await handleUpdateStatus(
        { artifactId: 'urn:dkg:wm:test:123', newStatus: 'invalid_status' },
        {
          config: {
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
          },
          client: {} as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid status');
    });
  });

  describe('promote flow', () => {
    it('promote is blocked without confirm=true', async () => {
      const { handlePromote } = await import('../src/tools/promote.js');
      const result = await handlePromote(
        { artifactId: 'urn:dkg:wm:abc', confirm: false },
        {
          config: {
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
          },
          client: {} as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('confirm');
    });

    it('promote calls /promote endpoint when confirm=true', async () => {
      const { handlePromote } = await import('../src/tools/promote.js');
      const mockClient = {
        promoteAssertion: vi.fn().mockResolvedValue(undefined),
        getArtifactSensitivity: vi.fn().mockResolvedValue(null),
      };
      const result = await handlePromote(
        { artifactId: 'urn:dkg:wm:abc', confirm: true },
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(true);
      expect(mockClient.promoteAssertion).toHaveBeenCalled();
    });
  });

  describe('session summary', () => {
    it('get_session_summary returns count and artifact list', async () => {
      const { handleSessionSummary } = await import('../src/tools/session-summary.js');
      const mockClient = {
        querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] }, count: 0 }),
      };
      const result = await handleSessionSummary(
        { sessionId: 'test-session' },
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(true);
      expect(typeof result.count).toBe('number');
    });

    it('get_session_summary defaults sessionId to unknown when not provided', async () => {
      const { handleSessionSummary } = await import('../src/tools/session-summary.js');
      const mockClient = {
        querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] }, count: 0 }),
      };
      const result = await handleSessionSummary(
        {},
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {} as any,
        }
      );
      expect(result.success).toBe(true);
    });
  });

  describe('synthesize flow', () => {
    it('synthesize_session handles empty session gracefully', async () => {
      const { handleSynthesize } = await import('../src/tools/synthesize.js');
      const mockClient = {
        querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] }, count: 0 }),
      };
      const result = await handleSynthesize(
        { sessionId: 'empty-session', title: 'Empty Synthesis' },
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {
            has: vi.fn().mockReturnValue(false),
            add: vi.fn(),
            getRecord: vi.fn().mockReturnValue(undefined),
            size: vi.fn().mockReturnValue(0),
            isAssertionCreated: vi.fn().mockReturnValue(false),
            markAssertionCreated: vi.fn(),
            load: vi.fn().mockResolvedValue(undefined),
            save: vi.fn().mockResolvedValue(undefined),
          },
        }
      );
      // When no artifacts found, synthesis returns success=false with appropriate message
      expect(result.success).toBe(false);
      expect(result.message).toContain('No artifacts found');
    });

    it('synthesize_session creates a knowledge_synthesis artifact when artifacts exist', async () => {
      const { handleSynthesize } = await import('../src/tools/synthesize.js');
      const mockClient = {
        querySparql: vi.fn().mockResolvedValue({
          results: {
            bindings: [{
              id: { value: 'urn:dkg:wm:art:1' },
              name: { value: 'Test Finding' },
              type: { value: 'vulnerability_finding' },
              status: { value: 'draft' },
              contentHash: { value: 'abc123def456' },
            }]
          },
          count: 1
        }),
        createOrWriteAssertion: vi.fn().mockResolvedValue({ ual: 'ual:synth:001', written: 5 }),
      };
      const result = await handleSynthesize(
        { sessionId: 'synth-session', title: 'Test Synthesis' },
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {
            has: vi.fn().mockReturnValue(false),
            add: vi.fn(),
            getRecord: vi.fn().mockReturnValue(undefined),
            size: vi.fn().mockReturnValue(0),
            isAssertionCreated: vi.fn().mockReturnValue(false),
            markAssertionCreated: vi.fn(),
            load: vi.fn().mockResolvedValue(undefined),
            save: vi.fn().mockResolvedValue(undefined),
          },
        }
      );
      expect(result.success).toBe(true);
      expect(typeof result.synthesisArtifactId).toBe('string');
      expect(result.artifactCount).toBe(1);
    });
  });

  describe('quad verification', () => {
    it('captured artifact includes wm:agentFramework = claude-code quad', async () => {
      const { handleCapture } = await import('../src/tools/capture.js');
      const mockClient = {
        createContextGraph: vi.fn().mockResolvedValue(undefined),
        createOrWriteAssertion: vi.fn().mockImplementation(async (params: any) => {
          // Capture the quads passed to createOrWriteAssertion
          capturedQuads = params.quads ?? [];
          return { ual: 'ual:integration:001', written: capturedQuads.length };
        }),
        writeAssertion: vi.fn().mockResolvedValue({ written: 2 }),
        querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] } }),
        queryAssertion: vi.fn().mockResolvedValue({ quads: [], count: 0 }),
        promoteAssertion: vi.fn().mockResolvedValue(undefined),
        getAssertionHistory: vi.fn().mockResolvedValue([]),
        ensureContextGraph: vi.fn().mockResolvedValue(undefined),
      };
      await handleCapture(
        { content: 'A'.repeat(100), type: 'research_note' },
        {
          config: {
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
          },
          client: mockClient as any,
          dedupeStore: {
            has: vi.fn().mockReturnValue(false),
            add: vi.fn(),
            getRecord: vi.fn().mockReturnValue(undefined),
            size: vi.fn().mockReturnValue(0),
            isAssertionCreated: vi.fn().mockReturnValue(false),
            markAssertionCreated: vi.fn(),
            load: vi.fn().mockResolvedValue(undefined),
            save: vi.fn().mockResolvedValue(undefined),
          },
        }
      );
      // Verify agentFramework quad is present
      const hasAgentFramework = capturedQuads.some((q: any) => 
        q.object === '"claude-code"' || 
        (q.predicate && q.predicate.includes('agentFramework'))
      );
      expect(hasAgentFramework).toBe(true);
    });
  });
});
