import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldHideGlobalHeader } from '../src/app/global-shell';

test('shouldHideGlobalHeader hides header for coverage and jobs routes', () => {
  assert.equal(shouldHideGlobalHeader('/dashboard/coverage'), true);
  assert.equal(shouldHideGlobalHeader('/dashboard/jobs'), true);
  assert.equal(shouldHideGlobalHeader('/dashboard/jobs/job_123'), true);
  assert.equal(shouldHideGlobalHeader('/jobs'), true);
  assert.equal(shouldHideGlobalHeader('/jobs/job_123'), true);
  assert.equal(shouldHideGlobalHeader('/'), false);
  assert.equal(shouldHideGlobalHeader(null), false);
});
