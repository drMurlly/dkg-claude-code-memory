/**
 * Tool types and interfaces for MCP server.
 */

import type { DkgClient } from '../core/dkg-client.js';
import type { DedupeStore } from '../core/dedupe-store.js';
import type { McpConfig } from '../types/mcp.js';
import type { ArtifactType, ArtifactStatus } from '../types/artifact.js';

/**
 * Dependencies injected into all tool handlers.
 */
export interface ToolDeps {
  client: DkgClient;
  dedupeStore: DedupeStore;
  config: McpConfig;
}

/**
 * Standard result type for all tool handlers.
 */
export interface ToolResult {
  success: boolean;
  message: string;
  [key: string]: unknown;
}

/**
 * Parameters for capture tool.
 */
export interface CaptureParams {
  content: string;
  artifactType?: ArtifactType;
  title?: string;
  status?: ArtifactStatus;
  sessionId?: string;
  conversationId?: string;
  toolCalls?: string[];
  filePaths?: string[];
  workspaceProject?: string;
  subAgentId?: string;
  parentTaskId?: string;
  agentRole?: string;
  source?: 'chat' | 'tool' | 'file' | 'manual' | 'api';
  /** Optional array of artifact URNs this artifact was derived from */
  derivedFrom?: string[];
}

/**
 * Parameters for search tool.
 */
export interface SearchParams {
  status?: ArtifactStatus;
  type?: ArtifactType;
  keyword?: string;
  sessionId?: string;
  limit?: number;
  /** Optional artifact URN to filter results to artifacts derived from this source */
  derivedFromId?: string;
}

/**
 * Parameters for retrieve tool.
 */
export interface RetrieveParams {
  artifactId: string;
}

/**
 * Parameters for update-status tool.
 */
export interface UpdateStatusParams {
  artifactId: string;
  newStatus: ArtifactStatus;
}

/**
 * Parameters for promote tool.
 */
export interface PromoteParams {
  artifactId: string;
  confirm: boolean;
}

/**
 * Parameters for synthesize tool.
 */
export interface SynthesizeParams {
  sessionId: string;
  title?: string;
}

/**
 * Parameters for session-summary tool.
 */
export interface SessionSummaryParams {
  sessionId?: string;
}
