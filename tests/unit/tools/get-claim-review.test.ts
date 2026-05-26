/**
 * Unit tests for get_claim_review tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleGetClaimReview } from '../../../src/tools/get-claim-review.js';
import { DkgUnavailableError } from '../../../src/core/dkg-client.js';
import type { ToolDeps } from '../../../src/tools/types.js';

describe('handleGetClaimReview', () => {
  let mockDeps: ToolDeps;

  beforeEach(() => {
    mockDeps = {
      client: {
        querySparql: vi.fn(),
      } as unknown as ToolDeps['client'],
      dedupeStore: {} as ToolDeps['dedupeStore'],
      config: {
        contextGraph: 'test-graph',
        assertionName: 'test-assertion',
      } as ToolDeps['config'],
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return success with ClaimReview when artifact exists', async () => {
    const mockBindings = [
      { pred: { value: 'https://schema.org/name' }, obj: { value: 'Test Artifact' } },
      { pred: { value: 'https://schema.org/text' }, obj: { value: 'Test content body' } },
      { pred: { value: 'https://ontology.origintrail.io/dkg/wm#artifactType' }, obj: { value: 'vulnerability_finding' } },
      { pred: { value: 'https://ontology.origintrail.io/dkg/wm#status' }, obj: { value: 'validated' } },
      { pred: { value: 'https://ontology.origintrail.io/dkg/wm#contentHash' }, obj: { value: 'abc123' } },
      { pred: { value: 'https://schema.org/dateCreated' }, obj: { value: '2025-01-01T00:00:00Z' } },
      { pred: { value: 'https://ontology.origintrail.io/dkg/wm#capturedAt' }, obj: { value: '2025-01-01T00:00:00Z' } },
      { pred: { value: 'https://ontology.origintrail.io/dkg/wm#source' }, obj: { value: 'manual' } },
      { pred: { value: 'https://ontology.origintrail.io/dkg/wm#sessionId' }, obj: { value: 'test-session' } },
    ];

    (mockDeps.client.querySparql as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: { bindings: mockBindings },
    });

    const result = await handleGetClaimReview({ artifactId: 'urn:test:123' }, mockDeps);

    expect(result.success).toBe(true);
    expect(result.message).toBe('ClaimReview generated successfully');
    expect(result.claimReview).toBeDefined();
    expect(result.claimReview).toMatchObject({
      '@context': 'https://schema.org/',
      '@type': 'ClaimReview',
      name: 'Test Artifact',
      reviewBody: 'Test content body',
      reviewRating: { ratingValue: 4 },
      url: 'urn:test:123',
      datePublished: '2025-01-01T00:00:00Z',
    });
  });

  it('should return not found when artifact has no bindings', async () => {
    (mockDeps.client.querySparql as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: { bindings: [] },
    });

    const result = await handleGetClaimReview({ artifactId: 'urn:test:missing' }, mockDeps);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Artifact not found: urn:test:missing');
  });

  it('should return error when DKG is unavailable', async () => {
    (mockDeps.client.querySparql as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DkgUnavailableError('DKG node unreachable')
    );

    const result = await handleGetClaimReview({ artifactId: 'urn:test:123' }, mockDeps);

    expect(result.success).toBe(false);
    expect(result.message).toContain('DKG unavailable');
  });

  it('should return error when artifactId is empty', async () => {
    const result = await handleGetClaimReview({ artifactId: '' }, mockDeps);

    expect(result.success).toBe(false);
    expect(result.message).toBe('artifactId is required');
  });

  it('should return error when artifactId is whitespace', async () => {
    const result = await handleGetClaimReview({ artifactId: '   ' }, mockDeps);

    expect(result.success).toBe(false);
    expect(result.message).toBe('artifactId is required');
  });

  it('handles colon-prefixed predicates (wm:pred) and plain-string predicates', async () => {
    // wm:status → colon branch in extractLocalPred (no hash, no slash)
    // name → plain-string fallback in extractLocalPred (no hash, no slash, no colon)
    const mockBindings = [
      { pred: { value: 'wm:status' }, obj: { value: 'validated' } },
      { pred: { value: 'name' }, obj: { value: 'Plain Pred Artifact' } },
      { pred: { value: 'https://schema.org/text' }, obj: { value: 'content here' } },
    ];
    (mockDeps.client.querySparql as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: { bindings: mockBindings },
    });

    const result = await handleGetClaimReview({ artifactId: 'urn:test:456' }, mockDeps);

    expect(result.success).toBe(true);
    expect(result.claimReview).toBeDefined();
  });

  it('handles generic errors from querySparql', async () => {
    (mockDeps.client.querySparql as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('SPARQL query failed'),
    );

    const result = await handleGetClaimReview({ artifactId: 'urn:test:789' }, mockDeps);

    expect(result.success).toBe(false);
    expect(result.message).toContain('get_claim_review failed');
  });

  it('handles non-Error thrown values (String(err) branch)', async () => {
    (mockDeps.client.querySparql as ReturnType<typeof vi.fn>).mockRejectedValue('raw string error');

    const result = await handleGetClaimReview({ artifactId: 'urn:test:999' }, mockDeps);

    expect(result.success).toBe(false);
    expect(result.message).toContain('raw string error');
  });

  it('handles SPARQL result with no results property (null-coalesce ?? [] branch)', async () => {
    (mockDeps.client.querySparql as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await handleGetClaimReview({ artifactId: 'urn:test:empty' }, mockDeps);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Artifact not found');
  });

  it('uses default values when artifact fields are missing (name/text/status ?? fallbacks)', async () => {
    // Only provide contentHash — name, text, status all absent → hit ?? 'Untitled', ?? '', ?? 'draft'
    const mockBindings = [
      { pred: { value: 'https://ontology.origintrail.io/dkg/wm#contentHash' }, obj: { value: 'hash999' } },
    ];
    (mockDeps.client.querySparql as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: { bindings: mockBindings },
    });

    const result = await handleGetClaimReview({ artifactId: 'urn:test:minimal' }, mockDeps);

    expect(result.success).toBe(true);
    expect(result.claimReview).toBeDefined();
  });
});
