/**
 * Update-status tool — change artifact status.
 */

import type { ToolDeps, ToolResult, UpdateStatusParams } from './types.js';
import { serializeStatusUpdateQuads } from '../core/serializers.js';
import { ARTIFACT_STATUSES } from '../types/artifact.js';

/**
 * Handle update-status tool invocation.
 */
export async function handleUpdateStatus(
  params: UpdateStatusParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const { artifactId, newStatus } = params;

  // Validate artifactId
  if (!artifactId || artifactId.trim().length === 0) {
    return {
      success: false,
      message: 'artifactId is required',
    };
  }

  // Validate newStatus
  if (!newStatus || !(ARTIFACT_STATUSES as readonly string[]).includes(newStatus)) {
    return {
      success: false,
      message: `Invalid status: ${newStatus}. Must be one of: ${ARTIFACT_STATUSES.join(', ')}`,
    };
  }

  const now = new Date().toISOString();
  const quads = serializeStatusUpdateQuads(artifactId, newStatus, now);

  try {
    await deps.client.writeAssertion(
      deps.config.contextGraph,
      deps.config.assertionName,
      quads,
    );

    return {
      success: true,
      message: `Status updated to ${newStatus}`,
      artifactId,
      newStatus,
      modifiedAt: now,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Status update failed: ${msg}`,
    };
  }
}
