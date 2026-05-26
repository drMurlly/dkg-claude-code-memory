/**
 * Unit tests for get-node-status tool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetNodeStatus } from '../../../src/tools/get-node-status.js';
import type { ToolDeps } from '../../../src/tools/types.js';
import type { McpConfig } from '../../../src/types/mcp.js';
import { DkgUnavailableError } from '../../../src/core/dkg-client.js';

function createMockDeps(daemonUrl: string): ToolDeps {
  return {
    client: {} as ToolDeps['client'],
    dedupeStore: {} as ToolDeps['dedupeStore'],
    config: { daemonUrl } as McpConfig,
  };
}

describe('get-node-status', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return online when node is reachable', async () => {
    const mockResponse = { ok: true, status: 200 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const deps = createMockDeps('http://localhost:8900');
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('online');
    expect(result.nodeUrl).toBe('http://localhost:8900');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return offline when node is unreachable (DkgUnavailableError)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DkgUnavailableError('Connection refused'),
    );

    const deps = createMockDeps('http://localhost:9999');
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('offline');
    expect(result.nodeUrl).toBe('http://localhost:9999');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBe('Connection refused');
  });

  it('should return offline when fetch throws a generic error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const deps = createMockDeps('http://localhost:8900');
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('offline');
    expect(result.nodeUrl).toBe('http://localhost:8900');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.error).toBe('fetch failed');
  });

  it('should return online with statusCode for non-2xx responses', async () => {
    const mockResponse = { ok: false, status: 503 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const deps = createMockDeps('http://localhost:8900');
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('online');
    expect(result.nodeUrl).toBe('http://localhost:8900');
    expect(result.statusCode).toBe(503);
    expect(typeof result.latencyMs).toBe('number');
  });

  it('should use the daemonUrl from config', async () => {
    const mockResponse = { ok: true, status: 200 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const deps = createMockDeps('https://dkg-node.example.com:8900');
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('online');
    expect(result.nodeUrl).toBe('https://dkg-node.example.com:8900');
  });

  it('handles non-Error thrown values (String(err) branch)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue('connection refused string');

    const deps = createMockDeps('http://localhost:9200');
    const result = await handleGetNodeStatus({}, deps);

    expect(result.success).toBe(true);
    expect(result.status).toBe('offline');
    expect(result.error).toBe('connection refused string');
  });
});
