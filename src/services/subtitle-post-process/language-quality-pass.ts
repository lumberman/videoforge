import { openRouter } from '@/services/openrouter';
import { SUBTITLE_POST_PROCESS_VERSIONS } from '@/config/subtitle-post-process';
import { isNonSpeechTokenText } from '@/services/subtitle-post-process/non-speech';
import type {
  LanguageQualityDelta,
  SubtitleCue,
  SubtitlePostProcessInput
} from '@/services/subtitle-post-process/types';

const TERM_NORMALIZATION: Array<{ from: RegExp; to: string }> = [
  { from: /jerusalem/gi, to: 'Jerusalem' },
  { from: /isaiah/gi, to: 'Isaiah' },
  { from: /psalm\s+(\d+)/gi, to: 'Psalm $1' }
];

function normalizeCueText(text: string): string {
  let output = text.replace(/\s+/g, ' ').trim();
  for (const rule of TERM_NORMALIZATION) {
    output = output.replace(rule.from, rule.to);
  }
  return output;
}

function buildFullTranscript(cues: SubtitleCue[]): string {
  return cues.map((cue) => cue.text.trim()).filter(Boolean).join(' ');
}

export async function runLanguageQualityPass(input: {
  assetId: SubtitlePostProcessInput['assetId'];
  bcp47: SubtitlePostProcessInput['bcp47'];
  cues: SubtitleCue[];
}): Promise<{ cues: SubtitleCue[]; deltas: LanguageQualityDelta[] }> {
  const buildDeltas = (nextCues: SubtitleCue[]): LanguageQualityDelta[] =>
    nextCues.flatMap((cue) => {
      const beforeText = input.cues[cue.index]?.text ?? '';
      if (beforeText === cue.text) {
        return [];
      }

      return [
        {
          cueIndex: cue.index,
          beforeText,
          afterText: cue.text
        }
      ];
    });

  const response = await openRouter.subtitleLanguageQualityPass({
    assetId: input.assetId,
    bcp47: input.bcp47,
    promptVersion: SUBTITLE_POST_PROCESS_VERSIONS.promptVersion,
    fullTranscript: buildFullTranscript(input.cues),
    cues: input.cues.map((cue) => ({
      index: cue.index,
      start: cue.start,
      end: cue.end,
      text: cue.text
    }))
  });

  if (!Array.isArray(response.cues)) {
    throw new Error('Language-quality pass returned an invalid cues payload.');
  }

  const edits = new Map<number, string>();
  for (const item of response.cues) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const index = Number((item as { index?: unknown }).index);
    const text = (item as { text?: unknown }).text;
    if (!Number.isInteger(index) || typeof text !== 'string') {
      continue;
    }

    if (isNonSpeechTokenText(input.cues[index]?.text ?? '')) {
      continue;
    }

    edits.set(index, normalizeCueText(text));
  }

  const cues = input.cues.map((cue) => ({
    ...cue,
    text: edits.get(cue.index) ?? normalizeCueText(cue.text)
  }));
  return { cues, deltas: buildDeltas(cues) };
}
