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
import type { ToolDeps } from './tools/types.js';

/**
 * Start the MCP server with stdio transport.
 */
export async function startServer(): Promise<void> {
  const config = await loadMcpConfig();
  const client = new DkgClient({
    daemonUrl: config.daemonUrl,
    token: config.authToken,
  });

  const dedupeStore = new DedupeStore({
    stateDir: config.stateDir,
  });

  const deps: ToolDeps = { client, dedupeStore, config };

  const server = new Server(
    {
      name: 'dkg-claude-code-memory',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    },
  );

  // ── Tool registration ──────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'capture_research_finding',
        description: 'Write a research artifact (finding, decision, vulnerability, synthesis) to DKG Working Memory with SHA-256 content hash, PROV-O derivedFrom chains, sensitivity classification, and multi-agent attribution metadata',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The research content to capture' },
            artifactType: {
              type: 'string',
              enum: ['chat', 'research_note', 'code_analysis', 'markdown', 'plan', 'summary', 'design_note', 'implementation_log', 'vulnerability_finding', 'audit_note', 'competitive_analysis', 'knowledge_synthesis', 'raw_capture', 'other'],
              description: 'Type of artifact',
            },
            title: { type: 'string', description: 'Human-readable title for the artifact' },
            status: {
              type: 'string',
              enum: ['draft', 'needs_sources', 'review_needed', 'validated', 'ready_to_share', 'deprecated', 'discarded'],
              description: 'Trust-gradient status (default: draft)',
            },
            sensitivity: {
              type: 'string',
              enum: ['public', 'internal', 'confidential'],
              description: 'Access-control level (schema:accessMode). "confidential" artifacts are blocked from promotion to Shared Memory.',
            },
            sessionId: { type: 'string', description: 'Session identifier for grouping related artifacts' },
            conversationId: { type: 'string', description: 'Conversation identifier for chat provenance' },
            toolCalls: { type: 'array', items: { type: 'string' }, description: 'Tool call identifiers used to produce this artifact' },
            filePaths: { type: 'array', items: { type: 'string' }, description: 'File paths referenced in this artifact' },
            workspaceProject: { type: 'string', description: 'Workspace project name for provenance tracking' },
            subAgentId: { type: 'string', description: 'Sub-agent identifier for multi-agent hierarchies' },
            parentTaskId: { type: 'string', description: 'Parent task identifier for task decomposition tracking' },
            agentRole: { type: 'string', description: 'Role of the agent in producing this artifact' },
            source: {
              type: 'string',
              enum: ['chat', 'tool', 'file', 'manual', 'api'],
              description: 'Source of the artifact content',
            },
            derivedFrom: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of artifact URNs this artifact was derived from (provenance chain)',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'search_working_memory',
        description: 'Search past artifacts by keyword, type, status, session ID, or provenance chain (derivedFromId). Call at the start of any research task to avoid duplicating prior work.',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Keyword to search for in artifact titles and text content' },
            type: {
              type: 'string',
              enum: ['chat', 'research_note', 'code_analysis', 'markdown', 'plan', 'summary', 'design_note', 'implementation_log', 'vulnerability_finding', 'audit_note', 'competitive_analysis', 'knowledge_synthesis', 'raw_capture', 'other'],
              description: 'Filter by artifact type',
            },
            status: {
              type: 'string',
              enum: ['draft', 'needs_sources', 'review_needed', 'validated', 'ready_to_share', 'deprecated', 'discarded'],
              description: 'Filter by artifact status',
            },
            sessionId: { type: 'string', description: 'Filter by session ID' },
            limit: { type: 'number', description: 'Maximum results (default 20, max 100)' },
            derivedFromId: { type: 'string', description: 'Filter to artifacts derived from this source artifact URN' },
          },
        },
      },
      {
        name: 'retrieve_artifact',
        description: 'Retrieve the full content and metadata of a single artifact by its artifactId or UAL reference',
        inputSchema: {
          type: 'object',
          properties: {
            artifactId: { type: 'string', description: 'Artifact ID or UAL to retrieve' },
          },
          required: ['artifactId'],
        },
      },
      {
        name: 'update_artifact_status',
        description: 'Advance an artifact through the trust gradient: draft → needs_sources → review_needed → validated → ready_to_share (or deprecate/discard)',
        inputSchema: {
          type: 'object',
          properties: {
            artifactId: { type: 'string', description: 'Artifact ID to update' },
            newStatus: {
              type: 'string',
              enum: ['draft', 'needs_sources', 'review_needed', 'validated', 'ready_to_share', 'deprecated', 'discarded'],
              description: 'New status value',
            },
          },
          required: ['artifactId', 'newStatus'],
        },
      },
      {
        name: 'promote_to_shared_memory',
        description: 'Promote a validated artifact from private Working Memory to team-shared Shared Memory. Requires explicit user confirmation (confirm: true). Blocks confidential artifacts.',
        inputSchema: {
          type: 'object',
          properties: {
            artifactId: { type: 'string', description: 'Artifact ID to promote' },
            confirm: { type: 'boolean', description: 'Must be exactly true to proceed (security requirement)' },
          },
          required: ['artifactId', 'confirm'],
        },
      },
      {
        name: 'synthesize_session',
        description: 'Aggregate all artifacts from a session into a structured knowledge_synthesis artifact with type counts, status breakdown, and consolidated findings',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to synthesize' },
            title: { type: 'string', description: 'Optional title for the synthesis artifact' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'get_session_summary',
        description: 'List all artifacts captured in the current or a named session with type counts and status breakdown — useful for checking session state before starting new work',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID (defaults to current session)' },
          },
        },
      },
      {
        name: 'query_shared_memory',
        description: 'Search Shared Memory by keyword — finds promoted artifacts matching the query in their title or text content',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keyword to search for in artifact titles and text content' },
            limit: { type: 'number', description: 'Maximum results (default 10, max 100)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_claim_review',
        description: 'Generate a schema.org ClaimReview JSON-LD document for any stored artifact — enables direct consumption by the OriginTrail Oracle for Verified Memory integration',
        inputSchema: {
          type: 'object',
          properties: {
            artifactId: { type: 'string', description: 'Artifact ID to generate ClaimReview for' },
          },
          required: ['artifactId'],
        },
      },
      {
        name: 'get_node_status',
        description: 'Check DKG node reachability and measure connection latency — useful for diagnosing connection issues before running tool operations',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  }));

  // ── Tool call handler ───────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'capture_research_finding':
          return { content: [{ type: 'text', text: JSON.stringify(await handleCapture(args as any, deps)) }] };
        case 'search_working_memory':
          return { content: [{ type: 'text', text: JSON.stringify(await handleSearch(args as any, deps)) }] };
        case 'retrieve_artifact':
          return { content: [{ type: 'text', text: JSON.stringify(await handleRetrieve(args as any, deps)) }] };
        case 'update_artifact_status':
          return { content: [{ type: 'text', text: JSON.stringify(await handleUpdateStatus(args as any, deps)) }] };
        case 'promote_to_shared_memory':
          return { content: [{ type: 'text', text: JSON.stringify(await handlePromote(args as any, deps)) }] };
        case 'synthesize_session':
          return { content: [{ type: 'text', text: JSON.stringify(await handleSynthesize(args as any, deps)) }] };
        case 'get_session_summary':
          return { content: [{ type: 'text', text: JSON.stringify(await handleSessionSummary(args as any, deps)) }] };
        case 'query_shared_memory':
          return { content: [{ type: 'text', text: JSON.stringify(await handleQuerySharedMemory(args as any, deps)) }] };
        case 'get_claim_review':
          return { content: [{ type: 'text', text: JSON.stringify(await handleGetClaimReview(args as any, deps)) }] };
        case 'get_node_status':
          return { content: [{ type: 'text', text: JSON.stringify(await handleGetNodeStatus(args as any, deps)) }] };
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, message: msg }) }], isError: true };
    }
  });

  // ── Prompt handlers ─────────────────────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'research_workflow',
        description: 'Guided workflow for conducting structured research with DKG Working Memory',
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== 'research_workflow') {
      throw new Error(`Unknown prompt: ${request.params.name}`);
    }

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `# Research Workflow with DKG Working Memory

You have access to a DKG Working Memory server that persists your research artifacts across sessions. Follow this workflow:

## 1. Check for existing work
Call \`search_working_memory\` with relevant keywords to see if prior sessions already covered this topic.

## 2. Capture findings
Use \`capture_research_finding\` to save every significant finding, decision, or analysis. Include:
- A descriptive title
- The full content
- Appropriate artifact type and status
- Session ID for grouping
- derivedFrom IDs to build provenance chains

## 3. Retrieve and build on prior work
Use \`retrieve_artifact\` to get full content of prior artifacts. Reference them in new captures via derivedFrom.

## 4. Query shared memory
Use \`query_shared_memory\` with keywords to find promoted artifacts across sessions.

## 5. Promote validated findings
Once an artifact is validated, use \`promote_to_shared_memory\` with confirm:true to share it with the team.

## 6. Synthesize sessions
Use \`synthesize_session\` to aggregate all artifacts from a session into a structured summary.`,
          },
        },
      ],
    };
  });

  // ── Connect ─────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[dkg-server] MCP server connected via stdio');
}
