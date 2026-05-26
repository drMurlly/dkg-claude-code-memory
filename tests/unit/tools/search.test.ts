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
              text: { value: 'This is the content of the artifact' },
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
      expect(artifact.text).toBe('This is the content of the artifact');
      expect(artifact.type).toBe('research_note');
      expect(artifact.status).toBe('draft');
      expect(artifact.contentHash).toBe('hash123');
      expect(artifact.capturedAt).toBe('2024-01-15T10:00:00Z');
      expect(artifact.sessionId).toBe('session-abc');
    });

    it('collapses duplicate rows for the same artifact and resolves the effective status', async () => {
      // Append-only status updates produce one row per wm:status value for the same id.
      mockClient.querySparql = vi.fn().mockResolvedValue({
        result: {
          bindings: [
            { id: 'urn:dkg:wm:dup', name: 'Dup', type: 'research_note', status: 'validated', contentHash: 'h', capturedAt: '2024-01-15T10:00:00Z', sessionId: 's' },
            { id: 'urn:dkg:wm:dup', name: 'Dup', type: 'research_note', status: 'draft', contentHash: 'h', capturedAt: '2024-01-15T10:00:00Z', sessionId: 's' },
          ],
        },
      });
      const result = await handleSearch({ sessionId: 's' }, deps);
      expect(result.count).toBe(1);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts![0].id).toBe('urn:dkg:wm:dup');
      expect(result.artifacts![0].status).toBe('validated');
    });

    it('keeps a row that has no id (no-id fallback key)', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        result: {
          bindings: [
            { name: 'No id row', type: 'research_note', status: 'draft' },
          ],
        },
      });
      const result = await handleSearch({}, deps);
      expect(result.count).toBe(1);
      expect(result.artifacts![0].id).toBeUndefined();
    });

    it('handles multiple bindings', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { id: { value: 'urn:dkg:wm:test1' }, name: { value: 'A1' }, text: { value: 'content1' }, type: { value: 'research_note' }, status: { value: 'draft' }, contentHash: { value: 'h1' }, capturedAt: { value: '2024-01-15T10:00:00Z' }, sessionId: { value: 'sess1' } },
            { id: { value: 'urn:dkg:wm:test2' }, name: { value: 'A2' }, text: { value: 'content2' }, type: { value: 'audit_note' }, status: { value: 'validated' }, contentHash: { value: 'h2' }, capturedAt: { value: '2024-01-15T11:00:00Z' }, sessionId: { value: 'sess1' } },
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

    it('calls querySparql with keyword filter using CONTAINS on name', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({ keyword: 'myKeyword' }, deps);
      expect(mockClient.querySparql).toHaveBeenCalled();
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlArg).toContain('myKeyword');
      expect(sparqlArg).toContain('CONTAINS(LCASE(?name)');
    });

    it('calls querySparql with keyword filter using CONTAINS on text', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({ keyword: 'myKeyword' }, deps);
      expect(mockClient.querySparql).toHaveBeenCalled();
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlArg).toContain('myKeyword');
      expect(sparqlArg).toContain('CONTAINS(LCASE(?text)');
    });

    it('calls querySparql with sessionId filter', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({ sessionId: 'test-session' }, deps);
      expect(mockClient.querySparql).toHaveBeenCalled();
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      expect(sparqlArg).toContain('test-session');
    });
  });

  describe('derivedFromId filter', () => {
    it('includes prov:wasDerivedFrom in SPARQL when derivedFromId is provided', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      const derivedFromId = 'urn:dkg:wm:parent-123';
      await handleSearch({ derivedFromId }, deps);
      
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      
      expect(sparqlArg).toContain('prov:wasDerivedFrom');
      expect(sparqlArg).toContain('urn:dkg:wm:parent-123');
      // Verify correct variable ?id is used (not ?artifact)
      expect(sparqlArg).toMatch(/\?id\s+prov:wasDerivedFrom/);
    });

    it('does not include prov:wasDerivedFrom when derivedFromId is not provided', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      await handleSearch({ keyword: 'test' }, deps);
      
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      
      expect(sparqlArg).not.toContain('prov:wasDerivedFrom');
    });

    it('combines derivedFromId filter with other filters', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      const derivedFromId = 'urn:dkg:wm:parent-123';
      await handleSearch({ 
        derivedFromId, 
        status: 'validated',
        type: 'vulnerability_finding'
      }, deps);
      
      const sparqlArg = (mockClient.querySparql as any).mock.calls[0][0];
      
      expect(sparqlArg).toContain('prov:wasDerivedFrom');
      expect(sparqlArg).toContain('validated');
      expect(sparqlArg).toContain('vulnerability_finding');
    });
  });

  describe('keyword search on name and text', () => {
    it('matches keyword on name (title) only', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:test1' },
              name: { value: 'Security Audit Report' },
              text: { value: 'This artifact does not contain the keyword' },
              type: { value: 'audit_report' },
              status: { value: 'validated' },
              contentHash: { value: 'hash1' },
              capturedAt: { value: '2024-01-15T10:00:00Z' },
              sessionId: { value: 'sess1' },
            },
          ],
        },
      });

      const result = await handleSearch({ keyword: 'Security' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.artifacts![0].name).toBe('Security Audit Report');
    });

    it('matches keyword on text (content) only', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:test2' },
              name: { value: 'General Report' },
              text: { value: 'This artifact contains vulnerability keyword in content' },
              type: { value: 'research_note' },
              status: { value: 'draft' },
              contentHash: { value: 'hash2' },
              capturedAt: { value: '2024-01-15T11:00:00Z' },
              sessionId: { value: 'sess1' },
            },
          ],
        },
      });

      const result = await handleSearch({ keyword: 'vulnerability' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.artifacts![0].text).toContain('vulnerability');
    });

    it('matches keyword on both name and text', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:test3' },
              name: { value: 'Critical Vulnerability Analysis' },
              text: { value: 'This document discusses critical vulnerability findings' },
              type: { value: 'vulnerability_finding' },
              status: { value: 'validated' },
              contentHash: { value: 'hash3' },
              capturedAt: { value: '2024-01-15T12:00:00Z' },
              sessionId: { value: 'sess1' },
            },
          ],
        },
      });

      const result = await handleSearch({ keyword: 'vulnerability' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.artifacts![0].name).toContain('Vulnerability');
      expect(result.artifacts![0].text).toContain('vulnerability');
    });

    it('performs case-insensitive keyword matching on name', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:test5' },
              name: { value: 'SECURITY Audit Report' },
              text: { value: 'No match here' },
              type: { value: 'audit_report' },
              status: { value: 'validated' },
              contentHash: { value: 'hash5' },
              capturedAt: { value: '2024-01-15T14:00:00Z' },
              sessionId: { value: 'sess1' },
            },
          ],
        },
      });

      const result = await handleSearch({ keyword: 'security' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });

    it('performs case-insensitive keyword matching on text', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:test6' },
              name: { value: 'General Report' },
              text: { value: 'This contains VULNERABILITY in uppercase' },
              type: { value: 'research_note' },
              status: { value: 'draft' },
              contentHash: { value: 'hash6' },
              capturedAt: { value: '2024-01-15T15:00:00Z' },
              sessionId: { value: 'sess1' },
            },
          ],
        },
      });

      const result = await handleSearch({ keyword: 'vulnerability' }, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });
  });

  describe('empty bindings via ?? [] fallback', () => {
    it('returns 0 results when querySparql returns object with neither result nor results', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({});

      const result = await handleSearch({}, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('handles binding with no status field (undefined status)', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            {
              id: { value: 'urn:dkg:wm:nostatus' },
              name: { value: 'No Status' },
              text: { value: 'content' },
              type: { value: 'research_note' },
              contentHash: { value: 'h1' },
              capturedAt: { value: '2024-01-01T00:00:00Z' },
              sessionId: { value: 'sess' },
              // status is intentionally absent
            },
          ],
        },
      });

      const result = await handleSearch({}, deps);
      expect(result.success).toBe(true);
      expect((result.artifacts as any)[0].status).toBeUndefined();
    });
  });

  describe('DKG v10 flat format', () => {
    it('handles result.bindings with plain strings and N-Quads literals', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        result: {
          bindings: [
            {
              id: 'urn:dkg:wm:flat1',
              name: 'Flat Artifact',
              text: '"N-Quads quoted text"',
              type: '"research_note"',
              status: '"draft"',
              contentHash: 'abc123',
              capturedAt: '"2024-01-01T00:00:00Z"',
              sessionId: '"sess-flat"',
            },
          ],
        },
      });

      const result = await handleSearch({}, deps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect((result.artifacts as any)[0].status).toBe('draft'); // N-Quads quotes stripped
      expect((result.artifacts as any)[0].type).toBe('research_note');
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
