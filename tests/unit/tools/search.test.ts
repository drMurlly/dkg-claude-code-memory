/**
 * Unit tests for search tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleSearch } from '../../../src/tools/search.js';
import type { ToolDeps, SearchParams } from '../../../src/tools/types.js';
import type { DkgClient } from '../../../src/core/dkg-client.js';
import type { DedupeStore } from '../../../src/core/dedupe-store.js';
import { makeMockClient, makeMockDedupeStore, testConfig } from '../helpers.js';

describe('handleSearch', () => {
  let mockClient: Partial<DkgClient>;
  let mockDedupeStore: Partial<DedupeStore>;
  let deps: ToolDeps;

  beforeEach(() => {
    mockClient = makeMockClient();
    mockDedupeStore = makeMockDedupeStore();
    deps = {
      client: mockClient as DkgClient,
      dedupeStore: mockDedupeStore as DedupeStore,
      config: testConfig,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('input validation', () => {
    it('rejects invalid status filter', async () => {
      const result = await handleSearch({ status: 'not_a_valid_status' as any }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid status');
    });

    it('rejects invalid type filter', async () => {
      const result = await handleSearch({ type: 'not_a_valid_type' as any }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid type');
    });
  });

  describe('successful search', () => {
    it('returns success with no results when no filters', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      const result = await handleSearch({}, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.artifacts).toHaveLength(0);
    });

    it('returns message with count on success', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      const result = await handleSearch({}, deps);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Found');
      expect(result.message).toContain('0');
    });

    it('parses artifacts from bindings correctly', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:test1' },
              name: { value: 'Test Artifact' },
              type: { value: 'research_note' },
              status: { value: 'draft' },
              contentHash: { value: 'hash123' },
              capturedAt: { value: '2024-01-15T10:00:00Z' },
              sessionId: { value: 'session-abc' },
            },
          ],
        },
      });

      const result = await handleSearch({}, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.artifacts).toHaveLength(1);
      const artifact = result.artifacts![0];
      expect(artifact.id).toBe('urn:dkg:wm:test1');
      expect(artifact.name).toBe('Test Artifact');
      expect(artifact.type).toBe('research_note');
      expect(artifact.status).toBe('draft');
      expect(artifact.contentHash).toBe('hash123');
      expect(artifact.capturedAt).toBe('2024-01-15T10:00:00Z');
      expect(artifact.sessionId).toBe('session-abc');
    });

    it('handles multiple bindings', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, type: { value: 'research_note' }, status: { value: 'draft' }, contentHash: { value: 'h1' }, capturedAt: { value: '2024-01-15T10:00:00Z' }, sessionId: { value: 'sess1' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, type: { value: 'audit_note' }, status: { value: 'validated' }, contentHash: { value: 'h2' }, capturedAt: { value: '2024-01-15T11:00:00Z' }, sessionId: { value: 'sess1' } },
          ],
        },
      });

      const result = await handleSearch({}, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.artifacts).toHaveLength(2);
    });
  });

  describe('filter parameters', () => {
    it('calls querySparql with status filter', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({ status: 'validated' }, deps);
      expect(mockClient.querySparql).toHaveBeenCalled();
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlArg).toContain('validated');
    });

    it('calls querySparql with type filter', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({ type: 'vulnerability_finding' }, deps);
      expect(mockClient.querySparql).toHaveBeenCalled();
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlArg).toContain('vulnerability_finding');
    });

    it('calls querySparql with keyword filter using CONTAINS', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({ keyword: 'myKeyword' }, deps);
      expect(mockClient.querySparql).toHaveBeenCalled();
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlArg).toContain('myKeyword');
    });

    it('calls querySparql with sessionId filter', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({ sessionId: 'my-session' }, deps);
      expect(mockClient.querySparql).toHaveBeenCalled();
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlArg).toContain('my-session');
    });

    it('applies limit parameter', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({ limit: 5 }, deps);
      expect(mockClient.querySparql).toHaveBeenCalled();
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlArg).toContain('5');
    });

    it('uses default limit of 20 when not specified', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({}, deps);
      expect(mockClient.querySparql).toHaveBeenCalled();
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlArg).toContain('20');
    });
  });

  describe('error handling', () => {
    it('handles querySparql error gracefully', async () => {
      mockClient.querySparql = vi.fn().mockRejectedValue(new Error('SPARQL query failed'));

      const result = await handleSearch({}, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Search failed');
    });

    it('handles non-Error thrown value', async () => {
      mockClient.querySparql = vi.fn().mockRejectedValue('raw string error');

      const result = await handleSearch({}, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Search failed');
    });
  });
});
