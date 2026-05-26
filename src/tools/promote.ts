/**
 * Promote tool — promote artifact to shared memory.
 *
 * SECURITY GUARD: confirm must be exactly true (boolean).
 * CONFIDENTIAL GUARD: confidential artifacts cannot be promoted.
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
    // CONFIDENTIAL GUARD: check sensitivity via SPARQL lookup.
    // Uses getArtifactSensitivity() on the base DkgClient — no injected method needed.
    const sensitivity = await deps.client.getArtifactSensitivity(
      artifactId,
      deps.config.contextGraph,
      deps.config.assertionName,
    );
    if (sensitivity === 'confidential') {
      return {
        success: false,
        message: 'Confidential artifacts cannot be promoted to Shared Memory',
      };
    }

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
