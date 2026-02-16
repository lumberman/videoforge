import {
  preprocessMuxAssetWithPrimitives,
  transcribeWithMuxAi
} from '@/services/mux-ai';
import type { MuxAiPreprocessResult } from '@/services/mux-ai';
import type { Transcript } from '@/types/enrichment';

export interface MuxTranscriptPayload {
  assetId: string;
  bcp47: string;
  transcript: Transcript;
  primitive: MuxAiPreprocessResult;
  storyboard?: Record<string, unknown> | unknown[];
}

export async function fetchTranscriptForAsset(
  assetId: string,
  language?: string
): Promise<MuxTranscriptPayload> {
  const transcript = await transcribeWithMuxAi(assetId);
  const primitive = await preprocessMuxAssetWithPrimitives(assetId, transcript);

  return {
    assetId,
    bcp47: language ?? transcript.language,
    transcript,
    primitive,
    storyboard: primitive.storyboard
  };
}

export async function getStoryboardUrl(
  assetId: string
): Promise<Record<string, unknown> | unknown[] | undefined> {
  const primitive = await preprocessMuxAssetWithPrimitives(assetId);
  return primitive.storyboard;
}
