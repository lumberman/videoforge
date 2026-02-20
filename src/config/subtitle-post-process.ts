import type { LanguageClass, LanguageProfile, SubtitleOrigin } from '@/services/subtitle-post-process/types';

export const SUBTITLE_POST_PROCESS_VERSIONS = {
  languageProfileVersion: 'v1',
  promptVersion: 'v1',
  validatorVersion: 'v1',
  fallbackVersion: 'v1'
} as const;

const LTR_PROFILE: LanguageProfile = {
  targetCPS: 13.5,
  maxCPS: 17,
  targetCPL: 32,
  maxCPL: 38,
  maxLines: 2,
  minDuration: 1.3,
  maxDuration: 6.0,
  startOffsetMs: 150,
  endOffsetMs: 50,
  minGapMs: 50,
  languageProfileVersion: SUBTITLE_POST_PROCESS_VERSIONS.languageProfileVersion
};

const RTL_PROFILE: LanguageProfile = {
  targetCPS: 12,
  maxCPS: 16,
  targetCPL: 28,
  maxCPL: 34,
  maxLines: 2,
  minDuration: 1.5,
  maxDuration: 5.5,
  startOffsetMs: 150,
  endOffsetMs: 50,
  minGapMs: 50,
  languageProfileVersion: SUBTITLE_POST_PROCESS_VERSIONS.languageProfileVersion
};

const CJK_PROFILE: LanguageProfile = {
  targetCPS: 8,
  maxCPS: 11,
  targetCPL: 14,
  maxCPL: 18,
  maxLines: 1,
  minDuration: 1.2,
  maxDuration: 4.5,
  startOffsetMs: 150,
  endOffsetMs: 50,
  minGapMs: 50,
  languageProfileVersion: SUBTITLE_POST_PROCESS_VERSIONS.languageProfileVersion
};

export const SUBTITLE_PROFILES: Record<LanguageClass, LanguageProfile> = {
  LTR: LTR_PROFILE,
  RTL: RTL_PROFILE,
  CJK: CJK_PROFILE
};

const DEFAULT_ALLOWLIST = ['en', 'es', 'fr', 'de', 'ar', 'he', 'fa', 'ur', 'ja', 'ko', 'zh-Hans', 'zh-Hant'];

export function getSubtitlePostProcessAllowlist(): Set<string> {
  const raw = process.env.SUBTITLE_POST_PROCESS_ALLOWLIST?.trim();
  if (!raw) {
    return new Set(DEFAULT_ALLOWLIST.map((value) => value.toLowerCase()));
  }

  if (raw === '*') {
    return new Set(['*']);
  }

  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowedLanguage(bcp47: string): boolean {
  const allowlist = getSubtitlePostProcessAllowlist();
  if (allowlist.has('*')) {
    return true;
  }

  const normalized = bcp47.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const parts = normalized.split('-').filter(Boolean);
  for (let length = parts.length; length >= 1; length -= 1) {
    const candidate = parts.slice(0, length).join('-');
    if (allowlist.has(candidate)) {
      return true;
    }
  }

  return false;
}

export function canMutateSubtitle(origin: SubtitleOrigin | undefined): boolean {
  return origin === 'ai-raw';
}

export function normalizeSubtitleOrigin(origin: SubtitleOrigin | undefined): SubtitleOrigin {
  if (
    origin === 'ai-raw' ||
    origin === 'ai-processed' ||
    origin === 'ai-human' ||
    origin === 'human'
  ) {
    return origin;
  }
  return 'human';
}
