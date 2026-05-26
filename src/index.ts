#!/usr/bin/env node
import { startServer } from './server.js';

startServer().catch((err: unknown) => {
  process.stderr.write(`dkg-claude-code-memory: fatal error: ${String(err)}\n`);
  process.exit(1);
});

// Export core modules for programmatic use
export {
  serializeToQuads,
  serializeArtifact,
  serializeToQuadsWithDerivedFrom,
  serializeToJsonLd,
  serializeStatusUpdateQuads,
  buildSessionFilter,
  sparqlEscape,
  toClaimReview,
  type ClaimReviewJSON,
} from './core/serializers.js';

export {
  type ArtifactRecord,
  type ArtifactType,
  type ArtifactStatus,
  type SensitivityLevel,
  type ProvenanceRecord,
  type DkgReceipt,
  type CaptureParams,
  ARTIFACT_TYPES,
  ARTIFACT_STATUSES,
  SENSITIVITY_LEVELS,
} from './types/artifact.js';

export {
  DkgClient,
  DkgAuthError,
  DkgUnavailableError,
  DkgApiError,
  type RdfQuad,
  type DkgClientOptions,
} from './core/dkg-client.js';
