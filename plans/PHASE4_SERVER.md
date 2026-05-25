# Phase 4: MCP Server + CLI Entry — `dkg-claude-code-memory`

**Duration:** ~2 hours  
**Goal:** `npm run build && node dist/index.js` launches the MCP server without errors. All 7 tools registered and visible to MCP clients.

---

## Overview

The MCP server is the glue layer. It:
1. Reads config (env vars + `~/.dkg/auth.token`)
2. Initializes shared deps (`DkgWmClient`, `DedupeStore`)
3. Pre-creates the Context Graph on DKG (idempotent)
4. Registers all 7 tools with the MCP SDK
5. Registers a `prompts/list` handler returning the auto-capture system prompt
6. Connects via stdio transport and waits

---

## File: `src/config.ts`

Loads config from env vars with defaults. No file reading beyond the token file.

```typescript
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { McpConfig } from './types/mcp.js';

export function loadConfig(): McpConfig {
  const authToken = loadToken();
  return {
    daemonUrl:        process.env['DKG_DAEMON_URL']        ?? 'http://127.0.0.1:9200',
    authToken,
    contextGraph:     process.env['DKG_WM_CONTEXT_GRAPH']  ?? 'ccm-research',
    assertionName:    process.env['DKG_WM_ASSERTION_NAME'] ?? 'artifacts',
    stateDir:         process.env['DKG_CCM_STATE_DIR']     ?? join(homedir(), '.dkg', 'ccm-state'),
    authorId:         process.env['DKG_WM_AUTHOR_ID']      ?? 'unknown',
    agentId:          process.env['DKG_WM_AGENT_ID']       ?? 'claude-code-agent',
    minContentLength: parseInt(process.env['DKG_WM_MIN_LENGTH'] ?? '80', 10),
    redactionEnabled: process.env['DKG_WM_REDACTION'] !== 'false',
    dedupeEnabled:    process.env['DKG_WM_DEDUPE']    !== 'false',
  };
}

function loadToken(): string {
  // Priority 1: env var
  const envToken = process.env['DKG_AUTH_TOKEN'];
  if (envToken?.trim()) return envToken.trim();

  // Priority 2: token file
  const tokenPath = process.env['DKG_AUTH_TOKEN_PATH'] ?? join(homedir(), '.dkg', 'auth.token');
  try {
    const raw = readFileSync(tokenPath, 'utf8');
    // Strip comment lines (lines starting with #) and whitespace
    const token = raw
      .split('\n')
      .filter(line => !line.trimStart().startsWith('#'))
      .join('')
      .trim();
    if (token) return token;
  } catch {
    // File not found — fall through to error
  }

  throw new Error(
    'DKG auth token not found. Set DKG_AUTH_TOKEN env var or create ~/.dkg/auth.token',
  );
}
```

---

## File: `src/server.ts`

The main MCP server module. Exported as `startServer()` for the CLI entry point.

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';

import { loadConfig } from './config.js';
import { DkgWmClient } from './core/dkg-client.js';
import { DedupeStore } from './core/dedupe-store.js';
import { handleCapture }        from './tools/capture.js';
import { handleSearch }         from './tools/search.js';
import { handleRetrieve }       from './tools/retrieve.js';
import { handleUpdateStatus }   from './tools/update-status.js';
import { handlePromote }        from './tools/promote.js';
import { handleSynthesize }     from './tools/synthesize.js';
import { handleSessionSummary } from './tools/session-summary.js';

// Session ID: unique per server process lifetime (one Claude Code session = one server process)
const SESSION_ID = `ccm-${randomUUID().slice(0, 8)}`;

export async function startServer(): Promise<void> {
  const config = loadConfig();

  // Initialize shared dependencies
  const client = new DkgWmClient({
    daemonUrl: config.daemonUrl,
    token: config.authToken,
  });

  const dedupeStore = new DedupeStore({ stateDir: config.stateDir });
  await dedupeStore.load();

  const deps = { client, dedupeStore, config };

  // Pre-create Context Graph (non-blocking — failure is non-fatal)
  client.ensureContextGraph(config.contextGraph, 'Claude Code Research Memory').catch(() => {});

  // ── MCP Server ──────────────────────────────────────────────────────────────
  const server = new Server(
    { name: 'dkg-claude-code-memory', version: '1.0.0' },
    { capabilities: { tools: {}, prompts: {} } },
  );

  // ── Tool Definitions ────────────────────────────────────────────────────────

  const TOOLS = [
    {
      name: 'capture_research_finding',
      description:
        'Deposit a research artifact into DKG v10 Working Memory with provenance and a status tag. ' +
        'Call this after completing any significant analysis, finding, or decision. ' +
        'Supports sub-agent attribution via parentTaskId and subAgentId.',
      inputSchema: {
        type: 'object',
        properties: {
          content:      { type: 'string', description: 'Full text of the artifact to store' },
          type:         { type: 'string', enum: ARTIFACT_TYPES, description: 'Artifact type' },
          title:        { type: 'string', description: 'Short title (auto-generated if omitted)' },
          status:       { type: 'string', enum: ARTIFACT_STATUSES, description: 'Override status classification' },
          sessionId:    { type: 'string', description: `Current session ID. Default: ${SESSION_ID}` },
          parentTaskId: { type: 'string', description: 'Parent session/task ID (for sub-agent attribution)' },
          subAgentId:   { type: 'string', description: 'Sub-agent identifier (for sub-agent attribution)' },
          agentRole:    { type: 'string', description: 'Role of the agent producing this artifact' },
        },
        required: ['content', 'type'],
      },
    },
    {
      name: 'search_working_memory',
      description:
        'Search past artifacts in Working Memory by keyword, type, status, or session. ' +
        'Call this at the start of any research task to retrieve relevant prior context.',
      inputSchema: {
        type: 'object',
        properties: {
          query:     { type: 'string', description: 'Keyword search (matched against title + content)' },
          type:      { type: 'string', enum: ARTIFACT_TYPES, description: 'Filter by artifact type' },
          status:    { type: 'string', enum: ARTIFACT_STATUSES, description: 'Filter by status' },
          sessionId: { type: 'string', description: 'Filter to a specific session' },
          limit:     { type: 'number', minimum: 1, maximum: 100, description: 'Max results (default: 10)' },
        },
        required: [],
      },
    },
    {
      name: 'get_artifact_content',
      description: 'Retrieve the full content and metadata of a specific artifact by its ID (UAL or URN).',
      inputSchema: {
        type: 'object',
        properties: {
          artifactId: { type: 'string', description: 'Artifact ID: UAL (ual:...) or URN (urn:dkg:wm:...)' },
        },
        required: ['artifactId'],
      },
    },
    {
      name: 'update_artifact_status',
      description:
        'Change the status of an artifact. Use to promote findings through the trust gradient: ' +
        'draft → needs_sources → review_needed → validated → ready_to_share.',
      inputSchema: {
        type: 'object',
        properties: {
          artifactId: { type: 'string', description: 'Artifact ID (urn:dkg:wm:...)' },
          newStatus:  { type: 'string', enum: ARTIFACT_STATUSES, description: 'New status value' },
        },
        required: ['artifactId', 'newStatus'],
      },
    },
    {
      name: 'promote_to_shared_memory',
      description:
        'Promote Working Memory artifacts to Shared Working Memory so team peers can see them. ' +
        'IMPORTANT: Only call this when the user has explicitly asked to share with the team. ' +
        'Set confirm=true only after receiving explicit user confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          artifactId: { type: 'string', description: 'Artifact ID to promote' },
          confirm:    { type: 'boolean', description: 'Must be true. Set only after user explicitly confirms.' },
        },
        required: ['artifactId', 'confirm'],
      },
    },
    {
      name: 'synthesize_session',
      description:
        'Aggregate all artifacts from a session into a structured knowledge_synthesis artifact. ' +
        'Call this at the end of a complex research session to create a durable summary.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID to synthesize' },
          title:     { type: 'string', description: 'Title for the synthesis artifact' },
        },
        required: ['sessionId'],
      },
    },
    {
      name: 'get_session_summary',
      description: 'List all artifacts from a session with type counts and timestamps.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: `Session ID (default: current session ${SESSION_ID})` },
        },
        required: [],
      },
    },
  ] as const;

  // ── Request Handlers ─────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = args ?? {};

    // Inject default sessionId
    if (!params['sessionId']) params['sessionId'] = SESSION_ID;

    let result: unknown;
    switch (name) {
      case 'capture_research_finding':   result = await handleCapture(params as CaptureParams, deps); break;
      case 'search_working_memory':      result = await handleSearch(params as SearchParams, deps); break;
      case 'get_artifact_content':       result = await handleRetrieve(params as RetrieveParams, deps); break;
      case 'update_artifact_status':     result = await handleUpdateStatus(params as UpdateStatusParams, deps); break;
      case 'promote_to_shared_memory':   result = await handlePromote(params as PromoteParams, deps); break;
      case 'synthesize_session':         result = await handleSynthesize(params as SynthesizeParams, deps); break;
      case 'get_session_summary':        result = await handleSessionSummary(params as SessionSummaryParams, deps); break;
      default: result = { success: false, message: `Unknown tool: ${name}` };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  // ── Prompts Handler (Auto-Capture System Prompt) ─────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [{
      name: 'dkg-research-memory-instructions',
      description: 'System instructions for using DKG Research Memory tools proactively',
    }],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== 'dkg-research-memory-instructions') {
      throw new Error('Unknown prompt');
    }
    return {
      description: 'DKG Research Memory auto-capture instructions',
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: buildSystemPrompt(SESSION_ID),
        },
      }],
    };
  });

  // ── Connect ──────────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running. Stays alive until process is killed by MCP host.
}

function buildSystemPrompt(sessionId: string): string {
  return `# DKG Research Memory

You have access to persistent Working Memory on DKG v10 through the following tools.
Use them proactively — don't wait for the user to ask.

**Current session ID:** ${sessionId}
All artifacts you produce are automatically associated with this session and persist across Claude Code sessions.

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

**update_artifact_status** — Promote findings as your confidence grows.
Progression: draft → needs_sources → review_needed → validated → ready_to_share

**promote_to_shared_memory** — ONLY when the user explicitly asks to share findings with their team.
You MUST ask for confirmation before calling this. Never call it autonomously.

**synthesize_session** — At the end of a complex research session, synthesize all findings into a structured summary.

**get_session_summary** — To see what has been captured in the current or a past session.

## Sub-agent attribution

If you are a sub-agent spawned by a parent Claude Code session, use:
- parentTaskId: the parent session's ID
- subAgentId: a unique identifier for yourself
- agentRole: your role (e.g., "reentrancy-analyzer", "access-control-reviewer")

This creates a verifiable provenance chain across the full agent hierarchy.`;
}
```

---

## File: `src/index.ts` — CLI Entry Point

```typescript
#!/usr/bin/env node
import { startServer } from './server.js';

startServer().catch((err: unknown) => {
  process.stderr.write(`dkg-claude-code-memory: fatal error: ${String(err)}\n`);
  process.exit(1);
});
```

Add shebang to compiled output: in `package.json` add a `postbuild` script that prepends `#!/usr/bin/env node` if not already present, or configure `tsconfig.json` to emit correctly. Alternatively, use the `bin` field in `package.json` and ensure the dist file has the shebang via a build step:

```json
// package.json scripts:
"postbuild": "node -e \"const fs=require('fs'); const f='dist/index.js'; const c=fs.readFileSync(f,'utf8'); if(!c.startsWith('#!')) fs.writeFileSync(f,'#!/usr/bin/env node\\n'+c);\""
```

---

## File: `CLAUDE_CONFIG_EXAMPLE.json`

Place in repo root. Shows users how to configure Claude Code:

```json
{
  "_comment": "Add this to your Claude Code MCP settings. Remove _comment before use.",
  "mcpServers": {
    "dkg-research-memory": {
      "command": "npx",
      "args": ["-y", "dkg-claude-code-memory@latest"],
      "env": {
        "DKG_AUTH_TOKEN": "YOUR_DKG_TOKEN_HERE",
        "DKG_DAEMON_URL": "http://127.0.0.1:9200"
      }
    }
  }
}
```

For developers running from source:
```json
{
  "mcpServers": {
    "dkg-research-memory": {
      "command": "node",
      "args": ["/path/to/dkg-claude-code-memory/dist/index.js"],
      "env": {
        "DKG_AUTH_TOKEN": "YOUR_DKG_TOKEN_HERE"
      }
    }
  }
}
```

---

## Constants File: `src/types/artifact.ts` additions

Export arrays needed by the server's `inputSchema` enum definitions:

```typescript
export const ARTIFACT_TYPES = [
  'chat', 'research_note', 'code_analysis', 'markdown', 'plan', 'summary',
  'design_note', 'implementation_log', 'vulnerability_finding', 'audit_note',
  'competitive_analysis', 'knowledge_synthesis', 'raw_capture', 'other',
] as const;

export const ARTIFACT_STATUSES = [
  'draft', 'review_needed', 'needs_sources', 'validated',
  'ready_to_share', 'deprecated', 'discarded',
] as const;
```

---

## Deliverable Check

```bash
npm run build    # Zero errors

# Test the server starts and lists tools:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
# Expected: JSON response listing all 7 tools

# Test config loads correctly:
DKG_AUTH_TOKEN=test-token node dist/index.js 2>&1 | head -5
# Expected: Server starts, no crash
```

The server should be responsive to MCP JSON-RPC over stdin/stdout once started.
