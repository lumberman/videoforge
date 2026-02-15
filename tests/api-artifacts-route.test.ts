import assert from 'node:assert/strict';
import test from 'node:test';
import { importFresh, withTempDataEnv } from './helpers/temp-env';

test('artifact route serves stored artifact with correct response code', async () => {
  await withTempDataEnv('api-artifact-read', async () => {
    const storage = await importFresh<typeof import('../src/services/storage')>(
      '../src/services/storage'
    );
    const artifactRoute = await importFresh<
      typeof import('../src/app/api/artifacts/[jobId]/[...artifact]/route')
    >('../src/app/api/artifacts/[jobId]/[...artifact]/route');

    const url = await storage.storeTextArtifact('job_abc123', 'notes.txt', 'hello artifact');
    const artifactName = url.split('/').pop() ?? '';

    const response = await artifactRoute.GET(
      new Request('http://localhost' + url),
      {
        params: Promise.resolve({
          jobId: 'job_abc123',
          artifact: [decodeURIComponent(artifactName)]
        })
      }
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'hello artifact');
  });
});

test('artifact route rejects empty artifact path', async () => {
  await withTempDataEnv('api-artifact-empty', async () => {
    const artifactRoute = await importFresh<
      typeof import('../src/app/api/artifacts/[jobId]/[...artifact]/route')
    >('../src/app/api/artifacts/[jobId]/[...artifact]/route');

    const response = await artifactRoute.GET(
      new Request('http://localhost/api/artifacts/job_abc123'),
      {
        params: Promise.resolve({
          jobId: 'job_abc123',
          artifact: []
        })
      }
    );

    assert.equal(response.status, 400);
    assert.match(await response.text(), /artifact path is required/i);
  });
});

test('artifact route rejects traversal-like segments', async () => {
  await withTempDataEnv('api-artifact-traversal', async () => {
    const artifactRoute = await importFresh<
      typeof import('../src/app/api/artifacts/[jobId]/[...artifact]/route')
    >('../src/app/api/artifacts/[jobId]/[...artifact]/route');

    const response = await artifactRoute.GET(
      new Request('http://localhost/api/artifacts/job_abc123/../secrets.txt'),
      {
        params: Promise.resolve({
          jobId: 'job_abc123',
          artifact: ['..', 'secrets.txt']
        })
      }
    );

    assert.equal(response.status, 400);
    assert.match(await response.text(), /invalid artifact path/i);
  });
});

test('artifact route returns 404 for missing artifact', async () => {
  await withTempDataEnv('api-artifact-404', async () => {
    const artifactRoute = await importFresh<
      typeof import('../src/app/api/artifacts/[jobId]/[...artifact]/route')
    >('../src/app/api/artifacts/[jobId]/[...artifact]/route');

    const response = await artifactRoute.GET(
      new Request('http://localhost/api/artifacts/job_abc123/missing.json'),
      {
        params: Promise.resolve({
          jobId: 'job_abc123',
          artifact: ['missing.json']
        })
      }
    );

    assert.equal(response.status, 404);
    assert.match(await response.text(), /artifact not found/i);
  });
});
