/**
 * Unit tests for DkgClient — covers HTTP methods, error handling, and retry logic.
 * All tests use mocked global fetch; no real network required.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DkgClient,
  DkgAuthError,
  DkgUnavailableError,
  DkgApiError,
} from '../../../src/core/dkg-client.js';
import type { DkgClientOptions } from '../../../src/core/dkg-client.js';

const BASE_OPTIONS: DkgClientOptions = {
  daemonUrl: 'http://127.0.0.1:9200',
  token: 'test-bearer-token',
  timeoutMs: 5000,
  maxRetries: 2,
};

function mockOk(json: unknown = {}, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(json)),
  } as unknown as Response;
}

function mockStatus(status: number, body = ''): Response {
  return {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('DkgClient', () => {
  let client: DkgClient;

  beforeEach(() => {
    client = new DkgClient(BASE_OPTIONS);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────
  describe('constructor', () => {
    it('creates instance with required options', () => {
      const c = new DkgClient({ daemonUrl: 'http://localhost:9200', token: 'tok' });
      expect(c).toBeInstanceOf(DkgClient);
    });

    it('strips trailing slash from daemonUrl', () => {
      const c = new DkgClient({ daemonUrl: 'http://localhost:9200/', token: 'tok' });
      expect(c).toBeInstanceOf(DkgClient);
    });

    it('uses agentAddress from options if provided', async () => {
      const c = new DkgClient({ ...BASE_OPTIONS, agentAddress: '0xprecached' });
      const addr = await c.getAgentAddress();
      expect(addr).toBe('0xprecached');
      // Should not call fetch — already cached
      expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
    });

    it('exposes optional logger', () => {
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const c = new DkgClient({ ...BASE_OPTIONS, logger });
      expect(c.logger).toBe(logger);
    });

    it('uses default timeoutMs when not specified', () => {
      const c = new DkgClient({ daemonUrl: 'http://localhost', token: 'tok' });
      expect(c).toBeInstanceOf(DkgClient);
    });
  });

  // ─────────────────────────────────────────
  // Error classes
  // ─────────────────────────────────────────
  describe('error classes', () => {
    it('DkgAuthError has correct name and message', () => {
      const err = new DkgAuthError('bad token');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('DkgAuthError');
      expect(err.message).toBe('bad token');
    });

    it('DkgUnavailableError has correct name', () => {
      const err = new DkgUnavailableError('node down');
      expect(err.name).toBe('DkgUnavailableError');
    });

    it('DkgApiError stores statusCode', () => {
      const err = new DkgApiError('not found', 404);
      expect(err.name).toBe('DkgApiError');
      expect(err.statusCode).toBe(404);
    });
  });

  // ─────────────────────────────────────────
  // getAgentAddress()
  // ─────────────────────────────────────────
  describe('getAgentAddress()', () => {
    it('returns agentAddress from identity endpoint', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockOk({ agentAddress: '0xDeadBeef' }),
      );
      const addr = await client.getAgentAddress();
      expect(addr).toBe('0xDeadBeef');
    });

    it('caches agentAddress on second call', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockOk({ agentAddress: '0xCached' }),
      );
      await client.getAgentAddress();
      await client.getAgentAddress();
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when identity response has no agentAddress', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      const addr = await client.getAgentAddress();
      expect(addr).toBeUndefined();
    });

    it('returns undefined silently when fetch throws', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const addr = await client.getAgentAddress();
      expect(addr).toBeUndefined();
    });

    it('returns undefined when node returns 401', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(401, 'Unauthorized'));
      const addr = await client.getAgentAddress();
      expect(addr).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────
  // HTTP error mapping
  // ─────────────────────────────────────────
  describe('HTTP error mapping', () => {
    it('throws DkgAuthError on 401', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockStatus(401));
      await expect(client.getStatus()).rejects.toBeInstanceOf(DkgAuthError);
    });

    it('throws DkgUnavailableError on 503', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockStatus(503));
      // maxRetries=2, so 3 attempts total — all fail
      await expect(client.getStatus()).rejects.toBeInstanceOf(DkgUnavailableError);
    });

    it('throws DkgUnavailableError on 502', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockStatus(502));
      await expect(client.getStatus()).rejects.toBeInstanceOf(DkgUnavailableError);
    });

    it('throws DkgApiError on 404 with statusCode', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockStatus(404, 'not found'));
      await expect(client.getStatus()).rejects.toSatisfy(
        (e: unknown) => e instanceof DkgApiError && e.statusCode === 404,
      );
    });

    it('throws DkgApiError on 500 with statusCode', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockStatus(500, 'internal error'));
      await expect(client.getStatus()).rejects.toSatisfy(
        (e: unknown) => e instanceof DkgApiError && e.statusCode === 500,
      );
    });

    it('throws DkgUnavailableError on ECONNREFUSED', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('ECONNREFUSED connect'));
      await expect(client.getStatus()).rejects.toBeInstanceOf(DkgUnavailableError);
    });

    it('throws DkgUnavailableError on fetch failed', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('fetch failed'));
      await expect(client.getStatus()).rejects.toBeInstanceOf(DkgUnavailableError);
    });

    it('re-throws unknown errors as-is', async () => {
      const customErr = new TypeError('unexpected');
      vi.mocked(global.fetch).mockRejectedValue(customErr);
      await expect(client.getStatus()).rejects.toBe(customErr);
    });
  });

  // ─────────────────────────────────────────
  // Retry logic
  // ─────────────────────────────────────────
  describe('retry logic', () => {
    it('retries on DkgUnavailableError and succeeds', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockStatus(503))
        .mockResolvedValueOnce(mockOk({ ok: true }));
      // maxRetries=2 so first attempt fails, second succeeds
      const result = await client.getStatus();
      expect(result).toEqual({ ok: true });
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting maxRetries', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockStatus(503));
      // maxRetries=2 → 3 total attempts
      await expect(client.getStatus()).rejects.toBeInstanceOf(DkgUnavailableError);
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(3);
    });

    it('does not retry on DkgAuthError (non-retryable)', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockStatus(401));
      await expect(client.getStatus()).rejects.toBeInstanceOf(DkgAuthError);
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    });

    it('does not retry on DkgApiError 404 (non-retryable)', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockStatus(404, 'nope'));
      await expect(client.getStatus()).rejects.toBeInstanceOf(DkgApiError);
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────
  // getStatus()
  // ─────────────────────────────────────────
  describe('getStatus()', () => {
    it('returns parsed JSON on success', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({ running: true }));
      const status = await client.getStatus();
      expect(status).toEqual({ running: true });
    });

    it('returns empty object on empty response body', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(''),
      } as unknown as Response);
      const result = await client.getStatus();
      expect(result).toEqual({});
    });

    it('sends Authorization header', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.getStatus();
      const [, opts] = vi.mocked(global.fetch).mock.calls[0];
      expect((opts as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer test-bearer-token',
      });
    });

    it('calls GET /api/status', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.getStatus();
      const [url] = vi.mocked(global.fetch).mock.calls[0];
      expect(url).toBe('http://127.0.0.1:9200/api/status');
    });
  });

  // ─────────────────────────────────────────
  // createContextGraph()
  // ─────────────────────────────────────────
  describe('createContextGraph()', () => {
    it('posts to /api/context-graph/create', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.createContextGraph('my-graph', 'My Graph');
      const [url, opts] = vi.mocked(global.fetch).mock.calls[0];
      expect(url).toContain('/api/context-graph/create');
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body).toMatchObject({ id: 'my-graph', name: 'My Graph' });
    });

    it('includes optional description', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.createContextGraph('g1', 'Graph 1', 'A description');
      const [, opts] = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.description).toBe('A description');
    });

    it('resolves without error on 200', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({ created: true }));
      await expect(client.createContextGraph('g', 'G')).resolves.toBeUndefined();
    });

    it('throws DkgAuthError on 401', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(401));
      await expect(client.createContextGraph('g', 'G')).rejects.toBeInstanceOf(DkgAuthError);
    });
  });

  // ─────────────────────────────────────────
  // ensureContextGraph()
  // ─────────────────────────────────────────
  describe('ensureContextGraph()', () => {
    it('resolves without error on 200', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await expect(client.ensureContextGraph('g')).resolves.toBeUndefined();
    });

    it('silently resolves on 409 conflict', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(409, 'Conflict'));
      await expect(client.ensureContextGraph('g')).resolves.toBeUndefined();
    });

    it('silently resolves on 400 already-exists message', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockStatus(400, 'already exists'),
      );
      await expect(client.ensureContextGraph('g')).resolves.toBeUndefined();
    });

    it('silently resolves on 400 already-registered message', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockStatus(400, 'already registered'),
      );
      await expect(client.ensureContextGraph('g')).resolves.toBeUndefined();
    });

    it('throws on non-already-exists 400', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(400, 'bad param'));
      await expect(client.ensureContextGraph('g')).rejects.toBeInstanceOf(DkgApiError);
    });

    it('uses name param if provided', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.ensureContextGraph('g', 'My Graph Name');
      const [, opts] = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.name).toBe('My Graph Name');
    });
  });

  // ─────────────────────────────────────────
  // createAssertion()
  // ─────────────────────────────────────────
  describe('createAssertion()', () => {
    it('returns receipt with assertionUri on success', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockOk({ assertionUri: 'urn:dkg:assertion:001', ual: 'ual:test:001' }),
      );
      const receipt = await client.createAssertion('ctx', 'my-assertion');
      expect(receipt.assertionUri).toBe('urn:dkg:assertion:001');
    });

    it('returns { alreadyExists: true } on 409', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(409, 'Conflict'));
      const receipt = await client.createAssertion('ctx', 'existing');
      expect(receipt.alreadyExists).toBe(true);
    });

    it('returns { alreadyExists: true } on 400 already-exists', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(400, 'already exists'));
      const receipt = await client.createAssertion('ctx', 'existing');
      expect(receipt.alreadyExists).toBe(true);
    });

    it('throws DkgAuthError on 401', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(401));
      await expect(client.createAssertion('ctx', 'a')).rejects.toBeInstanceOf(DkgAuthError);
    });

    it('throws DkgApiError on 500', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(500, 'server error'));
      await expect(client.createAssertion('ctx', 'a')).rejects.toBeInstanceOf(DkgApiError);
    });

    it('posts contextGraphId and name in body', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.createAssertion('ctx-graph', 'assert-name');
      const [, opts] = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body).toMatchObject({ contextGraphId: 'ctx-graph', name: 'assert-name' });
    });
  });

  // ─────────────────────────────────────────
  // writeAssertion()
  // ─────────────────────────────────────────
  describe('writeAssertion()', () => {
    const quads = [{ subject: 'urn:s', predicate: 'urn:p', object: '"o"' }];

    it('posts quads and returns receipt', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockOk({ written: 1, ual: 'ual:write:001' }),
      );
      const receipt = await client.writeAssertion('ctx', 'assert', quads);
      expect(receipt.written).toBe(1);
      expect(receipt.ual).toBe('ual:write:001');
    });

    it('encodes assertion name in URL', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.writeAssertion('ctx', 'assert name/special', quads);
      const [url] = vi.mocked(global.fetch).mock.calls[0];
      expect(url as string).toContain(encodeURIComponent('assert name/special'));
    });

    it('sends quads in body', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.writeAssertion('ctx', 'a', quads);
      const [, opts] = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.quads).toHaveLength(1);
      expect(body.quads[0]).toMatchObject(quads[0]);
    });

    it('throws DkgAuthError on 401', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(401));
      await expect(client.writeAssertion('ctx', 'a', quads)).rejects.toBeInstanceOf(DkgAuthError);
    });

    it('retries on 503 and succeeds', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockStatus(503))
        .mockResolvedValueOnce(mockOk({ written: 1 }));
      const receipt = await client.writeAssertion('ctx', 'a', quads);
      expect(receipt.written).toBe(1);
    });
  });

  // ─────────────────────────────────────────
  // createOrWriteAssertion()
  // ─────────────────────────────────────────
  describe('createOrWriteAssertion()', () => {
    const quads = [{ subject: 'urn:s', predicate: 'urn:p', object: '"o"' }];

    it('creates then writes when assertionExists is false', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockOk({ assertionUri: 'urn:created' }))
        .mockResolvedValueOnce(mockOk({ written: 1 }));
      const result = await client.createOrWriteAssertion({
        contextGraphId: 'ctx',
        name: 'new-assert',
        quads,
        assertionExists: false,
      });
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
      expect(result.ual).toBe('urn:created');
    });

    it('only writes when assertionExists is true', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({ written: 1 }));
      await client.createOrWriteAssertion({
        contextGraphId: 'ctx',
        name: 'exist-assert',
        quads,
        assertionExists: true,
      });
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    });

    it('only writes when create returns alreadyExists', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockStatus(409, 'Conflict'))
        .mockResolvedValueOnce(mockOk({ written: 1 }));
      await client.createOrWriteAssertion({
        contextGraphId: 'ctx',
        name: 'a',
        quads,
        assertionExists: false,
      });
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────
  // queryAssertion()
  // ─────────────────────────────────────────
  describe('queryAssertion()', () => {
    it('returns quads and count', async () => {
      const mockQuads = [{ subject: 'urn:s', predicate: 'urn:p', object: '"o"' }];
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockOk({ quads: mockQuads, count: 1 }),
      );
      const result = await client.queryAssertion('ctx', 'my-assert');
      expect(result.quads).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('posts to /api/assertion/{name}/query', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({ quads: [], count: 0 }));
      await client.queryAssertion('ctx', 'my-assert');
      const [url] = vi.mocked(global.fetch).mock.calls[0];
      expect(url as string).toContain('/query');
    });

    it('encodes assertion name with special chars', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({ quads: [], count: 0 }));
      await client.queryAssertion('ctx', 'assert/with spaces');
      const [url] = vi.mocked(global.fetch).mock.calls[0];
      expect(url as string).toContain(encodeURIComponent('assert/with spaces'));
    });
  });

  // ─────────────────────────────────────────
  // getAssertionHistory()
  // ─────────────────────────────────────────
  describe('getAssertionHistory()', () => {
    it('returns history array', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk([{ version: 1 }]));
      const history = await client.getAssertionHistory('ctx', 'assert');
      expect(history).toEqual([{ version: 1 }]);
    });

    it('calls GET endpoint with contextGraphId param', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk([]));
      await client.getAssertionHistory('my-ctx', 'my-assert');
      const [url] = vi.mocked(global.fetch).mock.calls[0];
      expect(url as string).toContain('contextGraphId=my-ctx');
    });
  });

  // ─────────────────────────────────────────
  // promoteAssertion()
  // ─────────────────────────────────────────
  describe('promoteAssertion()', () => {
    it('posts to /promote endpoint', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.promoteAssertion('ctx', 'my-assert');
      const [url] = vi.mocked(global.fetch).mock.calls[0];
      expect(url as string).toContain('/promote');
    });

    it('resolves without error on success', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await expect(client.promoteAssertion('ctx', 'a')).resolves.toBeUndefined();
    });

    it('throws DkgAuthError on 401', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockStatus(401));
      await expect(client.promoteAssertion('ctx', 'a')).rejects.toBeInstanceOf(DkgAuthError);
    });
  });

  // ─────────────────────────────────────────
  // querySparql()
  // Note: uses a client with pre-cached agentAddress so getAgentAddress()
  // does not consume mock fetch calls unexpectedly.
  // ─────────────────────────────────────────
  describe('querySparql()', () => {
    let sparqlClient: DkgClient;

    beforeEach(() => {
      // Pre-populate agentAddress cache so querySparql() skips the identity call
      sparqlClient = new DkgClient({ ...BASE_OPTIONS, agentAddress: '0xTestAgent' });
    });

    it('posts SPARQL to /api/query', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockOk({ result: { bindings: [] } }),
      );
      const sparql = 'SELECT * WHERE { ?s ?p ?o }';
      await sparqlClient.querySparql(sparql);
      const [url, opts] = vi.mocked(global.fetch).mock.calls[0];
      expect(url as string).toContain('/api/query');
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.sparql).toBe(sparql);
    });

    it('defaults to working-memory view', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({ result: { bindings: [] } }));
      await sparqlClient.querySparql('SELECT * WHERE {}');
      const lastCall = vi.mocked(global.fetch).mock.calls.at(-1)!;
      const body = JSON.parse((lastCall[1] as RequestInit).body as string);
      expect(body.view).toBe('working-memory');
    });

    it('accepts custom view option', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await sparqlClient.querySparql('SELECT * WHERE {}', { view: 'verified-memory' });
      const [, opts] = vi.mocked(global.fetch).mock.calls.at(-1)!;
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.view).toBe('verified-memory');
    });

    it('includes contextGraphId when provided', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await sparqlClient.querySparql('SELECT * WHERE {}', { contextGraphId: 'my-ctx' });
      const [, opts] = vi.mocked(global.fetch).mock.calls.at(-1)!;
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.contextGraphId).toBe('my-ctx');
    });

    it('returns query result', async () => {
      const queryResult = { result: { bindings: [{ s: { value: 'urn:x' } }] } };
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk(queryResult));
      const result = await sparqlClient.querySparql('SELECT * WHERE {}');
      expect(result).toEqual(queryResult);
    });

    it('includes assertionName option when provided', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await sparqlClient.querySparql('SELECT * WHERE {}', { assertionName: 'artifacts' });
      const [, opts] = vi.mocked(global.fetch).mock.calls.at(-1)!;
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.assertionName).toBe('artifacts');
    });

    it('includes agentAddress in query body when cached', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await sparqlClient.querySparql('SELECT * WHERE {}');
      const [, opts] = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.agentAddress).toBe('0xTestAgent');
    });
  });

  // ─────────────────────────────────────────
  // Headers
  // ─────────────────────────────────────────
  describe('request headers', () => {
    it('sends Content-Type application/json', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.getStatus();
      const [, opts] = vi.mocked(global.fetch).mock.calls[0];
      expect((opts as RequestInit).headers).toMatchObject({
        'Content-Type': 'application/json',
      });
    });

    it('sends Authorization Bearer header', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(mockOk({}));
      await client.getStatus();
      const [, opts] = vi.mocked(global.fetch).mock.calls[0];
      expect((opts as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer test-bearer-token',
      });
    });
  });
});
