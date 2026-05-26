/**
 * Test helpers for unit tests — provides mock factories and test fixtures.
 */

import { vi } from 'vitest';
import type { McpConfig } from '../../src/types/mcp.js';
import type { DkgClient, DkgLogger, RdfQuad } from '../../src/core/dkg-client.js';
import type { DedupeStore } from '../../src/core/dedupe-store.js';

/**
 * Create a mock DkgClient with all methods stubbed.
 */
export function makeMockClient(): Partial<DkgClient> {
  return {
    daemonUrl: 'http://127.0.0.1:9200',
    token: 'test-token',
    timeoutMs: 30000,
    maxRetries: 3,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as DkgLogger,
    getAgentAddress: vi.fn().mockResolvedValue(undefined),
    createContextGraph: vi.fn().mockResolvedValue(undefined),
    ensureContextGraph: vi.fn().mockResolvedValue(undefined),
    createAssertion: vi.fn().mockResolvedValue({ assertionUri: 'urn:dkg:assertion:test', ual: 'ual:test:123' }),
    writeAssertion: vi.fn().mockResolvedValue({ written: 10, ual: 'ual:test:123' }),
    createOrWriteAssertion: vi.fn().mockResolvedValue({ ual: 'ual:test:123' }),
    queryAssertion: vi.fn().mockResolvedValue({ quads: [], count: 0 }),
    querySparql: vi.fn().mockResolvedValue({ result: { bindings: [] } }),
    getAssertionHistory: vi.fn().mockResolvedValue([]),
    promoteAssertion: vi.fn().mockResolvedValue(undefined),
    getArtifactSensitivity: vi.fn().mockResolvedValue(null),
  };
}

/**
 * Create a mock DedupeStore with all methods stubbed.
 */
export function makeMockDedupeStore(): Partial<DedupeStore> {
  return {
    has: vi.fn().mockReturnValue(false),
    add: vi.fn(),
    getRecord: vi.fn().mockReturnValue(undefined),
    size: vi.fn().mockReturnValue(0),
    isAssertionCreated: vi.fn().mockReturnValue(false),
    markAssertionCreated: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  };
}

/**
 * Test configuration for McpConfig.
 */
export const testConfig: McpConfig = {
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

/**
 * Create a minimal artifact record for testing.
 */
export function makeArtifact(overrides?: Partial<any>): any {
  const base = {
    artifactId: 'urn:dkg:wm:test-artifact-123',
    artifactType: 'research_note' as const,
    title: 'Test Artifact Title',
    content: 'This is test content for the artifact.',
    contentHash: 'sha256:testhash123',
    status: 'draft' as const,
    author: { id: 'test-author' },
    agent: { id: 'claude-code-agent', framework: 'claude-code', version: '1.0.0' },
    provenance: {
      source: 'chat',
      sessionId: 'test-session-123',
      conversationId: 'conv-456',
      createdAt: '2024-01-15T10:00:00Z',
      capturedAt: '2024-01-15T10:00:00Z',
      modifiedAt: '2024-01-15T10:00:00Z',
      subAgentId: '',
      parentTaskId: '',
      agentRole: '',
      agentFramework: 'claude-code',
      toolCalls: [],
      filePaths: [],
    },
    dkg: {
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      memoryLayer: 'working-memory',
      ual: 'ual:test:123',
    },
  };
  return { ...base, ...overrides };
}

/**
 * Create test RDF quads.
 */
export function makeQuads(overrides?: Partial<RdfQuad>[]): RdfQuad[] {
  const base: RdfQuad[] = [
    {
      subject: 'urn:dkg:wm:test',
      predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
      object: 'https://ontology.origintrail.io/dkg/wm#WorkingMemoryArtifact',
    },
    {
      subject: 'urn:dkg:wm:test',
      predicate: 'https://ontology.origintrail.io/dkg/wm#artifactType',
      object: '"research_note"',
    },
  ];
  if (overrides) {
    return base.map((q, i) => ({ ...q, ...overrides[i] }));
  }
  return base;
}

/**
 * Create a mock fetch implementation that returns JSON.
 */
export function makeMockFetch(json: any, status = 200): typeof global.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(json)),
    json: vi.fn().mockResolvedValue(json),
  } as Response);
}

/**
 * Create a mock fetch that throws an error.
 */
export function makeMockFetchError(message = 'Network error'): typeof global.fetch {
  return vi.fn().mockRejectedValue(new Error(message));
}

/**
 * Create a mock fetch that returns 401.
 */
export function makeMockFetch401(): typeof global.fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    text: vi.fn().mockResolvedValue('Unauthorized'),
  } as Response);
}

/**
 * Create a mock fetch that returns 503.
 */
export function makeMockFetch503(): typeof global.fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 503,
    text: vi.fn().mockResolvedValue('Service Unavailable'),
  } as Response);
}

/**
 * Create a mock fetch that returns 409 (conflict).
 */
export function makeMockFetch409(): typeof global.fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 409,
    text: vi.fn().mockResolvedValue('Conflict: already exists'),
  } as Response);
}
