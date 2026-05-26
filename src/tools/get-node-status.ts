import type { ToolDeps, ToolResult } from './types.js';

/**
 * get_node_status — verify DKG node health via DkgClient.getStatus().
 * Uses the real API endpoint (not just port-open) so 'online' means DKG answered.
 */
export async function handleGetNodeStatus(
  _params: Record<string, unknown>,
  deps: ToolDeps,
): Promise<ToolResult> {
  const nodeUrl = deps.config.daemonUrl;
  const start = Date.now();
  try {
    await deps.client.getStatus();
    return {
      success: true,
      message: 'Node is online',
      status: 'online',
      nodeUrl,
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: true,
      message: 'Node is offline or unreachable',
      status: 'offline',
      nodeUrl,
      latencyMs: Date.now() - start,
      error: msg,
    };
  }
}
