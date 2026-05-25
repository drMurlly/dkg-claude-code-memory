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

    it('returns contentHash', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(true);
      expect(result.contentHash).toBeDefined();
    });

    it('returns message on success', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(true);
      expect(result.message).toContain('captured successfully');
    });
  });

  describe('status defaulting logic', () => {
    it('assigns draft status for short content (>= 80, < 200 chars)', async () => {
      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);
      expect(result.success).toBe(true);
      expect(result.status).toBe('draft');
    });

    it('assigns needs_sources status for long content (>= 200 chars)', async () => {
      const content = 'A'.repeat(200);
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
      // When the stored record has no ual, result.ual is undefined
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
      (mockClient.createOrWriteAssertion as any).mockRejectedValue(new DkgUnavailableError('node down'));

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('DKG unavailable');
    });

    it('handles generic error', async () => {
      (mockClient.createOrWriteAssertion as any).mockRejectedValue(new Error('network error'));

      const content = 'A'.repeat(100);
      const result = await handleCapture({ content }, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to capture artifact');
    });
  });
});
