/**
 * Promote tool — promote artifact to shared memory.
 *
 * SECURITY GUARD: confirm must be exactly true (boolean).
 * CONFIDENTIAL GUARD: confidential artifacts cannot be promoted.
 */

import type { ToolDeps, ToolResult, PromoteParams } from './types.js';
import type { ArtifactRecord } from '../types/artifact.js';

/**
 * Extended client type that optionally supports artifact retrieval.
 * Tests and future DkgClient versions may inject getArtifact at runtime.
 */
type ClientWithOptionalGetArtifact = ToolDeps['client'] & {
  getArtifact?: (id: string) => Promise<ArtifactRecord | null>;
};

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
    // CONFIDENTIAL GUARD: check sensitivity if getArtifact is available on client.
    // Tests and extended clients inject getArtifact; the base DkgClient omits it.
    const extClient = deps.client as ClientWithOptionalGetArtifact;
    if (typeof extClient.getArtifact === 'function') {
      const artifact = await extClient.getArtifact(artifactId);

      if (artifact && artifact.sensitivity === 'confidential') {
        return {
          success: false,
          message: 'Confidential artifacts cannot be promoted to Shared Memory',
        };
      }
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
