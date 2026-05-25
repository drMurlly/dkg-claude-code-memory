/**
 * Unit tests for DedupeStore class.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DedupeStore } from '../../../src/core/dedupe-store.js';
import { testConfig } from '../helpers.js';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('DedupeStore', () => {
  let stateDir: string;
  let store: DedupeStore;
  let config: typeof testConfig;

  beforeEach(() => {
    stateDir = `/tmp/dkg-ccm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    config = { ...testConfig, stateDir };
    store = new DedupeStore(config);
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  describe('initial state', () => {
    it('starts with empty store (has returns false)', () => {
      expect(store.has('any-hash')).toBe(false);
    });

    it('starts with size 0', () => {
      expect(store.size()).toBe(0);
    });

    it('isAssertionCreated starts as false', () => {
      expect(store.isAssertionCreated()).toBe(false);
    });

    it('getRecord returns undefined for unknown hash', () => {
      expect(store.getRecord('unknown')).toBeUndefined();
    });
  });

  describe('add and has', () => {
    it('has returns true after add', () => {
      store.add('hash-abc');
      expect(store.has('hash-abc')).toBe(true);
    });

    it('has returns false for different hash', () => {
      store.add('hash-abc');
      expect(store.has('hash-xyz')).toBe(false);
    });

    it('size increments after add', () => {
      store.add('hash-1');
      expect(store.size()).toBe(1);
      store.add('hash-2');
      expect(store.size()).toBe(2);
    });

    it('size does not increment for duplicate hash', () => {
      store.add('hash-1');
      store.add('hash-1');
      expect(store.size()).toBe(1);
    });
  });

  describe('getRecord', () => {
    it('returns entry after add with ual', () => {
      store.add('hash-abc', 'ual:test:123');
      const record = store.getRecord('hash-abc');
      expect(record).toBeDefined();
      expect(record!.ual).toBe('ual:test:123');
      expect(record!.timestamp).toBeDefined();
    });

    it('returns entry with timestamp after add without ual', () => {
      store.add('hash-abc');
      const record = store.getRecord('hash-abc');
      expect(record).toBeDefined();
      expect(record!.ual).toBeUndefined();
      expect(record!.timestamp).toBeDefined();
    });

    it('timestamp is a valid ISO string', () => {
      const before = new Date().toISOString();
      store.add('hash-abc', 'ual:test:123');
      const after = new Date().toISOString();
      const record = store.getRecord('hash-abc')!;
      expect(record.timestamp >= before).toBe(true);
      expect(record.timestamp <= after).toBe(true);
    });
  });

  describe('markAssertionCreated', () => {
    it('isAssertionCreated returns true after markAssertionCreated', () => {
      store.markAssertionCreated();
      expect(store.isAssertionCreated()).toBe(true);
    });
  });

  describe('load', () => {
    it('load with non-existent file is silent (no error)', async () => {
      // stateDir does not exist, file does not exist
      await expect(store.load()).resolves.toBeUndefined();
    });

    it('load with valid JSON file loads data', async () => {
      // Create the state dir and write a valid JSON file
      await mkdir(stateDir, { recursive: true });
      const data = {
        entries: {
          'hash-loaded': { ual: 'ual:loaded:1', timestamp: '2024-01-01T00:00:00Z' },
        },
        assertionCreated: true,
      };
      await writeFile(join(stateDir, 'dedupe.json'), JSON.stringify(data), 'utf-8');

      await store.load();

      expect(store.has('hash-loaded')).toBe(true);
      expect(store.getRecord('hash-loaded')!.ual).toBe('ual:loaded:1');
      expect(store.isAssertionCreated()).toBe(true);
      expect(store.size()).toBe(1);
    });

    it('load with invalid JSON is silent (no error)', async () => {
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, 'dedupe.json'), 'not-valid-json', 'utf-8');

      await expect(store.load()).resolves.toBeUndefined();
    });

    it('load handles missing assertionCreated field (defaults to false)', async () => {
      await mkdir(stateDir, { recursive: true });
      // No assertionCreated field — triggers the ?? false fallback
      const data = { entries: { 'hash-x': { ual: 'ual:x', timestamp: '2024-01-01T00:00:00Z' } } };
      await writeFile(join(stateDir, 'dedupe.json'), JSON.stringify(data), 'utf-8');

      await store.load();

      expect(store.isAssertionCreated()).toBe(false);
      expect(store.has('hash-x')).toBe(true);
    });

    it('load handles missing entries field (defaults to empty)', async () => {
      await mkdir(stateDir, { recursive: true });
      // No entries field — triggers the ?? {} fallback
      const data = { assertionCreated: true };
      await writeFile(join(stateDir, 'dedupe.json'), JSON.stringify(data), 'utf-8');

      await store.load();

      expect(store.isAssertionCreated()).toBe(true);
      expect(store.size()).toBe(0);
    });
  });

  describe('save and load roundtrip', () => {
    it('saves entries to disk and reloads them', async () => {
      store.add('hash-roundtrip', 'ual:roundtrip:1');
      store.markAssertionCreated();

      await store.save();

      const store2 = new DedupeStore(config);
      await store2.load();

      expect(store2.has('hash-roundtrip')).toBe(true);
      expect(store2.getRecord('hash-roundtrip')!.ual).toBe('ual:roundtrip:1');
      expect(store2.isAssertionCreated()).toBe(true);
    });

    it('saves multiple entries', async () => {
      store.add('hash-a', 'ual:a');
      store.add('hash-b', 'ual:b');
      store.add('hash-c');

      await store.save();

      const store2 = new DedupeStore(config);
      await store2.load();

      expect(store2.size()).toBe(3);
      expect(store2.has('hash-a')).toBe(true);
      expect(store2.has('hash-b')).toBe(true);
      expect(store2.has('hash-c')).toBe(true);
    });
  });

  describe('save creates directory when missing (ENOENT path)', () => {
    it('creates stateDir and saves when directory does not exist', async () => {
      // stateDir doesn't exist yet, save should create it
      store.add('hash-new-dir', 'ual:new:1');
      await expect(store.save()).resolves.toBeUndefined();

      // Verify the file was created and is loadable
      const store2 = new DedupeStore(config);
      await store2.load();
      expect(store2.has('hash-new-dir')).toBe(true);
    });
  });

  describe('save rethrows non-ENOENT errors', () => {
    it('rethrows unexpected errors from writeFile', async () => {
      // Create the directory but make the file unwritable by using a path
      // that is a directory (EISDIR error) — stateDir/dedupe.json is a directory
      await mkdir(stateDir, { recursive: true });
      // Create dedupe.json as a directory so writeFile fails with EISDIR
      await mkdir(join(stateDir, 'dedupe.json'), { recursive: true });

      store.add('hash-test');
      await expect(store.save()).rejects.toThrow();
    });
  });
});
