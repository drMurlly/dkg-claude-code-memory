/**
 * Session-summary tool — get summary of all artifacts in a session.
 */

import type { ToolDeps, ToolResult, SessionSummaryParams } from './types.js';
import { sparqlEscape } from '../core/serializers.js';

/**
 * Handle session-summary tool invocation.
 */
export async function handleSessionSummary(
  params: SessionSummaryParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const sessionId = params.sessionId ?? 'unknown';

  const escapedSessionId = sparqlEscape(sessionId);

  const sparql = `
    PREFIX wm: <https://ontology.origintrail.io/dkg/wm#>
    PREFIX schema: <https://schema.org/>
    PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

    SELECT ?id ?name ?type ?status ?capturedAt
    WHERE {
      ?id a wm:WorkingMemoryArtifact ;
          wm:artifactType ?type ;
          wm:status ?status ;
          wm:provenance ?prov .
      ?prov wm:sessionId "${escapedSessionId}" ;
            wm:capturedAt ?capturedAt .
      OPTIONAL { ?id schema:name ?name }
    }
    ORDER BY DESC(?capturedAt)
    LIMIT 200
  `.trim();

  try {
    const result = await deps.client.querySparql(sparql, {
      contextGraphId: deps.config.contextGraph,
      assertionName: deps.config.assertionName,
    });

    const bindings = (result as { results?: { bindings: unknown[] } })?.results?.bindings ?? [];
    const artifacts = bindings.map((b: unknown) => {
      const binding = b as Record<string, { value: string }>;
      return {
        id: binding.id?.value,
        name: binding.name?.value,
        type: binding.type?.value,
        status: binding.status?.value,
        capturedAt: binding.capturedAt?.value,
      };
    });

    // Calculate type counts
    const typeCounts: Record<string, number> = {};
    for (const a of artifacts) {
      const t = a.type || 'unknown';
      typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    }

    return {
      success: true,
      message: `Session summary for ${sessionId}`,
      sessionId,
      count: artifacts.length,
      artifacts,
      typeCounts,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Session summary failed: ${msg}`,
    };
  }
}
