import type {
  Chapter,
  EmbeddingVector,
  MetadataResult,
  Transcript,
  TranslationResult
} from '@/types/enrichment';
import {
  hasOpenRouterApiKey,
  OPENROUTER_SUBTITLE_MODELS,
  OPENROUTER_SUBTITLE_SETTINGS
} from '@/config/openrouter-models';

type TheologySeverity = 'low' | 'medium' | 'high';

export interface SubtitleCuePayload {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface SubtitleTheologyCheckInput {
  assetId: string;
  bcp47: string;
  promptVersion: 'v1';
  fullTranscript: string;
  cues: SubtitleCuePayload[];
}

export interface SubtitleTheologyIssuePayload {
  cueIndex: number;
  severity: TheologySeverity;
  message: string;
  suggestion?: string;
}

export interface SubtitleTheologyCheckOutput {
  issues: SubtitleTheologyIssuePayload[];
}

export interface SubtitleLanguageQualityInput {
  assetId: string;
  bcp47: string;
  promptVersion: 'v1';
  fullTranscript: string;
  cues: SubtitleCuePayload[];
}

export interface SubtitleLanguageQualityOutput {
  cues: Array<{
    index: number;
    text: string;
  }>;
}

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
  subtitleTheologyCheck(
    input: SubtitleTheologyCheckInput
  ): Promise<SubtitleTheologyCheckOutput>;
  subtitleLanguageQualityPass(
    input: SubtitleLanguageQualityInput
  ): Promise<SubtitleLanguageQualityOutput>;
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

  async subtitleTheologyCheck(
    input: SubtitleTheologyCheckInput
  ): Promise<SubtitleTheologyCheckOutput> {
    const issues: SubtitleTheologyIssuePayload[] = [];
    for (const cue of input.cues) {
      if (/holy spirit/gi.test(cue.text)) {
        issues.push({
          cueIndex: cue.index,
          severity: 'low',
          message: 'Potential doctrinal terminology inconsistency detected.',
          suggestion: 'Consider canonical capitalization for Holy Spirit.'
        });
      }
    }
    return { issues };
  }

  async subtitleLanguageQualityPass(
    input: SubtitleLanguageQualityInput
  ): Promise<SubtitleLanguageQualityOutput> {
    return {
      cues: input.cues.map((cue) => ({
        index: cue.index,
        text: cue.text
      }))
    };
  }
}

class OpenRouterHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenRouterHttpError';
  }
}

class LiveOpenRouterAdapter extends MockOpenRouterAdapter {
  private getApiKey(): string {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) {
      throw new OpenRouterHttpError('OPENROUTER_API_KEY is missing.');
    }
    return key;
  }

  private extractContent(payload: unknown): string {
    const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices;
    const content = choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const text = content
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const maybeText = (item as { text?: unknown }).text;
          return typeof maybeText === 'string' ? maybeText : '';
        })
        .join('')
        .trim();
      if (text) {
        return text;
      }
    }

    throw new OpenRouterHttpError('OpenRouter response did not include message content.');
  }

  private parseJsonBlock<T>(content: string): T {
    try {
      return JSON.parse(content) as T;
    } catch {
      const fenced = content.match(/```json\s*([\s\S]*?)\s*```/i)?.[1] ?? content;
      return JSON.parse(fenced) as T;
    }
  }

  private async completeJson<T>(opts: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
  }): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      OPENROUTER_SUBTITLE_SETTINGS.timeoutMs
    );

    try {
      const response = await fetch(OPENROUTER_SUBTITLE_SETTINGS.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
          'Content-Type': 'application/json',
          ...(OPENROUTER_SUBTITLE_SETTINGS.siteUrl
            ? { 'HTTP-Referer': OPENROUTER_SUBTITLE_SETTINGS.siteUrl }
            : {}),
          'X-Title': OPENROUTER_SUBTITLE_SETTINGS.appName
        },
        body: JSON.stringify({
          model: opts.model,
          messages: [
            { role: 'system', content: opts.systemPrompt },
            { role: 'user', content: opts.userPrompt }
          ],
          temperature: OPENROUTER_SUBTITLE_SETTINGS.temperature,
          max_tokens: opts.maxTokens,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new OpenRouterHttpError(
          `OpenRouter request failed (${response.status}): ${detail || response.statusText}`
        );
      }

      const payload = await response.json();
      const content = this.extractContent(payload);
      return this.parseJsonBlock<T>(content);
    } catch (error) {
      if (error instanceof OpenRouterHttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenRouterHttpError('OpenRouter request timed out.');
      }

      throw new OpenRouterHttpError(
        error instanceof Error ? error.message : 'OpenRouter request failed.'
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async subtitleTheologyCheck(
    input: SubtitleTheologyCheckInput
  ): Promise<SubtitleTheologyCheckOutput> {
    const systemPrompt = [
      'You are a theology subtitle QA analyzer.',
      'Review subtitle cues for doctrinal/theological mistranslations or distortions.',
      'Do not rewrite cues.',
      'Do not invent, drop, or paraphrase any cue content.',
      'Return JSON only: {"issues":[{"cueIndex":number,"severity":"low|medium|high","message":string,"suggestion"?:string}]}.',
      'If no issues, return {"issues":[]}.'
    ].join(' ');

    const userPrompt = [
      `assetId: ${input.assetId}`,
      `language: ${input.bcp47}`,
      `promptVersion: ${input.promptVersion}`,
      'Task: detect mistranslations of theological terms and potential doctrinal distortions.',
      'Constraint: analysis only, no cue rewrites, no content invention, no content deletion.',
      'Input transcript:',
      input.fullTranscript,
      'Input cues JSON:',
      JSON.stringify(input.cues)
    ].join('\n\n');

    return this.completeJson<SubtitleTheologyCheckOutput>({
      model: OPENROUTER_SUBTITLE_MODELS.theology,
      systemPrompt,
      userPrompt,
      maxTokens: OPENROUTER_SUBTITLE_SETTINGS.maxTokensTheology
    });
  }

  async subtitleLanguageQualityPass(
    input: SubtitleLanguageQualityInput
  ): Promise<SubtitleLanguageQualityOutput> {
    const systemPrompt = [
      'You are a subtitle language-quality post-processor.',
      'Improve readability and normalize biblical names and terms.',
      'Only apply light corrections.',
      'Keep meaning unchanged.',
      'Do not invent, drop, or paraphrase information.',
      'Return JSON only: {"cues":[{"index":number,"text":string}]}.',
      'Do not return timestamps; preserve cue indexes.'
    ].join(' ');

    const userPrompt = [
      `assetId: ${input.assetId}`,
      `language: ${input.bcp47}`,
      `promptVersion: ${input.promptVersion}`,
      'Task: lightly correct awkward phrasing and normalize biblical/theological vocabulary for subtitles.',
      'Constraints: preserve meaning exactly; do not invent words, do not drop words, do not paraphrase theology.',
      'Input transcript:',
      input.fullTranscript,
      'Input cues JSON:',
      JSON.stringify(input.cues)
    ].join('\n\n');

    return this.completeJson<SubtitleLanguageQualityOutput>({
      model: OPENROUTER_SUBTITLE_MODELS.languageQuality,
      systemPrompt,
      userPrompt,
      maxTokens: OPENROUTER_SUBTITLE_SETTINGS.maxTokensLanguageQuality
    });
  }
}

export const openRouter: OpenRouterAdapter = hasOpenRouterApiKey()
  ? new LiveOpenRouterAdapter()
  : new MockOpenRouterAdapter();
