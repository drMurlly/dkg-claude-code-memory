/**
 * Provenance builder — generates content hashes, artifact IDs, and provenance records
 * for captured artifacts.
 */

import { createHash } from 'node:crypto';
import type { ProvenanceRecord, RawCaptureInput } from '../types/artifact.js';
import type { McpConfig } from '../types/mcp.js';

export interface SubAgentContext {
  subAgentId?: string;
  parentTaskId?: string;
  agentRole?: string;
}

export interface ProvenanceResult {
  contentHash: string;
  artifactId: string;
  provenance: ProvenanceRecord;
}

export function buildProvenance(
  content: string,
  raw: RawCaptureInput,
  _config: McpConfig,
  subAgentContext?: SubAgentContext,
): ProvenanceResult {
  const hex = createHash('sha256').update(content, 'utf8').digest('hex');
  const contentHash = `sha256:${hex}`;
  const artifactId = `urn:dkg:wm:${hex.slice(0, 16)}`;
  const now = new Date().toISOString();

  const provenance: ProvenanceRecord = {
    source: raw.source,
    sessionId: raw.sessionId ?? 'unknown',
    conversationId: raw.conversationId,
    toolCalls: raw.toolCalls,
    filePaths: raw.filePaths,
    workspaceProject: raw.workspaceProject,
    subAgentId: subAgentContext?.subAgentId ?? raw.subAgentId,
    parentTaskId: subAgentContext?.parentTaskId ?? raw.parentTaskId,
    agentRole: subAgentContext?.agentRole ?? raw.agentRole,
    agentFramework: 'claude-code',
    createdAt: now,
    capturedAt: now,
  };

  return { contentHash, artifactId, provenance };
}
