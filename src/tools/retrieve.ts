/**
 * Retrieve tool — fetch full artifact by ID.
 */

import type { ToolDeps, ToolResult, RetrieveParams } from './types.js';

/**
 * Handle retrieve tool invocation.
 */
export async function handleRetrieve(
  params: RetrieveParams,
  deps: ToolDeps,
): Promise<ToolResult> {
  const { artifactId } = params;

  // Validate artifactId
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

    // Handles two response formats from DKG v10:
    //   W3C SPARQL JSON (unit test mocks): { results: { bindings: [{ pred: {value:"..."}, obj: {value:"..."} }] } }
    //   DKG v10 flat: { result: { bindings: [{ pred: "...", obj: "..." }] } }
    const r = result as { result?: { bindings: unknown[] }; results?: { bindings: unknown[] } };
    const bindings = r?.result?.bindings ?? r?.results?.bindings ?? [];

    if (bindings.length === 0) {
      return {
        success: false,
        message: `Artifact not found: ${artifactId}`,
      };
    }

    const raw = (v: unknown): string | undefined => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object' && 'value' in v && typeof (v as { value: unknown }).value === 'string')
        return (v as { value: string }).value;
      return undefined;
    };

    // Parse into flat object
    const artifact: Record<string, string> = {};
    for (const b of bindings) {
      const binding = b as Record<string, unknown>;
      const pred = raw(binding.pred);
      const obj = raw(binding.obj);
      if (pred && obj) {
        // Extract local predicate name (hash-fragment first, then last path segment)
        const sep = pred.includes('#') ? '#' : pred.includes('/') ? '/' : null;
        const localPred = sep ? pred.split(sep).at(-1)! : pred;
        artifact[localPred] = obj;
      }
    }

    return {
      success: true,
      message: 'Artifact retrieved successfully',
      artifact,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Retrieve failed: ${msg}`,
    };
  }
}
