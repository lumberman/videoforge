import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { withMockMuxAi } from './helpers/mux-ai-mock';
import { importFresh, withEnv, withTempDataEnv } from './helpers/temp-env';

function toArtifactPath(artifactRootPath: string, artifactUrl: string): string {
  const prefix = '/api/artifacts/';
  assert.equal(artifactUrl.startsWith(prefix), true);
  const relative = artifactUrl.slice(prefix.length);
  const [encodedJobId, encodedName] = relative.split('/');
  assert.ok(encodedJobId);
  assert.ok(encodedName);
  const jobId = decodeURIComponent(encodedJobId);
  const filename = decodeURIComponent(encodedName);
  return path.join(artifactRootPath, jobId, filename);
}

async function readArtifactJson<T>(
  artifactRootPath: string,
  artifactUrl: string
): Promise<T> {
  const filePath = toArtifactPath(artifactRootPath, artifactUrl);
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

test('workflow runs subtitle_post_process step and persists subtitle artifacts', async () => {
  await withTempDataEnv('workflow-subtitle-post-process', async ({ artifactRootPath }) => {
    await withMockMuxAi(async () => {
      const jobStore = await importFresh<typeof import('../src/data/job-store')>(
        '../src/data/job-store'
      );
      const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
        '../src/workflows/videoEnrichment'
      );

      const job = await jobStore.createJob({
        muxAssetId: 'asset-subtitle-post-process',
        languages: ['es'],
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

      const subtitleStep = completed.steps.find((step) => step.name === 'subtitle_post_process');
      assert.equal(subtitleStep?.status, 'completed');
      assert.equal(typeof completed.artifacts.subtitlesVtt, 'string');
      assert.equal(typeof completed.artifacts.subtitlePostProcessManifest, 'string');
      assert.equal(typeof completed.artifacts.subtitlesByLanguage, 'string');
      assert.equal(typeof completed.artifacts.subtitleTheologyByLanguage, 'string');
      assert.equal(typeof completed.artifacts.subtitleLanguageDeltasByLanguage, 'string');
      assert.equal(typeof completed.artifacts.subtitleTrackMetadata, 'string');

      const manifest = await readArtifactJson<{
        tracks: Array<{ idempotencyKey: string; cacheHit: boolean }>;
      }>(
        artifactRootPath,
        completed.artifacts.subtitlePostProcessManifest
      );
      assert.ok(manifest.tracks.length > 0);
      assert.equal(
        manifest.tracks.every((track) => typeof track.idempotencyKey === 'string'),
        true
      );
    });
  });
});

test('workflow reuses subtitle post-process output for identical inputs via idempotency key', async () => {
  await withTempDataEnv('workflow-subtitle-idempotency', async ({ artifactRootPath }) => {
    await withMockMuxAi(async () => {
      const jobStore = await importFresh<typeof import('../src/data/job-store')>(
        '../src/data/job-store'
      );
      const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
        '../src/workflows/videoEnrichment'
      );

      const first = await jobStore.createJob({
        muxAssetId: 'asset-subtitle-idempotent',
        languages: ['es'],
        options: {
          generateVoiceover: false,
          uploadMux: false,
          notifyCms: false
        }
      });
      await workflow.startVideoEnrichment(first.id);
      const firstCompleted = await jobStore.getJobById(first.id);
      assert.ok(firstCompleted);

      const second = await jobStore.createJob({
        muxAssetId: 'asset-subtitle-idempotent',
        languages: ['es'],
        options: {
          generateVoiceover: false,
          uploadMux: false,
          notifyCms: false
        }
      });
      await workflow.startVideoEnrichment(second.id);
      const secondCompleted = await jobStore.getJobById(second.id);
      assert.ok(secondCompleted);
      assert.equal(secondCompleted.status, 'completed');

      const secondManifest = await readArtifactJson<{
        tracks: Array<{ cacheHit: boolean; idempotencyKey: string }>;
      }>(
        artifactRootPath,
        secondCompleted.artifacts.subtitlePostProcessManifest
      );
      assert.ok(secondManifest.tracks.length > 0);
      assert.equal(secondManifest.tracks.every((track) => track.cacheHit === true), true);
      assert.equal(
        secondManifest.tracks.every((track) => track.idempotencyKey.length > 0),
        true
      );
    });
  });
});

test('mux upload includes subtitle attach metadata contract', async () => {
  await withTempDataEnv('workflow-subtitle-mux-metadata', async ({ artifactRootPath }) => {
    await withMockMuxAi(async () => {
      const jobStore = await importFresh<typeof import('../src/data/job-store')>(
        '../src/data/job-store'
      );
      const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
        '../src/workflows/videoEnrichment'
      );

      const job = await jobStore.createJob({
        muxAssetId: 'asset-subtitle-mux-upload',
        languages: ['es'],
        options: {
          generateVoiceover: false,
          uploadMux: true,
          notifyCms: false
        }
      });

      await workflow.startVideoEnrichment(job.id);
      const completed = await jobStore.getJobById(job.id);
      assert.ok(completed);
      assert.equal(completed.status, 'completed');
      assert.equal(typeof completed.artifacts.muxUpload, 'string');

      const muxUpload = await readArtifactJson<{
        textTracksAttached: number;
        subtitleTracks: Array<{
          metadata: {
            source: string;
            idempotencyKey: string;
            ai_post_processed: boolean;
          };
        }>;
      }>(artifactRootPath, completed.artifacts.muxUpload);

      assert.ok(muxUpload.textTracksAttached > 0);
      assert.ok(muxUpload.subtitleTracks.length > 0);
      const metadata = muxUpload.subtitleTracks[0]?.metadata;
      assert.equal(metadata?.source, 'ai_post_processed');
      assert.equal(typeof metadata?.idempotencyKey, 'string');
      assert.equal(typeof metadata?.ai_post_processed, 'boolean');
    });
  });
});

test('mux upload deduplicates subtitle attachments by idempotency key', async () => {
  await withTempDataEnv('workflow-subtitle-mux-idempotent-attach', async ({ artifactRootPath }) => {
    await withMockMuxAi(async () => {
      const jobStore = await importFresh<typeof import('../src/data/job-store')>(
        '../src/data/job-store'
      );
      const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
        '../src/workflows/videoEnrichment'
      );

      const first = await jobStore.createJob({
        muxAssetId: 'asset-subtitle-mux-idempotent',
        languages: ['es'],
        options: {
          generateVoiceover: false,
          uploadMux: true,
          notifyCms: false
        }
      });
      await workflow.startVideoEnrichment(first.id);
      const firstCompleted = await jobStore.getJobById(first.id);
      assert.ok(firstCompleted);

      const second = await jobStore.createJob({
        muxAssetId: 'asset-subtitle-mux-idempotent',
        languages: ['es'],
        options: {
          generateVoiceover: false,
          uploadMux: true,
          notifyCms: false
        }
      });
      await workflow.startVideoEnrichment(second.id);
      const secondCompleted = await jobStore.getJobById(second.id);
      assert.ok(secondCompleted);

      const firstMuxUpload = await readArtifactJson<{
        textTracksAttached: number;
        textTracksReused: number;
      }>(artifactRootPath, firstCompleted.artifacts.muxUpload);
      const secondMuxUpload = await readArtifactJson<{
        textTracksAttached: number;
        textTracksReused: number;
      }>(artifactRootPath, secondCompleted.artifacts.muxUpload);

      assert.ok(firstMuxUpload.textTracksAttached > 0);
      assert.equal(firstMuxUpload.textTracksReused, 0);
      assert.equal(secondMuxUpload.textTracksAttached, 0);
      assert.ok(secondMuxUpload.textTracksReused > 0);
    });
  });
});

test('workflow allowlist gate processes only allowed subtitle languages', async () => {
  await withTempDataEnv('workflow-subtitle-allowlist', async ({ artifactRootPath }) => {
    await withEnv({ SUBTITLE_POST_PROCESS_ALLOWLIST: 'es' }, async () => {
      await withMockMuxAi(async () => {
        const jobStore = await importFresh<typeof import('../src/data/job-store')>(
          '../src/data/job-store'
        );
        const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
          '../src/workflows/videoEnrichment'
        );

        const job = await jobStore.createJob({
          muxAssetId: 'asset-subtitle-allowlist',
          languages: ['es', 'fr'],
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
        assert.equal(typeof completed.artifacts.subtitlePostProcessManifest, 'string');

        const manifest = await readArtifactJson<{
          tracks: Array<{ language: string }>;
        }>(artifactRootPath, completed.artifacts.subtitlePostProcessManifest);
        assert.ok(manifest.tracks.length > 0);
        assert.equal(manifest.tracks.every((track) => track.language === 'es'), true);
      });
    });
  });
});

test('workflow fails when subtitle post-process has no eligible tracks', async () => {
  await withTempDataEnv('workflow-subtitle-allowlist-none', async () => {
    await withEnv({ SUBTITLE_POST_PROCESS_ALLOWLIST: 'zz' }, async () => {
      await withMockMuxAi(async () => {
        const jobStore = await importFresh<typeof import('../src/data/job-store')>(
          '../src/data/job-store'
        );
        const workflow = await importFresh<typeof import('../src/workflows/videoEnrichment')>(
          '../src/workflows/videoEnrichment'
        );

        const job = await jobStore.createJob({
          muxAssetId: 'asset-subtitle-allowlist-none',
          languages: ['es', 'fr'],
          options: {
            generateVoiceover: false,
            uploadMux: false,
            notifyCms: false
          }
        });

        await workflow.startVideoEnrichment(job.id);
        const completed = await jobStore.getJobById(job.id);
        assert.ok(completed);
        assert.equal(completed.status, 'failed');
        const subtitleStep = completed.steps.find((step) => step.name === 'subtitle_post_process');
        assert.ok(subtitleStep);
        assert.equal(subtitleStep.status, 'failed');
        assert.match(
          subtitleStep.error ?? '',
          /Subtitle post-process produced no eligible tracks/i
        );
        assert.equal(typeof completed.artifacts.subtitlePostProcessManifest, 'undefined');
        assert.equal(typeof completed.artifacts.subtitlesByLanguage, 'undefined');
        assert.equal(typeof completed.artifacts.subtitleTheologyByLanguage, 'undefined');
        assert.equal(typeof completed.artifacts.subtitleLanguageDeltasByLanguage, 'undefined');
        assert.equal(typeof completed.artifacts.subtitleTrackMetadata, 'undefined');
      });
    });
  });
});
