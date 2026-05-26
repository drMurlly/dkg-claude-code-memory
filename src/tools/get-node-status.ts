/**
 * get-node-status tool — checks if the DKG node is reachable.
 *
 * Takes no required parameters. Returns:
 *   - success: boolean
 *   - status: 'online' | 'offline'
 *   - nodeUrl: string
 *   - latencyMs: number
 */

import type { ToolDeps, ToolResult } from './types.js';

/**
 * Params for get-node-status — currently empty (no required params).
 */
export interface GetNodeStatusParams {
  // No required parameters
}

/**
 * Handle get-node-status tool invocation.
 */
export async function handleGetNodeStatus(
  _params: GetNodeStatusParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const nodeUrl = deps.config.daemonUrl;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(nodeUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const latencyMs = Date.now() - start;

    if (response.ok) {
      return {
        success: true,
        message: `DKG node online at ${nodeUrl} (${latencyMs}ms)`,
        status: 'online',
        nodeUrl,
        latencyMs,
      };
    }

    // Non-2xx response — node responded but may be degraded
    return {
      success: true,
      message: `DKG node responded with HTTP ${response.status} (${latencyMs}ms)`,
      status: 'online',
      nodeUrl,
      latencyMs,
      statusCode: response.status,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);

    return {
      success: true,
      message: `DKG node unreachable at ${nodeUrl}: ${msg}`,
      status: 'offline',
      nodeUrl,
      latencyMs,
      error: msg,
    };
  }
}
