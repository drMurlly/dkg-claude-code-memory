/**
 * Unit tests for capture tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleCapture } from '../../../src/tools/capture.js';
import { DkgUnavailableError } from '../../../src/core/dkg-client.js';
import type { ToolDeps } from '../../../src/tools/types.js';
import type { DkgClient } from '../../../src/core/dkg-client.js';
import type { DedupeStore } from '../../../src/core/dedupe-store.js';
import { makeMockClient, makeMockDedupeStore, testConfig } from '../helpers.js';
import { normalizeArtifact } from '../../../src/core/normalizer.js';

vi.mock('../../../src/core/normalizer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/normalizer.js')>();
  return {
    ...actual,
    normalizeArtifact: vi.fn(actual.normalizeArtifact),
  };
});

describe('handleCapture', () => {
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
    it('rejects empty content', async () => {
      const result = await handleCapture({ content: '' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Content cannot be empty');
    });

    it('rejects content that is too short', async () => {
      const result = await handleCapture({ content: 'Short' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Content too short');
    });

    it('rejects content just under minContentLength (79 chars)', async () => {
      const content = 'A'.repeat(79);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Content too short');
    });

    it('rejects content exceeding 500KB limit', async () => {
      const content = 'A'.repeat(500_001);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Content too long');
    });
  });

  describe('successful capture', () => {
    it('captures content at minimum length (80 chars)', async () => {
      const content = 'A'.repeat(80);
      const result = await handleCapture({ content, artifactType: 'research_note' }, deps);
      expect(result.success).toBe(true);
      expect(result.artifactId).toBeDefined();
      expect(result.ual).toBeDefined();
      expect(mockDedupeStore.add).toHaveBeenCalled();
      expect(mockDedupeStore.save).toHaveBeenCalled();
    });

    it('captures content over minimum length', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content, artifactType: 'research_note' }, deps);
      expect(result.success).toBe(true);
      expect(result.artifactId).toBeDefined();
      expect(result.ual).toBeDefined();
    });

    it('calls createOrWriteAssertion on the client', async () => {
      const content = 'A'.repeat(100);
      await handleCapture({ content }, deps);
      expect(mockClient.createOrWriteAssertion).toHaveBeenCalled();
    });

    it('writes a schema:accessMode quad when sensitivity is provided (end-to-end)', async () => {
      const content = 'A'.repeat(120);
      await handleCapture({ content, artifactType: 'vulnerability_finding', sensitivity: 'confidential' }, deps);
      const arg = (mockClient.createOrWriteAssertion as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const accessModeQuad = arg.quads.find((q: { predicate: string }) => q.predicate.endsWith('accessMode'));
      expect(accessModeQuad).toBeDefined();
      expect(accessModeQuad.object).toContain('confidential');
    });

    it('omits the accessMode quad when no sensitivity is provided', async () => {
      const content = 'B'.repeat(120);
      await handleCapture({ content, artifactType: 'research_note' }, deps);
      const arg = (mockClient.createOrWriteAssertion as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const accessModeQuad = arg.quads.find((q: { predicate: string }) => q.predicate.endsWith('accessMode'));
      expect(accessModeQuad).toBeUndefined();
    });

    it('returns contentHash', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(true);
      expect(result.contentHash).toBeDefined();
    });

    it('generates content-addressable artifact ID starting with urn:dkg:wm:', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(true);
      expect(result.artifactId).toMatch(/^urn:dkg:wm:/);
    });

    it('generates deterministic artifact ID for identical content', async () => {
      const content = 'B'.repeat(100);
      const result1 = await handleCapture({ content }, deps);
      const result2 = await handleCapture({ content }, deps);
      expect(result1.artifactId).toBe(result2.artifactId);
    });

    it('returns message on success', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(true);
      expect(result.message).toContain('captured successfully');
    });

    it('falls back to artifactRecord.artifactId when receipt has no ual', async () => {
      (mockClient.createOrWriteAssertion as any).mockResolvedValueOnce({});
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(true);
      expect(result.ual).toMatch(/^urn:dkg:wm:/);
    });
  });

  describe('status defaulting logic', () => {
    it('assigns draft status for short content (>= 80, < 200 chars)', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(true);
      expect(result.status).toBe('draft');
    });

    it('assigns needs_sources status for long content (> 300 chars)', async () => {
      const content = 'A'.repeat(301);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(true);
      expect(result.status).toBe('needs_sources');
    });

    it('uses custom status when provided', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content, status: 'validated' }, deps);
      expect(result.success).toBe(true);
      expect(result.status).toBe('validated');
    });

    it('uses custom status even when content is long', async () => {
      const content = 'A'.repeat(300);
      const result = await handleCapture({ content, status: 'review_needed' }, deps);
      expect(result.success).toBe(true);
      expect(result.status).toBe('review_needed');
    });
  });

  describe('artifact type handling', () => {
    it('normalizes invalid artifactType to raw_capture (never fails)', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content, artifactType: 'invalid_type' as any }, deps);
      expect(result.success).toBe(true);
    });

    it('accepts valid artifactType: vulnerability_finding', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content, artifactType: 'vulnerability_finding' }, deps);
      expect(result.success).toBe(true);
    });

    it('accepts valid artifactType: knowledge_synthesis', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content, artifactType: 'knowledge_synthesis' }, deps);
      expect(result.success).toBe(true);
    });
  });

  describe('deduplication', () => {
    it('returns deduplicated when content hash already exists', async () => {
      (mockDedupeStore.has as any).mockReturnValue(true);
      (mockDedupeStore.getRecord as any).mockReturnValue({ ual: 'existing-ual', timestamp: '2024-01-01T00:00:00Z' });

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);

      expect(result.success).toBe(true);
      expect(result.dedupeStatus).toBe('deduplicated');
      expect(result.ual).toBe('existing-ual');
      expect(mockClient.createOrWriteAssertion).not.toHaveBeenCalled();
    });

    it('returns undefined ual when getRecord entry has no ual', async () => {
      (mockDedupeStore.has as any).mockReturnValue(true);
      (mockDedupeStore.getRecord as any).mockReturnValue({ timestamp: '2024-01-01T00:00:00Z' });

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);

      expect(result.success).toBe(true);
      expect(result.dedupeStatus).toBe('deduplicated');
      expect(result.ual).toBeUndefined();
    });

    it('skips dedup check when dedupeEnabled is false', async () => {
      const configWithoutDedupe = { ...testConfig, dedupeEnabled: false };
      const depsWithoutDedupe = { ...deps, config: configWithoutDedupe };
      (mockDedupeStore.has as any).mockReturnValue(true);

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, depsWithoutDedupe);

      expect(result.success).toBe(true);
      expect(result.dedupeStatus).not.toBe('deduplicated');
      expect(mockClient.createOrWriteAssertion).toHaveBeenCalled();
    });

    it('proceeds to capture when hash not in dedupeStore', async () => {
      (mockDedupeStore.has as any).mockReturnValue(false);

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);

      expect(result.success).toBe(true);
      expect(result.dedupeStatus).not.toBe('deduplicated');
      expect(mockClient.createOrWriteAssertion).toHaveBeenCalled();
    });
  });

  describe('derivedFrom provenance chains', () => {
    it('passes derivedFrom to serializer when provided', async () => {
      const content = 'A'.repeat(100);
      const derivedFrom = ['urn:dkg:wm:abc123'];
      const result = await handleCapture({ content, derivedFrom }, deps);
      
      expect(result.success).toBe(true);
      expect(result.derivedFrom).toEqual(derivedFrom);
    });

    it('accepts multiple derivedFrom URNs', async () => {
      const content = 'A'.repeat(100);
      const derivedFrom = [
        'urn:dkg:wm:abc123',
        'urn:dkg:wm:def456',
        'urn:dkg:wm:ghi789',
      ];
      const result = await handleCapture({ content, derivedFrom }, deps);
      
      expect(result.success).toBe(true);
      expect(result.derivedFrom).toEqual(derivedFrom);
    });

    it('handles empty derivedFrom array', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content, derivedFrom: [] }, deps);
      
      expect(result.success).toBe(true);
      expect(result.derivedFrom).toEqual([]);
    });

    it('derivedFrom is undefined when not provided', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);
      
      expect(result.success).toBe(true);
      expect(result.derivedFrom).toBeUndefined();
    });

    it('combines derivedFrom with other optional parameters', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({
        content,
        artifactType: 'research_note',
        sessionId: 'session-abc',
        subAgentId: 'agent-001',
        title: 'Test Note',
        derivedFrom: ['urn:dkg:wm:parent-artifact'],
      }, deps);
      
      expect(result.success).toBe(true);
      expect(result.derivedFrom).toEqual(['urn:dkg:wm:parent-artifact']);
    });
  });

  describe('optional parameters', () => {
    it('accepts sessionId', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content, sessionId: 'session-xyz' }, deps);
      expect(result.success).toBe(true);
    });

    it('accepts subAgentId', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content, subAgentId: 'sub-agent-1' }, deps);
      expect(result.success).toBe(true);
    });

    it('accepts title', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content, title: 'My Title' }, deps);
      expect(result.success).toBe(true);
    });

    it('accepts all optional parameters together', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({
        content,
        artifactType: 'audit_note',
        sessionId: 'session-abc',
        subAgentId: 'agent-001',
        title: 'Audit Note',
        status: 'review_needed',
      }, deps);
      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles DkgUnavailableError', async () => {
      (mockClient.createOrWriteAssertion as any).mockRejectedValue(
        new DkgUnavailableError('Connection refused')
      );

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('DKG unavailable');
    });

    it('handles generic errors', async () => {
      (mockClient.createOrWriteAssertion as any).mockRejectedValue(
        new Error('Network timeout')
      );

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to capture artifact');
    });

    it('handles non-Error thrown values via String(err) branch', async () => {
      (mockClient.createOrWriteAssertion as any).mockRejectedValue('plain string error');

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('plain string error');
    });

    it('returns failure when normalizeArtifact returns null', async () => {
      vi.mocked(normalizeArtifact).mockReturnValueOnce(null as any);

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to normalize artifact');
    });
  });
});
