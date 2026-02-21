import { createHash } from 'node:crypto';
import {
  canMutateSubtitle,
  normalizeSubtitleOrigin,
  SUBTITLE_POST_PROCESS_VERSIONS,
  SUBTITLE_PROFILES
} from '@/config/subtitle-post-process';
import { classifyLanguage } from '@/services/subtitle-post-process/language-classifier';
import { runLanguageQualityPass } from '@/services/subtitle-post-process/language-quality-pass';
import { runTheologyPass } from '@/services/subtitle-post-process/theology-pass';
import {
  getSubtitlePostProcessCacheEntry,
  saveSubtitlePostProcessCacheEntry
} from '@/services/subtitle-post-process/cache';
import { isNonSpeechTokenText } from '@/services/subtitle-post-process/non-speech';
import type {
  LanguageProfile,
  SubtitleCue,
  SubtitlePostProcessInput,
  SubtitlePostProcessOutput,
  SubtitleSegment,
  ValidationError
} from '@/services/subtitle-post-process/types';
import { validateWebVtt } from '@/services/subtitle-post-process/validator';
import { renderWebVtt } from '@/services/subtitle-post-process/vtt';

function hashSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableSegmentPayload(segments: SubtitleSegment[]): string {
  const canonical = segments
    .map((segment) => ({
      id: segment.id,
      start: Number(segment.start.toFixed(3)),
      end: Number(segment.end.toFixed(3)),
      text: segment.text
    }))
    .sort((a, b) => a.start - b.start);

  return JSON.stringify(canonical);
}

function buildPostProcessInputSha256(params: {
  assetId: string;
  bcp47: string;
  subtitleOrigin: string;
  whisperSegmentsSha256: string;
}): string {
  return hashSha256(
    JSON.stringify({
      assetId: params.assetId,
      bcp47: params.bcp47,
      subtitleOrigin: params.subtitleOrigin,
      whisperSegmentsSha256: params.whisperSegmentsSha256,
      trackType: 'captions',
      profileVersion: SUBTITLE_POST_PROCESS_VERSIONS.languageProfileVersion,
      promptVersion: SUBTITLE_POST_PROCESS_VERSIONS.promptVersion,
      validatorVersion: SUBTITLE_POST_PROCESS_VERSIONS.validatorVersion,
      fallbackVersion: SUBTITLE_POST_PROCESS_VERSIONS.fallbackVersion
    })
  );
}

function buildIdempotencyKey(params: {
  assetId: string;
  bcp47: string;
  subtitleOrigin: string;
  whisperSegmentsSha256: string;
}): string {
  return hashSha256(
    JSON.stringify({
      assetId: params.assetId,
      trackType: 'captions',
      bcp47: params.bcp47,
      subtitleOrigin: params.subtitleOrigin,
      whisperSegmentsSha256: params.whisperSegmentsSha256,
      profileVersion: SUBTITLE_POST_PROCESS_VERSIONS.languageProfileVersion,
      promptVersion: SUBTITLE_POST_PROCESS_VERSIONS.promptVersion,
      validatorVersion: SUBTITLE_POST_PROCESS_VERSIONS.validatorVersion,
      fallbackVersion: SUBTITLE_POST_PROCESS_VERSIONS.fallbackVersion
    })
  );
}

function getProfileForLanguage(bcp47: string): { languageClass: 'LTR' | 'RTL' | 'CJK'; profile: LanguageProfile } {
  const languageClass = classifyLanguage(bcp47);
  return {
    languageClass,
    profile: SUBTITLE_PROFILES[languageClass]
  };
}

function buildInitialCues(segments: SubtitleSegment[]): SubtitleCue[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: SubtitleSegment[] = [];

  for (const segment of sorted) {
    const text = segment.text.trim();
    if (!text) {
      continue;
    }

    const previous = merged.at(-1);
    if (!previous) {
      merged.push({ ...segment, text });
      continue;
    }

    const isNonSpeech = isNonSpeechTokenText(text);
    const previousIsNonSpeech = isNonSpeechTokenText(previous.text);
    const gap = segment.start - previous.end;
    if (!isNonSpeech && !previousIsNonSpeech && gap <= 0.3) {
      previous.end = Math.max(previous.end, segment.end);
      previous.text = `${previous.text} ${text}`.trim();
      continue;
    }

    merged.push({ ...segment, text });
  }

  return merged.map((segment, index) => ({
    index,
    start: segment.start,
    end: segment.end,
    text: segment.text
  }));
}

function splitTextInHalf(text: string): [string, string] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    const middle = Math.ceil(text.length / 2);
    return [text.slice(0, middle).trim(), text.slice(middle).trim()];
  }

  const middle = Math.ceil(words.length / 2);
  return [words.slice(0, middle).join(' '), words.slice(middle).join(' ')];
}

function applyRetryFixes(
  cues: SubtitleCue[],
  errors: ValidationError[],
  profile: LanguageProfile
): SubtitleCue[] {
  const byCue = new Map<number, ValidationError[]>();
  for (const error of errors) {
    if (error.cueIndex < 0) {
      continue;
    }
    const list = byCue.get(error.cueIndex) ?? [];
    list.push(error);
    byCue.set(error.cueIndex, list);
  }

  const next: SubtitleCue[] = [];
  for (const cue of cues) {
    const cueErrors = byCue.get(cue.index) ?? [];
    const shouldSplit = cueErrors.some((error) =>
      error.rule === 'MAX_CPS' || error.rule === 'MAX_CPL' || error.rule === 'MAX_LINES'
    );

    if (!shouldSplit) {
      next.push({ ...cue, index: next.length });
      continue;
    }

    const gap = profile.minGapMs / 1000;
    const available = cue.end - cue.start;
    if (available <= gap + profile.minDuration * 2) {
      next.push({ ...cue, index: next.length });
      continue;
    }

    const [left, right] = splitTextInHalf(cue.text);
    const mid = cue.start + available / 2;
    const leftEnd = mid - gap / 2;
    const rightStart = mid + gap / 2;

    next.push({ index: next.length, start: cue.start, end: leftEnd, text: left || cue.text });
    next.push({ index: next.length, start: rightStart, end: cue.end, text: right || cue.text });
  }

  return next;
}

function toSkippedOutput(input: SubtitlePostProcessInput): SubtitlePostProcessOutput {
  const origin = normalizeSubtitleOrigin(input.subtitleOrigin);
  const { languageClass, profile } = getProfileForLanguage(input.bcp47);
  const cues = buildInitialCues(input.segments);
  const vtt = renderWebVtt(cues);
  const serializedSegments = stableSegmentPayload(input.segments);
  const whisperSegmentsSha256 = hashSha256(serializedSegments);
  const postProcessInputSha256 = buildPostProcessInputSha256({
    assetId: input.assetId,
    bcp47: input.bcp47,
    subtitleOrigin: origin,
    whisperSegmentsSha256
  });
  const idempotencyKey = buildIdempotencyKey({
    assetId: input.assetId,
    bcp47: input.bcp47,
    subtitleOrigin: origin,
    whisperSegmentsSha256
  });

  return {
    bcp47: input.bcp47,
    languageClass,
    profile,
    idempotencyKey,
    cacheHit: false,
    subtitleOrigin: origin,
    subtitleOriginBefore: origin,
    subtitleOriginAfter: origin,
    vtt,
    cues,
    theologyIssues: [],
    languageQualityDeltas: [],
    validationErrors: [],
    aiRetryCount: 0,
    usedFallback: false,
    postProcessInputSha256,
    whisperSegmentsSha256,
    promptVersion: SUBTITLE_POST_PROCESS_VERSIONS.promptVersion,
    validatorVersion: SUBTITLE_POST_PROCESS_VERSIONS.validatorVersion,
    fallbackVersion: SUBTITLE_POST_PROCESS_VERSIONS.fallbackVersion,
    skipped: true,
    skipReason: 'subtitle origin is not mutable'
  };
}

export async function runSubtitlePostProcess(
  input: SubtitlePostProcessInput
): Promise<SubtitlePostProcessOutput> {
  const origin = normalizeSubtitleOrigin(input.subtitleOrigin);
  const serializedSegments = stableSegmentPayload(input.segments);
  const whisperSegmentsSha256 = hashSha256(serializedSegments);
  const idempotencyKey = buildIdempotencyKey({
    assetId: input.assetId,
    bcp47: input.bcp47,
    subtitleOrigin: origin,
    whisperSegmentsSha256
  });

  if (!canMutateSubtitle(origin)) {
    return toSkippedOutput(input);
  }

  const { languageClass, profile } = getProfileForLanguage(input.bcp47);
  const cached = await getSubtitlePostProcessCacheEntry(idempotencyKey);
  if (cached) {
    return {
      ...cached.output,
      languageQualityDeltas: cached.output.languageQualityDeltas ?? [],
      cacheHit: true
    };
  }

  const baseCues = buildInitialCues(input.segments);
  const theologyPass = await runTheologyPass({
    assetId: input.assetId,
    bcp47: input.bcp47,
    cues: baseCues
  });
  const languagePass = await runLanguageQualityPass({
    assetId: input.assetId,
    bcp47: input.bcp47,
    cues: theologyPass.cues
  });
  let candidateCues = languagePass.cues;
  let candidateVtt = renderWebVtt(candidateCues);
  let validation = validateWebVtt(candidateVtt, profile);
  let aiRetryCount = 0;
  let usedFallback = false;

  if (validation.errors.length > 0) {
    aiRetryCount = 1;
    candidateCues = applyRetryFixes(candidateCues, validation.errors, profile);
    candidateVtt = renderWebVtt(candidateCues);
    validation = validateWebVtt(candidateVtt, profile);
  }

  if (validation.errors.length > 0) {
    throw new Error(
      `Subtitle post-process validation failed after retry: ${JSON.stringify(validation.errors)}`
    );
  }

  const subtitleOriginAfter = 'ai-processed';
  const output: SubtitlePostProcessOutput = {
    bcp47: input.bcp47,
    languageClass,
    profile,
    idempotencyKey,
    cacheHit: false,
    subtitleOrigin: origin,
    subtitleOriginBefore: origin,
    subtitleOriginAfter,
    vtt: candidateVtt,
    cues: candidateCues,
    theologyIssues: theologyPass.issues,
    languageQualityDeltas: languagePass.deltas,
    validationErrors: validation.errors,
    aiRetryCount,
    usedFallback,
    postProcessInputSha256: buildPostProcessInputSha256({
      assetId: input.assetId,
      bcp47: input.bcp47,
      subtitleOrigin: origin,
      whisperSegmentsSha256
    }),
    whisperSegmentsSha256,
    promptVersion: SUBTITLE_POST_PROCESS_VERSIONS.promptVersion,
    validatorVersion: SUBTITLE_POST_PROCESS_VERSIONS.validatorVersion,
    fallbackVersion: SUBTITLE_POST_PROCESS_VERSIONS.fallbackVersion,
    skipped: false
  };

  if (output.validationErrors.length === 0) {
    await saveSubtitlePostProcessCacheEntry(output);
  }

  return output;
}
