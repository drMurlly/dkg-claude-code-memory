/**
 * Unit tests for update-status tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleUpdateStatus } from '../../../src/tools/update-status.js';
import type { ToolDeps } from '../../../src/tools/types.js';
import type { DkgClient } from '../../../src/core/dkg-client.js';
import type { DedupeStore } from '../../../src/core/dedupe-store.js';
import { makeMockClient, makeMockDedupeStore, testConfig } from '../helpers.js';

describe('handleUpdateStatus', () => {
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
      const result = await handleUpdateStatus({ artifactId: '', newStatus: 'validated' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('artifactId is required');
    });

    it('rejects missing artifactId', async () => {
      const result = await handleUpdateStatus({ artifactId: undefined as any, newStatus: 'validated' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('artifactId is required');
    });

    it('rejects invalid status', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'not_valid_status' as any }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid status');
    });

    it('rejects empty newStatus', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: '' as any }, deps);
      expect(result.success).toBe(false);
    });
  });

  describe('successful status update', () => {
    it('updates status and returns success', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'validated' }, deps);
      expect(result.success).toBe(true);
      expect(result.message).toContain('validated');
      expect(result.artifactId).toBe('urn:dkg:wm:test');
      expect(result.newStatus).toBe('validated');
    });

    it('calls writeAssertion on client', async () => {
      await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'validated' }, deps);
      expect(mockClient.writeAssertion).toHaveBeenCalled();
    });

    it('returns modifiedAt timestamp', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'validated' }, deps);
      expect(result.success).toBe(true);
      expect(result.modifiedAt).toBeDefined();
    });

    it('updates to draft status', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'draft' }, deps);
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('draft');
    });

    it('updates to needs_sources status', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'needs_sources' }, deps);
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('needs_sources');
    });

    it('updates to review_needed status', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'review_needed' }, deps);
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('review_needed');
    });

    it('updates to ready_to_share status', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'ready_to_share' }, deps);
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('ready_to_share');
    });

    it('updates to deprecated status', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'deprecated' }, deps);
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('deprecated');
    });

    it('updates to discarded status', async () => {
      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'discarded' }, deps);
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('discarded');
    });
  });

  describe('error handling', () => {
    it('handles writeAssertion error gracefully', async () => {
      (mockClient.writeAssertion as any).mockRejectedValue(new Error('Write failed'));

      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'validated' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Status update failed');
    });

    it('handles non-Error thrown value', async () => {
      (mockClient.writeAssertion as any).mockRejectedValue('raw string rejection');

      const result = await handleUpdateStatus({ artifactId: 'urn:dkg:wm:test', newStatus: 'validated' }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Status update failed');
    });
  });
});
