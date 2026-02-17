import { embeddingsWithMuxAi } from '@/services/mux-ai';

export async function generateEmbeddings(muxAssetId: string, text: string) {
  return embeddingsWithMuxAi(muxAssetId, text);
}
