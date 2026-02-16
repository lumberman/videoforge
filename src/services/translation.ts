import { translateWithMuxAi } from '@/services/mux-ai';
import type { Transcript, TranslationResult } from '@/types/enrichment';

export async function translateTranscript(
  transcript: Transcript,
  languages: string[]
): Promise<TranslationResult[]> {
  const unique = [...new Set(languages.filter(Boolean))];
  const timelineStart = transcript.segments[0]?.startSec ?? 0;
  const timelineEnd =
    transcript.segments[transcript.segments.length - 1]?.endSec ?? timelineStart + 1;

  const translations = await Promise.all(
    unique.map(async (language) => {
      const translated = await translateWithMuxAi(transcript, language);
      return {
        ...translated,
        subtitleOrigin: translated.subtitleOrigin ?? 'ai-raw',
        segments:
          translated.segments && translated.segments.length > 0
            ? translated.segments
            : [
                {
                  startSec: timelineStart,
                  endSec: Math.max(timelineEnd, timelineStart + 1),
                  text: translated.text
                }
              ]
      };
    })
  );

  return translations;
}
