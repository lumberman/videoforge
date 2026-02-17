import { metadataWithMuxAi } from '@/services/mux-ai';
import type { Transcript } from '@/types/enrichment';

export async function extractMetadata(muxAssetId: string, transcript: Transcript) {
  return metadataWithMuxAi(muxAssetId, transcript);
}
