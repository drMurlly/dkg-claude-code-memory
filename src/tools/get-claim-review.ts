/**
 * get_claim_review tool — retrieve an artifact and return its schema.org ClaimReview JSON-LD.
 */

import { z } from 'zod';
import { DkgUnavailableError } from '../core/dkg-client.js';
import { toClaimReview } from '../core/serializers.js';
import type { ToolDeps, ToolResult } from './types.js';
import type { GetClaimReviewParams } from './types.js';
import type { ArtifactType, ArtifactStatus, SensitivityLevel } from '../types/artifact.js';

export const GetClaimReviewSchema = z.object({
  artifactId: z.string().min(1, 'artifactId is required'),
});

export type GetClaimReviewInput = z.infer<typeof GetClaimReviewSchema>;

/**
 * Extract the local predicate name from a full URI or prefixed predicate.
 * Handles:
 *   - https://ontology.origintrail.io/dkg/wm#artifactType -> artifactType
 *   - https://schema.org/name -> name
 *   - wm:status -> status (prefixed form)
 */
function extractLocalPred(pred: string): string {
  const hashIdx = pred.lastIndexOf('#');
  if (hashIdx !== -1 && hashIdx < pred.length - 1) {
    return pred.slice(hashIdx + 1);
  }
  const slashIdx = pred.lastIndexOf('/');
  if (slashIdx !== -1 && slashIdx < pred.length - 1) {
    return pred.slice(slashIdx + 1);
  }
  const colonIdx = pred.lastIndexOf(':');
  if (colonIdx !== -1 && colonIdx < pred.length - 1) {
    return pred.slice(colonIdx + 1);
  }
  return pred;
}

/**
 * Handle get_claim_review tool invocation.
 * Fetches an artifact by ID and returns its schema.org ClaimReview JSON-LD representation.
 */
export async function handleGetClaimReview(
  params: GetClaimReviewParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const { artifactId } = params;

  if (!artifactId || artifactId.trim().length === 0) {
    return {
      success: false,
      message: 'artifactId is required',
    };
  }

  const safeId = artifactId.replace(/[<>]/g, '');

  const sparql = `
    PREFIX wm: <https://ontology.origintrail.io/dkg/wm#>
    PREFIX schema: <https://schema.org/>
    PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

    SELECT ?pred ?obj
    WHERE {
      <${safeId}> ?pred ?obj
    }
  `.trim();

  try {
    const result = await deps.client.querySparql(sparql, {
      contextGraphId: deps.config.contextGraph,
      assertionName: deps.config.assertionName,
    });

    const bindings = (result as { results?: { bindings: unknown[] } })?.results?.bindings ?? [];

    if (bindings.length === 0) {
      return {
        success: false,
        message: `Artifact not found: ${artifactId}`,
      };
    }

    const artifact: Record<string, string> = {};
    for (const b of bindings) {
      const binding = b as Record<string, { value: string }>;
      const pred = binding.pred?.value;
      const obj = binding.obj?.value;
      if (pred && obj) {
        const localPred = extractLocalPred(pred);
        artifact[localPred] = obj;
      }
    }

    const artifactRecord = {
      artifactId: safeId,
      title: artifact.name ?? 'Untitled',
      content: artifact.text ?? '',
      artifactType: (artifact.artifactType ?? 'raw_capture') as ArtifactType,
      status: (artifact.status ?? 'draft') as ArtifactStatus,
      contentHash: artifact.contentHash ?? '',
      sensitivity: (artifact.accessMode ?? undefined) as SensitivityLevel | undefined,
      author: { id: artifact.author ?? 'unknown' },
      agent: {
        id: artifact.agent ?? 'unknown',
        framework: artifact.framework ?? 'unknown',
        version: artifact.version ?? '0.0.0',
      },
      provenance: {
        source: (artifact.source ?? 'tool') as 'chat' | 'tool' | 'file' | 'manual' | 'api',
        sessionId: artifact.sessionId ?? 'unknown',
        createdAt: artifact.dateCreated ?? new Date().toISOString(),
        capturedAt: artifact.capturedAt ?? new Date().toISOString(),
        modifiedAt: artifact.modifiedAt ?? undefined,
        subAgentId: artifact.subAgentId ?? undefined,
        parentTaskId: artifact.parentTaskId ?? undefined,
        agentRole: artifact.agentRole ?? undefined,
        agentFramework: artifact.agentFramework ?? undefined,
        conversationId: artifact.conversationId ?? undefined,
        workspaceProject: artifact.workspaceProject ?? undefined,
        toolCalls: undefined,
        filePaths: undefined,
      },
      dkg: {
        contextGraph: deps.config.contextGraph,
        assertionName: deps.config.assertionName,
        memoryLayer: 'working-memory' as const,
        ual: artifact.ual ?? undefined,
      },
    };

    const claimReview = toClaimReview(artifactRecord);

    return {
      success: true,
      message: 'ClaimReview generated successfully',
      claimReview,
    };
  } catch (err: unknown) {
    if (err instanceof DkgUnavailableError) {
      return {
        success: false,
        message: `DKG unavailable: ${err.message}`,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `get_claim_review failed: ${msg}`,
    };
  }
}
