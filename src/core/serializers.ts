/**
 * JSON-LD and RDF Quad serializers for DKG Working Memory artifacts.
 *
 * Converts ArtifactRecord objects into the RDF quad format expected by
 * the DKG v10 daemon, as well as JSON-LD representations.
 */

import type { ArtifactRecord } from '../types/artifact.js';
import type { RdfQuad } from './dkg-client.js';

const CONTEXT = {
  dkg: 'https://ontology.origintrail.io/dkg/1.0#',
  wm: 'https://ontology.origintrail.io/dkg/wm#',
  schema: 'https://schema.org/',
  prov: 'http://www.w3.org/ns/prov#',
};

const WM = 'https://ontology.origintrail.io/dkg/wm#';
const SCHEMA = 'https://schema.org/';
const DKG = 'https://ontology.origintrail.io/dkg/1.0#';
const PROV = 'http://www.w3.org/ns/prov#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * Escape a string value for safe interpolation into SPARQL queries.
 * Escapes: backslash, double-quote, newline, carriage-return, tab.
 */
export function sparqlEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

/** Escape a string value for use as an N-Quads literal object (SPARQL 1.1 §19.8). */
function lit(value: string): string {
  return '"' + sparqlEscape(value) + '"';
}

/**
 * Serialize an ArtifactRecord to the RDF quad format expected by the DKG v10 daemon.
 * Each quad has { subject, predicate, object } where object is either a URI or
 * an N-Quads literal (string wrapped in double-quotes).
 */
export function serializeToQuads(artifact: ArtifactRecord): RdfQuad[] {
  const s = artifact.artifactId;
  const provenanceId = `${s}/provenance`;
  const agentId = `urn:agent:${artifact.agent.id}`;
  const authorId = `urn:author:${artifact.author.id}`;

  const quads: RdfQuad[] = [
    // Core type
    { subject: s, predicate: RDF_TYPE, object: `${WM}WorkingMemoryArtifact` },
    // Artifact fields
    { subject: s, predicate: `${WM}artifactType`, object: lit(artifact.artifactType) },
    { subject: s, predicate: `${WM}status`, object: lit(artifact.status) },
    { subject: s, predicate: `${WM}contentHash`, object: lit(artifact.contentHash) },
    { subject: s, predicate: `${SCHEMA}name`, object: lit(artifact.title) },
    { subject: s, predicate: `${SCHEMA}text`, object: lit(artifact.content) },
    { subject: s, predicate: `${SCHEMA}author`, object: authorId },
    // Sensitivity / accessMode (schema.org) - only emit if present
    ...(artifact.sensitivity ? [{ subject: s, predicate: `${SCHEMA}accessMode`, object: lit(artifact.sensitivity) }] : []),
    // DKG metadata
    { subject: s, predicate: `${DKG}contextGraph`, object: lit(artifact.dkg.contextGraph) },
    { subject: s, predicate: `${DKG}assertionName`, object: lit(artifact.dkg.assertionName) },
    { subject: s, predicate: `${DKG}memoryLayer`, object: lit(artifact.dkg.memoryLayer) },
    // Agent
    { subject: s, predicate: `${WM}agent`, object: agentId },
    { subject: agentId, predicate: RDF_TYPE, object: `${WM}Agent` },
    { subject: agentId, predicate: `${WM}framework`, object: lit(artifact.agent.framework) },
    { subject: agentId, predicate: `${SCHEMA}version`, object: lit(artifact.agent.version) },
    // Provenance
    { subject: s, predicate: `${WM}provenance`, object: provenanceId },
    { subject: provenanceId, predicate: RDF_TYPE, object: `${WM}ProvenanceRecord` },
    { subject: provenanceId, predicate: `${WM}source`, object: lit(artifact.provenance.source) },
    { subject: provenanceId, predicate: `${WM}sessionId`, object: lit(artifact.provenance.sessionId ?? 'unknown') },
    { subject: provenanceId, predicate: `${SCHEMA}dateCreated`, object: lit(artifact.provenance.createdAt) },
    { subject: provenanceId, predicate: `${WM}capturedAt`, object: lit(artifact.provenance.capturedAt) },
    { subject: provenanceId, predicate: `${WM}modifiedAt`, object: lit(artifact.provenance.modifiedAt ?? artifact.provenance.capturedAt) },
    // Sub-agent provenance fields - only emit if truthy (B3 fix)
    { subject: provenanceId, predicate: `${WM}agentFramework`, object: lit(artifact.provenance.agentFramework) },
  ];

  if (artifact.provenance.subAgentId) {
    quads.push({ subject: provenanceId, predicate: `${WM}subAgentId`, object: lit(artifact.provenance.subAgentId) });
  }
  if (artifact.provenance.parentTaskId) {
    quads.push({ subject: provenanceId, predicate: `${WM}parentTaskId`, object: lit(artifact.provenance.parentTaskId) });
  }
  if (artifact.provenance.agentRole) {
    quads.push({ subject: provenanceId, predicate: `${WM}agentRole`, object: lit(artifact.provenance.agentRole) });
  }
  if (artifact.provenance.conversationId) {
    quads.push({ subject: provenanceId, predicate: `${WM}conversationId`, object: lit(artifact.provenance.conversationId) });
  }
  if (artifact.provenance.workspaceProject) {
    quads.push({ subject: provenanceId, predicate: `${WM}workspaceProject`, object: lit(artifact.provenance.workspaceProject) });
  }
  if (artifact.provenance.toolCalls && artifact.provenance.toolCalls.length > 0) {
    for (const call of artifact.provenance.toolCalls) {
      quads.push({ subject: provenanceId, predicate: `${WM}toolCall`, object: lit(call) });
    }
  }
  if (artifact.provenance.filePaths && artifact.provenance.filePaths.length > 0) {
    for (const path of artifact.provenance.filePaths) {
      quads.push({ subject: provenanceId, predicate: `${WM}filePath`, object: lit(path) });
    }
  }
  if (artifact.dkg.ual) {
    quads.push({ subject: s, predicate: `${WM}ual`, object: lit(artifact.dkg.ual) });
  }

  return quads;
}

/**
 * Serialize an ArtifactRecord to RDF quads, optionally emitting prov:wasDerivedFrom quads
 * for each ID in the derivedFrom array.
 * @param artifact - The artifact record to serialize
 * @param derivedFrom - Optional array of artifact IDs this artifact was derived from
 * @returns Array of RDF quads including prov:wasDerivedFrom relationships if derivedFrom is provided
 */
export function serializeArtifact(
  artifact: ArtifactRecord,
  derivedFrom?: string[]
): RdfQuad[] {
  const quads = serializeToQuads(artifact);
  const s = artifact.artifactId;

  if (derivedFrom && derivedFrom.length > 0) {
    for (const derivedFromId of derivedFrom) {
      quads.push({
        subject: s,
        predicate: `${PROV}wasDerivedFrom`,
        object: derivedFromId,
      });
    }
  }

  return quads;
}

/**
 * Serialize an ArtifactRecord with derivedFrom provenance chains to RDF quads.
 * Emits one prov:wasDerivedFrom quad per ID in the derivedFrom array.
 * @param artifact - The artifact record to serialize
 * @param derivedFrom - Optional array of artifact IDs this artifact was derived from
 * @returns Array of RDF quads including prov:wasDerivedFrom relationships
 * @deprecated Use serializeArtifact() instead
 */
export function serializeToQuadsWithDerivedFrom(
  artifact: ArtifactRecord,
  derivedFrom?: string[]
): RdfQuad[] {
  return serializeArtifact(artifact, derivedFrom);
}

export function serializeToJsonLd(artifact: ArtifactRecord): Record<string, unknown> {
  return {
    '@context': CONTEXT,
    '@id': artifact.artifactId,
    '@type': 'wm:WorkingMemoryArtifact',
    'wm:artifactType': artifact.artifactType,
    'wm:status': artifact.status,
    'wm:contentHash': artifact.contentHash,
    'schema:name': artifact.title,
    'schema:text': artifact.content,
    ...(artifact.sensitivity ? { 'schema:accessMode': artifact.sensitivity } : {}),
    'schema:author': { '@id': `urn:author:${artifact.author.id}` },
    'wm:agent': {
      '@id': `urn:agent:${artifact.agent.id}`,
      'wm:framework': artifact.agent.framework,
      'schema:version': artifact.agent.version,
    },
    'wm:provenance': {
      '@type': 'wm:ProvenanceRecord',
      'wm:source': artifact.provenance.source,
      'wm:sessionId': artifact.provenance.sessionId ?? 'unknown',
      'wm:conversationId': artifact.provenance.conversationId,
      'wm:workspaceProject': artifact.provenance.workspaceProject,
      'wm:subAgentId': artifact.provenance.subAgentId,
      'wm:parentTaskId': artifact.provenance.parentTaskId,
      'wm:agentRole': artifact.provenance.agentRole,
      'wm:agentFramework': artifact.provenance.agentFramework,
      'schema:dateCreated': artifact.provenance.createdAt,
      'wm:capturedAt': artifact.provenance.capturedAt,
      'wm:modifiedAt': artifact.provenance.modifiedAt,
    },
    'dkg:contextGraph': artifact.dkg.contextGraph,
    'dkg:assertionName': artifact.dkg.assertionName,
    'dkg:memoryLayer': artifact.dkg.memoryLayer,
    ...(artifact.dkg.ual ? { 'wm:ual': artifact.dkg.ual } : {}),
  };
}

export function serializeStatusUpdateQuads(
  artifactId: string,
  newStatus: string,
  modifiedAt: string,
): RdfQuad[] {
  const provenanceId = `${artifactId}/provenance`;
  return [
    { subject: artifactId, predicate: `${WM}status`, object: lit(newStatus) },
    { subject: provenanceId, predicate: `${WM}modifiedAt`, object: lit(modifiedAt) },
  ];
}

/**
 * Build SPARQL filter string for session-based queries.
 */
export function buildSessionFilter(sessionId: string): string {
  const escaped = sparqlEscape(sessionId);
  return `FILTER(?sessionId = "${escaped}")`;
}

/**
 * ClaimReview JSON-LD interface for schema.org ClaimReview.
 * Used by OriginTrail Oracle for verifiable claims.
 */
export interface ClaimReviewJSON {
  '@context': 'https://schema.org/';
  '@type': 'ClaimReview';
  name: string;
  reviewBody: string;
  reviewRating: {
    ratingValue: number;
  };
  url: string;
  datePublished: string;
}

/**
 * Map artifact status to ClaimReview rating value.
 * Status mapping:
 * - ready_to_share → 5 (active/high confidence)
 * - validated → 4
 * - review_needed → 3 (pending)
 * - needs_sources → 2
 * - draft, deprecated, discarded → 1 (archived/low confidence)
 */
function statusToRatingValue(status: string): number {
  switch (status) {
    case 'ready_to_share':
      return 5;
    case 'validated':
      return 4;
    case 'review_needed':
      return 3;
    case 'needs_sources':
      return 2;
    case 'draft':
    case 'deprecated':
    case 'discarded':
    default:
      return 1;
  }
}

/**
 * Convert an ArtifactRecord to a schema.org ClaimReview JSON-LD object.
 *
 * Mapping:
 * - artifact.content → reviewBody
 * - artifact.title → name
 * - artifact.status → ratingValue (via statusToRatingValue)
 * - artifact.artifactId → url
 * - artifact.provenance.capturedAt → datePublished
 *
 * @param artifact - The artifact record to convert
 * @returns ClaimReviewJSON object compliant with schema.org ClaimReview
 */
export function toClaimReview(artifact: ArtifactRecord): ClaimReviewJSON {
  return {
    '@context': 'https://schema.org/',
    '@type': 'ClaimReview',
    name: artifact.title,
    reviewBody: artifact.content,
    reviewRating: {
      ratingValue: statusToRatingValue(artifact.status),
    },
    url: artifact.artifactId,
    datePublished: artifact.provenance.capturedAt,
  };
}
