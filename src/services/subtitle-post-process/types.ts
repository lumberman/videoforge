export type SubtitleOrigin = 'ai-raw' | 'ai-processed' | 'ai-human' | 'human';

export type LanguageClass = 'LTR' | 'RTL' | 'CJK';

export interface SubtitleSegment {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface SubtitleCue {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface LanguageProfile {
  targetCPS: number;
  maxCPS: number;
  targetCPL: number;
  maxCPL: number;
  maxLines: number;
  minDuration: number;
  maxDuration: number;
  startOffsetMs: number;
  endOffsetMs: number;
  minGapMs: number;
  languageProfileVersion: 'v1';
}

export type ValidationRule =
  | 'WEBVTT_HEADER'
  | 'WEBVTT_TIMESTAMP'
  | 'MAX_LINES'
  | 'MAX_CPL'
  | 'MAX_CPS'
  | 'MIN_DURATION'
  | 'MAX_DURATION'
  | 'MIN_GAP'
  | 'OVERLAP'
  | 'EMPTY_CUE'
  | 'MONOTONIC_TIMESTAMPS'
  | 'DISALLOWED_MARKUP';

export interface ValidationError {
  cueIndex: number;
  rule: ValidationRule;
  measured: number | string;
  limit: number | string;
}

export interface TheologyIssue {
  cueIndex: number;
  severity: 'low' | 'medium' | 'high';
  message: string;
  suggestion?: string;
}

export interface LanguageQualityDelta {
  cueIndex: number;
  beforeText: string;
  afterText: string;
}

export interface SubtitlePassResult {
  cues: SubtitleCue[];
  theologyIssues: TheologyIssue[];
  promptVersion: 'v1';
}

export interface SubtitlePostProcessInput {
  assetId: string;
  bcp47: string;
  subtitleOrigin: SubtitleOrigin | undefined;
  segments: SubtitleSegment[];
}

export interface SubtitlePostProcessOutput {
  bcp47: string;
  languageClass: LanguageClass;
  profile: LanguageProfile;
  idempotencyKey: string;
  cacheHit: boolean;
  subtitleOrigin: SubtitleOrigin;
  subtitleOriginBefore: SubtitleOrigin;
  subtitleOriginAfter: SubtitleOrigin;
  vtt: string;
  cues: SubtitleCue[];
  theologyIssues: TheologyIssue[];
  languageQualityDeltas: LanguageQualityDelta[];
  validationErrors: ValidationError[];
  aiRetryCount: number;
  usedFallback: boolean;
  postProcessInputSha256: string;
  whisperSegmentsSha256: string;
  promptVersion: 'v1';
  validatorVersion: 'v1';
  fallbackVersion: 'v1';
  skipped: boolean;
  skipReason?: string;
}
