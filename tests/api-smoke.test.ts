import assert from 'node:assert/strict';
import test from 'node:test';
import { withMockMuxAi } from './helpers/mux-ai-mock';
import { importFresh, withTempDataEnv } from './helpers/temp-env';

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
  await withTempDataEnv('api-smoke', async () => {
    await withMockMuxAi(async () => {
      const jobsRoute = await importFresh<typeof import('../src/app/api/jobs/route')>(
        '../src/app/api/jobs/route'
      );
      const jobByIdRoute = await importFresh<
        typeof import('../src/app/api/jobs/[id]/route')
      >('../src/app/api/jobs/[id]/route');

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
        const response = await jobByIdRoute.GET(
          new Request(`http://localhost/api/jobs/${created.jobId}`),
          {
            params: Promise.resolve({ id: created.jobId! })
          }
        );
        assert.equal(response.status, 200);
        return (await response.json()) as {
          status: string;
          errors: Array<{ message: string }>;
        };
      }, 4000);

      assert.equal(terminal.status, 'completed');
      assert.equal(terminal.errors.length, 0);
    });
  });
});
