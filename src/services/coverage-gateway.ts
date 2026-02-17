import { env } from '@/config/env';
import type {
  CoverageCollection,
  CoverageLanguageOption,
  CoverageStatus,
  CoverageVideo,
  CoverageVideoSelectable,
  CoverageVideoUnmappable
} from '@/features/coverage/types';

type RawRecord = Record<string, unknown>;

const AI_MARKERS = ['ai', 'auto', 'generated', 'machine', 'mux'];
const ENGLISH_LANGUAGE_ID = '529';

const COVERAGE_GRAPHQL_HEADERS = {
  'content-type': 'application/json',
  'x-graphql-client-name': 'videoforge-coverage',
  'x-graphql-client-version': process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? ''
};

const COLLECTIONS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const COLLECTIONS_CACHE_MAX_KEYS = 100;
const COLLECTIONS_CACHE_MAX_TOTAL_BYTES = parsePositiveInt(
  process.env.COVERAGE_COLLECTIONS_CACHE_MAX_TOTAL_BYTES,
  30 * 1024 * 1024
);
const COLLECTIONS_CACHE_MAX_ENTRY_BYTES = Math.min(
  COLLECTIONS_CACHE_MAX_TOTAL_BYTES,
  parsePositiveInt(process.env.COVERAGE_COLLECTIONS_CACHE_MAX_ENTRY_BYTES, 3 * 1024 * 1024)
);

type CollectionsCacheEntry = {
  collections: CoverageCollection[];
  expiresAt: number;
  bytes: number;
};

const collectionsCache = new Map<string, CollectionsCacheEntry>();
let collectionsCacheTotalBytes = 0;

class CoverageGatewayError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '');
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function buildCollectionsCacheKey(baseUrl: string, languageIds: string[]): string {
  return `${normalizeBaseUrl(baseUrl)}|${[...languageIds].sort().join(',')}`;
}

function estimateCollectionsCacheBytes(collections: CoverageCollection[]): number {
  return Buffer.byteLength(JSON.stringify(collections), 'utf8');
}

function evictCollectionsCacheKey(key: string): void {
  const entry = collectionsCache.get(key);
  if (!entry) {
    return;
  }

  collectionsCache.delete(key);
  collectionsCacheTotalBytes = Math.max(0, collectionsCacheTotalBytes - entry.bytes);
}

function readCollectionsCache(
  key: string,
  now: number = Date.now()
): CoverageCollection[] | null {
  const entry = collectionsCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now) {
    evictCollectionsCacheKey(key);
    return null;
  }

  // Refresh insertion order to keep most recently used entries hot.
  collectionsCache.delete(key);
  collectionsCache.set(key, entry);
  return entry.collections;
}

function writeCollectionsCache(
  key: string,
  collections: CoverageCollection[],
  now: number = Date.now()
): void {
  const bytes = estimateCollectionsCacheBytes(collections);
  if (bytes > COLLECTIONS_CACHE_MAX_ENTRY_BYTES) {
    return;
  }

  evictCollectionsCacheKey(key);
  collectionsCache.set(key, {
    collections,
    expiresAt: now + COLLECTIONS_CACHE_TTL_MS,
    bytes
  });
  collectionsCacheTotalBytes += bytes;

  while (
    collectionsCache.size > COLLECTIONS_CACHE_MAX_KEYS ||
    collectionsCacheTotalBytes > COLLECTIONS_CACHE_MAX_TOTAL_BYTES
  ) {
    const oldestKey = collectionsCache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    evictCollectionsCacheKey(oldestKey);
  }
}

function asRecord(value: unknown): RawRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as RawRecord;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asMaybeString(value: unknown): string | null {
  const str = asString(value);
  return str ? str : null;
}

function asMaybeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function asPositiveDurationSeconds(value: unknown): number | null {
  const numeric = asMaybeNumber(value);
  if (numeric === null || numeric <= 0) {
    return null;
  }
  return numeric;
}

function getNestedValue(root: RawRecord, path: string[]): unknown {
  let cursor: unknown = root;
  for (const segment of path) {
    if (Array.isArray(cursor)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }

    const next = asRecord(cursor);
    if (!next) {
      return undefined;
    }
    cursor = next[segment];
  }
  return cursor;
}

function getNestedString(root: RawRecord, path: string[]): string {
  return asString(getNestedValue(root, path));
}

function parseStatus(raw: unknown): CoverageStatus {
  const value = asString(raw).toLowerCase();
  if (value === 'human' || value === 'ai' || value === 'none') {
    return value;
  }
  return 'none';
}

function mergeStatus(first: CoverageStatus, second: CoverageStatus): CoverageStatus {
  if (first === 'human' || second === 'human') {
    return 'human';
  }
  if (first === 'ai' || second === 'ai') {
    return 'ai';
  }
  return 'none';
}

function isAiMarker(value: string): boolean {
  const normalized = value.toLowerCase();
  return AI_MARKERS.some((marker) => normalized.includes(marker));
}

function statusFromSubtitleRows(rows: unknown): CoverageStatus {
  const subtitles = asArray<unknown>(rows);
  if (subtitles.length === 0) {
    return 'none';
  }

  let hasAi = false;
  let hasHuman = false;

  for (const row of subtitles) {
    const subtitle = asRecord(row);
    if (!subtitle) {
      continue;
    }
    const edition = asString(subtitle.edition);
    if (!edition) {
      hasHuman = true;
      continue;
    }

    if (isAiMarker(edition)) {
      hasAi = true;
    } else {
      hasHuman = true;
    }
  }

  if (hasHuman) {
    return 'human';
  }
  if (hasAi) {
    return 'ai';
  }
  return 'none';
}

function statusFromVoiceoverVariant(variant: unknown): CoverageStatus {
  const variantRecord = asRecord(variant);
  if (!variantRecord) {
    return 'none';
  }

  const edition = getNestedString(variantRecord, ['videoEdition', 'name']);
  if (!edition) {
    return 'human';
  }
  return isAiMarker(edition) ? 'ai' : 'human';
}

function hasTextValue(value: unknown): boolean {
  return asString(value).length > 0;
}

function metadataStatusFromRecord(record: RawRecord): CoverageStatus {
  const titleRows = asArray<unknown>(record.title);
  const descriptionRows = asArray<unknown>(record.description);
  const studyQuestionRows = asArray<unknown>(record.studyQuestions);
  const bibleRows = asArray<unknown>(record.bibleCitations);
  const keywordRows = asArray<unknown>(record.keywords);

  const hasTitle = titleRows.some((entry) => {
    const row = asRecord(entry);
    return hasTextValue(row?.value);
  });
  const hasDescription = descriptionRows.some((entry) => {
    const row = asRecord(entry);
    return hasTextValue(row?.value);
  });
  const hasQuestions = studyQuestionRows.some((entry) => {
    const row = asRecord(entry);
    return hasTextValue(row?.value);
  });

  const completed = [hasTitle, hasDescription, hasQuestions, bibleRows.length > 0, keywordRows.length > 0].filter(
    Boolean
  ).length;

  if (completed === 0) {
    return 'none';
  }
  if (completed === 5) {
    return 'human';
  }
  return 'ai';
}

function getTextValue(record: RawRecord, field: string, fallback: string): string {
  const rows = asArray<unknown>(record[field]);
  for (const row of rows) {
    const rowRecord = asRecord(row);
    const value = asString(rowRecord?.value);
    if (value) {
      return value;
    }
  }
  return fallback;
}

function getThumbnailUrl(record: RawRecord): string | null {
  const images = asArray<unknown>(record.images);
  for (const image of images) {
    const imageRecord = asRecord(image);
    const value = asMaybeString(imageRecord?.mobileCinematicHigh);
    if (value) {
      return value;
    }
  }
  return null;
}

function resolveWatchUrl(record: RawRecord): string | null {
  const watchBase = env.watchBaseUrl;
  if (!watchBase) {
    return null;
  }

  const variantRecord = asRecord(record.variant);
  const slug = asMaybeString(variantRecord?.slug);
  if (!slug) {
    return null;
  }

  const [videoSlug, languageSlug] = slug.split('/');
  if (!videoSlug || !languageSlug) {
    return null;
  }

  return `${watchBase.replace(/\/$/, '')}/${videoSlug}.html/${languageSlug}.html`;
}

function getMuxAssetIdFromRecord(record: RawRecord): string | null {
  const directCandidates = [
    record.muxAssetId,
    record.assetId,
    record.mux_asset_id,
    record.mux_asset,
    getNestedString(record, ['muxVideo', 'assetId']),
    getNestedString(record, ['mux', 'assetId']),
    getNestedString(record, ['muxAsset', 'id']),
    getNestedString(record, ['variant', 'muxAssetId']),
    getNestedString(record, ['variant', 'muxVideo', 'assetId']),
    getNestedString(record, ['playback', 'assetId'])
  ];

  for (const candidate of directCandidates) {
    const value = asMaybeString(candidate);
    if (value) {
      return value;
    }
  }

  return null;
}

function getDurationSecondsFromRecord(record: RawRecord): number | null {
  const directCandidates: unknown[] = [
    record.durationSeconds,
    record.duration,
    record.runtime,
    record.length,
    getNestedString(record, ['duration', 'seconds']),
    getNestedValue(record, ['durationSeconds'])
  ];

  for (const candidate of directCandidates) {
    const value = asPositiveDurationSeconds(candidate);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function mergeDurationSeconds(first: number | null, second: number | null): number | null {
  if (first === null) {
    return second;
  }
  if (second === null) {
    return first;
  }
  return Math.max(first, second);
}

function toSelectableVideo(base: Omit<CoverageVideoSelectable, 'selectable' | 'unselectableReason' | 'muxAssetId'>, muxAssetId: string): CoverageVideoSelectable {
  return {
    ...base,
    selectable: true,
    muxAssetId,
    unselectableReason: null
  };
}

function toUnmappableVideo(
  base: Omit<CoverageVideoUnmappable, 'selectable' | 'muxAssetId' | 'unselectableReason'>,
  reason: string
): CoverageVideoUnmappable {
  return {
    ...base,
    selectable: false,
    muxAssetId: null,
    unselectableReason: reason
  };
}

function createVideoFromCoverageRecord(record: RawRecord): CoverageVideo {
  const id = asString(record.id) || asString(record.videoId);
  const title = asString(record.title) || id || 'Untitled video';
  const subtitleStatus = parseStatus(record.subtitleStatus);
  const voiceoverStatus = parseStatus(record.voiceoverStatus);
  const metadataStatus = parseStatus(record.metadataStatus ?? record.metaStatus);
  const thumbnailUrl = asMaybeString(record.thumbnailUrl);
  const watchUrl = asMaybeString(record.watchUrl);
  const durationSeconds = getDurationSecondsFromRecord(record);

  const base = {
    id,
    title,
    subtitleStatus,
    voiceoverStatus,
    metadataStatus,
    thumbnailUrl,
    watchUrl,
    durationSeconds
  };

  const muxAssetId = getMuxAssetIdFromRecord(record);
  if (muxAssetId) {
    return toSelectableVideo(base, muxAssetId);
  }

  return toUnmappableVideo(base, 'Missing muxAssetId mapping for this item.');
}

function normalizeCoverageCollectionsFromRest(payload: unknown): CoverageCollection[] {
  const root = asRecord(payload);
  const rawCollections = root ? asArray<unknown>(root.collections ?? root.data) : asArray<unknown>(payload);
  const collections: CoverageCollection[] = [];

  for (const rawCollection of rawCollections) {
    const collection = asRecord(rawCollection);
    if (!collection) {
      continue;
    }

    const id = asString(collection.id);
    if (!id) {
      continue;
    }

    const rawVideos = asArray<unknown>(collection.videos ?? collection.items);
    const videos = rawVideos
      .map((video) => {
        const record = asRecord(video);
        return record ? createVideoFromCoverageRecord(record) : null;
      })
      .filter((video): video is CoverageVideo => Boolean(video));

    collections.push({
      id,
      title: asString(collection.title) || id,
      label: asString(collection.label) || 'collection',
      publishedAt: asMaybeString(collection.publishedAt),
      videos
    });
  }

  return collections;
}

function normalizeLanguageOption(row: unknown): CoverageLanguageOption | null {
  const record = asRecord(row);
  if (!record) {
    return null;
  }

  const id = asString(record.id ?? record.languageId);
  if (!id) {
    return null;
  }

  const englishLabel =
    asString(record.englishLabel) ||
    asString(record.englishName) ||
    asString(record.label) ||
    getNestedString(record, ['name', '0', 'value']) ||
    asString(record.name) ||
    id;

  const nativeLabel =
    asString(record.nativeLabel) ||
    asString(record.nativeName) ||
    getNestedString(record, ['nativeName', '0', 'value']) ||
    '';

  return {
    id,
    englishLabel,
    nativeLabel
  };
}

function normalizeLanguagesFromRest(payload: unknown): CoverageLanguageOption[] {
  const root = asRecord(payload);
  const rows = root ? asArray<unknown>(root.languages ?? root.data) : asArray<unknown>(payload);

  const languages = rows
    .map((row) => normalizeLanguageOption(row))
    .filter((language): language is CoverageLanguageOption => Boolean(language));

  languages.sort((first, second) => first.englishLabel.localeCompare(second.englishLabel));
  return languages;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CoverageGatewayError('Gateway returned a non-JSON response.', response.status || 502);
  }
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store'
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const root = asRecord(payload);
    const errorMessage =
      asString(root?.error) ||
      asString(root?.message) ||
      `Gateway request failed with status ${response.status}.`;
    throw new CoverageGatewayError(errorMessage, response.status);
  }

  return payload;
}

async function requestGraphql(
  baseUrl: string,
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const payload = await requestJson(baseUrl, {
    method: 'POST',
    headers: COVERAGE_GRAPHQL_HEADERS,
    body: JSON.stringify({ query, variables })
  });

  const root = asRecord(payload);
  const errors = asArray<unknown>(root?.errors);
  if (errors.length > 0) {
    const firstError = asRecord(errors[0]);
    throw new CoverageGatewayError(asString(firstError?.message) || 'Gateway GraphQL request failed.', 502);
  }

  return root?.data;
}

function normalizeLanguagesFromGraphqlPayload(payload: unknown): CoverageLanguageOption[] {
  const data = asRecord(payload);
  const rows = asArray<unknown>(data?.languages);

  const options = rows
    .map((row) => {
      const record = asRecord(row);
      if (!record) {
        return null;
      }

      const id = asString(record.id);
      if (!id) {
        return null;
      }

      const englishLabel =
        getNestedString(record, ['name', '0', 'value']) ||
        asString(record.name) ||
        id;

      const nativeLabel =
        getNestedString(record, ['nativeName', '0', 'value']) ||
        '';

      return {
        id,
        englishLabel,
        nativeLabel
      };
    })
    .filter((language): language is CoverageLanguageOption => Boolean(language));

  options.sort((first, second) => first.englishLabel.localeCompare(second.englishLabel));
  return options;
}

function createGraphqlVideo(record: RawRecord): CoverageVideo {
  const base = {
    id: asString(record.id),
    title: getTextValue(record, 'title', asString(record.id) || 'Untitled video'),
    subtitleStatus: statusFromSubtitleRows(record.subtitles),
    voiceoverStatus: statusFromVoiceoverVariant(record.variant),
    metadataStatus: metadataStatusFromRecord(record),
    thumbnailUrl: getThumbnailUrl(record),
    watchUrl: resolveWatchUrl(record),
    durationSeconds: getDurationSecondsFromRecord(record)
  };

  const muxAssetId = getMuxAssetIdFromRecord(record);
  if (muxAssetId) {
    return toSelectableVideo(base, muxAssetId);
  }

  return toUnmappableVideo(base, 'Missing muxAssetId mapping for this item.');
}

function mergeVideos(first: CoverageVideo, second: CoverageVideo): CoverageVideo {
  const mergedBase = {
    id: first.id,
    title: first.title || second.title,
    subtitleStatus: mergeStatus(first.subtitleStatus, second.subtitleStatus),
    voiceoverStatus: mergeStatus(first.voiceoverStatus, second.voiceoverStatus),
    metadataStatus: mergeStatus(first.metadataStatus, second.metadataStatus),
    thumbnailUrl: first.thumbnailUrl ?? second.thumbnailUrl,
    watchUrl: first.watchUrl ?? second.watchUrl,
    durationSeconds: mergeDurationSeconds(first.durationSeconds, second.durationSeconds)
  };

  if (first.selectable) {
    return {
      ...mergedBase,
      selectable: true,
      muxAssetId: first.muxAssetId,
      unselectableReason: null
    };
  }

  if (second.selectable) {
    return {
      ...mergedBase,
      selectable: true,
      muxAssetId: second.muxAssetId,
      unselectableReason: null
    };
  }

  return {
    ...mergedBase,
    selectable: false,
    muxAssetId: null,
    unselectableReason: first.unselectableReason ?? second.unselectableReason ?? 'Missing muxAssetId mapping for this item.'
  };
}

function mergeCollectionRows(collectionsByLanguage: CoverageCollection[][]): CoverageCollection[] {
  const collectionMap = new Map<string, CoverageCollection>();

  for (const languageCollections of collectionsByLanguage) {
    for (const collection of languageCollections) {
      const existingCollection = collectionMap.get(collection.id);
      if (!existingCollection) {
        collectionMap.set(collection.id, {
          ...collection,
          videos: [...collection.videos]
        });
        continue;
      }

      const videoMap = new Map<string, CoverageVideo>();
      for (const video of existingCollection.videos) {
        videoMap.set(video.id, video);
      }

      for (const video of collection.videos) {
        const current = videoMap.get(video.id);
        if (!current) {
          videoMap.set(video.id, video);
          continue;
        }
        videoMap.set(video.id, mergeVideos(current, video));
      }

      collectionMap.set(collection.id, {
        ...existingCollection,
        title: existingCollection.title || collection.title,
        label: existingCollection.label || collection.label,
        publishedAt: existingCollection.publishedAt ?? collection.publishedAt,
        videos: Array.from(videoMap.values())
      });
    }
  }

  return Array.from(collectionMap.values()).sort((first, second) => {
    const firstTs = first.publishedAt ? Date.parse(first.publishedAt) : 0;
    const secondTs = second.publishedAt ? Date.parse(second.publishedAt) : 0;
    return secondTs - firstTs;
  });
}

function hasAtLeastOneSelectableVideo(collections: CoverageCollection[]): boolean {
  return collections.some((collection) =>
    collection.videos.some((video) => video.selectable)
  );
}

function normalizeCollectionsFromGraphqlPayload(payload: unknown): CoverageCollection[] {
  const data = asRecord(payload);
  const rows = asArray<unknown>(data?.videos);

  const collections: CoverageCollection[] = [];

  for (const row of rows) {
    const collection = asRecord(row);
    if (!collection) {
      continue;
    }

    const collectionId = asString(collection.id);
    if (!collectionId) {
      continue;
    }

    const children = asArray<unknown>(collection.children);
    const rawVideos = children.length > 0 ? children : [collection];

    const videos = rawVideos
      .map((rawVideo) => {
        const record = asRecord(rawVideo);
        return record ? createGraphqlVideo(record) : null;
      })
      .filter((video): video is CoverageVideo => Boolean(video));

    collections.push({
      id: collectionId,
      title: getTextValue(collection, 'title', collectionId),
      label: asString(collection.label) || 'collection',
      publishedAt: asMaybeString(collection.publishedAt),
      videos
    });
  }

  return collections;
}

async function fetchCoverageLanguagesFromGraphql(baseUrl: string): Promise<CoverageLanguageOption[]> {
  const query = `
    query CoverageLanguages {
      languages(limit: 2500) {
        id
        name(languageId: "${ENGLISH_LANGUAGE_ID}") {
          value
        }
        nativeName: name(primary: true) {
          value
        }
      }
    }
  `;

  const data = await requestGraphql(baseUrl, query, {});
  return normalizeLanguagesFromGraphqlPayload(data);
}

async function fetchCoverageCollectionsFromGraphql(
  baseUrl: string,
  languageIds: string[]
): Promise<CoverageCollection[]> {
  const query = `
    query CoverageCollections($languageId: ID!) {
      videos(where: { labels: [collection, featureFilm, series, trailer, behindTheScenes], published: true }, limit: 2000) {
        id
        label
        publishedAt
        title(languageId: $languageId, primary: true) {
          value
        }
        description(languageId: $languageId, primary: true) {
          value
        }
        studyQuestions(languageId: $languageId, primary: true) {
          value
        }
        bibleCitations {
          id
        }
        keywords {
          id
        }
        images(aspectRatio: banner) {
          mobileCinematicHigh
        }
        variant(languageId: $languageId) {
          slug
          muxVideo {
            assetId
          }
          videoEdition {
            name
          }
        }
        subtitles(languageId: $languageId) {
          edition
        }
        children {
          id
          title(languageId: $languageId, primary: true) {
            value
          }
          description(languageId: $languageId, primary: true) {
            value
          }
          studyQuestions(languageId: $languageId, primary: true) {
            value
          }
          bibleCitations {
            id
          }
          keywords {
            id
          }
          images(aspectRatio: banner) {
            mobileCinematicHigh
          }
          variant(languageId: $languageId) {
            slug
            muxVideo {
              assetId
            }
            videoEdition {
              name
            }
          }
          subtitles(languageId: $languageId) {
            edition
          }
        }
      }
    }
  `;

  const collectionsByLanguage: CoverageCollection[][] = [];
  for (const languageId of languageIds) {
    const data = await requestGraphql(baseUrl, query, { languageId });
    collectionsByLanguage.push(normalizeCollectionsFromGraphqlPayload(data));
  }

  return mergeCollectionRows(collectionsByLanguage);
}

export function resolveCoverageGatewayBaseUrl(envMap: NodeJS.ProcessEnv = process.env): string | null {
  const primary = envMap.CORE_API_ENDPOINT?.trim();
  const fallback = envMap.NEXT_STAGE_GATEWAY_URL?.trim();
  const url = primary || fallback;
  return url ? normalizeBaseUrl(url) : null;
}

export async function fetchCoverageLanguages(baseUrl: string): Promise<CoverageLanguageOption[]> {
  const restUrl = `${normalizeBaseUrl(baseUrl)}/api/languages`;

  try {
    const payload = await requestJson(restUrl, {
      method: 'GET',
      headers: { 'content-type': 'application/json' }
    });
    const languages = normalizeLanguagesFromRest(payload);
    if (languages.length > 0) {
      return languages;
    }
  } catch (error) {
    if (!(error instanceof CoverageGatewayError) || error.status !== 404) {
      throw error;
    }
  }

  return fetchCoverageLanguagesFromGraphql(normalizeBaseUrl(baseUrl));
}

export async function fetchCoverageCollections(
  baseUrl: string,
  languageIds: string[],
  options?: { forceRefresh?: boolean }
): Promise<CoverageCollection[]> {
  const normalizedLanguageIds = [...new Set(languageIds.map((id) => id.trim()).filter(Boolean))];
  if (normalizedLanguageIds.length === 0) {
    return [];
  }

  const forceRefresh = options?.forceRefresh === true;
  const cacheKey = buildCollectionsCacheKey(baseUrl, normalizedLanguageIds);
  if (!forceRefresh) {
    const cached = readCollectionsCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const url = new URL(`${normalizeBaseUrl(baseUrl)}/api/coverage/collections`);
  url.searchParams.set('languageIds', normalizedLanguageIds.join(','));

  try {
    const payload = await requestJson(url.toString(), {
      method: 'GET',
      headers: { 'content-type': 'application/json' }
    });
    const collections = normalizeCoverageCollectionsFromRest(payload);
    writeCollectionsCache(cacheKey, collections);
    return collections;
  } catch (error) {
    if (!(error instanceof CoverageGatewayError) || error.status !== 404) {
      throw error;
    }
  }

  const fallbackCollections = await fetchCoverageCollectionsFromGraphql(
    normalizeBaseUrl(baseUrl),
    normalizedLanguageIds
  );

  const fallbackHasVideos = fallbackCollections.some(
    (collection) => collection.videos.length > 0
  );
  if (fallbackHasVideos && !hasAtLeastOneSelectableVideo(fallbackCollections)) {
    throw new CoverageGatewayError(
      'Coverage GraphQL fallback did not return muxAssetId mappings for selectable videos.',
      502
    );
  }

  writeCollectionsCache(cacheKey, fallbackCollections);
  return fallbackCollections;
}
