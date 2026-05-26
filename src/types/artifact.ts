/**
 * Artifact type definitions for DKG Working Memory.
 *
 * Extended to 14 types including competitive_analysis, knowledge_synthesis, raw_capture.
 */

export type ArtifactType =
  | 'chat'
  | 'research_note'
  | 'code_analysis'
  | 'markdown'
  | 'plan'
  | 'summary'
  | 'design_note'
  | 'implementation_log'
  | 'vulnerability_finding'
  | 'audit_note'
  | 'competitive_analysis'
  | 'knowledge_synthesis'
  | 'raw_capture'
  | 'other';

export const ARTIFACT_TYPES: ArtifactType[] = [
  'chat',
  'research_note',
  'code_analysis',
  'markdown',
  'plan',
  'summary',
  'design_note',
  'implementation_log',
  'vulnerability_finding',
  'audit_note',
  'competitive_analysis',
  'knowledge_synthesis',
  'raw_capture',
  'other',
];

export type ArtifactStatus =
  | 'draft'
  | 'needs_sources'
  | 'review_needed'
  | 'validated'
  | 'ready_to_share'
  | 'deprecated'
  | 'discarded';

export const ARTIFACT_STATUSES: ArtifactStatus[] = [
  'draft',
  'needs_sources',
  'review_needed',
  'validated',
  'ready_to_share',
  'deprecated',
  'discarded',
];

/**
 * Sensitivity levels for artifact access control.
 * Maps to schema.org accessMode for RDF serialization.
 */
export type SensitivityLevel = 'public' | 'internal' | 'confidential';

export const SENSITIVITY_LEVELS: SensitivityLevel[] = [
  'public',
  'internal',
  'confidential',
];

/**
 * Provenance record with sub-agent tracking fields.
 */
export interface ProvenanceRecord {
  source: 'chat' | 'tool' | 'file' | 'manual' | 'api';
  sessionId?: string;
  conversationId?: string;
  toolCalls?: string[];
  filePaths?: string[];
  workspaceProject?: string;
  subAgentId?: string;
  parentTaskId?: string;
  agentRole?: string;
  agentFramework: string;
  createdAt: string;
  capturedAt: string;
  modifiedAt?: string;
}

export interface DkgReceipt {
  contextGraph: string;
  assertionName: string;
  memoryLayer: 'working-memory';
  ual?: string;
  writeReceipt?: unknown;
}

export interface ArtifactRecord {
  artifactId: string;
  artifactType: ArtifactType;
  title: string;
  content: string;
  contentHash: string;
  status: ArtifactStatus;
  sensitivity?: SensitivityLevel;
  author: { id: string; displayName?: string };
  agent: { id: string; framework: string; version: string };
  provenance: ProvenanceRecord;
  dkg: DkgReceipt;
}

/**
 * Capture parameters for creating artifacts.
 * Includes optional derivedFrom for tracking artifact provenance chains.
 */
export interface CaptureParams {
  content: string;
  source: 'chat' | 'tool' | 'file' | 'manual' | 'api';
  artifactType?: ArtifactType;
  title?: string;
  status?: ArtifactStatus;
  sensitivity?: SensitivityLevel;
  sessionId?: string;
  conversationId?: string;
  toolCalls?: string[];
  filePaths?: string[];
  workspaceProject?: string;
  subAgentId?: string;
  parentTaskId?: string;
  agentRole?: string;
  /** Optional array of artifact IDs this artifact was derived from */
  derivedFrom?: string[];
}

/**
 * Raw input for artifact capture, passed to normalizeArtifact().
 * Internal pipeline type — does not include sensitivity or derivedFrom.
 */
export interface RawCaptureInput {
  content: string;
  source: 'chat' | 'tool' | 'file' | 'manual' | 'api';
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
}

/** Legacy PluginConfig - deprecated, use McpConfig instead */
export interface PluginConfig {
  daemonUrl: string;
  authTokenPath: string;
  enabled: boolean;
  contextGraph: string;
  assertionName: string;
  authorId: string;
  agentId: string;
  capture: {
    autoCapture: boolean;
    chat: boolean;
    files: boolean;
    toolOutputs: boolean;
    minContentLength: number;
    skipPatterns: string[];
  };
  redaction: { enabled: boolean };
  dedupe: { enabled: boolean; strategy: 'contentHash' };
  stateDir: string;
}
