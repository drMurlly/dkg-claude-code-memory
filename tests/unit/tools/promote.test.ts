/**
 * Unit tests for promote tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handlePromote } from '../../../src/tools/promote.js';
import type { ToolDeps } from '../../../src/tools/types.js';
import type { DkgClient } from '../../../src/core/dkg-client.js';
import type { DedupeStore } from '../../../src/core/dedupe-store.js';
import type { ArtifactRecord } from '../../../src/types/artifact.js';
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

  describe('sensitivity guard', () => {
    it('rejects confidential artifacts', async () => {
      const confidentialArtifact: ArtifactRecord = {
        artifactId: 'urn:dkg:wm:confidential',
        artifactType: 'vulnerability_finding',
        title: 'Secret Finding',
        content: 'Confidential content',
        contentHash: 'abc123',
        status: 'validated',
        sensitivity: 'confidential',
        author: { id: 'author-1' },
        agent: { id: 'agent-1', framework: 'claude', version: '1.0.0' },
        provenance: {
          source: 'manual',
          agentFramework: 'claude',
          createdAt: '2026-01-01T00:00:00Z',
          capturedAt: '2026-01-01T00:00:00Z',
        },
        dkg: {
          contextGraph: 'test-graph',
          assertionName: 'test-assertion',
          memoryLayer: 'working-memory',
        },
      };
      const mockClientWithGetArtifact = makeMockClient();
      (mockClientWithGetArtifact.getArtifact as any) = vi.fn().mockResolvedValue(confidentialArtifact);
      const depsWithGetArtifact: ToolDeps = {
        client: mockClientWithGetArtifact as DkgClient,
        dedupeStore: mockDedupeStore as DedupeStore,
        config: testConfig,
      };

      const result = await handlePromote({ artifactId: 'urn:dkg:wm:confidential', confirm: true }, depsWithGetArtifact);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Confidential artifacts cannot be promoted to Shared Memory');
      expect(mockClientWithGetArtifact.promoteAssertion).not.toHaveBeenCalled();
    });

    it('allows public artifacts to be promoted', async () => {
      const publicArtifact: ArtifactRecord = {
        artifactId: 'urn:dkg:wm:public',
        artifactType: 'research_note',
        title: 'Public Note',
        content: 'Public content',
        contentHash: 'def456',
        status: 'validated',
        sensitivity: 'public',
        author: { id: 'author-1' },
        agent: { id: 'agent-1', framework: 'claude', version: '1.0.0' },
        provenance: {
          source: 'manual',
          agentFramework: 'claude',
          createdAt: '2026-01-01T00:00:00Z',
          capturedAt: '2026-01-01T00:00:00Z',
        },
        dkg: {
          contextGraph: 'test-graph',
          assertionName: 'test-assertion',
          memoryLayer: 'working-memory',
        },
      };
      const mockClientWithGetArtifact = makeMockClient();
      (mockClientWithGetArtifact.getArtifact as any) = vi.fn().mockResolvedValue(publicArtifact);
      const depsWithGetArtifact: ToolDeps = {
        client: mockClientWithGetArtifact as DkgClient,
        dedupeStore: mockDedupeStore as DedupeStore,
        config: testConfig,
      };

      const result = await handlePromote({ artifactId: 'urn:dkg:wm:public', confirm: true }, depsWithGetArtifact);
      expect(result.success).toBe(true);
      expect(result.message).toContain('promoted to shared memory');
      expect(mockClientWithGetArtifact.promoteAssertion).toHaveBeenCalled();
    });

    it('allows internal artifacts to be promoted', async () => {
      const internalArtifact: ArtifactRecord = {
        artifactId: 'urn:dkg:wm:internal',
        artifactType: 'code_analysis',
        title: 'Internal Analysis',
        content: 'Internal content',
        contentHash: 'ghi789',
        status: 'validated',
        sensitivity: 'internal',
        author: { id: 'author-1' },
        agent: { id: 'agent-1', framework: 'claude', version: '1.0.0' },
        provenance: {
          source: 'manual',
          agentFramework: 'claude',
          createdAt: '2026-01-01T00:00:00Z',
          capturedAt: '2026-01-01T00:00:00Z',
        },
        dkg: {
          contextGraph: 'test-graph',
          assertionName: 'test-assertion',
          memoryLayer: 'working-memory',
        },
      };
      const mockClientWithGetArtifact = makeMockClient();
      (mockClientWithGetArtifact.getArtifact as any) = vi.fn().mockResolvedValue(internalArtifact);
      const depsWithGetArtifact: ToolDeps = {
        client: mockClientWithGetArtifact as DkgClient,
        dedupeStore: mockDedupeStore as DedupeStore,
        config: testConfig,
      };

      const result = await handlePromote({ artifactId: 'urn:dkg:wm:internal', confirm: true }, depsWithGetArtifact);
      expect(result.success).toBe(true);
      expect(result.message).toContain('promoted to shared memory');
      expect(mockClientWithGetArtifact.promoteAssertion).toHaveBeenCalled();
    });

    it('allows artifacts without sensitivity to be promoted', async () => {
      const artifactWithoutSensitivity: ArtifactRecord = {
        artifactId: 'urn:dkg:wm:nosensitivity',
        artifactType: 'chat',
        title: 'No Sensitivity',
        content: 'Content without sensitivity',
        contentHash: 'jkl012',
        status: 'validated',
        author: { id: 'author-1' },
        agent: { id: 'agent-1', framework: 'claude', version: '1.0.0' },
        provenance: {
          source: 'manual',
          agentFramework: 'claude',
          createdAt: '2026-01-01T00:00:00Z',
          capturedAt: '2026-01-01T00:00:00Z',
        },
        dkg: {
          contextGraph: 'test-graph',
          assertionName: 'test-assertion',
          memoryLayer: 'working-memory',
        },
      };
      const mockClientWithGetArtifact = makeMockClient();
      (mockClientWithGetArtifact.getArtifact as any) = vi.fn().mockResolvedValue(artifactWithoutSensitivity);
      const depsWithGetArtifact: ToolDeps = {
        client: mockClientWithGetArtifact as DkgClient,
        dedupeStore: mockDedupeStore as DedupeStore,
        config: testConfig,
      };

      const result = await handlePromote({ artifactId: 'urn:dkg:wm:nosensitivity', confirm: true }, depsWithGetArtifact);
      expect(result.success).toBe(true);
      expect(result.message).toContain('promoted to shared memory');
      expect(mockClientWithGetArtifact.promoteAssertion).toHaveBeenCalled();
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
