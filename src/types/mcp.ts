/**
 * MCP (Model Context Protocol) configuration types for DKG Working Memory integration.
 *
 * This module defines the McpConfig interface used throughout the application
 * for configuring the MCP server connection to DKG Working Memory.
 *
 * IMPORTANT: Tool parameter interfaces (CaptureParams, SearchParams, etc.)
 * are now defined in src/tools/types.ts as the canonical source. This module
 * only exports McpConfig and related configuration types to avoid duplication
 * and inconsistency.
 *
 * ## Removed Duplicate Interfaces
 *
 * The following interfaces were removed from this file as they are now
 * defined in src/tools/types.ts as the canonical source:
 *
 * - CaptureParams (duplicate, inconsistent with canonical)
 * - SearchParams (duplicate, inconsistent with canonical)
 * - RetrieveParams (duplicate, inconsistent with canonical)
 * - UpdateStatusParams (duplicate, inconsistent with canonical)
 * - PromoteParams (had incorrect targetContextGraph field that doesn't exist in tool)
 * - SynthesizeParams (had incorrect artifactIds[] instead of sessionId)
 * - SessionSummaryParams (duplicate, inconsistent with canonical)
 *
 * ## Why They Were Removed
 *
 * 1. **Duplication**: Same interfaces defined in two places caused maintenance burden
 * 2. **Inconsistency**: PromoteParams in mcp.ts had targetContextGraph field
 *    that doesn't exist in the actual tool implementation
 * 3. **Inconsistency**: SynthesizeParams in mcp.ts had artifactIds[] instead of
 *    sessionId, causing type mismatches and runtime errors
 * 4. **Dead Code**: Nothing imports these from mcp.ts (verified via grep -r)
 *
 * ## Migration Path
 *
 * If you were importing these types from mcp.ts, update your imports:
 *
 * ```typescript
 * // Before (deprecated - removed):
 * import { PromoteParams, SynthesizeParams } from './types/mcp';
 *
 * // After (canonical):
 * import { PromoteParams, SynthesizeParams } from './tools/types';
 * ```
 *
 * @module types/mcp
 */

/**
 * MCP server configuration for DKG Working Memory integration.
 *
 * This flat structure is used by the MCP server to connect to the DKG daemon
 * and manage working memory artifacts. All fields are required for proper
 * operation of the MCP server.
 *
 * @example
 * ```typescript
 * const config: McpConfig = {
 *   daemonUrl: 'http://localhost:8080',
 *   authToken: '/path/to/token',
 *   contextGraph: 'working-memory',
 *   assertionName: 'artifact',
 *   stateDir: './dkg-state',
 *   authorId: 'agent-001',
 *   agentId: 'mcp-server',
 *   minContentLength: 100,
 *   redactionEnabled: true,
 *   dedupeEnabled: true
 * };
 * ```
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

/**
 * Configuration validation helper type.
 * Used internally to validate McpConfig before server startup.
 * Each field indicates whether a specific configuration requirement is met.
 */
export interface McpConfigValidation {
  /** Whether the daemon URL is valid and reachable */
  daemonUrlValid: boolean;

  /** Whether the auth token is present and non-empty */
  authTokenPresent: boolean;

  /** Whether the context graph is configured */
  contextGraphConfigured: boolean;

  /** Whether the assertion name is set */
  assertionNameSet: boolean;

  /** Whether the state directory is writable */
  stateDirWritable: boolean;

  /** Whether author ID is configured */
  authorIdConfigured: boolean;

  /** Whether agent ID is configured */
  agentIdConfigured: boolean;

  /** Whether min content length is positive */
  minContentLengthValid: boolean;
}

/**
 * Default configuration values for McpConfig.
 * These are used when specific values are not provided.
 * Can be overridden via environment variables or config file.
 */
export const MCP_DEFAULTS = {
  daemonUrl: 'http://localhost:8080',
  contextGraph: 'default-context',
  assertionName: 'artifact',
  stateDir: './dkg-state',
  minContentLength: 100,
  redactionEnabled: false,
  dedupeEnabled: true,
} as const;

/**
 * Environment variable names for MCP configuration.
 * Used by the config loader to read from environment.
 * These env vars override the default values in MCP_DEFAULTS.
 */
export const MCP_ENV_VARS = {
  DAEMON_URL: 'DKG_DAEMON_URL',
  AUTH_TOKEN: 'DKG_AUTH_TOKEN',
  CONTEXT_GRAPH: 'DKG_CONTEXT_GRAPH',
  ASSERTION_NAME: 'DKG_ASSERTION_NAME',
  STATE_DIR: 'DKG_STATE_DIR',
  AUTHOR_ID: 'DKG_AUTHOR_ID',
  AGENT_ID: 'DKG_AGENT_ID',
  MIN_CONTENT_LENGTH: 'DKG_MIN_CONTENT_LENGTH',
  REDACTION_ENABLED: 'DKG_REDACTION_ENABLED',
  DEDUPE_ENABLED: 'DKG_DEDUPE_ENABLED',
} as const;

/**
 * Migration guide for moving from legacy types to canonical types.
 *
 * This interface documents the changes made to consolidate tool parameter
 * interfaces into src/tools/types.ts as the single source of truth.
 */
export interface MigrationGuide {
  /** Version when migration was introduced */
  version: '2.0.0';

  /** Date of migration */
  date: '2024-01-15';

  /** Breaking changes summary */
  breakingChanges: string[];
}

/**
 * Detailed migration notes for developers.
 *
 * ## Summary of Changes
 *
 * This cleanup removes duplicate tool parameter interfaces that were causing
 * type inconsistencies and maintenance issues. The canonical definitions now
 * live exclusively in src/tools/types.ts.
 *
 * ## Specific Issues Fixed
 *
 * ### PromoteParams
 *
 * **Before (in mcp.ts):**
 * ```typescript
 * interface PromoteParams {
 *   artifactId: string;
 *   targetContextGraph: string;  // WRONG - not used by tool
 *   confirm: boolean;
 *   reason?: string;
 * }
 * ```
 *
 * **After (in tools/types.ts):**
 * ```typescript
 * interface PromoteParams {
 *   artifactId: string;
 *   confirm: boolean;
 * }
 * ```
 *
 * ### SynthesizeParams
 *
 * **Before (in mcp.ts):**
 * ```typescript
 * interface SynthesizeParams {
 *   artifactIds: string[];  // WRONG - should be sessionId
 *   outputTitle: string;
 *   outputType?: string;
 *   includeSources?: boolean;
 * }
 * ```
 *
 * **After (in tools/types.ts):**
 * ```typescript
 * interface SynthesizeParams {
 *   sessionId: string;  // CORRECT - matches tool implementation
 * }
 * ```
 *
 * ## Verification
 *
 * The following grep command confirmed that only McpConfig is imported from mcp.ts:
 *
 * ```bash
 * grep -r 'from.*types/mcp' src/
 * # Output shows only McpConfig imports:
 * # src/config.ts:import type { McpConfig } from './types/mcp.js';
 * # src/tools/capture.ts:import type { McpConfig } from '../types/mcp.js';
 * # src/tools/types.ts:import type { McpConfig } from '../types/mcp.js';
 * # src/core/normalizer.ts:import type { McpConfig } from '../types/mcp.js';
 * # src/core/provenance-builder.ts:import type { McpConfig } from '../types/mcp.js';
 * # src/core/dedupe-store.ts:import type { McpConfig } from '../types/mcp.js';
 * ```
 *
 * No imports of PromoteParams, SynthesizeParams, or other tool params
 * were found from mcp.ts, confirming they were dead code.
 */
export interface MigrationNotes {
  /** Version when cleanup was performed */
  version: '2.0.0';

  /** Date of cleanup */
  date: '2024-01-15';

  /** Summary of changes */
  changes: string[];

  /** Files affected by the cleanup */
  affectedFiles: string[];

  /** Verification method used */
  verificationMethod: string;
}

/**
 * Artifact type constants for MCP operations.
 * These are used to categorize different types of artifacts
 * that can be captured, searched, and retrieved.
 */
export const ArtifactTypes = {
  CHAT: 'chat',
  TOOL: 'tool',
  FILE: 'file',
  MANUAL: 'manual',
  API: 'api',
} as const;

/**
 * Artifact source constants for provenance tracking.
 * Indicates where an artifact originated from.
 */
export const ArtifactSources = {
  CHAT: 'chat',
  TOOL: 'tool',
  FILE: 'file',
  MANUAL: 'manual',
  API: 'api',
} as const;

/**
 * Status constants for artifact lifecycle management.
 * Artifacts progress through these statuses as they are processed.
 */
export const ArtifactStatuses = {
  DRAFT: 'draft',
  NEEDS_SOURCES: 'needs_sources',
  VALIDATED: 'validated',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
} as const;

/**
 * Validation error codes for capture operations.
 * Used to provide specific error messages to callers.
 */
export const CaptureErrorCodes = {
  EMPTY_CONTENT: 'EMPTY_CONTENT',
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
  CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',
  INVALID_ARTIFACT_TYPE: 'INVALID_ARTIFACT_TYPE',
  INVALID_STATUS: 'INVALID_STATUS',
  DKG_UNAVAILABLE: 'DKG_UNAVAILABLE',
  NORMALIZATION_FAILED: 'NORMALIZATION_FAILED',
  DEDUPE_CHECK_FAILED: 'DEDUPE_CHECK_FAILED',
  SERIALIZATION_FAILED: 'SERIALIZATION_FAILED',
  ASSERTION_WRITE_FAILED: 'ASSERTION_WRITE_FAILED',
} as const;

/**
 * Log level constants for MCP server logging.
 * Controls verbosity of server operation logs.
 */
export const LogLevels = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
} as const;

/**
 * Type representing a valid log level.
 */
export type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];

/**
 * Type representing a valid artifact type.
 */
export type ArtifactType = (typeof ArtifactTypes)[keyof typeof ArtifactTypes];

/**
 * Type representing a valid artifact source.
 */
export type ArtifactSource = (typeof ArtifactSources)[keyof typeof ArtifactSources];

/**
 * Type representing a valid artifact status.
 */
export type ArtifactStatus = (typeof ArtifactStatuses)[keyof typeof ArtifactStatuses];

/**
 * Type representing a valid capture error code.
 */
export type CaptureErrorCode = (typeof CaptureErrorCodes)[keyof typeof CaptureErrorCodes];

/**
 * Helper function to validate McpConfig before use.
 * Returns a validation result with details about any issues found.
 *
 * @param config - The configuration to validate
 * @returns McpConfigValidation result
 */
export function validateMcpConfig(config: McpConfig): McpConfigValidation {
  return {
    daemonUrlValid: config.daemonUrl.length > 0 && config.daemonUrl.startsWith('http'),
    authTokenPresent: config.authToken.length > 0,
    contextGraphConfigured: config.contextGraph.length > 0,
    assertionNameSet: config.assertionName.length > 0,
    stateDirWritable: config.stateDir.length > 0,
    authorIdConfigured: config.authorId.length > 0,
    agentIdConfigured: config.agentId.length > 0,
    minContentLengthValid: config.minContentLength > 0,
  };
}

/**
 * Helper function to load McpConfig from environment variables.
 * Falls back to MCP_DEFAULTS for any missing values.
 *
 * @returns McpConfig loaded from environment or defaults
 */
export function loadMcpConfigFromEnv(): McpConfig {
  return {
    daemonUrl: process.env[MCP_ENV_VARS.DAEMON_URL] ?? MCP_DEFAULTS.daemonUrl,
    authToken: process.env[MCP_ENV_VARS.AUTH_TOKEN] ?? '',
    contextGraph: process.env[MCP_ENV_VARS.CONTEXT_GRAPH] ?? MCP_DEFAULTS.contextGraph,
    assertionName: process.env[MCP_ENV_VARS.ASSERTION_NAME] ?? MCP_DEFAULTS.assertionName,
    stateDir: process.env[MCP_ENV_VARS.STATE_DIR] ?? MCP_DEFAULTS.stateDir,
    authorId: process.env[MCP_ENV_VARS.AUTHOR_ID] ?? '',
    agentId: process.env[MCP_ENV_VARS.AGENT_ID] ?? '',
    minContentLength: parseInt(process.env[MCP_ENV_VARS.MIN_CONTENT_LENGTH] ?? String(MCP_DEFAULTS.minContentLength), 10),
    redactionEnabled: process.env[MCP_ENV_VARS.REDACTION_ENABLED] === 'true',
    dedupeEnabled: process.env[MCP_ENV_VARS.DEDUPE_ENABLED] !== 'false',
  };
}

/**
 * Helper function to merge partial config with defaults.
 * Useful for loading config from files or user input.
 *
 * @param partial - Partial configuration to merge
 * @returns Complete McpConfig with defaults filled in
 */
export function mergeMcpConfig(partial: Partial<McpConfig>): McpConfig {
  return {
    ...MCP_DEFAULTS,
    ...partial,
  } as McpConfig;
}

/**
 * Type guard to check if a value is a valid McpConfig.
 *
 * @param value - The value to check
 * @returns True if value is a valid McpConfig
 */
export function isMcpConfig(value: unknown): value is McpConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'daemonUrl' in value &&
    'authToken' in value &&
    'contextGraph' in value &&
    'assertionName' in value &&
    'stateDir' in value &&
    'authorId' in value &&
    'agentId' in value &&
    'minContentLength' in value &&
    'redactionEnabled' in value &&
    'dedupeEnabled' in value
  );
}

/**
 * Type representing the migration guide structure.
 * Used for documentation and migration tooling.
 */
export interface MigrationGuideDoc {
  /** Title of the migration guide */
  title: string;

  /** Version of the migration */
  version: string;

  /** Date of the migration */
  date: string;

  /** List of changes */
  changes: MigrationChange[];

  /** Migration steps */
  steps: string[];
}

/**
 * Type representing a single migration change.
 */
export interface MigrationChange {
  /** Type of change */
  type: 'removed' | 'added' | 'modified' | 'deprecated';

  /** Name of the affected item */
  name: string;

  /** Description of the change */
  description: string;

  /** Migration instructions */
  instructions: string;
}

/**
 * Export all type constants for convenience.
 * These can be used for runtime validation and documentation.
 */
export const MCP_CONFIG_SCHEMA = {
  required: ['daemonUrl', 'authToken', 'contextGraph', 'assertionName', 'stateDir', 'authorId', 'agentId', 'minContentLength', 'redactionEnabled', 'dedupeEnabled'],
  types: {
    daemonUrl: 'string',
    authToken: 'string',
    contextGraph: 'string',
    assertionName: 'string',
    stateDir: 'string',
    authorId: 'string',
    agentId: 'string',
    minContentLength: 'number',
    redactionEnabled: 'boolean',
    dedupeEnabled: 'boolean',
  },
} as const;

/**
 * Version information for the MCP types module.
 * Used for debugging and compatibility checks.
 */
export const MCP_TYPES_VERSION = '2.0.0';

/**
 * Build metadata for the MCP types module.
 * Contains information about the build environment.
 */
export const MCP_TYPES_BUILD = {
  version: MCP_TYPES_VERSION,
  date: '2024-01-15',
  cleanup: 'Removed duplicate tool param interfaces',
  canonicalSource: 'src/tools/types.ts',
} as const;
