/**
 * Search tool — query artifacts via SPARQL.
 */

import type { ToolDeps, ToolResult, SearchParams } from './types.js';
import { ARTIFACT_TYPES, ARTIFACT_STATUSES } from '../types/artifact.js';
import { sparqlEscape } from '../core/serializers.js';

/**
 * Handle search tool invocation.
 */
export async function handleSearch(
  params: SearchParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const { status, type, keyword, sessionId, limit = 20 } = params;

  // Validate status if provided
  if (status && !ARTIFACT_STATUSES.includes(status)) {
    return {
      success: false,
      message: `Invalid status: ${status}. Must be one of: ${ARTIFACT_STATUSES.join(', ')}`,
    };
  }

  // Validate type if provided
  if (type && !ARTIFACT_TYPES.includes(type)) {
    return {
      success: false,
      message: `Invalid type: ${type}. Must be one of: ${ARTIFACT_TYPES.join(', ')}`,
    };
  }

  // Build SPARQL query
  const filters: string[] = [];

  if (status) {
    filters.push(`?status = "${sparqlEscape(status)}"`);
  }

  if (type) {
    filters.push(`?artifactType = "${sparqlEscape(type)}"`);
  }

  if (sessionId) {
    filters.push(`?sessionId = "${sparqlEscape(sessionId)}"`);
  }

  if (keyword) {
    // Simple keyword search on name and text
    const escapedKeyword = sparqlEscape(keyword);
    filters.push(`CONTAINS(LCASE(?name), LCASE("${escapedKeyword}"))`);
  }

  const filterClause = filters.length > 0
    ? `FILTER(${filters.join(' && ')})`
    : '';

  const sparql = `
    PREFIX wm: <https://ontology.origintrail.io/dkg/wm#>
    PREFIX schema: <https://schema.org/>
    PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

    SELECT ?id ?name ?type ?status ?contentHash ?capturedAt ?sessionId
    WHERE {
      ?id a wm:WorkingMemoryArtifact ;
          wm:artifactType ?type ;
          wm:status ?status ;
          wm:contentHash ?contentHash ;
          wm:provenance ?prov .
      ?prov wm:capturedAt ?capturedAt ;
            wm:sessionId ?sessionId .
      OPTIONAL { ?id schema:name ?name }

      ${filterClause}
    }
    ORDER BY DESC(?capturedAt)
    LIMIT ${Math.min(limit, 100)}
  `.trim();

  try {
    const result = await deps.client.querySparql(sparql, {
      contextGraphId: deps.config.contextGraph,
      assertionName: deps.config.assertionName,
    });

    // Parse results
    const bindings = (result as { results?: { bindings: unknown[] } })?.results?.bindings ?? [];
    const artifacts = bindings.map((b: unknown) => {
      const binding = b as Record<string, { value: string }>;
      return {
        id: binding.id?.value,
        name: binding.name?.value,
        type: binding.type?.value,
        status: binding.status?.value,
        contentHash: binding.contentHash?.value,
        capturedAt: binding.capturedAt?.value,
        sessionId: binding.sessionId?.value,
      };
    });

    return {
      success: true,
      message: `Found ${artifacts.length} artifacts`,
      count: artifacts.length,
      artifacts,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Search failed: ${msg}`,
    };
  }
}
