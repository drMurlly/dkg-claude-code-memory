/**
 * Unit tests for JSON-LD and RDF quad serializers.
 * 
 * This file contains comprehensive tests for:
 * - sparqlEscape() - SPARQL literal escaping
 * - serializeToQuads() - Artifact to RDF quad conversion
 * - serializeToJsonLd() - Artifact to JSON-LD conversion
 * - serializeStatusUpdateQuads() - Status update quads
 * - buildSessionFilter() - SPARQL session filters
 * - toClaimReview() - schema.org ClaimReview serialization
 * - serializeArtifact() - Artifact with derivedFrom support
 */

import { describe, it, expect } from 'vitest';
import {
  serializeToQuads,
  serializeToJsonLd,
  serializeStatusUpdateQuads,
  buildSessionFilter,
  sparqlEscape,
  serializeArtifact,
  serializeToQuadsWithDerivedFrom,
  toClaimReview,
  type ClaimReviewJSON,
} from '../../../src/core/serializers.js';
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

describe('toClaimReview()', () => {
  it('creates ClaimReview with correct @context and @type', () => {
    const artifact = makeArtifact();
    const review = toClaimReview(artifact);
    expect(review['@context']).toBe('https://schema.org/');
    expect(review['@type']).toBe('ClaimReview');
  });

  it('maps artifact.title to name', () => {
    const artifact = makeArtifact();
    artifact.title = 'Security Audit Finding';
    const review = toClaimReview(artifact);
    expect(review.name).toBe('Security Audit Finding');
  });

  it('maps artifact.content to reviewBody', () => {
    const artifact = makeArtifact();
    artifact.content = 'This is a critical vulnerability in the smart contract.';
    const review = toClaimReview(artifact);
    expect(review.reviewBody).toBe('This is a critical vulnerability in the smart contract.');
  });

  it('maps artifact.artifactId to url', () => {
    const artifact = makeArtifact();
    artifact.artifactId = 'urn:dkg:wm:sha256:abc123def456';
    const review = toClaimReview(artifact);
    expect(review.url).toBe('urn:dkg:wm:sha256:abc123def456');
  });

  it('maps artifact.provenance.capturedAt to datePublished', () => {
    const artifact = makeArtifact();
    artifact.provenance.capturedAt = '2024-01-15T10:00:00Z';
    const review = toClaimReview(artifact);
    expect(review.datePublished).toBe('2024-01-15T10:00:00Z');
  });

  it('maps ready_to_share status to ratingValue 5', () => {
    const artifact = makeArtifact();
    artifact.status = 'ready_to_share';
    const review = toClaimReview(artifact);
    expect(review.reviewRating.ratingValue).toBe(5);
  });

  it('maps validated status to ratingValue 4', () => {
    const artifact = makeArtifact();
    artifact.status = 'validated';
    const review = toClaimReview(artifact);
    expect(review.reviewRating.ratingValue).toBe(4);
  });

  it('maps review_needed status to ratingValue 3', () => {
    const artifact = makeArtifact();
    artifact.status = 'review_needed';
    const review = toClaimReview(artifact);
    expect(review.reviewRating.ratingValue).toBe(3);
  });

  it('maps needs_sources status to ratingValue 2', () => {
    const artifact = makeArtifact();
    artifact.status = 'needs_sources';
    const review = toClaimReview(artifact);
    expect(review.reviewRating.ratingValue).toBe(2);
  });

  it('maps draft status to ratingValue 1', () => {
    const artifact = makeArtifact();
    artifact.status = 'draft';
    const review = toClaimReview(artifact);
    expect(review.reviewRating.ratingValue).toBe(1);
  });

  it('maps deprecated status to ratingValue 1', () => {
    const artifact = makeArtifact();
    artifact.status = 'deprecated';
    const review = toClaimReview(artifact);
    expect(review.reviewRating.ratingValue).toBe(1);
  });

  it('maps discarded status to ratingValue 1', () => {
    const artifact = makeArtifact();
    artifact.status = 'discarded';
    const review = toClaimReview(artifact);
    expect(review.reviewRating.ratingValue).toBe(1);
  });

  it('returns complete ClaimReviewJSON structure', () => {
    const artifact = makeArtifact();
    artifact.title = 'Test Finding';
    artifact.content = 'Test content body';
    artifact.status = 'validated';
    artifact.artifactId = 'urn:dkg:wm:test-123';
    artifact.provenance.capturedAt = '2024-01-15T10:00:00Z';
    
    const review = toClaimReview(artifact);
    
    expect(review).toEqual({
      '@context': 'https://schema.org/',
      '@type': 'ClaimReview',
      name: 'Test Finding',
      reviewBody: 'Test content body',
      reviewRating: {
        ratingValue: 4,
      },
      url: 'urn:dkg:wm:test-123',
      datePublished: '2024-01-15T10:00:00Z',
    });
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
    expect(textQuad?.object).toContain('This is test content for the artifact.');
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

  it('includes subAgentId when present', () => {
    const artifact = makeArtifact();
    artifact.provenance.subAgentId = 'sub-agent-456';
    const quads = serializeToQuads(artifact);
    const subAgentQuad = quads.find((q) => q.predicate.includes('subAgentId'));
    expect(subAgentQuad?.object).toBe('"sub-agent-456"');
  });

  it('excludes subAgentId when undefined', () => {
    const artifact = makeArtifact();
    artifact.provenance.subAgentId = undefined;
    const quads = serializeToQuads(artifact);
    const subAgentQuad = quads.find((q) => q.predicate.includes('subAgentId'));
    expect(subAgentQuad).toBeUndefined();
  });

  it('includes parentTaskId when present', () => {
    const artifact = makeArtifact();
    artifact.provenance.parentTaskId = 'parent-task-789';
    const quads = serializeToQuads(artifact);
    const parentTaskQuad = quads.find((q) => q.predicate.includes('parentTaskId'));
    expect(parentTaskQuad?.object).toBe('"parent-task-789"');
  });

  it('includes agentRole when present', () => {
    const artifact = makeArtifact();
    artifact.provenance.agentRole = 'security-researcher';
    const quads = serializeToQuads(artifact);
    const agentRoleQuad = quads.find((q) => q.predicate.includes('agentRole'));
    expect(agentRoleQuad?.object).toBe('"security-researcher"');
  });

  it('includes conversationId when present', () => {
    const artifact = makeArtifact();
    artifact.provenance.conversationId = 'conv-abc123';
    const quads = serializeToQuads(artifact);
    const convQuad = quads.find((q) => q.predicate.includes('conversationId'));
    expect(convQuad?.object).toBe('"conv-abc123"');
  });

  it('includes workspaceProject when present', () => {
    const artifact = makeArtifact();
    artifact.provenance.workspaceProject = 'dkg-claude-code-memory';
    const quads = serializeToQuads(artifact);
    const wsQuad = quads.find((q) => q.predicate.includes('workspaceProject'));
    expect(wsQuad?.object).toBe('"dkg-claude-code-memory"');
  });

  it('includes toolCalls when present', () => {
    const artifact = makeArtifact();
    artifact.provenance.toolCalls = ['slither src/', 'cast call 0x...'];
    const quads = serializeToQuads(artifact);
    const toolCallQuads = quads.filter((q) => q.predicate.includes('toolCall'));
    expect(toolCallQuads.length).toBe(2);
    expect(toolCallQuads[0].object).toBe('"slither src/"');
    expect(toolCallQuads[1].object).toBe('"cast call 0x..."');
  });

  it('includes filePaths when present', () => {
    const artifact = makeArtifact();
    artifact.provenance.filePaths = ['src/file1.ts', 'src/file2.ts'];
    const quads = serializeToQuads(artifact);
    const filePathQuads = quads.filter((q) => q.predicate.includes('filePath'));
    expect(filePathQuads.length).toBe(2);
    expect(filePathQuads[0].object).toBe('"src/file1.ts"');
    expect(filePathQuads[1].object).toBe('"src/file2.ts"');
  });

  it('includes ual when present', () => {
    const artifact = makeArtifact();
    artifact.dkg.ual = 'ual:local:artifacts:ccm-abc123-001';
    const quads = serializeToQuads(artifact);
    const ualQuad = quads.find((q) => q.predicate.includes('ual'));
    expect(ualQuad?.object).toBe('"ual:local:artifacts:ccm-abc123-001"');
  });

  it('excludes ual when undefined', () => {
    const artifact = makeArtifact();
    artifact.dkg.ual = undefined;
    const quads = serializeToQuads(artifact);
    const ualQuad = quads.find((q) => q.predicate.includes('ual'));
    expect(ualQuad).toBeUndefined();
  });

  it('includes schema:accessMode quad when sensitivity is set', () => {
    const artifact = makeArtifact();
    artifact.sensitivity = 'confidential';
    const quads = serializeToQuads(artifact);
    const sensQuad = quads.find((q) => q.predicate.includes('accessMode'));
    expect(sensQuad?.object).toBe('"confidential"');
  });

  it('uses "unknown" sessionId when provenance.sessionId is undefined', () => {
    const artifact = makeArtifact();
    artifact.provenance.sessionId = undefined;
    const quads = serializeToQuads(artifact);
    const sessionQuad = quads.find((q) => q.predicate.includes('sessionId'));
    expect(sessionQuad?.object).toBe('"unknown"');
  });

  it('falls back to capturedAt when provenance.modifiedAt is undefined', () => {
    const artifact = makeArtifact();
    artifact.provenance.modifiedAt = undefined;
    artifact.provenance.capturedAt = '2026-01-01T12:00:00Z';
    const quads = serializeToQuads(artifact);
    const modifiedQuad = quads.find((q) => q.predicate.includes('modifiedAt'));
    expect(modifiedQuad?.object).toBe('"2026-01-01T12:00:00Z"');
  });
});

describe('serializeArtifact()', () => {
  it('creates quads without derivedFrom', () => {
    const artifact = makeArtifact();
    const quads = serializeArtifact(artifact);
    const derivedFromQuads = quads.filter((q) => q.predicate.includes('wasDerivedFrom'));
    expect(derivedFromQuads.length).toBe(0);
  });

  it('creates wasDerivedFrom quads when derivedFrom provided', () => {
    const artifact = makeArtifact();
    const quads = serializeArtifact(artifact, ['urn:dkg:wm:parent-1', 'urn:dkg:wm:parent-2']);
    const derivedFromQuads = quads.filter((q) => q.predicate.includes('wasDerivedFrom'));
    expect(derivedFromQuads.length).toBe(2);
    expect(derivedFromQuads[0].object).toBe('urn:dkg:wm:parent-1');
    expect(derivedFromQuads[1].object).toBe('urn:dkg:wm:parent-2');
  });
});

describe('serializeToQuadsWithDerivedFrom()', () => {
  it('delegates to serializeArtifact', () => {
    const artifact = makeArtifact();
    const quads = serializeToQuadsWithDerivedFrom(artifact, ['urn:dkg:wm:parent-1']);
    const derivedFromQuads = quads.filter((q) => q.predicate.includes('wasDerivedFrom'));
    expect(derivedFromQuads.length).toBe(1);
  });
});

describe('serializeToJsonLd()', () => {
  it('creates correct @context', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['@context']).toBeDefined();
  });

  it('maps artifactId to @id', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['@id']).toBe('urn:dkg:wm:test-artifact-123');
  });

  it('maps artifactType', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['wm:artifactType']).toBe('research_note');
  });

  it('maps status', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['wm:status']).toBe('draft');
  });

  it('maps contentHash', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['wm:contentHash']).toBe('sha256:testhash123');
  });

  it('maps title to schema:name', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['schema:name']).toBe('Test Artifact Title');
  });

  it('maps content to schema:text', () => {
    const artifact = makeArtifact();
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['schema:text']).toContain('This is test content');
  });

  it('includes sensitivity when present', () => {
    const artifact = makeArtifact();
    artifact.sensitivity = 'internal';
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['schema:accessMode']).toBe('internal');
  });

  it('excludes sensitivity when undefined', () => {
    const artifact = makeArtifact();
    artifact.sensitivity = undefined;
    const jsonld = serializeToJsonLd(artifact);
    expect(jsonld['schema:accessMode']).toBeUndefined();
  });

  it('omits wm:ual when dkg.ual is undefined', () => {
    const artifact = makeArtifact();
    artifact.dkg.ual = undefined;
    const jsonld = serializeToJsonLd(artifact);
    expect((jsonld as Record<string, unknown>)['wm:ual']).toBeUndefined();
  });

  it('uses "unknown" for sessionId when provenance.sessionId is undefined', () => {
    const artifact = makeArtifact();
    artifact.provenance.sessionId = undefined;
    const jsonld = serializeToJsonLd(artifact) as Record<string, unknown>;
    const prov = jsonld['wm:provenance'] as Record<string, unknown>;
    expect(prov['wm:sessionId']).toBe('unknown');
  });
});

describe('serializeStatusUpdateQuads()', () => {
  it('creates status update quads', () => {
    const quads = serializeStatusUpdateQuads('urn:dkg:wm:test-artifact-123', 'validated', '2024-01-15T12:00:00Z');
    expect(quads.length).toBe(2);
    expect(quads[0].subject).toBe('urn:dkg:wm:test-artifact-123');
    expect(quads[0].predicate).toBe('https://ontology.origintrail.io/dkg/wm#status');
    expect(quads[0].object).toBe('"validated"');
    expect(quads[1].subject).toBe('urn:dkg:wm:test-artifact-123/provenance');
    expect(quads[1].predicate).toBe('https://ontology.origintrail.io/dkg/wm#modifiedAt');
    expect(quads[1].object).toBe('"2024-01-15T12:00:00Z"');
  });
});

describe('buildSessionFilter()', () => {
  it('creates filter for simple session id', () => {
    const filter = buildSessionFilter('test-session-123');
    expect(filter).toBe('FILTER(?sessionId = "test-session-123")');
  });

  it('escapes special chars in session id', () => {
    const filter = buildSessionFilter('test"\nsession');
    expect(filter).toBe('FILTER(?sessionId = "test\\"\\nsession")');
  });
});
