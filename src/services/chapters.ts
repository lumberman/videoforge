import { chaptersWithMuxAi } from '@/services/mux-ai';
import type { Transcript } from '@/types/enrichment';

export async function generateChapters(transcript: Transcript) {
  return chaptersWithMuxAi(transcript);
}
