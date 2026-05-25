/**
 * Unit tests for JSON-LD and RDF quad serializers.
 */

import { describe, it, expect } from 'vitest';
import { serializeToQuads, serializeToJsonLd, serializeStatusUpdateQuads, buildSessionFilter, sparqlEscape } from '../../../src/core/serializers.js';
import { makeArtifact } from '../helpers.js';

describe('sparqlEscape()', () => {
  it('escapes backslash', () => {
    expect(sparqlEscape('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('escapes double-quote', () => {
    expect(sparqlEscape('say "hello"')).toBe('say \\"hello\\"');
  });

  it('escapes newline', () => {
    expect(sparqlEscape('line1\nline2')).toBe('line1\\nline2');
  });

  it('escapes carriage-return', () => {
    expect(sparqlEscape('before\rafter')).toBe('before\\rafter');
  });

  it('escapes tab', () => {
    expect(sparqlEscape('col1\tcol2')).toBe('col1\\tcol2');
  });

  it('escapes multiple special chars', () => {
    expect(sparqlEscape('test"\n\\')).toBe('test\\"\\n\\\\');
  });
});

describe('serializeToQuads()', () => {
  it('creates core type quad for WorkingMemoryArtifact', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const typeQuad = quads.find((q) => q.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    expect(typeQuad?.object).toBe('https://ontology.origintrail.io/dkg/wm#WorkingMemoryArtifact');
  });

  it('includes artifactType quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const typeQuad = quads.find((q) => q.predicate.includes('artifactType'));
    expect(typeQuad?.object).toBe('"research_note"');
  });

  it('includes status quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const statusQuad = quads.find((q) => q.predicate.includes('status'));
    expect(statusQuad?.object).toBe('"draft"');
  });

  it('includes contentHash quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const hashQuad = quads.find((q) => q.predicate.includes('contentHash'));
    expect(hashQuad?.object).toBe('"sha256:testhash123"');
  });

  it('includes schema:name quad with title', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const nameQuad = quads.find((q) => q.predicate === 'https://schema.org/name');
    expect(nameQuad?.object).toBe('"Test Artifact Title"');
  });

  it('includes schema:text quad with content', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const textQuad = quads.find((q) => q.predicate === 'https://schema.org/text');
    expect(textQuad?.object).toContain('This is test content');
  });

  it('includes author quad reference', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const authorQuad = quads.find((q) => q.predicate === 'https://schema.org/author');
    expect(authorQuad?.object).toBe('urn:author:test-author');
  });

  it('includes dkg:contextGraph quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const ctxQuad = quads.find((q) => q.predicate.includes('contextGraph'));
    expect(ctxQuad?.object).toBe('"ccm-research"');
  });

  it('includes dkg:assertionName quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const assertQuad = quads.find((q) => q.predicate.includes('assertionName'));
    expect(assertQuad?.object).toBe('"artifacts"');
  });

  it('includes dkg:memoryLayer quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const layerQuad = quads.find((q) => q.predicate.includes('memoryLayer'));
    expect(layerQuad?.object).toBe('"working-memory"');
  });

  it('includes agent quad with framework and version', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const agentQuad = quads.find((q) => q.predicate.includes('wm#framework'));
    expect(agentQuad?.object).toBe('"claude-code"');
    const versionQuad = quads.find((q) => q.predicate.includes('schema.org/version'));
    expect(versionQuad?.object).toBe('"1.0.0"');
  });

  it('includes provenance quad reference', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const provQuad = quads.find((q) => q.predicate.includes('wm#provenance'));
    expect(provQuad?.object).toBe('urn:dkg:wm:test-artifact-123/provenance');
  });

  it('includes provenance type quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const provTypeQuad = quads.find((q) => q.subject.includes('provenance') && q.predicate.includes('rdf-syntax-ns#type'));
    expect(provTypeQuad?.object).toBe('https://ontology.origintrail.io/dkg/wm#ProvenanceRecord');
  });

  it('includes provenance source quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const sourceQuad = quads.find((q) => q.predicate.includes('wm#source'));
    expect(sourceQuad?.object).toBe('"chat"');
  });

  it('includes provenance sessionId quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const sessionQuad = quads.find((q) => q.predicate.includes('sessionId'));
    expect(sessionQuad?.object).toBe('"test-session-123"');
  });

  it('includes provenance createdAt quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const createdQuad = quads.find((q) => q.predicate.includes('dateCreated'));
    expect(createdQuad?.object).toBe('"2024-01-15T10:00:00Z"');
  });

  it('includes provenance capturedAt quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const capturedQuad = quads.find((q) => q.predicate.includes('capturedAt'));
    expect(capturedQuad?.object).toBe('"2024-01-15T10:00:00Z"');
  });

  it('includes provenance modifiedAt quad', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const modifiedQuad = quads.find((q) => q.predicate.includes('modifiedAt'));
    expect(modifiedQuad?.object).toBe('"2024-01-15T10:00:00Z"');
  });

  it('includes subAgentId quad when present', () => {
    const artifact = makeArtifact({
      provenance: { ...makeArtifact().provenance, subAgentId: 'agent-abc-123' },
    });
    const quads = serializeToQuads(artifact);
    const subAgentQuad = quads.find((q) => q.predicate.includes('subAgentId'));
    expect(subAgentQuad?.object).toBe('"agent-abc-123"');
  });

  it('includes parentTaskId quad when present', () => {
    const artifact = makeArtifact({
      provenance: { ...makeArtifact().provenance, parentTaskId: 'task-xyz-789' },
    });
    const quads = serializeToQuads(artifact);
    const parentQuad = quads.find((q) => q.predicate.includes('parentTaskId'));
    expect(parentQuad?.object).toBe('"task-xyz-789"');
  });

  it('includes agentRole quad when present', () => {
    const artifact = makeArtifact({
      provenance: { ...makeArtifact().provenance, agentRole: 'researcher' },
    });
    const quads = serializeToQuads(artifact);
    const roleQuad = quads.find((q) => q.predicate.includes('agentRole'));
    expect(roleQuad?.object).toBe('"researcher"');
  });

  it('includes agentFramework quad as claude-code', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const fwQuad = quads.find((q) => q.predicate.includes('agentFramework'));
    expect(fwQuad?.object).toBe('"claude-code"');
  });

  it('omits sub-agent quads when fields are empty strings', () => {
    const artifact = makeArtifact({
      provenance: { ...makeArtifact().provenance, subAgentId: '', parentTaskId: '', agentRole: '' },
    });
    const quads = serializeToQuads(artifact);
    const subAgentQuad = quads.find((q) => q.predicate.includes('subAgentId'));
    expect(subAgentQuad?.object).toBe('""');
  });

  it('includes conversationId quad when present', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const convQuad = quads.find((q) => q.predicate.includes('conversationId'));
    expect(convQuad?.object).toBe('"conv-456"');
  });

  it('omits conversationId quad when undefined', () => {
    const artifact = makeArtifact({
      provenance: { ...makeArtifact().provenance, conversationId: undefined },
    });
    const quads = serializeToQuads(artifact);
    const convQuad = quads.find((q) => q.predicate.includes('conversationId'));
    expect(convQuad).toBeUndefined();
  });

  it('includes workspaceProject quad when present', () => {
    const artifact = makeArtifact({
      provenance: { ...makeArtifact().provenance, workspaceProject: 'my-project' },
    });
    const quads = serializeToQuads(artifact);
    const wsQuad = quads.find((q) => q.predicate.includes('workspaceProject'));
    expect(wsQuad?.object).toBe('"my-project"');
  });

  it('includes toolCall quads for each tool call', () => {
    const artifact = makeArtifact({
      provenance: { ...makeArtifact().provenance, toolCalls: ['tool1', 'tool2', 'tool3'] },
    });
    const quads = serializeToQuads(artifact);
    const toolQuads = quads.filter((q) => q.predicate.includes('toolCall'));
    expect(toolQuads.length).toBe(3);
    expect(toolQuads[0].object).toBe('"tool1"');
  });

  it('includes filePath quads for each file path', () => {
    const artifact = makeArtifact({
      provenance: { ...makeArtifact().provenance, filePaths: ['/path/to/file1.ts', '/path/to/file2.ts'] },
    });
    const quads = serializeToQuads(artifact);
    const fileQuads = quads.filter((q) => q.predicate.includes('filePath'));
    expect(fileQuads.length).toBe(2);
    expect(fileQuads[0].object).toBe('"/path/to/file1.ts"');
  });

  it('includes ual quad when present', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuads(artifact);
    const ualQuad = quads.find((q) => q.predicate.includes('ual'));
    expect(ualQuad?.object).toBe('"ual:test:123"');
  });

  it('omits ual quad when undefined', () => {
    const artifact = makeArtifact({ dkg: { ...makeArtifact().dkg, ual: undefined } });
    const quads = serializeToQuads(artifact);
    const ualQuad = quads.find((q) => q.predicate.includes('ual'));
    expect(ualQuad).toBeUndefined();
  });

  it('escapes special characters in content', () => {
    const artifact = makeArtifact({ content: 'test "quoted" and\nnewline' });
    const quads = serializeToQuads(artifact);
    const textQuad = quads.find((q) => q.predicate === 'https://schema.org/text');
    expect(textQuad?.object).toContain('\\"');
    expect(textQuad?.object).toContain('\\n');
  });
});

describe('serializeToJsonLd()', () => {
  it('creates JSON-LD with @context', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['@context']).toBeDefined();
  });

  it('includes @id with artifactId', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['@id']).toBe('urn:dkg:wm:test-artifact-123');
  });

  it('includes @type as wm:WorkingMemoryArtifact', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['@type']).toBe('wm:WorkingMemoryArtifact');
  });

  it('includes wm:artifactType', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['wm:artifactType']).toBe('research_note');
  });

  it('includes wm:status', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['wm:status']).toBe('draft');
  });

  it('includes schema:name with title', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['schema:name']).toBe('Test Artifact Title');
  });

  it('includes schema:text with content', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['schema:text']).toContain('This is test content');
  });

  it('includes schema:author as object with @id', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['schema:author']['@id']).toBe('urn:author:test-author');
  });

  it('includes wm:agent as object with framework and version', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['wm:agent']['wm:framework']).toBe('claude-code');
    expect(jsonld['wm:agent']['schema:version']).toBe('1.0.0');
  });

  it('includes wm:provenance with all fields', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    const prov = jsonld['wm:provenance'];
    expect(prov['wm:source']).toBe('chat');
    expect(prov['wm:sessionId']).toBe('test-session-123');
    expect(prov['wm:subAgentId']).toBe('');
    expect(prov['wm:agentFramework']).toBe('claude-code');
  });

  it('includes dkg:contextGraph', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['dkg:contextGraph']).toBe('ccm-research');
  });

  it('includes dkg:assertionName', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['dkg:assertionName']).toBe('artifacts');
  });

  it('includes dkg:memoryLayer', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['dkg:memoryLayer']).toBe('working-memory');
  });

  it('includes wm:ual when present', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['wm:ual']).toBe('ual:test:123');
  });

  it('omits wm:ual when undefined', () => {
    const artifact = makeArtifact({ dkg: { ...makeArtifact().dkg, ual: undefined } });
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['wm:ual']).toBeUndefined();
  });
});

describe('serializeStatusUpdateQuads()', () => {
  it('creates status update quads', () => {
    const quads = serializeStatusUpdateQuads('urn:dkg:wm:test', 'validated', '2024-01-16T12:00:00Z');
    expect(quads.length).toBe(2);
    expect(quads[0].predicate).toContain('status');
    expect(quads[0].object).toBe('"validated"');
    expect(quads[1].predicate).toContain('modifiedAt');
    expect(quads[1].object).toBe('"2024-01-16T12:00:00Z"');
  });

  it('uses artifactId for provenance path', () => {
    const quads = serializeStatusUpdateQuads('urn:dkg:wm:abc', 'reviewed', '2024-01-16T12:00:00Z');
    expect(quads[1].subject).toBe('urn:dkg:wm:abc/provenance');
  });
});

describe('buildSessionFilter()', () => {
  it('creates filter for session ID', () => {
    const filter = buildSessionFilter('test-session-123');
    expect(filter).toContain('FILTER');
    expect(filter).toContain('test-session-123');
  });

  it('escapes special characters in session ID', () => {
    const filter = buildSessionFilter('test"quote\nnewline');
    expect(filter).toContain('\\"');
    expect(filter).toContain('\\n');
  });
});
