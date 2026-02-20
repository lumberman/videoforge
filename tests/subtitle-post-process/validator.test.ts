import assert from 'node:assert/strict';
import test from 'node:test';
import { SUBTITLE_PROFILES } from '../../src/config/subtitle-post-process';
import { validateWebVtt } from '../../src/services/subtitle-post-process/validator';
import { renderWebVtt } from '../../src/services/subtitle-post-process/vtt';

test('validateWebVtt accepts a compliant cue', () => {
  const profile = SUBTITLE_PROFILES.LTR;
  const vtt = renderWebVtt([
    {
      index: 0,
      start: 0,
      end: 2,
      text: 'Grace and peace.'
    }
  ]);

  const result = validateWebVtt(vtt, profile);
  assert.equal(result.errors.length, 0);
});

test('validateWebVtt reports max lines and cpl violations', () => {
  const profile = SUBTITLE_PROFILES.CJK;
  const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nline one\nline two\n\n';
  const result = validateWebVtt(vtt, profile);

  assert.equal(result.errors.some((error) => error.rule === 'MAX_LINES'), true);
  assert.equal(result.errors.length > 0, true);
});

test('validateWebVtt rejects malformed header and timestamps', () => {
  const profile = SUBTITLE_PROFILES.LTR;
  const result = validateWebVtt('INVALID\n\nabc --> def\nhi\n\n', profile);

  assert.equal(result.errors.some((error) => error.rule === 'WEBVTT_HEADER'), true);
  assert.equal(result.errors.some((error) => error.rule === 'WEBVTT_TIMESTAMP'), true);
});

test('validateWebVtt rejects overlap and min-gap violations', () => {
  const profile = SUBTITLE_PROFILES.LTR;
  const vtt = [
    'WEBVTT',
    '',
    '00:00:00.000 --> 00:00:02.000',
    'First cue.',
    '',
    '00:00:01.950 --> 00:00:03.000',
    'Second cue.',
    '',
    '00:00:03.010 --> 00:00:04.500',
    'Third cue.',
    ''
  ].join('\n');

  const result = validateWebVtt(vtt, profile);
  assert.equal(result.errors.some((error) => error.rule === 'OVERLAP'), true);
  assert.equal(result.errors.some((error) => error.rule === 'MIN_GAP'), true);
});

test('validateWebVtt rejects disallowed markup tags', () => {
  const profile = SUBTITLE_PROFILES.LTR;
  const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<b>Grace</b>\n\n';
  const result = validateWebVtt(vtt, profile);

  assert.equal(result.errors.some((error) => error.rule === 'DISALLOWED_MARKUP'), true);
});
