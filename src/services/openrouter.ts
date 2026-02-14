import type {
  Chapter,
  EmbeddingVector,
  MetadataResult,
  Transcript,
  TranslationResult
} from '@/types/enrichment';

export interface OpenRouterAdapter {
  transcribe(muxAssetId: string): Promise<Transcript>;
  extractChapters(transcript: Transcript): Promise<Chapter[]>;
  extractMetadata(transcript: Transcript): Promise<MetadataResult>;
  translate(
    transcript: Transcript,
    targetLanguage: string
  ): Promise<TranslationResult>;
  createEmbeddings(text: string): Promise<EmbeddingVector[]>;
  textToSpeech(text: string, language: string): Promise<Uint8Array>;
}

class MockOpenRouterAdapter implements OpenRouterAdapter {
  async transcribe(muxAssetId: string): Promise<Transcript> {
    return {
      language: 'en',
      text: `Auto transcript for asset ${muxAssetId}. This transcript was generated using a local mock adapter.`,
      segments: [
        {
          startSec: 0,
          endSec: 20,
          text: `Introduction for asset ${muxAssetId}`
        },
        {
          startSec: 20,
          endSec: 40,
          text: 'Main content overview'
        },
        {
          startSec: 40,
          endSec: 60,
          text: 'Wrap up and next steps'
        }
      ]
    };
  }

  async extractChapters(transcript: Transcript): Promise<Chapter[]> {
    return transcript.segments.map((segment, idx) => ({
      title: `Chapter ${idx + 1}`,
      startSec: segment.startSec,
      endSec: segment.endSec
    }));
  }

  async extractMetadata(transcript: Transcript): Promise<MetadataResult> {
    const baseText = transcript.text.toLowerCase();
    const inferredTopic = baseText.includes('overview') ? 'overview' : 'general';
    return {
      title: 'AI Enriched Video',
      summary: transcript.text.slice(0, 160),
      tags: ['ai', 'video', inferredTopic],
      speakers: ['Narrator'],
      topics: ['video enrichment', 'automation']
    };
  }

  async translate(
    transcript: Transcript,
    targetLanguage: string
  ): Promise<TranslationResult> {
    return {
      language: targetLanguage,
      text: `[${targetLanguage}] ${transcript.text}`
    };
  }

  async createEmbeddings(text: string): Promise<EmbeddingVector[]> {
    const tokens = text.split(/\s+/).filter(Boolean).slice(0, 8);
    return tokens.map((token, idx) => ({
      id: `vec_${idx + 1}`,
      text: token,
      values: Array.from({ length: 12 }, (_, v) => Number(((idx + 1) * (v + 1) * 0.01).toFixed(4)))
    }));
  }

  async textToSpeech(text: string, language: string): Promise<Uint8Array> {
    const fakeAudio = `VOICEOVER(${language}): ${text}`;
    return new TextEncoder().encode(fakeAudio);
  }
}

export const openRouter: OpenRouterAdapter = new MockOpenRouterAdapter();
