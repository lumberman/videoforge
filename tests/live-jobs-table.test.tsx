import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { JobRecord } from '../src/types/job';
import { LiveJobsTable } from '../src/features/jobs/live-jobs-table';

function createJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'job_live_1',
    muxAssetId: 'asset_live_1',
    languages: ['es'],
    options: {},
    status: 'running',
    currentStep: 'metadata',
    retries: 0,
    createdAt: '2026-02-19T08:00:00.000Z',
    updatedAt: '2026-02-19T08:00:00.000Z',
    artifacts: {},
    steps: [
      { name: 'download_video', status: 'completed', retries: 0 },
      { name: 'metadata', status: 'running', retries: 0 }
    ],
    errors: [],
    ...overrides
  };
}

test('LiveJobsTable renders auto-update status and refresh action', () => {
  const html = renderToStaticMarkup(
    <LiveJobsTable
      initialJobs={[createJob()]}
      languageLabelsById={{ es: 'Spanish' }}
    />
  );

  assert.match(html, /Auto-updating every 5s/i);
  assert.match(html, /Refresh now/i);
  assert.match(html, /In progress at Metadata/i);
  assert.match(html, /role="link"/i);
  assert.match(html, /tabindex="0"/i);
});

test('LiveJobsTable renders empty state when there are no jobs', () => {
  const html = renderToStaticMarkup(
    <LiveJobsTable
      initialJobs={[]}
      languageLabelsById={{}}
    />
  );

  assert.match(html, /No jobs yet\. Create one to start the workflow\./i);
});
