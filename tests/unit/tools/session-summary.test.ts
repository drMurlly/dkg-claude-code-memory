/**
 * Unit tests for session-summary tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleSessionSummary } from '../../../src/tools/session-summary.js';
import type { ToolDeps, SessionSummaryParams } from '../../../src/tools/types.js';
import type { DkgClient } from '../../../src/core/dkg-client.js';
import type { McpConfig } from '../../../src/types/mcp.js';
import type { DedupeStore } from '../../../src/core/dedupe-store.js';

describe('session-summary tool', () => {
  let mockClient: Partial<DkgClient>;
  let mockStore: Partial<DedupeStore>;
  let config: McpConfig;
  let deps: ToolDeps;

  beforeEach(() => {
    mockClient = {
      querySparql: vi.fn().mockResolvedValue({ results: { bindings: [] } }),
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

  describe('input handling', () => {
    it('uses default sessionId when not provided', async () => {
      const result = await handleSessionSummary({}, deps);
      
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('unknown');
    });

    it('uses provided sessionId', async () => {
      const result = await handleSessionSummary({ sessionId: 'my-session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('my-session-123');
    });

    it('handles empty sessionId', async () => {
      const result = await handleSessionSummary({ sessionId: '' }, deps);
      
      expect(result.success).toBe(true);
      // Empty string is not null/undefined, so ?? doesn't trigger
      expect(result.sessionId).toBe('');
    });
  });

  describe('SPARQL injection prevention', () => {
    it('escapes special characters in sessionId', async () => {
      const maliciousSessionId = '"; DROP TABLE artifacts; --';
      await handleSessionSummary({ sessionId: maliciousSessionId }, deps);
      
      const call = (mockClient.querySparql as any).mock.calls[0];
      const sparql = call[0];
      
      // After escaping, quotes should be escaped as \"
      expect(sparql).toContain('\\"');
    });

    it('handles backslashes in sessionId', async () => {
      const sessionId = 'test\\session';
      await handleSessionSummary({ sessionId }, deps);
      
      expect(mockClient.querySparql).toHaveBeenCalled();
    });

    it('handles newlines in sessionId', async () => {
      const sessionId = 'test\nsession';
      await handleSessionSummary({ sessionId }, deps);
      
      expect(mockClient.querySparql).toHaveBeenCalled();
    });
  });

  describe('result parsing', () => {
    it('returns empty summary for no artifacts', async () => {
      const result = await handleSessionSummary({ sessionId: 'empty-session' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.artifacts).toEqual([]);
      expect(result.typeCounts).toEqual({});
    });

    it('parses single artifact', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:test1' },
              name: { value: 'Test Artifact' },
              type: { value: 'research_note' },
              status: { value: 'draft' },
              capturedAt: { value: '2024-01-15T10:00:00Z' },
            },
          ],
        },
      });

      const result = await handleSessionSummary({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.artifacts?.[0].id).toBe('urn:dkg:wm:test1');
      expect(result.artifacts?.[0].name).toBe('Test Artifact');
    });

    it('parses multiple artifacts', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'draft' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, type: { value: 'vulnerability_finding' }, status: { value: 'validated' }, capturedAt: { value: '2024-01-15T11:00:00Z' } },
          ],
        },
      });

      const result = await handleSessionSummary({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  describe('type counting', () => {
    it('counts single type correctly', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'draft' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, type: { value: 'research_note' }, status: { value: 'draft' }, capturedAt: { value: '2024-01-15T11:00:00Z' } },
          ],
        },
      });

      const result = await handleSessionSummary({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.typeCounts?.research_note).toBe(2);
    });

    it('counts multiple types correctly', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'draft' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, type: { value: 'vulnerability_finding' }, status: { value: 'validated' }, capturedAt: { value: '2024-01-15T11:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test3' }, name: { value: 'A3' }, type: { value: 'research_note' }, status: { value: 'reviewed' }, capturedAt: { value: '2024-01-15T12:00:00Z' } },
          ],
        },
      });

      const result = await handleSessionSummary({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.typeCounts?.research_note).toBe(2);
      expect(result.typeCounts?.vulnerability_finding).toBe(1);
    });

    it('handles unknown type', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: '' }, status: { value: 'draft' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
          ],
        },
      });

      const result = await handleSessionSummary({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(true);
      expect(result.typeCounts?.unknown).toBe(1);
    });
  });

  describe('error handling', () => {
    it('handles query error gracefully', async () => {
      mockClient.querySparql = vi.fn().mockRejectedValue(new Error('Query failed'));
      
      const result = await handleSessionSummary({ sessionId: 'session-123' }, deps);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Session summary failed');
    });

    it('handles malformed response', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({ result: null });

      const result = await handleSessionSummary({ sessionId: 'session-123' }, deps);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('handles non-Error thrown value', async () => {
      mockClient.querySparql = vi.fn().mockRejectedValue('raw string error');

      const result = await handleSessionSummary({ sessionId: 'session-123' }, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Session summary failed');
    });
  });

  describe('ordering', () => {
    it('orders by capturedAt descending', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'draft' }, capturedAt: { value: '2024-01-15T10:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, type: { value: 'research_note' }, status: { value: 'draft' }, capturedAt: { value: '2024-01-15T12:00:00Z' } },
            { id: { value: 'urn:dkg:wm:test3' }, name: { value: 'A3' }, type: { value: 'research_note' }, status: { value: 'draft' }, capturedAt: { value: '2024-01-15T11:00:00Z' } },
          ],
        },
      });

      await handleSessionSummary({ sessionId: 'session-123' }, deps);

      const call = (mockClient.querySparql as any).mock.calls[0];
      const sparql = call[0];

      expect(sparql).toContain('ORDER BY DESC(?capturedAt)');
    });
  });

  describe('binding format resilience', () => {
    it('handles null/non-string binding values using raw() undefined path', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:sparse' },
              name: null,       // triggers raw() → undefined path
              type: 42,         // non-string, non-object → undefined
              status: {},       // object without .value → undefined
              capturedAt: { value: '2024-01-15T10:00:00Z' },
            },
          ],
        },
      });

      const result = await handleSessionSummary({ sessionId: 'sess' }, deps);
      expect(result.success).toBe(true);
      // null/invalid fields gracefully degrade (undefined → omitted or undefined in artifact)
      expect((result as any).count).toBe(1);
    });
  });
});
