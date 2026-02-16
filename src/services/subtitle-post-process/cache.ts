import path from 'node:path';
import { env } from '@/config/env';
import { readJsonFile, updateJsonFile } from '@/lib/json-store';
import type { SubtitlePostProcessOutput } from '@/services/subtitle-post-process/types';

interface SubtitlePostProcessCacheEntry {
  idempotencyKey: string;
  savedAt: string;
  output: SubtitlePostProcessOutput;
}

interface SubtitlePostProcessCacheDb {
  entries: Record<string, SubtitlePostProcessCacheEntry>;
}

const EMPTY_CACHE: SubtitlePostProcessCacheDb = { entries: {} };

function getCachePath(): string {
  return path.join(env.artifactRootPath, 'subtitle-post-process-cache.json');
}

export async function getSubtitlePostProcessCacheEntry(
  idempotencyKey: string
): Promise<SubtitlePostProcessCacheEntry | undefined> {
  const cache = await readJsonFile(getCachePath(), EMPTY_CACHE);
  return cache.entries[idempotencyKey];
}

export async function saveSubtitlePostProcessCacheEntry(
  output: SubtitlePostProcessOutput
): Promise<void> {
  await updateJsonFile(getCachePath(), EMPTY_CACHE, (current) => ({
    entries: {
      ...current.entries,
      [output.idempotencyKey]: {
        idempotencyKey: output.idempotencyKey,
        savedAt: new Date().toISOString(),
        output
      }
    }
  }));
}
