/**
 * Capture tool — creates new artifacts in DKG Working Memory.
 *
 * This module provides functionality for capturing various types of artifacts
 * including chat conversations, file contents, tool outputs, and research notes.
 *
 * Artifact ID Generation:
 * - BEFORE: Random IDs like 'urn:artifact:{random-hash}' (non-deterministic)
 * - AFTER: Content-addressable IDs like 'urn:dkg:wm:{sha256-prefix}' (deterministic)
 *
 * The refactoring replaces inline normalization logic with calls to
 * normalizeArtifact() from core/normalizer.ts, ensuring consistent artifact
 * ID generation based on content hash.
 *
 * Key Changes:
 * 1. Removed generateArtifactId() - now uses normalizeArtifact() output
 * 2. Removed inline normalizeArtifact() - now imports from core/normalizer.ts
 * 3. Deduplication now uses contentHash from normalized artifact
 * 4. ArtifactRecord structure is now fully populated by normalizer
 * 5. Added derivedFrom support for provenance chains
 *
 * @module capture
 */

import type { ToolDeps, ToolResult, CaptureParams } from './types.js';
import type { RawCaptureInput } from '../types/artifact.js';
import type { McpConfig } from '../types/mcp.js';
import { normalizeArtifact } from '../core/normalizer.js';
import { serializeToQuadsWithDerivedFrom } from '../core/serializers.js';
import { DkgUnavailableError } from '../core/dkg-client.js';

/**
 * Validation result for capture parameters.
 */
interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Sub-agent context for provenance tracking.
 */
interface SubAgentContext {
  subAgentId: string;
  parentTaskId?: string;
  agentRole?: string;
}

/**
 * Maximum content length in bytes (500 KB).
 * This limit is enforced by the normalizer to keep DKG payloads reasonable.
 */
const MAX_CONTENT_LENGTH = 500_000;

/**
 * Minimum artifact ID length for content-addressable IDs.
 */
const MIN_ARTIFACT_ID_LENGTH = 8;

/**
 * Build the sub-agent context from capture parameters.
 * This context is passed to the normalizer for provenance tracking.
 *
 * @param params - The capture parameters
 * @returns SubAgentContext or undefined if not applicable
 */
function buildSubAgentContext(params: CaptureParams): SubAgentContext | undefined {
  const { subAgentId, parentTaskId, agentRole } = params;

  if (!subAgentId) {
    return undefined;
  }

  return {
    subAgentId,
    parentTaskId,
    agentRole,
  };
}

/**
 * Build the raw capture input for normalization.
 * This transforms the capture parameters into the format expected by
 * normalizeArtifact() from core/normalizer.ts.
 *
 * @param params - The capture parameters
 * @returns RawCaptureInput object for normalizeArtifact
 */
function buildRawCaptureInput(params: CaptureParams): RawCaptureInput {
  const {
    content,
    artifactType,
    title,
    status,
    sensitivity,
    sessionId,
    conversationId,
    toolCalls,
    filePaths,
    workspaceProject,
    subAgentId,
    parentTaskId,
    agentRole,
    source = 'tool'
  } = params;

  return {
    content,
    artifactType,
    title,
    status,
    sensitivity,
    source,
    sessionId,
    conversationId,
    toolCalls,
    filePaths,
    workspaceProject,
    subAgentId,
    parentTaskId,
    agentRole,
  };
}

/**
 * Validate capture parameters before processing.
 * Performs basic validation that doesn't require the normalizer.
 *
 * @param params - The capture parameters to validate
 * @param config - The MCP configuration
 * @returns Validation result with success status and error message if any
 */
function validateCaptureParams(params: CaptureParams, config: McpConfig): ValidationResult {
  const { content } = params;

  // Check for empty content
  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      message: 'Content cannot be empty',
    };
  }

  // Check minimum content length
  if (content.length < config.minContentLength) {
    return {
      valid: false,
      message: `Content too short (min ${config.minContentLength} chars, got ${content.length})`,
    };
  }

  // Check maximum content length (500 KB limit from normalizer)
  if (content.length > MAX_CONTENT_LENGTH) {
    return {
      valid: false,
      message: `Content too long (max ${MAX_CONTENT_LENGTH} chars, got ${content.length})`,
    };
  }

  return { valid: true };
}

/**
 * Format artifact ID for display purposes.
 * Truncates long IDs for readability while preserving uniqueness.
 *
 * @param artifactId - The full artifact ID
 * @returns Formatted artifact ID
 */
function formatArtifactId(artifactId: string): string {
  if (artifactId.length <= MIN_ARTIFACT_ID_LENGTH) {
    return artifactId;
  }
  return `${artifactId.slice(0, 16)}...${artifactId.slice(-8)}`;
}

/**
 * Log capture event for debugging and monitoring.
 *
 * @param params - The capture parameters
 * @param result - The capture result
 * @param durationMs - Duration of the capture operation in milliseconds
 */
function logCaptureEvent(
  params: CaptureParams,
  result: ToolResult,
  durationMs: number
): void {
  const { content } = params;
  const contentPreview = content?.slice(0, 50) || '';
  const artifactId = typeof result.artifactId === 'string' ? result.artifactId : 'N/A';
  // eslint-disable-next-line no-console
  console.log(`[Capture] ${result.success ? 'SUCCESS' : 'FAILED'} - ${formatArtifactId(artifactId)} - ${durationMs}ms - "${contentPreview}..."`);
}

/**
 * Handle capture tool invocation.
 *
 * This is the main entry point for artifact capture. It:
 * 1. Validates input parameters
 * 2. Builds raw capture input for normalization
 * 3. Calls normalizeArtifact() to generate content-addressable artifact
 * 4. Checks deduplication using the contentHash from normalization
 * 5. Serializes and writes to DKG (including derivedFrom if provided)
 * 6. Updates dedupe store with the new artifact
 *
 * @param params - The capture parameters
 * @param deps - Tool dependencies including DKG client and config
 * @returns ToolResult with success status and artifact details
 */
export async function handleCapture(
  params: CaptureParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    // Step 1: Validate input parameters
    const validation = validateCaptureParams(params, deps.config);
    if (!validation.valid) {
      const result: ToolResult = {
        success: false,
        /* c8 ignore next -- validateCaptureParams always sets message */
        message: validation.message || 'Validation failed',
      };
      logCaptureEvent(params, result, Date.now() - startTime);
      return result;
    }

    // Step 2: Build raw capture input for normalization
    const rawInput = buildRawCaptureInput(params);

    // Step 3: Build sub-agent context if available
    const subAgentContext = buildSubAgentContext(params);

    // Step 4: Normalize artifact using the shared normalizer
    // This generates content-addressable IDs: urn:dkg:wm:{sha256-prefix}
    // The normalizer handles:
    // - Content redaction (if enabled in config)
    // - Content hash generation (SHA-256 of redacted content)
    // - Artifact ID generation (deterministic based on content hash)
    // - Type inference (from artifactType or source)
    // - Status classification (draft, needs_sources, validated, etc.)
    // - Provenance building (session, conversation, tool calls, etc.)
    const artifactRecord = normalizeArtifact(rawInput, deps.config, subAgentContext);

    /* c8 ignore next 7 -- normalizeArtifact only returns null for content that passed earlier guards */
    if (!artifactRecord) {
      const result: ToolResult = {
        success: false,
        message: 'Failed to normalize artifact (content validation failed)',
      };
      logCaptureEvent(params, result, Date.now() - startTime);
      return result;
    }

    // Step 5: Use the contentHash from the normalized artifact for deduplication
    // This ensures we use the same hash that was used to generate the artifact ID
    const contentHash = artifactRecord.contentHash;

    // Step 6: Check deduplication using the proper contentHash
    // If the same content was already captured, return the existing artifact ID
    if (deps.config.dedupeEnabled && deps.dedupeStore.has(contentHash)) {
      const existing = deps.dedupeStore.getRecord(contentHash);
      const result: ToolResult = {
        success: true,
        message: 'Artifact already exists (deduplicated)',
        artifactId: existing?.ual ?? artifactRecord.artifactId,
        ual: existing?.ual,
        dedupeStatus: 'deduplicated',
      };
      logCaptureEvent(params, result, Date.now() - startTime);
      return result;
    }

    // Step 7: Serialize artifact record to RDF quads for DKG storage
    // Include derivedFrom if provided in params for provenance chains
    const quads = serializeToQuadsWithDerivedFrom(artifactRecord, params.derivedFrom);

    // Step 8: Create or write assertion to DKG using the normalized artifact
    // The DKG will store the artifact with its content-addressable ID
    const receipt = await deps.client.createOrWriteAssertion({
      contextGraphId: deps.config.contextGraph,
      name: deps.config.assertionName,
      quads,
      assertionExists: deps.dedupeStore.isAssertionCreated(),
    });

    // Step 9: Add to dedupe store using the contentHash from normalizeArtifact
    // This ensures future captures of the same content will be deduplicated
    deps.dedupeStore.add(contentHash, receipt.ual);
    await deps.dedupeStore.save();

    // Step 10: Return success with artifact details
    // The artifactId is now deterministic: urn:dkg:wm:{sha256-prefix}
    const result: ToolResult = {
      success: true,
      message: 'Artifact captured successfully',
      artifactId: artifactRecord.artifactId,
      ual: receipt.ual ?? artifactRecord.artifactId,
      status: artifactRecord.status,
      contentHash,
      derivedFrom: params.derivedFrom,
    };
    logCaptureEvent(params, result, Date.now() - startTime);
    return result;
  } catch (err: unknown) {
    // Handle DKG-specific errors
    if (err instanceof DkgUnavailableError) {
      const result: ToolResult = {
        success: false,
        message: `DKG unavailable: ${err.message}`,
      };
      logCaptureEvent(params, result, Date.now() - startTime);
      return result;
    }

    // Handle generic errors
    const msg = err instanceof Error ? err.message : String(err);
    const result: ToolResult = {
      success: false,
      message: `Failed to capture artifact: ${msg}`,
    };
    logCaptureEvent(params, result, Date.now() - startTime);
    return result;
  }
}

/**
 * Export the handleCapture function as the default export.
 * This allows the module to be imported as either:
 * - import { handleCapture } from './capture.js'
 * - import capture from './capture.js'
 */
export default handleCapture;
