import { translateWithMuxAi } from '@/services/mux-ai';
import type { Transcript, TranslationResult } from '@/types/enrichment';

export async function translateTranscript(
  muxAssetId: string,
  transcript: Transcript,
  languages: string[]
): Promise<TranslationResult[]> {
  const unique = [...new Set(languages.filter(Boolean))];

  const translations = await Promise.all(
    unique.map(async (language) => {
      const translated = await translateWithMuxAi(muxAssetId, transcript, language);
      if (!translated.segments || translated.segments.length === 0) {
        throw new Error(
          `Translation output for language "${language}" did not include subtitle segments.`
        );
      }
      return {
        ...translated,
        subtitleOrigin: translated.subtitleOrigin ?? 'ai-raw',
        segments: translated.segments
      };
    })
  );

  return translations;
}
