/**
 * Capture tool — creates new artifacts in DKG Working Memory.
 */

import { createHash } from 'node:crypto';
import type { ToolDeps, ToolResult, CaptureParams } from './types.js';
import type { ArtifactType, ArtifactStatus } from '../types/artifact.js';
import { ARTIFACT_TYPES, ARTIFACT_STATUSES } from '../types/artifact.js';
import { serializeToQuads } from '../core/serializers.js';
import { DkgUnavailableError } from '../core/dkg-client.js';

/**
 * Generate a unique artifact ID.
 */
function generateArtifactId(): string {
  return `urn:artifact:${createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 16)}`;
}

/**
 * Normalize artifact type and status with defaults.
 */
function normalizeArtifact(
  content: string,
  artifactType?: ArtifactType,
  status?: ArtifactStatus,
): { type: ArtifactType; status: ArtifactStatus } {
  const type = artifactType && ARTIFACT_TYPES.includes(artifactType)
    ? artifactType
    : 'raw_capture';

  const defaultStatus: ArtifactStatus = content.length < 200
    ? 'draft'
    : 'needs_sources';

  const finalStatus = status && ARTIFACT_STATUSES.includes(status)
    ? status
    : defaultStatus;

  return { type, status: finalStatus };
}

/**
 * Handle capture tool invocation.
 */
export async function handleCapture(
  params: CaptureParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const { content, artifactType, title, status, sessionId, conversationId, toolCalls, filePaths, workspaceProject, subAgentId, parentTaskId, agentRole, source = 'tool' } = params;

  // Validate content
  if (!content || content.trim().length === 0) {
    return {
      success: false,
      message: 'Content cannot be empty',
    };
  }

  // Check minimum length
  if (content.length < deps.config.minContentLength) {
    return {
      success: false,
      message: `Content too short (min ${deps.config.minContentLength} chars, got ${content.length})`,
    };
  }

  // Normalize type and status
  const { type: normalizedType, status: normalizedStatus } = normalizeArtifact(content, artifactType, status);

  // Validate type
  if (!ARTIFACT_TYPES.includes(normalizedType)) {
    return {
      success: false,
      message: `Invalid artifact type: ${normalizedType}. Must be one of: ${ARTIFACT_TYPES.join(', ')}`,
    };
  }

  // Generate artifact ID and content hash
  const artifactId = generateArtifactId();
  const contentHash = createHash('sha256').update(content).digest('hex');

  // Check deduplication
  if (deps.config.dedupeEnabled && deps.dedupeStore.has(contentHash)) {
    const existing = deps.dedupeStore.getRecord(contentHash);
    return {
      success: true,
      message: 'Artifact already exists (deduplicated)',
      artifactId: existing?.ual ?? artifactId,
      ual: existing?.ual,
      dedupeStatus: 'deduplicated',
    };
  }

  // Build artifact record
  const now = new Date().toISOString();
  const artifact = {
    artifactId,
    artifactType: normalizedType,
    title: title ?? `Artifact ${artifactId.slice(-8)}`,
    content,
    contentHash,
    status: normalizedStatus,
    author: {
      id: deps.config.authorId,
      displayName: undefined,
    },
    agent: {
      id: deps.config.agentId,
      framework: 'claude-code',
      version: '1.0.0',
    },
    provenance: {
      source,
      sessionId: sessionId ?? 'unknown',
      conversationId,
      toolCalls,
      filePaths,
      workspaceProject,
      subAgentId,
      parentTaskId,
      agentRole,
      agentFramework: 'claude-code',
      createdAt: now,
      capturedAt: now,
      modifiedAt: undefined,
    },
    dkg: {
      contextGraph: deps.config.contextGraph,
      assertionName: deps.config.assertionName,
      memoryLayer: 'working-memory' as const,
    },
  };

  // Serialize to quads
  const quads = serializeToQuads(artifact);

  try {
    // Create or write assertion to DKG
    const receipt = await deps.client.createOrWriteAssertion({
      contextGraphId: deps.config.contextGraph,
      name: deps.config.assertionName,
      quads,
      assertionExists: deps.dedupeStore.isAssertionCreated(),
    });

    // Add to dedupe store
    deps.dedupeStore.add(contentHash, receipt.ual);
    await deps.dedupeStore.save();

    return {
      success: true,
      message: 'Artifact captured successfully',
      artifactId,
      ual: receipt.ual ?? artifactId,
      status: normalizedStatus,
      contentHash,
    };
  } catch (err: unknown) {
    if (err instanceof DkgUnavailableError) {
      return {
        success: false,
        message: `DKG unavailable: ${err.message}`,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to capture artifact: ${msg}`,
    };
  }
}
