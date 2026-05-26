/**
 * Unit tests for get-node-status tool.
 * Uses deps.client.getStatus() mock — not globalThis.fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetNodeStatus } from '../../../src/tools/get-node-status.js';
import type { ToolDeps } from '../../../src/tools/types.js';
import type { McpConfig } from '../../../src/types/mcp.js';
import { DkgUnavailableError } from '../../../src/core/dkg-client.js';

function createMockDeps(daemonUrl: string, getStatus: () => Promise<unknown>): ToolDeps {
  return {
    client: { getStatus } as unknown as ToolDeps['client'],
    dedupeStore: {} as ToolDeps['dedupeStore'],
    config: { daemonUrl } as McpConfig,
  };
}

describe('get-node-status', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return online when node is reachable', async () => {
    const deps = createMockDeps('http://localhost:8900', () =>
      Promise.resolve({ status: 'running', version: '10.0.0' }),
    );
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('online');
    expect(result.nodeUrl).toBe('http://localhost:8900');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return offline when node is unreachable (DkgUnavailableError)', async () => {
    const deps = createMockDeps('http://localhost:9999', () =>
      Promise.reject(new DkgUnavailableError('Connection refused')),
    );
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('offline');
    expect(result.nodeUrl).toBe('http://localhost:9999');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBe('Connection refused');
  });

  it('should return offline when getStatus throws a generic error', async () => {
    const deps = createMockDeps('http://localhost:8900', () =>
      Promise.reject(new Error('fetch failed')),
    );
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('offline');
    expect(result.nodeUrl).toBe('http://localhost:8900');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.error).toBe('fetch failed');
  });

  it('should return online when getStatus resolves (any response)', async () => {
    const deps = createMockDeps('http://localhost:8900', () =>
      Promise.resolve({ status: 'degraded', code: 503 }),
    );
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('online');
    expect(result.nodeUrl).toBe('http://localhost:8900');
    expect(typeof result.latencyMs).toBe('number');
  });

  it('should use the daemonUrl from config', async () => {
    const deps = createMockDeps('https://dkg-node.example.com:8900', () =>
      Promise.resolve({ status: 'running' }),
    );
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('online');
    expect(result.nodeUrl).toBe('https://dkg-node.example.com:8900');
  });

  it('handles non-Error thrown values (String(err) branch)', async () => {
    const deps = createMockDeps('http://localhost:9200', () =>
      Promise.reject('connection refused string'),
    );
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('offline');
    expect(result.error).toBe('connection refused string');
  });
});
