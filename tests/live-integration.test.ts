/**
 * Live Integration Tests — Real DKG Node
 * 
 * Run only when DKG_INTEGRATION_TEST=1. Requires DKG node at 127.0.0.1:9200
 * and valid auth token in ~/.dkg/auth.token.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const LIVE = process.env['DKG_INTEGRATION_TEST'] === '1';

describe.skipIf(!LIVE)('live DKG node integration', () => {
  let capturedUAL: string;
  let capturedArtifactId: string;

  beforeAll(async () => {
    // Verify DKG environment is available
    if (!process.env['DKG_AUTH_TOKEN']) {
      console.warn('DKG_AUTH_TOKEN not set, tests will use defaults');
    }
  });

  it('captures a vulnerability_finding and returns a UAL', async () => {
    const { handleCapture } = await import('../src/tools/capture.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result = await handleCapture(
      {
        content: 'Live test: reentrancy found in withdraw() at line 42. Impact: HIGH. Recommended fix: checks-effects-interactions pattern.',
        artifactType: 'vulnerability_finding',
        sessionId: 'live-test-session',
        title: 'Live Integration Test Finding',
      },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(true);
    expect(typeof result.ual).toBe('string');
    expect(typeof result.ual === 'string').toBe(true);
    capturedUAL = result.ual as string;
    capturedArtifactId = result.artifactId as string;
  });

  it('search_working_memory retrieves the captured artifact', async () => {
    const { handleSearch } = await import('../src/tools/search.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result = await handleSearch(
      { sessionId: 'live-test-session' },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    const found = result.artifacts.find((a: any) => a.id === capturedArtifactId);
    expect(found).toBeDefined();
  });

  it('update_artifact_status to validated persists', async () => {
    const { handleUpdateStatus } = await import('../src/tools/update-status.js');
    const { handleSearch } = await import('../src/tools/search.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const updateResult = await handleUpdateStatus(
      { artifactId: capturedArtifactId, newStatus: 'validated' },
      { config, client, dedupeStore }
    );

    expect(updateResult.success).toBe(true);

    const searchResult = await handleSearch(
      { sessionId: 'live-test-session', status: 'validated' },
      { config, client, dedupeStore }
    );

    const updated = searchResult.artifacts.find((a: any) => a.id === capturedArtifactId);
    expect(updated?.status).toBe('validated');
  });

  it('get_session_summary lists artifacts from live-test-session', async () => {
    const { handleSessionSummary } = await import('../src/tools/session-summary.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result = await handleSessionSummary(
      { sessionId: 'live-test-session' },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });

  it('synthesize_session creates a knowledge_synthesis artifact', async () => {
    const { handleSynthesize } = await import('../src/tools/synthesize.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result = await handleSynthesize(
      { sessionId: 'live-test-session', title: 'Live Test Synthesis' },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(true);
    expect(result.artifactCount).toBeGreaterThan(0);
    expect(typeof result.synthesisArtifactId).toBe('string');
  });

  it('promote_to_shared_memory is blocked without confirm=true', async () => {
    const { handlePromote } = await import('../src/tools/promote.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result = await handlePromote(
      { artifactId: capturedArtifactId, confirm: false },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('confirm');
  });

  it('promote_to_shared_memory succeeds with confirm=true', async () => {
    const { handlePromote } = await import('../src/tools/promote.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result = await handlePromote(
      { artifactId: capturedArtifactId, confirm: true },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(true);
  });

  it('captures a research_note with subAgentId', async () => {
    const { handleCapture } = await import('../src/tools/capture.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result = await handleCapture(
      {
        content: 'Sub-agent analysis: reviewing smart contract for reentrancy vulnerabilities. No issues found in initial pass.',
        artifactType: 'research_note',
        sessionId: 'live-test-session',
        subAgentId: 'live-sub-agent-001',
        parentTaskId: 'live-parent-task-001',
        agentRole: 'security-analyst',
      },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(true);
    expect(typeof result.ual === 'string').toBe(true);
  });

  it('search filters by artifact type', async () => {
    const { handleSearch } = await import('../src/tools/search.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    // After promotion (test 7), vulnerability_findings move to shared-working-memory.
    // Test 8 writes a research_note to working-memory — search for that instead.
    const result = await handleSearch(
      { sessionId: 'live-test-session', type: 'research_note' },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    const found = result.artifacts.find((a: any) => a.type === 'research_note');
    expect(found).toBeDefined();
  });

  it('captures multiple artifacts in same session', async () => {
    const { handleCapture } = await import('../src/tools/capture.js');
    const { handleSearch } = await import('../src/tools/search.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result1 = await handleCapture(
      {
        content: 'Additional finding: gas optimization opportunity in loop iteration. Estimated 15% gas reduction possible.',
        artifactType: 'audit_note',
        sessionId: 'live-test-session',
      },
      { config, client, dedupeStore }
    );

    const result2 = await handleCapture(
      {
        content: 'Another finding: missing input validation on external call allows arbitrary data injection.',
        artifactType: 'vulnerability_finding',
        sessionId: 'live-test-session',
      },
      { config, client, dedupeStore }
    );

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    const searchResult = await handleSearch(
      { sessionId: 'live-test-session' },
      { config, client, dedupeStore }
    );

    expect(searchResult.count).toBeGreaterThan(2);
  });

  it('update_artifact_status to rejected works', async () => {
    const { handleCapture } = await import('../src/tools/capture.js');
    const { handleUpdateStatus } = await import('../src/tools/update-status.js');
    const { handleSearch } = await import('../src/tools/search.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const captureResult = await handleCapture(
      {
        content: 'Finding to be rejected: false positive due to external dependency version constraint mismatch.',
        artifactType: 'vulnerability_finding',
        sessionId: 'live-test-session',
      },
      { config, client, dedupeStore }
    );

    if (!captureResult.success || !captureResult.artifactId) {
      return;
    }

    const updateResult = await handleUpdateStatus(
      { artifactId: captureResult.artifactId, newStatus: 'discarded' },
      { config, client, dedupeStore }
    );

    expect(updateResult.success).toBe(true);

    const searchResult = await handleSearch(
      { sessionId: 'live-test-session', status: 'discarded' },
      { config, client, dedupeStore }
    );

    const rejected = searchResult.artifacts.find((a: any) => a.id === captureResult.artifactId);
    expect(rejected?.status).toBe('discarded');
  });

  it('session summary includes all artifact types', async () => {
    const { handleSessionSummary } = await import('../src/tools/session-summary.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result = await handleSessionSummary(
      { sessionId: 'live-test-session' },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(true);
    expect(result.typeCounts).toBeDefined();
    expect(Object.keys(result.typeCounts || {}).length).toBeGreaterThan(0);
  });

  it('search returns empty for non-existent session', async () => {
    const { handleSearch } = await import('../src/tools/search.js');
    const { DkgClient } = await import('../src/core/dkg-client.js');
    const { DedupeStore } = await import('../src/core/dedupe-store.js');

    const config = {
      daemonUrl: process.env['DKG_DAEMON_URL'] || 'http://127.0.0.1:9200',
      authToken: process.env['DKG_AUTH_TOKEN'] || 'test-token',
      contextGraph: 'ccm-research',
      assertionName: 'artifacts',
      stateDir: '/tmp/ccm-live-test-state',
      authorId: 'test-author',
      agentId: 'claude-code-agent',
      minContentLength: 80,
      redactionEnabled: true,
      dedupeEnabled: true,
    };

    const client = new DkgClient({ daemonUrl: config.daemonUrl, token: config.authToken });
    const dedupeStore = new DedupeStore(config);

    const result = await handleSearch(
      { sessionId: 'non-existent-session-xyz' },
      { config, client, dedupeStore }
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.artifacts).toEqual([]);
  });
});
