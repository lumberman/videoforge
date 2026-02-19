import assert from 'node:assert/strict';
import test from 'node:test';
import type { JobRecord } from '../src/types/job';
import {
  getLanguageBadges,
  getProgressSummary,
  getSourceTitle,
  getStepDotSymbol,
  groupJobsByDay
} from '../src/features/jobs/jobs-table-presenter';

function createJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'job_1',
    muxAssetId: 'asset_1',
    languages: ['es'],
    options: {},
    status: 'pending',
    retries: 0,
    createdAt: '2026-02-19T08:00:00.000Z',
    updatedAt: '2026-02-19T08:00:00.000Z',
    artifacts: {},
    steps: [
      {
        name: 'download_video',
        status: 'pending',
        retries: 0
      }
    ],
    errors: [],
    ...overrides
  };
}

test('groupJobsByDay groups records with same created day', () => {
  const jobs = [
    createJob({ id: 'job_1', createdAt: '2026-02-19T08:00:00.000Z' }),
    createJob({ id: 'job_2', createdAt: '2026-02-19T16:30:00.000Z' }),
    createJob({ id: 'job_3', createdAt: '2026-02-18T22:10:00.000Z' })
  ];

  const grouped = groupJobsByDay(jobs);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]?.jobs.length, 2);
  assert.equal(grouped[1]?.jobs.length, 1);
});

test('getProgressSummary reports failed step label', () => {
  const failed = createJob({
    status: 'failed',
    currentStep: 'metadata',
    steps: [
      { name: 'download_video', status: 'completed', retries: 0 },
      { name: 'metadata', status: 'failed', retries: 0 }
    ]
  });

  assert.match(getProgressSummary(failed), /Failed at Metadata/i);
});

test('getLanguageBadges resolves labels and deduplicates', () => {
  const job = createJob({
    languages: ['es'],
    requestedLanguageAbbreviations: ['es', 'es', 'fr']
  });
  const labels = new Map<string, string>([
    ['es', 'Spanish'],
    ['fr', 'French']
  ]);

  const badges = getLanguageBadges(job, labels);
  assert.equal(badges.length, 2);
  assert.match(badges[0]?.text ?? '', /Spanish/i);
  assert.match(badges[1]?.text ?? '', /French/i);
});

test('getSourceTitle falls back from collection to media to untitled', () => {
  assert.equal(
    getSourceTitle(createJob({ sourceCollectionTitle: 'Collection A', sourceMediaTitle: 'Media A' })),
    'Collection A'
  );
  assert.equal(getSourceTitle(createJob({ sourceMediaTitle: 'Media A' })), 'Media A');
  assert.equal(getSourceTitle(createJob()), 'Untitled source');
});

test('getStepDotSymbol maps visible symbols', () => {
  assert.equal(getStepDotSymbol('completed'), '✓');
  assert.equal(getStepDotSymbol('failed'), '×');
  assert.equal(getStepDotSymbol('skipped'), '−');
  assert.equal(getStepDotSymbol('running'), '•');
  assert.equal(getStepDotSymbol('pending'), '');
});
