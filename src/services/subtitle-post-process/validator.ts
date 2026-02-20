import type {
  LanguageProfile,
  SubtitleCue,
  ValidationError,
  ValidationRule
} from '@/services/subtitle-post-process/types';
import { parseWebVtt } from '@/services/subtitle-post-process/vtt';

const EPSILON = 1e-6;

function stripMarkup(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

export function normalizeCueText(text: string): string {
  return stripMarkup(text)
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .join('\n')
    .trim();
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

export function countChars(text: string): number {
  if (!text) {
    return 0;
  }

  if (segmenter) {
    return Array.from(segmenter.segment(text)).length;
  }

  return Array.from(text).length;
}

function pushError(
  errors: ValidationError[],
  cueIndex: number,
  rule: ValidationRule,
  measured: number | string,
  limit: number | string
): void {
  errors.push({ cueIndex, rule, measured, limit });
}

export function validateCues(cues: SubtitleCue[], profile: LanguageProfile): ValidationError[] {
  const errors: ValidationError[] = [];

  let previousStart = 0;
  let previousEnd = -1;

  for (const cue of cues) {
    const normalized = normalizeCueText(cue.text);
    if (!normalized) {
      pushError(errors, cue.index, 'EMPTY_CUE', 0, '>0');
      continue;
    }

    const duration = cue.end - cue.start;
    if (duration + EPSILON < profile.minDuration) {
      pushError(errors, cue.index, 'MIN_DURATION', Number(duration.toFixed(4)), profile.minDuration);
    }
    if (duration - EPSILON > profile.maxDuration) {
      pushError(errors, cue.index, 'MAX_DURATION', Number(duration.toFixed(4)), profile.maxDuration);
    }

    const lines = normalized.split('\n');
    if (lines.length > profile.maxLines) {
      pushError(errors, cue.index, 'MAX_LINES', lines.length, profile.maxLines);
    }

    const cpl = Math.max(...lines.map((line) => countChars(normalizeCueText(line))), 0);
    if (cpl > profile.maxCPL) {
      pushError(errors, cue.index, 'MAX_CPL', cpl, profile.maxCPL);
    }

    const cpsChars = countChars(normalized.replace(/\n/g, ''));
    const cps = duration > 0 ? cpsChars / duration : Number.POSITIVE_INFINITY;
    if (cps - EPSILON > profile.maxCPS) {
      pushError(errors, cue.index, 'MAX_CPS', Number(cps.toFixed(4)), profile.maxCPS);
    }

    if (cue.start < previousStart || cue.end < cue.start) {
      pushError(errors, cue.index, 'MONOTONIC_TIMESTAMPS', `${cue.start}-${cue.end}`, `>= ${previousStart}`);
    }

    if (cue.start < previousEnd) {
      pushError(errors, cue.index, 'OVERLAP', Number((previousEnd - cue.start).toFixed(4)), 0);
    }

    const gap = cue.start - previousEnd;
    if (cue.index > 0 && gap + EPSILON < profile.minGapMs / 1000) {
      pushError(errors, cue.index, 'MIN_GAP', Number(gap.toFixed(4)), profile.minGapMs / 1000);
    }

    if (/<[^>]*>/.test(cue.text)) {
      pushError(errors, cue.index, 'DISALLOWED_MARKUP', 'present', 'absent');
    }

    previousStart = cue.start;
    previousEnd = cue.end;
  }

  return errors;
}

export function validateWebVtt(vtt: string, profile: LanguageProfile): { cues: SubtitleCue[]; errors: ValidationError[] } {
  const parsed = parseWebVtt(vtt);
  const errors: ValidationError[] = [];

  if (!parsed.headerValid) {
    errors.push({ cueIndex: -1, rule: 'WEBVTT_HEADER', measured: 'missing', limit: 'WEBVTT' });
  }

  for (const cueIndex of parsed.timestampErrors) {
    errors.push({ cueIndex, rule: 'WEBVTT_TIMESTAMP', measured: 'invalid', limit: 'HH:MM:SS.mmm --> HH:MM:SS.mmm' });
  }

  errors.push(...validateCues(parsed.cues, profile));
  return { cues: parsed.cues, errors };
}
