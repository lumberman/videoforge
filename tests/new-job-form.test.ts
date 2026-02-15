import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLanguageInput } from '../src/app/dashboard/jobs/new-job-form';

test('parseLanguageInput trims values and removes duplicates', () => {
  const result = parseLanguageInput(' es,fr, es ,,de ');
  assert.deepEqual(result, ['es', 'fr', 'de']);
});
