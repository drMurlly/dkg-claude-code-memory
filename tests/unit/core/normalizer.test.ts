/**
 * Unit tests for the normalizer module.
 * Tests normalizeArtifact() with all input combinations.
 */

import { describe, it, expect } from 'vitest';
import { normalizeArtifact } from '../../../src/core/normalizer.js';
import type { RawCaptureInput } from '../../../src/types/artifact.js';
import type { McpConfig } from '../../../src/types/mcp.js';

const BASE_CONFIG: McpConfig = {
  daemonUrl: 'http://127.0.0.1:9200',
  authToken: 'test-token',
  contextGraph: 'ccm-research',
  assertionName: 'artifacts',
  stateDir: '/tmp/ccm-test',
  authorId: 'test-author',
  agentId: 'test-agent',
  minContentLength: 10,
  redactionEnabled: false,
  dedupeEnabled: false,
};

const LONG_CONTENT = 'This is a complete research finding about smart contract vulnerabilities in DeFi protocols. '.repeat(5);

function makeRaw(overrides?: Partial<RawCaptureInput>): RawCaptureInput {
  return {
    content: LONG_CONTENT,
    source: 'chat',
    ...overrides,
  };
}

describe('normalizeArtifact()', () => {

  // ─────────────────────────────────────────
  // Null/rejection cases
  // ─────────────────────────────────────────
  describe('null cases (invalid input)', () => {
    it('returns null when content is not a string', () => {
      const raw = { content: 123, source: 'chat' } as unknown as RawCaptureInput;
      expect(normalizeArtifact(raw, BASE_CONFIG)).toBeNull();
    });

    it('returns null when content is null', () => {
      const raw = { content: null, source: 'chat' } as unknown as RawCaptureInput;
      expect(normalizeArtifact(raw, BASE_CONFIG)).toBeNull();
    });

    it('returns null when content is undefined', () => {
      const raw = { content: undefined, source: 'chat' } as unknown as RawCaptureInput;
      expect(normalizeArtifact(raw, BASE_CONFIG)).toBeNull();
    });

    it('returns null when content is shorter than minContentLength', () => {
      const raw = makeRaw({ content: 'short' });
      const config = { ...BASE_CONFIG, minContentLength: 100 };
      expect(normalizeArtifact(raw, config)).toBeNull();
    });

    it('returns null when content is exactly minContentLength - 1', () => {
      const raw = makeRaw({ content: 'a'.repeat(9) });
      const config = { ...BASE_CONFIG, minContentLength: 10 };
      expect(normalizeArtifact(raw, config)).toBeNull();
    });

    it('returns artifact when content is exactly minContentLength', () => {
      const raw = makeRaw({ content: 'a'.repeat(10) });
      const config = { ...BASE_CONFIG, minContentLength: 10 };
      expect(normalizeArtifact(raw, config)).not.toBeNull();
    });

    it('returns null when content exceeds 500_000 chars', () => {
      const raw = makeRaw({ content: 'x'.repeat(500_001) });
      expect(normalizeArtifact(raw, BASE_CONFIG)).toBeNull();
    });

    it('returns artifact when content is exactly 500_000 chars', () => {
      const raw = makeRaw({ content: 'x'.repeat(500_000) });
      expect(normalizeArtifact(raw, BASE_CONFIG)).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────
  // Artifact structure
  // ─────────────────────────────────────────
  describe('returned artifact structure', () => {
    it('returns an ArtifactRecord with all required fields', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact).not.toBeNull();
      expect(artifact!.artifactId).toBeDefined();
      expect(artifact!.artifactType).toBeDefined();
      expect(artifact!.title).toBeDefined();
      expect(artifact!.content).toBeDefined();
      expect(artifact!.contentHash).toBeDefined();
      expect(artifact!.status).toBeDefined();
      expect(artifact!.author).toBeDefined();
      expect(artifact!.agent).toBeDefined();
      expect(artifact!.provenance).toBeDefined();
      expect(artifact!.dkg).toBeDefined();
    });

    it('artifactId starts with urn:dkg:wm:', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.artifactId).toMatch(/^urn:dkg:wm:/);
    });

    it('contentHash starts with sha256:', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.contentHash).toMatch(/^sha256:[a-f0-9]+$/);
    });

    it('uses authorId from config', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.author.id).toBe('test-author');
    });

    it('uses agentId from config', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.agent.id).toBe('test-agent');
    });

    it('sets agent framework to claude-code', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.agent.framework).toBe('claude-code');
    });

    it('sets dkg.contextGraph from config', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.dkg.contextGraph).toBe('ccm-research');
    });

    it('sets dkg.assertionName from config', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.dkg.assertionName).toBe('artifacts');
    });

    it('sets dkg.memoryLayer to working-memory', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.dkg.memoryLayer).toBe('working-memory');
    });

    it('sets provenance.source from raw input', () => {
      const artifact = normalizeArtifact(makeRaw({ source: 'file' }), BASE_CONFIG);
      expect(artifact!.provenance.source).toBe('file');
    });

    it('sets provenance.agentFramework to claude-code', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.provenance.agentFramework).toBe('claude-code');
    });
  });

  // ─────────────────────────────────────────
  // Type inference (inferType)
  // ─────────────────────────────────────────
  describe('artifact type inference', () => {
    it('uses explicit artifactType when provided', () => {
      const artifact = normalizeArtifact(makeRaw({ artifactType: 'plan' }), BASE_CONFIG);
      expect(artifact!.artifactType).toBe('plan');
    });

    it('infers markdown for .md file paths', () => {
      const raw = makeRaw({ source: 'file', filePaths: ['README.md'] });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.artifactType).toBe('markdown');
    });

    it('infers implementation_log for non-markdown file source', () => {
      const raw = makeRaw({ source: 'file', filePaths: ['src/index.ts'] });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.artifactType).toBe('implementation_log');
    });

    it('infers chat for chat source', () => {
      const artifact = normalizeArtifact(makeRaw({ source: 'chat' }), BASE_CONFIG);
      expect(artifact!.artifactType).toBe('chat');
    });

    it('infers research_note for tool source', () => {
      const artifact = normalizeArtifact(makeRaw({ source: 'tool' }), BASE_CONFIG);
      expect(artifact!.artifactType).toBe('research_note');
    });

    it('infers other for manual source without explicit type', () => {
      const artifact = normalizeArtifact(makeRaw({ source: 'manual' }), BASE_CONFIG);
      expect(artifact!.artifactType).toBe('other');
    });

    it('infers implementation_log for file source with no paths', () => {
      const raw = makeRaw({ source: 'file', filePaths: [] });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.artifactType).toBe('implementation_log');
    });
  });

  // ─────────────────────────────────────────
  // Title generation
  // ─────────────────────────────────────────
  describe('title generation', () => {
    it('uses explicit title when provided', () => {
      const artifact = normalizeArtifact(makeRaw({ title: 'My Custom Title' }), BASE_CONFIG);
      expect(artifact!.title).toBe('My Custom Title');
    });

    it('generates title from first 80 chars of content', () => {
      const content = 'The quick brown fox jumps over the lazy dog and runs away into the forest quickly';
      const artifact = normalizeArtifact(makeRaw({ content }), BASE_CONFIG);
      expect(artifact!.title).toBeTruthy();
      expect(artifact!.title.length).toBeLessThanOrEqual(80);
    });

    it('trims to last word boundary when title ends mid-word', () => {
      const content = 'Hello world this is a longer title that might get cut ' + 'x'.repeat(100);
      const artifact = normalizeArtifact(makeRaw({ content }), BASE_CONFIG);
      expect(artifact!.title).toBeTruthy();
      // Should not end with a partial word
      expect(artifact!.title).not.toMatch(/x+$/);
    });

    it('generates title up to 60 chars when no word boundary found', () => {
      // Content with no spaces in first 80 chars
      const content = 'x'.repeat(200);
      const artifact = normalizeArtifact(makeRaw({ content }), BASE_CONFIG);
      expect(artifact!.title.length).toBeLessThanOrEqual(60);
    });
  });

  // ─────────────────────────────────────────
  // Redaction
  // ─────────────────────────────────────────
  describe('redaction', () => {
    it('does not redact when redactionEnabled is false', () => {
      const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
      const raw = makeRaw({ content: secret + ' ' + LONG_CONTENT });
      const config = { ...BASE_CONFIG, redactionEnabled: false };
      const artifact = normalizeArtifact(raw, config);
      expect(artifact!.content).toContain(secret);
    });

    it('redacts secrets when redactionEnabled is true', () => {
      const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
      const raw = makeRaw({ content: secret + ' ' + LONG_CONTENT });
      const config = { ...BASE_CONFIG, redactionEnabled: true };
      const artifact = normalizeArtifact(raw, config);
      expect(artifact!.content).not.toContain(secret);
      expect(artifact!.content).toContain('[REDACTED]');
    });

    it('stores the redacted content, not original', () => {
      const raw = makeRaw({ content: 'password=supersecret123 ' + LONG_CONTENT });
      const config = { ...BASE_CONFIG, redactionEnabled: true };
      const artifact = normalizeArtifact(raw, config);
      expect(artifact!.content).not.toContain('supersecret123');
    });
  });

  // ─────────────────────────────────────────
  // Provenance fields
  // ─────────────────────────────────────────
  describe('provenance fields', () => {
    it('includes sessionId from raw input', () => {
      const raw = makeRaw({ sessionId: 'sess-abc123' });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.provenance.sessionId).toBe('sess-abc123');
    });

    it('includes conversationId from raw input', () => {
      const raw = makeRaw({ conversationId: 'conv-xyz789' });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.provenance.conversationId).toBe('conv-xyz789');
    });

    it('includes toolCalls from raw input', () => {
      const raw = makeRaw({ toolCalls: ['Bash', 'Read'] });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.provenance.toolCalls).toEqual(['Bash', 'Read']);
    });

    it('includes filePaths from raw input', () => {
      const raw = makeRaw({ source: 'file', filePaths: ['src/foo.ts', 'src/bar.ts'] });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.provenance.filePaths).toEqual(['src/foo.ts', 'src/bar.ts']);
    });

    it('includes subAgentId from raw input', () => {
      const raw = makeRaw({ subAgentId: 'agent-sub-1' });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.provenance.subAgentId).toBe('agent-sub-1');
    });

    it('includes parentTaskId from raw input', () => {
      const raw = makeRaw({ parentTaskId: 'task-parent-1' });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.provenance.parentTaskId).toBe('task-parent-1');
    });

    it('includes agentRole from raw input', () => {
      const raw = makeRaw({ agentRole: 'researcher' });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.provenance.agentRole).toBe('researcher');
    });

    it('uses workspaceProject from raw input when provided', () => {
      const raw = makeRaw({ workspaceProject: 'my-project' });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.provenance.workspaceProject).toBe('my-project');
    });

    it('falls back to config.contextGraph for workspaceProject', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.provenance.workspaceProject).toBe('ccm-research');
    });

    it('sets createdAt to a valid ISO timestamp', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(() => new Date(artifact!.provenance.createdAt)).not.toThrow();
      expect(artifact!.provenance.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('sets capturedAt to a valid ISO timestamp', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(() => new Date(artifact!.provenance.capturedAt)).not.toThrow();
    });
  });

  // ─────────────────────────────────────────
  // Sub-agent context
  // ─────────────────────────────────────────
  describe('sub-agent context', () => {
    it('overrides subAgentId with subAgentContext value', () => {
      const raw = makeRaw({ subAgentId: 'from-raw' });
      const ctx = { subAgentId: 'from-context' };
      const artifact = normalizeArtifact(raw, BASE_CONFIG, ctx);
      expect(artifact!.provenance.subAgentId).toBe('from-context');
    });

    it('overrides parentTaskId with subAgentContext value', () => {
      const ctx = { parentTaskId: 'task-from-ctx' };
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG, ctx);
      expect(artifact!.provenance.parentTaskId).toBe('task-from-ctx');
    });

    it('overrides agentRole with subAgentContext value', () => {
      const ctx = { agentRole: 'auditor' };
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG, ctx);
      expect(artifact!.provenance.agentRole).toBe('auditor');
    });

    it('falls back to raw values when subAgentContext fields are undefined', () => {
      const raw = makeRaw({ subAgentId: 'from-raw', parentTaskId: 'task-raw' });
      const ctx = { agentRole: 'ctx-role' };
      const artifact = normalizeArtifact(raw, BASE_CONFIG, ctx);
      expect(artifact!.provenance.subAgentId).toBe('from-raw');
      expect(artifact!.provenance.parentTaskId).toBe('task-raw');
      expect(artifact!.provenance.agentRole).toBe('ctx-role');
    });

    it('works without sub-agent context (undefined)', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG, undefined);
      expect(artifact).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────
  // Deterministic hashing
  // ─────────────────────────────────────────
  describe('deterministic content hashing', () => {
    it('same content produces same contentHash', () => {
      const raw = makeRaw({ content: 'deterministic content for hashing' });
      const a1 = normalizeArtifact(raw, BASE_CONFIG);
      const a2 = normalizeArtifact(raw, BASE_CONFIG);
      expect(a1!.contentHash).toBe(a2!.contentHash);
    });

    it('different content produces different contentHash', () => {
      const a1 = normalizeArtifact(makeRaw({ content: 'content A ' + 'x'.repeat(50) }), BASE_CONFIG);
      const a2 = normalizeArtifact(makeRaw({ content: 'content B ' + 'x'.repeat(50) }), BASE_CONFIG);
      expect(a1!.contentHash).not.toBe(a2!.contentHash);
    });

    it('same content produces same artifactId', () => {
      const raw = makeRaw({ content: 'unique content xyz 12345' });
      const a1 = normalizeArtifact(raw, BASE_CONFIG);
      const a2 = normalizeArtifact(raw, BASE_CONFIG);
      expect(a1!.artifactId).toBe(a2!.artifactId);
    });
  });

  // ─────────────────────────────────────────
  // Status passthrough
  // ─────────────────────────────────────────
  describe('status handling', () => {
    it('passes through explicit status override', () => {
      const raw = makeRaw({ status: 'validated' });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.status).toBe('validated');
    });

    it('classifies status automatically when not provided', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      const validStatuses = ['draft', 'needs_sources', 'review_needed', 'validated', 'ready_to_share', 'deprecated', 'discarded'];
      expect(validStatuses).toContain(artifact!.status);
    });
  });

  // ─────────────────────────────────────────
  // Sensitivity / accessMode
  // ─────────────────────────────────────────
  describe('sensitivity handling', () => {
    it('persists a valid confidential sensitivity', () => {
      const artifact = normalizeArtifact(makeRaw({ sensitivity: 'confidential' }), BASE_CONFIG);
      expect(artifact!.sensitivity).toBe('confidential');
    });

    it('persists public and internal sensitivity levels', () => {
      expect(normalizeArtifact(makeRaw({ sensitivity: 'public' }), BASE_CONFIG)!.sensitivity).toBe('public');
      expect(normalizeArtifact(makeRaw({ sensitivity: 'internal' }), BASE_CONFIG)!.sensitivity).toBe('internal');
    });

    it('omits sensitivity when not provided', () => {
      const artifact = normalizeArtifact(makeRaw(), BASE_CONFIG);
      expect(artifact!.sensitivity).toBeUndefined();
    });

    it('drops an unknown sensitivity value (never reaches accessMode)', () => {
      const raw = makeRaw({ sensitivity: 'top-secret' as unknown as 'confidential' });
      const artifact = normalizeArtifact(raw, BASE_CONFIG);
      expect(artifact!.sensitivity).toBeUndefined();
    });
  });
});
