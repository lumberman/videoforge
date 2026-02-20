import type {
  LanguageProfile,
  SubtitleCue,
  SubtitleSegment
} from '@/services/subtitle-post-process/types';

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function splitByLength(value: string, maxChars: number): string[] {
  if (value.length <= maxChars) {
    return [value];
  }

  const parts: string[] = [];
  const words = value.split(' ');
  let cursor = '';

  for (const word of words) {
    const next = cursor ? `${cursor} ${word}` : word;
    if (next.length <= maxChars) {
      cursor = next;
      continue;
    }

    if (cursor) {
      parts.push(cursor);
      cursor = word;
      continue;
    }

    // Very long token fallback.
    parts.push(word.slice(0, maxChars));
    cursor = word.slice(maxChars);
  }

  if (cursor) {
    parts.push(cursor);
  }

  return parts;
}

function wrapLines(text: string, profile: LanguageProfile): string {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return normalized;
  }

  if (profile.maxLines === 1) {
    return normalized;
  }

  const split = splitByLength(normalized, profile.maxCPL);
  if (split.length <= 1) {
    return normalized;
  }

  return split.join('\n');
}

function applyOffsets(start: number, end: number, profile: LanguageProfile): { start: number; end: number } {
  const shiftedStart = Math.max(0, start - profile.startOffsetMs / 1000);
  const shiftedEnd = Math.max(shiftedStart, end + profile.endOffsetMs / 1000);
  return { start: shiftedStart, end: shiftedEnd };
}

function splitCueByDuration(cue: SubtitleCue, profile: LanguageProfile): SubtitleCue[] {
  const duration = cue.end - cue.start;
  if (duration <= profile.maxDuration) {
    return [cue];
  }

  const chunkCount = Math.max(2, Math.ceil(duration / profile.maxDuration));
  const textChunks = splitByLength(normalizeWhitespace(cue.text), Math.max(8, Math.floor(cue.text.length / chunkCount)));
  const result: SubtitleCue[] = [];

  for (let i = 0; i < chunkCount; i += 1) {
    const start = cue.start + (duration / chunkCount) * i;
    const end = i === chunkCount - 1 ? cue.end : cue.start + (duration / chunkCount) * (i + 1);
    result.push({
      index: result.length,
      start,
      end,
      text: textChunks[i] ?? textChunks.at(-1) ?? cue.text
    });
  }

  return result;
}

function enforceTimeline(cues: SubtitleCue[], profile: LanguageProfile): SubtitleCue[] {
  const minGap = profile.minGapMs / 1000;
  const result: SubtitleCue[] = [];

  for (const cue of cues) {
    const prev = result.at(-1);
    let start = cue.start;
    let end = cue.end;

    if (prev) {
      start = Math.max(start, prev.end + minGap);
      end = Math.max(start + profile.minDuration, end);
    }

    if (end - start > profile.maxDuration) {
      end = start + profile.maxDuration;
    }

    result.push({
      ...cue,
      index: result.length,
      start,
      end,
      text: wrapLines(cue.text, profile)
    });
  }

  return result;
}

export function buildFallbackCues(segments: SubtitleSegment[], profile: LanguageProfile): SubtitleCue[] {
  const base: SubtitleCue[] = [];

  for (const segment of segments) {
    const text = normalizeWhitespace(segment.text);
    if (!text) {
      continue;
    }

    const shifted = applyOffsets(segment.start, segment.end, profile);
    const maxCueChars = Math.max(1, profile.maxCPL * profile.maxLines);
    const textChunks = splitByLength(text, maxCueChars);
    const fullDuration = Math.max(
      profile.minDuration,
      shifted.end - shifted.start
    );

    for (let i = 0; i < textChunks.length; i += 1) {
      const chunkStart = shifted.start + (fullDuration / textChunks.length) * i;
      const chunkEnd =
        i === textChunks.length - 1
          ? shifted.start + fullDuration
          : shifted.start + (fullDuration / textChunks.length) * (i + 1);
      base.push({
        index: base.length,
        start: chunkStart,
        end: chunkEnd,
        text: wrapLines(textChunks[i] ?? text, profile)
      });
    }
  }

  const durationSplit = base.flatMap((cue) => splitCueByDuration(cue, profile));
  return enforceTimeline(durationSplit, profile);
}
