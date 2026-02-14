import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function waitForTerminalStatus(
  getJob: () => Promise<{ status: string; errors: Array<{ message: string }> }>,
  timeoutMs: number
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const job = await getJob();
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for terminal job status.');
}

test('POST /api/jobs then GET /api/jobs/:id completes end-to-end', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'videoforge-smoke-'));
  const jobsDbPath = path.join(tempRoot, 'jobs.json');
  const artifactRootPath = path.join(tempRoot, 'artifacts');

  process.env.WORKFLOW_WORLD = 'local';
  process.env.JOBS_DB_PATH = jobsDbPath;
  process.env.ARTIFACT_ROOT_PATH = artifactRootPath;

  try {
    const jobsRoute = await import('../src/app/api/jobs/route');
    const jobByIdRoute = await import('../src/app/api/jobs/[id]/route');

    const postRequest = new Request('http://localhost/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        muxAssetId: 'smoke-asset-001',
        languages: ['es'],
        options: {
          generateVoiceover: false,
          uploadMux: false,
          notifyCms: false
        }
      })
    });

    const postResponse = await jobsRoute.POST(postRequest);
    assert.equal(postResponse.status, 202);

    const created = (await postResponse.json()) as { jobId?: string; status?: string };
    assert.ok(created.jobId, 'POST /api/jobs should return a jobId');
    assert.equal(created.status, 'pending');

    const terminal = await waitForTerminalStatus(async () => {
      const response = await jobByIdRoute.GET(new Request('http://localhost/api/jobs/id'), {
        params: Promise.resolve({ id: created.jobId! })
      });
      assert.equal(response.status, 200);
      return (await response.json()) as {
        status: string;
        errors: Array<{ message: string }>;
      };
    }, 4000);

    assert.equal(terminal.status, 'completed');
    assert.equal(terminal.errors.length, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
