/**
 * Promote tool — promote artifact to shared memory.
 *
 * SECURITY GUARD: confirm must be exactly true (boolean).
 */

import type { ToolDeps, ToolResult, PromoteParams } from './types.js';

/**
 * Handle promote tool invocation.
 */
export async function handlePromote(
  params: PromoteParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const { artifactId, confirm } = params;

  // SECURITY GUARD: confirm must be exactly true (boolean)
  if (confirm !== true) {
    return {
      success: false,
      message: 'Promotion requires explicit confirmation (confirm: true). This is a security requirement to prevent accidental sharing.',
    };
  }

  // Validate artifactId
  if (!artifactId || artifactId.trim().length === 0) {
    return {
      success: false,
      message: 'artifactId is required',
    };
  }

  try {
    await deps.client.promoteAssertion(
      deps.config.contextGraph,
      deps.config.assertionName,
    );

    return {
      success: true,
      message: 'Artifact promoted to shared memory successfully',
      artifactId,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Promotion failed: ${msg}`,
    };
  }
}
