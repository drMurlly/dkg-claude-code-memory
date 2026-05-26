/**
 * MCP Server — Glue layer that registers all 10 tools with the MCP SDK
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
import { handleGetClaimReview } from './tools/get-claim-review.js';
import { handleGetNodeStatus } from './tools/get-node-status.js';
import { ARTIFACT_TYPES, ARTIFACT_STATUSES } from './types/artifact.js';
import type {
  CaptureParams,
  SearchParams,
  RetrieveParams,
  UpdateStatusParams,
  PromoteParams,
  SynthesizeParams,
  SessionSummaryParams,
  GetClaimReviewParams,
  GetNodeStatusParams,
  ToolDeps,
} from './tools/types.js';
import type { QuerySharedMemoryParams } from './tools/query-shared-memory.js';

const SESSION_ID = `ccm-${randomUUID().slice(0, 8)}`;

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
        sensitivity: {
          type: 'string',
          enum: ['public', 'internal', 'confidential'],
          description: 'Access sensitivity level. confidential artifacts cannot be promoted to Shared Memory.',
        },
        derivedFrom: {
          type: 'array',
          items: { type: 'string' },
          description: 'URNs of artifacts this was derived from — creates prov:wasDerivedFrom provenance chains for multi-agent lineage.',
        },
        source: {
          type: 'string',
          enum: ['chat', 'tool', 'file', 'manual', 'api'],
          description: 'Provenance source of this artifact (default: tool)',
        },
        sessionId: { type: 'string', description: `Current session ID. Default: ${SESSION_ID}` },
        conversationId: { type: 'string', description: 'Conversation ID for multi-session tracking' },
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
      'Search past artifacts in Working Memory by keyword, type, status, session, or provenance chain. ' +
      'Call this at the START of any research task to avoid duplicating prior work.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Keyword to search in artifact title AND content body' },
        type: { type: 'string', enum: ARTIFACT_TYPES, description: 'Filter by artifact type' },
        status: { type: 'string', enum: ARTIFACT_STATUSES, description: 'Filter by status' },
        sessionId: { type: 'string', description: 'Filter by session ID' },
        derivedFromId: {
          type: 'string',
          description: 'Filter: return only artifacts derived from this URN (traces provenance chain forward)',
        },
        limit: { type: 'number', description: 'Maximum results to return (default 20, max 100)' },
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
      'Progression: draft -> needs_sources -> review_needed -> validated -> ready_to_share. ' +
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
        confirm: { type: 'boolean', description: 'User confirmation. Must be true.' },
      },
      required: ['artifactId', 'confirm'],
    },
  },
  {
    name: 'synthesize_session',
    description:
      'Synthesize all artifacts from a session into a structured summary artifact. ' +
      'Use at the end of a complex research session to produce a consolidated report.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to synthesize' },
        title: { type: 'string', description: 'Optional title for the summary artifact' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_session_summary',
    description:
      'Get a summary of all artifacts captured in the current or a specified session. ' +
      'Returns counts by type and status, plus a chronological list.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID (defaults to current session)' },
      },
    },
  },
  {
    name: 'query_shared_memory',
    description:
      'Execute a custom SPARQL query against Shared Memory. ' +
      'Use for complex queries that go beyond the search tool capabilities, ' +
      'such as tracing provenance chains or querying across multiple dimensions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SPARQL query to execute' },
        limit: { type: 'number', description: 'Maximum results (default 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_claim_review',
    description:
      'Retrieve an artifact and return its schema.org ClaimReview JSON-LD representation. ' +
      'Useful for generating verifiable claim reviews for Oracle consumers.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'The artifact ID to generate a ClaimReview for' },
      },
      required: ['artifactId'],
    },
  },
  {
    name: 'get_node_status',
    description:
      'Check if the DKG node is reachable. ' +
      'Returns online/offline status, the node URL, and response latency in milliseconds. ' +
      'Useful for verifying connectivity before calling other tools.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

function buildSystemPrompt(sessionId: string): string {
  return `You are an AI research agent integrated with DKG Research Memory. Your research artifacts persist across sessions through the DKG v10 graph.

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
Progression: draft -> needs_sources -> review_needed -> validated -> ready_to_share

**promote_to_shared_memory** — ONLY when the user explicitly asks to share findings with their team.
You MUST ask for confirmation before calling this. Never call it autonomously.

**synthesize_session** — At the end of a complex research sessions, synthesize all findings into a structured summary.

**get_session_summary** — To see what has been captured in the current or a past session.

**get_claim_review** — To generate a schema.org ClaimReview JSON-LD for an artifact. Useful for Oracle consumers.

**get_node_status** — To check if the DKG node is reachable before calling other tools.

## Sub-agent attribution

If you are a sub-agent spawned by a parent Claude Code session, use:
- parentTaskId: the parent sessions's ID
- subAgentId: a unique identifier for yourself
- agentRole: your role (e.g., "reentrancy-analyzer", "access-control-reviewer")

This creates a verifiable provenance chain across the full agent hierarchy.`;
}

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
    case 'get_claim_review':
      return await handleGetClaimReview(params as unknown as GetClaimReviewParams, deps);
    case 'get_node_status':
      return await handleGetNodeStatus(params as unknown as GetNodeStatusParams, deps);
    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

export async function startServer(): Promise<void> {
  const config = await loadMcpConfig();

  const client = new DkgClient({
    daemonUrl: config.daemonUrl,
    token: config.authToken,
  });

  const dedupeStore = new DedupeStore(config);
  await dedupeStore.load();

  const deps: ToolDeps = { client, dedupeStore, config };

  client.ensureContextGraph(config.contextGraph, 'Claude Code Research Memory').catch(() => {
    // non-fatal
  });

  const server = new Server(
    { name: 'dkg-claude-code-memory', version: '1.0.0' },
    { capabilities: { tools: {}, prompts: {} } },
  );

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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
