import { openRouter } from '@/services/openrouter';
import type { Transcript } from '@/types/enrichment';

export async function extractMetadata(transcript: Transcript) {
  return openRouter.extractMetadata(transcript);
}
