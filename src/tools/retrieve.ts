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

    const bindings = (result as { results?: { bindings: unknown[] } })?.results?.bindings ?? [];

    if (bindings.length === 0) {
      return {
        success: false,
        message: `Artifact not found: ${artifactId}`,
      };
    }

    // Parse into flat object
    const artifact: Record<string, string> = {};
    for (const b of bindings) {
      const binding = b as Record<string, { value: string }>;
      const pred = binding.pred?.value;
      const obj = binding.obj?.value;
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
