import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TranslationActionBar } from '../src/features/coverage/coverage-report-client';

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
