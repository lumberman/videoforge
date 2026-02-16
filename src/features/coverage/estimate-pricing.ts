export type TokenPricing = {
  inputUsdPer1MTokens: number;
  outputUsdPer1MTokens: number;
};

export type CoverageEstimatePricing = {
  transcriptionModel: string;
  translationModel: string;
  postProcessingModel: string;
  transcriptionPricing: TokenPricing;
  translationPricing: TokenPricing;
  postProcessingPricing: TokenPricing;
  speechRateWordsPerMinute: number;
  wordsPerToken: number;
  translationOutputMultiplier: number;
  postProcessPassCount: number;
  fallbackDurationSeconds: number;
  pricingSourceUrl: string;
  assumptionRevisionDate: string;
};

/**
 * Estimation-only assumptions used in coverage order previews.
 * Keep values centralized so rate updates are one-file changes.
 */
export const DEFAULT_COVERAGE_ESTIMATE_PRICING: CoverageEstimatePricing = {
  transcriptionModel: 'gpt-4o-mini-transcribe',
  translationModel: 'gpt-4.1-mini',
  postProcessingModel: 'openai-5.2',
  transcriptionPricing: {
    inputUsdPer1MTokens: 0.6,
    outputUsdPer1MTokens: 2.4
  },
  translationPricing: {
    inputUsdPer1MTokens: 0.4,
    outputUsdPer1MTokens: 1.6
  },
  postProcessingPricing: {
    inputUsdPer1MTokens: 0.25,
    outputUsdPer1MTokens: 2
  },
  speechRateWordsPerMinute: 135,
  wordsPerToken: 0.75,
  translationOutputMultiplier: 1.1,
  postProcessPassCount: 2,
  fallbackDurationSeconds: 300,
  pricingSourceUrl: 'https://openai.com/api/pricing/',
  assumptionRevisionDate: '2026-02-16'
};
