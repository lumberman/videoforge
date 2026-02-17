import { withEnv } from './temp-env';

type MuxAiModule = typeof import('../../src/services/mux-ai');

type MuxModuleName = '@mux/ai/workflows' | '@mux/ai/primitives' | '@mux/ai';

export function createMockMuxImporter() {
  return async (moduleName: MuxModuleName): Promise<Record<string, unknown>> => {
    if (moduleName === '@mux/ai/primitives') {
      return {
        async transcribe(muxAssetId: string) {
          return {
            language: 'en',
            text: `Mock transcript for ${muxAssetId}`,
            segments: [
              { startSec: 0, endSec: 10, text: `Intro ${muxAssetId}` },
              { startSec: 10, endSec: 20, text: 'Body' }
            ]
          };
        },
        async toVtt() {
          return 'WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nMock subtitle\n';
        },
        async createStoryboard() {
          return { frames: [{ atSec: 0, description: 'mock-frame' }] };
        },
        async chunkTranscript() {
          return [{ index: 0, text: 'mock chunk' }];
        }
      };
    }

    const workflows = {
      async transcribe(muxAssetId: string) {
        return {
          language: 'en',
          text: `Workflow transcript for ${muxAssetId}`,
          segments: [{ startSec: 0, endSec: 8, text: 'Workflow segment' }]
        };
      },
      async extractChapters() {
        return [{ title: 'Chapter 1', startSec: 0, endSec: 20 }];
      },
      async extractMetadata() {
        return {
          title: 'Mock title',
          summary: 'Mock summary',
          tags: ['mock'],
          speakers: ['narrator'],
          topics: ['testing']
        };
      },
      async createEmbeddings(text: string) {
        return [{ id: 'vec_1', text, values: [0.1, 0.2, 0.3] }];
      },
      async translateTranscript(transcript: { text: string }, targetLanguage: string) {
        return {
          language: targetLanguage,
          text: `[${targetLanguage}] ${transcript.text}`
        };
      }
    };

    if (moduleName === '@mux/ai') {
      return {
        workflows
      };
    }

    return workflows;
  };
}

export async function withMockMuxAi<T>(run: () => Promise<T>): Promise<T> {
  return withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAi = (await import('../../src/services/mux-ai')) as MuxAiModule;
      muxAi.setMuxAiModuleImporterForTests(createMockMuxImporter());

      try {
        return await run();
      } finally {
        muxAi.setMuxAiModuleImporterForTests();
      }
    }
  );
}
