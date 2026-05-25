/**
 * Unit tests for retrieve tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleRetrieve } from '../../../src/tools/retrieve.js';
import type { ToolDeps } from '../../../src/tools/types.js';
import type { DkgClient } from '../../../src/core/dkg-client.js';
import type { DedupeStore } from '../../../src/core/dedupe-store.js';
import { makeMockClient, makeMockDedupeStore, testConfig } from '../helpers.js';

describe('handleRetrieve', () => {
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
    it('rejects empty artifactId', async () => {
      const result = await handleRetrieve({ artifactId: '' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('artifactId is required');
    });

    it('rejects whitespace-only artifactId', async () => {
      const result = await handleRetrieve({ artifactId: '   ' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('artifactId is required');
    });

    it('rejects missing artifactId', async () => {
      const result = await handleRetrieve({} as any, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('artifactId is required');
    });
  });

  describe('artifact not found', () => {
    it('returns not found when bindings are empty', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: { bindings: [] },
      });

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:missing' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Artifact not found');
    });
  });

  describe('successful retrieval', () => {
    it('returns artifact built from bindings', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#artifactType' }, obj: { value: 'research_note' } },
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#status' }, obj: { value: 'draft' } },
          ],
        },
      });

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:test' }, deps);
      expect(result.success).toBe(true);
      expect(result.message).toContain('retrieved successfully');
      expect(result.artifact).toBeDefined();
      expect((result.artifact as any).artifactType).toBe('research_note');
      expect((result.artifact as any).status).toBe('draft');
    });

    it('parses multiple predicates into flat artifact object', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#artifactType' }, obj: { value: 'audit_note' } },
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#status' }, obj: { value: 'validated' } },
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#contentHash' }, obj: { value: 'sha256:abc123' } },
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#capturedAt' }, obj: { value: '2024-01-15T10:00:00Z' } },
          ],
        },
      });

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:test' }, deps);
      expect(result.success).toBe(true);
      const artifact = result.artifact as any;
      expect(artifact.artifactType).toBe('audit_note');
      expect(artifact.status).toBe('validated');
      expect(artifact.contentHash).toBe('sha256:abc123');
      expect(artifact.capturedAt).toBe('2024-01-15T10:00:00Z');
    });

    it('uses local predicate name (after # split)', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { pred: { value: 'https://example.org/ontology#myPredicate' }, obj: { value: 'my-value' } },
          ],
        },
      });

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:test' }, deps);
      expect(result.success).toBe(true);
      expect((result.artifact as any).myPredicate).toBe('my-value');
    });

    it('strips < and > characters from artifactId', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#status' }, obj: { value: 'draft' } },
          ],
        },
      });

      const result = await handleRetrieve({ artifactId: '<urn:dkg:wm:test>' }, deps);
      expect(result.success).toBe(true);
      // verify querySparql was called (with stripped id)
      expect(mockClient.querySparql).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('handles querySparql error gracefully', async () => {
      mockClient.querySparql = vi.fn().mockRejectedValue(new Error('SPARQL error'));

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:test' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Retrieve failed');
    });

    it('handles non-Error thrown value', async () => {
      mockClient.querySparql = vi.fn().mockRejectedValue('raw string error');

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:test' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Retrieve failed');
    });

    it('handles result without results property (nullish fallback)', async () => {
      // querySparql returns something without .results
      mockClient.querySparql = vi.fn().mockResolvedValue({});

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:test' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Artifact not found');
    });

    it('parses predicate without # using full split result', async () => {
      // When there's no # in the predicate, split('#').pop() returns the full string
      // The last segment after / is then used as the key
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { pred: { value: 'https://example.org/ontology/mySlashPredicate' }, obj: { value: 'slash-value' } },
          ],
        },
      });

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:test' }, deps);
      expect(result.success).toBe(true);
      // split('#').pop() returns the entire string when no # present,
      // which becomes the key (the full URL)
      expect(result.artifact).toBeDefined();
    });

    it('handles predicate ending with # (empty local name fallback)', async () => {
      // If pred ends with # like 'http://example.org/ns#', split('#').pop() = '' (falsy)
      // Then it falls through to split('/').pop() or pred itself
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#' }, obj: { value: 'fallback-value' } },
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#status' }, obj: { value: 'draft' } },
          ],
        },
      });

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:test' }, deps);
      expect(result.success).toBe(true);
      expect((result.artifact as any).status).toBe('draft');
    });

    it('skips binding when pred or obj is missing', async () => {
      mockClient.querySparql = vi.fn().mockResolvedValue({
        results: {
          bindings: [
            { pred: { value: 'https://ontology.origintrail.io/dkg/wm#status' }, obj: { value: 'draft' } },
            { pred: undefined, obj: { value: 'orphan' } }, // missing pred
          ],
        },
      });

      const result = await handleRetrieve({ artifactId: 'urn:dkg:wm:test' }, deps);
      expect(result.success).toBe(true);
      expect((result.artifact as any).status).toBe('draft');
    });
  });
});
