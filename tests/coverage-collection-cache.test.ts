import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CACHE_TTL_MS,
  clearCachedCollections,
  readCacheMeta,
  readCachedCollections,
  type SessionStorageLike,
  writeCachedCollections
} from '../src/features/coverage/collection-cache';

class MemoryStorage implements SessionStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test('writeCachedCollections removes previous data key before writing replacement', () => {
  const storage = new MemoryStorage();
  const languageId = 'en';

  const firstMeta = writeCachedCollections(
    languageId,
    [{ id: 'c1' }],
    storage,
    1_000
  );
  assert.ok(firstMeta?.dataKey);
  assert.deepEqual(readCachedCollections(languageId, storage, 1_000), [{ id: 'c1' }]);

  const secondMeta = writeCachedCollections(
    languageId,
    [{ id: 'c2' }],
    storage,
    2_000
  );
  assert.ok(secondMeta?.dataKey);
  assert.notEqual(firstMeta?.dataKey, secondMeta?.dataKey);

  assert.equal(storage.getItem(firstMeta?.dataKey ?? ''), null);
  assert.deepEqual(readCachedCollections(languageId, storage, 2_000), [{ id: 'c2' }]);
});

test('readCachedCollections evicts expired data and clearCachedCollections removes active entries', () => {
  const storage = new MemoryStorage();
  const languageId = 'es';
  const start = 3_000;

  writeCachedCollections(languageId, [{ id: 'x' }], storage, start);
  const metaBeforeExpiry = readCacheMeta(languageId, storage);
  assert.ok(metaBeforeExpiry?.dataKey);

  const afterExpiry = start + CACHE_TTL_MS + 1;
  assert.equal(readCachedCollections(languageId, storage, afterExpiry), null);
  assert.equal(readCacheMeta(languageId, storage), null);
  assert.equal(storage.getItem(metaBeforeExpiry?.dataKey ?? ''), null);

  writeCachedCollections(languageId, [{ id: 'y' }], storage, start + 10);
  const metaAfterRewrite = readCacheMeta(languageId, storage);
  assert.ok(metaAfterRewrite?.dataKey);
  assert.deepEqual(readCachedCollections(languageId, storage, start + 10), [{ id: 'y' }]);

  clearCachedCollections(languageId, storage);
  assert.equal(readCacheMeta(languageId, storage), null);
  assert.equal(storage.getItem(metaAfterRewrite?.dataKey ?? ''), null);
});
