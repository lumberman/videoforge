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
import {
  storeBinaryArtifact,
  storeJsonArtifact,
  storeTextArtifact
} from '@/services/storage';
import { isMuxAiError, preprocessMuxAssetWithPrimitives } from '@/services/mux-ai';
import { transcribeVideo } from '@/services/transcription';
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

  return !(
    error.code === 'MUX_AI_CONFIG_MISSING' ||
    error.code === 'MUX_AI_IMPORT_FAILED' ||
    error.code === 'MUX_AI_INVALID_RESPONSE'
  );
}

function toVtt(transcript: Transcript): string {
  const lines = ['WEBVTT', ''];

  for (const segment of transcript.segments) {
    const start = toVttTimestamp(segment.startSec);
    const end = toVttTimestamp(segment.endSec);
    lines.push(`${start} --> ${end}`);
    lines.push(segment.text);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function toVttTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  const milliseconds = Math.floor((totalSeconds % 1) * 1000)
    .toString()
    .padStart(3, '0');

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

async function runStep<T>(opts: {
  jobId: string;
  step: WorkflowStepName;
  world: WorkflowWorld;
  maxRetries?: number;
  skip?: boolean;
  task: () => Promise<T>;
}): Promise<T | undefined> {
  if (opts.skip) {
    await updateStepStatus(opts.jobId, opts.step, 'skipped');
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

    const transcript = await runStep({
      jobId,
      step: 'transcription',
      world,
      task: async () => transcribeVideo(job.muxAssetId)
    });

    if (!transcript) {
      throw new Error('Transcript generation did not produce output.');
    }

    const primitivePreprocess = await preprocessMuxAssetWithPrimitives(
      job.muxAssetId,
      transcript
    );
    if (primitivePreprocess.warnings.length > 0) {
      for (const warning of primitivePreprocess.warnings) {
        console.warn(
          `[workflow][mux-ai-preprocess] ${warning.code}: ${warning.message} (${warning.operatorHint})`
        );
      }
    }

    const transcriptUrl = await storeJsonArtifact(jobId, 'transcript.json', transcript);
    const vttUrl = await runStep({
      jobId,
      step: 'structured_transcript',
      world,
      task: async () =>
        storeTextArtifact(
          jobId,
          'subtitles.vtt',
          primitivePreprocess.vtt ?? toVtt(transcript)
        )
    });

    const chapters = await runStep({
      jobId,
      step: 'chapters',
      world,
      task: async () => generateChapters(transcript)
    });

    const metadata = await runStep({
      jobId,
      step: 'metadata',
      world,
      task: async () => extractMetadata(transcript)
    });

    const embeddings = await runStep({
      jobId,
      step: 'embeddings',
      world,
      task: async () => generateEmbeddings(transcript.text)
    });

    const translations = await runStep({
      jobId,
      step: 'translation',
      world,
      skip: job.languages.length === 0,
      task: async () => translateTranscript(transcript, job.languages)
    });

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
          artifactUrls
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
