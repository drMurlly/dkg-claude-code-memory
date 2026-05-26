/**
 * Query Shared Memory tool — search DigitalDocument/CreativeWork/Article artifacts via SPARQL.
 */

import type { ToolDeps, ToolResult } from './types.js';
import { sparqlEscape } from '../core/serializers.js';

/**
 * Parameters for query-shared-memory tool.
 */
export interface QuerySharedMemoryParams {
  query: string;
  limit?: number;
}

/**
 * Handle query-shared-memory tool invocation.
 */
export async function handleQuerySharedMemory(
  params: QuerySharedMemoryParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const { query, limit = 10 } = params;

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      message: 'Query parameter is required and must be non-empty.',
    };
  }

  const escapedQuery = sparqlEscape(query);
  const clampedLimit = Math.min(Math.max(1, limit), 100);

  const sparql = `
    PREFIX schema: <https://schema.org/>
    PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

    SELECT ?ual ?title ?snippet ?type
    WHERE {
      GRAPH ?g {
        ?s dkg:ual ?ual .
        OPTIONAL { ?s schema:name ?title . }
        OPTIONAL { ?s schema:description ?snippet . }
        OPTIONAL { ?s dkg:type ?type . }
        FILTER(
          CONTAINS(LCASE(?title), LCASE("${escapedQuery}")) ||
          CONTAINS(LCASE(?snippet), LCASE("${escapedQuery}"))
        )
        FILTER(
          ?type = "schema:DigitalDocument" ||
          ?type = "schema:CreativeWork" ||
          ?type = "schema:Article"
        )
      }
    }
    ORDER BY DESC(?s)
    LIMIT ${clampedLimit}
  `.trim();

  try {
    const result = await deps.client.querySparql(sparql, {
      contextGraphId: deps.config.contextGraph,
      assertionName: deps.config.assertionName,
    });

    const bindings = (result as { results?: { bindings: unknown[] } })?.results?.bindings ?? [];

    if (bindings.length === 0) {
      return {
        success: true,
        message: 'No shared memory entries found matching the query.',
        count: 0,
        entries: [],
      };
    }

    const entries = bindings.map((b: unknown) => {
      const binding = b as Record<string, { value: string }>;
      return {
        ual: binding.ual?.value ?? 'unknown',
        title: binding.title?.value ?? '(untitled)',
        snippet: binding.snippet?.value ?? '',
        type: binding.type?.value ?? 'unknown',
      };
    });

    return {
      success: true,
      message: `Found ${entries.length} shared memory entr${entries.length === 1 ? 'y' : 'ies'}`,
      count: entries.length,
      entries,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Shared memory query failed: ${msg}`,
    };
  }
}
