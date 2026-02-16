import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getCoverageJobsQueueRedirectUrl,
  TranslationActionBar
} from '../src/features/coverage/coverage-report-client';

test('TranslationActionBar no longer renders translation scope toggle controls', () => {
  const html = renderToStaticMarkup(
    <TranslationActionBar
      selectedCount={2}
      languageLabels={['Spanish', 'French']}
      hoveredVideo={null}
      statusLabels={{ human: 'Human', ai: 'AI', none: 'Missing' }}
      isSubmitting={false}
      isInteractive
      onClear={() => {}}
      onTranslate={() => {}}
    />
  );

  assert.doesNotMatch(html, /Translate missing only/i);
  assert.doesNotMatch(html, /Translate all/i);
  assert.match(html, /Translate Now/i);
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

  assert.match(nextUrl ?? '', /^\/dashboard\/jobs\?/);
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
