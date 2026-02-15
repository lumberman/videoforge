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

test('mux adapter emits warning when optional primitives path falls back to workflow', async () => {
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
          true
        );
      } finally {
        console.warn = originalWarn;
        muxAiModule.setMuxAiModuleImporterForTests();
      }
    }
  );
});
