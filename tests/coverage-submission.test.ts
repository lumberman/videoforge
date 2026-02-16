import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCoverageJobsQueueUrl,
  getSelectedSelectableVideosInOrder,
  getSelectedVideosInOrder,
  shouldRedirectToJobsQueueAfterCoverageSubmit,
  submitCoverageSelection
} from '../src/features/coverage/submission';
import type { CoverageCollection, CoverageVideo } from '../src/features/coverage/types';

function selectableVideo(id: string, muxAssetId: string): CoverageVideo {
  return {
    id,
    title: `video-${id}`,
    subtitleStatus: 'none',
    voiceoverStatus: 'none',
    metadataStatus: 'none',
    thumbnailUrl: null,
    watchUrl: null,
    durationSeconds: null,
    selectable: true,
    muxAssetId,
    unselectableReason: null
  };
}

function unmappableVideo(id: string): CoverageVideo {
  return {
    id,
    title: `video-${id}`,
    subtitleStatus: 'none',
    voiceoverStatus: 'none',
    metadataStatus: 'none',
    thumbnailUrl: null,
    watchUrl: null,
    durationSeconds: null,
    selectable: false,
    muxAssetId: null,
    unselectableReason: 'Missing muxAssetId mapping for this item.'
  };
}

test('getSelectedVideosInOrder preserves collection order and de-duplicates ids', () => {
  const collections: CoverageCollection[] = [
    {
      id: 'collection-a',
      title: 'A',
      label: 'collection',
      publishedAt: null,
      videos: [selectableVideo('video-1', 'asset-1'), selectableVideo('video-2', 'asset-2')]
    },
    {
      id: 'collection-b',
      title: 'B',
      label: 'collection',
      publishedAt: null,
      videos: [selectableVideo('video-2', 'asset-2'), selectableVideo('video-3', 'asset-3')]
    }
  ];

  const ordered = getSelectedVideosInOrder(
    collections,
    new Set(['video-3', 'video-2'])
  );

  assert.deepEqual(
    ordered.map((video) => video.id),
    ['video-2', 'video-3']
  );
});

test('getSelectedSelectableVideosInOrder excludes unmappable items', () => {
  const collections: CoverageCollection[] = [
    {
      id: 'collection-a',
      title: 'A',
      label: 'collection',
      publishedAt: null,
      videos: [selectableVideo('video-1', 'asset-1'), unmappableVideo('video-2')]
    },
    {
      id: 'collection-b',
      title: 'B',
      label: 'collection',
      publishedAt: null,
      videos: [selectableVideo('video-3', 'asset-3')]
    }
  ];

  const ordered = getSelectedSelectableVideosInOrder(
    collections,
    new Set(['video-1', 'video-2', 'video-3'])
  );

  assert.deepEqual(
    ordered.map((video) => video.id),
    ['video-1', 'video-3']
  );
});

test('submitCoverageSelection returns deterministic mixed-result summary', async () => {
  const callOrder: string[] = [];

  const result = await submitCoverageSelection({
    selectedVideos: [
      selectableVideo('video-1', 'asset-1'),
      unmappableVideo('video-2'),
      selectableVideo('video-3', 'asset-3')
    ],
    languageIds: ['es'],
    options: {
      generateVoiceover: false,
      uploadMux: false,
      notifyCms: false
    },
    createJob: async ({ muxAssetId }) => {
      callOrder.push(muxAssetId);
      if (muxAssetId === 'asset-3') {
        throw new Error('gateway timeout');
      }

      return { jobId: `job-${muxAssetId}` };
    }
  });

  assert.deepEqual(callOrder, ['asset-1', 'asset-3']);
  assert.equal(result.created, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(
    result.items.map((item) => item.status),
    ['created', 'skipped', 'failed']
  );
  assert.equal(result.items[0]?.jobId, 'job-asset-1');
  assert.match(result.items[2]?.reason ?? '', /gateway timeout/i);
});

test('shouldRedirectToJobsQueueAfterCoverageSubmit only redirects when jobs were created', () => {
  assert.equal(
    shouldRedirectToJobsQueueAfterCoverageSubmit({
      created: 1,
      failed: 0,
      skipped: 0,
      items: []
    }),
    true
  );

  assert.equal(
    shouldRedirectToJobsQueueAfterCoverageSubmit({
      created: 0,
      failed: 2,
      skipped: 1,
      items: []
    }),
    false
  );
});

test('buildCoverageJobsQueueUrl includes deterministic coverage queue params', () => {
  const url = buildCoverageJobsQueueUrl({
    created: 3,
    failed: 1,
    skipped: 0
  });

  assert.match(
    url,
    /^\/dashboard\/jobs\?/
  );

  const params = new URLSearchParams(url.split('?')[1] ?? '');
  assert.equal(params.get('from'), 'coverage');
  assert.equal(params.get('created'), '3');
  assert.equal(params.get('failed'), '1');
  assert.equal(params.get('skipped'), '0');
});
