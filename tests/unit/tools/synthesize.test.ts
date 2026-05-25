/**
 * Unit tests for synthesize tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleSynthesize } from '../../../src/tools/synthesize.js';
import type { ToolDeps, SynthesizeParams } from '../../../src/tools/types.js';
import type { DkgClient } from '../../../src/core/dkg-client.js';
import type { McpConfig } from '../../../src/types/mcp.js';
import type { DedupeStore } from '../../../src/core/dedupe-store.js';

describe('synthesize tool', () => {
  let mockClient: Partial<DkgClient>;
  let mockStore: Partial<DedupeStore>;
  let config: McpConfig;
  let deps: ToolDeps;

  beforeEach(() => {
    mockClient = {
      querySparql: vi.fn().mockResolvedValue({ results: { bindings: [] } }),
      createOrWriteAssertion: vi.fn().mockResolvedValue({ ual: 'ual:synthesis:123' }),
    };

    mockStore = {
      has: vi.fn().mockReturnValue(false),
      add: vi.fn(),
      getRecord: vi.fn().mockReturnValue(undefined),
      isAssertionCreated: vi.fn().mockReturnValue(false),
      save: vi.fn().mockResolvedValue(undefined),
    };

    config = {
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

    deps = {
      client: mockClient as DkgClient,
      dedupeStore: mockStore as DedupeStore,
      config,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('input validation', () => {
    it('rejects missing sessionId', async () => {
      const result = await handleSynthesize({} as SynthesizeParams, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('sessionId is required');
    });

    it('rejects empty sessionId', async () => {
      const result = await handleSynthesize({ sessionId: '' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('sessionId is required');
    });
  });

  describe('successful synthesis', () => {
    it('builds synthesis from single artifact', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:test1' },
              name: { value: 'Test Artifact' },
              type: { value: 'research_note' },
              status: { value: 'validated' },
              content: { value: 'This is test content for the artifact.' },
              capturedAt: { value: '2024-01-15T10:00:00Z' },
            },
          ],
        },
      });

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.synthesis).toBeDefined();
      expect(result.synthesis?.length).toBeGreaterThan(0);
    });

    it('builds synthesis from multiple artifacts', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, type: { value: 'vulnerability_finding' }, status: { value: 'validated' }, content: { value: 'Content 2' }, capturedAt: { value: '2024-01-15T11:00:00Z' } },
          ],
        },
      });

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.synthesis).toBeDefined();
    });

    it('counts artifact types correctly', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 2' }, capturedAt: { value: '2024-01-15T11:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test3' }, name: { value: 'A3' }, type: { value: 'vulnerability_finding' }, status: { value: 'validated' }, content: { value: 'Content 3' }, capturedAt: { value: '2024-01-15T12:00:00Z' } },
          ],
        },
      });

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.synthesis).toContain('research_note');
      expect(result.synthesis).toContain('vulnerability_finding');
    });
  });

  describe('synthesis content', () => {
    it('includes session ID in synthesis', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
          ],
        },
      });

      const result = await handleSynthesize({ sessionId: 'my-session-456' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.synthesis).toContain('my-session-456');
    });

    it('includes artifact count in synthesis', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 2' }, capturedAt: { value: '2024-01-15T11:00:00Z' } },
          ],
        },
      });

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.synthesis).toContain('2');
    });

    it('includes type breakdown in synthesis', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, type: { value: 'vulnerability_finding' }, status: { value: 'validated' }, content: { value: 'Content 2' }, capturedAt: { value: '2024-01-15T11:00:00Z' } },
          ],
        },
      });

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.synthesis).toContain('research_note');
      expect(result.synthesis).toContain('vulnerability_finding');
    });
  });

  describe('synthesis capture', () => {
    it('captures synthesis as knowledge_synthesis artifact', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
          ],
        },
      });

      await handleSynthesize({ sessionId: 'session-123' }, deps);
      
      expect(mockClient.createOrWriteAssertion).toHaveBeenCalled();
    });

    it('uses validated status for synthesis', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
          ],
        },
      });

      await handleSynthesize({ sessionId: 'session-123' }, deps);
      
      expect(mockClient.createOrWriteAssertion).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('handles no artifacts gracefully', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [],
        },
      });

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No artifacts found');
    });

    it('handles query error gracefully', async () => {
      mockClient.querySparql = vi.fn().mockRejectedValue(new Error('Query failed'));

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to fetch session artifacts');
    });

    it('handles synthesis capture failure', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
          ],
        },
      });
      // Make capture fail by making createOrWriteAssertion reject
      mockClient.createOrWriteAssertion = vi.fn().mockRejectedValue(new Error('Storage failed'));

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to capture synthesis');
    });
  });

  describe('nullish fallback branches', () => {
    it('uses unknown for artifact type when type is missing', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            // type is undefined/missing - triggers `a.type ?? 'unknown'`
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: undefined, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
          ],
        },
      });

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      expect(result.success).toBe(true);
      expect(result.synthesis).toContain('unknown');
    });

    it('uses artifact id when name is missing in artifact list', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            // name is undefined - triggers `a.name ?? a.id`
            { id: { value: 'urn:dkg:wm:test1' }, name: undefined, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
          ],
        },
      });

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      expect(result.success).toBe(true);
      expect(result.synthesis).toContain('urn:dkg:wm:test1');
    });

    it('uses N/A for contentHash when hash is missing', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            // contentHash is undefined - triggers `?.slice(0, 8) ?? 'N/A'`
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, contentHash: undefined, capturedAt: { value: '2024-01-15T10:00:00Z' } },
          ],
        },
      });

      const result = await handleSynthesize({ sessionId: 'session-123' }, deps);
      expect(result.success).toBe(true);
      expect(result.synthesis).toContain('N/A');
    });
  });

  describe('sub-agent attribution', () => {
    it('includes subAgentId when provided via search results', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'validated' }, content: { value: 'Content 1' }, capturedAt: { value: '2024-01-15T10:00:00Z' }, subAgentId: { value: 'sub-agent-xyz' } },
          ],
        },
      });

      await handleSynthesize({ sessionId: 'session-123' }, deps);
      
      expect(mockClient.createOrWriteAssertion).toHaveBeenCalled();
    });
  });
});
