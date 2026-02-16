import type { CoverageVideo } from './types';
import {
  DEFAULT_COVERAGE_ESTIMATE_PRICING,
  type CoverageEstimatePricing,
  type TokenPricing
} from './estimate-pricing';

const TOKENS_PER_MILLION = 1_000_000;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function toNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function estimateTokenCostUsd(
  tokensIn: number,
  tokensOut: number,
  pricing: TokenPricing
): number {
  const safeIn = toNonNegative(tokensIn);
  const safeOut = toNonNegative(tokensOut);

  return (
    (safeIn / TOKENS_PER_MILLION) * pricing.inputUsdPer1MTokens +
    (safeOut / TOKENS_PER_MILLION) * pricing.outputUsdPer1MTokens
  );
}

function resolveTotalDurationSeconds(
  videos: CoverageVideo[],
  fallbackDurationSeconds: number
): number {
  return videos.reduce((sum, video) => {
    if (video.durationSeconds !== null && isPositiveFinite(video.durationSeconds)) {
      return sum + video.durationSeconds;
    }
    return sum + fallbackDurationSeconds;
  }, 0);
}

export type CoverageTranslateCostEstimateInput = {
  videos: CoverageVideo[];
  selectedLanguageCount: number;
  pricing?: CoverageEstimatePricing;
};

export function estimateCoverageTranslateCostUsd(
  input: CoverageTranslateCostEstimateInput
): number {
  const pricing = input.pricing ?? DEFAULT_COVERAGE_ESTIMATE_PRICING;

  if (input.videos.length === 0 || input.selectedLanguageCount <= 0) {
    return 0;
  }

  if (
    !isPositiveFinite(pricing.speechRateWordsPerMinute) ||
    !isPositiveFinite(pricing.wordsPerToken) ||
    !isPositiveFinite(pricing.translationOutputMultiplier) ||
    !isPositiveFinite(pricing.postProcessPassCount) ||
    !isPositiveFinite(pricing.fallbackDurationSeconds)
  ) {
    return 0;
  }

  const totalDurationSeconds = resolveTotalDurationSeconds(
    input.videos,
    pricing.fallbackDurationSeconds
  );
  const sourceWords =
    (totalDurationSeconds / 60) * pricing.speechRateWordsPerMinute;
  const sourceTokens = sourceWords / pricing.wordsPerToken;
  const translatedOutputTokens = sourceTokens * pricing.translationOutputMultiplier;

  const transcriptionCost = estimateTokenCostUsd(
    sourceTokens,
    sourceTokens,
    pricing.transcriptionPricing
  );

  const translationCostPerLanguage = estimateTokenCostUsd(
    sourceTokens,
    translatedOutputTokens,
    pricing.translationPricing
  );

  const postProcessCostPerLanguage = estimateTokenCostUsd(
    translatedOutputTokens * pricing.postProcessPassCount,
    translatedOutputTokens * pricing.postProcessPassCount,
    pricing.postProcessingPricing
  );

  const languages = Math.floor(input.selectedLanguageCount);
  const total =
    transcriptionCost +
    languages * translationCostPerLanguage +
    languages * postProcessCostPerLanguage;

  return toNonNegative(total);
}

export function formatEstimatedUsd(usd: number): string {
  return usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
