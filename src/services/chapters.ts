import { chaptersWithMuxAi } from '@/services/mux-ai';
import type { Transcript } from '@/types/enrichment';

export async function generateChapters(muxAssetId: string, transcript: Transcript) {
  return chaptersWithMuxAi(muxAssetId, transcript);
}
