import type { SubtitleCue } from '@/services/subtitle-post-process/types';

const TIMESTAMP_PATTERN = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;

export function toVttTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((clamped % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(clamped % 60)
    .toString()
    .padStart(2, '0');
  const milliseconds = Math.floor((clamped % 1) * 1000)
    .toString()
    .padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function parseVttTimestamp(value: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);
  const seconds = Number.parseInt(match[3] ?? '0', 10);
  const millis = Number.parseInt(match[4] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function renderWebVtt(cues: SubtitleCue[]): string {
  const lines = ['WEBVTT', ''];
  for (const cue of cues) {
    lines.push(`${toVttTimestamp(cue.start)} --> ${toVttTimestamp(cue.end)}`);
    lines.push(cue.text);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function parseWebVtt(vtt: string): { cues: SubtitleCue[]; headerValid: boolean; timestampErrors: number[] } {
  const lines = vtt.replace(/\r\n/g, '\n').split('\n');
  const headerValid = lines[0]?.trim() === 'WEBVTT';
  const cues: SubtitleCue[] = [];
  const timestampErrors: number[] = [];

  let i = headerValid ? 1 : 0;
  let cueIndex = 0;

  while (i < lines.length) {
    const line = (lines[i] ?? '').trim();
    if (!line) {
      i += 1;
      continue;
    }

    const tsLine = line;
    const parts = tsLine.split('-->').map((part) => part.trim());
    if (parts.length !== 2) {
      timestampErrors.push(cueIndex);
      i += 1;
      continue;
    }

    const start = parseVttTimestamp(parts[0] ?? '');
    const end = parseVttTimestamp(parts[1] ?? '');
    if (start === null || end === null) {
      timestampErrors.push(cueIndex);
      i += 1;
      continue;
    }

    i += 1;
    const textLines: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() !== '') {
      textLines.push(lines[i] ?? '');
      i += 1;
    }

    cues.push({
      index: cueIndex,
      start,
      end,
      text: textLines.join('\n')
    });

    cueIndex += 1;
  }

  return { cues, headerValid, timestampErrors };
}
