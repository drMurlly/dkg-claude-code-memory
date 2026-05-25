/**
 * Configuration loader for DKG Working Memory MCP server.
 *
 * Reads McpConfig from environment variables with sensible defaults.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { McpConfig } from './types/mcp.js';

const DEFAULT_DAEMON_URL = 'http://127.0.0.1:9200';
const DEFAULT_CONTEXT_GRAPH = 'ccm-research';
const DEFAULT_ASSERTION_NAME = 'artifacts';
const DEFAULT_STATE_DIR = join(homedir(), '.dkg', 'ccm-state');
const DEFAULT_AUTHOR_ID = 'unknown';
const DEFAULT_AGENT_ID = 'claude-code-agent';
const DEFAULT_MIN_LENGTH = 80;
const DEFAULT_REDACTION = true;
const DEFAULT_DEDUPE = true;

/**
 * Load auth token from environment or fallback file.
 */
async function loadAuthToken(): Promise<string> {
  const envToken = process.env.DKG_AUTH_TOKEN;
  if (envToken) {
    return envToken;
  }

  const fallbackPath = join(homedir(), '.dkg', 'auth.token');
  try {
    const token = await readFile(fallbackPath, 'utf-8');
    return token.trim();
  } catch {
    throw new Error(
      'DKG_AUTH_TOKEN environment variable not set and ~/.dkg/auth.token not found'
    );
  }
}

/**
 * Parse boolean from environment variable string.
 */
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const lower = value.toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return defaultValue;
}

/**
 * Parse number from environment variable string.
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load McpConfig from environment variables.
 */
export async function loadMcpConfig(): Promise<McpConfig> {
  const authToken = await loadAuthToken();

  return {
    daemonUrl: process.env.DKG_DAEMON_URL ?? DEFAULT_DAEMON_URL,
    authToken,
    contextGraph: process.env.DKG_WM_CONTEXT_GRAPH ?? DEFAULT_CONTEXT_GRAPH,
    assertionName: process.env.DKG_WM_ASSERTION_NAME ?? DEFAULT_ASSERTION_NAME,
    stateDir: process.env.DKG_CCM_STATE_DIR ?? DEFAULT_STATE_DIR,
    authorId: process.env.DKG_WM_AUTHOR_ID ?? DEFAULT_AUTHOR_ID,
    agentId: process.env.DKG_WM_AGENT_ID ?? DEFAULT_AGENT_ID,
    minContentLength: parseNumber(process.env.DKG_WM_MIN_LENGTH, DEFAULT_MIN_LENGTH),
    redactionEnabled: parseBool(process.env.DKG_WM_REDACTION, DEFAULT_REDACTION),
    dedupeEnabled: parseBool(process.env.DKG_WM_DEDUPE, DEFAULT_DEDUPE),
  };
}

/**
 * Get config value for a specific key (for testing).
 */
export function getConfigEnv(key: string): string | undefined {
  return process.env[key];
}
