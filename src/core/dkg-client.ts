/**
 * DKG Working Memory Client
 *
 * Communicates with the DKG v10 daemon HTTP API to create and manage
 * working memory assertions with RDF quad storage.
 */

export class DkgAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DkgAuthError';
  }
}

export class DkgUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DkgUnavailableError';
  }
}

export class DkgApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'DkgApiError';
  }
}

/** RDF quad in N-Quads-compatible JSON format — the format the DKG v10 daemon accepts. */
export interface RdfQuad {
  subject: string;
  predicate: string;
  /** URI (no quotes) or N-Quads literal e.g. `"some string"` */
  object: string;
  graph?: string;
}

export interface DkgClientOptions {
  daemonUrl: string;
  token: string;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: DkgLogger;
  agentAddress?: string;
}

export interface DkgLogger {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
}

interface CreateAssertionReceipt {
  assertionUri?: string;
  ual?: string;
  alreadyExists?: boolean;
}

interface WriteReceipt {
  written?: number;
  ual?: string;
}

export class DkgClient {
  private readonly daemonUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  readonly logger?: DkgLogger;
  private agentAddressCache?: string;

  constructor(options: DkgClientOptions) {
    this.daemonUrl = options.daemonUrl.replace(/\/$/, '');
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.logger = options.logger;
    if (options.agentAddress) this.agentAddressCache = options.agentAddress;
  }

  async getAgentAddress(): Promise<string | undefined> {
    if (this.agentAddressCache) return this.agentAddressCache;
    try {
      const identity = await this.requestWithRetry<{ agentAddress?: string }>('GET', '/api/agent/identity');
      if (identity?.agentAddress) {
        this.agentAddressCache = identity.agentAddress;
        return this.agentAddressCache;
      }
    } catch {
      // non-fatal — queries still work without agentAddress on some node versions
    }
    return undefined;
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.daemonUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: this.headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.status === 401) {
        throw new DkgAuthError(`DKG auth failed (401). Check your bearer token.`);
      }
      if (res.status === 503 || res.status === 502) {
        throw new DkgUnavailableError(`DKG node unavailable (${res.status}). Is the node running?`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new DkgApiError(`DKG API error ${res.status}: ${text}`, res.status);
      }

      const text = await res.text();
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof DkgAuthError || err instanceof DkgUnavailableError || err instanceof DkgApiError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('abort')) {
        throw new DkgUnavailableError(`DKG node unreachable at ${this.daemonUrl}: ${msg}`);
      }
      throw err;
    }
  }

  private async requestWithRetry<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.request<T>(method, path, body);
      } catch (err: unknown) {
        if (!(err instanceof DkgUnavailableError) || attempt === this.maxRetries) throw err;
        lastErr = err;
        const delayMs = (2 ** attempt) * 250;
        this.logger?.info?.(`[dkg-client] Node unavailable, retrying in ${delayMs}ms (attempt ${attempt + 1}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    throw lastErr;
  }

  async createContextGraph(id: string, name: string, description?: string): Promise<void> {
    await this.requestWithRetry<unknown>('POST', '/api/context-graph/create', { id, name, description });
    this.logger?.info?.(`[dkg-client] Context Graph '${id}' created`);
  }

  async ensureContextGraph(id: string, name?: string): Promise<void> {
    try {
      await this.createContextGraph(id, name ?? id);
    } catch (err: unknown) {
      if (err instanceof DkgApiError) {
        if (err.statusCode === 409) return;
        if (err.statusCode === 400) {
          const msg = err.message.toLowerCase();
          if (msg.includes('already exists') || msg.includes('already registered')) return;
        }
      }
      throw err;
    }
  }

  async createAssertion(contextGraphId: string, name: string): Promise<CreateAssertionReceipt> {
    try {
      const receipt = await this.requestWithRetry<CreateAssertionReceipt>('POST', '/api/assertion/create', {
        contextGraphId,
        name,
      });
      this.logger?.info?.(`[dkg-client] Assertion '${name}' created — URI: ${receipt.assertionUri ?? 'none'}`);
      return receipt;
    } catch (err: unknown) {
      if (err instanceof DkgApiError) {
        if (err.statusCode === 409) return { alreadyExists: true };
        if (err.statusCode === 400 && err.message.toLowerCase().includes('already exists')) {
          return { alreadyExists: true };
        }
      }
      throw err;
    }
  }

  async writeAssertion(contextGraphId: string, name: string, quads: RdfQuad[]): Promise<WriteReceipt> {
    const receipt = await this.requestWithRetry<WriteReceipt>('POST', `/api/assertion/${encodeURIComponent(name)}/write`, {
      contextGraphId,
      quads,
    });
    this.logger?.info?.(`[dkg-client] Wrote ${quads.length} quads to '${name}'`);
    return receipt;
  }

  async createOrWriteAssertion(params: {
    contextGraphId: string;
    name: string;
    quads: RdfQuad[];
    assertionExists: boolean;
  }): Promise<{ ual?: string; alreadyExists?: boolean }> {
    if (!params.assertionExists) {
      const receipt = await this.createAssertion(params.contextGraphId, params.name);
      if (!receipt.alreadyExists) {
        await this.writeAssertion(params.contextGraphId, params.name, params.quads);
        return { ual: receipt.assertionUri };
      }
    }
    await this.writeAssertion(params.contextGraphId, params.name, params.quads);
    return {};
  }

  async queryAssertion(contextGraphId: string, name: string): Promise<{ quads: RdfQuad[]; count: number }> {
    return this.requestWithRetry('POST', `/api/assertion/${encodeURIComponent(name)}/query`, {
      contextGraphId,
    });
  }

  async getAssertionHistory(contextGraphId: string, name: string): Promise<unknown> {
    const params = new URLSearchParams({ contextGraphId });
    return this.requestWithRetry<unknown>('GET', `/api/assertion/${encodeURIComponent(name)}/history?${params.toString()}`);
  }

  async promoteAssertion(contextGraphId: string, name: string): Promise<void> {
    await this.requestWithRetry<unknown>('POST', `/api/assertion/${encodeURIComponent(name)}/promote`, {
      contextGraphId,
    });
    this.logger?.info?.(`[dkg-client] Assertion '${name}' promoted to Shared Working Memory`);
  }

  async querySparql(
    sparql: string,
    opts?: {
      contextGraphId?: string;
      view?: 'working-memory' | 'shared-working-memory' | 'verified-memory';
      assertionName?: string;
    },
  ): Promise<unknown> {
    const agentAddress = await this.getAgentAddress();
    return this.requestWithRetry<unknown>('POST', '/api/query', {
      sparql,
      view: opts?.view ?? 'working-memory',
      contextGraphId: opts?.contextGraphId,
      assertionName: opts?.assertionName,
      ...(agentAddress ? { agentAddress } : {}),
    });
  }

  /**
   * Fetch the sensitivity (schema:accessMode) of an artifact by its ID.
   * Returns the sensitivity value ('public', 'internal', 'confidential') or null if not set.
   * Uses a lightweight SPARQL query — only fetches the single predicate needed.
   */
  async getArtifactSensitivity(artifactId: string): Promise<string | null> {
    const safeId = artifactId.replace(/[<>]/g, '');
    const sparql = `
      PREFIX schema: <https://schema.org/>
      SELECT ?accessMode
      WHERE {
        <${safeId}> schema:accessMode ?accessMode
      }
    `.trim();

    try {
      const result = await this.querySparql(sparql, {
        contextGraphId: undefined,
        view: 'working-memory',
      });
      const bindings = (result as { results?: { bindings: Array<Record<string, { value: string }>> } })?.results?.bindings ?? [];
      if (bindings.length > 0 && bindings[0].accessMode?.value) {
        return bindings[0].accessMode.value;
      }
      return null;
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<unknown> {
    return this.requestWithRetry<unknown>('GET', '/api/status');
  }
}
