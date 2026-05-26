/**
 * Query Shared Memory tool — search promoted artifacts by keyword.
 *
 * Uses SPARQL to match wm:WorkingMemoryArtifact shape with CONTAINS keyword filter
 * over schema:name and schema:text. Mirrors the search.ts pattern.
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
    PREFIX wm: <https://ontology.origintrail.io/dkg/wm#>
    PREFIX schema: <https://schema.org/>
    PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

    SELECT ?ual ?title ?snippet ?type ?status
    WHERE {
      ?id a wm:WorkingMemoryArtifact ;
          wm:artifactType ?type ;
          wm:status ?status .
      OPTIONAL { ?id schema:name ?title . }
      OPTIONAL { ?id schema:text ?snippet . }
      OPTIONAL { ?id wm:ual ?ual . }
      FILTER(
        CONTAINS(LCASE(?title), LCASE("${escapedQuery}")) ||
        CONTAINS(LCASE(?snippet), LCASE("${escapedQuery}"))
      )
    }
    ORDER BY DESC(?id)
    LIMIT ${clampedLimit}
  `.trim();

  try {
    const result = await deps.client.querySparql(sparql, {
      contextGraphId: deps.config.contextGraph,
      assertionName: deps.config.assertionName,
    });

    const r = result as { result?: { bindings: unknown[] }; results?: { bindings: unknown[] } };
    const bindings = r?.result?.bindings ?? r?.results?.bindings ?? [];

    if (bindings.length === 0) {
      return {
        success: true,
        message: 'No shared memory entries found matching the query.',
        count: 0,
        entries: [],
      };
    }

    // Handles DKG v10 flat format and W3C SPARQL JSON (unit test mocks).
    const raw = (v: unknown): string | undefined => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object' && 'value' in v && typeof (v as { value: unknown }).value === 'string')
        return (v as { value: string }).value;
      return undefined;
    };
    const stripLit = (v: unknown, fallback: string): string => {
      const s = raw(v);
      if (!s) return fallback;
      return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
    };

    const entries = bindings.map((b: unknown) => {
      const binding = b as Record<string, unknown>;
      return {
        ual: raw(binding.ual) ?? 'unknown',
        title: stripLit(binding.title, '(untitled)'),
        snippet: stripLit(binding.snippet, ''),
        type: stripLit(binding.type, 'unknown'),
        status: stripLit(binding.status, 'unknown'),
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
