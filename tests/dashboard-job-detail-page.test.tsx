import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { importFresh, withTempDataEnv } from './helpers/temp-env';

test('job detail page renders artifacts and error log details', async () => {
  await withTempDataEnv('dashboard-job-detail', async () => {
    const jobStore = await importFresh<typeof import('../src/data/job-store')>(
      '../src/data/job-store'
    );
    const storage = await importFresh<typeof import('../src/services/storage')>(
      '../src/services/storage'
    );
    const pageModule = await importFresh<
      typeof import('../src/app/dashboard/jobs/[id]/page')
    >('../src/app/dashboard/jobs/[id]/page');

    const job = await jobStore.createJob({
      muxAssetId: 'asset-dashboard-detail',
      languages: ['es'],
      options: {}
    });

    await jobStore.updateStepStatus(job.id, 'metadata', 'failed', {
      error: 'metadata extraction failed',
      incrementRetry: true
    });
    await jobStore.setJobStatus(job.id, 'failed', 'metadata');
    const muxUploadUrl = await storage.storeJsonArtifact(job.id, 'mux-upload.json', {
      playbackId: 'playback-dashboard-detail',
      status: 'uploaded'
    });
    await jobStore.mergeArtifacts(job.id, {
      transcript: '/api/artifacts/job_id/transcript.json',
      muxUpload: muxUploadUrl
    });

    const html = renderToStaticMarkup(
      await pageModule.default({
        params: Promise.resolve({ id: job.id })
      })
    );

    assert.match(html, /Job Details/i);
    assert.match(html, /Step Execution/i);
    assert.doesNotMatch(html, /<h3[^>]*>Artifacts<\/h3>/i);
    assert.match(html, /Error Log/i);
    assert.match(html, /metadata extraction failed/i);
    assert.match(html, /Transcription[\s\S]*transcript/i);
    assert.match(html, /transcript/i);
    assert.match(html, /Mux ID/i);
    assert.match(html, /href=\"https:\/\/player\.mux\.com\/playback-dashboard-detail\"/i);
    assert.match(html, /Watch on Mux/i);
  });
});

test('job detail page preserves selected language ids in report and queue links', async () => {
  await withTempDataEnv('dashboard-job-detail-language-links', async () => {
    const jobStore = await importFresh<typeof import('../src/data/job-store')>(
      '../src/data/job-store'
    );
    const pageModule = await importFresh<
      typeof import('../src/app/dashboard/jobs/[id]/page')
    >('../src/app/dashboard/jobs/[id]/page');

    const job = await jobStore.createJob({
      muxAssetId: 'asset-dashboard-detail-links',
      languages: ['fr'],
      options: {}
    });

    const html = renderToStaticMarkup(
      await pageModule.default({
        params: Promise.resolve({ id: job.id }),
        searchParams: Promise.resolve({ languageId: 'ro,fr' })
      })
    );

    assert.match(html, /href=\"\/dashboard\/coverage\?languageId=ro%2Cfr\"/i);
    assert.match(html, /href=\"\/jobs\?languageId=ro%2Cfr\"/i);
  });
});
