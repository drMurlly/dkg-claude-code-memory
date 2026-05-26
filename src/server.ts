/**
 * MCP Server — Glue layer that registers all 8 tools with the MCP SDK
 * and connects via stdio transport.
 *
 * Exports `startServer()` for the CLI entry point (src/index.ts).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';

import { loadMcpConfig } from './config.js';
import { DkgClient } from './core/dkg-client.js';
import { DedupeStore } from './core/dedupe-store.js';
import { handleCapture } from './tools/capture.js';
import { handleSearch } from './tools/search.js';
import { handleRetrieve } from './tools/retrieve.js';
import { handleUpdateStatus } from './tools/update-status.js';
import { handlePromote } from './tools/promote.js';
import { handleSynthesize } from './tools/synthesize.js';
import { handleSessionSummary } from './tools/session-summary.js';
import { handleQuerySharedMemory } from './tools/query-shared-memory.js';
import { ARTIFACT_TYPES, ARTIFACT_STATUSES } from './types/artifact.js';
import type {
  CaptureParams,
  SearchParams,
  RetrieveParams,
  UpdateStatusParams,
  PromoteParams,
  SynthesizeParams,
  SessionSummaryParams,
  ToolDeps,
} from './tools/types.js';
import type { QuerySharedMemoryParams } from './tools/query-shared-memory.js';

// ── Session ID ────────────────────────────────────────────────────────────────
// Unique per server process lifetime (one Claude Code session = one server process)
const SESSION_ID = `ccm-${randomUUID().slice(0, 8)}`;

// ── Tool Definitions ───────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'capture_research_finding',
    description:
      'Deposit a research artifact into DKG v10 Working Memory with provenance and a status tag. ' +
      'Call this after completing any significant analysis, finding, or decision. ' +
      'Supports sub-agent attribution via parentTaskId and subAgentId.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Full text of the artifact to store' },
        type: { type: 'string', enum: ARTIFACT_TYPES, description: 'Artifact type classification' },
        title: { type: 'string', description: 'Short title (auto-generated if omitted)' },
        status: { type: 'string', enum: ARTIFACT_STATUSES, description: 'Override status classification' },
        sessionId: { type: 'string', description: `Current session ID. Default: ${SESSION_ID}` },
        parentTaskId: { type: 'string', description: 'Parent session/task ID (for sub-agent attribution)' },
        subAgentId: { type: 'string', description: 'Sub-agent identifier (for sub-agent attribution)' },
        agentRole: { type: 'string', description: 'Role of the agent producing this artifact' },
      },
      required: ['content', 'type'],
    },
  },
  {
    name: 'search_working_memory',
    description:
      'Search past artifacts in Working Memory by keyword, type, status, or session. ' +
      'Call this at the START of any research task to avoid duplicating prior work.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Keyword to search for in artifact content/title' },
        type: { type: 'string', enum: ARTIFACT_TYPES, description: 'Filter by artifact type' },
        status: { type: 'string', enum: ARTIFACT_STATUSES, description: 'Filter by status' },
        sessionId: { type: 'string', description: 'Filter by session ID' },
        limit: { type: 'number', description: 'Maximum results to return (default 20)' },
      },
    },
  },
  {
    name: 'retrieve_artifact',
    description: 'Retrieve a single artifact by its artifactId, including full content and provenance metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'The artifact ID to retrieve' },
      },
      required: ['artifactId'],
    },
  },
  {
    name: 'update_artifact_status',
    description:
      'Update the status of an existing artifact. ' +
      'Progression: draft → needs_sources → review_needed → validated → ready_to_share. ' +
      'Also supports deprecation: deprecated, discarded.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'The artifact ID to update' },
        newStatus: { type: 'string', enum: ARTIFACT_STATUSES, description: 'New status value' },
      },
      required: ['artifactId', 'newStatus'],
    },
  },
  {
    name: 'promote_to_shared_memory',
    description:
      'Promote an artifact from Working Memory to Shared Memory. ' +
      'Requires explicit user confirmation (confirm=true). Never call autonomously.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'The artifact ID to promote' },
        confirm: { type: 'boolean', description: 'Must be true to proceed. User must explicitly confirm.' },
      },
      required: ['artifactId', 'confirm'],
    },
  },
  {
    name: 'synthesize_session',
    description:
      'Synthesize all artifacts from a session into a structured summary. ' +
      'Call at the end of a complex research session to produce a consolidated report.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to synthesize' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_session_summary',
    description:
      'Get a summary of what has been captured in the current or a past session. ' +
      'Useful for checking session state before starting new work.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to summarize (defaults to current session)' },
      },
    },
  },
  {
    name: 'query_shared_memory',
    description:
      'Execute custom SPARQL queries against Shared Memory (schema:DigitalDocument artifacts). ' +
      'Use for complex provenance analysis, tracing knowledge chains, or advanced graph queries. ' +
      'Returns matching UALs with title, snippet, and capturedAt timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SPARQL FILTER clause or pattern to match (required)' },
        limit: { type: 'number', description: 'Maximum results to return (default 10, max 100)' },
      },
      required: ['query'],
    },
  },
];

// ── System Prompt Builder ──────────────────────────────────────────────────────

function buildSystemPrompt(sessionId: string): string {
  return `You are integrated with DKG Research Memory. Your research artifacts persist across sessions through the DKG v10 graph.

## When to use each tool

**capture_research_finding** — Call after completing any significant analysis, finding, or decision.
Examples:
- After analyzing a smart contract for vulnerabilities
- After researching a topic or protocol
- After reaching an architectural decision
- After completing a code review

Always set sessionId to "${sessionId}" unless you are a sub-agent with a specific parentTaskId.

**search_working_memory** — Call at the START of any research task.
Examples:
- "Before I audit this contract, search my memory for similar vulnerability patterns"
- "Search for any prior analysis of this protocol"

**query_shared_memory** — For complex SPARQL queries across shared DigitalDocument artifacts.
Use when you need to:
- Trace provenance chains across multiple documents
- Query with custom SPARQL patterns
- Find related knowledge in the shared graph

**update_artifact_status** — Promote findings as your confidence grows.
Progression: draft → needs_sources → review_needed → validated → ready_to_share

**promote_to_shared_memory** — ONLY when the user explicitly asks to share findings with their team.
You MUST ask for confirmation before calling this. Never call it autonomously.

**synthesize_session** — At the end of a complex research sessions, synthesize all findings into a structured summary.

**get_session_summary** — To see what has been captured in the current or a past session.

## Sub-agent attribution

If you are a sub-agent spawned by a parent Claude Code session, use:
- parentTaskId: the parent sessions's ID
- subAgentId: a unique identifier for yourself
- agentRole: your role (e.g., "reentrancy-analyzer", "access-control-reviewer")

This creates a verifiable provenance chain across the full agent hierarchy.`;
}

// ── Tool Handler Router ────────────────────────────────────────────────────────

async function routeToolCall(
  name: string,
  params: Record<string, unknown>,
  deps: ToolDeps,
): Promise<{ success: boolean; message: string; [key: string]: unknown }> {
  switch (name) {
    case 'capture_research_finding':
      return await handleCapture(params as unknown as CaptureParams, deps);
    case 'search_working_memory':
      return await handleSearch(params as unknown as SearchParams, deps);
    case 'retrieve_artifact':
      return await handleRetrieve(params as unknown as RetrieveParams, deps);
    case 'update_artifact_status':
      return await handleUpdateStatus(params as unknown as UpdateStatusParams, deps);
    case 'promote_to_shared_memory':
      return await handlePromote(params as unknown as PromoteParams, deps);
    case 'synthesize_session':
      return await handleSynthesize(params as unknown as SynthesizeParams, deps);
    case 'get_session_summary':
      return await handleSessionSummary(params as unknown as SessionSummaryParams, deps);
    case 'query_shared_memory':
      return await handleQuerySharedMemory(params as unknown as QuerySharedMemoryParams, deps);
    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

// ── Main Entry ─────────────────────────────────────────────────────────────────

/**
 * Start the MCP server.
 *
 * 1. Loads config (env vars + ~/.dkg/auth.token)
 * 2. Initializes shared dependencies (DkgClient, DedupeStore)
 * 3. Pre-creates the Context Graph on DKG (idempotent, non-blocking)
 * 4. Registers all 8 tools with the MCP SDK
 * 5. Registers a prompts/list handler returning the auto-capture system prompt
 * 6. Connects via stdio transport and waits
 */
export async function startServer(): Promise<void> {
  const config = await loadMcpConfig();

  // Initialize shared dependencies
  const client = new DkgClient({
    daemonUrl: config.daemonUrl,
    token: config.authToken,
  });

  const dedupeStore = new DedupeStore(config);
  await dedupeStore.load();

  const deps: ToolDeps = { client, dedupeStore, config };

  // Pre-create Context Graph (non-blocking — failure is non-fatal)
  client.ensureContextGraph(config.contextGraph, 'Claude Code Research Memory').catch(() => {
    // Context graph creation failure is non-fatal; queries will still work
  });

  // ── MCP Server ───────────────────────────────────────────────────────────────

  const server = new Server(
    { name: 'dkg-claude-code-memory', version: '1.0.0' },
    { capabilities: { tools: {}, prompts: {} } },
  );

  // ── Tools Handler ────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await routeToolCall(name, args ?? {}, deps);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  // ── Prompts Handler (Auto-Capture System Prompt) ─────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'dkg-research-memory-instructions',
        description: 'System instructions for using DKG Research Memory tools proactively',
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== 'dkg-research-memory-instructions') {
      throw new Error('Unknown prompt');
    }
    return {
      description: 'DKG Research Memory auto-capture instructions',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildSystemPrompt(SESSION_ID),
          },
        },
      ],
    };
  });

  // ── Connect ──────────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running. Stays alive until process is killed by MCP host.
}
