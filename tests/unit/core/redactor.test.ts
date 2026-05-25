/**
 * Unit tests for the redactor module.
 * Tests the `redact()` function against all secret patterns.
 */

import { describe, it, expect } from 'vitest';
import { redact } from '../../../src/core/redactor.js';

describe('redact()', () => {
  // ─────────────────────────────────────────
  // OpenAI / Anthropic style sk- tokens
  // ─────────────────────────────────────────
  describe('sk- tokens', () => {
    it('redacts sk- token with 20+ alphanumeric chars', () => {
      const result = redact('key=sk-abcdefghijklmnopqrstuvwxyz123456');
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('sk-abcdefghijklmnopqrstu');
    });

    it('redacts exactly 20 chars after sk-', () => {
      const result = redact('sk-12345678901234567890');
      expect(result).toContain('[REDACTED]');
    });

    it('does not redact sk- with only 19 chars (too short)', () => {
      const result = redact('sk-1234567890123456789');
      // 19 chars — should NOT be redacted (below threshold)
      expect(result).not.toContain('[REDACTED]');
    });

    it('redacts uppercase chars in sk- token', () => {
      const result = redact('sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(result).toContain('[REDACTED]');
    });
  });

  // ─────────────────────────────────────────
  // GitHub tokens
  // ─────────────────────────────────────────
  describe('GitHub tokens', () => {
    it('redacts ghp_ personal access token (36 chars)', () => {
      const token = 'ghp_' + 'A'.repeat(36);
      const result = redact(`my token is ${token}`);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain(token);
    });

    it('redacts ghr_ refresh token (36 chars)', () => {
      const token = 'ghr_' + 'b'.repeat(36);
      const result = redact(`refresh: ${token}`);
      expect(result).toContain('[REDACTED]');
    });

    it('redacts ghs_ server-to-server token (36 chars)', () => {
      const token = 'ghs_' + '1'.repeat(36);
      const result = redact(token);
      expect(result).toContain('[REDACTED]');
    });

    it('does not redact ghp_ with fewer than 36 chars', () => {
      const token = 'ghp_' + 'A'.repeat(35);
      const result = redact(token);
      expect(result).not.toContain('[REDACTED]');
    });
  });

  // ─────────────────────────────────────────
  // Ethereum private keys
  // ─────────────────────────────────────────
  describe('Ethereum private keys (0x + 64 hex)', () => {
    it('redacts 0x-prefixed 64-char hex key', () => {
      const key = '0x' + 'a'.repeat(64);
      const result = redact(`private key: ${key}`);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain(key);
    });

    it('redacts uppercase hex private key', () => {
      const key = '0x' + 'F'.repeat(64);
      const result = redact(key);
      expect(result).toContain('[REDACTED]');
    });

    it('does not redact 0x with fewer than 64 hex chars', () => {
      const key = '0x' + 'a'.repeat(63);
      const result = redact(key);
      expect(result).not.toContain('[REDACTED]');
    });

    it('does not redact 0x address (40 hex chars)', () => {
      const addr = '0x' + 'a'.repeat(40);
      const result = redact(addr);
      expect(result).not.toContain('[REDACTED]');
    });
  });

  // ─────────────────────────────────────────
  // PEM private keys
  // ─────────────────────────────────────────
  describe('PEM keys', () => {
    it('redacts RSA private key block', () => {
      const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
      const result = redact(pem);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('MIIEowIBAAKCAQEA');
    });

    it('redacts PRIVATE KEY block', () => {
      const pem = '-----BEGIN PRIVATE KEY-----\naGVsbG8=\n-----END PRIVATE KEY-----';
      const result = redact(pem);
      expect(result).toContain('[REDACTED]');
    });

    it('redacts CERTIFICATE block', () => {
      const pem = '-----BEGIN CERTIFICATE-----\ndGVzdA==\n-----END CERTIFICATE-----';
      const result = redact(pem);
      expect(result).toContain('[REDACTED]');
    });
  });

  // ─────────────────────────────────────────
  // key=value patterns (password, secret, api_key, token)
  // ─────────────────────────────────────────
  describe('key=value credential patterns', () => {
    it('redacts password= with 8+ char value', () => {
      const result = redact('password=supersecret123');
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('supersecret123');
    });

    it('redacts passwd= pattern', () => {
      const result = redact('passwd=hunter12345');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts secret= pattern', () => {
      const result = redact('secret=mysecretvalue');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts api_key= pattern', () => {
      const result = redact('api_key=abcdefghijkl');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts api-key= pattern', () => {
      const result = redact('api-key=abcdefghijkl');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts apikey= pattern', () => {
      const result = redact('apikey=abcdefghijkl');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts private_key= pattern', () => {
      const result = redact('private_key=myprivatekey123');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts token= pattern', () => {
      const result = redact('token=eyJhbGciOiJIUzI1Ni');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts auth= pattern', () => {
      const result = redact('auth=BasicdXNlcjpwYXNz');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts authorization= pattern', () => {
      const result = redact('authorization=eyJhbGciOiJIUzI1NiJ9tokenvalue');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts password: with colon separator', () => {
      const result = redact('password: supersecret123');
      expect(result).toContain('[REDACTED]');
    });

    it('does not redact short values (fewer than 8 chars)', () => {
      const result = redact('token=abc');
      expect(result).not.toContain('[REDACTED]');
    });

    it('is case-insensitive for keyword matching', () => {
      const result = redact('PASSWORD=supersecretvalue');
      expect(result).toContain('[REDACTED]');
    });
  });

  // ─────────────────────────────────────────
  // Authorization: Bearer header
  // ─────────────────────────────────────────
  describe('Authorization Bearer header', () => {
    it('redacts Authorization: Bearer token', () => {
      const result = redact('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token');
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    });

    it('redacts Bearer token with whitespace variations', () => {
      const result = redact('Authorization:  Bearer mytoken12345');
      expect(result).toContain('[REDACTED]');
    });
  });

  // ─────────────────────────────────────────
  // ENV var patterns (PRIVATE_KEY=, SECRET=, etc.)
  // ─────────────────────────────────────────
  describe('ENV var patterns', () => {
    it('redacts PRIVATE_KEY= env var', () => {
      const result = redact('PRIVATE_KEY=0xdeadbeefcafe123456789012');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts SECRET= env var', () => {
      const result = redact('SECRET=mysupersecretvalue123');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts API_KEY= env var', () => {
      const result = redact('API_KEY=myapikey12345678');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts TOKEN= env var', () => {
      const result = redact('TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts PASSWORD= env var', () => {
      const result = redact('PASSWORD=mysupersecretpassword');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts PRIVATE KEY= (space variant)', () => {
      const result = redact('PRIVATE KEY=mysupersecretprivatekey123');
      expect(result).toContain('[REDACTED]');
    });
  });

  // ─────────────────────────────────────────
  // Multiple secrets in one string
  // ─────────────────────────────────────────
  describe('multiple secrets', () => {
    it('redacts multiple different secrets in same string', () => {
      const input = 'sk-abcdefghijklmnopqrstu and password=secretpass123';
      const result = redact(input);
      expect(result).not.toContain('sk-abcdefghijklmnopqrstu');
      expect(result).not.toContain('secretpass123');
      expect(result.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it('replaces all occurrences of same pattern', () => {
      const input = 'token=abcdefghij token=abcdefghij';
      const result = redact(input);
      expect(result).not.toContain('abcdefghij');
    });
  });

  // ─────────────────────────────────────────
  // Safe content (should not be redacted)
  // ─────────────────────────────────────────
  describe('safe content', () => {
    it('does not redact plain text', () => {
      const text = 'This is a normal research note about smart contracts.';
      expect(redact(text)).toBe(text);
    });

    it('does not redact short password-like tokens under threshold', () => {
      const result = redact('pass=abc');
      expect(result).not.toContain('[REDACTED]');
    });

    it('returns empty string unchanged', () => {
      expect(redact('')).toBe('');
    });

    it('does not redact URLs without credentials', () => {
      const url = 'https://example.com/api/endpoint?format=json';
      expect(redact(url)).toBe(url);
    });

    it('does not redact version strings like 0x10', () => {
      // Short 0x hex — only 2 chars, not 64
      const result = redact('version 0x10 of the protocol');
      expect(result).not.toContain('[REDACTED]');
    });
  });
});
