import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKGROUND_POLL_DELAY_MS,
  FOREGROUND_POLL_DELAY_MS,
  getNextPollDelayMs,
  shouldApplyPollResult
} from '../src/features/jobs/live-jobs-polling';

test('getNextPollDelayMs uses foreground and background defaults', () => {
  assert.equal(getNextPollDelayMs(false), FOREGROUND_POLL_DELAY_MS);
  assert.equal(getNextPollDelayMs(true), BACKGROUND_POLL_DELAY_MS);
});

test('shouldApplyPollResult rejects cancelled and aborted responses', () => {
  assert.equal(
    shouldApplyPollResult({
      cancelled: true,
      activeRequestSeq: 3,
      responseSeq: 3,
      aborted: false
    }),
    false
  );
  assert.equal(
    shouldApplyPollResult({
      cancelled: false,
      activeRequestSeq: 3,
      responseSeq: 3,
      aborted: true
    }),
    false
  );
});

test('shouldApplyPollResult only accepts latest response sequence', () => {
  assert.equal(
    shouldApplyPollResult({
      cancelled: false,
      activeRequestSeq: 4,
      responseSeq: 3,
      aborted: false
    }),
    false
  );
  assert.equal(
    shouldApplyPollResult({
      cancelled: false,
      activeRequestSeq: 4,
      responseSeq: 4,
      aborted: false
    }),
    true
  );
});
