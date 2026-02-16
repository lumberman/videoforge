import assert from 'node:assert/strict';
import test from 'node:test';
import { runSubtitlePostProcess } from '../../src/services/subtitle-post-process';
import { openRouter } from '../../src/services/openrouter';
import { withTempDataEnv } from '../helpers/temp-env';

test('runSubtitlePostProcess skips mutation for human origin', async () => {
  await withTempDataEnv('subtitle-process-skip-human', async () => {
    const output = await runSubtitlePostProcess({
      assetId: 'asset-skip',
      bcp47: 'en',
      subtitleOrigin: 'human',
      segments: [{ id: '1', start: 0, end: 2, text: 'Human authored subtitle.' }]
    });

    assert.equal(output.skipped, true);
    assert.equal(output.subtitleOriginAfter, 'human');
    assert.equal(typeof output.idempotencyKey, 'string');
    assert.equal(output.cacheHit, false);
  });
});

test('runSubtitlePostProcess skips mutation for ai-human origin', async () => {
  await withTempDataEnv('subtitle-process-skip-ai-human', async () => {
    const output = await runSubtitlePostProcess({
      assetId: 'asset-ai-human',
      bcp47: 'en',
      subtitleOrigin: 'ai-human',
      segments: [{ id: '1', start: 0, end: 2, text: 'Human verified subtitle.' }]
    });

    assert.equal(output.skipped, true);
    assert.equal(output.subtitleOriginAfter, 'ai-human');
    assert.equal(typeof output.idempotencyKey, 'string');
    assert.equal(output.cacheHit, false);
  });
});

test('runSubtitlePostProcess processes ai-raw origin and returns vtt', async () => {
  await withTempDataEnv('subtitle-process-ai-raw', async () => {
    const output = await runSubtitlePostProcess({
      assetId: 'asset-ai',
      bcp47: 'en',
      subtitleOrigin: 'ai-raw',
      segments: [
        { id: '1', start: 0, end: 2.5, text: 'In the beginning.' },
        { id: '2', start: 2.8, end: 5.2, text: 'The earth was without form.' }
      ]
    });

    assert.equal(output.skipped, false);
    assert.match(output.vtt, /^WEBVTT/m);
    assert.equal(output.validationErrors.length, 0);
    assert.equal(output.subtitleOriginAfter, 'ai-processed');
    assert.equal(typeof output.idempotencyKey, 'string');
    assert.equal(output.cacheHit, false);
  });
});

test('runSubtitlePostProcess applies external OpenRouter pass outputs when available', async () => {
  await withTempDataEnv('subtitle-process-openrouter-pass', async () => {
    const originalTheology = openRouter.subtitleTheologyCheck;
    const originalLanguage = openRouter.subtitleLanguageQualityPass;

    openRouter.subtitleTheologyCheck = async () => ({
      issues: [
        {
          cueIndex: 0,
          severity: 'medium',
          message: 'Potential doctrinal ambiguity.',
          suggestion: 'Use covenant wording.'
        }
      ]
    });
    openRouter.subtitleLanguageQualityPass = async (input) => ({
      cues: input.cues.map((cue) => ({
        index: cue.index,
        text: cue.index === 0 ? 'In the beginning, God made.' : cue.text
      }))
    });

    try {
      const output = await runSubtitlePostProcess({
        assetId: 'asset-openrouter-pass',
        bcp47: 'en',
        subtitleOrigin: 'ai-raw',
        segments: [
          { id: '1', start: 0, end: 2.4, text: 'In beginning God made.' },
          { id: '2', start: 2.6, end: 5.0, text: 'The earth was without form.' }
        ]
      });

      assert.equal(output.skipped, false);
      assert.equal(output.theologyIssues.length, 1);
      assert.equal(output.theologyIssues[0]?.severity, 'medium');
      assert.match(output.vtt, /In the beginning, God made\./);
      assert.equal(typeof output.idempotencyKey, 'string');
    } finally {
      openRouter.subtitleTheologyCheck = originalTheology;
      openRouter.subtitleLanguageQualityPass = originalLanguage;
    }
  });
});

test('runSubtitlePostProcess reuses cached output for same idempotency key', async () => {
  await withTempDataEnv('subtitle-process-cache-hit', async () => {
    const first = await runSubtitlePostProcess({
      assetId: 'asset-cache',
      bcp47: 'en',
      subtitleOrigin: 'ai-raw',
      segments: [
        { id: '1', start: 0, end: 2.5, text: 'In the beginning.' },
        { id: '2', start: 2.8, end: 5.2, text: 'The earth was without form.' }
      ]
    });

    const second = await runSubtitlePostProcess({
      assetId: 'asset-cache',
      bcp47: 'en',
      subtitleOrigin: 'ai-raw',
      segments: [
        { id: '1', start: 0, end: 2.5, text: 'In the beginning.' },
        { id: '2', start: 2.8, end: 5.2, text: 'The earth was without form.' }
      ]
    });

    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.equal(first.idempotencyKey, second.idempotencyKey);
  });
});

test('runSubtitlePostProcess defaults unknown subtitle origin to safe skip behavior', async () => {
  await withTempDataEnv('subtitle-process-unknown-origin', async () => {
    const output = await runSubtitlePostProcess({
      assetId: 'asset-unknown-origin',
      bcp47: 'en',
      subtitleOrigin: undefined,
      segments: [{ id: '1', start: 0, end: 2.2, text: 'Unknown origin should not mutate.' }]
    });

    assert.equal(output.skipped, true);
    assert.equal(output.subtitleOriginBefore, 'human');
    assert.equal(output.subtitleOriginAfter, 'human');
  });
});

test('runSubtitlePostProcess retry can recover without fallback', async () => {
  await withTempDataEnv('subtitle-process-retry-recovers', async () => {
    const originalTheology = openRouter.subtitleTheologyCheck;
    const originalLanguage = openRouter.subtitleLanguageQualityPass;

    openRouter.subtitleTheologyCheck = async () => ({ issues: [] });
    openRouter.subtitleLanguageQualityPass = async (input) => ({
      cues: input.cues.map((cue) => ({
        index: cue.index,
        text: 'This subtitle line is just above the max cpl size'
      }))
    });

    try {
      const output = await runSubtitlePostProcess({
        assetId: 'asset-retry-recovers',
        bcp47: 'en',
        subtitleOrigin: 'ai-raw',
        segments: [{ id: '1', start: 0, end: 10, text: 'seed seed' }]
      });

      assert.equal(output.aiRetryCount, 1);
      assert.equal(output.usedFallback, false);
      assert.equal(output.validationErrors.length, 0);
    } finally {
      openRouter.subtitleTheologyCheck = originalTheology;
      openRouter.subtitleLanguageQualityPass = originalLanguage;
    }
  });
});

test('runSubtitlePostProcess uses deterministic fallback when retry remains invalid', async () => {
  await withTempDataEnv('subtitle-process-retry-then-fallback', async () => {
    const originalTheology = openRouter.subtitleTheologyCheck;
    const originalLanguage = openRouter.subtitleLanguageQualityPass;

    openRouter.subtitleTheologyCheck = async () => ({ issues: [] });
    openRouter.subtitleLanguageQualityPass = async (input) => ({
      cues: input.cues.map((cue) => ({
        index: cue.index,
        text: 'This is a very long subtitle line that should still exceed constraints even after a retry split and therefore require fallback handling.'
      }))
    });

    try {
      const output = await runSubtitlePostProcess({
        assetId: 'asset-retry-fallback',
        bcp47: 'en',
        subtitleOrigin: 'ai-raw',
        segments: [{ id: '1', start: 0, end: 6, text: 'seed text' }]
      });

      assert.equal(output.aiRetryCount, 1);
      assert.equal(output.usedFallback, true);
      assert.equal(output.validationErrors.length, 0);
      assert.match(output.vtt, /^WEBVTT/m);
    } finally {
      openRouter.subtitleTheologyCheck = originalTheology;
      openRouter.subtitleLanguageQualityPass = originalLanguage;
    }
  });
});

test('runSubtitlePostProcess hard-fails when fallback is also invalid', async () => {
  await withTempDataEnv('subtitle-process-fallback-invalid', async () => {
    const originalTheology = openRouter.subtitleTheologyCheck;
    const originalLanguage = openRouter.subtitleLanguageQualityPass;

    openRouter.subtitleTheologyCheck = async () => ({ issues: [] });
    openRouter.subtitleLanguageQualityPass = async (input) => ({
      cues: input.cues.map((cue) => ({
        index: cue.index,
        text: cue.text
      }))
    });

    try {
      await assert.rejects(
        () =>
          runSubtitlePostProcess({
            assetId: 'asset-fallback-invalid',
            bcp47: 'en',
            subtitleOrigin: 'ai-raw',
            segments: [{ id: '1', start: 0, end: 3, text: '<b>Grace</b> and peace' }]
          }),
        /validation failed after retry and fallback/i
      );
    } finally {
      openRouter.subtitleTheologyCheck = originalTheology;
      openRouter.subtitleLanguageQualityPass = originalLanguage;
    }
  });
});

test('runSubtitlePostProcess keeps non-speech tokens as standalone cues during reconstruction', async () => {
  await withTempDataEnv('subtitle-process-non-speech-cues', async () => {
    const output = await runSubtitlePostProcess({
      assetId: 'asset-non-speech-cues',
      bcp47: 'en',
      subtitleOrigin: 'ai-raw',
      segments: [
        { id: '1', start: 0, end: 1.0, text: 'Grace and peace.' },
        { id: '2', start: 1.1, end: 1.8, text: '[Music]' },
        { id: '3', start: 1.9, end: 3.1, text: 'Be with you all.' }
      ]
    });

    assert.equal(output.skipped, false);
    assert.equal(output.cues.some((cue) => cue.text.trim() === '[Music]'), true);
    assert.equal(
      output.cues.some((cue) => cue.text.includes('Grace and peace') && cue.text.includes('[Music]')),
      false
    );
  });
});

test('runSubtitlePostProcess ignores language-pass edits to non-speech token cues', async () => {
  await withTempDataEnv('subtitle-process-non-speech-edit-guard', async () => {
    const originalLanguage = openRouter.subtitleLanguageQualityPass;

    openRouter.subtitleLanguageQualityPass = async (input) => ({
      cues: input.cues.map((cue) => ({
        index: cue.index,
        text: cue.text.trim() === '[Music]' ? 'Intro music plays loudly' : cue.text
      }))
    });

    try {
      const output = await runSubtitlePostProcess({
        assetId: 'asset-non-speech-edit-guard',
        bcp47: 'en',
        subtitleOrigin: 'ai-raw',
        segments: [
          { id: '1', start: 0, end: 1.7, text: '[Music]' },
          { id: '2', start: 2.0, end: 4.0, text: 'Grace and peace.' }
        ]
      });

      assert.match(output.vtt, /\[Music\]/);
      assert.doesNotMatch(output.vtt, /Intro music plays loudly/);
    } finally {
      openRouter.subtitleLanguageQualityPass = originalLanguage;
    }
  });
});
