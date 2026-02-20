import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedLanguage } from '../../src/config/subtitle-post-process';
import { withEnv } from '../helpers/temp-env';

test('isAllowedLanguage honors wildcard allowlist', async () => {
  await withEnv({ SUBTITLE_POST_PROCESS_ALLOWLIST: '*' }, async () => {
    assert.equal(isAllowedLanguage('en'), true);
    assert.equal(isAllowedLanguage('ar'), true);
    assert.equal(isAllowedLanguage('zh-Hant'), true);
  });
});

test('isAllowedLanguage supports base-tag fallback and strict exclusions', async () => {
  await withEnv({ SUBTITLE_POST_PROCESS_ALLOWLIST: 'es,zh-hans' }, async () => {
    assert.equal(isAllowedLanguage('es-MX'), true);
    assert.equal(isAllowedLanguage('zh-Hans-CN'), true);
    assert.equal(isAllowedLanguage('en'), false);
  });
});
