import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimateCoverageTranslateCostUsd,
  formatEstimatedUsd
} from '../src/features/coverage/estimate-cost';
import {
  DEFAULT_COVERAGE_ESTIMATE_PRICING,
  type CoverageEstimatePricing
} from '../src/features/coverage/estimate-pricing';
import type { CoverageVideo } from '../src/features/coverage/types';

function selectableVideo(id: string, durationSeconds: number | null): CoverageVideo {
  return {
    id,
    title: `video-${id}`,
    subtitleStatus: 'none',
    voiceoverStatus: 'none',
    metadataStatus: 'none',
    thumbnailUrl: null,
    watchUrl: null,
    durationSeconds,
    selectable: true,
    muxAssetId: `asset-${id}`,
    unselectableReason: null
  };
}

test('estimateCoverageTranslateCostUsd scales up with selected language count', () => {
  const videos = [selectableVideo('1', 600)];

  const oneLanguage = estimateCoverageTranslateCostUsd({
    videos,
    selectedLanguageCount: 1
  });
  const threeLanguages = estimateCoverageTranslateCostUsd({
    videos,
    selectedLanguageCount: 3
  });

  assert.equal(oneLanguage > 0, true);
  assert.equal(threeLanguages > oneLanguage, true);
});

test('estimateCoverageTranslateCostUsd uses fallback duration for missing values', () => {
  const pricing: CoverageEstimatePricing = {
    ...DEFAULT_COVERAGE_ESTIMATE_PRICING,
    fallbackDurationSeconds: 480
  };
  const videos = [selectableVideo('1', null)];

  const estimated = estimateCoverageTranslateCostUsd({
    videos,
    selectedLanguageCount: 1,
    pricing
  });

  assert.equal(estimated > 0, true);
});

test('estimateCoverageTranslateCostUsd returns zero for empty selections', () => {
  const estimated = estimateCoverageTranslateCostUsd({
    videos: [],
    selectedLanguageCount: 2
  });

  assert.equal(estimated, 0);
});

test('estimateCoverageTranslateCostUsd clamps invalid pricing assumptions to zero result', () => {
  const invalidPricing: CoverageEstimatePricing = {
    ...DEFAULT_COVERAGE_ESTIMATE_PRICING,
    wordsPerToken: 0
  };

  const estimated = estimateCoverageTranslateCostUsd({
    videos: [selectableVideo('1', 180)],
    selectedLanguageCount: 1,
    pricing: invalidPricing
  });

  assert.equal(estimated, 0);
});

test('formatEstimatedUsd returns stable 2-decimal USD output', () => {
  assert.equal(formatEstimatedUsd(1.2), '$1.20');
  assert.equal(formatEstimatedUsd(0), '$0.00');
});
