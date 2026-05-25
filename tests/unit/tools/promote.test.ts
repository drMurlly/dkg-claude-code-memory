/**
 * Unit tests for promote tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handlePromote } from '../../../src/tools/promote.js';
import type { ToolDeps } from '../../../src/tools/types.js';
import type { DkgClient } from '../../../src/core/dkg-client.js';
import type { DedupeStore } from '../../../src/core/dedupe-store.js';
import { makeMockClient, makeMockDedupeStore, testConfig } from '../helpers.js';

describe('handlePromote', () => {
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

  describe('confirmation guard', () => {
    it('rejects when confirm is false', async () => {
      const result = await handlePromote({ artifactId: 'urn:dkg:wm:test', confirm: false }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Promotion requires explicit confirmation');
    });

    it('rejects when confirm is undefined', async () => {
      const result = await handlePromote({ artifactId: 'urn:dkg:wm:test', confirm: undefined as any }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Promotion requires explicit confirmation');
    });

    it('rejects when confirm is string "true" (must be boolean true)', async () => {
      const result = await handlePromote({ artifactId: 'urn:dkg:wm:test', confirm: 'true' as any }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Promotion requires explicit confirmation');
    });

    it('rejects when confirm is missing', async () => {
      const result = await handlePromote({ artifactId: 'urn:dkg:wm:test' } as any, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Promotion requires explicit confirmation');
    });
  });

  describe('input validation', () => {
    it('rejects empty artifactId with confirm=true', async () => {
      const result = await handlePromote({ artifactId: '', confirm: true }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('artifactId is required');
    });

    it('rejects missing artifactId with confirm=true', async () => {
      const result = await handlePromote({ artifactId: undefined as any, confirm: true }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toBe('artifactId is required');
    });
  });

  describe('successful promotion', () => {
    it('promotes artifact and returns success', async () => {
      const result = await handlePromote({ artifactId: 'urn:dkg:wm:test', confirm: true }, deps);
      expect(result.success).toBe(true);
      expect(result.message).toContain('promoted to shared memory');
      expect(result.artifactId).toBe('urn:dkg:wm:test');
    });

    it('calls promoteAssertion on client', async () => {
      await handlePromote({ artifactId: 'urn:dkg:wm:test', confirm: true }, deps);
      expect(mockClient.promoteAssertion).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('handles promoteAssertion error gracefully', async () => {
      (mockClient.promoteAssertion as any).mockRejectedValue(new Error('Promotion failed upstream'));

      const result = await handlePromote({ artifactId: 'urn:dkg:wm:test', confirm: true }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Promotion failed');
    });

    it('handles non-Error thrown value', async () => {
      (mockClient.promoteAssertion as any).mockRejectedValue('raw string error');

      const result = await handlePromote({ artifactId: 'urn:dkg:wm:test', confirm: true }, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Promotion failed');
    });
  });
});
