import {
  appendJobError,
  getJobById,
  mergeArtifacts,
  setJobStatus,
  updateStepStatus
} from '@/data/job-store';
import { syncArtifactsToStrapi } from '@/cms/strapiClient';
import { generateChapters } from '@/services/chapters';
import { generateEmbeddings } from '@/services/embeddings';
import { extractMetadata } from '@/services/metadata';
import { uploadEnrichedAsset } from '@/services/mux';
import type { MuxSubtitleTrackAttachRequest } from '@/services/mux';
import {
  storeBinaryArtifact,
  storeJsonArtifact,
  storeTextArtifact
} from '@/services/storage';
import { getSubtitlePostProcessAllowlist, isAllowedLanguage } from '@/config/subtitle-post-process';
import { isMuxAiError } from '@/services/mux-ai';
import { fetchTranscriptForAsset } from '@/services/mux-data-adapter';
import { runSubtitlePostProcess } from '@/services/subtitle-post-process';
import type {
  SubtitleOrigin,
  SubtitlePostProcessOutput,
  SubtitleSegment
} from '@/services/subtitle-post-process/types';
import { translateTranscript } from '@/services/translation';
import { createVoiceover } from '@/services/voiceover';
import { getWorkflowWorld, type WorkflowWorld } from '@/workflows/world';
import type {
  Chapter,
  EmbeddingVector,
  MetadataResult,
  Transcript,
  TranslationResult
} from '@/types/enrichment';
import type { JobErrorDetails, WorkflowStepName } from '@/types/job';

function toJobErrorDetails(error: unknown): JobErrorDetails | undefined {
  if (!isMuxAiError(error)) {
    return undefined;
  }

  return {
    code: error.code,
    operatorHint: error.operatorHint,
    isDependencyError: error.isDependencyError
  };
}

function isRetryableStepError(error: unknown): boolean {
  if (!isMuxAiError(error)) {
    return true;
  }

  const isDeterministicOperationMismatch =
    error.code === 'MUX_AI_OPERATION_FAILED' &&
    /none of \[.*\] are exported by the module/i.test(error.message);

  return !(
    error.code === 'MUX_AI_CONFIG_MISSING' ||
    error.code === 'MUX_AI_IMPORT_FAILED' ||
    error.code === 'MUX_AI_INVALID_RESPONSE' ||
    isDeterministicOperationMismatch
  );
}

interface SubtitleProcessArtifact {
  language: string;
  output: SubtitlePostProcessOutput;
  vttUrl: string;
  qaReportUrl: string;
  theologyIssuesUrl: string;
  languageQualityDeltasUrl: string;
  attachMetadata: MuxSubtitleTrackAttachRequest;
}

interface SubtitlePostProcessResult {
  primaryVttUrl?: string;
  manifestUrl: string;
  tracks: SubtitleProcessArtifact[];
}

function transcriptToSubtitleSegments(transcript: Transcript): SubtitleSegment[] {
  return transcript.segments.map((segment, index) => ({
    id: `src-${index + 1}`,
    start: segment.startSec,
    end: segment.endSec,
    text: segment.text
  }));
}

function translationToSubtitleSegments(
  translation: TranslationResult,
  fallbackTranscript: Transcript
): SubtitleSegment[] {
  if (translation.segments && translation.segments.length > 0) {
    return translation.segments.map((segment, index) => ({
      id: `tr-${translation.language}-${index + 1}`,
      start: segment.startSec,
      end: segment.endSec,
      text: segment.text
    }));
  }

  const start = fallbackTranscript.segments[0]?.startSec ?? 0;
  const end =
    fallbackTranscript.segments[fallbackTranscript.segments.length - 1]?.endSec ??
    start + 1;
  return [
    {
      id: `tr-${translation.language}-1`,
      start,
      end: Math.max(end, start + 1),
      text: translation.text
    }
  ];
}

async function runSubtitlePostProcessStep(opts: {
  jobId: string;
  muxAssetId: string;
  transcript: Transcript;
  translations?: TranslationResult[];
}): Promise<SubtitlePostProcessResult> {
  const tracks: Array<{
    language: string;
    subtitleOrigin: SubtitleOrigin | undefined;
    segments: SubtitleSegment[];
  }> = [];

  tracks.push({
    language: opts.transcript.language,
    subtitleOrigin: 'ai-raw',
    segments: transcriptToSubtitleSegments(opts.transcript)
  });

  for (const translation of opts.translations ?? []) {
    tracks.push({
      language: translation.language,
      subtitleOrigin: translation.subtitleOrigin,
      segments: translationToSubtitleSegments(translation, opts.transcript)
    });
  }

  const artifacts: SubtitleProcessArtifact[] = [];

  for (const track of tracks) {
    if (!isAllowedLanguage(track.language)) {
      continue;
    }

    const output = await runSubtitlePostProcess({
      assetId: opts.muxAssetId,
      bcp47: track.language,
      subtitleOrigin: track.subtitleOrigin,
      segments: track.segments
    });

    const safeLanguage = track.language.replace(/[^a-zA-Z0-9-]/g, '_');
    const vttUrl = await storeTextArtifact(
      opts.jobId,
      `subtitles.${safeLanguage}.vtt`,
      output.vtt
    );
    const qaReportUrl = await storeJsonArtifact(
      opts.jobId,
      `subtitle-qa.${safeLanguage}.json`,
      {
        language: track.language,
        subtitleOriginBefore: output.subtitleOriginBefore,
        subtitleOriginAfter: output.subtitleOriginAfter,
        languageClass: output.languageClass,
        profile: output.profile,
        theologyIssues: output.theologyIssues,
        languageQualityDeltas: output.languageQualityDeltas,
        validationErrors: output.validationErrors,
        aiRetryCount: output.aiRetryCount,
        usedFallback: output.usedFallback,
        skipped: output.skipped,
        skipReason: output.skipReason,
        promptVersion: output.promptVersion,
        validatorVersion: output.validatorVersion,
        fallbackVersion: output.fallbackVersion,
        whisperSegmentsSha256: output.whisperSegmentsSha256,
        postProcessInputSha256: output.postProcessInputSha256,
        idempotencyKey: output.idempotencyKey,
        cacheHit: output.cacheHit
      }
    );
    const theologyIssuesUrl = await storeJsonArtifact(
      opts.jobId,
      `subtitle-theology.${safeLanguage}.json`,
      {
        language: track.language,
        subtitleOriginBefore: output.subtitleOriginBefore,
        subtitleOriginAfter: output.subtitleOriginAfter,
        theologyIssues: output.theologyIssues,
        promptVersion: output.promptVersion,
        idempotencyKey: output.idempotencyKey
      }
    );
    const languageQualityDeltasUrl = await storeJsonArtifact(
      opts.jobId,
      `subtitle-language-deltas.${safeLanguage}.json`,
      {
        language: track.language,
        subtitleOriginBefore: output.subtitleOriginBefore,
        subtitleOriginAfter: output.subtitleOriginAfter,
        languageQualityDeltas: output.languageQualityDeltas,
        promptVersion: output.promptVersion,
        idempotencyKey: output.idempotencyKey
      }
    );

    artifacts.push({
      language: track.language,
      output,
      vttUrl,
      qaReportUrl,
      theologyIssuesUrl,
      languageQualityDeltasUrl,
      attachMetadata: {
        language: track.language,
        vttUrl,
        metadata: {
          source: 'ai_post_processed',
          ai_post_processed: !output.usedFallback && !output.skipped,
          subtitleOriginBefore: output.subtitleOriginBefore,
          subtitleOriginAfter: output.subtitleOriginAfter,
          languageClass: output.languageClass,
          languageProfileVersion: output.profile.languageProfileVersion,
          promptVersion: output.promptVersion,
          validatorVersion: output.validatorVersion,
          fallbackVersion: output.fallbackVersion,
          whisperSegmentsSha256: output.whisperSegmentsSha256,
          postProcessInputSha256: output.postProcessInputSha256,
          idempotencyKey: output.idempotencyKey
        }
      }
    });

  }

  if (artifacts.length === 0) {
    const allowlist = Array.from(getSubtitlePostProcessAllowlist()).join(', ');
    throw new Error(
      `Subtitle post-process produced no eligible tracks. Check SUBTITLE_POST_PROCESS_ALLOWLIST (${allowlist || 'empty'}).`
    );
  }

  const primaryTrack =
    artifacts.find((item) => item.language === opts.transcript.language) ?? artifacts[0];
  const primaryVttUrl = await storeTextArtifact(
    opts.jobId,
    'subtitles.vtt',
    primaryTrack.output.vtt
  );

  const manifestUrl = await storeJsonArtifact(opts.jobId, 'subtitle-post-process-manifest.json', {
    generatedAt: new Date().toISOString(),
    muxAssetId: opts.muxAssetId,
    tracks: artifacts.map((item) => ({
      language: item.language,
      vttUrl: item.vttUrl,
      qaReportUrl: item.qaReportUrl,
      theologyIssuesUrl: item.theologyIssuesUrl,
      languageQualityDeltasUrl: item.languageQualityDeltasUrl,
      idempotencyKey: item.output.idempotencyKey,
      cacheHit: item.output.cacheHit,
      subtitleOriginBefore: item.output.subtitleOriginBefore,
      subtitleOriginAfter: item.output.subtitleOriginAfter,
      usedFallback: item.output.usedFallback,
      aiRetryCount: item.output.aiRetryCount,
      skipped: item.output.skipped,
      skipReason: item.output.skipReason,
      whisperSegmentsSha256: item.output.whisperSegmentsSha256,
      postProcessInputSha256: item.output.postProcessInputSha256
    }))
  });

  return { primaryVttUrl, manifestUrl, tracks: artifacts };
}

async function runStep<T>(opts: {
  jobId: string;
  step: WorkflowStepName;
  world: WorkflowWorld;
  maxRetries?: number;
  skip?: boolean;
  skipReason?: string;
  task: () => Promise<T>;
}): Promise<T | undefined> {
  if (opts.skip) {
    await updateStepStatus(opts.jobId, opts.step, 'skipped', {
      error: opts.skipReason ?? 'Step skipped by workflow conditions.'
    });
    await opts.world.onStepUpdate(opts.jobId, opts.step, 'skipped');
    return undefined;
  }

  const maxRetries = opts.maxRetries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await updateStepStatus(opts.jobId, opts.step, 'running');
    await opts.world.onStepUpdate(opts.jobId, opts.step, 'running');

    try {
      const result = await opts.task();
      await updateStepStatus(opts.jobId, opts.step, 'completed');
      await opts.world.onStepUpdate(opts.jobId, opts.step, 'completed');
      return result;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : 'Unknown step failure';
      const errorDetails = toJobErrorDetails(error);
      const shouldRetry =
        isRetryableStepError(error) && attempt < maxRetries;
      await updateStepStatus(opts.jobId, opts.step, 'failed', {
        error: message,
        incrementRetry: shouldRetry,
        errorDetails
      });
      await opts.world.onStepUpdate(opts.jobId, opts.step, 'failed');

      if (!shouldRetry) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Workflow step failed');
}

export async function startVideoEnrichment(jobId: string): Promise<void> {
  const job = await getJobById(jobId);
  if (!job || job.status === 'running' || job.status === 'completed') {
    return;
  }

  const world = getWorkflowWorld();

  try {
    await setJobStatus(jobId, 'running', 'download_video');
    await world.onJobStart(jobId);

    await runStep({
      jobId,
      step: 'download_video',
      world,
      task: async () => ({ ok: true })
    });

    const transcriptPayload = await runStep({
      jobId,
      step: 'transcription',
      world,
      task: async () => fetchTranscriptForAsset(job.muxAssetId)
    });

    if (!transcriptPayload) {
      throw new Error('Transcript generation did not produce output.');
    }

    const transcript = transcriptPayload.transcript;
    const primitivePreprocess = transcriptPayload.primitive;
    if (primitivePreprocess.warnings.length > 0) {
      for (const warning of primitivePreprocess.warnings) {
        console.warn(
          `[workflow][mux-ai-preprocess] ${warning.code}: ${warning.message} (${warning.operatorHint})`
        );
      }
    }
    const primitiveVtt = primitivePreprocess.vtt?.trim();
    if (!primitiveVtt) {
      throw new Error(
        'Mux primitives preprocessing did not return structured transcript VTT.'
      );
    }

    const transcriptUrl = await storeJsonArtifact(jobId, 'transcript.json', transcript);
    let vttUrl = await runStep({
      jobId,
      step: 'structured_transcript',
      world,
      task: async () => storeTextArtifact(jobId, 'subtitles.vtt', primitiveVtt)
    });

    const chapters = await runStep({
      jobId,
      step: 'chapters',
      world,
      task: async () => generateChapters(job.muxAssetId, transcript)
    });

    const metadata = await runStep({
      jobId,
      step: 'metadata',
      world,
      task: async () => extractMetadata(job.muxAssetId, transcript)
    });

    const embeddings = await runStep({
      jobId,
      step: 'embeddings',
      world,
      task: async () => generateEmbeddings(job.muxAssetId, transcript.text)
    });

    const translations = await runStep({
      jobId,
      step: 'translation',
      world,
      skip: job.languages.length === 0,
      skipReason: 'No target languages requested for translation.',
      task: async () => translateTranscript(job.muxAssetId, transcript, job.languages)
    });

    const subtitlePostProcess = await runStep({
      jobId,
      step: 'subtitle_post_process',
      world,
      maxRetries: 0,
      task: async () =>
        runSubtitlePostProcessStep({
          jobId,
          muxAssetId: job.muxAssetId,
          transcript,
          translations
        })
    });

    if (subtitlePostProcess?.primaryVttUrl) {
      vttUrl = subtitlePostProcess.primaryVttUrl;
    }

    const voiceoverUrl = await runStep({
      jobId,
      step: 'voiceover',
      world,
      skip: !job.options.generateVoiceover,
      task: async () => {
        const audio = await createVoiceover(transcript.text, transcript.language);
        return storeBinaryArtifact(jobId, 'voiceover.mp3', audio);
      }
    });

    const artifactUrls = await runStep({
      jobId,
      step: 'artifact_upload',
      world,
      task: async () =>
        uploadAllArtifacts(jobId, {
          transcript,
          transcriptUrl,
          vttUrl,
          chapters,
          metadata,
          embeddings,
          translations,
          subtitlePostProcess,
          voiceoverUrl,
          primitiveStoryboard: primitivePreprocess.storyboard,
          primitiveChunks: primitivePreprocess.chunks
        })
    });

    if (!artifactUrls) {
      throw new Error('Artifact upload step returned no URLs.');
    }

    await mergeArtifacts(jobId, artifactUrls);

    const muxUpload = await runStep({
      jobId,
      step: 'mux_upload',
      world,
      skip: !job.options.uploadMux,
      task: async () =>
        uploadEnrichedAsset({
          jobId,
          sourceAssetId: job.muxAssetId,
          artifactUrls,
          subtitleTracks: subtitlePostProcess?.tracks.map((track) => track.attachMetadata) ?? []
        })
    });

    if (muxUpload) {
      const muxUrl = await storeJsonArtifact(jobId, 'mux-upload.json', muxUpload);
      await mergeArtifacts(jobId, { muxUpload: muxUrl });
    }

    await runStep({
      jobId,
      step: 'cms_notify',
      world,
      skip: !job.options.notifyCms,
      task: async () => {
        await syncArtifactsToStrapi({
          jobId,
          muxAssetId: job.muxAssetId,
          artifacts: artifactUrls,
          metadataUrl: artifactUrls.metadata
        });
      }
    });

    await setJobStatus(jobId, 'completed');
    await world.onJobComplete(jobId, 'completed');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown workflow orchestration failure.';
    const errorDetails = toJobErrorDetails(error);
    const latest = await getJobById(jobId);
    const step = latest?.currentStep ?? 'download_video';
    await appendJobError(jobId, step, message, errorDetails, { dedupeLast: true });

    await setJobStatus(jobId, 'failed');
    await world.onJobComplete(jobId, 'failed');
  }
}

async function uploadAllArtifacts(
  jobId: string,
  payload: {
    transcript: Transcript;
    transcriptUrl: string;
    vttUrl?: string;
    chapters?: Chapter[];
    metadata?: MetadataResult;
    embeddings?: EmbeddingVector[];
    translations?: TranslationResult[];
    subtitlePostProcess?: SubtitlePostProcessResult;
    voiceoverUrl?: string;
    primitiveStoryboard?: Record<string, unknown> | unknown[];
    primitiveChunks?: unknown[];
  }
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {
    transcript: payload.transcriptUrl
  };

  if (payload.vttUrl) {
    urls.subtitlesVtt = payload.vttUrl;
  }

  if (payload.chapters) {
    urls.chapters = await storeJsonArtifact(jobId, 'chapters.json', payload.chapters);
  }

  if (payload.metadata) {
    urls.metadata = await storeJsonArtifact(jobId, 'metadata.json', payload.metadata);
  }

  if (payload.embeddings) {
    urls.embeddings = await storeJsonArtifact(
      jobId,
      'embeddings.json',
      payload.embeddings
    );
  }

  if (payload.translations && payload.translations.length > 0) {
    urls.translations = await storeJsonArtifact(
      jobId,
      'translations.json',
      payload.translations
    );
  }

  if (payload.subtitlePostProcess) {
    if (payload.subtitlePostProcess.tracks.length > 0) {
      urls.subtitlePostProcessManifest = payload.subtitlePostProcess.manifestUrl;
      const byLanguage = payload.subtitlePostProcess.tracks.reduce<Record<string, string>>(
        (acc, track) => {
          acc[track.language] = track.vttUrl;
          return acc;
        },
        {}
      );
      const theologyByLanguage = payload.subtitlePostProcess.tracks.reduce<Record<string, string>>(
        (acc, track) => {
          acc[track.language] = track.theologyIssuesUrl;
          return acc;
        },
        {}
      );
      const languageDeltasByLanguage = payload.subtitlePostProcess.tracks.reduce<
        Record<string, string>
      >((acc, track) => {
        acc[track.language] = track.languageQualityDeltasUrl;
        return acc;
      }, {});

      urls.subtitlesByLanguage = await storeJsonArtifact(
        jobId,
        'subtitles-by-language.json',
        byLanguage
      );
      urls.subtitleTheologyByLanguage = await storeJsonArtifact(
        jobId,
        'subtitle-theology-by-language.json',
        theologyByLanguage
      );
      urls.subtitleLanguageDeltasByLanguage = await storeJsonArtifact(
        jobId,
        'subtitle-language-deltas-by-language.json',
        languageDeltasByLanguage
      );

      urls.subtitleTrackMetadata = await storeJsonArtifact(
        jobId,
        'subtitle-track-metadata.json',
        payload.subtitlePostProcess.tracks.map((track) => track.attachMetadata)
      );
    }
  }

  if (payload.voiceoverUrl) {
    urls.voiceover = payload.voiceoverUrl;
  }

  if (payload.primitiveStoryboard) {
    urls.storyboard = await storeJsonArtifact(
      jobId,
      'storyboard.json',
      payload.primitiveStoryboard
    );
  }

  if (payload.primitiveChunks && payload.primitiveChunks.length > 0) {
    urls.chunks = await storeJsonArtifact(jobId, 'chunks.json', payload.primitiveChunks);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    artifacts: urls,
    sourceLanguage: payload.transcript.language
  };

  urls.artifactManifest = await storeJsonArtifact(jobId, 'artifacts.json', summary);

  return urls;
}
