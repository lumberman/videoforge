import type { LanguageClass, SubtitleOrigin } from '@/services/subtitle-post-process/types';
import path from 'node:path';
import { env } from '@/config/env';
import { updateJsonFile } from '@/lib/json-store';

export interface MuxSubtitleTrackMetadata {
  source: 'ai_post_processed';
  ai_post_processed: boolean;
  subtitleOriginBefore: SubtitleOrigin;
  subtitleOriginAfter: SubtitleOrigin;
  languageClass: LanguageClass;
  languageProfileVersion: 'v1';
  promptVersion: 'v1';
  validatorVersion: 'v1';
  fallbackVersion: 'v1';
  whisperSegmentsSha256: string;
  postProcessInputSha256: string;
  idempotencyKey: string;
}

export interface MuxSubtitleTrackAttachRequest {
  language: string;
  vttUrl: string;
  metadata: MuxSubtitleTrackMetadata;
}

interface MuxSubtitleAttachmentRecord {
  sourceAssetId: string;
  jobId: string;
  language: string;
  idempotencyKey: string;
  playbackId: string;
  attachedAt: string;
}

interface MuxSubtitleAttachmentRegistry {
  attachments: Record<string, MuxSubtitleAttachmentRecord>;
}

const EMPTY_ATTACHMENTS: MuxSubtitleAttachmentRegistry = { attachments: {} };

function getAttachmentRegistryPath(): string {
  return path.join(env.artifactRootPath, 'mux-subtitle-attachment-registry.json');
}

function toAttachmentKey(sourceAssetId: string, idempotencyKey: string): string {
  return `${sourceAssetId}::${idempotencyKey}`;
}

export async function uploadEnrichedAsset(opts: {
  jobId: string;
  sourceAssetId: string;
  artifactUrls: Record<string, string>;
  subtitleTracks?: MuxSubtitleTrackAttachRequest[];
}): Promise<{
  playbackId: string;
  status: 'uploaded';
  textTracksAttached: number;
  textTracksReused: number;
  subtitleTracks: MuxSubtitleTrackAttachRequest[];
}> {
  const playbackId = `playback_${opts.jobId.slice(-8)}`;
  const subtitleTracks = opts.subtitleTracks ?? [];
  let attachedCount = 0;
  let reusedCount = 0;

  await updateJsonFile(getAttachmentRegistryPath(), EMPTY_ATTACHMENTS, (current) => {
    const next = { ...current.attachments };

    for (const track of subtitleTracks) {
      const key = toAttachmentKey(opts.sourceAssetId, track.metadata.idempotencyKey);
      const existing = next[key];
      if (existing) {
        reusedCount += 1;
        continue;
      }

      attachedCount += 1;
      next[key] = {
        sourceAssetId: opts.sourceAssetId,
        jobId: opts.jobId,
        language: track.language,
        idempotencyKey: track.metadata.idempotencyKey,
        playbackId,
        attachedAt: new Date().toISOString()
      };
    }

    return { attachments: next };
  });

  return {
    playbackId,
    status: 'uploaded',
    textTracksAttached: attachedCount,
    textTracksReused: reusedCount,
    subtitleTracks
  };
}
