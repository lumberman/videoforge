import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildUnselectableVideoSubmitError,
  buildCoverageUrlWithoutRefresh,
  buildCoverageSubmitFeedback,
  buildVideoJobDebugPayload,
  CoverageReportClient,
  getSelectableVideoIdsForSelection,
  getCoverageJobsQueueRedirectUrl,
  TranslationActionBar
} from '../src/features/coverage/coverage-report-client';

test('TranslationActionBar no longer renders translation scope toggle controls', () => {
  const html = renderToStaticMarkup(
    <TranslationActionBar
      selectedCount={2}
      languageLabels={['Spanish', 'French']}
      estimatedCostLabel={null}
      hoveredVideo={null}
      statusLabels={{ human: 'Human', ai: 'AI', none: 'Missing' }}
      isSubmitting={false}
      submitFeedback={null}
      isInteractive
      onClear={() => {}}
      onTranslate={() => {}}
    />
  );

  assert.doesNotMatch(html, /Translate missing only/i);
  assert.doesNotMatch(html, /Translate all/i);
  assert.match(html, /Translate Now/i);
});

test('TranslationActionBar renders estimated cost and hides it when absent', () => {
  const withEstimate = renderToStaticMarkup(
    <TranslationActionBar
      selectedCount={2}
      languageLabels={['Spanish']}
      estimatedCostLabel="Estimated cost: ~$1.23"
      hoveredVideo={null}
      statusLabels={{ human: 'Human', ai: 'AI', none: 'Missing' }}
      isSubmitting={false}
      submitFeedback={null}
      isInteractive
      onClear={() => {}}
      onTranslate={() => {}}
    />
  );
  assert.match(withEstimate, /Estimated cost:\s*~\$1\.23/i);

  const withoutEstimate = renderToStaticMarkup(
    <TranslationActionBar
      selectedCount={0}
      languageLabels={['Spanish']}
      estimatedCostLabel={null}
      hoveredVideo={null}
      statusLabels={{ human: 'Human', ai: 'AI', none: 'Missing' }}
      isSubmitting={false}
      submitFeedback={null}
      isInteractive
      onClear={() => {}}
      onTranslate={() => {}}
    />
  );
  assert.doesNotMatch(withoutEstimate, /Estimated cost:/i);
});

test('TranslationActionBar shows submitting state and feedback message', () => {
  const html = renderToStaticMarkup(
    <TranslationActionBar
      selectedCount={1}
      languageLabels={['Russian']}
      estimatedCostLabel={null}
      hoveredVideo={null}
      statusLabels={{ human: 'Human', ai: 'AI', none: 'Missing' }}
      isSubmitting
      submitFeedback={{ tone: 'neutral', message: 'Submitting translation jobs...' }}
      isInteractive
      onClear={() => {}}
      onTranslate={() => {}}
    />
  );

  assert.match(html, /Submitting\.\.\./i);
  assert.match(html, /Submitting translation jobs\.\.\./i);
  assert.match(html, /aria-busy=\"true\"/i);
});

test('TranslationActionBar renders error feedback in a toast above panel', () => {
  const html = renderToStaticMarkup(
    <TranslationActionBar
      selectedCount={1}
      languageLabels={['Russian']}
      estimatedCostLabel={null}
      hoveredVideo={null}
      statusLabels={{ human: 'Human', ai: 'AI', none: 'Missing' }}
      isSubmitting={false}
      submitFeedback={{
        tone: 'error',
        message: 'No jobs were queued. Failed: 0. Skipped: 1.'
      }}
      isInteractive
      onClear={() => {}}
      onTranslate={() => {}}
    />
  );

  assert.match(html, /translation-toast--error/i);
  assert.match(html, /No jobs were queued\./i);
  assert.match(html, /Dismiss translation error/i);
  assert.match(html, /Show error details/i);
});

test('getCoverageJobsQueueRedirectUrl returns queue URL for successful done state only once', () => {
  const nextUrl = getCoverageJobsQueueRedirectUrl({
    submitState: {
      type: 'done',
      result: {
        created: 2,
        failed: 1,
        skipped: 0,
        items: []
      }
    },
    hasRedirected: false
  });

  assert.match(nextUrl ?? '', /^\/jobs\?/);
  const params = new URLSearchParams((nextUrl ?? '').split('?')[1] ?? '');
  assert.equal(params.get('from'), 'coverage');
  assert.equal(params.get('created'), '2');
  assert.equal(params.get('failed'), '1');
  assert.equal(params.get('skipped'), '0');

  const blockedRepeat = getCoverageJobsQueueRedirectUrl({
    submitState: {
      type: 'done',
      result: {
        created: 2,
        failed: 1,
        skipped: 0,
        items: []
      }
    },
    hasRedirected: true
  });
  assert.equal(blockedRepeat, null);
});

test('buildCoverageUrlWithoutRefresh strips one-shot refresh query param', () => {
  assert.equal(
    buildCoverageUrlWithoutRefresh('https://app.test/dashboard/coverage?languageId=529&refresh=1'),
    '/dashboard/coverage?languageId=529'
  );
  assert.equal(
    buildCoverageUrlWithoutRefresh('https://app.test/dashboard/coverage?refresh=1#table'),
    '/dashboard/coverage#table'
  );
  assert.equal(
    buildCoverageUrlWithoutRefresh('https://app.test/dashboard/coverage?languageId=529'),
    null
  );
});

test('getCoverageJobsQueueRedirectUrl does not redirect for non-successful outcomes', () => {
  const noCreated = getCoverageJobsQueueRedirectUrl({
    submitState: {
      type: 'done',
      result: {
        created: 0,
        failed: 2,
        skipped: 1,
        items: []
      }
    },
    hasRedirected: false
  });
  assert.equal(noCreated, null);

  const submitting = getCoverageJobsQueueRedirectUrl({
    submitState: { type: 'submitting' },
    hasRedirected: false
  });
  assert.equal(submitting, null);
});

test('CoverageReportClient renders a single translation action bar', () => {
  const html = renderToStaticMarkup(
    <CoverageReportClient
      gatewayConfigured
      initialErrorMessage={null}
      initialCollections={[
        {
          id: 'collection-1',
          title: 'Collection 1',
          label: 'collection',
          publishedAt: null,
          videos: [
            {
              id: 'video-1',
              title: 'Video 1',
              subtitleStatus: 'none',
              voiceoverStatus: 'none',
              metadataStatus: 'none',
              thumbnailUrl: null,
              watchUrl: null,
              durationSeconds: null,
              selectable: true,
              muxAssetId: 'mux-1',
              unselectableReason: null
            }
          ]
        }
      ]}
      initialSelectedLanguageIds={['3934']}
      initialLanguages={[
        {
          id: '3934',
          englishLabel: 'Russian',
          nativeLabel: 'Russian'
        }
      ]}
    />
  );

  const translationBarMatches = html.match(/class=\"translation-bar/g) ?? [];
  assert.equal(translationBarMatches.length, 1);
});

test('CoverageReportClient marks non-selectable tiles with disabled visual class', () => {
  const html = renderToStaticMarkup(
    <CoverageReportClient
      gatewayConfigured
      initialErrorMessage={null}
      initialCollections={[
        {
          id: 'collection-1',
          title: 'Collection 1',
          label: 'collection',
          publishedAt: null,
          videos: [
            {
              id: 'video-2',
              title: 'Video 2',
              subtitleStatus: 'none',
              voiceoverStatus: 'none',
              metadataStatus: 'none',
              thumbnailUrl: null,
              watchUrl: null,
              durationSeconds: null,
              selectable: false,
              muxAssetId: null,
              unselectableReason: 'Missing muxAssetId mapping for this item.'
            }
          ]
        }
      ]}
      initialSelectedLanguageIds={['3934']}
      initialLanguages={[
        {
          id: '3934',
          englishLabel: 'Russian',
          nativeLabel: 'Russian'
        }
      ]}
    />
  );

  assert.match(html, /is-unselectable/i);
});

test('buildCoverageSubmitFeedback returns explicit message for no jobs queued', () => {
  const feedback = buildCoverageSubmitFeedback({
    type: 'done',
    result: {
      created: 0,
      failed: 1,
      skipped: 1,
      items: [
        {
          mediaId: 'video-1',
          title: 'Video 1',
          muxAssetId: 'mux-1',
          status: 'failed',
          reason: 'Gateway timeout.',
          jobId: null
        },
        {
          mediaId: 'video-2',
          title: 'Video 2',
          muxAssetId: null,
          status: 'skipped',
          reason: 'Missing muxAssetId mapping.',
          jobId: null
        }
      ]
    }
  });

  assert.equal(feedback?.tone, 'error');
  assert.match(feedback?.message ?? '', /No jobs were queued\./i);
  assert.match(feedback?.message ?? '', /Gateway timeout\./i);
});

test('getSelectableVideoIdsForSelection filters out non-selectable items', () => {
  const ids = getSelectableVideoIdsForSelection([
    { id: 'video-1', selectable: true },
    { id: 'video-2', selectable: false },
    { id: 'video-3', selectable: true }
  ]);

  assert.deepEqual(ids, ['video-1', 'video-3']);
});

test('buildUnselectableVideoSubmitError returns mux availability toast content', () => {
  const errorState = buildUnselectableVideoSubmitError({
    id: 'video-2',
    title: 'Video 2',
    unselectableReason: 'Missing muxAssetId mapping for this item.'
  });

  assert.equal(errorState.type, 'error');
  assert.match(errorState.message, /not uploaded to Mux/i);
  assert.equal(errorState.details?.[0], 'Video 2 (video-2) · Missing muxAssetId mapping for this item.');
  assert.equal(typeof errorState.nonce, 'number');
});

test('buildVideoJobDebugPayload marks selectable item as creatable with payload mapping', () => {
  const payload = buildVideoJobDebugPayload(
    {
      id: 'video-1',
      title: 'Video 1',
      subtitleStatus: 'none',
      voiceoverStatus: 'none',
      metadataStatus: 'none',
      metaStatus: 'none',
      meta: {
        tags: false,
        description: false,
        title: false,
        questions: false,
        bibleQuotes: false,
        completed: 0,
        total: 5
      },
      thumbnailUrl: null,
      watchUrl: null,
      durationSeconds: 31,
      selectable: true,
      muxAssetId: 'mux-1',
      unselectableReason: null
    },
    ['3934'],
    'Collection 1'
  );

  assert.equal(payload.mapping.willCreateJob, true);
  assert.equal(payload.mapping.skipReason, null);
  assert.equal(payload.mapping.createJobPayload?.muxAssetId, 'mux-1');
  assert.deepEqual(payload.mapping.createJobPayload?.languages, ['3934']);
});

test('buildVideoJobDebugPayload marks non-selectable item as skipped with reason', () => {
  const payload = buildVideoJobDebugPayload(
    {
      id: 'video-2',
      title: 'Video 2',
      subtitleStatus: 'none',
      voiceoverStatus: 'none',
      metadataStatus: 'none',
      metaStatus: 'none',
      meta: {
        tags: false,
        description: false,
        title: false,
        questions: false,
        bibleQuotes: false,
        completed: 0,
        total: 5
      },
      thumbnailUrl: null,
      watchUrl: null,
      durationSeconds: null,
      selectable: false,
      muxAssetId: null,
      unselectableReason: 'Missing muxAssetId mapping.'
    },
    ['3934'],
    'Collection 2'
  );

  assert.equal(payload.mapping.willCreateJob, false);
  assert.equal(payload.mapping.skipReason, 'Missing muxAssetId mapping.');
  assert.equal(payload.mapping.createJobPayload, null);
});
