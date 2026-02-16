export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const COLLECTION_CACHE_PREFIX = 'ai-media-collections';

export type CollectionsCacheMeta = {
  dataKey?: string;
  lastUpdated: number;
  expiresAt: number;
};

export type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function buildMetaKey(languageId: string): string {
  return `${COLLECTION_CACHE_PREFIX}-${languageId}`;
}

function buildDataKey(languageId: string, timestamp: number): string {
  return `${COLLECTION_CACHE_PREFIX}-${languageId}-${timestamp}`;
}

export function readCacheMeta(
  languageId: string,
  storage: SessionStorageLike
): CollectionsCacheMeta | null {
  try {
    const rawMeta = storage.getItem(buildMetaKey(languageId));
    if (!rawMeta) {
      return null;
    }

    const meta = JSON.parse(rawMeta) as CollectionsCacheMeta;
    if (!meta?.expiresAt) {
      return null;
    }

    return meta;
  } catch {
    return null;
  }
}

export function readCachedCollections<T>(
  languageId: string,
  storage: SessionStorageLike,
  now: number = Date.now()
): T[] | null {
  try {
    const meta = readCacheMeta(languageId, storage);
    if (!meta?.dataKey || !meta.expiresAt) {
      return null;
    }

    if (now > meta.expiresAt) {
      storage.removeItem(meta.dataKey);
      storage.removeItem(buildMetaKey(languageId));
      return null;
    }

    const rawData = storage.getItem(meta.dataKey);
    if (!rawData) {
      return null;
    }

    const data = JSON.parse(rawData) as T[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function writeCachedCollections<T>(
  languageId: string,
  collections: T[],
  storage: SessionStorageLike,
  now: number = Date.now()
): CollectionsCacheMeta | null {
  try {
    const previousMeta = readCacheMeta(languageId, storage);
    const dataKey = buildDataKey(languageId, now);
    const metaKey = buildMetaKey(languageId);

    if (previousMeta?.dataKey && previousMeta.dataKey !== dataKey) {
      storage.removeItem(previousMeta.dataKey);
    }

    const nextMeta: CollectionsCacheMeta = {
      dataKey,
      lastUpdated: now,
      expiresAt: now + CACHE_TTL_MS
    };

    storage.setItem(dataKey, JSON.stringify(collections));
    storage.setItem(metaKey, JSON.stringify(nextMeta));

    return nextMeta;
  } catch {
    return null;
  }
}

export function clearCachedCollections(
  languageId: string,
  storage: SessionStorageLike
): void {
  try {
    const metaKey = buildMetaKey(languageId);
    const rawMeta = storage.getItem(metaKey);
    if (!rawMeta) {
      return;
    }

    const meta = JSON.parse(rawMeta) as CollectionsCacheMeta;
    if (meta?.dataKey) {
      storage.removeItem(meta.dataKey);
    }
    storage.removeItem(metaKey);
  } catch {
    // Ignore cache clear failures; fetch path remains deterministic.
  }
}
