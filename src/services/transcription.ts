import { transcribeWithMuxAi } from '@/services/mux-ai';

export async function transcribeVideo(muxAssetId: string) {
  return transcribeWithMuxAi(muxAssetId);
}
