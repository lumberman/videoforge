import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runSubtitlePostProcess } from '../../src/services/subtitle-post-process';
import { openRouter } from '../../src/services/openrouter';
import { withTempDataEnv } from '../helpers/temp-env';
import { validateWebVtt } from '../../src/services/subtitle-post-process/validator';
import { SUBTITLE_PROFILES } from '../../src/config/subtitle-post-process';
import { classifyLanguage } from '../../src/services/subtitle-post-process/language-classifier';

interface FixtureInput {
  assetId: string;
  bcp47: string;
  subtitleOrigin: 'ai-raw' | 'ai-processed' | 'ai-human' | 'human';
  segments: Array<{ id: string; start: number; end: number; text: string }>;
}

const FIXTURE_NAMES = [
  'en-ltr-long',
  'ar-rtl-mixed',
  'ja-cjk-no-spaces',
  'ar-mixed-script',
  'non-speech-tokens'
] as const;

const FIXTURE_ROOT = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'subtitle-post-process'
);

async function readFixture(name: string): Promise<FixtureInput> {
  const raw = await readFile(path.join(FIXTURE_ROOT, `${name}.json`), 'utf8');
  return JSON.parse(raw) as FixtureInput;
}

async function readExpectedVtt(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_ROOT, `${name}.expected.vtt`), 'utf8');
}

test('golden subtitle fixtures produce exact deterministic WebVTT', async () => {
  await withTempDataEnv('subtitle-golden-fixtures', async () => {
    const originalTheology = openRouter.subtitleTheologyCheck;
    const originalLanguage = openRouter.subtitleLanguageQualityPass;

    openRouter.subtitleTheologyCheck = async () => ({ issues: [] });
    openRouter.subtitleLanguageQualityPass = async (input) => ({
      cues: input.cues.map((cue) => ({ index: cue.index, text: cue.text }))
    });

    try {
      for (const name of FIXTURE_NAMES) {
        const fixture = await readFixture(name);
        const expected = await readExpectedVtt(name);
        const output = await runSubtitlePostProcess(fixture);

        assert.equal(
          output.vtt,
          expected,
          `fixture mismatch for ${name}`
        );

        const languageClass = classifyLanguage(fixture.bcp47);
        const profile = SUBTITLE_PROFILES[languageClass];
        const validation = validateWebVtt(output.vtt, profile);
        assert.equal(
          validation.errors.length,
          0,
          `expected ${name} golden output to pass validator`
        );
      }
    } finally {
      openRouter.subtitleTheologyCheck = originalTheology;
      openRouter.subtitleLanguageQualityPass = originalLanguage;
    }
  });
});
