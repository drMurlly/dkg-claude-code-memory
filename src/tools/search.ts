/**
 * Search tool — query artifacts via SPARQL.
 */

import type { ToolDeps, ToolResult, SearchParams } from './types.js';
import { ARTIFACT_TYPES, ARTIFACT_STATUSES } from '../types/artifact.js';
import { sparqlEscape, resolveLatestStatus } from '../core/serializers.js';

/**
 * Handle search tool invocation.
 */
export async function handleSearch(
  params: SearchParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const { status, type, keyword, sessionId, limit = 20, derivedFromId } = params;

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
    filters.push(`?type = "${sparqlEscape(type)}"`);
  }

  if (sessionId) {
    filters.push(`?sessionId = "${sparqlEscape(sessionId)}"`);
  }

  if (keyword) {
    // Keyword search on name (title) OR text (content)
    const escapedKeyword = sparqlEscape(keyword);
    filters.push(`(CONTAINS(LCASE(?name), LCASE("${escapedKeyword}")) || CONTAINS(LCASE(?text), LCASE("${escapedKeyword}")))`);
  }

  // Build base WHERE clause
  let whereClause = `
    ?id a wm:WorkingMemoryArtifact ;
        wm:artifactType ?type ;
        wm:status ?status ;
        wm:contentHash ?contentHash ;
        wm:provenance ?prov .
    ?prov wm:capturedAt ?capturedAt ;
          wm:sessionId ?sessionId .
    OPTIONAL { ?id schema:name ?name }
    OPTIONAL { ?id schema:text ?text }
  `.trim();

  // Add derivedFrom filter if provided - use ?id (not ?artifact) to match existing variable
  if (derivedFromId) {
    whereClause += `\n      ?id prov:wasDerivedFrom <${sparqlEscape(derivedFromId)}> .`;
  }

  const filterClause = filters.length > 0
    ? `FILTER(${filters.join(' && ')})`
    : '';

  const sparql = `
    PREFIX wm: <https://ontology.origintrail.io/dkg/wm#>
    PREFIX schema: <https://schema.org/>
    PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>
    PREFIX prov: <http://www.w3.org/ns/prov#>

    SELECT ?id ?name ?text ?type ?status ?contentHash ?capturedAt ?sessionId
    WHERE {
      ${whereClause}
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

    // Parse results.
    // Handles two formats:
    //   - DKG v10 flat: { result: { bindings: [{ id: "urn:...", status: "\"draft\"" }] } }
    //   - W3C SPARQL JSON (unit test mocks): { results: { bindings: [{ id: {value:"urn:..."} }] } }
    // raw() extracts a string from either a plain string or a {value:string} object.
    // stripLit() additionally strips N-Quads surrounding double-quotes from DKG literal values.
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
    const artifacts = bindings.map((b: unknown) => {
      const binding = b as Record<string, unknown>;
      return {
        id: raw(binding.id),
        name: stripLit(binding.name),
        text: stripLit(binding.text),
        type: stripLit(binding.type),
        status: stripLit(binding.status),
        contentHash: stripLit(binding.contentHash),
        capturedAt: stripLit(binding.capturedAt),
        sessionId: stripLit(binding.sessionId),
      };
    });

    // An artifact with multiple wm:status quads (append-only updates) yields one row
    // per status. Collapse by id, preserving order, and resolve the effective status.
    type Row = { id?: string; name?: string; text?: string; type?: string; status?: string; contentHash?: string; capturedAt?: string; sessionId?: string };
    const byId = new Map<string, { row: Row; statuses: Array<string | undefined> }>();
    const order: string[] = [];
    for (const a of artifacts as Row[]) {
      const key = a.id ?? `__noid_${order.length}`;
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, { row: a, statuses: [a.status] });
        order.push(key);
      } else {
        existing.statuses.push(a.status);
      }
    }
    const deduped = order.map((k) => {
      const { row, statuses } = byId.get(k)!;
      return { ...row, status: resolveLatestStatus(statuses) ?? row.status };
    });

    return {
      success: true,
      message: `Found ${deduped.length} artifacts`,
      count: deduped.length,
      artifacts: deduped,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Search failed: ${msg}`,
    };
  }
}
