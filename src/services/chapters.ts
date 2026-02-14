import { openRouter } from '@/services/openrouter';
import type { Transcript } from '@/types/enrichment';

export async function generateChapters(transcript: Transcript) {
  return openRouter.extractChapters(transcript);
}
