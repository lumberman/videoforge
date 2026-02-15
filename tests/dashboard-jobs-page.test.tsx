import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { importFresh, withTempDataEnv } from './helpers/temp-env';

test('jobs page renders empty-state copy when no jobs exist', async () => {
  await withTempDataEnv('dashboard-jobs-empty', async () => {
    const pageModule = await importFresh<typeof import('../src/app/dashboard/jobs/page')>(
      '../src/app/dashboard/jobs/page'
    );

    const html = renderToStaticMarkup(await pageModule.default());
    assert.match(html, /No jobs yet\. Create one to start the workflow\./i);
  });
});

test('jobs page renders failed job status and details link', async () => {
  await withTempDataEnv('dashboard-jobs-failed', async () => {
    const jobStore = await importFresh<typeof import('../src/data/job-store')>(
      '../src/data/job-store'
    );
    const pageModule = await importFresh<typeof import('../src/app/dashboard/jobs/page')>(
      '../src/app/dashboard/jobs/page'
    );

    const job = await jobStore.createJob({
      muxAssetId: 'asset-dashboard-failed',
      languages: ['es'],
      options: {}
    });
    await jobStore.setJobStatus(job.id, 'failed', 'metadata');

    const html = renderToStaticMarkup(await pageModule.default());
    assert.match(html, new RegExp(job.id));
    assert.match(html, /failed/i);
    assert.match(html, new RegExp(`/dashboard/jobs/${job.id}`));
  });
});
