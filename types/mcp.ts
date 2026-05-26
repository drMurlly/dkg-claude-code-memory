/**
 * MCP (Model Context Protocol) configuration types for DKG Working Memory integration.
 *
 * This is a re-export module that points to the canonical types in src/types/mcp.ts.
 * It exists for backward compatibility with imports that use the types/ prefix.
 *
 * @module types/mcp
 */

export type { McpConfig } from '../src/types/mcp.js';

/**
 * Legacy type aliases for backward compatibility.
 * These are deprecated and will be removed in a future version.
 * Use the canonical types from src/tools/types.ts instead.
 */
export type {
  LegacyCaptureParams,
  LegacySearchParams,
  LegacyRetrieveParams,
  LegacyUpdateStatusParams,
  LegacyPromoteParams,
  LegacySynthesizeParams,
  LegacySessionSummaryParams,
} from '../src/types/mcp.js';

/**
 * Configuration validation helper type.
 */
export type { McpConfigValidation } from '../src/types/mcp.js';

/**
 * Default configuration values for McpConfig.
 */
export { MCP_DEFAULTS } from '../src/types/mcp.js';

/**
 * Environment variable names for MCP configuration.
 */
export { MCP_ENV_VARS } from '../src/types/mcp.js';

/**
 * Migration guide for moving from legacy types to canonical types.
 */
export type { MigrationGuide } from '../src/types/mcp.js';
