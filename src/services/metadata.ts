import { metadataWithMuxAi } from '@/services/mux-ai';
import type { Transcript } from '@/types/enrichment';

export async function extractMetadata(transcript: Transcript) {
  return metadataWithMuxAi(transcript);
}
