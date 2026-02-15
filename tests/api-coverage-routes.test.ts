import assert from 'node:assert/strict';
import test from 'node:test';
import { importFresh, withEnv } from './helpers/temp-env';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

test('coverage API routes return 503 when gateway env is missing', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_GATEWAY_URL: undefined,
      NEXT_STAGE_GATEWAY_URL: undefined
    },
    async () => {
      const languagesRoute = await importFresh<
        typeof import('../src/app/api/coverage/languages/route')
      >('../src/app/api/coverage/languages/route');
      const collectionsRoute = await importFresh<
        typeof import('../src/app/api/coverage/collections/route')
      >('../src/app/api/coverage/collections/route');

      const languagesResponse = await languagesRoute.GET();
      assert.equal(languagesResponse.status, 503);
      const languagesPayload = (await languagesResponse.json()) as { error?: string };
      assert.match(languagesPayload.error ?? '', /gateway is not configured/i);

      const collectionsResponse = await collectionsRoute.GET(
        new Request('http://localhost/api/coverage/collections?languageIds=es')
      );
      assert.equal(collectionsResponse.status, 503);
      const collectionsPayload = (await collectionsResponse.json()) as { error?: string };
      assert.match(collectionsPayload.error ?? '', /gateway is not configured/i);
    }
  );
});

test('coverage languages route prefers NEXT_PUBLIC_GATEWAY_URL over NEXT_STAGE_GATEWAY_URL', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calledUrls.push(typeof input === 'string' ? input : input.toString());
    return jsonResponse({
      languages: [
        {
          id: '529',
          englishLabel: 'English',
          nativeLabel: 'English'
        }
      ]
    });
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        NEXT_PUBLIC_GATEWAY_URL: 'https://primary.gateway.test',
        NEXT_STAGE_GATEWAY_URL: 'https://fallback.gateway.test'
      },
      async () => {
        const languagesRoute = await importFresh<
          typeof import('../src/app/api/coverage/languages/route')
        >('../src/app/api/coverage/languages/route');

        const response = await languagesRoute.GET();
        assert.equal(response.status, 200);
        const payload = (await response.json()) as {
          languages: Array<{ id: string; englishLabel: string }>;
        };
        assert.equal(payload.languages[0]?.id, '529');
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(calledUrls.length >= 1);
  assert.match(calledUrls[0] ?? '', /^https:\/\/primary\.gateway\.test/);
});

test('coverage languages route falls back to NEXT_STAGE_GATEWAY_URL when primary is absent', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calledUrls.push(typeof input === 'string' ? input : input.toString());
    return jsonResponse({ languages: [] });
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        NEXT_PUBLIC_GATEWAY_URL: undefined,
        NEXT_STAGE_GATEWAY_URL: 'https://stage.gateway.test'
      },
      async () => {
        const languagesRoute = await importFresh<
          typeof import('../src/app/api/coverage/languages/route')
        >('../src/app/api/coverage/languages/route');

        const response = await languagesRoute.GET();
        assert.equal(response.status, 200);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(calledUrls.length >= 1);
  assert.match(calledUrls[0] ?? '', /^https:\/\/stage\.gateway\.test/);
});

test('coverage collections route marks items missing muxAssetId as non-selectable', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return jsonResponse({
      collections: [
        {
          id: 'collection-1',
          title: 'Collection',
          label: 'series',
          videos: [
            {
              id: 'video-1',
              title: 'Mapped Video',
              subtitleStatus: 'human',
              voiceoverStatus: 'none',
              metadataStatus: 'ai',
              muxAssetId: 'mux-asset-1'
            },
            {
              id: 'video-2',
              title: 'Unmapped Video',
              subtitleStatus: 'none',
              voiceoverStatus: 'none',
              metadataStatus: 'none'
            }
          ]
        }
      ]
    });
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        NEXT_PUBLIC_GATEWAY_URL: 'https://gateway.test'
      },
      async () => {
        const collectionsRoute = await importFresh<
          typeof import('../src/app/api/coverage/collections/route')
        >('../src/app/api/coverage/collections/route');

        const response = await collectionsRoute.GET(
          new Request('http://localhost/api/coverage/collections?languageIds=es')
        );

        assert.equal(response.status, 200);
        const payload = (await response.json()) as {
          collections: Array<{
            videos: Array<{
              id: string;
              selectable: boolean;
              unselectableReason: string | null;
            }>;
          }>;
        };

        const videos = payload.collections[0]?.videos ?? [];
        assert.equal(videos[0]?.id, 'video-1');
        assert.equal(videos[0]?.selectable, true);
        assert.equal(videos[1]?.id, 'video-2');
        assert.equal(videos[1]?.selectable, false);
        assert.match(videos[1]?.unselectableReason ?? '', /missing muxassetid/i);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('coverage collections route rejects oversized languageIds input', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_GATEWAY_URL: 'https://gateway.test'
    },
    async () => {
      const collectionsRoute = await importFresh<
        typeof import('../src/app/api/coverage/collections/route')
      >('../src/app/api/coverage/collections/route');

      const ids = Array.from({ length: 21 }, (_, idx) => `lang_${idx}`).join(',');
      const response = await collectionsRoute.GET(
        new Request(`http://localhost/api/coverage/collections?languageIds=${ids}`)
      );

      assert.equal(response.status, 400);
      const payload = (await response.json()) as { error?: string };
      assert.match(payload.error ?? '', /at most 20/i);
    }
  );
});

test('coverage collections route fails explicitly when fallback payload has no muxAssetId mappings', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    callCount += 1;
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/api/coverage/collections')) {
      return jsonResponse({ error: 'not found' }, 404);
    }

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
                title: [{ value: 'Video without mapping' }],
                subtitles: [],
                images: [],
                variant: { slug: 'watch/en' }
              }
            ]
          }
        ]
      }
    });
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        NEXT_PUBLIC_GATEWAY_URL: 'https://gateway.test'
      },
      async () => {
        const collectionsRoute = await importFresh<
          typeof import('../src/app/api/coverage/collections/route')
        >('../src/app/api/coverage/collections/route');

        const response = await collectionsRoute.GET(
          new Request('http://localhost/api/coverage/collections?languageIds=en')
        );

        assert.equal(response.status, 502);
        const payload = (await response.json()) as { error?: string };
        assert.match(payload.error ?? '', /did not return muxassetid mappings/i);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(callCount >= 2, true);
});
