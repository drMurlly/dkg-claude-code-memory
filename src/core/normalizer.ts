/**
 * Artifact normalizer — converts raw capture input into properly structured
 * ArtifactRecord objects with provenance, content hashing, and status classification.
 */

import type { ArtifactRecord, ArtifactType, RawCaptureInput } from '../types/artifact.js';
import type { McpConfig } from '../types/mcp.js';
import { redact } from './redactor.js';
import { buildProvenance, SubAgentContext } from './provenance-builder.js';
import { classifyStatus } from './status-classifier.js';

const PACKAGE_VERSION = '1.0.0';
/** Hard ceiling to keep DKG write payloads reasonable — 500 KB. */
const MAX_CONTENT_LENGTH = 500_000;

function inferType(raw: RawCaptureInput): ArtifactType {
  if (raw.artifactType) return raw.artifactType;
  if (raw.source === 'file') {
    const paths = raw.filePaths ?? [];
    if (paths.some((p) => p.endsWith('.md'))) return 'markdown';
    return 'implementation_log';
  }
  if (raw.source === 'chat') return 'chat';
  if (raw.source === 'tool') return 'research_note';
  return 'other';
}

function generateTitle(content: string, raw: RawCaptureInput): string {
  if (raw.title) return raw.title;
  const trimmed = content.slice(0, 80).trim();
  const wordBoundary = trimmed.lastIndexOf(' ');
  return wordBoundary > 20 ? trimmed.slice(0, wordBoundary) : trimmed.slice(0, 60);
}

export function normalizeArtifact(
  raw: RawCaptureInput,
  config: McpConfig,
  subAgentContext?: SubAgentContext,
): ArtifactRecord | null {
  if (typeof raw.content !== 'string') return null;
  if (raw.content.length < config.minContentLength) return null;
  if (raw.content.length > MAX_CONTENT_LENGTH) return null;

  const redacted = config.redactionEnabled ? redact(raw.content) : raw.content;
  const { contentHash, artifactId, provenance } = buildProvenance(redacted, raw, config, subAgentContext);
  const artifactType = inferType(raw);
  const status = classifyStatus(redacted, artifactType, raw.status);
  const title = generateTitle(redacted, raw);

  return {
    artifactId,
    artifactType,
    title,
    content: redacted,
    contentHash,
    status,
    author: { id: config.authorId },
    agent: { id: config.agentId, framework: 'claude-code', version: PACKAGE_VERSION },
    provenance: {
      ...provenance,
      workspaceProject: raw.workspaceProject ?? config.contextGraph,
    },
    dkg: {
      contextGraph: config.contextGraph,
      assertionName: config.assertionName,
      memoryLayer: 'working-memory',
    },
  };
}
