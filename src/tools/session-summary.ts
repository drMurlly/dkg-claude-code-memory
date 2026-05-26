/**
 * Session-summary tool — get summary of all artifacts in a session.
 */

import type { ToolDeps, ToolResult, SessionSummaryParams } from './types.js';
import { sparqlEscape, resolveLatestStatus } from '../core/serializers.js';

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

    // Handles DKG v10 flat format and W3C SPARQL JSON (unit test mocks).
    const raw = (v: unknown): string | undefined => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object' && 'value' in v && typeof (v as { value: unknown }).value === 'string')
        return (v as { value: string }).value;
      return undefined;
    };
    const stripLit = (v: unknown): string | undefined => {
      const s = raw(v);
      return s && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
    };

    const r = result as { result?: { bindings: unknown[] }; results?: { bindings: unknown[] } };
    const bindings = r?.result?.bindings ?? r?.results?.bindings ?? [];
    const rows = bindings.map((b: unknown) => {
      const binding = b as Record<string, unknown>;
      return {
        id: raw(binding.id),
        name: stripLit(binding.name),
        type: stripLit(binding.type),
        status: stripLit(binding.status),
        capturedAt: stripLit(binding.capturedAt),
      };
    });

    // Append-only updates can return one row per wm:status value; collapse by id
    // (preserving order) and resolve the effective status before counting.
    type Row = { id?: string; name?: string; type?: string; status?: string; capturedAt?: string };
    const byId = new Map<string, { row: Row; statuses: Array<string | undefined> }>();
    const order: string[] = [];
    for (const a of rows as Row[]) {
      const key = a.id ?? `__noid_${order.length}`;
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, { row: a, statuses: [a.status] });
        order.push(key);
      } else {
        existing.statuses.push(a.status);
      }
    }
    const artifacts = order.map((k) => {
      const { row, statuses } = byId.get(k)!;
      return { ...row, status: resolveLatestStatus(statuses) ?? row.status };
    });

    // Calculate type counts on the de-duplicated set
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
