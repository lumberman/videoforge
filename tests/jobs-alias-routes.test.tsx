import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { importFresh, withTempDataEnv } from './helpers/temp-env';

test('jobs alias page renders queue content with /jobs detail links', async () => {
  await withTempDataEnv('jobs-alias-list', async () => {
    const jobStore = await importFresh<typeof import('../src/data/job-store')>(
      '../src/data/job-store'
    );
    const pageModule = await importFresh<typeof import('../src/app/jobs/page')>(
      '../src/app/jobs/page'
    );

    const job = await jobStore.createJob({
      muxAssetId: 'asset-jobs-alias-list',
      languages: ['es'],
      options: {}
    });

    const html = renderToStaticMarkup(await pageModule.default({}));
    assert.match(html, /Jobs/i);
    assert.match(html, new RegExp(`/jobs/${job.id}`));
  });
});

test('job detail alias page renders details view', async () => {
  await withTempDataEnv('jobs-alias-detail', async () => {
    const jobStore = await importFresh<typeof import('../src/data/job-store')>(
      '../src/data/job-store'
    );
    const pageModule = await importFresh<typeof import('../src/app/jobs/[id]/page')>(
      '../src/app/jobs/[id]/page'
    );

    const job = await jobStore.createJob({
      muxAssetId: 'asset-jobs-alias-detail',
      languages: ['es'],
      options: {}
    });

    const html = renderToStaticMarkup(
      await pageModule.default({
        params: Promise.resolve({ id: job.id })
      })
    );

    assert.match(html, /Job Details/i);
    assert.match(html, /Back to jobs/i);
    assert.match(html, /\/jobs/i);
  });
});
