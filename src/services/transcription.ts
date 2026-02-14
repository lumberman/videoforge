import { openRouter } from '@/services/openrouter';

export async function transcribeVideo(muxAssetId: string) {
  return openRouter.transcribe(muxAssetId);
}
