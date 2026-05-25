/**
 * MCP (Model Context Protocol) configuration types for DKG Working Memory integration.
 *
 * Defines the McpConfig interface and all tool parameter interfaces for
 * capturing, searching, retrieving, and managing artifacts in DKG Working Memory.
 */

/**
 * MCP server configuration for DKG Working Memory integration.
 * Uses flat field structure (not nested like PluginConfig).
 */
export interface McpConfig {
  /** DKG daemon HTTP endpoint URL */
  daemonUrl: string;
  /** Path to auth token file or the token itself */
  authToken: string;
  /** Working memory context graph name */
  contextGraph: string;
  /** DKG assertion name for artifacts */
  assertionName: string;
  /** Local state directory for persistence */
  stateDir: string;
  /** Author identifier for artifacts */
  authorId: string;
  /** Agent identifier */
  agentId: string;
  /** Minimum content length threshold for capture */
  minContentLength: number;
  /** Whether to enable content redaction */
  redactionEnabled: boolean;
  /** Whether to enable deduplication */
  dedupeEnabled: boolean;
}

/** Parameters for the capture tool */
export interface CaptureParams {
  content: string;
  source: 'chat' | 'tool' | 'file' | 'manual' | 'api';
  artifactType?: string;
  title?: string;
  status?: string;
  sessionId?: string;
  conversationId?: string;
  toolCalls?: string[];
  filePaths?: string[];
  workspaceProject?: string;
  subAgentId?: string;
  parentTaskId?: string;
  agentRole?: string;
}

/** Parameters for the search tool */
export interface SearchParams {
  query: string;
  contextGraph?: string;
  artifactType?: string;
  status?: string;
  authorId?: string;
  agentId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

/** Parameters for the retrieve tool */
export interface RetrieveParams {
  artifactId: string;
  includeProvenance?: boolean;
  includeRawContent?: boolean;
}

/** Parameters for the updateStatus tool */
export interface UpdateStatusParams {
  artifactId: string;
  newStatus: string;
  reason?: string;
}

/** Parameters for the promote tool */
export interface PromoteParams {
  artifactId: string;
  targetContextGraph: string;
  confirm: boolean;
  reason?: string;
}

/** Parameters for the synthesize tool */
export interface SynthesizeParams {
  artifactIds: string[];
  outputTitle: string;
  outputType?: string;
  includeSources?: boolean;
}

/** Parameters for the sessionSummary tool */
export interface SessionSummaryParams {
  sessionId: string;
  contextGraph?: string;
  includeRawContent?: boolean;
}
