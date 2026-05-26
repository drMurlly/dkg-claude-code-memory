/**
 * Unit tests for query-shared-memory tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleQuerySharedMemory } from '../../../src/tools/query-shared-memory.js';
import type { ToolDeps } from '../../../src/tools/types.js';
import type { DkgClient } from '../../../src/core/dkg-client.js';
import type { DedupeStore } from '../../../src/core/dedupe-store.js';
import { makeMockClient, makeMockDedupeStore, testConfig } from '../helpers.js';

describe('handleQuerySharedMemory', () => {
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
    it('rejects empty query string', async () => {
      const result = await handleQuerySharedMemory({ query: '' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('required');
    });

    it('rejects whitespace-only query', async () => {
      const result = await handleQuerySharedMemory({ query: '   ' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('required');
    });
  });

  describe('successful query', () => {
    it('returns no results message when no matches', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      const result = await handleQuerySharedMemory({ query: 'nonexistent' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.entries).toHaveLength(0);
      expect(result.message).toBe('No shared memory entries found matching the query.');
    });

    it('returns no results message when querySparql returns empty bindings', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      const result = await handleQuerySharedMemory({ query: 'test' }, deps);
      expect(result.success).toBe(true);
      expect(result.message).toBe('No shared memory entries found matching the query.');
    });

    it('parses entries from bindings correctly with wm:WorkingMemoryArtifact shape', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              ual: { value: 'urn:dkg:ual:test1' },
              title: { value: 'Security Analysis Report' },
              snippet: { value: 'This document contains a security analysis of the protocol' },
              type: { value: 'vulnerability_finding' },
              status: { value: 'validated' },
            },
          ],
        },
      });

      const result = await handleQuerySharedMemory({ query: 'security' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.entries).toHaveLength(1);
      const entry = result.entries![0];
      expect(entry.ual).toBe('urn:dkg:ual:test1');
      expect(entry.title).toBe('Security Analysis Report');
      expect(entry.snippet).toBe('This document contains a security analysis of the protocol');
      expect(entry.type).toBe('vulnerability_finding');
      expect(entry.status).toBe('validated');
    });

    it('handles multiple bindings', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              ual: { value: 'urn:dkg:ual:test1' },
              title: { value: 'Doc 1' },
              snippet: { value: 'First document' },
              type: { value: 'research_note' },
              status: { value: 'validated' },
            },
            {
              ual: { value: 'urn:dkg:ual:test2' },
              title: { value: 'Doc 2' },
              snippet: { value: 'Second document' },
              type: { value: 'code_analysis' },
              status: { value: 'ready_to_share' },
            },
          ],
        },
      });

      const result = await handleQuerySharedMemory({ query: 'document' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.entries).toHaveLength(2);
    });

    it('returns correct message with count for multiple results', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { ual: { value: 'ual:1' }, title: { value: 'A' }, snippet: { value: 'a' }, type: { value: 'research_note' }, status: { value: 'validated' } },
            { ual: { value: 'ual:2' }, title: { value: 'B' }, snippet: { value: 'b' }, type: { value: 'code_analysis' }, status: { value: 'ready_to_share' } },
          ],
        },
      });

      const result = await handleQuerySharedMemory({ query: 'test' }, deps);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Found 2 shared memory entries');
    });
  });

  describe('limit parameter', () => {
    it('uses default limit of 10 when not provided', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleQuerySharedMemory({ query: 'test' }, deps);

      const sparqlQuery = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlQuery).toContain('LIMIT 10');
    });

    it('uses provided limit', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleQuerySharedMemory({ query: 'test', limit: 5 }, deps);

      const sparqlQuery = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlQuery).toContain('LIMIT 5');
    });

    it('clamps limit to minimum of 1', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleQuerySharedMemory({ query: 'test', limit: 0 }, deps);

      const sparqlQuery = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlQuery).toContain('LIMIT 1');
    });

    it('clamps limit to maximum of 100', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleQuerySharedMemory({ query: 'test', limit: 999 }, deps);

      const sparqlQuery = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlQuery).toContain('LIMIT 100');
    });
  });

  describe('SPARQL shape', () => {
    it('uses wm:WorkingMemoryArtifact type pattern', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleQuerySharedMemory({ query: 'test' }, deps);

      const sparqlQuery = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlQuery).toContain('wm:WorkingMemoryArtifact');
      expect(sparqlQuery).toContain('wm:artifactType');
      expect(sparqlQuery).toContain('wm:status');
      expect(sparqlQuery).toContain('schema:name');
      expect(sparqlQuery).toContain('schema:text');
      expect(sparqlQuery).toContain('wm:ual');
      expect(sparqlQuery).not.toContain('dkg:ual');
      expect(sparqlQuery).not.toContain('schema:DigitalDocument');
      expect(sparqlQuery).not.toContain('schema:description');
    });
  });

  describe('edge cases', () => {
    it('handles entries with missing optional fields', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              ual: null,
              title: null,
              snippet: null,
              type: { value: 'research_note' },
              status: { value: 'draft' },
            },
          ],
        },
      });

      const result = await handleQuerySharedMemory({ query: 'test' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      const entry = result.entries![0];
      expect(entry.ual).toBe('unknown');
      expect(entry.title).toBe('(untitled)');
      expect(entry.snippet).toBe('');
      expect(entry.type).toBe('research_note');
      expect(entry.status).toBe('draft');
    });

    it('handles single result with correct grammar', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              ual: { value: 'urn:dkg:ual:single' },
              title: { value: 'Single Doc' },
              snippet: { value: 'Just one result' },
              type: { value: 'research_note' },
              status: { value: 'validated' },
            },
          ],
        },
      });

      const result = await handleQuerySharedMemory({ query: 'test' }, deps);
      expect(result.message).toBe('Found 1 shared memory entry');
    });
  });

  describe('DKG v10 flat format', () => {
    it('handles result.bindings (flat strings) instead of results.bindings', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        result: {
          bindings: [
            {
              ual: 'urn:dkg:ual:flat1',
              title: 'Flat Title',
              snippet: 'Plain text snippet',
              type: 'research_note',
              status: '"validated"', // N-Quads quoted literal
            },
          ],
        },
      });

      const result = await handleQuerySharedMemory({ query: 'test' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect((result.entries as any)[0].ual).toBe('urn:dkg:ual:flat1');
      expect((result.entries as any)[0].title).toBe('Flat Title');
      expect((result.entries as any)[0].status).toBe('validated'); // quotes stripped
    });

    it('uses fallback values for missing/null binding fields', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [{ ual: { value: 'urn:dkg:ual:sparse' } }],
        },
      });

      const result = await handleQuerySharedMemory({ query: 'test' }, deps);
      expect(result.success).toBe(true);
      expect((result.entries as any)[0].title).toBe('(untitled)');
      expect((result.entries as any)[0].snippet).toBe('');
      expect((result.entries as any)[0].type).toBe('unknown');
      expect((result.entries as any)[0].status).toBe('unknown');
    });
  });

  describe('error handling', () => {
    it('returns error when querySparql throws', async () => {
      mockClient.querySparql = vi.fn().mockRejectedValue(new Error('DKG connection refused'));

      const result = await handleQuerySharedMemory({ query: 'test' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Shared memory query failed');
      expect(result.message).toContain('DKG connection refused');
    });

    it('returns error when querySparql throws a non-Error value', async () => {
      mockClient.querySparql = vi.fn().mockRejectedValue('raw string error');

      const result = await handleQuerySharedMemory({ query: 'test' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Shared memory query failed');
      expect(result.message).toContain('raw string error');
    });

    it('passes contextGraph and assertionName to querySparql', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleQuerySharedMemory({ query: 'test' }, deps);

      const options = (mockClient.querySparql as any).mock.calls[0][1];
      expect(options.contextGraphId).toBe('ccm-research');
      expect(options.assertionName).toBe('artifacts');
    });
  });
});
