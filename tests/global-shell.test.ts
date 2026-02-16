import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldHideGlobalHeader } from '../src/app/global-shell';

test('shouldHideGlobalHeader only hides header for coverage route', () => {
  assert.equal(shouldHideGlobalHeader('/dashboard/coverage'), true);
  assert.equal(shouldHideGlobalHeader('/dashboard/jobs'), false);
  assert.equal(shouldHideGlobalHeader('/'), false);
  assert.equal(shouldHideGlobalHeader(null), false);
});
