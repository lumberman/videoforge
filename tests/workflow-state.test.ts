import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { withMockMuxAi } from './helpers/mux-ai-mock';
import { importFresh, withEnv, withTempDataEnv } from './helpers/temp-env';

test('workflow marks job as failed and preserves step context on artifact persistence error', async () => {
  await withTempDataEnv('workflow-failure', async ({ artifactRootPath }) => {
    await withMockMuxAi(async () => {
      await writeFile(artifactRootPath, 'locked');

      const jobStore = await importFresh<typeof import('../src/data/job-store')>(
        '../src/data/job-store'
      );
      const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
        '../src/workflows/videoEnrichment'
      );

      const job = await jobStore.createJob({
        muxAssetId: 'asset-failing-artifacts',
        languages: ['es'],
        options: {
          generateVoiceover: false,
          uploadMux: false,
          notifyCms: false
        }
      });

      await workflow.startVideoEnrichment(job.id);
      const failed = await jobStore.getJobById(job.id);
      assert.ok(failed);
      assert.equal(failed.status, 'failed');
      assert.equal(failed.currentStep, 'transcription');
    });
  });
});

test('workflow fails deterministically with structured dependency error when mux runtime is missing', async () => {
  await withTempDataEnv('workflow-mux-missing', async () => {
    await withEnv(
      {
        MUX_AI_WORKFLOW_SECRET_KEY: undefined,
        MUX_TOKEN_ID: undefined,
        MUX_TOKEN_SECRET: undefined
      },
      async () => {
        const jobStore = await importFresh<typeof import('../src/data/job-store')>(
          '../src/data/job-store'
        );
        const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
          '../src/workflows/videoEnrichment'
        );

        const job = await jobStore.createJob({
          muxAssetId: 'asset-missing-mux-runtime',
          languages: ['es'],
          options: {
            generateVoiceover: false,
            uploadMux: false,
            notifyCms: false
          }
        });

        await workflow.startVideoEnrichment(job.id);

        const failed = await jobStore.getJobById(job.id);
        assert.ok(failed);
        assert.equal(failed.status, 'failed');
        assert.equal(failed.currentStep, 'transcription');
        assert.equal(failed.retries, 0);
        assert.equal(failed.errors.length, 1);

        const latestError = failed.errors.at(-1);
        assert.ok(latestError);
        assert.equal(latestError.code, 'MUX_AI_CONFIG_MISSING');
        assert.equal(latestError.isDependencyError, true);
        assert.match(latestError.operatorHint ?? '', /configure/i);
      }
    );
  });
});

test('workflow does not retry deterministic mux invalid-response failures', async () => {
  await withTempDataEnv('workflow-mux-invalid-response', async () => {
    await withEnv(
      {
        MUX_AI_WORKFLOW_SECRET_KEY: 'test-workflow-secret',
        MUX_TOKEN_ID: undefined,
        MUX_TOKEN_SECRET: undefined
      },
      async () => {
        const muxAi = await import('../src/services/mux-ai');
        muxAi.setMuxAiModuleImporterForTests(async (moduleName) => {
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
          const jobStore = await importFresh<typeof import('../src/data/job-store')>(
            '../src/data/job-store'
          );
          const workflow = await importFresh<
            typeof import('../src/workflows/videoEnrichment')
          >('../src/workflows/videoEnrichment');

          const job = await jobStore.createJob({
            muxAssetId: 'asset-invalid-mux-response',
            languages: ['es'],
            options: {
              generateVoiceover: false,
              uploadMux: false,
              notifyCms: false
            }
          });

          await workflow.startVideoEnrichment(job.id);

          const failed = await jobStore.getJobById(job.id);
          assert.ok(failed);
          assert.equal(failed.status, 'failed');
          assert.equal(failed.currentStep, 'transcription');
          assert.equal(failed.retries, 0);
          assert.equal(failed.errors.length, 1);

          const latestError = failed.errors.at(-1);
          assert.ok(latestError);
          assert.equal(latestError.code, 'MUX_AI_INVALID_RESPONSE');
          assert.equal(latestError.isDependencyError, true);
        } finally {
          muxAi.setMuxAiModuleImporterForTests();
        }
      }
    );
  });
});

test('job-store increments retries and stores errors deterministically', async () => {
  await withTempDataEnv('workflow-retries', async () => {
    const jobStore = await importFresh<typeof import('../src/data/job-store')>(
      '../src/data/job-store'
    );

    const job = await jobStore.createJob({
      muxAssetId: 'asset-retry',
      languages: ['es'],
      options: {}
    });

    await jobStore.updateStepStatus(job.id, 'transcription', 'failed', {
      error: 'attempt-1',
      incrementRetry: true
    });
    await jobStore.updateStepStatus(job.id, 'transcription', 'failed', {
      error: 'attempt-2',
      incrementRetry: true
    });

    const after = await jobStore.getJobById(job.id);
    assert.ok(after);
    assert.equal(after.retries, 2);
    assert.equal(after.errors.length, 2);

    const step = after.steps.find((item) => item.name === 'transcription');
    assert.ok(step);
    assert.equal(step.retries, 2);
    assert.equal(step.status, 'failed');
    assert.equal(step.error, 'attempt-2');
  });
});

test('json store throws on malformed content instead of silently resetting', async () => {
  await withTempDataEnv('workflow-corrupt-json', async ({ jobsDbPath }) => {
    await writeFile(jobsDbPath, '{"jobs":[}', 'utf8');
    const jobStore = await importFresh<typeof import('../src/data/job-store')>(
      '../src/data/job-store'
    );

    await assert.rejects(() => jobStore.listJobs(), {
      name: 'SyntaxError'
    });
  });
});

test('optional steps are skipped when languages and optional flags are empty', async () => {
  await withTempDataEnv('workflow-skips', async () => {
    await withMockMuxAi(async () => {
      const jobStore = await importFresh<typeof import('../src/data/job-store')>(
        '../src/data/job-store'
      );
      const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
        '../src/workflows/videoEnrichment'
      );

      const job = await jobStore.createJob({
        muxAssetId: 'asset-skips',
        languages: [],
        options: {
          generateVoiceover: false,
          uploadMux: false,
          notifyCms: false
        }
      });

      await workflow.startVideoEnrichment(job.id);

      const completed = await jobStore.getJobById(job.id);
      assert.ok(completed);
      assert.equal(completed.status, 'completed');

      const translation = completed.steps.find((item) => item.name === 'translation');
      const voiceover = completed.steps.find((item) => item.name === 'voiceover');
      const muxUpload = completed.steps.find((item) => item.name === 'mux_upload');
      const cmsNotify = completed.steps.find((item) => item.name === 'cms_notify');

      assert.equal(translation?.status, 'skipped');
      assert.equal(voiceover?.status, 'skipped');
      assert.equal(muxUpload?.status, 'skipped');
      assert.equal(cmsNotify?.status, 'skipped');
    });
  });
});

test('optional integrations complete when uploadMux and notifyCms are enabled', async () => {
  await withTempDataEnv('workflow-optionals-enabled', async () => {
    await withMockMuxAi(async () => {
      const jobStore = await importFresh<typeof import('../src/data/job-store')>(
        '../src/data/job-store'
      );
      const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
        '../src/workflows/videoEnrichment'
      );

      const job = await jobStore.createJob({
        muxAssetId: 'asset-optionals-enabled',
        languages: ['es'],
        options: {
          generateVoiceover: false,
          uploadMux: true,
          notifyCms: true
        }
      });

      await workflow.startVideoEnrichment(job.id);

      const completed = await jobStore.getJobById(job.id);
      assert.ok(completed);
      assert.equal(completed.status, 'completed');
      assert.equal(
        completed.steps.find((item) => item.name === 'mux_upload')?.status,
        'completed'
      );
      assert.equal(
        completed.steps.find((item) => item.name === 'cms_notify')?.status,
        'completed'
      );
      assert.ok(completed.artifacts.muxUpload);
    });
  });
});
