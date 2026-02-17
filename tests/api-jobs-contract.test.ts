import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { importFresh, withTempDataEnv } from './helpers/temp-env';

test('POST /api/jobs accepts valid payload and returns pending job', async () => {
  await withTempDataEnv('api-jobs-post', async () => {
    const jobsRoute = await importFresh<typeof import('../src/app/api/jobs/route')>(
      '../src/app/api/jobs/route'
    );

    const response = await jobsRoute.POST(
      new Request('http://localhost/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muxAssetId: 'asset-api-post',
          languages: ['es', 'fr'],
          options: {
            generateVoiceover: false,
            uploadMux: false,
            notifyCms: false
          }
        })
      })
    );

    assert.equal(response.status, 202);
    const payload = (await response.json()) as { jobId?: string; status?: string };
    assert.ok(payload.jobId);
    assert.equal(payload.status, 'pending');
  });
});

test('POST /api/jobs validates payload shape', async () => {
  await withTempDataEnv('api-jobs-invalid', async () => {
    const jobsRoute = await importFresh<typeof import('../src/app/api/jobs/route')>(
      '../src/app/api/jobs/route'
    );

    const invalidResponse = await jobsRoute.POST(
      new Request('http://localhost/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muxAssetId: 'asset-api-post',
          languages: ['es', 42],
          options: { generateVoiceover: 'yes' }
        })
      })
    );

    assert.equal(invalidResponse.status, 400);
    const payload = (await invalidResponse.json()) as { error?: string };
    assert.match(payload.error ?? '', /languages must contain only strings/i);
  });
});

test('POST /api/jobs returns 400 for malformed JSON body', async () => {
  await withTempDataEnv('api-jobs-malformed-json', async () => {
    const jobsRoute = await importFresh<typeof import('../src/app/api/jobs/route')>(
      '../src/app/api/jobs/route'
    );

    const response = await jobsRoute.POST(
      new Request('http://localhost/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{'
      })
    );

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error?: string };
    assert.match(payload.error ?? '', /valid json/i);
  });
});

test('POST /api/jobs returns 500 for internal persistence failures', async () => {
  await withTempDataEnv('api-jobs-internal-failure', async ({ jobsDbPath }) => {
    await mkdir(jobsDbPath, { recursive: true });
    const jobsRoute = await importFresh<typeof import('../src/app/api/jobs/route')>(
      '../src/app/api/jobs/route'
    );

    const response = await jobsRoute.POST(
      new Request('http://localhost/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muxAssetId: 'asset-api-post',
          languages: ['es'],
          options: {}
        })
      })
    );

    assert.equal(response.status, 500);
    const payload = (await response.json()) as {
      error?: string;
      code?: string;
      details?: string;
    };
    assert.match(payload.error ?? '', /unable to create job/i);
    assert.equal(payload.code, 'JOB_CREATE_FAILED');
    assert.ok((payload.details ?? '').length > 0);
  });
});

test('GET /api/jobs returns records with workflow fields', async () => {
  await withTempDataEnv('api-jobs-get', async () => {
    const jobsRoute = await importFresh<typeof import('../src/app/api/jobs/route')>(
      '../src/app/api/jobs/route'
    );
    const jobStore = await importFresh<typeof import('../src/data/job-store')>(
      '../src/data/job-store'
    );

    await jobStore.createJob({
      muxAssetId: 'asset-api-get',
      languages: ['es'],
      options: {}
    });

    const response = await jobsRoute.GET();
    assert.equal(response.status, 200);

    const jobs = (await response.json()) as Array<{
      id: string;
      status: string;
      steps: unknown[];
      errors: unknown[];
      artifacts: Record<string, string>;
    }>;

    assert.equal(jobs.length, 1);
    assert.equal(typeof jobs[0]?.id, 'string');
    assert.equal(typeof jobs[0]?.status, 'string');
    assert.ok(Array.isArray(jobs[0]?.steps));
    assert.ok(Array.isArray(jobs[0]?.errors));
    assert.equal(typeof jobs[0]?.artifacts, 'object');
  });
});

test('GET job APIs expose structured error metadata fields', async () => {
  await withTempDataEnv('api-jobs-error-metadata', async () => {
    const jobsRoute = await importFresh<typeof import('../src/app/api/jobs/route')>(
      '../src/app/api/jobs/route'
    );
    const jobByIdRoute = await importFresh<
      typeof import('../src/app/api/jobs/[id]/route')
    >('../src/app/api/jobs/[id]/route');
    const jobStore = await importFresh<typeof import('../src/data/job-store')>(
      '../src/data/job-store'
    );

    const job = await jobStore.createJob({
      muxAssetId: 'asset-api-error-fields',
      languages: ['es'],
      options: {}
    });
    await jobStore.appendJobError(job.id, 'transcription', 'Mux dependency failed', {
      code: 'MUX_AI_CONFIG_MISSING',
      operatorHint: 'Configure MUX_AI_WORKFLOW_SECRET_KEY and retry.',
      isDependencyError: true
    });
    await jobStore.setJobStatus(job.id, 'failed', 'transcription');

    const jobsResponse = await jobsRoute.GET();
    assert.equal(jobsResponse.status, 200);
    const jobs = (await jobsResponse.json()) as Array<{
      id: string;
      errors: Array<{
        code?: string;
        operatorHint?: string;
        isDependencyError?: boolean;
      }>;
    }>;
    const listRecord = jobs.find((item) => item.id === job.id);
    assert.ok(listRecord);
    const listError = listRecord.errors.at(-1);
    assert.equal(listError?.code, 'MUX_AI_CONFIG_MISSING');
    assert.match(listError?.operatorHint ?? '', /configure/i);
    assert.equal(listError?.isDependencyError, true);

    const jobByIdResponse = await jobByIdRoute.GET(
      new Request(`http://localhost/api/jobs/${job.id}`),
      {
        params: Promise.resolve({ id: job.id })
      }
    );
    assert.equal(jobByIdResponse.status, 200);
    const byId = (await jobByIdResponse.json()) as {
      errors: Array<{
        code?: string;
        operatorHint?: string;
        isDependencyError?: boolean;
      }>;
    };
    const byIdError = byId.errors.at(-1);
    assert.equal(byIdError?.code, 'MUX_AI_CONFIG_MISSING');
    assert.equal(byIdError?.isDependencyError, true);
  });
});

test('GET /api/jobs/:id returns 404 for unknown job id', async () => {
  await withTempDataEnv('api-job-by-id', async () => {
    const jobByIdRoute = await importFresh<
      typeof import('../src/app/api/jobs/[id]/route')
    >('../src/app/api/jobs/[id]/route');

    const response = await jobByIdRoute.GET(
      new Request('http://localhost/api/jobs/job_missing'),
      {
        params: Promise.resolve({ id: 'job_missing' })
      }
    );

    assert.equal(response.status, 404);
    const payload = (await response.json()) as { error?: string };
    assert.match(payload.error ?? '', /job not found/i);
  });
});
