import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLanguage, parseBcp47 } from '../../src/services/subtitle-post-process/language-classifier';

test('parseBcp47 extracts language and script', () => {
  const parsed = parseBcp47('zh-Hant-TW');
  assert.equal(parsed.language, 'zh');
  assert.equal(parsed.script, 'hant');
});

test('classifyLanguage maps RTL, CJK, and LTR tags', () => {
  assert.equal(classifyLanguage('ar'), 'RTL');
  assert.equal(classifyLanguage('zh-Hans'), 'CJK');
  assert.equal(classifyLanguage('ja'), 'CJK');
  assert.equal(classifyLanguage('en-US'), 'LTR');
});
