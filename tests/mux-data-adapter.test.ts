import assert from 'node:assert/strict';
import test from 'node:test';
import { withMockMuxAi } from './helpers/mux-ai-mock';

test('fetchTranscriptForAsset uses mux adapter and returns transcript payload', async () => {
  await withMockMuxAi(async () => {
    const adapter = await import('../src/services/mux-data-adapter');
    const payload = await adapter.fetchTranscriptForAsset('asset-123', 'en');

    assert.equal(payload.assetId, 'asset-123');
    assert.equal(payload.bcp47, 'en');
    assert.equal(typeof payload.transcript.text, 'string');
  });
});
