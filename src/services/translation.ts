import { translateWithMuxAi } from '@/services/mux-ai';
import type { Transcript, TranslationResult } from '@/types/enrichment';

export async function translateTranscript(
  transcript: Transcript,
  languages: string[]
): Promise<TranslationResult[]> {
  const unique = [...new Set(languages.filter(Boolean))];
  const translations = await Promise.all(
    unique.map((language) => translateWithMuxAi(transcript, language))
  );
  return translations;
}
