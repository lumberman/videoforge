import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFallbackCues } from '../../src/services/subtitle-post-process/fallback-formatter';
import { renderWebVtt } from '../../src/services/subtitle-post-process/vtt';
import { validateWebVtt } from '../../src/services/subtitle-post-process/validator';
import { SUBTITLE_PROFILES } from '../../src/config/subtitle-post-process';
import type { LanguageClass, SubtitleSegment } from '../../src/services/subtitle-post-process/types';
import { runSubtitlePostProcess } from '../../src/services/subtitle-post-process';
import { withTempDataEnv } from '../helpers/temp-env';
import { openRouter } from '../../src/services/openrouter';

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  const index = Math.floor(rng() * values.length);
  return values[index] as T;
}

function randomWord(rng: () => number): string {
  const pool = ['grace', 'peace', 'faith', 'truth', 'light', 'hope', 'mercy', 'wisdom'];
  return pick(rng, pool);
}

function randomArabicWord(rng: () => number): string {
  const pool = ['نعمة', 'سلام', 'إيمان', 'حق', 'نور', 'رجاء', 'رحمة', 'حكمة'];
  return pick(rng, pool);
}

function randomCjkToken(rng: () => number): string {
  const pool = ['字幕品質', '日本語', '検証', '読みやすさ', '確認', '調整', '改善'];
  return pick(rng, pool);
}

function buildRandomSegments(
  rng: () => number,
  languageClass: LanguageClass,
  profile: (typeof SUBTITLE_PROFILES)[LanguageClass]
): SubtitleSegment[] {
  const count = 2 + Math.floor(rng() * 4);
  const segments: SubtitleSegment[] = [];
  let cursor = 0;

  for (let i = 0; i < count; i += 1) {
    const duration = 2.2 + rng() * 2.2;
    const gap = 0.4 + rng() * 0.4;
    const start = cursor;
    const end = start + duration;
    const maxCharsByDuration = Math.max(
      6,
      Math.floor(duration * profile.targetCPS * 0.7)
    );
    const maxCueChars = Math.max(6, profile.maxCPL * profile.maxLines);
    const charBudget = Math.max(6, Math.min(maxCharsByDuration, maxCueChars));

    let text = '';
    if (languageClass === 'LTR') {
      const words: string[] = [];
      while (words.join(' ').length < charBudget) {
        words.push(randomWord(rng));
      }
      text = words.join(' ').slice(0, charBudget).trim();
    } else if (languageClass === 'RTL') {
      const words: string[] = [];
      while (words.join(' ').length < charBudget) {
        words.push(randomArabicWord(rng));
      }
      text = words.join(' ').slice(0, charBudget).trim();
    } else {
      const tokens: string[] = [];
      while (tokens.join('').length < charBudget) {
        tokens.push(randomCjkToken(rng));
      }
      text = tokens.join('').slice(0, charBudget);
    }

    segments.push({
      id: `${languageClass}-${i + 1}`,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      text
    });

    cursor = end + gap;
  }

  return segments;
}

test('property: fallback formatter outputs validator-clean cues for generated feasible inputs', () => {
  const classes: LanguageClass[] = ['LTR', 'RTL', 'CJK'];

  for (const languageClass of classes) {
    const profile = SUBTITLE_PROFILES[languageClass];
    for (let seed = 1; seed <= 35; seed += 1) {
      const rng = createRng(seed * (languageClass === 'LTR' ? 11 : languageClass === 'RTL' ? 13 : 17));
      const segments = buildRandomSegments(rng, languageClass, profile);
      const cues = buildFallbackCues(segments, profile);
      const vtt = renderWebVtt(cues);
      const validation = validateWebVtt(vtt, profile);
      assert.equal(
        validation.errors.length,
        0,
        `expected no validation errors for ${languageClass} seed=${seed}`
      );
    }
  }
});

test('property: deterministic replay keeps output and hashes stable for seeded random inputs', async () => {
  await withTempDataEnv('subtitle-property-determinism', async () => {
    const originalTheology = openRouter.subtitleTheologyCheck;
    const originalLanguage = openRouter.subtitleLanguageQualityPass;
    openRouter.subtitleTheologyCheck = async () => ({ issues: [] });
    openRouter.subtitleLanguageQualityPass = async (input) => ({
      cues: input.cues.map((cue) => ({ index: cue.index, text: cue.text }))
    });

    try {
      for (let seed = 1; seed <= 20; seed += 1) {
        const rng = createRng(seed * 97);
        const languageClass: LanguageClass = pick(rng, ['LTR', 'RTL', 'CJK'] as const);
        const bcp47 = languageClass === 'LTR' ? 'en' : languageClass === 'RTL' ? 'ar' : 'ja';
        const profile = SUBTITLE_PROFILES[languageClass];
        const segments = buildRandomSegments(rng, languageClass, profile);
        const assetId = `determinism-${seed}`;

        const first = await runSubtitlePostProcess({
          assetId,
          bcp47,
          subtitleOrigin: 'ai-raw',
          segments
        });

        const second = await runSubtitlePostProcess({
          assetId,
          bcp47,
          subtitleOrigin: 'ai-raw',
          segments
        });

        assert.equal(second.cacheHit, true, `expected cache hit on replay for seed=${seed}`);
        assert.equal(first.vtt, second.vtt);
        assert.equal(first.idempotencyKey, second.idempotencyKey);
        assert.equal(first.whisperSegmentsSha256, second.whisperSegmentsSha256);
        assert.equal(first.postProcessInputSha256, second.postProcessInputSha256);
      }
    } finally {
      openRouter.subtitleTheologyCheck = originalTheology;
      openRouter.subtitleLanguageQualityPass = originalLanguage;
    }
  });
});
