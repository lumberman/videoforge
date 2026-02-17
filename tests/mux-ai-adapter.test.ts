import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockMuxImporter } from './helpers/mux-ai-mock';
import { withEnv } from './helpers/temp-env';

test('mux adapter throws structured config error when runtime credentials are missing', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: undefined,
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      await assert.rejects(
        () => muxAiModule.transcribeWithMuxAi('mux-asset-123'),
        (error) => {
          assert.ok(muxAiModule.isMuxAiError(error));
          assert.equal(error.code, 'MUX_AI_CONFIG_MISSING');
          assert.equal(error.isDependencyError, true);
          assert.match(error.operatorHint, /configure/i);
          return true;
        }
      );
    }
  );
});

test('mux adapter treats whitespace credentials as missing and blocks module import', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: undefined,
      MUX_TOKEN_ID: '   ',
      MUX_TOKEN_SECRET: 'secret'
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      let importerCalled = false;
      muxAiModule.setMuxAiModuleImporterForTests(async () => {
        importerCalled = true;
        return {};
      });

      try {
        await assert.rejects(
          () => muxAiModule.transcribeWithMuxAi('mux-asset-whitespace-creds'),
          (error) => {
            assert.ok(muxAiModule.isMuxAiError(error));
            assert.equal(error.code, 'MUX_AI_CONFIG_MISSING');
            return true;
          }
        );
        assert.equal(importerCalled, false);
      } finally {
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});

test('mux adapter throws structured import error when module import fails', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      muxAiModule.setMuxAiModuleImporterForTests(async () => {
        throw new Error('synthetic import failure');
      });

      try {
        await assert.rejects(
          () => muxAiModule.transcribeWithMuxAi('mux-asset-import-failure'),
          (error) => {
            assert.ok(muxAiModule.isMuxAiError(error));
            assert.equal(error.code, 'MUX_AI_IMPORT_FAILED');
            assert.equal(error.isDependencyError, true);
            return true;
          }
        );
      } finally {
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});

test('mux adapter falls back to @mux/ai root namespace when subpath import is missing', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      muxAiModule.setMuxAiModuleImporterForTests(async (moduleName) => {
        if (moduleName === '@mux/ai/primitives') {
          throw new Error("Cannot find module '@mux/ai/primitives'");
        }

        if (moduleName === '@mux/ai') {
          return {
            primitives: {
              async transcribe() {
                return {
                  language: 'en',
                  text: 'root namespace transcript',
                  segments: [{ startSec: 0, endSec: 1, text: 'root namespace transcript' }]
                };
              }
            }
          };
        }

        return {};
      });

      try {
        const transcript = await muxAiModule.transcribeWithMuxAi('mux-asset-root-fallback');
        assert.equal(transcript.language, 'en');
        assert.equal(transcript.text, 'root namespace transcript');
      } finally {
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});

test('mux adapter reports combined import failure when subpath and root fallback both fail', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      muxAiModule.setMuxAiModuleImporterForTests(async (moduleName) => {
        if (moduleName === '@mux/ai/primitives') {
          throw new Error("Cannot find module '@mux/ai/primitives'");
        }
        if (moduleName === '@mux/ai') {
          throw new Error("Cannot find module '@mux/ai'");
        }
        return {};
      });

      try {
        await assert.rejects(
          () => muxAiModule.transcribeWithMuxAi('mux-asset-no-fallback'),
          (error) => {
            assert.ok(muxAiModule.isMuxAiError(error));
            assert.equal(error.code, 'MUX_AI_IMPORT_FAILED');
            assert.match(error.message, /and @mux\/ai fallback/i);
            return true;
          }
        );
      } finally {
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});

test('mux adapter classifies import-time env validation failures as config errors', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      muxAiModule.setMuxAiModuleImporterForTests(async () => {
        throw new Error('❌ Invalid env: {}');
      });

      try {
        await assert.rejects(
          () => muxAiModule.transcribeWithMuxAi('mux-asset-invalid-env'),
          (error) => {
            assert.ok(muxAiModule.isMuxAiError(error));
            assert.equal(error.code, 'MUX_AI_CONFIG_MISSING');
            assert.match(error.message, /environment is invalid/i);
            return true;
          }
        );
      } finally {
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});

test('mux adapter throws structured invalid-response error when mux functions return bad shape', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      muxAiModule.setMuxAiModuleImporterForTests(async (moduleName) => {
        if (moduleName === '@mux/ai/primitives') {
          return {
            async transcribe() {
              return { invalid: true };
            }
          };
        }

        return {
          async transcribe() {
            return { invalid: true };
          }
        };
      });

      try {
        await assert.rejects(
          () => muxAiModule.transcribeWithMuxAi('mux-asset-invalid-shape'),
          (error) => {
            assert.ok(muxAiModule.isMuxAiError(error));
            assert.equal(error.code, 'MUX_AI_INVALID_RESPONSE');
            assert.equal(error.isDependencyError, true);
            assert.match(error.operatorHint, /version compatibility/i);
            return true;
          }
        );
      } finally {
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});

test('translation service deduplicates languages while using mux adapter boundary', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      muxAiModule.setMuxAiModuleImporterForTests(createMockMuxImporter());

      try {
        const translationModule = await import('../src/services/translation');
        const translations = await translationModule.translateTranscript(
          'mux-asset-translation-test',
          {
            language: 'en',
            text: 'Hello world',
            segments: [{ startSec: 0, endSec: 1, text: 'Hello world' }]
          },
          ['es', 'fr', 'es']
        );

        assert.equal(translations.length, 2);
        assert.deepEqual(
          translations.map((item) => item.language).sort(),
          ['es', 'fr']
        );
      } finally {
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});

test('mux adapter resolves numeric language IDs to ISO codes before caption translation workflow', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined,
      CORE_API_ENDPOINT: 'https://core.test/graphql'
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      let translatedFrom: string | null = null;
      let translatedTo: string | null = null;
      const originalFetch = globalThis.fetch;

      globalThis.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input.url);
        if (url === 'https://core.test/graphql') {
          return new Response(
            JSON.stringify({
              data: {
                language: {
                  id: '3934',
                  bcp47: 'ru',
                  iso3: 'rus'
                }
              }
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' }
            }
          );
        }
        throw new Error(`Unexpected fetch call in test: ${url}`);
      };

      muxAiModule.setMuxAiModuleImporterForTests(async (moduleName) => {
        if (moduleName === '@mux/ai/workflows') {
          return {
            async translateCaptions(_: string, from: string, to: string) {
              translatedFrom = from;
              translatedTo = to;
              return {
                targetLanguageCode: to,
                translatedVtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nPrivet'
              };
            }
          };
        }
        return {};
      });

      try {
        const translated = await muxAiModule.translateWithMuxAi(
          'mux-asset-language-id',
          {
            language: 'en',
            text: 'Hello world',
            segments: [{ startSec: 0, endSec: 1, text: 'Hello world' }]
          },
          '3934'
        );

        assert.equal(translatedFrom, 'en');
        assert.equal(translatedTo, 'ru');
        assert.equal(translated.language, '3934');
        assert.equal(translated.text, 'Privet');
      } finally {
        globalThis.fetch = originalFetch;
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});

test('mux primitives preprocessing is non-fatal and returns warnings', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: undefined,
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      const artifacts = await muxAiModule.preprocessMuxAssetWithPrimitives('mux-asset-456');
      assert.equal(typeof artifacts, 'object');
      assert.ok(Array.isArray(artifacts.warnings));
      assert.equal(artifacts.warnings[0]?.code, 'MUX_AI_CONFIG_MISSING');
    }
  );
});

test('mux adapter silently falls back to workflow when legacy primitives transcription shape is incompatible', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: undefined,
      MUX_TOKEN_SECRET: undefined
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map((value) => String(value)).join(' '));
      };

      muxAiModule.setMuxAiModuleImporterForTests(async (moduleName) => {
        if (moduleName === '@mux/ai/primitives') {
          return {
            async transcribe() {
              return { invalid: true };
            }
          };
        }

        return {
          async transcribe() {
            return {
              language: 'en',
              text: 'fallback transcript',
              segments: [{ startSec: 0, endSec: 1, text: 'fallback transcript' }]
            };
          }
        };
      });

      try {
        const transcript = await muxAiModule.transcribeWithMuxAi('mux-asset-fallback-warning');
        assert.equal(transcript.language, 'en');
        assert.equal(
          warnings.some((line) => line.includes('[mux-ai][optional-fallback]')),
          false
        );
      } finally {
        console.warn = originalWarn;
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});

test('mux adapter falls back to workflow when fetchTranscriptForAsset throws', async () => {
  await withEnv(
    {
      MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
      MUX_TOKEN_ID: 'mux-token-id',
      MUX_TOKEN_SECRET: 'mux-token-secret'
    },
    async () => {
      const muxAiModule = await import('../src/services/mux-ai');
      const originalFetch = globalThis.fetch;
      const warnings: string[] = [];
      const originalWarn = console.warn;

      globalThis.fetch = async (input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : String(input.url);

        if (url.includes('https://api.mux.com/video/v1/assets/')) {
          return new Response(
            JSON.stringify({
              data: {
                playback_ids: [{ id: 'public-playback-id', policy: 'public' }]
              }
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' }
            }
          );
        }

        throw new Error(`Unexpected fetch call in test: ${url}`);
      };

      console.warn = (...args: unknown[]) => {
        warnings.push(args.map((value) => String(value)).join(' '));
      };

      muxAiModule.setMuxAiModuleImporterForTests(async (moduleName) => {
        if (moduleName === '@mux/ai/primitives') {
          return {
            async fetchTranscriptForAsset() {
              throw new Error('No transcript track found for playback id');
            }
          };
        }

        return {
          async transcribe() {
            return {
              language: 'en',
              text: 'workflow fallback transcript',
              segments: [{ startSec: 0, endSec: 1, text: 'workflow fallback transcript' }]
            };
          }
        };
      });

      try {
        const transcript = await muxAiModule.transcribeWithMuxAi(
          'mux-asset-fetch-fallback'
        );
        assert.equal(transcript.text, 'workflow fallback transcript');
        assert.equal(
          warnings.some(
            (line) =>
              line.includes('operation="primitives transcription fetch"') &&
              line.includes('No transcript track found for playback id')
          ),
          true
        );
      } finally {
        globalThis.fetch = originalFetch;
        console.warn = originalWarn;
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});
