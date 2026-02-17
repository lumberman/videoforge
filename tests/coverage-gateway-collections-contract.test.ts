import assert from 'node:assert/strict';
import test from 'node:test';

import { importFresh, withEnv } from './helpers/temp-env';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('fetchCoverageCollections GraphQL fallback query includes muxVideo.assetId mapping path', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calledUrls.push(url);

    if (url.includes('/api/coverage/collections')) {
      return jsonResponse({ error: 'not found' }, 404);
    }

    if (url === 'https://gateway.test') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { query?: string };
      assert.match(body.query ?? '', /variant\(languageId:\s*\$languageId\)\s*\{[\s\S]*muxVideo\s*\{[\s\S]*assetId/i);
      assert.doesNotMatch(body.query ?? '', /\bduration(seconds)?\b/i);

      return jsonResponse({
        data: {
          videos: [
            {
              id: 'collection-1',
              label: 'series',
              publishedAt: '2026-01-01T00:00:00.000Z',
              title: [{ value: 'Collection' }],
              children: [
                {
                  id: 'video-1',
                  title: [{ value: 'Mapped video' }],
                  subtitles: [],
                  images: [],
                  variant: {
                    slug: 'watch/en',
                    muxVideo: { assetId: 'mux-asset-contract-1' }
                  }
                }
              ]
            }
          ]
        }
      });
    }

    return jsonResponse({ error: 'unexpected request' }, 500);
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        CORE_API_ENDPOINT: 'https://gateway.test'
      },
      async () => {
        const module = await importFresh<typeof import('../src/services/coverage-gateway')>(
          '../src/services/coverage-gateway'
        );
        const collections = await module.fetchCoverageCollections('https://gateway.test', ['en']);

        const video = collections[0]?.videos[0];
        assert.equal(video?.selectable, true);
        if (video?.selectable) {
          assert.equal(video.muxAssetId, 'mux-asset-contract-1');
          assert.equal(video.durationSeconds, null);
        }
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calledUrls.some((url) => url.includes('/api/coverage/collections')), true);
  assert.equal(calledUrls.includes('https://gateway.test'), true);
});

test('fetchCoverageCollections keeps deterministic failure when GraphQL fallback has videos but no mappings', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/api/coverage/collections')) {
      return jsonResponse({ error: 'not found' }, 404);
    }

    if (url === 'https://gateway.test') {
      return jsonResponse({
        data: {
          videos: [
            {
              id: 'collection-1',
              label: 'series',
              publishedAt: '2026-01-01T00:00:00.000Z',
              title: [{ value: 'Collection' }],
              children: [
                {
                  id: 'video-1',
                  title: [{ value: 'Unmapped video' }],
                  subtitles: [],
                  images: [],
                  variant: { slug: 'watch/en' }
                }
              ]
            }
          ]
        }
      });
    }

    return jsonResponse({ error: 'unexpected request' }, 500);
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        CORE_API_ENDPOINT: 'https://gateway.test'
      },
      async () => {
        const module = await importFresh<typeof import('../src/services/coverage-gateway')>(
          '../src/services/coverage-gateway'
        );

        await assert.rejects(
          async () => module.fetchCoverageCollections('https://gateway.test', ['en']),
          /did not return muxassetid mappings/i
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchCoverageCollections reuses in-process cache for identical requests', async () => {
  const originalFetch = globalThis.fetch;
  let collectionsCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/coverage/collections')) {
      collectionsCalls += 1;
      return jsonResponse({
        collections: [
          {
            id: 'collection-1',
            title: 'Collection',
            label: 'collection',
            publishedAt: null,
            videos: []
          }
        ]
      });
    }

    return jsonResponse({ error: 'unexpected request' }, 500);
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        CORE_API_ENDPOINT: 'https://gateway.test'
      },
      async () => {
        const module = await importFresh<typeof import('../src/services/coverage-gateway')>(
          '../src/services/coverage-gateway'
        );

        await module.fetchCoverageCollections('https://gateway.test', ['es']);
        await module.fetchCoverageCollections('https://gateway.test', ['es']);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(collectionsCalls, 1);
});

test('fetchCoverageCollections forceRefresh bypasses in-process cache', async () => {
  const originalFetch = globalThis.fetch;
  let collectionsCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/coverage/collections')) {
      collectionsCalls += 1;
      return jsonResponse({
        collections: [
          {
            id: 'collection-1',
            title: 'Collection',
            label: 'collection',
            publishedAt: null,
            videos: []
          }
        ]
      });
    }

    return jsonResponse({ error: 'unexpected request' }, 500);
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        CORE_API_ENDPOINT: 'https://gateway.test'
      },
      async () => {
        const module = await importFresh<typeof import('../src/services/coverage-gateway')>(
          '../src/services/coverage-gateway'
        );

        await module.fetchCoverageCollections('https://gateway.test', ['es']);
        await module.fetchCoverageCollections('https://gateway.test', ['es'], { forceRefresh: true });
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(collectionsCalls, 2);
});

test('fetchCoverageCollections does not cache failures', async () => {
  const originalFetch = globalThis.fetch;
  let collectionsCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/coverage/collections')) {
      collectionsCalls += 1;
      if (collectionsCalls === 1) {
        return jsonResponse({ error: 'boom' }, 502);
      }
      return jsonResponse({
        collections: [
          {
            id: 'collection-1',
            title: 'Collection',
            label: 'collection',
            publishedAt: null,
            videos: []
          }
        ]
      });
    }

    return jsonResponse({ error: 'unexpected request' }, 500);
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        CORE_API_ENDPOINT: 'https://gateway.test'
      },
      async () => {
        const module = await importFresh<typeof import('../src/services/coverage-gateway')>(
          '../src/services/coverage-gateway'
        );

        await assert.rejects(
          async () => module.fetchCoverageCollections('https://gateway.test', ['es']),
          /boom/i
        );
        await module.fetchCoverageCollections('https://gateway.test', ['es']);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(collectionsCalls, 2);
});
